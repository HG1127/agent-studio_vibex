import {readModelConnectionPage,type ModelPageQuery} from './model-connection-pagination.ts'
import {isIP} from "node:net"
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {assertOriginalUiEmployee} from "./native-original-ui-preconditions.ts"
import {encryptModelSecret,parseModelEncryptionKey} from "./model-connection-crypto.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import type {ProviderProbeInput,ProviderProbeResult} from "./model-connection-probe.ts"

export type ModelProvider="openai"|"anthropic"|"gemini"
export type ModelConnectionInput={
  name:string
  provider:ModelProvider
  base_url:string
  api_key?:string
  models:string[]
  enabled:boolean
}
export type ModelConnectionRow={
  id:string
  owner_user_id:string
  name:string
  provider:ModelProvider
  base_url:string
  api_key_tail:string
  enabled:boolean
  status:"untested"|"ok"|"error"
  last_latency_ms:number
  last_checked_at:string|null
  models:string[]
  last_error:string
  revision:number
  created_at:string
  updated_at:string
}
// Internal Worker-only material. Never return this shape from an HTTP handler.
export type ModelExecutionBinding={
  connection_id:string;connection_revision:number;model_id:string
}
export type ModelExecutionMaterial={
  owner_user_id:string;connection_id:string;connection_revision:number
  provider:ModelProvider;base_url:string;model_id:string;api_key:string
}
type StoredRow=Omit<ModelConnectionRow,"revision"|"models">&{
  revision:number|string
  models:string[]|string
}
const providers=new Set<ModelProvider>(["openai","anthropic","gemini"])
function invalid():never{throw new HttpError(400,"invalid_model_connection")}
function normalizeModels(raw:unknown):string[]{
  let values:unknown[]
  if(raw===undefined||raw===null)values=[]
  else if(Array.isArray(raw))values=raw
  else if(typeof raw==="string")values=raw.split(/[,，\n;；]+/)
  else return invalid()
  if(values.length>300)invalid()
  const output:string[]=[]
  const seen=new Set<string>()
  for(const value of values){
    if(typeof value!=="string")invalid()
    const item=value.trim()
    if(!item)continue
    if(item.length>200||/[\u0000-\u001f\u007f]/u.test(item))invalid()
    if(!seen.has(item)){seen.add(item);output.push(item)}
  }
  return output
}
function normalizeBaseUrl(raw:unknown):string{
  if(typeof raw!=="string"||raw.length>2048)invalid()
  let url:URL
  try{url=new URL(raw.trim())}catch{return invalid()}
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"")
  if(url.protocol!=="https:"||url.username||url.password||url.search||
     url.hash||!host.includes(".")||isIP(host)!==0||
     host==="localhost"||host.endsWith(".localhost")||
     host.endsWith(".local")||host.endsWith(".internal"))
    invalid()
  const normalized=url.href.replace(/\/+$/,"")
  if(normalized.length<8||normalized.length>2048)invalid()
  return normalized
}
export function safeModelConnectionInput(raw:unknown,requireKey:boolean):ModelConnectionInput{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const value=raw as Record<string,unknown>
  const allowed=new Set(["name","provider","base_url","api_key","models","enabled"])
  if(Object.keys(value).some(key=>!allowed.has(key)))invalid()
  if(typeof value.name!=="string"||!value.name.trim()||value.name.trim().length>100||
     /[\u0000-\u001f\u007f]/u.test(value.name))invalid()
  if(typeof value.provider!=="string"||!providers.has(value.provider as ModelProvider))
    invalid()
  const apiKey=value.api_key===undefined||value.api_key===null
    ?"":typeof value.api_key==="string"?value.api_key.trim():invalid()
  if(requireKey&&apiKey.length===0)throw new HttpError(400,"model_api_key_required")
  if(apiKey&&(apiKey.length<8||apiKey.length>4096||
     /[\u0000-\u001f\u007f\s]/u.test(apiKey)))invalid()
  if(value.enabled!==undefined&&typeof value.enabled!=="boolean")invalid()
  return {
    name:value.name.trim(),
    provider:value.provider as ModelProvider,
    base_url:normalizeBaseUrl(value.base_url),
    ...(apiKey?{api_key:apiKey}:{}),
    models:normalizeModels(value.models),
    enabled:value.enabled===undefined?true:value.enabled,
  }
}
function safeRow(row:StoredRow):ModelConnectionRow{
  const revision=Number(row.revision)
  if(!Number.isSafeInteger(revision)||revision<1)throw Error("invalid_model_connection_revision")
  let models:unknown=row.models
  if(typeof models==="string"){
    try{models=JSON.parse(models)}catch{models=[]}
  }
  if(!Array.isArray(models)||models.some(x=>typeof x!=="string"))
    throw Error("invalid_persisted_model_list")
  return {...row,revision,models:models as string[]}
}
const publicColumns="id,owner_user_id,name,provider,base_url,api_key_tail,enabled,status,"+
  "last_latency_ms,last_checked_at,models,last_error,revision,created_at,updated_at"
type ModelConnectionAuditAction="model.connection_create"|"model.connection_update"|"model.connection_enable"|"model.connection_disable"|"model.connection_delete"
async function auditModelConnection(db:SqlClient,actor:string,id:string,action:ModelConnectionAuditAction,revision:number):Promise<void>{
  await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) "+
    "VALUES($1::uuid,$1::uuid,$2::text,'model_connection',$3::text,'succeeded',$4::jsonb)",
    [actor,action,id,JSON.stringify({revision})])
}
export class ModelConnectionRepository{
  readonly originalUiProtocol="native_model_connections_owner_cas_v1" as const
  readonly paginationProtocol="native_model_connections_paging_v1" as const
  readonly pool:SqlPool
  readonly brokerPool:SqlPool
  readonly encryptionKey:Buffer
  // Prevent duplicate outbound probes for one connection in this isolated
  // single-process pilot; revisions and timestamps provide the DB-side fence.
  private readonly activeProbes=new Set<string>()
  constructor(pool:SqlPool,key:string|Buffer,brokerPool:SqlPool=pool){
    this.pool=pool
    // Production MUST provide a distinct broker-login pool. The default is
    // only for isolated PGlite tests; ordinary API credentials cannot SET
    // ROLE agentstudio_model_broker in a properly hardened database.
    this.brokerPool=brokerPool
    this.encryptionKey=Buffer.isBuffer(key)?key:parseModelEncryptionKey(key)
    if(this.encryptionKey.length!==32)throw Error("invalid_model_encryption_key")
  }
  listPage(identity:Identity,query:ModelPageQuery,expectedEmployee:string){
    return readModelConnectionPage({pool:this.pool,key:this.encryptionKey,identity,query,expectedEmployee,normalize:raw=>safeRow(raw as unknown as StoredRow)})
  }
  list(identity:Identity,limit=30):Promise<ModelConnectionRow[]>{
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<StoredRow>(
        "SELECT "+publicColumns+" FROM agentstudio.model_connections "+
        "WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT $2::int",
        [actor,bounded])
      return result.rows.map(safeRow)
    })
  }
  get(identity:Identity,id:string):Promise<ModelConnectionRow|null>{
    if(!isUuid(id))throw new HttpError(400,"invalid_model_connection_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<StoredRow>(
        "SELECT "+publicColumns+" FROM agentstudio.model_connections "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,actor])
      return result.rows[0]?safeRow(result.rows[0]):null
    })
  }
  create(identity:Identity,input:ModelConnectionInput,expectedEmployee?:string):Promise<ModelConnectionRow>{
    const apiKey=input.api_key
    if(!apiKey)throw new HttpError(400,"model_api_key_required")
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const secret=encryptModelSecret(apiKey,this.encryptionKey)
      const result=await db.query<StoredRow>(
        "INSERT INTO agentstudio.model_connections "+
        "(owner_user_id,name,provider,base_url,api_key_ciphertext,api_key_nonce,"+
        "api_key_tag,api_key_tail,enabled,models) "+
        "VALUES($1::uuid,$2::text,$3::text,$4::text,$5::bytea,$6::bytea,"+
        "$7::bytea,$8::text,$9::boolean,$10::jsonb) RETURNING "+publicColumns,
        [actor,input.name,input.provider,input.base_url,secret.ciphertext,
         secret.nonce,secret.tag,apiKey.slice(-4),input.enabled,
         JSON.stringify(input.models)])
      if(!result.rows[0])throw Error("model_connection_insert_missing")
      const saved=safeRow(result.rows[0])
      await auditModelConnection(db,actor,saved.id,"model.connection_create",saved.revision)
      return saved
    })
  }
  update(identity:Identity,id:string,input:ModelConnectionInput,revision:number,expectedEmployee?:string):Promise<ModelConnectionRow|null>{
    if(!isUuid(id))throw new HttpError(400,"invalid_model_connection_id")
    if(!Number.isSafeInteger(revision)||revision<1)throw new HttpError(400,"invalid_revision")
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const current=(await db.query<{revision:number|string;enabled:boolean}>(
        "SELECT revision,enabled FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[id,actor])).rows[0]
      if(!current){if(expectedEmployee!==undefined)throw new HttpError(404,"model_connection_not_found");return null}
      if(Number(current.revision)!==revision){if(expectedEmployee!==undefined)throw new HttpError(409,"revision_conflict");return null}
      const secret=input.api_key?encryptModelSecret(input.api_key,this.encryptionKey):null
      // Metadata-only changes never SELECT or reference encrypted columns.
      const columns=secret?"api_key_ciphertext=$6::bytea,api_key_nonce=$7::bytea,"+
        "api_key_tag=$8::bytea,api_key_tail=$9::text,":""
      const offset=secret?10:6
      const result=await db.query<StoredRow>(
        "UPDATE agentstudio.model_connections SET name=$3::text,provider=$4::text,"+
        "base_url=$5::text,"+columns+
        "enabled=$"+offset+"::boolean,models=$"+(offset+1)+"::jsonb,"+
        "status='untested',last_latency_ms=0,last_checked_at=NULL,"+
        "last_error='',revision=revision+1,updated_at=now() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND revision=$"+(offset+2)+"::bigint RETURNING "+publicColumns,
        [...[id,actor,input.name,input.provider,input.base_url],
         ...(secret?[secret.ciphertext,secret.nonce,secret.tag,input.api_key!.slice(-4)]:[]),
         input.enabled,JSON.stringify(input.models),revision])
      if(!result.rows[0]){if(expectedEmployee!==undefined)throw new HttpError(409,"revision_conflict");return null}
      const saved=safeRow(result.rows[0]),action:ModelConnectionAuditAction=current.enabled===saved.enabled?"model.connection_update":saved.enabled?"model.connection_enable":"model.connection_disable"
      await auditModelConnection(db,actor,saved.id,action,saved.revision)
      return saved
    })
  }
  delete(identity:Identity,id:string,expectedRevision?:number,expectedEmployee?:string):Promise<boolean>{
    if(!isUuid(id))throw new HttpError(400,"invalid_model_connection_id")
    if(expectedRevision!==undefined&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)||expectedEmployee!==undefined&&expectedRevision===undefined)throw new HttpError(400,"invalid_revision")
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const current=(await db.query<{revision:number|string}>(
        "SELECT revision FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[id,actor])).rows[0]
      if(!current){if(expectedEmployee!==undefined)throw new HttpError(404,"model_connection_not_found");return false}
      const revision=Number(current.revision)
      if(!Number.isSafeInteger(revision)||revision<1)throw Error("invalid_model_connection_revision")
      if(expectedRevision!==undefined&&revision!==expectedRevision)throw new HttpError(409,"revision_conflict")
      const result=await db.query<{id:string}>("DELETE FROM agentstudio.model_connections "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid"+(expectedRevision===undefined?"":" AND revision=$3::bigint")+" RETURNING id",
        expectedRevision===undefined?[id,actor]:[id,actor,expectedRevision])
      if(result.rows.length!==1){if(expectedEmployee!==undefined)throw new HttpError(409,"revision_conflict");return false}
      await auditModelConnection(db,actor,result.rows[0]!.id,"model.connection_delete",revision)
      return true
    })
  }
  // A model-list probe is deliberately separate from Agent execution.
  // Read and validate the owner's encrypted credentials under RLS, release
  // the DB connection before the network call, and persist only sanitized
  // metadata if the exact configuration revision is still current.
  async testConnection(
    identity:Identity,id:string,expectedRevision:number,
    probe:(input:ProviderProbeInput)=>Promise<ProviderProbeResult>,expectedEmployee?:string,
  ):Promise<ModelConnectionRow>{
    if(!isUuid(id))throw new HttpError(400,"invalid_model_connection_id")
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw new HttpError(400,"invalid_revision")
    if(this.activeProbes.has(id))
      throw new HttpError(429,"provider_probe_rate_limited")
    this.activeProbes.add(id)
    try{
    const material=await withModelBrokerActor(
      this.brokerPool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const results=await db.query<{
        provider:ModelProvider;base_url:string;revision:string|number
        last_checked_at:string|null;api_key_ciphertext:Uint8Array
        api_key_nonce:Uint8Array;api_key_tag:Uint8Array
      }>("SELECT provider,base_url,revision,last_checked_at,"+
        "api_key_ciphertext,api_key_nonce,api_key_tag "+
        "FROM agentstudio.model_connections WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid",[id,actor])
      const row=results.rows[0]
      if(!row)throw new HttpError(404,"model_connection_not_found")
      if(Number(row.revision)!==expectedRevision)
        throw new HttpError(409,"revision_conflict")
      const previous=row.last_checked_at?new Date(row.last_checked_at).getTime():NaN
      if(Number.isFinite(previous)&&Date.now()-previous<30000)
        throw new HttpError(429,"provider_probe_rate_limited")
      const api_key=decryptModelSecret({
        ciphertext:Buffer.from(row.api_key_ciphertext),
        nonce:Buffer.from(row.api_key_nonce),
        tag:Buffer.from(row.api_key_tag),
      },this.encryptionKey)
      return {provider:row.provider,base_url:row.base_url,api_key}
    })
    let outcome:ProviderProbeResult
    try{outcome=await probe(material)}
    catch{outcome={status:"error",latency_ms:0,
      error_code:"provider_transport_failed"}}
    const code=outcome.status==="ok"?"":(
      /^[a-z_]{1,80}$/.test(outcome.error_code)?
        outcome.error_code:"provider_transport_failed")
    const latency=Number.isSafeInteger(outcome.latency_ms)
      ?Math.max(0,Math.min(600000,outcome.latency_ms)):0
    const status=outcome.status==="ok"?"ok":"error"
    return await withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const result=await db.query<StoredRow>(
        "UPDATE agentstudio.model_connections "+
        "SET status=$4::text,last_latency_ms=$5::int,last_error=$6::text,"+
        "last_checked_at=now(),revision=revision+1,updated_at=now() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$3::bigint "+
        "RETURNING "+publicColumns,
        [id,actor,expectedRevision,status,latency,code])
      if(result.rows[0]){
        // Same transaction: never persist a probe status without its
        // owner-attributed audit event, and never log credentials or bodies.
        await db.query(
          "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
          "action,target_kind,target_id,result,metadata) VALUES("+
          "$1::uuid,$1::uuid,'model.connection_probe','model_connection',"+
          "$2::text,$3::text,$4::jsonb)",
          [actor,id,status==="ok"?"succeeded":"failed",
           JSON.stringify({latency_ms:latency,error_code:code})])
        return safeRow(result.rows[0])
      }
      const current=await db.query<{id:string}>(
        "SELECT id FROM agentstudio.model_connections WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid",[id,actor])
      if(!current.rows.length)throw new HttpError(404,"model_connection_not_found")
      throw new HttpError(409,"revision_conflict")
    })
    }finally{this.activeProbes.delete(id)}
  }
  // Resolve an employee-selected model connection while the caller's API-role
  // transaction holds FOR SHARE on the exact metadata revision. Encrypted
  // columns are fetched only through the independent, read-only Broker login.
  // The caller must persist its STARTED external-effect fence before invoking
  // any provider transport.
  async resolveExecutionMaterial(
    identity:Identity,ownerUserId:string,binding:ModelExecutionBinding,
    actorTransaction?:SqlClient,
  ):Promise<ModelExecutionMaterial>{
    if(!isUuid(ownerUserId)||!isUuid(binding?.connection_id)||
       !Number.isSafeInteger(binding?.connection_revision)||
       binding.connection_revision<1||
       typeof binding?.model_id!=="string"||
       !/^[A-Za-z0-9._:/-]{1,120}$/.test(binding.model_id))
      throw new HttpError(400,"invalid_model_execution_binding")
    const assertMetadata=(row:{
      provider:string;base_url:string;enabled:boolean;models:string[]|string
      revision:number|string
    })=>{
      if(Number(row.revision)!==binding.connection_revision)
        throw new HttpError(409,"model_connection_revision_changed")
      if(row.enabled!==true)throw new HttpError(409,"model_connection_disabled")
      let models:unknown=row.models
      if(typeof models==="string"){
        try{models=JSON.parse(models)}catch{models=[]}
      }
      if(!Array.isArray(models)||models.some(x=>typeof x!=="string"))
        throw new HttpError(409,"model_connection_model_list_invalid")
      if(!models.includes(binding.model_id))
        throw new HttpError(409,"model_not_allowed_by_connection")
      if(typeof row.provider!=="string"||!providers.has(row.provider as ModelProvider))
        throw new HttpError(409,"model_provider_not_supported")
      try{exactProviderEndpoint({
        provider:row.provider as ModelProvider,base_url:row.base_url,
      })}catch{throw new HttpError(409,"model_provider_endpoint_not_allowlisted")}
    }
    // Validate and hold the owner's API-role row lock across the Broker read
    // when called from Worker.begin(). A connection update cannot race between
    // checking its revision and recording the STARTED effect.
    if(actorTransaction){
      const current=await actorTransaction.query<{actor_id:string}>(
        "SELECT agentstudio.actor_id()::text AS actor_id")
      if(current.rows[0]?.actor_id!==ownerUserId)
        throw new HttpError(403,"model_connection_owner_mismatch")
      const locked=await actorTransaction.query<{
        provider:string;base_url:string;enabled:boolean
        models:string[]|string;revision:number|string
      }>("SELECT provider,base_url,enabled,models,revision "+
        "FROM agentstudio.model_connections WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid FOR SHARE",
        [binding.connection_id,ownerUserId])
      if(!locked.rows[0])throw new HttpError(404,"model_connection_not_found")
      assertMetadata(locked.rows[0])
    }
    return withModelBrokerActor(this.brokerPool,identity,async(broker,actor)=>{
      if(actor!==ownerUserId)
        throw new HttpError(403,"model_connection_owner_mismatch")
      const result=await broker.query<{
        id:string;owner_user_id:string;provider:string;base_url:string
        enabled:boolean;models:string[]|string;revision:number|string
        api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array
        api_key_tag:Uint8Array
      }>("SELECT id,owner_user_id,provider,base_url,enabled,models,revision,"+
        "api_key_ciphertext,api_key_nonce,api_key_tag "+
        "FROM agentstudio.model_connections WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid",
        [binding.connection_id,ownerUserId])
      const row=result.rows[0]
      if(!row)throw new HttpError(404,"model_connection_not_found")
      assertMetadata(row)
      let api_key:string
      try{api_key=decryptModelSecret({
        ciphertext:Buffer.from(row.api_key_ciphertext),
        nonce:Buffer.from(row.api_key_nonce),
        tag:Buffer.from(row.api_key_tag),
      },this.encryptionKey)}
      catch{throw new HttpError(503,"model_credential_unavailable")}
      return {owner_user_id:ownerUserId,connection_id:row.id,
        connection_revision:Number(row.revision),provider:row.provider as ModelProvider,
        base_url:row.base_url,model_id:binding.model_id,api_key}
    })
  }

  // Kept private to the provider runtime; never used by HTTP serialization.
  async secretForExecution(identity:Identity,id:string):Promise<string|null>{
    if(!isUuid(id))throw new HttpError(400,"invalid_model_connection_id")
    return withModelBrokerActor(this.brokerPool,identity,async(db,actor)=>{
      const result=await db.query<{
        api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array
      }>("SELECT api_key_ciphertext,api_key_nonce,api_key_tag "+
        "FROM agentstudio.model_connections "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND enabled=true",
        [id,actor])
      const row=result.rows[0]
      if(!row)return null
      const {decryptModelSecret}=await import("./model-connection-crypto.ts")
      return decryptModelSecret({ciphertext:Buffer.from(row.api_key_ciphertext),
        nonce:Buffer.from(row.api_key_nonce),tag:Buffer.from(row.api_key_tag)},this.encryptionKey)
    })
  }
}
