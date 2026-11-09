import {originalStaffProtocol,originalStaffPrefix,staffObject,staffId,staffUpdated,staffRevision,parseOriginalStaffList,parseOriginalStaffMutation,originalStaffPublicChoice,originalStaffEmployee,originalStaffListResult,originalStaffReceiptResult} from '../../shared/original-staff-contract.mjs'
import {parseLocalTransportJson} from '../../shared/native-local-device-contract.mjs'

export type OriginalStaffEmployee=Readonly<{id:string;display_name:string;email:string;role:'admin'|'employee';active:boolean;share_enabled:boolean;revision:number;governance_revision:number;created:string;updated:string}>
type Action='create'|'update'|'reset'
type PublicForm=Pick<OriginalStaffEmployee,'display_name'|'email'|'role'|'active'|'share_enabled'>
export type OriginalStaffPending=Readonly<{format:'agentstudio.original-staff.pending.v1';employee_id:string;request_id:string;action:Action;target_id:string|null;request_sha256:string;expected_after_revision:number;expected_after_governance_revision:number;expected_revoked_sessions:boolean;before_updated:string|null;created_at:number}>
export class OriginalStaffApiError extends Error{
 readonly status:number;readonly code:string;readonly outcomeUnknown:boolean
 constructor(status:number,code:string,outcomeUnknown=false){super(code);this.name='OriginalStaffApiError';this.status=status;this.code=code;this.outcomeUnknown=outcomeUnknown}
}
const fail=(status:number,code:string,unknown=false):never=>{throw new OriginalStaffApiError(status,code,unknown)}
const markerKeys=['format','employee_id','request_id','action','target_id','request_sha256','expected_after_revision','expected_after_governance_revision','expected_revoked_sessions','before_updated','created_at']
export function parseOriginalStaffPending(raw:unknown,employee:string):OriginalStaffPending{
 try{
  const v=staffObject(raw,markerKeys);staffId(employee);staffId(v.employee_id);staffId(v.request_id);const afterRevision=staffRevision(v.expected_after_revision),afterGovernance=staffRevision(v.expected_after_governance_revision)
  if(v.format!=='agentstudio.original-staff.pending.v1'||v.employee_id!==employee||typeof v.action!=='string'||!['create','update','reset'].includes(v.action)||typeof v.request_sha256!=='string'||! /^[a-f0-9]{64}$/.test(v.request_sha256)||typeof v.expected_revoked_sessions!=='boolean'||typeof v.created_at!=='number'||!Number.isSafeInteger(v.created_at)||v.created_at<1||v.created_at>Date.now()+300000)throw Error()
  if(v.action==='create'){if(v.target_id!==null||v.before_updated!==null||v.expected_after_revision!==1||v.expected_after_governance_revision!==1||v.expected_revoked_sessions!==false)throw Error()}
  else{staffId(v.target_id);staffUpdated(v.before_updated);if(afterRevision<2||v.action==='reset'&&!v.expected_revoked_sessions)throw Error()}
  return Object.freeze({format:'agentstudio.original-staff.pending.v1',employee_id:employee,request_id:staffId(v.request_id),action:v.action as Action,target_id:v.target_id===null?null:staffId(v.target_id),request_sha256:v.request_sha256,expected_after_revision:afterRevision,expected_after_governance_revision:afterGovernance,expected_revoked_sessions:v.expected_revoked_sessions,before_updated:v.before_updated===null?null:staffUpdated(v.before_updated),created_at:v.created_at})
 }catch{return fail(400,'invalid_original_staff_pending')}
}
/** One verified employee/login epoch. Comparison callbacks never authenticate;
 * the server independently verifies the Cookie and owner condition each time. */
export function createOriginalStaffApi(config:{employeeId:string;isCurrent:()=>boolean;transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number;pending?:unknown;onPending?:(pending:OriginalStaffPending|null)=>void}){
 const employee=staffId(config.employeeId),send=config.transport??fetch,root=config.rootPath??'/__pg_native',budget=config.timeoutMs??8000
 if(typeof config.isCurrent!=='function'||typeof send!=='function'||root!==''&&root!=='/__pg_native'||!Number.isSafeInteger(budget)||budget<1||budget>8000)fail(400,'invalid_original_staff_transport')
 let pending=config.pending===undefined?null:parseOriginalStaffPending(config.pending,employee),busy=false
 const current=(unknown=false)=>{let valid=false;try{valid=config.isCurrent()===true}catch{}if(!valid)fail(409,'employee_session_changed',unknown)}
 const clearPending=()=>{pending=null;try{config.onPending?.(null)}catch{/* A retained locator still permits only GET recovery. */}}
 async function request(path:string,method:'GET'|'POST'|'PATCH',raw?:unknown,signal?:AbortSignal):Promise<unknown>{
  current();const write=method!=='GET',controller=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,response:Response|undefined,timer:ReturnType<typeof setTimeout>|undefined,closed=false,complete=false,sent=false,rejectCancel:((error:OriginalStaffApiError)=>void)|undefined
  const unavailable=()=>new OriginalStaffApiError(0,sent?'original_staff_outcome_unknown':'original_staff_unavailable',sent)
  const cancel=()=>{controller.abort();rejectCancel?.(unavailable())},cancelled=new Promise<never>((_,reject)=>{rejectCancel=reject}),deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable())},budget)})
  const perform=async()=>{
   const body=raw===undefined?undefined:JSON.stringify(raw);if(body!==undefined&&new TextEncoder().encode(body).length>8192)fail(400,'invalid_original_staff_input')
   current();if(signal?.aborted)throw unavailable();sent=write
   response=await send(root+originalStaffPrefix+path,{method,body,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Accept:'application/json','X-AgentStudio-Expected-Owner':employee,...(write?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{})}})
   if(!(response instanceof Response))throw unavailable()
   if(closed||controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw unavailable()}
   if(response.redirected||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))throw unavailable()
   const declared=response.headers.get('content-length');if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>262144))throw unavailable()
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   for(;;){const part=await reader.read();if(closed||controller.signal.aborted)throw unavailable();current(sent);if(part.done)break;size+=part.value.byteLength;if(size>262144)throw unavailable();chunks.push(part.value)}
   if(declared!==null&&Number(declared)!==size)throw unavailable();complete=true
   const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength}
   let value:unknown;try{value=parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),262144)}catch{throw unavailable()}
   if(!response.ok){let code='original_staff_request_refused';try{const v=staffObject(value,['error']);if(typeof v.error==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(v.error))code=v.error}catch{}fail(response.status,code,sent&&(response.status>=500||![400,401,403,404,405,409,413,415,429].includes(response.status)))}
   if(response.status!==(method==='POST'&&path==='/users'?201:200))throw unavailable();return value
  }
  try{if(signal?.aborted)throw unavailable();signal?.addEventListener('abort',cancel,{once:true});return await Promise.race([perform(),cancelled,deadline])}
  catch(error){if(error instanceof OriginalStaffApiError)throw error;throw unavailable()}
  finally{closed=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(!complete){controller.abort();if(reader)void reader.cancel().catch(()=>{});else if(response instanceof Response)void response.body?.cancel().catch(()=>{})}try{reader?.releaseLock()}catch{}}
 }
 async function meta(signal?:AbortSignal){const v=staffObject(await request('/meta','GET',undefined,signal),['protocol','available','writes','create']);if(v.protocol!==originalStaffProtocol||v.available!==true||typeof v.writes!=='boolean'||typeof v.create!=='boolean'||v.create&&!v.writes)fail(503,'invalid_original_staff_capabilities');return Object.freeze({protocol:originalStaffProtocol,available:true as const,writes:v.writes as boolean,create:v.create as boolean})}
 function confirmed(raw:unknown,marker:OriginalStaffPending){
  let v;try{v=originalStaffReceiptResult(raw)}catch{return fail(503,'invalid_original_staff_receipt',true)}
  if(v.request_id!==marker.request_id||v.action!==marker.action||v.request_sha256!==marker.request_sha256||marker.target_id!==null&&v.target_id!==marker.target_id||v.user.revision!==marker.expected_after_revision||v.user.governance_revision!==marker.expected_after_governance_revision||v.revoked_sessions!==marker.expected_revoked_sessions||marker.before_updated!==null&&v.user.updated<=marker.before_updated)fail(503,'unconfirmed_original_staff_receipt',true)
  return v
 }
 async function mutate(action:Action,before:OriginalStaffEmployee|null,raw:Record<string,unknown>,signal?:AbortSignal){
  current();if(busy)fail(409,'original_staff_request_busy');if(pending)fail(0,'original_staff_outcome_unknown',true);busy=true
  try{
   const prior=before===null?null:originalStaffEmployee(before),target=prior?.id??null,request_id=crypto.randomUUID(),choice=parseOriginalStaffMutation(action,target,{request_id,...raw,confirm:true})
   if(action!=='create'&&(!prior||choice.expected_revision!==prior.revision||choice.expected_governance_revision!==prior.governance_revision||choice.expected_updated!==prior.updated))fail(400,'invalid_original_staff_input')
   const capability=await meta(signal);current();if(!capability.writes||action==='create'&&!capability.create)fail(403,action==='create'?'employee_provisioning_disabled':'original_staff_writes_disabled')
   const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(originalStaffPublicChoice(choice))))),request_sha256=Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');current()
   const governance=!!prior&&action==='update'&&(prior.role!==choice.role||prior.active!==choice.active||prior.share_enabled!==choice.share_enabled),revoke=action==='reset'||!!prior&&action==='update'&&(prior.role!==choice.role||prior.active!==choice.active||prior.email!==choice.email)
   const marker=parseOriginalStaffPending({format:'agentstudio.original-staff.pending.v1',employee_id:employee,request_id,action,target_id:target,request_sha256,expected_after_revision:prior?prior.revision+1:1,expected_after_governance_revision:prior?prior.governance_revision+(governance?1:0):1,expected_revoked_sessions:revoke,before_updated:prior?.updated??null,created_at:Date.now()},employee);pending=marker
   try{config.onPending?.(marker)}catch{pending=null;fail(0,'original_staff_pending_storage_unavailable')}
   const endpoint=action==='create'?'/users':'/users/'+target+(action==='reset'?'/reset-password':''),value=confirmed(await request(endpoint,action==='update'?'PATCH':'POST',Object.fromEntries(Object.entries(choice).filter(([key])=>key!=='action'&&key!=='target_id')),signal),marker)
   const expected=action==='reset'?prior:choice;for(const key of ['display_name','email','role','share_enabled'] as const)if(value.user[key]!==expected?.[key])fail(503,'unconfirmed_original_staff_receipt',true)
   if(value.user.active!==(action==='create'?true:action==='reset'?prior?.active:choice.active))fail(503,'unconfirmed_original_staff_receipt',true)
   current(true);clearPending();return value
  }catch(error){if(!(error instanceof OriginalStaffApiError)||!error.outcomeUnknown)clearPending();throw error}finally{busy=false}
 }
 return Object.freeze({meta,pending:()=>pending,busy:()=>busy,
  async me(signal?:AbortSignal){const v=staffObject(await request('/me','GET',undefined,signal),['user']),user=originalStaffEmployee(v.user);if(user.id!==employee||user.active!==true)fail(503,'invalid_original_staff_identity');return user},
  async list(query:{page?:number;perPage?:number;q?:string;role?:''|'admin'|'employee';active?:''|'true'|'false'}={},signal?:AbortSignal){const params=new URLSearchParams(Object.entries(query).map(([key,value])=>[key,String(value)])),choice=parseOriginalStaffList(params),value=originalStaffListResult(await request('/users'+(params.size?'?'+params:''),'GET',undefined,signal));if(value.perPage!==choice.perPage||value.page!==Math.min(choice.page,value.totalPages)||value.items.some(user=>choice.role!==''&&user.role!==choice.role||choice.active!==''&&user.active!==(choice.active==='true')))fail(503,'invalid_original_staff_list');return value},
  create:(form:Omit<PublicForm,'active'>&{password:string},signal?:AbortSignal)=>mutate('create',null,{...form},signal),
  update:(before:OriginalStaffEmployee,form:PublicForm,signal?:AbortSignal)=>mutate('update',before,{expected_revision:before.revision,expected_governance_revision:before.governance_revision,expected_updated:before.updated,...form},signal),
  resetPassword:(before:OriginalStaffEmployee,new_password:string,signal?:AbortSignal)=>mutate('reset',before,{expected_revision:before.revision,expected_governance_revision:before.governance_revision,expected_updated:before.updated,new_password},signal),
  async confirmPending(signal?:AbortSignal){current();if(busy)fail(409,'original_staff_request_busy');const marker=pending;if(marker===null)return fail(400,'original_staff_pending_required');busy=true
   try{const params=new URLSearchParams({action:marker.action,request_sha256:marker.request_sha256,...(marker.target_id===null?{}:{target_id:marker.target_id})}),value=confirmed(await request('/requests/'+marker.request_id+'?'+params,'GET',undefined,signal),marker);current();if(pending!==marker)fail(409,'employee_session_changed');clearPending();return value}finally{busy=false}
  },
 })
}
