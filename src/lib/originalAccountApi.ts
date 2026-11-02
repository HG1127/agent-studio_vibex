import {originalAccountPasswordProtocol,parseOriginalAccountExpectedOwner,parseOriginalAccountPasswordCapabilities,parseOriginalAccountPasswordInput,parseOriginalAccountPasswordResponse,type OriginalAccountPasswordInput} from '../../shared/original-account-contract.ts'
import {parseLocalTransportJson} from '../../shared/native-local-device-contract.mjs'

export class OriginalAccountError extends Error{
 readonly code:string;readonly status:number;readonly outcomeUnknown:boolean
 constructor(status:number,code:string,outcomeUnknown=false){super(code);this.name='OriginalAccountError';this.status=status;this.code=code;this.outcomeUnknown=outcomeUnknown}
}
type PasswordState='idle'|'preparing'|'sent'|'confirmed'|'uncertain'|'reauthenticate'
/** One verified employee/login epoch; credentials and operations are never persisted. */
export function createOriginalAccountApi(config:{employeeId:string;isCurrent:()=>boolean;transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number}){
 const employee=parseOriginalAccountExpectedOwner(config.employeeId),send=config.transport??fetch,root=config.rootPath??'/__pg_native',budget=config.timeoutMs??8000
 if(typeof config.isCurrent!=='function'||typeof send!=='function'||root!==''&&root!=='/__pg_native'||!Number.isSafeInteger(budget)||budget<1||budget>8000)throw new OriginalAccountError(400,'invalid_original_account_transport')
 let state:PasswordState='idle'
 const current=(unknown=false)=>{let valid=false;try{valid=config.isCurrent()===true}catch{}if(!valid)throw new OriginalAccountError(409,'employee_session_changed',unknown)}
 async function request(method:'GET'|'POST',input?:OriginalAccountPasswordInput,signal?:AbortSignal):Promise<unknown>{
  current();const write=method==='POST',abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,response:Response|undefined,sent=false,closed=false,complete=false,rejectCancel:((error:OriginalAccountError)=>void)|undefined
  const unavailable=()=>new OriginalAccountError(0,sent?'original_account_password_outcome_unknown':'original_account_unavailable',sent)
  const cancel=()=>{abort.abort();rejectCancel?.(unavailable())},cancelled=new Promise<never>((_,reject)=>{rejectCancel=reject}),deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(unavailable())},budget)})
  const invalid=():never=>{throw new OriginalAccountError(503,'invalid_original_account_response',sent)}
  const perform=async()=>{
   const body=input===undefined?undefined:JSON.stringify(input)
   if(body!==undefined&&new TextEncoder().encode(body).byteLength>8192)throw new OriginalAccountError(400,'invalid_employee_governance_input')
   current();if(signal?.aborted)throw unavailable();if(write){sent=true;state='sent'}
   response=await send(root+'/api/native-auth/'+(write?'change-password':'capabilities'),{method,body,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:abort.signal,headers:{Accept:'application/json','X-AgentStudio-Expected-Owner':employee,...(write?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{})}})
   if(!(response instanceof Response))throw unavailable()
   if(closed||abort.signal.aborted){void response.body?.cancel().catch(()=>{});throw unavailable()}
   if(response.redirected||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||!response.body)invalid()
   const declared=response.headers.get('content-length');if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>16384))invalid()
   reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0
   for(;;){const piece=await reader.read();if(closed||abort.signal.aborted)throw unavailable();current(sent);if(piece.done)break;size+=piece.value.byteLength;if(size>16384)invalid();chunks.push(piece.value)}
   if(declared!==null&&Number(declared)!==size)invalid();complete=true
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
   let value:unknown;try{value=parseLocalTransportJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),16384)}catch{invalid()}
   if(!response.ok){const raw=value as {error?:unknown},code=raw&&typeof raw==='object'&&typeof raw.error==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(raw.error)?raw.error:'original_account_request_refused';throw new OriginalAccountError(response.status,code,sent&&(response.status>=500||![400,401,403,404,405,409,413,415,429].includes(response.status)))}
   if(response.status!==200)invalid();current(sent);return value
  }
  try{if(signal?.aborted)throw unavailable();signal?.addEventListener('abort',cancel,{once:true});return await Promise.race([perform(),deadline,cancelled])}
  catch(error){if(error instanceof OriginalAccountError)throw error;throw unavailable()}
  finally{closed=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(!complete){abort.abort();if(reader)void reader.cancel().catch(()=>{});else if(response instanceof Response)void response.body?.cancel().catch(()=>{})}try{reader?.releaseLock()}catch{}}
 }
 async function capabilities(signal?:AbortSignal){try{return parseOriginalAccountPasswordCapabilities(await request('GET',undefined,signal))}catch(error){if(error instanceof OriginalAccountError)throw error;throw new OriginalAccountError(503,'invalid_original_account_password_capabilities')}}
 return Object.freeze({capabilities,passwordState:()=>state,
  async changePassword(raw:OriginalAccountPasswordInput,signal?:AbortSignal){
   current();if(state==='uncertain')throw new OriginalAccountError(0,'original_account_password_outcome_unknown',true)
   if(state==='confirmed'||state==='reauthenticate')throw new OriginalAccountError(401,'password_reauthentication_required')
   if(state!=='idle')throw new OriginalAccountError(409,'password_change_in_progress')
   let input:OriginalAccountPasswordInput;try{input=parseOriginalAccountPasswordInput(raw)}catch(error){throw new OriginalAccountError(400,error instanceof Error?error.message:'invalid_employee_governance_input')}
   state='preparing'
   try{
    const capability=await capabilities(signal);current()
    if(capability.protocol!==originalAccountPasswordProtocol||!capability.available||!capability.enabled)throw new OriginalAccountError(405,'original_account_password_disabled')
    const response=await request('POST',input,signal);current(true)
    let result;try{result=parseOriginalAccountPasswordResponse(response)}catch{throw new OriginalAccountError(503,'invalid_original_account_password_response',true)}
    state='confirmed';return Object.freeze(result)
   }catch(error){
    if(error instanceof OriginalAccountError){state=error.outcomeUnknown?'uncertain':error.status===401||['session_changed','employee_session_changed'].includes(error.code)?'reauthenticate':'idle';throw error}
    state='uncertain';throw new OriginalAccountError(0,'original_account_password_outcome_unknown',true)
   }
  },
 })
}
