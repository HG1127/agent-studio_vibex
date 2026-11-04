import {parseOwnOperationsJson} from './pgNativeOwnOperations.ts'
/** Original PluginMarket only: verified Native Cookie, fixed routes, bounded bodies. */
export class OriginalPluginMarketTransportError extends Error{readonly code:string;constructor(code:string){super(code);this.code=code;this.name='OriginalPluginMarketTransportError'}}
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
export function originalPluginMarketRoute(raw:string,method:string):boolean{
 if(!raw.startsWith('/__pg_native/api/')||/[#\\\u0000-\u0020]/u.test(raw))return false
 const url=new URL(raw,'https://original-plugin-market.invalid'),p=url.pathname.slice('/__pg_native'.length),q=url.searchParams,keys=[...q.keys()]
 if((raw!==url.pathname+url.search&&raw!==url.pathname+'?')||/%|\\/.test(url.pathname)||new Set(keys).size!==keys.length)return false
 const noQuery=!url.search
 if(method==='GET'){
  if(['/api/native-auth/capabilities','/api/v2/tool-hub','/api/v2/smithery/key'].includes(p))return noQuery
  if(new RegExp('^/api/v2/(?:mcp-connections|smithery/connections|workflow-v2-runs)/'+uuid+'$').test(p))return noQuery
  if(p==='/api/v2/mcp-connections')return keys.every(k=>['paging','limit','cursor'].includes(k))&&q.get('paging')==='owner_inventory_v1'&&q.get('limit')==='50'&&(!q.has('cursor')||/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(q.get('cursor')??''))
  if(p==='/api/v2/model-connections'){if(noQuery)return true;return keys.every(k=>['paging','limit','cursor'].includes(k))&&q.get('paging')==='owner_cursor_v1'&&q.get('limit')==='50'&&(!q.has('cursor')||/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(q.get('cursor')??''))}
  if(new RegExp('^/api/v2/model-connections/'+uuid+'$').test(p))return noQuery
  if(p==='/api/v2/tool-hub/registry')return keys.every(k=>['search','cursor'].includes(k))&&(q.get('search')??'').length<=100&&(q.get('cursor')??'').length<=300&&!/\s/.test(q.get('cursor')??'')
  if(p==='/api/v2/tool-hub/registry/detail')return keys.every(k=>['name','version'].includes(k))&&/^[a-z0-9][a-z0-9.-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(q.get('name')??'')&&!q.get('name')?.includes('..')&&/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(q.get('version')??'latest')
  if(p==='/api/v2/tool-hub/invocations')return keys.every(k=>['kind','status','tool','after'].includes(k))&&(!q.has('kind')||q.get('kind')==='mcp')&&keys.every(k=>(q.get(k)?.length??0)<=500)
  if(new RegExp('^/api/v2/tool-hub/trials/'+uuid+'/confirm$').test(p))return keys.join(',')==='request_sha256'&&/^[a-f0-9]{64}$/.test(q.get('request_sha256')??'')
  return false
 }
 if(!noQuery)return false
 if(method==='POST')return ['/api/v2/mcp-connections','/api/v2/smithery/key','/api/v2/smithery/namespaces','/api/v2/smithery/catalog','/api/v2/smithery/connections','/api/v2/tool-hub/trials','/api/v2/tool-hub/trials/preview','/api/v2/original-ui/plugin-market/discover-preview'].includes(p)||new RegExp('^/api/v2/mcp-connections/'+uuid+'/discover$').test(p)||new RegExp('^/api/v2/smithery/connections/'+uuid+'/(?:refresh|revoke|retry|pause)$').test(p)||new RegExp('^/api/v2/workflow-v2-runs/'+uuid+'/(?:decision|cancel)$').test(p)
 if(method==='PATCH')return new RegExp('^/api/v2/mcp-connections/'+uuid+'$').test(p)
 if(method==='DELETE')return p==='/api/v2/smithery/key'||new RegExp('^/api/v2/mcp-connections/'+uuid+'$').test(p)
 return false
}
export function createOriginalPluginMarketTransport(options:{employeeId:string;verifyEmployee:()=>Promise<string>;transport?:typeof fetch;timeoutMs?:number}){
 const send=options.transport??fetch,budget=options.timeoutMs??25000,employee=options.employeeId,flights=new Set<()=>void>();let closed=false
 if(!new RegExp('^'+uuid+'$').test(employee)||!Number.isSafeInteger(budget)||budget<1||budget>25000)throw new OriginalPluginMarketTransportError('invalid_original_plugin_market_transport')
 const denied=(code:string):never=>{throw new OriginalPluginMarketTransportError(code)}
 async function identity(){if(closed||await options.verifyEmployee()!==employee||closed)return denied('original_plugin_market_employee_changed')}
 const request=async(input:RequestInfo|URL,init?:RequestInit,scope?:()=>boolean):Promise<Response>=>{
  const current=()=>{try{return !closed&&(scope===undefined||scope()===true)}catch{return false}}
  const method=init?.method??'GET'
  if(typeof input!=='string'||!originalPluginMarketRoute(input,method))return denied('original_plugin_market_route_refused')
  const headers=new Headers(init?.headers)
  for(const [key] of headers)if(!['accept','content-type','x-agentstudio-request','x-agentstudio-expected-employee','x-agentstudio-original-quality','x-agentstudio-original-tools'].includes(key.toLowerCase()))return denied('original_plugin_market_header_refused')
  if(headers.has('x-agentstudio-expected-employee')&&headers.get('x-agentstudio-expected-employee')!==employee)return denied('original_plugin_market_employee_header_refused')
  const quality=false
  if(quality&&headers.get('x-agentstudio-original-quality')!=='native_original_agent_quality_v1'||!quality&&headers.has('x-agentstudio-original-quality'))return denied('original_quality_protocol_header_refused')
  if(headers.has('x-agentstudio-original-tools')&&(headers.get('x-agentstudio-original-tools')!=='1'||!input.startsWith('/__pg_native/api/v2/tool-connections')))return denied('original_plugin_market_header_refused')
  const raw=init?.body
  if(raw!==undefined&&raw!==null&&(typeof raw!=='string'||new TextEncoder().encode(raw).length>131072))return denied('original_plugin_market_body_refused')
  if(method==='GET'&&raw!==undefined&&raw!==null)return denied('original_plugin_market_get_body_refused')
  if(method!=='GET'&&(!scope||!current()))return denied('original_quality_scope_required')
  await identity();if(!current())return denied('original_plugin_market_scope_changed')
  const c=new AbortController();let complete=false,retired=false,responseBody:ReadableStream<Uint8Array>|null=null,timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,rejectAbort:(e:Error)=>void=()=>{}
  const failure=()=>new OriginalPluginMarketTransportError(method==='GET'?'original_plugin_market_read_unavailable':'original_plugin_market_outcome_unknown')
  const cancelUnreadBody=()=>{void responseBody?.cancel().catch(()=>{})}
  const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject}),abort=()=>{retired=true;if(!complete)c.abort();rejectAbort(failure())}
  flights.add(abort)
  if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true})
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{retired=true;if(!complete)c.abort();reject(failure())},budget)})
  const perform=async()=>{
   if(retired||c.signal.aborted||!current())throw failure()
   const response=await send(input,{...init,method,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:c.signal,headers:{Accept:'application/json',...(headers.has('x-agentstudio-original-tools')?{'X-AgentStudio-Original-Tools':'1'}:{}),...(quality?{'X-AgentStudio-Original-Quality':'native_original_agent_quality_v1'}:{}),...(/^\/__pg_native\/api\/v2\/(?:mcp-connections(?:\/|$)|smithery\/|original-ui\/plugin-market\/)/.test(input)?{'X-AgentStudio-Original-Plugins':'native_original_plugin_market_v1'}:{}),...(method==='GET'?{'X-AgentStudio-Expected-Employee':employee}:{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee})}})
   if(response instanceof Response){responseBody=response.body;if(retired||c.signal.aborted||!current()){void response.body?.cancel().catch(()=>{});throw failure()}}
   if(!(response instanceof Response)||response.redirected||response.headers.get('cache-control')!=='no-store'||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))return denied('original_plugin_market_response_refused')
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   const length=response.headers.get('content-length')
   if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1048576))return denied('original_plugin_market_response_refused')
   while(true){const part=await reader.read();if(retired||c.signal.aborted||!current())throw failure();if(part.done)break;size+=part.value.byteLength;if(size>1048576)return denied('original_plugin_market_response_refused');chunks.push(part.value)}
   if(length!==null&&Number(length)!==size)return denied('original_plugin_market_response_refused');complete=true
   const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.byteLength}
   try{parseOwnOperationsJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return denied('original_plugin_market_response_refused')}
   await identity();if(retired||c.signal.aborted||!current())throw failure()
   return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers})
  }
  try{return await Promise.race([perform(),deadline,cancelled])}finally{retired=true;clearTimeout(timer);flights.delete(abort);init?.signal?.removeEventListener('abort',abort);if(!complete){c.abort();if(reader)void reader.cancel().catch(()=>{});else cancelUnreadBody()}try{reader?.releaseLock()}catch{}}
 }
 const transport:typeof fetch=(input,init)=>request(input,init)
 return Object.freeze({transport,forScope(scope:()=>boolean):typeof fetch{if(typeof scope!=='function')throw new OriginalPluginMarketTransportError('original_plugin_market_scope_required');return(input,init)=>request(input,init,scope)},close(){closed=true;for(const cancel of flights)cancel();flights.clear()}})
}
