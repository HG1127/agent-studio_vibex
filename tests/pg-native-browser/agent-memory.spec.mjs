import {test,expect,chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

test('owner memory: lost save, navigation, 500-unit storage, irreversible forget, read-only confirmation and employee isolation',async({},testInfo)=>{
  const approved=requireNativeBrowserCi() // FIRST: no child/browser/files/network before this.
  const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)))
  const childEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]))
  Object.assign(childEnv,{AGENT_STUDIO_PG_BROWSER_FIXTURE:'SYNTHETIC_LOCAL_ONLY',AGENT_STUDIO_PG_BROWSER_AUTONOMOUS:'true',AGENT_STUDIO_PG_BROWSER_HUMAN:'true',AGENT_STUDIO_PG_BROWSER_MEMORY:'true'})
  const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let output='',timer,browser,context,page,control
  const ready=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('synthetic_memory_fixture_start_timeout')),45000)
    const chunk=data=>{output=(output+data.toString()).slice(-32768);for(const line of output.split(/\r?\n/))if(line.startsWith('{"synthetic_only":true,'))try{resolve(JSON.parse(line))}catch{}}
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',reject);child.once('exit',code=>reject(Error('synthetic_memory_fixture_exit_'+code+' '+output.slice(-1500))))
  })
  try{
    const info=await ready;clearTimeout(timer)
    expect(info.synthetic_only).toBe(true);expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536).toBe(true)
    control=async(name,method='POST')=>{const response=await fetch('http://127.0.0.1:'+info.apiPort+'/__fixture/'+name,{method,headers:{'X-AgentStudio-Synthetic-Fixture':'1'},signal:AbortSignal.timeout(15000)});expect(response.status).toBe(200);return response.json()}
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
    const external=[]
    await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==approved.origin){external.push(route.request().url());await route.abort()}else await route.continue()})
    page=await context.newPage();await page.goto(info.url,{waitUntil:'domcontentloaded'})
    const login=async who=>{await page.getByRole('textbox',{name:'员工邮箱',exact:true}).fill(who+'@example.com');await page.getByLabel('密码',{exact:true}).fill(who==='alice'?'SyntheticAlicePassword#2026':'SyntheticBobPassword#2026');await page.getByRole('button',{name:'登录独立工作台',exact:true}).click();await expect(page.getByRole('button',{name:'多轮 Agent',exact:true})).toBeVisible()}
    await login('alice');await page.getByRole('button',{name:/^Agent 配置/}).click()
    const panel=page.getByRole('region',{name:'本人角色记忆',exact:true}),field=panel.getByRole('textbox',{name:'要记住的内容',exact:true}),save=panel.getByRole('button',{name:'保存记忆',exact:true})
    await panel.getByRole('combobox',{name:'记忆所属角色',exact:true}).selectOption({label:'Alice Browser Agent'})
    const original='财务报告使用中文。token=syntheticMemorySecret',clean='财务报告使用中文。token=***'
    await field.fill(original);await expect(save).toBeDisabled();await panel.getByRole('checkbox',{name:'确认保存本人角色记忆',exact:true}).check()
    await control('drop-next-memory');await save.click();await expect(panel.getByRole('button',{name:'核对原记忆请求',exact:true})).toBeEnabled()
    await page.getByRole('button',{name:/^知识库 /}).click();await page.getByRole('button',{name:/^Agent 配置/}).click()
    await expect(panel.getByRole('button',{name:'核对原记忆请求',exact:true})).toBeEnabled()
    await panel.getByRole('button',{name:'核对原记忆请求',exact:true}).click()
    await expect(panel.getByText(clean,{exact:true})).toBeVisible();await expect(field).toHaveValue('')
    await expect(panel.getByRole('checkbox',{name:'确认保存本人角色记忆',exact:true})).not.toBeChecked()
    expect(await panel.textContent()).not.toContain('syntheticMemorySecret')
    let proof=await control('state','GET');expect(proof.memoryHashes).toHaveLength(1);expect(proof.memoryConfirms).toBe(1);expect(proof.memoryEntries).toBe(1);expect(proof.memoryReceipts).toBe(1)
    const full='约定'.repeat(250);expect(full.length).toBe(500)
    await field.fill(full);await panel.getByRole('checkbox',{name:'确认保存本人角色记忆',exact:true}).check();await save.click()
    await expect(panel.getByText(full,{exact:true})).toBeVisible();await expect(field).toHaveValue('')
    const first=panel.getByRole('listitem').filter({hasText:clean})
    await first.getByRole('button',{name:'忘记这条记忆',exact:true}).click();await expect(first.getByRole('button',{name:'确认忘记',exact:true})).toBeEnabled()
    await first.getByRole('button',{name:'保留记忆',exact:true}).click();expect((await control('state','GET')).memoryHashes).toHaveLength(2)
    await first.getByRole('button',{name:'忘记这条记忆',exact:true}).click();await control('drop-next-memory');await first.getByRole('button',{name:'确认忘记',exact:true}).click()
    await expect(panel.getByRole('button',{name:'核对原记忆请求',exact:true})).toBeEnabled()
    await control('deny-config');await page.getByRole('button',{name:'刷新',exact:true}).click()
    await expect(panel.getByText('当前可查看记忆和核对已有请求，保存与忘记尚未开放。',{exact:true})).toBeVisible()
    await expect(panel.getByRole('button',{name:'重新提交同一记忆请求',exact:true})).toBeDisabled()
    await panel.getByRole('button',{name:'核对原记忆请求',exact:true}).click()
    await expect(panel.getByText(clean,{exact:true})).toHaveCount(0);await expect(panel.getByText(full,{exact:true})).toBeVisible()
    proof=await control('state','GET');expect(proof.memoryHashes.map(row=>row.action)).toEqual(['remember','remember','forget']);expect(proof.memoryConfirms).toBe(2);expect(proof.memoryEntries).toBe(1);expect(proof.memoryReceipts).toBe(3)
    expect(proof.generated).toBe(0);expect(proof.humanModelCalls).toBe(0);expect(proof.runs).toBe(0)
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('native-agent-memory-owner-viewport.png')})
    await page.getByRole('button',{name:'退出',exact:true}).click();await login('bob');await page.getByRole('button',{name:/^Agent 配置/}).click()
    await expect(panel.getByRole('combobox')).not.toContainText('Alice Browser Agent');await panel.getByRole('combobox').selectOption({label:'Bob Browser Agent'})
    await expect(panel.getByText('暂无记忆',{exact:true})).toBeVisible();await expect(panel.getByText(full,{exact:true})).toHaveCount(0)
    expect(external).toEqual([])
  }finally{
    clearTimeout(timer);if(context)await context.close();if(browser)await browser.close();if(control)await control('stop').catch(()=>{})
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve)),forced=setTimeout(()=>child.kill('SIGTERM'),5000);await exited;clearTimeout(forced)}
  }
})
