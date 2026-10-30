import {originalToolConnectionsProtocol} from '../../../shared/original-tool-connections-contract.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {isIP} from "node:net"
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {encryptModelSecret,parseModelEncryptionKey} from "./model-connection-crypto.ts"

export type ToolHeaderInput={key:string;value:string}
export type ToolConnectionInput={
  name:string;description:string;url:string;method:"GET"|"POST"
  headers:ToolHeaderInput[];body_template:string;timeout_s:number;enabled:boolean
}
export type ToolConnectionHeader={key:string;value:string}
export type ToolConnectionRow={
  id:string;owner_user_id:string;name:string;description:string;url:string
  method:"GET"|"POST";headers:ToolConnectionHeader[];body_template:string
  timeout_s:number;enabled:boolean;status:"untested"|"ok"|"error"
  last_latency_ms:number;last_checked_at:string|null;last_error:string
  revision:number;created_at:string;updated_at:string
}
type StoredRow=Omit<ToolConnectionRow,"headers"|"revision"|"method"|"status"> & {
  revision:number|string;method:string;status:string
}
const publicColumns="id,owner_user_id,name,description,url,method,body_template,"+
  "timeout_s,enabled,status,last_latency_ms,last_checked_at,last_error,"+
  "revision,created_at,updated_at"
const headerToken=/^[!#$%&'*+.^_|~0-9A-Za-z-]{1,80}$/
function invalid():never{throw new HttpError(400,"invalid_tool_connection")}
export function normalizeToolConnectionUrl(raw:unknown):string{
  if(typeof raw!=="string"||raw.length<8||raw.length>1000)invalid()
  let url:URL
  try{url=new URL(raw)}catch{invalid()}
  const host=url.hostname.toLowerCase().replace(/\.$/,"")
  if(url.protocol!=="https:"||url.username||url.password||url.hash||
     url.search||(url.port&&url.port!=="443")||!host.includes(".")||
     isIP(host)!==0||host==="localhost"||
     [".localhost",".local",".internal",".lan",".test",".invalid"].some(
       suffix=>host.endsWith(suffix))||
     /[\u0000-\u0020\u007f]/u.test(raw))
    invalid()
  return url.toString()
}
function normalizeHeaders(raw:unknown):ToolHeaderInput[]{
  if(raw===undefined||raw===null)return []
  if(!Array.isArray(raw)||raw.length>20)invalid()
  const seen=new Set<string>()
  const result:ToolHeaderInput[]=[]
  for(const item of raw){
    if(!item||typeof item!=="object"||Array.isArray(item))invalid()
    const obj=item as Record<string,unknown>
    if(Object.keys(obj).some(k=>k!=="key"&&k!=="value")||
       typeof obj.key!=="string"||typeof obj.value!=="string")invalid()
    const key=obj.key.trim().toLowerCase(),value=obj.value
    if(!headerToken.test(key)||seen.has(key)||value.length>2048||
       /[\u0000-\u001f\u007f]/u.test(value))invalid()
    seen.add(key);result.push({key,value})
  }
  if(JSON.stringify(result).length>16000)invalid()
  return result
}
export function safeToolConnectionInput(raw:unknown):ToolConnectionInput{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const obj=raw as Record<string,unknown>
  const allowed=["name","description","url","method","headers","body_template","timeout_s","enabled"]
  if(Object.keys(obj).some(k=>!allowed.includes(k)))invalid()
  const {name,description,method,body_template,timeout_s,enabled}=obj
  if(typeof name!=="string"||!name.trim()||name.trim().length>100||
     typeof description!=="string"||!description.trim()||description.trim().length>500||
     (method!=="GET"&&method!=="POST")||typeof body_template!=="string"||
     body_template.length>20000||body_template.includes("\u0000")||
     !Number.isSafeInteger(timeout_s)||(timeout_s as number)<1||
     (timeout_s as number)>60||typeof enabled!=="boolean")invalid()
  if(method==="GET"&&body_template!=="")invalid()
  return {name:name.trim(),description:description.trim(),
    url:normalizeToolConnectionUrl(obj.url),method:method as "GET"|"POST",
    headers:normalizeHeaders(obj.headers),body_template,
    timeout_s:timeout_s as number,enabled}
}
function safeRow(row:StoredRow):Omit<ToolConnectionRow,"headers">{
  const revision=Number(row.revision)
  if(!Number.isSafeInteger(revision)||revision<1||
     (row.method!=="GET"&&row.method!=="POST")||
     !["untested","ok","error"].includes(row.status))
    throw new HttpError(500,"invalid_persisted_tool_connection")
  return {...row,revision,method:row.method as "GET"|"POST",
    status:row.status as "untested"|"ok"|"error"}
}
function encryptedHeader(value:string,key:Buffer){
  return encryptModelSecret(JSON.stringify({value}),key)
}
export class ToolConnectionRepository{
  declare readonly originalUiProtocol:typeof originalToolConnectionsProtocol
  readonly pool:SqlPool
  readonly encryptionKey:Buffer
  constructor(pool:SqlPool,key:string|Buffer){
    Object.defineProperty(this,'originalUiProtocol',{value:originalToolConnectionsProtocol,writable:false,configurable:false,enumerable:true})
    this.pool=pool
    this.encryptionKey=Buffer.isBuffer(key)?key:parseModelEncryptionKey(key)
    if(this.encryptionKey.length!==32)throw Error("invalid_model_encryption_key")
  }
  private async withHeaders(db:SqlClient,actor:string,row:StoredRow):
    Promise<ToolConnectionRow>{
    const result=await db.query<{header_name:string}>(
      "SELECT header_name FROM agentstudio.tool_connection_headers "+
      "WHERE tool_connection_id=$1::uuid AND owner_user_id=$2::uuid "+
      "ORDER BY header_name",[row.id,actor])
    return {...safeRow(row),headers:result.rows.map(x=>({
      key:x.header_name,value:"••••",
    }))}
  }
  async list(identity:Identity,limit=30,expectedEmployee?:string):Promise<ToolConnectionRow[]>{
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const result=await db.query<StoredRow>(
        "SELECT "+publicColumns+" FROM agentstudio.tool_connections "+
        "WHERE owner_user_id=$1::uuid "+
        "ORDER BY updated_at DESC,id LIMIT $2::int",[actor,bounded])
      const rows:ToolConnectionRow[]=[]
      for(const row of result.rows)rows.push(await this.withHeaders(db,actor,row))
      return rows
    })
  }
  async get(identity:Identity,id:string,expectedEmployee?:string):Promise<ToolConnectionRow|null>{
    if(!isUuid(id))throw new HttpError(400,"invalid_tool_connection_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const result=await db.query<StoredRow>(
        "SELECT "+publicColumns+" FROM agentstudio.tool_connections "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [id,actor])
      return result.rows[0]?this.withHeaders(db,actor,result.rows[0]):null
    })
  }
  async create(identity:Identity,input:ToolConnectionInput,expectedEmployee?:string):Promise<ToolConnectionRow>{
    const prepared=safeToolConnectionInput(input)
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const result=await db.query<StoredRow>(
        "INSERT INTO agentstudio.tool_connections "+
        "(owner_user_id,name,description,url,method,body_template,timeout_s,enabled) "+
        "VALUES($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::int,$8::boolean) "+
        "RETURNING "+publicColumns,
        [actor,prepared.name,prepared.description,prepared.url,prepared.method,
          prepared.body_template,prepared.timeout_s,prepared.enabled])
      const row=result.rows[0]
      if(!row)throw Error("tool_connection_insert_missing")
      for(const header of prepared.headers){
        if(!header.value)continue
        const secret=encryptedHeader(header.value,this.encryptionKey)
        await db.query(
          "INSERT INTO agentstudio.tool_connection_headers "+
          "(owner_user_id,tool_connection_id,header_name,value_ciphertext,value_nonce,value_tag) "+
          "VALUES($1::uuid,$2::uuid,$3::text,$4::bytea,$5::bytea,$6::bytea)",
          [actor,row.id,header.key,secret.ciphertext,secret.nonce,secret.tag])
      }
      await db.query(
        "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
        "action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,'tool.connection_create','tool_connection',"+
        "$2::text,'succeeded',$3::jsonb)",
        [actor,row.id,JSON.stringify({method:prepared.method,
          header_count:prepared.headers.filter(h=>h.value).length})])
      return this.withHeaders(db,actor,row)
    })
  }
  async update(identity:Identity,id:string,input:ToolConnectionInput,
    expectedRevision:number,expectedEmployee?:string):Promise<ToolConnectionRow|null>{
    if(!isUuid(id))throw new HttpError(400,"invalid_tool_connection_id")
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw new HttpError(400,"invalid_revision")
    const prepared=safeToolConnectionInput(input)
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      const result=await db.query<StoredRow>(
        "UPDATE agentstudio.tool_connections SET name=$3::text,description=$4::text,"+
        "url=$5::text,method=$6::text,body_template=$7::text,timeout_s=$8::int,"+
        "enabled=$9::boolean,status='untested',last_latency_ms=0,"+
        "last_checked_at=NULL,last_error='',revision=revision+1,"+
        "updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND revision=$10::bigint RETURNING "+publicColumns,
        [id,actor,prepared.name,prepared.description,prepared.url,prepared.method,
          prepared.body_template,prepared.timeout_s,prepared.enabled,expectedRevision])
      const row=result.rows[0]
      if(!row){
        if(expectedEmployee!==undefined&&(await db.query('SELECT id FROM agentstudio.tool_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid',[id,actor])).rows.length)throw new HttpError(409,'revision_conflict')
        return null
      }
      const names=prepared.headers.map(h=>h.key)
      await db.query(
        "DELETE FROM agentstudio.tool_connection_headers "+
        "WHERE tool_connection_id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND NOT(header_name=ANY($3::text[]))",[id,actor,names])
      for(const header of prepared.headers){
        if(!header.value)continue
        const secret=encryptedHeader(header.value,this.encryptionKey)
        const values=[secret.ciphertext,secret.nonce,secret.tag]
        const updated=await db.query<{header_name:string}>(
          "UPDATE agentstudio.tool_connection_headers SET "+
          "value_ciphertext=$4::bytea,value_nonce=$5::bytea,value_tag=$6::bytea,"+
          "updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid "+
          "AND tool_connection_id=$2::uuid AND header_name=$3::text "+
          "RETURNING header_name",
          [actor,id,header.key,...values])
        if(updated.rows.length===0){
          const inserted=await db.query<{header_name:string}>(
            "INSERT INTO agentstudio.tool_connection_headers "+
            "(owner_user_id,tool_connection_id,header_name,value_ciphertext,value_nonce,value_tag) "+
            "VALUES($1::uuid,$2::uuid,$3::text,$4::bytea,$5::bytea,$6::bytea) "+
            "ON CONFLICT(tool_connection_id,header_name) DO NOTHING RETURNING header_name",
            [actor,id,header.key,...values])
          if(inserted.rows.length===0)
            await db.query(
              "UPDATE agentstudio.tool_connection_headers SET "+
              "value_ciphertext=$4::bytea,value_nonce=$5::bytea,value_tag=$6::bytea,"+
              "updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid "+
              "AND tool_connection_id=$2::uuid AND header_name=$3::text",
              [actor,id,header.key,...values])
        }
      }
      await db.query(
        "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
        "action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,'tool.connection_update','tool_connection',"+
        "$2::text,'succeeded',$3::jsonb)",
        [actor,id,JSON.stringify({method:prepared.method,
          header_count:prepared.headers.length,revision:expectedRevision+1})])
      return this.withHeaders(db,actor,row)
    })
  }
  async delete(identity:Identity,id:string,expectedRevision?:number,expectedEmployee?:string):Promise<boolean>{
    if(!isUuid(id))throw new HttpError(400,"invalid_tool_connection_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      assertOriginalUiEmployee(actor,expectedEmployee)
      if(expectedEmployee!==undefined&&expectedRevision===undefined)throw new HttpError(400,'invalid_revision')
      if(expectedRevision!==undefined){
        if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw new HttpError(400,'invalid_revision')
        const selected=(await db.query<{revision:number|string}>('SELECT revision FROM agentstudio.tool_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE',[id,actor])).rows[0]
        if(!selected)return false
        if(Number(selected.revision)!==expectedRevision)throw new HttpError(409,'revision_conflict')
      }
      const result=await db.query<{id:string}>(
        "DELETE FROM agentstudio.tool_connections WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid RETURNING id",[id,actor])
      if(!result.rows[0])return false
      await db.query(
        "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
        "action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,'tool.connection_delete','tool_connection',"+
        "$2::text,'succeeded','{}'::jsonb)",[actor,id])
      return true
    })
  }
}
