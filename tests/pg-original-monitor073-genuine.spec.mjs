import {test,expect,chromium} from '@playwright/test'
import {requireOriginalMonitor073BrowserCi} from './helpers/pg-original-monitor073-browser-guard.mjs'
import {startOriginalMonitor073GenuineBrowserFixture} from './helpers/pg-original-monitor073-genuine-browser-fixture.mjs'
import {installOriginalLegacyBlockObserver} from './helpers/pg-original-login-legacy-observer.mjs'
test('original Home073: real nonempty owner metadata, pagination, Native read acknowledgement and employee switch',async({},testInfo)=>{
 requireOriginalMonitor073BrowserCi() // First effectful purpose gate.
 const fs=await import('node:fs/promises'),f=await startOriginalMonitor073GenuineBrowserFixture()
 let browser,context,page,observer,primary,before,after,baseBefore,baseAfter,stepsCompleted=false
 const outside=[],cleanup=[];const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 const wire=(path,method='GET')=>page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method&&r.status()===200)
 const monitorPath='/__pg_native/api/v2/original-ui/monitor-inbox'
 const section=()=>page.getByRole('region',{name:'监测待办与变化事件',exact:true})
 const login=async who=>{
  await page.goto(f.origin+'/login?next=%2F',{waitUntil:'domcontentloaded'})
  await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email);await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
  const me=wire('/__pg_native/api/native-auth/me'),inbox=wire(monitorPath)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  const identity=(await(await me).json()).user,response=await(await inbox).json();expect(identity.id).toBe(f.users[who]);expect(response.employee_id).toBe(f.users[who]);expect(response.items.length).toBeGreaterThan(0)
  await expect(page.getByRole('heading',{name:'我的工作台',exact:true})).toBeVisible()
  await expect(section().getByRole('alert')).toHaveCount(0)
  const hrefs=await section().getByRole('link',{name:'查看监测',exact:true}).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))
  const own=f.syntheticMonitorIds[who],other=f.syntheticMonitorIds[who==='alice'?'bob':'alice'];expect(hrefs.length).toBeGreaterThan(0)
  for(const href of hrefs){const u=new URL(href,f.origin),check=u.searchParams.get('check'),event=u.searchParams.get('event');expect(own.includes(check)).toBe(true);if(event)expect(own.includes(event)).toBe(true);expect(other.includes(check)||other.includes(event)).toBe(false)}
  return identity
 }
 const logout=async identity=>{
  await page.getByRole('button',{name:new RegExp(identity.display_name)}).click();const reply=wire('/__pg_native/api/native-auth/logout','POST')
  await page.getByRole('menuitem',{name:'退出登录',exact:true}).click();await reply;await expect(page).toHaveURL(f.origin+'/login')
 }
 try{
  before=await f.monitorState();baseBefore=await f.counts();expect(before).toEqual({alice:{unread:14,receipts:0},bob:{unread:3,receipts:0}})
  browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});observer=await installOriginalLegacyBlockObserver(context)
  await context.route('**/*',async route=>{const origin=new URL(route.request().url()).origin;if(origin!==f.origin){if(outside.length<128)outside.push(origin);else f.observations.overflow=true;await route.abort();return}await route.continue()});await context.routeWebSocket('**/*',socket=>socket.close())
  page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000)
  const alice=await login('alice');await expect(section().getByRole('button',{name:'下一页监测消息',exact:true})).toBeVisible()
  let refreshed=wire(monitorPath);await section().getByRole('button',{name:'下一页监测消息',exact:true}).click();await refreshed;await expect(section().getByRole('button',{name:'返回消息首页',exact:true})).toBeVisible()
  refreshed=wire(monitorPath);await section().getByRole('button',{name:'返回消息首页',exact:true}).click();await refreshed
  const ack=page.waitForResponse(r=>/^\/__pg_native\/api\/v2\/original-ui\/monitor-events\/[a-f0-9-]{36}\/read$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST')
  refreshed=wire(monitorPath);await section().getByRole('button',{name:'标为已读',exact:true}).first().click();expect((await ack).status()).toBe(200);await refreshed
  expect(await f.monitorState()).toEqual({alice:{unread:13,receipts:1},bob:{unread:3,receipts:0}})
  await page.screenshot({path:testInfo.outputPath('original-home-monitor073-owner-read.png'),fullPage:true});await logout(alice)
  const bob=await login('bob');await expect(section().getByRole('button',{name:'下一页监测消息',exact:true})).toHaveCount(0);await page.screenshot({path:testInfo.outputPath('original-home-monitor073-employee-switch.png'),fullPage:true});await logout(bob)
  await observer.flush(page);expect(observer.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false});expect(outside).toEqual([]);expect(f.observations.legacy_backend_requests).toEqual([]);expect(f.observations.unexpected_api_failures).toEqual([]);expect(f.observations.blocked_requests).toEqual([]);expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.overflow).toBe(false)
  after=await f.monitorState();baseAfter=await f.counts();expect(after).toEqual({alice:{unread:13,receipts:1},bob:{unread:3,receipts:0}});expect(baseAfter).toEqual(baseBefore);expect(f.monitorCounters.acks).toBe(1);expect(f.monitorCounters.reads).toBeGreaterThan(3);expect(f.providerRequests.length).toBe(0);expect(f.credentialReads()).toBe(0);f.assertNoProviderErrors();stepsCompleted=true
 }catch(error){primary=error}
 finally{
  if(observer&&page&&!page.isClosed())await clean('observer_flush',()=>observer.flush(page))
  if(page&&!page.isClosed()&&(primary||testInfo.errors.length))await clean('synthetic_failure_image',()=>page.screenshot({path:testInfo.outputPath('original-home-monitor073-failure.png'),fullPage:true}))
  if(context)await clean('context_close',()=>context.close());if(browser)await clean('browser_close',()=>browser.close());await clean('fixture_close',()=>f.close())
  const observation={scope:'original Home quarantined historical monitor metadata/read acknowledgement only',steps_completed:stepsCompleted,browser_story_has_failures:Boolean(primary||testInfo.errors.length||cleanup.length),actual_build:f.provenance,backend_profile:f.backendProfile,monitor_before:before??null,monitor_after:after??null,base_business_before:baseBefore??null,base_business_after:baseAfter??null,local_legacy_blocks:observer?.snapshot()??null,http:f.observations,monitor_http_counts:f.monitorCounters,blocked_origins:outside,provider_requests:f.providerRequests.length,cleanup_failures:cleanup.map(x=>x.label),source_acl_complete:false,event_generation_complete:false,review_baseline_pipeline_complete:false,full_original_home_acceptance:false,actual_employee_UAT:0,qualifying_24h:0,production_GO:false}
  await clean('bounded_observation',()=>fs.writeFile(testInfo.outputPath('original-monitor073-observation.json'),JSON.stringify(observation,null,2)))
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup.map(c=>c.error)],'original_monitor073_and_cleanup_failed');if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup.map(c=>c.error),'original_monitor073_cleanup_failed')
})
