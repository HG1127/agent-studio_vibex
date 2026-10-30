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
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const executable=path.resolve(process.argv[2]||'')
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
    const target=http.request(pbOrigin+req.url.slice(5),{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port}},up=>{res.writeHead(up.statusCode,up.headers);pipeline(up,res,()=>{})})
    target.on('error',()=>{res.writeHead(502);res.end()});pipeline(req,target,()=>{})
  })
  workbench.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))})
  await new Promise(r=>workbench.listen(0,'127.0.0.1',r))
  const server='http://127.0.0.1:'+workbench.address().port
  const reportPath=path.join(dir,'report.json')
  const env={...process.env,PATH:path.join(process.env.SystemRoot,'System32')}
  for(const name of Object.keys(env))if(/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)$/i.test(name))delete env[name]
  client=spawn(executable,[...(process.argv.includes('--development')?[path.join(root,'desktop')]:[]),'--desktop-test-home='+path.join(dir,'profile'),'--desktop-test-server='+server,'--desktop-smoke-report='+reportPath],{cwd:dir,env,windowsHide:true,stdio:'ignore'})
  for(let i=0;i<360;i++){try{report=JSON.parse(await fs.readFile(reportPath,'utf8'));break}catch{}await sleep(500)}
  assert.equal(report?.started,true,'packaged app startup: '+JSON.stringify(report||{}))
  assert.equal(report.nativePairingAvailable,true,'native pairing preload is unavailable')
  assert.equal(report.nativeManagerOpened,true,'workbench IPC did not open the built-in manager')
  assert.equal(report.embeddedManager,true,'desktop manager still requires JSON import')
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
  const manager=await fetch(report.managerOrigin+'/api/state');assert.equal(manager.status,403)
  const code=await (await fetch(report.origin+'/__desktop/runtime.js')).text();assert.ok(code.includes(server));assert.ok(!code.includes(login.data.token))
  console.log('PACKAGED_DESKTOP_SMOKE '+JSON.stringify({...report,testHome:dir,backend:'isolated-standalone-pocketbase',verifiedEmployeeJwt:true,forgedIdentityDenied:true,bundledNode:true,developerPathRemoved:true,productionData:false}))
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
