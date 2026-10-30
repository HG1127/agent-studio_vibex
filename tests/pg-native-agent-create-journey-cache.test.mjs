// Real journey state transitions with explicit API doubles; no auth/DB claim.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeAgentCreateJourney} from '../src/lib/pgNativeAgentCreateJourney.ts'
import {resolveNativeJourneyAgentCache as resolve} from '../src/lib/pgNativeAgentCreateJourneyCache.ts'
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',row=()=>({id,name:'current own Agent',revision:1,spec:{goal:'goal',task_scope:'scope',deliverables:['output'],task_plan:['step'],done_criteria:['check']}})
function fixture(){let calls=0,fail=0;const api={async getAgent(){calls++;if(fail)throw {status:fail};return row()},async createAgent(){calls++;throw Error('unknown_create_ACK')}};const model=createPgNativeAgentCreateJourney(api,{employeeId:owner,scopeKey:'login-1',onExpired(){}});model.setEnabled(true);model.setActive(true);return {model,api,calls:()=>calls,fail:status=>{fail=status}}}
test('active refresh404/403/unknown failure clears retained current-record authority and hides the old configuration',async()=>{
 for(const status of [404,403,503]){const f=fixture();await f.model.selectExisting(id,true);let projected=resolve(null,f.model,true,f.model.snapshot());assert.equal(projected.agent.id,id);f.fail(status);await f.model.refreshSelected();assert.equal(f.model.snapshot().agent,null);projected=resolve(projected.cache,f.model,true,f.model.snapshot());assert.equal(projected.cache,null);assert.equal(projected.agent,null);assert.ok(f.model.snapshot().error)}
})
test('inactive same-owner navigation retains private editor context but first active render never exposes it before a current snapshot',async()=>{
 const f=fixture();await f.model.selectExisting(id,true);let projected=resolve(null,f.model,true,f.model.snapshot());f.model.setActive(false);projected=resolve(projected.cache,f.model,false,f.model.snapshot());assert.equal(projected.agent.id,id)
 const firstActive=resolve(projected.cache,f.model,true,f.model.snapshot());assert.equal(firstActive.agent,null);assert.equal(firstActive.cache.agent.id,id)
 f.model.setActive(true);projected=resolve(firstActive.cache,f.model,true,f.model.snapshot());assert.equal(projected.agent.id,id)
})
test('failure learned while inactive is cleared when the actual active snapshot arrives',async()=>{
 const f=fixture();await f.model.selectExisting(id,true);let projected=resolve(null,f.model,true,f.model.snapshot());f.model.setActive(false);f.fail(404);await f.model.refreshSelected();projected=resolve(projected.cache,f.model,false,f.model.snapshot());assert.equal(projected.agent.id,id);f.model.setActive(true);projected=resolve(projected.cache,f.model,true,f.model.snapshot());assert.equal(projected.cache,null);assert.equal(projected.agent,null)
})
test('new or absent API/owner/login binding discards previous private context immediately',async()=>{
 const f=fixture();await f.model.selectExisting(id,true);const original=resolve(null,f.model,true,f.model.snapshot()).cache
 for(const binding of [undefined,{}]){const projected=resolve(original,binding,false,{active:false,agent:null});assert.equal(projected.cache,null);assert.equal(projected.agent,null)}
})
test('cache clearing does not reset uncertain creation intent or acknowledged original ID, and does not POST again',async()=>{
 for(const acknowledged of [false,true]){const f=fixture();let writes=0;f.api.createAgent=async()=>{writes++;if(acknowledged)return row();throw Error('unknown_create_ACK')};if(acknowledged)f.fail(403)
  f.model.setDraft('name','goal');f.model.setPlan({task_scope:'scope',deliverables:'output',task_plan:'step',done_criteria:'check'});await f.model.create();const before=f.model.snapshot();assert.equal(before.pendingCreate,true);assert.equal(before.createdId,acknowledged?id:'')
  const projected=resolve({binding:f.model,agent:row()},f.model,true,before);assert.equal(projected.cache,null);assert.equal(projected.agent,null);assert.equal(f.model.snapshot().pendingCreate,true);assert.equal(f.model.snapshot().createdId,before.createdId);await f.model.create();assert.equal(writes,1)
 }
})
