// Actual packaged app + disposable standalone PB. No production accounts/data.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {pipeline} from 'node:stream'
import {fileURLToPath} from 'node:url'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from '../../tests/helpers/headless-pocketbase.mjs'
import {prepareGuidedConnection} from '../../local-executor/setup.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const executable=path.resolve(process.argv[2]||'')
const installOption=process.argv.find(x=>x.startsWith('--install-dir='))?.slice('--install-dir='.length)
await fs.access(executable)
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-desktop-smoke-'))
const data=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-desktop-db-'))
const key=randomBytes(32).toString('hex')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
let pb,client,workbench,report
const sockets=new Set()
try {
  pb=spawnHeadlessPocketBase(process.env.POCKETBASE_BIN||path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+data,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex'),AGENT_STUDIO_BACKGROUND_WORKER:'false'}})
  pb.stdout.resume();pb.stderr.resume()
  const pbOrigin='http://127.0.0.1:'+port
  for(let i=0;i<100;i++){try{if((await fetch(pbOrigin+'/api/health')).ok)break}catch{}await sleep(150)}
  const created=await fetch(pbOrigin+'/api/studio/bootstrap',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Studio-Setup-Key':key},body:JSON.stringify({email:'desktop-smoke@example.test',password:'Isolated-desktop-fixture-2026!',display_name:'桌面隔离验收'})});assert.equal(created.status,201)
  workbench=http.createServer((req,res)=>{
    if(!req.url.startsWith('/__pb/')){res.writeHead(404);res.end();return}
    const target=http.request(pbOrigin+req.url.slice(5),{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port}},up=>{if(res.destroyed){up.destroy();return}res.writeHead(up.statusCode,up.headers);pipeline(up,res,()=>{})})
    target.on('error',()=>{if(!res.destroyed){res.writeHead(502);res.end()}});pipeline(req,target,()=>{})
  })
  workbench.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))})
  await new Promise(r=>workbench.listen(0,'127.0.0.1',r))
  const server='http://127.0.0.1:'+workbench.address().port
  const fixtureLogin=await(await fetch(pbOrigin+'/api/collections/studio_users/auth-with-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:'desktop-smoke@example.test',password:'Isolated-desktop-fixture-2026!'})})).json()
  assert.ok(fixtureLogin.token)
  const device=await(await fetch(pbOrigin+'/api/local-devices',{method:'POST',headers:{'Content-Type':'application/json',Authorization:fixtureLogin.token},body:JSON.stringify({name:'桌面内置验收电脑'})})).json()
  const profileHome=path.join(dir,'profile'),connectorHome=path.join(profileHome,'isolated-connections')
  await fs.mkdir(connectorHome,{recursive:true})
  const prepared=await prepareGuidedConnection({format:'agent-studio-connect-v1',server:server+'/__pb',name:'桌面内置验收电脑',mode:'both',origins:[],pairing:{id:device.id,code:device.pairing_code,expiresAt:device.expires_ms}},{home:connectorHome,defaultReadOnly:true,confirm:async()=>true})
  if(process.argv.includes('--native-file-actions')){const c=JSON.parse(await fs.readFile(prepared.configFile,'utf8'));c.roots[0].capabilities.open=true;await fs.writeFile(prepared.configFile,JSON.stringify(c,null,2))}
  await fs.writeFile(path.join(prepared.workspace,'desktop-fixture.txt'),'BUNDLED_DESKTOP_FILE_OK')
  await fs.writeFile(path.join(profileHome,'smoke-auth.json'),JSON.stringify(fixtureLogin),{mode:0o600})
  const reportPath=path.join(dir,'report.json')
  const env={...process.env,PATH:path.join(process.env.SystemRoot,'System32')}
  if(process.argv.includes('--system-temp')){const original=path.join(process.env.LOCALAPPDATA,'Temp');Object.assign(env,{TEMP:original,TMP:original,TMPDIR:original})}
  for(const name of Object.keys(env))if(/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|AGENT_STUDIO_RUNTIME_ROOT)$/i.test(name))delete env[name]
  client=spawn(executable,[...(process.argv.includes('--development')?[path.join(root,'desktop')]:[]),'--desktop-test-home='+path.join(dir,'profile'),'--desktop-test-server='+server,'--desktop-smoke-report='+reportPath,...(process.argv.includes('--desktop-entry-smoke')?['--desktop-entry-smoke']:[]),...(installOption?['/S','/D='+path.resolve(installOption)]:[])],{cwd:dir,env,windowsHide:true,stdio:'ignore'})
  for(let i=0;i<(installOption?1200:360);i++){try{report=JSON.parse(await fs.readFile(reportPath,'utf8'));break}catch{}await sleep(500)}
  assert.equal(report?.started,true,'packaged app startup: '+JSON.stringify(report||{}))
  if(process.argv.includes('--system-temp')){
    assert.ok(report.runtimeRoot,'launcher did not configure adjacent runtime cache')
    assert.equal(path.resolve(report.runtimeRoot).toLowerCase(),path.resolve(installOption||path.dirname(executable)).toLowerCase())
    assert.equal(path.resolve(report.tempDirectory).toLowerCase(),path.resolve(report.runtimeRoot,'temp').toLowerCase())
    assert.ok(report.resourcesDirectory.startsWith(report.runtimeRoot))
  }
  assert.equal(report.nativePairingAvailable,true,'native pairing preload is unavailable')
  assert.equal(report.nativeManagerOpened,true,'workbench IPC did not open the built-in manager')
  assert.equal(report.embeddedManager,true,'desktop manager still requires JSON import')
  assert.equal(report.singleWindow,true,'connector opened a separate window')
  assert.equal(report.nativeConnected,true,'bundled runtime did not restore the verified employee connection')
  assert.equal(report.nativeStatusVisible,true,'connection status is missing from the main app')
  assert.equal(report.mainComputerSelector,true,'main computer selector did not select the restored connection')
  if(process.argv.includes('--desktop-entry-smoke'))assert.deepEqual(report.nativeSettingsEntries,{updates:true,settings:true,updatePhase:'idle',singleMainWindow:true})
  assert.equal(report.managementInline,true,'computer management must be inline in the main app')
  assert.equal(report.sandbox,true);assert.equal(report.nodeIntegration,false);assert.equal(report.contextIsolation,true)
  const request=async(method,route,body,headers={})=>{
    const r=await fetch(report.origin+route,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>({}))}
  }
  assert.equal((await request('GET','/__pb/api/health')).status,200)
  assert.equal((await request('GET','/__pb/api/studio/me',null,{'X-Rh-User-Id':'forged-desktop'})).status,401)
  const login=await request('POST','/__pb/api/collections/studio_users/auth-with-password',{identity:'desktop-smoke@example.test',password:'Isolated-desktop-fixture-2026!'});assert.equal(login.status,200)
  const me=await request('GET','/__pb/api/studio/me',null,{Authorization:login.data.token,'X-Rh-User-Id':'forged-desktop'});assert.equal(me.status,200);assert.equal(me.data.user.id,login.data.record.id)
  for(const route of ['/api/agent_specs','/api/model-connections','/api/knowledge-bases','/api/skills','/api/tool-connections']){
    const result=await request('GET','/__pb'+route,null,{Authorization:login.data.token});assert.equal(result.status,200,route)
  }
  const jobRoute='/__pb/api/local-devices/'+device.id+'/jobs'
  assert.equal((await request('POST',jobRoute,{tool:'files.read',arguments:{root:'work',path:'desktop-fixture.txt'},request_id:randomBytes(16).toString('hex')},{Authorization:login.data.token})).status,409,'file jobs must still require explicit approval')
  const queued=await request('POST',jobRoute,{tool:'files.read',arguments:{root:'work',path:'desktop-fixture.txt'},confirm:true,request_id:randomBytes(16).toString('hex')},{Authorization:login.data.token})
  assert.equal(queued.status,201)
  let completed
  for(let i=0;i<100;i++){completed=await request('GET','/__pb/api/local-jobs/'+queued.data.id,null,{Authorization:login.data.token});if(['succeeded','failed'].includes(completed.data.status))break;await sleep(200)}
  assert.equal(completed.data.status,'succeeded');assert.ok(completed.data.result.includes('BUNDLED_DESKTOP_FILE_OK'))
  let nativeFileApplications=false
  if(process.argv.includes('--native-file-actions')){
    for(const tool of ['files.open','files.reveal']){
      const q=await request('POST',jobRoute,{tool,arguments:{root:'work',path:'desktop-fixture.txt'},confirm:true,request_id:randomBytes(16).toString('hex')},{Authorization:login.data.token});assert.equal(q.status,201)
      let j;for(let i=0;i<160;i++){j=await request('GET','/__pb/api/local-jobs/'+q.data.id,null,{Authorization:login.data.token});if(['succeeded','failed'].includes(j.data.status))break;await sleep(250)}
      assert.equal(j.data.status,'succeeded',tool+': '+j.data.result);const receipt=JSON.parse(j.data.result);assert.equal(receipt.accepted,true);assert.equal(receipt.handler,tool==='files.open'?'notepad':'explorer')
    }
    nativeFileApplications=true
  }
  const originalConfig=await fs.readFile(prepared.configFile,'utf8')
  const permission=await request('GET','/__pb/api/local-devices/'+device.id+'/permissions',null,{Authorization:login.data.token})
  assert.equal(permission.data.protocol,'permissions-v2')
  const control=await request('POST','/__pb/api/local-devices/'+device.id+'/controls',{action:'sites-save',permission_revision:permission.data.revision,origins:[],request_id:randomBytes(16).toString('hex'),confirm:true},{Authorization:login.data.token})
  assert.equal(control.status,201,'permission request: '+JSON.stringify(control.data))
  let confirmation
  for(let i=0;i<120;i++){try{confirmation=JSON.parse(await fs.readFile(path.join(profileHome,'confirmation-smoke.json'),'utf8'));break}catch{}await sleep(250)}
  assert.equal(confirmation?.inMainWindow,true,'permission confirmation did not reach the main app')
  assert.equal(confirmation.singleWindow,true,'permission confirmation opened a separate window')
  assert.equal((await request('POST','/__pb/api/local-controls/'+control.data.id+'/cancel',{}, {Authorization:login.data.token})).status,200)
  await sleep(1500)
  assert.equal(await fs.readFile(prepared.configFile,'utf8'),originalConfig,'cancelled in-app review changed local permissions')
  const manager=await fetch(report.managerOrigin+'/api/state');assert.equal(manager.status,403)
  const code=await (await fetch(report.origin+'/__desktop/runtime.js')).text();assert.ok(code.includes(server));assert.ok(!code.includes(login.data.token))
  console.log('PACKAGED_DESKTOP_SMOKE '+JSON.stringify({...report,testHome:dir,backend:'isolated-standalone-pocketbase',verifiedEmployeeJwt:true,forgedIdentityDenied:true,bundledNode:true,developerPathRemoved:true,realFileJob:true,nativeFileApplications,unapprovedJobDenied:true,inAppPermissionReview:true,cancelledReviewUnchanged:true,productionData:false}))
  if(process.argv.includes('--keep-open')){
    await fs.writeFile(path.join(root,'.tmp','desktop-active-smoke.json'),JSON.stringify({directory:dir,report,finish:path.join(dir,'finish')},null,2))
    for(let i=0;i<1800;i++){try{await fs.access(path.join(dir,'finish'));break}catch{}await sleep(1000)}
  }
} finally {
  if(client&&client.exitCode===null){
    if(process.platform==='win32'){
      const stop=spawn(path.join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(client.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
      await new Promise(r=>{stop.once('error',r);stop.once('exit',r)})
    }else client.kill()
  }
  if(report)for(let i=0;i<60;i++){try{await fetch(report.origin);await sleep(250)}catch{break}}
  for(const s of sockets)s.destroy()
  if(workbench)await new Promise(r=>workbench.close(r))
  await stopHeadlessPocketBase(pb)
  console.log('DESKTOP_SMOKE_TEST_DATA '+dir)
  // Retain this run's isolated UI profile as evidence, never ship it.
}
