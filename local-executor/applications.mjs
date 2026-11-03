import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {applicationNative} from './application-native.mjs'
import {confirmManaged} from './managed-confirmation.mjs'
import {mcpResult} from './result.mjs'
import {createCodexTasks} from './codex-tasks.mjs'
import {setTimeout as delay} from 'node:timers/promises'
import {allowedWindowTarget,resolveWindowTarget} from './application-target.mjs'

const hash=s=>createHash('sha256').update(s).digest('hex')
const forbidden=/^(?:agent[ -]?studio|chatgpt|powershell|powershell_ise|pwsh|cmd|wt|windowsterminal|conhost|regedit|mmc|rundll32|mshta|wscript|cscript|taskmgr|control|credentialuibroker|logonui|lockapp|winlogon|lsass|securityhealth.*|msmpeng|keepass.*|1password|bitwarden|lastpass|dashlane|codex)\.exe$/i
const keys=['Enter','Tab','Escape','Backspace','Delete','Up','Down','Left','Right','Home','End','PageUp','PageDown']
export function applicationId(file){return hash(path.win32.normalize(file).toLowerCase()).slice(0,24)}
// DisplayIcon is registry metadata, never a command line. Accept only a local
// executable with an optional numeric icon index; inspection still pins the file.
export function applicationIconPath(value){
 if(typeof value!=='string'||value.length>2100||/[\x00-\x1f\x7f]/.test(value))return null
 const match=value.trim().match(/^(?:"([a-z]:\\[^",;<>|?*]+\.exe)"|([a-z]:\\[^",;<>|?*]+\.exe))(?:\s*,\s*-?\d+)?$/i)
 return match?(match[1]||match[2]):null
}
export function redactApplicationText(value){
 return String(value??'').replace(/([?&](?:[\w.%+-]*(?:token|secret|password|credential|api[_-]?key|session|authorization)[\w.%+-]*|code|key)=)[^&#\s"'<>]*/gi,'$1[redacted]')
}
export function validateApplicationControl(value){
 if(value===undefined)return {format:'agent-studio-applications-v1',enabled:false,images:false,grants:[]}
 if(!value||value.format!=='agent-studio-applications-v1'||typeof value.enabled!=='boolean'||typeof value.images!=='boolean'||!Array.isArray(value.grants)||value.grants.length>30||Object.keys(value).some(k=>!['format','enabled','images','grants'].includes(k)))throw Error('invalid_application_grants')
 const seen=new Set()
 for(const g of value.grants){
  if(!g||Object.keys(g).some(k=>!['id','name','path','sha256','adapter','control','allowWrite','windowPath','windowSha256','accessibility'].includes(k))||!/^[a-f0-9]{24}$/.test(g.id)||g.id!==applicationId(g.path||'')||seen.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>100||/[\x00-\x1f\x7f]/.test(g.name)||typeof g.path!=='string'||g.path.length>2000||!/^[a-z]:\\.*\.exe$/i.test(g.path)||/[\x00-\x1f\x7f"<>|?*]/.test(g.path)||!/^([a-f0-9]{64})$/.test(g.sha256)||!['desktop','codex'].includes(g.adapter)||typeof g.control!=='boolean'||typeof g.allowWrite!=='boolean')throw Error('invalid_application_grants')
  if(g.adapter==='codex'?!/^codex\.exe$/i.test(path.win32.basename(g.path)):forbidden.test(path.win32.basename(g.path)))throw Error('application_protected')
  if(g.adapter==='desktop'&&g.allowWrite)throw Error('invalid_application_grants')
  if(g.windowPath!==undefined||g.windowSha256!==undefined){if(g.adapter!=='desktop'||typeof g.windowPath!=='string'||!allowedWindowTarget(g.path,g.windowPath)||!/^([a-f0-9]{64})$/.test(g.windowSha256||''))throw Error('invalid_application_grants')}
  if(g.accessibility!==undefined&&(g.adapter!=='desktop'||g.accessibility!=='electron'))throw Error('invalid_application_grants')
  seen.add(g.id)
 }
 return structuredClone(value)
}
export async function inspectApplication(file,{name,adapter='desktop',control=false,allowWrite=false}={}, {fingerprint=true,resolveTarget=true}={}){
 if(typeof file!=='string'||!/^[a-z]:\\.*\.exe$/i.test(file)||/[\x00-\x1f\x7f"<>|?*]/.test(file))throw Error('application_path_denied')
 const resolved=await fs.realpath(file),st=await fs.lstat(resolved)
 if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>512*1024*1024)throw Error('application_path_denied')
 const digest=createHash('sha256');if(fingerprint)for await(const bytes of createReadStream(resolved))digest.update(bytes)
 const electron=adapter==='desktop'&&await fs.access(path.join(path.dirname(resolved),'LICENSE.electron.txt')).then(()=>true,()=>false)
 const grant={...(electron?{accessibility:'electron'}:{}),id:applicationId(resolved),name:String(name||path.win32.basename(resolved,'.exe')).slice(0,100),path:resolved,sha256:fingerprint?digest.digest('hex'):'0'.repeat(64),adapter,control,allowWrite}
 if(adapter==='desktop'&&resolveTarget){const target=await resolveWindowTarget(resolved);if(target){const identity=await inspectApplication(target,{name,adapter,control,allowWrite},{fingerprint,resolveTarget:false});grant.windowPath=target;grant.windowSha256=identity.sha256||'0'.repeat(64)}}
 validateApplicationControl({format:'agent-studio-applications-v1',enabled:true,images:false,grants:[grant]});if(!fingerprint){delete grant.sha256;delete grant.windowSha256}return grant
}
export async function discoverApplications({native=applicationNative}={}){
 const rows=await native({action:'discover'}),result=[],seen=new Set()
 const candidates=(Array.isArray(rows)?rows:[]).slice(0,3000)
 for(let offset=0;offset<candidates.length;offset+=8){
  if(result.length>=700)break
  const batch=await Promise.allSettled(candidates.slice(offset,offset+8).map(async r=>{const file=r.icon!==undefined?applicationIconPath(r.icon):r.path;if(!file||seen.has(applicationId(file)))return null;return inspectApplication(file,{name:r.name,adapter:r.adapter==='codex'?'codex':'desktop'},{fingerprint:false})}))
  for(const row of batch){if(row.status!=='fulfilled'||!row.value||seen.has(row.value.id)||result.length>=700)continue;seen.add(row.value.id);result.push(row.value)}
 }
 return result.filter(app=>!result.some(parent=>parent.id!==app.id&&parent.windowPath?.toLowerCase()===app.path.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))
}
const exact=(args,allowed,required=allowed)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw Error('invalid_application_arguments')}
const schema=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false})
const str={type:'string'},integer={type:'integer'}
export function registerApplications({add,config,native=applicationNative,launch=spawn,confirm=confirmManaged,clock=Date.now,launchWaitMs=25000,pollMs=600}){
 const permission=validateApplicationControl(config.applications)
 if(!permission.enabled||!permission.grants.length)return {close:async()=>{}}
 const grants=new Map(permission.grants.map(g=>[g.id,g])),observations=new Map(),windowCache=new Map()
 const desktop=permission.grants.filter(g=>g.adapter==='desktop'),controlled=desktop.filter(g=>g.control)
 const appSchema=list=>({type:'string',enum:list.map(g=>g.id)})
 const addTool=(name,description,properties,fn,required)=>{const s=schema(properties,required);if(name===(desktop.length?'apps.windows':'apps.task_start'))s['x-studio-applications']=permission.grants.map(g=>({id:g.id,name:g.name,adapter:g.adapter,control:g.control,...(g.adapter==='codex'?{allowWrite:g.allowWrite}:{})}));if(name==='apps.observe')s['x-studio-application-images']=permission.images;if(name==='apps.task_start')s['x-studio-app-workspace-write']=(config.roots||[]).some(r=>!r.allowedFiles&&r.readOnly!==true);add(name,description,s,fn)}
 const checked=async(id)=>{const g=grants.get(id);if(!g)throw Error('application_denied');try{const current=await inspectApplication(g.path,g,{resolveTarget:false});if(current.sha256!==g.sha256)throw Error('application_binary_changed');if(g.windowPath){const target=await inspectApplication(g.windowPath,g,{resolveTarget:false});if(target.sha256!==g.windowSha256)throw Error('application_binary_changed')}else if(g.adapter==='desktop'&&await resolveWindowTarget(g.path))throw Error('application_launcher_needs_review');return g}catch(error){if(error.code==='ENOENT')throw Error('application_binary_missing');if(['EACCES','EPERM'].includes(error.code))throw Error('application_binary_unreadable');throw error}}
 const windows=async(g,signal)=>{const list=await native({action:'windows',path:g.windowPath||g.path},{signal});const result=(Array.isArray(list)?list:[]).filter(w=>w&&w.path?.toLowerCase()===(g.windowPath||g.path).toLowerCase()&&/^\d+$/.test(w.id)).map(w=>({...w,title:redactApplicationText(w.title).slice(0,300)}));windowCache.set(g.id,new Set(result.map(w=>w.id)));return result}

 if(desktop.length){
  addTool('apps.launch','启动已授权应用并等待窗口就绪。ready 才能开始观察；waiting_window 只说明启动已受理，须继续刷新窗口，不能宣称任务完成。',{app:appSchema(desktop)},async(args,signal)=>{
   exact(args,['app']);const g=await checked(args.app);signal?.throwIfAborted()
   const existing=await windows(g,signal)
   if(existing.length)return JSON.stringify({application:g.name,accepted:true,status:'ready',alreadyRunning:true,windows:existing.map(({path,...w})=>w)})
   // Window discovery starts a native helper. Cancellation or an application
   // update during that await must be checked before any launch side effect.
   await checked(args.app);signal?.throwIfAborted()
   let exitCode=null,launchError=false
   await new Promise((resolve,reject)=>{const child=launch(g.path,g.accessibility==='electron'?['--force-renderer-accessibility']:[],{shell:false,windowsHide:false,stdio:'ignore',cwd:path.dirname(g.path)});child.on('error',error=>{launchError=true;reject(Error(error.code==='ENOENT'?'application_binary_missing':['EACCES','EPERM'].includes(error.code)?'application_launch_denied':'application_launch_failed'))});child.once('exit',code=>{exitCode=code});child.once('spawn',()=>{child.unref();resolve()})})
   const deadline=Date.now()+launchWaitMs
   do{signal?.throwIfAborted();if(launchError)throw Error('application_launch_failed');const list=await windows(g,signal);if(list.length){await checked(args.app);signal?.throwIfAborted();return JSON.stringify({application:g.name,accepted:true,status:'ready',alreadyRunning:false,windows:list.map(({path,...w})=>w)})}if(Date.now()>=deadline)break;await delay(pollMs,undefined,{signal})}while(true)
   // Single-instance apps/version launchers can exit before the real window
   // appears. Only a window with the pinned identity proves readiness; wait
   // for the bounded discovery period without ever launching a second time.
   if(exitCode!==null&&exitCode!==0)throw Error('application_launch_failed')
   return JSON.stringify({application:g.name,accepted:true,status:'waiting_window',windows:[],retryLaunch:false,message:'启动请求已受理，但尚未发现可操作窗口。请刷新窗口检查启动弹窗；不会重复启动。'})
  })
  addTool('apps.windows','列出已授权应用的可见窗口。只返回该应用的窗口，不枚举其他应用的数据。',{app:appSchema(desktop)},async(args,signal)=>{exact(args,['app']);const g=await checked(args.app);return JSON.stringify({application:g.name,windows:(await windows(g,signal)).map(({path,...w})=>w)})})
  addTool('apps.observe','观察已授权应用的指定窗口，返回控件编号和一次性观察凭据；已授权截图时仅截取此窗口。输入前必须重新观察，凭据30秒有效。',{app:appSchema(desktop),window:str},async(args,signal)=>{
   exact(args,['app','window']);const g=await checked(args.app);if(typeof args.window!=='string'||!/^\d{1,20}$/.test(args.window))throw Error('application_window_changed');if(!windowCache.get(g.id)?.has(args.window)&&!(await windows(g,signal)).some(w=>w.id===args.window))throw Error('application_window_changed')
   // The native observer revalidates the window's current executable identity.
   // A known handle saves a redundant helper spawn, never an authorization check.
   observations.delete(g.id);const view=await native({action:'observe',path:g.windowPath||g.path,window:args.window,images:permission.images},{signal})
   const token=randomBytes(16).toString('hex'),controls=(view.controls||[]).sort((a,b)=>Number(/Edit|Document/.test(b.type||''))-Number(/Edit|Document/.test(a.type||''))).slice(0,250)
   const output={application:g.name,window:{id:view.window.id,title:redactApplicationText(view.window.title),width:view.window.width,height:view.window.height},observation:token,expiresInSeconds:30,truncated:false,diagnostic:g.accessibility==='electron'&&!(view.controls||[]).some(c=>/Edit|Document|Text|List|DataGrid/.test(c.type||''))?'应用窗口已找到，但正文控件尚不可访问。请先保存应用内工作并关闭应用，再从本软件启动以启用控件支持；不要把窗口就绪当作任务完成。':undefined,controls:controls.map(c=>({id:c.id,name:redactApplicationText(c.name).slice(0,200),type:c.type,password:c.password,enabled:c.enabled,rect:c.rect,actions:c.actions,value:c.password?undefined:c.value===undefined?undefined:redactApplicationText(c.value)}))}
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
  if(!c||c.password||!c.enabled||Array.isArray(c.actions)&&!c.actions.includes(args.action)||!Number.isInteger(args.element)||!/^[a-f0-9]{32}$/.test(args.observation)||!['click','type','key'].includes(args.action)||args.text!==undefined&&(typeof args.text!=='string'||args.text.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(args.text))||args.key!==undefined&&!keys.includes(args.key)||args.action==='type'&&typeof args.text!=='string'||args.action==='key'&&!keys.includes(args.key))throw Error('invalid_application_arguments')
  const message='应用：'+g.name+'\n窗口：'+o.view.window.title+'\n操作：'+args.action+'\n目标：'+c.name+(args.action==='type'?'\n输入内容：'+args.text:'')+(args.action==='key'?'\n按键：'+args.key:'')+'\n请核对应用中当前的联系人、内容或文件。此操作可能发送信息或修改数据；拒绝不会自动重试。'
  const reviewStarted=clock()
  if(!await confirm({message,kind:'application'},signal))throw Error('application_action_declined')
  if(clock()-reviewStarted>90000)throw Error('application_observation_expired')
  await checked(g.id)
  signal?.throwIfAborted()
  const result=await native({action:'act',kind:args.action,path:g.windowPath||g.path,window:o.window,title:o.view.window.title,element:c.id,name:c.name,runtime:c.runtime||'',text:args.text||'',key:args.key||''},{signal})
  if(result?.accepted!==true)throw Error('application_action_unconfirmed')
  return JSON.stringify({application:g.name,accepted:true,action:args.action,observeAgain:true,contentsVerified:false})
 },['app','observation','element','action'])
 const tasks=createCodexTasks({grants:permission.grants.filter(g=>g.adapter==='codex'),roots:config.roots,checked,confirm,launch,addTool})
 return {close:async()=>{observations.clear();windowCache.clear();await tasks.close()}}
}
