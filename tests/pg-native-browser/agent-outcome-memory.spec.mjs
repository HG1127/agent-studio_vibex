import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('outcome storage: explicit admission, original recovery, physical erasure, privacy stop and employee isolation',async({},testInfo)=>{
  const approved=requireNativeBrowserCi()
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const childEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY',AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:'true',AGENT_STUDIO_PG_BROWSER_HUMAN:'true',AGENT_STUDIO_PG_BROWSER_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_OUTCOME_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_DERIVED_MEMORY:'true'})
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_outcome_memory_fixture_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_outcome_memory_fixture_exit_'+code+' '+output.slice(-1500))))
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
    const optIn=page.getByRole('checkbox',{name:'任务结束后保存本次经验或教训',exact:true}),field=page.getByRole('textbox',{name:'多轮任务要求',exact:true}),submit=page.getByRole('button',{name:'提交多轮任务',exact:true})
    const panel=page.getByRole('region',{name:'本次自动保存',exact:true}),refresh=()=>page.getByRole('button',{name:'刷新多轮任务',exact:true}).click()
    await expect(optIn).not.toBeChecked();await optIn.check();await field.fill('合成本人任务一：保存可核对的经验。')
    await control('drop-next');await submit.click();await expect(page.getByRole('button',{name:'确认上次多轮提交',exact:true})).toBeEnabled()
    await control('deny-outcome-memory');await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(optIn).toBeChecked();await expect(optIn).toBeDisabled()
    await page.getByRole('button',{name:'确认上次多轮提交',exact:true}).click();await expect(page.getByText('已确认上次提交，未创建重复任务。',{exact:true})).toBeVisible()
    let proof=await control('state','GET');expect(proof.runs).toBe(1);expect(proof.outcomeConsents).toBe(1);expect(proof.submitHashes[0]).toBe(proof.submitHashes[1]);expect(proof.generated).toBe(0)
    const advance=async()=>{for(let i=0;i<20;i++){
      const tick=await control('autonomous');await refresh()
      if(tick.status==='succeeded')return
      expect(['failed','paused','cancelled'].includes(tick.status)).toBe(false)
      if(tick.status==='awaiting_approval'){const approval=page.getByRole('region',{name:'当前步骤审批',exact:true});await approval.getByRole('checkbox').check();await approval.getByRole('button',{name:'批准当前步骤',exact:true}).click();await expect(page.getByText('已批准当前步骤。',{exact:true})).toBeVisible()}
    }throw Error('synthetic_outcome_browser_transition_limit')}
    await advance();await expect(panel.getByText(/^本次任务曾保存经验或教训/)).toBeVisible()
    proof=await control('state','GET');expect(proof.outcomeResults).toEqual(['stored']);expect(proof.derivedEntries).toBe(1);expect(proof.generated).toBe(1)
    await page.getByRole('button',{name:/^Agent 配置/}).click()
    const memories=page.getByRole('region',{name:'任务经验与教训',exact:true});await memories.getByRole('combobox',{name:'来源角色',exact:true}).selectOption({label:'Alice Browser Agent'})
    const item=memories.getByRole('listitem');await expect(item).toHaveCount(1);await item.getByRole('button',{name:'忘记这条任务记忆',exact:true}).click();await item.getByRole('button',{name:'确认忘记任务记忆',exact:true}).click();await expect(memories.getByText('暂无任务记忆',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:'多轮 Agent',exact:true}).click();await panel.getByRole('button',{name:'刷新自动保存状态',exact:true}).click();await expect(panel.getByText(/^本次任务曾保存经验或教训/)).toBeVisible();expect((await control('state','GET')).derivedEntries).toBe(0)
    await control('allow-outcome-memory');await page.getByRole('button',{name:'刷新',exact:true}).click();await optIn.check();await field.fill('合成本人任务二：在执行前停止自动保存。');await submit.click()
    await expect(page.getByText('多轮任务已提交，等待逐步审批。',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'停止本次自动保存',exact:true})).toBeEnabled()
    await panel.getByRole('button',{name:'停止本次自动保存',exact:true}).click();await control('drop-next-outcome-stop');await panel.getByRole('button',{name:'确认停止自动保存',exact:true}).click()
    await expect(panel.getByRole('button',{name:'核对原自动保存停止请求',exact:true})).toBeEnabled()
    await control('deny-outcome-memory');await control('drop-next-outcome-capabilities');await page.getByRole('button',{name:'刷新',exact:true}).click()
    await expect(page.getByText('自动保存暂不可用，刷新后可继续核对原请求。',{exact:true})).toBeVisible();await expect(panel).toHaveCount(0)
    await page.getByRole('button',{name:'刷新',exact:true}).click();await panel.getByRole('button',{name:'核对原自动保存停止请求',exact:true}).click();await expect(panel.getByText(/^本次任务后续自动保存已停止/)).toBeVisible()
    proof=await control('state','GET');expect(proof.runs).toBe(2);expect(proof.generated).toBe(1);expect(proof.outcomeStops).toBe(1);expect(proof.outcomeHashes).toHaveLength(1);expect(proof.outcomeConfirms).toBe(1)
    await advance();await expect(panel.getByText('本次自动保存已停止，任务结果已保留。',{exact:true})).toBeVisible()
    proof=await control('state','GET');expect(proof.outcomeResults).toEqual(['stored','revoked']);expect(proof.derivedEntries).toBe(0);expect(proof.derivedReceipts).toBe(2);expect(proof.generated).toBe(2);expect(proof.humanModelCalls).toBe(2)
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-agent-outcome-memory-owner-stop.png')})
    // A second lost stop is deliberately left pending at logout. The next
    // employee receives neither its request nor the former employee's tasks.
    await control('allow-outcome-memory');await page.getByRole('button',{name:'刷新',exact:true}).click();await optIn.check();await field.fill('合成本人任务三：仅核对退出后的原请求隔离。');await submit.click()
    await expect(panel.getByRole('button',{name:'停止本次自动保存',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'停止本次自动保存',exact:true}).click();await control('drop-next-outcome-stop');await panel.getByRole('button',{name:'确认停止自动保存',exact:true}).click();await expect(panel.getByRole('button',{name:'核对原自动保存停止请求',exact:true})).toBeEnabled()
    const originalRun=(await panel.getByText(/^原任务编号：/).textContent()).match(/[0-9a-f-]{36}/)[0]
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await page.getByRole('button',{name:'多轮 Agent',exact:true}).click()
    await expect(page.getByRole('combobox',{name:'多轮 Agent 角色',exact:true})).not.toContainText('Alice Browser Agent');await expect(page.getByRole('button',{name:'核对原自动保存停止请求',exact:true})).toHaveCount(0);await expect(page.getByText('暂无多轮任务',{exact:true})).toBeVisible()
    expect(await page.evaluate(async id=>(await fetch('/__pg_native/api/v2/agent-outcome-memories/'+id)).status,originalRun)).toBe(404)
    proof=await control('state','GET');expect(proof.runs).toBe(3);expect(proof.outcomeConsents).toBe(3);expect(proof.outcomeStops).toBe(2);expect(proof.generated).toBe(2);expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve)),forced=setTimeout(()=>child.kill('SIGTERM'),5000);await exited;clearTimeout(forced)}
  }
})
