// Actual private-client/handler code with synthetic request events only.
// No TLS handshake, certificate authority, server listener or permission proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {Readable} from 'node:stream'
import {createAgentPlanWorkflowMutualTlsClient as client,createAgentPlanWorkflowInternalHandler as handler} from '../src/agent-plan-workflow-client.ts'
import {agentPlanWorkflowExecutionApproval as approval,agentPlanWorkflowPrivateRoute as route} from '../src/agent-plan-workflow-runtime-policy.ts'
import {id,hex,purpose} from '../../../tests/helpers/agent-plan-workflow-browser-values.mjs'
const proof={protocol:'agent_plan_workflow_dispatch_v1',purpose,request_id:id(100),lease_token:id(101),lease_version:1,worker_id:id(102)},reply={protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:id(100),state:'succeeded',result_sha256:hex(1),completion_sha256:hex(2)},pin='ab'.repeat(32)
const config=()=>({executionEnabled:true,executionApproval:approval,reviewedOrigin:'https://127.0.0.1:17445',reviewedServerFingerprint256:pin,ca:Buffer.from('synthetic_ca'),cert:Buffer.from('synthetic_cert'),key:Buffer.from('synthetic_key')})
function wire(value=reply,settings={}){
  const calls=[],requests=[]
  const request=(options,callback)=>{
    const req=new EventEmitter();req.destroy=()=>{req.destroyed=true};requests.push(req)
    req.end=body=>{calls.push({options,body:Buffer.from(body)});if(settings.hang)return;queueMicrotask(()=>{
      if(settings.error){req.emit('error',Error('synthetic_connection_lost'));return}
      const res=new EventEmitter();res.statusCode=settings.status??200;res.headers={'content-type':'application/json',...settings.headers};res.destroy=()=>{res.destroyed=true};callback(res)
      res.emit('data',Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value)));res.emit('end')
    })};return req
  };return {request,calls,requests}
}
test('private client needs its own explicit activation, reviewed loopback endpoint and supplied credentials',()=>{
  const w=wire();assert.throws(()=>client({...config(),executionEnabled:false},w.request))
  for(const patch of [{reviewedOrigin:'http://127.0.0.1:17445'},{reviewedOrigin:'https://localhost:17445'},{reviewedOrigin:'https://127.0.0.1'},{reviewedOrigin:'https://127.0.0.1:5432'},{reviewedOrigin:'https://127.0.0.1:17445/path'},{reviewedServerFingerprint256:'bad'},{key:Buffer.alloc(0)},{executionApproval:'other-purpose'}])assert.throws(()=>client({...config(),...patch},w.request))
  assert.equal(w.calls.length,0)
})
test('one actual client invocation uses fixed F05 route, exact proof, strict TLS and no identity headers',async()=>{
  const w=wire(),c=client(config(),w.request);assert.deepEqual(await c(proof),reply);assert.equal(w.calls.length,1)
  const {options,body}=w.calls[0];assert.deepEqual(JSON.parse(body),proof);assert.equal(options.path,route);assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,'localhost');assert.equal(options.agent,false);assert.equal(options.minVersion,'TLSv1.2');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers['X-Rh-User-Id'],undefined);c.close()
})
test('actual certificate callback combines ordinary hostname validation with exact reviewed fingerprint',async()=>{
  const w=wire(),c=client(config(),w.request);await c(proof);const check=w.calls[0].options.checkServerIdentity
  assert.equal(check('localhost',{subjectaltname:'DNS:localhost',fingerprint256:pin}),undefined)
  assert.ok(check('localhost',{subjectaltname:'DNS:other.invalid',fingerprint256:pin}) instanceof Error)
  assert.ok(check('localhost',{subjectaltname:'DNS:localhost',fingerprint256:'cd'.repeat(32)}) instanceof Error);c.close()
})
test('wrong-purpose proof and additional identity fields are rejected before private transport',async()=>{
  const w=wire(),c=client(config(),w.request)
  for(const bad of [{...proof,purpose:'agent_design'},{...proof,identity:{issuer:'fake'}},{...proof,owner_user_id:id(1)},{...proof,lease_version:0}])await assert.rejects(c(bad))
  assert.equal(w.calls.length,0);c.close()
})
test('malformed, oversized, wrong-request, duplicate or non-JSON replies remain unknown after one send',async()=>{
  for(const [body,settings]of [[{...reply,request_id:id(999)},{}],['{"protocol":"x","protocol":"y"}',{}],[Buffer.alloc(2049,32),{}],[Buffer.from([255]),{}],[reply,{status:503}],[reply,{headers:{'content-type':'text/plain'}}],[reply,{headers:{'content-encoding':'gzip'}}],[reply,{error:true}]]){
    const w=wire(body,settings),c=client(config(),w.request);await assert.rejects(c(proof),/transport_unknown/);assert.equal(w.calls.length,1);c.close()
  }
})
test('close rejects actual pending request, zeroes only copied credentials and never starts another send',async()=>{
  const original=config(),before=Buffer.from(original.key),w=wire(reply,{hang:true}),c=client(original,w.request),flight=c(proof)
  assert.equal(w.calls.length,1);c.close();await assert.rejects(flight,/transport_unknown/);assert.equal(w.requests[0].destroyed,true);assert.deepEqual(original.key,before)
  assert.ok(w.calls[0].options.key.every(v=>v===0));assert.ok(w.calls[0].options.cert.every(v=>v===0));await assert.rejects(c(proof),/closed/);assert.equal(w.calls.length,1)
})
test('late native transport completion after close cannot turn an unknown request into a second effect',async()=>{
  let callback;const calls=[]
  const c=client(config(),(opts,ready)=>{callback=ready;const req=new EventEmitter();req.destroy=()=>{};req.end=body=>calls.push(Buffer.from(body));return req}),flight=c(proof)
  c.close();await assert.rejects(flight,/unknown/);const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'application/json'};res.destroy=()=>{res.destroyed=true};callback(res);assert.equal(res.destroyed,true);assert.equal(calls.length,1)
})
test('internal handler refuses an unverified socket before parsing identity or invoking dispatch',async()=>{
  let dispatched=0;const run=handler({executionEnabled:true,executionApproval:approval,reviewedClientFingerprint256:pin,dispatch:async()=>{dispatched++;return reply}})
  const req=Readable.from([Buffer.from(JSON.stringify(proof))]);Object.assign(req,{url:route,method:'POST',socket:{authorized:true},headers:{'content-type':'application/json','content-length':'1'}})
  const res={writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}};await run(req,res);assert.equal(res.status,403);assert.equal(dispatched,0)
})
