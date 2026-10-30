import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {connectionServer,connectionOrigins,validateConnectionTicket,deviceConnectionState,connectionCapabilitiesReady} from '../src/lib/localConnectionSetup.ts'
import {prepareGuidedConnection} from '../local-executor/setup.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
import {parseLocalDeviceInventory,visibleLocalDevices,deviceResumeCommand,deviceConnectionGuidance} from '../src/lib/localDeviceInventory.ts'
import {connectionFailureHint} from '../local-executor/connection-feedback.mjs'
const ticket=(mode='both')=>({format:'agent-studio-connect-v1',server:'http://127.0.0.1:8186/__pb',name:'隔离连接测试',mode,origins:mode==='files'?[]:['https://example.com'],pairing:{id:'a'.repeat(24),code:'b'.repeat(48),expiresAt:Date.now()+300000}})
const temp=()=>fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-guided-home-'))
const fakeRuntime=async()=>({tools:[{name:'files.list'},{name:'browser.browser_navigate'}],close:async()=>{}})
test('server origin is derived securely; foreign HTTP, redirects and credentials are rejected',()=>{
  assert.equal(connectionServer('https://studio.example/__pb/'),'https://studio.example/__pb')
  for(const u of ['http://office.example/__pb','https://u:p@office.example/__pb','https://office.example/evil','https://office.example/__pb?key=x','javascript:alert(1)'])assert.throws(()=>connectionServer(u))
})
test('website inputs normalize explicit origins and never accept wildcards or embedded secrets',()=>{
  assert.deepEqual(connectionOrigins('example.com/path\nhttps://example.com\nhttp://127.0.0.1:1234/x'),['https://example.com','http://127.0.0.1:1234'])
  for(const u of ['https://*.example.com','https://u:secret@example.com','https://example.com?token=secret','file:///C:/','https://example.com#key'])assert.throws(()=>connectionOrigins(u))
})
test('ticket is an exact short-lived allowlist, not a way to import arbitrary executor config',()=>{
  assert.equal(validateConnectionTicket(ticket()).mode,'both')
  for(const mutate of [t=>({...t,apps:{cmd:'powershell'}}),t=>({...t,roots:['C:/']}),t=>({...t,desktop:{enabled:true}}),t=>({...t,pairing:{...t.pairing,expiresAt:Date.now()-1}}),t=>({...t,pairing:{...t.pairing,code:'not-a-code'}}),t=>({...t,name:'escape\u001b[31m'}),t=>({...t,origins:['https://example.com/path']}),t=>({...t,mode:'browser',origins:[]})])assert.throws(()=>validateConnectionTicket(mutate(ticket())))
})
test('heartbeat, revocation and requested capabilities must all be real before online',()=>{
  const now=Date.now()
  assert.equal(deviceConnectionState({revoked:false,seen_ms:0},now),'waiting')
  assert.equal(deviceConnectionState({revoked:false,seen_ms:now+1000},now),'offline')
  assert.equal(deviceConnectionState({revoked:true,seen_ms:now},now),'revoked')
  assert.equal(deviceConnectionState({revoked:false,seen_ms:now-45000},now),'offline')
  assert.equal(deviceConnectionState({revoked:false,seen_ms:now},now),'online')
  assert.equal(connectionCapabilitiesReady({mode:'both'},['files.list']),false)
  assert.equal(connectionCapabilitiesReady({mode:'browser'},['browser.browser_navigate']),true)
})
test('inventory failures are never valid empty accounts; sort/filter never selects or mutates',()=>{
  const now=Date.now(),make=(id,name,patch={})=>({id:id.repeat(24),name,revoked:false,seen_ms:now,catalog:'[]',...patch})
  const rows=[make('a','离线电脑',{seen_ms:now-90000}),make('b','在线电脑'),make('c','撤销电脑',{revoked:true})]
  assert.deepEqual(parseLocalDeviceInventory({items:[]}),[])
  for(const invalid of [null,{}, {items:null},{items:[{}]},{items:[{...rows[0],id:'a;evil'}]},{items:[rows[0],rows[0]]}])assert.throws(()=>parseLocalDeviceInventory(invalid))
  const before=JSON.stringify(rows)
  assert.deepEqual(visibleLocalDevices(parseLocalDeviceInventory({items:rows}),'',false,now).map(d=>d.id),['b'.repeat(24),'a'.repeat(24)])
  assert.equal(visibleLocalDevices(rows,'撤销',false,now).length,0)
  assert.equal(visibleLocalDevices(rows,'撤销',true,now).length,1)
  assert.equal(JSON.stringify(rows),before)
  assert.equal(deviceResumeCommand('bad && shutdown'),'')
  assert.equal(deviceResumeCommand('a'.repeat(24)),'pnpm local:connect --resume '+'a'.repeat(24))
})
test('binding status distinguishes unused, expired, paired-before-first-heartbeat and offline without authorizing anything',()=>{
  const now=Date.now(),base={id:'a'.repeat(24),name:'我的电脑',revoked:false,seen_ms:0,catalog:'[]'}
  assert.equal(deviceConnectionGuidance(base,now).phase,'unknown','legacy APIs must not invent pairing state')
  const waiting={...base,paired:false,pairing_expires_ms:now+30000}
  assert.equal(deviceConnectionGuidance(waiting,now).phase,'pairing')
  assert.equal(deviceConnectionGuidance(waiting,now).canContinue,true)
  assert.equal(deviceConnectionGuidance(waiting,now).action,'查看连接步骤')
  assert.equal(deviceConnectionGuidance({...waiting,pairing_expires_ms:now-1},now).phase,'expired')
  const paired={...base,paired:true,pairing_expires_ms:0}
  assert.equal(deviceConnectionGuidance(paired,now).phase,'resume')
  assert.equal(deviceConnectionGuidance(paired,now).canContinue,false)
  assert.equal(deviceConnectionGuidance(paired,now).canResume,true)
  assert.equal(deviceConnectionGuidance(paired,now).action,'查看恢复步骤')
  assert.equal(deviceConnectionGuidance({...paired,seen_ms:now},now).phase,'online')
  assert.equal(deviceConnectionGuidance({...paired,seen_ms:now-90000},now).phase,'resume')
  assert.equal(deviceConnectionGuidance({...paired,revoked:true,seen_ms:now},now).phase,'revoked')
  assert.equal(deviceConnectionGuidance({...base,seen_ms:now-90000},now).canResume,true)
})
test('owner inventory carries only non-secret pairing metadata and rejects malformed flags',()=>{
  const row={id:'a'.repeat(24),name:'我的电脑',revoked:false,seen_ms:0,catalog:'[]',paired:false,pairing_expires_ms:Date.now()+300000}
  const actual=parseLocalDeviceInventory({items:[{...row,token_hash:'do-not-project',pairing_code:'do-not-project',owner:'other-private-data'}]})[0]
  assert.deepEqual(actual,row)
  for(const patch of [{paired:1},{paired:'false'},{pairing_expires_ms:-1},{pairing_expires_ms:'later'},{pairing_expires_ms:Infinity}]){
    assert.throws(()=>parseLocalDeviceInventory({items:[{...row,...patch}]}))
  }
  const legacy={...row};delete legacy.paired;delete legacy.pairing_expires_ms
  assert.deepEqual(parseLocalDeviceInventory({items:[legacy]})[0],legacy)
})
test('local pairing diagnostics never claim an ambiguous request can be replayed safely',()=>{
  assert.match(connectionFailureHint({status:401,message:'SECRET'}),/不能仅凭此错误断定原因/)
  assert.match(connectionFailureHint({message:'executor_http_404'}),/后端版本/)
  assert.match(connectionFailureHint({status:503}),/不会自动重试/)
  assert.match(connectionFailureHint({name:'TimeoutError',message:'SECRET'}),/超时不等于配对没有发生/)
  assert.match(connectionFailureHint(new TypeError('fetch failed')),/没有收到可确认/)
  assert.equal(connectionFailureHint(new Error('SECRET')),null)
  assert.ok(!connectionFailureHint({status:401,message:'SECRET',response:'SECRET'}).includes('SECRET'))
})

test('declined local confirmation produces no files and no pairing request',async()=>{
  const home=await temp();let paired=false
  try{await assert.rejects(()=>prepareGuidedConnection(ticket(),{home,confirm:async()=>false,pair:async()=>{paired=true}}),/connection_not_confirmed/);assert.equal(paired,false);assert.deepEqual(await fs.readdir(home),[])}finally{await fs.rm(home,{recursive:true,force:true})}
})
test('files-only connection creates fixed scoped workspace, real tools, and separate private credentials',async()=>{
  const home=await temp();let confirmed=false,calls=0
  try{
    const t=ticket('files'),r=await prepareGuidedConnection(t,{home,confirm:async scope=>{confirmed=scope.origins.length===0;return true},pair:async()=>{calls++;return {device_id:t.pairing.id,token:'t'.repeat(64)}}})
    const config=JSON.parse(await fs.readFile(r.configFile,'utf8'))
    assert.equal(confirmed,true);assert.equal(calls,1);assert.equal(config.browser.enabled,false)
    assert.equal(config.roots[0].path,r.workspace);assert.ok(!r.configFile.startsWith(r.workspace))
    assert.equal(config.desktop.enabled,false);assert.deepEqual(config.apps,{})
    assert.ok(!(await fs.readFile(r.configFile,'utf8')).includes(t.pairing.code))
    const rt=await createRuntime(config)
    try{assert.ok(rt.tools.some(x=>x.name==='files.list'));assert.ok(!rt.tools.some(x=>x.name.startsWith('browser.')));assert.equal(JSON.parse(await rt.execute({tool:'files.list',arguments:{root:'work',path:'.'}})).entries.length,0)}finally{await rt.close()}
    await assert.rejects(()=>prepareGuidedConnection(t,{home,confirm:async()=>true,runtimeFactory:fakeRuntime}),/device_already_paired/)
  }finally{await fs.rm(home,{recursive:true,force:true})}
})
test('browser-only mode genuinely disables file and office tools; missing browser blocks pairing',async()=>{
  const home=await temp();let paired=false
  try{
    const t=ticket('browser'),r=await prepareGuidedConnection(t,{home,confirm:async()=>true,checkBrowser:async()=>{},runtimeFactory:async config=>{assert.equal(config.browser.channel,'chrome');assert.equal(config.files.enabled,false);assert.equal(config.office.enabled,false);return fakeRuntime()},pair:async()=>({device_id:t.pairing.id,token:'t'.repeat(64)})})
    const config=JSON.parse(await fs.readFile(r.configFile,'utf8'))
    const rt=await createRuntime({...config,browser:{enabled:false}})
    try{assert.equal(rt.tools.some(x=>x.name.startsWith('files.')||x.name.startsWith('office.')),false);await assert.rejects(()=>rt.execute({tool:'files.read',permission_revision:config.permissionRevision,arguments:{root:'work',path:'any'}}),/tool_denied/)}finally{await rt.close()}
    const second={...t,pairing:{...t.pairing,id:'c'.repeat(24)}}
    await assert.rejects(()=>prepareGuidedConnection(second,{home,confirm:async()=>true,checkBrowser:async()=>{},runtimeFactory:async()=>({tools:[],close:async()=>{}}),pair:async()=>{paired=true}}),/browser_tools_not_available/)
    assert.equal(paired,false)
  }finally{await fs.rm(home,{recursive:true,force:true})}
})
test('expired while confirming and invalid pairing responses never become stored credentials',async()=>{
  const home=await temp();let time=Date.now(),calls=0;const t=ticket('files')
  try{
    await assert.rejects(()=>prepareGuidedConnection(t,{home,clock:()=>time,confirm:async()=>{time+=400000;return true},runtimeFactory:fakeRuntime,pair:async()=>{calls++}}),/过期/)
    assert.equal(calls,0)
    await assert.rejects(()=>prepareGuidedConnection(t,{home,confirm:async()=>true,runtimeFactory:fakeRuntime,pair:async()=>({device_id:'wrong',token:'t'.repeat(64)})}),/pair_response_invalid/)
    await assert.rejects(()=>fs.access(path.join(home,'.agent-studio','connections',t.pairing.id,'.local-device-credentials.json')))
  }finally{await fs.rm(home,{recursive:true,force:true})}
})
