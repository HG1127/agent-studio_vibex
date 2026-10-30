import {test,expect,chromium} from '@playwright/test'
import {requireOriginalHomeDesignBrowserCi} from './helpers/pg-original-home-design-browser-guard.mjs'
import {startOriginalHomeDesignBrowserFixture} from './helpers/pg-original-home-design-browser-fixture.mjs'
import {installOriginalLegacyBlockObserver} from './helpers/pg-original-login-legacy-observer.mjs'
import {originalHomeDesignDomSafety,originalHomeDesignImageBuffer,originalHomeDesignObservationBytes} from './helpers/pg-original-home-design-artifacts.mjs'

test('original Home: genuine generation, exact unknown intent recovery, manual070071 save, revision and late-account fences',async({},testInfo)=>{
 const permit=requireOriginalHomeDesignBrowserCi() // Before fixture/SQL/TLS/browser.
 const fs=await import('node:fs/promises'),f=await startOriginalHomeDesignBrowserFixture()
 let browser,context,page,observer,primary,before,after,webSockets=0,completed=false
 const outside=[],cleanup=[],holds=[],images=[],httpBodies=[],steps={},negativeProofs=[]
 const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 try{
  expect(f.backendProfile).toMatchObject({profile:permit.profile,head:permit.head,actual_F01_fixture:true,optional070_verified:true,optional071_verified:true,configuration_writes:true,F01_audit_after_optional_catalog_verified:true,complete069_original_initializer_verified:false,Native_server_process_entry_verified:false,production_GO:false})
  before=await f.counts();expect(f.providerRequests).toHaveLength(0);expect(f.credentialReads()).toBe(0)
  browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]})
  context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'})
  observer=await installOriginalLegacyBlockObserver(context)
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.origin){if(outside.length<128)outside.push('outside_origin');else f.observations.overflow=true;await route.abort();return}await route.continue()})
  await context.routeWebSocket('**/*',socket=>{webSockets=Math.min(129,webSockets+1);if(webSockets===129)f.observations.overflow=true;socket.close()})
  const preparePage=async()=>{
   const p=await context.newPage();p.setDefaultTimeout(15000);p.setDefaultNavigationTimeout(20000)
   p.on('dialog',dialog=>{if(['beforeunload','confirm'].includes(dialog.type()))void dialog.accept();else void dialog.dismiss()})
   p.on('request',req=>{const route=new URL(req.url()).pathname
    if(['POST','PATCH'].includes(req.method())&&(/\/agent-design\/(?:submit|confirm)$/.test(route)||/\/original-ui\/agent-specs(?:\/[^/]+)?$/.test(route))){
     if(httpBodies.length>=64){f.observations.overflow=true;return}
     const body=req.postData();if(typeof body!=='string'||body.length>262144){f.observations.overflow=true;return}
     httpBodies.push({method:req.method(),path:route,body})
    }
   });return p
  }
  page=await preparePage()
  const wire=(p,path,method)=>p.waitForResponse(response=>new URL(response.url()).pathname==='/__pg_native'+path&&response.request().method()===method)
  const settled=async p=>{await expect(p.getByRole('button',{name:'刷新 Agent 列表',exact:true})).toBeEnabled()}
  const login=async(p,who)=>{
   await p.goto(f.url,{waitUntil:'domcontentloaded'})
   await p.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email)
   await p.getByLabel('密码',{exact:true}).fill(f.credentials[who].password)
   const response=wire(p,'/api/native-auth/login','POST');await p.getByRole('button',{name:'登录',exact:true}).click();expect((await response).status()).toBe(200)
   await expect(p).toHaveURL(f.origin+'/');await settled(p)
   const cookies=(await context.cookies(f.origin)).filter(value=>value.name==='__Host-agentstudio_session')
   expect(cookies.length).toBe(1);expect(cookies[0].secure&&cookies[0].httpOnly&&cookies[0].sameSite==='Strict'&&cookies[0].path==='/'&&cookies[0].domain==='localhost','actual Secure HttpOnly Strict host-only Cookie').toBe(true)
  }
  const logout=async(p,who)=>{
   const menu=p.getByRole('menu');if(!await menu.isVisible())await p.getByRole('button',{name:new RegExp(f.profiles[who].display_name)}).click()
   const response=wire(p,'/api/native-auth/logout','POST');await menu.getByRole('menuitem',{name:'退出登录',exact:true}).click();expect((await response).status()).toBe(200)
   await expect(p).toHaveURL(f.origin+'/login')
  }
  const quick=async p=>{const section=p.locator('#hero');if(!await section.evaluate(e=>e.open))await section.locator('summary').click();return section}
  const editor=p=>p.locator('#spec-editor')
  const restore=async p=>{const dialog=p.getByRole('dialog',{name:'恢复未保存的 Agent 草稿',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'恢复草稿',exact:true}).click();await expect(dialog).toHaveCount(0)}
  const image=async(name,p)=>{
   await settled(p);await expect(p.getByLabel('密码',{exact:true})).toHaveCount(0)
   const sample=await p.evaluate(()=>({text:document.body.innerText,values:[...document.querySelectorAll('input,textarea')].map(e=>e.value),passwordInputs:document.querySelectorAll('input[type="password"]').length}))
   const secrets=[f.credentials.alice.password,f.credentials.bob.password,...(await context.cookies(f.origin)).map(value=>value.value).filter(value=>value.length>=8)]
   const safety=originalHomeDesignDomSafety(sample,secrets)
   expect(safety,'screenshot safety exposes only booleans').toEqual({bounded:true,password_absent:true,secret_absent:true,credential_markers_absent:true})
   expect(images.some(row=>row.name===name),'unique fixed screenshot').toBe(false)
   images.push(originalHomeDesignImageBuffer(name,await p.screenshot({fullPage:true}),safety))
  }
  const submits=()=>httpBodies.filter(row=>row.path.endsWith('/agent-design/submit'))
  const assertSameConfirm=(body)=>{
   const matches=httpBodies.filter(row=>row.path.endsWith('/agent-design/confirm')&&JSON.parse(row.body).request_id===body.request_id)
   expect(matches.length).toBeGreaterThan(0);for(const actual of matches)expect(JSON.parse(actual.body)).toEqual(body)
  }
  let generatedId,firstBody
  await test.step('original quick controls preview real fields; explicit submission loses only the committed reply and reload queries the same intent',async()=>{
   await login(page,'alice');const section=await quick(page)
   await section.getByRole('textbox',{name:'说说你想要一个什么样的助手',exact:true}).fill('Synthetic original Home generation: complete descriptions, advisory tools, and manual save only.')
   const previewWire=wire(page,'/api/v2/agent-design/preview','POST');await section.getByRole('button',{name:'预览模型请求',exact:true}).click()
   const previewResponse=await previewWire;expect(previewResponse.status()).toBe(200);const preview=await previewResponse.json()
   expect(preview.recorded).toBe(false);expect(preview.choice.purpose).toBe('generate');expect(preview.choice.source).toBeNull()
   expect(preview.choice.model_binding).toEqual(f.resources.alice.binding);expect(preview.choice.output_token_limit).toBe(4096)
   await expect(section.getByRole('region',{name:'生成前需求预览',exact:true})).toBeVisible()
   expect(await f.counts()).toEqual(before);expect(submits()).toHaveLength(0);expect(f.providerRequests).toHaveLength(0);expect(f.credentialReads()).toBe(0)
   f.dropNextActualSubmitReply();await section.getByRole('button',{name:'按已核对需求生成草案',exact:true}).click()
   await expect(section.getByRole('button',{name:'查询原模型请求',exact:true})).toBeEnabled()
   expect(submits()).toHaveLength(1);firstBody=JSON.parse(submits()[0].body)
   expect((await f.counts()).requests).toBe(before.requests+1);expect(f.providerRequests).toHaveLength(0)
   await page.reload({waitUntil:'domcontentloaded'});await restore(page);const recovered=await quick(page)
   f.mutable.submissions=false // Recovery must work with new submissions off.
   await recovered.getByRole('button',{name:'查询原模型请求',exact:true}).click();await expect(recovered.getByRole('button',{name:'查询原模型请求',exact:true})).toBeEnabled()
   assertSameConfirm(firstBody);expect(submits()).toHaveLength(1);expect(f.providerRequests).toHaveLength(0)
   await f.tick();expect(f.providerRequests).toHaveLength(1);expect(f.credentialReads()).toBe(1)
   await recovered.getByRole('button',{name:'查询原模型请求',exact:true}).click()
   await expect(editor(page).getByRole('textbox',{name:'助手名称',exact:true})).toHaveValue(f.output().name)
   await expect(editor(page).locator('textarea').nth(0)).toHaveValue(f.output().goal)
   expect((await f.counts()).agents).toBe(before.agents);expect((await f.counts()).saves).toBe(before.saves)
   await page.reload({waitUntil:'domcontentloaded'});await restore(page)
   await expect(editor(page).getByRole('textbox',{name:'助手名称',exact:true})).toHaveValue(f.output().name)
   expect(submits()).toHaveLength(1);expect(f.providerRequests).toHaveLength(1)
   f.mutable.submissions=true;steps.original_generation_and_recovery=true
  })
  await test.step('original full editor manually saves through070071; advisory names never become executable resources',async()=>{
   const e=editor(page)
   await e.getByRole('textbox',{name:'助手名称',exact:true}).fill('Original Home synthetic generated manual save')
   await e.locator('textarea').nth(0).fill('Original Home employee edited generated goal')
   await e.locator('label').filter({hasText:f.homeKnowledge.alice.name}).getByRole('checkbox').check()
   await expect(e.locator('label').filter({hasText:f.homeKnowledge.bob.name})).toHaveCount(0)
   await expect(e.getByRole('checkbox',{name:/阶段方案需我确认后才继续/})).toBeChecked()
   const response=wire(page,'/api/v2/original-ui/agent-specs','POST');await e.getByRole('button',{name:'保存到我的助手',exact:true}).click()
   const saved=await response;expect(saved.status()).toBe(201);generatedId=(await saved.json()).item.id
   await expect(e.getByRole('button',{name:'已保存',exact:true})).toBeDisabled();await settled(page)
   const audit=await f.manualSaveAudit('alice',generatedId)
   expect(audit.actual.name).toBe('Original Home synthetic generated manual save');expect(audit.actual.spec.goal).toBe('Original Home employee edited generated goal')
   expect(audit.actual.spec.tools).toEqual(['knowledge_search']);expect(audit.actual.spec.knowledge_base_ids).toEqual([f.homeKnowledge.alice.id]);expect(audit.actual.spec.model_binding).toBeUndefined();expect(audit.actual.spec.http_tools??[]).toEqual([]);expect(audit.actual.spec.mcp_tools??[]).toEqual([])
   expect(audit.actual.spec.require_approval).toBe(true);expect(audit.actual.spec.require_plan_review).toBe(true);expect(audit.authoring.tool_requirements).toEqual(f.output().tools)
   expect(audit.history.some(row=>row.spec_revision===audit.actual.revision&&row.safe_spec.goal===audit.actual.spec.goal)).toBe(true)
   expect(await f.agent('bob',generatedId)).toBeNull();expect((await f.counts()).saves).toBe(before.saves);expect((await f.counts()).agents).toBe(before.agents+1)
   await image('original-home-design-generated.png',page);steps.original_manual070071_save=true
  })
  let revisionBody,revisionPatch
  await test.step('original clean saved resource-bearing source previews and confirms revision; manual CAS save preserves resources',async()=>{
   // The source was created by the actual original070 save above. Legacy rows
    // with authoring:null have a separate pure regression; this story does not
    // count that path as real database/browser acceptance.
   const prior=await f.agent('alice',generatedId)
   expect(prior.spec.knowledge_base_ids).toEqual([f.homeKnowledge.alice.id])
   await page.getByRole('button',{name:'编辑方案：'+prior.name,exact:true}).click()
   const e=editor(page);await expect(e.getByRole('textbox',{name:'助手名称',exact:true})).toHaveValue(prior.name)
   await e.locator('details').filter({hasText:'可选 · 让 AI 帮我调整方案'}).locator('summary').click()
   await e.getByPlaceholder('例如：增加一步来源核验，将交付物改为报告大纲',{exact:true}).fill('Synthetic original Home revision: preserve this actual owner source and every approved resource binding.')
   const previewWire=wire(page,'/api/v2/agent-design/preview','POST');await e.getByRole('button',{name:'预览修改请求',exact:true}).click()
   const previewResponse=await previewWire;expect(previewResponse.status()).toBe(200);const preview=await previewResponse.json()
   expect(preview.recorded).toBe(false);expect(preview.choice.purpose).toBe('revise');expect(preview.choice.source.spec_id).toBe(prior.id);expect(preview.choice.source.revision).toBe(prior.revision)
   expect(f.providerRequests).toHaveLength(1)
   await e.getByRole('button',{name:'按已核对要求修改',exact:true}).click();await expect(e.getByRole('button',{name:'查询原模型请求',exact:true})).toBeEnabled()
   expect(submits()).toHaveLength(2);revisionBody=JSON.parse(submits()[1].body)
   await f.tick();expect(f.providerRequests).toHaveLength(2);expect(f.credentialReads()).toBe(2)
   await e.getByRole('button',{name:'查询原模型请求',exact:true}).click();await expect(e.getByRole('textbox',{name:'助手名称',exact:true})).toHaveValue(f.output().name)
   expect((await f.agent('alice',prior.id)).revision).toBe(prior.revision)
   await e.getByRole('textbox',{name:'助手名称',exact:true}).fill('Original Home synthetic revised manual save')
   await e.locator('textarea').nth(0).fill('Original Home employee edited revised goal')
   const response=wire(page,'/api/v2/original-ui/agent-specs/'+prior.id,'PATCH');await e.getByRole('button',{name:'保存到我的助手',exact:true}).click();expect((await response).status()).toBe(200)
   await expect(e.getByRole('button',{name:'已保存',exact:true})).toBeDisabled();await settled(page)
   revisionPatch=JSON.parse(httpBodies.findLast(row=>row.method==='PATCH').body);expect(revisionPatch.expected_revision).toBe(prior.revision)
   const audit=await f.manualSaveAudit('alice',prior.id)
   expect(audit.actual.revision).toBe(prior.revision+1);expect(audit.actual.spec.goal).toBe('Original Home employee edited revised goal')
   for(const field of ['model_binding','http_tools','mcp_tools','knowledge_base_ids','tools','require_approval','require_plan_review'])expect(audit.actual.spec[field]).toEqual(prior.spec[field])
   expect(audit.authoring.tool_requirements).toContain(f.output().tools[0]);expect(audit.history.some(row=>row.spec_revision===audit.actual.revision&&row.safe_spec.goal===audit.actual.spec.goal)).toBe(true)
   const unchanged=await f.counts(),reads=f.credentialReads(),posts=f.providerRequests.length
   const stale=await f.request('alice','/api/v2/original-ui/agent-specs/'+prior.id,'PATCH',revisionPatch,f.users.alice)
   expect(stale.status).toBe(409);expect(await f.counts()).toEqual(unchanged);expect((await f.agent('alice',prior.id)).revision).toBe(audit.actual.revision)
   const foreign=await f.request('bob','/api/v2/original-ui/agent-specs/'+prior.id);expect([403,404]).toContain(foreign.status)
   const foreignDesign=await f.request('bob','/api/v2/agent-design/requests/'+revisionBody.request_id);expect([403,404]).toContain(foreignDesign.status);expect(foreignDesign.body.result).toBeUndefined()
   const changedSubmit=await f.request('bob','/api/v2/agent-design/submit','POST',revisionBody,f.users.alice),changedConfirm=await f.request('bob','/api/v2/agent-design/confirm','POST',revisionBody,f.users.alice)
   for(const changed of [changedSubmit,changedConfirm]){expect(changed.status).toBe(409);expect(changed.body.error).toBe('agent_design_employee_changed')}
   expect(await f.counts()).toEqual(unchanged);expect(f.credentialReads()).toBe(reads);expect(f.providerRequests).toHaveLength(posts)
   negativeProofs.push({stale_CAS_status:stale.status,foreign_agent_status:foreign.status,foreign_design_status:foreignDesign.status,expected_employee_submit_status:changedSubmit.status,expected_employee_confirm_status:changedConfirm.status,actual_Cookie_owner_checks:true,ledgers_unchanged:true})
   assertSameConfirm(revisionBody);await image('original-home-design-revised-saved.png',page);steps.original_revision_and_CAS_save=true
  })
  await test.step('an actual late available result cannot cross an employee Cookie change while the original query is busy',async()=>{
   const section=await quick(page)
   await section.getByRole('textbox',{name:'说说你想要一个什么样的助手',exact:true}).fill('Synthetic late Alice design must never appear in the later Bob original Home.')
   const preview=wire(page,'/api/v2/agent-design/preview','POST');await section.getByRole('button',{name:'预览模型请求',exact:true}).click();expect((await preview).status()).toBe(200)
   await section.getByRole('button',{name:'按已核对需求生成草案',exact:true}).click();await expect(section.getByRole('button',{name:'查询原模型请求',exact:true})).toBeEnabled()
   expect(submits()).toHaveLength(3);const body=JSON.parse(submits()[2].body)
   await f.tick();expect(f.providerRequests).toHaveLength(3)
   const gate=f.holdNextActualResult(body.request_id);holds.push(gate)
   const query=section.getByRole('button',{name:'查询原模型请求',exact:true}),queryStarted=Date.now();await query.click();expect((await gate.entered()).status).toBe(200)
   await expect(section.getByRole('button',{name:'正在查询原请求…',exact:true})).toBeDisabled()
   const other=await preparePage();await other.goto(f.origin+'/',{waitUntil:'domcontentloaded'});await settled(other);await logout(other,'alice');await login(other,'bob')
   expect(Date.now()-queryStarted,'actual account switch must complete inside the unchanged8s Native request budget').toBeLessThan(6500)
   await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await expect.poll(async()=>page.getByRole('textbox',{name:'助手名称',exact:true}).count(),{message:'old employee editor must be hidden before the held response is released'}).toBe(0)
   gate.release()
   await expect(page.getByText(f.output().goal,{exact:true})).toHaveCount(0)
   await expect(page.getByRole('textbox',{name:'助手名称',exact:true})).toHaveCount(0)
   await expect(page.getByText('Original Home employee edited revised goal',{exact:true})).toHaveCount(0)
   const foreign=await f.request('bob','/api/v2/agent-design/requests/'+body.request_id);expect([403,404]).toContain(foreign.status);expect(foreign.body.result).toBeUndefined()
   expect(submits()).toHaveLength(3);assertSameConfirm(body);expect(f.providerRequests).toHaveLength(3);expect(f.credentialReads()).toBe(3)
   negativeProofs.push({late_result_foreign_status:foreign.status,old_editor_hidden_before_release:true,actual_Cookie_switch:true})
   await observer.flush(other);await other.close();steps.busy_late_account_fence=true
  })
  after=await f.counts();expect(after.requests).toBe(before.requests+3);expect(after.reservations).toBe(before.reservations+3);expect(after.outputs).toBe(before.outputs+3)
  expect(after.saves).toBe(before.saves);expect(after.agents).toBe(before.agents+1);expect(after.history).toBe(before.history+2);expect(after.runs).toBe(before.runs);expect(after.old_effects).toBe(before.old_effects)
  expect(f.observations.controlled_after_commit_disconnects).toBe(1);expect(f.observations.held_actual_responses).toBe(1)
  expect(outside).toEqual([]);expect(webSockets).toBe(0);expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.overflow).toBe(false)
  await observer.flush(page);expect(observer.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false})
  expect(f.observations.legacy_backend_requests).toEqual([]);expect(f.observations.unexpected_api_failures).toEqual([]);expect(f.observations.blocked_requests).toEqual([])
  f.assertNoProviderErrors();expect(images.map(row=>row.name)).toEqual(['original-home-design-generated.png','original-home-design-revised-saved.png']);completed=true
 }catch(error){primary=error}
 finally{
  for(const hold of holds)hold.release()
  if(observer&&page&&!page.isClosed())await clean('legacy_observer_flush',()=>observer.flush(page))
  if(context)await clean('browser_context_close',()=>context.close())
  if(browser)await clean('browser_close',()=>browser.close())
  await clean('genuine_fixture_close',()=>f.close())
   await clean('final_zero_after_cleanup',async()=>{
    for(const key of ['legacy_backend_requests','unexpected_api_failures','blocked_requests'])expect(f.observations[key]).toEqual([])
    expect(outside).toEqual([]);expect(webSockets).toBe(0);expect(f.observations.forbidden_auth_headers).toBe(0);expect(f.observations.overflow).toBe(false)
    expect(observer?.snapshot()).toEqual({event_count_capped_129:0,codes:[],overflow:false});f.assertNoProviderErrors()
    if(completed){expect(f.providerRequests).toHaveLength(3);expect(f.credentialReads()).toBe(3);expect(f.observations.controlled_after_commit_disconnects).toBe(1);expect(f.observations.held_actual_responses).toBe(1)}
   })
  const success=completed&&!primary&&!testInfo.errors.length&&!cleanup.length
  // Images remain in memory until the whole story AND owned cleanup succeed.
  if(success)for(const image of images)await clean('fixed_success_image_write',()=>fs.writeFile(testInfo.outputPath(image.name),image.bytes,{flag:'wx'}))
  const observation={scope:'hosted synthetic original Home natural generation/revision and explicit070071 manual save',story_completed:success&&!cleanup.length,steps,head:permit.head,actual_backend:f.backendProfile,actual_build:f.provenance,http:f.observations,negative_proofs:negativeProofs,local_PB_blocks:observer?.snapshot()??null,outside_origins:outside.length,websocket_attempts:webSockets,business_before:before??null,business_after:after??null,synthetic_provider_posts:f.providerRequests.length,credential_reads:f.credentialReads(),paid_external_provider_calls:0,cleanup_failures:cleanup.map(row=>row.label),unsupported:['multi_model_selector','unsaved_or_dirty_revision_source','legacy_authoring_null_with_new_tool_advice_save','persistent_F01_to_070071_save_link'],F01_one_use_save_UI_acceptance:false,all_original_pages_complete:false,employee_UAT:0,qualifying_24h:0,production_GO:false}
   await clean('bounded_observation_write',()=>fs.writeFile(testInfo.outputPath('original-home-design-observation.json'),originalHomeDesignObservationBytes(observation),{flag:'wx'}))
   for(const image of images)image.bytes.fill(0)
   images.length=0;httpBodies.length=0
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup.map(row=>row.error)],'original_home_design_story_and_cleanup_failed')
 if(primary)throw primary
 if(cleanup.length)throw new AggregateError(cleanup.map(row=>row.error),'original_home_design_cleanup_failed')
})
