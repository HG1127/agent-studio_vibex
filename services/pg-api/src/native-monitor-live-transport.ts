import {HttpError,type SqlPool} from './contracts.ts'
import {decryptModelSecret} from './model-connection-crypto.ts'
import {createWorkflowToolNetwork,type WorkflowToolHttpMaterial} from './workflow-v2-tool-network.ts'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {monitorCanonical} from './native-monitor-source-contract.ts'
import {parseMonitorBoundSource,type MonitorCaptureContext,type MonitorCaptureTransport} from './native-monitor-live-capture.ts'
type CompleteNetwork=Pick<ReturnType<typeof createWorkflowToolNetwork>,'monitorHttp'|'monitorWebFetch'>
const unavailable=():never=>{throw new HttpError(503,'monitor_source_material_unavailable')}
function obj(raw:unknown):Record<string,unknown>{monitorCanonical(raw);if(!raw||typeof raw!=='object'||Array.isArray(raw))return unavailable();return raw as Record<string,unknown>}
function hex(value:unknown,min:number,max:number):Buffer{if(typeof value!=='string'||!/^(?:[a-f0-9]{2})+$/.test(value)||value.length<min*2||value.length>max*2)return unavailable();return Buffer.from(value,'hex')}
export class NativeMonitorGetTransport implements MonitorCaptureTransport{
 private closed=false
 private readonly aborts=new Set<AbortController>()
 private readonly pool:SqlPool
 private readonly key:Buffer
 private readonly network:CompleteNetwork
 constructor(pool:SqlPool,key:Buffer,network:CompleteNetwork=createWorkflowToolNetwork()){
  if(!pool||!Buffer.isBuffer(key)||key.length!==32||typeof network?.monitorHttp!=='function'||typeof network?.monitorWebFetch!=='function')throw Error('monitor_get_transport_dependencies_required')
  this.pool=pool;this.key=Buffer.from(key);this.network=network
 }
 private async material(context:Readonly<MonitorCaptureContext>){
  const db=await this.pool.connect();let begun=false,discard=false,committing=false
  try{
   await db.query('BEGIN');begun=true;await db.query('SET LOCAL ROLE agentstudio_monitor_dispatch');await db.query('SET LOCAL search_path=pg_catalog')
   const ready=(await db.query<{ok:boolean}>("SELECT current_user='agentstudio_monitor_dispatch' AND pg_has_role(session_user,'agentstudio_monitor_dispatch','MEMBER') AND NOT pg_has_role(session_user,'agentstudio_monitor_worker','MEMBER') AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=session_user) AS ok")).rows
   if(ready.length!==1||ready[0]?.ok!==true)return unavailable()
   const rows=(await db.query<{value:unknown}>('SELECT agentstudio.monitor_live_transport_material($1::uuid,$2::uuid,$3::bigint) AS value',[context.request_id,context.lease_token,context.lease_version])).rows
   if(rows.length!==1)return unavailable()
   const value=obj(rows[0]?.value)
   committing=true;await db.query('COMMIT');begun=false;return value
  }catch{
   if(committing)discard=true
   return unavailable()
  }finally{
   if(begun)try{await db.query('ROLLBACK')}catch{discard=true}
   if(discard)Reflect.apply(db.release,db,[true]);else db.release()
  }
 }
 close(){if(this.closed)return;this.closed=true;for(const controller of this.aborts)controller.abort();this.aborts.clear();this.key.fill(0)}
 async captureDeclared(context:Readonly<MonitorCaptureContext>,signal:AbortSignal):Promise<unknown>{
  if(this.closed)return unavailable()
  const controller=new AbortController();this.aborts.add(controller)
  try{return await this.capture(context,AbortSignal.any([signal,controller.signal]))}finally{this.aborts.delete(controller)}
 }
 private async capture(context:Readonly<MonitorCaptureContext>,signal:AbortSignal):Promise<unknown>{
  signal.throwIfAborted()
  const source=parseMonitorBoundSource(context.source),value=await this.material(context)
  signal.throwIfAborted();if(this.closed)return unavailable()
  if(value.request_hash!==source.request_hash)return unavailable()
  if(source.adapter_id==='web.text.v1'){
   if(value.kind!=='web'||value.url!==source.input.url||typeof value.url!=='string')return unavailable()
   return this.network.monitorWebFetch(value.url,signal)
  }
  if(value.kind!=='http'||value.method!=='GET'||value.connection_id!==source.connection_id||value.config_hash!==source.config_hash||typeof value.url!=='string'||typeof value.body_template!=='string'||!Number.isSafeInteger(value.timeout_s)||!Array.isArray(value.headers)||value.headers.length>20)return unavailable()
  let headers:{key:string;value:string}[]
  try{
   headers=value.headers.map(raw=>{
    const h=obj(raw)
    if(Object.keys(h).length!==5||!['id','name','ciphertext','nonce','tag'].every(k=>Object.hasOwn(h,k))||typeof h.name!=='string')return unavailable()
    const plain=obj(parseLocalTransportJson(decryptModelSecret({ciphertext:hex(h.ciphertext,8,4096),nonce:hex(h.nonce,12,12),tag:hex(h.tag,16,16)},this.key),4096))
    if(Object.keys(plain).length!==1||typeof plain.value!=='string')return unavailable()
    return{key:h.name,value:plain.value}
   })
  }catch{return unavailable()}
  const material:WorkflowToolHttpMaterial={url:value.url,method:'GET',body_template:value.body_template,timeout_s:Number(value.timeout_s),headers}
  return this.network.monitorHttp(material,source.input,signal)
 }
}
