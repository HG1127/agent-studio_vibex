import test from 'node:test'
import assert from 'node:assert/strict'
import {buildAgentTaskDispatch} from '../src/lib/agentTaskDispatch.ts'
const base={enabledBuiltins:[],connectedTools:[],marketTools:[],localTools:[],localDeviceOnline:false}
test('empty task produces no guessed calls',()=>assert.deepEqual(buildAgentTaskDispatch(' ',base),[]))
test('web research finds only enabled or verified tools and names missing gaps',()=>{
 const plan=buildAgentTaskDispatch('请联网调研最新行业新闻并给出来源',{...base,enabledBuiltins:['web_search'],connectedTools:[{name:'browser_read',status:'untested'}]})
 assert.equal(plan[0].id,'web');assert.equal(plan[0].available,true);assert.equal(plan[0].sequence,1);assert.deepEqual(plan[0].dependsOn,[]);assert.deepEqual(plan[0].candidates,['web_search','web_fetch','browser.browser_navigate','browser.browser_snapshot'])
 const missing=buildAgentTaskDispatch('请联网调研最新行业新闻',base);assert.equal(missing[0].available,false)
})
test('local file tasks require an online selected device and action-level tools',()=>{
 const offline=buildAgentTaskDispatch('编辑并保存这个 Excel 文件', {...base,localTools:['files.list','files.read','files.update']})
 assert.equal(offline[0].available,false)
 const online=buildAgentTaskDispatch('编辑并保存这个 Excel 文件',{...base,localDeviceOnline:true,localTools:['files.list','files.read','files.update']})
 assert.equal(online[0].available,true);assert.match(online[0].guidance,/授权目录/)
 const wrongGrant=buildAgentTaskDispatch('编辑并保存这个 Excel 文件',{...base,localDeviceOnline:true,localTools:['files.list','files.read','files.move']})
 assert.equal(wrongGrant[0].available,false,'move permission must not imply edit permission')
 const noList=buildAgentTaskDispatch('编辑并保存这个 Excel 文件',{...base,localDeviceOnline:true,localTools:['files.update']})
 assert.equal(noList[0].available,false,'write permission without safe directory listing is insufficient')
})
test('writes and external submission are always marked as side effects',()=>{
 const plan=buildAgentTaskDispatch('读取文件并发送邮件',{...base,localDeviceOnline:true,localTools:['files.list','files.read'],connectedTools:[{name:'send_mail',status:'ok',method:'POST'}]})
 assert.equal(plan.find(x=>x.id==='local-files').sideEffect,false)
 assert.equal(plan.find(x=>x.id==='external-write').sideEffect,true)
 assert.match(plan.find(x=>x.id==='external-write').guidance,/本人审批/)
})
test('market tools must be verified and no tool is auto-enabled',()=>{
 const plan=buildAgentTaskDispatch('提交并发布报告',{...base,marketTools:[{id:'mkt__abc__publish',readOnly:false}]})
 assert.equal(plan[0].available,true);assert.deepEqual(base.enabledBuiltins,[])
 const readOnly=buildAgentTaskDispatch('提交并发布报告',{...base,marketTools:[{id:'mkt__abc__publish',readOnly:true}]})
 assert.equal(readOnly[0].available,false,'verified read-only MCP tools cannot satisfy a write')
})
test('complex task steps are ordered with explicit dependencies and approval gates',()=>{
 const plan=buildAgentTaskDispatch('联网调研网页并读取 Excel，计算总额，最后发送邮件',{...base,enabledBuiltins:['web_search','calculate'],localDeviceOnline:true,localTools:['files.list','files.read'],connectedTools:[{name:'send_mail',status:'ok',method:'POST'}]})
 assert.deepEqual(plan.map(x=>x.id),['web','local-files','calculation','external-write'])
 assert.deepEqual(plan[1].dependsOn,['web'])
 assert.deepEqual(plan[2].dependsOn,['web','local-files'])
 assert.deepEqual(plan[3].dependsOn,['web','local-files','calculation'])
 assert.equal(plan[3].sideEffect,true)
 assert.equal(plan[3].available,true)
})
test('opening a file requires explicit open capability, not only read access',()=>{
 const plan=buildAgentTaskDispatch('打开这个 PDF 文件',{...base,localDeviceOnline:true,localTools:['files.list','files.read']})
 assert.equal(plan[0].available,false)
 assert.deepEqual(plan[0].candidates,['files.list','files.read','files.open'])
})
test('unrelated read-only browser connectors are not mistaken for web search capability',()=>{
 const plan=buildAgentTaskDispatch('联网调研最新行业新闻',{...base,connectedTools:[{name:'browser_read',description:'Read one supplied URL',status:'ok',method:'GET'}]})
 assert.equal(plan[0].available,false)
})
test('an unrelated writable HTTP endpoint is not assumed to send email',()=>{
 const plan=buildAgentTaskDispatch('发送邮件给客户',{...base,connectedTools:[{name:'update_inventory',description:'Update warehouse stock',status:'ok',method:'POST'}]})
 assert.equal(plan[0].available,false)
})
test('read-only external connections never satisfy a side-effect operation',()=>{
 const plan=buildAgentTaskDispatch('发送邮件',{...base,connectedTools:[{name:'mail',status:'ok',method:'GET'}]})
 assert.equal(plan[0].available,false)
})
test('knowledge and calculation are separately identified',()=>{
 const plan=buildAgentTaskDispatch('从知识库查资料，计算总额',{...base,enabledBuiltins:['knowledge_search','calculate']})
 assert.deepEqual(plan.map(x=>x.id),['knowledge','calculation'])
})
