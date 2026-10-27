// Closed next-phase contract only. No database, route, Worker, provider,
// authority grant or role mutation is implemented by these pure functions.
import {HttpError,isUuid,safeModelBinding,safeAgentSpec,type AgentSpecInput} from "./contracts.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {redactResultText} from "./public-result-text.ts"
import {agentDescriptiveLimits as limits} from "../../../shared/agent-role-limits.mjs"

export const agentReviewFees={evaluate:"APPROVE_ONE_PAID_AGENT_EVALUATION_V1",optimize:"APPROVE_ONE_PAID_AGENT_OPTIMIZATION_V1"} as const
export const agentReviewDimensions=["目标达成","过程效率","工具使用","输出质量","指令遵循"] as const
type FeedbackSource={run_id:string;feedback_id:string;feedback_sha256:string}
type EvaluationSource={run_id:string;review_id:string;result_sha256:string}
type Fields={purpose:"evaluate"|"optimize";spec_id:string;run_id:string;expected_source_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;model_binding:NonNullable<AgentSpecInput["model_binding"]>;output_token_limit:2048|4096|8192|16384;feedback_sources:FeedbackSource[];evaluation_sources:EvaluationSource[]}
export type AgentReviewPreview=Fields&{action:"preview"}
export type AgentReviewSubmission=Fields&{action:"submit";request_id:string;expected_input_sha256:string;confirm:true;fee_acknowledgement:typeof agentReviewFees[keyof typeof agentReviewFees];request_sha256:string}
const invalid=():never=>{throw new HttpError(400,"invalid_agent_review_request")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  if(Reflect.ownKeys(raw).some(k=>typeof k!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value")))return invalid()
  return raw as Record<string,unknown>
}
const exact=(v:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const id=(v:unknown):string=>isUuid(v)?v.toLowerCase():invalid()
const hash=(v:unknown):string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)?v:invalid()
function array(raw:unknown,max:number):unknown[]{
  if(!Array.isArray(raw)||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return invalid()
  for(let i=0;i<raw.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return invalid()
  return raw
}
const keys=["action","purpose","spec_id","run_id","expected_source_sha256","expected_spec_revision","expected_spec_sha256","model_binding","output_token_limit","feedback_sources","evaluation_sources"]
function fields(v:Record<string,unknown>):Fields{
  if(v.purpose!=="evaluate"&&v.purpose!=="optimize"||!Number.isSafeInteger(v.expected_spec_revision)||Number(v.expected_spec_revision)<1||Number(v.expected_spec_revision)>Number.MAX_SAFE_INTEGER-2||![2048,4096,8192,16384].includes(Number(v.output_token_limit))||typeof v.output_token_limit!=="number")return invalid()
  const model=object(v.model_binding);if(!exact(model,["connection_id","connection_revision","model_id"]))return invalid()
  const binding=safeModelBinding(model);if(!binding)return invalid()
  const feedback_sources=array(v.feedback_sources,8).map(raw=>{const source=object(raw);if(!exact(source,["run_id","feedback_id","feedback_sha256"]))return invalid();return {run_id:id(source.run_id),feedback_id:id(source.feedback_id),feedback_sha256:hash(source.feedback_sha256)}})
  const evaluation_sources=array(v.evaluation_sources,2).map(raw=>{const source=object(raw);if(!exact(source,["run_id","review_id","result_sha256"]))return invalid();return {run_id:id(source.run_id),review_id:id(source.review_id),result_sha256:hash(source.result_sha256)}})
  if(new Set(feedback_sources.map(s=>s.feedback_id)).size!==feedback_sources.length||new Set(feedback_sources.map(s=>s.run_id)).size!==feedback_sources.length||new Set(evaluation_sources.map(s=>s.review_id)).size!==evaluation_sources.length||
    v.purpose==="evaluate"&&(feedback_sources.length||evaluation_sources.length)||v.purpose==="optimize"&&!feedback_sources.length&&!evaluation_sources.length)return invalid()
  return {purpose:v.purpose,spec_id:id(v.spec_id),run_id:id(v.run_id),expected_source_sha256:hash(v.expected_source_sha256),expected_spec_revision:Number(v.expected_spec_revision),expected_spec_sha256:hash(v.expected_spec_sha256),model_binding:{...binding,connection_id:id(binding.connection_id)},output_token_limit:v.output_token_limit as Fields["output_token_limit"],feedback_sources,evaluation_sources}
}
export function parseAgentReviewPreview(raw:unknown):AgentReviewPreview{const v=object(raw);if(!exact(v,keys)||v.action!=="preview")return invalid();return {...fields(v),action:"preview"}}
export function parseAgentReviewSubmission(raw:unknown):AgentReviewSubmission{
  const v=object(raw)
  if(!exact(v,[...keys,"request_id","expected_input_sha256","confirm","fee_acknowledgement"])||v.action!=="submit"||v.confirm!==true)return invalid()
  const selected=fields(v),request_id=id(v.request_id),expected_input_sha256=hash(v.expected_input_sha256)
  if(v.fee_acknowledgement!==agentReviewFees[selected.purpose]||selected.feedback_sources.some(s=>s.feedback_id===request_id)||selected.evaluation_sources.some(s=>s.review_id===request_id))return invalid()
  const value={...selected,action:"submit" as const,request_id,expected_input_sha256,confirm:true as const,fee_acknowledgement:agentReviewFees[selected.purpose]}
  return {...value,request_sha256:agentMemoryHash(canonicalMcpJson({protocol:"agent_paid_review_intent_v1",...value}))}
}
function text(raw:unknown,max:number,required=false):string{
  if(typeof raw!=="string"||raw.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(raw))return invalid()
  for(const char of raw)if(char.length===1&&char.charCodeAt(0)>=0xd800&&char.charCodeAt(0)<=0xdfff)return invalid()
  const value=redactResultText(raw.trim());if(required&&!value)return invalid();return value
}
function score(raw:unknown):number{if(!Number.isInteger(raw)||Number(raw)<0||Number(raw)>100)return invalid();return Number(raw)}
export function parseAgentEvaluationOutput(raw:unknown){
  const v=object(raw);if(!exact(v,["score","dimensions","suggestions"]))return invalid()
  const dimensions=array(v.dimensions,5);if(dimensions.length!==5)return invalid()
  return {score:score(v.score),dimensions:dimensions.map((raw,index)=>{const d=object(raw);if(!exact(d,["name","score","comment"])||d.name!==agentReviewDimensions[index])return invalid();return {name:agentReviewDimensions[index]!,score:score(d.score),comment:text(d.comment,120,true)}}),suggestions:array(v.suggestions,5).map(s=>text(s,200,true))}
}
const descriptive=["goal","task_scope","deliverables","task_plan","done_criteria"] as const
export type AgentReviewDescriptivePatch=Partial<Pick<AgentSpecInput,typeof descriptive[number]>>
export function parseAgentOptimizationOutput(raw:unknown){
  const v=object(raw);if(!exact(v,["descriptive","tools_note","rationale"]))return invalid()
  const d=object(v.descriptive),provided=Object.keys(d);if(!provided.length||provided.some(k=>!descriptive.includes(k as typeof descriptive[number])))return invalid()
  const patch:AgentReviewDescriptivePatch={}
  for(const key of descriptive)if(Object.hasOwn(d,key)){
    if(key==="goal"||key==="task_scope")patch[key]=text(d[key],key==="goal"?limits.goal:limits.task_scope,key==="goal")
    else patch[key]=array(d[key],limits.list_items).map(s=>text(s,limits.list_item))
  }
  return {descriptive:patch,tools_note:text(v.tools_note,400),rationale:text(v.rationale,400,true)}
}
// Produces an unaccepted candidate only. Resource grants, lineage, version
// checks and a fresh explicit055 acceptance remain mandatory at application.
export function agentReviewRoleCandidate(before:AgentSpecInput,raw:unknown):AgentSpecInput{
  const output=parseAgentOptimizationOutput(raw),{require_approval,...input}=object(before)
  if(require_approval!==true)return invalid()
  const normalized=safeAgentSpec(input)
  if(canonicalMcpJson(normalized)!==canonicalMcpJson(before))return invalid()
  return safeAgentSpec({...input,...output.descriptive})
}
