// Inert sharing foundation: no HTTP/UI activation or shared content retrieval.
import {createHash} from "node:crypto"
import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActor} from "./repository.ts"

export type KnowledgeRecipientResolver=(identity:Identity,email:string)=>Promise<{id:string;display_name:string}|null>
type Role="viewer"|"editor"
type Choice={request_id:string;expected_revision:number}&(
  {action:"grant";recipient_email:string;role:Role;semantic_allowed:boolean}|
  {action:"revoke";recipient_id:string}|
  {action:"semantic";recipient_id:string;enabled:boolean})
export interface KnowledgeGrant {
  recipient_user_id:string;recipient_name:string;recipient_active:boolean
  access_role:Role;semantic_allowed:boolean;revoked:boolean;revision:number
}
export interface KnowledgeAccessReceipt {
  request_id:string;base_id:string;recipient_id:string;role:Role
  semantic_allowed:boolean;revoked:boolean;revision:number
}
export interface SharedKnowledgeMetadata {
  id:string;owner_user_id:string;owner_name:string;name:string;description:string
  access_role:Role;semantic_allowed:boolean;access_revision:number;base_revision:number
}
function positive(raw:unknown):number {
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value<1)throw Error("invalid_knowledge_access_revision")
  return value
}
function parse(raw:unknown):Choice {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_knowledge_access_change")
  const b=raw as Record<string,unknown>,common=["request_id","expected_revision","action"]
  const specific=b.action==="grant"?["recipient_email","role","semantic_allowed"]:
    b.action==="revoke"?["recipient_id"]:b.action==="semantic"?["recipient_id","enabled"]:[]
  if(!specific.length||Object.keys(b).some(k=>![...common,...specific].includes(k))||
    !isUuid(b.request_id)||!Number.isSafeInteger(b.expected_revision)||(b.expected_revision as number)<0||
    (b.expected_revision as number)>=Number.MAX_SAFE_INTEGER)
    throw new HttpError(400,"invalid_knowledge_access_change")
  const prefix={request_id:b.request_id.toLowerCase(),expected_revision:b.expected_revision as number}
  if(b.action==="grant"){
    if(typeof b.recipient_email!=="string"||b.recipient_email.length>180||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.recipient_email.trim())||
      (b.role!=="viewer"&&b.role!=="editor")||typeof b.semantic_allowed!=="boolean")
      throw new HttpError(400,"invalid_knowledge_recipient")
    return {...prefix,action:"grant",recipient_email:b.recipient_email.trim().toLowerCase(),role:b.role,semantic_allowed:b.semantic_allowed}
  }
  if(!isUuid(b.recipient_id)||prefix.expected_revision<1||
    (b.action==="semantic"&&typeof b.enabled!=="boolean"))throw new HttpError(400,"invalid_knowledge_recipient")
  return b.action==="revoke"?{...prefix,action:"revoke",recipient_id:b.recipient_id.toLowerCase()}:
    {...prefix,action:"semantic",recipient_id:b.recipient_id.toLowerCase(),enabled:b.enabled as boolean}
}
async function owned(db:SqlClient,actor:string,baseId:string,lock=false):Promise<void>{
  const row=await db.query<{id:string}>("SELECT id FROM agentstudio.knowledge_bases "+
    "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND visibility='private'"+(lock?" FOR UPDATE":""),[baseId,actor])
  if(!row.rows[0])throw new HttpError(404,"knowledge_base_not_found")
}
function validBase(id:string):void{if(!isUuid(id))throw new HttpError(400,"invalid_knowledge_base_id")}
export class KnowledgeAccessRepository {
  readonly pool:SqlPool
  readonly resolveRecipient:KnowledgeRecipientResolver
  constructor(pool:SqlPool,resolveRecipient:KnowledgeRecipientResolver){this.pool=pool;this.resolveRecipient=resolveRecipient}
  listShared(identity:Identity):Promise<SharedKnowledgeMetadata[]>{
    return withActor(this.pool,identity,async db=>(await db.query<SharedKnowledgeMetadata>(
      "SELECT * FROM agentstudio.knowledge_shared_bases()")).rows.map(row=>({...row,
        access_revision:positive(row.access_revision),base_revision:positive(row.base_revision)})))
  }
  listGrants(identity:Identity,baseId:string):Promise<KnowledgeGrant[]>{
    validBase(baseId)
    return withActor(this.pool,identity,async(db,actor)=>{
      await owned(db,actor,baseId)
      return (await db.query<KnowledgeGrant>("SELECT * FROM agentstudio.knowledge_owner_grants($1::uuid)",[baseId])).rows
        .map(row=>({...row,revision:positive(row.revision)}))
    })
  }
  receipt(identity:Identity,baseId:string,requestId:string):Promise<KnowledgeAccessReceipt|null>{
    validBase(baseId)
    if(!isUuid(requestId))throw new HttpError(400,"invalid_knowledge_access_request")
    return withActor(this.pool,identity,async(db,actor)=>{
      await owned(db,actor,baseId)
      return (await db.query<{result:KnowledgeAccessReceipt}>("SELECT result FROM agentstudio.knowledge_access_receipts "+
        "WHERE owner_user_id=$1::uuid AND base_id=$2::uuid AND request_id=$3::uuid",[actor,baseId,requestId])).rows[0]?.result??null
    })
  }
  async change(identity:Identity,baseId:string,raw:unknown):Promise<{item:KnowledgeAccessReceipt;replayed:boolean}>{
    validBase(baseId)
    const input=parse(raw),fingerprint=createHash("sha256").update(JSON.stringify({base_id:baseId.toLowerCase(),...input})).digest("hex")
    // Resolve exact email through the dedicated auth service BEFORE the business
    // transaction. No nested pool/transaction; no auth grants for API/Worker.
    // Check an existing receipt first so response-loss retries need no lookup.
    const previous=await this.receipt(identity,baseId,input.request_id)
    let recipient:{id:string;display_name:string}|null=null
    if(!previous&&input.action==="grant")recipient=await this.resolveRecipient(identity,input.recipient_email)
    return withActor(this.pool,identity,async(db,actor)=>{
      await db.query("SET LOCAL lock_timeout='3s'")
      await db.query("SET LOCAL statement_timeout='5s'")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[actor+":"+input.request_id])
      await owned(db,actor,baseId,true)
      const oldReceipt=(await db.query<{base_id:string;request_sha256:string;result:KnowledgeAccessReceipt}>(
        "SELECT base_id,request_sha256,result FROM agentstudio.knowledge_access_receipts "+
        "WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[actor,input.request_id])).rows[0]
      if(oldReceipt){
        if(oldReceipt.base_id.toLowerCase()!==baseId.toLowerCase()||oldReceipt.request_sha256!==fingerprint)
          throw new HttpError(409,"knowledge_access_request_conflict")
        return {item:oldReceipt.result,replayed:true}
      }
      const resolved=input.action==="grant"?recipient?.id:input.recipient_id
      if(!isUuid(resolved)||resolved.toLowerCase()===actor)throw new HttpError(404,"knowledge_recipient_not_found")
      const target=resolved.toLowerCase()
      const current=(await db.query<{access_role:Role;semantic_allowed:boolean;revoked:boolean;revision:number}>(
        "SELECT access_role,semantic_allowed,revoked,revision FROM agentstudio.knowledge_access "+
        "WHERE base_id=$1::uuid AND owner_user_id=$2::uuid AND recipient_user_id=$3::uuid",[baseId,actor,target])).rows[0]
      if((current?positive(current.revision):0)!==input.expected_revision)
        throw new HttpError(409,"knowledge_access_revision_conflict")
      if(input.action!=="revoke"){
        const active=(await db.query<{active:boolean}>("SELECT agentstudio.knowledge_share_recipient_active($1::uuid,$2::uuid) AS active",[baseId,target])).rows[0]?.active
        if(active!==true)throw new HttpError(404,"knowledge_recipient_not_found")
      }
      if(input.action==="grant"){
        const count=(await db.query<{total:number}>("SELECT count(*)::int AS total FROM agentstudio.knowledge_access WHERE base_id=$1::uuid AND NOT revoked",[baseId])).rows[0]?.total
        if(!Number.isSafeInteger(count)||Number(count)<0)throw Error("invalid_knowledge_share_count")
        if((!current||current.revoked)&&Number(count)>=50)throw new HttpError(429,"knowledge_share_limit")
      }else if(!current||current.revoked)throw new HttpError(404,"knowledge_recipient_not_found")
      const result:KnowledgeAccessReceipt={request_id:input.request_id,base_id:baseId.toLowerCase(),recipient_id:target,
        role:input.action==="grant"?input.role:current!.access_role,
        semantic_allowed:input.action==="grant"?input.semantic_allowed:input.action==="semantic"?input.enabled:false,
        revoked:input.action==="revoke",revision:input.expected_revision+1}
      await db.query("INSERT INTO agentstudio.knowledge_access (base_id,owner_user_id,recipient_user_id,access_role,semantic_allowed,revoked,revision) "+
        "VALUES($1::uuid,$2::uuid,$3::uuid,$4::text,$5::boolean,$6::boolean,$7::bigint) "+
        "ON CONFLICT(base_id,recipient_user_id) DO UPDATE SET access_role=excluded.access_role,semantic_allowed=excluded.semantic_allowed,"+
        "revoked=excluded.revoked,revision=excluded.revision,updated_at=now()",[baseId,actor,target,result.role,result.semantic_allowed,result.revoked,result.revision])
      await db.query("INSERT INTO agentstudio.knowledge_access_receipts(owner_user_id,request_id,base_id,request_sha256,result) "+
        "VALUES($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb)",[actor,input.request_id,baseId,fingerprint,JSON.stringify(result)])
      await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,$2::text,'knowledge_base',$3::text,'succeeded',$4::jsonb)",
        [actor,"knowledge_access."+input.action,baseId,JSON.stringify(result)])
      return {item:result,replayed:false}
    })
  }
}
