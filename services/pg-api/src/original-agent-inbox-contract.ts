import {HttpError} from './contracts.ts'
import {ownId,ownStamp,ownCount,ownStatuses} from './own-operations-contract.ts'

export type OriginalAgentKind='agent_single'|'agent_autonomous'
export type OriginalAgentMeta={id:string;spec_id:string;spec_name:string;engine_kind:OriginalAgentKind;status:typeof ownStatuses[number];created:string;updated:string}
export type OriginalAgentPendingQuery={page:number;perPage:number;status:'all'|'awaiting_input'|'awaiting_approval';q:string}
export type OriginalAgentWorkspace={protocol:'native_original_agent_workspace_v1';scope:'current_user';employee_id:string;as_of:string;agent_run_total:number;items:OriginalAgentMeta[];pending_count:number;pending_items:OriginalAgentMeta[]}
export type OriginalAgentPendingPage={protocol:'native_original_agent_pending_v1';scope:'current_user';employee_id:string;as_of:string;items:OriginalAgentMeta[];totalItems:number;totalPages:number;page:number;perPage:number;status:OriginalAgentPendingQuery['status'];q:string}
const unavailable=():never=>{throw new HttpError(409,'original_agent_inbox_unavailable')}
const invalid=():never=>{throw new HttpError(400,'invalid_original_agent_inbox_query')}
function record(raw:unknown,keys:readonly string[],optional=false):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return unavailable()
 const d=Object.getOwnPropertyDescriptors(raw),actual=Reflect.ownKeys(raw)
 if(actual.some(key=>typeof key!=='string'||!keys.includes(key)||!d[key]?.enumerable||!Object.hasOwn(d[key],'value'))||!optional&&actual.length!==keys.length)return unavailable()
 return raw as Record<string,unknown>
}
function text(raw:unknown,max:number):string{if(typeof raw!=='string'||raw.length>max||raw.includes('\0')||Array.from(raw).some(c=>c.length===1&&/[\ud800-\udfff]/u.test(c)))return unavailable();return raw}
function list(raw:unknown,max:number):unknown[]{
 if(!Array.isArray(raw)||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return unavailable()
 for(let i=0;i<raw.length;i++){const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return unavailable()}
 return raw
}
export function parseOriginalAgentMeta(raw:unknown):OriginalAgentMeta{
 const v=record(raw,['id','spec_id','spec_name','engine_kind','status','created','updated'])
 if(v.engine_kind!=='agent_single'&&v.engine_kind!=='agent_autonomous'||typeof v.status!=='string'||!ownStatuses.includes(v.status as typeof ownStatuses[number]))return unavailable()
 return{id:ownId(v.id),spec_id:ownId(v.spec_id),spec_name:text(v.spec_name,120),engine_kind:v.engine_kind,status:v.status as typeof ownStatuses[number],created:ownStamp(v.created),updated:ownStamp(v.updated)}
}
export function parseOriginalAgentPendingQuery(raw:unknown={}):OriginalAgentPendingQuery{
 let v:Record<string,unknown>;try{v=record(raw,['page','perPage','status','q'],true)}catch{return invalid()}
 const page=Object.hasOwn(v,'page')?v.page:1,perPage=Object.hasOwn(v,'perPage')?v.perPage:10,status=Object.hasOwn(v,'status')?v.status:'all',q=Object.hasOwn(v,'q')?v.q:''
 if(!Number.isSafeInteger(page)||Number(page)<1||Number(page)>10000||!Number.isSafeInteger(perPage)||Number(perPage)<1||Number(perPage)>30||
  !['all','awaiting_input','awaiting_approval'].includes(status as string)||typeof q!=='string'||q!==q.trim()||q.length>100||/[\u0000-\u001f\u007f]/u.test(q))return invalid()
 return{page:Number(page),perPage:Number(perPage),status:status as OriginalAgentPendingQuery['status'],q}
}
function metaRows(raw:unknown,max:number,pending=false):OriginalAgentMeta[]{
 const rows=list(raw,max).map(parseOriginalAgentMeta)
 if(new Set(rows.map(row=>row.id)).size!==rows.length||pending&&rows.some(row=>!['awaiting_input','awaiting_approval'].includes(row.status)))return unavailable()
 return rows
}
export function parseOriginalAgentWorkspace(raw:unknown):OriginalAgentWorkspace{
 const v=record(raw,['protocol','scope','employee_id','as_of','agent_run_total','items','pending_count','pending_items'])
 if(v.protocol!=='native_original_agent_workspace_v1'||v.scope!=='current_user')return unavailable()
 const total=ownCount(v.agent_run_total),pending=ownCount(v.pending_count),items=metaRows(v.items,12),pendingItems=metaRows(v.pending_items,20,true)
 if(pending>total||items.length!==Math.min(12,total)||pendingItems.length!==Math.min(20,pending))return unavailable()
 return{protocol:v.protocol,scope:v.scope,employee_id:ownId(v.employee_id),as_of:ownStamp(v.as_of),agent_run_total:total,items,pending_count:pending,pending_items:pendingItems}
}
export function parseOriginalAgentPendingPage(raw:unknown,query:OriginalAgentPendingQuery):OriginalAgentPendingPage{
 const q=parseOriginalAgentPendingQuery(query),v=record(raw,['protocol','scope','employee_id','as_of','items','totalItems','totalPages','page','perPage','status','q'])
 const total=ownCount(v.totalItems),pages=Math.max(1,Math.ceil(total/q.perPage)),items=metaRows(v.items,q.perPage,true)
 if(v.protocol!=='native_original_agent_pending_v1'||v.scope!=='current_user'||v.page!==q.page||v.perPage!==q.perPage||v.status!==q.status||v.q!==q.q||v.totalPages!==pages||
  items.length!==Math.min(q.perPage,Math.max(0,total-(q.page-1)*q.perPage))||q.status!=='all'&&items.some(item=>item.status!==q.status))return unavailable()
 return{protocol:v.protocol,scope:v.scope,employee_id:ownId(v.employee_id),as_of:ownStamp(v.as_of),items,totalItems:total,totalPages:pages,...q}
}
export function parseOriginalAgentInboxUrl(raw:unknown):{route:'workspace'}|{route:'pending';query:OriginalAgentPendingQuery}{
 if(typeof raw!=='string'||raw.includes('#')||!raw.startsWith('/')||raw.startsWith('//'))return invalid()
 const url=new URL(raw,'http://127.0.0.1')
 if(raw!==url.pathname+url.search)return invalid()
 const keys=[...url.searchParams.keys()];if(new Set(keys).size!==keys.length)return invalid()
 if(url.pathname==='/api/v2/original-ui/agent-workspace'){
  if(keys.some(key=>key!=='limit')||url.searchParams.has('limit')&&url.searchParams.get('limit')!=='12')return invalid()
  return{route:'workspace'}
 }
 if(url.pathname!=='/api/v2/original-ui/agent-pending'||keys.some(key=>!['page','perPage','status','q'].includes(key)))return invalid()
 const number=(key:string,fallback:number)=>{const value=url.searchParams.get(key);if(value===null)return fallback;if(!/^[1-9][0-9]{0,4}$/.test(value))return invalid();return Number(value)}
 return{route:'pending',query:parseOriginalAgentPendingQuery({page:number('page',1),perPage:number('perPage',10),status:url.searchParams.get('status')??'all',q:url.searchParams.get('q')??''})}
}
