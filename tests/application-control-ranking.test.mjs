import test from 'node:test'
import assert from 'node:assert/strict'
import {prioritizeApplicationControls} from '../local-executor/applications.mjs'

test('large Electron control trees retain the late editor, new-task tab and send button',()=>{
 const generic=Array.from({length:421},(_,id)=>({id,name:'',type:'ControlType.Custom',enabled:true,password:false,actions:['click']}))
 const important=[
  {id:421,name:'',type:'ControlType.Edit',enabled:true,password:false,actions:['click','type']},
  {id:422,name:'新建任务',type:'ControlType.TabItem',enabled:true,password:false,actions:['click']},
  {id:423,name:'发送',type:'ControlType.Button',enabled:true,password:false,actions:['click']},
 ]
 const original=[...generic,...important],ordered=prioritizeApplicationControls(original)
 assert.equal(ordered[0].id,421)
 assert.ok(ordered.slice(0,5).some(c=>c.id===422))
 assert.ok(ordered.slice(0,5).some(c=>c.id===423))
 assert.equal(ordered.length,15)
 assert.equal(original[0].id,0,'observation source must not be reordered')
 assert.ok(ordered.every(c=>original[c.id]===c),'native element ids must remain unchanged')
})
test('password and disabled controls are never given higher priority than actionable editors',()=>{
 const rows=[
 {id:0,name:'[protected]',type:'ControlType.Edit',password:true,enabled:true,actions:[]},
 {id:1,name:'disabled',type:'ControlType.Button',password:false,enabled:false,actions:[]},
 {id:2,name:'Prompt',type:'ControlType.Edit',password:false,enabled:true,actions:['type']},
 ]
 assert.equal(prioritizeApplicationControls(rows)[0].id,2)
})
