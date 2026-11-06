import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createHash,randomBytes} from 'node:crypto'
import {permissionSites,validatePermissionFile,pickPermissionFile} from './permissions.mjs'
import {validateWorkspaceChoice,pickLocalFolder} from './workspace.mjs'
import {verifyChromeInstalled} from './browser-settings.mjs'
import {grantCapabilities,capabilityDescription} from './file-capabilities.mjs'

import {CONNECTOR_VERSION} from './version.mjs'
export {CONNECTOR_VERSION}
const fresh=()=>randomBytes(12).toString('hex')
const revision=(text,c)=>c.permissionManagementRevision||c.permissionRevision||createHash('sha256').update(text).digest('hex').slice(0,24)
const cancelled=()=>({ok:false,cancelled:true,result:'已取消，原授权未改变。'})
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('invalid_control_request')}
async function snapshot(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>48000)throw Error('invalid_local_config');const text=await fs.readFile(file,'utf8'),config=JSON.parse(text);return {text,config,revision:revision(text,config)}}
function grants(c){return c.files?.enabled===false?[]:(c.roots||[]).filter(r=>r.name!=='scope_empty').map(r=>({id:r.name,label:String(r.label||path.basename(r.path)).slice(0,180),kind:r.allowedFiles?'file':'folder',read_only:!!r.allowedFiles||r.readOnly===true,capabilities:grantCapabilities(r.capabilities,!!r.allowedFiles||r.readOnly===true,!!r.allowedFiles)}))}

import {confirmNative} from './native-confirmation.mjs'
export {REVIEW_SCRIPT,confirmNative} from './native-confirmation.mjs'

/** Called by the single lock-owning local worker, never by a model tool. */
export function createWorkbenchControl({configFile,home=os.homedir(),api,confirm=confirmNative,pickFile=pickPermissionFile,pickFolder=pickLocalFolder,checkBrowser=verifyChromeInstalled,clock=Date.now,onActivity=()=>{}}){
 const pending=new Map()
 let appliedRevision=''
 async function summary(state='online'){
  const s=await snapshot(configFile)
  return {protocol:'permissions-v2',version:CONNECTOR_VERSION,revision:s.revision,applied_revision:appliedRevision,sites:s.config.browser?.enabled?permissionSites((s.config.browser.allowedOrigins||[]).join('\n')):[],grants:grants(s.config),state:appliedRevision===s.revision?state:'needs-check'}
 }
 async function markApplied(){appliedRevision=(await snapshot(configFile)).revision;return appliedRevision}
 async function execute(control,parentSignal){
  if(!control||!/^[A-Za-z0-9]{24}$/.test(control.id||'')||!['sites-save','file-pick','grant-save','grant-edit'].includes(control.action)||!Number.isFinite(control.deadline_ms)||control.deadline_ms<=clock())throw Error('invalid_control_request')
  const p=control.payload
  const fields={'sites-save':['permission_revision','origins'],'file-pick':['permission_revision','kind'],'grant-save':['permission_revision','grant_id','read_only','capabilities'],'grant-edit':['permission_revision','root_id','read_only','remove','capabilities']}
  exact(p,fields[control.action]);if(!/^[a-f0-9]{24}$/.test(p.permission_revision||''))throw Error('invalid_control_request')
  const lock=JSON.parse(await fs.readFile(configFile+'.run.lock','utf8'));if(lock.pid!==process.pid)throw Error('connection_lock_required')
  const before=await snapshot(configFile)
  if(before.revision!==p.permission_revision||appliedRevision!==before.revision)throw Error('local_config_changed')
  const abort=new AbortController(),signal=AbortSignal.any([abort.signal,AbortSignal.timeout(Math.min(240000,control.deadline_ms-clock())),...(parentSignal?[parentSignal]:[])])
  let committing=false,checking=null,wrote=false
  const active=()=>{
   if(committing||signal.aborted)return Promise.resolve()
   if(checking)return checking
   checking=(async()=>{
    try{const status=await api('/control-check',{id:control.id,claim:control.claim},signal);if(!status.active)abort.abort();else {await api('/control-poll',{summary:await summary(),heartbeat_only:true},signal);onActivity()}}catch{abort.abort()}
   })().finally(()=>{checking=null})
   return checking
  }
  await active();signal.throwIfAborted()
  const timer=setInterval(()=>void active(),1000)
  try{
   for(const [id,g] of pending)if(g.expires<=clock()||g.revision!==before.revision)pending.delete(id)
   if(control.action==='file-pick'){
    if(!['file','folder'].includes(p.kind))throw Error('invalid_control_request')
    if(pending.size>=20)throw Error('permission_scope_limit')
    const picked=await (p.kind==='file'?pickFile:pickFolder)({signal})
    signal.throwIfAborted();if(!picked)return cancelled()
    const target=p.kind==='file'?await validatePermissionFile(picked,{home}):await validateWorkspaceChoice(picked,{home})
    if((await snapshot(configFile)).text!==before.text)throw Error('local_config_changed')
    const id=fresh(),expires=clock()+300000
    const covered=(before.config.files?.enabled!==false)&&(before.config.roots||[]).some(r=>!r.allowedFiles&&!path.relative(r.path,target).startsWith('..')&&!path.isAbsolute(path.relative(r.path,target)))
    pending.set(id,{target,kind:p.kind,revision:before.revision,expires})
    return {ok:true,result:JSON.stringify({grant_id:id,kind:p.kind,label:path.basename(target),permission_revision:before.revision,expires_at:expires,covered_by_folder:covered})}
   }
   let next=structuredClone(before.config),details='',selected=null
   if(control.action==='sites-save'){
    if(!Array.isArray(p.origins))throw Error('invalid_permission_sites')
    const sites=permissionSites(p.origins.join('\n'));if(sites.length!==p.origins.length||sites.some((v,i)=>v!==p.origins[i]))throw Error('invalid_permission_sites')
    if(sites.length)await checkBrowser()
    next.browser={...next.browser,enabled:sites.length>0,allowedOrigins:sites,channel:next.browser?.channel||'chrome'}
    details='新的允许访问网站：\n'+(sites.join('\n')||'无：关闭浏览器网站访问')
   }else if(control.action==='grant-save'){
    if(typeof p.read_only!=='boolean'||!/^[a-f0-9]{24}$/.test(p.grant_id||''))throw Error('invalid_control_request')
    selected=pending.get(p.grant_id);if(!selected||selected.expires<=clock()||selected.revision!==before.revision)throw Error('local_grant_expired')
    const target=selected.kind==='file'?await validatePermissionFile(selected.target,{home}):await validateWorkspaceChoice(selected.target,{home})
    const readOnly=selected.kind==='file'||p.read_only
    const capabilities=grantCapabilities(p.capabilities,readOnly,selected.kind==='file')
    const roots=next.files?.enabled===false?[]:(next.roots||[]).filter(r=>r.name!=='scope_empty')
    if(roots.length>=20)throw Error('permission_scope_limit')
    const item={name:'scope_'+fresh(),path:selected.kind==='file'?path.dirname(target):target,label:selected.kind==='file'?'文件：'+path.basename(target):path.basename(target),readOnly,capabilities,...(selected.kind==='file'?{allowedFiles:[path.basename(target)]}:{})}
    if(roots.some(r=>path.resolve(r.path).toLowerCase()===path.resolve(item.path).toLowerCase()&&JSON.stringify(r.allowedFiles||[])===JSON.stringify(item.allowedFiles||[])))throw Error('permission_grant_duplicate')
    next.roots=[...roots,item];next.files={...next.files,enabled:true};next.office={...next.office,enabled:true}
    details='新增'+(selected.kind==='file'?'文件':'文件夹')+'：\n'+target+'\n权限：'+capabilityDescription(readOnly,capabilities)+'\n注意：不会自动取消已有的整文件夹授权。'
   }else{
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(p.root_id||''))throw Error('invalid_control_request')
    const root=(next.files?.enabled!==false?next.roots:[])?.find(r=>r.name===p.root_id);if(!root)throw Error('local_config_changed')
    if(p.remove===true){
     if(p.read_only!==undefined||p.capabilities!==undefined)throw Error('invalid_control_request')
     next.roots=next.roots.filter(r=>r.name!==p.root_id);details='取消访问权限（不会删除文件）：\n'+root.path
     if(!next.roots.length){next.roots=[{name:'scope_empty',path:next.browserWorkDirectory||root.path,readOnly:true}];next.files={...next.files,enabled:false};next.office={...next.office,enabled:false}}
    }else{
     if(typeof p.read_only!=='boolean'||p.remove!==undefined||root.allowedFiles&&!p.read_only)throw Error('invalid_permission_grant')
     if(p.capabilities===undefined&&Object.values(grantCapabilities(root.capabilities,!!root.allowedFiles||root.readOnly===true,!!root.allowedFiles)).some(Boolean))throw Error('file_capabilities_required')
     const capabilities=grantCapabilities(p.capabilities,p.read_only,!!root.allowedFiles)
     root.readOnly=p.read_only;root.capabilities=capabilities;details='修改文件权限：\n'+root.path+'\n改为：'+capabilityDescription(p.read_only,capabilities)
    }
   }
   const review={message:'设备：'+String(before.config.deviceName||'本机设备')+'\n工作台：'+before.config.server+'\n\n'+details+'\n\n是否确认？确认后自动应用；无需重新配对。'}
   if(!await confirm(review,signal)){signal.throwIfAborted();return cancelled()}
   signal.throwIfAborted()
   if((await snapshot(configFile)).text!==before.text)throw Error('local_config_changed')
   if(selected&&selected.expires<=clock())throw Error('local_grant_expired')
   // Commit fence makes a web cancellation win before any file write. Once this
   // fence is granted, the UI explicitly says applying, not cancellable.
   clearInterval(timer)
   // Drain the last status check before commit; its late reply must not abort an accepted commit.
   await active();signal.throwIfAborted();committing=true
   await api('/control-commit',{id:control.id,claim:control.claim},signal)
   signal.throwIfAborted()
   if((await snapshot(configFile)).text!==before.text)throw Error('local_config_changed')
   const rev=fresh();next.permissionRevision=rev;next.permissionManagementRevision=rev
   const tmp=configFile+'.'+fresh()+'.tmp'
   try{await fs.writeFile(tmp,JSON.stringify(next,null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,configFile);wrote=true}finally{await fs.unlink(tmp).catch(()=>{})}
   pending.clear()
   return {ok:true,changed:true,revision:rev,result:JSON.stringify({revision:rev,saved:true,notice:'本机已保存，正在确认新授权生效。'})}
  }catch(error){
   if(wrote)return {ok:true,changed:true,result:JSON.stringify({saved:true,notice:'已保存，正在核实生效状态。'})}
   if(committing){
    // A lost commit reply is not a saved configuration. Prove the original bytes remain.
    const unchanged=await snapshot(configFile).then(value=>value.text===before.text,()=>false)
    if(unchanged)return {ok:false,unchanged:true,result:JSON.stringify({saved:false,revision:before.revision,notice:'本次授权未保存，电脑仍使用原授权范围。请检查连接后重试。'})}
   }
   throw error
  }
  finally{clearInterval(timer)}
 }
 return {summary,markApplied,execute}
}
