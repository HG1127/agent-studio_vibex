import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomBytes} from 'node:crypto'
import {pickNative} from './native-picker.mjs'

const privatePart=/^(?:\.agent-studio(?:-trash)?|\.ssh|\.aws|\.azure|\.gnupg|\.config|\.git|\.codex|\.env.*|pb_data|node_modules|appdata|windows|program files(?: \(x86\))?|programdata|system volume information|\$recycle\.bin)$/i
const inside=(parent,child)=>{const rel=path.relative(parent,child);return !rel||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}
/** Local-only selection: downloaded tickets and server jobs cannot provide a path. */
export async function validateWorkspaceChoice(selected,{home=os.homedir()}={}){
  if(typeof selected!=='string'||selected.length>2000||/[\x00-\x1f\x7f]/.test(selected))throw Error('invalid_workspace_path')
  const clean=selected.trim().replace(/^["']|["']$/g,'')
  if(!path.isAbsolute(clean)||/^(?:\\\\|\/\/)/.test(clean))throw Error('workspace_must_be_local_absolute')
  const target=path.resolve(clean),user=path.resolve(home),privateDir=path.join(user,'.agent-studio')
  if(target===path.parse(target).root||target.toLowerCase()===user.toLowerCase()||inside(target,privateDir))throw Error('workspace_too_broad_or_private')
  const parts=target.slice(path.parse(target).root.length).split(path.sep)
  if(parts.some(p=>privatePart.test(p)))throw Error('workspace_too_broad_or_private')
  let cursor=path.parse(target).root
  for(const part of parts){cursor=path.join(cursor,part);const st=await fs.lstat(cursor);if(st.isSymbolicLink()||!st.isDirectory())throw Error('workspace_link_or_not_directory')}
  const real=await fs.realpath(target)
  if(inside(real,privateDir)||inside(privateDir,real))throw Error('workspace_too_broad_or_private')
  return real
}
export const pickLocalFolder=options=>pickNative('folder',options)
export const pickConnectionFile=options=>pickNative('connection',options)
export async function chooseWorkspace(prompt,{current='',defaultPath='',platform=process.platform,picker=pickLocalFolder}={}){
  console.log('\n工作目录只在这台电脑确认，不允许网页远程指定。')
  if(current)console.log('当前授权目录：'+current)
  else console.log('默认专用目录：'+defaultPath)
  const choice=(await prompt.question(current?'输入 1 打开文件夹选择窗口，或 2 粘贴路径；回车取消：':'回车使用专用目录；输入 1 打开文件夹选择窗口，或 2 粘贴已有文件夹路径：')).trim()
  if(!choice)return null
  let chosen
  if(choice==='1'&&platform==='win32')chosen=await picker()
  else if(choice==='2'||choice==='1')chosen=(await prompt.question('粘贴具体工作文件夹的完整路径（不选整块磁盘或用户主目录）：')).trim()
  else throw Error('workspace_choice_invalid')
  if(!chosen)throw Error('workspace_selection_cancelled')
  const answer=(await prompt.question('授权方式：回车只读；输入 2 允许新建文件（仍禁止覆盖）：')).trim()
  if(answer&&answer!=='1'&&answer!=='2')throw Error('workspace_choice_invalid')
  return {path:chosen,readOnly:answer!=='2'}
}

/** One active executor/config update per config. Never kills a live process. */
export async function acquireConnectionLock(configFile){
  const lockFile=configFile+'.run.lock',nonce=randomBytes(12).toString('hex')
  for(let attempt=0;attempt<2;attempt++){
    try{
      const file=await fs.open(lockFile,'wx',0o600)
      try{await file.writeFile(JSON.stringify({pid:process.pid,nonce}))}finally{await file.close()}
      return async()=>{try{const st=await fs.lstat(lockFile);if(st.isSymbolicLink()||st.nlink!==1)return;const value=JSON.parse(await fs.readFile(lockFile,'utf8'));if(value.nonce===nonce)await fs.unlink(lockFile)}catch{}}
    }catch(error){
      if(error.code!=='EEXIST')throw error
      const st=await fs.lstat(lockFile)
      if(st.isSymbolicLink()||st.nlink!==1||st.size>1000)throw Error('connection_running_or_locked')
      let previous
      try{previous=JSON.parse(await fs.readFile(lockFile,'utf8'))}catch{throw Error('connection_running_or_locked')}
      if(!Number.isInteger(previous.pid)||previous.pid<1)throw Error('connection_running_or_locked')
      try{process.kill(previous.pid,0);throw Error('connection_running_or_locked')}catch(e){if(e.code!=='ESRCH')throw Error('connection_running_or_locked')}
      // Only remove the exact dead process lock just inspected.
      if(await fs.readFile(lockFile,'utf8')!==JSON.stringify(previous))throw Error('connection_running_or_locked')
      await fs.unlink(lockFile)
    }
  }
  throw Error('connection_running_or_locked')
}

export async function changeGuidedWorkspace(id,{home=os.homedir(),choose,confirm}={}){
  if(!/^[A-Za-z0-9]{24}$/.test(id))throw Error('invalid_resume_id')
  const directory=path.join(home,'.agent-studio','connections',id),configFile=path.join(directory,'computer.local.json')
  let cursor=home
  for(const part of ['.agent-studio','connections',id]){cursor=path.join(cursor,part);const st=await fs.lstat(cursor);if(st.isSymbolicLink()||!st.isDirectory())throw Error('linked_setup_directory_denied')}
  const release=await acquireConnectionLock(configFile)
  try{
    const stat=await fs.lstat(configFile)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>24000)throw Error('invalid_local_config')
    const before=await fs.readFile(configFile,'utf8'),config=JSON.parse(before)
    if(config.files?.enabled===false)throw Error('browser_only_no_file_scope')
    const selected=await choose({current:config.roots?.[0]?.path||''})
    if(!selected)return {cancelled:true}
    const target=await validateWorkspaceChoice(selected.path,{home}),readOnly=selected.readOnly!==false
    if(!await confirm({previous:config.roots?.[0]?.path||'',workspace:target,readOnly,server:config.server}))return {cancelled:true}
    if(await fs.readFile(configFile,'utf8')!==before)throw Error('local_config_changed')
    // New alias makes all queued operations for the previous root fail closed.
    const name='folder_'+randomBytes(6).toString('hex')
    const browserWorkDirectory=path.join(directory,'browser-work')
    await fs.mkdir(browserWorkDirectory,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e})
    const scratch=await fs.lstat(browserWorkDirectory)
    if(scratch.isSymbolicLink()||!scratch.isDirectory())throw Error('linked_setup_directory_denied')
    const revision=randomBytes(12).toString('hex')
    const updated={...config,permissionRevision:revision,permissionManagementRevision:revision,browserWorkDirectory,roots:[{name,path:target,label:path.basename(target),readOnly,capabilities:{edit:false,move:false,delete:false,open:false}}]}
    const temp=configFile+'.'+randomBytes(6).toString('hex')+'.tmp'
    try{await fs.writeFile(temp,JSON.stringify(updated,null,2),{flag:'wx',mode:0o600});await fs.rename(temp,configFile)}finally{await fs.unlink(temp).catch(()=>{})}
    return {cancelled:false,configFile,workspace:target,readOnly,root:name}
  }finally{await release()}
}
