// Optional058 closed read DTOs. No browser authority, source reader, provider
// call, fee/refund assertion or role acceptance is supplied by this contract.
import {HttpError,isUuid} from "./contracts.ts"
import {parseAgentReviewPreview,parseAgentReviewSubmission,agentReviewFees,parseAgentEvaluationOutput,parseAgentOptimizationOutput,type AgentReviewPreview} from "./agent-review-contract.ts"
import {agentAssessmentOutputHash} from "./agent-assessment-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"

export type AgentOpinionPurpose="evaluate"|"optimize"
export type AgentOpinionJobState="pending"|"cancelled"|"erased"
export type AgentOpinionLeaseState="claimed"|"reserved"|"paused"|"succeeded"|"failed"|"unknown"|null
export type AgentOpinionOutcome={status:"succeeded";completion_sha256:string;result_sha256:string;failure_code:null;created_at:string}|{status:"failed"|"unknown";completion_sha256:string;result_sha256:null;failure_code:string;created_at:string}
export type AgentOpinionRequest={request_id:string;spec_id:string;run_id:string;purpose:AgentOpinionPurpose;request_sha256:string;input_sha256:string;content_sha256:string;owner_epoch:number;source_protocol:"current_task_delivery_v1"|"employee_statement_anchor_v1";created_at:string}
export type AgentOpinionResult=ReturnType<typeof parseAgentEvaluationOutput>|ReturnType<typeof parseAgentOptimizationOutput>
export type AgentOpinionAnchor=AgentOpinionRequest&{protocol:"agent_paid_review_read_anchor_v1";job_state:AgentOpinionJobState;lease_state:AgentOpinionLeaseState;outcome:AgentOpinionOutcome|null;body_erased:boolean;choice:AgentReviewPreview|null}
export type AgentOpinionBody={request_id:string;purpose:AgentOpinionPurpose;input_sha256:string;result_sha256:string;result:AgentOpinionResult}
export type AgentOpinionView={protocol:"agent_paid_review_view_v1";request:AgentOpinionRequest;execution:{job_state:AgentOpinionJobState;lease_state:AgentOpinionLeaseState;outcome:AgentOpinionOutcome|null};body_erased:boolean}&({available:false;result:null}|{available:true;result:AgentOpinionResult})

const invalid=():never=>{throw new HttpError(400,"agent_opinion_invalid_read")}
function object(raw:unknown,keys:string[]):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const v=raw as Record<string,unknown>
  if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},"value")))return invalid()
  return v
}
export function parseAgentOpinionReviewId(raw:unknown):string{return isUuid(raw)?raw.toLowerCase():invalid()}
function hash(raw:unknown):string{if(typeof raw!=="string"||!/^[a-f0-9]{64}$/.test(raw))return invalid();return raw}
function epoch(raw:unknown):number{if(typeof raw!=="number"||!Number.isSafeInteger(raw)||raw<1||raw>Number.MAX_SAFE_INTEGER-2)return invalid();return raw}
function date(raw:unknown):string{
  if(typeof raw!=="string"||raw.length>40||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(raw))return invalid()
  const value=Date.parse(raw);if(!Number.isFinite(value)||new Date(raw.slice(0,10)+"T00:00:00.000Z").toISOString().slice(0,10)!==raw.slice(0,10))return invalid();return new Date(value).toISOString()
}
function purpose(raw:unknown):AgentOpinionPurpose{if(raw!=="evaluate"&&raw!=="optimize")return invalid();return raw}
const requestKeys=["request_id","spec_id","run_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","created_at"]
function request(v:Record<string,unknown>):AgentOpinionRequest{
  const selected=purpose(v.purpose),source_protocol=selected==="evaluate"?"current_task_delivery_v1":"employee_statement_anchor_v1"
  if(v.source_protocol!==source_protocol)return invalid()
  return {request_id:parseAgentOpinionReviewId(v.request_id),spec_id:parseAgentOpinionReviewId(v.spec_id),run_id:parseAgentOpinionReviewId(v.run_id),purpose:selected,request_sha256:hash(v.request_sha256),input_sha256:hash(v.input_sha256),content_sha256:hash(v.content_sha256),owner_epoch:epoch(v.owner_epoch),source_protocol,created_at:date(v.created_at)}
}
function outcome(raw:unknown):AgentOpinionOutcome|null{
  if(raw===null)return null
  const v=object(raw,["status","completion_sha256","result_sha256","failure_code","created_at"]),completion_sha256=hash(v.completion_sha256),created_at=date(v.created_at)
  if(v.status==="succeeded"){if(v.failure_code!==null)return invalid();return {status:v.status,completion_sha256,result_sha256:hash(v.result_sha256),failure_code:null,created_at}}
  if(v.status!=="failed"&&v.status!=="unknown"||v.result_sha256!==null||typeof v.failure_code!=="string"||!/^[a-z][a-z0-9_]{0,63}$/.test(v.failure_code))return invalid()
  return {status:v.status,completion_sha256,result_sha256:null,failure_code:v.failure_code,created_at}
}
function execution(v:Record<string,unknown>):{job_state:AgentOpinionJobState;lease_state:AgentOpinionLeaseState;outcome:AgentOpinionOutcome|null}{
  if(v.job_state!=="pending"&&v.job_state!=="cancelled"&&v.job_state!=="erased"||v.lease_state!==null&&(typeof v.lease_state!=="string"||!["claimed","reserved","paused","succeeded","failed","unknown"].includes(v.lease_state)))return invalid()
  return {job_state:v.job_state,lease_state:v.lease_state as AgentOpinionLeaseState,outcome:outcome(v.outcome)}
}
function privacy(raw:unknown,job:AgentOpinionJobState):boolean{if(typeof raw!=="boolean"||raw!==(job==="erased"))return invalid();return raw}
function result(p:AgentOpinionPurpose,raw:unknown):AgentOpinionResult{
  try{
    const normalized=p==="evaluate"?parseAgentEvaluationOutput(raw):parseAgentOptimizationOutput(raw)
    if(canonicalMcpJson(normalized)!==canonicalMcpJson(raw))return invalid()
    return normalized
  }catch{return invalid()}
}
export function parseAgentOpinionAnchor(raw:unknown):AgentOpinionAnchor{
  const v=object(raw,["protocol",...requestKeys,"job_state","lease_state","outcome","body_erased","choice"])
  if(v.protocol!=="agent_paid_review_read_anchor_v1")return invalid()
  const r=request(v),e=execution(v),body_erased=privacy(v.body_erased,e.job_state)
  let choice:AgentReviewPreview|null=null
  if(v.choice!==null){
    if(e.job_state!=="pending"||body_erased||e.outcome?.status!=="succeeded")return invalid()
    try{
      choice=parseAgentReviewPreview(v.choice)
      if(choice.purpose!==r.purpose||choice.spec_id!==r.spec_id||choice.run_id!==r.run_id||choice.evaluation_sources.length||canonicalMcpJson(choice)!==canonicalMcpJson(v.choice))return invalid()
      // Consistency check of an immutable existing intent only. This creates
      // no submission, consent record or authority and never transmits input.
      const sealed=parseAgentReviewSubmission({...choice,action:"submit",request_id:r.request_id,expected_input_sha256:r.input_sha256,confirm:true,fee_acknowledgement:agentReviewFees[r.purpose]})
      if(sealed.request_sha256!==r.request_sha256)return invalid()
    }catch{return invalid()}
  }
  return {protocol:"agent_paid_review_read_anchor_v1",...r,...e,body_erased,choice}
}
export function parseAgentOpinionBody(raw:unknown):AgentOpinionBody{
  const v=object(raw,["request_id","purpose","input_sha256","result_sha256","result"]),request_id=parseAgentOpinionReviewId(v.request_id),selected=purpose(v.purpose),input_sha256=hash(v.input_sha256),result_sha256=hash(v.result_sha256),parsed=result(selected,v.result)
  if(agentAssessmentOutputHash(request_id,selected,input_sha256,parsed)!==result_sha256)return invalid()
  return {request_id,purpose:selected,input_sha256,result_sha256,result:parsed}
}
export function parseAgentOpinionView(raw:unknown):AgentOpinionView{
  const v=object(raw,["protocol","request","execution","body_erased","available","result"])
  if(v.protocol!=="agent_paid_review_view_v1"||typeof v.available!=="boolean")return invalid()
  const r=request(object(v.request,requestKeys)),e=execution(object(v.execution,["job_state","lease_state","outcome"])),body_erased=privacy(v.body_erased,e.job_state)
  const base={protocol:"agent_paid_review_view_v1" as const,request:r,execution:e,body_erased}
  if(!v.available){if(v.result!==null)return invalid();return {...base,available:false,result:null}}
  if(e.job_state!=="pending"||body_erased||e.outcome?.status!=="succeeded")return invalid()
  const parsed=result(r.purpose,v.result)
  if(agentAssessmentOutputHash(r.request_id,r.purpose,r.input_sha256,parsed)!==e.outcome.result_sha256)return invalid()
  return {...base,available:true,result:parsed}
}
