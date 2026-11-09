import {HttpError} from './contracts.ts'
import {ownId,ownStamp} from './own-operations-contract.ts'
export type MonitorCursor={after_ms:number;after_id:string}
export type MonitorQuery={limit:10;cursor:MonitorCursor|null}
export type MonitorItem={item_id:string;monitor_id:string;case_id:string;check_id:string;kind:'source_unavailable';title:'监测来源不可用';created_ms:number}
export type MonitorPage={protocol:'native_original_monitor_inbox_v1';scope:'current_user';employee_id:string;as_of:string;items:MonitorItem[];has_more:boolean;next_cursor:MonitorCursor|null}
const invalid=():never=>{throw new HttpError(400,'invalid_native_monitor_query')},unavailable=():never=>{throw new HttpError(503,'native_monitor_inbox_unavailable')}
const ms=(v:unknown):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||Object.is(v,-0))return unavailable();return v}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)return unavailable();const d=Object.getOwnPropertyDescriptors(v);if(keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))return unavailable();return v as Record<string,unknown>}
export function monitorItemId(v:unknown):string{if(typeof v!=='string'||!/^(check|event):[0-9a-f-]{36}$/.test(v))return unavailable();ownId(v.slice(6));return v}
export function parseMonitorQueryUrl(raw:unknown):MonitorQuery{
 if(typeof raw!=='string'||raw.includes('#')||!raw.startsWith('/')||raw.startsWith('//'))return invalid()
 const u=new URL(raw,'http://127.0.0.1'),keys=[...u.searchParams.keys()]
 if(raw!==u.pathname+u.search||u.pathname!=='/api/v2/original-ui/monitor-inbox'||keys.some(k=>!['limit','after_ms','after_id'].includes(k))||new Set(keys).size!==keys.length||u.searchParams.has('limit')&&u.searchParams.get('limit')!=='10')return invalid()
 const stamp=u.searchParams.get('after_ms'),item=u.searchParams.get('after_id');if(stamp===null&&item===null)return{limit:10,cursor:null}
 try{if(stamp===null||item===null||!/^[1-9][0-9]{0,15}$/.test(stamp))return invalid();return{limit:10,cursor:{after_ms:ms(Number(stamp)),after_id:monitorItemId(item)}}}catch{return invalid()}
}
function cursorCompare(a:MonitorCursor,b:MonitorCursor):number{return a.after_ms===b.after_ms?(a.after_id===b.after_id?0:a.after_id<b.after_id?-1:1):a.after_ms<b.after_ms?-1:1}
export function parseMonitorQuery(raw:unknown):MonitorQuery{
 try{const v=object(raw,['limit','cursor']);if(v.limit!==10)return invalid();if(v.cursor===null)return{limit:10,cursor:null};const c=object(v.cursor,['after_ms','after_id']);return{limit:10,cursor:{after_ms:ms(c.after_ms),after_id:monitorItemId(c.after_id)}}}catch{return invalid()}
}
export function parseMonitorPage(raw:unknown,query:MonitorQuery):MonitorPage{
 query=parseMonitorQuery(query)
 const v=object(raw,['protocol','scope','employee_id','as_of','items','has_more','next_cursor'])
 if(v.protocol!=='native_original_monitor_inbox_v1'||v.scope!=='current_user'||typeof v.has_more!=='boolean'||!Array.isArray(v.items)||v.items.length>10||Reflect.ownKeys(v.items).length!==v.items.length+1)return unavailable()
 const items:MonitorItem[]=[];let previous=query.cursor
 for(let i=0;i<v.items.length;i++){
  const d=Object.getOwnPropertyDescriptor(v.items,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return unavailable()
  const r=object(d.value,['item_id','monitor_id','case_id','check_id','kind','title','created_ms'])
  if(r.kind!=='source_unavailable'||r.title!=='监测来源不可用')return unavailable()
  const item:MonitorItem={item_id:monitorItemId(r.item_id),monitor_id:ownId(r.monitor_id),case_id:ownId(r.case_id),check_id:ownId(r.check_id),kind:r.kind,title:r.title,created_ms:ms(r.created_ms)}
  if(item.item_id.startsWith('check:')&&item.item_id.slice(6)!==item.check_id)return unavailable()
  const position={after_ms:item.created_ms,after_id:item.item_id};if(previous&&cursorCompare(position,previous)>=0)return unavailable();previous=position;items.push(item)
 }
 if(new Set(items.map(i=>i.item_id)).size!==items.length)return unavailable()
 let next:MonitorCursor|null=null
 if(v.has_more){if(items.length!==10||!previous)return unavailable();const c=object(v.next_cursor,['after_ms','after_id']);if(c.after_ms!==previous.after_ms||c.after_id!==previous.after_id)return unavailable();next=previous}
 else if(v.next_cursor!==null)return unavailable()
 return{protocol:v.protocol,scope:v.scope,employee_id:ownId(v.employee_id),as_of:ownStamp(v.as_of),items,has_more:v.has_more,next_cursor:next}
}
