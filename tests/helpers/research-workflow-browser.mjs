import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {chromium} from '@playwright/test'
export async function verifyResearchWorkflowBrowser({root,backendOrigin,caseId,onStarted}){
  const uiDist=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-stages-ui-'));let browser,vite,page,logs=''
  function cleanup(){if(path.dirname(fs.realpathSync(uiDist))!==fs.realpathSync(os.tmpdir())||!path.basename(uiDist).startsWith('agentstudio-stages-ui-'))throw Error('unsafe_cleanup');fs.rmSync(uiDist,{recursive:true,force:true})}
  try{
    await new Promise((resolve,reject)=>{
      const p=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config','vibex-local/vite.local.config.ts','--outDir',uiDist],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=768 --v8-pool-size=1'}})
      p.stdout.on('data',b=>{logs=(logs+b).slice(-4000)});p.stderr.on('data',b=>{logs=(logs+b).slice(-4000)});p.once('error',reject);p.once('close',code=>code===0?resolve():reject(Error(logs)))
    })
    const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
    const origin=`http://127.0.0.1:${port}`
    vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config','vibex-local/vite.local.config.ts','--outDir',uiDist,'--port',String(port),'--strictPort'],{cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_PB_ORIGIN:backendOrigin}})
    vite.stdout.on('data',b=>{logs=(logs+b).slice(-4000)});vite.stderr.on('data',b=>{logs=(logs+b).slice(-4000)})
    let ready=false;for(let n=0;n<120;n++){try{if((await fetch(origin)).ok){ready=true;break}}catch{};await new Promise(r=>setTimeout(r,250))}assert.ok(ready,logs)
    const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe'
    browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})})
    page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[]
    page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error('browser console:',m.text().slice(0,1200))})
    await page.goto(origin+'/login',{waitUntil:'domcontentloaded',timeout:120000})
    await page.getByLabel('工作邮箱').fill('stages@example.test');await page.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.pathname!=='/login')
    await page.goto(origin+'/workflow-canvas',{waitUntil:'domcontentloaded',timeout:120000})
    try{await page.getByRole('button',{name:/Browser research launch/}).click({timeout:15000})}catch(error){console.error((await page.locator('body').innerText()).slice(-3500));await page.screenshot({path:path.join(root,'.tmp/research-validation/stage-browser-error.png'),fullPage:true});throw error}
    await page.getByRole('button',{name:'运行',exact:true}).first().click()
    const dialog=page.getByRole('dialog')
    await dialog.getByPlaceholder(/例如/).fill('Synthetic browser research launch')
    await dialog.getByLabel('研究阶段模式',{exact:true}).check()
    await dialog.getByLabel('业务任务 ID',{exact:true}).fill(caseId)
    await dialog.getByLabel('阶段默认模型',{exact:true}).selectOption({index:1})
    for(const field of await dialog.locator('fieldset').all())await field.getByLabel('验收方式',{exact:true}).selectOption('execution_only')
    const started=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/api/workflow-runs/start'))
    await dialog.getByRole('button',{name:'开始运行',exact:true}).click()
    const response=await started,result=await response.json();assert.equal(response.status(),200,JSON.stringify(result))
    await onStarted(result.run_id)
    const panel=page.getByRole('region',{name:'研究阶段',exact:true})
    await panel.getByRole('link',{name:'查看子运行、审批与完整结果',exact:true}).first().waitFor()
    const link=await panel.getByRole('link',{name:'查看子运行、审批与完整结果',exact:true}).first().getAttribute('href');assert.match(link,/\/agent-run\?run=/)
    await panel.getByRole('button',{name:'暂停研究',exact:true}).click();await panel.getByText(/父任务：已暂停/).waitFor()
    await panel.getByRole('button',{name:'恢复研究',exact:true}).click();await panel.getByText(/父任务：运行中/).waitFor()
    await panel.getByRole('button',{name:'取消研究',exact:true}).click();await panel.getByText(/父任务：已取消/).waitFor()
    await panel.locator('summary').getByText('只补缺口',{exact:true}).click()
    await panel.getByRole('button',{name:'预览只补缺口',exact:true}).click()
    await panel.getByLabel('补查预览',{exact:true}).getByText(/One：执行缺口阶段/).waitFor()
    const replanned=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/replan'))
    await panel.getByRole('button',{name:'确认预览并开始补查',exact:true}).click()
    const replanResponse=await replanned,replanResult=await replanResponse.json();assert.equal(replanResponse.status(),200,JSON.stringify(replanResult));assert.notEqual(replanResult.run_id,result.run_id)
    await onStarted(replanResult.run_id)
    await panel.getByText(/父任务：运行中/).waitFor();await panel.getByText(/执行版本 1/).waitFor()
    await panel.getByRole('button',{name:'取消研究',exact:true}).click();await panel.getByText(/父任务：已取消/).waitFor()
    await page.screenshot({path:path.join(root,'.tmp/research-validation/stage-browser.png'),fullPage:true})
    assert.deepEqual(errors,[])
    console.log('PASS browser: employee research launch, validators, child links, controls, only-missing preview and new execution revision')
  }catch(error){if(page){console.error((await page.locator('body').innerText()).slice(-4500));await page.screenshot({path:path.join(root,'.tmp/research-validation/stage-browser-error.png'),fullPage:true})}throw error}finally{
    await browser?.close();if(vite?.exitCode===null){const closed=new Promise(resolve=>vite.once('close',resolve));vite.kill();await closed}cleanup()
  }
}
