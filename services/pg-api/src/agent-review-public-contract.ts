// Public metadata projection only. Private prepared messages are never read,
// spread, serialized or returned by this module. No source/consent authority.
import {HttpError,isUuid} from "./contracts.ts"
import {parseAgentReviewPreview,parseAgentReviewSubmission,type AgentReviewPreview} from "./agent-review-contract.ts"
import {parseAgentReviewControl} from "./agent-review-control.ts"
import type {AgentReviewReceipt,AgentReviewControlReceipt} from "./agent-review-ledger.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"

export type AgentReviewTarget={purpose:"evaluate"|"optimize";spec_id:string;run_id:string}
export type AgentReviewPublicPreview={protocol:"agent_paid_review_preview_v1";choice:AgentReviewPreview;input_sha256:string;content_sha256:string;owner_epoch:number;source_protocol:"current_task_delivery_v1"|"employee_statement_anchor_v1";byte_length:number;output_token_limit:2048|4096|8192|16384;recorded:false}
const invalid=():never=>{throw new HttpError(400,"invalid_agent_review_request")}
const unavailable=():never=>{throw new HttpError(502,"agent_review_response_unavailable")}
function object(raw:unknown,keys:string[]):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const value=raw as Record<string,unknown>
  if(Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k)??{},"value")))return invalid()
  return value
}
const id=(raw:unknown)=>isUuid(raw)?raw.toLowerCase():invalid()
const hash=(raw:unknown)=>typeof raw==="string"&&/^[a-f0-9]{64}$/.test(raw)?raw:invalid()
function revision(raw:unknown):number{if(typeof raw!=="number"||!Number.isSafeInteger(raw)||raw<1||raw>Number.MAX_SAFE_INTEGER-2)return invalid();return raw}
const purpose=(raw:unknown):AgentReviewTarget["purpose"]=>raw==="evaluate"||raw==="optimize"?raw:invalid()
const protocol=(selected:AgentReviewTarget["purpose"])=>selected==="evaluate"?"current_task_delivery_v1" as const:"employee_statement_anchor_v1" as const
function date(raw:unknown):string{if(typeof raw!=="string"||raw.length!==24||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString()!==raw)return invalid();return raw}
export function parseAgentReviewTarget(raw:unknown):AgentReviewTarget{
  const value=object(raw,["purpose","spec_id","run_id"])
  return {purpose:purpose(value.purpose),spec_id:id(value.spec_id),run_id:id(value.run_id)}
}
export function parsePublicAgentReviewChoice(raw:unknown):AgentReviewPreview{
  const choice=parseAgentReviewPreview(raw)
  if(choice.evaluation_sources.length)throw new HttpError(409,"agent_review_evaluation_source_unavailable")
  return choice
}
export function publicAgentReviewSource(raw:unknown,target:AgentReviewTarget){
  try{
    const value=object(raw,["protocol","purpose","spec_id","run_id","expected_source_sha256","expected_spec_revision","expected_spec_sha256","source_protocol","recorded"])
    if(value.protocol!=="agent_review_source_v1"||value.recorded!==false||value.purpose!==target.purpose||value.spec_id!==target.spec_id||value.run_id!==target.run_id||value.source_protocol!==protocol(target.purpose))return unavailable()
    return {protocol:"agent_review_source_v1" as const,...target,expected_source_sha256:hash(value.expected_source_sha256),expected_spec_revision:revision(value.expected_spec_revision),expected_spec_sha256:hash(value.expected_spec_sha256),source_protocol:protocol(target.purpose),recorded:false as const}
  }catch{return unavailable()}
}
export function publicAgentReviewPreview(raw:unknown,selected:AgentReviewPreview):AgentReviewPublicPreview{
  try{
    const value=object(raw,["protocol","choice","messages","input_sha256","content_sha256","owner_epoch","source_protocol","byte_length","output_token_limit","recorded"])
    const choice=parsePublicAgentReviewChoice(value.choice)
    if(value.protocol!=="agent_paid_review_prepared_input_v1"||value.recorded!==false||canonicalMcpJson(choice)!==canonicalMcpJson(selected)||canonicalMcpJson(choice)!==canonicalMcpJson(value.choice)||value.source_protocol!==protocol(choice.purpose)||value.output_token_limit!==choice.output_token_limit||typeof value.byte_length!=="number"||!Number.isSafeInteger(value.byte_length)||value.byte_length<1||value.byte_length>262144)return unavailable()
    return {protocol:"agent_paid_review_preview_v1",choice,input_sha256:hash(value.input_sha256),content_sha256:hash(value.content_sha256),owner_epoch:revision(value.owner_epoch),source_protocol:protocol(choice.purpose),byte_length:value.byte_length,output_token_limit:choice.output_token_limit,recorded:false}
  }catch{return unavailable()}
}
export function publicAgentReviewReceipt(raw:unknown,original:unknown):AgentReviewReceipt{
  try{
    const intent=parseAgentReviewSubmission(original),value=object(raw,["protocol","request_id","spec_id","run_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","created_at","state","body_erased","recorded","replayed"])
    if(value.protocol!=="agent_paid_review_receipt_v1"||value.request_id!==intent.request_id||value.spec_id!==intent.spec_id||value.run_id!==intent.run_id||value.purpose!==intent.purpose||value.request_sha256!==intent.request_sha256||value.input_sha256!==intent.expected_input_sha256||value.source_protocol!==protocol(intent.purpose)||!["pending","cancelled","erased"].includes(value.state as string)||value.body_erased!==(value.state==="erased")||value.recorded!==true||typeof value.replayed!=="boolean")return unavailable()
    return {protocol:"agent_paid_review_receipt_v1",request_id:intent.request_id,spec_id:intent.spec_id,run_id:intent.run_id,purpose:intent.purpose,request_sha256:intent.request_sha256,input_sha256:intent.expected_input_sha256,content_sha256:hash(value.content_sha256),owner_epoch:revision(value.owner_epoch),source_protocol:protocol(intent.purpose),created_at:date(value.created_at),state:value.state as AgentReviewReceipt["state"],body_erased:value.body_erased,recorded:true,replayed:value.replayed}
  }catch{return unavailable()}
}
export function publicAgentReviewControlReceipt(raw:unknown,original:unknown):AgentReviewControlReceipt{
  try{
    const intent=parseAgentReviewControl(original),value=object(raw,["protocol","request_id","review_id","action","request_sha256","created_at","recorded","replayed"])
    if(value.protocol!=="agent_paid_review_control_receipt_v1"||value.request_id!==intent.request_id||value.review_id!==intent.review_id||value.action!==intent.action||value.request_sha256!==intent.request_sha256||value.recorded!==true||typeof value.replayed!=="boolean")return unavailable()
    return {protocol:"agent_paid_review_control_receipt_v1",request_id:intent.request_id,review_id:intent.review_id,action:intent.action,request_sha256:intent.request_sha256,created_at:date(value.created_at),recorded:true,replayed:value.replayed}
  }catch{return unavailable()}
}
