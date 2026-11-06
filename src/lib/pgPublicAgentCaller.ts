// Independent public authorization. This client always omits employee cookies,
// never retries a mutation and never drives Worker/Broker from poll/confirm.
import {agentTemplateMarketObject as O} from '../../services/pg-api/src/agent-template-market-contract.ts'
import {decodeTemplateMarketJson} from './pgNativeTemplateMarket.ts'
import {agentCallerOrigin,agentCallerId,agentCallerCanonical,parseAgentCallerSecret,parseAgentCallerRunChoice,parseAgentCallerRunReply,parseAgentCallerPublicStatus,matchAgentCallerRunReceipt,type AgentCallerRunChoice} from '../../shared/agent-caller-contract.ts'
export class PublicAgentCallerError extends Error{readonly status:number;readonly code:string;readonly definite:boolean;constructor(status:number,code:string,definite=false){super(code);this.name='PublicAgentCallerError';this.status=status;this.code=code;this.definite=definite}}
export function createPublicAgentCaller(config:{baseUrl:string;origin:string;key:string;transport?:typeof fetch;proxyPrefix?:''|'/__pg_native';timeoutMs?:number}){
 O(config,['baseUrl','origin','key'],['transport','proxyPrefix','timeoutMs'])
 const base=agentCallerOrigin(config.baseUrl),origin=agentCallerOrigin(config.origin),parsed=parseAgentCallerSecret(config.key),identity={credential_id:parsed.credential_id,generation:parsed.generation},transport=config.transport??fetch,prefix=config.proxyPrefix??'',budget=config.timeoutMs??8000
 if(typeof location!=='undefined'&&origin!==location.origin||prefix!==''&&prefix!=='/__pg_native'||typeof transport!=='function'||!Number.isSafeInteger(budget)||budget<1||budget>20000)throw Error('invalid_public_agent_caller_client')
 let secret=parsed.raw,disposed=false;const activeControllers=new Set<AbortController>(),unknown=()=>new PublicAgentCallerError(0,'agent_caller_outcome_unknown')
 async function request<T>(suffix:string,method:'GET'|'POST',body:unknown,parse:(raw:unknown)=>T|Promise<T>,signal?:AbortSignal):Promise<T>{
  if(disposed||!secret)throw new PublicAgentCallerError(0,'agent_caller_client_closed',true)
  const timeout=new AbortController(),active=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal;activeControllers.add(timeout)
  let rejectAbort:(error:Error)=>void=()=>{},reader:ReadableStreamDefaultReader<Uint8Array>|null=null,responseBody:ReadableStream<Uint8Array>|null=null
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject}),onAbort=()=>rejectAbort(unknown()),timer=setTimeout(()=>timeout.abort(),budget);active.addEventListener('abort',onAbort,{once:true})
  try{
   if(active.aborted)throw unknown()
   const response=await Promise.race([transport(base+prefix+'/api/v2/public/agent'+suffix,{method,body:body===undefined?undefined:agentCallerCanonical(body),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:active,headers:{Accept:'application/json',Origin:origin,Authorization:'Bearer '+secret,...(method==='POST'?{'Content-Type':'application/json'}:{})}}),aborted])
   if(disposed||active.aborted||!(response instanceof Response)||response.redirected)throw unknown();responseBody=response.body
   if(response.status===401)throw new PublicAgentCallerError(401,'agent_caller_authorization_required',true)
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||!response.body)throw unknown()
   const length=response.headers.get('content-length'),max=65536;if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>max))throw unknown()
   reader=response.body.getReader();const actual=reader,read=async()=>{
    const chunks:Uint8Array[]=[];let size=0
    for(;;){const part=await actual.read();if(active.aborted||disposed)throw unknown();if(part.done)break;size+=part.value.byteLength;if(size>max)throw unknown();chunks.push(part.value)}
    if(length!==null&&Number(length)!==size)throw unknown();const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
    const value=decodeTemplateMarketJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
    if(response.status!==200){if(response.status>=400&&response.status<500){const error=O(value,['error']);if(typeof error.error!=='string'||!/^agent_caller_[a-z_]{1,64}$/.test(error.error))throw unknown();throw new PublicAgentCallerError(response.status,error.error,true)}throw unknown()}
    return parse(value)
   };return await Promise.race([read(),aborted])
  }catch(error){if(error instanceof PublicAgentCallerError)throw error;throw unknown()}finally{clearTimeout(timer);active.removeEventListener('abort',onAbort);activeControllers.delete(timeout);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}else if(responseBody)void responseBody.cancel().catch(()=>{})}
 }
 async function reply(value:unknown,choice:AgentCallerRunChoice,confirmation=false){const parsed=parseAgentCallerRunReply(value);await matchAgentCallerRunReceipt(parsed.receipt,choice,identity,origin);if(confirmation&&!parsed.replayed)throw unknown();return parsed}
 return Object.freeze({
  submit(raw:unknown,signal?:AbortSignal){const choice=parseAgentCallerRunChoice(raw);return request('/run','POST',choice,value=>reply(value,choice),signal)},
  confirm(raw:unknown,signal?:AbortSignal){const choice=parseAgentCallerRunChoice(raw);return request('/confirm','POST',{choice},value=>reply(value,choice,true),signal)},
  poll(rawId:unknown,signal?:AbortSignal){const id=agentCallerId(rawId);return request('/poll/'+id,'GET',undefined,value=>{const result=parseAgentCallerPublicStatus(value);if(result.invocation_id!==id)throw unknown();return result},signal)},
  dispose(){if(disposed)return;disposed=true;secret='';for(const controller of activeControllers)controller.abort();activeControllers.clear()},
 })
}
export type PublicAgentCaller=ReturnType<typeof createPublicAgentCaller>
