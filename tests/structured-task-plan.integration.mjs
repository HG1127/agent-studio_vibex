// Real disposable PocketBase + standalone employee JWTs + local deterministic model/tools.
// No production records, user credentials, paid models, real mail or public network are used.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomBytes} from 'node:crypto'
import {createServer} from 'node:http'
import {createServer as netServer} from 'node:net'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-structured-plan-'))
const setupKey=randomBytes(32).toString('hex'),encryption=randomBytes(16).toString('hex'),password='Isolated-plan-2026!'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const freePort=async()=>{const s=netServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
const port=await freePort(),origin='http://127.0.0.1:'+port
let pb,ui,browser,runtime,token='',foreign='',logs='',writes=0,checks=0,modelCalls=0,planningCalls=0,cancelEntered=false
const counters=new Map(),pass=message=>{checks++;console.log('PASS '+message)}
const baseNode=(id,tools,depends=[])=>({id,title:id==='analysis'?'计算核验':'保存交付',objective:id==='analysis'?'计算 6*7 并核验':'把已核验的42写入隔离测试端点',source_role:'',depends_on:depends,tools,required_tools:tools.slice(),local_tools:[],inputs:['任务及前序结果'],outputs:['可核验交付'],acceptance:['所需工具有成功回执']})
function plan(context){
 const p={version:1,summary:'先计算核验，再审批保存；只使用隔离资源',nodes:[baseNode('analysis',['calculate']),baseNode('delivery',['fixture_write'],['analysis'])],missing_capabilities:[]}
 if(context.instruction.includes('CASE_LOCAL'))p.nodes=[{...baseNode('local_copy',['local_computer']),title:'本机读取并新建副本',objective:'读取source.txt并新建copy.txt',local_tools:['files.read','files.write']}]
 if(context.instruction.includes('CASE_INVALID'))p.nodes[0].tools=p.nodes[0].required_tools=['ungranted_shell']
 if(context.instruction.includes('CASE_GAP')&&!context.revision_feedback)p.missing_capabilities=['没有获准的真实邮件服务，不能对外发送']
 return p
}
const local=createServer(async(req,res)=>{
 let raw='';for await(const b of req)raw+=b
 res.setHeader('Content-Type','application/json')
 if(req.url==='/save'){writes++;res.end(JSON.stringify({saved:true,value:42,isolated:true}));return}
 modelCalls++
 let body;try{body=JSON.parse(raw||'{}')}catch{res.writeHead(400);res.end('{}');return}
 const system=String(body.messages?.find(m=>m.role==='system')?.content||''),user=String(body.messages?.find(m=>m.role==='user')?.content||'')
 let content='Only a deterministic test memory; no external action.'
 if(system.includes('STRUCTURED_TASK_PLAN_V1')){
  planningCalls++;const context=JSON.parse(user)
  if(context.instruction.includes('CASE_CANCEL')){cancelEntered=true;await sleep(600)}
  content=JSON.stringify(plan(context))
 }else if(system.includes('助手执行引擎')){
  const scenario=user.match(/CASE_[A-Z]+/)?.[0]||'CASE_UNKNOWN',stage=system.includes('（analysis）')?'analysis':system.includes('（delivery）')?'delivery':system.includes('（local_copy）')?'local_copy':'unknown'
  const key=scenario+':'+stage,n=(counters.get(key)||0)+1;counters.set(key,n)
  if(stage==='analysis'){
   if(scenario==='CASE_MAIN'&&n===1)content=JSON.stringify({action:'final',final_answer:'UNPROVEN_COMPLETE'})
   else if(n===(scenario==='CASE_MAIN'?2:1))content=JSON.stringify({action:'tool',tool:'calculate',tool_input:{expression:'6*7'}})
   else content=JSON.stringify({action:'role_complete',role_id:'analysis',role_output:'CALC_RECEIPT: 6*7 = 42'})
  }else if(stage==='delivery'){
   if(scenario==='CASE_MAIN'&&n===1)content=JSON.stringify({action:'tool',tool:'calculate',tool_input:{expression:'1+1'}})
   else if(n===(scenario==='CASE_MAIN'?2:1))content=JSON.stringify({action:'tool',tool:'fixture_write',tool_input:{value:42}})
   else content=JSON.stringify({action:'final',final_answer:'PLAN_DELIVERY_VERIFIED: 42 saved once to isolated endpoint'})
  }else if(stage==='local_copy'){
   if(n===1)content=JSON.stringify({action:'tool',tool:'local_computer',tool_input:{tool:'files.read',arguments:{root:'work',path:'source.txt'}}})
   else if(n===2){assert.match(user,/SOURCE_FROM_DISK: 42/);content=JSON.stringify({action:'tool',tool:'local_computer',tool_input:{tool:'files.write',arguments:{root:'work',path:'copy.txt',text:'SOURCE_FROM_DISK: 42'}}})}
   else content=JSON.stringify({action:'final',final_answer:'LOCAL_PLAN_DONE: copy.txt created from the observed source'})
  }else content=JSON.stringify({action:'final',final_answer:'UNEXPECTED_STAGE'})
 }
 res.end(JSON.stringify({choices:[{message:{role:'assistant',content}}],usage:{prompt_tokens:10,completion_tokens:20}}))
})
async function startBackend(){
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:setupKey,AGENT_STUDIO_SECRET_KEY:encryption,AGENT_STUDIO_STRICT_SECRETS:'true',AGENT_STUDIO_BACKGROUND_WORKER:'false'}})
 pb.stdout.on('data',b=>{logs=(logs+b).slice(-12000)});pb.stderr.on('data',b=>{logs=(logs+b).slice(-12000)})
 for(let i=0;i<150;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(600)})).ok)return}catch{}if(pb.exitCode!==null)break;await sleep(100)}
 throw Error('isolated_backend_unreachable: '+logs.slice(-3000))
}
async function request(method,route,body,auth=token,setup=false){const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{}),...(setup?{'X-Agent-Studio-Setup-Key':setupKey}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json().catch(()=>({}))}}
async function ok(method,route,body,auth,expected=200,setup=false){const result=await request(method,route,body,auth,setup);assert.equal(result.status,expected,method+' '+route+' '+JSON.stringify(result.data));return result.data}
let model,spec,connection
const state=id=>ok('GET','/api/agent_runs/'+id)
const tick=id=>ok('POST','/api/llm/agent-engine/'+id+'/tick',{})
const launch=async scenario=>(await ok('POST','/api/agent-runs/start',{spec_id:spec.id,instruction:scenario+' Calculate and save 42 in the isolated endpoint only.',model:'plan-fixture',config:{task_planning:'reviewed_v1',max_steps:20,max_model_calls:40,require_approval:false,tools:{calculate:true},custom_model:{connection_id:model.item.id,model_id:'plan-fixture'}}})).run_id
const review=async(id,decision='approve',answer='')=>{const s=await state(id);return ok('POST','/api/agent-runs/'+id+'/respond',{decision,answer,plan_revision:s.checkpoint.plan_revision})}
async function until(id,status,limit=15){for(let i=0;i<limit;i++){const s=await state(id);if(s.status===status)return s;assert.equal(s.status,'running','unexpected state '+JSON.stringify(s));await tick(id)}throw Error('state_not_reached:'+status)}
try{
 await new Promise(r=>local.listen(0,'127.0.0.1',r));await startBackend()
 await ok('POST','/api/studio/bootstrap',{email:'plan-owner@example.test',password,display_name:'计划隔离验收'},'',201,true)
 token=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'plan-owner@example.test',password},'')).token
 await ok('POST','/api/studio/users',{email:'plan-other@example.test',password,display_name:'另一员工',role:'employee'},token,201)
 foreign=(await ok('POST','/api/collections/studio_users/auth-with-password',{identity:'plan-other@example.test',password},'')).token
 const upstream='http://127.0.0.1:'+local.address().port
 model=await ok('POST','/api/model-connections',{name:'Deterministic planning fixture',provider:'openai',api_key:'isolated-fixture-not-a-real-key',base_url:upstream+'/v1',models:['plan-fixture']})
 connection=await ok('POST','/api/tool-connections',{name:'fixture_write',description:'Save 42 to isolated local test endpoint',method:'POST',url:upstream+'/save',headers:[],body_template:'{{input}}'})
 await ok('POST','/api/tool-connections/test',{connection_id:connection.item.id,input:'{}',confirm_write:true});writes=0
 spec=await ok('POST','/api/agent_specs',{name:'结构化计划验收',spec:{goal:'先计算再保存，仅隔离测试',task_scope:'Only local fixture',tools:['calculate','fixture_write'],roles:[],task_plan:['Calculate','Save'],deliverables:['42 and receipt'],done_criteria:['Must have saved receipt'],capability_requirements:[]}})
 const id=await launch('CASE_MAIN');await tick(id)
 const draft=await state(id);assert.equal(draft.status,'awaiting_input',JSON.stringify(draft));assert.equal(draft.config.require_approval,true);assert.equal(draft.checkpoint.plan_approved,false);assert.equal(writes,0)
 assert.deepEqual(draft.checkpoint.execution_plan.nodes.map(n=>n.id),['analysis','delivery']);assert.deepEqual(draft.spec_snapshot.roles,[])
 pass('actual model transport generates a server-validated plan; immutable Agent unchanged and no tool runs before review')
 const callsBefore=modelCalls;await tick(id);assert.equal(modelCalls,callsBefore);assert.equal(writes,0)
 assert.equal((await request('POST','/api/agent-runs/'+id+'/respond',{decision:'approve',plan_revision:'stale'})).status,409)
 assert.equal((await request('POST','/api/agent-runs/'+id+'/respond',{decision:'approve',plan_revision:draft.checkpoint.plan_revision},foreign)).status,404)
 const concurrent=await Promise.all([request('POST','/api/agent-runs/'+id+'/respond',{decision:'approve',plan_revision:draft.checkpoint.plan_revision}),request('POST','/api/agent-runs/'+id+'/respond',{decision:'approve',plan_revision:draft.checkpoint.plan_revision})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409])
 pass('wrong-owner, stale-plan and duplicate approvals fail closed; repeated ticks do not call the model while awaiting review')
 await tick(id);let s=await state(id);assert.equal(s.status,'running');assert.equal(s.result,'');assert.ok(!s.checkpoint.role_state.completed.length)
 await tick(id);s=await state(id);assert.equal(s.checkpoint.plan_evidence.analysis[0].tool,'calculate')
 await stopHeadlessPocketBase(pb);await startBackend();assert.deepEqual((await state(id)).checkpoint.plan_evidence,s.checkpoint.plan_evidence)
 pass('premature model completion is rejected without tool evidence; actual server restart retains reviewed plan and successful receipt')
 await tick(id);s=await state(id);assert.deepEqual(s.checkpoint.role_state.completed,['analysis'])
 await tick(id);assert.equal(writes,0);s=await state(id);assert.equal(s.status,'running')
 await tick(id);s=await state(id);assert.equal(s.status,'awaiting_approval');assert.equal(writes,0)
 const beforeApproveCalls=modelCalls;await ok('POST','/api/agent-runs/'+id+'/approve',{decision:'approve'});await tick(id)
 assert.equal(writes,1);assert.equal(modelCalls,beforeApproveCalls,'approved exact write resumes without replanning')
 await tick(id);s=await state(id);assert.equal(s.status,'succeeded',JSON.stringify(s));assert.match(s.result,/PLAN_DELIVERY_VERIFIED/);assert.deepEqual(s.checkpoint.role_state.completed,['analysis','delivery']);assert.equal(s.checkpoint.plan_evidence.delivery[0].tool,'fixture_write')
 const detail=await ok('GET','/api/agent-runs/'+id+'/detail');assert.ok(detail.events.some(e=>e.event_type==='tool_result'&&e.content.plan_node_id==='delivery'))
 pass('node tool narrowing, independent write approval, actual HTTP execution and node-correlated successful receipts complete end to end')
 const gap=await launch('CASE_GAP');await tick(gap);const first=await state(gap)
 assert.equal((await request('POST','/api/agent-runs/'+gap+'/respond',{decision:'approve',plan_revision:first.checkpoint.plan_revision})).data.error,'execution_plan_has_gaps')
 await review(gap,'revise','不要发送真实邮件，只在隔离端点保存');await tick(gap);const revised=await state(gap);assert.equal(revised.status,'awaiting_input');assert.notEqual(revised.checkpoint.plan_revision,first.checkpoint.plan_revision);assert.equal(revised.checkpoint.execution_plan.missing_capabilities.length,0)
 assert.equal((await request('POST','/api/agent-runs/'+gap+'/respond',{decision:'approve',plan_revision:first.checkpoint.plan_revision})).status,409)
 await ok('POST','/api/agent-runs/'+gap+'/cancel',{})
 pass('capability gaps block approval; revision uses a new model plan and new exact revision without silently executing')
 const changed=await launch('CASE_CHANGED');await tick(changed);const changedDraft=await state(changed)
 await ok('PATCH','/api/tool-connections/'+connection.item.id,{enabled:false})
 assert.equal((await request('POST','/api/agent-runs/'+changed+'/respond',{decision:'approve',plan_revision:changedDraft.checkpoint.plan_revision})).data.error,'execution_plan_resources_changed')
 assert.equal((await state(changed)).status,'awaiting_input');await ok('POST','/api/agent-runs/'+changed+'/cancel',{})
 await ok('PATCH','/api/tool-connections/'+connection.item.id,{enabled:true})
 pass('disabling a previously verified connection invalidates plan approval and preserves the waiting checkpoint')
 const invalid=await launch('CASE_INVALID');await tick(invalid);await tick(invalid);const bad=await state(invalid);assert.equal(bad.status,'failed');assert.equal(bad.error,'execution_plan_tool_denied');assert.equal(writes,1)
 pass('model-invented tool grants are rejected before execution, with bounded planning retries')
 const rejected=await launch('CASE_REJECT');await tick(rejected);await review(rejected);await until(rejected,'awaiting_approval');await ok('POST','/api/agent-runs/'+rejected+'/approve',{decision:'reject'});await tick(rejected);await tick(rejected);assert.equal(writes,1);assert.notEqual((await state(rejected)).status,'succeeded');await ok('POST','/api/agent-runs/'+rejected+'/cancel',{})
 pass('rejecting a concrete write never produces a successful plan-node receipt or a false finished task')
 const cancelled=await launch('CASE_CANCEL');const ongoing=tick(cancelled);for(let i=0;i<100&&!cancelEntered;i++)await sleep(20);assert.equal(cancelEntered,true);await ok('POST','/api/agent-runs/'+cancelled+'/cancel',{});await ongoing;const stopped=await state(cancelled);assert.ok(stopped.status==='cancelled'||stopped.checkpoint.cancel_requested);assert.equal(stopped.checkpoint.execution_plan,undefined);assert.equal(writes,1)
 pass('cancellation during model planning wins before checkpoint publication or any tool action')
 const work=path.join(db,'file-workspace');await fs.mkdir(work);await fs.writeFile(path.join(work,'source.txt'),'SOURCE_FROM_DISK: 42')
 const {createRuntime}=await import('../local-executor/runtime.mjs')
 runtime=await createRuntime({roots:[{name:'work',path:work,label:'隔离规划文件',readOnly:false}],files:{enabled:true},browser:{enabled:false},permissionRevision:'b'.repeat(24)})
 const device=await ok('POST','/api/local-devices',{name:'隔离计划执行电脑'},token,201),credentials=await ok('POST','/api/public/local-executor/pair',{code:device.pairing_code},'')
 const deviceApi=async(route,body)=>{const r=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Device-Token':credentials.token},body:JSON.stringify(body)});assert.ok(r.ok);return r.json()}
 await deviceApi('/api/public/local-executor/poll',{tools:runtime.tools})
 const localSpec=await ok('POST','/api/agent_specs',{name:'本机模型调度验收',spec:{...spec.spec,tools:['local_computer']}})
 const localRun=(await ok('POST','/api/agent-runs/start',{spec_id:localSpec.id,instruction:'CASE_LOCAL Read source.txt then create copy.txt in work, never overwrite.',model:'plan-fixture',config:{task_planning:'reviewed_v1',local_device_id:device.id,max_steps:15,max_model_calls:20,tools:{},custom_model:{connection_id:model.item.id,model_id:'plan-fixture'}}})).run_id
 await tick(localRun);assert.equal((await state(localRun)).status,'awaiting_input');await review(localRun)
 for(const expected of ['files.read','files.write']){
  await tick(localRun);assert.equal((await state(localRun)).status,'awaiting_approval')
  const empty=await deviceApi('/api/public/local-executor/poll',{tools:runtime.tools});assert.equal(empty.job,null)
  await ok('POST','/api/agent-runs/'+localRun+'/approve',{decision:'approve'});await tick(localRun)
  const waitingCalls=modelCalls;await tick(localRun);assert.equal(modelCalls,waitingCalls,'waiting local job must not call model or replay')
  const {job}=await deviceApi('/api/public/local-executor/poll',{tools:runtime.tools});assert.equal(job.input.tool,expected)
  const result=await runtime.execute(job.input,new AbortController().signal)
  await deviceApi('/api/public/local-executor/jobs/'+job.id+'/complete',{claim:job.claim,ok:true,result});await tick(localRun)
 }
 await tick(localRun);const localDone=await state(localRun);assert.equal(localDone.status,'succeeded',JSON.stringify(localDone));assert.equal(await fs.readFile(path.join(work,'copy.txt'),'utf8'),'SOURCE_FROM_DISK: 42')
 assert.deepEqual(localDone.checkpoint.plan_evidence.local_copy.map(e=>e.local_tool),['files.read','files.write'])
 pass('model-planned local read and file creation execute through real device queue/runtime with separate approvals and node-level receipts')
 if(process.argv.includes('--browser')){
  const {createServer:createVite}=await import('vite'),{chromium,expect}=await import('playwright/test')
  process.env.AGENT_STUDIO_PB_ORIGIN=origin;const empty=path.join(db,'empty-env');await fs.mkdir(empty)
  ui=await createVite({root,configFile:path.join(root,'vibex-local/vite.local.config.ts'),envDir:empty,server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/.tmp/**','**/dist/**','**/pocketbase/pb_data/**']}},logLevel:'error'});await ui.listen();const url='http://127.0.0.1:'+ui.httpServer.address().port
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url+'/login?next='+encodeURIComponent('/agent-run?spec='+spec.id));await page.getByLabel('工作邮箱',{exact:true}).fill('plan-owner@example.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByLabel('本次 Agent 运行任务指令')).toBeVisible({timeout:25000})
  await page.getByLabel('本次 Agent 运行任务指令').fill('CASE_UI Calculate 6*7 and save 42 in the local test endpoint')
  await page.getByRole('checkbox',{name:'让模型先规划，再按批准的计划执行'}).check()
  await expect(page.getByRole('button',{name:'生成计划并审核',exact:true})).toBeEnabled({timeout:12000});await page.getByRole('button',{name:'生成计划并审核',exact:true}).click()
  const panel=page.getByRole('region',{name:'模型执行计划与证据',exact:true});await expect(panel).toBeVisible({timeout:25000});await expect(panel).toContainText('待本人审核');assert.equal(writes,1)
  await page.reload();await expect(panel).toContainText('待本人审核',{timeout:15000})
  await page.getByRole('button',{name:'批准方案并继续',exact:true}).click()
  await expect(page.getByRole('region',{name:'待处理的工具审批'})).toBeVisible({timeout:30000})
  assert.equal(writes,1)
  await page.getByRole('region',{name:'待处理的工具审批'}).getByRole('button',{name:/批准/}).click()
  await expect(panel).toContainText('已交付 · 待验收',{timeout:30000});await expect.poll(()=>writes,{timeout:15000}).toBe(2)
  await expect(page.getByText('PLAN_DELIVERY_VERIFIED: 42 saved once to isolated endpoint',{exact:false}).first()).toBeVisible({timeout:20000})
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4),'layout overflow '+width)}
  assert.deepEqual(errors,[]);await fs.mkdir('.tmp/structured-plan',{recursive:true});await page.screenshot({path:'.tmp/structured-plan/verified.png',fullPage:true})
  pass('real Chrome creates a model-planned run, survives refresh, approves plan and concrete write, then displays actual completion without mocked APIs')
 }
 console.log('STRUCTURED_PLAN_ACCEPTANCE '+JSON.stringify({status:'PASS',checks,modelCalls,planningCalls,actualWrites:writes,standaloneJWT:true,isolatedDatabase:true,realHTTP:true,paidModels:false,browser:process.argv.includes('--browser')}))
}catch(error){console.error('STRUCTURED_PLAN_FAILURE '+error.stack+'\nBACKEND '+logs.slice(-3500));process.exitCode=1}
finally{await browser?.close();await ui?.close();await runtime?.close();await stopHeadlessPocketBase(pb);await new Promise(r=>local.close(r));await fs.rm(db,{recursive:true,force:true,maxRetries:20,retryDelay:150})}
