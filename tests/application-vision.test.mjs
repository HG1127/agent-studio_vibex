import test from 'node:test'
import assert from 'node:assert/strict'
import {registerApplicationVision} from '../local-executor/application-vision.mjs'
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4f8AAAAASUVORK5CYII='
function fixture({images=true,control=true,confirm=async()=>true}={}){
 const grant={id:'a'.repeat(24),adapter:'desktop',name:'Fixture',path:'D:\\Fixture.exe',control},handlers=new Map(),calls=[]
 let now=1000,postFailure=false,background=false,changed=false,checks=0
 const view=()=>({window:{id:'123',title:'Fixture',pid:42,x:10,y:20,width:800,height:600,foreground:!background},image:png,imageWidth:400,imageHeight:300})
 const runtime=registerApplicationVision({permission:{images,grants:[grant]},addTool:(name,_d,_s,fn)=>handlers.set(name,fn),checked:async id=>{checks++;if(changed)throw Error('application_binary_changed');assert.equal(id,grant.id);return grant},windows:async()=>[{id:'123',title:'Fixture',foreground:!background}],confirm,clock:()=>now,native:async input=>{calls.push(input);if(input.action==='act')return {accepted:true};if(postFailure)throw Error('application_capture_failed');return view()}})
 const call=async(name,args)=>{const r=await handlers.get('apps.'+name)({app:grant.id,...args});return typeof r==='string'?JSON.parse(r):JSON.parse(r.text)}
 return {call,calls,handlers,grant,runtime,setNow:n=>now=n,setPostFailure:v=>postFailure=v,setBackground:v=>background=v,setChanged:v=>changed=v,get checks(){return checks}}
}
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
test('a failed post-action screenshot preserves the action receipt and forbids replay',async()=>{
 const f=fixture(),o=await f.call('observe_visual',{window:'123'});f.setPostFailure(true);const result=await f.call('act_visual',{observation:o.observation,x:2,y:3,action:'type',text:'Public research only'})
 assert.equal(result.accepted,true);assert.equal(result.reobserveOnly,true);assert.equal(result.observation,null);assert.equal(f.calls.filter(c=>c.action==='act').length,1)
})
test('typing cannot smuggle Enter or an arbitrary key chord into the native action',async()=>{
 const f=fixture();for(const extra of [{action:'type',text:'hello\nSEND'},{action:'key',key:'Control+L'},{action:'scroll',scrollY:11}]){const o=await f.call('observe_visual',{window:'123'});await assert.rejects(f.call('act_visual',{observation:o.observation,x:1,y:1,...extra}),/invalid_application_arguments/)}
 assert.equal(f.calls.filter(c=>c.action==='act').length,0)
})
