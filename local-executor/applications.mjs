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
import {allowedWindowTarget,resolveWindowTarget,shortcutApplicationPath,isQoderHelper} from './application-target.mjs'
import {APPLICATION_FAILURE_MESSAGES} from './application-feedback.mjs'

// Electron's fork() injects ELECTRON_RUN_AS_NODE even when the desktop parent
// supplies a clean environment. Never let connector runtime controls turn a
// separately authorized GUI application into a Node process (exit code 9).
export function applicationEnvironment(env=process.env){
 return Object.fromEntries(Object.entries(env).filter(([key])=>!/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH|NODE_CHANNEL_FD|NODE_CHANNEL_SERIALIZATION_MODE|STUDIO_LOCAL_.*)$/i.test(key)))
}

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
 const digest=createHash('sha256');if(fingerprint)for await(const bytes of createReadStream(resolved,{highWaterMark:1024*1024}))digest.update(bytes)
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
  const batch=await Promise.allSettled(candidates.slice(offset,offset+8).map(async r=>{const entry=r.icon!==undefined?applicationIconPath(r.icon):r.path;const file=shortcutApplicationPath(entry,r.workingDirectory);if(!file||seen.has(applicationId(file)))return null;return inspectApplication(file,{name:r.name,adapter:r.adapter==='codex'?'codex':'desktop'},{fingerprint:false})}))
  for(const row of batch){if(row.status!=='fulfilled'||!row.value||seen.has(row.value.id)||result.length>=700)continue;seen.add(row.value.id);result.push(row.value)}
 }
 return result.filter(app=>!result.some(parent=>parent.id!==app.id&&parent.windowPath?.toLowerCase()===app.path.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))
}
const exact=(args,allowed,required=allowed)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(args,k)))throw Error('invalid_application_arguments')}
const schema=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false})
const str={type:'string'},integer={type:'integer'}

/** Prefer actionable, semantically identifiable UIA controls to anonymous
 * Chromium containers. Native IDs remain unchanged for the one-use token. */
export function prioritizeApplicationControls(rows){
 const score=c=>{
  const t=String(c.type||''),named=String(c.name||'').trim()&&c.name!=='[protected]',actions=c.actions||[]
  const role=/\.Edit$/.test(t)?115:/\.Button$/.test(t)?100:/\.TabItem$/.test(t)?98:/\.(ComboBox|CheckBox|RadioButton)$/.test(t)?96:/\.Hyperlink$/.test(t)?92:/\.MenuItem$/.test(t)?85:/\.Document$/.test(t)?65:/\.Text$/.test(t)?30:0
  return role+(named?20:0)+(actions.includes('type')?40:0)+(actions.includes('click')?5:0)-(c.password||!c.enabled?150:0)
 }
 let anonymous=0
 return [...rows].sort((a,b)=>score(b)-score(a)||Number(a.id)-Number(b.id)).filter(c=>{
  if(!c.name?.trim()&&!c.actions?.includes('type')&&/\.(Custom|Group|Pane|Text)$/.test(c.type||''))return anonymous++<12
  return true
 }).slice(0,250)
}
export function hasActionableElectronControls(rows){
 return rows.some(c=>c.enabled&&!c.password&&/\.(Edit|Button|TabItem|ComboBox|ListItem|CheckBox|RadioButton)$/.test(c.type||'')&&Array.isArray(c.actions)&&c.actions.some(a=>a==='click'||a==='type'||a==='key'))
}
export function registerApplications({add,config,native=applicationNative,launch=spawn,confirm=confirmManaged,clock=Date.now,launchWaitMs=25000,pollMs=600}){
 const permission=validateApplicationControl(config.applications)
 if(!permission.enabled||!permission.grants.length)return {close:async()=>{}}
 const grants=new Map(permission.grants.map(g=>[g.id,g])),observations=new Map(),windowCache=new Map()
 const desktop=permission.grants.filter(g=>g.adapter==='desktop'),controlled=desktop.filter(g=>g.control)
 const appSchema=list=>({type:'string',enum:list.map(g=>g.id)})
 const addTool=(name,description,properties,fn,required)=>{const s=schema(properties,required);if(name===(desktop.length?'apps.windows':'apps.task_start'))s['x-studio-applications']=permission.grants.map(g=>({id:g.id,name:g.name,adapter:g.adapter,control:g.control,...(g.adapter==='codex'?{allowWrite:g.allowWrite}:{})}));if(name==='apps.observe')s['x-studio-application-images']=permission.images;if(name==='apps.task_start')s['x-studio-app-workspace-write']=(config.roots||[]).some(r=>!r.allowedFiles&&r.readOnly!==true);add(name,description,s,fn)}
 const checked=async(id)=>{const g=grants.get(id);if(!g)throw Error('application_denied');try{const current=await inspectApplication(g.path,g,{resolveTarget:false});if(current.sha256!==g.sha256)throw Error('application_binary_changed');if(g.windowPath){const active=await resolveWindowTarget(g.path);if(active?.toLowerCase()!==g.windowPath.toLowerCase())throw Error('application_launcher_needs_review');const target=await inspectApplication(g.windowPath,g,{resolveTarget:false});if(target.sha256!==g.windowSha256)throw Error('application_binary_changed')}else if(g.adapter==='desktop'&&await resolveWindowTarget(g.path))throw Error('application_launcher_needs_review');return g}catch(error){if(error.code==='ENOENT')throw Error('application_binary_missing');if(['EACCES','EPERM'].includes(error.code))throw Error('application_binary_unreadable');throw error}}
 const windows=async(g,signal,reveal=false)=>{const list=await native({action:'windows',path:g.windowPath||g.path,...(reveal?{reveal:true}:{})},{signal});const result=(Array.isArray(list)?list:[]).filter(w=>w&&w.path?.toLowerCase()===(g.windowPath||g.path).toLowerCase()&&/^\d+$/.test(w.id)).map(w=>({...w,title:redactApplicationText(w.title).slice(0,300)}));if(reveal&&result[0]?.minimized===true)throw Error('application_foreground_unavailable');windowCache.set(g.id,new Set(result.map(w=>w.id)));return result}


 if(desktop.length){
   addTool('apps.launch','启动已授权应用并等待窗口就绪。返回 app 授权ID和 windows 窗口ID，下一步用它们调用 apps.observe；ready 只代表窗口就绪，不代表任务完成。',{app:appSchema(desktop)},async(args,signal)=>{
   exact(args,['app']);const g=await checked(args.app);signal?.throwIfAborted()
   if(isQoderHelper(g.path))throw Error('application_launcher_needs_review')
   const existing=await windows(g,signal,true)
    if(existing.length)return JSON.stringify({app:g.id,application:g.name,accepted:true,status:'ready',alreadyRunning:true,windows:existing.map(({path,...w})=>w)})
   // Window discovery starts a native helper. Cancellation or an application
   // update during that await must be checked before any launch side effect.
   await checked(args.app);signal?.throwIfAborted()
   let exitCode=null,launchError=false
   await new Promise((resolve,reject)=>{const child=launch(g.path,g.accessibility==='electron'?['--force-renderer-accessibility']:[],{shell:false,windowsHide:false,stdio:'ignore',cwd:path.dirname(g.path),env:applicationEnvironment()});child.on('error',error=>{launchError=true;reject(Error(error.code==='ENOENT'?'application_binary_missing':['EACCES','EPERM'].includes(error.code)?'application_launch_denied':'application_launch_failed'))});child.once('exit',code=>{exitCode=code});child.once('spawn',()=>{child.unref();resolve()})})
   const deadline=Date.now()+launchWaitMs
    do{signal?.throwIfAborted();if(launchError)throw Error('application_launch_failed');const list=await windows(g,signal,true);if(list.length){await checked(args.app);signal?.throwIfAborted();return JSON.stringify({app:g.id,application:g.name,accepted:true,status:'ready',alreadyRunning:false,windows:list.map(({path,...w})=>w)})}if(Date.now()>=deadline)break;await delay(pollMs,undefined,{signal})}while(true)
   // Single-instance apps/version launchers can exit before the real window
   // appears. Only a window with the pinned identity proves readiness; wait
   // for the bounded discovery period without ever launching a second time.
   if(exitCode!==null&&exitCode!==0)throw Error('application_launch_failed')
    return JSON.stringify({app:g.id,application:g.name,accepted:true,status:'waiting_window',windows:[],retryLaunch:false,message:'启动请求已受理，但尚未发现可操作窗口。请刷新窗口检查启动弹窗；不会重复启动。'})
  })
   addTool('apps.windows','列出已授权应用的可见窗口，返回 app 授权ID和每个窗口的 id；下一步 apps.observe 必须同时传 app 与 window。',{app:appSchema(desktop)},async(args,signal)=>{exact(args,['app']);const g=await checked(args.app);return JSON.stringify({app:g.id,application:g.name,windows:(await windows(g,signal)).map(({path,...w})=>w)})})
   addTool('apps.observe','只读观察已授权窗口，必须传 app 授权ID与 window 窗口ID。窗口已经在前台时直接只读观察，不重复激活、不弹确认；后台窗口需 activate:true 和本机确认才切换前台。凭据30秒有效。',{app:appSchema(desktop),window:str,activate:{type:'boolean'}},async(args,signal)=>{
   exact(args,['app','window','activate'],['app','window']);const g=await checked(args.app);if(typeof args.window!=='string'||!/^\d{1,20}$/.test(args.window))throw Error('application_window_changed');if(args.activate!==undefined&&typeof args.activate!=='boolean')throw Error('invalid_application_arguments');if(args.activate===true&&!g.control)throw Error('application_control_denied')
   observations.delete(g.id)
   const changed=async list=>JSON.stringify({application:g.name,status:list.length?'window_changed':'waiting_window',requestedWindow:args.window,windows:list.map(({path,...w})=>w),actionable:false,retryAction:false,message:'原窗口已关闭或重建。请使用刷新后的窗口编号重新观察；未重新启动、点击或输入。'})
   const current=await windows(g,signal);const selected=current.find(w=>w.id===args.window);if(!selected)return changed(current)
   if(args.activate!==true&&selected.foreground===false&&!permission.images)return JSON.stringify({application:g.name,status:'window_background',actionable:false,retryAction:false,requestedWindow:args.window,windows:current.map(({path,...w})=>w),message:'应用当前在后台，尚未读取输入框，也未执行操作。可选择 activate:true 并在本机确认切换前台后一次性观察；请勿在后台重复点击。'})
    // If the verified window is already foreground, there is no activation
    // side effect and no reason to request another 90s local confirmation.
    // A foreground change between listing and observation is rechecked by
    // the native observer, which returns background without an action token.
    const shouldActivate=args.activate===true&&selected.foreground!==true
    if(shouldActivate){const started=clock();const message='应用：'+g.name+'\n窗口：'+selected.title+'\n操作：激活窗口并读取可访问控件（不点击控件、不输入、不发送）\n请先保存其他应用中的草稿并确认暂时停止键鼠操作。';if(!await confirm({message,kind:'application'},signal))throw Error('application_action_declined');if(clock()-started>90000)throw Error('application_observation_expired');await checked(g.id);signal?.throwIfAborted()}
   // The native observer revalidates the window's current executable identity.
   // A known handle saves a redundant helper spawn, never an authorization check.
   let view
    try{view=await native({action:shouldActivate?'activate_observe':'observe',path:g.windowPath||g.path,window:args.window,images:permission.images},{signal})}
   catch(error){if(error.message==='application_window_changed')return changed(await windows(g,signal));throw error}
       if(view.window?.foreground===false){
     // A background Chromium surface is not a safe input source. Keep its
     // already-authorized screenshot (preview21 feature) but issue no action token.
     const output={application:g.name,status:'window_background',actionable:false,retryAction:false,requestedWindow:args.window,windows:[{id:view.window.id,title:redactApplicationText(view.window.title),width:view.window.width,height:view.window.height,foreground:false}],message:'应用在后台，未读取控件或授予任何点击输入凭据。若已授权截图，可查看此窗口的只读截图；要操作须由本人审批 activate:true。'}
     if(view.image&&view.imageWidth>0&&view.imageHeight>0)output.imageSize={width:view.imageWidth,height:view.imageHeight,scaled:view.imageWidth!==view.window.width||view.imageHeight!==view.window.height}
     if(view.imageError)output.imageDiagnostic={code:Object.hasOwn(APPLICATION_FAILURE_MESSAGES,view.imageError)?view.imageError:'application_capture_failed',message:APPLICATION_FAILURE_MESSAGES[view.imageError]||APPLICATION_FAILURE_MESSAGES.application_capture_failed}
     const text=JSON.stringify(output)
     return view.image?mcpResult({content:[{type:'text',text},{type:'image',mimeType:'image/png',data:view.image}]},true):text
    }
   // A root Chromium Document (often holding file:///...) is not an
   // actionable editor. Never issue an observation token that an Agent can
   // spend clicking an inaccessible page in a loop.
   if(g.control&&g.accessibility==='electron'&&!hasActionableElectronControls(view.controls||[])){
    return JSON.stringify({application:g.name,status:'accessibility_unavailable',actionable:false,retryAction:false,requestedWindow:args.window,windows:[{id:view.window.id,title:redactApplicationText(view.window.title),width:view.window.width,height:view.window.height}],message:'已找到应用窗口，但只能读取内部页面，无法识别新建任务、输入框或发送按钮。请先保存应用中的未发送内容，完全退出应用，再从 Agent Studio 的“启动应用”重新打开以启用 Electron 控件支持；本次没有点击、输入或提交，不应重复尝试同一操作。'})
   }
   const token=randomBytes(16).toString('hex'),controls=prioritizeApplicationControls(view.controls||[])
   const output={application:g.name,window:{id:view.window.id,title:redactApplicationText(view.window.title),width:view.window.width,height:view.window.height,foreground:view.window.foreground===true},observation:token,expiresInSeconds:30,truncated:view.controlsTruncated===true||(view.controls||[]).length>controls.length,diagnostic:g.accessibility==='electron'&&!hasActionableElectronControls(view.controls||[])?'应用窗口已找到，但正文控件尚不可访问。请先保存应用内工作并关闭应用，再从本软件启动以启用控件支持；不要把窗口就绪当作任务完成。':undefined,controls:controls.map(c=>({id:c.id,name:redactApplicationText(c.name).slice(0,200),type:c.type,password:c.password,enabled:c.enabled,rect:c.rect,actions:c.actions,value:c.password?undefined:c.value===undefined?undefined:redactApplicationText(c.value)}))}
   if(view.image&&view.imageWidth>0&&view.imageHeight>0)output.imageSize={width:view.imageWidth,height:view.imageHeight,scaled:view.imageWidth!==view.window.width||view.imageHeight!==view.window.height};
   if(view.imageError){output.imageDiagnostic={code:Object.hasOwn(APPLICATION_FAILURE_MESSAGES,view.imageError)?view.imageError:'application_capture_failed',message:APPLICATION_FAILURE_MESSAGES[view.imageError]||APPLICATION_FAILURE_MESSAGES.application_capture_failed};output.imageDiagnostic.controlsOnly=true}
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
