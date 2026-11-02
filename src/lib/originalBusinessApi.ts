export class OriginalBusinessError extends Error{readonly status:number;readonly code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code}}
const id='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',base='/api/v2/original-ui/business'
export function originalBusinessRoute(raw:string){
 if(typeof raw!=='string'||!raw.startsWith('/')||raw.startsWith('//')||raw.includes('#'))throw new OriginalBusinessError(400,'invalid_original_business_route')
 const u=new URL(raw,'https://localhost'),path=u.pathname
 if(raw!==path+u.search)throw new OriginalBusinessError(400,'invalid_original_business_route')
 if(path==='/api/schedules')return base+'/collector-schedules'+u.search
 if(path==='/api/business/monitor-inbox')return'/api/v2/original-ui/monitor-inbox'+u.search
 if(new RegExp('^/api/business/monitor-events/'+id+'/read$').test(path))return'/api/v2/original-ui/monitor-events/'+path.split('/')[4]+'/read'+u.search
 if(path==='/api/business/cases'||new RegExp('^/api/business/cases/'+id+'(?:/(?:query|records|reviews|monitors|monitors/preview))?$').test(path)||new RegExp('^/api/business/monitors/'+id+'(?:/(?:definition|control|checks|events)(?:/'+id+')?)?$').test(path)||new RegExp('^/api/business/monitor-checks/'+id+'/(?:review-preview|review|discard)$').test(path))return base+path.slice('/api/business'.length)+u.search
 const result=new RegExp('^/api/agent-runs/('+id+')/tool-results/('+id+')$').exec(path)
 if(result)return base+'/runs/'+result[1]+'/results/'+result[2]+u.search
 throw new OriginalBusinessError(503,'original_business_contract_missing')
}
export function createOriginalBusinessApi(employee:string,transport:typeof fetch=fetch){
 if(!new RegExp('^'+id+'$').test(employee))throw new OriginalBusinessError(401,'original_business_session_required')
 return async function request<T>(route:string,body?:unknown,signal?:AbortSignal):Promise<T>{
  const target='/__pg_native'+originalBusinessRoute(route),controller=new AbortController()
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,timer:ReturnType<typeof setTimeout>|undefined,rejectCancelled:(error:Error)=>void=()=>{}
  const fail=()=>new OriginalBusinessError(503,'original_business_unavailable'),cancelled=new Promise<never>((_,reject)=>{rejectCancelled=reject}),cancel=()=>{controller.abort();rejectCancelled(fail())}
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true})
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail())},8000)})
  const perform=async()=>{
   const response=await transport(target,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':employee,...(body===undefined?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
   if(!(response instanceof Response)||response.redirected||!response.body||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))throw fail()
   reader=response.body.getReader()
   const declared=response.headers.get('content-length')
   if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>1048576))throw fail()
   const chunks:Uint8Array[]=[];let length=0
   while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>1048576)throw fail();chunks.push(next.value)}
   if(declared!==null&&Number(declared)!==length)throw fail()
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
   let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw fail()}
   if(!response.ok)throw new OriginalBusinessError(response.status,response.status===409&&value&&typeof value==='object'&&'error'in value&&value.error==='employee_session_changed'?'employee_session_changed':'original_business_request_rejected')
   if(!value||typeof value!=='object')throw fail()
   return value as T
  }
  try{return await Promise.race([perform(),timeout,cancelled])}
  catch(error){if(error instanceof OriginalBusinessError)throw error;throw fail()}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
}
