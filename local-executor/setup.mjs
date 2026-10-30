import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomBytes} from 'node:crypto'
import {validateConnectionTicket} from '../src/lib/localConnectionSetup.ts'
import {connection} from './connection.mjs'
import {createRuntime} from './runtime.mjs'
import {validateWorkspaceChoice} from './workspace.mjs'
import {verifyChromeInstalled} from './browser-settings.mjs'
import {validatePermissionFile} from './permissions.mjs'

/** Downloaded tickets never define roots/executables. A custom folder is accepted
 * only from an explicit local chooser and local confirmation. */
export async function prepareGuidedConnection(input,{home=os.homedir(),confirm,chooseWorkspace,defaultReadOnly=false,clock=Date.now,runtimeFactory=createRuntime,checkBrowser=verifyChromeInstalled,pair=async t=>connection(t.server)('/pair',{code:t.pairing.code})}={}){
  const ticket=validateConnectionTicket(input,clock())
  const directory=path.join(home,'.agent-studio','connections',ticket.pairing.id)
  const defaultWorkspace=path.join(home,'AgentStudioWork',ticket.pairing.id)
  const selected=ticket.mode!=='browser'&&typeof chooseWorkspace==='function'?await chooseWorkspace({defaultPath:defaultWorkspace}):null
  const singleFile=selected?.kind==='file'
  const target=singleFile?await validatePermissionFile(selected.path,{home}):null
  const workspace=singleFile?path.dirname(target):selected?await validateWorkspaceChoice(selected.path,{home}):defaultWorkspace
  const readOnly=singleFile|| (selected?selected.readOnly!==false:defaultReadOnly===true)
  const configFile=path.join(directory,'computer.local.json'),credentialsFile=path.join(directory,'.local-device-credentials.json')
  const config={server:ticket.server,deviceName:ticket.name,credentialsFile:'.local-device-credentials.json',
    roots:[{name:'work',path:workspace,label:singleFile?'文件：'+path.basename(target):selected?path.basename(workspace):'专用工作文件夹',readOnly,capabilities:{edit:false,move:false,delete:false,open:false},...(singleFile?{allowedFiles:[path.basename(target)]}:{})}],files:{enabled:ticket.mode!=='browser'},
    browserWorkDirectory:path.join(directory,'browser-work'),
    office:{enabled:ticket.mode!=='browser'},browser:{enabled:ticket.mode!=='files',headless:false,
      images:false,channel:'chrome',allowedOrigins:ticket.origins},
    desktop:{enabled:false},apps:{},mcpServers:{}}
  config.permissionManagementRevision=randomBytes(12).toString('hex')
  if(ticket.mode!=='files')config.permissionRevision=config.permissionManagementRevision
  if(typeof confirm!=='function'||!await confirm({name:ticket.name,server:ticket.server,mode:ticket.mode,origins:ticket.origins,workspace:singleFile?target:workspace,readOnly,kind:singleFile?'file':'folder'}))
    throw Error('connection_not_confirmed')
  // Report a missing Chrome installation before consuming the one-time ticket.
  if(ticket.mode!=='files')await checkBrowser()
  const ensurePrivate=async target=>{
    const parts=path.relative(home,target).split(path.sep);let cursor=home
    for(const part of parts){cursor=path.join(cursor,part);await fs.mkdir(cursor,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e})
      const st=await fs.lstat(cursor);if(st.isSymbolicLink()||!st.isDirectory())throw Error('linked_setup_directory_denied')}
  }
  await ensurePrivate(directory)
  await ensurePrivate(config.browserWorkDirectory)
  if(!selected)await ensurePrivate(workspace)
  try{await fs.lstat(credentialsFile);throw Error('device_already_paired_use_resume')}catch(e){if(e.code!=='ENOENT')throw e}
  // Discover local tools BEFORE consuming the pairing code. No tool is invoked.
  const runtime=await runtimeFactory({...config,deniedPaths:[credentialsFile,configFile]})
  try{
    if(ticket.mode!=='files'&&!runtime.tools.some(tool=>tool.name==='browser.browser_navigate'))throw Error('browser_tools_not_available')
    if(ticket.mode!=='browser'&&!runtime.tools.some(tool=>tool.name==='files.list'))throw Error('file_tools_not_available')
  }finally{await runtime.close()}
  validateConnectionTicket(ticket,clock())
  await fs.writeFile(configFile,JSON.stringify(config,null,2),{flag:'wx',mode:0o600})
  let handle
  try{
    handle=await fs.open(credentialsFile,'wx',0o600)
    const auth=await pair(ticket)
    if(auth.device_id!==ticket.pairing.id||typeof auth.token!=='string'||!/^[A-Za-z0-9]{64}$/.test(auth.token))throw Error('pair_response_invalid')
    await handle.writeFile(JSON.stringify({...auth,server:ticket.server}))
    return {id:ticket.pairing.id,configFile,workspace,readOnly}
  }catch(error){
    if(handle){await handle.close();handle=null;await fs.unlink(credentialsFile).catch(()=>{})}
    await fs.unlink(configFile).catch(()=>{})
    throw error
  }finally{await handle?.close()}
}
