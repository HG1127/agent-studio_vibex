import type {ExecutionCapability} from './executionCapabilities'
import type {ResourceInventoryHealth} from './resourceInventory'

export type ResourceIntent='documents'|'web'|'local'|'services'|'method'|'model'
export const RESOURCE_INTENTS:readonly {id:ResourceIntent;title:string;description:string}[]=[
 {id:'documents',title:'分析文件与资料',description:'上传文档、表格，查阅授权知识库'},
 {id:'web',title:'读取或操作网页',description:'优先复用已有浏览器或在线工具'},
 {id:'local',title:'使用自己的电脑',description:'访问本机文件夹或独立 Chrome'},
 {id:'services',title:'接入业务服务',description:'查找已连接服务或授权市场插件'},
 {id:'method',title:'使用分析方法',description:'导入并审核 Skill，再分配给角色'},
 {id:'model',title:'连接 AI 模型',description:'选择服务商并验证模型连接'},
]
export function resourceIntent(value:unknown):ResourceIntent|null{return RESOURCE_INTENTS.some(x=>x.id===value)?value as ResourceIntent:null}
export function guideResourceAccess(intent:ResourceIntent,capabilities:readonly ExecutionCapability[],onlineDevices:number,inventoryKnown:boolean|ResourceInventoryHealth){
 const known=typeof inventoryKnown==='boolean'?{http:inventoryKnown,market:inventoryKnown,devices:inventoryKnown}:inventoryKnown
 const connectionsKnown=known.http&&known.market
 const base={needsLocal:false,reason:'',routes:[] as {label:string;to:string}[],reuseCount:0}
 if(intent==='documents')return {...base,reason:'仅分析资料无需安装电脑连接器。上传到你有权访问的知识库，再回到 Agent 选择资料范围。',routes:[{label:'选择或上传资料',to:'/knowledge-bases'}]}
 if(intent==='method')return {...base,reason:'Skill 是方法与规则，不是电脑执行权限。选择已有方法或导入审核，不需要安装本机组件。',routes:[{label:'选择已有方法',to:'/skills'}]}
 if(intent==='model')return {...base,reason:'优先使用已有有效模型连接；密钥仅在必要时填写，不在各个 Agent 中重复录入。',routes:[{label:'选择或连接模型',to:'/model-connections'}]}
 const eligible=capabilities.filter(x=>(x.source==='http'?known.http:known.market)&&['tested','discovered'].includes(x.state)&&(intent==='web'?x.kind==='browser':x.kind==='api'))
 if(intent==='local')return {...base,needsLocal:known.devices&&onlineDevices===0,reason:!known.devices?'设备清单尚未完整核实，请先刷新，避免重复连接。':onlineDevices>0?'已经有在线设备，先选用已有连接，不重新安装或配对。':'只有操作本机时才需要连接器。先下载安装同版本便携包，再本机确认账号和目录。',reuseCount:known.devices?onlineDevices:0,routes:[{label:known.devices&&onlineDevices>0?'使用已连接电脑':'查看设备与恢复连接',to:'/tool-hub?view=devices'}]}
 return {...base,reason:!connectionsKnown?'部分连接状态尚未核实。已读到的资源仍可查看；未读取的部分不会当作没有连接。':eligible.length?'发现已有测试／工具发现记录，先复用并核对权限，不必重复填写地址和密钥。':'先查找托管插件或远程服务；只有必须使用本机文件或本机会话时，才需要连接电脑。',reuseCount:eligible.length,routes:[...eligible.slice(0,3).map(x=>({label:'核对已有连接：'+x.title,to:x.source==='http'?'/tool-connections'+(/^[A-Za-z0-9]{15}$/.test(x.id)?'?connection='+x.id:''):'/plugin-market'})),{label:intent==='web'?'查找网页与浏览器插件':'查找业务服务插件',to:intent==='web'?'/plugin-market?tool=browser':'/plugin-market'}]}
}
