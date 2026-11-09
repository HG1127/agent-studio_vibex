import {agentTemplateMarketObject as O} from '../../services/pg-api/src/agent-template-market-contract.ts'
import {decodeTemplateMarketJson} from './pgNativeTemplateMarket.ts'
import {approvalDelegationCanonical,parseApprovalDelegationChoice,parseApprovalDelegationOwnerList,parseApprovalDelegationManagerList,parseApprovalDelegationReply,matchApprovalDelegationReceipt} from '../../shared/approval-delegation-contract.ts'
export class PgNativeApprovalDelegationError extends Error{
 readonly status:number;readonly code:string;readonly definite:boolean
 constructor(status:number,code:string,definite=false){super(code);this.name='PgNativeApprovalDelegationError';this.status=status;this.code=code;this.definite=definite}
}
export function createPgNativeApprovalDelegationApi(config:{transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number}={}){
 O(config,[],['transport','rootPath','timeoutMs'])
 const send=config.transport??fetch,root=config.rootPath??'/__pg_native',budget=config.timeoutMs??8000
 if(typeof send!=='function'||root!==''&&root!=='/__pg_native'||!Number.isSafeInteger(budget)||budget<1||budget>20000)throw Error('invalid_approval_delegation_transport')
 async function request<T>(path:'/api/v2/approval-delegations'|'/api/v2/approval-delegations/confirm'|'/api/v2/manager/approvals'|'/api/v2/manager/decision',method:'GET'|'POST',body:unknown,parse:(raw:unknown)=>T|Promise<T>,signal?:AbortSignal):Promise<T>{
  const timeout=new AbortController(),active=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal,unknown=()=>new PgNativeApprovalDelegationError(0,'approval_delegation_outcome_unknown')
  let reader:ReadableStreamDefaultReader<Uint8Array>|null=null,responseBody:ReadableStream<Uint8Array>|null=null,rejectAbort:(error:Error)=>void=()=>{}
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject}),onAbort=()=>rejectAbort(unknown()),timer=setTimeout(()=>timeout.abort(),budget)
  active.addEventListener('abort',onAbort,{once:true})
  try{
   if(active.aborted)throw unknown()
   const res=await Promise.race([send(root+path,{method,body:body===undefined?undefined:approvalDelegationCanonical(body),credentials:'same-origin',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:active,headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{})}}),aborted])
   if(!(res instanceof Response)||res.redirected)throw unknown();responseBody=res.body
   if(res.status===401)throw new PgNativeApprovalDelegationError(401,'session_required',true)
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(res.headers.get('content-type')??'')||!res.body)throw unknown()
   const length=res.headers.get('content-length'),max=1048576
   if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>max))throw unknown()
   reader=res.body.getReader();const selected=reader
   const read=async()=>{
    const chunks:Uint8Array[]=[];let size=0
    for(;;){const part=await selected.read();if(active.aborted)throw unknown();if(part.done)break;size+=part.value.byteLength;if(size>max)throw unknown();chunks.push(part.value)}
    if(length!==null&&Number(length)!==size)throw unknown()
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
    const raw=decodeTemplateMarketJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
    if(res.status!==200){if(res.status>=400&&res.status<500){const v=O(raw,['error']);if(typeof v.error!=='string'||!/^[a-z][a-z0-9_]{0,80}$/.test(v.error))throw unknown();throw new PgNativeApprovalDelegationError(res.status,v.error,true)}throw unknown()}
    return parse(raw)
   }
   return await Promise.race([read(),aborted])
  }catch(error){if(error instanceof PgNativeApprovalDelegationError)throw error;throw unknown()}
  finally{clearTimeout(timer);active.removeEventListener('abort',onAbort);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}else if(responseBody)void responseBody.cancel().catch(()=>{})}
 }
 async function reply(raw:unknown,choice:ReturnType<typeof parseApprovalDelegationChoice>,confirm=false){const value=parseApprovalDelegationReply(raw);await matchApprovalDelegationReceipt(value.receipt,choice);if(confirm&&!value.replayed)throw Error('invalid_approval_delegation_response');return value}
 return Object.freeze({
  owner:(signal?:AbortSignal)=>request('/api/v2/approval-delegations','GET',undefined,parseApprovalDelegationOwnerList,signal),
  assigned:(signal?:AbortSignal)=>request('/api/v2/manager/approvals','GET',undefined,parseApprovalDelegationManagerList,signal),
  record:(raw:unknown,signal?:AbortSignal)=>{const choice=parseApprovalDelegationChoice(raw);return request(choice.action==='review'?'/api/v2/manager/decision':'/api/v2/approval-delegations','POST',choice,value=>reply(value,choice),signal)},
  confirm:(raw:unknown,signal?:AbortSignal)=>{const choice=parseApprovalDelegationChoice(raw);return request('/api/v2/approval-delegations/confirm','POST',{choice},value=>reply(value,choice,true),signal)},
 })
}
export type PgNativeApprovalDelegationApi=ReturnType<typeof createPgNativeApprovalDelegationApi>
