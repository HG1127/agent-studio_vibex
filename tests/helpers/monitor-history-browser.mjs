import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {chromium,expect} from '@playwright/test'

// The caller seeds explicitly labelled paging fixtures. Semantic collector
// behavior is tested separately, before any paging rows are inserted.
export async function verifyMonitorHistoryBrowser({root,backendOrigin,caseId,monitorId,oldCheckId,event,onRevoke,verifyRead}){
  const dist=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-monitor-history-'));let vite,browser,logs=''
  try{
    await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config','vibex-local/vite.local.config.ts','--outDir',dist],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=768 --v8-pool-size=1'}});p.stdout.on('data',b=>{logs=(logs+b).slice(-3000)});p.stderr.on('data',b=>{logs=(logs+b).slice(-3000)});p.once('error',reject);p.once('close',code=>code===0?resolve():reject(Error(logs)))})
    const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),origin=`http://127.0.0.1:${port}`
    vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config','vibex-local/vite.local.config.ts','--outDir',dist,'--port',String(port),'--strictPort'],{cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_PB_ORIGIN:backendOrigin}});vite.stdout.on('data',b=>{logs=(logs+b).slice(-3000)});vite.stderr.on('data',b=>{logs=(logs+b).slice(-3000)})
    for(let n=0;n<100;n++){try{if((await fetch(origin)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
    await page.goto(origin+'/login');await page.getByLabel('工作邮箱').fill('collector@example.test');await page.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(url=>url.pathname!=='/login')
    await page.goto(origin+'/');const inbox=page.getByRole('region',{name:'监测待办与变化事件'})
    const firstLink=inbox.getByRole('link',{name:'查看监测',exact:true}).first();await firstLink.waitFor();const firstHref=await firstLink.getAttribute('href')
    await inbox.getByRole('button',{name:'标为已读',exact:true}).first().click();await expect(inbox.locator('a[href="'+firstHref+'"]')).toHaveCount(0)
    const oldLink=inbox.locator('a[href*="event='+event.event_id+'"]')
    let inboxPages=1
    for(;inboxPages<25;inboxPages++){
      if(await oldLink.count())break
      const before=await inbox.getByRole('link',{name:'查看监测',exact:true}).first().getAttribute('href')
      await inbox.getByRole('button',{name:'下一页监测消息',exact:true}).click();await expect(inbox.getByRole('link',{name:'查看监测',exact:true}).first()).not.toHaveAttribute('href',before)
    }
    assert.ok(inboxPages>10&&inboxPages<25,'The genuine unread event is beyond the former 100-event window')
    await oldLink.click();await page.waitForURL(url=>url.searchParams.get('event')===event.event_id)
    const focus=page.getByRole('region',{name:'消息定位'});await focus.getByRole('article',{name:'监测事件 '+event.event_id,exact:true}).waitFor()
    // Deliberately mix another permitted check in the URL. Only the event's
    // actual check may supply evidence; both IDs being owned is insufficient.
    const base=origin+'/agent-run?'+new URLSearchParams({case:caseId,monitor:monitorId})
    await page.goto(base+'&'+new URLSearchParams({event:event.event_id,check:oldCheckId}));await focus.getByRole('article',{name:'监测检查 '+event.check_id,exact:true}).waitFor();await expect(focus.getByRole('article',{name:'监测检查 '+oldCheckId,exact:true})).toHaveCount(0)
    await focus.getByRole('button',{name:'读取保存结果',exact:true}).click();await focus.locator('pre').filter({hasText:'scope_key'}).first().waitFor()
    await expect(focus.getByRole('article',{name:'监测检查 '+event.check_id,exact:true})).toContainText('定义版本 1')
    await focus.screenshot({path:path.join(root,'.tmp/research-validation/monitor-history-browser.png')})
    await focus.getByRole('button',{name:'标为已读',exact:true}).click();await expect(focus.getByRole('button',{name:'标为已读',exact:true})).toHaveCount(0);await verifyRead()
    await page.goto(base);const panel=page.locator('details').filter({has:page.locator('summary').getByText('持续监测与语义变化',{exact:true})}).last()
    await panel.getByRole('button',{name:'下一页检查',exact:true}).waitFor()
    const oldCheck=panel.getByRole('article',{name:'监测检查 '+oldCheckId,exact:true});let checkPages=1
    while(!(await oldCheck.count())&&checkPages<15){await panel.getByRole('button',{name:'下一页检查',exact:true}).click();await expect(panel.locator('[aria-label="检查分页"]').getByRole('status')).toHaveCount(0);checkPages++}
    assert.ok(checkPages>3&&checkPages<15);await oldCheck.getByRole('button',{name:'打开检查依据',exact:true}).click();await focus.getByRole('article',{name:'监测检查 '+oldCheckId,exact:true}).waitFor();await focus.getByRole('button',{name:'读取保存结果',exact:true}).click();await focus.locator('pre').filter({hasText:'scope_key'}).first().waitFor()
    let eventPages=1;const oldEvent=panel.getByRole('article',{name:'监测事件 '+event.event_id,exact:true})
    await panel.getByRole('button',{name:'下一页事件',exact:true}).waitFor()
    while(!(await oldEvent.count())&&eventPages<15){await panel.getByRole('button',{name:'下一页事件',exact:true}).click();await expect(panel.locator('[aria-label="事件分页"]').getByRole('status')).toHaveCount(0);eventPages++}
    assert.ok(eventPages>5&&eventPages<15);await oldEvent.getByRole('button',{name:'查看事件依据',exact:true}).click();await focus.getByRole('article',{name:'监测检查 '+event.check_id,exact:true}).waitFor()
    await onRevoke();await page.reload();await focus.getByRole('alert').getByText(/当前来源不可读取/).waitFor();await expect(focus.getByRole('button',{name:'读取保存结果',exact:true})).toHaveCount(0);await expect(page.locator('pre').filter({hasText:'scope_key'})).toHaveCount(0)
    assert.deepEqual(errors,[]);console.log('PASS monitor history browser: >100-event inbox, direct read acknowledgment, check/event pages, exact historical evidence, mixed-link binding and revocation; seeded pagination fixtures only')
  }finally{
    await browser?.close();if(vite&&!vite.killed){if(process.platform==='win32'){await new Promise(resolve=>{const p=spawn('taskkill',['/PID',String(vite.pid),'/T','/F'],{windowsHide:true});p.once('error',resolve);p.once('close',resolve)})}else vite.kill()}
    const absolute=fs.realpathSync(dist);assert.ok(path.dirname(absolute)===fs.realpathSync(os.tmpdir())&&path.basename(absolute).startsWith('agentstudio-monitor-history-'));fs.rmSync(absolute,{recursive:true,force:true})
  }
}
