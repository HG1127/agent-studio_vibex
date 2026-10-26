// Proposed employee feedback intents only. Not an API or source proof. The
// repository must independently verify Native identity, terminal owned run,
// original/current sources, optimistic revision and any lesson storage scope.
import {HttpError,isUuid} from "./contracts.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {sanitizeAgentMemoryText} from "./agent-memory-selection.ts"

type Common={request_id:string;spec_id:string;run_id:string;confirm:true;request_sha256:string}
type Submit=Common&{action:"submit";expected_revision:number;expected_source_sha256:string;rating:"up"|"down";tags:string[];comment:string;remember_lesson:boolean;statement_sha256:string}
type Erase=Common&{action:"erase_feedback";expected_revision:number;expected_feedback_sha256:string}
type Forget=Common&{action:"forget_lesson";feedback_id:string;expected_content_sha256:string}
export type AgentFeedbackChange=Submit|Erase|Forget
const invalid=():never=>{throw new HttpError(400,"invalid_agent_feedback_change")}
function id(value:unknown):string{if(!isUuid(value))return invalid();return value.toLowerCase()}
function hash(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value))return invalid();return value}
function revision(value:unknown,min:number):number{if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>Number.MAX_SAFE_INTEGER-1)return invalid();return Number(value)}
function text(value:unknown,max:number):string{
  if(typeof value!=="string"||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))return invalid()
  for(const c of value)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalid()
  return value
}
export function parseAgentFeedbackChange(raw:unknown):AgentFeedbackChange{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const v=raw as Record<string,unknown>,base=["action","request_id","spec_id","run_id","confirm"]
  const extra=v.action==="submit"?["expected_revision","expected_source_sha256","rating","tags","comment","remember_lesson"]:
    v.action==="erase_feedback"?["expected_revision","expected_feedback_sha256"]:v.action==="forget_lesson"?["feedback_id","expected_content_sha256"]:null
  if(!extra||v.confirm!==true||Reflect.ownKeys(v).length!==base.length+extra.length||[...base,...extra].some(k=>!Object.hasOwn(v,k)))return invalid()
  const common={request_id:id(v.request_id),spec_id:id(v.spec_id),run_id:id(v.run_id),confirm:true as const}
  const fingerprint=(parts:unknown[])=>agentMemoryHash(JSON.stringify(["agent_feedback_intent_v1",common.request_id,common.spec_id,common.run_id,...parts]))
  if(v.action==="submit"){
    const expected_revision=revision(v.expected_revision,0),expected_source_sha256=hash(v.expected_source_sha256)
    if(v.rating!=="up"&&v.rating!=="down"||typeof v.remember_lesson!=="boolean"||v.rating==="up"&&v.remember_lesson||!Array.isArray(v.tags)||v.tags.length>8)return invalid()
    const rating=v.rating,remember_lesson=v.remember_lesson
    const rawTags=Array.from(v.tags,tag=>text(tag,20)),rawComment=text(v.comment,500)
    if(rawTags.some(tag=>!tag.trim()||/[\t\r\n]/u.test(tag)))return invalid()
    const tags=rawTags.map(tag=>sanitizeAgentMemoryText(tag.trim())),comment=sanitizeAgentMemoryText(rawComment.trim())
    // Preserve exact original text intent for conflict/recovery, even when two
    // private inputs would produce the same sanitized display. Store hashes,
    // never the raw credential-bearing tags/comment, in immutable metadata.
    const request_sha256=fingerprint(["submit",expected_revision,expected_source_sha256,rating,rawTags.map(agentMemoryHash),agentMemoryHash(rawComment),remember_lesson])
    // This is the sanitized statement digest. A later stored feedback record
    // must also bind its server revision and original receipt; identical text
    // submitted again must not revive an old optimization lineage.
    const parts=["agent_feedback_statement_v1",common.spec_id,common.run_id,expected_source_sha256,rating,String(tags.length),...tags,comment]
    const statement_sha256=agentMemoryHash(parts.map(part=>Buffer.byteLength(part,"utf8")+":"+part).join(""))
    return {...common,action:"submit",expected_revision,expected_source_sha256,rating,tags,comment,remember_lesson,statement_sha256,request_sha256}
  }
  if(v.action==="erase_feedback"){
    const expected_revision=revision(v.expected_revision,1),expected_feedback_sha256=hash(v.expected_feedback_sha256)
    return {...common,action:"erase_feedback",expected_revision,expected_feedback_sha256,request_sha256:fingerprint(["erase_feedback",expected_revision,expected_feedback_sha256])}
  }
  const feedback_id=id(v.feedback_id),expected_content_sha256=hash(v.expected_content_sha256)
  if(feedback_id===common.request_id)return invalid()
  return {...common,action:"forget_lesson",feedback_id,expected_content_sha256,request_sha256:fingerprint(["forget_lesson",feedback_id,expected_content_sha256])}
}
