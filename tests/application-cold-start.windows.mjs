// Cold application, not an already-open fixture. No user account or paid model.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createApplicationFixture} from './helpers/application-fixture.windows.mjs'
import {inspectApplication,registerApplications} from '../local-executor/applications.mjs'
const fixture=await createApplicationFixture(path.resolve('.tmp/cold-application'),{autoStart:false,startupDelayMs:3500}),tools=new Map();let runtime,confirmed=0
try{
 const grant=await inspectApplication(fixture.exe,{name:'Cold acceptance app',control:true})
 runtime=registerApplications({config:{roots:[{name:'work',path:fixture.run}],applications:{format:'agent-studio-applications-v1',enabled:true,images:false,grants:[grant]}},launch:fixture.launch,confirm:async()=>{confirmed++;return true},add:(name,d,s,fn)=>tools.set(name,fn)})
 const call=async(name,args={})=>{console.log('COLD_STAGE '+name);const result=JSON.parse(await tools.get('apps.'+name)({app:grant.id,...args}));console.log('COLD_DONE '+name);return result}
 assert.deepEqual((await call('windows')).windows,[])
 const launch=await call('launch');assert.equal(launch.status,'ready');assert.equal(launch.alreadyRunning,false);assert.equal(launch.windows.length,1)
 const warm=await call('launch');assert.equal(warm.alreadyRunning,true)
 const window=launch.windows[0].id;let observation=await call('observe',{window}),editor=observation.controls.find(c=>c.name==='Fixture editor')
 console.log('COLD_EDITOR '+JSON.stringify(editor));assert.ok(editor.actions.includes('type'));assert.equal(editor.value,'');assert.equal(observation.controls.find(c=>c.password).value,undefined)
 await call('act',{observation:observation.observation,element:editor.id,action:'type',text:'COLD_START_TASK_VERIFIED'})
 observation=await call('observe',{window});editor=observation.controls.find(c=>c.name==='Fixture editor');assert.equal(editor.value,'COLD_START_TASK_VERIFIED')
 const button=observation.controls.find(c=>c.name==='Save test receipt');assert.ok(button.actions.includes('click'));assert.ok(!button.actions.includes('type'))
 await call('act',{observation:observation.observation,element:button.id,action:'click'})
 assert.equal(await fs.readFile(fixture.receipt,'utf8'),'COLD_START_TASK_VERIFIED\n1');assert.equal(confirmed,2)
 const qoder=await inspectApplication('D:\\Qoder\\Qoder.exe',{name:'Qoder',control:true}).catch(e=>{if(e.code==='ENOENT')return null;throw e})
 if(qoder){assert.match(qoder.windowPath,/\.qoder-versions/);assert.equal(qoder.windowSha256.length,64);assert.equal(qoder.accessibility,'electron')}
 console.log('COLD_START_NATIVE_PASS '+JSON.stringify({initiallyClosed:true,windowReady:true,warmReuse:true,textReadBack:true,realClickReceipt:true,confirmations:confirmed,qoderPinnedTarget:qoder?.windowPath||null,paidModelCalls:false,fixture:fixture.run}))
}finally{await runtime?.close();await fixture.close()}
