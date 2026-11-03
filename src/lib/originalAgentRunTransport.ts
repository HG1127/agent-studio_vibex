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
 if(new RegExp('^/api/v2/original-ui/agent-quality/'+uuid+'(?:/receipts/'+uuid+')?$').test(p)){
  const receipt=p.includes('/receipts/')
  if(method==='POST')return !receipt&&!url.search
  if(method!=='GET')return false
  if(!receipt)return !url.search
  const keys=['request_sha256','expected_spec_revision','expected_source_sha256','expected_checks_sha256']
  return url.search==='?'+q.toString()&&[...q.keys()].join(',')===keys.join(',')&&keys.every(k=>q.getAll(k).length===1)&&/^[a-f0-9]{64}$/.test(q.get('request_sha256')??'')&&/^[a-f0-9]{64}$/.test(q.get('expected_source_sha256')??'')&&/^[1-9][0-9]{0,15}$/.test(q.get('expected_spec_revision')??'')&&Number.isSafeInteger(Number(q.get('expected_spec_revision')))&&Number(q.get('expected_spec_revision'))<Number.MAX_SAFE_INTEGER-1&&(q.get('expected_checks_sha256')==='null'||/^[a-f0-9]{64}$/.test(q.get('expected_checks_sha256')??''))
 }

 if(method==='GET'){
  if(p==='/api/v2/agent-autonomous-runs/history')return url.search==='?'+q.toString()&&[...q.keys()].join(',')==='spec_id,anchor_run_id,page'&&[...q.keys()].every(key=>q.getAll(key).length===1)&&new RegExp('^'+uuid+'$').test(q.get('spec_id')??'')&&new RegExp('^'+uuid+'$').test(q.get('anchor_run_id')??'')&&/^[1-9][0-9]{0,15}$/.test(q.get('page')??'')&&Number.isSafeInteger(Number(q.get('page')))&&Number(q.get('page'))<=Math.floor(Number.MAX_SAFE_INTEGER/25)
  if(new RegExp('^/api/v2/agent-autonomous-runs/'+uuid+'/steps$').test(p))return url.search==='?'+q.toString()&&[...q.keys()].join(',')==='limit,after'&&q.getAll('limit').length===1&&q.getAll('after').length===1&&q.get('limit')==='100'&&/^(?:|wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100})$/.test(q.get('after')??'!')
  if(p==='/api/v2/agent-optimizations'){const keys=[...q.keys()];return url.search==='?'+q.toString()&&(keys.join(',')==='spec_id'||keys.join(',')==='spec_id,request_id')&&keys.every(key=>q.getAll(key).length===1)&&new RegExp('^'+uuid+'$').test(q.get('spec_id')??'')&&(!q.has('request_id')||new RegExp('^'+uuid+'$').test(q.get('request_id')??''))}
  if(p==='/api/v2/original-ui/role-skills/meta')return !url.search
  if(p==='/api/v2/original-ui/role-skills/detail')return url.search==='?'+q.toString()&&[...q.keys()].join(',')==='id,version'&&q.getAll('id').length===1&&q.getAll('version').length===1&&/^[A-Za-z0-9]{15}$/.test(q.get('id')??'')&&/^(?:[1-9]|[1-9][0-9]|100)$/.test(q.get('version')??'')
  if(p==='/api/v2/local-devices')return !url.search
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
 const send=options.transport??fetch,budget=options.timeoutMs??8000,employee=options.employeeId,flights=new Set<()=>void>();let closed=false
 if(!new RegExp('^'+uuid+'$').test(employee)||!Number.isSafeInteger(budget)||budget<1||budget>8000)throw new OriginalAgentRunTransportError('invalid_original_run_transport')
 const denied=(code:string):never=>{throw new OriginalAgentRunTransportError(code)}
 async function identity(){if(closed||await options.verifyEmployee()!==employee||closed)return denied('original_run_employee_changed')}
 const request=async(input:RequestInfo|URL,init?:RequestInit,scope?:()=>boolean):Promise<Response>=>{
  const current=()=>{try{return !closed&&(scope===undefined||scope()===true)}catch{return false}}
  const method=init?.method??'GET'
  if(typeof input!=='string'||!originalAgentRunRoute(input,method))return denied('original_run_route_refused')
  const headers=new Headers(init?.headers)
  for(const [key] of headers)if(!['accept','content-type','x-agentstudio-request','x-agentstudio-expected-employee','x-agentstudio-original-quality'].includes(key.toLowerCase()))return denied('original_run_header_refused')
  if(headers.has('x-agentstudio-expected-employee')&&headers.get('x-agentstudio-expected-employee')!==employee)return denied('original_run_employee_header_refused')
  const quality=input.startsWith('/__pg_native/api/v2/original-ui/agent-quality/')
  if(quality&&headers.get('x-agentstudio-original-quality')!=='native_original_agent_quality_v1'||!quality&&headers.has('x-agentstudio-original-quality'))return denied('original_quality_protocol_header_refused')
  const raw=init?.body
  if(raw!==undefined&&raw!==null&&(typeof raw!=='string'||new TextEncoder().encode(raw).length>131072))return denied('original_run_body_refused')
  if(quality&&(!scope||!current()))return denied('original_quality_scope_required')
  await identity();if(!current())return denied('original_run_scope_changed')
  const c=new AbortController();let complete=false,retired=false,responseBody:ReadableStream<Uint8Array>|null=null,timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,rejectAbort:(e:Error)=>void=()=>{}
  const failure=()=>new OriginalAgentRunTransportError(method==='GET'?'original_run_read_unavailable':'original_run_outcome_unknown')
  const cancelUnreadBody=()=>{void responseBody?.cancel().catch(()=>{})}
  const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject}),abort=()=>{retired=true;if(!complete)c.abort();rejectAbort(failure())}
  flights.add(abort)
  if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true})
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{retired=true;if(!complete)c.abort();reject(failure())},budget)})
  const perform=async()=>{
   if(retired||c.signal.aborted||!current())throw failure()
   const response=await send(input,{...init,method,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:c.signal,headers:{Accept:'application/json',...(quality?{'X-AgentStudio-Original-Quality':'native_original_agent_quality_v1'}:{}),...(method==='GET'?(headers.has('x-agentstudio-expected-employee')?{'X-AgentStudio-Expected-Employee':employee}:{}):{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee})}})
   if(response instanceof Response){responseBody=response.body;if(retired||c.signal.aborted||!current()){void response.body?.cancel().catch(()=>{});throw failure()}}
   if(!(response instanceof Response)||response.redirected||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))return denied('original_run_response_refused')
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   const length=response.headers.get('content-length')
   if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1048576))return denied('original_run_response_refused')
   while(true){const part=await reader.read();if(retired||c.signal.aborted||!current())throw failure();if(part.done)break;size+=part.value.byteLength;if(size>1048576)return denied('original_run_response_refused');chunks.push(part.value)}
   if(length!==null&&Number(length)!==size)return denied('original_run_response_refused');complete=true
   const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.byteLength}
   try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return denied('original_run_response_refused')}
   await identity();if(retired||c.signal.aborted||!current())throw failure()
   return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers})
  }
  try{return await Promise.race([perform(),deadline,cancelled])}finally{retired=true;clearTimeout(timer);flights.delete(abort);init?.signal?.removeEventListener('abort',abort);if(!complete){c.abort();if(reader)void reader.cancel().catch(()=>{});else cancelUnreadBody()}try{reader?.releaseLock()}catch{}}
 }
 const transport:typeof fetch=(input,init)=>request(input,init)
 return Object.freeze({transport,forScope(scope:()=>boolean):typeof fetch{if(typeof scope!=='function')throw new OriginalAgentRunTransportError('original_run_scope_required');return(input,init)=>request(input,init,scope)},close(){closed=true;for(const cancel of flights)cancel();flights.clear()}})
}
