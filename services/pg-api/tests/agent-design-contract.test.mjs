// Intent normalization and hash binding only, never a paid/DB authority positive.
import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentDesignChoice,parseAgentDesignSubmission,parseAgentDesignControl,parseAgentDesignSaveIntent,
  parseAgentDesignSavePreviewInput,agentDesignFees,agentDesignSaveAcknowledgement} from '../src/agent-design-contract.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),hash='a'.repeat(64)
const choice=(extra={})=>({action:'preview',purpose:'generate',instruction:'生成完整方案',model_binding:{connection_id:id(1),connection_revision:2,model_id:'model-a'},output_token_limit:4096,source:null,...extra})
const submit=(extra={})=>({...choice(),action:'submit',request_id:id(2),expected_input_sha256:hash,confirm:true,fee_acknowledgement:agentDesignFees.generate,...extra})
test('only distinct generate/revise purposes and explicit pinned model/cap are normalized',()=>{
  assert.equal(parseAgentDesignChoice(choice()).purpose,'generate')
  assert.equal(parseAgentDesignChoice(choice({purpose:'revise',source:{spec_id:id(4),revision:5,source_sha256:hash}})).source.revision,5)
  for(const purpose of ['evaluate','optimize','review','run'])assert.throws(()=>parseAgentDesignChoice(choice({purpose})))
  for(const output_token_limit of [2000,2048,20000,'4096'])assert.throws(()=>parseAgentDesignChoice(choice({output_token_limit})))
})
test('instruction2000/native budget boundaries are retained with no silent truncation',()=>{
  assert.equal(parseAgentDesignChoice(choice({instruction:'字'.repeat(2000)})).instruction.length,2000)
  for(const instruction of ['字'.repeat(2001),'\ud800','\0',' '])assert.throws(()=>parseAgentDesignChoice(choice({instruction})))
  assert.throws(()=>parseAgentDesignChoice(choice({model_binding:{...choice().model_binding,connection_revision:0}})))
})
test('submission requires purpose-specific fee confirmation and binds all choices to request hash',()=>{
  const value=parseAgentDesignSubmission(submit());assert.match(value.request_sha256,/^[a-f0-9]{64}$/)
  for(const extra of [{confirm:false},{fee_acknowledgement:agentDesignFees.revise},{fee_acknowledgement:'APPROVE_REVIEW'},{owner_id:id(9)},{lease_token:id(9)},{recorded:true}])assert.throws(()=>parseAgentDesignSubmission(submit(extra)))
  for(const extra of [{instruction:'另一要求'},{output_token_limit:8192},{expected_input_sha256:'b'.repeat(64)},{request_id:id(3)}])assert.notEqual(parseAgentDesignSubmission(submit(extra)).request_sha256,value.request_sha256)
})
test('generate cannot invent a sourceRole, while revise requires exact immutable source reference',()=>{
  assert.throws(()=>parseAgentDesignChoice(choice({source:{spec_id:id(1),revision:1,source_sha256:hash}})))
  for(const source of [null,{spec_id:id(1),revision:0,source_sha256:hash},{spec_id:id(1),revision:1,source_sha256:hash,owner_id:id(9)}])assert.throws(()=>parseAgentDesignChoice(choice({purpose:'revise',source})))
})
test('control has independent exact intent IDs and never implies refund or safe resend',()=>{
  const cancel=parseAgentDesignControl({action:'cancel',request_id:id(3),design_request_id:id(2),confirm:true})
  assert.equal(cancel.action,'cancel');assert.equal(Object.hasOwn(cancel,'refunded'),false)
  assert.throws(()=>parseAgentDesignControl({action:'cancel',request_id:id(2),design_request_id:id(2),confirm:true}))
  assert.throws(()=>parseAgentDesignControl({action:'resume',request_id:id(3),design_request_id:id(2),confirm:true}))
})
test('save is separately confirmed and pinned; accepting a result alone never saves or executes',()=>{
  const fields={name:'新助手',goal:'目标',task_scope:'范围',deliverables:['交付'],task_plan:['步骤'],done_criteria:['标准']}
  assert.deepEqual(parseAgentDesignSavePreviewInput({action:'preview_save',design_request_id:id(2),expected_result_sha256:hash,fields}).fields,fields)
  const intent={action:'save',request_id:id(3),design_request_id:id(2),expected_preview_sha256:hash,expected_result_sha256:hash,
    expected_source_sha256:hash,expected_candidate_sha256:hash,confirm:true,save_acknowledgement:agentDesignSaveAcknowledgement}
  const parsed=parseAgentDesignSaveIntent(intent);assert.match(parsed.request_sha256,/^[a-f0-9]{64}$/);assert.equal(Object.hasOwn(parsed,'run_id'),false)
  for(const extra of [{confirm:false},{save_acknowledgement:agentDesignFees.generate},{expected_source_sha256:'bad'},{owner_id:id(4)},{spec:{goal:'override'}}])assert.throws(()=>parseAgentDesignSaveIntent({...intent,...extra}))
})
