import type {LocalDevice} from './localDevices'
import {parseLocalDeviceInventory} from './localDeviceInventory.ts'
export type ResourceInventoryHealth={http:boolean;market:boolean;devices:boolean}
export type ResourceInventory={owner:string;http:unknown[];market:unknown[];devices:LocalDevice[];known:ResourceInventoryHealth;devicesLoaded:boolean;errors:string[];checkedAt:number}
export const EMPTY_RESOURCE_INVENTORY:ResourceInventory={owner:'',http:[],market:[],devices:[],known:{http:false,market:false,devices:false},devicesLoaded:false,errors:[],checkedAt:0}
const sources=[['http','/api/tool-connections','HTTP 工具'],['market','/api/market/connections','MCP 连接'],['devices','/api/local-devices','本地电脑']] as const
/** GET-only catalog refresh. Failures are isolated by source and never imply an
 * empty account. Identity is checked on both sides of every refresh. */
export async function readResourceInventory({baseUrl,owner,ownerNow,headers,signal,request=fetch}:{baseUrl:string;owner:string;ownerNow:()=>string;headers:HeadersInit;signal:AbortSignal;request?:typeof fetch}):Promise<ResourceInventory>{
 if(!owner||ownerNow()!==owner)throw Error('resource_owner_changed')
 const results=await Promise.allSettled(sources.map(async([kind,route])=>{
  const response=await request(baseUrl+route,{method:'GET',headers,signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])})
  if(!response.ok)throw Error(response.status===401||response.status===412?'登录已过期，请重新登录':'暂时无法读取，稍后可重试')
  const data:unknown=await response.json()
  if(kind==='devices')return parseLocalDeviceInventory(data)
  if(!data||typeof data!=='object'||!('items' in data)||!Array.isArray(data.items)||data.items.length>1000)throw Error('连接清单格式不完整')
  return data.items as unknown[]
 }))
 signal.throwIfAborted()
 if(ownerNow()!==owner)throw Error('resource_owner_changed')
 const known:ResourceInventoryHealth={http:results[0].status==='fulfilled',market:results[1].status==='fulfilled',devices:results[2].status==='fulfilled'}
 const errors=results.flatMap((result,index)=>result.status==='rejected'?[sources[index][2]+'：'+(result.reason instanceof Error?result.reason.message:'读取失败')]:[])
 return {owner,http:results[0].status==='fulfilled'?results[0].value:[],market:results[1].status==='fulfilled'?results[1].value:[],devices:results[2].status==='fulfilled'?results[2].value as LocalDevice[]:[],known,devicesLoaded:known.devices,errors,checkedAt:Date.now()}
}
