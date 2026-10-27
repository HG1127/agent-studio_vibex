// CT01 metadata only. This module grants no identity, mutation or navigation authority.
import {createHash} from "node:crypto"
import {HttpError} from "./contracts.ts"

export const ownCategories=["all","approval","human_input","paused","effect_review","schedule_overdue","failed"] as const
export const ownKinds=["all","agent_single","agent_autonomous","workflow_v2","workflow_safe","schedule"] as const
export const ownStatuses=["queued","running","awaiting_approval","awaiting_input","paused","succeeded","failed","cancelled"] as const
export type OwnCategory=typeof ownCategories[number]
export type OwnKind=typeof ownKinds[number]
export type RunKind=Exclude<OwnKind,"all"|"schedule">
export type TodoCategory=Exclude<OwnCategory,"all">
export const ownCategoryRanks:Readonly<Record<TodoCategory,number>>=Object.freeze({approval:1,human_input:2,paused:3,effect_review:4,schedule_overdue:5,failed:6})
export type OwnTodoQuery={category:OwnCategory;kind:OwnKind;q:string;limit:number;before:string|null}
export type OwnPosition={observed_at:string;id:string;category_rank:number;step_key:string|null}
export type OwnCursor=OwnPosition&{category:OwnCategory;kind:OwnKind;query_sha256:string;as_of:string}
export type RunMeta={run_id:string;kind:RunKind;resource_id:string;resource_name:string;status:typeof ownStatuses[number];created_at:string;updated_at:string;finished_at:string|null}
export type TodoItem={category:TodoCategory;kind:Exclude<OwnKind,"all">;id:string;resource_id:string;resource_name:string;step_key:string|null;status:typeof ownStatuses[number]|"overdue"|"unknown"|"started";observed_at:string}
export const ownCountKeys=["owned_agents","knowledge_bases","queued","running","awaiting_approval","awaiting_input","paused","failed_7d","schedules_active","schedules_overdue","effects_need_review","unsupported_runs"] as const
export type OwnCounts=Record<typeof ownCountKeys[number],number>
export type OwnOverview={protocol:"native_own_overview_v1";scope:"current_user";as_of:string;window_days:7;counts:OwnCounts;recent:RunMeta[];delegated_approvals:"unavailable"}
export type OwnTodoPage={protocol:"native_own_todos_v1";scope:"current_user";as_of:string;category:OwnCategory;kind:OwnKind;q:string;limit:number;items:TodoItem[];has_more:boolean;next_cursor:string|null}
const queryError=():never=>{throw new HttpError(400,"invalid_own_todo_query")}
const cursorError=():never=>{throw new HttpError(400,"invalid_own_todo_cursor")}
export const ownUnavailable=():never=>{throw new HttpError(409,"own_overview_unavailable")}
type Failure=()=>never
function object(raw:unknown,required:readonly string[],optional:readonly string[]=[],fail:Failure=ownUnavailable):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail()
  const descriptors=Object.getOwnPropertyDescriptors(raw),keys=Reflect.ownKeys(raw)
  if(keys.some(k=>typeof k!=="string"||![...required,...optional].includes(k)||!descriptors[k]?.enumerable||!("value"in descriptors[k]!))||required.some(k=>!Object.hasOwn(descriptors,k)))return fail()
  return raw as Record<string,unknown>
}
function array(raw:unknown,max:number):unknown[]{
  if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return ownUnavailable()
  for(let i=0;i<raw.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,String(i))??{},"value"))return ownUnavailable()
  return raw
}
function unicode(value:string):boolean{for(const c of value)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return false;return true}
function text(raw:unknown,max:number,empty=true,fail:Failure=ownUnavailable):string{
  if(typeof raw!=="string"||raw.length>max||!unicode(raw)||raw.includes("\0")||!empty&&!raw.length)return fail();return raw
}
export function ownId(raw:unknown,fail:Failure=ownUnavailable):string{if(typeof raw!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw))return fail();return raw}
export function ownStamp(raw:unknown,micro=false,fail:Failure=ownUnavailable):string{
  if(typeof raw!=="string"||!(micro?/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/).test(raw)||raw.startsWith("0000-"))return fail()
  const publicStamp=micro?raw.slice(0,23)+"Z":raw,date=Date.parse(publicStamp)
  if(!Number.isFinite(date)||new Date(date).toISOString()!==publicStamp)return fail();return raw
}
export const ownPublicStamp=(raw:string)=>ownStamp(raw,true).slice(0,23)+"Z"
export function ownCount(raw:unknown):number{if(typeof raw!=="number"||!Number.isSafeInteger(raw)||raw<0||Object.is(raw,-0))return ownUnavailable();return raw}
export function ownDatabaseCount(raw:unknown):number{
  if(typeof raw!=="string"||!/^(?:0|[1-9][0-9]*)$/.test(raw))return ownUnavailable();return ownCount(Number(raw))
}
export function ownCanonical(value:unknown):string{
  if(value===null||typeof value!=="object"){const result=JSON.stringify(value);if(result===undefined)throw Error("invalid_own_canonical_value");return result}
  if(Array.isArray(value))return "["+value.map(ownCanonical).join(",")+"]"
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+ownCanonical((value as Record<string,unknown>)[key])).join(",")+"}"
}
export const ownQueryHash=(q:Pick<OwnTodoQuery,"category"|"kind"|"q">)=>createHash("sha256").update(ownCanonical({category:q.category,kind:q.kind,q:q.q}),"utf8").digest("hex")
function enumValue<T extends string>(raw:unknown,values:readonly T[],fail:Failure=ownUnavailable):T{if(typeof raw!=="string"||!values.includes(raw as T))return fail();return raw as T}
export function parseOwnTodoQuery(raw:unknown={}):OwnTodoQuery{
  const v=object(raw,[],["category","kind","q","limit","before"],queryError)
  const category=enumValue(v.category===undefined?"all":v.category,ownCategories,queryError),kind=enumValue(v.kind===undefined?"all":v.kind,ownKinds,queryError)
  const qRaw=v.q===undefined?"":v.q;if(typeof qRaw!=="string")return queryError()
  const q=text(qRaw.trim(),100,true,queryError),limit=v.limit===undefined?20:v.limit,before=v.before===undefined?null:v.before
  if(typeof limit!=="number"||!Number.isInteger(limit)||limit<1||limit>20)return queryError()
  const result={category,kind,q,limit,before:before as string|null}
  if(before!==null)parseOwnCursor(before,result)
  return result
}
export function parseOwnOperationsUrl(raw:unknown):{route:"overview"}|{route:"todos";query:OwnTodoQuery}{
  if(typeof raw!=="string"||raw.length>10000||/[\u0000-\u0020\u007f-\uffff]/.test(raw)||raw.includes("#"))return queryError()
  if(raw==="/api/v2/own-overview")return {route:"overview"}
  if(raw!=="/api/v2/own-todos"&&!raw.startsWith("/api/v2/own-todos?"))return queryError()
  const v:Record<string,unknown>={},tail=raw.includes("?")?raw.slice(raw.indexOf("?")+1):""
  try{if(tail)for(const pair of tail.split("&")){
    const at=pair.indexOf("=");if(at<0)return queryError()
    const key=pair.slice(0,at);if(!["category","kind","q","limit","before"].includes(key)||Object.hasOwn(v,key))return queryError()
    const value=decodeURIComponent(pair.slice(at+1).replaceAll("+"," "))
    if(key==="limit"){if(!/^(?:[1-9]|1[0-9]|20)$/.test(value)||pair.slice(at+1)!==value)return queryError();v[key]=Number(value)}else v[key]=value
  }}catch{return queryError()}
  return {route:"todos",query:parseOwnTodoQuery(v)}
}
export function parseOwnCursor(raw:unknown,q:Pick<OwnTodoQuery,"category"|"kind"|"q">):OwnCursor{
  try{
    if(typeof raw!=="string"||raw.length>2048||!/^v1\.[A-Za-z0-9_-]+$/.test(raw))return cursorError()
    const bytes=Buffer.from(raw.slice(3),"base64url");if(bytes.toString("base64url")!==raw.slice(3))return cursorError()
    const value=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes),v=object(JSON.parse(value),["category","kind","query_sha256","as_of","observed_at","id","category_rank","step_key"],[],cursorError)
    if(v.category!==q.category||v.kind!==q.kind||v.query_sha256!==ownQueryHash(q)||!Number.isInteger(v.category_rank)||Number(v.category_rank)<1||Number(v.category_rank)>6)return cursorError()
    const cursor:OwnCursor={category:q.category,kind:q.kind,query_sha256:ownQueryHash(q),as_of:ownStamp(v.as_of,true,cursorError),observed_at:ownStamp(v.observed_at,true,cursorError),id:ownId(v.id,cursorError),category_rank:Number(v.category_rank),step_key:v.step_key===null?null:text(v.step_key,160,false,cursorError)}
    const category=(Object.keys(ownCategoryRanks) as TodoCategory[]).find(k=>ownCategoryRanks[k]===cursor.category_rank)!
    if(q.category!=="all"&&category!==q.category)return cursorError()
    if(category==="effect_review"?cursor.step_key===null:cursor.step_key!==null)return cursorError()
    if(ownCanonical(cursor)!==value)return cursorError()
    return cursor
  }catch{return cursorError()}
}
export function ownCursor(q:Pick<OwnTodoQuery,"category"|"kind"|"q">,as_of:string,position:OwnPosition):string{
  const raw="v1."+Buffer.from(ownCanonical({category:q.category,kind:q.kind,query_sha256:ownQueryHash(q),as_of,...position}),"utf8").toString("base64url")
  parseOwnCursor(raw,q);return raw
}
export function compareOwnPositions(a:OwnPosition,b:OwnPosition):number{
  for(const key of ["observed_at","id","category_rank"] as const){const av=a[key],bv=b[key];if(av<bv)return -1;if(av>bv)return 1}
  // PostgreSQL COLLATE "C" compares UTF8 bytes, not JavaScript UTF16 units.
  return Math.sign(Buffer.compare(Buffer.from(a.step_key??"","utf8"),Buffer.from(b.step_key??"","utf8")))
}
export function parseOwnRunMeta(raw:unknown):RunMeta{
  const v=object(raw,["run_id","kind","resource_id","resource_name","status","created_at","updated_at","finished_at"])
  return {run_id:ownId(v.run_id),kind:enumValue(v.kind,ownKinds.slice(1,5) as RunKind[]),resource_id:ownId(v.resource_id),resource_name:text(v.resource_name,120),status:enumValue(v.status,ownStatuses),created_at:ownStamp(v.created_at),updated_at:ownStamp(v.updated_at),finished_at:v.finished_at===null?null:ownStamp(v.finished_at)}
}
export function parseOwnTodoItem(raw:unknown):TodoItem{
  const v=object(raw,["category","kind","id","resource_id","resource_name","step_key","status","observed_at"])
  const category=enumValue(v.category,ownCategories.slice(1) as TodoCategory[]),kind=enumValue(v.kind,ownKinds.slice(1) as Exclude<OwnKind,"all">[])
  if(category==="schedule_overdue"?kind!=="schedule"||v.status!=="overdue":kind==="schedule")return ownUnavailable()
  if(category==="effect_review"){if(v.status!=="unknown"&&v.status!=="started")return ownUnavailable();text(v.step_key,160,false)}else{
    if(v.step_key!==null)return ownUnavailable()
    const expected={approval:"awaiting_approval",human_input:"awaiting_input",paused:"paused",failed:"failed",schedule_overdue:"overdue"}[category]
    if(v.status!==expected)return ownUnavailable()
  }
  return {category,kind,id:ownId(v.id),resource_id:ownId(v.resource_id),resource_name:text(v.resource_name,120),step_key:v.step_key as string|null,status:v.status as TodoItem["status"],observed_at:ownStamp(v.observed_at)}
}
export function parseOwnOverview(raw:unknown):OwnOverview{
  const v=object(raw,["protocol","scope","as_of","window_days","counts","recent","delegated_approvals"]),counts=object(v.counts,ownCountKeys)
  if(v.protocol!=="native_own_overview_v1"||v.scope!=="current_user"||v.window_days!==7||v.delegated_approvals!=="unavailable")return ownUnavailable()
  const recent=array(v.recent,12).map(parseOwnRunMeta)
  if(new Set(recent.map(r=>r.run_id)).size!==recent.length)return ownUnavailable()
  return {protocol:v.protocol,scope:v.scope,as_of:ownStamp(v.as_of),window_days:7,counts:Object.fromEntries(ownCountKeys.map(k=>[k,ownCount(counts[k])])) as OwnCounts,recent,delegated_approvals:"unavailable"}
}
export function parseOwnTodoPage(raw:unknown,query:OwnTodoQuery):OwnTodoPage{
  const q=parseOwnTodoQuery(query),v=object(raw,["protocol","scope","as_of","category","kind","q","limit","items","has_more","next_cursor"])
  if(v.protocol!=="native_own_todos_v1"||v.scope!=="current_user"||v.category!==q.category||v.kind!==q.kind||v.q!==q.q||v.limit!==q.limit||typeof v.has_more!=="boolean")return ownUnavailable()
  const as_of=ownStamp(v.as_of),items=array(v.items,q.limit).map(parseOwnTodoItem),before=q.before?parseOwnCursor(q.before,q):null
  if(before&&ownPublicStamp(before.as_of)!==as_of)return ownUnavailable()
  const seen=new Set<string>()
  for(const item of items){const key=[item.category,item.id,item.step_key].join(":");if(seen.has(key)||q.category!=="all"&&item.category!==q.category||q.kind!=="all"&&item.kind!==q.kind)return ownUnavailable();seen.add(key)}
  let next_cursor:string|null=null
  if(v.has_more){
    if(items.length!==q.limit)return ownUnavailable()
    let next:OwnCursor;try{next=parseOwnCursor(v.next_cursor,q)}catch{return ownUnavailable()}
    const last=items.at(-1)!
    if(next.as_of.slice(0,23)+"Z"!==as_of||next.id!==last.id||next.category_rank!==ownCategoryRanks[last.category]||next.step_key!==last.step_key||ownPublicStamp(next.observed_at)!==last.observed_at||before&&(next.as_of!==before.as_of||compareOwnPositions(next,before)>=0))return ownUnavailable()
    next_cursor=v.next_cursor as string
  }else if(v.next_cursor!==null)return ownUnavailable()
  return {protocol:v.protocol,scope:v.scope,as_of,category:q.category,kind:q.kind,q:q.q,limit:q.limit,items,has_more:v.has_more,next_cursor}
}
