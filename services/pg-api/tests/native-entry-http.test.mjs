// Pure routing comparisons. No SQL, listener, provider or positive auth stub.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeEntryHttpHandler} from '../src/native-entry-http.ts'
import {createAgentCallerPublicHttp} from '../src/agent-caller-http.ts'

test('the real public Caller router leaves every Native employee and business route to the original handler',async()=>{
 const repository=new Proxy({}, {get(){throw Error('unexpected_public_repository_for_native_route')}})
 const publicRoute=createAgentCallerPublicHttp({repository})
 for(const url of ['/healthz','/api/native-auth/login','/api/native-auth/capabilities','/api/v2/agent-specs','/api/v2/own-overview','/api/v2/own-todos','/api/v2/integrate/keys','/api/v2/tool-hub']){
  const req={url,method:'GET',headers:{},rawHeaders:[]},res={},calls=[]
  const native=async(r,s)=>{assert.equal(r,req);assert.equal(s,res);calls.push(url)}
  await createNativeEntryHttpHandler(native,publicRoute)(req,res)
  assert.deepEqual(calls,[url])
 }
})
test('an owned public Caller denial is never routed into employee auth or business fallback',async()=>{
 const publicRoute=createAgentCallerPublicHttp({repository:new Proxy({}, {get(){throw Error('unexpected_repository')}})})
 const req={url:'/api/v2/public/agent/run',method:'POST',headers:{'x-rh-user-id':'forged'},rawHeaders:[]},writes=[]
 const res={writeHead(status,headers){writes.push({status,headers})},end(body){writes.push(JSON.parse(body))}}
 await createNativeEntryHttpHandler(async()=>{throw Error('public_denial_must_not_fall_back')},publicRoute)(req,res)
 assert.equal(writes[0].status,401);assert.equal(writes[1].error,'agent_caller_authorization_required')
})
test('public routing off preserves the same original Native callback and awaited completion',async()=>{
 const req={},res={},seen=[];let finish;const pending=new Promise(resolve=>{finish=resolve})
 const call=createNativeEntryHttpHandler(async(r,s)=>{assert.equal(r,req);assert.equal(s,res);seen.push('native');await pending;seen.push('finished')},null)(req,res)
 await Promise.resolve();assert.deepEqual(seen,['native']);finish();await call;assert.deepEqual(seen,['native','finished'])
})
test('a failed or non-boolean public outcome never authorizes fallback or a second attempt',async()=>{
 for(const outcome of [undefined,null,0,1,'false']){
  let calls=0;await assert.rejects(createNativeEntryHttpHandler(async()=>{throw Error('unexpected_native')},async()=>{calls++;return outcome})({},{}),/native_public_route_outcome_unknown/);assert.equal(calls,1)
 }
 const failure=Error('synthetic_public_failure');let calls=0
 await assert.rejects(createNativeEntryHttpHandler(async()=>{throw Error('unexpected_native')},async()=>{calls++;throw failure})({},{}),e=>e===failure);assert.equal(calls,1)
})
