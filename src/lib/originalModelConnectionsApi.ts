import {modelDraftProbeProtocol,parseModelDraftProbeInput,parseModelDraftProbeResult,type ModelDraftProbeInput} from '../../shared/model-draft-probe-contract.ts'
import type {PgNativeModelConnection,PgNativeModelConnectionInput} from './pgNativePilotApi'
import {hasExplicitCalendarTimestamp} from './agentQualityChecks.ts'

export type OriginalModelConnection=PgNativeModelConnection
export type OriginalModelConnectionInput=PgNativeModelConnectionInput
export const originalModelConnectionsProtocol='native_model_connections_owner_cas_v1' as const
export class OriginalModelConnectionsError extends Error{
 readonly status:number;readonly code:string;readonly outcomeUnknown:boolean;readonly responseRefused:boolean
 constructor(status:number,code:string,outcomeUnknown=false,responseRefused=false){super(code);this.name='OriginalModelConnectionsError';this.status=status;this.code=code;this.outcomeUnknown=outcomeUnknown;this.responseRefused=responseRefused}
}
const fail=(status=503,code='invalid_original_model_response',unknown=false):never=>{throw new OriginalModelConnectionsError(status,code,unknown)}
function object(raw:unknown,keys?:string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail()
 const result:Record<string,unknown>={}
 for(const key of Reflect.ownKeys(raw)){
  const d=Object.getOwnPropertyDescriptor(raw,key)
  if(typeof key!=='string'||!d?.enumerable||!Object.hasOwn(d,'value')||['__proto__','constructor','prototype'].includes(key))return fail()
  result[key]=d.value
 }
 if(keys&&(Object.keys(result).length!==keys.length||keys.some(k=>!Object.hasOwn(result,k))))return fail()
 return result
}
function array(raw:unknown,max:number):unknown[]{
 if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return fail()
 const items:unknown[]=[];for(let i=0;i<raw.length;i++){const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return fail();items.push(d.value)}return items
}
export function originalModelId(raw:unknown):string{if(typeof raw!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw))return fail(400,'invalid_original_model_id');return raw}
function revision(raw:unknown):number{if(!Number.isSafeInteger(raw)||Number(raw)<1||Number(raw)>=Number.MAX_SAFE_INTEGER)return fail(400,'invalid_original_model_revision');return Number(raw)}
function text(raw:unknown,max:number,nonblank=false):string{if(typeof raw!=='string'||raw.length>max||/[\u0000-\u001f\u007f]/.test(raw)||nonblank&&!raw.trim())return fail();return raw}
function models(raw:unknown):string[]{const seen=new Set<string>();return array(raw,300).map(value=>{const name=text(value,200,true);if(name!==name.trim()||seen.has(name))return fail();seen.add(name);return name})}
function provider(raw:unknown):PgNativeModelConnection['provider']{if(typeof raw!=='string'||!['openai','anthropic','gemini'].includes(raw))return fail();return raw as PgNativeModelConnection['provider']}
function baseUrl(raw:unknown):string{
 const value=text(raw,2048,true);let parsed:URL;try{parsed=new URL(value.trim())}catch{return fail(400,'invalid_original_model_input')}
 const host=parsed.hostname.toLowerCase().replace(/^\[|\]$/g,'')
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||!host.includes('.')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host)||host==='localhost'||/\.(?:localhost|local|internal)$/.test(host))return fail(400,'invalid_original_model_input')
 return parsed.href.replace(/\/+$/,'')
}
/** Public DTO data only. Native still validates actual owner and resources. */
export function parseOriginalModelConnection(raw:unknown,employee:string):OriginalModelConnection{
 const row=object(raw,['id','owner_user_id','name','provider','base_url','api_key_tail','enabled','status','last_latency_ms','last_checked_at','models','last_error','revision','created_at','updated_at'])
 const owner=originalModelId(employee),id=originalModelId(row.id)
 if(originalModelId(row.owner_user_id)!==owner||typeof row.enabled!=='boolean'||typeof row.status!=='string'||!['untested','ok','error'].includes(row.status)||!Number.isSafeInteger(row.last_latency_ms)||Number(row.last_latency_ms)<0||Number(row.last_latency_ms)>600000)return fail()
 for(const key of ['created_at','updated_at'])if(!hasExplicitCalendarTimestamp(row[key]))return fail()
 if(row.last_checked_at!==null&&!hasExplicitCalendarTimestamp(row.last_checked_at))return fail()
 const tail=text(row.api_key_tail,4);if(tail.length!==4||/\s/.test(tail))return fail()
 const lastError=text(row.last_error,80);if(lastError&&!/^[a-z_]{1,80}$/.test(lastError))return fail()
 const url=baseUrl(row.base_url);if(url!==row.base_url)return fail()
 return Object.freeze({id,owner_user_id:owner,name:text(row.name,100,true),provider:provider(row.provider),base_url:url,api_key_tail:tail,enabled:row.enabled,status:row.status as OriginalModelConnection['status'],last_latency_ms:Number(row.last_latency_ms),last_checked_at:row.last_checked_at as string|null,models:Object.freeze(models(row.models)) as unknown as string[],last_error:lastError,revision:revision(row.revision),created_at:row.created_at as string,updated_at:row.updated_at as string})
}
/** Matches the existing full Native input, never the legacy partial PATCH. */
function normalizeInputValue(raw:unknown,requireKey:boolean):OriginalModelConnectionInput{
 const v=object(raw),keys=Object.keys(v)
 if(keys.some(k=>!['name','provider','base_url','api_key','models','enabled'].includes(k))||['name','provider','base_url','models','enabled'].some(k=>!Object.hasOwn(v,k))||typeof v.enabled!=='boolean')return fail(400,'invalid_original_model_input')
 const name=text(v.name,100,true).trim(),selected=provider(v.provider),url=baseUrl(v.base_url),names=models(v.models)
 if(v.api_key!==undefined&&typeof v.api_key!=='string')return fail(400,'invalid_original_model_input')
 const key=(v.api_key as string|undefined)?.trim()??''
 if(requireKey&&!key)return fail(400,'model_api_key_required')
 if(key&&(key.length<8||key.length>4096||/[\u0000-\u0020\u007f]/.test(key)))return fail(400,'invalid_original_model_input')
 return{name,provider:selected,base_url:url,models:names,enabled:v.enabled,...(key?{api_key:key}:{})}
}
export function normalizeOriginalModelInput(raw:unknown,requireKey:boolean):OriginalModelConnectionInput{
 try{return normalizeInputValue(raw,requireKey)}catch(error){return fail(400,error instanceof OriginalModelConnectionsError&&error.code==='model_api_key_required'?error.code:'invalid_original_model_input')}
}
export function createOriginalModelConnectionsApi(config:{employeeId:string;transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number}){
 const employee=originalModelId(config.employeeId),send=config.transport??fetch,root=config.rootPath??'/__pg_native',budget=config.timeoutMs??8000,base=root+'/api/v2/model-connections'
 if(typeof send!=='function'||root!==''&&root!=='/__pg_native'||!Number.isSafeInteger(budget)||budget<1||budget>8000)return fail(400,'invalid_original_model_transport')
 async function request(route:string,method:'GET'|'POST'|'PATCH'|'DELETE',body?:unknown,signal?:AbortSignal):Promise<Record<string,unknown>>{
  const bytes=body===undefined?undefined:JSON.stringify(body),write=method!=='GET'
  if(bytes!==undefined&&new TextEncoder().encode(bytes).length>262144)return fail(400,'original_model_input_too_large')
  const abort=new AbortController(),cancel=()=>abort.abort();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,timer:ReturnType<typeof setTimeout>|undefined
  signal?.addEventListener('abort',cancel,{once:true})
  const unavailable=()=>new OriginalModelConnectionsError(0,write?'original_model_outcome_unknown':'original_model_unavailable',write)
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(unavailable())},budget)})
  const perform=async()=>{
   const response=await send(route,{method,body:bytes,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:abort.signal,headers:{Accept:'application/json',...(write?{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee}:{})}})
   if(!(response instanceof Response)||response.redirected||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||!response.body)return fail(503,'invalid_original_model_response',write)
   const declared=response.headers.get('content-length');if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>1048576))return fail(503,'invalid_original_model_response',write)
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   while(true){const piece=await reader.read();if(piece.done)break;size+=piece.value.byteLength;if(size>1048576)return fail(503,'invalid_original_model_response',write);chunks.push(piece.value)}
   if(declared!==null&&Number(declared)!==size)return fail(503,'invalid_original_model_response',write)
   const buffer=new Uint8Array(size);let at=0;for(const chunk of chunks){buffer.set(chunk,at);at+=chunk.byteLength}
   let value:Record<string,unknown>;try{value=object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)))}catch{return fail(503,'invalid_original_model_response',write)}
   if(!response.ok)throw new OriginalModelConnectionsError(response.status,typeof value.error==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(value.error)?value.error:'original_model_request_refused',write&&response.status>=500,response.status>=400&&response.status<500)
   return value
  }
  try{if(signal?.aborted)throw unavailable();return await Promise.race([perform(),deadline])}catch(error){if(error instanceof OriginalModelConnectionsError)throw error;throw unavailable()}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
 const item=(raw:unknown)=>{const value=object(raw,['item']);return parseOriginalModelConnection(value.item,employee)}
 async function capabilities(signal?:AbortSignal){
  const value=await request(root+'/api/native-auth/capabilities','GET',undefined,signal)
  if(value.mode!=='native_pg18'||typeof value.config_writes_enabled!=='boolean'||typeof value.model_probe_enabled!=='boolean'||value.original_model_connections_protocol!==undefined&&value.original_model_connections_protocol!==originalModelConnectionsProtocol)return fail(503,'invalid_original_model_capabilities')
  const available=value.original_model_connections_protocol===originalModelConnectionsProtocol
  return Object.freeze({strictContract:available,writes:available&&value.config_writes_enabled===true,probe:available&&value.config_writes_enabled===true&&value.model_probe_enabled===true,draftProbe:available&&value.config_writes_enabled===true&&value.model_probe_enabled===true&&value.original_model_draft_probe_protocol===modelDraftProbeProtocol})
 }
 async function requireWrites(signal?:AbortSignal,probe=false){const cap=await capabilities(signal);if(!cap.writes||probe&&!cap.probe)return fail(405,probe?'provider_probe_disabled':'original_model_connections_read_only')}
 async function acknowledgement<T>(work:()=>Promise<T>):Promise<T>{try{return await work()}catch(error){if(error instanceof OriginalModelConnectionsError){if(error.responseRefused&&!error.outcomeUnknown)throw error;throw new OriginalModelConnectionsError(error.status,error.code,true)}throw new OriginalModelConnectionsError(0,'original_model_outcome_unknown',true)}}
 function saved(row:OriginalModelConnection,input:OriginalModelConnectionInput,prior?:OriginalModelConnection){
  if(row.name!==input.name||row.provider!==input.provider||row.base_url!==input.base_url||row.enabled!==input.enabled||JSON.stringify(row.models)!==JSON.stringify(input.models)||row.revision!==(prior?prior.revision+1:1)||row.status!=='untested'||row.last_checked_at!==null||row.last_error!==''||row.last_latency_ms!==0||row.api_key_tail!==(input.api_key?input.api_key.slice(-4):prior?.api_key_tail))return fail(503,'unconfirmed_original_model_save',true)
  return row
 }
 return Object.freeze({capabilities,
  async draftProbe(raw:ModelDraftProbeInput,signal?:AbortSignal){let input:ModelDraftProbeInput;try{input=parseModelDraftProbeInput(raw)}catch{throw new OriginalModelConnectionsError(400,'invalid_model_draft_probe')}const cap=await capabilities(signal);if(!cap.draftProbe)throw new OriginalModelConnectionsError(405,'model_draft_probe_disabled');const value=await request(base+'/draft-probe','POST',input,signal);try{return parseModelDraftProbeResult(value,input,employee)}catch{throw new OriginalModelConnectionsError(503,'invalid_model_draft_probe_result',true)}},
  async list(signal?:AbortSignal){const data=object(await request(base+'?limit=50','GET',undefined,signal),['items']),rows=array(data.items,50).map(value=>parseOriginalModelConnection(value,employee));if(new Set(rows.map(v=>v.id)).size!==rows.length)return fail();return rows},
  async get(id:string,signal?:AbortSignal){const selected=originalModelId(id),row=item(await request(base+'/'+selected,'GET',undefined,signal));if(row.id!==selected)return fail();return row},
  async create(raw:OriginalModelConnectionInput,signal?:AbortSignal){const input=normalizeOriginalModelInput(raw,true);await requireWrites(signal);return acknowledgement(async()=>saved(item(await request(base,'POST',input,signal)),input))},
  async update(rawRow:OriginalModelConnection,raw:OriginalModelConnectionInput,signal?:AbortSignal){const prior=parseOriginalModelConnection(rawRow,employee),input=normalizeOriginalModelInput(raw,false);await requireWrites(signal);return acknowledgement(async()=>{const row=item(await request(base+'/'+prior.id,'PATCH',{...input,expected_revision:prior.revision},signal));if(row.id!==prior.id)return fail(503,'unconfirmed_original_model_save',true);return saved(row,input,prior)})},
  async delete(rawRow:OriginalModelConnection,signal?:AbortSignal){const prior=parseOriginalModelConnection(rawRow,employee);await requireWrites(signal);return acknowledgement(async()=>{const value=object(await request(base+'/'+prior.id,'DELETE',{expected_revision:prior.revision},signal),['ok','id']);if(value.ok!==true||value.id!==prior.id)return fail(503,'unconfirmed_original_model_delete',true);return{ok:true as const,id:prior.id}})},
  async probe(rawRow:OriginalModelConnection,signal?:AbortSignal){const prior=parseOriginalModelConnection(rawRow,employee);await requireWrites(signal,true);return acknowledgement(async()=>{const value=object(await request(base+'/'+prior.id+'/probe','POST',{expected_revision:prior.revision},signal),['item','mode']);if(value.mode!=='read_only_provider_models_probe')return fail(503,'unconfirmed_original_model_probe',true);const row=parseOriginalModelConnection(value.item,employee);for(const key of ['id','name','provider','base_url','api_key_tail','enabled','models'] as const)if(JSON.stringify(row[key])!==JSON.stringify(prior[key]))return fail(503,'unconfirmed_original_model_probe',true);if(row.revision!==prior.revision+1||!['ok','error'].includes(row.status)||row.last_checked_at===null)return fail(503,'unconfirmed_original_model_probe',true);return row})},
 })
}
export type OriginalModelConnectionsApi=ReturnType<typeof createOriginalModelConnectionsApi>
