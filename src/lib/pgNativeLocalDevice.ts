import {PgNativePilotError} from './pgNativePilotApi.ts'
import {localDeviceRoute,localId,localCanonical,localDigest,parseLocalTransportJson,parseLocalIntent,parseLocalDevice,parseLocalJob,matchLocalReply,type LocalIntent,type LocalDevice,type LocalJob,type LocalReply} from '../../shared/native-local-device-contract.mjs'
export type {LocalIntent,LocalDevice,LocalJob,LocalReply}
export function createPgNativeLocalDeviceApi({transport=fetch,rootPath=''}:{transport?:typeof fetch;rootPath?:''|'/__pg_native'}={}){
 if(rootPath!==''&&rootPath!=='/__pg_native')throw Error('invalid_native_root')
 async function request(path:string,method:'GET'|'POST',value?:unknown,signal?:AbortSignal){
  const timeout=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([signal,timeout]):timeout
  const response=await transport(rootPath+localDeviceRoute+path,{method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{})},...(method==='POST'?{body:JSON.stringify(value)}:{}),signal:combined})
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw new PgNativePilotError(503,'native_local_invalid_projection')
  const reader=response.body?.getReader();if(!reader)throw new PgNativePilotError(503,'native_local_invalid_projection');const chunks:Uint8Array[]=[];let used=0
  try{for(;;){combined.throwIfAborted();const {done,value}=await reader.read();if(done)break;used+=value.byteLength;if(used>1450000){await reader.cancel().catch(()=>{});throw new PgNativePilotError(503,'native_local_invalid_projection')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(used);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}let body:unknown
  try{body=parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new PgNativePilotError(503,'native_local_invalid_projection')}
  if(response.status!==200){const code=body&&typeof body==='object'&&'error' in body&&typeof body.error==='string'&&/^[a-z_]{1,100}$/.test(body.error)?body.error:'native_local_unavailable';throw new PgNativePilotError(response.status,code)}return body
 }
 return{
  async list(signal?:AbortSignal){const raw=await request('','GET',undefined,signal);if(!Array.isArray(raw)||raw.length>100)throw new PgNativePilotError(503,'native_local_invalid_projection');const devices=raw.map(parseLocalDevice);if(new Set(devices.map(d=>d.id)).size!==devices.length)throw new PgNativePilotError(503,'native_local_invalid_projection');for(const d of devices)if(await localDigest(d.catalog)!==d.catalog_sha256)throw new PgNativePilotError(503,'native_local_invalid_projection');return devices},
  async getJob(id:string,signal?:AbortSignal){const job=parseLocalJob(await request('/jobs/'+localId(id),'GET',undefined,signal));if(job.id!==id)throw new PgNativePilotError(503,'native_local_invalid_projection');return job},
  async record(raw:LocalIntent,signal?:AbortSignal){const intent=parseLocalIntent(raw);return matchLocalReply(await request('','POST',intent,signal),intent)},
  async confirm(raw:LocalIntent,signal?:AbortSignal){const intent=parseLocalIntent(raw),reply=await matchLocalReply(await request('/confirm','POST',intent,signal),intent);if(!reply.replayed||reply.pairing_code!==null)throw new PgNativePilotError(503,'native_local_invalid_projection');return reply},
 }
}
export function nativeDeviceOnline(d:LocalDevice,now=Date.now()){return !d.revoked&&d.seen_ms>0&&now-d.seen_ms<=45000&&d.seen_ms-now<=5000}
export function nativeOfficeRoots(d:LocalDevice){
 const tools=['office.table_summary','office.create_report'].map(name=>d.catalog.find(t=>t.name===name));if(tools.some(t=>!t)||!nativeDeviceOnline(d))return []
 const sets=tools.map(t=>{const props=t!.inputSchema.properties as Record<string,unknown>|undefined,root=props?.root as {enum?:unknown[]}|undefined;return Array.isArray(root?.enum)?root.enum.filter((v):v is string=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,30}$/.test(v)):[]})
 return sets[0]!.filter(x=>sets[1]!.includes(x))
}
// UI intent memory is scoped to one real API/owner/login lifetime. Unknown ACK
// keeps its original UUID and full canonical bytes; navigation never reposts it.
export function createNativeLocalDeviceIntentState(){let pending:LocalIntent|null=null,last:LocalReply|null=null
 const frozen=<T>(v:T):T=>{if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v)}return v}
 return{begin(raw:LocalIntent){const v=parseLocalIntent(raw);if(pending&&localCanonical(pending)!==localCanonical(v))throw Error('native_local_pending_original_request');pending=frozen(JSON.parse(localCanonical(v)));return pending!},snapshot:()=>({pending,last}),accept(reply:LocalReply){if(!pending||reply.receipt.request_id!==pending.request_id||reply.receipt.action!==pending.action)throw Error('native_local_wrong_receipt');last=frozen({...reply,pairing_code:null});pending=null},clear(){pending=null;last=null}}
}
