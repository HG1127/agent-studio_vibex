import {agentTemplateMarketObject as O} from '../../services/pg-api/src/agent-template-market-contract.ts'
import {decodeTemplateMarketJson} from './pgNativeTemplateMarket.ts'
import {internalShareCanonical,internalShareRoute,internalShareId,parseInternalShareIntent,parseInternalShareList,parseInternalSharePreview,parseInternalShareReply,matchInternalShareReceipt} from '../../shared/agent-internal-share-contract.ts'
export class PgNativeInternalShareError extends Error{
 readonly status:number;readonly code:string;readonly definite:boolean
 constructor(status:number,code:string,definite=false){super(code);this.name='PgNativeInternalShareError';this.status=status;this.code=code;this.definite=definite}
}
export function createPgNativeInternalShareApi(config:{transport?:typeof fetch;rootPath?:''|'/__pg_native';timeoutMs?:number}={}){
 O(config,[],['transport','rootPath','timeoutMs'])
 const send=config.transport??fetch,root=config.rootPath??'/__pg_native',budget=config.timeoutMs??8000
 if(typeof send!=='function'||root!==''&&root!=='/__pg_native'||!Number.isSafeInteger(budget)||budget<1||budget>20000)throw Error('invalid_internal_share_transport')
 async function request<T>(path:''|'/confirm',method:'GET'|'POST',body:unknown,parse:(raw:unknown)=>T|Promise<T>,signal?:AbortSignal):Promise<T>{
  const timeout=new AbortController(),active=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal,unknown=()=>new PgNativeInternalShareError(0,'internal_share_outcome_unknown')
  let reader:ReadableStreamDefaultReader<Uint8Array>|null=null,responseBody:ReadableStream<Uint8Array>|null=null,rejectAbort:(error:Error)=>void=()=>{}
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject}),onAbort=()=>rejectAbort(unknown()),timer=setTimeout(()=>timeout.abort(),budget)
  active.addEventListener('abort',onAbort,{once:true})
  try{
   if(active.aborted)throw unknown()
   const res=await Promise.race([send(root+internalShareRoute+path,{method,body:body===undefined?undefined:internalShareCanonical(body),credentials:'same-origin',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:active,headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{})}}),aborted])
   if(!(res instanceof Response)||res.redirected)throw unknown();responseBody=res.body
   if(res.status===401)throw new PgNativeInternalShareError(401,'session_required',true)
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
    if(res.status!==200){if(res.status>=400&&res.status<500){const v=O(raw,['error']);if(typeof v.error!=='string'||!/^[a-z][a-z0-9_]{0,80}$/.test(v.error))throw unknown();throw new PgNativeInternalShareError(res.status,v.error,true)}throw unknown()}
    return parse(raw)
   }
   return await Promise.race([read(),aborted])
  }catch(error){if(error instanceof PgNativeInternalShareError)throw error;throw unknown()}
  finally{clearTimeout(timer);active.removeEventListener('abort',onAbort);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}else if(responseBody)void responseBody.cancel().catch(()=>{})}
 }
 async function reply(raw:unknown,intent:ReturnType<typeof parseInternalShareIntent>,recovery=false){const result=parseInternalShareReply(raw);await matchInternalShareReceipt(result.receipt,intent);if(recovery&&(!result.replayed||result.share_code!==null))throw Error('invalid_internal_share_response');return result}
 return Object.freeze({
  list:(signal?:AbortSignal)=>request('','GET',undefined,parseInternalShareList,signal),
  preview:(raw:unknown,signal?:AbortSignal)=>{const id=internalShareId(raw);return request('','POST',{action:'preview',id},async raw=>{const value=await parseInternalSharePreview(raw);if(value.source.spec_id!==id)throw Error('invalid_internal_share_response');return value},signal)},
  record:(raw:unknown,signal?:AbortSignal)=>{const intent=parseInternalShareIntent(raw);return request('','POST',intent,raw=>reply(raw,intent),signal)},
  confirm:(raw:unknown,signal?:AbortSignal)=>{const intent=parseInternalShareIntent(raw);return request('/confirm','POST',{intent},raw=>reply(raw,intent,true),signal)},
 })
}
export type PgNativeInternalShareApi=ReturnType<typeof createPgNativeInternalShareApi>
