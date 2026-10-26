import {isUuid,safeAgentSpec,safeName,type AgentSpecInput} from "../../services/pg-api/src/contracts.ts"
import {canonicalMcpJson} from "../../services/pg-api/src/mcp-catalog.ts"
import {redactResultText} from "../../services/pg-api/src/public-result-text.ts"

type EditableSpec=Omit<AgentSpecInput,"require_approval">
type Fields={spec_id:string;run_id:string;feedback_id:string;expected_feedback_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;name:string;spec:EditableSpec}
export type PgNativeOptimizationDraft=Fields&{action:"preview"}
export type PgNativeOptimizationChoice=Fields&{action:"accept";request_id:string;confirm:true}
export type PgNativeOptimizationReceipt={protocol:"agent_feedback_optimization_v1";request_id:string;spec_id:string;run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number;feedback_source_sha256:string;before_spec_revision:number;after_spec_revision:number;before_spec_sha256:string;after_spec_sha256:string;before_revision_id:string;after_revision_id:string;changed_keys:string[];candidate_sha256:string;request_sha256:string;created_at:string;recorded:true;replayed:boolean}
export type PgNativeOptimizationHistory={protocol:"agent_feedback_optimization_v1";spec_id:string;items:Array<PgNativeOptimizationReceipt&{feedback_unchanged:boolean;role_current:boolean}>;limit:80}
export type PgNativeOptimizationPreview={protocol:"agent_feedback_optimization_v1";spec_id:string;run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number;feedback_source_sha256:string;feedback:{rating:"up"|"down";tags:string[];comment:string};before:{name:string;spec:AgentSpecInput;revision:number;source_sha256:string};candidate:{name:string;spec:AgentSpecInput;candidate_sha256:string};changed_keys:string[];recorded:false}
const protocol="agent_feedback_optimization_v1",tracked=["goal","task_scope","deliverables","task_plan","done_criteria","tools","knowledge_base_ids","require_plan_review","model_binding","http_tools","mcp_tools","knowledge_retrieval"] as const
const invalid=():never=>{throw Error("invalid_agent_optimization_projection")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  if(Reflect.ownKeys(raw).some(k=>typeof k!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value")))return invalid()
  return raw as Record<string,unknown>
}
const exact=(v:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const id=(v:unknown):v is string=>isUuid(v)&&v===v.toLowerCase()
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)
const revision=(v:unknown,max=Number.MAX_SAFE_INTEGER-1):v is number=>Number.isSafeInteger(v)&&Number(v)>=1&&Number(v)<=max
const digest=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,"0")).join("")
function unicode(raw:unknown){
  if(typeof raw==="string"){
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(raw))return invalid()
    for(const c of raw)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalid()
  }else if(Array.isArray(raw)){if(Object.keys(raw).length!==raw.length)return invalid();raw.forEach(unicode)}
  else if(raw&&typeof raw==="object")Object.values(object(raw)).forEach(unicode)
}
export function optimizationRoleSpec(raw:unknown,stored=false):AgentSpecInput{
  const value=object(raw);unicode(value)
  const {require_approval,...input}=value
  if(stored?require_approval!==true:Object.hasOwn(value,"require_approval"))return invalid()
  const normalized=safeAgentSpec(input)
  if(stored&&canonicalMcpJson(normalized)!==canonicalMcpJson(value))return invalid()
  return normalized
}
export function optimizationDraft(raw:unknown):PgNativeOptimizationDraft{
  const v=object(raw)
  if(!exact(v,["action","spec_id","run_id","feedback_id","expected_feedback_sha256","expected_spec_revision","expected_spec_sha256","name","spec"])||v.action!=="preview"||!isUuid(v.spec_id)||!isUuid(v.run_id)||!isUuid(v.feedback_id)||!hash(v.expected_feedback_sha256)||!hash(v.expected_spec_sha256)||!revision(v.expected_spec_revision,Number.MAX_SAFE_INTEGER-2))return invalid()
  unicode(v.name);const name=safeName(v.name),{require_approval:_,...spec}=optimizationRoleSpec(v.spec)
  return {action:"preview",spec_id:v.spec_id.toLowerCase(),run_id:v.run_id.toLowerCase(),feedback_id:v.feedback_id.toLowerCase(),expected_feedback_sha256:v.expected_feedback_sha256,expected_spec_revision:v.expected_spec_revision,expected_spec_sha256:v.expected_spec_sha256,name,spec}
}
export function optimizationChoice(raw:unknown):PgNativeOptimizationChoice{
  const v=object(raw)
  if(!exact(v,["action","request_id","spec_id","run_id","feedback_id","expected_feedback_sha256","expected_spec_revision","expected_spec_sha256","name","spec","confirm"])||v.action!=="accept"||v.confirm!==true||!isUuid(v.request_id))return invalid()
  const {request_id,confirm,...rest}=v,draft=optimizationDraft({...rest,action:"preview"})
  if(request_id.toLowerCase()===draft.feedback_id)return invalid()
  return {...draft,action:"accept",request_id:request_id.toLowerCase(),confirm:true}
}
const candidateHash=(v:{name:string;spec:AgentSpecInput})=>digest(canonicalMcpJson({protocol:"agent_feedback_role_candidate_v1",name:v.name,spec:v.spec}))
function changed(raw:unknown):string[]{
  if(!Array.isArray(raw)||!raw.length||raw.length>13||new Set(raw).size!==raw.length||raw.some(k=>typeof k!=="string"||!["name",...tracked].includes(k))||!raw.some(k=>k!=="name"))return invalid()
  const ordered=["name",...tracked].filter(k=>raw.includes(k))
  if(canonicalMcpJson(ordered)!==canonicalMcpJson(raw))return invalid()
  return [...raw]
}
const receiptKeys=["protocol","request_id","spec_id","run_id","feedback_id","feedback_sha256","feedback_revision","feedback_source_sha256","before_spec_revision","after_spec_revision","before_spec_sha256","after_spec_sha256","before_revision_id","after_revision_id","changed_keys","candidate_sha256","request_sha256","created_at","recorded","replayed"]
function receipt(raw:unknown):PgNativeOptimizationReceipt{
  const v=object(raw)
  if(!exact(v,receiptKeys)||v.protocol!==protocol||![v.request_id,v.spec_id,v.run_id,v.feedback_id,v.before_revision_id,v.after_revision_id].every(id)||v.request_id===v.feedback_id||v.before_revision_id===v.after_revision_id||![v.feedback_sha256,v.feedback_source_sha256,v.before_spec_sha256,v.after_spec_sha256,v.candidate_sha256,v.request_sha256].every(hash)||!revision(v.feedback_revision)||!revision(v.before_spec_revision,Number.MAX_SAFE_INTEGER-2)||v.after_spec_revision!==v.before_spec_revision+1||v.before_spec_sha256===v.after_spec_sha256||typeof v.created_at!=="string"||v.created_at.length>50||!Number.isFinite(Date.parse(v.created_at))||v.recorded!==true||typeof v.replayed!=="boolean")return invalid()
  changed(v.changed_keys);return structuredClone(v) as PgNativeOptimizationReceipt
}
export async function optimizationReceipt(raw:unknown,input:PgNativeOptimizationChoice,confirmOnly=false):Promise<PgNativeOptimizationReceipt>{
  const v=receipt(raw),choice=optimizationChoice(input),spec=optimizationRoleSpec(choice.spec)
  const expected=await digest(canonicalMcpJson(["agent_feedback_optimization_accept_v1",choice.request_id,choice.spec_id,choice.run_id,choice.feedback_id,choice.expected_feedback_sha256,choice.expected_spec_revision,choice.expected_spec_sha256,choice.name,spec]))
  if(v.request_id!==choice.request_id||v.spec_id!==choice.spec_id||v.run_id!==choice.run_id||v.feedback_id!==choice.feedback_id||v.feedback_sha256!==choice.expected_feedback_sha256||v.before_spec_revision!==choice.expected_spec_revision||v.before_spec_sha256!==choice.expected_spec_sha256||v.request_sha256!==expected||v.candidate_sha256!==await candidateHash({name:choice.name,spec})||confirmOnly&&!v.replayed)return invalid()
  return v
}
export async function optimizationPreview(raw:unknown,input:PgNativeOptimizationDraft):Promise<PgNativeOptimizationPreview>{
  const v=object(raw),draft=optimizationDraft(input),before=object(v.before),candidate=object(v.candidate),feedback=object(v.feedback)
  if(!exact(v,["protocol","spec_id","run_id","feedback_id","feedback_sha256","feedback_revision","feedback_source_sha256","feedback","before","candidate","changed_keys","recorded"])||v.protocol!==protocol||v.recorded!==false||v.spec_id!==draft.spec_id||v.run_id!==draft.run_id||v.feedback_id!==draft.feedback_id||v.feedback_sha256!==draft.expected_feedback_sha256||!revision(v.feedback_revision)||!hash(v.feedback_source_sha256)||!exact(before,["name","spec","revision","source_sha256"])||!exact(candidate,["name","spec","candidate_sha256"])||before.revision!==draft.expected_spec_revision||before.source_sha256!==draft.expected_spec_sha256||candidate.name!==draft.name||!exact(feedback,["rating","tags","comment"])||feedback.rating!=="up"&&feedback.rating!=="down"||!Array.isArray(feedback.tags)||feedback.tags.length>8||typeof feedback.comment!=="string"||feedback.comment.length>500||feedback.tags.some(t=>typeof t!=="string"||!t.trim()||t.length>20||/[\t\r\n]/.test(t)))return invalid()
  unicode(feedback);for(const t of [...feedback.tags,feedback.comment])if(t!==t.trim()||redactResultText(t)!==t)return invalid()
  unicode(before.name);if(safeName(before.name)!==before.name)return invalid()
  const beforeSpec=optimizationRoleSpec(before.spec,true),candidateSpec=optimizationRoleSpec(candidate.spec,true),expectedSpec=optimizationRoleSpec(draft.spec)
  if(canonicalMcpJson(candidateSpec)!==canonicalMcpJson(expectedSpec)||candidate.candidate_sha256!==await candidateHash({name:draft.name,spec:expectedSpec}))return invalid()
  const keys=[...(before.name!==draft.name?["name"]:[]),...tracked.filter(k=>canonicalMcpJson(beforeSpec[k]??null)!==canonicalMcpJson(expectedSpec[k]??null))]
  if(canonicalMcpJson(changed(v.changed_keys))!==canonicalMcpJson(keys))return invalid()
  return structuredClone(v) as PgNativeOptimizationPreview
}
export function optimizationHistory(raw:unknown,specId:string):PgNativeOptimizationHistory{
  const v=object(raw)
  if(!id(specId)||!exact(v,["protocol","spec_id","items","limit"])||v.protocol!==protocol||v.spec_id!==specId||v.limit!==80||!Array.isArray(v.items)||v.items.length>80)return invalid()
  const seen=new Set<string>();let previous=Infinity,current=0
  for(const item of v.items){
    const entry=object(item);if(!exact(entry,[...receiptKeys,"feedback_unchanged","role_current"])||typeof entry.feedback_unchanged!=="boolean"||typeof entry.role_current!=="boolean")return invalid()
    const {feedback_unchanged:_,role_current:__,...base}=entry,r=receipt(base),time=Date.parse(r.created_at)
    if(r.spec_id!==specId||!r.replayed||seen.has(r.request_id)||time>previous||entry.role_current&&++current>1)return invalid()
    seen.add(r.request_id);previous=time
  }
  return structuredClone(v) as PgNativeOptimizationHistory
}
