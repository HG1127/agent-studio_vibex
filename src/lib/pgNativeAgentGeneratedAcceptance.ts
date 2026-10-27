/** Browser-only generated configuration consent. Never imports Node or server code. */
export const agentGeneratedDescriptiveKeys=["goal","task_scope","deliverables","task_plan","done_criteria"] as const
export const agentGeneratedAcknowledgement="APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1" as const
type Key=typeof agentGeneratedDescriptiveKeys[number]
export type PgNativeAgentGeneratedTarget={review_id:string;spec_id:string;target_run_id:string}
export type PgNativeAgentGeneratedDescriptive={goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[]}
export type PgNativeAgentGeneratedSource=PgNativeAgentGeneratedTarget&{review_request_sha256:string;input_sha256:string;content_sha256:string;result_sha256:string;completion_sha256:string;source_owner_epoch:number;source_protocol:"employee_statement_anchor_v1"}
export type PgNativeAgentGeneratedFeedback={run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number;feedback_source_sha256:string;statement_sha256:string}
export type PgNativeAgentGeneratedPreviewInput=PgNativeAgentGeneratedTarget&{action:"preview"}
export type PgNativeAgentGeneratedAcceptance=PgNativeAgentGeneratedTarget&{action:"accept";request_id:string;anchor_run_id:string;anchor_feedback_id:string;expected_preview_sha256:string;expected_result_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;expected_candidate_sha256:string;confirm:true;acceptance_acknowledgement:typeof agentGeneratedAcknowledgement}
type Anchor={run_id:string;feedback_id:string}
type Common={source:PgNativeAgentGeneratedSource;feedback_sources:PgNativeAgentGeneratedFeedback[];feedback_sources_sha256:string;anchor:Anchor;changed_keys:Key[];preview_sha256:string}
export type PgNativeAgentGeneratedPreview=Common&{protocol:"agent_generated_preview_v1";before:{revision:number;source_sha256:string;descriptive:PgNativeAgentGeneratedDescriptive};candidate:{descriptive:PgNativeAgentGeneratedDescriptive;candidate_sha256:string};recorded:false}
type Revision={revision:number;source_sha256:string;revision_id:string}
export type PgNativeAgentGeneratedReceipt=Common&{protocol:"agent_generated_acceptance_receipt_v1";source_kind:"generated_opinion";request_id:string;request_sha256:string;before:Revision;after:Revision;candidate_sha256:string;acceptance_owner_epoch:number;created_at:string;receipt_sha256:string;recorded:true;replayed:boolean}
export type PgNativeAgentGeneratedAcceptanceApi={
  previewAgentGeneratedAcceptance:(input:PgNativeAgentGeneratedPreviewInput)=>Promise<unknown>
  acceptAgentGeneratedAcceptance:(original:PgNativeAgentGeneratedAcceptance)=>Promise<unknown>
  confirmAgentGeneratedAcceptance:(original:PgNativeAgentGeneratedAcceptance)=>Promise<unknown>
  getAgentGeneratedAcceptance:(reviewId:string)=>Promise<unknown>
}
const invalid=():never=>{throw Error("invalid_agent_generated_projection")}
function object(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const own=Reflect.ownKeys(raw)
  if(own.some(k=>typeof k!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value"))||keys&&(own.length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k))))return invalid()
  return raw as Record<string,unknown>
}
function array(raw:unknown,max:number):unknown[]{
  if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return invalid()
  for(let i=0;i<raw.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return invalid()
  return raw
}
const id=(v:unknown):string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)?v:invalid()
const hash=(v:unknown):string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)?v:invalid()
const positive=(v:unknown,max=Number.MAX_SAFE_INTEGER-2):number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=1&&v<=max?v:invalid()
function unicode(v:string):string{for(const c of v)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalid();return v}
function text(v:unknown,max:number,required=false):string{
  if(typeof v!=="string"||v.length>max||v!==v.trim()||required&&!v||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v))return invalid()
  unicode(v)
  if(v.replace(/sk-[A-Za-z0-9_-]{8,}/g,"***").replace(/Bearer\s+\S+/g,"Bearer ***").replace(/token=\S+/g,"token=***").replace(/api_key=\S+/g,"api_key=***")!==v)return invalid()
  return v
}
function descriptive(raw:unknown):PgNativeAgentGeneratedDescriptive{
  const v=object(raw,agentGeneratedDescriptiveKeys),list=(key:string)=>array(v[key],30).map(item=>text(item,500))
  return {goal:text(v.goal,3000,true),task_scope:text(v.task_scope,4000),deliverables:list("deliverables"),task_plan:list("task_plan"),done_criteria:list("done_criteria")}
}
export function agentGeneratedCanonical(value:unknown):string{
  const order=(v:unknown,depth=0):unknown=>{
    if(depth>32)return invalid()
    if(v===null||typeof v==="boolean")return v
    if(typeof v==="string")return unicode(v)
    if(typeof v==="number")return Number.isSafeInteger(v)&&!Object.is(v,-0)?v:invalid()
    if(Array.isArray(v))return array(v,100).map(x=>order(x,depth+1))
    return Object.fromEntries(Object.entries(object(v)).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[unicode(k),order(x,depth+1)]))
  }
  return JSON.stringify(order(value))
}
export async function agentGeneratedHash(value:unknown):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(agentGeneratedCanonical(value)))),b=>b.toString(16).padStart(2,"0")).join("")}
const targetKeys=["review_id","spec_id","target_run_id"]
export function agentGeneratedTarget(raw:unknown):PgNativeAgentGeneratedTarget{const v=object(raw,targetKeys);return {review_id:id(v.review_id),spec_id:id(v.spec_id),target_run_id:id(v.target_run_id)}}
const same=(a:PgNativeAgentGeneratedTarget,b:PgNativeAgentGeneratedTarget)=>targetKeys.every(k=>a[k as keyof PgNativeAgentGeneratedTarget]===b[k as keyof PgNativeAgentGeneratedTarget])
function input<T>(fn:()=>T):T{try{return fn()}catch{throw Error("invalid_agent_generated_request")}}
export function agentGeneratedPreviewInput(raw:unknown):PgNativeAgentGeneratedPreviewInput{return input(()=>{const v=object(raw,["action",...targetKeys]);if(v.action!=="preview")return invalid();return {action:"preview",...agentGeneratedTarget({review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})}})}
const acceptKeys=["action","request_id",...targetKeys,"anchor_run_id","anchor_feedback_id","expected_preview_sha256","expected_result_sha256","expected_spec_revision","expected_spec_sha256","expected_candidate_sha256","confirm","acceptance_acknowledgement"]
export function agentGeneratedAcceptance(raw:unknown):PgNativeAgentGeneratedAcceptance{return input(()=>{
  const v=object(raw,acceptKeys)
  if(v.action!=="accept"||v.confirm!==true||v.acceptance_acknowledgement!==agentGeneratedAcknowledgement)return invalid()
  const target=agentGeneratedTarget({review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id}),request_id=id(v.request_id),anchor_feedback_id=id(v.anchor_feedback_id)
  if(request_id===target.review_id||request_id===anchor_feedback_id)return invalid()
  return {action:"accept",request_id,...target,anchor_run_id:id(v.anchor_run_id),anchor_feedback_id,expected_preview_sha256:hash(v.expected_preview_sha256),expected_result_sha256:hash(v.expected_result_sha256),expected_spec_revision:positive(v.expected_spec_revision),expected_spec_sha256:hash(v.expected_spec_sha256),expected_candidate_sha256:hash(v.expected_candidate_sha256),confirm:true,acceptance_acknowledgement:agentGeneratedAcknowledgement}
})}
function source(raw:unknown):PgNativeAgentGeneratedSource{
  const v=object(raw,[...targetKeys,"review_request_sha256","input_sha256","content_sha256","result_sha256","completion_sha256","source_owner_epoch","source_protocol"])
  if(v.source_protocol!=="employee_statement_anchor_v1")return invalid()
  return {...agentGeneratedTarget({review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id}),review_request_sha256:hash(v.review_request_sha256),input_sha256:hash(v.input_sha256),content_sha256:hash(v.content_sha256),result_sha256:hash(v.result_sha256),completion_sha256:hash(v.completion_sha256),source_owner_epoch:positive(v.source_owner_epoch),source_protocol:"employee_statement_anchor_v1"}
}
function feedback(raw:unknown):PgNativeAgentGeneratedFeedback[]{
  const values=array(raw,8).map(raw=>{const v=object(raw,["run_id","feedback_id","feedback_sha256","feedback_revision","feedback_source_sha256","statement_sha256"]);return {run_id:id(v.run_id),feedback_id:id(v.feedback_id),feedback_sha256:hash(v.feedback_sha256),feedback_revision:positive(v.feedback_revision),feedback_source_sha256:hash(v.feedback_source_sha256),statement_sha256:hash(v.statement_sha256)}})
  if(!values.length||new Set(values.map(v=>v.run_id)).size!==values.length||new Set(values.map(v=>v.feedback_id)).size!==values.length)return invalid()
  for(let i=1;i<values.length;i++)if(values[i-1]!.run_id>=values[i]!.run_id)return invalid()
  return values
}
function changed(raw:unknown):Key[]{const keys=array(raw,5);if(!keys.length||keys.some(k=>!agentGeneratedDescriptiveKeys.includes(k as Key)))return invalid();const expected=agentGeneratedDescriptiveKeys.filter(k=>keys.includes(k));if(agentGeneratedCanonical(keys)!==agentGeneratedCanonical(expected))return invalid();return [...expected]}
async function common(v:Record<string,unknown>,target?:PgNativeAgentGeneratedTarget):Promise<Common>{
  const s=source(v.source),refs=feedback(v.feedback_sources),a=object(v.anchor,["run_id","feedback_id"]),anchor={run_id:id(a.run_id),feedback_id:id(a.feedback_id)},digest=hash(v.feedback_sources_sha256)
  if(target&&!same(s,agentGeneratedTarget(target))||anchor.run_id!==refs[0]!.run_id||anchor.feedback_id!==refs[0]!.feedback_id||digest!==await agentGeneratedFeedbackHash(refs))return invalid()
  return {source:s,feedback_sources:refs,feedback_sources_sha256:digest,anchor,changed_keys:changed(v.changed_keys),preview_sha256:hash(v.preview_sha256)}
}
export const agentGeneratedFeedbackHash=(sources:PgNativeAgentGeneratedFeedback[])=>agentGeneratedHash({protocol:"agent_generated_feedback_set_v1",sources})
export const agentGeneratedPreviewHash=(v:PgNativeAgentGeneratedPreview)=>agentGeneratedHash({protocol:"agent_generated_preview_binding_v1",source:v.source,feedback_sources:v.feedback_sources,feedback_sources_sha256:v.feedback_sources_sha256,anchor:v.anchor,before:v.before,candidate:v.candidate,changed_keys:v.changed_keys})
export const agentGeneratedRequestHash=(v:PgNativeAgentGeneratedAcceptance)=>agentGeneratedHash({protocol:"agent_generated_accept_intent_v1",...agentGeneratedAcceptance(v)})
const coreKeys=["protocol","source_kind","request_id","request_sha256","source","feedback_sources","feedback_sources_sha256","anchor","before","after","candidate_sha256","changed_keys","preview_sha256","acceptance_owner_epoch","created_at"]
export const agentGeneratedReceiptHash=(v:PgNativeAgentGeneratedReceipt)=>agentGeneratedHash(Object.fromEntries(coreKeys.map(k=>[k,(v as unknown as Record<string,unknown>)[k]])))
export async function agentGeneratedPreview(raw:unknown,target?:PgNativeAgentGeneratedTarget):Promise<PgNativeAgentGeneratedPreview>{
  const v=object(JSON.parse(agentGeneratedCanonical(raw)),["protocol","source","feedback_sources","feedback_sources_sha256","anchor","before","candidate","changed_keys","preview_sha256","recorded"])
  if(v.protocol!=="agent_generated_preview_v1"||v.recorded!==false)return invalid()
  const c=await common(v,target),b=object(v.before,["revision","source_sha256","descriptive"]),a=object(v.candidate,["descriptive","candidate_sha256"])
  const value:PgNativeAgentGeneratedPreview={protocol:"agent_generated_preview_v1",...c,before:{revision:positive(b.revision),source_sha256:hash(b.source_sha256),descriptive:descriptive(b.descriptive)},candidate:{descriptive:descriptive(a.descriptive),candidate_sha256:hash(a.candidate_sha256)},recorded:false}
  const keys=agentGeneratedDescriptiveKeys.filter(k=>agentGeneratedCanonical(value.before.descriptive[k])!==agentGeneratedCanonical(value.candidate.descriptive[k]))
  if(agentGeneratedCanonical(keys)!==agentGeneratedCanonical(value.changed_keys)||await agentGeneratedPreviewHash(value)!==value.preview_sha256||new TextEncoder().encode(agentGeneratedCanonical(value)).length>1048576)return invalid()
  return value
}
export function agentGeneratedOriginal(p:PgNativeAgentGeneratedPreview,requestId:string):PgNativeAgentGeneratedAcceptance{
  const result=agentGeneratedAcceptance({action:"accept",request_id:requestId,review_id:p.source.review_id,spec_id:p.source.spec_id,target_run_id:p.source.target_run_id,anchor_run_id:p.anchor.run_id,anchor_feedback_id:p.anchor.feedback_id,expected_preview_sha256:p.preview_sha256,expected_result_sha256:p.source.result_sha256,expected_spec_revision:p.before.revision,expected_spec_sha256:p.before.source_sha256,expected_candidate_sha256:p.candidate.candidate_sha256,confirm:true,acceptance_acknowledgement:agentGeneratedAcknowledgement})
  if(p.feedback_sources.some(f=>f.feedback_id===result.request_id))throw Error("invalid_agent_generated_request")
  return result
}
function revision(raw:unknown,max=Number.MAX_SAFE_INTEGER-2):Revision{const v=object(raw,["revision","source_sha256","revision_id"]);return {revision:positive(v.revision,max),source_sha256:hash(v.source_sha256),revision_id:id(v.revision_id)}}
export async function agentGeneratedReceipt(raw:unknown,{target,original,replayed}:{target?:PgNativeAgentGeneratedTarget;original?:PgNativeAgentGeneratedAcceptance;replayed?:boolean}={}):Promise<PgNativeAgentGeneratedReceipt>{
  const expectedOriginal=original?agentGeneratedAcceptance(original):undefined
  const v=object(JSON.parse(agentGeneratedCanonical(raw)),[...coreKeys,"receipt_sha256","recorded","replayed"])
  if(v.protocol!=="agent_generated_acceptance_receipt_v1"||v.source_kind!=="generated_opinion"||v.recorded!==true||typeof v.replayed!=="boolean"||replayed!==undefined&&v.replayed!==replayed)return invalid()
  const c=await common(v,target),before=revision(v.before),after=revision(v.after,Number.MAX_SAFE_INTEGER-1)
  if(after.revision!==before.revision+1||before.revision_id===after.revision_id||before.source_sha256===after.source_sha256||v.acceptance_owner_epoch!==c.source.source_owner_epoch)return invalid()
  if(typeof v.created_at!=="string"||!/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.created_at)||!Number.isFinite(Date.parse(v.created_at))||new Date(v.created_at).toISOString()!==v.created_at)return invalid()
  const value:PgNativeAgentGeneratedReceipt={protocol:"agent_generated_acceptance_receipt_v1",source_kind:"generated_opinion",...c,request_id:id(v.request_id),request_sha256:hash(v.request_sha256),before,after,candidate_sha256:hash(v.candidate_sha256),acceptance_owner_epoch:positive(v.acceptance_owner_epoch),created_at:v.created_at,receipt_sha256:hash(v.receipt_sha256),recorded:true,replayed:v.replayed}
  // This derived config intent is hash verification only, never a paid request or retry state.
  let intent:PgNativeAgentGeneratedAcceptance
  try{intent=agentGeneratedAcceptance({action:"accept",request_id:value.request_id,review_id:c.source.review_id,spec_id:c.source.spec_id,target_run_id:c.source.target_run_id,anchor_run_id:c.anchor.run_id,anchor_feedback_id:c.anchor.feedback_id,expected_preview_sha256:c.preview_sha256,expected_result_sha256:c.source.result_sha256,expected_spec_revision:before.revision,expected_spec_sha256:before.source_sha256,expected_candidate_sha256:value.candidate_sha256,confirm:true,acceptance_acknowledgement:agentGeneratedAcknowledgement})}catch{return invalid()}
  if(c.feedback_sources.some(f=>f.feedback_id===value.request_id)||await agentGeneratedRequestHash(intent)!==value.request_sha256||await agentGeneratedReceiptHash(value)!==value.receipt_sha256||expectedOriginal&&agentGeneratedCanonical(expectedOriginal)!==agentGeneratedCanonical(intent))return invalid()
  return value
}
