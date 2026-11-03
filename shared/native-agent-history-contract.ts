/** Native owned metadata history. No PB authority or provider work. */
export const nativeAgentHistoryProtocol='native_owned_agent_history_v1' as const
export const nativeAgentHistoryPageSize=25 as const
export type NativeAgentHistoryStatus='queued'|'running'|'awaiting_approval'|'awaiting_input'|'paused'|'succeeded'|'failed'|'cancelled'
export type NativeAgentHistoryChoice={id:string;spec_id:string;status:NativeAgentHistoryStatus;created:string}
export type NativeAgentHistoryPage={protocol:typeof nativeAgentHistoryProtocol;owner_user_id:string;spec_id:string;anchor_run_id:string;anchor_created_at:string;anchor_updated_at:string;page:number;perPage:25;totalItems:number;totalPages:number;items:NativeAgentHistoryChoice[]}
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const statuses=new Set(['queued','running','awaiting_approval','awaiting_input','paused','succeeded','failed','cancelled'])
const bad=():never=>{throw Error('invalid_native_owned_agent_history')}
export function nativeAgentHistoryId(value:unknown):string{return typeof value==='string'&&idPattern.test(value)?value:bad()}
export function nativeAgentHistoryPageNumber(value:unknown):number{return Number.isSafeInteger(value)&&Number(value)>=1&&Number(value)<=Math.floor(Number.MAX_SAFE_INTEGER/nativeAgentHistoryPageSize)?Number(value):bad()}
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return bad();const descriptors=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key],'value')))return bad();return value as Record<string,unknown>}
function date(value:unknown):string{return typeof value==='string'&&value.length<=80&&Number.isFinite(Date.parse(value))?value:bad()}
export function nativeAgentHistoryPage(raw:unknown,expected:{specId:string;anchorRunId:string;page:number}):NativeAgentHistoryPage{
 const spec=nativeAgentHistoryId(expected.specId),anchor=nativeAgentHistoryId(expected.anchorRunId),page=nativeAgentHistoryPageNumber(expected.page),v=object(raw,['protocol','owner_user_id','spec_id','anchor_run_id','anchor_created_at','anchor_updated_at','page','perPage','totalItems','totalPages','items'])
 nativeAgentHistoryId(v.owner_user_id)
 if(v.protocol!==nativeAgentHistoryProtocol||v.spec_id!==spec||v.anchor_run_id!==anchor||v.page!==page||v.perPage!==nativeAgentHistoryPageSize||!Number.isSafeInteger(v.totalItems)||Number(v.totalItems)<0||!Number.isSafeInteger(v.totalPages)||v.totalPages!==Math.max(1,Math.ceil(Number(v.totalItems)/nativeAgentHistoryPageSize))||!Array.isArray(v.items)||v.items.length>nativeAgentHistoryPageSize)return bad()
 const created=date(v.anchor_created_at);date(v.anchor_updated_at)
 const seen=new Set<string>();let previous=Infinity
 for(const rawRow of v.items){const row=object(rawRow,['id','spec_id','status','created']),id=nativeAgentHistoryId(row.id),time=Date.parse(date(row.created));if(row.spec_id!==spec||id===anchor||seen.has(id)||typeof row.status!=='string'||!statuses.has(row.status)||time>Date.parse(created)||time>previous)return bad();seen.add(id);previous=time}
 const offset=(page-1)*nativeAgentHistoryPageSize,wanted=Math.max(0,Math.min(nativeAgentHistoryPageSize,Number(v.totalItems)-offset));if(v.items.length!==wanted)return bad()
 return structuredClone(v) as NativeAgentHistoryPage
}
