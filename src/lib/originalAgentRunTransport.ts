/** Closed same-origin transport for the original AgentRun Native branch. */
export class OriginalAgentRunTransportError extends Error {readonly code:string;constructor(code:string){super(code);this.code=code;this.name='OriginalAgentRunTransportError'}}
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const detail=/^\/api\/v2\/agent-autonomous-runs\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const action=/^\/api\/v2\/agent-autonomous-runs\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(decision|cancel|pause|resume|pause-confirm|resume-confirm|respond|respond-confirm)$/
const agent=/^\/api\/v2\/agent-specs\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const submit=/^\/api\/v2\/agent-specs\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/autonomous-runs$/
const homeAgent=/^\/api\/v2\/original-ui\/agent-specs\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const feedback=/^\/api\/v2\/agent-feedback\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\/(change|confirm))?$/
const memory=/^\/api\/v2\/agent-memories\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function originalAgentRunRoute(raw:string,method:string):boolean{
 if(!raw.startsWith('/__pg_native/api/')||/[#\\\u0000-\u0020]/u.test(raw)||/%(?:2f|5c|2e|00)/i.test(raw))return false
 const url=new URL(raw,'https://original-ui.invalid'),p=url.pathname.slice('/__pg_native'.length),q=url.searchParams
 if(method==='GET'){
  if(p==='/api/v2/model-connections'&&url.search){
   if(url.search!=='?'+q.toString()||[...q.keys()].some(k=>!['paging','limit','cursor'].includes(k)||q.getAll(k).length!==1))return false
   if([...q.keys()].join(',')==='limit'&&q.get('limit')==='50')return true
   const cursor=q.get('cursor');return q.get('paging')==='owner_cursor_v1'&&q.get('limit')==='50'&&(cursor===null||/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(cursor))
  }
  if(['/api/native-auth/capabilities','/api/v2/model-connections','/api/v2/tool-connections','/api/v2/mcp-connections','/api/v2/agent-autonomous-runs','/api/v2/knowledge-bases','/api/v2/shared-knowledge','/api/v2/knowledge-embedding/consent','/api/v2/original-ui/home-resources'].includes(p))return !url.search
  if(detail.test(p)||agent.test(p)||homeAgent.test(p)||feedback.test(p)&&!p.endsWith('/change')&&!p.endsWith('/confirm')||memory.test(p))return !url.search
  if(p==='/api/v2/original-ui/agent-specs')return url.search==='?limit=50'
  if(p==='/api/v2/original-ui/agent-workspace')return url.search==='?limit=12'
  if(p==='/api/v2/agent-memories')return [...q.keys()].join(',')==='spec_id'&&new RegExp('^'+uuid+'$').test(q.get('spec_id')??'')
  return false
 }
 if(method!=='POST'||url.search)return false
 return action.test(p)||submit.test(p)||feedback.test(p)&&/\/(change|confirm)$/.test(p)||['/api/v2/agent-memories/change','/api/v2/agent-memories/confirm'].includes(p)
}
export function createOriginalAgentRunTransport(options:{employeeId:string;verifyEmployee:()=>Promise<string>;transport?:typeof fetch;timeoutMs?:number}){
 const send=options.transport??fetch,budget=options.timeoutMs??8000,employee=options.employeeId,flights=new Set<AbortController>();let closed=false
 if(!new RegExp('^'+uuid+'$').test(employee)||!Number.isSafeInteger(budget)||budget<1||budget>8000)throw new OriginalAgentRunTransportError('invalid_original_run_transport')
 const denied=(code:string):never=>{throw new OriginalAgentRunTransportError(code)}
 async function identity(){if(closed||await options.verifyEmployee()!==employee||closed)return denied('original_run_employee_changed')}
 const transport:typeof fetch=async(input,init)=>{
  const method=init?.method??'GET'
  if(typeof input!=='string'||!originalAgentRunRoute(input,method))return denied('original_run_route_refused')
  const headers=new Headers(init?.headers)
  for(const [key] of headers)if(!['accept','content-type','x-agentstudio-request','x-agentstudio-expected-employee'].includes(key.toLowerCase()))return denied('original_run_header_refused')
  if(headers.has('x-agentstudio-expected-employee')&&headers.get('x-agentstudio-expected-employee')!==employee)return denied('original_run_employee_header_refused')
  const raw=init?.body
  if(raw!==undefined&&raw!==null&&(typeof raw!=='string'||new TextEncoder().encode(raw).length>131072))return denied('original_run_body_refused')
  await identity()
  const c=new AbortController();flights.add(c);let timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,rejectAbort:(e:Error)=>void=()=>{}
  const failure=()=>new OriginalAgentRunTransportError(method==='GET'?'original_run_read_unavailable':'original_run_outcome_unknown')
  const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject}),abort=()=>{c.abort();rejectAbort(failure())}
  if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true})
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{c.abort();reject(failure())},budget)})
  const perform=async()=>{
   if(c.signal.aborted||closed)throw failure()
   const response=await send(input,{...init,method,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:c.signal,headers:{Accept:'application/json',...(method==='GET'?(headers.has('x-agentstudio-expected-employee')?{'X-AgentStudio-Expected-Employee':employee}:{}):{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee})}})
   if(!(response instanceof Response)||response.redirected||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))return denied('original_run_response_refused')
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   const length=response.headers.get('content-length')
   if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1048576))return denied('original_run_response_refused')
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)return denied('original_run_response_refused');chunks.push(part.value)}
   if(length!==null&&Number(length)!==size)return denied('original_run_response_refused')
   const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.byteLength}
   try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return denied('original_run_response_refused')}
   await identity();if(c.signal.aborted||closed)throw failure()
   return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers})
  }
  try{return await Promise.race([perform(),deadline,cancelled])}finally{clearTimeout(timer);flights.delete(c);init?.signal?.removeEventListener('abort',abort);c.abort();if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
 return Object.freeze({transport,close(){closed=true;for(const c of flights)c.abort();flights.clear()}})
}
