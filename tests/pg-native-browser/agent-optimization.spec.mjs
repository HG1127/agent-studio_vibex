import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('employee feedback role acceptance: complete preview, real history, lost original after erasure and later edit, closed scope and logout isolation',async({},testInfo)=>{
  const approved=requireNativeBrowserCi()
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const childEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY',AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:'true',AGENT_STUDIO_PG_BROWSER_HUMAN:'true',AGENT_STUDIO_PG_BROWSER_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_OUTCOME_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_DERIVED_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_FAILURE_SOURCE:'true',AGENT_STUDIO_PG_BROWSER_FEEDBACK:'true',AGENT_STUDIO_PG_BROWSER_OPTIMIZATION:'true'})
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_optimization_fixture_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_optimization_fixture_exit_'+code+' '+output.slice(-1500))))
  })
  try{
    const info=await ready;clearTimeout(timer);expect(info.synthetic_only).toBe(true);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method='POST')=>{const response=await fetch('http://127.0.0.1:'+info.apiPort+'/__fixture/'+name,{method,headers:{'X-AgentStudio-Synthetic-Fixture':'1'},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
    const external=[];await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();await page.goto(info.url,{waitUntil:'domcontentloaded'})
    const login=async who=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(who+'@example.com');await page.getByLabel('密码',{exact:true}).fill(who==='alice'?'SyntheticAlicePassword#2026':'SyntheticBobPassword#2026');await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await expect(page.getByRole('button',{name:'多轮 Agent',exact:true})).toBeVisible()}
    await login('alice');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    const panel=page.getByRole('region',{name:'根据反馈修改角色',exact:true}),feedback=page.getByRole('region',{name:'任务反馈',exact:true})
    const task=async label=>{
      await page.getByRole('combobox',{name:'多轮 Agent 角色',exact:true}).selectOption({label:'Alice Browser Agent · gpt-4.1-mini'})
      await page.getByRole('combobox',{name:'本次方案审核',exact:true}).selectOption('off');await page.getByRole('combobox',{name:'最多规划轮数',exact:true}).selectOption('1')
      await page.getByRole('textbox',{name:'多轮任务要求',exact:true}).fill(label);await page.getByRole('button',{name:'提交多轮任务',exact:true}).click()
      await page.getByRole('button',{name:'取消任务',exact:true}).click();await page.getByRole('button',{name:'确认取消此任务',exact:true}).click()
      await expect(feedback.getByRole('combobox',{name:'任务评价',exact:true})).toBeEnabled()
      await feedback.getByRole('combobox',{name:'任务评价',exact:true}).selectOption('down')
      await feedback.getByRole('textbox',{name:'反馈补充意见',exact:true}).fill('合成反馈：补充核对依据 token=syntheticOptimizationBrowserPrivate')
      await feedback.getByRole('checkbox',{name:'确认提交此反馈',exact:true}).check();await feedback.getByRole('button',{name:'提交任务反馈',exact:true}).click()
      await expect(feedback.getByText('合成反馈：补充核对依据 token=***',{exact:true})).toBeVisible()
      await panel.getByRole('button',{name:'读取当前反馈与角色',exact:true}).click();await expect(panel.getByRole('textbox',{name:/^描述目标/})).toBeEnabled()
    }
    await task('合成角色接受任务一，取消后由本人手工修正角色。')
    const goal=panel.getByRole('textbox',{name:/^描述目标/}),scope=panel.getByRole('textbox',{name:/^描述范围/})
    await expect(goal).toHaveAttribute('maxlength','3000');await expect(scope).toHaveAttribute('maxlength','4000')
    await goal.fill('合'.repeat(3000));await scope.fill('范'.repeat(4000));await panel.getByRole('textbox',{name:'交付物 1',exact:true}).fill('交'.repeat(500));await panel.getByRole('textbox',{name:'任务计划 1',exact:true}).fill('计'.repeat(500));await panel.getByRole('textbox',{name:'完成标准 1',exact:true}).fill('验'.repeat(500))
    await panel.getByRole('button',{name:'预览这次角色修改',exact:true}).click();await expect(panel.getByLabel('角色修改预览',{exact:true})).toBeVisible()
    await expect(panel.getByRole('button',{name:'接受这次角色修改',exact:true})).toBeDisabled()
    let proof=await control('state','GET');expect(proof.optimizationLinks).toBe(0);expect(proof.optimizationCurrent.revision).toBe(1);expect(proof.generated).toBe(0)
    await goal.fill('合成角色修正：逐项核对依据后再交付。');await scope.fill('保留完整描述、模型、工具与知识配置。');await expect(panel.getByLabel('角色修改预览',{exact:true})).toHaveCount(0)
    await panel.getByRole('button',{name:'预览这次角色修改',exact:true}).click();const preview=panel.getByLabel('角色修改预览',{exact:true});await expect(preview).toBeVisible()
    await expect(panel.getByRole('checkbox',{name:'确认接受这次反馈角色修改',exact:true})).not.toBeChecked();await expect(panel.getByRole('button',{name:'接受这次角色修改',exact:true})).toBeDisabled()
    await preview.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-feedback-role-preview-confirmation.png')})
    await panel.getByRole('checkbox',{name:'确认接受这次反馈角色修改',exact:true}).check();await control('drop-next-optimization');await panel.getByRole('button',{name:'接受这次角色修改',exact:true}).click()
    await expect(panel.getByRole('button',{name:'核对原角色接受请求',exact:true})).toBeEnabled();const originalRun=(await panel.getByText(/^原任务编号：/).textContent()).match(/[0-9a-f-]{36}/)[0]
    proof=await control('state','GET');expect(proof.optimizationLinks).toBe(1);expect(proof.optimizationIntents).toBe(1);expect(proof.optimizationCurrent.goal).toBe('合成角色修正：逐项核对依据后再交付。');expect(proof.optimizationCurrent.deliverables).toEqual(['交'.repeat(500)]);expect(proof.optimizationCurrent.plan).toEqual(['计'.repeat(500)]);expect(proof.optimizationCurrent.criteria).toEqual(['验'.repeat(500)]);expect(proof.optimizationCurrent.model_preserved).toBe(true);expect(proof.optimizationCurrent.tools).toEqual(['calculate']);expect(proof.optimizationHistory).toEqual([{before_kind:'before_edit',after_kind:'edited',before_revision:1,after_revision:2}])
    const initialHistory=await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-optimizations?spec_id='+id)).json(),proof.optimizationRole);expect(initialHistory.items[0].feedback_unchanged).toBe(true);expect(initialHistory.items[0].role_current).toBe(true)
    await control('prune-feedback-task');await feedback.getByRole('button',{name:'删除此任务反馈及教训',exact:true}).click();await feedback.getByRole('button',{name:'确认删除反馈及教训',exact:true}).click();await expect(feedback.getByText('此任务反馈及反馈教训已删除。',{exact:true})).toBeVisible()
    await control('optimization-later-role');await control('deny-optimization');await control('drop-next-optimization-capabilities');await page.getByRole('button',{name:'刷新',exact:true}).click()
    await expect(page.getByText('角色修改暂不可用，刷新后可继续核对原接受请求。',{exact:true})).toBeVisible();await expect(panel).toHaveCount(0)
    await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('button',{name:/^Agent 配置/}).click();await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await panel.getByRole('button',{name:'核对原角色接受请求',exact:true}).click();await expect(panel.getByText('角色修改已记录，可在接受记录中核对反馈与版本。',{exact:true})).toBeVisible()
    await expect(panel.getByText('参考反馈已修改或删除；角色已有后续修改。',{exact:true})).toBeVisible();await expect(panel.getByText('当前未开放新的角色接受，已有接受记录仍可核对。',{exact:true})).toBeVisible()
    expect(await panel.textContent()).not.toContain('syntheticOptimizationBrowserPrivate');proof=await control('state','GET');expect(proof.optimizationLinks).toBe(1);expect(proof.optimizationHashes.length).toBe(1);expect(proof.optimizationConfirms).toBe(1);expect(proof.feedbackBodies).toBe(0);expect(proof.feedbackLessons).toBe(0);expect(proof.optimizationCurrent.goal).toBe('Synthetic later ordinary owner goal');expect(proof.generated).toBe(0);expect(proof.effects).toBe(0)
    await panel.getByLabel('反馈角色接受记录',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-feedback-role-accepted-lineage.png')})
    await control('allow-optimization');await page.getByRole('button',{name:'刷新',exact:true}).click();await task('合成角色接受任务二，核对注销后的私人候选隔离。')
    await goal.fill('合成第二次角色修正');await panel.getByRole('button',{name:'预览这次角色修改',exact:true}).click();await panel.getByRole('checkbox',{name:'确认接受这次反馈角色修改',exact:true}).check();await control('drop-next-optimization');await panel.getByRole('button',{name:'接受这次角色修改',exact:true}).click();await expect(panel.getByRole('button',{name:'核对原角色接受请求',exact:true})).toBeEnabled()
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click();await expect(page.getByRole('button',{name:'核对原角色接受请求',exact:true})).toHaveCount(0);await expect(page.getByText('暂无多轮任务',{exact:true})).toBeVisible();expect(await page.locator('body').textContent()).not.toContain('合成第二次角色修正')
    expect(await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-feedback/'+id)).status,originalRun)).toBe(404);expect(await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-optimizations?spec_id='+id)).status,proof.optimizationRole)).toBe(404)
    proof=await control('state','GET');expect(proof.runs).toBe(2);expect(proof.optimizationLinks).toBe(2);expect(proof.optimizationHashes.length).toBe(2);expect(proof.generated).toBe(0);expect(proof.effects).toBe(0);expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve)),forced=setTimeout(()=>child.kill('SIGTERM'),5000);await exited;clearTimeout(forced)}
  }
})
