import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalBusinessIdentity} from '../src/lib/originalBusinessIdentity.ts'
import {createOriginalBusinessApi,OriginalBusinessError} from '../src/lib/originalBusinessApi.ts'
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002'
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
test('only an actual verified employee opens a hidden epoch; callers cannot restore a permit',async()=>{
 const verify=deferred(),scope=createOriginalBusinessIdentity(()=>verify.promise)
 assert.equal(scope.snapshot().ready,false);assert(Object.isFrozen(scope.snapshot()))
 const opening=scope.initialize();assert.equal(scope.snapshot().ready,false)
 verify.resolve(a);await opening;assert.equal(scope.snapshot().employee,a)
 const old=scope.snapshot();scope.invalidate();assert.notEqual(scope.snapshot().epoch,old.epoch)
 await scope.initialize();assert.equal(scope.snapshot().ready,false)
 await assert.rejects(scope.request(async()=>({items:[]})));await assert.rejects(scope.check())
 assert.equal('permit'in scope,false);assert.equal('setEmployee'in scope,false)
})
test('invalidation synchronously clears displayed facts, source and review and aborts pending requests',async()=>{
 const scope=createOriginalBusinessIdentity(async()=>a);await scope.initialize()
 let display={facts:['private'],source:'private tail',review:{secret:true}}
 scope.subscribe(()=>{if(!scope.snapshot().ready)display=null})
 const late=deferred();let signal
 const pending=scope.request(async(_owner,s)=>{signal=s;return late.promise})
 while(!signal)await Promise.resolve()
 scope.invalidate();assert.equal(display,null);assert.equal(signal?.aborted,true)
 late.resolve({facts:['private late']});await assert.rejects(pending)
})
for(const actual of ['',b])test('identity '+(actual?'switch':'unavailable')+' hides a complete non-polling view',async()=>{
 let verified=a;const scope=createOriginalBusinessIdentity(async()=>verified);await scope.initialize()
 const old=scope.snapshot();verified=actual;await assert.rejects(scope.check())
 assert.equal(scope.snapshot().ready,false);assert.equal(scope.snapshot().employee,'');assert(scope.snapshot().epoch>old.epoch)
})
test('a late old-owner response cannot refill after verified same-owner recovery',async()=>{
 const scope=createOriginalBusinessIdentity(async()=>a);await scope.initialize()
 const late=deferred();let started=false
 const pending=scope.request(async()=>{started=true;return late.promise})
 while(!started)await Promise.resolve()
 scope.invalidate();await scope.recover();assert.equal(scope.snapshot().employee,a)
 late.resolve({private:'old epoch'});await assert.rejects(pending)
 assert.deepEqual(await scope.request(async()=>({items:[]})),{items:[]})
})
for(const status of [401,403])test('business '+status+' invalidates current cached epoch',async()=>{
 const scope=createOriginalBusinessIdentity(async()=>a);await scope.initialize()
 await assert.rejects(scope.request(async()=>{throw new OriginalBusinessError(status,'rejected')}));assert.equal(scope.snapshot().ready,false)
})
test('employee precondition failure hides; ordinary 409 or 429 cannot grant or fake health',async()=>{
 const scope=createOriginalBusinessIdentity(async()=>a);await scope.initialize()
 for(const status of [409,429,503]){await assert.rejects(scope.request(async()=>{throw new OriginalBusinessError(status,'request_failed')}));assert.equal(scope.snapshot().ready,true)}
 await assert.rejects(scope.request(async()=>{throw new OriginalBusinessError(409,'employee_session_changed')}));assert.equal(scope.snapshot().ready,false)
})
test('fresh verification after response rejects mismatched Cookie employee even if body is a successful empty list',async()=>{
 let actual=a;const scope=createOriginalBusinessIdentity(async()=>actual);await scope.initialize()
 await assert.rejects(scope.request(async()=>{actual=b;return{items:[]}}));assert.equal(scope.snapshot().ready,false)
})
test('external cancellation rejects even a transport that ignores abort',async()=>{
 const scope=createOriginalBusinessIdentity(async()=>a);await scope.initialize();const abort=new AbortController()
 await assert.rejects(scope.request(async()=>{abort.abort();return{private:true}},abort.signal));assert.equal(scope.snapshot().ready,true)
})
test('all business GETs send starting expected employee; Cookie remains browser-owned',async()=>{
 const seen=[],api=createOriginalBusinessApi(a,async(url,options)=>{seen.push({url,options});return new Response(JSON.stringify({items:[]}),{headers:{'Content-Type':'application/json'}})})
 await api('/api/schedules')
 assert.equal(seen[0].options.method,'GET');assert.equal(seen[0].options.headers['X-AgentStudio-Expected-Employee'],a)
 assert.equal(seen[0].options.credentials,'same-origin');assert.equal('Cookie'in seen[0].options.headers,false)
})
test('actual 409 employee failure stays distinguishable to the controller without exposing arbitrary error text',async()=>{
 for(const code of ['employee_session_changed','private database detail']){
  const api=createOriginalBusinessApi(a,async()=>new Response(JSON.stringify({error:code}),{status:409,headers:{'Content-Type':'application/json'}}))
  await assert.rejects(api('/api/schedules'),e=>e.status===409&&e.code===(code==='employee_session_changed'?code:'original_business_request_rejected'))
 }
})
