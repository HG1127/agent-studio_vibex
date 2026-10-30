#!/usr/bin/env node
// Local-only retained preview. Never reads production .env/pb_data, never starts
// an Agent Worker, and NEVER deletes its database or rotates persisted secrets.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomBytes,createHash} from 'node:crypto'
import {spawn,spawnSync} from 'node:child_process'
import {createServer as createVite} from 'vite'
import {acquireConnectionLock} from '../local-executor/workspace.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
// Scope nested worktrees to this project: a global **/.worktrees/** would also
// ignore every source file when the active project itself lives in a worktree.
export function retainedPreviewWatchIgnores(projectRoot=root){
 const normalized=path.resolve(projectRoot).replace(/\\/g,'/')
 return ['**/.tmp/**',normalized+'/.worktrees/**','**/dist/**','**/node_modules/**','**/.git/**','**/pocketbase/pb_data/**']
}
const key=createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,12)
export const defaultDirectory=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'AgentStudioPreview',key)
const exists=async p=>fs.stat(p).then(()=>true,()=>false)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
export async function startRetainedPreview({directory=defaultDirectory,webPort=8180,apiPort=7180,spawnBackend}={}){
 directory=path.resolve(directory)
 const testing=path.dirname(directory).toLowerCase()===os.tmpdir().replace(/[\\/]$/,'').toLowerCase()&&path.basename(directory).startsWith('agentstudio-persistent-preview-test-')
 if(directory!==path.resolve(defaultDirectory)&&!testing)throw Error('preview_storage_not_authorized')
 if(spawnBackend!==undefined&&(!testing||typeof spawnBackend!=='function'))throw Error('preview_adapter_requires_disposable_test_directory')
 if([webPort,apiPort].some(p=>!Number.isInteger(p)||p<1024||p>65535)||webPort===apiPort)throw Error('invalid_preview_ports')
 await fs.mkdir(directory,{recursive:true,mode:0o700})
 const st=await fs.lstat(directory);if(st.isSymbolicLink()||!st.isDirectory())throw Error('preview_storage_link_denied')
 const settingsFile=path.join(directory,'preview-settings.json'),data=testing?directory:path.join(directory,'data')
 const release=await acquireConnectionLock(settingsFile)
 let pb,ui,closing=false,settings
 const apiOrigin='http://127.0.0.1:'+apiPort,webOrigin='http://127.0.0.1:'+webPort
 async function close(){
  if(closing)return;closing=true
  await ui?.close()
  if(pb&&pb.exitCode===null){const done=new Promise(resolve=>pb.once('close',resolve));pb.kill();await Promise.race([done,sleep(5000)])}
  await release()
 }
 try{
  const existing=await exists(path.join(data,'data.db'))
  if(await exists(settingsFile)){const s=await fs.lstat(settingsFile);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('invalid_preview_settings');settings=JSON.parse(await fs.readFile(settingsFile,'utf8'))}
  else{if(existing)throw Error('existing_preview_missing_settings_refuse_reset');settings={format:'agentstudio-retained-preview-v1',bootstrap:randomBytes(32).toString('hex'),encryption:randomBytes(16).toString('hex'),initialized:false};await fs.writeFile(settingsFile,JSON.stringify(settings),{flag:'wx',mode:0o600})}
  if(settings.format!=='agentstudio-retained-preview-v1'||! /^[a-f0-9]{64}$/.test(settings.bootstrap)||! /^[a-f0-9]{32}$/.test(settings.encryption))throw Error('invalid_preview_settings')
  await fs.mkdir(data,{recursive:true,mode:0o700});const ds=await fs.lstat(data);if(ds.isSymbolicLink()||!ds.isDirectory())throw Error('preview_storage_link_denied')
  const binary=path.join(root,'vibex-local','bin','windows','pocketbase.exe')
  const env={...process.env,NODE_ENV:'development',AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:settings.bootstrap,AGENT_STUDIO_SECRET_KEY:settings.encryption,AGENT_STUDIO_STRICT_SECRETS:'true',AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER:'true',VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED:'false'}
  if(!existing&&!spawnBackend){
   const r=spawnSync(binary,['superuser','create','preview-root-'+randomBytes(8).toString('hex')+'@example.test','T9!'+randomBytes(30).toString('base64url'),'--dir='+data],{cwd:path.dirname(binary),env,windowsHide:true,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']})
   if(r.status!==0)throw Error('preview_database_initialization_failed')
  }
  pb=(spawnBackend||spawn)(binary,['serve','--http=127.0.0.1:'+apiPort,'--dir='+data,'--hooksDir='+path.join(root,'pocketbase','pb_hooks')],{cwd:path.join(root,'pocketbase'),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  pb.stdout.on('data',()=>{});pb.stderr.on('data',()=>{})
  let healthy=false
  for(let i=0;i<100;i++){if(pb.exitCode!==null)throw Error('preview_backend_exited');try{if((await fetch(apiOrigin+'/api/health',{signal:AbortSignal.timeout(500)})).ok){healthy=true;break}}catch{}await sleep(150)}
  if(!healthy)throw Error('preview_backend_unreachable')
  if(!settings.initialized){
   const boot=await fetch(apiOrigin+'/api/studio/bootstrap',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Studio-Setup-Key':settings.bootstrap},body:JSON.stringify({email:'v28-preview@example.test',password:'PreviewOnly-2026!',display_name:'持久预览管理员'}),signal:AbortSignal.timeout(12000)})
   if(!boot.ok){const check=await fetch(apiOrigin+'/api/collections/studio_users/auth-with-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:'v28-preview@example.test',password:'PreviewOnly-2026!'}),signal:AbortSignal.timeout(12000)});if(!check.ok)throw Error('preview_account_not_initialized_refuse_reset')}
   settings.initialized=true;await fs.writeFile(settingsFile,JSON.stringify(settings),{mode:0o600})
  }
  process.env.AGENT_STUDIO_PB_ORIGIN=apiOrigin
  const emptyEnv=path.join(directory,'empty-env');await fs.mkdir(emptyEnv,{recursive:true})
  // The retained preview shares this worktree with test fixtures and generated files.
  // Ignore churn-heavy/non-source trees so Windows fs.watch never races recursive
  // scans against temporary directories being removed by the local-file tests.
  ui=await createVite({configFile:path.join(root,'vibex-local','vite.local.config.ts'),envDir:emptyEnv,server:{host:'127.0.0.1',port:webPort,strictPort:true,open:false,watch:{ignored:retainedPreviewWatchIgnores()}},logLevel:'error'})
  await ui.listen()
  const response=await fetch(webOrigin+'/__pb/api/health',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('preview_proxy_unreachable')
  return {close,webOrigin,apiOrigin,directory,reusedDatabase:existing,backgroundWorkerStarted:false}
 }catch(error){await close();throw error}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const preview=await startRetainedPreview();console.log('RETAINED_PREVIEW_READY '+JSON.stringify({url:preview.webOrigin+'/tool-hub?view=devices',reusedDatabase:preview.reusedDatabase,persistentData:true,backgroundWorkerStarted:false}));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void preview.close().finally(()=>process.exit()))}
 catch(error){console.error('RETAINED_PREVIEW_FAILED '+error.message);process.exitCode=1}
}
