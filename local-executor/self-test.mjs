#!/usr/bin/env node
/** Runs only synthetic data and a loopback website. Does not read user profiles,
 * pair a device, invoke any model or contact any external website. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createRuntime} from './runtime.mjs'
import {createConnectorManager,openConnectorStartup} from './desktop.mjs'
import {readGuidedProfile} from './profiles.mjs'
import {CONNECTOR_VERSION} from './version.mjs'
import {BROWSER_RECEIPT_PREFIX} from './browser-feedback.mjs'
// Resolve the actual worker and every transitive permission-control module in
// the portable package without pairing, reading profiles or starting a task.
import {runConnection} from './run.mjs'
assert.equal(typeof runConnection,'function')
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'studio-portable-smoke-'))
let runtime,manager,site,acceptDevice=false
const rejectedRequests=[]
try{
 await fs.writeFile(path.join(temp,'hello.txt'),'portable-connector-verified')
 await fs.writeFile(path.join(temp,'table.csv'),'部门,金额\n研发,1.25\n研发,2.75\n')
 site=createServer((req,res)=>{if(req.url.startsWith('/api/public/local-executor/')){if(acceptDevice){res.writeHead(req.url.endsWith('/poll')?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify({job:null}));return}rejectedRequests.push(req.url);res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'device_unauthorized'}));return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Portable verified</title><h1>Standalone Chrome verified</h1>')})
 await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+site.address().port
 runtime=await createRuntime({roots:[{name:'work',path:temp,readOnly:true}],office:{enabled:true},browser:{enabled:true,channel:'chrome',headless:true,allowedOrigins:[origin]}})
 assert.equal(await runtime.execute({tool:'files.read',arguments:{root:'work',path:'hello.txt'}}),'portable-connector-verified')
 assert.ok(!runtime.tools.some(t=>t.name==='files.write'))
  await assert.rejects(()=>runtime.execute({tool:'browser.browser_snapshot',arguments:{}}),/^Error: browser_no_open_page$/)
 const table=await runtime.execute({tool:'office.table_summary',arguments:{root:'work',source_path:'table.csv',group_by:'部门',amount_column:'金额',decimal_places:2}});assert.ok(table.includes('4.00'))
 const page=await runtime.execute({tool:'browser.browser_navigate',arguments:{url:origin}});assert.ok(page.includes('Standalone Chrome verified'));assert.ok(page.startsWith(BROWSER_RECEIPT_PREFIX));assert.equal(JSON.parse(page.split('\n')[0].slice(BROWSER_RECEIPT_PREFIX.length)).url,origin+'/')
 manager=await createConnectorManager({home:path.join(temp,'empty-home')})
 assert.equal((await fetch(manager.origin+'/api/state')).status,403)
 const state=await fetch(manager.origin+'/api/state',{headers:{'X-Connector-Session':manager.token}});assert.equal(state.status,200);assert.deepEqual((await state.json()).profiles,[])
 // Run the exact packaged fork/CLI, not just an import, against a rejected
 // synthetic identity. It must retain failure and must never attempt pairing.
 const home=path.join(temp,'empty-home'),id='a'.repeat(24),profileDir=path.join(home,'.agent-studio','connections',id)
 await fs.mkdir(profileDir,{recursive:true})
 const config=path.join(profileDir,'computer.local.json'),credentials=path.join(profileDir,'.local-device-credentials.json')
 const configText=JSON.stringify({server:origin,deviceName:'包内恢复失败测试',credentialsFile:'.local-device-credentials.json',roots:[{name:'work',path:temp,readOnly:true}],browser:{enabled:false}})
 const credentialsText=JSON.stringify({device_id:id,server:origin,token:'a'.repeat(64)})
 await fs.writeFile(config,configText);await fs.writeFile(credentials,credentialsText)
 const profile=await readGuidedProfile(id,{home});await manager.resumeSaved(id,profile.fingerprint)
 let status
 for(let i=0;i<150;i++){
  const current=await(await fetch(manager.origin+'/api/state',{headers:{'X-Connector-Session':manager.token}})).json()
  assert.equal(current.version,CONNECTOR_VERSION);status=current.profiles[0]
  if(status.state==='failed'&&status.running===false)break
  await new Promise(resolve=>setTimeout(resolve,100))
 }
 assert.equal(status.state,'failed');assert.equal(status.reasonCode,'device_identity_rejected');assert.equal(status.running,false)
 const refreshed=await(await fetch(manager.origin+'/api/state',{headers:{'X-Connector-Session':manager.token}})).json()
 assert.equal(refreshed.profiles[0].reasonCode,'device_identity_rejected')
 assert.ok(rejectedRequests.length>0);assert.ok(rejectedRequests.every(url=>!url.includes('/pair')))
 assert.equal(await fs.readFile(config,'utf8'),configText);assert.equal(await fs.readFile(credentials,'utf8'),credentialsText)
 acceptDevice=true
  let dailyManagerWindows=0
  const started=await openConnectorStartup({chrome:'not-invoked',manager,saved:{profiles:[profile],unavailable:0,truncated:false},logger:{log(){},warn(){},error(){}},startBrowser:()=>{dailyManagerWindows++;throw Error('unexpected_manager_window')}})
  assert.deepEqual(started,{managerUiReady:false,restored:true,uiOpened:false})
  assert.equal((await manager.waitForConnection(id,1000)).state,'online');assert.equal(dailyManagerWindows,0)
  assert.equal(await fs.readFile(config,'utf8'),configText);assert.equal(await fs.readFile(credentials,'utf8'),credentialsText)
  console.log('PORTABLE_CONNECTOR_SMOKE_PASS '+JSON.stringify({node:process.version,nodeExecutable:process.execPath,realChrome:true,blankReadBlocked:true,navigationReceipt:true,files:true,office:true,realChild401:true,stickyFailure:true,realChildOnline:true,dailyManagerWindows,version:CONNECTOR_VERSION,noPairing:true,paidModelCalls:0,remoteRequests:0}))
}finally{await manager?.close();await runtime?.close();if(site)await new Promise(resolve=>site.close(resolve));await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
