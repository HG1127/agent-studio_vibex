// Disposable API + real Chrome UI. Fault injection is labelled and never claims
// a physical device was operated. No paid model, live company data or deploy.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {chromium,expect} from 'playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-resource-workspace-'))
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})
const port=await freePort(),apiOrigin='http://127.0.0.1:'+port,secret=randomBytes(24).toString('hex'),password='Isolated-resource-2026!'
const out=path.join(root,'.tmp/resource-workspace');fs.mkdirSync(out,{recursive:true})
let pb,ui,browser,logs='',checks=0
const errors=[],requests=[]
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const passed=s=>{checks++;console.log('PASS '+s)}
async function api(route,method='GET',body,token,setup=false){
  const response=await fetch(apiOrigin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(setup?{'X-Agent-Studio-Setup-Key':secret}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
  const result=await response.json().catch(()=>({}));assert.ok(response.ok,'fixture API '+route+' HTTP '+response.status);return result
}
try{
  pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+tmp,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:secret,AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
  pb.stdout.on('data',d=>logs=(logs+String(d)).slice(-2000));pb.stderr.on('data',d=>logs=(logs+String(d)).slice(-2000))
  let ready=false;for(let i=0;i<140;i++){try{if((await fetch(apiOrigin+'/api/health')).ok){ready=true;break}}catch{}await pause(100)}assert.ok(ready,'temporary API startup')
  await api('/api/studio/bootstrap','POST',{email:'resource-owner@example.test',password,display_name:'资源体验验收'},null,true)
  const token=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'resource-owner@example.test',password})).token
  const a=await api('/api/knowledge-bases/manage','POST',{action:'create',name:'Alpha 研究资料',description:'独立 A 文档'},token)
  const b=await api('/api/knowledge-bases/manage','POST',{action:'create',name:'Beta 产品资料',description:'独立 B 文档'},token)
  await api('/api/knowledge-bases/documents','POST',{action:'upload',base_id:a.id,filename:'Alpha-evidence.txt',content:'现金流核验：ALPHA_ONLY_EVIDENCE，所有陈述必须注明来源。'},token)
  await api('/api/knowledge-bases/documents','POST',{action:'upload',base_id:b.id,filename:'Beta-product.txt',content:'BETA_ONLY_EVIDENCE：产品说明和操作限制。'},token)
  const paired=await api('/api/local-devices','POST',{name:'已连接的验收电脑'},token)
  const credential=await api('/api/public/local-executor/pair','POST',{code:paired.pairing_code})
  const tools=[{name:'files.list',description:'List scoped work directory',inputSchema:{type:'object',properties:{root:{type:'string',enum:['work']},path:{type:'string'}}}}]
  const heartbeat=await fetch(apiOrigin+'/api/public/local-executor/poll',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Device-Token':credential.token},body:JSON.stringify({tools})});assert.ok(heartbeat.ok)
  process.env.AGENT_STUDIO_PB_ORIGIN=apiOrigin
  const {preview}=await import('vite');ui=await preview({configFile:path.join(root,'vibex-local/vite.local.config.ts'),preview:{port:0,host:'127.0.0.1',strictPort:false,open:false},logLevel:'error'})
  const origin='http://127.0.0.1:'+ui.httpServer.address().port
  browser=await chromium.launch({channel:'chrome',headless:true})
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/__pb'))requests.push({path:u.pathname,method:r.method()})})
  await page.goto(origin+'/login?next='+encodeURIComponent('/knowledge-bases?base='+a.id))
  await page.getByLabel('工作邮箱',{exact:true}).fill('resource-owner@example.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Alpha 研究资料',exact:true})).toBeVisible()
  const nav=page.getByRole('navigation',{name:'知识库工作视图'})
  await expect(page.getByRole('region',{name:'知识库文档列表'})).toContainText('Alpha-evidence.txt')
  await expect(page.getByRole('region',{name:'知识库检索测试'})).not.toBeVisible()
  await expect(page.getByRole('region',{name:'知识库语义设置'})).not.toBeVisible()
  assert.equal(requests.some(r=>r.path.includes('/semantic/settings')||r.path.includes('/model-connections')),false,'document view should not load unrelated semantic configuration')
  await page.getByLabel('搜索本库文档').fill('not-found');await expect(page.getByRole('region',{name:'知识库文档列表'})).toContainText('当前筛选没有匹配文件')
  await page.getByLabel('搜索本库文档').fill('')
  passed('knowledge is a focused document workspace; settings and sharing are not stacked or prefetched')
  await page.getByRole('button',{name:'新建知识库',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'新建知识库',exact:true})
  await dialog.getByLabel('知识库名称',{exact:true}).fill('未保存草稿')
  await dialog.getByRole('button',{name:'取消',exact:true}).click()
  const confirm=page.locator('[data-studio-dialog]');await expect(confirm).toContainText('未保存')
  await confirm.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(dialog.getByLabel('知识库名称',{exact:true})).toHaveValue('未保存草稿')
  await dialog.getByRole('button',{name:'取消',exact:true}).click();await confirm.getByRole('button',{name:'放弃修改并离开',exact:true}).click();await expect(dialog).toHaveCount(0)
  await page.getByRole('button',{name:'编辑',exact:true}).click()
  const edit=page.getByRole('dialog',{name:'编辑知识库',exact:true});await expect(edit).toBeVisible();await edit.getByLabel('简介',{exact:true}).fill('更新后的描述')
  await edit.getByRole('button',{name:'保存修改',exact:true}).click();await expect(edit).toHaveCount(0)
  assert.equal((await api('/api/knowledge-bases','GET',undefined,token)).items.find(x=>x.id===a.id).description,'更新后的描述')
  passed('new/edit are on demand; abandoning unsaved content is confirmed and real metadata persists')
  await nav.getByRole('button',{name:'检索测试',exact:true}).click()
  await expect(page).toHaveURL(new RegExp('view=search'))
  await page.getByLabel('知识库检索策略').selectOption('lexical');await page.getByLabel('知识库检索问题').fill('现金流')
  await page.getByRole('button',{name:'检索',exact:true}).click()
  await expect(page.getByRole('region',{name:'知识库检索测试'})).toContainText('ALPHA_ONLY_EVIDENCE')
  // Delay a real lexical response, then change library. The late response must be discarded.
  const arrived=Promise.withResolvers(),release=Promise.withResolvers(),finished=Promise.withResolvers()
  await page.route('**/__pb/api/knowledge-bases/search',async route=>{const response=await route.fetch();arrived.resolve();await release.promise;await route.fulfill({response});finished.resolve()},{times:1})
  await page.getByRole('button',{name:'检索',exact:true}).click();await arrived.promise
  await page.getByRole('button',{name:/^Beta 产品资料/}).click();await expect(page.getByRole('heading',{name:'Beta 产品资料',exact:true})).toBeVisible()
  release.resolve();await finished.promise
  await expect(page.getByRole('region',{name:'知识库检索测试'})).not.toContainText('ALPHA_ONLY_EVIDENCE')
  await page.goBack();await expect(page.getByRole('heading',{name:'Alpha 研究资料',exact:true})).toBeVisible()
  await expect(nav.getByRole('button',{name:'检索测试',exact:true})).toHaveAttribute('aria-pressed','true')
  passed('real source retrieval, late-result isolation, selected library/view and browser-back context')
  for(const width of [390,768,1440,1780]){
    await page.setViewportSize({width,height:950});await nav.getByRole('button',{name:'文档资料',exact:true}).click()
    const metrics=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}))
    assert.ok(metrics.s<=metrics.w+4,'knowledge document overflow '+width+': '+JSON.stringify(metrics))
    await nav.getByRole('button',{name:'检索测试',exact:true}).click()
    const searchMetrics=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}))
    assert.ok(searchMetrics.s<=searchMetrics.w+4,'knowledge search overflow '+width+': '+JSON.stringify(searchMetrics))
  }
  await page.setViewportSize({width:1440,height:1000});await nav.getByRole('button',{name:'文档资料',exact:true}).click()
  await page.screenshot({path:path.join(out,'knowledge-workspace.png'),fullPage:true})
  passed('knowledge document/search workspace fits 390/768/1440/1780px')
  await expect(page.getByRole('button',{name:'调整 Agent 方案',exact:true})).toHaveCount(0)
  await nav.getByRole('button',{name:'语义设置',exact:true}).click()
  await page.getByRole('button',{name:'新建知识库',exact:true}).click()
  const createDialog=page.getByRole('dialog',{name:'新建知识库',exact:true})
  await createDialog.getByLabel('知识库名称',{exact:true}).fill('New upload destination')
  await createDialog.getByRole('button',{name:'创建知识库',exact:true}).click()
  await expect(createDialog).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'New upload destination',exact:true})).toBeVisible()
  await expect(nav.getByRole('button',{name:'文档资料',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('region',{name:'知识资料导入'})).toBeVisible()
  passed('creating a library from any view opens its upload workspace; no floating editor covers the next action')
  await page.route('**/__pb/api/local-devices',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'fixture_outage'})}),{times:1})
  await page.goto(origin+'/tool-hub?view=devices')
  const deviceRegion=page.getByRole('region',{name:'本人设备清单'})
  await expect(deviceRegion.getByRole('alert')).toContainText('不代表原连接已删除')
  await expect(deviceRegion).not.toContainText('还没有绑定电脑')
  await deviceRegion.getByRole('button',{name:'重新读取设备',exact:true}).click()
  await expect(deviceRegion).toContainText('已连接的验收电脑')
  passed('injected inventory outage is an actionable unknown state, not a false empty account')
  // Fault-injected stale heartbeat. No real local operation or restart occurs.
  await page.route('**/__pb/api/local-devices',async route=>{const response=await route.fetch();const data=await response.json();data.items=data.items.map(d=>({...d,seen_ms:Date.now()-90000}));await route.fulfill({response,json:data})})
  await page.getByRole('button',{name:'刷新设备',exact:true}).click();await deviceRegion.getByRole('button',{name:'查看恢复步骤',exact:true}).click()
  const recovery=page.getByRole('region',{name:'恢复已有设备连接'});await expect(recovery).toContainText('不要重复配对');await expect(recovery).toContainText('Start-Connector.cmd')
  for(const width of [390,768,1440,1780]){await page.setViewportSize({width,height:950});const m=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));assert.ok(m.s<=m.w+4,'device overflow '+width)}
  assert.equal(requests.some(r=>r.method==='POST'&&/\/local-devices\/[^/]+\/jobs$/.test(r.path)),false,'read-only recovery UI never executes local operations')
  passed('offline recovery preserves the device identity and requires explicit local restart; no jobs auto-run')
  assert.deepEqual(errors,[])
  console.log('RESOURCE_WORKSPACE_BROWSER_PASS '+JSON.stringify({checks,realBrowser:true,realPocketBase:true,faultInjection:['delayed search','inventory 503','stale heartbeat'],paidModelCalls:0,productionMutated:false}))
}catch(e){console.error('RESOURCE_WORKSPACE_BROWSER_FAIL',String(e?.stack||e));console.error(logs.slice(-1200));process.exitCode=1}
finally{await browser?.close().catch(()=>{});if(ui)await new Promise(r=>ui.httpServer.close(r));await stopHeadlessPocketBase(pb).catch(()=>{});fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
