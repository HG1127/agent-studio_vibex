import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {applicationNative} from './application-native.mjs'
import {confirmManaged} from './managed-confirmation.mjs'
import {mcpResult} from './result.mjs'
import {createCodexTasks} from './codex-tasks.mjs'

const hash=s=>createHash('sha256').update(s).digest('hex')
const forbidden=/^(?:agent[ -]?studio|chatgpt|powershell|powershell_ise|pwsh|cmd|wt|windowsterminal|conhost|regedit|mmc|rundll32|mshta|wscript|cscript|taskmgr|control|credentialuibroker|logonui|lockapp|winlogon|lsass|securityhealth.*|msmpeng|keepass.*|1password|bitwarden|lastpass|dashlane|codex)\.exe$/i
const keys=['Enter','Tab','Escape','Backspace','Delete','Up','Down','Left','Right','Home','End','PageUp','PageDown']
export function applicationId(file){return hash(path.win32.normalize(file).toLowerCase()).slice(0,24)}
export function validateApplicationControl(value){
 if(value===undefined)return {format:'agent-studio-applications-v1',enabled:false,images:false,grants:[]}
 if(!value||value.format!=='agent-studio-applications-v1'||typeof value.enabled!=='boolean'||typeof value.images!=='boolean'||!Array.isArray(value.grants)||value.grants.length>30||Object.keys(value).some(k=>!['format','enabled','images','grants'].includes(k)))throw Error('invalid_application_grants')
 const seen=new Set()
 for(const g of value.grants){
  if(!g||Object.keys(g).some(k=>!['id','name','path','sha256','adapter','control','allowWrite'].includes(k))||!/^[a-f0-9]{24}$/.test(g.id)||g.id!==applicationId(g.path||'')||seen.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>100||/[\x00-\x1f\x7f]/.test(g.name)||typeof g.path!=='string'||g.path.length>2000||!/^[a-z]:\\.*\.exe$/i.test(g.path)||/[\x00-\x1f\x7f"<>|?*]/.test(g.path)||!/^([a-f0-9]{64})$/.test(g.sha256)||!['desktop','codex'].includes(g.adapter)||typeof g.control!=='boolean'||typeof g.allowWrite!=='boolean')throw Error('invalid_application_grants')
  if(g.adapter==='codex'?!/^codex\.exe$/i.test(path.win32.basename(g.path)):forbidden.test(path.win32.basename(g.path)))throw Error('application_protected')
  if(g.adapter==='desktop'&&g.allowWrite)throw Error('invalid_application_grants')
  seen.add(g.id)
 }
 return structuredClone(value)
}
export async function inspectApplication(file,{name,adapter='desktop',control=false,allowWrite=false}={}, {fingerprint=true}={}){
 if(typeof file!=='string'||!/^[a-z]:\\.*\.exe$/i.test(file)||/[\x00-\x1f\x7f"<>|?*]/.test(file))throw Error('application_path_denied')
 const resolved=await fs.realpath(file),st=await fs.lstat(resolved)
 if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>512*1024*1024)throw Error('application_path_denied')
 const digest=createHash('sha256');if(fingerprint)for await(const bytes of createReadStream(resolved))digest.update(bytes)
 const grant={id:applicationId(resolved),name:String(name||path.win32.basename(resolved,'.exe')).slice(0,100),path:resolved,sha256:fingerprint?digest.digest('hex'):'0'.repeat(64),adapter,control,allowWrite}
 validateApplicationControl({format:'agent-studio-applications-v1',enabled:true,images:false,grants:[grant]});if(!fingerprint)delete grant.sha256;return grant
}
export async function discoverApplications({native=applicationNative}={}){
 const rows=await native({action:'discover'}),result=[],seen=new Set()
 for(const r of Array.isArray(rows)?rows:[]){
  if(result.length>=120)break
  try{const id=applicationId(r.path);if(seen.has(id))continue;seen.add(id);result.push(await inspectApplication(r.path,{name:r.name,adapter:r.adapter==='codex'?'codex':'desktop'},{fingerprint:false}))}catch{/* Non-executables, removed links and protected tools are not grantable. */}
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))
}
const exact=(args,allowed,required=allowed)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw Error('invalid_application_arguments')}
const schema=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false})
const str={type:'string'},integer={type:'integer'}
export function registerApplications({add,config,native=applicationNative,launch=spawn,confirm=confirmManaged,clock=Date.now}){
 const permission=validateApplicationControl(config.applications)
 if(!permission.enabled||!permission.grants.length)return {close:async()=>{}}
 const grants=new Map(permission.grants.map(g=>[g.id,g])),observations=new Map()
 const desktop=permission.grants.filter(g=>g.adapter==='desktop'),controlled=desktop.filter(g=>g.control)
 const appSchema=list=>({type:'string',enum:list.map(g=>g.id)})
 const addTool=(name,description,properties,fn,required)=>{const s=schema(properties,required);if(name===(desktop.length?'apps.windows':'apps.task_start'))s['x-studio-applications']=permission.grants.map(g=>({id:g.id,name:g.name,adapter:g.adapter,control:g.control}));add(name,description,s,fn)}
 const checked=async(id)=>{const g=grants.get(id);if(!g)throw Error('application_denied');const current=await inspectApplication(g.path,g);if(current.sha256!==g.sha256)throw Error('application_binary_changed');return g}
 const windows=async(g,signal)=>{const list=await native({action:'windows',path:g.path},{signal});return (Array.isArray(list)?list:[]).filter(w=>w&&w.path?.toLowerCase()===g.path.toLowerCase()&&/^\d+$/.test(w.id)).map(w=>({...w,title:String(w.title).slice(0,300)}))}
 if(desktop.length){
  addTool('apps.launch','启动已长期授权的本机应用，不接收命令行、路径或脚本。启动回执不代表应用内部任务已完成。',{app:appSchema(desktop)},async(args,signal)=>{exact(args,['app']);const g=await checked(args.app);signal?.throwIfAborted();await new Promise((resolve,reject)=>{const child=launch(g.path,[],{shell:false,windowsHide:false,stdio:'ignore',cwd:path.dirname(g.path)});child.once('error',()=>reject(Error('application_launch_failed')));child.once('spawn',()=>{child.unref();resolve()})});return JSON.stringify({application:g.name,accepted:true,windows:(await windows(g,signal)).map(({path,...w})=>w)})})
  addTool('apps.windows','列出已授权应用的可见窗口。只返回该应用的窗口，不枚举其他应用的数据。',{app:appSchema(desktop)},async(args,signal)=>{exact(args,['app']);const g=await checked(args.app);return JSON.stringify({application:g.name,windows:(await windows(g,signal)).map(({path,...w})=>w)})})
  addTool('apps.observe','观察已授权应用的指定窗口，返回控件编号和一次性观察凭据；已授权截图时仅截取此窗口。输入前必须重新观察，凭据30秒有效。',{app:appSchema(desktop),window:str},async(args,signal)=>{
   exact(args,['app','window']);const g=await checked(args.app);if(!(await windows(g,signal)).some(w=>w.id===args.window))throw Error('application_window_changed')
   observations.delete(g.id);const view=await native({action:'observe',path:g.path,window:args.window,images:permission.images},{signal})
   const token=randomBytes(16).toString('hex'),controls=(view.controls||[]).slice(0,250)
   const output={application:g.name,window:{id:view.window.id,title:view.window.title,width:view.window.width,height:view.window.height},observation:token,expiresInSeconds:30,truncated:false,controls:controls.map(c=>({id:c.id,name:String(c.name).slice(0,200),type:c.type,password:c.password,enabled:c.enabled,rect:c.rect}))}
   while(JSON.stringify(output).length>10500){output.controls.pop();output.truncated=true}
   observations.set(g.id,{token,created:clock(),window:args.window,view:{...view,controls:controls.filter(c=>output.controls.some(shown=>shown.id===c.id))}})
   const text=JSON.stringify(output)
   return view.image?mcpResult({content:[{type:'text',text},{type:'image',mimeType:'image/png',data:view.image}]},true):text
  })
 }
 if(controlled.length)addTool('apps.act','在已授权应用窗口内点击、输入或按键。需要30秒内一次性观察凭据，接管/窗口变化会停止。每次输入均需本机明确确认；发送消息等不能由模型自行批准。',{app:appSchema(controlled),observation:str,element:integer,action:{type:'string',enum:['click','type','key']},text:{type:'string',maxLength:4000},key:{type:'string',enum:keys}},async(args,signal)=>{
  exact(args,['app','observation','element','action','text','key'],['app','observation','element','action']);const g=await checked(args.app)
  if(!g.control)throw Error('application_control_denied')
  const o=observations.get(g.id);observations.delete(g.id)
  if(!o||o.token!==args.observation||clock()-o.created>30000)throw Error('application_observation_expired')
  const c=o.view.controls.find(c=>c.id===args.element)
  if(!c||c.password||!c.enabled||!Number.isInteger(args.element)||!/^[a-f0-9]{32}$/.test(args.observation)||!['click','type','key'].includes(args.action)||args.text!==undefined&&(typeof args.text!=='string'||args.text.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(args.text))||args.key!==undefined&&!keys.includes(args.key)||args.action==='type'&&typeof args.text!=='string'||args.action==='key'&&!keys.includes(args.key))throw Error('invalid_application_arguments')
  const message='应用：'+g.name+'\n窗口：'+o.view.window.title+'\n操作：'+args.action+'\n目标：'+c.name+(args.action==='type'?'\n输入内容：'+args.text:'')+(args.action==='key'?'\n按键：'+args.key:'')+'\n请核对应用中当前的联系人、内容或文件。此操作可能发送信息或修改数据；拒绝不会自动重试。'
  const reviewStarted=clock()
  if(!await confirm({message,kind:'application'},signal))throw Error('application_action_declined')
  if(clock()-reviewStarted>90000)throw Error('application_observation_expired')
  await checked(g.id)
  signal?.throwIfAborted()
  const result=await native({action:'act',kind:args.action,path:g.path,window:o.window,title:o.view.window.title,element:c.id,name:c.name,runtime:c.runtime||'',text:args.text||'',key:args.key||''},{signal})
  if(result?.accepted!==true)throw Error('application_action_unconfirmed')
  return JSON.stringify({application:g.name,accepted:true,action:args.action,observeAgain:true,contentsVerified:false})
 },['app','observation','element','action'])
 const tasks=createCodexTasks({grants:permission.grants.filter(g=>g.adapter==='codex'),roots:config.roots,checked,confirm,launch,addTool})
 return {close:async()=>{observations.clear();await tasks.close()}}
}
