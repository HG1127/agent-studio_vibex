export const toolConnectionPaginationProtocol='native_tool_connections_paging_v1' as const
export const toolConnectionPaginationMode='owner_cursor_v1' as const
export const toolConnectionPaginationHeader='X-AgentStudio-Tool-Pagination' as const
export class ToolConnectionPaginationError extends Error{readonly status:number;readonly code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code}}
export const invalidToolPage=():never=>{throw new ToolConnectionPaginationError(503,'invalid_tool_connection_page')}
export function toolPageObject(raw:unknown,keys:readonly string[]):Record<string,unknown>{if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)return invalidToolPage();const value:Record<string,unknown>={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))return invalidToolPage();value[key]=d.value}return value}
export function toolPageId(raw:unknown):string{if(typeof raw!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw))return invalidToolPage();return raw}
export function toolPageTotal(raw:unknown):number{if(!Number.isSafeInteger(raw)||Number(raw)<0)return invalidToolPage();return Number(raw)}
export function toolPageTime(raw:unknown):string{if(typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(raw)||Number(raw.slice(0,4))<1970||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString()!==raw.slice(0,23)+'Z')return invalidToolPage();return raw}
export type ToolPageOrder={id:string;updated_at:string}
export function compareToolPageOrder(a:ToolPageOrder,b:ToolPageOrder):number{const x=toolPageTime(a.updated_at),y=toolPageTime(b.updated_at),i=toolPageId(a.id),j=toolPageId(b.id);return x>y?-1:x<y?1:i<j?-1:i>j?1:0}
export function toolPageCursor(raw:unknown):string{if(typeof raw!=='string'||raw.length>2048||!/^tcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(raw))return invalidToolPage();return raw}
export type ToolConnectionPage<T>={protocol:typeof toolConnectionPaginationProtocol;owner_user_id:string;snapshot_id:string;total:number;items:T[];next_cursor:string|null;complete:boolean}
export function parseToolConnectionPage<T>(raw:unknown,owner:string,limit:number,parseRow:(raw:unknown)=>T):ToolConnectionPage<T>{
 const v=toolPageObject(raw,['protocol','owner_user_id','snapshot_id','total','items','next_cursor','complete']);if(v.protocol!==toolConnectionPaginationProtocol||toolPageId(v.owner_user_id)!==toolPageId(owner)||typeof v.complete!=='boolean'||!Array.isArray(v.items)||Object.getPrototypeOf(v.items)!==Array.prototype||v.items.length>limit||Reflect.ownKeys(v.items).length!==v.items.length+1)return invalidToolPage()
 const rows:unknown[]=[];for(let i=0;i<v.items.length;i++){const d=Object.getOwnPropertyDescriptor(v.items,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return invalidToolPage();rows.push(d.value)}const cursor=v.next_cursor===null?null:toolPageCursor(v.next_cursor),total=toolPageTotal(v.total)
 if(v.complete!==(cursor===null)||!v.complete&&rows.length===0||rows.length>total)return invalidToolPage()
 return{protocol:toolConnectionPaginationProtocol,owner_user_id:owner,snapshot_id:toolPageId(v.snapshot_id),total,items:rows.map(parseRow),next_cursor:cursor,complete:v.complete}
}
