/** Closed browser-only review protocol. No Node, backend runtime or authority. */
export type PgNativeAgentReviewPurpose="evaluate"|"optimize"
export type PgNativeAgentReviewTarget={purpose:PgNativeAgentReviewPurpose;spec_id:string;run_id:string}
export type PgNativeAgentReviewModelBinding={connection_id:string;connection_revision:number;model_id:string}
export type PgNativeAgentReviewFeedbackSource={run_id:string;feedback_id:string;feedback_sha256:string}
export type PgNativeAgentReviewSelection={model_binding:PgNativeAgentReviewModelBinding;output_token_limit:2048|4096|8192|16384;feedback_sources:PgNativeAgentReviewFeedbackSource[]}
export type PgNativeAgentReviewChoice=PgNativeAgentReviewTarget&PgNativeAgentReviewSelection&{action:"preview";expected_source_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;evaluation_sources:[]}
export type PgNativeAgentReviewSubmission=Omit<PgNativeAgentReviewChoice,"action">&{action:"submit";request_id:string;expected_input_sha256:string;confirm:true;fee_acknowledgement:typeof agentReviewFeeAcknowledgements[PgNativeAgentReviewPurpose]}
export type PgNativeAgentReviewControl={action:"cancel"|"erase";request_id:string;review_id:string;expected_request_sha256:string;confirm:true}
type SourceProtocol="current_task_delivery_v1"|"employee_statement_anchor_v1"
export type PgNativeAgentReviewSource=PgNativeAgentReviewTarget&{protocol:"agent_review_source_v1";expected_source_sha256:string;expected_spec_revision:number;expected_spec_sha256:string;source_protocol:SourceProtocol;recorded:false}
export type PgNativeAgentReviewPreview={protocol:"agent_paid_review_preview_v1";choice:PgNativeAgentReviewChoice;input_sha256:string;content_sha256:string;owner_epoch:number;source_protocol:SourceProtocol;byte_length:number;output_token_limit:PgNativeAgentReviewSelection["output_token_limit"];recorded:false}
export type PgNativeAgentReviewRequest=PgNativeAgentReviewTarget&{request_id:string;request_sha256:string;input_sha256:string;content_sha256:string;owner_epoch:number;source_protocol:SourceProtocol;created_at:string}
type JobState="pending"|"cancelled"|"erased"
type LeaseState="claimed"|"reserved"|"paused"|"succeeded"|"failed"|"unknown"|null
export type PgNativeAgentReviewReceipt=PgNativeAgentReviewRequest&{protocol:"agent_paid_review_receipt_v1";state:JobState;body_erased:boolean;recorded:true;replayed:boolean}
export type PgNativeAgentReviewControlReceipt={protocol:"agent_paid_review_control_receipt_v1";request_id:string;review_id:string;action:"cancel"|"erase";request_sha256:string;created_at:string;recorded:true;replayed:boolean}
export type PgNativeAgentReviewEvaluation={score:number;dimensions:Array<{name:string;score:number;comment:string}>;suggestions:string[]}
export type PgNativeAgentReviewOptimization={descriptive:Partial<{goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[]}>;tools_note:string;rationale:string}
export type PgNativeAgentReviewResult=PgNativeAgentReviewEvaluation|PgNativeAgentReviewOptimization
export type PgNativeAgentReviewOutcome={status:"succeeded";completion_sha256:string;result_sha256:string;failure_code:null;created_at:string}|{status:"failed"|"unknown";completion_sha256:string;result_sha256:null;failure_code:string;created_at:string}
export type PgNativeAgentReviewView={protocol:"agent_paid_review_view_v1";request:PgNativeAgentReviewRequest;execution:{job_state:JobState;lease_state:LeaseState;outcome:PgNativeAgentReviewOutcome|null};body_erased:boolean}&({available:false;result:null}|{available:true;result:PgNativeAgentReviewResult})
export const agentReviewFeeAcknowledgements=Object.freeze({evaluate:"APPROVE_ONE_PAID_AGENT_EVALUATION_V1",optimize:"APPROVE_ONE_PAID_AGENT_OPTIMIZATION_V1"} as const)
export const agentReviewScoreDimensions=Object.freeze(["目标达成","过程效率","工具使用","输出质量","指令遵循"] as const)
const invalid=():never=>{throw Error("invalid_agent_review_projection")}
function object(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const own=Reflect.ownKeys(raw)
  if(own.some(k=>typeof k!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value"))||keys&&(own.length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k))))return invalid()
  return raw as Record<string,unknown>
}
function array(raw:unknown,max:number):unknown[]{
  if(!Array.isArray(raw)||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return invalid()
  for(let i=0;i<raw.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return invalid()
  return raw
}
export function agentReviewId(raw:unknown,strict=false):string{if(typeof raw!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw)||strict&&raw!==raw.toLowerCase())return invalid();return raw.toLowerCase()}
const hash=(v:unknown):string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)?v:invalid()
const positive=(v:unknown,max=Number.MAX_SAFE_INTEGER-2):number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=1&&v<=max?v:invalid()
const purpose=(v:unknown):PgNativeAgentReviewPurpose=>v==="evaluate"||v==="optimize"?v:invalid()
const sourceProtocol=(p:PgNativeAgentReviewPurpose,v:unknown):SourceProtocol=>v===(p==="evaluate"?"current_task_delivery_v1":"employee_statement_anchor_v1")?v as SourceProtocol:invalid()
function time(v:unknown):string{
  if(typeof v!=="string"||v.length>40||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v))return invalid()
  const n=Date.parse(v);if(!Number.isFinite(n)||new Date(v.slice(0,10)+"T00:00:00.000Z").toISOString().slice(0,10)!==v.slice(0,10))return invalid();return new Date(n).toISOString()
}
// Canonical ordering exactly matches the existing protocol, after closed parsing.
export function agentReviewCanonical(value:unknown):string{
  const order=(v:unknown):unknown=>Array.isArray(v)?array(v,100).map(order):v&&typeof v==="object"?Object.fromEntries(Object.entries(object(v)).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,item])=>[k,order(item)])):v
  return JSON.stringify(order(value))
}
const sha=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(agentReviewCanonical(value)))),b=>b.toString(16).padStart(2,"0")).join("")
export function agentReviewTarget(raw:unknown):PgNativeAgentReviewTarget{const v=object(raw,["purpose","spec_id","run_id"]);return {purpose:purpose(v.purpose),spec_id:agentReviewId(v.spec_id),run_id:agentReviewId(v.run_id)}}
const sameTarget=(a:PgNativeAgentReviewTarget,b:PgNativeAgentReviewTarget)=>a.purpose===b.purpose&&a.spec_id===b.spec_id&&a.run_id===b.run_id
const choiceKeys=["action","purpose","spec_id","run_id","expected_source_sha256","expected_spec_revision","expected_spec_sha256","model_binding","output_token_limit","feedback_sources","evaluation_sources"]
function fields(v:Record<string,unknown>){
  const selected=purpose(v.purpose),model=object(v.model_binding,["connection_id","connection_revision","model_id"])
  if(typeof model.model_id!=="string"||!/^[A-Za-z0-9._:/-]{1,120}$/.test(model.model_id)||typeof v.output_token_limit!=="number"||![2048,4096,8192,16384].includes(v.output_token_limit)||array(v.evaluation_sources,0).length)return invalid()
  const feedback_sources=array(v.feedback_sources,8).map(raw=>{const f=object(raw,["run_id","feedback_id","feedback_sha256"]);return {run_id:agentReviewId(f.run_id),feedback_id:agentReviewId(f.feedback_id),feedback_sha256:hash(f.feedback_sha256)}})
  if(new Set(feedback_sources.map(f=>f.run_id)).size!==feedback_sources.length||new Set(feedback_sources.map(f=>f.feedback_id)).size!==feedback_sources.length||selected==="evaluate"&&feedback_sources.length||selected==="optimize"&&!feedback_sources.length)return invalid()
  return {purpose:selected,spec_id:agentReviewId(v.spec_id),run_id:agentReviewId(v.run_id),expected_source_sha256:hash(v.expected_source_sha256),expected_spec_revision:positive(v.expected_spec_revision),expected_spec_sha256:hash(v.expected_spec_sha256),model_binding:{connection_id:agentReviewId(model.connection_id),connection_revision:positive(model.connection_revision,Number.MAX_SAFE_INTEGER),model_id:model.model_id},output_token_limit:v.output_token_limit as PgNativeAgentReviewSelection["output_token_limit"],feedback_sources,evaluation_sources:[] as []}
}
export function agentReviewChoice(raw:unknown):PgNativeAgentReviewChoice{const v=object(raw,choiceKeys);if(v.action!=="preview")return invalid();return {...fields(v),action:"preview"}}
export function agentReviewSubmission(raw:unknown):PgNativeAgentReviewSubmission{
  const v=object(raw,[...choiceKeys,"request_id","expected_input_sha256","confirm","fee_acknowledgement"]),f=fields(v),request_id=agentReviewId(v.request_id)
  if(v.action!=="submit"||v.confirm!==true||v.fee_acknowledgement!==agentReviewFeeAcknowledgements[f.purpose]||f.feedback_sources.some(s=>s.feedback_id===request_id))return invalid()
  return {...f,action:"submit",request_id,expected_input_sha256:hash(v.expected_input_sha256),confirm:true,fee_acknowledgement:agentReviewFeeAcknowledgements[f.purpose]}
}
export async function agentReviewIntentHash(raw:unknown):Promise<string>{return sha({protocol:"agent_paid_review_intent_v1",...agentReviewSubmission(raw)})}
export function agentReviewControl(raw:unknown):PgNativeAgentReviewControl{
  const v=object(raw,["action","request_id","review_id","expected_request_sha256","confirm"]),request_id=agentReviewId(v.request_id),review_id=agentReviewId(v.review_id)
  if(v.action!=="cancel"&&v.action!=="erase"||v.confirm!==true||request_id===review_id)return invalid()
  return {action:v.action,request_id,review_id,expected_request_sha256:hash(v.expected_request_sha256),confirm:true}
}
export function agentReviewSource(raw:unknown,input:PgNativeAgentReviewTarget):PgNativeAgentReviewSource{
  const v=object(raw,["protocol","purpose","spec_id","run_id","expected_source_sha256","expected_spec_revision","expected_spec_sha256","source_protocol","recorded"]),target=agentReviewTarget(input),p=purpose(v.purpose)
  const selected={purpose:p,spec_id:agentReviewId(v.spec_id,true),run_id:agentReviewId(v.run_id,true)}
  if(v.protocol!=="agent_review_source_v1"||v.recorded!==false||!sameTarget(selected,target))return invalid()
  return {protocol:"agent_review_source_v1",...selected,expected_source_sha256:hash(v.expected_source_sha256),expected_spec_revision:positive(v.expected_spec_revision),expected_spec_sha256:hash(v.expected_spec_sha256),source_protocol:sourceProtocol(p,v.source_protocol),recorded:false}
}
export function agentReviewPreview(raw:unknown,input:PgNativeAgentReviewChoice):PgNativeAgentReviewPreview{
  const v=object(raw,["protocol","choice","input_sha256","content_sha256","owner_epoch","source_protocol","byte_length","output_token_limit","recorded"]),choice=agentReviewChoice(v.choice),expected=agentReviewChoice(input)
  if(v.protocol!=="agent_paid_review_preview_v1"||v.recorded!==false||agentReviewCanonical(choice)!==agentReviewCanonical(v.choice)||agentReviewCanonical(choice)!==agentReviewCanonical(expected)||v.output_token_limit!==choice.output_token_limit)return invalid()
  return {protocol:"agent_paid_review_preview_v1",choice,input_sha256:hash(v.input_sha256),content_sha256:hash(v.content_sha256),owner_epoch:positive(v.owner_epoch),source_protocol:sourceProtocol(choice.purpose,v.source_protocol),byte_length:positive(v.byte_length,262144),output_token_limit:choice.output_token_limit,recorded:false}
}
export function agentReviewChoiceFromSelection(source:PgNativeAgentReviewSource,raw:unknown):PgNativeAgentReviewChoice{
  const v=object(raw,["model_binding","output_token_limit","feedback_sources"])
  return agentReviewChoice({action:"preview",purpose:source.purpose,spec_id:source.spec_id,run_id:source.run_id,expected_source_sha256:source.expected_source_sha256,expected_spec_revision:source.expected_spec_revision,expected_spec_sha256:source.expected_spec_sha256,model_binding:v.model_binding,output_token_limit:v.output_token_limit,feedback_sources:v.feedback_sources,evaluation_sources:[]})
}
const requestKeys=["request_id","spec_id","run_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","created_at"]
function request(v:Record<string,unknown>):PgNativeAgentReviewRequest{const p=purpose(v.purpose);return {request_id:agentReviewId(v.request_id,true),spec_id:agentReviewId(v.spec_id,true),run_id:agentReviewId(v.run_id,true),purpose:p,request_sha256:hash(v.request_sha256),input_sha256:hash(v.input_sha256),content_sha256:hash(v.content_sha256),owner_epoch:positive(v.owner_epoch),source_protocol:sourceProtocol(p,v.source_protocol),created_at:time(v.created_at)}}
function privacy(raw:unknown,state:JobState):boolean{if(typeof raw!=="boolean"||raw!==(state==="erased"))return invalid();return raw}
function job(v:unknown):JobState{if(v!=="pending"&&v!=="cancelled"&&v!=="erased")return invalid();return v}
export async function agentReviewReceipt(raw:unknown,input:PgNativeAgentReviewSubmission,confirmOnly=false):Promise<PgNativeAgentReviewReceipt>{
  const v=object(raw,["protocol",...requestKeys,"state","body_erased","recorded","replayed"]),r=request(v),choice=agentReviewSubmission(input),state=job(v.state),body_erased=privacy(v.body_erased,state),replayed=v.replayed
  if(v.protocol!=="agent_paid_review_receipt_v1"||v.recorded!==true||typeof replayed!=="boolean"||confirmOnly&&!replayed||r.request_id!==choice.request_id||!sameTarget(r,choice)||r.input_sha256!==choice.expected_input_sha256||r.request_sha256!==await agentReviewIntentHash(choice))return invalid()
  return {protocol:"agent_paid_review_receipt_v1",...r,state,body_erased,recorded:true,replayed}
}
export async function agentReviewControlReceipt(raw:unknown,input:PgNativeAgentReviewControl,confirmOnly=false):Promise<PgNativeAgentReviewControlReceipt>{
  const v=object(raw,["protocol","request_id","review_id","action","request_sha256","created_at","recorded","replayed"]),c=agentReviewControl(input),request_sha256=hash(v.request_sha256),created_at=time(v.created_at),replayed=v.replayed
  if(v.protocol!=="agent_paid_review_control_receipt_v1"||v.request_id!==c.request_id||v.review_id!==c.review_id||v.action!==c.action||v.recorded!==true||typeof replayed!=="boolean"||confirmOnly&&!replayed||request_sha256!==await sha({protocol:"agent_paid_review_control_v1",...c}))return invalid()
  return {protocol:"agent_paid_review_control_receipt_v1",request_id:c.request_id,review_id:c.review_id,action:c.action,request_sha256,created_at,recorded:true,replayed}
}
function text(raw:unknown,max:number,required=false):string{
  if(typeof raw!=="string"||raw.length>max||raw!==raw.trim()||required&&!raw||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(raw))return invalid()
  for(const c of raw)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalid()
  if(raw.replace(/sk-[A-Za-z0-9_-]{8,}/g,"***").replace(/Bearer\s+\S+/g,"Bearer ***").replace(/token=\S+/g,"token=***").replace(/api_key=\S+/g,"api_key=***")!==raw)return invalid()
  return raw
}
const score=(raw:unknown):number=>typeof raw==="number"&&Number.isInteger(raw)&&raw>=0&&raw<=100?raw:invalid()
export function agentReviewResult(p:PgNativeAgentReviewPurpose,raw:unknown):PgNativeAgentReviewResult{
  if(p==="evaluate"){
    const v=object(raw,["score","dimensions","suggestions"]),dimensions=array(v.dimensions,5)
    if(dimensions.length!==5)return invalid()
    return {score:score(v.score),dimensions:dimensions.map((raw,i)=>{const d=object(raw,["name","score","comment"]);if(d.name!==agentReviewScoreDimensions[i])return invalid();return {name:agentReviewScoreDimensions[i]!,score:score(d.score),comment:text(d.comment,120,true)}}),suggestions:array(v.suggestions,5).map(v=>text(v,200,true))}
  }
  if(p!=="optimize")return invalid()
  const v=object(raw,["descriptive","tools_note","rationale"]),d=object(v.descriptive),keys=["goal","task_scope","deliverables","task_plan","done_criteria"] as const
  if(!Object.keys(d).length||Object.keys(d).some(k=>!keys.includes(k as typeof keys[number])))return invalid()
  const descriptive:PgNativeAgentReviewOptimization["descriptive"]={}
  for(const k of keys)if(Object.hasOwn(d,k)){if(k==="goal"||k==="task_scope")descriptive[k]=text(d[k],k==="goal"?3000:4000,k==="goal");else descriptive[k]=array(d[k],30).map(v=>text(v,500))}
  return {descriptive,tools_note:text(v.tools_note,400),rationale:text(v.rationale,400,true)}
}
export async function agentReviewOutputHash(requestId:string,p:PgNativeAgentReviewPurpose,inputHash:string,raw:unknown):Promise<string>{return sha({protocol:"agent_paid_review_output_v1",request_id:agentReviewId(requestId),purpose:purpose(p),input_sha256:hash(inputHash),result:agentReviewResult(p,raw)})}
function outcome(raw:unknown):PgNativeAgentReviewOutcome|null{
  if(raw===null)return null
  const v=object(raw,["status","completion_sha256","result_sha256","failure_code","created_at"]),completion_sha256=hash(v.completion_sha256),created_at=time(v.created_at)
  if(v.status==="succeeded"){if(v.failure_code!==null)return invalid();return {status:v.status,completion_sha256,result_sha256:hash(v.result_sha256),failure_code:null,created_at}}
  if(v.status!=="failed"&&v.status!=="unknown"||v.result_sha256!==null||typeof v.failure_code!=="string"||!/^[a-z][a-z0-9_]{0,63}$/.test(v.failure_code))return invalid()
  return {status:v.status,completion_sha256,result_sha256:null,failure_code:v.failure_code,created_at}
}
export async function agentReviewView(raw:unknown,reviewId:string):Promise<PgNativeAgentReviewView>{
  const v=object(raw,["protocol","request","execution","body_erased","available","result"]),r=request(object(v.request,requestKeys)),e=object(v.execution,["job_state","lease_state","outcome"]),job_state=job(e.job_state),lease=e.lease_state,o=outcome(e.outcome)
  if(v.protocol!=="agent_paid_review_view_v1"||r.request_id!==agentReviewId(reviewId)||typeof v.available!=="boolean"||lease!==null&&(typeof lease!=="string"||!["claimed","reserved","paused","succeeded","failed","unknown"].includes(lease))||o&&lease!==o.status||!o&&["succeeded","failed","unknown"].includes(lease as string))return invalid()
  const base={protocol:"agent_paid_review_view_v1" as const,request:r,execution:{job_state,lease_state:lease as LeaseState,outcome:o},body_erased:privacy(v.body_erased,job_state)}
  if(!v.available){if(v.result!==null)return invalid();return {...base,available:false,result:null}}
  if(job_state!=="pending"||base.body_erased||o?.status!=="succeeded"||lease!=="succeeded")return invalid()
  const result=agentReviewResult(r.purpose,v.result)
  if(await agentReviewOutputHash(r.request_id,r.purpose,r.input_sha256,result)!==o.result_sha256)return invalid()
  return {...base,available:true,result}
}
