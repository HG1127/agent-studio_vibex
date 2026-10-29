// Actual Root page/canvas and actual Native PG18/Worker/Broker. Only the TLS
// model server is synthetic; no API body fulfillment or graph injection in UI.
import {test,expect,chromium} from '@playwright/test'
import {requireAgentPlanWorkflowGenuineCi} from '../services/pg-api/tests/helpers/agent-plan-workflow-genuine-guard.mjs'
import {startPgNativeAgentPlanWorkflowGenuineBrowserFixture} from './helpers/pg-native-agent-plan-workflow-genuine-fixture.mjs'

test('F05 employee selects source/model, pays once, edits real canvas, independently saves and recovers original ACKs with employee fences',async({},testInfo)=>{
 test.setTimeout(300000);requireAgentPlanWorkflowGenuineCi()
 let phase='fixture_start',failure,browser,context,held
 const mark=label=>{phase=label;console.info('[F05 phase] '+label)}
 const bounded=async(label,work,ms=20000)=>{let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('F05_'+label+'_timeout')),ms)})])}finally{clearTimeout(timer)}}
 const f=await startPgNativeAgentPlanWorkflowGenuineBrowserFixture(),base='/api/v2/agent-plan-workflow',sent=[],outside=[]
 try{
  mark('browser_launch');browser=await chromium.launch({headless:true});context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000},serviceWorkers:'block'})
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.browserOrigin){outside.push(route.request().url());await route.abort()}else await route.continue()})
  const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(20000)
  page.on('request',req=>{if(new URL(req.url()).pathname.includes(base)&&req.method()==='POST')sent.push({path:new URL(req.url()).pathname,body:req.postDataJSON()})})
  const panel=()=>page.getByRole('region',{name:'从助手生成工作流草图',exact:true})
  const reply=(suffix,method='POST')=>page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(base+suffix)&&r.request().method()===method,{timeout:20000})
  const checked=async pending=>bounded('actual_response_body',(async()=>{const r=await pending;expect(r.status()).toBe(200);return r.json()})())
  const login=async who=>{
   await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(f.credentials[who].email);await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
   await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await page.getByRole('button',{name:'生成工作流草图',exact:true}).click();await expect(panel()).toBeVisible()
  }
  const choose=async who=>{
   const source=panel().getByRole('combobox',{name:'来源助手',exact:true})
   await expect.poll(()=>source.locator('option').evaluateAll((rows,id)=>rows.some(row=>row.value===id),f.resources[who].spec.id)).toBe(true)
   await source.selectOption(f.resources[who].spec.id)
   const model=panel().getByRole('combobox',{name:'生成草图的模型',exact:true}),value=JSON.stringify(f.generationModels[who].binding)
   await expect.poll(()=>model.locator('option').evaluateAll((rows,v)=>rows.some(row=>row.value===v),value)).toBe(true);await model.selectOption(value)
   await panel().getByRole('textbox',{name:'生成要求',exact:true}).fill('模型自主设计分析节点，保留当前助手资源。')
   await panel().getByRole('combobox',{name:'输出容量',exact:true}).selectOption('4096')
  }
  mark('native_login_and_source');await page.goto(f.url,{waitUntil:'domcontentloaded'});await login('alice');await choose('alice')
  const before=await f.state()
  mark('input_preview');const previewWait=reply('/preview');await panel().getByRole('button',{name:'预览本次生成输入',exact:true}).click();const prepared=await checked(previewWait)
  expect(prepared.choice.generation_model).toEqual(f.generationModels.alice.binding);expect(prepared.choice.source.spec_id).toBe(f.resources.alice.spec.id)
  const fee=panel().getByRole('checkbox',{name:'我确认仅为这份草稿发起一次模型生成，并承担相应费用。',exact:true}),generate=panel().getByRole('button',{name:'确认费用并生成草图',exact:true})
  await expect(generate).toBeDisabled();expect(f.providerEvents).toHaveLength(0);expect((await f.state()).requests).toBe(before.requests)
  await fee.check();await expect(generate).toBeEnabled()
  mark('desktop_mobile_preview');await panel().scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('f05-input-desktop.png'),fullPage:true,timeout:20000})
  await page.setViewportSize({width:390,height:844});const box=await panel().boundingBox();expect(box).not.toBeNull();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);await page.screenshot({path:testInfo.outputPath('f05-input-mobile.png'),fullPage:true,timeout:20000});await page.setViewportSize({width:1280,height:1000})
  mark('submit_ack_loss');f.mutable.dropNext={method:'POST',path:base+'/requests'};await generate.click();await expect(panel().getByRole('button',{name:'查询原请求结果',exact:true})).toBeVisible()
  const submit=sent.filter(r=>r.path.endsWith(base+'/requests'));expect(submit).toHaveLength(1);const intent=submit[0].body
  expect(intent.expected_input_sha256).toBe(prepared.input_sha256);expect(intent.confirm).toBe(true);expect(f.providerEvents).toHaveLength(0)
  mark('same_submit_uuid_confirmation');const confirmWait=reply('/confirm');await panel().getByRole('button',{name:'查询原请求结果',exact:true}).click();const receipt=await checked(confirmWait);expect(receipt.request_id).toBe(intent.request_id);expect(receipt.replayed).toBe(true)
  mark('real_worker_broker_model');const dispatched=await f.tick();expect(dispatched.state).toBe('succeeded');expect(f.providerEvents).toHaveLength(1);expect(f.credentialEvents).toHaveLength(1);expect(f.providerEvents[0].messages_sha256).toBe(prepared.content_sha256)
  const resultWait=reply('/requests/'+intent.request_id,'GET');await panel().getByRole('button',{name:'查询生成结果',exact:true}).click();const result=await checked(resultWait);expect(result.result_status).toBe('available');expect(result.result.value.result.graph.nodes.some(n=>n.type==='model'&&n.data.model_binding===undefined)).toBe(true)
  mark('actual_existing_canvas');await panel().getByRole('button',{name:'在现有画布中编辑草图',exact:true}).click()
  const canvas=panel().getByRole('region',{name:'生成草图画布',exact:true});await expect(canvas).toBeVisible();await expect(canvas.getByRole('button',{name:'运行已保存工作流',exact:true})).toBeDisabled()
  await canvas.getByRole('textbox',{name:'工作流名称',exact:true}).fill('F05 Browser Edited Workflow')
  await canvas.getByRole('combobox',{name:'选择节点',exact:true}).selectOption('analysis')
  const binding=canvas.getByRole('combobox',{name:'绑定模型',exact:true});await expect(binding).toHaveValue('')
  const sourceBinding=JSON.stringify(f.resources.alice.binding)
  await expect.poll(()=>binding.locator('option').evaluateAll((rows,v)=>rows.some(row=>row.value===v),sourceBinding)).toBe(true)
  expect(await binding.locator('option').evaluateAll((rows,id)=>rows.some(row=>row.value.includes(id)),f.generationModels.alice.binding.connection_id)).toBe(false)
  await binding.selectOption(sourceBinding);await canvas.getByRole('textbox',{name:'模型提示词',exact:true}).fill('画布中实际修改的分析 {{input}}');await canvas.getByRole('button',{name:'应用节点配置',exact:true}).click()
  mark('independent_save_preview');const savePreviewWait=reply('/preview-save');await canvas.getByRole('button',{name:'预览草稿保存',exact:true}).click();const savePreview=await checked(savePreviewWait)
  expect(savePreview.candidate.name).toBe('F05 Browser Edited Workflow');expect(savePreview.candidate.graph.nodes.find(n=>n.id==='analysis').data.model_binding).toEqual(f.resources.alice.binding)
  const confirm=panel().getByRole('region',{name:'工作流独立保存确认',exact:true}),saveButton=confirm.getByRole('button',{name:'独立确认保存工作流',exact:true})
  await expect(saveButton).toBeDisabled();expect((await f.state()).saves).toBe(before.saves)
  await confirm.getByRole('checkbox',{name:'我已核对当前画布，确认将这份草稿保存为新的工作流配置。',exact:true}).check();await expect(saveButton).toBeEnabled()
  mark('save_ack_loss');f.mutable.dropNext={method:'POST',path:base+'/save'};await saveButton.click();await expect(panel().getByRole('button',{name:'查询原请求结果',exact:true})).toBeVisible()
  const saves=sent.filter(r=>r.path.endsWith(base+'/save'));expect(saves).toHaveLength(1)
  const saveConfirmWait=reply('/save/confirm');await panel().getByRole('button',{name:'查询原请求结果',exact:true}).click();const saved=await checked(saveConfirmWait)
  expect(saved.request_id).toBe(saves[0].body.intent.request_id);expect(saved.replayed).toBe(true)
  await expect(panel().getByText('工作流已保存，来源记录已保留。运行需要另行确认。',{exact:true})).toBeVisible()
  mark('saved_real_workflow');const stored=await f.request('alice','/api/v2/workflows/'+saved.workflow_id);expect(stored.status).toBe(200);expect(stored.body.item.graph).toEqual(savePreview.candidate.graph)
  await panel().getByRole('button',{name:'打开已保存的工作流',exact:true}).click();await expect(page.getByRole('textbox',{name:'工作流名称',exact:true})).toHaveValue('F05 Browser Edited Workflow')
  mark('late_result_logout_fence');await page.getByRole('button',{name:'生成工作流草图',exact:true}).click();held=f.holdNextResultResponse(intent.request_id)
  await panel().getByRole('button',{name:'查询生成结果',exact:true}).click();await held.entered()
  await page.getByRole('button',{name:'退出',exact:true}).click();await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible();held.release();held=null
  mark('second_employee_blank_scope');await login('bob');await expect(panel().getByRole('textbox',{name:'生成要求',exact:true})).toHaveValue('');await expect(panel().getByRole('region',{name:'生成草图画布',exact:true})).toHaveCount(0);await expect(panel().getByRole('button',{name:'打开已保存的工作流',exact:true})).toHaveCount(0)
  const wrong=await f.request('bob',base+'/requests/'+intent.request_id);expect(wrong.status).toBe(404)
  mark('employee_disabled_clears_scope');await choose('bob');await f.governance('bob',false);await panel().getByRole('button',{name:'预览本次生成输入',exact:true}).click();await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible()
  expect(await page.getByRole('region',{name:'从助手生成工作流草图',exact:true}).count()).toBe(0)
  mark('one_paid_post_and_one_atomic_save');expect(sent.filter(r=>r.path.endsWith(base+'/requests'))).toHaveLength(1);expect(sent.filter(r=>r.path.endsWith(base+'/save'))).toHaveLength(1);expect(f.providerEvents).toHaveLength(1);expect(outside).toEqual([])
  const state=await f.state();expect(state.requests).toBe(before.requests+1);expect(state.saves).toBe(before.saves+1);expect(state.provenance).toBe(before.provenance+1);expect(state.old_runs).toBe(before.old_runs);expect(state.old_effects).toBe(before.old_effects)
 }catch(error){failure=error;console.error('[F05 failed phase] '+phase);try{await context?.pages()[0]?.screenshot({path:testInfo.outputPath('f05-failed-phase.png'),fullPage:true,timeout:10000})}catch{}}
 finally{held?.release();for(const [label,close]of [['browser_context',()=>context?.close()],['browser',()=>browser?.close()],['fixture',()=>f.close()]])try{await bounded(label,Promise.resolve().then(close))}catch(error){failure??=error}}
 if(failure)throw failure
})
