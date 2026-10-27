/** Browser-safe metadata discovery. A history item is never a submission receipt. */
import {agentReviewId,agentReviewTarget,agentReviewCanonical,type PgNativeAgentReviewTarget,type PgNativeAgentReviewRequest} from "./pgNativeAgentReview.ts"

export type PgNativeAgentReviewHistoryQuery=PgNativeAgentReviewTarget&{limit?:number;before?:string|null}
export type PgNativeAgentReviewHistoryItem={request:PgNativeAgentReviewRequest;control:{job_state:"pending"|"cancelled"|"erased";body_erased:boolean}}
export type PgNativeAgentReviewHistoryPage=PgNativeAgentReviewTarget&{protocol:"agent_paid_review_history_v1";items:PgNativeAgentReviewHistoryItem[];limit:number;has_more:boolean;next_cursor:string|null}
type Cursor={created_at:string;request_id:string}
const invalid=(code="invalid_agent_review_history_projection"):never=>{throw Error(code)}
function object(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const own=Reflect.ownKeys(raw)
  if(own.some(k=>typeof k!=="string"||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value"))||keys&&(own.length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k))))return invalid()
  return raw as Record<string,unknown>
}
function array(raw:unknown):unknown[]{
  if(!Array.isArray(raw)||raw.length>20||Reflect.ownKeys(raw).length!==raw.length+1)return invalid()
  for(let i=0;i<raw.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return invalid()
  return raw
}
const hash=(v:unknown):string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)?v:invalid()
function epoch(v:unknown):number{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<1||v>Number.MAX_SAFE_INTEGER-2)return invalid();return v}
function time(raw:unknown,micro=false):string{
  const pattern=micro?/^(?!0000)\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/:/^(?!0000)\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/
  if(typeof raw!=="string"||!pattern.test(raw))return invalid()
  const value=Date.parse(raw),milliseconds=micro?raw.slice(0,23)+"Z":raw
  if(!Number.isFinite(value)||new Date(value).toISOString()!==milliseconds)return invalid()
  return raw
}
function encode(value:string):string{return btoa(Array.from(new TextEncoder().encode(value),v=>String.fromCharCode(v)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
export function agentReviewHistoryCursor(raw:unknown):Cursor{
  try{
    if(typeof raw!=="string"||raw.length>256||!/^v1\.[A-Za-z0-9_-]+$/.test(raw))return invalid()
    const encoded=raw.slice(3),binary=atob(encoded.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-encoded.length%4)%4))
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),json=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes)
    const v=object(JSON.parse(json),["created_at","request_id"]),cursor={created_at:time(v.created_at,true),request_id:agentReviewId(v.request_id,true)}
    if(json!==agentReviewCanonical(cursor)||encode(json)!==encoded)return invalid()
    return cursor
  }catch{return invalid("invalid_agent_review_history_cursor")}
}
export function agentReviewHistoryQuery(raw:unknown):PgNativeAgentReviewTarget&{limit:number;before:string|null}{
  let v:Record<string,unknown>,target:PgNativeAgentReviewTarget
  try{
    v=object(raw)
    if(Reflect.ownKeys(v).some(k=>typeof k!=="string"||!["spec_id","run_id","purpose","limit","before"].includes(k))||!["spec_id","run_id","purpose"].every(k=>Object.hasOwn(v,k)))return invalid()
    target=agentReviewTarget({purpose:v.purpose,spec_id:v.spec_id,run_id:v.run_id})
    if(Object.hasOwn(v,"limit")&&(typeof v.limit!=="number"||!Number.isInteger(v.limit)||v.limit<1||v.limit>20))return invalid()
  }catch{return invalid("invalid_agent_review_history_query")}
  let before:string|null=null
  if(Object.hasOwn(v,"before")&&v.before!==null){agentReviewHistoryCursor(v.before);before=v.before as string}
  return {...target,limit:Object.hasOwn(v,"limit")?v.limit as number:20,before}
}
const requestKeys=["request_id","spec_id","run_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","created_at"]
export function agentReviewHistoryItem(raw:unknown,input:PgNativeAgentReviewTarget):PgNativeAgentReviewHistoryItem{
  const v=object(raw,["request","control"]),r=object(v.request,requestKeys),c=object(v.control,["job_state","body_erased"]),target=agentReviewTarget(input)
  if(r.spec_id!==target.spec_id||r.run_id!==target.run_id||r.purpose!==target.purpose||r.source_protocol!==(target.purpose==="evaluate"?"current_task_delivery_v1":"employee_statement_anchor_v1")||c.job_state!=="pending"&&c.job_state!=="cancelled"&&c.job_state!=="erased"||typeof c.body_erased!=="boolean"||c.body_erased!==(c.job_state==="erased"))return invalid()
  return {request:{request_id:agentReviewId(r.request_id,true),spec_id:agentReviewId(r.spec_id,true),run_id:agentReviewId(r.run_id,true),purpose:target.purpose,request_sha256:hash(r.request_sha256),input_sha256:hash(r.input_sha256),content_sha256:hash(r.content_sha256),owner_epoch:epoch(r.owner_epoch),source_protocol:r.source_protocol as PgNativeAgentReviewRequest["source_protocol"],created_at:time(r.created_at)},control:{job_state:c.job_state,body_erased:c.body_erased}}
}
export function agentReviewHistoryPage(raw:unknown,input:PgNativeAgentReviewHistoryQuery):PgNativeAgentReviewHistoryPage{
  const query=agentReviewHistoryQuery(input),v=object(raw,["protocol","spec_id","run_id","purpose","items","limit","has_more","next_cursor"])
  if(v.protocol!=="agent_paid_review_history_v1"||v.spec_id!==query.spec_id||v.run_id!==query.run_id||v.purpose!==query.purpose||v.limit!==query.limit||typeof v.has_more!=="boolean")return invalid()
  const target={purpose:query.purpose,spec_id:query.spec_id,run_id:query.run_id},items=array(v.items).map(raw=>agentReviewHistoryItem(raw,target)),before=query.before?agentReviewHistoryCursor(query.before):null
  if(items.length>query.limit||v.has_more&&items.length!==query.limit||!v.has_more&&v.next_cursor!==null)return invalid()
  const ids=new Set<string>();let previous=before?Date.parse(before.created_at):Infinity
  for(const item of items){const date=Date.parse(item.request.created_at);if(ids.has(item.request.request_id)||item.request.request_id===before?.request_id||date>previous)return invalid();ids.add(item.request.request_id);previous=date}
  let next_cursor:string|null=null
  if(v.has_more){
    const next=agentReviewHistoryCursor(v.next_cursor),last=items.at(-1)!
    if(next.request_id!==last.request.request_id||new Date(next.created_at).toISOString()!==last.request.created_at||before&&(next.created_at>before.created_at||next.created_at===before.created_at&&next.request_id>=before.request_id))return invalid()
    next_cursor=v.next_cursor as string
  }
  return {protocol:"agent_paid_review_history_v1",...target,items,limit:query.limit,has_more:v.has_more,next_cursor}
}
