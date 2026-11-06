// Actual packaged Electron + a disposable profile and loopback stub. No real
// employee account, applications, server data or security prompt is touched.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {_electron as electron,expect} from 'playwright/test'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const executable=path.join(root,'.tmp/desktop-output/win-unpacked/Agent Studio.exe')
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout '+label)),ms)})])}finally{clearTimeout(timer)}}
async function stopOwned(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return
 // This still-open ChildProcess handle is from this test's exact packaged EXE.
 const killer=spawn(path.join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
 await bounded(new Promise(resolve=>{killer.once('error',resolve);killer.once('close',resolve)}),15000,'owned process cleanup')
}
test('opening the same packaged EXE twice restores one existing workbench without a modal',{timeout:120000},async()=>{
 assert.equal(process.platform,'win32');await fs.access(executable)
 const parent=path.join(root,'.tmp'),fixture=await fs.mkdtemp(path.join(parent,'single-instance-acceptance-')),home=path.join(fixture,'account')
 const sockets=new Set(),server=http.createServer((req,res)=>{const health=req.url?.endsWith('/api/health');res.writeHead(health?200:401,{'Content-Type':'application/json'});res.end(JSON.stringify(health?{code:200}:{code:401,message:'Isolated single-instance fixture'}))})
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
 let client,primary,secondary,result={status:'FAIL',productionData:false},failure
 const createdCaches=[]
 try{
  for(const name of ['temp','web-cache']){const dir=path.join(path.dirname(executable),name);try{await fs.access(dir)}catch(error){if(error.code!=='ENOENT')throw error;createdCaches.push(dir)}}
  await fs.mkdir(home);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin='http://127.0.0.1:'+server.address().port
  await fs.writeFile(path.join(home,'desktop.json'),JSON.stringify({server:origin,port:0,updateFeed:origin+'/latest.json'}))
  const args=['--desktop-test-home='+home,'--desktop-test-server='+origin],env={...process.env}
  for(const name of Object.keys(env))if(/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|AGENT_STUDIO_RUNTIME_ROOT)$/i.test(name))delete env[name]
  client=await electron.launch({executablePath:executable,args,env,timeout:60000});primary=client.process()
  await expect.poll(()=>client.windows().filter(page=>/^http:\/\/127\.0\.0\.1:\d+/.test(page.url())).length,{timeout:45000}).toBe(1)
  const page=client.windows().find(page=>/^http:\/\/127\.0\.0\.1:\d+/.test(page.url()))
  await expect(page.locator('#root')).not.toBeEmpty({timeout:30000})
  const original=await client.evaluate(({BrowserWindow})=>{
   const window=BrowserWindow.getAllWindows().find(w=>/^http:\/\/127\.0\.0\.1:\d+/.test(w.webContents.getURL()))
   const before={id:window.id,url:window.webContents.getURL(),pid:process.pid};window.minimize();return before
  })
  await expect.poll(()=>client.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).isMinimized(),original.id)).toBe(true)
  const started=Date.now();secondary=spawn(executable,args,{env,windowsHide:true,stdio:'ignore'})
  const code=await bounded(new Promise((resolve,reject)=>{secondary.once('error',reject);secondary.once('close',resolve)}),15000,'secondary process exit without a modal')
  assert.equal(code,0);assert.equal(primary.exitCode,null)
  await expect.poll(()=>client.evaluate(({BrowserWindow},id)=>{const w=BrowserWindow.fromId(id);return !!w&&w.isVisible()&&!w.isMinimized()},original.id),{timeout:10000}).toBe(true)
  const after=await client.evaluate(({BrowserWindow})=>({pid:process.pid,windows:BrowserWindow.getAllWindows().map(w=>({id:w.id,url:w.webContents.getURL()}))}))
  assert.equal(after.pid,original.pid);assert.equal(after.windows.length,1);assert.equal(after.windows[0].id,original.id);assert.equal(after.windows[0].url,original.url)
  result={status:'PASS',productionData:false,secondaryExitCode:code,secondaryExitMs:Date.now()-started,primaryProcessPreserved:true,oneWindow:true,restored:true,sameServiceOrigin:true}
  console.log('PACKAGED_SINGLE_INSTANCE_PASS '+JSON.stringify(result))
 }catch(error){failure=error;result.message=String(error.message).slice(0,600)}
 finally{
  const cleanupErrors=[]
  await stopOwned(secondary).catch(error=>cleanupErrors.push(error.message))
  if(client)await bounded(client.close(),15000,'primary app close').catch(()=>{})
  await stopOwned(primary).catch(error=>cleanupErrors.push(error.message))
  for(const socket of sockets)socket.destroy()
  if(server.listening)await bounded(new Promise(resolve=>server.close(resolve)),15000,'stub close').catch(error=>cleanupErrors.push(error.message))
  for(const dir of [...createdCaches,fixture]){
   try{
   const expectedParent=dir===fixture?parent:path.dirname(executable)
   assert.equal(path.dirname(dir),expectedParent)
   const stat=await fs.lstat(dir).catch(error=>{if(error.code!=='ENOENT')throw error;return null})
   if(!stat)continue
   assert.equal(stat.isSymbolicLink(),false);assert.equal(await fs.realpath(dir),dir)
   await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:300})
   }catch(error){cleanupErrors.push(String(error.message).slice(0,300));console.log('SINGLE_INSTANCE_CLEANUP_RETAINED '+JSON.stringify({directory:dir,condition:'Remove this owned fixture once its test processes release handles.'}))}
  }
  result.cleanup=cleanupErrors.length?'retained':'removed'
  if(cleanupErrors.length){result.status='FAIL';result.cleanupErrors=cleanupErrors;failure||=Error('single_instance_cleanup_incomplete')}
  await fs.writeFile(path.join(parent,'packaged-single-instance-summary.json'),JSON.stringify(result,null,2))
 }
 if(failure)throw failure
})
