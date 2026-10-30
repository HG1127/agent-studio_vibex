import test from 'node:test'
import assert from 'node:assert/strict'
import {buildAgentCapabilityPlan,bindAgentCapability,agentCapabilityReadiness} from '../src/lib/agentCapabilityPlan.ts'
import {agentRunReadiness} from '../src/lib/agentRunReadiness.ts'
const app='a'.repeat(24)
const device=()=>({id:'owned-device',revoked:false,seen_ms:Date.now(),catalog:JSON.stringify(['apps.windows','apps.observe','apps.act'].map(name=>({name,inputSchema:{properties:{app:{enum:[app]}},'x-studio-applications':[{id:app,name:'Notepad',adapter:'desktop',control:true}]}})))})
const need={id:'app',title:'Notepad 输入内容',purpose:'操作已授权窗口',kind:'desktop',access:'write',required:true,role_ids:['writer'],search_terms:['Notepad'],suggested_tool_ids:[]}
const role=id=>({id,name:id,responsibility:'处理任务',tasks:['完成任务'],inputs:[],deliverables:['成果'],depends_on:[],tools:[],done_criteria:['核对结果']})
const spec=()=>({goal:'操作 Notepad',task_scope:'专用窗口',deliverables:['成果'],tools:[],task_plan:['输入内容'],done_criteria:['核对结果'],roles:[role('writer'),role('reviewer')],capability_requirements:[need]})
test('wizard offers exact local capability, then grants only explicitly chosen roles',()=>{
 const value=spec(),before=JSON.stringify(value),local=device()
 const row=buildAgentCapabilityPlan(value,null,[],[],local)[0]
 assert.equal(row.candidates[0].source,'local');assert.equal(row.state,'available')
 assert.ok(agentCapabilityReadiness(value,null,[],[],local).length)
 const bound=bindAgentCapability(value,'app','local_computer',null,[],[],local)
 assert.deepEqual(bound.tools,['local_computer']);assert.deepEqual(bound.roles[0].tools,['local_computer']);assert.deepEqual(bound.roles[1].tools,[])
 assert.deepEqual(agentCapabilityReadiness(bound,null,[],[],local),[])
 assert.equal(agentRunReadiness(bound,{localDevice:local}).ready,true)
 assert.equal(JSON.stringify(value),before)
})
test('stale, revoked, unapproved app, missing action, and orphan role cannot be bound',()=>{
 for(const local of [{...device(),revoked:true},{...device(),seen_ms:Date.now()-46000},{...device(),catalog:'[]'}]){
  const value=spec();assert.equal(bindAgentCapability(value,'app','local_computer',null,[],[],local),value)
 }
 const value=spec(),wrong={...value,capability_requirements:[{...need,title:'WeChat 输入内容',search_terms:['WeChat']}]}
 assert.equal(bindAgentCapability(wrong,'app','local_computer',null,[],[],device()),wrong)
 const orphan={...value,capability_requirements:[{...need,role_ids:['absent']}]}
 assert.equal(bindAgentCapability(orphan,'app','local_computer',null,[],[],device()),orphan)
 const limited=device();limited.catalog=limited.catalog.replaceAll('apps.act','unrelated')
 assert.equal(bindAgentCapability(value,'app','local_computer',null,[],[],limited),value)
})
test('image authorization remains separate from text controls in the wizard',()=>{
 const value={...spec(),capability_requirements:[{...need,title:'Notepad 截图',purpose:'核对图像',access:'read'}]}
 assert.ok(agentCapabilityReadiness(value,null,[],[],device()).length)
 assert.equal(buildAgentCapabilityPlan(value,null,[],[],device())[0].candidates.length,0)
})
