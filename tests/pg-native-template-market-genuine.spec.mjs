// Root F07 browser job only. Actual Native/PG18 and page; no API response mocks,
// generated result fills, permission flags or direct copied-Agent/receipt writes.
import {test,expect,chromium} from '@playwright/test'
import {installActualBrowserFetchBodyObserver} from './helpers/actual-browser-fetch-body-observer.mjs'
import {requireAgentTemplateMarketGenuineCi} from '../services/pg-api/tests/helpers/agent-template-market-genuine-guard.mjs'
import {startPgNativeTemplateMarketGenuineBrowserFixture} from './helpers/pg-native-template-market-genuine-fixture.mjs'
test('F07 actual template publish/copy/resource setup/lifecycle/recovery and employee scope',async({},testInfo)=>{
  test.setTimeout(300000);requireAgentTemplateMarketGenuineCi()
  let phase='fixture_start'
  const mark=label=>{phase=label;console.info('[F07 phase] '+label)}
  const bounded=async(label,promise,ms=20000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('F07_'+label+'_timeout')),ms)})])}finally{clearTimeout(timer)}}
  mark('fixture_start')
  const f=await startPgNativeTemplateMarketGenuineBrowserFixture(),root='/api/v2/template-market'
  let browser,context,held,failure
  const sent=[],outside=[]
  try{
    mark('source_fixture')
    await f.withHttpSource('alice');await f.withKnowledgeSource('alice')
    const alice=await f.identityFor('alice'),source=await f.agents.get(alice,f.resources.alice.spec.id),{require_approval:_approval,...before}=source.spec
    const fields={goal:'F07 browser complete public goal',task_scope:'F07 browser complete task scope',deliverables:['F07 public deliverable','F07 public source list'],task_plan:['F07 research step','F07 verify step'],done_criteria:['F07 verifiable criterion']}
    const saved=await f.agents.update(alice,source.id,'F07 Browser Share Source',{...before,...fields,require_approval:true,require_plan_review:true},source.revision);expect(saved).toBeTruthy()
    mark('browser_launch')
    browser=await chromium.launch({headless:true});context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000},serviceWorkers:'block'})
    await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.browserOrigin){outside.push(route.request().url());await route.abort()}else await route.continue()})
    const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(20000)
    await page.addInitScript(installActualBrowserFetchBodyObserver,{key:'__f07ActualBodyObservation',basePath:'/api/v2',maxBytes:1048576})
    page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.includes(root)&&['POST','DELETE'].includes(request.method()))sent.push({path,method:request.method(),body:request.postData()})})
    const login=async who=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(f.credentials[who].email);await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password);await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await page.getByRole('button',{name:'模板市场',exact:true}).click();await expect(page.getByRole('region',{name:'模板市场',exact:true})).toBeVisible()}
    const logout=async()=>{await page.getByRole('button',{name:'退出',exact:true}).click();await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible()}
    const panel=()=>page.getByRole('region',{name:'模板市场',exact:true})
    // Arm before each explicit UI action; observe only the exact same-origin
    // method/path. Root helper requires real EOF, bounded bytes and UTF8/JSON.
    const waitReply=async(suffix,method='POST')=>{
      const path=suffix.startsWith('/api/v2/')?suffix:root+suffix,ticket=await page.evaluate(({path,method})=>window.__f07ActualBodyObservation.arm(path,method),{path,method})
      return {read:async()=>{
        await page.waitForFunction(ticket=>window.__f07ActualBodyObservation.ready(ticket),ticket,{timeout:20000})
        const actual=await page.evaluate(ticket=>window.__f07ActualBodyObservation.read(ticket),ticket)
        expect(actual.error,'complete original F07 browser fetch body').toBeUndefined();expect(actual.method).toBe(method);expect([path,'/__pg_native'+path]).toContain(actual.actual_path)
        return actual
      }}
    }
    const checkedReply=async pending=>bounded('response_body',(async()=>{const reply=await pending.read();expect(reply.status,'actual F07 response must be200').toBe(200);return reply.value})())
    mark('publisher_login')
    await page.goto(f.url,{waitUntil:'domcontentloaded'});await login('alice')
    mark('publisher_source_inventory')
    const sourcesReply=await waitReply('/sources','GET')
    await panel().getByRole('button',{name:'发布我的模板',exact:true}).click()
    const actualSources=await checkedReply(sourcesReply)
    expect(actualSources.ok).toBe(true);expect(Array.isArray(actualSources.items)&&actualSources.items.some(item=>item.spec_id===saved.id&&item.name===saved.name&&item.revision===saved.revision),'actual sources must include the current saved own Agent').toBe(true)
    const publishing=panel().getByRole('region',{name:'发布模板',exact:true})
    const sourceSelect=publishing.getByRole('combobox',{name:'我的助手方案',exact:true})
    await expect.poll(()=>sourceSelect.locator('option').evaluateAll((options,expected)=>options.some(option=>option.value===expected),saved.id),{message:'actual source select must contain the current saved own Agent'}).toBe(true)
    await sourceSelect.selectOption(saved.id,{timeout:20000})
    await publishing.getByRole('textbox',{name:'模板名称',exact:true}).fill('F07 Browser Shared Template')
    await publishing.getByRole('textbox',{name:'模板简介（必填，最多 120 字）',exact:true}).fill('公开的合成研究方案')
    await publishing.getByRole('combobox',{name:'发布分类',exact:true}).selectOption('research')
    mark('publisher_first_preview')
    const previewReply=await waitReply('/preview-publish');await publishing.getByRole('button',{name:'预览公开内容',exact:true}).click();const preview=await checkedReply(previewReply)
    for(const [key,value]of Object.entries(fields))expect(preview.snapshot.spec[key]).toEqual(value)
    expect(preview.snapshot.spec.knowledge_base_ids).toEqual([]);expect(Object.hasOwn(preview.snapshot.spec,'model_binding')).toBe(false);expect(Object.hasOwn(preview.snapshot.spec,'http_tools')).toBe(false)
    const reviewed=publishing.getByRole('checkbox',{name:'我已核查全部公开文字，确认可以发布。',exact:true}),publish=publishing.getByRole('button',{name:'确认发布这个模板',exact:true})
    await expect(publish).toBeDisabled();await reviewed.check();await expect(publish).toBeEnabled()
    mark('publisher_edit_reviewed_description')
    await publishing.getByRole('textbox',{name:'模板简介（必填，最多 120 字）',exact:true}).fill('重新核查后的公开合成研究方案');await expect(publish).toHaveCount(0)
    mark('publisher_updated_preview')
    const updatedReply=await waitReply('/preview-publish');await publishing.getByRole('button',{name:'预览公开内容',exact:true}).click();await checkedReply(updatedReply);await expect(reviewed).not.toBeChecked()
    mark('public_preview_screenshots')
    await panel().scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('f07-public-preview-desktop.png'),fullPage:true})
    await page.setViewportSize({width:390,height:844});const box=await panel().boundingBox();expect(box).not.toBeNull();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);await page.screenshot({path:testInfo.outputPath('f07-public-preview-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:1000})
    mark('publisher_confirm_publish')
    await reviewed.check();const publishedReply=await waitReply('/publish');await publish.click();const published=await checkedReply(publishedReply),templateId=published.item.id
    await expect(panel().getByText('模板已发布。',{exact:true})).toBeVisible();await logout();await login('bob')
    const locate=async()=>{await panel().getByRole('searchbox',{name:'搜索模板',exact:true}).fill('F07 Browser Shared Template');await panel().getByRole('combobox',{name:'分类',exact:true}).selectOption('research');await panel().getByRole('button',{name:'搜索',exact:true}).click();await panel().getByRole('button',{name:'查看「F07 Browser Shared Template」',exact:true}).click();await expect(panel().getByRole('region',{name:'模板详情',exact:true})).toBeVisible()}
    const prepareCopy=async name=>{await locate();const detail=panel().getByRole('region',{name:'模板详情',exact:true});await detail.getByRole('textbox',{name:'副本名称',exact:true}).fill(name);const reply=await waitReply('/preview-use');await detail.getByRole('button',{name:'预览我的副本',exact:true}).click();await checkedReply(reply);return detail}
    mark('copy_owner_prepare')
    let detail=await prepareCopy('F07 Bob Resource Copy'),counts=await f.counts()
    mark('copy_ack_loss')
    f.mutable.dropNext={method:'POST',path:root+'/'+templateId+'/use'}
    await detail.getByRole('button',{name:'确认复制为我的助手',exact:true}).click();const original=panel().getByRole('button',{name:'查询原操作结果',exact:true});await expect(original).toBeEnabled()
    const copyRequests=sent.filter(request=>request.path.endsWith('/'+templateId+'/use'));expect(copyRequests).toHaveLength(1);const originalBody=JSON.parse(copyRequests[0].body)
    mark('copy_original_recovery')
    f.mutable.writes=false;await original.click();await expect(panel().getByRole('button',{name:'配置我的模型与资源',exact:true})).toBeEnabled()
    expect(sent.filter(request=>request.path.endsWith('/'+templateId+'/use'))).toHaveLength(1)
    const receipt=(await f.db.query('SELECT receipt FROM agentstudio.agent_template_market_receipts WHERE owner_user_id=$1 AND request_id=$2',[f.users.bob,originalBody.request_id])).rows[0].receipt,copiedId=receipt.spec_id
    const copied=await f.agents.get(await f.identityFor('bob'),copiedId);expect(copied.owner_user_id).toBe(f.users.bob);expect(copied.spec.knowledge_base_ids).toEqual([]);for(const key of['model_binding','http_tools','mcp_tools','knowledge_retrieval'])expect(Object.hasOwn(copied.spec,key)).toBe(false)
    expect((await f.counts()).agents).toBe(counts.agents+1);expect((await f.counts()).receipts).toBe(counts.receipts+1);f.mutable.writes=true
    mark('open_actual_copy_resource_configuration')
    const actualCopyGet=await waitReply('/api/v2/agent-specs/'+copiedId,'GET')
    await panel().getByRole('button',{name:'配置我的模型与资源',exact:true}).click();expect((await checkedReply(actualCopyGet)).item.id).toBe(copiedId)
    const setup=page.getByRole('region',{name:'模板副本资源配置',exact:true});await expect(setup).toBeVisible()
    for(const label of['选择 Agent','工具绑定 Agent','MCP 工具绑定 Agent','知识库绑定 Agent'])await expect(setup.getByRole('combobox',{name:label,exact:true})).toHaveValue(copiedId)
    mark('bind_own_execution_model')
    await setup.getByRole('combobox',{name:'选择模型连接',exact:true}).selectOption(f.resources.bob.model.id);await setup.getByRole('combobox',{name:'选择具体模型',exact:true}).selectOption('synthetic')
    // The actual SDK first GETs the current revision, then PATCHes once, then
    // the original onUpdated refresh GETs the saved Agent. Queue both exact
    // observations before the click: the first real200/EOF body is a pre-write
    // check, and only the second body can establish the saved revision.
    const beforeBindingRead=await waitReply('/api/v2/agent-specs/'+copiedId,'GET')
    const refreshed=await waitReply('/api/v2/agent-specs/'+copiedId,'GET')
    const bindingWrites=[],recordBindingWrite=request=>{const path=new URL(request.url()).pathname;if(request.method()==='PATCH'&&[('/api/v2/agent-specs/'+copiedId),('/__pg_native/api/v2/agent-specs/'+copiedId)].includes(path))bindingWrites.push(request.postData())}
    page.on('request',recordBindingWrite)
    mark('confirm_actual_bound_revision')
    try{
      await setup.getByRole('button',{name:'验证并保存绑定',exact:true}).click()
      const actualBeforeBinding=await checkedReply(beforeBindingRead);expect(actualBeforeBinding.item.id).toBe(copiedId);expect(actualBeforeBinding.item.revision).toBe(copied.revision);expect(Object.hasOwn(actualBeforeBinding.item.spec,'model_binding')).toBe(false)
      const actualRefresh=await checkedReply(refreshed);expect(actualRefresh.item.id).toBe(copiedId);expect(actualRefresh.item.revision).toBe(copied.revision+1);expect(actualRefresh.item.spec.model_binding).toEqual(f.resources.bob.binding)
      expect(bindingWrites).toHaveLength(1);const actualBindingWrite=JSON.parse(bindingWrites[0]);expect(actualBindingWrite.expected_revision).toBe(copied.revision);expect(actualBindingWrite.spec.model_binding).toEqual(f.resources.bob.binding)
    }finally{page.off('request',recordBindingWrite)}
    const bound=await f.agents.get(await f.identityFor('bob'),copiedId);expect(bound.revision).toBe(copied.revision+1);expect(bound.spec.model_binding).toEqual(f.resources.bob.binding);expect(bound.spec.model_binding.connection_id).not.toBe(f.resources.alice.model.id)
    for(const label of['选择 Agent','工具绑定 Agent','MCP 工具绑定 Agent','知识库绑定 Agent'])await expect(setup.getByRole('combobox',{name:label,exact:true})).toHaveValue(copiedId)
    await page.screenshot({path:testInfo.outputPath('f07-actual-copy-resource-configuration.png'),fullPage:true});await setup.getByRole('button',{name:'返回全部助手配置',exact:true}).click()
    mark('second_copy_prepare')
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'模板市场',exact:true}).click();detail=await prepareCopy('F07 Bob Late Copy')
    const lateCopyReply=await waitReply('/'+templateId+'/use');await detail.getByRole('button',{name:'确认复制为我的助手',exact:true}).click();const lateCopy=await checkedReply(lateCopyReply)
    mark('late_actual_copy_response_scope')
    held=f.holdNextAgentResponse(lateCopy.spec_id);await panel().getByRole('button',{name:'配置我的模型与资源',exact:true}).click();expect((await held.entered()).status).toBe(200)
    await logout();await login('alice');held.release();held=null
    await expect(page.getByRole('region',{name:'模板副本资源配置',exact:true})).toHaveCount(0);await expect(page.getByText('F07 Bob Late Copy',{exact:true})).toHaveCount(0)
    mark('publisher_unpublish')
    await panel().getByRole('button',{name:'我的发布',exact:true}).click();await expect(panel().getByText('F07 Browser Shared Template',{exact:true})).toBeVisible()
    await panel().getByRole('button',{name:'下架「F07 Browser Shared Template」',exact:true}).click();const confirmation=panel().getByRole('region',{name:'确认模板操作',exact:true})
    await confirmation.getByRole('checkbox',{name:'我确认下架这个模板。',exact:true}).check();const unpublishedReply=await waitReply('/'+templateId+'/unpublish');await confirmation.getByRole('button',{name:'确认下架',exact:true}).click();await checkedReply(unpublishedReply)
    mark('publisher_republish')
    await panel().getByRole('button',{name:'刷新列表',exact:true}).click();await panel().getByRole('button',{name:'重新上架「F07 Browser Shared Template」',exact:true}).click()
    await expect(confirmation.getByText(fields.goal,{exact:true})).toBeVisible();await confirmation.getByRole('checkbox',{name:'我确认重新上架这个模板。',exact:true}).check();const republishedReply=await waitReply('/'+templateId+'/republish');await confirmation.getByRole('button',{name:'确认重新上架',exact:true}).click();await checkedReply(republishedReply)
    mark('publisher_delete_original_outcome')
    await panel().getByRole('button',{name:'刷新列表',exact:true}).click();await panel().getByRole('button',{name:'永久删除「F07 Browser Shared Template」',exact:true}).click();await expect(confirmation.getByText('模板将永久删除，无法恢复。别人已经复制的助手不受影响。',{exact:true})).toBeVisible()
    await confirmation.getByRole('checkbox',{name:'我确认永久删除这个模板。',exact:true}).check();f.mutable.dropNext={method:'DELETE',path:root+'/'+templateId};await confirmation.getByRole('button',{name:'确认永久删除',exact:true}).click();await expect(original).toBeEnabled()
    f.mutable.writes=false;await original.click();await expect(panel().getByText('模板已永久删除，已有副本不受影响。',{exact:true})).toBeVisible();f.mutable.writes=true
    expect(await f.agents.get(await f.identityFor('bob'),copiedId)).toBeTruthy();expect(await f.agents.get(await f.identityFor('bob'),lateCopy.spec_id)).toBeTruthy()
    await page.screenshot({path:testInfo.outputPath('f07-deletion-original-outcome.png'),fullPage:true})
    mark('same_employee_relogin_privacy')
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'模板市场',exact:true}).click();await panel().getByRole('button',{name:'发布我的模板',exact:true}).click()
    await panel().getByRole('region',{name:'发布模板',exact:true}).getByRole('textbox',{name:'模板名称',exact:true}).fill('F07 ALICE SAME EMPLOYEE DRAFT')
    await logout();await login('alice');await expect(panel().getByRole('region',{name:'发布模板',exact:true})).toHaveCount(0)
    expect(await page.locator('input').evaluateAll(inputs=>inputs.some(input=>input.value==='F07 ALICE SAME EMPLOYEE DRAFT'))).toBe(false)
    mark('copy_owner_governance_privacy')
    await logout();await login('bob');await panel().getByRole('button',{name:'发布我的模板',exact:true}).click();await panel().getByRole('region',{name:'发布模板',exact:true}).getByRole('textbox',{name:'模板名称',exact:true}).fill('F07 BOB PRIVATE DRAFT')
    mark('deactivated_employee_refresh')
    await f.governance('bob',false);await panel().getByRole('button',{name:'刷新列表',exact:true}).click();await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible();expect(await page.locator('input').evaluateAll(inputs=>inputs.some(input=>input.value==='F07 BOB PRIVATE DRAFT'))).toBe(false);await expect(page.getByRole('region',{name:'模板副本资源配置',exact:true})).toHaveCount(0)
    mark('verify_no_model_effects')
    await f.governance('bob',true);expect(outside).toEqual([]);await f.assertNoModelEffects()
  }catch(error){failure=error;console.error('[F07 failed phase] '+phase)
    try{const failedPage=context?.pages()[0];if(failedPage)await bounded('failure_screenshot',failedPage.screenshot({path:testInfo.outputPath('f07-action-failed.png'),fullPage:true}))}catch{console.error('[F07 screenshot unavailable]')}
  }finally{
    held?.release()
    for(const [label,work]of [['cleanup_context',()=>context?.close()],['cleanup_browser',()=>browser?.close()],['cleanup_fixture',()=>f.close()]]){
      mark(label);try{await bounded(label,Promise.resolve().then(work))}catch(error){console.error('[F07 cleanup failure] '+label);failure??=error}
    }
  }
  if(failure)throw failure
})
