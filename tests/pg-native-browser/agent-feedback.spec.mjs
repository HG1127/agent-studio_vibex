import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('employee feedback: explicit lesson storage, lost originals, correction and privacy erasure without provider calls',async({},testInfo)=>{
  const approved=requireNativeBrowserCi()
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const childEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY',AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:'true',AGENT_STUDIO_PG_BROWSER_HUMAN:'true',AGENT_STUDIO_PG_BROWSER_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_OUTCOME_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_DERIVED_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_FAILURE_SOURCE:'true',AGENT_STUDIO_PG_BROWSER_FEEDBACK:'true'})
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_feedback_fixture_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_feedback_fixture_exit_'+code+' '+output.slice(-1500))))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(info.synthetic_only).toBe(true);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method='POST')=>{const response=await fetch('http://127.0.0.1:'+info.apiPort+'/__fixture/'+name,{method,headers:{'X-AgentStudio-Synthetic-Fixture':'1'},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
    const external=[];await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();await page.goto(info.url,{waitUntil:'domcontentloaded'})
    const login=async who=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(who+'@example.com');await page.getByLabel('密码',{exact:true}).fill(who==='alice'?'SyntheticAlicePassword#2026':'SyntheticBobPassword#2026');await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await expect(page.getByRole('button',{name:'多轮 Agent',exact:true})).toBeVisible()}
    await login('alice');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    const panel=page.getByRole('region',{name:'任务反馈',exact:true})
    const newCancelledTask=async label=>{
      await page.getByRole('combobox',{name:'多轮 Agent 角色',exact:true}).selectOption({label:'Alice Browser Agent · gpt-4.1-mini'})
      await page.getByRole('combobox',{name:'本次方案审核',exact:true}).selectOption('off');await page.getByRole('combobox',{name:'最多规划轮数',exact:true}).selectOption('1')
      await page.getByRole('textbox',{name:'多轮任务要求',exact:true}).fill(label);await page.getByRole('button',{name:'提交多轮任务',exact:true}).click()
      await page.getByRole('button',{name:'取消任务',exact:true}).click();await page.getByRole('button',{name:'确认取消此任务',exact:true}).click()
      await expect(panel.getByRole('combobox',{name:'任务评价',exact:true})).toBeEnabled()
    }
    const draft=async(comment,remember=true)=>{
      await panel.getByRole('combobox',{name:'任务评价',exact:true}).selectOption('down')
      await panel.getByRole('textbox',{name:'反馈标签',exact:true}).fill('证据不足,核对😀')
      await panel.getByRole('textbox',{name:'反馈补充意见',exact:true}).fill(comment)
      const rememberBox=panel.getByRole('checkbox',{name:'同时保存这条负反馈教训',exact:true});await expect(rememberBox).not.toBeChecked();if(remember)await rememberBox.check()
      const submit=panel.getByRole('button',{name:/^(提交|更新)任务反馈$/});await expect(submit).toBeDisabled();await panel.getByRole('checkbox',{name:'确认提交此反馈',exact:true}).check();await expect(submit).toBeEnabled();return submit
    }
    await newCancelledTask('合成反馈任务一：记录员工评价。')
    const first=await draft('合成第一条意见 token=syntheticBrowserFeedbackPrivate')
    await control('drop-next-feedback');await first.click();await expect(panel.getByRole('button',{name:'核对原反馈请求',exact:true})).toBeEnabled()
    const originalRun=(await panel.getByText(/^原任务编号：/).textContent()).match(/[0-9a-f-]{36}/)[0]
    let proof=await control('state','GET');expect(proof.feedbackReceipts).toBe(1);expect(proof.feedbackBodies).toBe(1);expect(proof.feedbackLessons).toBe(1);expect(proof.generated).toBe(0);expect(proof.effects).toBe(0)
    await control('deny-feedback');await control('drop-next-feedback-capabilities');await page.getByRole('button',{name:'刷新',exact:true}).click()
    await expect(page.getByText('反馈暂不可用，刷新后可继续核对原请求。',{exact:true})).toBeVisible();await expect(panel).toHaveCount(0)
    await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('button',{name:/^Agent 配置/}).click();await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await panel.getByRole('button',{name:'核对原反馈请求',exact:true}).click();await expect(panel.getByText('合成第一条意见 token=***',{exact:true})).toBeVisible()
    await expect(panel.getByText(/^用户反馈：/)).toBeVisible();await expect(panel.getByText('当前未开放新反馈，已有反馈仍可核对和删除。',{exact:true})).toBeVisible()
    expect(await panel.textContent()).not.toContain('syntheticBrowserFeedbackPrivate')
    proof=await control('state','GET');expect(proof.feedbackReceipts).toBe(1);expect(proof.feedbackConfirms).toBe(1)
    await panel.getByRole('button',{name:'忘记这条反馈教训',exact:true}).click();await panel.getByRole('button',{name:'确认忘记反馈教训',exact:true}).click()
    await expect(panel.getByText('暂无反馈教训。',{exact:true})).toBeVisible();await expect(panel.getByText('合成第一条意见 token=***',{exact:true})).toBeVisible()
    proof=await control('state','GET');expect(proof.feedbackBodies).toBe(1);expect(proof.feedbackLessons).toBe(0)
    await control('allow-feedback');await page.getByRole('button',{name:'刷新',exact:true}).click()
    const failed=await draft('合成第二条意见 token=syntheticBrowserFeedbackFault');await control('fail-next-feedback-lesson');await failed.click()
    await expect(panel.getByText('反馈已记录，本次教训保存失败。',{exact:true})).toBeVisible();await expect(panel.getByText('合成第二条意见 token=***',{exact:true})).toBeVisible()
    proof=await control('state','GET');expect(proof.feedbackResults).toEqual(['stored','write_failed']);expect(proof.feedbackBodies).toBe(1);expect(proof.feedbackLessons).toBe(0)
    const corrected=await draft('合成第三条意见 token=syntheticBrowserFeedbackCorrection');await corrected.click()
    await expect(panel.getByText('合成第三条意见 token=***',{exact:true})).toBeVisible();await expect(panel.getByText(/^用户反馈：/)).toBeVisible()
    proof=await control('state','GET');expect(proof.feedbackResults).toEqual(['stored','write_failed','stored']);expect(proof.feedbackBodies).toBe(1);expect(proof.feedbackLessons).toBe(1);expect(proof.generated).toBe(0)
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-agent-feedback-owner-and-lesson.png')})
    await control('prune-feedback-task');await panel.getByRole('button',{name:'刷新任务反馈',exact:true}).click()
    await expect(panel.getByText('反馈已修改或原来源不可用，教训内容已隐藏。',{exact:true})).toBeVisible();await expect(panel.getByText('合成第三条意见 token=***',{exact:true})).toBeVisible()
    await panel.getByRole('button',{name:'删除此任务反馈及教训',exact:true}).click();await control('drop-next-feedback');await panel.getByRole('button',{name:'确认删除反馈及教训',exact:true}).click()
    await expect(panel.getByRole('button',{name:'核对原反馈请求',exact:true})).toBeEnabled();await control('deny-feedback');await page.getByRole('button',{name:'刷新',exact:true}).click()
    await panel.getByRole('button',{name:'核对原反馈请求',exact:true}).click();await expect(panel.getByText('此任务反馈及反馈教训已删除。',{exact:true})).toBeVisible()
    proof=await control('state','GET');expect(proof.feedbackBodies).toBe(0);expect(proof.feedbackLessons).toBe(0);expect(proof.feedbackReceipts).toBe(5);expect(proof.feedbackResults).toEqual(['stored','write_failed','stored']);expect(proof.feedbackConfirms).toBe(2);expect(proof.generated).toBe(0);expect(proof.effects).toBe(0)
    await control('allow-feedback');await page.getByRole('button',{name:'刷新',exact:true}).click();await newCancelledTask('合成反馈任务二：核对注销隔离。')
    const last=await draft('第二任务的私有合成意见',false);await control('drop-next-feedback');await last.click();await expect(panel.getByRole('button',{name:'核对原反馈请求',exact:true})).toBeEnabled()
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await expect(page.getByRole('button',{name:'核对原反馈请求',exact:true})).toHaveCount(0);await expect(page.getByText('暂无多轮任务',{exact:true})).toBeVisible();expect(await page.locator('body').textContent()).not.toContain('第二任务的私有合成意见')
    expect(await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-feedback/'+id)).status,originalRun)).toBe(404)
    proof=await control('state','GET');expect(proof.runs).toBe(2);expect(proof.generated).toBe(0);expect(proof.effects).toBe(0);expect(proof.feedbackBodies).toBe(1);expect(proof.feedbackLessons).toBe(0);expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve)),forced=setTimeout(()=>child.kill('SIGTERM'),5000);await exited;clearTimeout(forced)}
  }
})
