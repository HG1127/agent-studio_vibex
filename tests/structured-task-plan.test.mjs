import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {readExecutionPlan} from '../src/lib/structuredTaskPlanView.ts'
const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/structured_task_plan.js','utf8'),sandbox)
const service=sandbox.module.exports
const catalogSandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/task_plan_catalog.js','utf8'),catalogSandbox)
const clean=x=>JSON.parse(JSON.stringify(x))
const catalog=[{id:'calculate',signature:'calc1',approval_required:false},{id:'save_report',signature:'save1',approval_required:true},{id:'local_computer',signature:'local1',approval_required:true,local_tools:['files.list','files.read']}]
const node=(id,tools=[],deps=[])=>({id,title:id,objective:'核验并交付',source_role:'',depends_on:deps,tools,required_tools:tools.slice(),local_tools:[],inputs:['任务'],outputs:['成果'],acceptance:['有真实回执']})
const raw=()=>({version:1,summary:'计算后保存',missing_capabilities:[],nodes:[node('calc',['calculate']),node('save',['save_report'],['calc'])]})
const ctx={catalog,roles:[],remainingSteps:18}
const normalize=(p,c=ctx)=>clean(service.normalize(p,c))
test('catalog rejects ambiguous duplicate names and prevents HTTP tools shadowing builtins',()=>{
 const rec=(id,name,status='ok')=>({id,getString:key=>({name,status,method:'POST',description:'fixture',url:'https://invalid.test',headers:'',body_template:'{}'}[key]||'')})
 const list=[rec('a','save_report'),rec('b','save_report','untested'),rec('c','calculate')]
 const app={findRecordsByFilter:(name)=>name==='tool_connections'?list:[]}
 const result=clean(catalogSandbox.module.exports.collect(app,{tools:{calculate:true,save_report:true}}, {tools:['calculate','save_report']},'owner',{},x=>x))
 assert.deepEqual(result.map(row=>row.id),['calculate'])
})
test('plan is topologically ordered, risk comes from catalogue and input is unchanged',()=>{const p=raw();p.nodes.reverse();p.nodes[0].approval_required=false;const before=JSON.stringify(p),out=normalize(p);assert.equal(out.ok,true);assert.deepEqual(out.plan.nodes.map(n=>n.id),['calc','save']);assert.equal(out.plan.nodes[1].approval_required,true);assert.equal(JSON.stringify(p),before);assert.equal(out.plan.minimum_steps,5)})
for(const [label,change,error] of [
 ['cycle',p=>p.nodes[0].depends_on=['save'],'execution_plan_cycle'],
 ['unknown dependency',p=>p.nodes[0].depends_on=['unknown'],'execution_plan_dependency_invalid'],
 ['self dependency',p=>p.nodes[0].depends_on=['calc'],'execution_plan_dependency_invalid'],
 ['duplicate node',p=>p.nodes[1].id='calc','execution_plan_node_invalid'],
 ['prototype identifier',p=>p.nodes[0].id='constructor','execution_plan_node_invalid'],
 ['unknown tool',p=>{p.nodes[0].tools=['shell'];p.nodes[0].required_tools=['shell']},'execution_plan_tool_denied'],
 ['missing evidence requirement',p=>p.nodes[0].required_tools=[],'execution_plan_evidence_required'],
 ['extra required tool',p=>p.nodes[0].required_tools=['save_report'],'execution_plan_evidence_required'],
 ['unknown local operation',p=>{p.nodes[0].tools=['local_computer'];p.nodes[0].required_tools=['local_computer'];p.nodes[0].local_tools=['files.trash']},'execution_plan_local_tool_denied'],
 ['empty acceptance',p=>p.nodes[0].acceptance=[],'execution_plan_node_invalid'],
 ['unexpected original role',p=>p.nodes[0].source_role='foreign','execution_plan_role_denied'],
 ['node overflow',p=>p.nodes=Array.from({length:9},(_,i)=>node('n'+i)),'execution_plan_shape_invalid'],
])test(label+' is rejected',()=>{const p=raw();change(p);assert.equal(normalize(p).error,error)})
test('insufficient step budget fails before plan acceptance',()=>assert.equal(normalize(raw(),{...ctx,remainingSteps:4}).error,'execution_plan_budget_too_small'))
test('existing roles cannot be omitted, reordered, renamed or expanded',()=>{const roles=[{id:'calc',tools:['calculate']},{id:'save',tools:['save_report'],skill_refs:[{id:'pinned',version:2,hash:'h'}]}];const p=raw();p.nodes.forEach(n=>n.source_role=n.id);assert.equal(normalize(p,{...ctx,roles}).ok,true);p.nodes[0].tools=['save_report'];p.nodes[0].required_tools=['save_report'];assert.equal(normalize(p,{...ctx,roles}).error,'execution_plan_tool_denied');p.nodes=[node('calc',['calculate'])];p.nodes[0].source_role='calc';assert.equal(normalize(p,{...ctx,roles}).error,'execution_plan_role_omitted')})
test('skill references come from existing source role, never model-supplied data',()=>{const roles=[{id:'calc',tools:['calculate'],skill_refs:[{id:'original'}]}];const p={...raw(),nodes:[{...node('calc',['calculate']),source_role:'calc',skill_refs:[{id:'untrusted'}]}]};const result=normalize(p,{...ctx,roles});assert.deepEqual(result.plan.nodes[0].skill_refs,[{id:'original'}])})
test('approved node scope cannot borrow another node or local operation',()=>{const p=normalize(raw()).plan;assert.equal(service.permits(p,'calc','calculate',{}),true);assert.equal(service.permits(p,'calc','save_report',{}),false);assert.equal(service.permits(p,'unknown','calculate',{}),false)})
test('required evidence is exact per node and tool, not text or another stage',()=>{const p=normalize(raw()).plan;let proof=service.recordSuccess({},'calc','calculate','',2);assert.deepEqual(clean(service.missingEvidence(p,'calc',proof)),[]);assert.deepEqual(clean(service.missingEvidence(p,'save',proof)),['save_report']);proof=service.recordSuccess(proof,'save','save_report','',4);assert.deepEqual(clean(service.missingEvidence(p,'save',proof)),[])})
test('every selected local subtool needs its own successful receipt',()=>{const p={...raw(),nodes:[{...node('local',['local_computer']),local_tools:['files.list','files.read']}]};const value=normalize(p).plan;const proof=service.recordSuccess({},'local','local_computer','files.list',2);assert.deepEqual(clean(service.missingEvidence(value,'local',proof)),['files.read']);assert.equal(service.permits(value,'local','local_computer',{tool:'files.trash'}),false)})
test('resource binding comparison survives JSON key order but detects revocation and target changes',()=>{const p=normalize(raw()).plan,b=service.bindings(p,catalog);assert.equal(service.resourcesMatch(p,clean(b).map(r=>({signature:r.signature,id:r.id})),catalog),true);assert.equal(service.resourcesMatch(p,b,catalog.slice(0,1)),false);assert.equal(service.resourcesMatch(p,b,[catalog[0],{...catalog[1],signature:'changed'}]),false)})
test('gaps are explicit review data, not invented tool grants',()=>{const p=raw();p.missing_capabilities=['缺少发送服务'];const out=normalize(p);assert.equal(out.ok,true);assert.match(service.reviewText(out.plan),/当前不可批准/);assert.deepEqual(out.plan.nodes[1].tools,['save_report'])})
test('UI never infers completion from success status without required receipts',()=>{const p=normalize(raw()).plan;const run={status:'succeeded',checkpoint:{execution_plan:p,plan_revision:'a'.repeat(64),plan_approved:true,role_state:{completed:['calc'],active_role_id:'save',outputs:{calc:'42'}},plan_evidence:{}}};assert.notEqual(readExecutionPlan(run).nodes[0].status,'submitted');run.checkpoint.plan_evidence=clean(service.recordSuccess({},'calc','calculate','',2));assert.equal(readExecutionPlan(run).nodes[0].status,'submitted')})
test('UI displays reviewed plan, pending steps, approval wait and stopped states accurately',()=>{const p=normalize(raw()).plan,run={status:'awaiting_input',checkpoint:{execution_plan:p,plan_approved:false,role_state:{active_role_id:'calc'}}};assert.equal(readExecutionPlan(run).nodes[0].status,'review');run.checkpoint.plan_approved=true;run.status='awaiting_approval';assert.equal(readExecutionPlan(run).nodes[0].status,'awaiting_approval');run.status='failed';assert.equal(readExecutionPlan(run).nodes[0].status,'stopped');assert.equal(readExecutionPlan(run).nodes[1].status,'stopped');run.status='paused';assert.equal(readExecutionPlan(run).nodes[0].status,'paused');assert.equal(readExecutionPlan(run).nodes[1].status,'pending');run.status='cancelled';run.checkpoint.plan_approved=false;assert.equal(readExecutionPlan(run).nodes[0].status,'stopped')})
