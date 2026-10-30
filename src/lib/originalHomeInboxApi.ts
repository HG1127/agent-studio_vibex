export type OriginalAgentMeta={id:string;spec_id:string;spec_name:string;engine_kind:'agent_single'|'agent_autonomous';status:string;created:string;updated:string}
export type OriginalPendingQuery={page:number;perPage:number;status:'all'|'awaiting_input'|'awaiting_approval';q:string}
export type OriginalPendingInput=Omit<OriginalPendingQuery,'status'>&{status:string}
export type OriginalWorkspace={items:OriginalAgentMeta[];pending_items:OriginalAgentMeta[];pending_count:number;agent_run_total:number}
export type OriginalPendingPage={items:OriginalAgentMeta[];totalItems:number;totalPages:number;page:number;perPage:number;status:OriginalPendingQuery['status'];q:string}
export type OriginalMonitorCursor={after_ms:number;after_id:string}
export type OriginalMonitorItem={item_id:string;monitor_id:string;case_id:string;check_id:string;kind:string;title:string;created_ms:number}
export type OriginalMonitorPage={items:OriginalMonitorItem[];has_more:boolean;next_cursor:OriginalMonitorCursor|null}
export class OriginalHomeInboxError extends Error{
 readonly status:number;readonly code:string
 constructor(status:number,code:string){super(code);this.status=status;this.code=code;this.name='OriginalHomeInboxError'}
}
const refuse=():never=>{throw new OriginalHomeInboxError(0,'invalid_original_home_inbox_response')}
const id=(value:unknown):string=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))return refuse();return value}
const count=(value:unknown):number=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||Object.is(value,-0))return refuse();return value}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return refuse()
 const fields=Reflect.ownKeys(value),d=Object.getOwnPropertyDescriptors(value)
 if(fields.length!==keys.length||fields.some(key=>typeof key!=='string'||!keys.includes(key)||!d[key]?.enumerable||!Object.hasOwn(d[key],'value')))return refuse()
 return value as Record<string,unknown>
}
function array(value:unknown,max:number):unknown[]{
 if(!Array.isArray(value)||value.length>max||Reflect.ownKeys(value).length!==value.length+1)return refuse()
 for(let i=0;i<value.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(i))??{},'value'))return refuse()
 return value
}
function stamp(value:unknown):string{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)return refuse();return value}
function text(value:unknown,max:number):string{if(typeof value!=='string'||value.length>max||value.includes('\0')||Array.from(value).some(c=>c.length===1&&/[\ud800-\udfff]/u.test(c)))return refuse();return value}
function meta(value:unknown,pending=false):OriginalAgentMeta{
 const row=object(value,['id','spec_id','spec_name','engine_kind','status','created','updated'])
 const statuses=pending?['awaiting_input','awaiting_approval']:['queued','running','awaiting_approval','awaiting_input','paused','succeeded','failed','cancelled']
 if(!['agent_single','agent_autonomous'].includes(row.engine_kind as string)||!statuses.includes(row.status as string))return refuse()
 return{id:id(row.id),spec_id:id(row.spec_id),spec_name:text(row.spec_name,120),engine_kind:row.engine_kind as OriginalAgentMeta['engine_kind'],status:row.status as string,created:stamp(row.created),updated:stamp(row.updated)}
}
function metas(value:unknown,max:number,pending=false){const rows=array(value,max).map(item=>meta(item,pending));if(new Set(rows.map(row=>row.id)).size!==rows.length)return refuse();return rows}
export function validateOriginalPendingQuery(query:OriginalPendingInput):OriginalPendingQuery{
 if(!query||!Number.isSafeInteger(query.page)||query.page<1||query.page>10000||!Number.isSafeInteger(query.perPage)||query.perPage<1||query.perPage>30||
  !['all','awaiting_input','awaiting_approval'].includes(query.status)||typeof query.q!=='string'||query.q!==query.q.trim()||query.q.length>100||/[\u0000-\u001f\u007f]/u.test(query.q))return refuse()
 return{page:query.page,perPage:query.perPage,status:query.status as OriginalPendingQuery['status'],q:query.q}
}
export function createOriginalHomeInboxApi(employeeId:string,transport:typeof fetch=fetch,rootPath='/__pg_native'){
 const employee=id(employeeId)
 if(rootPath!=='/__pg_native')return refuse()
 async function request(route:string,signal?:AbortSignal,body?:Record<string,unknown>):Promise<unknown>{
   const controller=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,timer:ReturnType<typeof setTimeout>|undefined,rejectCancellation:(error:Error)=>void=()=>{}
   const failure=()=>new OriginalHomeInboxError(0,'original_home_inbox_unavailable')
   const cancelled=new Promise<never>((_,reject)=>{rejectCancellation=reject})
   const cancel=()=>{controller.abort();rejectCancellation(failure())}
   if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true})
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure())},8000)})
   const perform=async()=>{
    const response=await transport(rootPath+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,
     headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1','X-AgentStudio-Expected-Employee':employee})},...(body===undefined?{}:{body:JSON.stringify(body)})})
    if(!(response instanceof Response)||response.redirected||!response.body)return refuse()
    reader=response.body.getReader()
    if(!response.ok)throw new OriginalHomeInboxError(response.status,'original_home_inbox_unavailable')
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))return refuse()
    const declared=response.headers.get('content-length')
    if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>1048576))return refuse()
    const chunks:Uint8Array[]=[];let size=0
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1048576)return refuse();chunks.push(chunk.value)}
    if(declared!==null&&Number(declared)!==size)return refuse()
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return refuse()}
   }
   try{return await Promise.race([perform(),deadline,cancelled])}catch(error){if(error instanceof OriginalHomeInboxError)throw error;throw failure()}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}}
 }
 function header(raw:unknown,keys:readonly string[],protocol:string){const data=object(raw,keys);if(data.protocol!==protocol||data.scope!=='current_user'||data.employee_id!==employee)return refuse();stamp(data.as_of);return data}
 return{
  async workspace(signal?:AbortSignal):Promise<OriginalWorkspace>{
   const data=header(await request('/api/v2/original-ui/agent-workspace?limit=12',signal),['protocol','scope','employee_id','as_of','agent_run_total','items','pending_count','pending_items'],'native_original_agent_workspace_v1')
   const total=count(data.agent_run_total),pending=count(data.pending_count),items=metas(data.items,12),snippets=metas(data.pending_items,20,true)
   if(pending>total||items.length!==Math.min(12,total)||snippets.length!==Math.min(20,pending))return refuse()
   return{agent_run_total:total,items,pending_count:pending,pending_items:snippets}
  },
  async pending(query:OriginalPendingInput,signal?:AbortSignal):Promise<OriginalPendingPage>{
   const q=validateOriginalPendingQuery(query),params=new URLSearchParams({page:String(q.page),perPage:String(q.perPage),status:q.status,...(q.q?{q:q.q}:{})})
   const data=header(await request('/api/v2/original-ui/agent-pending?'+params,signal),['protocol','scope','employee_id','as_of','items','totalItems','totalPages','page','perPage','status','q'],'native_original_agent_pending_v1')
   const total=count(data.totalItems),pages=Math.max(1,Math.ceil(total/q.perPage)),items=metas(data.items,q.perPage,true)
   if(data.totalPages!==pages||data.page!==q.page||data.perPage!==q.perPage||data.status!==q.status||data.q!==q.q||items.length!==Math.min(q.perPage,Math.max(0,total-(q.page-1)*q.perPage))||q.status!=='all'&&items.some(row=>row.status!==q.status))return refuse()
   return{items,totalItems:total,totalPages:pages,...q}
  },
  // Proposed monitor protocol only. There is no corresponding PG ledger or
  // handler yet: its real Native refusal must reach the unchanged error UI.
  async monitors(cursor:OriginalMonitorCursor|null,signal?:AbortSignal):Promise<OriginalMonitorPage>{
   const params=new URLSearchParams({limit:'10'})
   if(cursor){if(count(cursor.after_ms)<1||!/^(check|event):[0-9a-f-]{36}$/.test(cursor.after_id))return refuse();params.set('after_ms',String(cursor.after_ms));params.set('after_id',cursor.after_id)}
   const data=header(await request('/api/v2/original-ui/monitor-inbox?'+params,signal),['protocol','scope','employee_id','as_of','items','has_more','next_cursor'],'native_original_monitor_inbox_v1')
   if(typeof data.has_more!=='boolean')return refuse()
   const items=array(data.items,10).map(raw=>{
    const item=object(raw,['item_id','monitor_id','case_id','check_id','kind','title','created_ms'])
    if(typeof item.item_id!=='string'||!/^(check|event):[0-9a-f-]{36}$/.test(item.item_id))return refuse();id(item.item_id.slice(6))
    return{item_id:item.item_id,monitor_id:id(item.monitor_id),case_id:id(item.case_id),check_id:id(item.check_id),kind:text(item.kind,80),title:text(item.title,400),created_ms:count(item.created_ms)}
   })
   if(new Set(items.map(item=>item.item_id)).size!==items.length)return refuse()
   let next:OriginalMonitorCursor|null=null
   if(data.has_more){const value=object(data.next_cursor,['after_ms','after_id']),last=items.at(-1);if(items.length!==10||value.after_ms!==last?.created_ms||value.after_id!==last?.item_id)return refuse();next={after_ms:count(value.after_ms),after_id:value.after_id as string}}
   else if(data.next_cursor!==null)return refuse()
   return{items,has_more:data.has_more,next_cursor:next}
  },
  async markMonitorRead(eventId:string):Promise<void>{const selected=id(eventId),value=object(await request('/api/v2/original-ui/monitor-events/'+selected+'/read',undefined,{}),['ok']);if(value.ok!==true)return refuse()},
 }
}
