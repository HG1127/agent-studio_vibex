// S1 pure contract only. Hash/shape coherence is NOT authenticated provenance,
// a grant, a persisted receipt or permission to update a role. Future protected
// SQL must independently establish every source/current-row/history witness.
import {HttpError,isUuid,safeAgentSpec,safeName,type AgentSpecInput} from "./contracts.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {parseAgentOptimizationOutput,parseAgentReviewPreview} from "./agent-review-contract.ts"
import {parseAgentOpinionAnchor,parseAgentOpinionBody} from "./agent-opinion-contract.ts"

export const agentDescriptivePatchKeys=["goal","task_scope","deliverables","task_plan","done_criteria"] as const
export const agentDescriptivePatchFamily="agent_descriptive_patch_v1" as const
export const agentDescriptivePatchAcknowledgement="APPROVE_EXACT_GENERATED_DESCRIPTIVE_PATCH_V1" as const
export type DescriptivePatchKey=typeof agentDescriptivePatchKeys[number]
export type DescriptiveFields=Pick<AgentSpecInput,DescriptivePatchKey>
export type DescriptivePatch=Partial<DescriptiveFields>
export type DescriptivePatchSource={purpose:"optimize";review_id:string;spec_id:string;target_run_id:string;review_request_sha256:string;input_sha256:string;content_sha256:string;result_sha256:string;completion_sha256:string;source_owner_epoch:number;source_protocol:"employee_statement_anchor_v1"}
export type DescriptivePatchFeedback={run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number;feedback_source_sha256:string;statement_sha256:string}
type Anchor={run_id:string;feedback_id:string}
type Version={revision:number;source_sha256:string}
export type DescriptivePatchPreviewInput={action:"preview";review_id:string;spec_id:string;target_run_id:string}
export type DescriptivePatchAcceptance={action:"accept";request_id:string;review_id:string;spec_id:string;target_run_id:string;anchor_run_id:string;anchor_feedback_id:string;expected_preview_sha256:string;expected_result_sha256:string;expected_patch_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;expected_candidate_sha256:string;confirm:true;acceptance_acknowledgement:typeof agentDescriptivePatchAcknowledgement}
export type DescriptivePatchModel={provided_keys:DescriptivePatchKey[];descriptive:DescriptivePatch;patch_sha256:string}
export type DescriptivePatchPreviewBinding={source_kind:"feedback_generated_descriptive_patch";mode:"provided_fields";source:DescriptivePatchSource;feedback_sources:DescriptivePatchFeedback[];feedback_sources_sha256:string;anchor:Anchor;before:Version&{descriptive:DescriptiveFields};model_patch:DescriptivePatchModel;candidate:{descriptive:DescriptiveFields;candidate_sha256:string};changed_keys:DescriptivePatchKey[]}
export type DescriptivePatchPreview=DescriptivePatchPreviewBinding&{protocol:"agent_descriptive_patch_preview_v1";preview_sha256:string;recorded:false}
export type DescriptivePatchReceiptCore={protocol:"agent_descriptive_patch_receipt_v1";source_kind:"feedback_generated_descriptive_patch";mode:"provided_fields";request_id:string;request_sha256:string;source:DescriptivePatchSource;feedback_sources:DescriptivePatchFeedback[];feedback_sources_sha256:string;anchor:Anchor;before:Version&{revision_id:string};after:Version&{revision_id:string};provided_keys:DescriptivePatchKey[];patch_sha256:string;candidate_sha256:string;changed_keys:DescriptivePatchKey[];preview_sha256:string;acceptance_owner_epoch:number;created_at:string}
export type DescriptivePatchReceipt=DescriptivePatchReceiptCore&{receipt_sha256:string;recorded:true;replayed:boolean}
const invalid=():never=>{throw new HttpError(400,"invalid_agent_descriptive_patch_request")}
const unavailable=():never=>{throw new HttpError(409,"agent_descriptive_patch_unavailable")}
const changedRequired=():never=>{throw new HttpError(409,"agent_descriptive_patch_change_required")}
const H=(value:unknown)=>agentMemoryHash(canonicalMcpJson(value))
const id=(raw:unknown):string=>isUuid(raw)&&raw===raw.toLowerCase()?raw:invalid()
const sha=(raw:unknown):string=>typeof raw==="string"&&/^[a-f0-9]{64}$/.test(raw)?raw:invalid()
function positive(raw:unknown,max=Number.MAX_SAFE_INTEGER-2):number{if(typeof raw!=="number"||!Number.isSafeInteger(raw)||raw<1||raw>max)return invalid();return raw}
function stamp(raw:unknown):string{if(typeof raw!=="string"||!/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw)||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString()!==raw)return invalid();return raw}
function unicode(raw:string):boolean{for(const c of raw)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return false;return !raw.includes("\0")}
function object(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=="object"||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
 const own=Reflect.ownKeys(raw)
 if(own.some(k=>typeof k!=="string"||!Object.getOwnPropertyDescriptor(raw,k)?.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value"))||keys&&(own.length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k))))return invalid()
 return raw as Record<string,unknown>
}
function array(raw:unknown,max:number):unknown[]{
 if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return invalid()
 for(let i=0;i<raw.length;i++)if(!Object.getOwnPropertyDescriptor(raw,String(i))?.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return invalid()
 return raw
}
// Detach validated JSON without invoking getters or silently dropping keys.
function json(raw:unknown,depth=0,budget={n:0}):unknown{
 if(depth>16||++budget.n>10000)return invalid()
 if(raw===null||typeof raw==="boolean")return raw
 if(typeof raw==="string")return unicode(raw)?raw:invalid()
 if(typeof raw==="number")return Number.isFinite(raw)&&!Object.is(raw,-0)?raw:invalid()
 if(Array.isArray(raw))return array(raw,1000).map(v=>json(v,depth+1,budget))
 const v=object(raw),copy=Object.create(null) as Record<string,unknown>
 for(const key of Object.keys(v)){if(!unicode(key))return invalid();copy[key]=json(v[key],depth+1,budget)}
 return copy
}
function spec(raw:unknown):AgentSpecInput{
 try{const v=object(json(raw));if(v.require_approval!==true)return invalid();const {require_approval:_,...input}=v,result=safeAgentSpec(input)
  if(canonicalMcpJson(result)!==canonicalMcpJson(v))return invalid();return result
 }catch{return invalid()}
}
function descriptions(raw:unknown):DescriptiveFields{
 const v=object(json(raw),agentDescriptivePatchKeys)
 try{const checked=safeAgentSpec({...v,tools:[],knowledge_base_ids:[]}),result=pick(checked)
  if(canonicalMcpJson(result)!==canonicalMcpJson(v))return invalid();return result
 }catch{return invalid()}
}
function pick(value:AgentSpecInput):DescriptiveFields{return {goal:value.goal,task_scope:value.task_scope,deliverables:[...value.deliverables],task_plan:[...value.task_plan],done_criteria:[...value.done_criteria]}}
function patch(raw:unknown):DescriptivePatch{
 const v=object(json(raw)),keys=Object.keys(v)
 if(!keys.length||keys.length>5||keys.some(k=>!agentDescriptivePatchKeys.includes(k as DescriptivePatchKey)))return invalid()
 try{
  // Validation scaffolding only; these constant advice strings are never
  // treated as model output or put in any result/source hash.
  const normalized=parseAgentOptimizationOutput({descriptive:v,tools_note:"",rationale:"Validate descriptive fields"}).descriptive
  if(canonicalMcpJson(normalized)!==canonicalMcpJson(v))return invalid();return normalized
 }catch{return invalid()}
}
function orderedKeys(raw:unknown):DescriptivePatchKey[]{
 const keys=array(raw,5)
 if(!keys.length||keys.some(k=>typeof k!=="string"||!agentDescriptivePatchKeys.includes(k as DescriptivePatchKey))||canonicalMcpJson(keys)!==canonicalMcpJson(agentDescriptivePatchKeys.filter(k=>keys.includes(k))))return invalid()
 return [...keys] as DescriptivePatchKey[]
}
function changed(before:DescriptiveFields,after:DescriptiveFields):DescriptivePatchKey[]{const keys=agentDescriptivePatchKeys.filter(k=>canonicalMcpJson(before[k])!==canonicalMcpJson(after[k]));if(!keys.length)return changedRequired();return [...keys]}
export function agentDescriptivePatchModelHash(raw:unknown):string{const descriptive=patch(raw),provided_keys=agentDescriptivePatchKeys.filter(k=>Object.hasOwn(descriptive,k));return H({protocol:"agent_descriptive_patch_model_v1",provided_keys,descriptive})}
export function agentDescriptivePatchCandidateHash(name:string,raw:unknown):string{try{if(safeName(name)!==name)return invalid()}catch{return invalid()};return H({protocol:"agent_descriptive_patch_candidate_v1",name,spec:spec(raw)})}
export function deriveAgentDescriptivePatchCandidate(name:string,beforeRaw:unknown,resultRaw:unknown){
 const before=spec(beforeRaw),result=object(json(resultRaw),["descriptive","tools_note","rationale"])
 let normalized:ReturnType<typeof parseAgentOptimizationOutput>
 try{normalized=parseAgentOptimizationOutput(result);if(canonicalMcpJson(normalized)!==canonicalMcpJson(result))return invalid()}catch{return invalid()}
 const supplied=patch(normalized.descriptive),provided_keys=agentDescriptivePatchKeys.filter(k=>Object.hasOwn(supplied,k)),candidate=spec({...before,...supplied})
 const protectedFields=(value:AgentSpecInput)=>Object.fromEntries(Object.entries(value).filter(([k])=>!agentDescriptivePatchKeys.includes(k as DescriptivePatchKey)))
 if(canonicalMcpJson(protectedFields(candidate))!==canonicalMcpJson(protectedFields(before)))return invalid()
 return {spec:candidate,model_patch:{provided_keys:[...provided_keys],descriptive:supplied,patch_sha256:agentDescriptivePatchModelHash(supplied)},changed_keys:changed(pick(before),pick(candidate)),candidate_sha256:agentDescriptivePatchCandidateHash(name,candidate),
  // Internal compatibility digest for an actual055 intent/link, not a v1
  // generated receipt or a synthetic feedback edge. Never exposed in preview.
  optimization_candidate_sha256:H({protocol:"agent_feedback_role_candidate_v1",name,spec:candidate})}
}
const sourceKeys=["purpose","review_id","spec_id","target_run_id","review_request_sha256","input_sha256","content_sha256","result_sha256","completion_sha256","source_owner_epoch","source_protocol"] as const
function source(raw:unknown):DescriptivePatchSource{
 const v=object(raw,sourceKeys)
 if(v.purpose!=="optimize"||v.source_protocol!=="employee_statement_anchor_v1")return invalid()
 return {purpose:v.purpose,review_id:id(v.review_id),spec_id:id(v.spec_id),target_run_id:id(v.target_run_id),review_request_sha256:sha(v.review_request_sha256),input_sha256:sha(v.input_sha256),content_sha256:sha(v.content_sha256),result_sha256:sha(v.result_sha256),completion_sha256:sha(v.completion_sha256),source_owner_epoch:positive(v.source_owner_epoch),source_protocol:v.source_protocol}
}
function feedback(raw:unknown):DescriptivePatchFeedback[]{
 const rows=array(raw,8).map(value=>{const v=object(value,["run_id","feedback_id","feedback_sha256","feedback_revision","feedback_source_sha256","statement_sha256"]);return {run_id:id(v.run_id),feedback_id:id(v.feedback_id),feedback_sha256:sha(v.feedback_sha256),feedback_revision:positive(v.feedback_revision),feedback_source_sha256:sha(v.feedback_source_sha256),statement_sha256:sha(v.statement_sha256)}})
 if(!rows.length||new Set(rows.map(v=>v.run_id)).size!==rows.length||new Set(rows.map(v=>v.feedback_id)).size!==rows.length)return invalid()
 for(let i=1;i<rows.length;i++)if(rows[i-1]!.run_id>=rows[i]!.run_id)return invalid()
 return rows
}
export function agentDescriptivePatchFeedbackHash(raw:unknown):string{return H({protocol:"agent_descriptive_patch_feedback_v1",sources:feedback(json(raw))})}
function anchor(raw:unknown,refs:DescriptivePatchFeedback[]):Anchor{const v=object(raw,["run_id","feedback_id"]);if(v.run_id!==refs[0]!.run_id||v.feedback_id!==refs[0]!.feedback_id)return invalid();return {run_id:id(v.run_id),feedback_id:id(v.feedback_id)}}
const bindingKeys=["source_kind","mode","source","feedback_sources","feedback_sources_sha256","anchor","before","model_patch","candidate","changed_keys"] as const
function binding(raw:unknown):DescriptivePatchPreviewBinding{
 const v=object(json(raw),bindingKeys),s=source(v.source),refs=feedback(v.feedback_sources),b=object(v.before,["revision","source_sha256","descriptive"]),m=object(v.model_patch,["provided_keys","descriptive","patch_sha256"]),c=object(v.candidate,["descriptive","candidate_sha256"])
 if(v.source_kind!=="feedback_generated_descriptive_patch"||v.mode!=="provided_fields")return invalid()
 const before=descriptions(b.descriptive),model=patch(m.descriptive),provided_keys=orderedKeys(m.provided_keys),candidate=descriptions(c.descriptive),changed_keys=orderedKeys(v.changed_keys)
 if(canonicalMcpJson(provided_keys)!==canonicalMcpJson(agentDescriptivePatchKeys.filter(k=>Object.hasOwn(model,k)))||m.patch_sha256!==agentDescriptivePatchModelHash(model)||v.feedback_sources_sha256!==agentDescriptivePatchFeedbackHash(refs)||canonicalMcpJson(candidate)!==canonicalMcpJson({...before,...model})||canonicalMcpJson(changed_keys)!==canonicalMcpJson(changed(before,candidate)))return invalid()
 return {source_kind:v.source_kind,mode:v.mode,source:s,feedback_sources:refs,feedback_sources_sha256:sha(v.feedback_sources_sha256),anchor:anchor(v.anchor,refs),before:{revision:positive(b.revision),source_sha256:sha(b.source_sha256),descriptive:before},model_patch:{provided_keys,descriptive:model,patch_sha256:sha(m.patch_sha256)},candidate:{descriptive:candidate,candidate_sha256:sha(c.candidate_sha256)},changed_keys}
}
export function parseAgentDescriptivePatchPreviewInput(raw:unknown):DescriptivePatchPreviewInput{const v=object(raw,["action","review_id","spec_id","target_run_id"]);if(v.action!=="preview")return invalid();return {action:v.action,review_id:id(v.review_id),spec_id:id(v.spec_id),target_run_id:id(v.target_run_id)}}
export function agentDescriptivePatchPreviewHash(raw:unknown):string{return H({protocol:"agent_descriptive_patch_preview_binding_v1",...binding(raw)})}
export function parseAgentDescriptivePatchPreview(raw:unknown,expected?:DescriptivePatchPreviewInput):DescriptivePatchPreview{
 try{const v=object(raw,["protocol",...bindingKeys,"preview_sha256","recorded"]);if(v.protocol!=="agent_descriptive_patch_preview_v1"||v.recorded!==false)return unavailable()
  const value=binding(Object.fromEntries(bindingKeys.map(k=>[k,v[k]])))
  if(v.preview_sha256!==agentDescriptivePatchPreviewHash(value))return unavailable()
  if(expected){const q=parseAgentDescriptivePatchPreviewInput(expected);if(q.review_id!==value.source.review_id||q.spec_id!==value.source.spec_id||q.target_run_id!==value.source.target_run_id)return unavailable()}
  return {protocol:v.protocol,...value,preview_sha256:sha(v.preview_sha256),recorded:false}
 }catch{return unavailable()}
}
/** Caller must obtain these internal inputs from real same-client locked SQL.
 * This only checks their coherence and builds an explicitly unrecorded DTO.
 * Source/content/spec/completion hashes remain opaque protected-row witnesses;
 * the058 DTO does not expose effect_id needed to recompute057 completion. */
export function createAgentDescriptivePatchPreview(raw:unknown):DescriptivePatchPreview{
 try{
  const v=object(json(raw),["anchor","body","role","feedback_sources","current"]),a=parseAgentOpinionAnchor(v.anchor),body=parseAgentOpinionBody(v.body),r=object(v.role,["id","name","spec","revision","source_sha256","requires_approval"]),current=object(v.current,["owner_epoch","source_protocol","input_sha256","content_sha256","choice"])
  if(a.purpose!=="optimize"||a.source_protocol!=="employee_statement_anchor_v1"||a.job_state!=="pending"||a.body_erased||a.lease_state!=="succeeded"||a.outcome?.status!=="succeeded"||!a.choice||a.choice.evaluation_sources.length||!a.choice.feedback_sources.length||r.requires_approval!==true)return unavailable()
  const choice=parseAgentReviewPreview(current.choice),refs=feedback(v.feedback_sources),beforeSpec=spec(r.spec)
  if(positive(current.owner_epoch)!==a.owner_epoch||current.source_protocol!==a.source_protocol||current.input_sha256!==a.input_sha256||current.content_sha256!==a.content_sha256||canonicalMcpJson(choice)!==canonicalMcpJson(a.choice)||id(r.id)!==a.spec_id||positive(r.revision)!==choice.expected_spec_revision||sha(r.source_sha256)!==choice.expected_spec_sha256||body.request_id!==a.request_id||body.purpose!=="optimize"||body.input_sha256!==a.input_sha256||body.result_sha256!==a.outcome.result_sha256)return unavailable()
  const triples=refs.map(({run_id,feedback_id,feedback_sha256})=>({run_id,feedback_id,feedback_sha256})),chosen=[...choice.feedback_sources].sort((x,y)=>x.run_id<y.run_id?-1:x.run_id>y.run_id?1:0)
  if(canonicalMcpJson(triples)!==canonicalMcpJson(chosen)||typeof r.name!=="string")return unavailable()
  const derived=deriveAgentDescriptivePatchCandidate(r.name,beforeSpec,body.result),s:DescriptivePatchSource={purpose:"optimize",review_id:a.request_id,spec_id:a.spec_id,target_run_id:a.run_id,review_request_sha256:a.request_sha256,input_sha256:a.input_sha256,content_sha256:a.content_sha256,result_sha256:body.result_sha256,completion_sha256:a.outcome.completion_sha256,source_owner_epoch:a.owner_epoch,source_protocol:a.source_protocol}
  const value:DescriptivePatchPreviewBinding={source_kind:"feedback_generated_descriptive_patch",mode:"provided_fields",source:s,feedback_sources:refs,feedback_sources_sha256:agentDescriptivePatchFeedbackHash(refs),anchor:{run_id:refs[0]!.run_id,feedback_id:refs[0]!.feedback_id},before:{revision:positive(r.revision),source_sha256:sha(r.source_sha256),descriptive:pick(beforeSpec)},model_patch:derived.model_patch,candidate:{descriptive:pick(derived.spec),candidate_sha256:derived.candidate_sha256},changed_keys:derived.changed_keys}
  return parseAgentDescriptivePatchPreview({protocol:"agent_descriptive_patch_preview_v1",...value,preview_sha256:agentDescriptivePatchPreviewHash(value),recorded:false})
 }catch(error){if(error instanceof HttpError&&error.code==="agent_descriptive_patch_change_required")throw error;return unavailable()}
}
const acceptanceKeys=["action","request_id","review_id","spec_id","target_run_id","anchor_run_id","anchor_feedback_id","expected_preview_sha256","expected_result_sha256","expected_patch_sha256","expected_spec_revision","expected_spec_sha256","expected_candidate_sha256","confirm","acceptance_acknowledgement"] as const
export function parseAgentDescriptivePatchAcceptance(raw:unknown):DescriptivePatchAcceptance{
 const v=object(raw,acceptanceKeys)
 if(v.action!=="accept"||v.confirm!==true||v.acceptance_acknowledgement!==agentDescriptivePatchAcknowledgement)return invalid()
 const request_id=id(v.request_id),review_id=id(v.review_id),anchor_feedback_id=id(v.anchor_feedback_id);if(request_id===review_id||request_id===anchor_feedback_id)return invalid()
 return {action:v.action,request_id,review_id,spec_id:id(v.spec_id),target_run_id:id(v.target_run_id),anchor_run_id:id(v.anchor_run_id),anchor_feedback_id,expected_preview_sha256:sha(v.expected_preview_sha256),expected_result_sha256:sha(v.expected_result_sha256),expected_patch_sha256:sha(v.expected_patch_sha256),expected_spec_revision:positive(v.expected_spec_revision),expected_spec_sha256:sha(v.expected_spec_sha256),expected_candidate_sha256:sha(v.expected_candidate_sha256),confirm:true,acceptance_acknowledgement:agentDescriptivePatchAcknowledgement}
}
export function freezeAgentDescriptivePatchOriginal(raw:unknown):Readonly<DescriptivePatchAcceptance>{return Object.freeze(parseAgentDescriptivePatchAcceptance(raw))}
export function agentDescriptivePatchRequestHash(raw:unknown):string{return H({protocol:"agent_descriptive_patch_accept_intent_v1",...parseAgentDescriptivePatchAcceptance(raw)})}
const receiptKeys=["protocol","source_kind","mode","request_id","request_sha256","source","feedback_sources","feedback_sources_sha256","anchor","before","after","provided_keys","patch_sha256","candidate_sha256","changed_keys","preview_sha256","acceptance_owner_epoch","created_at"] as const
function receiptCore(raw:unknown):DescriptivePatchReceiptCore{
 const v=object(json(raw),receiptKeys),s=source(v.source),refs=feedback(v.feedback_sources),b=object(v.before,["revision","source_sha256","revision_id"]),a=object(v.after,["revision","source_sha256","revision_id"]),provided_keys=orderedKeys(v.provided_keys),changed_keys=orderedKeys(v.changed_keys),request_id=id(v.request_id),before=positive(b.revision),after=positive(a.revision,Number.MAX_SAFE_INTEGER-1)
 if(v.protocol!=="agent_descriptive_patch_receipt_v1"||v.source_kind!=="feedback_generated_descriptive_patch"||v.mode!=="provided_fields"||v.feedback_sources_sha256!==agentDescriptivePatchFeedbackHash(refs)||after!==before+1||v.acceptance_owner_epoch!==s.source_owner_epoch||b.revision_id===a.revision_id||b.source_sha256===a.source_sha256||request_id===s.review_id||refs.some(f=>f.feedback_id===request_id)||changed_keys.some(k=>!provided_keys.includes(k)))return invalid()
 return {protocol:v.protocol,source_kind:v.source_kind,mode:v.mode,request_id,request_sha256:sha(v.request_sha256),source:s,feedback_sources:refs,feedback_sources_sha256:sha(v.feedback_sources_sha256),anchor:anchor(v.anchor,refs),before:{revision:before,source_sha256:sha(b.source_sha256),revision_id:id(b.revision_id)},after:{revision:after,source_sha256:sha(a.source_sha256),revision_id:id(a.revision_id)},provided_keys,patch_sha256:sha(v.patch_sha256),candidate_sha256:sha(v.candidate_sha256),changed_keys,preview_sha256:sha(v.preview_sha256),acceptance_owner_epoch:positive(v.acceptance_owner_epoch),created_at:stamp(v.created_at)}
}
/** Hash of metadata only. It does not authenticate that an SQL event exists. */
export function agentDescriptivePatchReceiptHash(raw:unknown):string{return H(receiptCore(raw))}
export function parseAgentDescriptivePatchReceipt(raw:unknown,expected?:DescriptivePatchAcceptance):DescriptivePatchReceipt{
 try{const v=object(raw,[...receiptKeys,"receipt_sha256","recorded","replayed"]);if(v.recorded!==true||typeof v.replayed!=="boolean")return unavailable()
  const core=receiptCore(Object.fromEntries(receiptKeys.map(k=>[k,v[k]])))
  if(v.receipt_sha256!==agentDescriptivePatchReceiptHash(core))return unavailable()
  if(expected){const q=parseAgentDescriptivePatchAcceptance(expected);if(core.request_id!==q.request_id||core.request_sha256!==agentDescriptivePatchRequestHash(q)||core.source.review_id!==q.review_id||core.source.spec_id!==q.spec_id||core.source.target_run_id!==q.target_run_id||core.anchor.run_id!==q.anchor_run_id||core.anchor.feedback_id!==q.anchor_feedback_id||core.before.revision!==q.expected_spec_revision||core.before.source_sha256!==q.expected_spec_sha256||core.source.result_sha256!==q.expected_result_sha256||core.patch_sha256!==q.expected_patch_sha256||core.candidate_sha256!==q.expected_candidate_sha256||core.preview_sha256!==q.expected_preview_sha256)return unavailable()}
  return {...core,receipt_sha256:sha(v.receipt_sha256),recorded:true,replayed:v.replayed}
 }catch{return unavailable()}
}
