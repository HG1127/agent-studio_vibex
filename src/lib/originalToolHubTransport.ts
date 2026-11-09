import {parseOriginalToolHubActivityQuery} from '../../shared/original-toolhub-activity.ts'
/** Original ToolHub only: verified Native Cookie, fixed routes, bounded bodies. */
export class OriginalToolHubTransportError extends Error{readonly code:string;constructor(code:string){super(code);this.code=code;this.name='OriginalToolHubTransportError'}}
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
export function originalToolHubRoute(raw:string,method:string):boolean{
 if(!raw.startsWith('/__pg_native/api/')||/[#\\\u0000-\u0020]/u.test(raw)||/%(?:2f|5c|2e|00)/i.test(raw))return false
 const url=new URL(raw,'https://original-toolhub.invalid'),p=url.pathname.slice('/__pg_native'.length),q=url.searchParams
 if(raw!==url.pathname+url.search&&raw!==url.pathname+'?')return false
 const keys=[...q.keys()];if(new Set(keys).size!==keys.length)return false
 if(method==='POST')return !url.search&&(p==='/api/v2/tool-hub/trials'||p==='/api/v2/tool-hub/trials/preview'||new RegExp('^/api/v2/workflow-v2-runs/'+uuid+'/(decision|cancel)$').test(p))
 if(method!=='GET')return false
 if(['/api/native-auth/capabilities','/api/v2/tool-hub','/api/v2/tool-hub/stats','/api/v2/tool-hub/harness'].includes(p))return !url.search
 if(p==='/api/v2/original-ui/agent-specs')return url.search==='?limit=50'
 if(new RegExp('^/api/v2/original-ui/agent-specs/'+uuid+'$').test(p)||new RegExp('^/api/v2/workflow-v2-runs/'+uuid+'$').test(p))return !url.search
 if(p==='/api/v2/tool-connections'||p==='/api/v2/model-connections'){
  if(!url.search)return true
  if(p==='/api/v2/model-connections'&&keys.join(',')==='limit'&&q.get('limit')==='50')return true
  const tag=p.includes('tool-connections')?'tcpg1':'mcpg1',cursor=q.get('cursor')
  return keys.every(k=>['paging','limit','cursor'].includes(k))&&q.get('paging')==='owner_cursor_v1'&&q.get('limit')==='50'&&(cursor===null||new RegExp('^'+tag+'\\.[A-Za-z0-9_-]{80,2000}$').test(cursor))
 }
 if(p==='/api/v2/tool-hub/invocations'&&q.has('view')){
  if(q.get('view')!=='original_page_v1'||keys.some(k=>!['view','page','tool','q','status','source','run_id'].includes(k))||!/^([1-9]|1[0-9]|2[0-5])$/.test(q.get('page')??'1'))return false
  try{parseOriginalToolHubActivityQuery({tool:q.get('tool')??'',q:q.get('q')??'',status:q.get('status')??'',source:q.get('source')??'',run_id:q.get('run_id')??'',page:Number(q.get('page')??'1')});return true}catch{return false}
 }
 if(p==='/api/v2/tool-hub/invocations')return keys.every(k=>['kind','status','tool','after'].includes(k))&&keys.every(k=>(q.get(k)?.length??0)<=500)
 if(new RegExp('^/api/v2/tool-hub/trials/'+uuid+'/confirm$').test(p))return keys.join(',')==='request_sha256'&&/^[a-f0-9]{64}$/.test(q.get('request_sha256')??'')
 return false
}
export function createOriginalToolHubTransport(options:{employeeId:string;verifyEmployee:()=>Promise<string>;transport?:typeof fetch;timeoutMs?:number}){
 const send=options.transport??fetch,budget=options.timeoutMs??8000,employee=options.employeeId,flights=new Set<()=>void>();let closed=false
 if(!new RegExp('^'+uuid+'$').test(employee)||!Number.isSafeInteger(budget)||budget<1||budget>8000)throw new OriginalToolHubTransportError('invalid_original_toolhub_transport')
 const denied=(code:string):never=>{throw new OriginalToolHubTransportError(code)}
 async function identity(){if(closed||await options.verifyEmployee()!==employee||closed)return denied('original_toolhub_employee_changed')}
 const request=async(input:RequestInfo|URL,init?:RequestInit,scope?:()=>boolean):Promise<Response>=>{
  const current=()=>{try{return !closed&&(scope===undefined||scope()===true)}catch{return false}}
  const method=init?.method??'GET'
  if(typeof input!=='string'||!originalToolHubRoute(input,method))return denied('original_toolhub_route_refused')
  const headers=new Headers(init?.headers)
  for(const [key] of headers)if(!['accept','content-type','x-agentstudio-request','x-agentstudio-expected-employee','x-agentstudio-original-quality','x-agentstudio-original-tools'].includes(key.toLowerCase()))return denied('original_toolhub_header_refused')
  if(headers.has('x-agentstudio-expected-employee')&&headers.get('x-agentstudio-expected-employee')!==employee)return denied('original_toolhub_employee_header_refused')
  const quality=false
  if(quality&&headers.get('x-agentstudio-original-quality')!=='native_original_agent_quality_v1'||!quality&&headers.has('x-agentstudio-original-quality'))return denied('original_quality_protocol_header_refused')
  if(headers.has('x-agentstudio-original-tools')&&(headers.get('x-agentstudio-original-tools')!=='1'||!input.startsWith('/__pg_native/api/v2/tool-connections')))return denied('original_toolhub_header_refused')
  const raw=init?.body
  if(raw!==undefined&&raw!==null&&(typeof raw!=='string'||new TextEncoder().encode(raw).length>131072))return denied('original_toolhub_body_refused')
  if(method==='GET'&&raw!==undefined&&raw!==null)return denied('original_toolhub_get_body_refused')
  if(quality&&(!scope||!current()))return denied('original_quality_scope_required')
  await identity();if(!current())return denied('original_toolhub_scope_changed')
  const c=new AbortController();let complete=false,retired=false,responseBody:ReadableStream<Uint8Array>|null=null,timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,rejectAbort:(e:Error)=>void=()=>{}
  const failure=()=>new OriginalToolHubTransportError(method==='GET'?'original_toolhub_read_unavailable':'original_toolhub_outcome_unknown')
  const cancelUnreadBody=()=>{void responseBody?.cancel().catch(()=>{})}
  const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject}),abort=()=>{retired=true;if(!complete)c.abort();rejectAbort(failure())}
  flights.add(abort)
  if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true})
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{retired=true;if(!complete)c.abort();reject(failure())},budget)})
  const perform=async()=>{
   if(retired||c.signal.aborted||!current())throw failure()
   const response=await send(input,{...init,method,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:c.signal,headers:{Accept:'application/json',...(headers.has('x-agentstudio-original-tools')?{'X-AgentStudio-Original-Tools':'1'}:{}),...(quality?{'X-AgentStudio-Original-Quality':'native_original_agent_quality_v1'}:{}),...(method==='GET'?(headers.has('x-agentstudio-expected-employee')?{'X-AgentStudio-Expected-Employee':employee}:{}):{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee})}})
   if(response instanceof Response){responseBody=response.body;if(retired||c.signal.aborted||!current()){void response.body?.cancel().catch(()=>{});throw failure()}}
   if(!(response instanceof Response)||response.redirected||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))return denied('original_toolhub_response_refused')
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   const length=response.headers.get('content-length')
   if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1048576))return denied('original_toolhub_response_refused')
   while(true){const part=await reader.read();if(retired||c.signal.aborted||!current())throw failure();if(part.done)break;size+=part.value.byteLength;if(size>1048576)return denied('original_toolhub_response_refused');chunks.push(part.value)}
   if(length!==null&&Number(length)!==size)return denied('original_toolhub_response_refused');complete=true
   const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.byteLength}
   try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return denied('original_toolhub_response_refused')}
   await identity();if(retired||c.signal.aborted||!current())throw failure()
   return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers})
  }
  try{return await Promise.race([perform(),deadline,cancelled])}finally{retired=true;clearTimeout(timer);flights.delete(abort);init?.signal?.removeEventListener('abort',abort);if(!complete){c.abort();if(reader)void reader.cancel().catch(()=>{});else cancelUnreadBody()}try{reader?.releaseLock()}catch{}}
 }
 const transport:typeof fetch=(input,init)=>request(input,init)
 return Object.freeze({transport,forScope(scope:()=>boolean):typeof fetch{if(typeof scope!=='function')throw new OriginalToolHubTransportError('original_toolhub_scope_required');return(input,init)=>request(input,init,scope)},close(){closed=true;for(const cancel of flights)cancel();flights.clear()}})
}
