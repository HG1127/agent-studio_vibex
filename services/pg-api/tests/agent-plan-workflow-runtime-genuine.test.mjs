// Real fresh PG18/Native Cookie/Worker/mTLS/synthetic model. No local fallback.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentPlanWorkflowRuntimeGenuineFixture} from './helpers/agent-plan-workflow-runtime-genuine-fixture.mjs'
const prefix='/api/v2/agent-plan-workflow'
test('F05 real product composition: explicit paid model graph, original ACK recovery, atomic editable Workflow save and owner fences',{timeout:240000},async t=>{
 const f=await agentPlanWorkflowRuntimeGenuineFixture(),before=await f.state();let p,view,save
 const ok=async(who,path,body,options)=>{const r=await f.request(who,path,body,options);assert.equal(r.status,200,JSON.stringify(r.body));return r.body}
 const prepare=async who=>{
  const source=await ok(who,prefix+'/source',{purpose:f.contract.agentPlanWorkflowPurpose,spec_id:f.resources[who].spec.id,generation_model:f.generationModels[who].binding})
  const choice={action:'preview',purpose:f.contract.agentPlanWorkflowPurpose,source:source.source,generation_model:f.generationModels[who].binding,instruction:' 保留原文\n由真实模型响应设计工作流 ',output_token_limit:4096}
  const preview=await ok(who,prefix+'/preview',choice)
  return {source,choice,preview,intent:{...choice,action:'submit',request_id:randomUUID(),expected_input_sha256:preview.input_sha256,confirm:true,fee_acknowledgement:f.contract.agentPlanWorkflowFeeAcknowledgement}}
 }
 try{
  await t.test('actual Native metadata exposes only separately approved F05 capabilities',async()=>{
   const meta=await ok('alice','/api/native-auth/capabilities');assert.equal(meta.agent_plan_workflow_available,true);assert.equal(meta.agent_plan_workflow_submissions_enabled,true);assert.equal(meta.agent_plan_workflow_saves_enabled,true)
   const unauth=await f.request('nobody',prefix+'/source',{purpose:f.contract.agentPlanWorkflowPurpose,spec_id:f.resources.alice.spec.id,generation_model:f.generationModels.alice.binding});assert.equal(unauth.status,401)
   const alias=await f.request('alice',prefix+'/source',{purpose:f.contract.agentPlanWorkflowPurpose,spec_id:f.resources.alice.spec.id,generation_model:f.generationModels.alice.binding},{headers:{'X-Rh-User-Id':f.users.bob}});assert.equal(alias.status,403)
   const foreign=await f.request('bob',prefix+'/source',{purpose:f.contract.agentPlanWorkflowPurpose,spec_id:f.resources.alice.spec.id,generation_model:f.generationModels.bob.binding});assert.ok([403,404].includes(foreign.status))
   assert.equal(f.providerEvents.length,0)
  })
  await t.test('preview preserves content and independent generation model without creating paid work',async()=>{
   p=await prepare('alice');assert.equal(p.preview.choice.instruction,p.choice.instruction);assert.deepEqual(p.preview.choice.generation_model,f.generationModels.alice.binding)
   assert.notEqual(p.preview.choice.generation_model.connection_id,f.resources.alice.binding.connection_id)
   const noFee=await f.request('alice',prefix+'/requests',{...p.intent,confirm:false});assert.equal(noFee.status,400)
   assert.equal((await f.state()).requests,before.requests);assert.equal(f.providerEvents.length,0)
  })
  await t.test('lost submit ACK is recovered with the same UUID, even after submissions are disabled',async()=>{
   f.mutable.dropNext={method:'POST',path:prefix+'/requests'};await assert.rejects(f.request('alice',prefix+'/requests',p.intent))
   f.mutable.submissions=false
   const receipt=await ok('alice',prefix+'/confirm',p.intent);assert.equal(receipt.request_id,p.intent.request_id);assert.equal(receipt.replayed,true);p.receipt=receipt
   const repeat=await ok('alice',prefix+'/confirm',p.intent);assert.equal(repeat.request_sha256,receipt.request_sha256)
   assert.equal((await f.state()).requests,before.requests+1);assert.equal(f.providerEvents.length,0)
  })
  await t.test('actual dedicated Worker and mTLS Broker reserve before credential SELECT and emit exactly one model POST',async()=>{
   const result=await f.tick();assert.equal(result.state,'succeeded');assert.equal(result.request_id,p.intent.request_id)
   assert.equal((await f.tick()).state,'idle');assert.equal(f.providerEvents.length,1);assert.equal(f.credentialEvents.length,1);assert.equal(f.providerEvents[0].messages_sha256,p.preview.content_sha256)
   view=await ok('alice',prefix+'/requests/'+p.intent.request_id);assert.equal(view.result_status,'available');assert.equal(view.result.value.result.name,'F05 Synthetic Model Workflow')
   const node=view.result.value.result.graph.nodes.find(n=>n.type==='model');assert.ok(node);assert.equal(node.data.model_binding,undefined);assert.match(node.data.prompt,/模型设计/)
   const other=await f.request('bob',prefix+'/requests/'+p.intent.request_id);assert.equal(other.status,404)
   const state=await f.state();assert.equal(state.reservations,before.reservations+1);assert.equal(state.old_runs,before.old_runs);assert.equal(state.old_effects,before.old_effects)
  })
  await t.test('edited graph binds only an existing source execution model; save requires a distinct explicit acknowledgement',async()=>{
   const graph=structuredClone(view.result.value.result.graph);graph.nodes.find(n=>n.type==='model').data.model_binding=f.resources.alice.binding
   const input={generation_request_id:p.intent.request_id,expected_result_sha256:view.result.result_sha256,edits:{name:'F05 实际编辑后工作流',graph}}
   const preview=await ok('alice',prefix+'/preview-save',input)
   assert.deepEqual(preview.candidate.graph.nodes.find(n=>n.type==='model').data.model_binding,f.resources.alice.binding)
   const intent={action:'save',purpose:f.contract.agentPlanWorkflowPurpose,request_id:randomUUID(),generation_request_id:p.intent.request_id,source:p.receipt.source,expected_result_sha256:preview.result_sha256,expected_preview_sha256:preview.preview_sha256,expected_candidate_sha256:preview.candidate_sha256,confirm:true,save_acknowledgement:f.contract.agentPlanWorkflowSaveAcknowledgement}
   const denied=await f.request('alice',prefix+'/save',{intent:{...intent,confirm:false},preview_input:input});assert.equal(denied.status,400);assert.equal((await f.state()).saves,before.saves)
   save={input,preview,intent}
  })
  await t.test('lost save ACK recovers the immutable receipt while new saves are disabled; normal Workflow GET opens exact graph',async()=>{
   f.mutable.dropNext={method:'POST',path:prefix+'/save'};await assert.rejects(f.request('alice',prefix+'/save',{intent:save.intent,preview_input:save.input}))
   f.mutable.saves=false
   const receipt=await ok('alice',prefix+'/save/confirm',{intent:save.intent});assert.equal(receipt.request_id,save.intent.request_id);assert.equal(receipt.replayed,true)
   const saved=(await ok('alice','/api/v2/workflows/'+receipt.workflow_id)).item;assert.equal(saved.id,receipt.workflow_id);assert.equal(saved.name,save.preview.candidate.name);assert.deepEqual(saved.graph,save.preview.candidate.graph)
   const state=await f.state();assert.equal(state.saves,before.saves+1);assert.equal(state.provenance,before.provenance+1);assert.equal(state.workflows,before.workflows+1);assert.equal(f.providerEvents.length,1)
  })
  await t.test('confirmed erase removes paid bodies and forbids result editing without deleting saved Workflow or authorizing another POST',async()=>{
   const intent={action:'erase',request_id:randomUUID(),generation_request_id:p.intent.request_id,confirm:true,acknowledgement:'APPROVE_EXACT_AGENT_PLAN_WORKFLOW_ERASE_ONLY_V1'}
   const receipt=await ok('alice',prefix+'/control',intent);assert.equal(receipt.action,'erase')
   const confirmed=await ok('alice',prefix+'/control/confirm',intent);assert.equal(confirmed.replayed,true)
   const erased=await ok('alice',prefix+'/requests/'+p.intent.request_id);assert.equal(erased.result_status,'erased');assert.equal(erased.result,null)
   const refused=await f.request('alice',prefix+'/preview-save',save.input);assert.equal(refused.status,409);assert.equal((await f.tick()).state,'idle');assert.equal(f.providerEvents.length,1)
  })
 }finally{await f.close()}
})
