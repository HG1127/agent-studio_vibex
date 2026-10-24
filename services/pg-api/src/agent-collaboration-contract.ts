import {HttpError,isUuid} from "./contracts.ts"
import {normalizeAgentSafeText,type AgentSafeText} from "./agent-safe-text.ts"
type Request={request_id:string}
type Source={expected_spec_revision:number;source_sha256:string}
export type AgentCollaborationChoice=Request&(
  {action:"grant";recipient_email:string;role:"viewer"|"editor";expected_access_revision:number}|
  {action:"grant_existing";recipient_id:string;role:"viewer"|"editor";expected_access_revision:number}|
  {action:"revoke";recipient_id:string;expected_access_revision:number}|
  Source&{action:"edit";safe:AgentSafeText}|
  Source&{action:"propose";proposed:AgentSafeText;comment:string}|
  Source&{action:"review";proposal_id:string;proposal_sha256:string;decision:"accept"|"reject";confirm:true}|
  Source&{action:"restore";revision_id:string;reason:string;confirm:true})
function invalid():never{throw new HttpError(400,"invalid_agent_collaboration_change")}
function uuid(value:unknown):string{if(!isUuid(value))invalid();return value.toLowerCase()}
function revision(value:unknown,min=1):number{
  if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>=Number.MAX_SAFE_INTEGER)invalid()
  return Number(value)
}
function sha(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value))invalid();return value}
function note(value:unknown,max:number):string{if(typeof value!=="string"||value.includes("\0")||value.trim().length<8||value.length>max)invalid();return value.trim()}
export function parseAgentCollaborationChoice(raw:unknown):AgentCollaborationChoice{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const value=raw as Record<string,unknown>,fields:Record<string,string[]>={
    grant:["recipient_email","role","expected_access_revision"],grant_existing:["recipient_id","role","expected_access_revision"],revoke:["recipient_id","expected_access_revision"],
    edit:["expected_spec_revision","source_sha256","safe"],propose:["expected_spec_revision","source_sha256","proposed","comment"],review:["expected_spec_revision","source_sha256","proposal_id","proposal_sha256","decision","confirm"],
    restore:["expected_spec_revision","source_sha256","revision_id","reason","confirm"],
  }
  const action=value.action
  if(typeof action!=="string"||!Object.hasOwn(fields,action))invalid()
  const specific=fields[action]
  if(!specific)invalid()
  const keys=["action","request_id",...specific]
  if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))invalid()
  const request_id=uuid(value.request_id)
  if(action==="grant"||action==="grant_existing"){
    if(value.role!=="viewer"&&value.role!=="editor")invalid()
    const expected_access_revision=revision(value.expected_access_revision,action==="grant"?0:1),role=value.role
    if(action==="grant_existing")return {action,request_id,recipient_id:uuid(value.recipient_id),role,expected_access_revision}
    if(typeof value.recipient_email!=="string"||value.recipient_email.length>180||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.recipient_email.trim()))invalid()
    return {action,request_id,recipient_email:value.recipient_email.trim().toLowerCase(),role,expected_access_revision}
  }
  if(action==="revoke")return {action,request_id,recipient_id:uuid(value.recipient_id),expected_access_revision:revision(value.expected_access_revision)}
  const source={expected_spec_revision:revision(value.expected_spec_revision),source_sha256:sha(value.source_sha256)}
  if(action==="edit")return {action,request_id,...source,safe:normalizeAgentSafeText(value.safe)}
  if(action==="propose")return {action,request_id,...source,proposed:normalizeAgentSafeText(value.proposed),comment:note(value.comment,600)}
  if(value.confirm!==true)invalid()
  if(action==="review"){
    if(value.decision!=="accept"&&value.decision!=="reject")invalid()
    return {action,request_id,...source,proposal_id:uuid(value.proposal_id),proposal_sha256:sha(value.proposal_sha256),decision:value.decision,confirm:true}
  }
  return {action:"restore",request_id,...source,revision_id:uuid(value.revision_id),reason:note(value.reason,500),confirm:true}
}
