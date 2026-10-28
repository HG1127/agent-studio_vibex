// Explicit Root-hosted PG18 browser story. Launch only after the genuine guard.
// This has no page.route/mock API responses and never fills a design result.
import {test,expect,chromium} from '@playwright/test'
import {startPgNativeAgentDesignGenuineBrowserFixture} from './helpers/pg-native-agent-design-genuine-fixture.mjs'
import {requireAgentDesignGenuineCi} from '../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'

test('F01 actual PG18 Native browser: paid design, full editing, lost original/save recovery, no automatic execution, and employee privacy',async({},testInfo)=>{
  test.setTimeout(300000)
  requireAgentDesignGenuineCi()
  const f=await startPgNativeAgentDesignGenuineBrowserFixture()
  let browser,context
  const submitted=[]
  try{
    browser=await chromium.launch({headless:true})
    // Only this generated local CA is self-signed. Browser traffic is denied
    // outside the fixed fixture origin; Node proxy/private/provider TLS still
    // verify the actual generated CA and mTLS leaf certificates.
    context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000},serviceWorkers:'block'})
    const outside=[]
    await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.browserOrigin){outside.push(route.request().url());await route.abort()}else await route.continue()})
    const page=await context.newPage()
    page.on('request',req=>{const path=new URL(req.url()).pathname;if(req.method()==='POST'&&/\/agent-design\/(?:submit|confirm|save|confirm-save)$/.test(path))submitted.push({path,body:req.postData()})})
    const login=async who=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(f.credentials[who].email);await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password);await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await page.getByRole('button',{name:/^Agent 配置/}).click();await expect(page.getByRole('region',{name:'自然语言设计助手',exact:true})).toBeVisible()}
    await page.goto(f.url,{waitUntil:'domcontentloaded'});await login('alice')
    const panel=page.getByRole('region',{name:'自然语言设计助手',exact:true}),before=await f.counts()
    await panel.getByRole('combobox',{name:'设计模型',exact:true}).selectOption({label:'Synthetic assessment alice · synthetic'})
    await panel.getByRole('textbox',{name:'助手需求或修改要求',exact:true}).fill('F01 genuine browser: prepare a complete synthetic role with all descriptions; retain manual save consent.')
    await expect(panel.getByRole('combobox',{name:'输出容量',exact:true})).toHaveValue('4096')
    const [previewReply]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/api/v2/agent-design/preview')&&r.request().method()==='POST'),panel.getByRole('button',{name:'预览发送内容',exact:true}).click()])
    // Capture a refusal immediately instead of masking its status as a timeout.
    // Only public response metadata is attached; no body, Cookie or credentials.
    await testInfo.attach('f01-preview-response-metadata',{body:JSON.stringify({status:previewReply.status(),content_type:previewReply.headers()['content-type']??'',path:new URL(previewReply.url()).pathname}),contentType:'application/json'})
    expect(previewReply.status(),'F01 preview must return HTTP 200; see preview response metadata').toBe(200)
    const preview=await previewReply.json();expect(preview.choice.purpose).toBe('generate');expect(preview.choice.source).toBeNull();expect(preview.recorded).toBe(false)
    expect(f.providerRequests).toHaveLength(0);expect((await f.counts()).requests).toBe(before.requests);expect(submitted).toHaveLength(0)
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('f01-genuine-preview-desktop.png'),fullPage:true})
    await page.setViewportSize({width:390,height:844});const box=await panel.boundingBox();expect(box).not.toBeNull();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);await page.screenshot({path:testInfo.outputPath('f01-genuine-preview-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:1000})
    f.mutable.dropSubmit=true
    await panel.getByRole('button',{name:'确认本次模型费用并生成',exact:true}).click()
    const original=panel.getByRole('button',{name:'查询原始回执',exact:true});await expect(original).toBeEnabled()
    expect(submitted.filter(r=>r.path.endsWith('/submit'))).toHaveLength(1);expect(f.providerRequests).toHaveLength(0)
    const paidBody=JSON.parse(submitted.find(r=>r.path.endsWith('/submit')).body),requestId=paidBody.request_id
    f.mutable.submissions=false
    await original.click();await expect(panel.getByRole('button',{name:'读取设计结果',exact:true})).toBeEnabled()
    expect(submitted.find(r=>r.path.endsWith('/confirm')).body).toBe(submitted.find(r=>r.path.endsWith('/submit')).body)
    await f.tick();expect(f.providerRequests).toHaveLength(1)
    await panel.getByRole('button',{name:'读取设计结果',exact:true}).click();await expect(panel.getByRole('textbox',{name:'助手名称',exact:true})).toHaveValue(f.output().name)
    await page.getByRole('button',{name:/^模型连接/}).click();await expect(panel).not.toBeVisible();await page.getByRole('button',{name:/^Agent 配置/}).click();await expect(panel).toBeVisible();await expect(panel.getByRole('textbox',{name:'助手名称',exact:true})).toHaveCount(0)
    await panel.getByRole('button',{name:'读取设计结果',exact:true}).click();await expect(panel.getByRole('textbox',{name:'助手名称',exact:true})).toHaveValue(f.output().name)
    const edits=[['助手名称','F01 genuine edited browser role'],['目标','F01 browser edited complete goal'],['任务范围','F01 browser edited complete scope'],['交付物（每行一项）','F01 browser edited deliverable'],['任务计划（每行一步）','F01 browser edited plan'],['完成标准（每行一项）','F01 browser edited criterion']]
    for(const [label,value] of edits){const input=panel.getByRole('textbox',{name:label,exact:true});await input.fill(value);await input.blur();await expect(input).toHaveValue(value)}
    // This emits invalidatePreview(), cloning the same session.fields again.
    // It must not replace the unsubmitted local draft with the old model fields.
    await panel.getByRole('textbox',{name:'助手需求或修改要求',exact:true}).fill('Unrelated preview invalidation; preserve all six edited result fields.')
    for(const [label,value] of edits)await expect(panel.getByRole('textbox',{name:label,exact:true})).toHaveValue(value)
    expect((await f.counts()).saves).toBe(before.saves)
    const [savePreviewReply]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/api/v2/agent-design/preview-save')&&r.status()===200),panel.getByRole('button',{name:'预览保存内容',exact:true}).click()])
    const savePreview=await savePreviewReply.json();expect(savePreview.candidate.spec.tools).toEqual([]);expect(savePreview.candidate.spec.knowledge_base_ids).toEqual([]);expect(Object.hasOwn(savePreview.candidate.spec,'model_binding')).toBe(false)
    const expectedFields={name:edits[0][1],goal:edits[1][1],task_scope:edits[2][1],deliverables:[edits[3][1]],task_plan:[edits[4][1]],done_criteria:[edits[5][1]]};expect(savePreview.fields).toEqual(expectedFields)
    expect((await f.counts()).saves).toBe(before.saves)
    f.mutable.dropSave=true;await panel.getByRole('button',{name:'确认仅保存方案',exact:true}).click();await expect(original).toBeEnabled()
    const committed=await f.counts();expect(committed.saves).toBe(before.saves+1);expect(committed.agents).toBe(before.agents+1);expect(committed.runs).toBe(before.runs);expect(committed.old_effects).toBe(before.old_effects)
    f.mutable.saves=false;await f.wireControl('alice',requestId,'erase');await original.click();await expect(panel.getByRole('status').filter({hasText:'已保存方案'})).toBeVisible()
    const saveRequest=JSON.parse(submitted.find(r=>r.path.endsWith('/save')).body),confirmed=JSON.parse(submitted.find(r=>r.path.endsWith('/confirm-save')).body);expect(confirmed).toEqual(saveRequest.intent)
    const receipt=(await f.db.query('SELECT spec_id FROM agentstudio.agent_design_save_receipts WHERE owner_user_id=$1 AND save_request_id=$2',[f.users.alice,confirmed.request_id])).rows[0];expect(receipt).toBeTruthy()
    const savedAgent=await f.agents.get(await f.identityFor('alice'),receipt.spec_id);expect(savedAgent.name).toBe(expectedFields.name)
    for(const field of ['goal','task_scope','deliverables','task_plan','done_criteria'])expect(savedAgent.spec[field]).toEqual(expectedFields[field])
    const history=(await f.db.query("SELECT safe_spec FROM agentstudio.agent_collaboration_revisions WHERE owner_user_id=$1 AND spec_id=$2 AND kind='edited' AND spec_revision=1",[f.users.alice,savedAgent.id])).rows;expect(history).toHaveLength(1)
    for(const field of ['goal','task_scope','deliverables','task_plan','done_criteria'])expect(history[0].safe_spec[field]).toEqual(expectedFields[field])
    expect((await f.counts()).saves).toBe(committed.saves);expect((await f.counts()).agents).toBe(committed.agents);expect(f.providerRequests).toHaveLength(1)
    await page.screenshot({path:testInfo.outputPath('f01-genuine-saved-recovery.png'),fullPage:true})
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob')
    await expect(page.getByText('F01 genuine edited browser role',{exact:true})).toHaveCount(0)
    const foreign=await page.evaluate(async id=>{const r=await fetch('/__pg_native/api/v2/agent-design/requests/'+id,{credentials:'same-origin'});return {status:r.status,body:await r.json()}},requestId);expect([403,404]).toContain(foreign.status);expect(foreign.body.result).toBeUndefined()
    f.mutable.submissions=true;f.mutable.saves=true
    const bobBefore=await f.agents.get(await f.identityFor('bob'),f.resources.bob.spec.id)
    await panel.getByRole('combobox',{name:'设计方式',exact:true}).selectOption('revise');await panel.getByRole('combobox',{name:'要修改的助手',exact:true}).selectOption({label:bobBefore.name});await panel.getByRole('combobox',{name:'设计模型',exact:true}).selectOption({label:'Synthetic assessment bob · synthetic'});await panel.getByRole('textbox',{name:'助手需求或修改要求',exact:true}).fill('F01 Bob genuine revision: preserve current resource configuration.')
    await panel.getByRole('button',{name:'预览发送内容',exact:true}).click();await panel.getByRole('button',{name:'确认本次模型费用并修改',exact:true}).click();await expect(panel.getByRole('button',{name:'读取设计结果',exact:true})).toBeEnabled();await f.tick();expect(f.providerRequests).toHaveLength(2)
    await panel.getByRole('button',{name:'读取设计结果',exact:true}).click();await panel.getByRole('textbox',{name:'目标',exact:true}).fill('F01 Bob explicitly edited revised goal');await panel.getByRole('button',{name:'预览保存内容',exact:true}).click();await panel.getByRole('button',{name:'确认仅保存方案',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'已保存方案'})).toBeVisible()
    const bobAfter=await f.agents.get(await f.identityFor('bob'),bobBefore.id);expect(bobAfter.revision).toBe(bobBefore.revision+1);expect(bobAfter.spec.model_binding).toEqual(bobBefore.spec.model_binding);expect(bobAfter.spec.tools).toEqual(bobBefore.spec.tools);expect(bobAfter.spec.knowledge_base_ids).toEqual(bobBefore.spec.knowledge_base_ids)
    await f.governance('bob',false);await panel.getByRole('button',{name:'读取设计结果',exact:true}).click();await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible();await expect(page.getByText('F01 Bob explicitly edited revised goal',{exact:true})).toHaveCount(0);await f.governance('bob',true)
    expect(outside).toEqual([]);expect((await f.counts()).runs).toBe(before.runs);f.assertNoProviderErrors()
  }finally{await context?.close();await browser?.close();await f.close()}
})
