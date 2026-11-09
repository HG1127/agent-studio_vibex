// Projection values only; hashes here never prove currentness or SQL authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {safeAgentSpec} from '../src/contracts.ts'
import {agentPlanWorkflowPurpose as purpose,canonicalAgentPlanWorkflowValue as canonical} from '../src/agent-plan-workflow-contract.ts'
import {prepareAgentPlanWorkflowInput,agentPlanWorkflowResultValue} from '../src/agent-plan-workflow-result.ts'
import {parseAgentPlanWorkflowReceipt as receipt,parseAgentPlanWorkflowPrepared as prepared,parseAgentPlanWorkflowDispatchProof as proof,parseAgentPlanWorkflowClaim as claim,parseAgentPlanWorkflowContext as context,parseAgentPlanWorkflowReservation as reserve,parseAgentPlanWorkflowDispatchReply as reply,parseAgentPlanWorkflowView as view,parseAgentPlanWorkflowControl as control,parseAgentPlanWorkflowSaveReceipt as saveReceipt,parseAgentPlanWorkflowSavePreviewInput as saveInput,agentPlanWorkflowCancelAcknowledgement as cancel} from '../src/agent-plan-workflow-rpc-contract.ts'
const id=n=>String(n).padStart(8,'0')+'-1234-4234-8234-123456789abc',hex=n=>String(n).repeat(64),date='2026-10-29T01:02:03.000Z'
const source=()=>({spec_id:id(1),spec_revision:1,source_sha256:hex(1),resources_sha256:hex(2),resource_versions_sha256:hex(3)}),model=()=>({connection_id:id(2),connection_revision:2,model_id:'model-v1'}),choice=()=>({action:'preview',purpose,source:source(),instruction:'设计草图',generation_model:model(),output_token_limit:4096})
const sourceValues=()=>({source:source(),name:'既有方案',spec:safeAgentSpec({goal:'整理资料',tools:[],knowledge_base_ids:[]})})
const rec=()=>({protocol:'agent_plan_workflow_receipt_v1',purpose,request_id:id(3),generation_model:model(),output_token_limit:4096,source:source(),request_sha256:hex(4),input_sha256:hex(5),content_sha256:hex(6),model_versions_sha256:hex(7),owner_governance_revision:3,owner_epoch:3,created_at:date,state:'queued',body_erased:false,recorded:true,replayed:false})
const prep=()=>{const values=prepareAgentPlanWorkflowInput(choice(),sourceValues());return {protocol:'agent_plan_workflow_prepared_v1',purpose,choice:choice(),source_values:sourceValues(),messages:values.messages,input_sha256:hex(5),content_sha256:hex(6),model_versions_sha256:hex(7),owner_user_id:id(4),owner_governance_revision:3,owner_epoch:3,byte_length:new TextEncoder().encode(canonical(values.input_value)).length,authority:false}}
const dispatch=()=>({protocol:'agent_plan_workflow_dispatch_v1',purpose,request_id:id(3),lease_token:id(5),lease_version:1,worker_id:id(6)})
const ctx=()=>({protocol:'agent_plan_workflow_context_v1',purpose,identity:{issuer:'urn:agentstudio:local:v1',subject:'employee'},owner_user_id:id(4),owner_governance_revision:3,owner_epoch:3,request_id:id(3),request_sha256:hex(4),choice:choice(),prepared:prep()})
const graph=()=>({version:2,nodes:[{id:'s',type:'start',position:{x:0,y:0},data:{title:'s'}},{id:'m',type:'model',position:{x:1,y:1},data:{title:'m',prompt:'分析'}},{id:'e',type:'end',position:{x:2,y:2},data:{title:'e'}}],edges:[{id:'a',source:'s',target:'m'},{id:'b',source:'m',target:'e'}]})
const refused=fn=>assert.throws(fn,/projection_unavailable/)
test('receipts reject cross-purpose/F01, owner injection, malformed dates and contradictory erasure',()=>{
 assert.ok(Object.isFrozen(receipt(rec()).source))
 for(const patch of [{purpose:'generate'},{protocol:'agent_design_receipt_v1'},{owner_user_id:id(4)},{output_token_limit:32768},{created_at:'2026-02-31T01:02:03.000Z'},{owner_epoch:4},{state:'erased'},{state:'succeeded',body_erased:true},{replayed:'true'}])refused(()=>receipt({...rec(),...patch}))
 let reads=0;const raw=rec();Object.defineProperty(raw,'state',{enumerable:true,get(){reads++;return 'queued'}});refused(()=>receipt(raw));assert.equal(reads,0)
})
test('prepared reconstructs complete messages and byte length while retaining hash values without claiming authority',()=>{
 assert.equal(prepared(prep()).authority,false)
 for(const patch of [{authority:true},{byte_length:1},{owner_epoch:4},{source_values:{...sourceValues(),name:'changed'}},{messages:[{role:'user',content:'injected'}]},{secret:'no'}])refused(()=>prepared({...prep(),...patch}))
})
test('private lease/context projections are closed and correlate owner/source/model without creating a lease',()=>{
 assert.equal(proof(dispatch()).lease_version,1);assert.equal(claim({...dispatch(),lease_expires_at:date}).lease_expires_at,date);assert.equal(context(ctx()).request_id,id(3))
 refused(()=>proof({...dispatch(),lease_version:0}));refused(()=>proof({...dispatch(),purpose:'revise'}));refused(()=>context({...ctx(),owner_user_id:id(8)}));refused(()=>context({...ctx(),identity:{issuer:'external',subject:'employee'}}));refused(()=>context({...ctx(),choice:{...choice(),generation_model:{...model(),model_id:'other'}}}))
})
test('reservation and terminal replies never accept retry/effect reset or incomplete success',()=>{
 const r={protocol:'agent_plan_workflow_reservation_v1',purpose,request_id:id(3),effect_id:id(7),state:'reserved',request_sha256:hex(4),input_sha256:hex(5),content_sha256:hex(6),source_sha256:hex(1)};assert.equal(reserve(r).state,'reserved');refused(()=>reserve({...r,retry:true}));refused(()=>reserve({...r,state:'queued'}))
 const value={protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:id(3),state:'unknown',result_sha256:null,completion_sha256:null};assert.equal(reply(value).state,'unknown');refused(()=>reply({...value,state:'succeeded'}));refused(()=>reply({...value,state:'paused',completion_sha256:hex(1)}));refused(()=>reply({...value,retry:true}))
 let coerced=0;refused(()=>reply({...value,state:{toString(){coerced++;return 'unknown'}}}));assert.equal(coerced,0)
})
test('stale views retain original succeeded artifact; mismatched result/reference or pending body is refused',()=>{
 const r={...rec(),state:'succeeded'},value=agentPlanWorkflowResultValue({request_id:r.request_id,purpose,source:r.source,input_sha256:r.input_sha256,generation_model:r.generation_model},{protocol:'agent_plan_workflow_model_output_v1',name:'草图',graph:graph()}),result={protocol:'agent_plan_workflow_result_data_v1',request_id:r.request_id,result_sha256:hex(8),value},v={protocol:'agent_plan_workflow_view_v1',receipt:r,result_status:'stale',result}
 assert.equal(view(v).result.value.authority,false);refused(()=>view({...v,result:null}));refused(()=>view({...v,receipt:rec()}));refused(()=>view({...v,result:{...result,value:{...value,reference:{...value.reference,input_sha256:hex(9)}}}}))
 refused(()=>view({protocol:'agent_plan_workflow_view_v1',receipt:rec(),result_status:'unavailable',result:null}))
})
test('control and save values use independent acknowledgements and distinct generation/source/save UUIDs',()=>{
 assert.equal(control({action:'cancel',request_id:id(7),generation_request_id:id(3),confirm:true,acknowledgement:cancel}).action,'cancel')
 assert.throws(()=>control({action:'cancel',request_id:id(7),generation_request_id:id(3),confirm:true,acknowledgement:'APPROVE_AGENT_DESIGN_CANCEL'}),/invalid_agent_plan_workflow_value/);assert.throws(()=>saveInput({generation_request_id:id(3),expected_result_sha256:hex(8),edits:{name:'x',graph:{...graph(),execute:true}}}),/invalid_agent_plan_workflow_value/)
 const v={protocol:'agent_plan_workflow_save_receipt_v1',purpose,request_id:id(7),generation_request_id:id(3),request_sha256:hex(4),source:source(),result_sha256:hex(8),preview_sha256:hex(6),candidate_sha256:hex(5),workflow_id:id(7),workflow_revision:1,created_at:date,recorded:true,replayed:false};assert.equal(saveReceipt(v).workflow_id,id(7));refused(()=>saveReceipt({...v,workflow_revision:2}));refused(()=>saveReceipt({...v,workflow_id:id(9)}));refused(()=>saveReceipt({...v,request_id:id(1),workflow_id:id(1)}))
})
test('RPC source imports only browser-safe pure modules; no server type import, Node, SQL or loader',()=>{
 const source=readFileSync(new URL('../src/agent-plan-workflow-rpc-contract.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/node:|agent-design-|from ['"][^'"]*(?:source|ledger|runtime-policy)|\bimport\s*\(|\bfetch\(|\bprocess\./)
})
