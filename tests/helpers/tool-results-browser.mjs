import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

export async function verifyToolResultsBrowser({root,backendOrigin,runId,resultId,caseId,recordId,grantRunId,workerOnce}) {
  const uiDist=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-ui-'))
  function cleanup(){
    if(path.dirname(fs.realpathSync(uiDist))!==fs.realpathSync(os.tmpdir()) || !path.basename(uiDist).startsWith('agentstudio-ui-'))throw Error('unsafe_browser_build_cleanup')
    fs.rmSync(uiDist,{recursive:true,force:true})
  }
  let buildLogs=''
  try {
    await new Promise((resolve,reject)=>{
      const build=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config','vibex-local/vite.local.config.ts','--outDir',uiDist],{
        cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=768'}})
      build.stdout.on('data',b=>{buildLogs=(buildLogs+b).slice(-3000)});build.stderr.on('data',b=>{buildLogs=(buildLogs+b).slice(-3000)})
      build.once('error',reject);build.once('close',code=>code===0?resolve():reject(Error('Isolated browser build failed: '+buildLogs)))
    })
  } catch(error) {cleanup();throw error}
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
  const origin=`http://127.0.0.1:${port}`
  const vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config','vibex-local/vite.local.config.ts','--outDir',uiDist,'--port',String(port),'--strictPort'],{
    cwd:root,windowsHide:true,env:{...process.env,AGENT_STUDIO_PB_ORIGIN:backendOrigin}})
  let logs='',browser
  vite.stdout.on('data',b=>{logs=(logs+b).slice(-3000)});vite.stderr.on('data',b=>{logs=(logs+b).slice(-3000)})
  try {
    let ready=false
    for(let i=0;i<120;i++){try{if((await fetch(origin)).ok){ready=true;break}}catch{};await new Promise(r=>setTimeout(r,250))}
    assert.ok(ready,'Vite fixture unavailable: '+logs)
    const installedChrome='C:/Program Files/Google/Chrome/Application/chrome.exe'
    browser=await chromium.launch({headless:true,...(fs.existsSync(installedChrome)?{executablePath:installedChrome}:{})})
    const context=await browser.newContext({viewport:{width:1360,height:900}}),page=await context.newPage(),errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    page.setDefaultTimeout(90000)
    await page.goto(origin+'/login',{waitUntil:'domcontentloaded',timeout:120000})
    await page.getByLabel('工作邮箱').fill('owner@example.test')
    await page.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026')
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await page.waitForURL(url=>url.pathname!=='/login')
    await page.goto(origin+'/run-detail?run='+runId,{waitUntil:'domcontentloaded',timeout:120000})
    const reader=page.locator('div').filter({has:page.getByText('持久结果 · '+resultId+' · 日志仅为摘要',{exact:true})})
      .filter({has:page.getByRole('button',{name:'读取保存结果',exact:true})}).last()
    await reader.getByLabel('字符起点').fill('10000')
    await reader.getByRole('button',{name:'读取保存结果',exact:true}).click()
    await reader.getByText(/EVIDENCE_10000/).waitFor()
    await page.reload()
    await page.getByText('持久结果 · '+resultId+' · 日志仅为摘要',{exact:true}).waitFor()
    await page.goto(origin+'/agent-run?case='+caseId,{waitUntil:'domcontentloaded',timeout:120000})
    await page.locator('summary').filter({hasText:'跨运行业务任务'}).click()
    await page.getByRole('button',{name:'读取正式记录（每类前 50 条）',exact:true}).click()
    await page.locator('summary').filter({hasText:recordId}).waitFor()
    const claim=page.locator('details').filter({has:page.locator('summary').filter({hasText:'fixture_statement'})}).last()
    await claim.locator('summary').first().click()
    await claim.getByLabel('复核依据').fill('Synthetic browser fixture review only; no real-model semantic-quality assertion.')
    await claim.getByRole('button',{name:'人工确认引文支持',exact:true}).click()
    await claim.getByText('已记录本员工对当前版本的人工复核；请点击重新验收。',{exact:true}).waitFor()
    const artifacts=page.locator('details').filter({has:page.locator('summary').getByText('事实集与报告',{exact:true})}).last()
    await artifacts.locator('summary').first().click()
    await artifacts.getByLabel('报告事实集').selectOption({index:1})
    await artifacts.getByRole('button',{name:'生成简报 HTML',exact:true}).click()
    const downloadReady=artifacts.getByRole('button',{name:'下载文件',exact:true}).first()
    await downloadReady.waitFor()
    const downloadEvent=page.waitForEvent('download')
    await downloadReady.click()
    const downloaded=await downloadEvent
    assert.match(downloaded.suggestedFilename(),/^research-[a-zA-Z0-9]+\.(html|md)$/)
    await artifacts.getByLabel('办公文件模板').selectOption('research.relationships.v1')
    const officeSubmitted=page.waitForResponse(r=>r.url().endsWith(`/api/business/cases/${caseId}/reports`)&&r.request().method()==='POST')
    await artifacts.getByRole('button',{name:'生成 DOCX',exact:true}).click()
    const pendingOffice=await (await officeSubmitted).json();assert.ok(pendingOffice.job_id);assert.equal(pendingOffice.file_ready,false)
    await workerOnce()
    await artifacts.getByRole('button',{name:'刷新产物',exact:true}).click()
    const officeRow=artifacts.locator('div.rounded.border.p-2').filter({hasText:'关系专题 · DOCX'})
    await officeRow.getByRole('button',{name:'下载文件',exact:true}).waitFor()
    const officeDownload=page.waitForEvent('download');await officeRow.getByRole('button',{name:'下载文件',exact:true}).click()
    assert.match((await officeDownload).suggestedFilename(),/^research-[a-zA-Z0-9]+\.docx$/)
    await page.reload()
    await page.locator('summary').filter({hasText:'跨运行业务任务'}).click()
    await page.locator('summary').getByText('事实集与报告',{exact:true}).click()
    await page.getByRole('button',{name:'下载文件',exact:true}).first().waitFor()
    await page.locator('summary').getByText('原始材料与解析范围',{exact:true}).click()
    const material=page.locator('details').filter({has:page.locator('summary').filter({hasText:'source.pdf · DEMO'})}).last()
    await material.locator('summary').first().click()
    await material.getByRole('button',{name:'读取材料片段',exact:true}).click()
    await material.getByText(/TEXT_PDF_EVIDENCE/).waitFor()
    const originalDownload=page.waitForEvent('download')
    await material.getByRole('button',{name:'下载原件',exact:true}).click()
    assert.equal((await originalDownload).suggestedFilename(),'source.pdf')
    await page.locator('summary').filter({hasText:'新建业务任务'}).click()
    await page.getByLabel('任务标题',{exact:true}).fill('Browser fixture case')
    await page.getByLabel('关键问题（每行一个）',{exact:true}).fill('Who?\nWhen?\nUnknown?')
    await page.getByRole('button',{name:'创建并绑定任务',exact:true}).click()
    await page.waitForURL(url=>url.searchParams.has('case')&&url.searchParams.get('case')!==caseId)
    await page.reload()
    await page.locator('summary').filter({hasText:'Browser fixture case'}).waitFor()
    if(grantRunId){
      await page.goto(origin+'/agent-run?run='+grantRunId,{waitUntil:'domcontentloaded',timeout:120000})
      const scope=page.locator('details').filter({has:page.locator('summary').getByText('本次运行的范围授权',{exact:true})}).last()
      await scope.locator('summary').first().click()
      await scope.getByLabel('允许的完整请求清单').fill('[{"query":"browser-reviewed-request"}]')
      await scope.getByLabel('最多调用次数').fill('2')
      await scope.getByRole('button',{name:'保存已审阅的范围授权',exact:true}).click()
      await scope.getByText(/已占用 0\/2 次/).waitFor()
      await scope.getByRole('button',{name:'撤销范围授权',exact:true}).click()
      await scope.getByText(/已撤销/).waitFor()
    }
    // A second real employee login cannot retrieve this run, even with its ID.
    const other=await browser.newContext(),otherPage=await other.newPage()
    otherPage.setDefaultTimeout(90000)
    await otherPage.goto(origin+'/login',{waitUntil:'domcontentloaded',timeout:120000})
    await otherPage.getByLabel('工作邮箱').fill('reader@example.test')
    await otherPage.getByLabel('密码',{exact:true}).fill('Fixture-Password-2026')
    await otherPage.getByRole('button',{name:'登录',exact:true}).click()
    await otherPage.waitForURL(url=>url.pathname!=='/login')
    await otherPage.goto(origin+'/run-detail?run='+runId)
    await otherPage.getByRole('heading',{name:'运行不存在或无权查看'}).waitFor()
    assert.equal(await otherPage.getByRole('button',{name:'读取保存结果',exact:true}).count(),0)
    assert.deepEqual(errors,[])
    console.log('PASS browser: employee login, real run timeline, late evidence read, case records and human-review action, case creation/refresh, other employee denied')
  } finally {
    await browser?.close()
    if(vite.exitCode===null){const closed=new Promise(resolve=>vite.once('close',resolve));vite.kill();await closed}
    cleanup()
  }
}
