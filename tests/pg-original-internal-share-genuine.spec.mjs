import {test,expect,chromium} from '@playwright/test'
import {requireOriginalInternalShareBrowserCi} from './helpers/pg-original-internal-share-browser-guard.mjs'
import {startOriginalInternalShareBrowserFixture} from './helpers/pg-original-internal-share-browser-fixture.mjs'
import {installOriginalLegacyBlockObserver} from './helpers/pg-original-login-legacy-observer.mjs'

test('original internal-templates: real reviewed sharing, redemption, revoke, unknown ACK and account fences',async({},testInfo)=>{
 const permit=requireOriginalInternalShareBrowserCi() // Before fixture/files/PG/TLS/browser.
 const fs=await import('node:fs/promises'),f=await startOriginalInternalShareBrowserFixture()
 let browser,context,page,observer,primary,before,after,copyAudit,foreignAudit,expectedEmployeeAudit,webSockets=0
 const outside=[],cleanup=[],holds=[]
 const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 try{
  expect(f.backendProfile).toMatchObject({profile:'fresh-original-F08',head:permit.head,source_and_catalog_audited_by_original_F08:true,original_page_acceptance:false,full_Native_process_entry_verified:false,production_GO:false})
  before=await f.counts()
  browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]})
  context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
  observer=await installOriginalLegacyBlockObserver(context)
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.origin){if(outside.length<128)outside.push('outside_origin');else f.observations.overflow=true;await route.abort();return}await route.continue()})
  await context.routeWebSocket('**/*',socket=>{webSockets=Math.min(129,webSockets+1);if(webSockets===129)f.observations.overflow=true;socket.close()})
  page=await context.newPage();page.setDefaultTimeout(15000)
  const settled=async p=>{await expect(p.getByRole('button',{name:'刷新',exact:true})).toBeEnabled()}
  const login=async(p,who)=>{
   await p.goto(f.url)
   await p.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email)
   await p.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
   const wire=p.waitForResponse(response=>new URL(response.url()).pathname==='/__pg_native/api/native-auth/login'&&response.request().method()==='POST')
   await p.getByRole('button',{name:'登录',exact:true}).click();expect((await wire).status()).toBe(200)
   await expect(p).toHaveURL(f.origin+'/internal-templates')
   await expect(p.getByRole('heading',{name:'内部 Agent 共享',exact:true})).toBeVisible();await settled(p)
   const cookies=(await context.cookies(f.origin)).filter(v=>v.name==='__Host-agentstudio_session')
   expect(cookies.length).toBe(1);expect(cookies[0].secure&&cookies[0].httpOnly&&cookies[0].sameSite==='Strict'&&cookies[0].path==='/'&&cookies[0].domain==='localhost','actual host-only Secure HttpOnly Strict Cookie').toBe(true)
   const owner=p.getByLabel('选择需要分享的 Agent',{exact:true})
   await expect(owner.locator('option[value="'+f.sourceSpecId(who)+'"]')).toHaveCount(1)
   await expect(owner.locator('option[value="'+f.sourceSpecId(who==='alice'?'bob':'alice')+'"]')).toHaveCount(0)
  }
  const logout=async(p,who)=>{
   await settled(p);const menu=p.getByRole('menu')
   if(!await menu.isVisible())await p.getByRole('button',{name:new RegExp(f.profiles[who].display_name)}).click()
   const wire=p.waitForResponse(response=>new URL(response.url()).pathname==='/__pg_native/api/native-auth/logout'&&response.request().method()==='POST')
   await menu.getByRole('menuitem',{name:'退出登录',exact:true}).click();expect((await wire).status()).toBe(200);await expect(p).toHaveURL(f.origin+'/login')
  }
  const review=async()=>{
   await page.getByLabel('选择需要分享的 Agent',{exact:true}).selectOption(f.sourceSpecId('alice'))
   await page.getByRole('button',{name:'预览实际分享内容',exact:true}).click()
   await expect(page.getByText(await f.sourceGoal('alice'),{exact:true})).toBeVisible()
   await page.getByLabel('确认分享内容已审核',{exact:true}).check()
  }
  const create=async()=>{await review();await page.getByRole('button',{name:'确认并生成分享码',exact:true}).click();await settled(page)}
  const revokeOnlyActive=async()=>{
   const section=page.locator('section').filter({has:page.getByRole('heading',{name:'我的分享记录',exact:true})}),button=section.getByRole('button',{name:'撤销',exact:true})
   await expect(button).toHaveCount(1);await button.click();await settled(page);await expect(button).toHaveCount(0)
  }
  await test.step('original form creates real reviewed share; distinct actual employee redeems an unbound owned copy',async()=>{
   await login(page,'alice');await create()
   const code=await page.locator('p.font-mono').innerText();expect(/^[A-Za-z0-9]{48}$/.test(code),'actual once-visible code shape without logging its value').toBe(true)
   expectedEmployeeAudit=await f.assertExpectedEmployeeRefused(code)
   await logout(page,'alice');await login(page,'bob')
   await page.getByLabel('一次性分享码',{exact:true}).fill(code)
   await page.getByRole('button',{name:'领取并复制到我的助手',exact:true}).click();await settled(page)
   await expect(page.getByText('领取成功',{exact:true})).toBeVisible()
   await expect(page.getByRole('link',{name:'打开我的 Agent 工作台',exact:true})).toHaveAttribute('href','/')
   copyAudit=await f.assertRecipientOwnsUnboundCopy();foreignAudit=await f.assertForeignOwnerRefused()
   // A deliberate synthetic CI artifact after Bob's real receipt has settled.
   // Never capture the once-visible Alice code, login password, Cookie or trace.
   await settled(page)
   await expect.poll(async()=>({
    code_absent:(await page.locator('p.font-mono').count())===0,
    redeem_input_empty:(await page.getByLabel('一次性分享码',{exact:true}).inputValue())==='',
    password_absent:(await page.getByLabel('密码',{exact:true}).count())===0,
   }),{message:'synthetic screenshot must expose only safe boolean DOM observations'}).toEqual({code_absent:true,redeem_input_empty:true,password_absent:true})
   await expect(page.getByRole('alert')).toHaveCount(0)
   await expect(page.getByText('领取成功',{exact:true})).toBeVisible()
   await page.screenshot({path:testInfo.outputPath('original-internal-share-bob-redeemed.png'),fullPage:true})
   await logout(page,'bob');await login(page,'alice')
  })
  await test.step('original revoke records a genuine receipt and removes the active original action',async()=>{await create();await revokeOnlyActive()})
  await test.step('actual post-record disconnect uses original refresh to confirm same intent without redisplaying code',async()=>{
   await review();f.dropNextActualCreateReply()
   await page.getByRole('button',{name:'确认并生成分享码',exact:true}).click()
   await expect(page.getByRole('alert')).toContainText('本次结果尚未确认')
   await expect(page.getByRole('button',{name:'确认并生成分享码',exact:true})).toBeDisabled()
   const ledger=await f.counts();expect(ledger.receipts-before.receipts).toBe(5)
   await page.getByRole('button',{name:'刷新',exact:true}).click();await settled(page)
   await expect(page.getByRole('status')).toContainText('无法再次显示')
   await expect.poll(()=>page.locator('p.font-mono').count(),{message:'once-visible code element must be absent'}).toBe(0)
   expect((await f.counts()).receipts).toBe(ledger.receipts)
   await revokeOnlyActive()
  })
  await test.step('late real list and late real write ACK never enter the replacement original employee scope',async()=>{
   for(const method of ['GET','POST']){
    if(method==='POST')await review()
    const gate=f.holdNextResponse(method,'/__pg_native/api/v2/internal-templates');holds.push(gate)
    if(method==='GET')await page.getByRole('button',{name:'刷新',exact:true}).click()
    else await page.getByRole('button',{name:'确认并生成分享码',exact:true}).click()
    await gate.entered()
    const switcher=await context.newPage();await switcher.goto(f.origin+'/internal-templates');await settled(switcher)
    await logout(switcher,'alice');await login(switcher,'bob');await page.bringToFront()
    // Focus must revalidate real Cookie even while the old read/write is held.
    await expect.poll(()=>page.locator('p.font-mono').count(),{message:'once-visible code element must be absent'}).toBe(0)
    await expect(page.getByLabel('选择需要分享的 Agent').locator('option[value="'+f.sourceSpecId('alice')+'"]')).toHaveCount(0)
    await expect(page.getByLabel('选择需要分享的 Agent').locator('option[value="'+f.sourceSpecId('bob')+'"]')).toHaveCount(1)
    gate.release();await page.getByRole('button',{name:'刷新',exact:true}).click();await settled(page)
    await expect(page.getByLabel('选择需要分享的 Agent').locator('option[value="'+f.sourceSpecId('bob')+'"]')).toHaveCount(1)
    await expect.poll(()=>page.locator('p.font-mono').count(),{message:'once-visible code element must be absent'}).toBe(0)
    await logout(page,'bob');await login(page,'alice');await switcher.close()
   }
  })
  after=await f.counts()
  expect(after.invites-before.invites).toBe(4);expect(after.snapshots-before.snapshots).toBe(4)
  expect(after.receipts-before.receipts).toBe(7);expect(after.consumptions-before.consumptions).toBe(1);expect(after.agents-before.agents).toBe(1)
  await f.assertNoModelEffects();await observer.flush(page)
  expect.soft(observer.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false})
  expect.soft(f.observations.legacy_backend_requests).toEqual([]);expect.soft(f.observations.unexpected_api_failures).toEqual([]);expect.soft(f.observations.blocked_requests).toEqual([])
  expect(outside).toEqual([]);expect(webSockets).toBe(0);expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.overflow).toBe(false)
  expect(f.observations.controlled_after_record_disconnects).toBe(1);expect(f.observations.held_actual_responses).toBe(2)
 }catch(error){primary=error}
 finally{
  for(const gate of holds)gate.release()
  if(observer&&page&&!page.isClosed())await clean('observer_flush',()=>observer.flush(page))
  if(context)await clean('browser_context',()=>context.close())
  if(browser)await clean('browser',()=>browser.close())
  await clean('owned_fixture',()=>f.close())
  const observation={scope:'actual original internal-templates hosted story only',head:permit.head,build:f.provenance,backend:f.backendProfile,
   business_before:before??null,business_after:after??null,recipient_owner_audit:copyAudit??null,foreign_owner_refusal:foreignAudit??null,expected_employee_negative:expectedEmployeeAudit??null,
   http:f.observations,local_PB_blocks:observer?.snapshot()??null,outside_origins:outside,websocket_requests_capped_129:webSockets,failed:Boolean(primary||testInfo.errors.length||cleanup.length),cleanup_failures:cleanup.map(v=>v.label),
   all_original_pages_complete:false,employee_UAT:0,qualifying_24h:0,production_GO:false}
  await clean('safe_observation',()=>fs.writeFile(testInfo.outputPath('original-internal-share-observation.json'),JSON.stringify(observation,null,2)))
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup.map(v=>v.error)],'original_share_story_and_cleanup_failed')
 if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup.map(v=>v.error),'original_share_cleanup_failed')
})
