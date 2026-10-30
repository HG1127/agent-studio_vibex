export const modelConnectionPaginationProtocol='native_model_connections_paging_v1' as const
export const modelConnectionPaginationMode='owner_cursor_v1' as const
export class ModelConnectionPaginationError extends Error{readonly status:number;readonly code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code}}
export const invalidModelPage=():never=>{throw new ModelConnectionPaginationError(503,'invalid_model_connection_page')}
export function modelPageObject(raw:unknown,keys:readonly string[]):Record<string,unknown>{if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)return invalidModelPage();const value:Record<string,unknown>={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))return invalidModelPage();value[key]=d.value}return value}
export function modelPageId(raw:unknown):string{if(typeof raw!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw))return invalidModelPage();return raw}
export function modelPageTotal(raw:unknown):number{if(!Number.isSafeInteger(raw)||Number(raw)<0)return invalidModelPage();return Number(raw)}
export function modelPageCursor(raw:unknown):string{if(typeof raw!=='string'||raw.length>2048||!/^mcpg1\.[A-Za-z0-9_-]{80,2000}$/.test(raw))return invalidModelPage();return raw}
export type ModelConnectionPage<T>={protocol:typeof modelConnectionPaginationProtocol;owner_user_id:string;snapshot_id:string;total:number;items:T[];next_cursor:string|null;complete:boolean}
export function parseModelConnectionPage<T>(raw:unknown,owner:string,limit:number,parseRow:(raw:unknown)=>T):ModelConnectionPage<T>{
 const v=modelPageObject(raw,['protocol','owner_user_id','snapshot_id','total','items','next_cursor','complete']);if(v.protocol!==modelConnectionPaginationProtocol||modelPageId(v.owner_user_id)!==modelPageId(owner)||typeof v.complete!=='boolean'||!Array.isArray(v.items)||Object.getPrototypeOf(v.items)!==Array.prototype||v.items.length>limit||Reflect.ownKeys(v.items).length!==v.items.length+1)return invalidModelPage()
 const rows:unknown[]=[];for(let i=0;i<v.items.length;i++){const d=Object.getOwnPropertyDescriptor(v.items,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return invalidModelPage();rows.push(d.value)}const cursor=v.next_cursor===null?null:modelPageCursor(v.next_cursor),total=modelPageTotal(v.total)
 if(v.complete!==(cursor===null)||!v.complete&&rows.length===0||rows.length>total)return invalidModelPage()
 return{protocol:modelConnectionPaginationProtocol,owner_user_id:owner,snapshot_id:modelPageId(v.snapshot_id),total,items:rows.map(parseRow),next_cursor:cursor,complete:v.complete}
}
