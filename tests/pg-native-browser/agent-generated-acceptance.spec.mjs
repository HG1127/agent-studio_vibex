import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

// Actual Cookie/HTTP, protected057 completion and real045/055/059 SQL in the
// embedded browser fixture. Independent TCP PG18/Worker evidence is separate.
test('Native generated role acceptance: explicit config consent, unknown original across scopes, permanent provenance and account isolation',async({},testInfo)=>{
  const approved=requireNativeBrowserCi(),root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  Object.assign(env,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY'})
  for(const name of ['AUTONOMOUS','HUMAN','MEMORY','OUTCOME_MEMORY','DERIVED_MEMORY','FAILURE_SOURCE','FEEDBACK','OPTIMIZATION','REVIEW','GENERATED_ACCEPTANCE'])env['AGENT_STUDIO_PG_BROWSER_'+name]='true'
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control,releaseLate
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_generated_fixture_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_generated_fixture_exit_'+code+' '+output.slice(-1500))))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method='POST')=>{const reply=await fetch('http://127.0.0.1:'+info.apiPort+'/__fixture/'+name,{method,headers:{'X-AgentStudio-Synthetic-Fixture':'1'},signal:AbortSignal.timeout(15000)});expect(reply.status).toBe(200);return reply.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'})
    const external=[],submitted=[]
    await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage()
    page.on('request',req=>{if(req.method()==='POST'&&/\/api\/v2\/agent-generated-acceptances\/(accept|confirm)$/.test(new URL(req.url()).pathname))submitted.push({path:new URL(req.url()).pathname,body:req.postData()})})
    await page.goto(info.url,{waitUntil:'domcontentloaded'})
    const login=async who=>{
      await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(who+'@example.com')
      await page.getByLabel('密码',{exact:true}).fill(who==='alice'?'SyntheticAlicePassword#2026':'SyntheticBobPassword#2026')
      await page.getByRole('button',{name:'登录独立工作台',exact:true}).click()
      await expect(page.getByRole('button',{name:'多轮 Agent',exact:true})).toBeVisible()
    }
    await login('alice');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await page.getByRole('combobox',{name:'多轮 Agent 角色',exact:true}).selectOption({label:'Alice Browser Agent · gpt-4.1-mini'})
    await page.getByRole('combobox',{name:'本次方案审核',exact:true}).selectOption('off')
    await page.getByRole('combobox',{name:'最多规划轮数',exact:true}).selectOption('1')
    await page.getByRole('textbox',{name:'多轮任务要求',exact:true}).fill('合成配置接受任务：原请求恢复后只修改描述，保留全部权限。')
    await page.getByRole('button',{name:'提交多轮任务',exact:true}).click()
    await page.getByRole('button',{name:'取消任务',exact:true}).click();await page.getByRole('button',{name:'确认取消此任务',exact:true}).click()
    const review=page.getByRole('region',{name:'AI 任务评估与优化建议',exact:true})
    await review.getByRole('button',{name:'查看与准备 AI 意见',exact:true}).click()
    const purpose=review.getByRole('combobox',{name:'AI 意见用途',exact:true})
    const prepareOpinion=async selectedPurpose=>{
      await purpose.selectOption(selectedPurpose)
      await review.getByRole('combobox',{name:'AI 意见模型连接',exact:true}).selectOption((await control('state','GET')).reviewModel)
      await review.getByRole('combobox',{name:'AI 意见模型',exact:true}).selectOption('synthetic-review-b')
      if(selectedPurpose==='optimize')await review.getByRole('checkbox',{name:'选用本次任务的当前反馈',exact:true}).check()
      await review.getByRole('button',{name:'预览这次 AI 意见',exact:true}).click()
      const fee=review.getByRole('checkbox',{name:'确认本次 AI 意见的模型费用',exact:true});await expect(fee).not.toBeChecked();await fee.check()
      await review.getByRole('button',{name:selectedPurpose==='evaluate'?'确认费用并提交任务评估':'确认费用并提交角色优化建议',exact:true}).click()
      await expect(review.getByRole('button',{name:'核对当前来源与状态',exact:true})).toBeEnabled()
      await control('review-complete');await review.getByRole('button',{name:'核对当前来源与状态',exact:true}).click()
      await expect(review.getByLabel(selectedPurpose==='evaluate'?'AI 任务评估结果':'AI 角色优化建议',{exact:true})).toBeVisible()
      return (await control('state','GET')).reviewScopes.find(row=>row.purpose===selectedPurpose).request_id
    }
    const evaluationId=await prepareOpinion('evaluate')
    const feedback=page.getByRole('region',{name:'任务反馈',exact:true})
    await feedback.getByRole('combobox',{name:'任务评价',exact:true}).selectOption('down')
    await feedback.getByRole('textbox',{name:'反馈补充意见',exact:true}).fill('合成当前反馈：明确交付、核对证据，保留模型和工具权限。')
    await feedback.getByRole('checkbox',{name:'确认提交此反馈',exact:true}).check()
    await feedback.getByRole('button',{name:'提交任务反馈',exact:true}).click()
    await expect(feedback.getByRole('button',{name:'删除此任务反馈及教训',exact:true})).toBeEnabled()
    const reviewId=await prepareOpinion('optimize')
    const generated=page.getByRole('region',{name:'接受生成建议修改角色',exact:true})
    const preview=generated.getByRole('button',{name:'预览完整建议对角色的修改',exact:true})
    await expect(preview).toBeEnabled()
    let state=await control('state','GET');const beforeRevision=Number(state.optimizationCurrent.revision)
    expect(state.generatedAcceptances).toBe(0);expect(state.optimizationLinks).toBe(0);expect(state.generatedAcceptanceHashes).toEqual([])
    await preview.click();await expect(generated.getByLabel('生成建议的完整配置对比',{exact:true})).toBeVisible()
    for(const label of ['目标','任务范围','交付内容','任务计划','完成标准']){
      // Labels are semantic UI contracts; a missing comparison cannot be
      // replaced with a hidden serialized candidate or a preselected consent.
      await expect(generated.getByLabel(label+'修改对比',{exact:true})).toBeVisible()
    }
    const consent=generated.getByRole('checkbox',{name:'确认接受本次完整生成建议修改角色',exact:true})
    const accept=generated.getByRole('button',{name:'确认接受并修改角色描述',exact:true})
    await expect(consent).not.toBeChecked();await expect(accept).toBeDisabled()
    await consent.check();await control('drop-next-generated-acceptance');await accept.click()
    const confirm=generated.getByRole('button',{name:'核对原配置接受请求',exact:true})
    await expect(confirm).toBeEnabled()
    state=await control('state','GET')
    expect(state.generatedAcceptances).toBe(1);expect(state.generatedAcceptanceRefs).toBe(1);expect(state.generatedAcceptanceAudits).toBe(1)
    expect(Number(state.optimizationCurrent.revision)).toBe(beforeRevision+1);expect(state.optimizationCurrent.model_preserved).toBe(true)
    expect(state.optimizationLinks).toBe(1);expect(state.optimizationIntents).toBe(1)
    expect(submitted).toHaveLength(1);const originalBody=submitted[0].body,original=JSON.parse(originalBody)
    expect(Object.keys(original)).toHaveLength(14);expect(original.review_id).toBe(reviewId)
    await purpose.selectOption('evaluate')
    await review.getByRole('button',{name:'读取历史意见 '+evaluationId,exact:true}).click()
    await expect(generated.getByLabel('待核对的原配置接受请求',{exact:true})).toContainText(reviewId)
    await page.getByRole('button',{name:/^Agent 配置/}).first().click();await expect(generated).toBeHidden()
    await control('deny-generated-acceptance');await control('disable-review-model');await control('deny-review')
    const globalRefresh=page.getByRole('button',{name:'刷新',exact:true})
    const [closed]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/api/native-auth/capabilities')&&r.status()===200),globalRefresh.click()])
    const capabilities=await closed.json()
    expect(capabilities.agent_generated_acceptance_available).toBe(true);expect(capabilities.agent_generated_acceptance_enabled).toBe(false)
    await expect(globalRefresh).toBeEnabled();await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await expect(confirm).toBeEnabled();state=await control('state','GET');const readsBeforeConfirm=state.generatedAcceptanceAgentsReads
    await confirm.click();await expect(generated.getByLabel('生成建议配置接受回执',{exact:true})).toBeVisible()
    expect(submitted).toHaveLength(2);expect(submitted[1].path).toMatch(/\/confirm$/);expect(submitted[1].body).toBe(originalBody)
    await expect.poll(async()=>(await control('state','GET')).generatedAcceptanceAgentsReads).toBe(readsBeforeConfirm+1)
    state=await control('state','GET');expect(state.generatedAcceptanceHashes.map(row=>row.sha256)).toEqual([state.generatedAcceptanceHashes[0].sha256,state.generatedAcceptanceHashes[0].sha256])
    expect(state.generatedAcceptances).toBe(1);expect(Number(state.optimizationCurrent.revision)).toBe(beforeRevision+1);expect(state.optimizationHistory).toHaveLength(1)
    const witness=state.generatedAcceptanceWitnesses[0]
    expect(witness.request_id).toBe(original.request_id);expect(witness.review_id).toBe(reviewId)
    expect(witness.source_kind).toBe('generated_opinion');expect(witness.source_protocol).toBe('employee_statement_anchor_v1')
    expect(Number(witness.after_spec_revision)).toBe(Number(witness.before_spec_revision)+1)
    expect(witness.before_revision_id).not.toBe(witness.after_revision_id)
    await generated.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-generated-acceptance-original-confirm.png')})
    // Current058 Source is invalid after the accepted role update/model closure.
    // Independent history metadata still authorizes the explicit privacy flow.
    await purpose.selectOption('optimize')
    await review.getByRole('button',{name:'读取历史意见 '+reviewId,exact:true}).click()
    await expect(review.getByLabel('AI 角色优化建议',{exact:true})).toHaveCount(0)
    await review.getByRole('button',{name:'删除本次意见正文',exact:true}).click()
    await review.getByRole('checkbox',{name:'确认删除本次 AI 意见正文',exact:true}).check()
    await review.getByRole('button',{name:'确认删除正文',exact:true}).click()
    await expect(review.getByText('本次意见的输入与结果正文已删除，历史请求和执行摘要保留。',{exact:true})).toBeVisible()
    state=await control('state','GET');expect(state.reviewOutputs).toBe(1);expect(state.generatedAcceptances).toBe(1);expect(state.optimizationLinks).toBe(1)
    const readsBeforeGet=state.generatedAcceptanceAgentsReads
    const known=generated.getByRole('button',{name:'读取已有配置接受回执',exact:true})
    await known.click();await expect(generated.getByLabel('生成建议配置接受回执',{exact:true})).toContainText(original.request_id)
    state=await control('state','GET');expect(state.generatedAcceptanceAgentsReads).toBe(readsBeforeGet)
    expect(state.generatedAcceptances).toBe(1);expect(state.generatedAcceptanceAudits).toBe(1);expect(Number(state.optimizationCurrent.revision)).toBe(beforeRevision+1)
    expect(await generated.textContent()).not.toMatch(/SyntheticBrowser.*Key|"messages"|lease_token|owner_user_id|api_key/)
    await generated.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-generated-acceptance-body-erased-receipt.png')})
    // Deliver an actual old Alice response only after Bob has logged in. This
    // tests the mounted employee fence, not a fabricated foreign receipt DTO.
    let heldResponse
    const held=new Promise(resolve=>{heldResponse=resolve}),late=new Promise(resolve=>{releaseLate=resolve})
    const receiptPath='/__pg_native/api/v2/agent-generated-acceptances/reviews/'+reviewId
    await context.route('**'+receiptPath,async route=>{const response=await route.fetch();expect(response.status()).toBe(200);expect((await response.json()).request_id).toBe(original.request_id);heldResponse();await late;await route.fulfill({response})})
    const lateReceipt=page.waitForResponse(response=>new URL(response.url()).pathname===receiptPath&&response.status()===200)
    await known.click();await held
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob')
    releaseLate();await (await lateReceipt).finished();await context.unroute('**'+receiptPath)
    await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await expect(page.getByLabel('生成建议配置接受回执',{exact:true})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'核对原配置接受请求',exact:true})).toHaveCount(0)
    expect(await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-generated-acceptances/reviews/'+id)).status,reviewId)).toBe(404)
    expect(external).toEqual([])
  }finally{
    releaseLate?.();clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(typeof child.pid==='number'&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{
      let forced,deadline;const done=()=>{clearTimeout(forced);clearTimeout(deadline);child.off('exit',done);resolve()}
      child.once('exit',done);forced=setTimeout(()=>child.kill('SIGTERM'),5000);deadline=setTimeout(()=>{child.kill('SIGKILL');done()},10000)
    })
  }
})
