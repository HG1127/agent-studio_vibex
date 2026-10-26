import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('owned task memory: explicit source preview, lost-reply recovery, revoked source erasure and employee isolation',async({},testInfo)=>{
  const approved=requireNativeBrowserCi()
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const childEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY',AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:'true',AGENT_STUDIO_PG_BROWSER_HUMAN:'true',AGENT_STUDIO_PG_BROWSER_MEMORY:'true',AGENT_STUDIO_PG_BROWSER_MEMORY_RUNTIME:'true',AGENT_STUDIO_PG_BROWSER_DERIVED_MEMORY:'true'})
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_derived_memory_fixture_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_derived_memory_fixture_exit_'+code+' '+output.slice(-1500))))
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
    await page.getByRole('textbox',{name:'多轮任务要求',exact:true}).fill('记住：财务报告使用中文。整理财务报告');await page.getByRole('button',{name:'提交多轮任务',exact:true}).click()
    await expect(page.getByText('多轮任务已提交，等待逐步审批。',{exact:true})).toBeVisible()
    let finished=false
    for(let i=0;i<20;i++){
      const tick=await control('autonomous');await page.getByRole('button',{name:'刷新多轮任务',exact:true}).click()
      if(tick.status==='succeeded'){finished=true;break}
      expect(['failed','paused','cancelled'].includes(tick.status)).toBe(false)
      if(tick.status==='awaiting_approval'){const approval=page.getByRole('region',{name:'当前步骤审批',exact:true});await approval.getByRole('checkbox').check();await approval.getByRole('button',{name:'批准当前步骤',exact:true}).click();await expect(page.getByText('已批准当前步骤。',{exact:true})).toBeVisible()}
    }
    expect(finished).toBe(true);expect((await control('state','GET')).generated).toBe(1)
    await page.getByRole('button',{name:/^Agent 配置/}).click()
    const panel=page.getByRole('region',{name:'任务经验与教训',exact:true}),source=page.getByRole('region',{name:'本人角色记忆',exact:true})
    await panel.getByRole('combobox',{name:'来源角色',exact:true}).selectOption({label:'Alice Browser Agent'})
    const select=panel.getByRole('combobox',{name:'最近完成的来源任务',exact:true});await expect(select).toBeEnabled();await expect(select.locator('option')).toHaveCount(2);await select.selectOption({index:1})
    const fact=('已核对本人方案，交付完整合成报告。\n'.repeat(400)).slice(0,500)
    await expect(panel.getByText(fact,{exact:true})).toBeVisible();const save=panel.getByRole('button',{name:'保存这份任务记忆',exact:true});await expect(save).toBeDisabled()
    await panel.getByRole('checkbox',{name:'确认保存这份任务记忆',exact:true}).check();await control('drop-next-derived-memory');await save.click()
    await expect(panel.getByRole('button',{name:'核对原任务记忆请求',exact:true})).toBeEnabled()
    await control('deny-derived-memory');await control('drop-next-derived-capabilities');await page.getByRole('button',{name:'刷新',exact:true}).click()
    await expect(page.getByText('任务记忆暂不可用，刷新后可继续核对原请求。',{exact:true})).toBeVisible();await expect(panel).toHaveCount(0)
    await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(panel.getByRole('button',{name:'重新提交同一任务记忆请求',exact:true})).toBeDisabled()
    await panel.getByRole('button',{name:'核对原任务记忆请求',exact:true}).click();await expect(panel.getByRole('listitem').filter({hasText:fact})).toHaveCount(1)
    let proof=await control('state','GET');expect(proof.derivedEntries).toBe(1);expect(proof.derivedReceipts).toBe(1);expect(proof.derivedHashes.map(row=>row.action)).toEqual(['save_success']);expect(proof.generated).toBe(1)
    await source.getByRole('combobox',{name:'记忆所属角色',exact:true}).selectOption({label:'Alice Browser Agent'})
    const original=source.getByRole('listitem').filter({hasText:'财务报告使用中文'});await original.getByRole('button',{name:'忘记这条记忆',exact:true}).click();await original.getByRole('button',{name:'确认忘记',exact:true}).click();await expect(source.getByText('暂无记忆',{exact:true})).toBeVisible()
    await panel.getByRole('button',{name:'刷新任务记忆',exact:true}).click();await expect(panel.getByText('原任务来源已变化，内容已隐藏。你仍可忘记此记录。',{exact:true})).toBeVisible();await expect(panel.getByText(fact,{exact:true})).toHaveCount(0)
    await control('allow-derived-memory');await page.getByRole('button',{name:'刷新',exact:true}).click()
    const item=panel.getByRole('listitem');await item.getByRole('button',{name:'忘记这条任务记忆',exact:true}).click();await control('drop-next-derived-memory');await item.getByRole('button',{name:'确认忘记任务记忆',exact:true}).click()
    await expect(panel.getByRole('button',{name:'核对原任务记忆请求',exact:true})).toBeEnabled();await control('deny-derived-memory');await page.getByRole('button',{name:'刷新',exact:true}).click();await panel.getByRole('button',{name:'核对原任务记忆请求',exact:true}).click()
    await expect(panel.getByText('暂无任务记忆',{exact:true})).toBeVisible();proof=await control('state','GET')
    expect(proof.derivedHashes.map(row=>row.action)).toEqual(['save_success','forget']);expect(proof.derivedConfirms).toBe(2);expect(proof.derivedEntries).toBe(0);expect(proof.derivedReceipts).toBe(2);expect(proof.generated).toBe(1);expect(proof.runs).toBe(1)
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-agent-derived-memory-erasure.png')})
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await page.getByRole('button',{name:/^Agent 配置/}).click();await expect(panel.getByRole('combobox',{name:'来源角色',exact:true})).not.toContainText('Alice Browser Agent')
    await panel.getByRole('combobox',{name:'来源角色',exact:true}).selectOption({label:'Bob Browser Agent'});await expect(panel.getByText('暂无任务记忆',{exact:true})).toBeVisible();await expect(panel.getByText(fact,{exact:true})).toHaveCount(0);expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve)),forced=setTimeout(()=>child.kill('SIGTERM'),5000);await exited;clearTimeout(forced)}
  }
})
