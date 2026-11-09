import {HttpError,type SqlPool} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {monitorCanonical,monitorHash,monitorSourceProjection,type MonitorBoundSourceDefinition} from './native-monitor-source-contract.ts'
export type MonitorCaptureLease={check_id:string;lease_token:string;lease_version:number}
export type MonitorCaptureContext={request_id:string;check_id:string;lease_token:string;lease_version:number;owner_user_id:string;case_id:string;run_id:string;data_space:'LIVE'|'DEMO';source:MonitorBoundSourceDefinition;wall_deadline_ms:number}
export type MonitorCaptureTransport={close?():void;captureDeclared(context:Readonly<MonitorCaptureContext>,signal:AbortSignal):Promise<unknown>}
export type MonitorCaptureOutcome={state:'captured';result_id:string;new_capture:boolean}|{state:'incomplete';reason:'source_request_outcome_unknown'|'source_capture_failed'}
const invalid=():never=>{throw new HttpError(409,'monitor_capture_binding_changed')}
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const object=(v:unknown):Record<string,unknown>=>{monitorCanonical(v);if(!v||typeof v!=='object'||Array.isArray(v))return invalid();return v as Record<string,unknown>}
function frozen<T>(v:T):T{if(v&&typeof v==='object'){for(const item of Object.values(v))frozen(item);Object.freeze(v)}return v}
export function parseMonitorBoundSource(raw:unknown):MonitorBoundSourceDefinition{
 const v=object(raw),keys=['source_id','tool','input','adapter_id','scope_key','required_markers','request_hash','connection_id','config_hash']
 if(Object.keys(v).some(k=>!keys.includes(k))||typeof v.source_id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(v.source_id)||typeof v.tool!=='string'||v.tool.length<1||v.tool.length>160||typeof v.scope_key!=='string'||v.scope_key.length>200||!Array.isArray(v.required_markers)||v.required_markers.length>10||v.required_markers.some(m=>typeof m!=='string'||!m.trim()||m.length>300)||!hash(v.request_hash))return invalid()
 const input=object(v.input)
 if(monitorCanonical(input).length>8000||/"(?:api_key|password|secret|authorization|cookie|token)"\s*:/i.test(JSON.stringify(input))||monitorHash([v.tool,input])!==v.request_hash)return invalid()
 if(v.adapter_id==='web.text.v1'){
  if(v.tool!=='web_fetch'||Object.keys(input).length!==1||typeof input.url!=='string'||!/^https?:\/\//.test(input.url)||v.required_markers.length===0||v.connection_id!==undefined||v.config_hash!==undefined)return invalid()
 }else if(v.adapter_id==='http.json-items.v1'){
  if(!v.scope_key.trim()||!v.connection_id||!hash(v.config_hash))return invalid()
  ownId(v.connection_id)
 }else return invalid()
 return v as MonitorBoundSourceDefinition
}
function leaseInput(raw:MonitorCaptureLease):MonitorCaptureLease{
 const v=object(raw)
 if(Object.keys(v).length!==3||!['check_id','lease_token','lease_version'].every(k=>Object.hasOwn(v,k))||!Number.isSafeInteger(v.lease_version)||Number(v.lease_version)<1)return invalid()
 return{check_id:ownId(v.check_id),lease_token:ownId(v.lease_token),lease_version:Number(v.lease_version)}
}
// Every sealed dispatch RPC commits BEFORE its result is used. No transaction
// spans egress; raw ledger writes and model/employee review are not granted.
export class NativeMonitorCaptureDispatcher{
 private closed=false
 readonly pool:SqlPool
 private readonly transport:MonitorCaptureTransport
 constructor(pool:SqlPool,transport:MonitorCaptureTransport){
  if(!pool||!transport||typeof transport.captureDeclared!=='function')throw Error('monitor_capture_transport_required')
  this.pool=pool;this.transport=transport
 }
 close(){if(this.closed)return;this.closed=true;this.transport.close?.()}
 private async rpc(name:'begin_request'|'finish_request'|'fail_request',parameters:unknown[]){
  const db=await this.pool.connect();let begun=false,discard=false,committing=false
  try{
   await db.query('BEGIN');begun=true;await db.query('SET LOCAL ROLE agentstudio_monitor_dispatch');await db.query('SET LOCAL search_path=pg_catalog')
   const role=(await db.query<{ok:boolean}>("SELECT current_user='agentstudio_monitor_dispatch' AND pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') AND NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=session_user) AS ok")).rows
   if(role.length!==1||role[0]?.ok!==true)throw new HttpError(403,'monitor_capture_dispatch_identity_required')
   const args=name==='begin_request'?'$1::uuid,$2::uuid,$3::bigint,$4::text':name==='finish_request'?'$1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::text,$6::text':'$1::uuid,$2::uuid,$3::bigint,$4::text'
   const rows=(await db.query<{value:unknown}>('SELECT agentstudio.monitor_live_'+name+'('+args+') AS value',parameters)).rows
   if(rows.length!==1||rows[0]?.value===undefined)throw new HttpError(503,'monitor_capture_rpc_unconfirmed')
   committing=true;await db.query('COMMIT');begun=false;return rows[0].value
  }catch(error){
   if(committing){discard=true;throw new HttpError(503,'monitor_capture_commit_unconfirmed')}
   if(error instanceof HttpError)throw error
   throw new HttpError(503,'monitor_capture_rpc_unconfirmed')
  }finally{
   if(begun)try{await db.query('ROLLBACK')}catch{discard=true}
   if(discard)Reflect.apply(db.release,db,[true]);else db.release()
  }
 }
 async capture(rawLease:MonitorCaptureLease,sourceId:string,signal?:AbortSignal):Promise<MonitorCaptureOutcome>{
  if(this.closed)throw new HttpError(503,'monitor_capture_closed')
  const lease=leaseInput(rawLease)
  if(typeof sourceId!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(sourceId))return invalid()
  signal?.throwIfAborted()
  const start=object(await this.rpc('begin_request',[lease.check_id,lease.lease_token,lease.lease_version,sourceId]))
  if(start.state==='captured')return{state:'captured',result_id:ownId(start.result_id),new_capture:false}
  if(start.state==='failed'||start.state==='ambiguous')return{state:'incomplete',reason:start.state==='ambiguous'?'source_request_outcome_unknown':'source_capture_failed'}
  if(start.state!=='started'||!['LIVE','DEMO'].includes(start.data_space as string)||!Number.isSafeInteger(start.wall_deadline_ms)||Number(start.wall_deadline_ms)<=Date.now())return invalid()
  const request=ownId(start.request_id),source=parseMonitorBoundSource(start.source)
  if(source.source_id!==sourceId)return invalid()
  const context:MonitorCaptureContext=frozen({request_id:request,check_id:lease.check_id,lease_token:lease.lease_token,lease_version:lease.lease_version,owner_user_id:ownId(start.owner_user_id),case_id:ownId(start.case_id),run_id:ownId(start.run_id),data_space:start.data_space as 'LIVE'|'DEMO',source,wall_deadline_ms:Number(start.wall_deadline_ms)})
  const deadline=AbortSignal.timeout(Math.max(1,Math.min(8000,context.wall_deadline_ms-Date.now()))),active=signal?AbortSignal.any([signal,deadline]):deadline
  let payload:Record<string,unknown>,canonical:string,projectionCanonical:string
  try{
   active.throwIfAborted();const envelope=object(await this.transport.captureDeclared(context,active));active.throwIfAborted()
   payload={...envelope,data_space:context.data_space};canonical=monitorCanonical(payload)
   if(Buffer.byteLength(canonical,'utf8')>2000000)throw new HttpError(413,'monitor_capture_size_limit')
   monitorSourceProjection(source,payload)
   projectionCanonical=monitorCanonical(source.adapter_id==='web.text.v1'?payload.text:(payload.structuredContent as Record<string,unknown>).items)
  }catch{
   await this.rpc('fail_request',[request,lease.lease_token,lease.lease_version,'source_capture_failed'])
   return{state:'incomplete',reason:'source_capture_failed'}
  }
  // A finalization/COMMIT failure may already have persisted the receipt.
  // Never retry it or mark a possibly committed capture failed.
  const finish=object(await this.rpc('finish_request',[request,lease.lease_token,lease.lease_version,JSON.stringify(payload),canonical,projectionCanonical]))
  if(finish.content_hash!==monitorHash(payload)||finish.projection_hash!==monitorSourceProjection(source,payload).projection_hash||finish.source_id!==sourceId||finish.run_id!==context.run_id)throw new HttpError(503,'monitor_capture_receipt_unconfirmed')
  return{state:'captured',result_id:ownId(finish.result_id),new_capture:true}
 }
}
