import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('Native paid opinions: explicit independent model consent, original recovery, actual protected result and owner privacy',async({},testInfo)=>{
  const approved=requireNativeBrowserCi(),root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const childEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY'})
  for(const name of ['AUTONOMOUS','HUMAN','MEMORY','OUTCOME_MEMORY','DERIVED_MEMORY','FAILURE_SOURCE','FEEDBACK','OPTIMIZATION','REVIEW'])childEnv['AGENT_STUDIO_PG_BROWSER_'+name]='true'
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_review_fixture_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_review_fixture_exit_'+code+' '+output.slice(-1500))))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method='POST')=>{const response=await fetch('http://127.0.0.1:'+info.apiPort+'/__fixture/'+name,{method,headers:{'X-AgentStudio-Synthetic-Fixture':'1'},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'})
    const external=[];await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();await page.goto(info.url,{waitUntil:'domcontentloaded'})
    const login=async who=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(who+'@example.com');await page.getByLabel('密码',{exact:true}).fill(who==='alice'?'SyntheticAlicePassword#2026':'SyntheticBobPassword#2026');await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await expect(page.getByRole('button',{name:'多轮 Agent',exact:true})).toBeVisible()}
    await login('alice');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await page.getByRole('combobox',{name:'多轮 Agent 角色',exact:true}).selectOption({label:'Alice Browser Agent · gpt-4.1-mini'})
    await page.getByRole('combobox',{name:'本次方案审核',exact:true}).selectOption('off');await page.getByRole('combobox',{name:'最多规划轮数',exact:true}).selectOption('1')
    await page.getByRole('textbox',{name:'多轮任务要求',exact:true}).fill('合成 AI 意见任务：先由本人取消，再核对评估和反馈建议。')
    await page.getByRole('button',{name:'提交多轮任务',exact:true}).click();await page.getByRole('button',{name:'取消任务',exact:true}).click();await page.getByRole('button',{name:'确认取消此任务',exact:true}).click()
    const panel=page.getByRole('region',{name:'AI 任务评估与优化建议',exact:true});await expect(panel).toBeVisible();await panel.getByRole('button',{name:'查看与准备 AI 意见',exact:true}).click()
    const conn=panel.getByRole('combobox',{name:'AI 意见模型连接',exact:true}),models=panel.getByRole('combobox',{name:'AI 意见模型',exact:true})
    await conn.selectOption((await control('state','GET')).reviewModel);await models.selectOption('synthetic-review-b')
    const preview=panel.getByRole('button',{name:'预览这次 AI 意见',exact:true}),fee=panel.getByRole('checkbox',{name:'确认本次 AI 意见的模型费用',exact:true})
    await expect(preview).toBeEnabled();await preview.click();await expect(panel.getByLabel('AI 意见安全预览',{exact:true})).toBeVisible()
    await expect(fee).not.toBeChecked();const submit=panel.getByRole('button',{name:'确认费用并提交任务评估',exact:true});await expect(submit).toBeDisabled()
    let proof=await control('state','GET');expect(proof.reviewRequests).toBe(0);expect(proof.reviewEffects).toBe(0);expect(proof.generated).toBe(0)
    await fee.check();await control('drop-next-review');await submit.click();await expect(panel.getByRole('button',{name:'核对原请求',exact:true})).toBeEnabled()
    proof=await control('state','GET');expect(proof.reviewRequests).toBe(1);expect(proof.reviewInputs).toBe(1);expect(proof.reviewEffects).toBe(0)
    const original=proof.reviewHashes[0].request_id
    await control('deny-review')
    const globalRefresh=page.getByRole('button',{name:'刷新',exact:true})
    const [capabilityReply]=await Promise.all([page.waitForResponse(reply=>new URL(reply.url()).pathname.endsWith('/api/native-auth/capabilities')&&reply.status()===200),globalRefresh.click()])
    expect((await capabilityReply.json()).agent_review_submission_enabled).toBe(false)
    await expect(globalRefresh).toBeEnabled();await expect(panel.getByText('当前未开放新意见提交。仍可核对原请求、读取已有意见、取消后续处理或删除正文。',{exact:true})).toBeVisible()
    await panel.getByRole('button',{name:'核对原请求',exact:true}).click()
    await expect(panel.getByRole('button',{name:'核对原请求',exact:true})).toHaveCount(0)
    const refresh=panel.getByRole('button',{name:'核对当前来源与状态',exact:true});await expect(refresh).toBeEnabled()
    proof=await control('state','GET');expect(proof.reviewConfirms).toBe(1);expect(proof.reviewRequests).toBe(1);expect(proof.reviewEffects).toBe(0)
    await control('review-complete');await refresh.click()
    const result=panel.getByLabel('AI 任务评估结果',{exact:true});await expect(result).toBeVisible();await expect(result.getByText('0',{exact:true})).toBeVisible()
    await expect(result.getByText('目标达成 · 0 / 100',{exact:true})).toBeVisible();expect(await panel.textContent()).not.toMatch(/SyntheticBrowser.*Key|"messages"|lease_token|owner_user_id/)
    proof=await control('state','GET');expect(proof.reviewRequests).toBe(1);expect(proof.reviewEffects).toBe(1);expect(proof.reviewOutputs).toBe(1);expect(proof.optimizationLinks).toBe(0);expect(proof.optimizationCurrent.model_preserved).toBe(true)
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-agent-paid-review-zero-and-original.png')})
    const originalScope=proof.reviewScopes.find(row=>row.request_id===original);expect(originalScope).toBeTruthy()
    // All controller memory is gone. Find the existing server record through
    // the actual task/history UI, without rebuilding the paid submission.
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await page.getByRole('button',{name:/^合成 AI 意见任务：先由本人取消/}).click()
    await panel.getByRole('button',{name:'查看与准备 AI 意见',exact:true}).click()
    const history=panel.getByRole('region',{name:'本人历史 AI 意见',exact:true})
    const historical=history.getByRole('button',{name:'读取历史意见 '+original,exact:true})
    await expect(historical).toBeVisible();await historical.click();await expect(result).toBeVisible();await expect(result.getByText('0',{exact:true})).toBeVisible()
    proof=await control('state','GET');expect(proof.reviewRequests).toBe(1);expect(proof.reviewEffects).toBe(1);expect(proof.reviewOutputs).toBe(1);expect(proof.generated).toBe(0)
    // Current-source denial must clear the body but leave the real immutable
    // metadata/hash available for a new, explicitly confirmed privacy control.
    await control('disable-review-model');await historical.click();await expect(result).toHaveCount(0)
    await expect(panel.getByLabel('AI 意见历史快照',{exact:true})).toBeVisible()
    await control('deny-review-history')
    const [closedDiscovery]=await Promise.all([page.waitForResponse(reply=>new URL(reply.url()).pathname.endsWith('/api/native-auth/capabilities')&&reply.status()===200),globalRefresh.click()])
    const closedScopes=await closedDiscovery.json();expect(closedScopes.agent_review_available).toBe(true);expect(closedScopes.agent_review_history_available).toBeUndefined();expect(closedScopes.agent_review_submission_enabled).toBe(false)
    await expect(globalRefresh).toBeEnabled();await expect(history).toHaveCount(0)
    await expect(panel.getByLabel('AI 意见历史快照',{exact:true})).toBeVisible()
    await expect(panel.getByRole('button',{name:'删除本次意见正文',exact:true})).toBeEnabled()
    await panel.getByLabel('AI 意见历史快照',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-agent-review-history-source-denied.png')})
    await panel.getByRole('button',{name:'删除本次意见正文',exact:true}).click();await panel.getByRole('checkbox',{name:'确认删除本次 AI 意见正文',exact:true}).check();await panel.getByRole('button',{name:'确认删除正文',exact:true}).click()
    await expect(panel.getByText('本次意见的输入与结果正文已删除，历史请求和执行摘要保留。',{exact:true})).toBeVisible();await expect(result).toHaveCount(0)
    proof=await control('state','GET');expect(proof.reviewInputs).toBe(0);expect(proof.reviewOutputs).toBe(0);expect(proof.reviewTombstones).toBe(1);expect(proof.reviewEffects).toBe(1)
    // A genuinely selected current employee statement feeds a separate request.
    const feedback=page.getByRole('region',{name:'任务反馈',exact:true})
    await feedback.getByRole('combobox',{name:'任务评价',exact:true}).selectOption('down');await feedback.getByRole('textbox',{name:'反馈补充意见',exact:true}).fill('合成改进意见：增加证据核对，保持权限和原始模型。')
    await feedback.getByRole('checkbox',{name:'确认提交此反馈',exact:true}).check();await feedback.getByRole('button',{name:'提交任务反馈',exact:true}).click()
    await expect(feedback.getByRole('button',{name:'删除此任务反馈及教训',exact:true})).toBeEnabled()
    await control('enable-review-model');await control('allow-review-history');await control('allow-review');await page.getByRole('button',{name:'刷新',exact:true}).click();await panel.getByRole('combobox',{name:'AI 意见用途',exact:true}).selectOption('optimize')
    await conn.selectOption((await control('state','GET')).reviewModel);await models.selectOption('synthetic-review-b')
    const selected=panel.getByRole('checkbox',{name:'选用本次任务的当前反馈',exact:true});await expect(selected).not.toBeChecked();await selected.check()
    await expect(preview).toBeEnabled();await preview.click();await expect(fee).not.toBeChecked();await fee.check();await panel.getByRole('button',{name:'确认费用并提交角色优化建议',exact:true}).click()
    await expect.poll(async()=>(await control('state','GET')).reviewRequests).toBe(2)
    await control('review-complete');await refresh.click();await expect(panel.getByLabel('AI 角色优化建议',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:/接受.*建议/})).toHaveCount(0)
    proof=await control('state','GET');expect(proof.reviewRequests).toBe(2);expect(proof.reviewEffects).toBe(2);expect(proof.reviewOutputs).toBe(1);expect(proof.optimizationLinks).toBe(0);expect(proof.optimizationCurrent.model_preserved).toBe(true);expect(proof.generated).toBe(0)
    await panel.getByRole('button',{name:'取消后续处理',exact:true}).click();await panel.getByRole('checkbox',{name:'确认取消本次 AI 意见后续处理',exact:true}).check();await panel.getByRole('button',{name:'确认取消后续处理',exact:true}).click()
    await expect(panel.getByLabel('AI 角色优化建议',{exact:true})).toHaveCount(0)
    await feedback.getByRole('button',{name:'删除此任务反馈及教训',exact:true}).click();await feedback.getByRole('button',{name:'确认删除反馈及教训',exact:true}).click()
    await expect.poll(async()=>(await control('state','GET')).reviewOutputs).toBe(0)
    proof=await control('state','GET');expect(proof.reviewInputs).toBe(0);expect(proof.reviewTombstones).toBe(2);expect(proof.reviewEffects).toBe(2);expect(proof.optimizationLinks).toBe(0)
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await expect(page.getByRole('button',{name:'核对原请求',exact:true})).toHaveCount(0);await expect(page.getByText('暂无多轮任务',{exact:true})).toBeVisible()
    expect(await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-reviews/'+id)).status,original)).toBe(404)
    expect(await page.evaluate(async scope=>{
      const query=new URLSearchParams({spec_id:scope.spec_id,run_id:scope.run_id,purpose:scope.purpose,limit:'20'})
      return (await fetch('/__pg_native/api/v2/agent-reviews?'+query)).status
    },originalScope)).toBe(404)
    expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(typeof child.pid==='number'&&child.exitCode===null&&child.signalCode===null){
      await new Promise(resolve=>{
        let forced,deadline
        const done=()=>{clearTimeout(forced);clearTimeout(deadline);child.off('exit',done);resolve()}
        child.once('exit',done)
        forced=setTimeout(()=>child.kill('SIGTERM'),5000)
        deadline=setTimeout(()=>{child.kill('SIGKILL');done()},10000)
      })
    }
  }
})
