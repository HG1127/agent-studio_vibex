import test from "node:test"
import assert from "node:assert/strict"
import {EventEmitter} from "node:events"
import {createBoundModelMutualTlsClient} from "../src/bound-model-client.ts"
import {safeBoundModelRequest,safeBoundModelResult} from "../src/bound-model-contract.ts"

const pin="CD".repeat(32)
const config=()=>({approvedForIsolatedUat:true,origin:"https://127.0.0.1:7453",
  reviewedServerFingerprint256:pin,ca:Buffer.from("synthetic-ca"),
  cert:Buffer.from("synthetic-client-cert"),key:Buffer.from("synthetic-client-key")})
const claim={run_id:"c135230a-8e5f-453a-918a-3a483a86b80c",
  job_id:"21845290-0b9c-4e9e-b82b-c9c7807724a6",
  lease_token:"81e2c16c-8e9b-4e32-a6c1-67a758e3a79e",
  lease_version:1,lease_owner:"synthetic-worker"}
const input={goal:"Summarize evidence",instruction:"Do not call a provider",
  taskScope:"Synthetic only",deliverables:["Brief"],doneCriteria:["Cite evidence"]}
const result={status:"succeeded",text:"Synthetic response"}
function fake({status=200,contentType="application/json",encoding,
  body=Buffer.from(JSON.stringify(result)),transportError=false,aborted=false,events=[]}={}){
  return (options,callback)=>{
    events.push({options})
    const req=new EventEmitter()
    req.end=bytes=>{
      events.push({body:Buffer.from(bytes)})
      if(transportError){queueMicrotask(()=>req.emit("error",Error("private detail")));return}
      const res=new EventEmitter()
      res.headers={"content-type":contentType,...(encoding?{"content-encoding":encoding}:{})}
      res.statusCode=status;res.destroy=()=>{}
      callback(res)
      queueMicrotask(()=>{
        if(aborted){res.emit("aborted");return}
        res.emit("data",body);res.emit("end")
      })
    }
    return req
  }
}
test("private client needs explicit approval, exact loopback HTTPS and independent trust material",()=>{
  for(const changes of [
    {approvedForIsolatedUat:false},{origin:"http://127.0.0.1:7453"},
    {origin:"https://example.com:7453"},{origin:"https://localhost:7453"},
    {origin:"https://127.0.0.1:7453/path"},{origin:"https://127.0.0.1:7453?owner=x"},
    {origin:"https://user:password@127.0.0.1:7453"},{origin:"https://127.0.0.1:443"},
    {reviewedServerFingerprint256:"invalid"},{ca:Buffer.alloc(0)},{key:"secret"},
  ])assert.throws(()=>createBoundModelMutualTlsClient({...config(),...changes}),
    /bound_dispatch_client_disabled/)
})
test("one bounded request uses copied mTLS credentials, fixed route and no employee identity headers",async()=>{
  const events=[],settings=config()
  const send=createBoundModelMutualTlsClient(settings,fake({events}))
  settings.ca.fill(0);settings.origin="https://evil.invalid:7453"
  assert.deepEqual(await send(claim,input),result)
  const options=events[0].options
  assert.equal(options.hostname,"127.0.0.1")
  assert.equal(options.servername,"localhost")
  assert.equal(options.port,7453)
  assert.equal(options.path,"/__internal/v1/bound-model/dispatch")
  assert.equal(options.method,"POST")
  assert.equal(options.rejectUnauthorized,true)
  assert.equal(options.agent,false)
  assert.equal(options.ca.toString(),"synthetic-ca")
  assert.deepEqual(JSON.parse(events[1].body.toString()),{claim,input})
  assert.equal(Number(options.headers["Content-Length"]),events[1].body.length)
  for(const header of ["authorization","cookie","x-rh-user-id","x-forwarded-client-cert"])
    assert.equal(options.headers[header],undefined)
})
test("normal hostname validation and independently pinned server certificate are both mandatory",async()=>{
  const events=[]
  await createBoundModelMutualTlsClient(config(),fake({events}))(claim,input)
  const check=events[0].options.checkServerIdentity
  const cert={subjectaltname:"DNS:localhost",fingerprint256:pin}
  assert.equal(check("localhost",cert),undefined)
  assert.ok(check("foreign.invalid",cert) instanceof Error)
  assert.match(check("localhost",{...cert,fingerprint256:"EF".repeat(32)}).message,
    /bound_dispatch_server_certificate_refused/)
  assert.ok(check("localhost",{...cert,fingerprint256:"bad"}) instanceof Error)
})
test("forged identity, unknown fields and oversized bodies fail before a socket can open",async()=>{
  const events=[],send=createBoundModelMutualTlsClient(config(),fake({events}))
  await assert.rejects(send({...claim,owner_user_id:"spoof"},input))
  await assert.rejects(send(claim,{...input,api_key:"forged"}))
  await assert.rejects(send(claim,{...input,goal:"g".repeat(2000),
    instruction:"i".repeat(1200),taskScope:"s".repeat(2000),
    deliverables:Array(20).fill("d".repeat(300)),doneCriteria:Array(20).fill("c".repeat(300))}),
    /bound_dispatch_request_too_large/)
  assert.equal(events.length,0)
})
test("a full2000-character task crosses private RPC unchanged while the16KiB total request cap remains enforced",async()=>{
  const instruction="迁".repeat(1998)+"🚀",events=[],send=createBoundModelMutualTlsClient(config(),fake({events}))
  await send(claim,{...input,instruction})
  const payload=events.find(event=>event.body).body
  assert.ok(payload.byteLength<=16384)
  assert.equal(safeBoundModelRequest(JSON.parse(payload.toString("utf8"))).input.instruction,instruction)
  const before=events.length
  await assert.rejects(send(claim,{...input,instruction:instruction+"x"}))
  assert.equal(events.length,before)
})

test("private RPC preserves six full Unicode citations and enforces its original total byte limit",async()=>{
  const knowledgeEvidence=Array.from({length:6},(_,index)=>({citation:"😀".repeat(176)+".txt#chunk-"+index,snippet:"😀".repeat(300)}))
  const events=[],send=createBoundModelMutualTlsClient(config(),fake({events}))
  const request={...input,knowledgeEvidence}
  assert.deepEqual(await send(claim,request),result)
  const bytes=events.find(event=>event.body).body
  assert.ok(bytes.length<=16384)
  assert.deepEqual(safeBoundModelRequest(JSON.parse(bytes.toString("utf8"))).input,request)
  for(const evidence of [
    [{citation:"x".repeat(201),snippet:"safe"}],
    [{citation:"safe",snippet:"😀".repeat(321)}],
    [{citation:"safe",snippet:"bad\u007fcontent"}],
    [{citation:"safe\nrole",snippet:"safe"}],
    [{citation:"\ud800",snippet:"safe"}],
    [{citation:"safe",snippet:"safe",secret:"refuse"}],
  ])await assert.rejects(send(claim,{...input,knowledgeEvidence:evidence}),/invalid_internal_bound_dispatch_request/)
  // Individually valid fields can still exceed the unchanged whole-body cap.
  await assert.rejects(send(claim,{...request,goal:"😀".repeat(1000),taskScope:"😀".repeat(1000)}),/bound_dispatch_request_too_large/)
  assert.equal(events.filter(event=>event.options).length,1)
})
test("ambiguous errors, redirects, truncation and unsafe responses fail once without replay or leakage",async()=>{
  for(const variation of [
    {status:302},{status:401},{status:503},{contentType:"text/html"},
    {encoding:"gzip"},{transportError:true},{aborted:true},
    {body:Buffer.from("private non-json provider detail")},
    {body:Buffer.from([0xc3,0x28])},{body:Buffer.alloc(65537,65)},
    {body:Buffer.from(JSON.stringify({...result,api_key:"private"}))},
    {body:Buffer.from(JSON.stringify({...result,text:"x".repeat(12001)}))},
  ]){
    const events=[]
    const send=createBoundModelMutualTlsClient(config(),fake({...variation,events}))
    await assert.rejects(send(claim,input),{message:"bound_dispatch_transport_failed"})
    assert.equal(events.filter(x=>x.options).length,1)
    assert.equal(events.filter(x=>x.body).length,1)
  }
})
test("successful internal responses contain only a bounded status and text",()=>{
  assert.deepEqual(safeBoundModelResult(result),result)
  for(const value of [null,[],{status:"unknown",text:"x"},
    {...result,text:""},{...result,text:"unsafe\u0000text"},
    {...result,owner_user_id:"unexpected"}])assert.throws(()=>safeBoundModelResult(value))
})
