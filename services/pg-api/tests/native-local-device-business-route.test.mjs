// Pure actual-router comparisons only. No listener, SQL, runtime, provider,
// positive authentication callback or fabricated catalog success is supplied.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeLocalDeviceHttp} from '../src/native-local-device-http.ts'
import {composeNativeLocalDeviceBusiness} from './helpers/native-local-device-business-route.mjs'
const forbidden=new Proxy({}, {get(){throw Error('unexpected_local_authority_on_unowned_or_refused_route')}})
test('actual local router declines generic Native routes; composition awaits each original generic callback exactly once',async()=>{
 const local=createNativeLocalDeviceHttp(forbidden)
 for(const [method,url]of [['GET','/api/v2/agent-specs/11111111-1111-4111-8111-111111111111'],['PATCH','/api/v2/agent-specs/11111111-1111-4111-8111-111111111111'],['GET','/api/v2/agent-autonomous-runs'],['POST','/api/v2/agent-specs/11111111-1111-4111-8111-111111111111/autonomous-runs']]){
  const req={method,url,headers:{}},res={},seen=[];let finish;const gate=new Promise(resolve=>{finish=resolve})
  const call=composeNativeLocalDeviceBusiness(local,async(r,s)=>{assert.equal(r,req);assert.equal(s,res);seen.push('generic');await gate;seen.push('finished')})(req,res)
  await Promise.resolve();await Promise.resolve();assert.deepEqual(seen,['generic']);finish();await call;assert.deepEqual(seen,['generic','finished'])
 }
})
test('actual local forged-identity rejection owns and ends its response without a generic second dispatch',async()=>{
 const local=createNativeLocalDeviceHttp(forbidden),writes=[],req={method:'POST',url:'/api/v2/local-devices',headers:{'x-rh-user-id':'forged'}}
 const res={writeHead(status){writes.push(status)},end(body){writes.push(JSON.parse(body))}}
 await composeNativeLocalDeviceBusiness(local,async()=>{throw Error('owned_local_response_must_not_reach_generic')})(req,res)
 assert.deepEqual(writes,[403,{error:'native_employee_identity_required'}])
})
test('unknown or throwing local outcome fails closed and does not become generic fallback',async()=>{
 for(const value of [undefined,null,0,1,'false'])await assert.rejects(composeNativeLocalDeviceBusiness(async()=>value,async()=>{throw Error('unexpected_fallback')})({},{}),/native_public_route_outcome_unknown/)
 const error=Error('original_local_failure');await assert.rejects(composeNativeLocalDeviceBusiness(async()=>{throw error},async()=>{throw Error('unexpected_fallback')})({},{}),e=>e===error)
})
