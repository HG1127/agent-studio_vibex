import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('early failure source: employee lesson and physical erasure before any provider call',async({},testInfo)=>{
  const approved=requireNativeBrowserCi()
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const childEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY',AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:'true',AGENT_STUDIO_PG_BROWSER_HUMAN:'true',AGENT_STUDIO_PG_BROWSER_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_OUTCOME_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_DERIVED_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_FAILURE_SOURCE:'true'})
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_failure_source_fixture_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_failure_source_fixture_exit_'+code+' '+output.slice(-1500))))
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
    await page.getByRole('combobox',{name:'多轮 Agent 角色',exact:true}).selectOption({label:'Alice Browser Agent · gpt-4.1-mini'})
    await page.getByRole('combobox',{name:'本次方案审核',exact:true}).selectOption('off');await page.getByRole('combobox',{name:'最多规划轮数',exact:true}).selectOption('1')
    const optIn=page.getByRole('checkbox',{name:'任务结束后保存本次经验或教训',exact:true})
    await expect(optIn).not.toBeChecked();await optIn.check()
    await page.getByRole('textbox',{name:'多轮任务要求',exact:true}).fill('合成失败任务 token=syntheticBrowserFailureSourceCredential')
    await page.getByRole('button',{name:'提交多轮任务',exact:true}).click();await expect(page.getByText('多轮任务已提交，等待逐步审批。',{exact:true})).toBeVisible()
    await control('fail-next-preparation');expect((await control('autonomous')).status).toBe('failed')
    await page.getByRole('button',{name:'刷新多轮任务',exact:true}).click()
    const outcome=page.getByRole('region',{name:'本次自动保存',exact:true});await expect(outcome.getByText(/^本次任务曾保存经验或教训/)).toBeVisible()
    const runId=(await outcome.getByText(/^原任务编号：/).textContent()).match(/[0-9a-f-]{36}/)[0]
    let proof=await control('state','GET');expect(proof.failureSources).toBe(1);expect(proof.failPreparation).toBe(false);expect(proof.effects).toBe(0);expect(proof.generated).toBe(0);expect(proof.humanModelCalls).toBe(0);expect(proof.outcomeResults).toEqual(['stored']);expect(proof.derivedEntries).toBe(1)
    await page.getByRole('button',{name:/^Agent 配置/}).click()
    const panel=page.getByRole('region',{name:'任务经验与教训',exact:true});await panel.getByRole('combobox',{name:'来源角色',exact:true}).selectOption({label:'Alice Browser Agent'})
    const item=panel.getByRole('listitem');await expect(item).toHaveCount(1);await expect(item).toContainText('教训');await expect(item).toContainText('synthetic_worker_preparation_failed');await expect(item).not.toContainText('syntheticBrowserFailureSourceCredential')
    const sources=panel.getByRole('combobox',{name:'最近完成的来源任务',exact:true});await expect(sources.locator('option')).toHaveCount(2);await sources.selectOption({index:1});await expect(panel.getByText('待保存的教训',{exact:true})).toBeVisible()
    await expect(panel.getByText(/^当时使用的工具：/)).toHaveCount(0);await expect(panel.getByRole('button',{name:'保存这份任务记忆',exact:true})).toBeDisabled()
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-agent-early-failure-lesson.png')})
    await item.getByRole('button',{name:'忘记这条任务记忆',exact:true}).click();await item.getByRole('button',{name:'确认忘记任务记忆',exact:true}).click();await expect(panel.getByText('暂无任务记忆',{exact:true})).toBeVisible()
    expect((await control('autonomous')).status).toBe('idle')
    proof=await control('state','GET');expect(proof.failureSources).toBe(1);expect(proof.derivedEntries).toBe(0);expect(proof.derivedReceipts).toBe(2);expect(proof.outcomeResults).toEqual(['stored']);expect(proof.generated).toBe(0);expect(proof.effects).toBe(0);expect(proof.httpCalls).toBe(0);expect(proof.mcpCalls).toBe(0)
    await page.getByRole('button',{name:'多轮 Agent',exact:true}).click();await outcome.getByRole('button',{name:'刷新自动保存状态',exact:true}).click();await expect(outcome.getByText(/^本次任务曾保存经验或教训/)).toBeVisible()
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click();await expect(page.getByText('暂无多轮任务',{exact:true})).toBeVisible()
    expect(await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-outcome-memories/'+id)).status,runId)).toBe(404)
    await page.getByRole('button',{name:/^Agent 配置/}).click();await expect(panel.getByRole('combobox',{name:'来源角色',exact:true})).not.toContainText('Alice Browser Agent')
    await panel.getByRole('combobox',{name:'来源角色',exact:true}).selectOption({label:'Bob Browser Agent'});await expect(panel.getByText('暂无任务记忆',{exact:true})).toBeVisible();await expect(panel.getByText(/synthetic_worker_preparation_failed/)).toHaveCount(0);expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve)),forced=setTimeout(()=>child.kill('SIGTERM'),5000);await exited;clearTimeout(forced)}
  }
})
