// Pure state/race checks with deferred local API values. No HTTP, DB or browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import {workerHeartbeatKinds} from '../services/pg-api/src/worker-heartbeat-contract.ts'
import {createPgNativeCompanyWorkerHeartbeatsSession} from '../src/lib/pgNativeCompanyWorkerHeartbeatsSession.ts'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),at='2026-10-29T01:02:03.000Z'
const data=()=>({protocol:'native_company_worker_heartbeats_v1',scope:'company_worker_metadata_only',as_of:at,stale_after_ms:90000,
  workers:workerHeartbeatKinds.map((kind,index)=>({kind,state:index===0?'ready':'unknown',last_seen_at:index===0?at:null,reason:index===0?'fresh_ready_report':'not_observed'}))})
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
const make=(api,extra={})=>createPgNativeCompanyWorkerHeartbeatsSession(api,{employeeId:id(1),...extra})
const open=model=>{model.setAvailability({currentAdmin:true,company_worker_heartbeats_available:true});model.setActive(true)}
const close=model=>model.dispose()

test('configuration and visibility never fabricate ready or send before all hints permit reading',async()=>{
  let calls=0;const model=make({getCompanyWorkerHeartbeats:async()=>{calls++;return data()}})
  await model.refresh();model.setActive(true);await model.refresh();assert.equal(calls,0)
  assert.equal(model.snapshot().data,null);assert.equal(model.snapshot().status,'unavailable')
  model.setAvailability({currentAdmin:true,company_worker_heartbeats_available:true});assert.equal(model.snapshot().status,'unknown');assert.equal(model.snapshot().data,null)
  await model.refresh();assert.equal(calls,1);assert.equal(model.snapshot().status,'snapshot');close(model)
})
test('validated reports preserve truthful unknown/stale/draining and returned views cannot mutate the session',async()=>{
  const value=data();value.workers[0]={kind:'prepare',state:'stale',last_seen_at:'2026-10-29T01:00:33.000Z',reason:'heartbeat_expired'}
  value.workers[1]={kind:'model',state:'draining',last_seen_at:at,reason:'fresh_draining_report'}
  const model=make({getCompanyWorkerHeartbeats:async()=>value});open(model);await model.refresh()
  assert.equal(model.snapshot().data.workers[0].state,'stale');assert.equal(model.snapshot().data.workers[1].state,'draining')
  assert.equal(model.snapshot().data.workers[2].state,'unknown');assert.equal(Object.isFrozen(model.snapshot().data.workers),true)
  value.workers[1].state='ready';assert.equal(model.snapshot().data.workers[1].state,'draining');close(model)
})
test('single in-flight refresh is bounded and refresh clears the previous snapshot immediately',async()=>{
  const wait=deferred();let calls=0
  const model=make({getCompanyWorkerHeartbeats:async()=>++calls===1?data():wait.promise});open(model);await model.refresh()
  const pending=model.refresh();await model.refresh();assert.equal(calls,2);assert.equal(model.snapshot().status,'loading');assert.equal(model.snapshot().data,null)
  wait.resolve(data());await pending;assert.equal(model.snapshot().status,'snapshot');close(model)
})
test('hide/show and capability revocation abort and discard late values even when adapters ignore abort',async()=>{
  for(const change of [m=>m.setActive(false),m=>m.setAvailability({currentAdmin:false,company_worker_heartbeats_available:true}),m=>m.setAvailability({currentAdmin:true,company_worker_heartbeats_available:false})]){
    const wait=deferred();let signal;const model=make({getCompanyWorkerHeartbeats:options=>{signal=options.signal;return wait.promise}});open(model)
    const pending=model.refresh();change(model);assert.equal(signal.aborted,true);assert.equal(model.snapshot().data,null)
    wait.resolve(data());await pending;assert.equal(model.snapshot().data,null);close(model)
  }
})
test('hidden old response cannot replace a newer snapshot from the same identity',async()=>{
  const old=deferred();let calls=0;const fresh=data();fresh.workers[0]={kind:'prepare',state:'unknown',last_seen_at:null,reason:'component_disabled'}
  const model=make({getCompanyWorkerHeartbeats:()=>++calls===1?old.promise:Promise.resolve(fresh)});open(model)
  const pending=model.refresh();model.setActive(false);model.setActive(true);await model.refresh();old.resolve(data());await pending
  assert.equal(model.snapshot().data.workers[0].reason,'component_disabled');close(model)
})
test('401 clears before notifying once; late same-scope401 closes a newer view while disposed old identities cannot',async()=>{
  const old=deferred();let calls=0,expired=0;const model=make({getCompanyWorkerHeartbeats:()=>++calls===1?old.promise:Promise.resolve(data())},{onExpired(){expired++;assert.equal(model.snapshot().data,null)}});open(model)
  const pending=model.refresh();model.setActive(false);model.setActive(true);await model.refresh();old.reject({status:401,message:'PRIVATE'});await pending
  assert.equal(expired,1);assert.equal(model.snapshot().data,null);assert.equal(model.matchesScope({},id(1)),false)
  const abandoned=deferred();let oldExpired=0;const disposed=make({getCompanyWorkerHeartbeats:()=>abandoned.promise},{onExpired(){oldExpired++}});open(disposed)
  const stopped=disposed.refresh();disposed.dispose();abandoned.reject({status:401});await stopped;assert.equal(oldExpired,0)
})
test('403 is sticky across identical stale hints and does not expire personal login',async()=>{
  let calls=0,expired=0;const api={getCompanyWorkerHeartbeats:async()=>{calls++;throw{status:403,message:'PRIVATE'}}},model=make(api,{onExpired(){expired++}});open(model);await model.refresh()
  assert.equal(model.snapshot().forbidden,true);assert.equal(model.snapshot().data,null);assert.equal(expired,0)
  model.setAvailability({currentAdmin:true,company_worker_heartbeats_available:true});await model.refresh();assert.equal(calls,1)
  assert.doesNotMatch(model.snapshot().error,/PRIVATE/);close(model)
})
test('503/invalid DTO/transport errors clear data, retain truthful failure, and permit manual retry',async()=>{
  for(const failure of [{status:503,message:'PRIVATE'},{status:0,message:'PRIVATE'},data()]){
    let calls=0;const model=make({getCompanyWorkerHeartbeats:async()=>{if(++calls===1)return data();if(calls===2){if(failure.protocol)return{...failure,health:true};throw failure}return data()}});open(model);await model.refresh();await model.refresh()
    assert.equal(model.snapshot().data,null);assert.ok(['unavailable','unknown'].includes(model.snapshot().status));assert.doesNotMatch(model.snapshot().error,/PRIVATE|health/)
    await model.refresh();assert.equal(model.snapshot().status,'snapshot');close(model)
  }
})
test('local retention expires a nearly-expired fresh report instead of claiming perpetual ready',async()=>{
  const value=data();value.workers[0].last_seen_at='2026-10-29T01:00:33.100Z'
  const model=make({getCompanyWorkerHeartbeats:async()=>value});open(model);await model.refresh()
  await new Promise(resolve=>setTimeout(resolve,150));assert.equal(model.snapshot().data,null);assert.equal(model.snapshot().status,'unknown');close(model)
})
test('a fresh report consumed by a long read cannot be published as currently ready',async()=>{
  const value=data();value.workers[0].last_seen_at='2026-10-29T01:00:33.001Z'
  const model=make({getCompanyWorkerHeartbeats:async()=>{await new Promise(resolve=>setTimeout(resolve,5));return value}});open(model);await model.refresh()
  assert.equal(model.snapshot().data,null);assert.equal(model.snapshot().status,'unknown');close(model)
})
test('scope matching is exact, snapshots clear on disposal and late data cannot resurrect them',async()=>{
  const wait=deferred(),api={getCompanyWorkerHeartbeats:()=>wait.promise},model=make(api);open(model)
  assert.equal(model.matchesScope(api,id(1)),true);assert.equal(model.matchesScope(api,id(2)),false);assert.equal(model.matchesScope({...api},id(1)),false)
  const pending=model.refresh();model.dispose();wait.resolve(data());await pending;assert.equal(model.snapshot().data,null);assert.equal(model.matchesScope(api,id(1)),false)
})
