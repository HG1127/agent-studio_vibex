import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomBytes,createHash} from 'node:crypto'
import {readGuidedProfile} from './profiles.mjs'
import {acquireConnectionLock} from './workspace.mjs'

/** Check installation only. Never installs, launches or falls back to Edge. */
export async function verifyChromeInstalled({platform=process.platform,env=process.env,isFile=async file=>{try{return (await fs.stat(file)).isFile()}catch{return false}}}={}){
  const candidates=platform==='win32'?
    [env.PROGRAMFILES||'C:\\Program Files',env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)',env.LOCALAPPDATA].filter(Boolean).map(base=>path.win32.join(base,'Google','Chrome','Application','chrome.exe')):
    platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:
    ['/opt/google/chrome/chrome','/usr/bin/google-chrome','/usr/bin/google-chrome-stable']
  for(const file of candidates)if(await isFile(file))return file
  throw Error('chrome_not_installed')
}

/** Explicit local-only migration; no pairing, credential reads, scope changes or startup. */
export async function changeGuidedBrowser(id,{home=os.homedir(),confirm,checkBrowser=verifyChromeInstalled}={}){
  const profile=await readGuidedProfile(id,{home})
  if(!profile.browserEnabled)throw Error('browser_not_enabled')
  const release=await acquireConnectionLock(profile.configFile)
  try{
    const stat=await fs.lstat(profile.configFile)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>24000)throw Error('invalid_local_config')
    const before=await fs.readFile(profile.configFile,'utf8')
    if(createHash('sha256').update(before).digest('hex')!==profile.fingerprint)throw Error('local_config_changed')
    const config=JSON.parse(before)
    if(config.browser.channel==='chrome'&&!config.browser.executablePath)return {cancelled:false,changed:false}
    if(typeof confirm!=='function'||!await confirm({name:profile.name,server:profile.server,from:profile.browserChannel,to:'chrome',origins:profile.origins}))return {cancelled:true,changed:false}
    await checkBrowser()
    if(await fs.readFile(profile.configFile,'utf8')!==before)throw Error('local_config_changed')
    const browser={...config.browser,channel:'chrome'}
    delete browser.executablePath
    const updated={...config,browser}
    const temp=profile.configFile+'.'+randomBytes(6).toString('hex')+'.tmp'
    try{await fs.writeFile(temp,JSON.stringify(updated,null,2),{flag:'wx',mode:0o600});await fs.rename(temp,profile.configFile)}finally{await fs.unlink(temp).catch(()=>{})}
    return {cancelled:false,changed:true}
  }finally{await release()}
}
