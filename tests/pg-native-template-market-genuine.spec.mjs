// Root F07 browser job only. Actual Native/PG18 and page; no API response mocks,
// generated result fills, permission flags or direct copied-Agent/receipt writes.
import {test,expect,chromium} from '@playwright/test'
import {requireAgentTemplateMarketGenuineCi} from '../services/pg-api/tests/helpers/agent-template-market-genuine-guard.mjs'
import {startPgNativeTemplateMarketGenuineBrowserFixture} from './helpers/pg-native-template-market-genuine-fixture.mjs'
test('F07 actual template publish/copy/resource setup/lifecycle/recovery and employee scope',async({},testInfo)=>{
  test.setTimeout(300000);requireAgentTemplateMarketGenuineCi()
  const f=await startPgNativeTemplateMarketGenuineBrowserFixture(),root='/api/v2/template-market'
  let browser,context,held
  const sent=[],outside=[]
  try{
    await f.withHttpSource('alice');await f.withKnowledgeSource('alice')
    const alice=await f.identityFor('alice'),source=await f.agents.get(alice,f.resources.alice.spec.id),{require_approval:_approval,...before}=source.spec
    const fields={goal:'F07 browser complete public goal',task_scope:'F07 browser complete task scope',deliverables:['F07 public deliverable','F07 public source list'],task_plan:['F07 research step','F07 verify step'],done_criteria:['F07 verifiable criterion']}
    const saved=await f.agents.update(alice,source.id,'F07 Browser Share Source',{...before,...fields,require_approval:true,require_plan_review:true},source.revision);expect(saved).toBeTruthy()
    browser=await chromium.launch({headless:true});context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:1000},serviceWorkers:'block'})
    await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.browserOrigin){outside.push(route.request().url());await route.abort()}else await route.continue()})
    const page=await context.newPage()
    page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.includes(root)&&['POST','DELETE'].includes(request.method()))sent.push({path,method:request.method(),body:request.postData()})})
    const login=async who=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(f.credentials[who].email);await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password);await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await page.getByRole('button',{name:'模板市场',exact:true}).click();await expect(page.getByRole('region',{name:'模板市场',exact:true})).toBeVisible()}
    const logout=async()=>{await page.getByRole('button',{name:'退出',exact:true}).click();await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible()}
    const panel=()=>page.getByRole('region',{name:'模板市场',exact:true})
    const waitReply=(suffix,method='POST')=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(root+suffix)&&response.request().method()===method)
    const checkedReply=async pending=>{const reply=await pending;expect(reply.status(),'actual F07 response must be200').toBe(200);return reply.json()}
    await page.goto(f.url,{waitUntil:'domcontentloaded'});await login('alice')
    await panel().getByRole('button',{name:'发布我的模板',exact:true}).click()
    const publishing=panel().getByRole('region',{name:'发布模板',exact:true})
    await publishing.getByLabel('我的助手方案',{exact:true}).selectOption(saved.id)
    await publishing.getByLabel('模板名称',{exact:true}).fill('F07 Browser Shared Template')
    await publishing.getByLabel('模板简介（必填，最多 120 字）',{exact:true}).fill('公开的合成研究方案')
    const [previewReply]=await Promise.all([waitReply('/preview-publish'),publishing.getByRole('button',{name:'预览公开内容',exact:true}).click()]);const preview=await checkedReply(Promise.resolve(previewReply))
    for(const [key,value]of Object.entries(fields))expect(preview.snapshot.spec[key]).toEqual(value)
    expect(preview.snapshot.spec.knowledge_base_ids).toEqual([]);expect(Object.hasOwn(preview.snapshot.spec,'model_binding')).toBe(false);expect(Object.hasOwn(preview.snapshot.spec,'http_tools')).toBe(false)
    const reviewed=publishing.getByRole('checkbox',{name:'我已核查全部公开文字，确认可以发布。',exact:true}),publish=publishing.getByRole('button',{name:'确认发布这个模板',exact:true})
    await expect(publish).toBeDisabled();await reviewed.check();await expect(publish).toBeEnabled()
    await publishing.getByLabel('模板简介（必填，最多 120 字）',{exact:true}).fill('重新核查后的公开合成研究方案');await expect(publish).toHaveCount(0)
    const [updatedReply]=await Promise.all([waitReply('/preview-publish'),publishing.getByRole('button',{name:'预览公开内容',exact:true}).click()]);await checkedReply(Promise.resolve(updatedReply));await expect(reviewed).not.toBeChecked()
    await panel().scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('f07-public-preview-desktop.png'),fullPage:true})
    await page.setViewportSize({width:390,height:844});const box=await panel().boundingBox();expect(box).not.toBeNull();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);await page.screenshot({path:testInfo.outputPath('f07-public-preview-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:1000})
    await reviewed.check();const [publishedReply]=await Promise.all([waitReply('/publish'),publish.click()]);const published=await checkedReply(Promise.resolve(publishedReply)),templateId=published.item.id
    await expect(panel().getByText('模板已发布。',{exact:true})).toBeVisible();await logout();await login('bob')
    const locate=async()=>{await panel().getByRole('searchbox',{name:'搜索模板',exact:true}).fill('F07 Browser Shared Template');await panel().getByRole('combobox',{name:'分类',exact:true}).selectOption('research');await panel().getByRole('button',{name:'搜索',exact:true}).click();await panel().getByRole('button',{name:'查看「F07 Browser Shared Template」',exact:true}).click();await expect(panel().getByRole('region',{name:'模板详情',exact:true})).toBeVisible()}
    const prepareCopy=async name=>{await locate();const detail=panel().getByRole('region',{name:'模板详情',exact:true});await detail.getByLabel('副本名称',{exact:true}).fill(name);const [reply]=await Promise.all([waitReply('/preview-use'),detail.getByRole('button',{name:'预览我的副本',exact:true}).click()]);await checkedReply(Promise.resolve(reply));return detail}
    let detail=await prepareCopy('F07 Bob Resource Copy'),counts=await f.counts()
    f.mutable.dropNext={method:'POST',path:root+'/'+templateId+'/use'}
    await detail.getByRole('button',{name:'确认复制为我的助手',exact:true}).click();const original=panel().getByRole('button',{name:'查询原操作结果',exact:true});await expect(original).toBeEnabled()
    const copyRequests=sent.filter(request=>request.path.endsWith('/'+templateId+'/use'));expect(copyRequests).toHaveLength(1);const originalBody=JSON.parse(copyRequests[0].body)
    f.mutable.writes=false;await original.click();await expect(panel().getByRole('button',{name:'配置我的模型与资源',exact:true})).toBeEnabled()
    expect(sent.filter(request=>request.path.endsWith('/'+templateId+'/use'))).toHaveLength(1)
    const receipt=(await f.db.query('SELECT receipt FROM agentstudio.agent_template_market_receipts WHERE owner_user_id=$1 AND request_id=$2',[f.users.bob,originalBody.request_id])).rows[0].receipt,copiedId=receipt.spec_id
    const copied=await f.agents.get(await f.identityFor('bob'),copiedId);expect(copied.owner_user_id).toBe(f.users.bob);expect(copied.spec.knowledge_base_ids).toEqual([]);for(const key of['model_binding','http_tools','mcp_tools','knowledge_retrieval'])expect(Object.hasOwn(copied.spec,key)).toBe(false)
    expect((await f.counts()).agents).toBe(counts.agents+1);expect((await f.counts()).receipts).toBe(counts.receipts+1);f.mutable.writes=true
    const actualCopyGet=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/api/v2/agent-specs/'+copiedId)&&response.request().method()==='GET'&&response.status()===200)
    await panel().getByRole('button',{name:'配置我的模型与资源',exact:true}).click();expect((await(await actualCopyGet).json()).item.id).toBe(copiedId)
    const setup=page.getByRole('region',{name:'模板副本资源配置',exact:true});await expect(setup).toBeVisible()
    for(const label of['选择 Agent','工具绑定 Agent','MCP 工具绑定 Agent','知识库绑定 Agent'])await expect(setup.getByRole('combobox',{name:label,exact:true})).toHaveValue(copiedId)
    await setup.getByRole('combobox',{name:'选择模型连接',exact:true}).selectOption(f.resources.bob.model.id);await setup.getByRole('combobox',{name:'选择具体模型',exact:true}).selectOption('synthetic')
    const refreshed=page.waitForResponse(async response=>{if(!new URL(response.url()).pathname.endsWith('/api/v2/agent-specs/'+copiedId)||response.request().method()!=='GET'||response.status()!==200)return false;try{return(await response.json()).item.revision===copied.revision+1}catch{return false}})
    await setup.getByRole('button',{name:'验证并保存绑定',exact:true}).click();const actualRefresh=await(await refreshed).json();expect(actualRefresh.item.spec.model_binding).toEqual(f.resources.bob.binding)
    const bound=await f.agents.get(await f.identityFor('bob'),copiedId);expect(bound.revision).toBe(copied.revision+1);expect(bound.spec.model_binding).toEqual(f.resources.bob.binding);expect(bound.spec.model_binding.connection_id).not.toBe(f.resources.alice.model.id)
    for(const label of['选择 Agent','工具绑定 Agent','MCP 工具绑定 Agent','知识库绑定 Agent'])await expect(setup.getByRole('combobox',{name:label,exact:true})).toHaveValue(copiedId)
    await page.screenshot({path:testInfo.outputPath('f07-actual-copy-resource-configuration.png'),fullPage:true});await setup.getByRole('button',{name:'返回全部助手配置',exact:true}).click()
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'模板市场',exact:true}).click();detail=await prepareCopy('F07 Bob Late Copy')
    const [lateCopyReply]=await Promise.all([waitReply('/'+templateId+'/use'),detail.getByRole('button',{name:'确认复制为我的助手',exact:true}).click()]);const lateCopy=await checkedReply(Promise.resolve(lateCopyReply))
    held=f.holdNextAgentResponse(lateCopy.spec_id);await panel().getByRole('button',{name:'配置我的模型与资源',exact:true}).click();expect((await held.entered()).status).toBe(200)
    await logout();await login('alice');held.release();held=null
    await expect(page.getByRole('region',{name:'模板副本资源配置',exact:true})).toHaveCount(0);await expect(page.getByText('F07 Bob Late Copy',{exact:true})).toHaveCount(0)
    await panel().getByRole('button',{name:'我的发布',exact:true}).click();await expect(panel().getByText('F07 Browser Shared Template',{exact:true})).toBeVisible()
    await panel().getByRole('button',{name:'下架「F07 Browser Shared Template」',exact:true}).click();const confirmation=panel().getByRole('region',{name:'确认模板操作',exact:true})
    await confirmation.getByRole('checkbox',{name:'我确认下架这个模板。',exact:true}).check();const [unpublishedReply]=await Promise.all([waitReply('/'+templateId+'/unpublish'),confirmation.getByRole('button',{name:'确认下架',exact:true}).click()]);await checkedReply(Promise.resolve(unpublishedReply))
    await panel().getByRole('button',{name:'刷新列表',exact:true}).click();await panel().getByRole('button',{name:'重新上架「F07 Browser Shared Template」',exact:true}).click()
    await expect(confirmation.getByText(fields.goal,{exact:true})).toBeVisible();await confirmation.getByRole('checkbox',{name:'我确认重新上架这个模板。',exact:true}).check();const [republishedReply]=await Promise.all([waitReply('/'+templateId+'/republish'),confirmation.getByRole('button',{name:'确认重新上架',exact:true}).click()]);await checkedReply(Promise.resolve(republishedReply))
    await panel().getByRole('button',{name:'刷新列表',exact:true}).click();await panel().getByRole('button',{name:'永久删除「F07 Browser Shared Template」',exact:true}).click();await expect(confirmation.getByText('模板将永久删除，无法恢复。别人已经复制的助手不受影响。',{exact:true})).toBeVisible()
    await confirmation.getByRole('checkbox',{name:'我确认永久删除这个模板。',exact:true}).check();f.mutable.dropNext={method:'DELETE',path:root+'/'+templateId};await confirmation.getByRole('button',{name:'确认永久删除',exact:true}).click();await expect(original).toBeEnabled()
    f.mutable.writes=false;await original.click();await expect(panel().getByText('模板已永久删除，已有副本不受影响。',{exact:true})).toBeVisible();f.mutable.writes=true
    expect(await f.agents.get(await f.identityFor('bob'),copiedId)).toBeTruthy();expect(await f.agents.get(await f.identityFor('bob'),lateCopy.spec_id)).toBeTruthy()
    await page.screenshot({path:testInfo.outputPath('f07-deletion-original-outcome.png'),fullPage:true})
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'模板市场',exact:true}).click();await panel().getByRole('button',{name:'发布我的模板',exact:true}).click()
    await panel().getByRole('region',{name:'发布模板',exact:true}).getByLabel('模板名称',{exact:true}).fill('F07 ALICE SAME EMPLOYEE DRAFT')
    await logout();await login('alice');await expect(panel().getByRole('region',{name:'发布模板',exact:true})).toHaveCount(0)
    expect(await page.locator('input').evaluateAll(inputs=>inputs.some(input=>input.value==='F07 ALICE SAME EMPLOYEE DRAFT'))).toBe(false)
    await logout();await login('bob');await panel().getByRole('button',{name:'发布我的模板',exact:true}).click();await panel().getByRole('region',{name:'发布模板',exact:true}).getByLabel('模板名称',{exact:true}).fill('F07 BOB PRIVATE DRAFT')
    await f.governance('bob',false);await panel().getByRole('button',{name:'刷新列表',exact:true}).click();await expect(page.getByRole('button',{name:'登录独立工作台',exact:true})).toBeVisible();expect(await page.locator('input').evaluateAll(inputs=>inputs.some(input=>input.value==='F07 BOB PRIVATE DRAFT'))).toBe(false);await expect(page.getByRole('region',{name:'模板副本资源配置',exact:true})).toHaveCount(0)
    await f.governance('bob',true);expect(outside).toEqual([]);await f.assertNoModelEffects()
  }finally{held?.release();await context?.close();await browser?.close();await f.close()}
})
