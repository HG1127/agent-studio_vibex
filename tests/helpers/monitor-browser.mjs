import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {chromium} from '@playwright/test'
export async function verifyMonitorBrowser({root,backendOrigin,caseId,scheduleId,personId}){
  const dist=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-monitor-ui-'));let vite,browser,logs=''
  try{
    await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config','vibex-local/vite.local.config.ts','--outDir',dist],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=768 --v8-pool-size=1'}});p.stdout.on('data',b=>{logs=(logs+b).slice(-3000)});p.stderr.on('data',b=>{logs=(logs+b).slice(-3000)});p.once('error',reject);p.once('close',code=>code===0?resolve():reject(Error(logs)))})
    const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),origin=`http://127.0.0.1:${port}`
    vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config','vibex-local/vite.local.config.ts','--outDir',dist,'--port',String(port),'--strictPort'],{cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_PB_ORIGIN:backendOrigin}});vite.stdout.on('data',b=>{logs=(logs+b).slice(-3000)});vite.stderr.on('data',b=>{logs=(logs+b).slice(-3000)})
    for(let n=0;n<100;n++){try{if((await fetch(origin)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
    await page.goto(origin+'/login');await page.getByLabel('工作邮箱').fill('collector@example.test');await page.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(url=>url.pathname!=='/login')
    await page.goto(origin+'/');const inbox=page.getByRole('region',{name:'监测待办与变化事件'});await inbox.getByText('待复核',{exact:false}).waitFor();await inbox.getByRole('link',{name:'查看监测',exact:true}).click();await page.waitForURL(url=>url.searchParams.has('monitor'))
    const panel=page.locator('details').filter({has:page.locator('summary').getByText('持续监测与语义变化',{exact:true})}).last()
    await panel.getByRole('button',{name:/人物任职监测/}).waitFor();await panel.locator('summary').getByText('新建监测定义',{exact:true}).click()
    await panel.getByLabel('监测标题',{exact:true}).fill('浏览器监测');await panel.getByLabel('关联采集计划').selectOption(scheduleId);await panel.getByLabel(new RegExp(personId)).check()
    await panel.getByLabel('来源工具名',{exact:true}).fill('MonitorFeed');await panel.getByLabel('接口数据范围标识',{exact:true}).fill('employment')
    await panel.getByRole('button',{name:'预览监测范围',exact:true}).click();await panel.getByRole('button',{name:'确认范围并暂停关联计划',exact:true}).click();await panel.getByRole('button',{name:/浏览器监测 · 已暂停/}).waitFor()
    await panel.getByRole('button',{name:/人物任职监测 · 已启用/}).click();await panel.getByRole('button',{name:'复核本次检查',exact:true}).click()
    const review=page.getByRole('region',{name:'监测检查复核'});await review.getByRole('button',{name:'读取保存结果',exact:true}).click();await review.getByText(/scope_key.*employment/).waitFor()
    await review.getByLabel('复核说明',{exact:true}).fill('Synthetic employee browser review: declared source scope, identities, original quote and role effective dates match every displayed version.')
    await review.getByRole('checkbox',{name:/已核对所有显示的来源范围/}).check();await review.getByRole('button',{name:'确认本次范围与事实',exact:true}).click();await panel.getByText(/已建立基线/).waitFor()
    await panel.getByRole('button',{name:'暂停监测与计划',exact:true}).click();await panel.getByRole('button',{name:/人物任职监测 · 已暂停/}).waitFor();await panel.getByRole('button',{name:'启用监测与计划',exact:true}).click();await panel.getByRole('button',{name:/人物任职监测 · 已启用/}).waitFor()
    await page.reload();await panel.getByRole('button',{name:/人物任职监测/}).click();await panel.getByText(/已有固定基线/).waitFor()
    await panel.getByText(/检查已完成/).waitFor();const screenshot=path.join(root,'.tmp/research-validation/monitors-browser.png');await panel.screenshot({path:screenshot})
    await page.goto(origin+'/');await page.getByRole('region',{name:'监测待办与变化事件'}).getByText(/本页暂无当前可处理/).waitFor()
    assert.deepEqual(errors,[]);console.log('PASS monitor browser: employee login, homepage inbox/deep link, scoped preview/create, exact source read, manual baseline review, pause/resume, refresh and quiet homepage')
  }finally{
    await browser?.close();if(vite&&!vite.killed){if(process.platform==='win32'){await new Promise(resolve=>{const p=spawn('taskkill',['/PID',String(vite.pid),'/T','/F'],{windowsHide:true});p.once('error',resolve);p.once('close',resolve)})}else vite.kill()}
    const absolute=fs.realpathSync(dist);assert.ok(path.dirname(absolute)===fs.realpathSync(os.tmpdir())&&path.basename(absolute).startsWith('agentstudio-monitor-ui-'));fs.rmSync(absolute,{recursive:true,force:true})
  }
}
