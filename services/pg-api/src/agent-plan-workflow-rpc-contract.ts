// Browser-safe064 projection values. Parsing cannot mint SQL/lease authority.
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowObject as object,agentPlanWorkflowText as text,agentPlanWorkflowId as id,agentPlanWorkflowSha as sha,agentPlanWorkflowRevision as revision,agentPlanWorkflowJsonValue,canonicalAgentPlanWorkflowValue as canonical,freezeAgentPlanWorkflowValue as freeze,invalidAgentPlanWorkflowValue,parseAgentPlanWorkflowChoice,parseAgentPlanWorkflowSource,parseAgentPlanWorkflowModel,agentPlanWorkflowOutputTokenLimits,type AgentPlanWorkflowChoice} from './agent-plan-workflow-contract.ts'
import {parseAgentPlanWorkflowSourceValues,prepareAgentPlanWorkflowInput,agentPlanWorkflowResultValue} from './agent-plan-workflow-result.ts'
import {parseWorkflowGraphV2} from './workflow-graph-v2.ts'
export class AgentPlanWorkflowProjectionError extends Error{
 readonly status=503;readonly code='agent_plan_workflow_projection_unavailable'
 constructor(){super('agent_plan_workflow_projection_unavailable');this.name='AgentPlanWorkflowProjectionError'}
}
const bad=():never=>{throw new AgentPlanWorkflowProjectionError()}
function projection<T>(body:()=>T):T{try{return freeze(body())}catch{return bad()}}
function input<T>(body:()=>T):T{try{return freeze(body())}catch{return invalidAgentPlanWorkflowValue()}}
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
const flag=(v:unknown):boolean=>typeof v==='boolean'?v:bad()
const date=(v:unknown):string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&new Date(v).toISOString()===v?v:bad()
const protocol=(v:Record<string,unknown>,p:string)=>{if(v.protocol!==p||v.purpose!==purpose)bad()}
const sourceValues=(v:unknown)=>{const p=parseAgentPlanWorkflowSourceValues(v);return {source:p.source,name:p.name,spec:p.spec}}
export const agentPlanWorkflowRequestStates=['queued','claimed','reserved','paused','succeeded','failed','unknown','cancelled','erased'] as const
export function parseAgentPlanWorkflowReceipt(raw:unknown){return projection(()=>{
 const v=object(agentPlanWorkflowJsonValue(raw),['protocol','purpose','request_id','generation_model','output_token_limit','source','request_sha256','input_sha256','content_sha256','model_versions_sha256','owner_governance_revision','owner_epoch','created_at','state','body_erased','recorded','replayed'])
 protocol(v,'agent_plan_workflow_receipt_v1')
 if(v.recorded!==true||!agentPlanWorkflowRequestStates.some(s=>s===v.state)||!agentPlanWorkflowOutputTokenLimits.some(s=>s===v.output_token_limit))return bad()
 const source=parseAgentPlanWorkflowSource(v.source),request_id=id(v.request_id),governance=revision(v.owner_governance_revision),epoch=revision(v.owner_epoch),body_erased=flag(v.body_erased)
 if(request_id===source.spec_id||epoch!==governance||v.state==='erased'&&!body_erased||body_erased&&v.state!=='erased')return bad()
 return {protocol:'agent_plan_workflow_receipt_v1' as const,purpose,request_id,generation_model:parseAgentPlanWorkflowModel(v.generation_model),output_token_limit:v.output_token_limit as AgentPlanWorkflowChoice['output_token_limit'],source,request_sha256:sha(v.request_sha256),input_sha256:sha(v.input_sha256),content_sha256:sha(v.content_sha256),model_versions_sha256:sha(v.model_versions_sha256),owner_governance_revision:governance,owner_epoch:epoch,created_at:date(v.created_at),state:v.state as typeof agentPlanWorkflowRequestStates[number],body_erased,recorded:true as const,replayed:flag(v.replayed)}
})}
export type AgentPlanWorkflowReceipt=ReturnType<typeof parseAgentPlanWorkflowReceipt>
export function parseAgentPlanWorkflowPrepared(raw:unknown){return projection(()=>{
 const v=object(agentPlanWorkflowJsonValue(raw),['protocol','purpose','choice','source_values','messages','input_sha256','content_sha256','model_versions_sha256','owner_user_id','owner_governance_revision','owner_epoch','byte_length','authority'])
 protocol(v,'agent_plan_workflow_prepared_v1')
 const choice=parseAgentPlanWorkflowChoice(v.choice),source_values=sourceValues(v.source_values),rebuilt=prepareAgentPlanWorkflowInput(choice,source_values),gov=revision(v.owner_governance_revision),epoch=revision(v.owner_epoch)
 if(v.authority!==false||gov!==epoch||!same(v.messages,rebuilt.messages)||v.byte_length!==new TextEncoder().encode(canonical(rebuilt.input_value)).length)return bad()
 return {protocol:'agent_plan_workflow_prepared_v1' as const,purpose,choice,source_values,messages:rebuilt.messages,input_sha256:sha(v.input_sha256),content_sha256:sha(v.content_sha256),model_versions_sha256:sha(v.model_versions_sha256),owner_user_id:id(v.owner_user_id),owner_governance_revision:gov,owner_epoch:epoch,byte_length:v.byte_length as number,authority:false as const}
})}
export type AgentPlanWorkflowPrepared=ReturnType<typeof parseAgentPlanWorkflowPrepared>
export function parseAgentPlanWorkflowDispatchProof(raw:unknown){return projection(()=>{
 const v=object(raw,['protocol','purpose','request_id','lease_token','lease_version','worker_id']);protocol(v,'agent_plan_workflow_dispatch_v1')
 return {protocol:'agent_plan_workflow_dispatch_v1' as const,purpose,request_id:id(v.request_id),lease_token:id(v.lease_token),lease_version:revision(v.lease_version),worker_id:id(v.worker_id)}
})}
export type AgentPlanWorkflowDispatchProof=ReturnType<typeof parseAgentPlanWorkflowDispatchProof>
export function parseAgentPlanWorkflowClaim(raw:unknown){return projection(()=>{
 const v=object(raw,['protocol','purpose','request_id','lease_token','lease_version','worker_id','lease_expires_at']),{lease_expires_at,...proof}=v
 return {...parseAgentPlanWorkflowDispatchProof(proof),lease_expires_at:date(lease_expires_at)}
})}
export function parseAgentPlanWorkflowContext(raw:unknown){return projection(()=>{
 const v=object(agentPlanWorkflowJsonValue(raw),['protocol','purpose','identity','owner_user_id','owner_governance_revision','owner_epoch','request_id','request_sha256','choice','prepared']);protocol(v,'agent_plan_workflow_context_v1')
 const identity=object(v.identity,['issuer','subject']),prepared=parseAgentPlanWorkflowPrepared(v.prepared),choice=parseAgentPlanWorkflowChoice(v.choice),request_id=id(v.request_id),owner_user_id=id(v.owner_user_id),gov=revision(v.owner_governance_revision),epoch=revision(v.owner_epoch)
 if(identity.issuer!=='urn:agentstudio:local:v1'||gov!==epoch||owner_user_id!==prepared.owner_user_id||gov!==prepared.owner_governance_revision||epoch!==prepared.owner_epoch||!same(choice,prepared.choice)||request_id===choice.source.spec_id)return bad()
 return {protocol:'agent_plan_workflow_context_v1' as const,purpose,identity:{issuer:'urn:agentstudio:local:v1',subject:text(identity.subject,200,true)},owner_user_id,owner_governance_revision:gov,owner_epoch:epoch,request_id,request_sha256:sha(v.request_sha256),choice,prepared}
})}
export function parseAgentPlanWorkflowReservation(raw:unknown){return projection(()=>{
 const v=object(raw,['protocol','purpose','request_id','effect_id','state','request_sha256','input_sha256','content_sha256','source_sha256']);protocol(v,'agent_plan_workflow_reservation_v1');if(v.state!=='reserved')return bad()
 return {protocol:'agent_plan_workflow_reservation_v1' as const,purpose,request_id:id(v.request_id),effect_id:id(v.effect_id),state:'reserved' as const,request_sha256:sha(v.request_sha256),input_sha256:sha(v.input_sha256),content_sha256:sha(v.content_sha256),source_sha256:sha(v.source_sha256)}
})}
export function parseAgentPlanWorkflowDispatchReply(raw:unknown){return projection(()=>{
 const v=object(raw,['protocol','purpose','request_id','state','result_sha256','completion_sha256']);protocol(v,'agent_plan_workflow_dispatch_reply_v1')
 if(typeof v.state!=='string'||!['succeeded','failed','unknown','paused'].includes(v.state)||v.state==='succeeded'&&(v.result_sha256===null||v.completion_sha256===null)||v.state==='paused'&&(v.result_sha256!==null||v.completion_sha256!==null)||v.state!=='succeeded'&&v.result_sha256!==null||v.state==='failed'&&v.completion_sha256===null)return bad()
 return {protocol:'agent_plan_workflow_dispatch_reply_v1' as const,purpose,request_id:id(v.request_id),state:v.state as 'succeeded'|'failed'|'unknown'|'paused',result_sha256:v.result_sha256===null?null:sha(v.result_sha256),completion_sha256:v.completion_sha256===null?null:sha(v.completion_sha256)}
})}
export function parseAgentPlanWorkflowResultData(raw:unknown){return projection(()=>{
 const v=object(agentPlanWorkflowJsonValue(raw),['protocol','request_id','result_sha256','value']);if(v.protocol!=='agent_plan_workflow_result_data_v1')return bad()
 const value=object(v.value,['protocol','reference','result','authority']);if(value.protocol!=='agent_plan_workflow_result_v1'||value.authority!==false)return bad()
 const parsed=agentPlanWorkflowResultValue(value.reference,value.result),request_id=id(v.request_id);if(request_id!==parsed.reference.request_id)return bad()
 return {protocol:'agent_plan_workflow_result_data_v1' as const,request_id,result_sha256:sha(v.result_sha256),value:parsed}
})}
export type AgentPlanWorkflowResultData=ReturnType<typeof parseAgentPlanWorkflowResultData>
export function parseAgentPlanWorkflowView(raw:unknown){return projection(()=>{
 const v=object(raw,['protocol','receipt','result_status','result']);if(v.protocol!=='agent_plan_workflow_view_v1'||typeof v.result_status!=='string'||!['pending','unknown','unavailable','erased','available','stale'].includes(v.result_status))return bad()
 const receipt=parseAgentPlanWorkflowReceipt(v.receipt),result=v.result===null?null:parseAgentPlanWorkflowResultData(v.result),status=v.result_status as 'pending'|'unknown'|'unavailable'|'erased'|'available'|'stale'
 if((status==='available'||status==='stale')!==(result!==null)||receipt.body_erased!==(status==='erased')||(status==='pending')!==['queued','claimed','reserved'].includes(receipt.state)||(status==='unknown')!==['unknown','paused'].includes(receipt.state))return bad()
 if(result){const ref=result.value.reference;if(receipt.state!=='succeeded'||result.request_id!==receipt.request_id||ref.input_sha256!==receipt.input_sha256||!same(ref.source,receipt.source)||!same(ref.generation_model,receipt.generation_model))return bad()}
 return {protocol:'agent_plan_workflow_view_v1' as const,receipt,result_status:status,result}
})}
export type AgentPlanWorkflowView=ReturnType<typeof parseAgentPlanWorkflowView>
export const agentPlanWorkflowCancelAcknowledgement='APPROVE_EXACT_AGENT_PLAN_WORKFLOW_CANCEL_ONLY_V1' as const
export const agentPlanWorkflowEraseAcknowledgement='APPROVE_EXACT_AGENT_PLAN_WORKFLOW_ERASE_ONLY_V1' as const
export function parseAgentPlanWorkflowControl(raw:unknown){return input(()=>{
 const v=object(raw,['action','request_id','generation_request_id','confirm','acknowledgement']),request_id=id(v.request_id),generation_request_id=id(v.generation_request_id)
 if(request_id===generation_request_id||v.confirm!==true||v.action!=='cancel'&&v.action!=='erase'||v.acknowledgement!==(v.action==='cancel'?agentPlanWorkflowCancelAcknowledgement:agentPlanWorkflowEraseAcknowledgement))return bad()
 return {action:v.action as 'cancel'|'erase',request_id,generation_request_id,confirm:true as const,acknowledgement:v.acknowledgement as typeof agentPlanWorkflowCancelAcknowledgement|typeof agentPlanWorkflowEraseAcknowledgement}
})}
export function parseAgentPlanWorkflowControlReceipt(raw:unknown){return projection(()=>{
 const v=object(raw,['protocol','purpose','request_id','generation_request_id','action','request_sha256','state','created_at','recorded','replayed']);protocol(v,'agent_plan_workflow_control_receipt_v1')
 const request_id=id(v.request_id),generation_request_id=id(v.generation_request_id)
 if(request_id===generation_request_id||v.action!=='cancel'&&v.action!=='erase'||v.recorded!==true||typeof v.state!=='string'||!(v.action==='cancel'?['cancelled','unknown']:['erased']).includes(v.state))return bad()
 return {protocol:'agent_plan_workflow_control_receipt_v1' as const,purpose,request_id,generation_request_id,action:v.action as 'cancel'|'erase',request_sha256:sha(v.request_sha256),state:v.state as 'cancelled'|'unknown'|'erased',created_at:date(v.created_at),recorded:true as const,replayed:flag(v.replayed)}
})}
export function parseAgentPlanWorkflowSavePreviewInput(raw:unknown){return input(()=>{
 const v=object(agentPlanWorkflowJsonValue(raw),['generation_request_id','expected_result_sha256','edits']);const edits=v.edits===null?null:object(v.edits,['name','graph'])
 return {generation_request_id:id(v.generation_request_id),expected_result_sha256:sha(v.expected_result_sha256),edits:edits?{name:text(edits.name,120,true),graph:parseWorkflowGraphV2(edits.graph)}:null}
})}
export function parseAgentPlanWorkflowSavePreview(raw:unknown){return projection(()=>{
 const v=object(agentPlanWorkflowJsonValue(raw),['protocol','purpose','generation_request_id','source','input_sha256','result_sha256','model_versions_sha256','candidate','candidate_sha256','preview_sha256','recorded']);protocol(v,'agent_plan_workflow_save_preview_v1')
 const source=parseAgentPlanWorkflowSource(v.source),generation_request_id=id(v.generation_request_id),candidate=object(v.candidate,['name','graph']);if(v.recorded!==false||generation_request_id===source.spec_id)return bad()
 return {protocol:'agent_plan_workflow_save_preview_v1' as const,purpose,generation_request_id,source,input_sha256:sha(v.input_sha256),result_sha256:sha(v.result_sha256),model_versions_sha256:sha(v.model_versions_sha256),candidate:{name:text(candidate.name,120,true),graph:parseWorkflowGraphV2(candidate.graph)},candidate_sha256:sha(v.candidate_sha256),preview_sha256:sha(v.preview_sha256),recorded:false as const}
})}
export type AgentPlanWorkflowSavePreview=ReturnType<typeof parseAgentPlanWorkflowSavePreview>
export function parseAgentPlanWorkflowSaveReceipt(raw:unknown){return projection(()=>{
 const v=object(raw,['protocol','purpose','request_id','generation_request_id','request_sha256','source','result_sha256','preview_sha256','candidate_sha256','workflow_id','workflow_revision','created_at','recorded','replayed']);protocol(v,'agent_plan_workflow_save_receipt_v1')
 const request_id=id(v.request_id),generation_request_id=id(v.generation_request_id),source=parseAgentPlanWorkflowSource(v.source)
 if(v.recorded!==true||v.workflow_id!==request_id||v.workflow_revision!==1||new Set([request_id,generation_request_id,source.spec_id]).size!==3)return bad()
 return {protocol:'agent_plan_workflow_save_receipt_v1' as const,purpose,request_id,generation_request_id,request_sha256:sha(v.request_sha256),source,result_sha256:sha(v.result_sha256),preview_sha256:sha(v.preview_sha256),candidate_sha256:sha(v.candidate_sha256),workflow_id:request_id,workflow_revision:1 as const,created_at:date(v.created_at),recorded:true as const,replayed:flag(v.replayed)}
})}
