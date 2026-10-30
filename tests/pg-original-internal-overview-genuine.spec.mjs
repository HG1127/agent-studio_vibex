import {test,expect,chromium} from '@playwright/test'
import {requireOriginalOverviewBrowserCi,originalOverviewPath,originalOverviewArtifacts} from './helpers/pg-original-internal-overview-browser-guard.mjs'
import {startOriginalOverviewGenuineBrowserFixture} from './helpers/pg-original-internal-overview-genuine-browser-fixture.mjs'
import {installOriginalLegacyBlockObserver} from './helpers/pg-original-login-legacy-observer.mjs'
test('original personal overview: real owner rows, Cookie switch, completed delayed reply and actual dependency failure',async()=>{
 const permit=requireOriginalOverviewBrowserCi() // Before filesystem/PG/TLS/browser effects.
 const fs=await import('node:fs/promises'),url=await import('node:url'),path=await import('node:path')
 const f=await startOriginalOverviewGenuineBrowserFixture()
 let browser,context,page,observer,primary,before,after,baseBefore,baseAfter,held,stepsCompleted=false,artifactDir
 const outside=[],cleanup=[],images=new Map(),id=n=>'58000000-0000-4000-8000-'+String(n).padStart(12,'0')
 const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 const wire=(p,method='GET',status=200)=>page.waitForResponse(r=>new URL(r.url()).pathname===p&&r.request().method()===method&&r.status()===status)
 const main=()=>page.locator('main'),section=name=>main().locator('section').filter({has:page.getByRole('heading',{name,exact:true})})
 const href=r=>r.kind==='schedule'?'/scheduled-tasks':r.kind==='agent'?'/run-detail?run='+encodeURIComponent(r.id):'/workflow-canvas'
 const checkDto=(who,dto)=>{
  expect(dto.protocol).toBe('native_original_internal_overview_v1');expect(dto.scope).toBe('current_user');expect(dto.employee_id).toBe(f.users[who]);expect(dto.counters).toEqual(f.expected[who]);expect(dto.sampling).toEqual({recent_limit_per_kind:12,action_limit:32,failed_window_days:7})
  expect(dto.worker).toEqual({availability:'unavailable',reason:'legacy_main_worker_not_equivalent'});expect(dto.unavailable).toEqual(['historical_run_titles','legacy_main_worker_health'])
  expect(JSON.stringify(dto)).not.toMatch(/overviewPrivateNeverExpose|CURRENT_WORKFLOW_NAME|"(?:owner_user_id|instruction|result_text|checkpoint|arguments_sha256|idempotency_key|result_reference|model_binding|payload|lease_token|email|token)"/)
  const recent=who==='alice'?[201,101,102,103,104,202,203,205,18,17,16,15,14,13,12,11]:[301,302]
  expect(dto.recent_runs.map(r=>r.id)).toEqual(recent.map(id));expect(dto.recent_runs.every(r=>r.title===null&&r.title_source==='not_recorded')).toBe(true)
  expect(dto.action_items.length).toBe(who==='alice'?16:2)
  for(const row of dto.action_items){expect((row.kind==='schedule'?f.ownerSchedules[who]:f.ownerRuns[who]).includes(row.id)).toBe(true);if(row.category==='approval'||row.category==='failed')expect(row.title).toBe(null)}
  expect(dto.action_items.filter(r=>r.category==='approval'&&r.kind==='agent').length).toBe(who==='alice'?8:1)
 }
 const checkUi=async(who,dto)=>{
  await expect(page.getByRole('heading',{name:'内部任务总览',exact:true})).toBeVisible()
  await expect(main()).toContainText('后台 Worker 状态未知');await expect(main()).toContainText('运行记录未保存历史标题，列表已明确标识；后台 Worker 状态暂不可核对。')
  await expect(main()).not.toContainText('尚未配置自动执行 Worker');await expect(main()).not.toContainText(f.privateSentinel);await expect(main()).not.toContainText('CURRENT_WORKFLOW_NAME')
  const keys=[['待审批','awaiting_approval'],['外部写入待核验','writes_need_review'],['已超期计划','schedules_overdue'],['近 7 天失败','failed_7d'],['正在运行','running'],['个人知识库','knowledge_bases']]
  for(const [title,key]of keys)await expect(main().getByRole('link').filter({has:page.getByText(title,{exact:true})}).locator('strong')).toHaveText(String(f.expected[who][key]))
  const recent=section('最近运行').getByRole('link').filter({has:page.getByText('历史标题未记录',{exact:true})})
  await expect(recent).toHaveCount(Math.min(8,dto.recent_runs.length));expect(await recent.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))).toEqual(dto.recent_runs.slice(0,8).map(href))
  if(who==='alice')await expect(section('最近运行')).toContainText('待回复')
  for(const [label,category]of [['待审批','approval'],['待核验','review'],['超期计划','overdue'],['失败记录','failed'],['全部待办',null]]){
   const box=section('需要我处理'),button=box.getByRole('button',{name:label,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true')
   const rows=category?dto.action_items.filter(r=>r.category===category):dto.action_items
   await expect(box.getByRole('link')).toHaveCount(rows.length);expect(await box.getByRole('link').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))).toEqual(rows.map(href))
  }
 }
 const cookie=async()=>{const items=(await context.cookies(f.origin)).filter(r=>r.name==='__Host-agentstudio_session');expect(items).toHaveLength(1);const c=items[0];expect({secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,path:c.path,domain:c.domain}).toEqual({secure:true,httpOnly:true,sameSite:'Strict',path:'/',domain:'localhost'});return c}
 const login=async who=>{
  await page.goto(f.url,{waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email);await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
  const signed=wire('/__pg_native/api/native-auth/login','POST'),me=wire('/__pg_native/api/native-auth/me'),view=wire(originalOverviewPath)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  const [loginResponse,meResponse,viewResponse]=await Promise.all([signed,me,view]),identity=(await meResponse.json()).user,dto=await viewResponse.json()
  expect(identity.id).toBe(f.users[who]);expect(identity.is_admin).toBe(true)
  const h=(await loginResponse.headerValue('set-cookie'))??'';expect(/;\s*Secure(?:;|$)/i.test(h)&&/;\s*HttpOnly(?:;|$)/i.test(h)&&/;\s*SameSite=Strict(?:;|$)/i.test(h)&&/;\s*Path=\/(?:;|$)/i.test(h)&&!/;\s*Domain=/i.test(h)).toBe(true)
  await cookie();checkDto(who,dto);return {identity,dto}
 }
 const logout=async identity=>{
  await page.getByRole('button',{name:new RegExp(identity.display_name)}).click();const ack=wire('/__pg_native/api/native-auth/logout','POST')
  await page.getByRole('menuitem',{name:'退出登录',exact:true}).click();await ack;await expect(page).toHaveURL(f.origin+'/login');expect((await context.cookies(f.origin)).some(c=>c.name==='__Host-agentstudio_session')).toBe(false)
 }
 const image=async(name)=>{expect(originalOverviewArtifacts.includes(name)).toBe(true);const text=await main().innerText();expect(text).not.toMatch(/overviewPrivateNeverExpose|@example\.test|SyntheticAssessment|api_key|checkpoint|result_text|password/);const bytes=await main().screenshot({type:'png'});expect(bytes.length).toBeLessThan(4*1024*1024);images.set(name,bytes)}
 try{
  const output=url.fileURLToPath(new URL('../.tmp/original-internal-overview-genuine-artifacts/',import.meta.url));await fs.mkdir(path.dirname(output),{recursive:true,mode:0o700});expect((await fs.lstat(path.dirname(output))).isSymbolicLink()).toBe(false);await fs.mkdir(output,{recursive:false,mode:0o700});artifactDir=output
  before=await f.businessSnapshot();baseBefore=await f.counts()
  browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]});context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'});observer=await installOriginalLegacyBlockObserver(context)
  await context.route('**/*',async route=>{const origin=new URL(route.request().url()).origin;if(origin!==f.origin){if(outside.length<128)outside.push(origin);else f.observations.overflow=true;await route.abort();return}await route.continue()});await context.routeWebSocket('**/*',socket=>{if(outside.length<128)outside.push('websocket-denied');else f.observations.overflow=true;socket.close()})
  page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000)
  const alice=await login('alice');await checkUi('alice',alice.dto);await image('original-internal-overview-alice.png')
  await f.setDependencyAvailable(false)
  try{
   f.expectNextStatus(503,'alice');const unavailable=wire(originalOverviewPath,'GET',503);await page.getByRole('button',{name:'刷新概览',exact:true}).click();const response=await unavailable;expect(await response.json()).toEqual({error:'original_internal_overview_unavailable'})
   await expect(main().getByRole('alert')).toContainText('个人任务总览暂时不可用，数据未知。');await expect(main().locator('strong')).toHaveCount(0);await expect(main().getByRole('heading',{name:'最近运行',exact:true})).toHaveCount(0);await expect(page).toHaveURL(f.origin+'/internal-overview')
  }finally{await f.setDependencyAvailable(true)}
  const recovered=wire(originalOverviewPath);await main().getByRole('button',{name:'重试',exact:true}).click();const recoveryDto=await(await recovered).json();checkDto('alice',recoveryDto);await checkUi('alice',recoveryDto)
  held=f.holdNextAliceReply();await page.getByRole('button',{name:'刷新概览',exact:true}).click();expect(await held.received).toEqual({status:200,employee:'alice',actual_upstream_response:true});await expect(main().locator('strong')).toHaveCount(0)
  await logout(alice.identity);await expect.poll(()=>f.observations.held_reply_client_closed,{timeout:1500}).toBe(1)
  const bob=await login('bob');held.release();await checkUi('bob',bob.dto)
  // Real APIRequestContext shares only actual server-issued browser Cookies.
  // Expected-Alice is a concurrency mismatch, never a substituted identity.
  f.expectNextStatus(409,'alice')
  const mismatch=await context.request.get(f.origin+originalOverviewPath,{headers:{Origin:f.origin,Accept:'application/json','X-AgentStudio-Expected-Employee':f.users.alice},timeout:8000});expect(mismatch.status()).toBe(409);expect(await mismatch.json()).toEqual({error:'original_internal_overview_employee_changed'})
  const bobRefreshed=wire(originalOverviewPath);await page.getByRole('button',{name:'刷新概览',exact:true}).click();const bobCurrent=await(await bobRefreshed).json();checkDto('bob',bobCurrent);await checkUi('bob',bobCurrent);await image('original-internal-overview-bob.png');await logout(bob.identity)
  await f.assertRestored();stepsCompleted=true
 }catch(error){primary=error}
 finally{
  await clean('release_held_reply',async()=>held?.release());await clean('restore_dependency',()=>f.setDependencyAvailable(true))
  if(observer&&page&&!page.isClosed())await clean('observer_flush',()=>observer.flush(page))
  if(context)await clean('context_close',()=>context.close());if(browser)await clean('browser_close',()=>browser.close())
  if(before)await clean('business_rows_after_browser_close',async()=>{await f.assertRestored();after=await f.businessSnapshot();baseAfter=await f.counts();expect(after).toEqual(before);expect(baseAfter).toEqual(baseBefore)})
  await clean('fixture_close',()=>f.close())
  // Inspect counters only after both browser and backend cleanup, so late
  // failures, forbidden requests and provider activity cannot escape the gate.
  await clean('final_zero_gates',async()=>{
   expect(observer?.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false});expect(outside).toEqual([]);for(const key of ['legacy_backend_requests','unexpected_api_failures','blocked_requests'])expect(f.observations[key]).toEqual([])
   expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.overflow).toBe(false);expect(f.pendingExpectedStatus()).toBe(false);expect(f.observations.expected_failures.map(r=>[r.status,r.expected_employee,r.actual_upstream_response])).toEqual([[503,'alice',true],[409,'alice',true]])
   expect(f.observations.held_reply_received).toBe(1);expect(f.observations.held_reply_released).toBe(1);expect(f.observations.held_reply_client_closed).toBe(1);expect(f.observations.held_reply_timed_out).toBe(0);expect(f.providerRequests.length).toBe(0);expect(f.credentialReads()).toBe(0);f.assertNoProviderErrors()
  })
  let observation={format:'original_personal_overview_hosted_observation_v1',scope:'actual original /internal-overview personal owner page only',head:permit.head,steps_completed:stepsCompleted,failed:Boolean(primary||cleanup.length),actual_build:f.provenance,backend_profile:f.backendProfile,business_rows_before:before??null,business_rows_after:after??null,base_before:baseBefore??null,base_after:baseAfter??null,business_snapshot_excludes:'agentstudio_auth account/session rows deliberately change through actual login/logout; all agentstudio business/private/audit row images are included',legacy_blocks:observer?.snapshot()??null,http:f.observations,blocked_origins:outside,provider_requests:f.providerRequests.length,credential_reads:f.credentialReads(),cleanup_failures:cleanup.map(x=>x.label),screenshots_written_only_after_success:true,company_CT03_used:false,linked_pages_accepted:false,Worker_runtime_accepted:false,historical_run_titles_available:false,actual_employee_UAT:0,qualifying_24h:0,production_GO:false}
  // Hard artifact bound. An oversized observation fails before saving any PNG;
  // the fallback is explicitly failure DATA, never a success or acceptance.
  if(Buffer.byteLength(JSON.stringify(observation,null,2))>1048576-4096){cleanup.push({label:'observation_size_bound',error:Error('original_overview_observation_size_bound')});observation={format:'original_personal_overview_hosted_observation_v1',head:permit.head,steps_completed:false,failed:true,observation_overflow:true,actual_employee_UAT:0,qualifying_24h:0,production_GO:false}}
  if(!primary&&!cleanup.length&&stepsCompleted)for(const [name,bytes]of images)await clean('write_'+name,()=>fs.writeFile(path.join(artifactDir,name),bytes,{flag:'wx',mode:0o600}))
  for(const bytes of images.values())bytes.fill(0)
  observation.failed=Boolean(primary||cleanup.length);observation.cleanup_failures=cleanup.map(x=>x.label)
  if(artifactDir)await clean('write_observation',()=>fs.writeFile(path.join(artifactDir,'original-internal-overview-observation.json'),JSON.stringify(observation,null,2),{flag:'wx',mode:0o600}))
 }
 if(primary||cleanup.length)throw new AggregateError([...(primary?[primary]:[]),...cleanup.map(r=>r.error)],'original_overview_story_failed')
})
