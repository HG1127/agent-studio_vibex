// Node-only synchronous, closed metadata/configuration contract. Neither a
// paid review intent nor current source/resource authority is supplied here.
import {HttpError,isUuid,type AgentSpecInput} from "./contracts.ts"
import {parseAgentOptimizationOutput} from "./agent-review-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"

export const agentGeneratedDescriptiveKeys=["goal","task_scope","deliverables","task_plan","done_criteria"] as const
export const agentGeneratedAcknowledgement="APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1" as const
export type AgentGeneratedDescriptive={goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[]}
export type AgentGeneratedSource={review_id:string;spec_id:string;target_run_id:string;review_request_sha256:string;input_sha256:string;content_sha256:string;result_sha256:string;completion_sha256:string;source_owner_epoch:number;source_protocol:"employee_statement_anchor_v1"}
export type AgentGeneratedFeedback={run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number;feedback_source_sha256:string;statement_sha256:string}
export type AgentGeneratedPreviewInput={action:"preview";review_id:string;spec_id:string;target_run_id:string}
export type AgentGeneratedAcceptance={action:"accept";request_id:string;review_id:string;spec_id:string;target_run_id:string;anchor_run_id:string;anchor_feedback_id:string;expected_preview_sha256:string;expected_result_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;expected_candidate_sha256:string;confirm:true;acceptance_acknowledgement:typeof agentGeneratedAcknowledgement}
type Anchor={run_id:string;feedback_id:string}
type Version={revision:number;source_sha256:string}
export type AgentGeneratedPreviewBinding={source:AgentGeneratedSource;feedback_sources:AgentGeneratedFeedback[];feedback_sources_sha256:string;anchor:Anchor;before:Version&{descriptive:AgentGeneratedDescriptive};candidate:{descriptive:AgentGeneratedDescriptive;candidate_sha256:string};changed_keys:string[]}
export type AgentGeneratedPreview=AgentGeneratedPreviewBinding&{protocol:"agent_generated_preview_v1";preview_sha256:string;recorded:false}
export type AgentGeneratedReceiptCore={protocol:"agent_generated_acceptance_receipt_v1";source_kind:"generated_opinion";request_id:string;request_sha256:string;source:AgentGeneratedSource;feedback_sources:AgentGeneratedFeedback[];feedback_sources_sha256:string;anchor:Anchor;before:Version&{revision_id:string};after:Version&{revision_id:string};candidate_sha256:string;changed_keys:string[];preview_sha256:string;acceptance_owner_epoch:number;created_at:string}
export type AgentGeneratedReceipt=AgentGeneratedReceiptCore&{receipt_sha256:string;recorded:true;replayed:boolean}

const invalid=():never=>{throw new HttpError(400,"invalid_agent_generated_request")}
const unavailable=():never=>{throw new HttpError(409,"agent_generated_unavailable")}
const H=(v:unknown)=>agentMemoryHash(canonicalMcpJson(v))
function object(raw:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const v=raw as Record<string,unknown>
  if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},"value")))return invalid()
  return v
}
function array(raw:unknown,max:number):unknown[]{
  if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return invalid()
  for(let i=0;i<raw.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return invalid()
  return raw
}
const id=(v:unknown):string=>isUuid(v)&&v===v.toLowerCase()?v:invalid()
const sha=(v:unknown):string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)?v:invalid()
function positive(v:unknown,max=Number.MAX_SAFE_INTEGER-2):number{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<1||v>max)return invalid();return v}
function date(v:unknown):string{if(typeof v!=="string"||!/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)return invalid();return v}
function descriptive(raw:unknown):AgentGeneratedDescriptive{
  const v=object(raw,agentGeneratedDescriptiveKeys)
  const strings:unknown[]=[v.goal,v.task_scope]
  for(const k of ["deliverables","task_plan","done_criteria"])strings.push(...array(v[k],30))
  for(const value of strings){
    if(typeof value!=="string"||value.includes("\0"))return invalid()
    for(const character of value){const point=character.codePointAt(0)!;if(point>=0xd800&&point<=0xdfff)return invalid()}
  }
  // Reuse the frozen strict normalized text/list validator only. The constant
  // advice fields are validation scaffolding, never a claimed model result.
  const result=parseAgentOptimizationOutput({descriptive:raw,tools_note:"",rationale:"Descriptor validation"}).descriptive
  if(canonicalMcpJson(result)!==canonicalMcpJson(raw))return invalid()
  return result as AgentGeneratedDescriptive
}
export function parseAgentGeneratedSource(raw:unknown):AgentGeneratedSource{
  const v=object(raw,["review_id","spec_id","target_run_id","review_request_sha256","input_sha256","content_sha256","result_sha256","completion_sha256","source_owner_epoch","source_protocol"])
  if(v.source_protocol!=="employee_statement_anchor_v1")return invalid()
  return {review_id:id(v.review_id),spec_id:id(v.spec_id),target_run_id:id(v.target_run_id),review_request_sha256:sha(v.review_request_sha256),input_sha256:sha(v.input_sha256),content_sha256:sha(v.content_sha256),result_sha256:sha(v.result_sha256),completion_sha256:sha(v.completion_sha256),source_owner_epoch:positive(v.source_owner_epoch),source_protocol:v.source_protocol}
}
export function parseAgentGeneratedFeedback(raw:unknown):AgentGeneratedFeedback{
  const v=object(raw,["run_id","feedback_id","feedback_sha256","feedback_revision","feedback_source_sha256","statement_sha256"])
  return {run_id:id(v.run_id),feedback_id:id(v.feedback_id),feedback_sha256:sha(v.feedback_sha256),feedback_revision:positive(v.feedback_revision),feedback_source_sha256:sha(v.feedback_source_sha256),statement_sha256:sha(v.statement_sha256)}
}
function feedback(raw:unknown):AgentGeneratedFeedback[]{
  const refs=array(raw,8).map(parseAgentGeneratedFeedback),runs=new Set<string>(),ids=new Set<string>()
  if(!refs.length)return invalid()
  for(let i=0;i<refs.length;i++){
    const v=refs[i]!,previous=refs[i-1]
    if(runs.has(v.run_id)||ids.has(v.feedback_id)||previous&&(v.run_id<previous.run_id||v.run_id===previous.run_id&&v.feedback_id<=previous.feedback_id))return invalid()
    runs.add(v.run_id);ids.add(v.feedback_id)
  }
  return refs
}
export function agentGeneratedFeedbackHash(raw:readonly AgentGeneratedFeedback[]):string{return H({protocol:"agent_generated_feedback_set_v1",sources:feedback(raw)})}
function anchor(raw:unknown,refs:AgentGeneratedFeedback[]):Anchor{const v=object(raw,["run_id","feedback_id"]);if(v.run_id!==refs[0]!.run_id||v.feedback_id!==refs[0]!.feedback_id)return invalid();return {run_id:id(v.run_id),feedback_id:id(v.feedback_id)}}
function changed(raw:unknown):string[]{
  const values=array(raw,5)
  if(!values.length||values.some(v=>typeof v!=="string"||!agentGeneratedDescriptiveKeys.includes(v as typeof agentGeneratedDescriptiveKeys[number]))||canonicalMcpJson(values)!==canonicalMcpJson(agentGeneratedDescriptiveKeys.filter(k=>values.includes(k))))return invalid()
  return [...values] as string[]
}
export function agentGeneratedChangedKeys(before:AgentGeneratedDescriptive,after:AgentGeneratedDescriptive):string[]{
  const a=descriptive(before),b=descriptive(after),keys=agentGeneratedDescriptiveKeys.filter(k=>canonicalMcpJson(a[k])!==canonicalMcpJson(b[k]))
  if(!keys.length)throw new HttpError(409,"agent_generated_change_required")
  return [...keys]
}
export function agentGeneratedCandidateHash(name:string,spec:AgentSpecInput):string{return H({protocol:"agent_feedback_role_candidate_v1",name,spec})}
export function parseAgentGeneratedPreviewInput(raw:unknown):AgentGeneratedPreviewInput{
  const v=object(raw,["action","review_id","spec_id","target_run_id"]);if(v.action!=="preview")return invalid()
  return {action:"preview",review_id:id(v.review_id),spec_id:id(v.spec_id),target_run_id:id(v.target_run_id)}
}
const acceptKeys=["action","request_id","review_id","spec_id","target_run_id","anchor_run_id","anchor_feedback_id","expected_preview_sha256","expected_result_sha256","expected_spec_revision","expected_spec_sha256","expected_candidate_sha256","confirm","acceptance_acknowledgement"] as const
export function parseAgentGeneratedAcceptance(raw:unknown):AgentGeneratedAcceptance{
  const v=object(raw,acceptKeys)
  if(v.action!=="accept"||v.confirm!==true||v.acceptance_acknowledgement!==agentGeneratedAcknowledgement)return invalid()
  const request_id=id(v.request_id),review_id=id(v.review_id),anchor_feedback_id=id(v.anchor_feedback_id)
  if(request_id===review_id||request_id===anchor_feedback_id)return invalid()
  return {action:"accept",request_id,review_id,spec_id:id(v.spec_id),target_run_id:id(v.target_run_id),anchor_run_id:id(v.anchor_run_id),anchor_feedback_id,expected_preview_sha256:sha(v.expected_preview_sha256),expected_result_sha256:sha(v.expected_result_sha256),expected_spec_revision:positive(v.expected_spec_revision),expected_spec_sha256:sha(v.expected_spec_sha256),expected_candidate_sha256:sha(v.expected_candidate_sha256),confirm:true,acceptance_acknowledgement:agentGeneratedAcknowledgement}
}
export function agentGeneratedRequestHash(raw:AgentGeneratedAcceptance):string{return H({protocol:"agent_generated_accept_intent_v1",...parseAgentGeneratedAcceptance(raw)})}
function previewBinding(raw:unknown):AgentGeneratedPreviewBinding{
  const v=object(raw,["source","feedback_sources","feedback_sources_sha256","anchor","before","candidate","changed_keys"]),source=parseAgentGeneratedSource(v.source),refs=feedback(v.feedback_sources),before=object(v.before,["revision","source_sha256","descriptive"]),candidate=object(v.candidate,["descriptive","candidate_sha256"]),beforeDescription=descriptive(before.descriptive),candidateDescription=descriptive(candidate.descriptive),keys=changed(v.changed_keys)
  if(v.feedback_sources_sha256!==agentGeneratedFeedbackHash(refs)||canonicalMcpJson(keys)!==canonicalMcpJson(agentGeneratedChangedKeys(beforeDescription,candidateDescription)))return invalid()
  return {source,feedback_sources:refs,feedback_sources_sha256:sha(v.feedback_sources_sha256),anchor:anchor(v.anchor,refs),before:{revision:positive(before.revision),source_sha256:sha(before.source_sha256),descriptive:beforeDescription},candidate:{descriptive:candidateDescription,candidate_sha256:sha(candidate.candidate_sha256)},changed_keys:keys}
}
export function agentGeneratedPreviewHash(raw:AgentGeneratedPreviewBinding):string{return H({protocol:"agent_generated_preview_binding_v1",...previewBinding(raw)})}
export function parseAgentGeneratedPreview(raw:unknown,expected?:AgentGeneratedPreviewInput):AgentGeneratedPreview{
  try{
    const v=object(raw,["protocol","source","feedback_sources","feedback_sources_sha256","anchor","before","candidate","changed_keys","preview_sha256","recorded"])
    if(v.protocol!=="agent_generated_preview_v1"||v.recorded!==false)return unavailable()
    const binding=previewBinding({source:v.source,feedback_sources:v.feedback_sources,feedback_sources_sha256:v.feedback_sources_sha256,anchor:v.anchor,before:v.before,candidate:v.candidate,changed_keys:v.changed_keys})
    if(v.preview_sha256!==agentGeneratedPreviewHash(binding))return unavailable()
    if(expected){const q=parseAgentGeneratedPreviewInput(expected);if(q.review_id!==binding.source.review_id||q.spec_id!==binding.source.spec_id||q.target_run_id!==binding.source.target_run_id)return unavailable()}
    return {protocol:"agent_generated_preview_v1",...binding,preview_sha256:sha(v.preview_sha256),recorded:false}
  }catch{return unavailable()}
}
const receiptKeys=["protocol","source_kind","request_id","request_sha256","source","feedback_sources","feedback_sources_sha256","anchor","before","after","candidate_sha256","changed_keys","preview_sha256","acceptance_owner_epoch","created_at"] as const
function receiptCore(raw:unknown):AgentGeneratedReceiptCore{
  const v=object(raw,receiptKeys),source=parseAgentGeneratedSource(v.source),refs=feedback(v.feedback_sources),before=object(v.before,["revision","source_sha256","revision_id"]),after=object(v.after,["revision","source_sha256","revision_id"])
  const beforeRevision=positive(before.revision),afterRevision=positive(after.revision,Number.MAX_SAFE_INTEGER-1),request_id=id(v.request_id)
  if(v.protocol!=="agent_generated_acceptance_receipt_v1"||v.source_kind!=="generated_opinion"||v.feedback_sources_sha256!==agentGeneratedFeedbackHash(refs)||afterRevision!==beforeRevision+1||v.acceptance_owner_epoch!==source.source_owner_epoch||request_id===source.review_id||refs.some(r=>r.feedback_id===request_id)||before.revision_id===after.revision_id||before.source_sha256===after.source_sha256)return invalid()
  return {protocol:v.protocol,source_kind:v.source_kind,request_id,request_sha256:sha(v.request_sha256),source,feedback_sources:refs,feedback_sources_sha256:sha(v.feedback_sources_sha256),anchor:anchor(v.anchor,refs),before:{revision:beforeRevision,source_sha256:sha(before.source_sha256),revision_id:id(before.revision_id)},after:{revision:afterRevision,source_sha256:sha(after.source_sha256),revision_id:id(after.revision_id)},candidate_sha256:sha(v.candidate_sha256),changed_keys:changed(v.changed_keys),preview_sha256:sha(v.preview_sha256),acceptance_owner_epoch:positive(v.acceptance_owner_epoch),created_at:date(v.created_at)}
}
export function agentGeneratedReceiptHash(raw:AgentGeneratedReceiptCore):string{return H(receiptCore(raw))}
export function parseAgentGeneratedReceipt(raw:unknown,expected?:AgentGeneratedAcceptance):AgentGeneratedReceipt{
  try{
    const v=object(raw,[...receiptKeys,"receipt_sha256","recorded","replayed"])
    if(v.recorded!==true||typeof v.replayed!=="boolean")return unavailable()
    const core=receiptCore(Object.fromEntries(receiptKeys.map(k=>[k,v[k]])))
    if(v.receipt_sha256!==agentGeneratedReceiptHash(core))return unavailable()
    if(expected){
      const q=parseAgentGeneratedAcceptance(expected)
      if(core.request_id!==q.request_id||core.request_sha256!==agentGeneratedRequestHash(q)||core.source.review_id!==q.review_id||core.source.spec_id!==q.spec_id||core.source.target_run_id!==q.target_run_id||core.anchor.run_id!==q.anchor_run_id||core.anchor.feedback_id!==q.anchor_feedback_id||core.preview_sha256!==q.expected_preview_sha256||core.source.result_sha256!==q.expected_result_sha256||core.before.revision!==q.expected_spec_revision||core.before.source_sha256!==q.expected_spec_sha256||core.candidate_sha256!==q.expected_candidate_sha256)return unavailable()
    }
    return {...core,receipt_sha256:sha(v.receipt_sha256),recorded:true,replayed:v.replayed}
  }catch{return unavailable()}
}
