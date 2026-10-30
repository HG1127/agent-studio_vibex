import {test,expect,chromium} from '@playwright/test'
import {requireOriginalModelConnectionsBrowserCi} from './helpers/pg-original-model-connections-browser-guard.mjs'
import {startOriginalModelConnectionsBrowserFixture} from './helpers/pg-original-model-connections-browser-fixture.mjs'
import {installOriginalLegacyBlockObserver} from './helpers/pg-original-login-legacy-observer.mjs'
import {originalModelConnectionsDomSafety,originalModelConnectionsImageBuffer,originalModelConnectionsObservationBytes} from './helpers/pg-original-model-connections-artifacts.mjs'

test('original ModelConnections: real encrypted metadata CRUD, owner/CAS/audit, late account fence and unknown-write read-only recovery',async({},testInfo)=>{
 const permit=requireOriginalModelConnectionsBrowserCi() // Before files/SQL/TLS/browser.
 const fs=await import('node:fs/promises'),f=await startOriginalModelConnectionsBrowserFixture()
 let browser,context,page,observer,primary,before,after,normalAudit,paginationProof,completed=false,webSockets=0,paginationSeeded=false,pageReads=0
 const images=[],holds=[],outside=[],cleanup=[],mutations=[],proofs=[],steps={}
 const keys=['synthetic-original-page-key-0005','synthetic-original-page-key-0006']
 const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 try{
  expect(f.backendProfile).toMatchObject({profile:permit.profile,head:permit.head,actual_F01_fixture:true,optional070_verified:true,optional071_verified:true,own_operations_verified:true,complete069_original_initializer_verified:false,Native_server_process_entry_verified:false,production_GO:false})
  before=await f.modelCounts();f.assertNoModelEffects()
  browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]})
  context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'});observer=await installOriginalLegacyBlockObserver(context)
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.origin){if(outside.length<128)outside.push('outside_origin');else f.observations.overflow=true;await route.abort();return}await route.continue()})
  await context.routeWebSocket('**/*',socket=>{webSockets=Math.min(129,webSockets+1);if(webSockets===129)f.observations.overflow=true;socket.close()})
  const preparePage=async()=>{const p=await context.newPage();p.setDefaultTimeout(15000);p.setDefaultNavigationTimeout(20000)
   p.on('request',request=>{const url=new URL(request.url()),path=url.pathname;if(path==='/__pg_native/api/v2/model-connections'&&request.method()==='GET'&&url.searchParams.has('paging'))pageReads++;if(path.startsWith('/__pg_native/api/v2/model-connections')&&request.method()!=='GET'){
    if(mutations.length>=64){f.observations.overflow=true;return}
    // Only metadata-only PATCH bodies are retained privately for the CAS probe.
    // Create/password bodies, Cookie and credential headers are never recorded.
    const body=request.method()==='PATCH'?JSON.parse(request.postData()??'null'):null
    mutations.push({path,method:request.method(),body})
   }});return p}
  page=await preparePage()
  const wire=(p,path,method)=>p.waitForResponse(response=>new URL(response.url()).pathname==='/__pg_native'+path&&response.request().method()===method)
  const modelPath='/api/v2/model-connections'
  const settled=async p=>{await expect(p.getByText('已读取本人配置；当前环境只允许查看。保存和测试均不会自动发起。',{exact:true})).toHaveCount(0);await expect(p.getByRole('heading',{name:/接入你自己的模型服务/})).toBeVisible();await expect.poll(async()=>p.getByRole('button',{name:'重新测试',exact:true}).count()).toBeGreaterThan(0)}
  const login=async(p,who)=>{
   await p.goto(f.url,{waitUntil:'domcontentloaded'});await p.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email);await p.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
   const response=wire(p,'/api/native-auth/login','POST');await p.getByRole('button',{name:'登录',exact:true}).click();expect((await response).status()).toBe(200);await expect(p).toHaveURL(f.origin+'/model-connections');await settled(p)
   const cookies=(await context.cookies(f.origin)).filter(value=>value.name==='__Host-agentstudio_session');expect(cookies.length).toBe(1);expect(cookies[0].secure&&cookies[0].httpOnly&&cookies[0].sameSite==='Strict'&&cookies[0].domain==='localhost'&&cookies[0].path==='/', 'actual Secure HttpOnly Strict host-only Cookie').toBe(true)
  }
  const logout=async(p,who)=>{const menu=p.getByRole('menu');if(!await menu.isVisible())await p.getByRole('button',{name:new RegExp(f.profiles[who].display_name)}).click();const response=wire(p,'/api/native-auth/logout','POST');await menu.getByRole('menuitem',{name:'退出登录',exact:true}).click();expect((await response).status()).toBe(200);await expect(p).toHaveURL(f.origin+'/login')}
  const card=(p,name)=>p.getByRole('heading',{name,exact:true}).locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " rounded-2xl ")][1]')
  const openAdd=async(p,name,key)=>{await p.getByRole('button',{name:'添加连接',exact:true}).first().click();await p.locator('#mc-name').fill(name);await p.locator('#mc-base-url').fill('https://api.openai.com/v1');await p.locator('#mc-api-key').fill(key);await p.locator('#mc-manual-models').fill('synthetic-one, synthetic-two')}
  const noProbe=async p=>{expect(await p.getByRole('button',{name:'重新测试',exact:true}).evaluateAll(buttons=>buttons.every(button=>button.disabled)),'automatic story keeps provider probes closed').toBe(true);expect(mutations.filter(row=>row.path.endsWith('/probe'))).toHaveLength(0);f.assertNoModelEffects()}
  const image=async(name,p)=>{
   await expect(p.locator('input[type="password"]')).toHaveCount(0)
   const sample=await p.evaluate(()=>({text:document.body.innerText,values:[...document.querySelectorAll('input,textarea')].map(e=>e.value),passwordInputs:document.querySelectorAll('input[type="password"]').length}))
   const secrets=[...keys,f.credentials.alice.password,f.credentials.bob.password,...(await context.cookies(f.origin)).map(v=>v.value).filter(v=>v.length>=8)],safety=originalModelConnectionsDomSafety(sample,secrets)
   expect(safety,'fixed synthetic screenshot gate exposes only booleans').toEqual({bounded:true,password_absent:true,secret_absent:true,credential_markers_absent:true});expect(images.some(row=>row.name===name)).toBe(false)
   images.push(originalModelConnectionsImageBuffer(name,await p.screenshot({fullPage:true}),safety))
  }
  let created
  await test.step('original add/edit/enable controls store actual owner encrypted configuration without a provider request',async()=>{
   const seeded=await f.seedPaginationRows();paginationSeeded=true
    await login(page,'alice');await noProbe(page)
    await expect(page.getByRole('heading',{name:seeded.last_page_original_name,exact:true})).toHaveCount(1)
    expect(pageReads).toBeGreaterThanOrEqual(6)
    const removed=await f.cleanupPaginationRows();paginationSeeded=false;expect(removed).toEqual({removed_rows:251,remaining_seed_rows:0})
    await page.reload({waitUntil:'domcontentloaded'});await settled(page);await noProbe(page)
    await expect(page.getByRole('heading',{name:/^Original pagination synthetic Alice /})).toHaveCount(0)
    before=await f.modelCounts();paginationProof={...seeded,...removed,actual_original_page_reads_at_least_six:true,oldest_owned_row_reached:true,all_temporary_configuration_rows_removed_before_images:true};steps.large_account_pagination=true
   await expect(page.getByRole('heading',{name:f.resources.bob.model.name,exact:true})).toHaveCount(0)
   await openAdd(page,'Original page synthetic Alice connection',keys[0]);await expect(page.getByRole('button',{name:'测试连接',exact:true})).toBeDisabled()
   const createdWire=wire(page,modelPath,'POST');await page.getByRole('button',{name:'保存',exact:true}).click();const createdResponse=await createdWire;expect(createdResponse.status()).toBe(201);created=(await createdResponse.json()).item
   expect(created.owner_user_id).toBe(f.users.alice);expect(created.revision).toBe(1);expect(created.status).toBe('untested');expect(created.api_key_tail).toBe('0005');expect(Object.hasOwn(created,'api_key')).toBe(false);await expect(page.locator('#mc-api-key')).toHaveCount(0)
   const actual=await f.modelFor('alice',created.id);expect(actual.id).toBe(created.id);expect(await f.modelFor('bob',created.id)).toBeNull()
   await card(page,created.name).getByRole('button',{name:'编辑',exact:true}).click();await expect(page.locator('#mc-api-key')).toHaveValue('');await page.locator('#mc-name').fill('Original page synthetic Alice edited')
   const editWire=wire(page,modelPath+'/'+created.id,'PATCH');await page.getByRole('button',{name:'保存',exact:true}).click();const editedResponse=await editWire;expect(editedResponse.status()).toBe(200);const edited=(await editedResponse.json()).item;expect(edited.revision).toBe(2);expect(edited.api_key_tail).toBe('0005');await expect(page.locator('#mc-api-key')).toHaveCount(0)
   const switchWire=wire(page,modelPath+'/'+created.id,'PATCH');await card(page,edited.name).getByRole('switch',{name:edited.name+'启用开关',exact:true}).click();expect((await switchWire).status()).toBe(200);await expect(card(page,edited.name).getByText('已停用',{exact:true})).toBeVisible()
   const stored=await f.modelFor('alice',created.id);expect(stored.enabled).toBe(false);expect(stored.revision).toBe(3);expect(stored.models).toEqual(['synthetic-one','synthetic-two']);expect(stored.status).toBe('untested')
   await noProbe(page);await image('original-model-connections-alice-metadata.png',page);steps.original_encrypted_metadata_save_update_switch=true
  })
  await test.step('actual Native owner and CAS refusals leave all metadata/audit counts unchanged; original confirm-delete uses strict selected revision',async()=>{
   const baseline=await f.modelCounts(),earlier=mutations.find(row=>row.method==='PATCH')
   expect(earlier.body.expected_revision).toBe(1);expect(Object.hasOwn(earlier.body,'api_key')).toBe(false)
   const stale=await f.request('alice',modelPath+'/'+created.id,'PATCH',earlier.body,f.users.alice);expect(stale.status).toBe(409)
   const foreign=await f.request('bob',modelPath+'/'+created.id);expect([403,404]).toContain(foreign.status);expect(foreign.body.item).toBeUndefined()
   const changed=await f.request('bob',modelPath,'POST',{name:'Synthetic rejected owner race',provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-owner-condition-never-provider-0007',models:['synthetic'],enabled:true},f.users.alice);expect(changed.status).toBe(409);expect(changed.body.error).toBe('employee_session_changed')
   expect(await f.modelCounts()).toEqual(baseline);f.assertNoModelEffects();proofs.push({stale_CAS_status:stale.status,foreign_owner_status:foreign.status,expected_employee_status:changed.status,actual_Cookie_owner_checks:true,metadata_and_audit_counts_unchanged:true})
   const current=await f.modelFor('alice',created.id),selected=card(page,current.name);await selected.getByRole('button',{name:'删除',exact:true}).click()
   const deleteWire=wire(page,modelPath+'/'+created.id,'DELETE');await selected.getByRole('button',{name:'确认删除',exact:true}).click();expect((await deleteWire).status()).toBe(200);await expect(page.getByRole('heading',{name:current.name,exact:true})).toHaveCount(0)
   expect(await f.modelFor('alice',created.id)).toBeNull();normalAudit=await f.modelAudit('alice',created.id);expect(normalAudit.count).toBe(4);expect(normalAudit.actual_owner_audit_verified&&normalAudit.sensitive_fields_absent).toBe(true)
   expect(normalAudit.entries).toEqual([{action:'model.connection_create',revision:1},{action:'model.connection_delete',revision:3},{action:'model.connection_disable',revision:3},{action:'model.connection_update',revision:2}])
   expect((await f.modelCounts()).connections).toBe(before.connections);steps.original_delete_owner_CAS_audit=true
  })
  await test.step('actual held old-owner metadata cannot reopen a form after the original account menu switches employees',async()=>{
   const source=f.resources.alice.model,gate=f.holdNextActualConnection(source.id);holds.push(gate);const started=Date.now()
   await card(page,source.name).getByRole('button',{name:'编辑',exact:true}).click();expect((await gate.entered()).status).toBe(200);await expect(page.locator('#mc-api-key')).toHaveCount(0)
   const other=await preparePage();await other.goto(f.origin+'/model-connections',{waitUntil:'domcontentloaded'});await settled(other);await logout(other,'alice');await login(other,'bob');expect(Date.now()-started,'account switch stays inside the unchanged8s Native budget').toBeLessThan(6500)
   await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('heading',{name:source.name,exact:true})).toHaveCount(0);await expect(page.locator('#mc-api-key')).toHaveCount(0)
   gate.release();await expect(page.locator('#mc-api-key')).toHaveCount(0);await expect(page.getByRole('heading',{name:source.name,exact:true})).toHaveCount(0)
   await observer.flush(other);await other.close();await page.reload({waitUntil:'domcontentloaded'});await settled(page);await expect(page.getByRole('heading',{name:f.resources.bob.model.name,exact:true})).toBeVisible();steps.late_actual_metadata_account_fence=true
  })
  await test.step('actual committed Bob create loses its response; same original control and reload read only and never invent a receipt',async()=>{
   await openAdd(page,'Original page synthetic Bob unknown create',keys[1]);f.dropNextActualCreateReply()
   // The real fetch may remain pending until its unchanged8s Native deadline.
   // Observe its actual failure before checking the settled recovery control.
   const failedCreate=page.waitForEvent('requestfailed',{predicate:request=>request.method()==='POST'&&new URL(request.url()).pathname==='/__pg_native/api/v2/model-connections',timeout:8000});void failedCreate.catch(()=>{})
   await page.getByRole('button',{name:'保存',exact:true}).click();await failedCreate
   await expect(page.getByRole('button',{name:'核对原操作结果',exact:true})).toBeEnabled();await expect(page.locator('#mc-api-key')).toHaveValue('')
   const recorded=await f.modelCounts();expect(recorded.connections).toBe(before.connections+1);expect(mutations.filter(row=>row.method==='POST')).toHaveLength(2)
   await page.getByRole('button',{name:'核对原操作结果',exact:true}).click();await expect(page.getByRole('button',{name:'核对原操作结果',exact:true})).toBeEnabled();expect(await f.modelCounts()).toEqual(recorded)
   await page.reload({waitUntil:'domcontentloaded'});await settled(page);await page.getByRole('button',{name:'添加连接',exact:true}).first().click();await expect(page.getByRole('button',{name:'核对原操作结果',exact:true})).toBeEnabled();await expect(page.locator('#mc-api-key')).toBeDisabled();await page.getByRole('button',{name:'核对原操作结果',exact:true}).click();await expect(page.getByRole('button',{name:'核对原操作结果',exact:true})).toBeEnabled()
   expect(mutations.filter(row=>row.method==='POST')).toHaveLength(2);expect(await f.modelCounts()).toEqual(recorded);await page.getByRole('button',{name:'关闭表单',exact:true}).click();await expect(page.locator('#mc-api-key')).toHaveCount(0)
   await expect(page.getByRole('heading',{name:'Original page synthetic Bob unknown create',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:f.resources.alice.model.name,exact:true})).toHaveCount(0);await noProbe(page);await image('original-model-connections-bob-unknown.png',page)
   steps.unknown_write_preserved_and_no_replay=true;steps.exact_unknown_receipt_recovery_complete=false
  })
  after=await f.modelCounts();expect(after.connections).toBe(before.connections+1);expect(after.model_audit).toBe(before.model_audit+5);expect(f.observations.controlled_after_commit_disconnects).toBe(1);expect(f.observations.held_actual_responses).toBe(1)
  await observer.flush(page);expect(observer.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false});expect(outside).toEqual([]);expect(webSockets).toBe(0);expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.overflow).toBe(false)
  expect(f.observations.legacy_backend_requests).toEqual([]);expect(f.observations.unexpected_api_failures).toEqual([]);expect(f.observations.blocked_requests).toEqual([]);f.assertNoModelEffects();expect(images).toHaveLength(2);completed=true
 }catch(error){primary=error}
 finally{
  for(const hold of holds)hold.release()
   if(paginationSeeded)await clean('large_account_seed_cleanup',()=>f.cleanupPaginationRows())
  if(observer&&page&&!page.isClosed())await clean('legacy_observer_flush',()=>observer.flush(page))
  if(context)await clean('browser_context_close',()=>context.close());if(browser)await clean('browser_close',()=>browser.close());await clean('genuine_fixture_close',()=>f.close())
   await clean('final_zero_after_cleanup',async()=>{
    for(const key of ['legacy_backend_requests','unexpected_api_failures','blocked_requests'])expect(f.observations[key]).toEqual([])
    expect(outside).toEqual([]);expect(webSockets).toBe(0);expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.overflow).toBe(false)
    expect(observer?.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false});f.assertNoModelEffects()
    if(completed){expect(f.observations.controlled_after_commit_disconnects).toBe(1);expect(f.observations.held_actual_responses).toBe(1)}
   })
  const success=completed&&!primary&&!testInfo.errors.length&&!cleanup.length
  if(success)for(const image of images)await clean('fixed_success_image_write',()=>fs.writeFile(testInfo.outputPath(image.name),image.bytes,{flag:'wx'}))
  const observation={scope:'hosted synthetic original ModelConnections metadata CRUD only; provider probe closed',story_completed:success&&!cleanup.length,steps,head:permit.head,actual_backend:f.backendProfile,actual_build:f.provenance,http:f.observations,owner_CAS_proofs:proofs,large_account_pagination:paginationProof??null,normal_metadata_audit:normalAudit??null,metadata_before:before??null,metadata_after:after??null,local_PB_blocks:observer?.snapshot()??null,outside_origins:outside.length,websocket_attempts:webSockets,page_model_credential_reads:f.pageModelCredentialReads(),F01_runtime_credential_reads:f.credentialReads(),provider_posts:f.providerRequests.length,paid_external_provider_calls:0,cleanup_failures:cleanup.map(row=>row.label),exact_unknown_receipt_recovery_complete:false,unsaved_form_provider_test_complete:false,model_discovery_complete:false,large_account_paging_complete:success&&!cleanup.length&&steps.large_account_pagination===true,all_original_pages_complete:false,employee_UAT:0,qualifying_24h:0,production_GO:false}
   await clean('bounded_observation_write',()=>fs.writeFile(testInfo.outputPath('original-model-connections-observation.json'),originalModelConnectionsObservationBytes(observation),{flag:'wx'}));for(const image of images)image.bytes.fill(0);images.length=0;mutations.length=0
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup.map(row=>row.error)],'original_model_connections_story_and_cleanup_failed');if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup.map(row=>row.error),'original_model_connections_cleanup_failed')
})
