import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {openConnectorStartup,createConnectorManager} from '../local-executor/desktop.mjs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function runner(profiles,uiAnswers=[true],connectionResult='online'){
 const calls=[],restored=[],log=[]
 const manager={origin:'http://127.0.0.1:31991',token:'a'.repeat(64),
  resumeSaved:async(id,fingerprint)=>{restored.push({id,fingerprint})},
  waitForConnection:async()=>{if(connectionResult!=='online')throw Error('connection_needs_check');return {state:'online'}},
  waitForUiReady:async()=>uiAnswers.shift()??false}
 const startBrowser=(exe,args,options)=>{calls.push({exe,args,options});const proc=new EventEmitter();proc.unref=()=>{};return proc}
 const logger={log:(x)=>log.push(x),warn:(x)=>log.push(x),error:(x)=>log.push(x)}
 const start=(options={})=>openConnectorStartup({chrome:'C:\\Chrome\\chrome.exe',manager,saved:{profiles,unavailable:0,truncated:false},startBrowser,logger,uiTimeoutMs:10,...options})
 return {start,calls,restored,log,manager}
}
const profile={id:'a'.repeat(24),fingerprint:'b'.repeat(64),server:'http://127.0.0.1:8188/__pb'}
test('one saved connection resumes in the background without opening the external manager UI',async()=>{
  const f=runner([profile])
  const result=await f.start()
  assert.deepEqual(result,{managerUiReady:false,restored:true,uiOpened:false})
  assert.equal(f.restored.length,1)
  assert.equal(f.calls.length,0)
  assert.ok(f.log.some(m=>m.includes('日常文件、浏览器和授权操作请回到 Agent Studio 工作台')))
  assert.ok(f.log.some(m=>m.includes('Manage-Connector.cmd')))
})
test('explicit manage request opens the local UI even after a successful auto-resume',async()=>{
  const f=runner([profile])
  const result=await f.start({manage:true})
  assert.deepEqual(result,{managerUiReady:true,restored:true,uiOpened:true})
  assert.equal(f.restored.length,1)
  assert.equal(f.calls.length,1)
  const c=f.calls[0]
  assert.equal(c.exe,'C:\\Chrome\\chrome.exe')
  assert.equal(c.options.windowsHide,false)
  assert.equal(c.options.shell,false)
  assert.equal(c.options.detached,false)
  assert.ok(c.args.includes('--new-window'))
  assert.ok(c.args.some(a=>a.startsWith('--app=http://127.0.0.1:31991/#')))
  assert.ok(!JSON.stringify(c.args).includes('8188'))
  assert.ok(f.log.some(m=>m.includes('请选择工作台下载的 JSON 连接文件')))
})
test('a failed or unconfirmed server resume opens settings instead of silently hiding the error',async()=>{
  const f=runner([profile],[true],'failed')
  const result=await f.start()
  assert.deepEqual(result,{managerUiReady:true,restored:false,uiOpened:true})
  assert.equal(f.restored.length,1)
  assert.equal(f.calls.length,1)
  assert.ok(f.log.some(m=>m.includes('未能确认上线')))
})
test('a started process without verified online evidence cannot suppress the settings window',async()=>{
  for(const status of [undefined,{state:'starting'},{state:'online',running:false}]){
    const f=runner([profile])
    f.manager.waitForConnection=async()=>status
    assert.deepEqual(await f.start(),{managerUiReady:true,restored:false,uiOpened:true})
    assert.equal(f.calls.length,1)
  }
  const missing=runner([profile]);delete missing.manager.waitForConnection
  assert.equal((await missing.start()).restored,false)
  assert.equal(missing.calls.length,1)
})
test('incomplete saved-profile inventories never silently choose a connection',async()=>{
  for(const patch of [{unavailable:1},{truncated:true}]){
    const f=runner([profile])
    const result=await f.start({saved:{profiles:[profile],unavailable:0,truncated:false,...patch}})
    assert.deepEqual(result,{managerUiReady:true,restored:false,uiOpened:true})
    assert.equal(f.restored.length,0)
  }
})
test('multiple saved profiles and zero saved profiles both expose new pairing instead of silently resuming',async()=>{
 for(const profiles of [[],[profile,{...profile,id:'c'.repeat(24)}]]){
  const f=runner(profiles)
   assert.deepEqual(await f.start(),{managerUiReady:true,restored:false,uiOpened:true})
   assert.equal(f.restored.length,0)
  assert.equal(f.calls.length,1)
  assert.ok(f.calls[0].args.some(a=>a.startsWith('--app=')))
 }
})
test('if Chrome app window does not authenticate, try normal window and never claim connection success',async()=>{
 const f=runner([], [false,true])
  assert.deepEqual(await f.start(),{managerUiReady:true,restored:false,uiOpened:true})
  assert.equal(f.calls.length,2)
 assert.equal(f.calls[1].args[0],'--new-window')
 assert.ok(f.calls[1].args[1].startsWith('http://127.0.0.1:31991/#'))
 assert.ok(f.log.some(m=>m.includes('尚未检测到本机设置窗口')))
 const g=runner([], [false,false])
  assert.deepEqual(await g.start(),{managerUiReady:false,restored:false,uiOpened:true})
  assert.ok(g.log.some(m=>m.includes('不是新设备配对成功')))
})
test('manager recognizes UI only after authenticated state read, not just startup or public HTML',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'studio-manager-startup-'))
 let manager
 try{
  manager=await createConnectorManager({home,checkBrowser:async()=>'/fixture/chrome'})
  assert.equal(await manager.waitForUiReady(15),false)
  const publicPage=await fetch(manager.origin+'/');assert.equal(publicPage.status,200)
  assert.equal(await manager.waitForUiReady(15),false)
  const untrusted=await fetch(manager.origin+'/api/state');assert.equal(untrusted.status,403)
  assert.equal(await manager.waitForUiReady(15),false)
  const future=manager.waitForUiReady(500)
  const state=await fetch(manager.origin+'/api/state',{headers:{'X-Connector-Session':manager.token}})
  assert.equal(state.status,200)
  assert.equal(await future,true)
  assert.equal(await manager.waitForUiReady(15),true)
 }finally{await manager?.close();await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
})