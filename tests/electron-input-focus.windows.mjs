// Isolated real-Electron focus validation. No WorkBuddy or user files.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createElectronApplicationFixture} from './helpers/electron-application-fixture.windows.mjs'
import {inspectApplication,registerApplications} from '../local-executor/applications.mjs'

const root=path.resolve('.tmp/electron-focus-acceptance')
await fs.mkdir(root,{recursive:true})
const electron=await createElectronApplicationFixture(root,path.resolve('desktop/node_modules/electron/dist'))
const grant=await inspectApplication(electron.exe,{name:'Isolated Electron focus fixture',control:true})
const tools=new Map(),children=[]
let confirmed=0,runtime
const launch=(exe,args,options)=>{assert.equal(exe,electron.exe);const child=spawn(exe,args,options);children.push(child);return child}
const call=async(name,args={})=>{
 const raw=await tools.get('apps.'+name)({app:grant.id,...args})
 return typeof raw==='string'?JSON.parse(raw):raw
}
try{
 runtime=registerApplications({
  config:{roots:[],applications:{format:'agent-studio-applications-v1',enabled:true,images:false,grants:[grant]}},
  add:(name,_description,_schema,fn)=>tools.set(name,fn),
  confirm:async review=>{assert.equal(review.kind,'application');confirmed++;return true},
  launch
 })
 const started=await call('launch')
 assert.equal(started.status,'ready')
 assert.equal(started.windows.length,1)
 assert.equal(started.alreadyRunning,false)
 const window=started.windows[0].id
 const observed=await call('observe',{window,activate:true})
 assert.equal(observed.window?.foreground,true,'explicit approved activation must remain foreground throughout observation')
 assert.ok(observed.observation)
 const editor=observed.controls.find(c=>c.name?.includes('Fixture editor')&&c.type?.endsWith('.Edit'))
 assert.ok(editor,'electron text editor was not exposed through UIA')
 assert.ok(editor.actions.includes('type'),'electron editor must be writable')
 const request='调研AI工作台设计：真实窗口焦点验收'
 const typed=await call('act',{observation:observed.observation,element:editor.id,action:'type',text:request})
 assert.equal(typed.accepted,true)
 assert.equal(typed.contentsVerified,false)
 const after=await call('observe',{window})
 const actual=after.controls.find(c=>c.name?.includes('Fixture editor')&&c.type?.endsWith('.Edit'))
 assert.equal(actual?.value,request,'the real Electron editor must contain the submitted Unicode text')
 assert.equal(confirmed,2)
 console.log('ELECTRON_FOCUS_ACCEPTANCE '+JSON.stringify({status:'PASS',windowReady:true,electronEditorFound:true,focusedInput:true,unicodeReadback:true,confirmations:confirmed,protectedRealApps:true}))
}finally{
 await runtime?.close()
 for(const child of children)if(child.exitCode===null){child.kill();await new Promise(resolve=>{const timer=setTimeout(resolve,2500);child.once('exit',()=>{clearTimeout(timer);resolve()})})}
}
