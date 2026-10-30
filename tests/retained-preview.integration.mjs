import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {startRetainedPreview} from '../ops/retained-preview.mjs'
import {spawnHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
// Actual guarded launch, restricted by both helpers to this disposable directory.
const spawnBackend=(binary,args,options)=>spawnHeadlessPocketBase(binary,args,options)
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-persistent-preview-test-'))
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
const webPort=await port(),apiPort=await port()
const artifacts=path.join(process.cwd(),'artifacts');await fs.mkdir(artifacts,{recursive:true})
const liveProbe=await fs.mkdtemp(path.join(artifacts,'retained-hot-update-fixture-'))
let preview
try{
 preview=await startRetainedPreview({directory,webPort,apiPort,spawnBackend});assert.equal(preview.reusedDatabase,false)
 // Churn-heavy generated test trees must not be recursively watched by the retained Vite server.
 const watchRoot=path.join(process.cwd(),'.tmp');await fs.mkdir(watchRoot,{recursive:true})
 const watchProbe=await fs.mkdtemp(path.join(watchRoot,'retained-preview-watch-'))
 try{await fs.mkdir(path.join(watchProbe,'nested'));await fs.writeFile(path.join(watchProbe,'nested','probe.txt'),'temporary');await fs.rm(watchProbe,{recursive:true,force:true,maxRetries:5,retryDelay:20});await new Promise(r=>setTimeout(r,250));assert.equal((await fetch(preview.webOrigin+'/tool-hub?view=devices')).status,200);console.log('RETAINED_PREVIEW_WATCHER_STABILITY_PASS')}finally{await fs.rm(watchProbe,{recursive:true,force:true,maxRetries:5,retryDelay:20})}
 // Generated fixture only: prove the same served URL updates without a restart
 // or cache-busting query when this project is itself under .worktrees.
 const moduleFile=path.join(liveProbe,'probe.mjs')
 const moduleUrl=preview.webOrigin+'/'+path.relative(process.cwd(),moduleFile).replace(/\\/g,'/')
 await fs.writeFile(moduleFile,'export const marker="watch_before_fixture";\n',{flag:'wx'})
 const first=await fetch(moduleUrl,{cache:'no-store'});assert.equal(first.status,200);assert.match(await first.text(),/watch_before_fixture/)
 await fs.writeFile(moduleFile,'export const marker="watch_after_fixture";\n')
 let refreshed=false
 for(let i=0;i<50;i++){const r=await fetch(moduleUrl,{cache:'no-store'});if(r.ok&&(await r.text()).includes('watch_after_fixture')){refreshed=true;break}await new Promise(resolve=>setTimeout(resolve,100))}
 assert.equal(refreshed,true,'retained preview must invalidate a changed module under the active worktree')
 console.log('RETAINED_PREVIEW_HOT_UPDATE_PASS '+JSON.stringify({sameModuleUrl:true,restarted:false,projectSourceEdited:false}))
 const call=async(route,body,headers={})=>{const r=await fetch(preview.apiOrigin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return {status:r.status,data:await r.json()}}
 const login=await call('/api/collections/studio_users/auth-with-password',{identity:'v28-preview@example.test',password:'PreviewOnly-2026!'});assert.equal(login.status,200)
 const headers={Authorization:login.data.token},p=await call('/api/local-devices',{name:'重启保留验证'},headers);assert.equal(p.status,201)
 const paired=await call('/api/public/local-executor/pair',{code:p.data.pairing_code});assert.equal(paired.status,200)
 const settings=await fs.readFile(path.join(directory,'preview-settings.json'),'utf8')
 await preview.close();preview=null
 assert.ok((await fs.stat(path.join(directory,'data.db'))).size>0)
 preview=await startRetainedPreview({directory,webPort,apiPort,spawnBackend});assert.equal(preview.reusedDatabase,true)
 assert.equal(await fs.readFile(path.join(directory,'preview-settings.json'),'utf8'),settings)
 const inventory=await call('/api/local-devices',undefined,headers);assert.equal(inventory.status,200);assert.ok(inventory.data.items.some(d=>d.id===p.data.id&&d.paired===true))
 const heartbeat=await call('/api/public/local-executor/poll',{tools:[]},{'X-Studio-Device-Token':paired.data.token});assert.equal(heartbeat.status,200)
 console.log('RETAINED_PREVIEW_RESTART_PASS '+JSON.stringify({sameAccount:true,sameJwt:true,sameDevice:true,sameDeviceCredential:true,sameEncryptionKey:true,deletedOnExit:false,realProductionData:false}))
}finally{await preview?.close();await fs.rm(liveProbe,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
