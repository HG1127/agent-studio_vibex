import type {AgentCapabilityRequirement} from './agentCapabilityPlan'
import type {LocalCapabilityTool} from './localDeviceConnection'
const generic=new Set(['microsoft','windows','google','desktop','application','browser','office','cli','app'])
function mentionsApplication(text:string,name:string):boolean{
 const aliases=[name,...name.split(/[\s_.:/()-]+/).filter(word=>word.length>=4&&!generic.has(word.toLowerCase())&&!/^\d+$/.test(word))]
 return aliases.some(alias=>{if(/[\u3400-\u9fff]/.test(alias))return text.includes(alias);const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('\\b'+escaped+'\\b','i').test(text)})
}
/** Names alone cannot prove which application is authorized. The connector's
 * exact application enums, screenshot flag and task write grant remain binding. */
export function localApplicationReadiness(need:AgentCapabilityRequirement,tools:LocalCapabilityTool[]):{modern:boolean;supported:boolean;matched:boolean}{
 const catalog=new Map(tools.map(tool=>[tool.name,tool.inputSchema||{}])),raw=tools.flatMap(tool=>Array.isArray(tool.inputSchema?.['x-studio-applications'])?tool.inputSchema['x-studio-applications']:[])
 const apps=raw.filter((row):row is {id:string;name:string;adapter:string;control:boolean;allowWrite?:boolean}=>!!row&&typeof row==='object'&&/^[a-f0-9]{24}$/.test(row.id)&&typeof row.name==='string'&&row.name.length<=100&&['desktop','codex'].includes(row.adapter))
 const text=[need.title,need.purpose,...(need.search_terms||[])].join(' ')
 const has=(...names:string[])=>names.every(name=>catalog.has(name))
 const allows=(name:string,id:string)=>{const properties=catalog.get(name)?.properties as Record<string,{enum?:unknown[]}>|undefined;return Array.isArray(properties?.app?.enum)&&properties.app.enum.includes(id)}
 const visual=/截图|视觉|图像|画面|screenshot|\bvisual\b|\bvision\b|\bimage\b/i.test(text)
 const launch=/启动|打开|\blaunch\b|\bopen\b/i.test(text),operate=/输入|点击|按键|编辑|操作|控制|\btype\b|\bclick\b|\bcontrol\b|\bedit\b/i.test(text)
 const supported=apps.some(app=>{
  if(!mentionsApplication(text,app.name))return false
  if(app.adapter==='codex')return has('apps.task_start','apps.task_status','apps.task_cancel')&&allows('apps.task_start',app.id)&&(!visual)&&(need.access==='read'||app.allowWrite===true&&catalog.get('apps.task_start')?.['x-studio-app-workspace-write']===true)
  if(launch&&!operate&&!visual)return allows('apps.launch',app.id)
  return has('apps.windows','apps.observe')&&allows('apps.observe',app.id)&&(!visual||catalog.get('apps.observe')?.['x-studio-application-images']===true)&&(need.access==='read'||app.control===true&&allows('apps.act',app.id))
 })
 return {modern:raw.length>0,supported,matched:apps.some(app=>mentionsApplication(text,app.name))}
}
