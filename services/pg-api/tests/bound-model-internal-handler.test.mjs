// Simulated HTTPS IncomingMessage contract, NOT a real TLS handshake.
// No listener opened and no real DB, provider or external network used.
import test from "node:test"
import assert from "node:assert/strict"
import {Readable} from "node:stream"
import {TLSSocket} from "node:tls"
import {createIsolatedBoundModelInternalHandler}
  from "../src/bound-model-internal-handler.ts"

const fingerprint=new Array(32).fill("CD").join(":")
const pin="CD".repeat(32)
const route="/__internal/v1/bound-model/dispatch"
const claim={run_id:"c135230a-8e5f-453a-918a-3a483a86b80c",
  job_id:"21845290-0b9c-4e9e-b82b-c9c7807724a6",
  lease_token:"81e2c16c-8e9b-4e32-a6c1-67a758e3a79e",
  lease_version:1,lease_owner:"test-worker"}
const input={goal:"Synthetic grounded summary",
  instruction:"Cite evidence",taskScope:"Offline only",
  deliverables:["Brief"],doneCriteria:["Grounded"],knowledgeEvidence:[]}
const payload={claim,input}
function tls(authorized=true,raw=Buffer.alloc(32,4),actual=fingerprint){
  const socket=Object.create(TLSSocket.prototype)
  Object.defineProperties(socket,{
    encrypted:{value:true},authorized:{value:authorized},
    getPeerCertificate:{value:()=>({raw,fingerprint256:actual})}
  })
  return socket
}
async function simulate(handler,{request=payload,body,
  contentType="application/json",socket=tls(),method="POST",url=route,
  headers={}}={}){
  const bytes=body??Buffer.from(JSON.stringify(request),"utf8")
  const req=Readable.from([bytes])
  Object.assign(req,{
    socket,method,url,
    headers:{"content-type":contentType,"content-length":String(bytes.length),...headers}
  })
  const response={status:null,headers:null,text:null,
    writeHead(status,out){this.status=status;this.headers=out},
    end(data){this.text=JSON.parse(String(data))}
  }
  await handler(req,response)
  return response
}
test("internal model endpoint does not exist without isolated operator approval",()=>{
  assert.throws(()=>createIsolatedBoundModelInternalHandler({
    approvedForIsolatedUat:false,reviewedClientFingerprint256:pin,
    dispatch:async()=>({status:"succeeded",text:"never"})
  }),/bound_model_internal_handler_disabled/)
})
test("authenticated and pinned synthetic client can submit exact bounded ownerless dispatch",async()=>{
  let calls=0
  const handler=createIsolatedBoundModelInternalHandler({
    approvedForIsolatedUat:true,reviewedClientFingerprint256:pin,
    async dispatch(observedClaim,observedInput){
      calls++
      assert.deepEqual(observedClaim,claim)
      assert.deepEqual(observedInput,input)
      return {status:"succeeded",text:"Synthetic model response"}
    }
  })
  const result=await simulate(handler)
  assert.equal(result.status,200)
  assert.deepEqual(result.text,{status:"succeeded",text:"Synthetic model response"})
  assert.equal(result.headers["Cache-Control"],"no-store")
  assert.equal(calls,1)
})
test("missing or forged transport authorization, wrong cert, forged headers and paths never dispatch",async()=>{
  let calls=0
  const handler=createIsolatedBoundModelInternalHandler({
    approvedForIsolatedUat:true,reviewedClientFingerprint256:pin,
    async dispatch(){calls++;return {status:"succeeded",text:"should not run"}}
  })
  for(const variant of [
    {socket:tls(false)},
    {socket:tls(true,Buffer.alloc(32,4),"AB".repeat(32))},
    {socket:{encrypted:true,authorized:true,getPeerCertificate:()=>({
      raw:Buffer.alloc(32,4),fingerprint256:fingerprint})}},
    {method:"GET"},
    {url:route+"?owner=alice"},
    {headers:{"x-rh-user-id":"alice"}},
    {headers:{"x-forwarded-client-cert":pin}},
    {headers:{"authorization":"Bearer forged"}},
    {headers:{"cookie":"fake=1"}},
  ]){
    const result=await simulate(handler,variant)
    assert.ok([403,404].includes(result.status))
  }
  assert.equal(calls,0)
})
test("forged employee, extra fields, unbounded payload and unsafe media are refused before dispatch",async()=>{
  let calls=0
  const handler=createIsolatedBoundModelInternalHandler({
    approvedForIsolatedUat:true,reviewedClientFingerprint256:pin,
    async dispatch(){calls++;return {status:"succeeded",text:"should not run"}}
  })
  const variants=[
    {request:{...payload,owner_user_id:"alice"}},
    {request:{...payload,claim:{...claim,owner_user_id:"alice"}}},
    {request:{...payload,input:{...input,api_key:"secret"}}},
    {request:{...payload,input:{...input,knowledgeEvidence:new Array(7).fill({
      citation:"fake",snippet:"fake"})}}},
    {request:{...payload,input:{...input,goal:"x".repeat(25000)}}},
    {contentType:"text/plain"},
    {headers:{"content-encoding":"gzip"}},
    {headers:{"content-length":"50000"}},
  ]
  for(const v of variants){
    const result=await simulate(handler,v)
    assert.ok([400,413,415].includes(result.status),JSON.stringify(result.text))
  }
  assert.equal(calls,0)
})
test("broker/network errors remain generic and are not retried or exposed",async()=>{
  let calls=0
  const handler=createIsolatedBoundModelInternalHandler({
    approvedForIsolatedUat:true,reviewedClientFingerprint256:pin,
    async dispatch(){
      calls++
      throw Error("synthetic provider error with private credential: never disclose")
    }
  })
  const result=await simulate(handler)
  assert.equal(result.status,503)
  assert.deepEqual(result.text,{error:"bound_dispatch_outcome_unavailable"})
  assert.equal(calls,1)
})
