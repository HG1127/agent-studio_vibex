#!/usr/bin/env node
/** Local UI: exact loopback Host/Origin + random per-launch session. No CORS,
 * remote command input, arbitrary paths, automatic binding or background service. */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'
import {randomBytes,timingSafeEqual} from 'node:crypto'
import {fork,spawn} from 'node:child_process'
import {validateConnectionTicket} from '../src/lib/localConnectionSetup.ts'
import {prepareGuidedConnection} from './setup.mjs'
import {listGuidedProfiles,readGuidedProfile} from './profiles.mjs'
import {pickLocalFolder,validateWorkspaceChoice,changeGuidedWorkspace} from './workspace.mjs'
import {verifyChromeInstalled,changeGuidedBrowser} from './browser-settings.mjs'
import {connectionFailureHint,connectorReasonCode,connectorFailureCode,connectorFailureMessage,connectorExitFailureCode} from './connection-feedback.mjs'
import {CONNECTOR_VERSION} from './version.mjs'
import {permissionDraft,permissionSites,pickPermissionFile,validatePermissionFile,savePermissions} from './permissions.mjs'
import {grantCapabilities,fileCapabilities} from './file-capabilities.mjs'
import {validPermissionEntry,permissionEntryUrl,launchPermissionWindow} from './permission-entry.mjs'
import {createSetupReporter} from './setup-progress.mjs'
const own=path.dirname(fileURLToPath(import.meta.url)),ID=/^[A-Za-z0-9]{24}$/
export function managerError(error){
 const map={picker_busy:'另一选择窗口仍在处理，请先取消或完成。',picker_cancelled:'本次选择已取消，原授权未改变。',picker_expired:'连接文件在选择期间已过期，未采用迟到的选择。请在工作台继续这条设备登记并更新连接文件。',picker_timeout:'系统选择窗口等待过久，已结束本次选择。请重试或使用默认专用工作文件夹；原授权未改变。',permission_scope_limit:'最多添加 20 个具体文件或文件夹，请移除不需要的项目。',invalid_permission_file:'请选择真实的本地文件，不能填写网络路径。',invalid_permission_grant:'单个文件只能只读；需要生成报告请另外授权输出文件夹。',file_picker_unavailable:'系统文件选择窗口未能打开，请检查本机桌面会话。',file_not_authorized:'该文件未授权，只能读取明确选中的文件。',edit_target_required:'请先选择要修改的已有连接；不会沿用另一台设备的目录选择。',file_scope_disabled:'此连接仅使用浏览器，不能在这里开放文件权限。',chrome_not_installed:'需要先安装 Google Chrome。本程序不会安装软件或改用其他浏览器。',review_changed:'本机选择已变化，请重新核对并确认。',local_config_changed:'连接配置已变化，请刷新列表后重新确认。',connection_running_or_locked:'原连接仍在运行，请先停止，不要重复启动。',device_already_paired_use_resume:'已有本机配置，请恢复原连接，不要重复导入。',workspace_too_broad_or_private:'请选具体工作子文件夹，不能选择整盘、用户主目录或凭证目录。',workspace_link_or_not_directory:'请选真实本地文件夹，不支持链接目录。',workspace_must_be_local_absolute:'请选择本地文件夹，不支持网络共享目录。',browser_not_enabled:'当前连接没有启用浏览器，不能扩大权限。',folder_picker_unavailable:'系统文件夹窗口不可用，请检查本机桌面会话。',invalid_request:'请求不受支持，未进行操作。',connection_not_confirmed:'未确认，没有绑定或执行。',too_large:'连接文件过大，请选工作台生成的文件。',ENOENT:'未找到原连接配置，请先核查，不要反复绑定。'}
 return map[error?.code]||map[error?.message]||connectionFailureHint(error)||(/过期|凭证|连接文件|授权网站|网站地址|HTTPS|请选择/.test(String(error?.message))?String(error.message).slice(0,240):'本次操作未确认，请核查连接状态；不会自动重试。')
}
export async function createConnectorManager({home=os.homedir(),picker=pickLocalFolder,checkBrowser=verifyChromeInstalled,prepare=prepareGuidedConnection,startChild,clock=Date.now,filePicker=pickPermissionFile,openWindow=launchPermissionWindow,progressReporter}={}){
  const token=randomBytes(32).toString('hex'),children=new Map(),attempts=new Map(),launching=new Set(),uiReadyWaiters=new Set()
  let origin='',pending=null,selectedFolder=null,selectedKind='folder',readOnly=true,revision=randomBytes(12).toString('hex'),editing=null,permissions=null,busy=false,closed=false,uiReady=false
  const markUiReady=()=>{if(uiReady)return;uiReady=true;for(const ready of uiReadyWaiters)ready(true);uiReadyWaiters.clear()}
  const waitForUiReady=(timeoutMs=7000)=>uiReady?Promise.resolve(true):new Promise(resolve=>{let timer;const done=ready=>{clearTimeout(timer);uiReadyWaiters.delete(done);resolve(ready)};uiReadyWaiters.add(done);timer=setTimeout(()=>done(false),timeoutMs)})
  const bump=()=>revision=randomBytes(12).toString('hex')
 const clearReview=()=>{pending=null;selectedFolder=null;selectedKind='folder';readOnly=true;bump()}
 const progress=progressReporter||createSetupReporter({clock})
 let selection=null,lastSelection=null
 const cancelSelection=(entry,reason='cancelled')=>{
  if(entry.cancelRequested)return
  entry.cancelRequested=true;entry.reason=reason;entry.phase='cancelling';entry.controller.abort()
 }
 const chooseLocal=async(kind,scope,targetId=null)=>{
  if(selection)throw Error('picker_busy')
  const ticket=scope==='connect'?pending:null,reviewId=revision
  let settled;const done=new Promise(resolve=>settled=resolve)
  const entry={id:randomBytes(12).toString('hex'),kind,scope,targetId,startedAt:clock(),phase:'opening',cancelRequested:false,reason:null,controller:new AbortController(),done}
  selection=entry
  let outcome='failed'
  if(ticket)progress.stage(kind==='file'?'choosing_file':'choosing_folder')
  const expiry=ticket?setTimeout(()=>{if(selection===entry)cancelSelection(entry,'expired')},Math.max(0,ticket.pairing.expiresAt-clock())):null
  try{
   const picked=await(kind==='file'?filePicker:picker)({signal:entry.controller.signal,onStarted:()=>{if(selection===entry&&!entry.cancelRequested)entry.phase='waiting'}})
   if(!entry.cancelRequested&&picked){
    entry.phase='validating'
   }
   const selected=!entry.cancelRequested&&picked?(kind==='file'?await validatePermissionFile(picked,{home}):await validateWorkspaceChoice(picked,{home})):''
   if(entry.cancelRequested){if(entry.reason==='expired'){outcome='expired';throw Error('picker_expired')};outcome='cancelled';return ''}
   if(closed||selection!==entry)throw Error('picker_cancelled')
   if(ticket){if(pending!==ticket||revision!==reviewId)throw Error('review_changed');validateConnectionTicket(ticket,clock())}
   outcome=selected?'completed':'cancelled';return selected
  }catch(error){
   if(entry.cancelRequested&&entry.reason!=='expired'){outcome='cancelled';return ''}
   if(ticket)progress.stage('error')
   if(entry.reason==='expired'||ticket&&clock()>=ticket.pairing.expiresAt){outcome='expired';throw Error('picker_expired')}
   throw error
  }finally{clearTimeout(expiry);if(selection===entry){selection=null;lastSelection={id:entry.id,kind,scope,outcome,finishedAt:clock()}}settled()}
 }
 const readInput=async req=>{
  let size=0;const chunks=[]
  for await(const data of req){size+=data.length;if(size>20000)throw Error('too_large');chunks.push(data)}
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_request')
  return input
 }

 // Isolate new-device and existing-device drafts. An edit targets one local
 // profile and fingerprint; a changed dropdown cannot transfer its permissions.
 const editTarget=async input=>{
  if(!editing||input.id!==editing.id||input.fingerprint!==editing.fingerprint||input.reviewId!==editing.reviewId)throw Error('edit_target_required')
  const profile=await readGuidedProfile(editing.id,{home})
  if(profile.fingerprint!==editing.fingerprint)throw Error('local_config_changed')
  if(!profile.filesEnabled)throw Error('file_scope_disabled')
  if(children.has(profile.id))throw Error('connection_running_or_locked')
  return profile
 }
 const draftScope=input=>{const scope=input.scope||'connect';if(!['connect','edit'].includes(scope))throw Error('invalid_request');return scope}

 const permissionTarget=async input=>{
  if(!permissions||input.id!==permissions.id||input.fingerprint!==permissions.fingerprint||input.reviewId!==permissions.reviewId)throw Error('review_changed')
  const profile=await readGuidedProfile(input.id,{home});if(profile.fingerprint!==permissions.fingerprint)throw Error('local_config_changed')
  return profile
 }
 const changePermissions=()=>{permissions={...permissions,reviewId:randomBytes(12).toString('hex'),dirty:true}}
 const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&timingSafeEqual(Buffer.from(value),Buffer.from(token))
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
  const connectionStatus=id=>{
   const entry=children.get(id)||attempts.get(id),running=children.has(id)||launching.has(id)||!!entry?.restartTimer
   const stale=entry?.state==='online'&&Date.now()-entry.seen>45000
   const reasonCode=stale?'connection_needs_check':entry?.reasonCode||null
   return {state:stale?'needs-check':entry?.state||'stopped',running,reasonCode,message:reasonCode?connectorFailureMessage(reasonCode):entry?.stopRequested?'本机连接已停止，原账号绑定与授权保留。':null}
  }
  const waitForConnection=async(id,timeoutMs=12000)=>{
   const deadline=Date.now()+timeoutMs
   while(Date.now()<deadline){
    const status=connectionStatus(id)
    if(status.state==='online')return status
    if(['failed','needs-check','stopped'].includes(status.state))throw Error(status.message||status.reasonCode||'connection_needs_check')
    await new Promise(resolve=>setTimeout(resolve,100))
   }
   throw Error('connection_start_timeout')
  }
  const state=async()=>{
  const {profiles,unavailable}=await listGuidedProfiles({home})
  return {version:CONNECTOR_VERSION,profiles:profiles.map(p=>({id:p.id,name:p.name,server:p.server,roots:p.roots,origins:p.origins,browserChannel:p.browserChannel,filesEnabled:p.filesEnabled,browserEnabled:p.browserEnabled,fingerprint:p.fingerprint,...connectionStatus(p.id)})),unavailable,
   review:pending?{reviewId:revision,name:pending.name,server:pending.server,mode:pending.mode,origins:pending.origins,expiresAt:pending.pairing.expiresAt,expired:clock()>=pending.pairing.expiresAt,folder:selectedFolder||'专用工作文件夹',kind:selectedKind,readOnly}:null,selectedFolder,readOnly,reviewId:revision,editing:editing?{...editing}:null,permissions:permissions?structuredClone(permissions):null,selection:selection?{id:selection.id,kind:selection.kind,scope:selection.scope,targetId:selection.targetId,startedAt:selection.startedAt,phase:selection.phase,cancelRequested:selection.cancelRequested}:null,lastSelection,busy}
 }
  const launch=async id=>{
   if(closed)throw Error('connector_start_failed')
   if(children.has(id)||launching.has(id))throw Error('connection_running_or_locked')
   const entry={child:null,state:'starting',reasonCode:null,seen:0,opening:false,lastOpened:0,restartAfterControl:false,stopRequested:false,exited:false}
   attempts.set(id,entry);launching.add(id)
   let child
   try{
    const profile=await readGuidedProfile(id,{home})
    if(profile.browserEnabled&&profile.browserChannel==='chrome')await checkBrowser()
    if(closed||entry.stopRequested){entry.stopRequested=true;entry.state='stopped';return}
    child=startChild?await startChild(profile):fork(path.join(own,'run.mjs'),['run',profile.configFile],{execPath:process.execPath,execArgv:[],silent:true,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:'',STUDIO_LOCAL_MANAGER:'1'}})
    entry.child=child;children.set(id,entry)
   }catch(error){if(entry.stopRequested||closed){entry.state='stopped';return}entry.state='failed';entry.reasonCode=connectorFailureCode(error);throw error}
   finally{launching.delete(id)}
   const current=()=>children.get(id)===entry
   child.on('message',message=>{
    if(!current()||entry.stopRequested||entry.exited||entry.state==='failed')return
    if(message?.type==='studio-local-state'&&['starting','online','needs-check','failed'].includes(message.state)){
     entry.state=message.state;entry.seen=Date.now()
     entry.reasonCode=['online','starting'].includes(message.state)?null:connectorReasonCode(message.reasonCode)||(message.state==='failed'?'connector_start_failed':'connection_needs_check')
    }
    if(message?.type==='studio-control-updated')entry.restartAfterControl=true
   })
  child.on('message',message=>{
    if(message?.type!=='studio-open-permissions')return
    const reply=ok=>{if(child.connected)try{child.send({type:'studio-open-permissions-result',requestId:message.requestId,ok},()=>{})}catch{}}
    if(closed||children.get(id)!==entry||!validPermissionEntry(message)||entry.opening||Date.now()-entry.lastOpened<2000){reply(false);return}
    entry.opening=true
    void (async()=>{
      try{await readGuidedProfile(id,{home});if(closed||message.expiresAt<=Date.now())throw Error('expired');await openWindow(permissionEntryUrl(origin,token,id,message.panel));entry.lastOpened=Date.now();reply(true)}
      catch{reply(false)}finally{entry.opening=false}
    })()
   })
   child.stdout?.on('data',()=>{})
   // Keep only bounded diagnostic input in memory. Raw stderr never reaches UI.
   let stderr=''
   child.stderr?.on('data',chunk=>{if(current())stderr=(stderr+String(chunk)).slice(-4096)})
   child.once('error',error=>{if(current()&&!entry.stopRequested){entry.state=child.pid?'needs-check':'failed';entry.reasonCode=entry.reasonCode||(child.pid?'connection_needs_check':connectorFailureCode(error))}})
   child.once('exit',()=>{if(current()){entry.exited=true;entry.state=entry.stopRequested?'stopped':'failed'}})
   child.once('close',()=>{
    if(!current())return
    children.delete(id)
    const reasonCode=entry.reasonCode||connectorExitFailureCode(stderr)
    const restart=entry.restartAfterControl&&!entry.stopRequested&&!closed&&!reasonCode
    if(entry.stopRequested||closed){entry.state='stopped';entry.reasonCode=null}
    else if(restart){entry.state='starting';entry.reasonCode=null}
    else{entry.state='failed';entry.reasonCode=reasonCode||'connector_exited_unexpectedly'}
    stderr=''
    if(restart)entry.restartTimer=setTimeout(()=>{
     entry.restartTimer=null
     if(!closed&&!entry.stopRequested&&!children.has(id)&&attempts.get(id)===entry)void launch(id).catch(()=>{})
    },250)
   })
   if(closed||entry.stopRequested){entry.stopRequested=true;entry.state='stopping';if(child.connected)child.send({type:'studio-local-stop'},()=>{});else child.kill('SIGTERM')}
  }
 const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/permission-panel.js',['permission-panel.js','text/javascript; charset=utf-8']],['/workbench-home.js',['workbench-home.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]])
 const server=createServer(async(req,res)=>{
  for(const [name,value] of Object.entries({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'}))res.setHeader(name,value)
  if(req.headers.host!==new URL(origin).host||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return json(res,403,{error:'仅限本机连接管理窗口'})
  const route=req.url||'/'
  if(req.method==='GET'&&assets.has(route)){try{const [file,type]=assets.get(route);res.setHeader('Content-Type',type);res.end(await fs.readFile(path.join(own,'ui',file)))}catch{json(res,500,{error:'本机组件不完整，请重新解压完整连接包。'})}return}
  if(!validToken(req.headers['x-connector-session'])||req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'请从本机启动器打开此窗口，不能从其他网页控制本机。'})
  if(req.method==='GET'&&route==='/api/state'){try{const snapshot=await state();markUiReady();return json(res,200,snapshot)}catch(e){return json(res,400,{error:managerError(e)})}}
  if(req.method!=='POST'||req.headers.origin!==origin||!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,403,{error:'本机确认请求无效'})
   // Cancellation remains reachable while the original chooser owns busy.
   if(route==='/api/picker/cancel'){
    try{
     const input=await readInput(req)
     if(Object.keys(input).some(k=>k!=='id')||!/^[a-f0-9]{24}$/.test(input.id||''))throw Error('invalid_request')
     if(selection?.id===input.id){cancelSelection(selection);return json(res,200,{...await state(),notice:'正在取消本次选择，等待系统窗口关闭。'})}
     if(!selection&&lastSelection?.id===input.id)return json(res,200,{...await state(),notice:'这次选择已结束，请核对当前草稿；没有执行新的操作。'})
     throw Error('review_changed')
    }catch(error){return json(res,400,{error:managerError(error),state:await state().catch(()=>null)})}
   }
  if(busy)return json(res,409,{error:'另一操作正在处理，请先核对结果。'})
  busy=true
  try{
    const input=await readInput(req)
   const allowed={'/api/permissions/open':['id','fingerprint'],'/api/permissions/sites':['id','fingerprint','reviewId','text'],'/api/permissions/pick':['id','fingerprint','reviewId','kind'],'/api/permissions/grant':['id','fingerprint','reviewId','key','remove','readOnly','capabilities'],'/api/permissions/save':['id','fingerprint','reviewId','consent'],'/api/permissions/discard':['id','fingerprint','reviewId'],'/api/prepare':['ticket'],'/api/discard':['reviewId'],'/api/edit-select':['id','fingerprint'],'/api/folder':['scope','id','fingerprint','reviewId'],'/api/file':[],'/api/access':['scope','id','fingerprint','reviewId','readOnly'],'/api/connect':['reviewId','consent'],'/api/resume':['id','fingerprint','consent'],'/api/stop':['id','consent'],'/api/folder-save':['id','fingerprint','reviewId','consent'],'/api/chrome':['id','fingerprint','consent']}
   if(!allowed[route]||Object.keys(input).some(key=>!allowed[route].includes(key)))throw Error('invalid_request')
   if(['/api/resume','/api/stop','/api/folder-save','/api/chrome'].includes(route)&&(!ID.test(input.id||'')||input.consent!==true))throw Error('connection_not_confirmed')
   let notice=''
   if(route==='/api/permissions/open'){
    const next=await permissionDraft(input.id,{home});if(next.fingerprint!==input.fingerprint)throw Error('local_config_changed')
    permissions=next;notice='可以增删网站、选择文件或文件夹。保存前请停止此连接；其他设备不受影响。'
   }else if(route.startsWith('/api/permissions/')){
    await permissionTarget(input)
    if(route==='/api/permissions/discard'){permissions=null;notice='已放弃本次授权修改，原配置未改变。'}
    else if(route==='/api/permissions/sites'){
      permissions.origins=permissionSites(input.text);changePermissions();notice='网站列表已更新到草稿，尚未生效。'
    }else if(route==='/api/permissions/pick'){
      if(!['file','folder'].includes(input.kind)||permissions.grants.length>=20)throw Error('permission_scope_limit')
      const selected=await chooseLocal(input.kind,'permissions',input.id)
      if(selected){
        const target=selected
        if(!permissions.grants.some(g=>g.path.toLowerCase()===target.toLowerCase()&&g.kind===input.kind)){
          permissions.grants.push({key:randomBytes(12).toString('hex'),kind:input.kind,path:target,label:path.basename(target),readOnly:true,capabilities:fileCapabilities()});changePermissions()
        }
        notice='已加入授权草稿，默认只读；请检查是否还保留了不需要的整目录授权。'
      }else notice='已取消选择，授权草稿未改变。'
    }else if(route==='/api/permissions/grant'){
      const grant=permissions.grants.find(g=>g.key===input.key);if(!grant)throw Error('review_changed')
      if(input.remove===true){if(input.readOnly!==undefined||input.capabilities!==undefined)throw Error('invalid_permission_grant');permissions.grants=permissions.grants.filter(g=>g.key!==input.key)}
      else{if(input.remove!==undefined||typeof input.readOnly!=='boolean'||grant.kind==='file'&&!input.readOnly)throw Error('invalid_permission_grant');if(input.capabilities===undefined&&Object.values(fileCapabilities(grant.capabilities)).some(Boolean))throw Error('file_capabilities_required');const capabilities=grantCapabilities(input.capabilities,input.readOnly,grant.kind==='file');grant.readOnly=input.readOnly;grant.capabilities=capabilities}
      changePermissions()
    }else if(route==='/api/permissions/save'){
      if(input.consent!==true||!permissions.dirty)throw Error('connection_not_confirmed')
      if(children.has(input.id))throw Error('connection_running_or_locked')
      await savePermissions(permissions,{home,confirm:async()=>true,checkBrowser});permissions=null;editing=null
      notice='授权已保存，设备身份和绑定不变。点击恢复连接使新范围上线；旧授权下排队的操作不会自动继续。'
    }
   }else if(route==='/api/prepare'){
    // A rejected replacement file cannot leave the old account's ticket armed.
    progress.stop();clearReview()
    const ticket=validateConnectionTicket(input.ticket,clock());if(ticket.mode!=='files')await checkBrowser()
    pending=ticket;progress.start(ticket);notice='文件已读取，尚未绑定。请核对服务器、用途和文件夹。'
   }else if(route==='/api/discard'){
    if(input.reviewId!==revision)throw Error('review_changed')
    progress.finish('cancelled');clearReview();notice='已取消本次连接准备。已有设备、账号绑定和文件均未改变。'
   }else if(route==='/api/edit-select'){
    editing=null
    if(input.id){
      if(!ID.test(input.id))throw Error('edit_target_required')
      const profile=await readGuidedProfile(input.id,{home})
      if(profile.fingerprint!==input.fingerprint)throw Error('local_config_changed')
      if(!profile.filesEnabled)throw Error('file_scope_disabled')
      editing={id:profile.id,fingerprint:profile.fingerprint,folder:null,readOnly:true,reviewId:randomBytes(12).toString('hex')}
    }
   }else if(route==='/api/file'){
     if(!pending||pending.mode==='browser')throw Error('file_scope_disabled');validateConnectionTicket(pending,clock())
     const picked=await chooseLocal('file','connect');if(picked){validateConnectionTicket(pending,clock());selectedFolder=picked;selectedKind='file';readOnly=true;bump();progress.stage('ready_to_confirm');notice='已选择一个文件，只授权此文件读取；其父目录和其他文件不会开放。'}else{progress.stage('selection_cancelled');notice='已取消选择，原设置未改变。'}
   }else if(route==='/api/folder'){
    const scope=draftScope(input)
    if(scope==='edit')await editTarget(input)
    else {if(input.id||input.fingerprint||!pending)throw Error('review_changed');validateConnectionTicket(pending,clock());if(pending.mode==='browser')throw Error('file_scope_disabled')}
    const picked=await chooseLocal('folder',scope,input.id||null)
    if(picked){
      const folder=picked
      if(scope==='edit')editing={...editing,folder,readOnly:true,reviewId:randomBytes(12).toString('hex')}
      else {validateConnectionTicket(pending,clock());selectedFolder=folder;selectedKind='folder';readOnly=true;bump();progress.stage('ready_to_confirm')}
      notice='已选文件夹，默认只读；尚未保存或连接。'
    }else{if(scope==='connect')progress.stage('selection_cancelled');notice='已取消选择，原设置未改变。'}
   }else if(route==='/api/access'){
    if(typeof input.readOnly!=='boolean')throw Error('invalid_request')
    if(draftScope(input)==='edit'){
      await editTarget(input);if(!editing.folder)throw Error('edit_target_required')
      editing={...editing,readOnly:input.readOnly,reviewId:randomBytes(12).toString('hex')}
    }else{
      if(input.id||input.fingerprint||!pending)throw Error('review_changed')
      validateConnectionTicket(pending,clock());if(pending.mode==='browser')throw Error('file_scope_disabled')
      if(selectedKind==='file'&&!input.readOnly)throw Error('invalid_permission_grant');readOnly=input.readOnly;bump()
    }
    notice='请核对新的文件权限，再确认。'
   }else if(route==='/api/connect'){
    if(!pending||input.consent!==true||input.reviewId!==revision)throw Error('review_changed')
    const ticket=validateConnectionTicket(pending,clock()),folder=selectedFolder,ro=readOnly
    // Existing setup creates its dedicated directory with symlink checks. The
    // local choice controls a dedicated folder's permission too, never remote input.
    progress.stage('confirming')
    const result=await prepare(ticket,{home,chooseWorkspace:folder?async()=>({path:folder,readOnly:ro,kind:selectedKind}):undefined,defaultReadOnly:ro,confirm:async()=>true,checkBrowser})
    progress.stop();clearReview();await launch(result.id);notice='连接启动请求已提交，请以下方实时设备状态为准。'
   }else if(route==='/api/stop'){
    const entry=children.get(input.id)||((launching.has(input.id)||attempts.get(input.id)?.restartTimer)?attempts.get(input.id):null);if(entry){entry.stopRequested=true;entry.restartAfterControl=false;entry.reasonCode=null;clearTimeout(entry.restartTimer);entry.restartTimer=null;entry.state=entry.child&&!entry.exited?'stopping':'stopped';if(entry.child&&!entry.exited){if(entry.child.connected)entry.child.send({type:'studio-local-stop'},()=>{});else entry.child.kill('SIGTERM')}}
    notice='已请求停止本程序启动的连接，账号绑定保留；已发生的外部效果不会撤销。'
   }else{
    const profile=await readGuidedProfile(input.id,{home});if(input.fingerprint!==profile.fingerprint)throw Error('local_config_changed')
    if(route==='/api/resume'){await launch(input.id);notice='正在恢复原连接，不新增配对、不扩大授权。'}
    else if(route==='/api/chrome'){if(children.has(input.id))throw Error('connection_running_or_locked');await changeGuidedBrowser(input.id,{home,confirm:async()=>true,checkBrowser});notice='已切换为 Chrome；请恢复连接。'}
    else if(route==='/api/folder-save'){
     await editTarget(input);if(!editing.folder)throw Error('review_changed')
     await changeGuidedWorkspace(input.id,{home,choose:async()=>({path:editing.folder,readOnly:editing.readOnly}),confirm:async()=>true});editing=null;notice='授权目录已更新，设备身份不变；请恢复连接。'
    }
   }
   busy=false;return json(res,200,{...await state(),notice})
  }catch(e){if(route==='/api/connect'&&pending)progress.stage('error');busy=false;return json(res,400,{error:managerError(e),state:await state().catch(()=>null)})}finally{busy=false}
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 origin='http://127.0.0.1:'+server.address().port
 const close=async()=>{
  if(closed)return;closed=true
  progress.close();if(selection){const active=selection;cancelSelection(active,'manager_closed');await active.done}
   for(const id of launching){const entry=attempts.get(id);if(entry)entry.stopRequested=true}
   for(const entry of attempts.values())if(entry.restartTimer){clearTimeout(entry.restartTimer);entry.restartTimer=null;entry.stopRequested=true;entry.state='stopped'}
  await Promise.all([...children.values()].map(entry=>new Promise(resolve=>{const {child}=entry;entry.stopRequested=true;entry.restartAfterControl=false;entry.reasonCode=null;const timer=setTimeout(resolve,6000);child.once('close',()=>{clearTimeout(timer);resolve()});try{if(child.connected)child.send({type:'studio-local-stop'},()=>{});else child.kill('SIGTERM')}catch{clearTimeout(timer);resolve()}})))
  server.closeIdleConnections();await new Promise(resolve=>server.close(resolve))
 }
  return {origin,token,close,waitForUiReady,waitForConnection,resumeSaved:async(id,fingerprint)=>{const p=await readGuidedProfile(id,{home});if(p.fingerprint!==fingerprint)throw Error('local_config_changed');await launch(id)}}
}
/** Daily startup should stay out of the way: a single saved connection is
 * resumed in the background. Pairing/settings UI is opened only for first use,
 * ambiguous profiles, a failed resume, or an explicit --manage request. */
export async function openConnectorStartup({chrome,manager,saved,manage=false,startBrowser=spawn,logger=console,uiTimeoutMs=7000}){
  let restored=false
  if(saved.profiles.length===1&&!saved.unavailable&&!saved.truncated){
    const profile=saved.profiles[0]
    try{
      await manager.resumeSaved(profile.id,profile.fingerprint)
      if(typeof manager.waitForConnection!=='function')throw Error('connection_status_unavailable')
      const confirmed=await manager.waitForConnection(profile.id)
      if(confirmed?.state!=='online'||confirmed.running===false)throw Error('connection_not_confirmed')
      restored=true
    }
    catch{logger.warn('已有连接未能确认上线，将打开本机设置窗口核对原连接；无需重新配对。')}
  }
  if(restored&&!manage){
    logger.log('唯一的已保存连接已在后台恢复。日常文件、浏览器和授权操作请回到 Agent Studio 工作台；无需打开本机管理窗口。需要首次配对或查看本机设置时，双击 Manage-Connector.cmd。')
    logger.log('只有工作台显示设备“已在线”才是连接成功。请保持连接器进程运行；关闭后连接会离线。')
    return {managerUiReady:false,restored:true,uiOpened:false}
  }
  const url=manager.origin+'/#'+manager.token
  const open=args=>{
    try{
      const child=startBrowser(chrome,args,{shell:false,windowsHide:false,stdio:'ignore',detached:false})
      child.once?.('error',()=>logger.error('Chrome未能打开本机设置窗口，请检查浏览器权限。'))
      child.unref?.()
      return true
    }catch{logger.error('Chrome未能启动本机设置窗口，请检查Chrome安装与安全策略。');return false}
  }
  open(['--new-window','--app='+url])
  let visible=await manager.waitForUiReady(uiTimeoutMs)
  if(!visible){logger.warn('尚未检测到本机设置窗口，改用Chrome普通窗口再次打开。');open(['--new-window',url]);visible=await manager.waitForUiReady(uiTimeoutMs)}
  if(visible)logger.log('本机设置窗口已打开。新连接：请选择工作台下载的 JSON 连接文件，核对账号、网站和文件权限，再点击“确认连接并启动”。')
  else logger.error('连接器进程已启动，但没有检测到本机设置窗口。这不是新设备配对成功，请检查Chrome窗口、任务栏和系统弹窗拦截。')
  if(restored)logger.log('已尝试恢复原有设备；它的上线不代表刚创建的新设备已经绑定，新设备仍需单独导入连接文件。')
  logger.log('只有工作台显示新设备“已在线”才是连接成功。请保持此进程运行；关闭后连接会离线。')
  return {managerUiReady:visible,restored,uiOpened:true}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2)
    if(args.length>1||args.some(arg=>arg!=='--manage'))throw Error('invalid_request')
    const manage=args.includes('--manage')
    const chrome=await verifyChromeInstalled(),manager=await createConnectorManager()
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void manager.close().finally(()=>process.exit()))
    const saved=await listGuidedProfiles()
    await openConnectorStartup({chrome,manager,saved,manage})
  }catch(e){console.error(managerError(e));process.exitCode=1}
}
