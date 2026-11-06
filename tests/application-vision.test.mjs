import test from 'node:test'
import assert from 'node:assert/strict'
import {registerApplicationVision} from '../local-executor/application-vision.mjs'
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4f8AAAAASUVORK5CYII='
function fixture({images=true,control=true,confirm=async()=>true}={}){
 const grant={id:'a'.repeat(24),adapter:'desktop',name:'Fixture',path:'D:\\Fixture.exe',control},handlers=new Map(),calls=[]
 let now=1000,postFailure=false,background=false,changed=false,checks=0,captureError=null
 const view=()=>({window:{id:'123',title:'Fixture',pid:42,x:10,y:20,width:800,height:600,foreground:!background},image:captureError?null:png,imageError:captureError,imageWidth:400,imageHeight:300})
 const runtime=registerApplicationVision({permission:{images,grants:[grant]},addTool:(name,_d,_s,fn)=>handlers.set(name,fn),checked:async id=>{checks++;if(changed)throw Error('application_binary_changed');assert.equal(id,grant.id);return grant},windows:async()=>[{id:'123',title:'Fixture',foreground:!background}],confirm,clock:()=>now,native:async input=>{calls.push(input);if(input.action==='act')return {accepted:true};if(postFailure)throw Error('application_capture_failed');return view()}})
 const call=async(name,args)=>{const r=await handlers.get('apps.'+name)({app:grant.id,...args});return typeof r==='string'?JSON.parse(r):JSON.parse(r.text)}
 return {call,calls,handlers,grant,runtime,setNow:n=>now=n,setPostFailure:v=>postFailure=v,setBackground:v=>background=v,setCaptureError:v=>captureError=v,setChanged:v=>changed=v,get checks(){return checks}}
}

test('unavailable bounded screenshots return recovery guidance without an input token or replay',async()=>{
 for(const [code,status] of [['application_foreground_unavailable','window_background'],['application_window_occluded','window_occluded']]){
  const f=fixture(),old=await f.call('observe_visual',{window:'123'});f.setCaptureError(code)
  const failed=await f.call('observe_visual',{window:'123'});assert.equal(failed.status,status);assert.equal(failed.observation,null);assert.equal(failed.actionable,false)
  await assert.rejects(f.call('act_visual',{observation:old.observation,x:1,y:1,action:'click'}),/expired/)
  assert.equal(f.calls.filter(c=>c.action==='act').length,0)
 }
 let f,approved=0;f=fixture({confirm:async()=>{approved++;f.setBackground(false);f.setCaptureError(null);return true}})
 f.setBackground(true);f.setCaptureError('application_foreground_unavailable')
 assert.equal((await f.call('observe_visual',{window:'123'})).status,'window_background');assert.equal(approved,0)
 assert.equal((await f.call('observe_visual',{window:'123',activate:true})).actionable,true);assert.equal(approved,1)
 const read=fixture({control:false});read.setCaptureError('application_foreground_unavailable');assert.equal((await read.call('observe_visual',{window:'123'})).actionable,false);await assert.rejects(read.call('observe_visual',{window:'123',activate:true}),/control_denied/)
})
test('visual tools require explicit screenshot permission and respect read-only app grants',async()=>{
 assert.equal(fixture({images:false}).handlers.size,0)
 const read=fixture({control:false});assert.equal(read.handlers.has('apps.act_visual'),false);const result=await read.call('observe_visual',{window:'123'});assert.equal(result.actionable,false);assert.equal(result.observation,null)
 await assert.rejects(read.call('observe_visual',{window:'123',activate:true}),/control_denied/)
})
test('a screenshot is a one-use window-scoped image-space action capability',async()=>{
 const f=fixture(),before=await f.call('observe_visual',{window:'123'}),after=await f.call('act_visual',{observation:before.observation,x:200,y:150,action:'click'})
 assert.equal(after.accepted,true);assert.equal(after.contentsVerified,false);assert.notEqual(before.observation,after.observation)
 const input=f.calls.find(c=>c.action==='act');assert.equal(input.x,400);assert.equal(input.y,300);assert.equal(input.windowX,10);assert.equal(input.windowY,20);assert.equal(input.pid,42)
 await assert.rejects(f.call('act_visual',{observation:before.observation,x:200,y:150,action:'click'}),/observation_expired/)
})
test('expired, out-of-image or other-app coordinates cannot produce input',async()=>{
 const f=fixture(),o=await f.call('observe_visual',{window:'123'});f.setNow(32000);await assert.rejects(f.call('act_visual',{observation:o.observation,x:0,y:0,action:'click'}),/expired/)
 const next=await f.call('observe_visual',{window:'123'});await assert.rejects(f.call('act_visual',{observation:next.observation,x:400,y:1,action:'click'}),/coordinate_denied/)
 assert.equal(f.calls.filter(c=>c.action==='act').length,0)
 await assert.rejects(f.handlers.get('apps.observe_visual')({app:'b'.repeat(24),window:'123'}),/application_denied/)
})
test('approval rejection and executable changes prevent visual input',async()=>{
 const f=fixture({confirm:async()=>false}),o=await f.call('observe_visual',{window:'123'});await assert.rejects(f.call('act_visual',{observation:o.observation,x:1,y:1,action:'click'}),/declined/);assert.equal(f.calls.length,1)
 const g=fixture(),v=await g.call('observe_visual',{window:'123'});g.setChanged(true);await assert.rejects(g.call('act_visual',{observation:v.observation,x:1,y:1,action:'click'}),/binary_changed/);assert.equal(g.calls.length,1)
})
test('background observations return authorized images but no input token',async()=>{
 const f=fixture();f.setBackground(true);const o=await f.call('observe_visual',{window:'123'});assert.equal(o.actionable,false);assert.equal(o.observation,null)
})

test('foreground visual reads skip redundant activation approval while background activation still requires it',async()=>{
 let confirmations=0
 const f=fixture({confirm:async()=>{confirmations++;return true}})
 const o=await f.call('observe_visual',{window:'123',activate:true})
 assert.equal(o.actionable,true);assert.equal(confirmations,0);assert.equal(f.calls[0].activate,false)
 f.setBackground(true);await f.call('observe_visual',{window:'123',activate:true})
 assert.equal(confirmations,1);assert.equal(f.calls.at(-1).activate,true)
 const rejected=fixture({confirm:async()=>false});rejected.setBackground(true)
 await assert.rejects(rejected.call('observe_visual',{window:'123',activate:true}),/declined/)
 assert.equal(rejected.calls.length,0)
})
test('a failed post-action screenshot preserves the action receipt and forbids replay',async()=>{
 const f=fixture(),o=await f.call('observe_visual',{window:'123'});f.setPostFailure(true);const result=await f.call('act_visual',{observation:o.observation,x:2,y:3,action:'type',text:'Public research only'})
 assert.equal(result.accepted,true);assert.equal(result.reobserveOnly,true);assert.equal(result.observation,null);assert.equal(f.calls.filter(c=>c.action==='act').length,1)
})
test('typing cannot smuggle Enter or an arbitrary key chord into the native action',async()=>{
 const f=fixture();for(const extra of [{action:'type',text:'hello\nSEND'},{action:'key',key:'Control+L'},{action:'scroll',scrollY:11}]){const o=await f.call('observe_visual',{window:'123'});await assert.rejects(f.call('act_visual',{observation:o.observation,x:1,y:1,...extra}),/invalid_application_arguments/)}
 assert.equal(f.calls.filter(c=>c.action==='act').length,0)
})
