import {createHmac,randomUUID} from "node:crypto"
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {encryptModelSecret,decryptModelSecret,parseModelEncryptionKey} from "./model-connection-crypto.ts"
import {parseSmitherySelection,smitheryApiKey,smitheryRemoteId,smitheryGateway,parseSmitheryNamespaces,parseSmitheryCatalog,parseSmitheryRemoteState,
  type SmitheryRemoteState} from "./smithery-contracts.ts"
import {smitheryCatalogPath,smitheryConnectionPath,type SmitheryTransport,type SmitheryRequest,type SmitheryResponse} from "./smithery-network.ts"
type KeyRow={active:boolean;revision:number|string;key_tail:string;last_request_id:string;key_fingerprint:string}
type ManagedRow={id:string;namespace:string;remote_connection_id:string;server_name:string;binding_proof:string;creation_fingerprint:string;
  key_revision:number|string;state:string;revoke_requested:boolean;setup_url:string;missing:string[];last_error:string;operation_kind:string;operation_token:string|null;revision:number|string}
const keyColumns="active,revision,key_tail,last_request_id,key_fingerprint"
const managedColumns="id,namespace,remote_connection_id,server_name,binding_proof,creation_fingerprint,key_revision,state,revoke_requested,setup_url,missing,last_error,operation_kind,operation_token,revision"
const revision=(raw:unknown,min=1)=>{if(!Number.isSafeInteger(raw)||Number(raw)<min)throw new HttpError(400,"invalid_revision");return Number(raw)}
const uuid=(raw:string)=>{if(!isUuid(raw))throw new HttpError(400,"invalid_smithery_request_id");return raw.toLowerCase()}
export class SmitheryRepository{
  readonly pool:SqlPool;readonly brokerPool:SqlPool;readonly key:Buffer;readonly transport:SmitheryTransport
  constructor(pool:SqlPool,key:string|Buffer,brokerPool:SqlPool,transport:SmitheryTransport){
    this.pool=pool;this.key=Buffer.isBuffer(key)?key:parseModelEncryptionKey(key);this.brokerPool=brokerPool;this.transport=transport
    if(this.key.length!==32||!brokerPool||typeof transport!=="function")throw Error("smithery_dependencies_required")
  }
  private hash(raw:unknown){return createHmac("sha256",this.key).update(JSON.stringify(raw)).digest("hex")}
  private async audit(db:SqlClient,owner:string,id:string|null,action:string,metadata:Record<string,unknown>,result="succeeded"){
    await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) "+
      "VALUES($1::uuid,$1::uuid,$2::text,'smithery_connection',$3::text,$4::text,$5::jsonb)",[owner,action,id??owner,result,JSON.stringify(metadata)])
  }
  private async call(key:string,wire:SmitheryRequest,deadline=Date.now()+20000):Promise<SmitheryResponse>{
    if(Date.now()>=deadline)throw new HttpError(502,"smithery_unreachable")
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
    try{return await Promise.race([this.transport(key,wire,controller.signal),new Promise<never>((_resolve,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(Error("smithery_timeout"))},Math.max(1,deadline-Date.now()))
    })])}catch{throw new HttpError(502,"smithery_unreachable")}
    finally{if(timer)clearTimeout(timer);controller.abort()}
  }
  private success(response:SmitheryResponse){
    if(response.status<200||response.status>=300)throw new HttpError(response.status===429?429:502,
      [401,403].includes(response.status)?"smithery_key_rejected":"smithery_unavailable")
    return response.data
  }
  private async keyRow(db:SqlClient,owner:string,lock=false){
    return (await db.query<KeyRow>("SELECT "+keyColumns+" FROM agentstudio.smithery_credentials WHERE owner_user_id=$1::uuid"+(lock?" FOR UPDATE":""),[owner])).rows[0]
  }
  private keyDto(row:KeyRow|undefined){return {has_key:row?.active===true,revision:row?Number(row.revision):0,tail:row?.active?row.key_tail:"",last_request_id:row?.last_request_id??null}}
  keyStatus(identity:Identity){return withActor(this.pool,identity,async(db,owner)=>this.keyDto(await this.keyRow(db,owner)))}
  private async material(identity:Identity){
    const selected=await withActor(this.pool,identity,async(db,owner)=>this.keyRow(db,owner))
    if(!selected?.active)throw new HttpError(409,"smithery_key_required")
    const key=await withModelBrokerActor(this.brokerPool,identity,async(db,owner)=>{
      const row=(await db.query<{active:boolean;revision:number|string;api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}>(
        "SELECT active,revision,api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.smithery_credentials WHERE owner_user_id=$1::uuid",[owner])).rows[0]
      if(!row?.active||Number(row.revision)!==Number(selected.revision))throw new HttpError(409,"smithery_key_changed")
      return smitheryApiKey(decryptModelSecret({ciphertext:Buffer.from(row.api_key_ciphertext),nonce:Buffer.from(row.api_key_nonce),tag:Buffer.from(row.api_key_tag)},this.key))
    })
    return {key,revision:Number(selected.revision)}
  }
  private async disable(db:SqlClient,owner:string,id?:string){
    const scope=id?" AND m.id=$2::uuid":" AND EXISTS(SELECT 1 FROM agentstudio.smithery_connections s WHERE s.id=m.id AND s.owner_user_id=m.owner_user_id)"
    const values=id?[owner,id]:[owner]
    await db.query("UPDATE agentstudio.mcp_connections m SET enabled=false,status='untested',catalog='{}',last_checked_at=NULL,last_error='',revision=revision+1,updated_at=clock_timestamp() "+
      "WHERE m.owner_user_id=$1::uuid"+scope,values)
    await db.query("DELETE FROM agentstudio.mcp_connection_headers h WHERE h.owner_user_id=$1::uuid AND EXISTS(SELECT 1 FROM agentstudio.smithery_connections s "+
      "WHERE s.id=h.mcp_connection_id AND s.owner_user_id=h.owner_user_id"+(id?" AND s.id=$2::uuid":"")+")",values)
  }
  async saveKey(identity:Identity,raw:unknown,expected:number,requestId:string){
    revision(expected,0);requestId=uuid(requestId)
    let key:string;try{key=smitheryApiKey(raw)}catch{throw new HttpError(400,"invalid_smithery_key")}
    const fingerprint=this.hash({key}),check=await withActor(this.pool,identity,async(db,owner)=>{
      const prior=await this.keyRow(db,owner)
      if(prior?.last_request_id===requestId){if(prior.key_fingerprint!==fingerprint)throw new HttpError(409,"smithery_key_request_conflict");return this.keyDto(prior)}
      if((prior?Number(prior.revision):0)!==expected)throw new HttpError(409,"smithery_key_changed")
      return null
    })
    if(check)return check
    // Validation is a fixed, read-only ownership inventory; no key is stored
    // if the vendor rejects it. It cannot create a remote connection.
    try{parseSmitheryNamespaces(this.success(await this.call(key,{method:"GET",path:"/namespaces"})))}
    catch(cause){if(cause instanceof HttpError&&cause.code==="smithery_key_rejected")throw new HttpError(400,"invalid_smithery_key");throw cause}
    return withActor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":smithery-key"])
      const prior=await this.keyRow(db,owner,true)
      if(prior?.last_request_id===requestId){if(prior.key_fingerprint!==fingerprint)throw new HttpError(409,"smithery_key_request_conflict");return this.keyDto(prior)}
      if((prior?Number(prior.revision):0)!==expected)throw new HttpError(409,"smithery_key_changed")
      const encrypted=encryptModelSecret(key,this.key),values=[owner,expected+1,key.slice(-4),requestId,fingerprint,encrypted.ciphertext,encrypted.nonce,encrypted.tag]
      if(prior)await db.query("UPDATE agentstudio.smithery_credentials SET active=true,revision=$2::bigint,key_tail=$3::text,last_request_id=$4::uuid,key_fingerprint=$5::text,"+
        "api_key_ciphertext=$6::bytea,api_key_nonce=$7::bytea,api_key_tag=$8::bytea,updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid",values)
      else await db.query("INSERT INTO agentstudio.smithery_credentials(owner_user_id,active,revision,key_tail,last_request_id,key_fingerprint,api_key_ciphertext,api_key_nonce,api_key_tag) "+
        "VALUES($1::uuid,true,$2::bigint,$3::text,$4::uuid,$5::text,$6::bytea,$7::bytea,$8::bytea)",values)
      await this.disable(db,owner)
      await db.query("UPDATE agentstudio.smithery_connections SET state=CASE WHEN revoke_requested THEN 'revoke_unknown' ELSE 'needs_refresh' END,"+
        "setup_url='',missing='[]',last_error='smithery_key_changed',operation_token=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid AND state<>'revoked'",[owner])
      await this.audit(db,owner,null,"smithery.key_save",{revision:expected+1})
      return this.keyDto(await this.keyRow(db,owner))
    })
  }
  removeKey(identity:Identity,expected:number,requestId:string){revision(expected,0);requestId=uuid(requestId);return withActor(this.pool,identity,async(db,owner)=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":smithery-key"])
    const prior=await this.keyRow(db,owner,true),fingerprint=this.hash({removed:true})
    if(prior?.last_request_id===requestId){if(prior.key_fingerprint!==fingerprint)throw new HttpError(409,"smithery_key_request_conflict");return this.keyDto(prior)}
    if((prior?Number(prior.revision):0)!==expected)throw new HttpError(409,"smithery_key_changed")
    if(!prior)return this.keyDto(undefined)
    await db.query("UPDATE agentstudio.smithery_credentials SET active=false,revision=revision+1,key_tail='',last_request_id=$2::uuid,key_fingerprint=$3::text,"+
      "api_key_ciphertext=NULL,api_key_nonce=NULL,api_key_tag=NULL,updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid",[owner,requestId,fingerprint])
    await this.disable(db,owner)
    await db.query("UPDATE agentstudio.smithery_connections SET state=CASE WHEN revoke_requested THEN 'revoke_unknown' ELSE 'needs_key' END,"+
      "setup_url='',missing='[]',last_error='smithery_key_required',operation_token=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid AND state<>'revoked'",[owner])
    await this.audit(db,owner,null,"smithery.key_remove",{revision:expected+1})
    return this.keyDto(await this.keyRow(db,owner))
  })}
  async namespaces(identity:Identity){const material=await this.material(identity);return parseSmitheryNamespaces(this.success(await this.call(material.key,{method:"GET",path:"/namespaces"}))).filter(name=>!name.includes(material.key))}
  async catalog(identity:Identity,query:string,page:number){const path=smitheryCatalogPath(query,page),material=await this.material(identity)
    const result=parseSmitheryCatalog(this.success(await this.call(material.key,{method:"GET",path})),page)
    return {...result,items:result.items.filter(item=>![item.server,item.name,item.description].some(value=>value.includes(material.key)))}
  }
  private async publicRow(db:SqlClient,owner:string,row:ManagedRow){
    const mcp=(await db.query<{name:string;description:string;revision:number|string;enabled:boolean;status:string}>(
      "SELECT name,description,revision,enabled,status FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[row.id,owner])).rows[0]
    if(!mcp)throw new HttpError(409,"smithery_connection_changed")
    return {id:row.id,namespace:row.namespace,remote_connection_id:row.remote_connection_id,server:row.server_name,name:mcp.name,description:mcp.description,
      state:row.state,revoke_requested:row.revoke_requested,setup_url:row.setup_url,missing:row.missing,last_error:row.last_error,revision:Number(row.revision),
      operation_in_flight:row.operation_token!==null,mcp_revision:Number(mcp.revision),enabled:mcp.enabled,mcp_status:mcp.status}
  }
  get(identity:Identity,id:string){id=uuid(id);return withActor(this.pool,identity,async(db,owner)=>{
    const row=(await db.query<ManagedRow>("SELECT "+managedColumns+" FROM agentstudio.smithery_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,owner])).rows[0]
    return row?this.publicRow(db,owner,row):null
  })}
  list(identity:Identity){return withActor(this.pool,identity,async(db,owner)=>{
    const rows=(await db.query<ManagedRow>("SELECT "+managedColumns+" FROM agentstudio.smithery_connections WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT 50",[owner])).rows
    const result=[];for(const row of rows)result.push(await this.publicRow(db,owner,row));return result
  })}
  async connect(identity:Identity,raw:unknown,requestId:string){
    requestId=uuid(requestId);let input:ReturnType<typeof parseSmitherySelection>
    try{input=parseSmitherySelection(raw)}catch{throw new HttpError(400,"invalid_smithery_selection")}
    const fingerprint=this.hash(input),token=randomUUID()
    const selected=await withActor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":smithery-key"])
      const prior=(await db.query<ManagedRow>("SELECT "+managedColumns+" FROM agentstudio.smithery_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[requestId,owner])).rows[0]
      if(prior){if(prior.creation_fingerprint!==fingerprint)throw new HttpError(409,"smithery_create_request_conflict");return {row:prior,fresh:false}}
      const credential=await this.keyRow(db,owner,true)
      if(!credential?.active)throw new HttpError(409,"smithery_key_required")
      const remote=smitheryRemoteId(requestId),proof=this.hash({owner,id:requestId,selection:input})
      await db.query("INSERT INTO agentstudio.mcp_connections(id,owner_user_id,name,description,url,enabled,creation_fingerprint) "+
        "VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::text,false,$6::text)",[requestId,owner,input.name,input.description,smitheryGateway(input.namespace,remote),fingerprint])
      const row=(await db.query<ManagedRow>("INSERT INTO agentstudio.smithery_connections(id,owner_user_id,namespace,remote_connection_id,server_name,binding_proof,creation_fingerprint,key_revision,state,operation_kind,operation_token) "+
        "VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::bigint,'pending','connect',$9::uuid) RETURNING "+managedColumns,
        [requestId,owner,input.namespace,remote,input.server,proof,fingerprint,credential.revision,token])).rows[0]!
      await this.audit(db,owner,requestId,"smithery.connect_reserved",{revision:1})
      return {row,fresh:true}
    }).catch(error=>{if(error?.code==="23505")throw new HttpError(409,"smithery_create_request_conflict");throw error})
    if(!selected.fresh)return this.get(identity,requestId)
    return this.perform(identity,selected.row,token,"connect",input.name)
  }
  pause(identity:Identity,id:string,expected:number){id=uuid(id);revision(expected);return withActor(this.pool,identity,async(db,owner)=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":smithery-key"])
    const row=(await db.query<ManagedRow>("SELECT "+managedColumns+" FROM agentstudio.smithery_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[id,owner])).rows[0]
    if(!row)throw new HttpError(404,"smithery_connection_not_found")
    if(Number(row.revision)!==expected)throw new HttpError(409,"smithery_connection_changed")
    if(row.state==="revoked")return this.publicRow(db,owner,row)
    await this.disable(db,owner,id)
    const updated=(await db.query<ManagedRow>("UPDATE agentstudio.smithery_connections SET state=CASE WHEN revoke_requested THEN 'revoke_unknown' ELSE 'paused' END,"+
      "operation_token=NULL,setup_url='',missing='[]',last_error='',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid RETURNING "+managedColumns,[id,owner])).rows[0]!
    await this.audit(db,owner,id,"smithery.local_pause",{revision:Number(updated.revision)})
    return this.publicRow(db,owner,updated)
  })}
  async operate(identity:Identity,id:string,expected:number,kind:"refresh"|"revoke"|"connect"){
    id=uuid(id);revision(expected);if(!["refresh","revoke","connect"].includes(kind))throw new HttpError(400,"invalid_smithery_operation")
    const token=randomUUID(),selected=await withActor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":smithery-key"])
      const row=(await db.query<ManagedRow>("SELECT "+managedColumns+" FROM agentstudio.smithery_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[id,owner])).rows[0]
      if(!row)throw new HttpError(404,"smithery_connection_not_found")
      if(Number(row.revision)!==expected)throw new HttpError(409,"smithery_connection_changed")
      if(row.state==="revoked")return {row,done:true,name:""}
      if(kind==="connect"&&(row.revoke_requested||row.last_error!=="smithery_remote_absent"))throw new HttpError(409,"smithery_reconcile_required")
      const credential=await this.keyRow(db,owner,true)
      if(!credential?.active&&kind!=="revoke")throw new HttpError(409,"smithery_key_required")
      await this.disable(db,owner,id)
      const updated=(await db.query<ManagedRow>("UPDATE agentstudio.smithery_connections SET operation_kind=$3::text,operation_token=$4::uuid,key_revision=$5::bigint,"+
        "revoke_requested=revoke_requested OR $3::text='revoke',state=CASE WHEN revoke_requested OR $3::text='revoke' THEN 'revoking' ELSE 'pending' END,setup_url='',missing='[]',last_error='',revision=revision+1,updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid RETURNING "+managedColumns,[id,owner,kind,token,credential?.revision??row.key_revision])).rows[0]!
      const local=(await db.query<{name:string}>("SELECT name FROM agentstudio.mcp_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,owner])).rows[0]!
      await this.audit(db,owner,id,"smithery."+kind+"_reserved",{revision:Number(updated.revision)})
      return {row:updated,done:false,name:local.name}
    })
    if(selected.done)return this.get(identity,id)
    return this.perform(identity,selected.row,token,kind,selected.name)
  }
  private async perform(identity:Identity,row:ManagedRow,token:string,kind:"connect"|"refresh"|"revoke",name:string){
    const deadline=Date.now()+20000
    let remote:SmitheryRemoteState|undefined,revoked=false,material:Awaited<ReturnType<SmitheryRepository["material"]>>|undefined,error=""
    try{
      material=await this.material(identity)
      if(material.revision!==Number(row.key_revision))throw new HttpError(409,"smithery_key_changed")
      const path=smitheryConnectionPath(row.namespace,row.remote_connection_id)
      if(kind==="connect"){
        const names=parseSmitheryNamespaces(this.success(await this.call(material.key,{method:"GET",path:"/namespaces"},deadline)))
        if(!names.includes(row.namespace))throw new HttpError(403,"smithery_namespace_not_owned")
      }
      let response=await this.call(material.key,{method:"GET",path},deadline)
      if(response.status===404){
        if(row.revoke_requested||kind==="revoke")revoked=true
        else if(kind==="connect")response=await this.call(material.key,{method:"PUT",path,body:{transport:"http",server:row.server_name,name,metadata:{agent_studio_binding:row.binding_proof}}},deadline)
        else error="smithery_remote_absent"
      }
      if(!revoked&&!error){
        remote=parseSmitheryRemoteState(this.success(response),row.remote_connection_id,row.binding_proof,material.key)
        if(kind==="revoke"){
          const removal=await this.call(material.key,{method:"DELETE",path},deadline)
          if(removal.status===404||removal.status>=200&&removal.status<300)revoked=true
          else this.success(removal)
        }
      }
    }catch(cause){error=cause instanceof HttpError&&["smithery_key_required","smithery_key_changed","smithery_namespace_not_owned","smithery_key_rejected"].includes(cause.code)?cause.code:"smithery_outcome_unknown"}
    return withActor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":smithery-key"])
      const current=(await db.query<ManagedRow>("SELECT "+managedColumns+" FROM agentstudio.smithery_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[row.id,owner])).rows[0]
      if(!current)throw new HttpError(404,"smithery_connection_not_found")
      if(current.operation_token!==token)return this.publicRow(db,owner,current)
      const credential=await this.keyRow(db,owner,true)
      if(!credential?.active||material&&Number(credential.revision)!==material.revision)error="smithery_key_changed"
      const canEnable=!error&&!revoked&&!current.revoke_requested&&remote?.state==="connected"
      await this.disable(db,owner,row.id)
      if(canEnable){
        const encrypted=encryptModelSecret(JSON.stringify({value:"Bearer "+material!.key}),this.key)
        await db.query("INSERT INTO agentstudio.mcp_connection_headers(owner_user_id,mcp_connection_id,header_name,value_ciphertext,value_nonce,value_tag) "+
          "VALUES($1::uuid,$2::uuid,'authorization',$3::bytea,$4::bytea,$5::bytea)",[owner,row.id,encrypted.ciphertext,encrypted.nonce,encrypted.tag])
        await db.query("UPDATE agentstudio.mcp_connections SET enabled=true WHERE id=$1::uuid AND owner_user_id=$2::uuid",[row.id,owner])
      }
      const state=revoked?"revoked":current.revoke_requested?"revoke_unknown":error?error==="smithery_key_required"?"needs_key":"unknown":remote?.state??"error"
      const updated=(await db.query<ManagedRow>("UPDATE agentstudio.smithery_connections SET state=$3::text,setup_url=$4::text,missing=$5::jsonb,last_error=$6::text,"+
        "operation_token=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid RETURNING "+managedColumns,
        [row.id,owner,state,!error&&!current.revoke_requested?remote?.setup_url??"":"",JSON.stringify(!error&&!current.revoke_requested?remote?.missing??[]:[]),error])).rows[0]!
      await this.audit(db,owner,row.id,"smithery."+kind+"_result",{revision:Number(updated.revision),state,error_code:error},error||state==="error"||state==="revoke_unknown"?"failed":"succeeded")
      return this.publicRow(db,owner,updated)
    })
  }
}
