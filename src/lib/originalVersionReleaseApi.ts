import {originalVersionReleaseProtocol,originalVersionReleaseBase,releaseObject,releaseId,releaseFail,OriginalVersionReleaseError,type OriginalReleaseIntent} from '../../shared/original-version-release-contract.ts'
import {parseAgentDesignTransportJson} from '../../services/pg-api/src/agent-design-value-contract.ts'
import {agentReleaseChoice} from './pgNativeAgentRelease.ts'
import {prepareReleaseIntent,parseReleaseWorkspace,parseReleaseDetail,parseReleaseAcceptance,parseReleaseAcknowledgement,parseReleaseReceipt,type PgNativeAgentReleaseChoice} from './originalVersionReleaseData.ts'
export {OriginalVersionReleaseError}
type ReleaseWriteFailure='not_dispatched'|'refused'
const releaseWriteFailures=new WeakMap<OriginalVersionReleaseError,{key:string;phase:ReleaseWriteFailure}>()
// created_at is local storage metadata; the canonical body hash binds private text.
const releaseWriteKey=(intent:OriginalReleaseIntent)=>JSON.stringify({...intent,created_at:0})
const releaseRefusalCodes:Record<number,ReadonlySet<string>>={
 400:new Set(['invalid_original_release_body','original_release_protocol_header_refused','original_release_identity_header_refused','invalid_original_ui_employee_precondition','invalid_agent_release_action','invalid_agent_release_acceptance','invalid_agent_release_snapshot','invalid_agent_release_publish','invalid_agent_release_delete','invalid_agent_release_restore','invalid_spec_id']),
 401:new Set(['session_required','invalid_identity']),403:new Set(['native_request_origin_denied','native_employee_identity_required','employee_not_provisioned','agent_release_actor_unavailable','agent_release_writes_disabled','agent_release_acceptance_disabled']),
 404:new Set(['agent_release_not_found','agent_release_version_not_found','agent_release_acceptance_not_found']),
 405:new Set(['original_release_method_refused']),
 409:new Set(['agent_release_request_conflict','agent_release_source_changed','agent_release_version_changed','agent_release_head_changed','agent_release_untested_ack_required','agent_release_version_not_draft','agent_release_acceptance_unavailable','agent_release_restore_not_prepared','agent_release_restore_write_changed']),
 413:new Set(['original_release_request_too_large']),415:new Set(['json_content_type_required'])
}
export function originalReleaseWriteFailure(error:unknown,intent:OriginalReleaseIntent):ReleaseWriteFailure|null{if(!(error instanceof OriginalVersionReleaseError))return null;const proof=releaseWriteFailures.get(error);if(!proof||proof.key!==releaseWriteKey(intent))return null;return proof.phase}
export function createOriginalVersionReleaseApi(config:{employeeId:string;transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number}){
 const employee=releaseId(config.employeeId),root=config.rootPath??'/__pg_native',send=config.transport??fetch,budget=config.timeoutMs??8000
 if(!['','/__pg_native'].includes(root)||!Number.isSafeInteger(budget)||budget<1||budget>8000)return releaseFail(400,'invalid_original_release_transport')
 const base=root+originalVersionReleaseBase,route=(spec:string,part='')=>base+'/'+releaseId(spec)+part
 async function request(path:string,method:'GET'|'POST',body?:unknown,signal?:AbortSignal,writeKey?:string,onDispatch?:()=>void){
  const bytes=body===undefined?undefined:JSON.stringify(body),write=method==='POST';if(bytes&&new TextEncoder().encode(bytes).length>16384)return releaseFail(400,'original_release_request_too_large')
  const controller=new AbortController(),cancel=()=>controller.abort();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,timer:ReturnType<typeof setTimeout>|undefined
  const unavailable=()=>new OriginalVersionReleaseError(0,write?'original_release_outcome_unknown':'original_release_unavailable',write),deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable())},budget)})
  const run=async()=>{
   onDispatch?.();const response=await send(path,{method,body:bytes,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':employee,'X-AgentStudio-Original-Release':'1',...(write?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{})}})
   const invalid=():never=>releaseFail(503,'invalid_original_release_response',write)
   if(!(response instanceof Response)||response.redirected||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||!response.body)return invalid()
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1048576))return invalid()
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let count=0
   while(true){const item=await reader.read();if(item.done)break;count+=item.value.length;if(count>1048576)return invalid();chunks.push(item.value)}
   if(length!==null&&Number(length)!==count)return invalid();const all=new Uint8Array(count);let at=0;for(const c of chunks){all.set(c,at);at+=c.length}
   let data:Record<string,unknown>;try{data=releaseObject(parseAgentDesignTransportJson(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(all)))}catch{return invalid()}
   if(!response.ok){const code=typeof data.error==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(data.error)?data.error:'original_release_request_refused',error=new OriginalVersionReleaseError(response.status,code,write&&response.status>=500);if(write&&writeKey!==undefined&&Object.keys(data).length===1&&releaseRefusalCodes[response.status]?.has(code))releaseWriteFailures.set(error,{key:writeKey,phase:'refused'});throw error}
   return data
  }
  signal?.addEventListener('abort',cancel,{once:true})
  try{if(signal?.aborted)throw unavailable();return await Promise.race([run(),deadline])}catch(error){if(error instanceof OriginalVersionReleaseError)throw error;throw unavailable()}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
 async function capabilities(signal?:AbortSignal){const v=await request(root+'/api/native-auth/capabilities','GET',undefined,signal);if(v.mode!=='native_pg18'||typeof v.config_writes_enabled!=='boolean'||v.agent_releases_available!==undefined&&typeof v.agent_releases_available!=='boolean'||v.agent_release_acceptance_enabled!==undefined&&typeof v.agent_release_acceptance_enabled!=='boolean'||v.agent_release_acceptance_enabled===true&&(v.agent_releases_available!==true||v.config_writes_enabled!==true||v.autonomous_agent_submission_enabled!==true))return releaseFail(503,'invalid_original_release_capabilities');return{available:v.agent_releases_available===true,writes:v.agent_releases_available===true&&v.config_writes_enabled===true,acceptance:v.agent_release_acceptance_enabled===true}}
 return Object.freeze({protocol:originalVersionReleaseProtocol,capabilities,
  async workspace(spec:string,signal?:AbortSignal){return parseReleaseWorkspace(await request(route(spec),'GET',undefined,signal),employee,spec)},
  async detail(spec:string,version:string,signal?:AbortSignal){return parseReleaseDetail(await request(route(spec,'/versions/'+releaseId(version)),'GET',undefined,signal),employee,spec,version)},
  async acceptance(spec:string,run:string,signal?:AbortSignal){return parseReleaseAcceptance(await request(route(spec,'/acceptance/'+releaseId(run)),'GET',undefined,signal),employee,spec,run)},
  async change(spec:string,raw:PgNativeAgentReleaseChoice,signal?:AbortSignal){
    const choice=agentReleaseChoice(raw),writeKey=releaseWriteKey(await prepareReleaseIntent(employee,spec,choice,0));let dispatched=false
    try{const cap=await capabilities(signal);if(!cap.writes||choice.action==='acceptance'&&!cap.acceptance)return releaseFail(405,'original_release_writes_disabled');const value=await request(route(spec,choice.action==='acceptance'?'/acceptance':'/change'),'POST',choice,signal,writeKey,()=>{dispatched=true});try{return parseReleaseAcknowledgement(value,employee,spec,choice)}catch{return releaseFail(503,'unconfirmed_original_release_ack',true)}}
    catch(error){if(!dispatched&&error instanceof OriginalVersionReleaseError)releaseWriteFailures.set(error,{key:writeKey,phase:'not_dispatched'});throw error}
   },
  async query(intent:OriginalReleaseIntent,signal?:AbortSignal){return parseReleaseReceipt(await request(route(intent.spec_id,'/receipts/'+releaseId(intent.request_id)),'GET',undefined,signal),employee,intent)},
 })
}
export type OriginalVersionReleaseApi=ReturnType<typeof createOriginalVersionReleaseApi>
