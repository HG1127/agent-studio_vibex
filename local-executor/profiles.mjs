import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {connectionServer} from '../src/lib/localConnectionSetup.ts'
import {grantCapabilities,capabilityDescription} from './file-capabilities.mjs'

const ID=/^[A-Za-z0-9]{24}$/
const clean=(value,fallback='')=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,160):fallback
async function checkedDirectory(directory){const s=await fs.lstat(directory);if(!s.isDirectory()||s.isSymbolicLink())throw Error('linked_setup_directory_denied')}

/** Only already-paired, guided configs below the current OS user's private
 * folder. The discovery path never reads credential content or contacts a server. */
export async function readGuidedProfile(id,{home=os.homedir()}={}){
  if(!ID.test(id))throw Error('invalid_resume_id')
  let directory=home
  for(const part of ['.agent-studio','connections',id]){directory=path.join(directory,part);await checkedDirectory(directory)}
  const configFile=path.join(directory,'computer.local.json'),st=await fs.lstat(configFile)
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>24000)throw Error('invalid_local_config')
  const source=await fs.readFile(configFile,'utf8'),c=JSON.parse(source)
  if(c.credentialsFile!=='.local-device-credentials.json')throw Error('invalid_local_config')
  const credentials=await fs.lstat(path.join(directory,c.credentialsFile))
  if(!credentials.isFile()||credentials.isSymbolicLink()||credentials.nlink!==1||credentials.size===0||credentials.size>16000)throw Error('local_credentials_unavailable')
  const server=connectionServer(c.server)
  if(!Array.isArray(c.roots)||!c.roots.length||c.roots.length>20||c.roots.some(r=>!r||typeof r.path!=='string'||!path.isAbsolute(r.path)))throw Error('invalid_local_config')
  const origins=Array.isArray(c.browser?.allowedOrigins)?c.browser.allowedOrigins:[]
  if(c.roots.some(r=>r.allowedFiles!==undefined&&(!Array.isArray(r.allowedFiles)||!r.allowedFiles.length||r.allowedFiles.length>20||r.allowedFiles.some(n=>typeof n!=='string'||!n||/[\\/:\x00-\x1f]/.test(n)||n==='.'||n==='..'))))throw Error('invalid_local_config')
  if(origins.length>12||origins.some(s=>{try{const u=new URL(s);return typeof s!=='string'||!['https:','http:'].includes(u.protocol)||u.origin!==s||u.username||u.password}catch{return true}}))throw Error('invalid_local_config')
  // An advanced profile may contain executable configuration. Do not make it
  // look like an ordinary file/browser connection in this simplified launcher.
  if(c.desktop?.enabled||Object.keys(c.apps||{}).length||Object.keys(c.mcpServers||{}).length)throw Error('advanced_profile_use_manual')
  return {id,configFile,fingerprint:createHash('sha256').update(source).digest('hex'),
    name:clean(c.deviceName)||'已保存连接 · '+id.slice(-6),server,
    filesEnabled:c.files?.enabled!==false,browserEnabled:c.browser?.enabled===true,
    browserChannel:c.browser?.executablePath?'custom':clean(c.browser?.channel)||'chrome',
    roots:c.files?.enabled===false?[]:c.roots.map(r=>({label:clean(r.label)||clean(path.basename(r.path),'工作文件夹'),path:r.path,readOnly:r.allowedFiles?true:r.readOnly===true,kind:r.allowedFiles?'file':'folder',capabilities:grantCapabilities(r.capabilities,!!r.allowedFiles||r.readOnly===true,!!r.allowedFiles),...(r.allowedFiles?{files:r.allowedFiles}:{})})),
    origins:c.browser?.enabled===true?origins:[]}
}
export async function listGuidedProfiles({home=os.homedir()}={}){
  let directory=home
  try{for(const part of ['.agent-studio','connections']){directory=path.join(directory,part);await checkedDirectory(directory)}}
  catch(e){if(e.code==='ENOENT')return {profiles:[],unavailable:0,truncated:false};throw e}
  const entries=(await fs.readdir(directory,{withFileTypes:true})).filter(e=>ID.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))
  const profiles=[];let unavailable=0
  for(const entry of entries.slice(0,100)){
    if(entry.isSymbolicLink()||!entry.isDirectory()){unavailable++;continue}
    try{profiles.push(await readGuidedProfile(entry.name,{home}))}catch{unavailable++}
  }
  profiles.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id))
  return {profiles,unavailable,truncated:entries.length>100}
}
/** Selection is data only; this helper cannot start, pair, modify or test anything. */
export async function chooseGuidedProfile(prompt,{home=os.homedir(),write=console.log}={}){
  const {profiles,unavailable,truncated}=await listGuidedProfiles({home})
  write('\nAgent Studio 本机连接管理')
  write('已有连接可直接恢复；不会新建配对、自动运行任务或扩展权限。')
  profiles.forEach((p,i)=>write(`${i+1}. ${p.name} · ${p.server} · ${[p.browserEnabled?'浏览器':'',p.filesEnabled?'文件':''].filter(Boolean).join(' + ')}`))
  if(!profiles.length)write('没有找到可恢复的简化连接。已有手工配置继续使用原启动方式。')
  if(unavailable)write(`${unavailable} 项配置未能安全核实或需要高级启动，未读取其中的凭证。请先核查，不要反复配对。`)
  if(truncated)write('这里只列出前 100 项，未显示的连接请使用原恢复方式。')
  write('N. 连接新电脑（选择网页下载的连接文件）')
  const answer=(await prompt.question('输入连接序号，N 新建，或直接回车退出：')).trim()
  if(!answer)return {kind:'cancel'}
  if(answer.toLowerCase()==='n')return {kind:'new'}
  if(!/^\d{1,3}$/.test(answer)||!profiles[Number(answer)-1])throw Error('invalid_profile_selection')
  const profile=profiles[Number(answer)-1]
  write('\n已选择：'+profile.name+'\n服务器：'+profile.server)
  for(const r of profile.roots)write('本机授权目录：'+clean(r.path)+'（'+capabilityDescription(r.readOnly,r.capabilities)+'）')
  if(profile.origins.length)write('允许访问：'+profile.origins.join('、'))
  if(profile.browserEnabled)write('当前自动化浏览器：'+(profile.browserChannel==='chrome'?'Google Chrome':profile.browserChannel==='msedge'?'Microsoft Edge（旧连接配置）':profile.browserChannel))
  write('1. 恢复原连接'+(profile.filesEnabled?'\n2. 更换授权文件夹（先停止原连接器）':'')+(profile.browserEnabled?'\n3. 切换此连接为 Google Chrome（先停止原连接器）':''))
  const action=(await prompt.question('输入操作序号；回车取消：')).trim()
  if(!action)return {kind:'cancel'}
  if(action==='1'){
    const yes=(await prompt.question('确认使用以上服务器与原授权范围启动？输入 y：')).trim()
    if(!/^(y|yes|是)$/i.test(yes))return {kind:'cancel'}
    const fresh=await readGuidedProfile(profile.id,{home})
    if(fresh.fingerprint!==profile.fingerprint)throw Error('local_config_changed')
    return {kind:'resume',id:profile.id,fingerprint:profile.fingerprint}
  }
  if(action==='2'&&profile.filesEnabled)return {kind:'folder',id:profile.id}
  if(action==='3'&&profile.browserEnabled)return {kind:'chrome',id:profile.id}
  throw Error('invalid_profile_selection')
}
