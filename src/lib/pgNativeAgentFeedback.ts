import {isUuid} from "../../services/pg-api/src/contracts.ts"
import {redactResultText} from "../../services/pg-api/src/public-result-text.ts"
type Common={request_id:string;spec_id:string;run_id:string;confirm:true}
export type PgNativeFeedbackChoice=Common&({action:"submit";expected_revision:number;expected_source_sha256:string;rating:"up"|"down";tags:string[];comment:string;remember_lesson:boolean}|
  {action:"erase_feedback";expected_revision:number;expected_feedback_sha256:string}|
  {action:"forget_lesson";feedback_id:string;expected_content_sha256:string})
export type PgNativeFeedbackLessonResult={feedback_id:string;decision:"not_requested"|"stored"|"source_unavailable"|"writes_disabled"|"write_failed";content_sha256:string|null;created_at:string}
export type PgNativeFeedbackReceipt={protocol:"agent_feedback_v1";request_id:string;run_id:string;spec_id:string;action:PgNativeFeedbackChoice["action"];revision:number;feedback_id:string;source_sha256:string;statement_sha256:string;feedback_sha256:string;request_sha256:string;remember_lesson:boolean;lesson_result:PgNativeFeedbackLessonResult|null;recorded:true;replayed:boolean}
export type PgNativeFeedbackBody={rating:"up"|"down";tags:string[];comment:string}
export type PgNativeFeedbackLesson={feedback_id:string;revision:number;feedback_sha256:string;source_sha256:string;content_sha256:string;created_at:string;source_current:boolean;kind:"lesson";fact:string|null;tools_used:""|null}
export type PgNativeFeedbackStatus={protocol:"agent_feedback_v1";run_id:string;spec_id:string;revision:number;source:{status:"succeeded"|"failed"|"cancelled";source_sha256:string}|null;state:"none"|"active"|"erased"|"unconfirmed";current:{feedback_id:string;revision:number;source_sha256:string;statement_sha256:string;feedback_sha256:string;remember_lesson:boolean;created_at:string;body:PgNativeFeedbackBody|null;lesson_result:PgNativeFeedbackLessonResult|null}|null;lessons:PgNativeFeedbackLesson[];limit:50}
const invalid=():never=>{throw Error("invalid_agent_feedback_projection")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  return raw as Record<string,unknown>
}
const exact=(v:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)
const id=(v:unknown):v is string=>isUuid(v)&&v===v.toLowerCase()
const revision=(v:unknown,min=1):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=Number.MAX_SAFE_INTEGER-1
const time=(v:unknown):v is string=>typeof v==="string"&&v.length<=50&&Number.isFinite(Date.parse(v))
function text(v:unknown,max:number,sanitized=false):v is string{
  if(typeof v!=="string"||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v)||sanitized&&redactResultText(v)!==v)return false
  for(const c of v)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return false
  return true
}
function body(raw:unknown,sanitized=false):PgNativeFeedbackBody{
  const v=object(raw)
  if(!exact(v,["rating","tags","comment"])||v.rating!=="up"&&v.rating!=="down"||!Array.isArray(v.tags)||v.tags.length>8||!text(v.comment,500,sanitized))return invalid()
  const tags=Array.from(v.tags)
  if(tags.some(v=>!text(v,20,sanitized)||!v.trim()||/[\t\r\n]/u.test(v)||sanitized&&v!==v.trim())||sanitized&&v.comment!==v.comment.trim())return invalid()
  return {rating:v.rating,tags:tags as string[],comment:v.comment}
}
const digest=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,"0")).join("")
async function statement(spec:string,run:string,source:string,value:PgNativeFeedbackBody){
  const parts=["agent_feedback_statement_v1",spec,run,source,value.rating,String(value.tags.length),...value.tags,value.comment]
  return digest(parts.map(v=>new TextEncoder().encode(v).length+":"+v).join(""))
}
export function agentFeedbackChoice(raw:unknown):PgNativeFeedbackChoice{
  const v=object(raw),common=["action","request_id","spec_id","run_id","confirm"],extra=v.action==="submit"?["expected_revision","expected_source_sha256","rating","tags","comment","remember_lesson"]:v.action==="erase_feedback"?["expected_revision","expected_feedback_sha256"]:v.action==="forget_lesson"?["feedback_id","expected_content_sha256"]:null
  if(!extra||!exact(v,[...common,...extra])||!isUuid(v.request_id)||!isUuid(v.spec_id)||!isUuid(v.run_id)||v.confirm!==true)return invalid()
  const base={request_id:v.request_id.toLowerCase(),spec_id:v.spec_id.toLowerCase(),run_id:v.run_id.toLowerCase(),confirm:true as const}
  if(v.action==="submit"){
    const value=body({rating:v.rating,tags:v.tags,comment:v.comment})
    if(!revision(v.expected_revision,0)||!hash(v.expected_source_sha256)||typeof v.remember_lesson!=="boolean"||value.rating==="up"&&v.remember_lesson)return invalid()
    return {...base,action:"submit",expected_revision:v.expected_revision,expected_source_sha256:v.expected_source_sha256,...value,remember_lesson:v.remember_lesson}
  }
  if(v.action==="erase_feedback"){
    if(!revision(v.expected_revision)||!hash(v.expected_feedback_sha256))return invalid()
    return {...base,action:"erase_feedback",expected_revision:v.expected_revision,expected_feedback_sha256:v.expected_feedback_sha256}
  }
  if(!isUuid(v.feedback_id)||v.feedback_id.toLowerCase()===base.request_id||!hash(v.expected_content_sha256))return invalid()
  return {...base,action:"forget_lesson",feedback_id:v.feedback_id.toLowerCase(),expected_content_sha256:v.expected_content_sha256}
}
function result(raw:unknown,feedbackId:string):PgNativeFeedbackLessonResult|null{
  if(raw===null)return null
  const v=object(raw)
  if(!exact(v,["feedback_id","decision","content_sha256","created_at"])||v.feedback_id!==feedbackId||!["not_requested","stored","source_unavailable","writes_disabled","write_failed"].includes(String(v.decision))||!time(v.created_at)||(v.decision==="stored"?!hash(v.content_sha256):v.content_sha256!==null))return invalid()
  return v as PgNativeFeedbackLessonResult
}
export async function agentFeedbackReceipt(raw:unknown,input:PgNativeFeedbackChoice,confirmOnly=false):Promise<PgNativeFeedbackReceipt>{
  const choice=agentFeedbackChoice(input),v=object(raw)
  if(!exact(v,["protocol","request_id","run_id","spec_id","action","revision","feedback_id","source_sha256","statement_sha256","feedback_sha256","request_sha256","remember_lesson","lesson_result","recorded","replayed"])||v.protocol!=="agent_feedback_v1"||v.request_id!==choice.request_id||v.run_id!==choice.run_id||v.spec_id!==choice.spec_id||v.action!==choice.action||!revision(v.revision)||!id(v.feedback_id)||!hash(v.source_sha256)||!hash(v.statement_sha256)||!hash(v.feedback_sha256)||!hash(v.request_sha256)||typeof v.remember_lesson!=="boolean"||v.recorded!==true||typeof v.replayed!=="boolean"||confirmOnly&&v.replayed!==true)return invalid()
  const fingerprint=async(parts:unknown[])=>digest(JSON.stringify(["agent_feedback_intent_v1",choice.request_id,choice.spec_id,choice.run_id,...parts]))
  const saved=result(v.lesson_result,v.feedback_id)
  let expected:string
  if(choice.action==="submit"){
    const sanitized={rating:choice.rating,tags:choice.tags.map(v=>redactResultText(v.trim())),comment:redactResultText(choice.comment.trim())}
    expected=await fingerprint(["submit",choice.expected_revision,choice.expected_source_sha256,choice.rating,await Promise.all(choice.tags.map(digest)),await digest(choice.comment),choice.remember_lesson])
    if(v.revision!==choice.expected_revision+1||v.feedback_id!==choice.request_id||v.source_sha256!==choice.expected_source_sha256||v.statement_sha256!==await statement(choice.spec_id,choice.run_id,choice.expected_source_sha256,sanitized)||v.remember_lesson!==choice.remember_lesson||saved&&(saved.decision==="not_requested")!==!choice.remember_lesson)return invalid()
  }else if(choice.action==="erase_feedback"){
    expected=await fingerprint(["erase_feedback",choice.expected_revision,choice.expected_feedback_sha256])
    if(v.revision!==choice.expected_revision+1||v.feedback_sha256!==choice.expected_feedback_sha256||v.feedback_id===choice.request_id||v.remember_lesson!==false)return invalid()
  }else{
    expected=await fingerprint(["forget_lesson",choice.feedback_id,choice.expected_content_sha256])
    if(v.feedback_id!==choice.feedback_id||v.remember_lesson!==false||saved?.decision!=="stored"||saved.content_sha256!==choice.expected_content_sha256)return invalid()
  }
  if(v.request_sha256!==expected)return invalid()
  return v as PgNativeFeedbackReceipt
}
export async function agentFeedbackStatus(raw:unknown,runId:string):Promise<PgNativeFeedbackStatus>{
  const v=object(raw)
  if(!id(runId)||!exact(v,["protocol","run_id","spec_id","revision","source","state","current","lessons","limit"])||v.protocol!=="agent_feedback_v1"||v.run_id!==runId||!id(v.spec_id)||!revision(v.revision,0)||!["none","active","erased","unconfirmed"].includes(String(v.state))||v.limit!==50||!Array.isArray(v.lessons)||v.lessons.length>50)return invalid()
  if(v.source!==null){const source=object(v.source);if(!exact(source,["status","source_sha256"])||!["succeeded","failed","cancelled"].includes(String(source.status))||!hash(source.source_sha256))return invalid()}
  let current:PgNativeFeedbackStatus["current"]=null
  if(v.state==="none"||v.state==="erased"){
    if(v.current!==null||v.lessons.length||v.state==="none"&&v.revision!==0||v.state==="erased"&&Number(v.revision)<2)return invalid()
  }else{
    const c=object(v.current)
    if(!exact(c,["feedback_id","revision","source_sha256","statement_sha256","feedback_sha256","remember_lesson","created_at","body","lesson_result"])||!id(c.feedback_id)||!revision(c.revision)||c.revision!==v.revision||!hash(c.source_sha256)||!hash(c.statement_sha256)||!hash(c.feedback_sha256)||typeof c.remember_lesson!=="boolean"||!time(c.created_at))return invalid()
    const saved=result(c.lesson_result,c.feedback_id)
    if(saved&&(saved.decision==="not_requested")!==!c.remember_lesson)return invalid()
    if(v.state==="active"){
      const value=body(c.body,true)
      if(c.remember_lesson&&value.rating!=="down"||c.statement_sha256!==await statement(v.spec_id,runId,c.source_sha256,value))return invalid()
    }else if(c.body!==null)return invalid()
    current=c as PgNativeFeedbackStatus["current"]
  }
  const seen=new Set<string>();let previous=Infinity
  for(const rawLesson of v.lessons){
    const l=object(rawLesson)
    if(!exact(l,["feedback_id","revision","feedback_sha256","source_sha256","content_sha256","created_at","source_current","kind","fact","tools_used"])||!id(l.feedback_id)||seen.has(l.feedback_id)||!revision(l.revision)||l.revision>=previous||l.revision>Number(v.revision)||!hash(l.feedback_sha256)||!hash(l.source_sha256)||!hash(l.content_sha256)||!time(l.created_at)||typeof l.source_current!=="boolean"||l.kind!=="lesson")return invalid()
    if(l.source_current){
      if(!current?.body||!current.remember_lesson||current.body.rating!=="down"||l.feedback_id!==current.feedback_id||l.revision!==current.revision||l.feedback_sha256!==current.feedback_sha256||l.source_sha256!==current.source_sha256||object(v.source).source_sha256!==l.source_sha256||current.lesson_result?.decision!=="stored"||l.content_sha256!==current.lesson_result.content_sha256||!text(l.fact,500,true)||!l.fact.trim()||l.tools_used!==""||l.content_sha256!==await digest(l.fact))return invalid()
    }else if(l.fact!==null||l.tools_used!==null)return invalid()
    seen.add(l.feedback_id);previous=l.revision
  }
  return v as PgNativeFeedbackStatus
}
