import {test,expect,chromium} from '@playwright/test'
import {requireOriginalLoginBrowserCi} from './helpers/pg-original-login-browser-guard.mjs'
import {startOriginalLoginGenuineBrowserFixture} from './helpers/pg-original-login-genuine-browser-fixture.mjs'
import {installOriginalLegacyBlockObserver} from './helpers/pg-original-login-legacy-observer.mjs'
import {requireOriginalLoginHome071Ci} from '../services/pg-api/tests/helpers/original-login-home071-ci-guard.mjs'
import {requireOriginalMonitor073BrowserCi} from './helpers/pg-original-monitor073-browser-guard.mjs'

test('original Login/App: actual PG18 Cookie roles, logout revocation, transient recovery and local return paths',async({},testInfo)=>{
  requireOriginalLoginBrowserCi() // FIRST effectful gate: hosted synthetic CI only.
  requireOriginalLoginHome071Ci() // Unchanged actual071 predecessor admission.
  requireOriginalMonitor073BrowserCi() // Additional073 metadata purpose before effects.
  const fs=await import('node:fs/promises')
  const f=await startOriginalLoginGenuineBrowserFixture()
  let browser,context,page,primary,before,after,legacyBlocks,authStepsCompleted=false
  const outside=[],roleChecks=[],cleanupFailures=[]
  const clean=async(label,work)=>{try{await work()}catch(error){cleanupFailures.push({label,error})}}
  const mePath='/__pg_native/api/native-auth/me',loginPath='/__pg_native/api/native-auth/login',logoutPath='/__pg_native/api/native-auth/logout'
  const wire=(path,method,status)=>page.waitForResponse(response=>
    new URL(response.url()).pathname===path&&response.request().method()===method&&
    (status===undefined||response.status()===status))
  const cookie=async()=>{
    const found=(await context.cookies(f.origin)).filter(item=>item.name==='__Host-agentstudio_session')
    expect(found.length,'one actual server-issued session Cookie').toBe(1)
    const item=found[0]
    expect(item.secure&&item.httpOnly&&item.sameSite==='Strict'&&item.path==='/'&&item.domain==='localhost',
      'host-only Secure HttpOnly Strict Cookie attributes').toBe(true)
    return item
  }
  const accountMenu=async displayName=>{
    const menu=page.getByRole('menu')
    if(!await menu.isVisible())await page.getByRole('button',{name:new RegExp(displayName)}).click()
    await expect(menu).toBeVisible();return menu
  }
  const login=async(who,next)=>{
    await page.goto(f.origin+'/login?next='+encodeURIComponent(next),{waitUntil:'domcontentloaded'})
    const button=page.getByRole('button',{name:'登录',exact:true})
    await expect(button).toBeEnabled()
    await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email)
    await page.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
    const loginReply=wire(loginPath,'POST'),meReply=wire(mePath,'GET',200)
    await button.click()
    const [signed,me]=await Promise.all([loginReply,meReply])
    expect(signed.status(),'actual original-form Native login').toBe(200)
    const header=(await signed.headerValue('set-cookie'))??''
    expect(/(?:^|;)\s*__Host-agentstudio_session=/.test(header)&&/;\s*Secure(?:;|$)/i.test(header)&&
      /;\s*HttpOnly(?:;|$)/i.test(header)&&/;\s*SameSite=Strict(?:;|$)/i.test(header)&&
      /;\s*Path=\/(?:;|$)/i.test(header)&&!/;\s*Domain=/i.test(header),
      'actual login Set-Cookie attributes, without logging the value').toBe(true)
    const data=await me.json(),profile=data.user
    expect(data.authenticated).toBe(true);expect(profile.id).toBe(f.users[who])
    expect(profile.is_admin).toBe(who==='alice')
    await expect(page.getByRole('textbox',{name:'工作邮箱',exact:true})).toHaveCount(0)
    const menu=await accountMenu(profile.display_name)
    await expect(menu).toContainText(profile.email)
    await expect(menu.getByRole('menuitem',{name:who==='alice'?'员工与权限':'修改密码',exact:true})).toBeVisible()
    roleChecks.push({employee:who,uuid_matches_actual_seed:true,is_admin:profile.is_admin})
    return {profile,cookie:await cookie()}
  }
  const logout=async profile=>{
    const issued=await cookie(),menu=await accountMenu(profile.display_name),ack=wire(logoutPath,'POST')
    await menu.getByRole('menuitem',{name:'退出登录',exact:true}).click()
    expect((await ack).status(),'server logout acknowledgement before navigation').toBe(200)
    await expect(page).toHaveURL(f.origin+'/login')
    await expect(page.getByRole('button',{name:'登录',exact:true})).toBeEnabled()
    expect((await context.cookies(f.origin)).some(item=>item.name==='__Host-agentstudio_session')).toBe(false)
    // Negative replay of the real issued token, only in Node memory and strict TLS.
    expect(await f.probeRevokedCookie(issued.value),'actual server session revoked, not merely browser clear').toBe(401)
  }
  try{
    expect(f.backendProfile).toMatchObject({format:'agentstudio.original-home-monitor073.metadata.fixture.v1',
      profile:'original-home-monitor073-metadata',story:'original-login',head:process.env.GITHUB_SHA,
      monitor073_version:'pg_v9_073',monitor073_catalog_verified:true,monitor073_seeded_nonempty:true,
      predecessor_profile:'original-login-home071',full_monitor_pipeline_complete:false,synthetic_only:true,production_GO:false})
    expect(f.backendProfile.predecessor).toMatchObject({format:'agentstudio.original-login-home071.fixture.v1',
      profile:'original-login-home071',head:process.env.GITHUB_SHA,catalog_profile:'original-agent-catalog071',
      fresh_F01_service_required:true,predecessor_source_and_catalog_verified:true,
      complete069_original_initializer_verified:false,optional070_verified:true,optional071_verified:true,
      own_operations_schema_verified:true,configuration_writes:false,Native_server_process_entry_verified:false,
      monitor073_installed:false,production_GO:false})
    before=await f.counts()
    expect(f.spki).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]})
    context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
    legacyBlocks=await installOriginalLegacyBlockObserver(context)
    await context.route('**/*',async route=>{
      const origin=new URL(route.request().url()).origin
      if(origin!==f.origin){if(outside.length<128)outside.push(origin);else f.observations.overflow=true;await route.abort();return}
      // Same-origin PB requests reach the rejecting host and are counted there.
      await route.continue()
    })
    await context.routeWebSocket('**/*',socket=>socket.close())
    page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000)
    let alice
    await test.step('original form, real admin Cookie and normal local query/hash',async()=>{
      await page.goto(f.url,{waitUntil:'domcontentloaded'})
      await expect(page.getByRole('heading',{name:'Agent Studio',exact:true})).toBeVisible()
      await expect(page.getByRole('button',{name:'登录',exact:true})).toBeEnabled()
      await page.screenshot({path:testInfo.outputPath('original-login-form.png'),fullPage:true})
      alice=await login('alice','/?from=original-login#account')
      await expect(page).toHaveURL(f.origin+'/?from=original-login#account')
      await page.screenshot({path:testInfo.outputPath('original-app-admin-account.png'),fullPage:true})
      const values=await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)])
      expect(values.some(value=>typeof value==='string'&&value.includes(alice.cookie.value)),
        'HttpOnly Cookie is never put into script-readable storage').toBe(false)
    })
    await test.step('real transport interruption uses the original AuthGate unavailable page and identity retry',async()=>{
      const logoutCount=f.observations.auth_http.filter(row=>row.path===logoutPath&&row.method==='POST').length
      const currentUrl=page.url()
      f.setMeUnavailable(true)
      try{
        await page.reload({waitUntil:'domcontentloaded'})
        await expect(page.getByRole('heading',{name:'暂时无法验证员工登录状态',exact:true})).toBeVisible()
        await expect(page.getByRole('button',{name:'重试身份验证',exact:true})).toBeEnabled()
        await expect(page.getByRole('textbox',{name:'工作邮箱',exact:true})).toHaveCount(0)
        await expect(page.getByRole('menu')).toHaveCount(0)
        await expect(page).toHaveURL(currentUrl)
        expect((await cookie()).value===alice.cookie.value,'transient failure retains the original Cookie').toBe(true)
        expect(f.observations.auth_http.filter(row=>row.path===logoutPath&&row.method==='POST').length).toBe(logoutCount)
      }finally{f.setMeUnavailable(false)}
      const recovered=wire(mePath,'GET',200)
      await page.getByRole('button',{name:'重试身份验证',exact:true}).click()
      const me=await recovered;expect((await me.json()).user.id).toBe(f.users.alice)
      await expect(page).toHaveURL(currentUrl)
      await expect(page.getByRole('heading',{name:'暂时无法验证员工登录状态',exact:true})).toHaveCount(0)
      expect((await cookie()).value===alice.cookie.value,'recovery uses the same server session').toBe(true)
      await accountMenu(alice.profile.display_name)
      expect(f.observations.injected_me_disconnects).toBeGreaterThan(0)
    })
    await test.step('original logout really revokes the session and the protected original route stays closed',async()=>{
      const issued=await cookie(),menu=await accountMenu(alice.profile.display_name)
      const logoutCount=f.observations.auth_http.filter(row=>row.path===logoutPath&&row.method==='POST').length
      const currentUrl=page.url()
      f.setLogoutUnavailable(true)
      try{
        await menu.getByRole('menuitem',{name:'退出登录',exact:true}).click()
        await expect(menu.getByRole('alert')).toHaveText('退出尚未确认，请检查网络后重试。')
        await expect(menu.getByRole('menuitem',{name:'退出登录',exact:true})).toBeEnabled()
        await expect(page).toHaveURL(currentUrl)
        expect((await cookie()).value===issued.value,'failed revoke retains the issued Cookie').toBe(true)
        expect(f.observations.auth_http.filter(row=>row.path===logoutPath&&row.method==='POST').length).toBe(logoutCount)
        expect(f.observations.injected_logout_disconnects).toBeGreaterThan(0)
        await page.screenshot({path:testInfo.outputPath('original-account-logout-retry.png'),fullPage:true})
      }finally{f.setLogoutUnavailable(false)}
      // The unchanged original menu retries the actual Promise-returning facade.
      await logout(alice.profile)
      await page.goto(f.origin+'/?afterLogout=protected',{waitUntil:'domcontentloaded'})
      await expect(page.getByRole('button',{name:'登录',exact:true})).toBeEnabled()
      expect(new URL(page.url()).pathname).toBe('/login')
      expect(f.observations.auth_http.some(row=>row.path===mePath&&row.status===401)).toBe(true)
    })
    await test.step('actual employee role and malicious normalized next remain on the original local App',async()=>{
      const bob=await login('bob','/\\foreign.example')
      await expect(page).toHaveURL(f.origin+'/')
      expect(bob.profile.is_admin).toBe(false)
      await page.screenshot({path:testInfo.outputPath('original-app-employee-account.png'),fullPage:true})
      await logout(bob.profile)
    })
    authStepsCompleted=true
    after=await f.counts()
    expect(after,'auth story does not mutate business ledgers or run models').toEqual(before)
    expect(f.providerRequests.length).toBe(0);expect(f.credentialReads()).toBe(0);f.assertNoProviderErrors()
    expect(outside).toEqual([])
    expect(f.observations.forbidden_auth_headers).toBe(0)
    expect(f.observations.overflow).toBe(false)
    await legacyBlocks.flush(page)
    expect.soft(legacyBlocks.snapshot(),
      'Home/backend migration gap: local PB blocks count even with zero PB network traffic').toEqual({event_count_capped_129:0,codes:[],overflow:false})
    // Every remaining Home/backend migration gap remains a real failure here.
    expect.soft(f.observations.legacy_backend_requests,
      'Home/backend migration gap: no PB/OIDC request may be hidden or substituted').toEqual([])
    expect.soft(f.observations.unexpected_api_failures,
      'Home/backend must use actual Native handlers; no fake DTO or ignored refusal').toEqual([])
    expect.soft(f.observations.blocked_requests,'unknown API/assets must not silently become SPA success').toEqual([])
  }catch(error){primary=error}
  finally{
    f.setMeUnavailable(false)
    f.setLogoutUnavailable(false)
    if(page&&!page.isClosed()&&(primary||testInfo.errors.length))
      await clean('synthetic_original_page_failure_image',()=>page.screenshot({path:testInfo.outputPath('original-login-failure.png'),fullPage:true}))
    if(legacyBlocks&&page&&!page.isClosed())await clean('local_legacy_block_observer_flush',()=>legacyBlocks.flush(page))
    if(context)await clean('browser_context_close',()=>context.close())
    if(browser)await clean('browser_close',()=>browser.close())
    await clean('genuine_fixture_close',()=>f.close())
    const observation={scope:'hosted synthetic original Login/App authentication only',
      auth_steps_completed:authStepsCompleted,browser_story_has_failures:Boolean(primary||testInfo.errors.length||cleanupFailures.length),
      actual_build:f.provenance,actual_backend:f.backendProfile,roles:roleChecks,http:f.observations,blocked_origins:outside,
      local_legacy_backend_blocks:legacyBlocks?.snapshot()??null,
      business_counts_before:before??null,business_counts_after:after??null,
      provider_requests:f.providerRequests.length,cleanup_failures:cleanupFailures.map(item=>item.label),
      home_business_complete:false,original_menu_complete:false,employee_UAT:0,qualifying_24h:0,production_GO:false}
    await clean('bounded_safe_observation_write',()=>fs.writeFile(testInfo.outputPath('original-login-observation.json'),JSON.stringify(observation,null,2)))
  }
  if(primary&&cleanupFailures.length)throw new AggregateError([primary,...cleanupFailures.map(item=>item.error)],'original_login_story_and_cleanup_failed')
  if(primary)throw primary
  if(cleanupFailures.length)throw new AggregateError(cleanupFailures.map(item=>item.error),'original_login_story_cleanup_failed')
})
