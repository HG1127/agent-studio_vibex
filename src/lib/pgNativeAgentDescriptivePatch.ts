/** Browser-only S1 projection validation; no route, authority or payment grant. */
import {agentGeneratedHash} from "./pgNativeAgentGeneratedAcceptance.ts"
import {agentReviewResult,type PgNativeAgentReviewOptimization} from "./pgNativeAgentReview.ts"

export const agentDescriptivePatchKeys=["goal","task_scope","deliverables","task_plan","done_criteria"] as const
export const agentDescriptivePatchAcknowledgement="APPROVE_EXACT_GENERATED_DESCRIPTIVE_PATCH_V1" as const
type Key=typeof agentDescriptivePatchKeys[number]
export type PgNativeDescriptivePatchTarget={review_id:string;spec_id:string;target_run_id:string}
export type PgNativeDescriptiveFields={goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[]}
type Source=PgNativeDescriptivePatchTarget&{purpose:"optimize";review_request_sha256:string;input_sha256:string;content_sha256:string;result_sha256:string;completion_sha256:string;source_owner_epoch:number;source_protocol:"employee_statement_anchor_v1"}
type Feedback={run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number;feedback_source_sha256:string;statement_sha256:string}
type Anchor={run_id:string;feedback_id:string}
type Version={revision:number;source_sha256:string}
type Revision=Version&{revision_id:string}
export type PgNativeDescriptivePatchPreviewInput=PgNativeDescriptivePatchTarget&{action:"preview"}
export type PgNativeDescriptivePatchAcceptance=PgNativeDescriptivePatchTarget&{action:"accept";request_id:string;anchor_run_id:string;anchor_feedback_id:string;expected_preview_sha256:string;expected_result_sha256:string;expected_patch_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;expected_candidate_sha256:string;confirm:true;acceptance_acknowledgement:typeof agentDescriptivePatchAcknowledgement}
type Common={source_kind:"feedback_generated_descriptive_patch";mode:"provided_fields";source:Source;feedback_sources:Feedback[];feedback_sources_sha256:string;anchor:Anchor;changed_keys:Key[];preview_sha256:string}
export type PgNativeDescriptivePatchPreview=Common&{protocol:"agent_descriptive_patch_preview_v1";before:Version&{descriptive:PgNativeDescriptiveFields};model_patch:{provided_keys:Key[];descriptive:Partial<PgNativeDescriptiveFields>;patch_sha256:string};candidate:{descriptive:PgNativeDescriptiveFields;candidate_sha256:string};recorded:false}
export type PgNativeDescriptivePatchReceipt=Common&{protocol:"agent_descriptive_patch_receipt_v1";request_id:string;request_sha256:string;before:Revision;after:Revision;provided_keys:Key[];patch_sha256:string;candidate_sha256:string;acceptance_owner_epoch:number;created_at:string;receipt_sha256:string;recorded:true;replayed:boolean}
export type PgNativeDescriptivePatchApi={
 previewAgentDescriptivePatch(input:PgNativeDescriptivePatchPreviewInput):Promise<unknown>
 acceptAgentDescriptivePatch(original:PgNativeDescriptivePatchAcceptance):Promise<unknown>
 confirmAgentDescriptivePatch(original:PgNativeDescriptivePatchAcceptance):Promise<unknown>
 getAgentDescriptivePatch(reviewId:string):Promise<unknown>
}
const invalid=():never=>{throw Error("invalid_agent_descriptive_patch_projection")}
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
function unicode(v:string):string{for(const c of v)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalid();return v.includes("\0")?invalid():v}
function detached(raw:unknown,depth=0,budget={n:0}):unknown{
 if(depth>16||++budget.n>10000)return invalid()
 if(raw===null||typeof raw==="boolean")return raw
 if(typeof raw==="string")return unicode(raw)
 if(typeof raw==="number")return Number.isSafeInteger(raw)&&!Object.is(raw,-0)?raw:invalid()
 if(Array.isArray(raw))return array(raw,1000).map(v=>detached(v,depth+1,budget))
 const v=object(raw),copy=Object.create(null) as Record<string,unknown>
 for(const key of Object.keys(v))copy[unicode(key)]=detached(v[key],depth+1,budget)
 return copy
}
export function agentDescriptivePatchCanonical(value:unknown):string{
 const order=(raw:unknown):unknown=>Array.isArray(raw)?raw.map(order):raw&&typeof raw==="object"?Object.fromEntries(Object.entries(raw).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,order(v)])):raw
 return JSON.stringify(order(detached(value)))
}
const H=(raw:unknown)=>agentGeneratedHash(detached(raw))
const id=(raw:unknown):string=>typeof raw==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw)?raw:invalid()
const hash=(raw:unknown):string=>typeof raw==="string"&&/^[a-f0-9]{64}$/.test(raw)?raw:invalid()
const positive=(raw:unknown,max=Number.MAX_SAFE_INTEGER-2):number=>typeof raw==="number"&&Number.isSafeInteger(raw)&&raw>=1&&raw<=max?raw:invalid()
const equal=(a:unknown,b:unknown)=>agentDescriptivePatchCanonical(a)===agentDescriptivePatchCanonical(b)
function text(raw:unknown,max:number,required=false):string{
 if(typeof raw!=="string"||raw.length>max||raw!==raw.trim()||required&&!raw||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(raw))return invalid()
 return unicode(raw)
}
function descriptions(raw:unknown):PgNativeDescriptiveFields{
 const v=object(raw,agentDescriptivePatchKeys),list=(k:string)=>array(v[k],30).map(v=>text(v,500))
 // Inherited owner text is not generated output. The provided patch has its
 // own strict redaction check, separately from these five safe descriptors.
 return {goal:text(v.goal,3000,true),task_scope:text(v.task_scope,4000),deliverables:list("deliverables"),task_plan:list("task_plan"),done_criteria:list("done_criteria")}
}
function patch(raw:unknown):Partial<PgNativeDescriptiveFields>{
 const v=object(detached(raw)),keys=Object.keys(v)
 if(!keys.length||keys.length>5||keys.some(k=>!agentDescriptivePatchKeys.includes(k as Key)))return invalid()
 try{const result=agentReviewResult("optimize",{descriptive:v,tools_note:"",rationale:"Validate provided descriptors"}) as PgNativeAgentReviewOptimization
  if(!equal(result.descriptive,v))return invalid();return result.descriptive
 }catch{return invalid()}
}
const targetKeys=["review_id","spec_id","target_run_id"] as const
export function agentDescriptivePatchTarget(raw:unknown):PgNativeDescriptivePatchTarget{const v=object(raw,targetKeys);return {review_id:id(v.review_id),spec_id:id(v.spec_id),target_run_id:id(v.target_run_id)}}
function request<T>(fn:()=>T):T{try{return fn()}catch{throw Error("invalid_agent_descriptive_patch_request")}}
export function agentDescriptivePatchPreviewInput(raw:unknown):PgNativeDescriptivePatchPreviewInput{return request(()=>{const v=object(raw,["action",...targetKeys]);if(v.action!=="preview")return invalid();return {action:"preview",...agentDescriptivePatchTarget({review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})}})}
const acceptKeys=["action","request_id",...targetKeys,"anchor_run_id","anchor_feedback_id","expected_preview_sha256","expected_result_sha256","expected_patch_sha256","expected_spec_revision","expected_spec_sha256","expected_candidate_sha256","confirm","acceptance_acknowledgement"] as const
export function agentDescriptivePatchAcceptance(raw:unknown):PgNativeDescriptivePatchAcceptance{return request(()=>{
 const v=object(raw,acceptKeys)
 if(v.action!=="accept"||v.confirm!==true||v.acceptance_acknowledgement!==agentDescriptivePatchAcknowledgement)return invalid()
 const target=agentDescriptivePatchTarget({review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id}),request_id=id(v.request_id),anchor_feedback_id=id(v.anchor_feedback_id)
 if(request_id===target.review_id||request_id===anchor_feedback_id)return invalid()
 return {action:"accept",request_id,...target,anchor_run_id:id(v.anchor_run_id),anchor_feedback_id,expected_preview_sha256:hash(v.expected_preview_sha256),expected_result_sha256:hash(v.expected_result_sha256),expected_patch_sha256:hash(v.expected_patch_sha256),expected_spec_revision:positive(v.expected_spec_revision),expected_spec_sha256:hash(v.expected_spec_sha256),expected_candidate_sha256:hash(v.expected_candidate_sha256),confirm:true,acceptance_acknowledgement:agentDescriptivePatchAcknowledgement}
})}
function source(raw:unknown):Source{
 const v=object(raw,["purpose",...targetKeys,"review_request_sha256","input_sha256","content_sha256","result_sha256","completion_sha256","source_owner_epoch","source_protocol"])
 if(v.purpose!=="optimize"||v.source_protocol!=="employee_statement_anchor_v1")return invalid()
 return {purpose:"optimize",...agentDescriptivePatchTarget({review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id}),review_request_sha256:hash(v.review_request_sha256),input_sha256:hash(v.input_sha256),content_sha256:hash(v.content_sha256),result_sha256:hash(v.result_sha256),completion_sha256:hash(v.completion_sha256),source_owner_epoch:positive(v.source_owner_epoch),source_protocol:"employee_statement_anchor_v1"}
}
function feedback(raw:unknown):Feedback[]{
 const refs=array(raw,8).map(raw=>{const v=object(raw,["run_id","feedback_id","feedback_sha256","feedback_revision","feedback_source_sha256","statement_sha256"]);return {run_id:id(v.run_id),feedback_id:id(v.feedback_id),feedback_sha256:hash(v.feedback_sha256),feedback_revision:positive(v.feedback_revision),feedback_source_sha256:hash(v.feedback_source_sha256),statement_sha256:hash(v.statement_sha256)}})
 if(!refs.length||new Set(refs.map(v=>v.run_id)).size!==refs.length||new Set(refs.map(v=>v.feedback_id)).size!==refs.length)return invalid()
 for(let i=1;i<refs.length;i++)if(refs[i-1]!.run_id>=refs[i]!.run_id)return invalid()
 return refs
}
function keys(raw:unknown):Key[]{const values=array(raw,5);if(!values.length||values.some(k=>!agentDescriptivePatchKeys.includes(k as Key)))return invalid();const expected=agentDescriptivePatchKeys.filter(k=>values.includes(k));if(!equal(values,expected))return invalid();return [...expected]}
export const agentDescriptivePatchFeedbackHash=(refs:Feedback[])=>H({protocol:"agent_descriptive_patch_feedback_v1",sources:refs})
export const agentDescriptivePatchModelHash=(raw:unknown)=>{const descriptive=patch(raw);return H({protocol:"agent_descriptive_patch_model_v1",provided_keys:agentDescriptivePatchKeys.filter(k=>Object.hasOwn(descriptive,k)),descriptive})}
async function common(v:Record<string,unknown>,target?:PgNativeDescriptivePatchTarget):Promise<Common>{
 if(v.source_kind!=="feedback_generated_descriptive_patch"||v.mode!=="provided_fields")return invalid()
 const s=source(v.source),refs=feedback(v.feedback_sources),a=object(v.anchor,["run_id","feedback_id"]),anchor={run_id:id(a.run_id),feedback_id:id(a.feedback_id)}
 if(target&&!equal(agentDescriptivePatchTarget(target),{review_id:s.review_id,spec_id:s.spec_id,target_run_id:s.target_run_id})||anchor.run_id!==refs[0]!.run_id||anchor.feedback_id!==refs[0]!.feedback_id||v.feedback_sources_sha256!==await agentDescriptivePatchFeedbackHash(refs))return invalid()
 return {source_kind:"feedback_generated_descriptive_patch",mode:"provided_fields",source:s,feedback_sources:refs,feedback_sources_sha256:hash(v.feedback_sources_sha256),anchor,changed_keys:keys(v.changed_keys),preview_sha256:hash(v.preview_sha256)}
}
const bindingKeys=["source_kind","mode","source","feedback_sources","feedback_sources_sha256","anchor","before","model_patch","candidate","changed_keys"] as const
export async function agentDescriptivePatchPreviewHash(v:PgNativeDescriptivePatchPreview):Promise<string>{
 const raw=object(detached(v),["protocol",...bindingKeys,"preview_sha256","recorded"])
 return H({protocol:"agent_descriptive_patch_preview_binding_v1",...Object.fromEntries(bindingKeys.map(k=>[k,raw[k]]))})
}
export const agentDescriptivePatchRequestHash=(v:PgNativeDescriptivePatchAcceptance)=>H({protocol:"agent_descriptive_patch_accept_intent_v1",...agentDescriptivePatchAcceptance(v)})
const coreKeys=["protocol","source_kind","mode","request_id","request_sha256","source","feedback_sources","feedback_sources_sha256","anchor","before","after","provided_keys","patch_sha256","candidate_sha256","changed_keys","preview_sha256","acceptance_owner_epoch","created_at"] as const
export async function agentDescriptivePatchReceiptHash(v:PgNativeDescriptivePatchReceipt):Promise<string>{
 const raw=object(detached(v),[...coreKeys,"receipt_sha256","recorded","replayed"])
 return H(Object.fromEntries(coreKeys.map(k=>[k,raw[k]])))
}
function projection(raw:unknown,expectedKeys:readonly string[]):Record<string,unknown>{
 const copy=detached(raw)
 if(new TextEncoder().encode(agentDescriptivePatchCanonical(copy)).length>1048576)return invalid()
 return object(copy,expectedKeys)
}
export async function agentDescriptivePatchPreview(raw:unknown,target?:PgNativeDescriptivePatchTarget):Promise<PgNativeDescriptivePatchPreview>{
 const v=projection(raw,["protocol",...bindingKeys,"preview_sha256","recorded"])
 if(v.protocol!=="agent_descriptive_patch_preview_v1"||v.recorded!==false)return invalid()
 const c=await common(v,target),b=object(v.before,["revision","source_sha256","descriptive"]),m=object(v.model_patch,["provided_keys","descriptive","patch_sha256"]),a=object(v.candidate,["descriptive","candidate_sha256"])
 const before=descriptions(b.descriptive),model=patch(m.descriptive),provided_keys=keys(m.provided_keys),candidate=descriptions(a.descriptive)
 if(!equal(provided_keys,agentDescriptivePatchKeys.filter(k=>Object.hasOwn(model,k)))||m.patch_sha256!==await agentDescriptivePatchModelHash(model)||!equal(candidate,{...before,...model})||!equal(c.changed_keys,agentDescriptivePatchKeys.filter(k=>!equal(before[k],candidate[k]))))return invalid()
 const value:PgNativeDescriptivePatchPreview={protocol:"agent_descriptive_patch_preview_v1",...c,before:{revision:positive(b.revision),source_sha256:hash(b.source_sha256),descriptive:before},model_patch:{provided_keys,descriptive:model,patch_sha256:hash(m.patch_sha256)},candidate:{descriptive:candidate,candidate_sha256:hash(a.candidate_sha256)},recorded:false}
 if(await agentDescriptivePatchPreviewHash(value)!==value.preview_sha256)return invalid()
 return value
}
export function agentDescriptivePatchOriginal(raw:PgNativeDescriptivePatchPreview,requestId:string):Readonly<PgNativeDescriptivePatchAcceptance>{
 return request(()=>{
  const p=projection(raw,["protocol",...bindingKeys,"preview_sha256","recorded"])
  if(p.protocol!=="agent_descriptive_patch_preview_v1"||p.source_kind!=="feedback_generated_descriptive_patch"||p.mode!=="provided_fields"||p.recorded!==false)return invalid()
  const s=source(p.source),refs=feedback(p.feedback_sources),a=object(p.anchor,["run_id","feedback_id"]),b=object(p.before,["revision","source_sha256","descriptive"]),m=object(p.model_patch,["provided_keys","descriptive","patch_sha256"]),c=object(p.candidate,["descriptive","candidate_sha256"])
  if(a.run_id!==refs[0]!.run_id||a.feedback_id!==refs[0]!.feedback_id)return invalid()
  const original=agentDescriptivePatchAcceptance({action:"accept",request_id:requestId,review_id:s.review_id,spec_id:s.spec_id,target_run_id:s.target_run_id,anchor_run_id:a.run_id,anchor_feedback_id:a.feedback_id,expected_preview_sha256:p.preview_sha256,expected_result_sha256:s.result_sha256,expected_patch_sha256:m.patch_sha256,expected_spec_revision:b.revision,expected_spec_sha256:b.source_sha256,expected_candidate_sha256:c.candidate_sha256,confirm:true,acceptance_acknowledgement:agentDescriptivePatchAcknowledgement})
  if(refs.some(f=>f.feedback_id===original.request_id))return invalid()
  return Object.freeze(original)
 })
}
function revision(raw:unknown,max=Number.MAX_SAFE_INTEGER-2):Revision{const v=object(raw,["revision","source_sha256","revision_id"]);return {revision:positive(v.revision,max),source_sha256:hash(v.source_sha256),revision_id:id(v.revision_id)}}
export async function agentDescriptivePatchReceipt(raw:unknown,{target,original,replayed}:{target?:PgNativeDescriptivePatchTarget;original?:PgNativeDescriptivePatchAcceptance;replayed?:boolean}={}):Promise<PgNativeDescriptivePatchReceipt>{
 const expectedOriginal=original?agentDescriptivePatchAcceptance(original):undefined
 const v=projection(raw,[...coreKeys,"receipt_sha256","recorded","replayed"])
 if(v.protocol!=="agent_descriptive_patch_receipt_v1"||v.recorded!==true||typeof v.replayed!=="boolean"||replayed!==undefined&&v.replayed!==replayed)return invalid()
 const c=await common(v,target),before=revision(v.before),after=revision(v.after,Number.MAX_SAFE_INTEGER-1),provided_keys=keys(v.provided_keys)
 if(after.revision!==before.revision+1||before.revision_id===after.revision_id||before.source_sha256===after.source_sha256||v.acceptance_owner_epoch!==c.source.source_owner_epoch||c.changed_keys.some(k=>!provided_keys.includes(k)))return invalid()
 if(typeof v.created_at!=="string"||!/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.created_at)||!Number.isFinite(Date.parse(v.created_at))||new Date(v.created_at).toISOString()!==v.created_at)return invalid()
 const value:PgNativeDescriptivePatchReceipt={protocol:"agent_descriptive_patch_receipt_v1",...c,request_id:id(v.request_id),request_sha256:hash(v.request_sha256),before,after,provided_keys,patch_sha256:hash(v.patch_sha256),candidate_sha256:hash(v.candidate_sha256),acceptance_owner_epoch:positive(v.acceptance_owner_epoch),created_at:v.created_at,receipt_sha256:hash(v.receipt_sha256),recorded:true,replayed:v.replayed}
 const intent=agentDescriptivePatchAcceptance({action:"accept",request_id:value.request_id,review_id:c.source.review_id,spec_id:c.source.spec_id,target_run_id:c.source.target_run_id,anchor_run_id:c.anchor.run_id,anchor_feedback_id:c.anchor.feedback_id,expected_preview_sha256:c.preview_sha256,expected_result_sha256:c.source.result_sha256,expected_patch_sha256:value.patch_sha256,expected_spec_revision:before.revision,expected_spec_sha256:before.source_sha256,expected_candidate_sha256:value.candidate_sha256,confirm:true,acceptance_acknowledgement:agentDescriptivePatchAcknowledgement})
 if(c.feedback_sources.some(f=>f.feedback_id===value.request_id)||await agentDescriptivePatchRequestHash(intent)!==value.request_sha256||await agentDescriptivePatchReceiptHash(value)!==value.receipt_sha256||expectedOriginal&&!equal(expectedOriginal,intent))return invalid()
 return value
}
