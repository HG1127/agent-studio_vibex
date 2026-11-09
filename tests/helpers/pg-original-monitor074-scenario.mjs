import {requireOriginalMonitor074BrowserCi} from './pg-original-monitor074-browser-guard.mjs'
import {installOriginalLegacyBlockObserver} from './pg-original-login-legacy-observer.mjs'
// Root host adapter contract, not a new/replaced employee page. The actual
// original index/App/AgentRun route and all dependencies must be mounted.
// Missing parent/material/artifact/quality contracts remain hard failures.
export async function runOriginalMonitor074BrowserScenario({context,fixture:f,expect,testInfo}){
 const permit=requireOriginalMonitor074BrowserCi()
 if(!f||f.profile!=='original-agent-run-monitor074'||f.head!==permit.head||f.originalBuild?.entry!=='index.html'||f.originalBuild?.main!=='src/main.tsx'||f.originalBuild?.app!=='src/App.tsx'||!Array.isArray(f.missingContracts)||f.missingContracts.length||typeof f.observe!=='function'||typeof f.collectNext!=='function'||typeof f.finishAnalysis!=='function')throw Error('monitor074_original_page_Root_host_contract_required')
 const observer=await installOriginalLegacyBlockObserver(context),outside=[]
 context.on('request',request=>{const u=new URL(request.url());if(!['data:','blob:','about:'].includes(u.protocol)&&u.origin!==f.origin)outside.push({method:request.method(),origin:u.origin})})
 const page=await context.newPage(),api='/__pg_native/api/v2/original-ui/business',wire=(path,method='GET')=>page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method)
 try{
  await page.goto(f.origin+'/login?next=%2F',{waitUntil:'domcontentloaded'})
  await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials.alice.email);await page.getByLabel('密码',{exact:true}).fill(f.credentials.alice.password)
  const me=wire('/__pg_native/api/native-auth/me')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  expect((await(await me).json()).user.id).toBe(f.users.alice)
  const caseRead=wire(api+'/cases/'+f.caseId)
  await page.goto(f.origin+'/agent-run?'+new URLSearchParams({case:f.caseId,monitor:f.monitorId,check:f.firstCheckId}),{waitUntil:'domcontentloaded'})
  expect((await caseRead).status()).toBe(200)
  const card=page.getByRole('article',{name:'监测检查 '+f.firstCheckId,exact:true})
  await expect(card).toBeVisible();await expect(card).toContainText('基线未推进')
  const preview=wire(api+'/monitor-checks/'+f.firstCheckId+'/review-preview')
  await card.getByRole('button',{name:'复核本次检查',exact:true}).click()
  const previewBody=await(await preview).json()
  expect(previewBody.check.check_id).toBe(f.firstCheckId);expect(previewBody.receipts.length).toBeGreaterThan(0)
  const panel=page.getByRole('region',{name:'监测检查复核',exact:true})
  const source=previewBody.receipts[0],saved=wire(api+'/runs/'+source.run_id+'/results/'+source.result_id)
  await panel.getByRole('button',{name:'读取保存结果',exact:true}).first().click()
  const payload=await(await saved).json();expect(payload.coverage.stored_complete).toBe(true);expect(payload.text).toContain(f.expectedSourceMarker)
  await panel.getByLabel('复核说明',{exact:true}).fill('Employee verified the actual declared synthetic DEMO evidence in the original page.')
  await panel.getByRole('checkbox',{name:'已核对所有显示的来源范围、主体、逐字引文、版本和有效时间',exact:true}).check()
  const accepted=wire(api+'/monitor-checks/'+f.firstCheckId+'/review','POST')
  await panel.getByRole('button',{name:'确认本次范围与事实',exact:true}).click();expect((await accepted).status()).toBe(200)
  expect((await f.observe()).baseline_check_id).toBe(f.firstCheckId)
  const second=await f.collectNext()
  expect(second.profile).toBe('actual_native_schedule_origin');expect(second.check_id).not.toBe(f.firstCheckId)
  await page.goto(f.origin+'/agent-run?'+new URLSearchParams({case:f.caseId,monitor:f.monitorId,check:second.check_id}),{waitUntil:'domcontentloaded'})
  const list=wire(api+'/cases/'+f.caseId+'/query','POST')
  await page.getByRole('button',{name:'读取正式记录（每类前 50 条）',exact:true}).click();expect((await list).status()).toBe(200)
  const relation=page.locator('details').filter({has:page.locator('summary').filter({hasText:f.relationId})}).last()
  await relation.locator('summary').click()
  await relation.getByLabel('复核依据',{exact:true}).fill('Later employee rejection must block any reuse of the old accepted baseline.')
  const rejected=wire(api+'/cases/'+f.caseId+'/reviews','POST')
  await relation.getByRole('button',{name:'记录不支持',exact:true}).click();expect((await rejected).status()).toBe(200)
  await f.finishAnalysis(second.check_id)
  expect((await f.observe()).baseline_check_id).toBe(f.firstCheckId)
  await page.getByRole('button',{name:'刷新监测',exact:true}).click()
  await expect(page.getByRole('article',{name:'监测检查 '+second.check_id,exact:true})).toContainText('待员工复核')
  await observer.flush(page)
  expect(observer.snapshot().event_count_capped_129).toBe(0);expect(outside).toEqual([])
  const observed=await f.observe()
  expect(observed.pb_requests).toBe(0);expect(observed.unapproved_external_requests).toBe(0);expect(observed.model_provider_requests).toBe(0)
  expect(observed.declared_source_gets).toBeGreaterThan(0);expect(observed.declared_source_gets).toBeLessThanOrEqual(2)
  expect(observed.installed_catalog).toBe('pg_v9_074');expect(observed.actual_request_receipts).toBeGreaterThan(0)
  // All visible original page sections must work; hiding legacy block events,
  // absent parent reads or material/quality/report errors is not acceptance.
  await expect(page.getByRole('alert')).toHaveCount(0)
  await testInfo.attach('monitor074-original-agent-run',{body:await page.screenshot({fullPage:true}),contentType:'image/png'})
  return{profile:'original-agent-run-monitor074',steps_completed:true,observed,production_GO:false}
 }finally{await page.close()}
}
