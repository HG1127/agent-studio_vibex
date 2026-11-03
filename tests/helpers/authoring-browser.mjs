import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {chromium,expect} from '@playwright/test'
export async function verifyAuthoringBrowser({root,backendOrigin,modelCalls}){
  const dist=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-authoring-ui-'));let browser,vite,logs=''
  try{
    await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config','vibex-local/vite.local.config.ts','--outDir',dist],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=768 --v8-pool-size=1'}});p.stdout.on('data',b=>{logs=(logs+b).slice(-3000)});p.stderr.on('data',b=>{logs=(logs+b).slice(-3000)});p.once('error',reject);p.once('close',code=>code===0?resolve():reject(Error(logs)))})
    const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),origin=`http://127.0.0.1:${port}`
    vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config','vibex-local/vite.local.config.ts','--outDir',dist,'--port',String(port),'--strictPort'],{cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_PB_ORIGIN:backendOrigin}});vite.stdout.on('data',b=>{logs=(logs+b).slice(-3000)});vite.stderr.on('data',b=>{logs=(logs+b).slice(-3000)})
    for(let n=0;n<100;n++){try{if((await fetch(origin)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const context=await browser.newContext({viewport:{width:1360,height:1100}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
    await page.goto(origin+'/login');await page.getByLabel('工作邮箱').fill('owner@example.test');await page.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(url=>url.pathname!=='/login')
    await page.goto(origin+'/agent-create');const requirement='PRIVATE_BROWSER_SOURCE：需要 OCR、关系图和持续监测，生成内容不能省略这些要求。',before=modelCalls()
    await page.locator('#agent-requirement').fill(requirement);await page.getByRole('button',{name:'预览要求与能力依赖',exact:true}).click()
    const preflight=page.getByRole('region',{name:'生成前需求预览'});await expect(preflight).toContainText('扫描材料 OCR');await expect(preflight).toContainText('可追溯业务关系图');await expect(preflight).toContainText('需开发');assert.equal(modelCalls(),before,'No model call before employee reviews the dependency preview')
    await page.getByRole('button',{name:'确认要求并生成方案',exact:true}).click();await page.getByText(/已生成可编辑方案/).waitFor();assert.equal(modelCalls(),before+1);await page.getByRole('button',{name:'进入方案编辑',exact:false}).click();await page.getByLabel('助手名称',{exact:true}).first().waitFor()
    const source=page.getByRole('region',{name:'原始需求与能力预览'}).first();await expect(source).toContainText('扫描材料 OCR');await expect(source).toContainText('需开发')
    const savedResponse=page.waitForResponse(r=>r.url().includes('/api/agent_specs')&&r.request().method()==='POST')
    await page.getByRole('button',{name:'仅保存草稿',exact:true}).click();const saved=await (await savedResponse).json();assert.ok(saved.id);assert.ok(saved.spec._studio_authoring?.request_id);await page.getByText('已保存',{exact:true}).first().waitFor()
    await page.goto(origin+'/agent-create?spec='+saved.id+'&step=2');await expect(source).toContainText('可追溯业务关系图');await source.locator('summary').filter({hasText:'读取原始需求与修订'}).click();await expect(source).toContainText(requirement)
    await source.screenshot({path:path.join(root,'.tmp/research-validation/authoring-browser.png')})
    // The original login/account menu now use a backend service. Exercise the
    // real default PB binding through these same employee pages, including a
    // refresh and a protected route after confirmed logout.
    await page.goto(origin+'/');await page.reload()
    const card=page.locator('#my-specs li').filter({has:page.locator('a[href="/agent-run?spec='+saved.id+'"]')})
    await expect(card).toBeVisible()
    await card.getByRole('button',{name:'收藏：'+saved.name,exact:true}).click()
    await expect(card.getByRole('button',{name:'取消收藏：'+saved.name,exact:true})).toHaveAttribute('aria-pressed','true')
    await page.reload();await expect(card.getByRole('button',{name:'取消收藏：'+saved.name,exact:true})).toHaveAttribute('aria-pressed','true')
    await card.getByRole('button',{name:'编辑方案：'+saved.name,exact:true}).click()
    const originalName='Browser original editor',quickName='Browser quick editor'
    await page.getByLabel('助手名称',{exact:true}).first().fill(originalName)
    const originalSave=page.waitForResponse(r=>r.url().endsWith('/api/agent_specs/'+saved.id)&&r.request().method()==='PATCH')
    await page.getByRole('button',{name:'保存到我的助手',exact:true}).first().click()
    assert.equal((await originalSave).status(),200)
    await page.getByRole('button',{name:'已保存',exact:true}).first().waitFor()
    // Home intentionally opens its current unsaved draft. The independent
    // saved-Agent drawer belongs to other routes; use a second employee tab
    // so the first editor keeps the actual older server version for CAS.
    const quickPage=await page.context().newPage()
    quickPage.on('pageerror',e=>errors.push(e.message))
    // New employee logins are intentionally session-only per browser tab.
    await quickPage.goto(origin+'/login?next='+encodeURIComponent('/agent-run?spec='+saved.id))
    await quickPage.getByLabel('工作邮箱').fill('owner@example.test')
    await quickPage.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026')
    await quickPage.getByRole('button',{name:'登录',exact:true}).click()
    await quickPage.waitForURL(url=>url.pathname==='/agent-run')
    await quickPage.getByRole('button',{name:'随时调整 Agent 方案',exact:true}).click()
    const quick=quickPage.getByRole('dialog',{name:'随时调整 Agent 方案',exact:true})
    await quick.getByLabel('当前 Agent',{exact:true}).selectOption(saved.id)
    await quick.getByLabel('助手名称',{exact:true}).fill(quickName)
    const quickSave=quickPage.waitForResponse(r=>r.url().endsWith('/api/agent_specs/'+saved.id)&&r.request().method()==='PATCH')
    await quick.getByRole('button',{name:'保存方案',exact:true}).click()
    const quickResponse=await quickSave;assert.equal(quickResponse.status(),200)
    const quickSaved=await quickResponse.json();assert.equal(quickSaved.name,quickName);assert.deepEqual(quickSaved.spec._studio_authoring,saved.spec._studio_authoring)
    await expect(quick.getByRole('button',{name:'保存方案',exact:true})).toBeDisabled()
    await quick.screenshot({path:path.join(root,'.tmp/research-validation/studio-agent-quick-editor.png')})
    await quickPage.keyboard.press('Escape');await expect(quick).toBeHidden()
    await quickPage.close();await page.bringToFront()
    // The workbench still has the version read before the independent drawer
    // saved. It must preserve this new draft on the actual PB timestamp CAS.
    await page.getByLabel('助手名称',{exact:true}).first().fill('Unsubmitted stale draft')
    const conflict=page.waitForResponse(r=>r.url().endsWith('/api/agent_specs/'+saved.id)&&r.request().method()==='PATCH')
    await page.getByRole('button',{name:'保存到我的助手',exact:true}).first().click()
    assert.equal((await conflict).status(),409)
    await expect(page.getByLabel('助手名称',{exact:true}).first()).toHaveValue('Unsubmitted stale draft')
    await expect(page.getByText(/该 Agent 已在其他页面或协作流程中更新/).first()).toBeVisible()
    await page.getByRole('button',{name:'刷新 Agent 列表',exact:true}).click()
    await expect(card.getByRole('heading',{name:quickName,exact:true})).toBeVisible()
    await card.getByRole('button',{name:/删除/}).first().click()
    const deleted=page.waitForResponse(r=>r.url().endsWith('/api/agent_specs/'+saved.id)&&r.request().method()==='DELETE')
    await card.getByRole('button',{name:'确认删除',exact:true}).click()
    assert.equal((await deleted).status(),200)
    await expect(card).toHaveCount(0)
    assert.equal(modelCalls(),before+1,'Catalog/editor verification makes no additional model call')
    console.log('PASS original employee Agent UI: persisted favorite, original editor save, quick editor save, private authoring locator retention, stale CAS refusal with draft retained, owner deletion and catalog refresh; real PB/SQLite')
    await expect(page.getByRole('button',{name:/Owner/,exact:false}).first()).toBeVisible()
    await page.getByRole('button',{name:/Owner/,exact:false}).first().click()
    await page.getByRole('menuitem',{name:'退出登录',exact:true}).click()
    await page.waitForURL(url=>url.pathname==='/login')
    await page.goto(origin+'/agent-create');await page.waitForURL(url=>url.pathname==='/login')
    await page.getByLabel('工作邮箱').fill('owner@example.test');await page.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026')
    await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(url=>url.pathname==='/agent-create')
    assert.deepEqual(errors,[]);console.log('PASS authoring browser: persisted preflight before paid call, deliberately omitted model features remain required, save/reload exact original and truthful unsupported states')
    console.log('PASS original employee authentication: unchanged login, verified refresh, account-menu logout, protected route refusal and safe return to original page; default PB binding')
  }catch(error){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:path.join(root,'.tmp/research-validation/authoring-browser-failure.png'),fullPage:true});console.error('Authoring fixture UI',page.url(),(await page.locator('body').innerText()).slice(-3500))}}throw error}finally{
    await browser?.close();if(vite&&!vite.killed){if(process.platform==='win32'){await new Promise(resolve=>{const p=spawn('taskkill',['/PID',String(vite.pid),'/T','/F'],{windowsHide:true});p.once('error',resolve);p.once('close',resolve)})}else vite.kill()}
    const absolute=fs.realpathSync(dist);assert.ok(path.dirname(absolute)===fs.realpathSync(os.tmpdir())&&path.basename(absolute).startsWith('agentstudio-authoring-ui-'));fs.rmSync(absolute,{recursive:true,force:true})
  }
}
