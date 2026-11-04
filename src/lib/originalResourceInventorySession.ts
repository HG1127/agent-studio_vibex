import {EMPTY_RESOURCE_INVENTORY,type ResourceInventory} from './resourceInventory.ts'
import type {OriginalToolConnectionSnapshot} from './originalToolConnectionPagination.ts'
import type {OriginalToolConnection} from '../../shared/original-tool-connections-contract.ts'
import type {OriginalMcpInventorySnapshot} from './originalMcpInventoryPagination.ts'
import type {LocalDevice} from './localDevices.ts'
export type OriginalResourceInventoryPorts={http:(signal:AbortSignal)=>Promise<OriginalToolConnectionSnapshot<OriginalToolConnection>>;market:()=>Promise<OriginalMcpInventorySnapshot>;devices:(signal:AbortSignal)=>Promise<LocalDevice[]>}
const empty=():ResourceInventory=>({...EMPTY_RESOURCE_INVENTORY,http:[],market:[],devices:[],known:{http:false,market:false,devices:false},errors:[]}),status=(e:unknown)=>e&&typeof e==='object'&&'status'in e?Number(e.status):0
export function createOriginalResourceInventorySession(options:{employeeId:string;verifyEmployee:()=>Promise<string>;ports:(current:()=>boolean,signal:AbortSignal)=>OriginalResourceInventoryPorts;now?:()=>number;budgetMs?:number}){
 const budget=options.budgetMs??30000;if(!Number.isSafeInteger(budget)||budget<1||budget>30000)throw Error('invalid_original_inventory_budget')
 let closed=false,visible=false,epoch=0,sequence=0,refreshing=false,problem='',authRequired=false,data=empty(),abort:AbortController|null=null,flight:Promise<void>|null=null;const listeners=new Set<()=>void>(),publish=()=>{if(!closed)for(const fn of listeners)fn()}
 function hide(auth=false){epoch++;sequence++;abort?.abort();abort=null;visible=false;refreshing=false;authRequired=auth;problem='当前员工身份尚未核实，未保留资源快照。';data=empty();publish()}
 async function identity(current:()=>boolean){try{const owner=await options.verifyEmployee();if(!current())return false;if(owner!==options.employeeId)throw Object.assign(Error('owner_changed'),{status:401});return true}catch(error){if(current())hide([401,403,412].includes(status(error)));return false}}
 const session={snapshot(){return{employeeId:options.employeeId,visible:visible&&!closed,closed,authRequired,problem,refreshing:visible&&refreshing,inventory:visible?data:empty()}},subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},hidePrivate:()=>hide(),
  refresh():Promise<void>{if(closed)return Promise.resolve();if(flight)return flight;const life=epoch,ticket=++sequence,controller=new AbortController();abort=controller;const owned=()=>!closed&&epoch===life&&sequence===ticket,current=()=>owned()&&!controller.signal.aborted
   flight=(async()=>{if(!await identity(current)||!current())return;visible=true;problem='';authRequired=false;refreshing=true;publish();let timer:ReturnType<typeof setTimeout>|undefined
    try{const p=options.ports(current,controller.signal),out=await Promise.race([Promise.allSettled([p.http(controller.signal),p.market(),p.devices(controller.signal)]),new Promise<null>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null)},budget)})]);if(!owned())return;if(!out){data={...empty(),owner:options.employeeId,checkedAt:(options.now??Date.now)(),errors:['连接清单读取超时；未将未知项当作空清单。']};return}if(!await identity(current)||!current())return;const bad=out.find(r=>r.status==='rejected'&&[401,403,412].includes(status(r.reason)));if(bad){hide(true);return}
     const [http,market,devices]=out,errors:string[]=[],httpRows=http.status==='fulfilled'?http.value.items.map(row=>({id:row.id,name:row.name,description:row.description,enabled:row.enabled,status:row.status,method:row.method,last_checked_at:row.last_checked_at??''})):[],marketRows=market.status==='fulfilled'?market.value.items.map(row=>({id:row.id,title:row.name,server_name:row.name,enabled:row.enabled,last_probe_status:row.status,last_checked_at:row.last_checked_at??'',tools:row.tools.map(tool=>({name:tool.name,description:tool.description})),tool_count:row.tool_count})):[]
     const knownHttp=http.status==='fulfilled'&&http.value.complete&&http.value.total===http.value.items.length,knownMarket=market.status==='fulfilled'&&market.value.complete&&market.value.total===market.value.items.length,knownDevices=devices.status==='fulfilled'
     if(!knownHttp)errors.push(http.status==='fulfilled'?'HTTP 清单覆盖范围未完整，不能据此断言完整登记数量。':'HTTP 清单暂未核实。')
     if(!knownMarket)errors.push(market.status==='fulfilled'?'MCP 清单覆盖范围未完整；没有把分页或部分数据当作完整登记数量。':'MCP 清单暂未核实。')
     if(!knownDevices)errors.push('本人设备未核实；未推断为没有电脑或当前离线。')
     data={owner:options.employeeId,http:httpRows,market:marketRows,devices:devices.status==='fulfilled'?devices.value:[],known:{http:knownHttp,market:knownMarket,devices:knownDevices},devicesLoaded:knownDevices,errors,checkedAt:(options.now??Date.now)()}
    }catch{if(owned())data={...empty(),owner:options.employeeId,checkedAt:(options.now??Date.now)(),errors:['当前资源清单未核实，请重新读取。']}}finally{clearTimeout(timer);if(owned()){refreshing=false;abort=null;publish()}}
   })().finally(()=>{flight=null});return flight
  },dispose(){closed=true;visible=false;epoch++;sequence++;abort?.abort();abort=null;data=empty();listeners.clear()}
 };return session
}
