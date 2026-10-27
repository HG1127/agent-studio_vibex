import test from 'node:test'
import assert from 'node:assert/strict'
import {optimizationDraft,optimizationChoice,optimizationPreview,optimizationReceipt,optimizationHistory} from '../src/lib/pgNativeAgentOptimization.ts'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
import {draft,choice,before,run,spec,request,roleSha,previewFor,receiptFor,historyFor} from './helpers/pg-native-optimization-fixture.mjs'

test('optimization client preserves normalized full role fields and rejects forged scopes, approval fields, invalid Unicode and implicit confirmation',()=>{
  assert.deepEqual(optimizationDraft(draft),draft);assert.deepEqual(optimizationChoice(choice),choice)
  const full={...draft,spec:{...draft.spec,goal:'合'.repeat(3000),task_scope:'范'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))}}
  assert.deepEqual(optimizationDraft(full),full);assert.ok(Buffer.byteLength(JSON.stringify(full))>32768)
  for(const bad of [{...choice,confirm:false},{...choice,request_id:choice.feedback_id},{...choice,expected_spec_revision:Number.MAX_SAFE_INTEGER-1},{...choice,owner_user_id:spec},{...choice,changed_keys:['goal']},{...choice,paid_optimization_approved:true},{...choice,spec:{...choice.spec,require_approval:true}},{...choice,spec:{...choice.spec,goal:'\ud800'}},{...choice,spec:{...choice.spec,deliverables:new Array(1)}},{...choice,spec:{...choice.spec,provider_key:'private'}}])assert.throws(()=>optimizationChoice(bad))
})
test('optimization preview validates the complete candidate, normalized server spec, real field delta and sanitized feedback without accepting hidden extras',async()=>{
  const p=previewFor();assert.deepEqual(await optimizationPreview(p,draft),p)
  for(const patch of [{recorded:true},{feedback_id:request},{feedback_sha256:'f'.repeat(64)},{changed_keys:['model_binding']},{owner_user_id:spec},{candidate:{...p.candidate,spec:{...p.candidate.spec,model_binding:undefined}}},{candidate:{...p.candidate,candidate_sha256:'f'.repeat(64)}},{before:{...p.before,revision:6}},{before:{...p.before,spec:{...p.before.spec,private_result:'hidden'}}},{feedback:{...p.feedback,comment:'token=private'}},{feedback:{...p.feedback,tools_used:'tool proof'}}])await assert.rejects(optimizationPreview({...p,...patch},draft))
  await assert.rejects(optimizationPreview({...p,changed_keys:['goal','goal']},draft))
})
test('acceptance receipts bind the backend canonical protocol, full candidate, original request, real revision transition and confirm-only replay',async()=>{
  const r=receiptFor();assert.deepEqual(await optimizationReceipt(r,choice),r)
  assert.equal((await optimizationReceipt({...r,replayed:true},choice,true)).replayed,true)
  await assert.rejects(optimizationReceipt(r,choice,true))
  for(const patch of [{request_id:spec},{feedback_id:request},{before_spec_revision:8},{after_spec_revision:9},{before_spec_sha256:'e'.repeat(64)},{after_revision_id:r.before_revision_id},{candidate_sha256:'f'.repeat(64)},{request_sha256:'f'.repeat(64)},{changed_keys:['name']},{private_candidate:{}},{recorded:false}])await assert.rejects(optimizationReceipt({...r,...patch},choice))
  await assert.rejects(optimizationReceipt(r,{...choice,spec:{...choice.spec,task_scope:'different complete candidate'}}))
})
test('acceptance history is bounded metadata with independent current feedback and role affinity; duplicate, cross-owner-shaped or body-bearing rows fail closed',()=>{
  const row={...receiptFor(choice,{replayed:true}),feedback_unchanged:false,role_current:true},h=historyFor([row]);assert.deepEqual(optimizationHistory(h,spec),h)
  for(const bad of [{...h,items:[row,row]},{...h,limit:81},{...h,spec_id:request},{...h,items:[{...row,feedback:{comment:'private'}}]},{...h,items:[{...row,role_current:'true'}]},{...h,items:[{...row,replayed:false}]}])assert.throws(()=>optimizationHistory(bad,spec))
  const second={...row,request_id:run};assert.throws(()=>optimizationHistory(historyFor([row,second]),spec))
  assert.equal(optimizationHistory(historyFor([{...row,role_current:false}]),spec).items[0].feedback_unchanged,false)
})
test('optimization SDK uses fixed Native Cookie and CSRF paths with no background retry, preserves the exact complete body and checks lost originals',async()=>{
  const calls=[];let value=previewFor(),lose=false
  const api=createPgNativePilotApi(async(path,options)=>{calls.push({path,options});if(lose){lose=false;throw Error('synthetic lost acceptance')}return new Response(JSON.stringify(value),{status:200})},'')
  assert.equal((await api.previewAgentOptimization(draft)).recorded,false);assert.equal(calls[0].path,'/api/v2/agent-optimizations/preview')
  value=receiptFor();assert.equal((await api.acceptAgentOptimization(choice)).recorded,true);const sent=calls.at(-1);assert.deepEqual(JSON.parse(sent.options.body),choice);assert.equal(sent.options.credentials,'same-origin');assert.equal(sent.options.headers['X-AgentStudio-Request'],'1');assert.equal(sent.options.headers.Authorization,undefined);assert.equal(sent.options.headers['X-Rh-User-Id'],undefined)
  lose=true;await assert.rejects(api.acceptAgentOptimization(choice),e=>e.status===0);assert.equal(calls.length,3)
  value=receiptFor(choice,{replayed:true});await api.confirmAgentOptimization(choice);assert.equal(calls.at(-1).path,'/api/v2/agent-optimizations/confirm')
  value=historyFor();assert.equal((await api.getAgentOptimizations(spec)).items.length,0);assert.equal(calls.at(-1).path,'/api/v2/agent-optimizations?spec_id='+spec)
  const count=calls.length;await assert.rejects(api.acceptAgentOptimization({...choice,fee_approved:true}),e=>e.status===400);await assert.rejects(api.getAgentOptimizations(spec+'?owner=all'),e=>e.status===400);assert.equal(calls.length,count)
  value=receiptFor();await assert.rejects(api.confirmAgentOptimization(choice),e=>e.status===503)
})
test('manual role acceptance capabilities require their own schema and config scope without inheriting model, feedback admission or lesson grants',async()=>{
  const baseline={mode:'native_pg18',config_writes_enabled:true,run_execution_enabled:false,model_probe_enabled:false};let value=baseline
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify(value),{status:200}),'')
  for(const patch of [{agent_optimization_acceptance_enabled:true},{agent_optimization_available:'true'},{agent_optimization_available:true,agent_optimization_acceptance_enabled:'true'},{config_writes_enabled:false,agent_optimization_available:true,agent_optimization_acceptance_enabled:true}]){value={...baseline,...patch};await assert.rejects(api.getConfigCapabilities(),e=>e.status===503)}
  value={...baseline,agent_optimization_available:true,agent_optimization_acceptance_enabled:true};assert.equal((await api.getConfigCapabilities()).agent_optimization_acceptance_enabled,true)
})
