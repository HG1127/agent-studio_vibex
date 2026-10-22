import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {createHmac,randomUUID} from "node:crypto"
import {withActor} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {parseModelEncryptionKey,encryptModelSecret,decryptModelSecret} from "./model-connection-crypto.ts"
import {safeToolConnectionInput} from "./tool-connection-repository.ts"
import {safeToolDestination} from "./workflow-v2-tool-plan.ts"
import {parseMcpCatalog,type McpCatalog} from "./mcp-catalog.ts"
import type {McpMaterial} from "./mcp-discovery.ts"
import {mcpCatalogHash} from "./mcp-binding-resources.ts"
export type McpConnectionInput={name:string;description:string;url:string;headers:{key:string;value:string}[];enabled:boolean}
export type McpConnectionRow={id:string;owner_user_id:string;name:string;description:string;url:string;enabled:boolean;
  status:"untested"|"ok"|"error";catalog:McpCatalog|null;headers:{key:string;value:string}[];last_checked_at:string|null;last_error:string;
  catalog_sha256?:string;revision:number;created_at:string;updated_at:string}
type Stored=Omit<McpConnectionRow,"headers"|"catalog"|"revision">&{catalog:unknown;revision:number|string}
type Header={id:string;header_name:string;updated_at:string;value_ciphertext:Uint8Array;value_nonce:Uint8Array;value_tag:Uint8Array}
const columns="id,owner_user_id,name,description,url,enabled,status,catalog,last_checked_at,last_error,revision,created_at,updated_at"
function revision(value:unknown):number{
  const number=Number(value)
  if(!Number.isSafeInteger(number)||number<1)throw new HttpError(400,"invalid_revision")
  return number
}
function id(value:string):void{if(!isUuid(value))throw new HttpError(400,"invalid_mcp_connection_id")}
export function safeMcpConnectionInput(raw:unknown):McpConnectionInput{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_mcp_connection")
  const value=raw as Record<string,unknown>
  if(Object.keys(value).some(key=>!["name","description","url","headers","enabled"].includes(key)))throw new HttpError(400,"invalid_mcp_connection")
  if([value.name,value.description].some(text=>typeof text!=="string"||text.includes("\0")))throw new HttpError(400,"invalid_mcp_connection")
  let url:URL
  try{url=safeToolDestination(value.url)}catch{throw new HttpError(400,"invalid_mcp_connection")}
  if(url.toString().length>1000)throw new HttpError(400,"invalid_mcp_connection")
  // Reuse the established name/header limits; URL query is fixed configuration,
  // never a planner substitution or a runtime identity/session parameter.
  const checked=safeToolConnectionInput({...value,url:url.origin+url.pathname,method:"POST",body_template:"",timeout_s:20})
  if(checked.headers.some(header=>/^(?:host|connection|content-length|transfer-encoding|trailer|te|upgrade|expect|accept-encoding|proxy-.*|x-forwarded-.*|forwarded|x-rh-user-id|mcp-.*|accept|content-type|user-agent)$/i.test(header.key)))throw new HttpError(400,"invalid_mcp_headers")
  return {name:checked.name,description:checked.description,url:url.toString(),headers:checked.headers,enabled:checked.enabled}
}
export class McpConnectionRepository{
  readonly pool:SqlPool;readonly brokerPool:SqlPool|undefined;readonly key:Buffer;readonly probes=new Set<string>()
  constructor(pool:SqlPool,key:string|Buffer,brokerPool?:SqlPool){
    this.pool=pool;this.brokerPool=brokerPool;this.key=Buffer.isBuffer(key)?key:parseModelEncryptionKey(key)
    if(this.key.length!==32)throw Error("invalid_model_encryption_key")
  }
  private async publicRow(db:SqlClient,owner:string,row:Stored):Promise<McpConnectionRow>{
    const headers=(await db.query<{header_name:string}>("SELECT header_name FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY header_name",[row.id,owner])).rows
    const catalog=row.status==="ok"?parseMcpCatalog(row.catalog):null
    return {...row,revision:revision(row.revision),catalog,...(catalog?{catalog_sha256:mcpCatalogHash(catalog)}:{}),headers:headers.map(header=>({key:header.header_name,value:"••••"}))}
  }
  private async headers(db:SqlClient,owner:string,connection:string,headers:McpConnectionInput["headers"]){
    if(headers.some(header=>!header.value)){
      const existing=new Set((await db.query<{header_name:string}>("SELECT header_name FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1::uuid AND owner_user_id=$2::uuid",[connection,owner])).rows.map(row=>row.header_name))
      if(headers.some(header=>!header.value&&!existing.has(header.key)))throw new HttpError(400,"mcp_new_header_value_required")
    }
    await db.query("DELETE FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1::uuid AND owner_user_id=$2::uuid AND NOT(header_name=ANY($3::text[]))",[connection,owner,headers.map(header=>header.key)])
    for(const header of headers){
      if(!header.value)continue
      const encrypted=encryptModelSecret(JSON.stringify({value:header.value}),this.key)
      // ON CONFLICT DO UPDATE would require SELECT on the ciphertext columns.
      // Keep the ordinary API unable to read encrypted credential material.
      const values=[owner,connection,header.key,encrypted.ciphertext,encrypted.nonce,encrypted.tag]
      const updated=await db.query("UPDATE agentstudio.mcp_connection_headers SET value_ciphertext=$4::bytea,value_nonce=$5::bytea,value_tag=$6::bytea,updated_at=clock_timestamp() "+
        "WHERE owner_user_id=$1::uuid AND mcp_connection_id=$2::uuid AND header_name=$3::text RETURNING id",values)
      if(!updated.rows.length)await db.query("INSERT INTO agentstudio.mcp_connection_headers(owner_user_id,mcp_connection_id,header_name,value_ciphertext,value_nonce,value_tag) "+
        "VALUES($1::uuid,$2::uuid,$3::text,$4::bytea,$5::bytea,$6::bytea) ON CONFLICT(mcp_connection_id,header_name) DO NOTHING",values)
    }
  }
  private async audit(db:SqlClient,owner:string,connection:string,action:string,metadata:Record<string,unknown>,result="succeeded"){
    await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) "+
      "VALUES($1::uuid,$1::uuid,$2::text,'mcp_connection',$3::text,$4::text,$5::jsonb)",[owner,action,connection,result,JSON.stringify(metadata)])
  }
  list(identity:Identity){return withActor(this.pool,identity,async(db,owner)=>{
    const rows=(await db.query<Stored>("SELECT "+columns+" FROM agentstudio.mcp_connections WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT 50",[owner])).rows
    const result:McpConnectionRow[]=[];for(const row of rows)result.push(await this.publicRow(db,owner,row));return result
  })}
  get(identity:Identity,connection:string){id(connection);return withActor(this.pool,identity,async(db,owner)=>{
    const row=(await db.query<Stored>("SELECT "+columns+" FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[connection,owner])).rows[0]
    return row?this.publicRow(db,owner,row):null
  })}
  create(identity:Identity,raw:unknown,requestId:string=randomUUID()){
    id(requestId);requestId=requestId.toLowerCase()
    const input=safeMcpConnectionInput(raw),fingerprint=createHmac("sha256",this.key).update(JSON.stringify(input)).digest("hex")
    return withActor(this.pool,identity,async(db,owner)=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":"+requestId])
    const existing=(await db.query<Stored&{creation_fingerprint:string}>("SELECT "+columns+",creation_fingerprint FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[requestId,owner])).rows[0]
    if(existing){
      if(existing.creation_fingerprint!==fingerprint)throw new HttpError(409,"mcp_create_request_conflict")
      const {creation_fingerprint:_,...row}=existing
      return this.publicRow(db,owner,row)
    }
    const row=(await db.query<Stored>("INSERT INTO agentstudio.mcp_connections(id,owner_user_id,name,description,url,enabled,creation_fingerprint) VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::boolean,$7::text) RETURNING "+columns,
      [requestId,owner,input.name,input.description,input.url,input.enabled,fingerprint])).rows[0]!
    await this.headers(db,owner,row.id,input.headers);await this.audit(db,owner,row.id,"mcp.connection_create",{header_count:input.headers.filter(header=>header.value).length})
    return this.publicRow(db,owner,row)
  }).catch(error=>{if(error?.code==="23505")throw new HttpError(409,"mcp_create_request_conflict");throw error})}
  update(identity:Identity,connection:string,raw:unknown,expected:number){id(connection);revision(expected);const input=safeMcpConnectionInput(raw)
    return withActor(this.pool,identity,async(db,owner)=>{
      const row=(await db.query<Stored>("UPDATE agentstudio.mcp_connections SET name=$3::text,description=$4::text,url=$5::text,enabled=$6::boolean,"+
        "catalog='{}',status='untested',last_checked_at=NULL,last_error='',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$7::bigint RETURNING "+columns,
        [connection,owner,input.name,input.description,input.url,input.enabled,expected])).rows[0]
      if(!row)throw new HttpError((await db.query("SELECT id FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[connection,owner])).rows.length?409:404,"mcp_connection_changed")
      await this.headers(db,owner,connection,input.headers);await this.audit(db,owner,connection,"mcp.connection_update",{revision:Number(row.revision),header_count:input.headers.length})
      return this.publicRow(db,owner,row)
    })
  }
  delete(identity:Identity,connection:string,expected:number){id(connection);revision(expected);return withActor(this.pool,identity,async(db,owner)=>{
    const removed=(await db.query("DELETE FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$3::bigint RETURNING id",[connection,owner,expected])).rows[0]
    if(!removed)throw new HttpError((await db.query("SELECT id FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[connection,owner])).rows.length?409:404,"mcp_connection_changed")
    await this.audit(db,owner,connection,"mcp.connection_delete",{revision:expected});return {ok:true as const}
  })}
  async discover(identity:Identity,connection:string,expected:number,discover:(material:McpMaterial,signal:AbortSignal)=>Promise<McpCatalog>){
    id(connection);revision(expected)
    if(!this.brokerPool)throw new HttpError(503,"mcp_discovery_disabled")
    const probeKey=JSON.stringify([identity?.issuer,identity?.subject,connection.toLowerCase()])
    if(this.probes.has(probeKey))throw new HttpError(429,"mcp_discovery_rate_limited")
    this.probes.add(probeKey)
    try{
      const selected=await withActor(this.pool,identity,async(db,owner)=>{
        const row=(await db.query<Stored>("SELECT "+columns+" FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[connection,owner])).rows[0]
        if(!row)throw new HttpError(404,"mcp_connection_not_found")
        if(Number(row.revision)!==expected)throw new HttpError(409,"revision_conflict")
        if(!row.enabled)throw new HttpError(409,"mcp_connection_disabled")
        if(row.last_checked_at&&Date.now()-new Date(row.last_checked_at).getTime()<30000)throw new HttpError(429,"mcp_discovery_rate_limited")
        const headers=(await db.query<Pick<Header,"id"|"header_name"|"updated_at">>("SELECT id,header_name,updated_at FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY header_name",[connection,owner])).rows
        return {row,headers}
      })
      const material=await withModelBrokerActor(this.brokerPool,identity,async(db,owner)=>{
        const headers=(await db.query<Header>("SELECT id,header_name,updated_at,value_ciphertext,value_nonce,value_tag FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY header_name",[connection,owner])).rows
        if(headers.length!==selected.headers.length||headers.some((header,index)=>header.id!==selected.headers[index]!.id||header.header_name!==selected.headers[index]!.header_name||String(header.updated_at)!==String(selected.headers[index]!.updated_at)))throw new HttpError(409,"mcp_connection_changed")
        return {url:selected.row.url,headers:headers.map(header=>{
          const value=JSON.parse(decryptModelSecret({ciphertext:Buffer.from(header.value_ciphertext),nonce:Buffer.from(header.value_nonce),tag:Buffer.from(header.value_tag)},this.key))
          if(!value||Object.keys(value).length!==1||typeof value.value!=="string")throw new HttpError(409,"mcp_connection_changed")
          return {key:header.header_name,value:value.value as string}
        })}
      })
      const current=await this.get(identity,connection)
      if(!current||current.revision!==expected||!current.enabled)throw new HttpError(409,"mcp_connection_changed")
      let catalog:McpCatalog|null=null
      const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
      try{catalog=parseMcpCatalog(await Promise.race([discover(material,controller.signal),new Promise<never>((_resolve,reject)=>{
        timer=setTimeout(()=>{controller.abort();reject(Error("mcp_discovery_timeout"))},20000)
      })]))}catch{/* No remote error text or secrets escape. */}
      finally{if(timer)clearTimeout(timer);controller.abort()}
      return await withActor(this.pool,identity,async(db,owner)=>{
        const row=(await db.query<Stored>("UPDATE agentstudio.mcp_connections SET status=$4::text,catalog=$5::jsonb,last_error=$6::text,last_checked_at=clock_timestamp(),"+
          "revision=revision+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$3::bigint RETURNING "+columns,
          [connection,owner,expected,catalog?"ok":"error",JSON.stringify(catalog??{}),catalog?"":"mcp_discovery_failed"])).rows[0]
        if(!row)throw new HttpError(409,"mcp_connection_changed")
        await this.audit(db,owner,connection,"mcp.connection_discover",{revision:Number(row.revision),tool_count:catalog?.tools.length??0,version:catalog?.version??"",error_code:catalog?"":"mcp_discovery_failed"},catalog?"succeeded":"failed")
        return this.publicRow(db,owner,row)
      })
    }finally{this.probes.delete(probeKey)}
  }
}
