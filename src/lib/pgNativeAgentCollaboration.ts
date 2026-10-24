import {extractAgentSafeText,type AgentSafeText} from "../../services/pg-api/src/agent-safe-text.ts"
import {parseAgentCollaborationChoice,type AgentCollaborationChoice} from "../../services/pg-api/src/agent-collaboration-contract.ts"
export type PgNativeAgentSafeText=AgentSafeText
export type PgNativeAgentCollaborationChoice=AgentCollaborationChoice
export type PgNativeAgentCollaborationRole="owner"|"viewer"|"editor"
export type PgNativeAgentCollaborationSummary={id:string;name:string;revision:number;role:PgNativeAgentCollaborationRole;owner_name:string}
export type PgNativeAgentCollaborationGrant={recipient_id:string;name:string;role:"viewer"|"editor";active:boolean;recipient_active:boolean;revision:number}
export type PgNativeAgentCollaborationProposal={id:string;author_user_id:string;base_revision:number;base_sha256:string;proposal_sha256:string;proposed:AgentSafeText;comment:string;status:"pending"|"accepted"|"rejected"|"invalidated";created_at:string;reviewed_at:string|null}
export type PgNativeAgentCollaborationDetail={id:string;name:string;revision:number;role:PgNativeAgentCollaborationRole;safe:AgentSafeText;source_sha256:string;grants:PgNativeAgentCollaborationGrant[];proposals:PgNativeAgentCollaborationProposal[]}
export type PgNativeAgentCollaborationRevision={id:string;actor_user_id:string;kind:"before_edit"|"edited"|"before_accept"|"accepted"|"before_restore"|"restored";source_revision_id:string|null;proposal_id:string|null;spec_revision:number;source_sha256:string;safe:AgentSafeText;note:string;created_at:string}
export type PgNativeAgentCollaborationResult={spec_id:string;request_id:string;replayed:boolean;revision?:number;source_sha256?:string;recipient_id?:string;role?:"viewer"|"editor";active?:boolean;proposal_id?:string;status?:"pending"|"accepted"|"rejected";base_revision?:number;source_revision_id?:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function invalid():never{throw Error("invalid_pg_native_agent_collaboration_response")}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))invalid();return v as Record<string,unknown>}
function text(v:unknown,max:number):string{if(typeof v!=="string"||v.length>max||v.includes("\0"))invalid();return v}
function id(v:unknown):string{if(typeof v!=="string"||!uuid.test(v))invalid();return v.toLowerCase()}
function revision(v:unknown):number{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<1)invalid();return v}
function hash(v:unknown):string{if(typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v))invalid();return v}
function bool(v:unknown):boolean{if(typeof v!=="boolean")invalid();return v}
function date(v:unknown):string{const value=text(v,80);if(!Number.isFinite(Date.parse(value)))invalid();return value}
function array(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)invalid();return v}
function role(v:unknown):PgNativeAgentCollaborationRole{if(v!=="owner"&&v!=="viewer"&&v!=="editor")invalid();return v}
function safe(v:unknown):AgentSafeText{const value=object(v),keys=["goal","task_scope","deliverables","task_plan","done_criteria"]
  if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))invalid()
  try{return extractAgentSafeText(value)}catch{invalid()}}
export function collaborationChoice(v:unknown):AgentCollaborationChoice{return parseAgentCollaborationChoice(v)}
export function collaborationSummaries(v:unknown):PgNativeAgentCollaborationSummary[]{return array(v,200).map(item=>{const p=object(item);return {id:id(p.id),name:text(p.name,120),revision:revision(p.revision),role:role(p.role),owner_name:text(p.owner_name,200)}})}
export function collaborationDetail(v:unknown,expected:string):PgNativeAgentCollaborationDetail{
  const p=object(v),access=role(p.role);if(id(p.id)!==expected.toLowerCase())invalid()
  return {id:id(p.id),name:text(p.name,120),revision:revision(p.revision),role:access,safe:safe(p.safe),source_sha256:hash(p.source_sha256),
    grants:access!=="owner"?[]:array(p.grants,100).map(item=>{const g=object(item),access=role(g.role);if(access==="owner")invalid()
      return {recipient_id:id(g.recipient_id),name:text(g.name,200),role:access,active:bool(g.active),recipient_active:bool(g.recipient_active),revision:revision(g.revision)}}),
    proposals:access==="viewer"?[]:array(p.proposals,40).map(item=>{const a=object(item),status=a.status;if(status!=="pending"&&status!=="accepted"&&status!=="rejected"&&status!=="invalidated")invalid()
      return {id:id(a.id),author_user_id:id(a.author_user_id),base_revision:revision(a.base_revision),base_sha256:hash(a.base_sha256),proposal_sha256:hash(a.proposal_sha256),
        proposed:safe(a.proposed),comment:text(a.comment,600),status,created_at:date(a.created_at),reviewed_at:a.reviewed_at===null?null:date(a.reviewed_at)}})}
}
export function collaborationRevisions(v:unknown):PgNativeAgentCollaborationRevision[]{return array(v,80).map(item=>{const p=object(item),kind=p.kind
  if(kind!=="before_edit"&&kind!=="edited"&&kind!=="before_accept"&&kind!=="accepted"&&kind!=="before_restore"&&kind!=="restored")invalid()
  return {id:id(p.id),actor_user_id:id(p.actor_user_id),kind,source_revision_id:p.source_revision_id===null?null:id(p.source_revision_id),proposal_id:p.proposal_id===null?null:id(p.proposal_id),
    spec_revision:revision(p.spec_revision),source_sha256:hash(p.source_sha256),safe:safe(p.safe),note:text(p.note,600),created_at:date(p.created_at)}})}
export function collaborationResult(v:unknown,target:string,choice:AgentCollaborationChoice):PgNativeAgentCollaborationResult{
  const p=object(v);if(id(p.spec_id)!==target.toLowerCase()||id(p.request_id)!==choice.request_id)invalid()
  const result:PgNativeAgentCollaborationResult={spec_id:id(p.spec_id),request_id:id(p.request_id),replayed:bool(p.replayed)}
  if(choice.action==="grant"||choice.action==="grant_existing"||choice.action==="revoke"){
    const access=role(p.role);if(access==="owner"||revision(p.revision)!==choice.expected_access_revision+1||bool(p.active)!==(choice.action!=="revoke"))invalid()
    if(choice.action!=="grant"&&id(p.recipient_id)!==choice.recipient_id)invalid()
    if(choice.action!=="revoke"&&access!==choice.role)invalid()
    return {...result,recipient_id:id(p.recipient_id),revision:revision(p.revision),role:access,active:bool(p.active)}
  }
  if(choice.action==="propose"){
    if(revision(p.base_revision)!==choice.expected_spec_revision||p.status!=="pending")invalid()
    return {...result,proposal_id:id(p.proposal_id),base_revision:revision(p.base_revision),status:"pending"}
  }
  const next=choice.action==="review"&&choice.decision==="reject"?choice.expected_spec_revision:choice.expected_spec_revision+1
  if(revision(p.revision)!==next)invalid();result.revision=revision(p.revision);result.source_sha256=hash(p.source_sha256)
  if(choice.action==="review"){
    if(id(p.proposal_id)!==choice.proposal_id||p.status!==(choice.decision==="accept"?"accepted":"rejected"))invalid()
    result.proposal_id=id(p.proposal_id);result.status=choice.decision==="accept"?"accepted":"rejected"
  }else if(choice.action==="restore"){
    if(id(p.source_revision_id)!==choice.revision_id)invalid();result.source_revision_id=id(p.source_revision_id)
  }
  return result
}
