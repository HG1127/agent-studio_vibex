import test from 'node:test'
import assert from 'node:assert/strict'
import {parseFeedbackOptimizationDraft,parseFeedbackOptimizationAcceptance,feedbackOptimizationChangedFields} from '../src/agent-feedback-optimization-contract.ts'
import {safeAgentSpec} from '../src/contracts.ts'
const spec='33333333-3333-4333-8333-333333333333',run='22222222-2222-4222-8222-222222222222',feedback='44444444-4444-4444-8444-444444444444',request='55555555-5555-4555-8555-555555555555'
const draft={action:'preview',spec_id:spec,run_id:run,feedback_id:feedback,expected_feedback_sha256:'a'.repeat(64),expected_spec_revision:3,expected_spec_sha256:'b'.repeat(64),name:'Synthetic revised role',spec:{goal:'Synthetic corrected goal',tools:['calculate']}}
const accept={...draft,action:'accept',request_id:request,confirm:true}
test('feedback role change preview cannot masquerade as explicit acceptance or carry a fee/execution/owner grant',()=>{
  assert.equal(parseFeedbackOptimizationDraft(draft).action,'preview');assert.equal(parseFeedbackOptimizationDraft(draft).spec.require_approval,true)
  for(const patch of [{confirm:true},{request_id:request},{action:'accept'},{owner_user_id:spec},{paid_optimization_approved:true},{execute:true},{worker_secret:'synthetic'}])assert.throws(()=>parseFeedbackOptimizationDraft({...draft,...patch}))
  assert.throws(()=>parseFeedbackOptimizationAcceptance(draft));assert.throws(()=>parseFeedbackOptimizationDraft(accept))
})
test('explicit acceptance binds current feedback record, full target version and complete supported resource/descriptive candidate',()=>{
  const candidate={...accept,spec:{...accept.spec,task_scope:'Synthetic scope',deliverables:['交付😀'],task_plan:['核对证据'],done_criteria:['满足要求'],require_plan_review:true,
    model_binding:{connection_id:spec,connection_revision:1,model_id:'synthetic-model'},knowledge_base_ids:[run],tools:['calculate','knowledge_search']}}
  const parsed=parseFeedbackOptimizationAcceptance(candidate);assert.equal(parsed.spec.model_binding.model_id,'synthetic-model');assert.deepEqual(parsed.spec.knowledge_base_ids,[run]);assert.equal(parsed.spec.require_plan_review,true)
  for(const patch of [{expected_feedback_sha256:'c'.repeat(64)},{expected_spec_revision:4},{expected_spec_sha256:'d'.repeat(64)},{name:'Different role'},{spec:{...candidate.spec,task_plan:['Different plan']}}])assert.notEqual(parseFeedbackOptimizationAcceptance({...candidate,...patch}).request_sha256,parsed.request_sha256)
  assert.doesNotMatch(parsed.request_sha256,/Synthetic|交付/)
})
test('acceptance refuses stale-unbound, unknown or protected inputs and requires an independent confirmed request ID',()=>{
  for(const patch of [{confirm:false},{confirm:'true'},{request_id:feedback},{expected_spec_revision:0},{expected_spec_revision:Number.MAX_SAFE_INTEGER},{expected_spec_sha256:'x'},{expected_feedback_sha256:'x'},{owner_epoch:1},{before_hash:'a'.repeat(64)},{accepted_revision_id:request},{changed_keys:['goal']},{spec:{...accept.spec,require_approval:false}},{spec:{...accept.spec,api_key:'syntheticPrivate'}},{spec:{...accept.spec,model_binding:{connection_id:spec,connection_revision:1,model_id:'synthetic',api_key:'private'}}}])assert.throws(()=>parseFeedbackOptimizationAcceptance({...accept,...patch}))
  let invoked=0;const getter={...accept};Object.defineProperty(getter,'name',{enumerable:true,get(){invoked++;return 'Unexpected'}});assert.throws(()=>parseFeedbackOptimizationAcceptance(getter));assert.equal(invoked,0)
  assert.throws(()=>parseFeedbackOptimizationAcceptance({...accept,[Symbol('hidden')]:true}))
})
test('planned changed fields cover private bindings and knowledge/tool permissions while rejecting no-op and name-only optimization labels',()=>{
  const before={name:'Original',spec:safeAgentSpec({goal:'Original goal',tools:[]})}
  assert.throws(()=>feedbackOptimizationChangedFields(before,before),e=>e.code==='feedback_optimization_change_required')
  assert.throws(()=>feedbackOptimizationChangedFields(before,{...before,name:'Renamed'}),e=>e.code==='feedback_optimization_change_required')
  const after={name:'Revised',spec:safeAgentSpec({goal:'Revised goal',tools:['calculate','knowledge_search'],knowledge_base_ids:[run],require_plan_review:true,model_binding:{connection_id:spec,connection_revision:2,model_id:'synthetic'}})}
  assert.deepEqual(feedbackOptimizationChangedFields(before,after),['name','goal','tools','knowledge_base_ids','require_plan_review','model_binding'])
})
test('database JSON object key order never invents a model or tool permission change',()=>{
  const model={connection_id:spec,connection_revision:2,model_id:'synthetic'},before={name:'Same name',spec:safeAgentSpec({goal:'Original goal',model_binding:model})}
  before.spec.model_binding=Object.fromEntries(Object.entries(model).reverse())
  const after={name:'Same name',spec:safeAgentSpec({goal:'Changed goal',model_binding:model})}
  assert.deepEqual(feedbackOptimizationChangedFields(before,after),['goal'])
})
