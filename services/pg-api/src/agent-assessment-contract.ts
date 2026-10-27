// Independent review execution consent and metadata-only private RPC.
import {isUuid} from "./contracts.ts"
import {parseAgentEvaluationOutput,parseAgentOptimizationOutput} from "./agent-review-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"

export const agentAssessmentApproval="APPROVE_DISPOSABLE_PG18_PAID_REVIEW_EXECUTION_ONLY"
export const agentAssessmentRoute="/__internal/v1/agent-assessment/dispatch"
export const agentAssessmentMaxRequestBytes=2048
export const agentAssessmentMaxReplyBytes=2048
export type AgentAssessmentActivation={executionEnabled?:boolean;executionApproval?:string}
export type AgentAssessmentProof={request_id:string;lease_token:string;lease_version:number;worker_id:string}
export type AgentAssessmentClaim=AgentAssessmentProof&{lease_expires_at:string}
export type AgentAssessmentReply={request_id:string;state:"succeeded";result_sha256:string;completion_sha256?:string}|{request_id:string;state:"failed"|"unknown";completion_sha256?:string}|{request_id:string;state:"paused"}
export type AgentAssessmentPurpose="evaluate"|"optimize"
export type AgentAssessmentCompletion={status:"succeeded";result:ReturnType<typeof parseAgentEvaluationOutput>|ReturnType<typeof parseAgentOptimizationOutput>}|{status:"failed"|"unknown";failure_code:string}
const invalid=():never=>{throw Error("invalid_agent_assessment_contract")}
export function agentAssessmentExecutionEnabled(config:AgentAssessmentActivation={}):boolean{
  if(config.executionEnabled===undefined||config.executionEnabled===false)return false
  if(config.executionEnabled!==true||config.executionApproval!==agentAssessmentApproval)throw Error("agent_assessment_execution_disabled")
  return true
}
export function assessmentObject(raw:unknown,keys:string[]):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const v=raw as Record<string,unknown>
  if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},"value")))return invalid()
  return v
}
const id=(v:unknown)=>isUuid(v)?v.toLowerCase():invalid()
export function assessmentSha(v:unknown):string{if(typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v))return invalid();return v}
export function assessmentVersion(v:unknown):number{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<1||v>Number.MAX_SAFE_INTEGER-2)return invalid();return v}
export function parseAgentAssessmentProof(raw:unknown):AgentAssessmentProof{
  const v=assessmentObject(raw,["request_id","lease_token","lease_version","worker_id"])
  return {request_id:id(v.request_id),lease_token:id(v.lease_token),lease_version:assessmentVersion(v.lease_version),worker_id:id(v.worker_id)}
}
export function parseAgentAssessmentClaim(raw:unknown):AgentAssessmentClaim{
  const v=assessmentObject(raw,["request_id","lease_token","lease_version","worker_id","lease_expires_at"])
  if(typeof v.lease_expires_at!=="string"||v.lease_expires_at.length>40||!Number.isFinite(Date.parse(v.lease_expires_at)))return invalid()
  const {lease_expires_at,...proof}=v
  return {...parseAgentAssessmentProof(proof),lease_expires_at:new Date(lease_expires_at as string).toISOString()}
}
export function agentAssessmentProofFromClaim(claim:AgentAssessmentClaim):AgentAssessmentProof{
  const {lease_expires_at:_expiry,...proof}=parseAgentAssessmentClaim(claim);return proof
}
export function parseAgentAssessmentReply(raw:unknown):AgentAssessmentReply{
  // Inspect descriptors before reading state, including unknown/accessor keys.
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  for(const key of Reflect.ownKeys(raw))if(typeof key!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,key)??{},"value"))return invalid()
  const value=raw as Record<string,unknown>,state=value.state,keys=["request_id","state",...(state==="succeeded"?["result_sha256"]:[]),...(Object.hasOwn(value,"completion_sha256")?["completion_sha256"]:[]),...(state!=="succeeded"&&Object.hasOwn(value,"result_sha256")?["result_sha256"]:[])]
  const v=assessmentObject(raw,keys),completion=Object.hasOwn(v,"completion_sha256")?{completion_sha256:assessmentSha(v.completion_sha256)}:{}
  if(state==="succeeded")return {request_id:id(v.request_id),state,result_sha256:assessmentSha(v.result_sha256),...completion}
  if(state!=="failed"&&state!=="unknown"&&state!=="paused")return invalid()
  if(state==="paused"){if(Object.hasOwn(v,"result_sha256")||Object.hasOwn(v,"completion_sha256"))return invalid();return {request_id:id(v.request_id),state}}
  if(Object.hasOwn(v,"result_sha256")&&v.result_sha256!==null)return invalid()
  return {request_id:id(v.request_id),state,...completion}
}
export function normalizeAgentAssessmentCompletion(purpose:AgentAssessmentPurpose,raw:unknown):AgentAssessmentCompletion{
  if(purpose!=="evaluate"&&purpose!=="optimize")return invalid()
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  for(const key of Reflect.ownKeys(raw))if(typeof key!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,key)??{},"value"))return invalid()
  const status=(raw as Record<string,unknown>).status
  const v=assessmentObject(raw,status==="succeeded"?["status","result"]:["status","failure_code"])
  if(status==="succeeded")return {status,result:purpose==="evaluate"?parseAgentEvaluationOutput(v.result):parseAgentOptimizationOutput(v.result)}
  if(status!=="failed"&&status!=="unknown"||typeof v.failure_code!=="string"||!/^[a-z][a-z0-9_]{0,63}$/.test(v.failure_code))return invalid()
  return {status,failure_code:v.failure_code}
}
export function agentAssessmentOutputHash(requestId:string,purpose:AgentAssessmentPurpose,inputHash:string,result:unknown):string{
  const normalized=normalizeAgentAssessmentCompletion(purpose,{status:"succeeded",result})
  if(normalized.status!=="succeeded")return invalid()
  return agentMemoryHash(canonicalMcpJson({protocol:"agent_paid_review_output_v1",request_id:id(requestId),purpose,input_sha256:assessmentSha(inputHash),result:normalized.result}))
}
