import {createHash} from "node:crypto"
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {parseAgentCollaborationChoice,type AgentCollaborationChoice} from "./agent-collaboration-contract.ts"
import {extractAgentSafeText,normalizeAgentSafeText} from "./agent-safe-text.ts"
type ObjectValue=Record<string,unknown>
export type AgentCollaborationRecipientResolver=(identity:Identity,email:string)=>Promise<{id:string;display_name:string}|null>
function badResponse():never{throw new HttpError(503,"invalid_agent_collaboration_response")}
function object(value:unknown):ObjectValue{if(!value||typeof value!=="object"||Array.isArray(value))badResponse();return value as ObjectValue}
function text(value:unknown,max:number):string{if(typeof value!=="string"||value.length>max||value.includes("\0"))badResponse();return value}
function id(value:unknown):string{if(!isUuid(value))badResponse();return value.toLowerCase()}
function positive(value:unknown):number{
  if(typeof value!=="number"&&!(typeof value==="string"&&/^[1-9][0-9]*$/.test(value)))badResponse()
  const number=Number(value);if(!Number.isSafeInteger(number)||number<1)badResponse();return number
}
function hash(value:unknown):string{const result=text(value,64);if(!/^[a-f0-9]{64}$/.test(result))badResponse();return result}
function bool(value:unknown):boolean{if(typeof value!=="boolean")badResponse();return value}
function role(value:unknown):"owner"|"viewer"|"editor"{if(value!=="owner"&&value!=="viewer"&&value!=="editor")badResponse();return value}
function date(value:unknown):string{const result=text(value,80);if(!Number.isFinite(Date.parse(result)))badResponse();return result}
function array(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max)badResponse();return value}
function result(value:unknown,specId:string,requestId:string){
  const v=object(value)
  if(id(v.spec_id)!==specId||id(v.request_id)!==requestId)badResponse()
  const out:ObjectValue={spec_id:specId,request_id:requestId,replayed:bool(v.replayed)}
  for(const key of ["revision","base_revision"])if(v[key]!==undefined)out[key]=positive(v[key])
  for(const key of ["recipient_id","proposal_id","source_revision_id"])if(v[key]!==undefined)out[key]=id(v[key])
  if(v.source_sha256!==undefined)out.source_sha256=hash(v.source_sha256)
  if(v.active!==undefined)out.active=bool(v.active)
  if(v.role!==undefined){const access=role(v.role);if(access==="owner")badResponse();out.role=access}
  if(v.status!==undefined){if(!["pending","accepted","rejected"].includes(String(v.status)))badResponse();out.status=v.status}
  return out
}
const errors=new Set(["agent_collaboration_actor_unavailable","invalid_agent_collaboration_grant","agent_collaboration_not_found","agent_collaboration_request_conflict",
  "agent_collaboration_grant_changed","agent_collaboration_recipient_unavailable","agent_collaboration_grant_limit","invalid_agent_collaboration_proposal",
  "agent_collaboration_protected_field","agent_collaboration_editor_required","agent_collaboration_source_changed","agent_collaboration_pending_exists",
  "invalid_agent_collaboration_review","agent_collaboration_proposal_not_found","agent_collaboration_proposal_changed","agent_collaboration_author_revoked",
  "invalid_agent_collaboration_restore","agent_collaboration_revision_not_found","invalid_agent_collaboration_revision","agent_collaboration_text_unavailable","invalid_agent_collaboration_edit"])
async function transaction<T>(pool:SqlPool,identity:Identity,body:(db:SqlClient,actor:string)=>Promise<T>):Promise<T>{
  try{return await withActor(pool,identity,async(db,actor)=>{
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
    const installed=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_045') AND "+
      "to_regprocedure('agentstudio.agent_collaboration_review(uuid,uuid,bigint,text,text,text,boolean,uuid,text)') IS NOT NULL AS ok")).rows[0]?.ok
    if(installed!==true)throw new HttpError(503,"agent_collaboration_not_installed")
    return body(db,actor)
  })}catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&errors.has(String(error.message))){
      const code=String(error.message),status=code.endsWith("not_found")||code==="agent_collaboration_recipient_unavailable"?404:code==="agent_collaboration_grant_limit"?429:
        code==="agent_collaboration_actor_unavailable"||code==="agent_collaboration_editor_required"?403:code.startsWith("invalid_")||code==="agent_collaboration_protected_field"?400:409
      throw new HttpError(status,code)
    }throw error
  }
}
function specId(value:string):string{if(!isUuid(value))throw new HttpError(400,"invalid_spec_id");return value.toLowerCase()}
async function receipt(db:SqlClient,spec:string,request:string){
  const value=(await db.query<{receipt:unknown}>("SELECT agentstudio.agent_collaboration_receipt($1::uuid,$2::uuid) AS receipt",[spec,request])).rows[0]?.receipt
  if(value===null)return null
  const v=object(value);return {request_sha256:hash(v.request_sha256),result:result(v.result,spec,request)}
}
export class AgentCollaborationRepository{
  readonly pool:SqlPool;readonly resolveRecipient:AgentCollaborationRecipientResolver;readonly enabled:boolean
  constructor(pool:SqlPool,resolveRecipient:AgentCollaborationRecipientResolver,options:{enabled?:boolean}={}){this.pool=pool;this.resolveRecipient=resolveRecipient;this.enabled=options.enabled===true}
  list(identity:Identity){return transaction(this.pool,identity,async db=>{
    const value=(await db.query<{items:unknown}>("SELECT agentstudio.agent_collaboration_list() AS items")).rows[0]?.items
    return array(value,200).map(item=>{const v=object(item);return {id:id(v.id),name:text(v.name,120),revision:positive(v.revision),role:role(v.role),owner_name:text(v.owner_name,200)}})
  })}
  detail(identity:Identity,rawId:string){const target=specId(rawId);return transaction(this.pool,identity,async(db,actor)=>{
    const value=(await db.query<{item:unknown}>("SELECT agentstudio.agent_collaboration_detail($1::uuid) AS item",[target])).rows[0]?.item
    if(value===null)throw new HttpError(404,"agent_collaboration_not_found")
    const v=object(value),access=role(v.role);if(id(v.id)!==target)badResponse()
    return {id:target,name:text(v.name,120),revision:positive(v.revision),role:access,safe:extractAgentSafeText(v.safe),source_sha256:hash(v.source_sha256),
      grants:access!=="owner"?[]:array(v.grants,100).map(item=>{const g=object(item),access=role(g.role);if(access==="owner")badResponse()
        return {recipient_id:id(g.recipient_id),name:text(g.name,200),role:access,active:bool(g.active),recipient_active:bool(g.recipient_active),revision:positive(g.revision)}}),
      proposals:access==="viewer"?[]:array(v.proposals,40).flatMap(item=>{const p=object(item),author=id(p.author_user_id)
        if(access!=="owner"&&author!==actor)return []
        if(!["pending","accepted","rejected","invalidated"].includes(String(p.status)))badResponse()
        return [{id:id(p.id),author_user_id:author,base_revision:positive(p.base_revision),base_sha256:hash(p.base_sha256),proposal_sha256:hash(p.proposal_sha256),
          proposed:normalizeAgentSafeText(p.proposed),comment:text(p.comment,600),status:p.status as "pending"|"accepted"|"rejected"|"invalidated",created_at:date(p.created_at),reviewed_at:p.reviewed_at===null?null:date(p.reviewed_at)}]})}
  })}
  revisions(identity:Identity,rawId:string){const target=specId(rawId);return transaction(this.pool,identity,async db=>{
    const value=(await db.query<{items:unknown}>("SELECT agentstudio.agent_collaboration_revisions($1::uuid) AS items",[target])).rows[0]?.items
    if(value===null)throw new HttpError(404,"agent_collaboration_not_found")
    return array(value,80).map(item=>{const v=object(item);if(!["before_edit","edited","before_accept","accepted","before_restore","restored"].includes(String(v.kind)))badResponse()
      return {id:id(v.id),actor_user_id:id(v.actor_user_id),kind:v.kind as "before_edit"|"edited"|"before_accept"|"accepted"|"before_restore"|"restored",
        source_revision_id:v.source_revision_id===null?null:id(v.source_revision_id),proposal_id:v.proposal_id===null?null:id(v.proposal_id),spec_revision:positive(v.spec_revision),
        source_sha256:hash(v.source_sha256),safe:extractAgentSafeText(v.safe),note:text(v.note,600),created_at:date(v.created_at)}})
  })}
  async change(identity:Identity,rawId:string,raw:unknown){
    const target=specId(rawId),choice=parseAgentCollaborationChoice(raw),fingerprint=createHash("sha256").update(JSON.stringify({spec_id:target,...choice})).digest("hex")
    const recover=(previous:Awaited<ReturnType<typeof receipt>>)=>{if(!previous)return null
      if(previous.request_sha256!==fingerprint)throw new HttpError(409,"agent_collaboration_request_conflict")
      return previous.result}
    const prior=await transaction(this.pool,identity,db=>receipt(db,target,choice.request_id)),recovered=recover(prior)
    if(recovered)return recovered
    if(!this.enabled&&choice.action!=="revoke"&&!(choice.action==="review"&&choice.decision==="reject"))throw new HttpError(403,"agent_collaboration_writes_disabled")
    let recipient:{id:string;display_name:string}|null=null
    if(choice.action==="grant"){
      await transaction(this.pool,identity,async(db,actor)=>{if(!(await db.query("SELECT id FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid",[target,actor])).rows[0])throw new HttpError(404,"agent_collaboration_not_found")})
      recipient=await this.resolveRecipient(identity,choice.recipient_email)
    }
    return transaction(this.pool,identity,async(db,actor)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,45))",[actor+":"+choice.request_id])
      const existing=recover(await receipt(db,target,choice.request_id));if(existing)return existing
      return this.apply(db,target,choice,fingerprint,recipient)
    })
  }
  confirm(identity:Identity,rawId:string,raw:unknown){
    const target=specId(rawId),choice=parseAgentCollaborationChoice(raw),fingerprint=createHash("sha256").update(JSON.stringify({spec_id:target,...choice})).digest("hex")
    return transaction(this.pool,identity,async db=>{
      const previous=await receipt(db,target,choice.request_id)
      if(!previous)throw new HttpError(404,"agent_collaboration_receipt_not_found")
      if(previous.request_sha256!==fingerprint)throw new HttpError(409,"agent_collaboration_request_conflict")
      return previous.result
    })
  }
  private async apply(db:SqlClient,target:string,choice:AgentCollaborationChoice,fingerprint:string,recipient:{id:string;display_name:string}|null){
    let query:string,args:unknown[]
    if(choice.action==="grant"||choice.action==="grant_existing"||choice.action==="revoke"){
      const recipientId=choice.action==="grant"?recipient?.id:choice.recipient_id
      if(!isUuid(recipientId))throw new HttpError(404,"agent_collaboration_recipient_unavailable")
      query="SELECT agentstudio.agent_collaboration_grant($1::uuid,$2::uuid,$3::text,$4::bigint,$5::uuid,$6::text) AS result"
      args=[target,recipientId,choice.action==="revoke"?null:choice.role,choice.expected_access_revision,choice.request_id,fingerprint]
    }else if(choice.action==="edit"){
      query="SELECT agentstudio.agent_collaboration_edit($1::uuid,$2::bigint,$3::text,$4::jsonb,$5::uuid,$6::text) AS result"
      args=[target,choice.expected_spec_revision,choice.source_sha256,JSON.stringify(choice.safe),choice.request_id,fingerprint]
    }else if(choice.action==="propose"){
      query="SELECT agentstudio.agent_collaboration_propose($1::uuid,$2::bigint,$3::text,$4::jsonb,$5::text,$6::uuid,$7::text) AS result"
      args=[target,choice.expected_spec_revision,choice.source_sha256,JSON.stringify(choice.proposed),choice.comment,choice.request_id,fingerprint]
    }else if(choice.action==="review"){
      query="SELECT agentstudio.agent_collaboration_review($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text,$7::boolean,$8::uuid,$9::text) AS result"
      args=[target,choice.proposal_id,choice.expected_spec_revision,choice.source_sha256,choice.proposal_sha256,choice.decision,choice.confirm,choice.request_id,fingerprint]
    }else{
      query="SELECT agentstudio.agent_collaboration_restore($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::boolean,$7::uuid,$8::text) AS result"
      args=[target,choice.revision_id,choice.expected_spec_revision,choice.source_sha256,choice.reason,choice.confirm,choice.request_id,fingerprint]
    }
    return result((await db.query<{result:unknown}>(query,args)).rows[0]?.result,target,choice.request_id)
  }
}
