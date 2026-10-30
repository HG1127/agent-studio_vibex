// Integration of the shipped native controller against a purpose-built fixture.
// No user app, contact, terminal UI or model provider is operated by this test.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {applicationNative} from '../local-executor/application-native.mjs'
import {inspectApplication,registerApplications} from '../local-executor/applications.mjs'
import {createApplicationFixture} from './helpers/application-fixture.windows.mjs'
const fixture=await createApplicationFixture(path.resolve('.tmp/native-application-fixture')), {run,exe,receipt}=fixture
const tools=new Map();let runtime
const wait=async(fn,label)=>{for(let n=0;n<50;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100))}throw Error('timeout '+label)}
try{
 const previousPath=process.env.PATH;let discovered
 try{process.env.PATH=path.join(process.env.SystemRoot,'System32');discovered=await applicationNative({action:'discover'})}finally{process.env.PATH=previousPath}
 const codexBin=path.join(process.env.LOCALAPPDATA,'OpenAI/Codex/bin')
 const installedCli=(await fs.readdir(codexBin).catch(()=>[])).length>0
 if(installedCli)assert.ok(discovered.some(a=>a.adapter==='codex'&&a.path.toLowerCase().startsWith(codexBin.toLowerCase()+path.sep)))
 const grant=await inspectApplication(exe,{name:'Synthetic acceptance app',control:true});let confirmed=0
 runtime=registerApplications({config:{roots:[{name:'work',path:run}],applications:{format:'agent-studio-applications-v1',enabled:true,images:true,grants:[grant]}},add:(name,description,schema,fn)=>tools.set(name,fn),confirm:async review=>{assert.equal(review.kind,'application');confirmed++;return true}})
 const call=async(name,args={})=>{const result=await tools.get('apps.'+name)({app:grant.id,...args});return typeof result==='string'?JSON.parse(result):result}
 const windows=await wait(async()=>{const r=await call('windows');return r.windows.length?r.windows:null},'fixture window');assert.equal(windows.length,1)
 let observation=await call('observe',{window:windows[0].id});assert.ok(observation.images?.[0].data);await fs.writeFile(path.join(run,'fixture.png'),Buffer.from(observation.images[0].data,'base64'));let view=JSON.parse(observation.text)
 const editor=view.controls.find(c=>c.name==='Fixture editor');assert.ok(editor);assert.equal(view.controls.find(c=>c.password)?.name,'[protected]')
 const wrongTarget={action:'act',path:exe,window:windows[0].id,title:'Application acceptance fixture',kind:'type',element:editor.id,name:editor.name,runtime:'tampered-runtime-id',text:'MUST_NOT_WRITE',key:''}
 await assert.rejects(applicationNative(wrongTarget),/application_element_changed/)
 await assert.rejects(applicationNative({...wrongTarget,title:'different window'}),/application_window_changed/)
 await assert.rejects(applicationNative({...wrongTarget,path:path.join(run,'different.exe')}),/application_window_changed/)
 assert.equal((await call('act',{observation:view.observation,element:editor.id,action:'type',text:'真实窗口验收 passed'})).accepted,true)
 observation=await call('observe',{window:windows[0].id});view=JSON.parse(observation.text);const button=view.controls.find(c=>c.name==='Save test receipt');assert.ok(button)
 await call('act',{observation:view.observation,element:button.id,action:'click'});const actual=await wait(()=>fs.readFile(receipt,'utf8').catch(()=>''),'receipt');assert.equal(actual,'真实窗口验收 passed\n1');assert.equal(confirmed,2)
 await assert.rejects(call('act',{observation:view.observation,element:button.id,action:'click'}),/observation_expired/)
 console.log('NATIVE_APPLICATION_ACCEPTANCE '+JSON.stringify({status:'PASS',codexDiscoveryWithoutDeveloperPath:installedCli,windowMatched:true,screenshot:true,maskedPassword:true,changedElementDenied:true,changedWindowDenied:true,wrongExecutableDenied:true,unicodeInput:true,nativeClick:true,receipt:actual,confirmations:confirmed,oneUse:true,fixture:run}))
}finally{await runtime?.close();await fixture.close()}
