// Immutable metadata only. A history item is neither a paid intent nor a
// receipt, execution observation, source validation or permission to read body.
import {HttpError,isUuid} from "./contracts.ts"
import type {AgentOpinionRequest,AgentOpinionPurpose,AgentOpinionJobState} from "./agent-opinion-contract.ts"

export type AgentReviewHistoryQuery={spec_id:string;run_id:string;purpose:AgentOpinionPurpose;limit:number;before:string|null}
export type AgentReviewHistoryPosition={created_at:string;request_id:string}
export type AgentReviewHistoryItem={request:AgentOpinionRequest;control:{job_state:AgentOpinionJobState;body_erased:boolean}}
export type AgentReviewHistoryPage={protocol:"agent_paid_review_history_v1";spec_id:string;run_id:string;purpose:AgentOpinionPurpose;items:AgentReviewHistoryItem[];limit:number;has_more:boolean;next_cursor:string|null}

const invalid=():never=>{throw new HttpError(400,"invalid_agent_review_history_query")}
const cursorInvalid=():never=>{throw new HttpError(400,"invalid_agent_review_history_cursor")}
const unavailable=():never=>{throw new HttpError(409,"agent_review_history_unavailable")}
function object(raw:unknown,required:string[],optional:string[]=[],fail:()=>never=invalid):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail()
  const v=raw as Record<string,unknown>,keys=Reflect.ownKeys(v)
  if(keys.some(k=>typeof k!=="string"||![...required,...optional].includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},"value"))||required.some(k=>!Object.hasOwn(v,k)))return fail()
  return v
}
const id=(raw:unknown):string=>isUuid(raw)&&raw===raw.toLowerCase()?raw:invalid()
const purpose=(raw:unknown):AgentOpinionPurpose=>raw==="evaluate"||raw==="optimize"?raw:invalid()
function limit(raw:unknown):number{if(typeof raw!=="number"||!Number.isInteger(raw)||raw<1||raw>20)return invalid();return raw}
function stamp(raw:unknown,micro:boolean):string{
  if(typeof raw!=="string"||!(micro?/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/).test(raw)||raw.startsWith("0000-"))return invalid()
  const publicDate=micro?raw.slice(0,23)+"Z":raw,value=Date.parse(publicDate)
  if(!Number.isFinite(value)||new Date(value).toISOString()!==publicDate)return invalid()
  return raw
}
export function parseAgentReviewHistoryCursor(raw:unknown):AgentReviewHistoryPosition{
  try{
    if(typeof raw!=="string"||raw.length>256||!/^v1\.[A-Za-z0-9_-]+$/.test(raw))return cursorInvalid()
    const encoded=raw.slice(3),bytes=Buffer.from(encoded,"base64url")
    if(bytes.toString("base64url")!==encoded)return cursorInvalid()
    const text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes),v=object(JSON.parse(text),["created_at","request_id"],[],cursorInvalid)
    const position={created_at:stamp(v.created_at,true),request_id:id(v.request_id)}
    if(JSON.stringify(position)!==text)return cursorInvalid()
    return position
  }catch{return cursorInvalid()}
}
export function agentReviewHistoryCursor(position:AgentReviewHistoryPosition):string{
  const text=JSON.stringify({created_at:position.created_at,request_id:position.request_id}),encoded="v1."+Buffer.from(text,"utf8").toString("base64url")
  parseAgentReviewHistoryCursor(encoded);return encoded
}
export function parseAgentReviewHistoryQuery(raw:unknown):AgentReviewHistoryQuery{
  const v=object(raw,["spec_id","run_id","purpose"],["limit","before"])
  const before=Object.hasOwn(v,"before")?v.before:null
  if(before!==null)parseAgentReviewHistoryCursor(before)
  return {spec_id:id(v.spec_id),run_id:id(v.run_id),purpose:purpose(v.purpose),limit:Object.hasOwn(v,"limit")?limit(v.limit):20,before:before as string|null}
}
/** Parse only exact origin-form collection URLs; URL normalization cannot
 * turn an absolute/encoded/dot-segment alias into the history endpoint. */
export function parseAgentReviewHistoryUrl(raw:unknown):AgentReviewHistoryQuery{
  if(typeof raw!=="string"||raw.length>1024||!raw.startsWith("/api/v2/agent-reviews?")||raw.includes("#")||/[\u0000-\u0020\u007f-\uffff]/.test(raw)||/%(?![0-9a-f]{2})/i.test(raw))return invalid()
  const params=new URL(raw,"http://127.0.0.1").searchParams,v:Record<string,unknown>={}
  for(const [key,value] of params){
    if(!["spec_id","run_id","purpose","limit","before"].includes(key)||Object.hasOwn(v,key))return invalid()
    v[key]=value
  }
  if(Object.hasOwn(v,"limit")){
    const literal=raw.slice(raw.indexOf("?")+1).split("&").find(part=>part.startsWith("limit="))?.slice(6)
    if(typeof v.limit!=="string"||literal!==v.limit||!/^(?:[1-9]|1[0-9]|20)$/.test(v.limit))return invalid()
    v.limit=Number(v.limit)
  }
  return parseAgentReviewHistoryQuery(v)
}
function item(raw:unknown,query:AgentReviewHistoryQuery):AgentReviewHistoryItem{
  const v=object(raw,["request","control"]),r=object(v.request,["request_id","spec_id","run_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","created_at"]),c=object(v.control,["job_state","body_erased"])
  const selected=purpose(r.purpose),source_protocol=selected==="evaluate"?"current_task_delivery_v1" as const:"employee_statement_anchor_v1" as const
  const spec_id=id(r.spec_id),run_id=id(r.run_id)
  if(spec_id!==query.spec_id||run_id!==query.run_id||selected!==query.purpose||r.source_protocol!==source_protocol||typeof r.owner_epoch!=="number"||!Number.isSafeInteger(r.owner_epoch)||r.owner_epoch<1||r.owner_epoch>Number.MAX_SAFE_INTEGER-2)return invalid()
  const hash=(raw:unknown):string=>typeof raw==="string"&&/^[a-f0-9]{64}$/.test(raw)?raw:invalid()
  if(c.job_state!=="pending"&&c.job_state!=="cancelled"&&c.job_state!=="erased"||typeof c.body_erased!=="boolean"||c.body_erased!==(c.job_state==="erased"))return invalid()
  return {request:{request_id:id(r.request_id),spec_id,run_id,purpose:selected,request_sha256:hash(r.request_sha256),input_sha256:hash(r.input_sha256),content_sha256:hash(r.content_sha256),owner_epoch:r.owner_epoch,source_protocol,created_at:stamp(r.created_at,false)},control:{job_state:c.job_state,body_erased:c.body_erased}}
}
export function compareAgentReviewHistoryPositions(a:AgentReviewHistoryPosition,b:AgentReviewHistoryPosition):number{
  return a.created_at<b.created_at?-1:a.created_at>b.created_at?1:a.request_id<b.request_id?-1:a.request_id>b.request_id?1:0
}
export function parseAgentReviewHistoryPage(raw:unknown,query:AgentReviewHistoryQuery):AgentReviewHistoryPage{
  try{
    const q=parseAgentReviewHistoryQuery(query),v=object(raw,["protocol","spec_id","run_id","purpose","items","limit","has_more","next_cursor"])
    if(v.protocol!=="agent_paid_review_history_v1"||v.spec_id!==q.spec_id||v.run_id!==q.run_id||v.purpose!==q.purpose||v.limit!==q.limit||!Array.isArray(v.items)||Object.getPrototypeOf(v.items)!==Array.prototype||v.items.length>q.limit||typeof v.has_more!=="boolean")return unavailable()
    const itemKeys=Reflect.ownKeys(v.items)
    if(itemKeys.length!==v.items.length+1||!itemKeys.every((key,i)=>key==="length"||key===String(i)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v.items,key)??{},"value")))return unavailable()
    const items=v.items.map(raw=>item(raw,q)),seen=new Set<string>(),before=q.before===null?null:parseAgentReviewHistoryCursor(q.before)
    let previous:string|null=null
    for(const row of items){
      const r=row.request
      // Millisecond ties may legitimately have UUIDs in either order because
      // the actual DB microseconds are distinct. Do not invent a UUID sort.
      if(seen.has(r.request_id)||previous!==null&&r.created_at>previous||before&&(r.request_id===before.request_id||r.created_at>before.created_at.slice(0,23)+"Z"))return unavailable()
      seen.add(r.request_id);previous=r.created_at
    }
    let next_cursor:string|null=null
    if(v.has_more){
      if(items.length!==q.limit||typeof v.next_cursor!=="string")return unavailable()
      const next=parseAgentReviewHistoryCursor(v.next_cursor),last=items.at(-1)!.request
      if(next.request_id!==last.request_id||next.created_at.slice(0,23)+"Z"!==last.created_at||before&&compareAgentReviewHistoryPositions(next,before)>=0)return unavailable()
      next_cursor=v.next_cursor
    }else if(v.next_cursor!==null)return unavailable()
    return {protocol:"agent_paid_review_history_v1",spec_id:q.spec_id,run_id:q.run_id,purpose:q.purpose,items,limit:q.limit,has_more:v.has_more,next_cursor}
  }catch{return unavailable()}
}
/** SQL row parser: microseconds stay a string from to_char, never pg's Date. */
export function parseAgentReviewHistoryCandidate(raw:unknown,query:AgentReviewHistoryQuery):{item:AgentReviewHistoryItem;position:AgentReviewHistoryPosition}{
  try{
    const v=object(raw,["request_id","spec_id","run_id","purpose","request_sha256","input_sha256","content_sha256","owner_epoch","source_protocol","created_at_us","job_state","body_erased"])
    if(typeof v.owner_epoch!=="string"||! /^[1-9][0-9]*$/.test(v.owner_epoch))return unavailable()
    const created_at=stamp(v.created_at_us,true),parsed=item({request:{request_id:v.request_id,spec_id:v.spec_id,run_id:v.run_id,purpose:v.purpose,request_sha256:v.request_sha256,input_sha256:v.input_sha256,content_sha256:v.content_sha256,owner_epoch:Number(v.owner_epoch),source_protocol:v.source_protocol,created_at:created_at.slice(0,23)+"Z"},control:{job_state:v.job_state,body_erased:v.body_erased}},query)
    return {item:parsed,position:{created_at,request_id:parsed.request.request_id}}
  }catch{return unavailable()}
}
