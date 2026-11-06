import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {pickNative} from './native-picker.mjs'
import {randomBytes,createHash} from 'node:crypto'
import {readGuidedProfile} from './profiles.mjs'
import {acquireConnectionLock,validateWorkspaceChoice,pickLocalFolder} from './workspace.mjs'
import {connectionOrigins} from '../src/lib/localConnectionSetup.ts'
import {verifyChromeInstalled} from './browser-settings.mjs'
import {grantCapabilities} from './file-capabilities.mjs'

const privatePart=/^(?:\.agent-studio(?:-trash)?|\.ssh|\.aws|\.azure|\.gnupg|\.config|\.local|\.git|\.codex|\.env.*|pb_data|node_modules|appdata|windows|program files(?: \(x86\))?|programdata|credentials.*|.*\.(?:db(?:-wal|-shm)?|sqlite\d*(?:-wal|-shm)?|pem|key|pfx|p12))$/i
const key=()=>randomBytes(12).toString('hex')
function exactPayload(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('invalid_control_request')}
export const pickPermissionFile=options=>pickNative('file',options)
/** File-only grants never authorize the parent directory or neighbouring files. */
export async function validatePermissionFile(selected,{home=os.homedir()}={}){
  if(typeof selected!=='string'||selected.length>2000||/[\x00-\x1f\x7f]/.test(selected)||!path.isAbsolute(selected)||/^(?:\\\\|\/\/)/.test(selected))throw Error('invalid_permission_file')
  const target=path.resolve(selected),parts=target.slice(path.parse(target).root.length).split(path.sep)
  if(parts.some(p=>privatePart.test(p)||p.endsWith('.')||p.endsWith(' ')||p.includes(':')||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))throw Error('private_file_denied')
  const sensitive=path.join(home,'.agent-studio'),relative=path.relative(sensitive,target)
  if(!relative||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw Error('private_file_denied')
  let cursor=path.parse(target).root
  for(let i=0;i<parts.length;i++){
    cursor=path.join(cursor,parts[i]);const stat=await fs.lstat(cursor)
    if(stat.isSymbolicLink()||(i<parts.length-1?!stat.isDirectory():!stat.isFile()||stat.nlink!==1))throw Error('linked_path_denied')
  }
  return fs.realpath(target)
}
export async function permissionDraft(id,{home=os.homedir()}={}){
  const profile=await readGuidedProfile(id,{home})
  const config=JSON.parse(await fs.readFile(profile.configFile,'utf8'))
  const grants=profile.filesEnabled?config.roots.flatMap(r=>r.allowedFiles?
    r.allowedFiles.map(name=>({key:key(),kind:'file',path:path.join(r.path,name),label:name,readOnly:true,capabilities:grantCapabilities(r.capabilities,true,true)})):
    [{key:key(),kind:'folder',path:r.path,label:r.label||path.basename(r.path),readOnly:r.readOnly===true,capabilities:grantCapabilities(r.capabilities,r.readOnly===true)}]):[]
  if(grants.length>20)throw Error('permission_scope_limit')
  return {id:profile.id,name:profile.name,server:profile.server,fingerprint:profile.fingerprint,reviewId:key(),origins:[...profile.origins],grants,dirty:false}
}
export function permissionSites(text){
  if(typeof text!=='string'||text.length>12000)throw Error('invalid_permission_sites')
  return connectionOrigins(text)
}
/** Apply a workbench-origin edit inside the authenticated local worker only.
 * The revision is checked against the exact on-disk config and the user must
 * confirm in a native Windows dialog. The worker then exits so the manager
 * can restart it with the new runtime catalog. */
export async function pickWorkbenchGrant(control,pending,{configFile,home=os.homedir(),pickFile=pickPermissionFile,pickFolder=pickLocalFolder,clock=Date.now}={}){
  exactPayload(control?.payload,['kind','permission_revision'])
  if(!control||control.action!=='file-pick'||!control.payload||!['file','folder'].includes(control.payload.kind)||typeof control.payload.permission_revision!=='string'||! /^[a-f0-9]{24}$/.test(control.payload.permission_revision))throw Error('invalid_control_request')
  if(typeof configFile!=='string')throw Error('invalid_control_request')
  const config=JSON.parse(await fs.readFile(configFile,'utf8'))
  if((config.permissionManagementRevision||config.permissionRevision)!==control.payload.permission_revision)throw Error('local_config_changed')
  const selected=control.payload.kind==='file'?await pickFile():await pickFolder()
  if(!selected)return {ok:false,cancelled:true,result:'已取消文件选择，没有修改授权。'}
  const target=control.payload.kind==='file'?await validatePermissionFile(selected,{home}):await validateWorkspaceChoice(selected,{home})
  const grantId=key(),label=path.basename(target)
  pending.set(grantId,{path:target,kind:control.payload.kind,label,permissionRevision:control.payload.permission_revision,expiresAt:clock()+300000})
  return {ok:true,result:JSON.stringify({grant_id:grantId,kind:control.payload.kind,label,permission_revision:control.payload.permission_revision,expires_at:clock()+300000})}
}
export async function applyWorkbenchGrantControl(configFile,control,pending,{confirm=async()=>false,home=os.homedir(),clock=Date.now}={}){
  exactPayload(control?.payload,['grant_id','permission_revision','read_only','capabilities'])
  if(!control||control.action!=='grant-save'||!control.payload||typeof control.payload.grant_id!=='string'||!/^[a-f0-9]{24}$/.test(control.payload.permission_revision)||typeof control.payload.read_only!=='boolean')throw Error('invalid_control_request')
  const grant=pending.get(control.payload.grant_id)
  if(!grant||grant.expiresAt<=clock()||grant.permissionRevision!==control.payload.permission_revision)throw Error('local_grant_expired')
  const before=await fs.readFile(configFile,'utf8'),config=JSON.parse(before)
  if((config.permissionManagementRevision||config.permissionRevision)!==control.payload.permission_revision)throw Error('local_config_changed')
  if(!Array.isArray(config.roots)||config.roots.length>=20)throw Error('permission_scope_limit')
  const target=grant.kind==='file'?await validatePermissionFile(grant.path,{home}):await validateWorkspaceChoice(grant.path,{home})
  const capabilities=grantCapabilities(control.payload.capabilities,grant.kind==='file'||control.payload.read_only,grant.kind==='file')
  const root={name:'scope_'+key(),path:grant.kind==='file'?path.dirname(target):target,label:grant.kind==='file'?'文件：'+path.basename(target):path.basename(target),readOnly:grant.kind==='file'||control.payload.read_only,capabilities,...(grant.kind==='file'?{allowedFiles:[path.basename(target)]}:{})}
  if(config.roots.some(r=>path.resolve(r.path)===path.resolve(root.path)&&JSON.stringify(r.allowedFiles||[])===JSON.stringify(root.allowedFiles||[])))throw Error('permission_grant_duplicate')
  if(!await confirm({kind:grant.kind,label:grant.label,readOnly:root.readOnly,capabilities,server:config.server}))return {ok:false,cancelled:true,result:'已在本机取消文件授权，原配置未改变。'}
  if(await fs.readFile(configFile,'utf8')!==before)throw Error('local_config_changed')
  const nextRevision=key(),updated={...config,permissionRevision:nextRevision,permissionManagementRevision:nextRevision,roots:[...config.roots,root],files:{...config.files,enabled:true},office:{...config.office,enabled:true}}
  const temporary=configFile+'.'+key()+'.tmp'
  try{await fs.writeFile(temporary,JSON.stringify(updated,null,2),{flag:'wx',mode:0o600});await fs.rename(temporary,configFile)}finally{await fs.unlink(temporary).catch(()=>{})}
  pending.delete(control.payload.grant_id)
  return {ok:true,restart:true,result:'本机已确认并保存文件授权，连接器正在使用新范围重新启动。'}
}
export async function applyWorkbenchSiteControl(configFile,control,{confirm=async()=>false}={}){
  exactPayload(control?.payload,['origins','permission_revision'])
  if(!control||control.action!=='sites-save'||!control.payload||!Array.isArray(control.payload.origins)||typeof control.payload.permission_revision!=='string'||! /^[a-f0-9]{24}$/.test(control.payload.permission_revision))throw Error('invalid_control_request')
  const before=await fs.readFile(configFile,'utf8'),config=JSON.parse(before)
  if((config.permissionManagementRevision||config.permissionRevision)!==control.payload.permission_revision)throw Error('local_config_changed')
  const origins=permissionSites(control.payload.origins.join('\n'))
  if(origins.length!==control.payload.origins.length||origins.some((v,i)=>v!==control.payload.origins[i]))throw Error('invalid_permission_sites')
  if(!await confirm({origins:[...origins],server:config.server,deviceName:config.deviceName||'本机设备'}))return {ok:false,cancelled:true,result:'已在本机取消网站授权修改，原配置未改变。'}
  if(await fs.readFile(configFile,'utf8')!==before)throw Error('local_config_changed')
  const nextRevision=randomBytes(12).toString('hex'),updated={...config,permissionRevision:nextRevision,permissionManagementRevision:nextRevision,browser:{...config.browser,enabled:origins.length>0,allowedOrigins:origins}}
  const temporary=configFile+'.'+randomBytes(12).toString('hex')+'.tmp'
  try{await fs.writeFile(temporary,JSON.stringify(updated,null,2),{flag:'wx',mode:0o600});await fs.rename(temporary,configFile)}finally{await fs.unlink(temporary).catch(()=>{})}
  return {ok:true,restart:true,result:'本机已确认并保存网站授权；连接器正在使用新授权重新启动。'}
}
/** Configuration CAS + active-process lock. Never reads/writes credentials or starts a process. */
export async function savePermissions(draft,{home=os.homedir(),confirm,checkBrowser=verifyChromeInstalled}={}){
  if(!draft||!Array.isArray(draft.grants)||draft.grants.length>20)throw Error('permission_scope_limit')
  const profile=await readGuidedProfile(draft.id,{home})
  if(profile.fingerprint!==draft.fingerprint)throw Error('local_config_changed')
  const release=await acquireConnectionLock(profile.configFile)
  try{
    const before=await fs.readFile(profile.configFile,'utf8')
    if(createHash('sha256').update(before).digest('hex')!==draft.fingerprint)throw Error('local_config_changed')
    const config=JSON.parse(before),origins=permissionSites(draft.origins.join('\n')),roots=[]
    for(const grant of draft.grants){
      if(!['file','folder'].includes(grant.kind)||typeof grant.readOnly!=='boolean')throw Error('invalid_permission_grant')
      const target=grant.kind==='file'?await validatePermissionFile(grant.path,{home}):await validateWorkspaceChoice(grant.path,{home})
      const capabilities=grantCapabilities(grant.capabilities,grant.kind==='file'||grant.readOnly,grant.kind==='file')
      // Older draft clients may omit new fields, but cannot silently erase an
      // existing explicit grant when saving an unrelated website change.
      if(grant.capabilities===undefined&&config.roots.some(r=>path.resolve(r.path)===path.resolve(grant.kind==='file'?path.dirname(target):target)&&Object.values(grantCapabilities(r.capabilities,!!r.allowedFiles||r.readOnly===true,!!r.allowedFiles)).some(Boolean)))throw Error('file_capabilities_required')
      roots.push({name:'scope_'+randomBytes(6).toString('hex'),path:grant.kind==='file'?path.dirname(target):target,label:grant.kind==='file'?'文件：'+path.basename(target):path.basename(target),readOnly:grant.kind==='file'||grant.readOnly,capabilities,...(grant.kind==='file'?{allowedFiles:[path.basename(target)]}:{})})
    }
    if(origins.length)await checkBrowser()
    if(typeof confirm!=='function'||!await confirm({name:profile.name,server:profile.server,origins,grants:draft.grants}))return {cancelled:true}
    if(await fs.readFile(profile.configFile,'utf8')!==before)throw Error('local_config_changed')
    const scratch=path.join(path.dirname(profile.configFile),'browser-work')
    await fs.mkdir(scratch,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e})
    const st=await fs.lstat(scratch);if(st.isSymbolicLink()||!st.isDirectory())throw Error('linked_setup_directory_denied')
    const nextRevision=key(),updated={...config,permissionRevision:nextRevision,permissionManagementRevision:nextRevision,browserWorkDirectory:scratch,roots:roots.length?roots:[{name:'scope_empty',path:scratch,readOnly:true}],files:{...config.files,enabled:roots.length>0},office:{...config.office,enabled:roots.length>0},browser:{...config.browser,enabled:origins.length>0,allowedOrigins:origins}}
    const temporary=profile.configFile+'.'+key()+'.tmp'
    try{await fs.writeFile(temporary,JSON.stringify(updated,null,2),{flag:'wx',mode:0o600});await fs.rename(temporary,profile.configFile)}finally{await fs.unlink(temporary).catch(()=>{})}
    return {cancelled:false,permissionRevision:updated.permissionRevision}
  }finally{await release()}
}
