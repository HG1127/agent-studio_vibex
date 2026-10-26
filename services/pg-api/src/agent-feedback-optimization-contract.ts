// Candidate contract only. Persistence, source checks, HTTP and employee
// acceptance remain mandatory before this can change any Agent role.
import {HttpError,isUuid,safeAgentSpec,safeName,type AgentSpecInput} from "./contracts.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
type Fields={spec_id:string;run_id:string;feedback_id:string;expected_feedback_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;name:string;spec:AgentSpecInput}
export type AgentFeedbackOptimizationDraft=Fields&{action:"preview"}
export type AgentFeedbackOptimizationAcceptance=Fields&{action:"accept";request_id:string;confirm:true;request_sha256:string}
export const feedbackOptimizationTrackedFields=["goal","task_scope","deliverables","task_plan","done_criteria","tools","knowledge_base_ids","require_plan_review","model_binding","http_tools","mcp_tools","knowledge_retrieval"] as const
const invalid=():never=>{throw new HttpError(400,"invalid_feedback_optimization_request")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const value=raw as Record<string,unknown>
  if(Reflect.ownKeys(value).some(k=>typeof k!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k)??{},"value")))return invalid()
  return value
}
const id=(v:unknown):string=>isUuid(v)?v.toLowerCase():invalid()
const hash=(v:unknown):string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)?v:invalid()
function fields(v:Record<string,unknown>):Fields{
  if(!Number.isSafeInteger(v.expected_spec_revision)||Number(v.expected_spec_revision)<1||Number(v.expected_spec_revision)>Number.MAX_SAFE_INTEGER-2)return invalid()
  // Existing native parsing keeps every supported descriptive/resource field,
  // forces approval and never accepts credentials or arbitrary worker policy.
  const proposed=object(v.spec),spec=safeAgentSpec(proposed),name=safeName(v.name)
  return {spec_id:id(v.spec_id),run_id:id(v.run_id),feedback_id:id(v.feedback_id),expected_feedback_sha256:hash(v.expected_feedback_sha256),expected_spec_revision:Number(v.expected_spec_revision),expected_spec_sha256:hash(v.expected_spec_sha256),name,spec}
}
const base=["action","spec_id","run_id","feedback_id","expected_feedback_sha256","expected_spec_revision","expected_spec_sha256","name","spec"]
function exact(v:Record<string,unknown>,keys:string[]){if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))return invalid()}
export function parseFeedbackOptimizationDraft(raw:unknown):AgentFeedbackOptimizationDraft{
  const v=object(raw);exact(v,base);if(v.action!=="preview")return invalid()
  return {...fields(v),action:"preview"}
}
export function parseFeedbackOptimizationAcceptance(raw:unknown):AgentFeedbackOptimizationAcceptance{
  const v=object(raw);exact(v,[...base,"request_id","confirm"]);if(v.action!=="accept"||v.confirm!==true)return invalid()
  const values=fields(v),request_id=id(v.request_id);if(request_id===values.feedback_id)return invalid()
  const request_sha256=agentMemoryHash(canonicalMcpJson(["agent_feedback_optimization_accept_v1",request_id,values.spec_id,values.run_id,values.feedback_id,values.expected_feedback_sha256,values.expected_spec_revision,values.expected_spec_sha256,values.name,values.spec]))
  return {...values,action:"accept",request_id,confirm:true,request_sha256}
}
// Plan a real owner change; a name-only edit cannot be labeled as feedback
// optimization. This helper conveys no source validity or acceptance proof.
export function feedbackOptimizationChangedFields(before:{name:string;spec:AgentSpecInput},after:{name:string;spec:AgentSpecInput}):string[]{
  const changed=feedbackOptimizationTrackedFields.filter(k=>canonicalMcpJson(before.spec[k]??null)!==canonicalMcpJson(after.spec[k]??null))
  if(!changed.length)throw new HttpError(409,"feedback_optimization_change_required")
  return [...(before.name!==after.name?["name"]:[]),...changed]
}
