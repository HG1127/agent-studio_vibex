/** Same-origin metadata/control transport. No PB, submission, approval or provider routes. */
export class OriginalRunDetailTransportError extends Error {readonly code:string;constructor(code:string){super(code);this.code=code;this.name='OriginalRunDetailTransportError'}}
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const collection='/api/v2/(runs|workflow-runs|workflow-v2-runs|agent-autonomous-runs)'
export function originalRunDetailApiRoute(raw:string,method:string){
 if(!raw.startsWith('/__pg_native/api/')||/[#\\\u0000-\u0020]/u.test(raw)||raw.includes('%'))return false
 const url=new URL(raw,'https://original-ui.invalid'),p=url.pathname.slice('/__pg_native'.length)
 if(method==='GET'){
  if(new RegExp('^/api/v2/agent-feedback/'+uuid+'$').test(p))return !url.search
  if(p==='/api/native-auth/capabilities'||new RegExp('^'+collection+'(?:/'+uuid+')?$').test(p))return !url.search
  if(new RegExp('^/api/v2/(workflow-v2-runs|agent-autonomous-runs)/'+uuid+'/steps$').test(p)){
   const q=url.searchParams;return [...q.keys()].join(',')==='limit,after'&&q.get('limit')==='100'&&/^(?:|wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100})$/.test(q.get('after')??'!')&&url.search==='?'+q.toString()
  }
  return new RegExp('^/api/v2/workflow-v2-runs/'+uuid+'/outputs$').test(p)&&!url.search
 }
 return method==='POST'&&!url.search&&(new RegExp('^/api/v2/agent-autonomous-runs/'+uuid+'/(pause|resume|pause-confirm|resume-confirm|cancel)$').test(p)||new RegExp('^/api/v2/workflow-v2-runs/'+uuid+'/cancel$').test(p))
}
export function createOriginalRunDetailTransport(options:{employeeId:string;verifyEmployee:()=>Promise<string>;transport?:typeof fetch;timeoutMs?:number}){
 const send=options.transport??fetch,budget=options.timeoutMs??8000,employee=options.employeeId,flights=new Set<AbortController>();let closed=false
 if(!new RegExp('^'+uuid+'$').test(employee)||!Number.isSafeInteger(budget)||budget<1||budget>8000)throw new OriginalRunDetailTransportError('invalid_original_detail_transport')
 const denied=(code:string):never=>{throw new OriginalRunDetailTransportError(code)}
 async function identity(){if(closed||await options.verifyEmployee()!==employee||closed)return denied('original_detail_employee_changed')}
 const transport:typeof fetch=async(input,init)=>{
  const method=init?.method??'GET'
  if(typeof input!=='string'||!originalRunDetailApiRoute(input,method))return denied('original_detail_route_refused')
  const headers=new Headers(init?.headers)
  for(const [key] of headers)if(!['accept','content-type','x-agentstudio-request','x-agentstudio-expected-employee'].includes(key.toLowerCase()))return denied('original_detail_header_refused')
  if(headers.has('x-agentstudio-expected-employee')&&headers.get('x-agentstudio-expected-employee')!==employee)return denied('original_detail_employee_header_refused')
  const raw=init?.body
  if(raw!==undefined&&raw!==null&&(typeof raw!=='string'||new TextEncoder().encode(raw).length>131072))return denied('original_detail_body_refused')
  await identity()
  const c=new AbortController();flights.add(c);let timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,rejectAbort:(e:Error)=>void=()=>{}
  const failure=()=>new OriginalRunDetailTransportError(method==='GET'?'original_detail_read_unavailable':'original_detail_outcome_unknown')
  const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject}),abort=()=>{c.abort();rejectAbort(failure())}
  if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true})
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{c.abort();reject(failure())},budget)})
  const perform=async()=>{
   if(c.signal.aborted||closed)throw failure()
   const response=await send(input,{...init,method,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:c.signal,headers:{Accept:'application/json',...(method==='GET'?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee})}})
   if(!(response instanceof Response)||response.redirected||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))return denied('original_detail_response_refused')
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
   const length=response.headers.get('content-length')
   if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1048576))return denied('original_detail_response_refused')
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)return denied('original_detail_response_refused');chunks.push(part.value)}
   if(length!==null&&Number(length)!==size)return denied('original_detail_response_refused')
   const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.byteLength}
   try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return denied('original_detail_response_refused')}
   await identity();if(c.signal.aborted||closed)throw failure()
   return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers})
  }
  try{return await Promise.race([perform(),deadline,cancelled])}finally{clearTimeout(timer);flights.delete(c);init?.signal?.removeEventListener('abort',abort);c.abort();if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
 return Object.freeze({transport,close(){closed=true;for(const c of flights)c.abort();flights.clear()}})
}
