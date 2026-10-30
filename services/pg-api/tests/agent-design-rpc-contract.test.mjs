import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentDesignReceipt as receipt,parseAgentDesignReply as reply,parseAgentDesignProof as proof,parseAgentDesignSaveReceipt as saved,parseAgentDesignView as view,parseAgentDesignCandidate as candidate} from '../src/agent-design-rpc-contract.ts'
import {deriveAgentDesignCandidate} from '../src/agent-design-result.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),sha='a'.repeat(64),at='2026-10-29T01:00:00.000Z'
const row=()=>({protocol:'agent_design_receipt_v1',request_id:id(1),purpose:'generate',model_binding:{connection_id:id(2),connection_revision:1,model_id:'model'},output_token_limit:4096,source:null,request_sha256:sha,input_sha256:sha,content_sha256:sha,source_sha256:sha,resources_sha256:sha,owner_governance_revision:1,owner_epoch:1,created_at:at,state:'queued',body_erased:false,recorded:true,replayed:false})
test('closed DTOs reject source-purpose mismatch, secret extras, dates and incompatible status',()=>{
  assert.equal(receipt(row()).state,'queued')
  for(const change of [{purpose:'revise'},{owner_user_id:id(9)},{created_at:'2026-10-29T01:00:00Z'},{body_erased:true},{owner_epoch:'1'},{output_token_limit:2048}])assert.throws(()=>receipt({...row(),...change}))
  assert.throws(()=>view({protocol:'agent_design_view_v1',receipt:row(),result_status:'available',result:null}))
  assert.throws(()=>view({protocol:'agent_design_view_v1',receipt:row(),result_status:'erased',result:null}))
})
test('dispatch proof does not accept review domains, leases in replies or paused completion claims',()=>{
  const p={protocol:'agent_design_dispatch_v1',request_id:id(1),lease_token:id(3),lease_version:1,worker_id:id(4)}
  assert.deepEqual(proof(p),p);assert.throws(()=>proof({...p,protocol:'agent_assessment_dispatch_v1'}));assert.throws(()=>proof({...p,owner_user_id:id(9)}))
  assert.throws(()=>reply({protocol:'agent_design_dispatch_reply_v1',request_id:id(1),state:'paused',completion_sha256:sha}))
  assert.throws(()=>reply({protocol:'agent_design_dispatch_reply_v1',request_id:id(1),state:'succeeded'}))
})
test('save revision arithmetic cannot bypass protocol/recorded validation through ternary precedence',()=>{
  const r={protocol:'agent_design_save_receipt_v1',request_id:id(3),design_request_id:id(1),request_sha256:sha,preview_sha256:sha,result_sha256:sha,source_sha256:sha,candidate_sha256:sha,purpose:'generate',spec_id:id(5),before_revision:null,after_revision:1,created_at:at,recorded:true,replayed:false}
  assert.equal(saved(r).after_revision,1)
  for(const v of [{protocol:'wrong'},{recorded:false},{after_revision:2},{purpose:'revise'},{before_revision:1}])assert.throws(()=>saved({...r,...v}))
  assert.equal(saved({...r,purpose:'revise',before_revision:5,after_revision:6}).before_revision,5)
})
test('candidate parsing rejects silent normalization/unknown grants and keeps all descriptions',()=>{
  const result={name:'Name',goal:'Goal',task_scope:'Scope',deliverables:['Delivery'],tools:['Advice'],task_plan:['Plan'],done_criteria:['Done']},c=deriveAgentDesignCandidate(null,result)
  assert.deepEqual(candidate(c),c);assert.throws(()=>candidate({...c,spec:{...c.spec,goal:' Goal '}}));assert.throws(()=>candidate({...c,spec:{...c.spec,secret:'private'}}))
})
