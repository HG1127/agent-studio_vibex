import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createRuntime} from '../local-executor/runtime.mjs'
import {PERMISSION_ENTRY_TOOL,validPermissionEntry,permissionEntryUrl,requestPermissionWindow} from '../local-executor/permission-entry.mjs'
import {devicePermissionSurface,permissionEntryInput} from '../src/lib/devicePermissionSurface.ts'

test('only an inherited local IPC bridge can request fixed permission panels',async()=>{
 const channel=new EventEmitter();channel.connected=true
 const sent=[];channel.send=(message,cb)=>{sent.push(message);cb?.();queueMicrotask(()=>channel.emit('message',{type:'studio-open-permissions-result',requestId:message.requestId,ok:true}))}
 const result=await requestPermissionWindow('files',undefined,channel)
 assert.match(result,/尚未停止连接/);assert.equal(sent.length,1);assert.equal(sent[0].panel,'files')
 assert.deepEqual(Object.keys(sent[0]).sort(),['type','requestId','panel','expiresAt'].sort())
 assert.equal(channel.listenerCount('message'),0)
 await assert.rejects(requestPermissionWindow('https://bad.example',undefined,channel),/unavailable/)
 await assert.rejects(requestPermissionWindow('sites',undefined,{connected:false}),/unavailable/)
 assert.equal(sent.length,1)
})
test('cancellation and negative acknowledgement never replay a window request',async()=>{
 const channel=new EventEmitter();channel.connected=true;let count=0
 channel.send=(_message,cb)=>{count++;cb?.()}
 const controller=new AbortController(),pending=requestPermissionWindow('sites',controller.signal,channel)
 controller.abort();await assert.rejects(pending,/cancelled/)
 assert.equal(count,1);assert.equal(channel.listenerCount('message'),0)
 channel.send=(message,cb)=>{count++;cb?.();queueMicrotask(()=>channel.emit('message',{type:'studio-open-permissions-result',requestId:message.requestId,ok:false}))}
 await assert.rejects(requestPermissionWindow('sites',undefined,channel),/unavailable/);assert.equal(count,2)
})
test('local entry URL and messages reject foreign origins, invalid devices, panels and expiry',()=>{
 const token='a'.repeat(64),device='A'.repeat(24),now=Date.now()
 const url=permissionEntryUrl('http://127.0.0.1:33333',token,device,'files')
 assert.equal(new URL(url).search,'');assert.match(new URL(url).hash,/&panel=files$/)
 for(const args of [['https://example.com',token,device,'files'],['http://127.0.0.1:33333/?token=x',token,device,'files'],['http://127.0.0.1:33333',token,'../x','files'],['http://127.0.0.1:33333',token,device,'shell']])assert.throws(()=>permissionEntryUrl(...args))
 const message={type:'studio-open-permissions',requestId:'b'.repeat(24),panel:'sites',expiresAt:now+5000}
 assert.equal(validPermissionEntry(message,now),true)
 for(const patch of [{expiresAt:now-1},{expiresAt:now+30000},{panel:'file:///C:/private'},{requestId:'..'}])assert.equal(validPermissionEntry({...message,...patch},now),false)
})
test('permission management never appears in the model-callable runtime catalog',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'entry-runtime-'));let runtime,plain,opens=0
 try{
  const config={roots:[{name:'work',path:folder,readOnly:true}],files:{enabled:true},browser:{enabled:false},permissionRevision:'a'.repeat(24),permissionManagementRevision:'a'.repeat(24)}
  runtime=await createRuntime(config,{openPermissions:async()=>{opens++;return 'opened'}})
  plain=await createRuntime(config)
  assert.ok(!plain.tools.some(t=>t.name===PERMISSION_ENTRY_TOOL))
  assert.ok(!runtime.tools.some(t=>t.name===PERMISSION_ENTRY_TOOL))
  await assert.rejects(runtime.execute({tool:PERMISSION_ENTRY_TOOL,arguments:{panel:'sites'},permission_revision:'a'.repeat(24)}),/tool_denied/)
  await assert.rejects(runtime.execute({tool:'files.list',arguments:{root:'work',path:'.'}}),/permission_scope_changed/)
  assert.equal(opens,0)
 }finally{await runtime?.close();await plain?.close();await fs.rm(folder,{recursive:true,force:true})}
})
test('workbench uses declared capabilities, filters unsafe origins, and requests only opening',()=>{
 const tools=[{name:'browser.browser_navigate',description:'',inputSchema:{'x-studio-allowed-origins':['https://example.com','https://example.com','https://user:pass@example.com','javascript:alert(1)','https://example.com/path']}},{name:PERMISSION_ENTRY_TOOL,description:'',inputSchema:{'x-studio-ui-entry':'permissions-v1','x-studio-connector-version':'0.1.0-preview.4'}}]
 assert.deepEqual(devicePermissionSurface(tools).sites,['https://example.com'])
 assert.equal(devicePermissionSurface(tools).canOpen,true)
 assert.equal(devicePermissionSurface(tools.slice(0,1)).canOpen,false)
 assert.deepEqual(permissionEntryInput('files'),{tool:PERMISSION_ENTRY_TOOL,arguments:{panel:'files'}})
 assert.throws(()=>permissionEntryInput('shell'))
})
