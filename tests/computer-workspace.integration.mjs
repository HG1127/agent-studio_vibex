// Real isolated PocketBase + Windows file runtime + Chrome UI. No user profiles,
// business directories, paid model, external service, or native app launch.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createServer} from 'node:net'
import {randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
import {setTimeout as sleep} from 'node:timers/promises'
import {createServer as createVite} from 'vite'
import {chromium,expect} from 'playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
const root=process.cwd(),out=path.join(root,'.tmp','computer-workspace');await fs.mkdir(out,{recursive:true})
const temp=await fs.mkdtemp(path.join(out,'isolated-')),work=path.join(temp,'work'),readonly=path.join(temp,'readonly'),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-file-workspace-'))
await fs.mkdir(work);await fs.mkdir(readonly);await fs.writeFile(path.join(work,'notes.txt'),'original text\n');await fs.writeFile(path.join(work,'large.txt'),'x'.repeat(14000));await fs.writeFile(path.join(readonly,'reference.txt'),'read only reference\n')
const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r))
const origin='http://127.0.0.1:'+port,key=randomBytes(24).toString('hex'),password='Disposable-workspace-2026!',revision='a'.repeat(24)
let backend,ui,browser,runtime,timer,working=false,closed=false,checks=0,backendLog='';const errors=[],jobs=[],nativeRequests=[],pass=title=>{checks++;console.log('PASS '+title)}
const api=async(route,body,token,setup=false)=>{const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(setup?{'X-Agent-Studio-Setup-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const data=await r.json().catch(()=>({}));assert.ok(r.ok,route+' '+r.status+' '+JSON.stringify(data));return data}
try{
 backend=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--dev','--http=127.0.0.1:'+port,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
 backend.stdout.on('data',b=>{backendLog=(backendLog+String(b)).slice(-6000)});backend.stderr.on('data',b=>{backendLog=(backendLog+String(b)).slice(-6000)})
 await expect.poll(async()=>{try{return(await fetch(origin+'/api/health')).status}catch{return 0}},{timeout:20000}).toBe(200)
 await api('/api/studio/bootstrap',{email:'workspace-fixture@example.test',password,display_name:'工作区隔离验证'},null,true)
 const auth=await api('/api/collections/studio_users/auth-with-password',{identity:'workspace-fixture@example.test',password})
 const device=await api('/api/local-devices',{name:'隔离验收电脑'},auth.token)
 const credential=await api('/api/public/local-executor/pair',{code:device.pairing_code})
 runtime=await createRuntime({roots:[{name:'work',path:work,label:'隔离测试目录',readOnly:false,capabilities:{edit:true,move:true,delete:true,open:true}},{name:'readonly',path:readonly,label:'只读资料',readOnly:true,capabilities:{edit:false,move:false,delete:false,open:false}}],files:{enabled:true},browser:{enabled:false},permissionRevision:revision},{invokeFileApplication:async(file,reveal,signal)=>{signal?.throwIfAborted();assert.equal(path.dirname(file),work);nativeRequests.push({file,reveal})}})
 for(const name of ['files.stat','files.update','files.mkdir','files.copy','files.move','files.trash','files.trash_list','files.restore','files.open','files.reveal'])assert.ok(runtime.tools.some(t=>t.name===name),'missing tool '+name)
 const executor=async()=>{
  if(closed||working)return;working=true
  try{
   const r=await fetch(origin+'/api/public/local-executor/poll',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Device-Token':credential.token},body:JSON.stringify({tools:runtime.tools})})
   assert.ok(r.ok,'fixture heartbeat');const {job}=await r.json();if(!job)return
   jobs.push(job.input.tool)
   // Open/reveal go through the real scoped tool handler and an injected OS boundary; no user application is launched.
   let result,ok=true
   try{result=await runtime.execute(job.input,new AbortController().signal)}catch(e){ok=false;result=e.message}
   const completed=await fetch(origin+'/api/public/local-executor/jobs/'+job.id+'/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Device-Token':credential.token},body:JSON.stringify({claim:job.claim,ok,result})})
   assert.ok(completed.ok,'fixture completion')
  }catch(e){errors.push(e.message)}finally{working=false}
 }
 await executor();timer=setInterval(()=>void executor(),100)
 process.env.AGENT_STUDIO_PB_ORIGIN=origin
 ui=await createVite({root,server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});await ui.listen()
 const uiOrigin='http://127.0.0.1:'+ui.httpServer.address().port
 const fixture=path.join(out,'fixture.html')
 await fs.writeFile(fixture,'<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from "react";import{createRoot}from"react-dom/client";import{BrowserRouter}from"react-router-dom";import{StudioDialogHost}from"/src/components/site/StudioDialogHost.tsx";import{LocalDevicesPanel}from"/src/components/tool-hub/LocalDevicesPanel.tsx";import"/src/index.css";createRoot(document.getElementById("root")).render(React.createElement(BrowserRouter,null,React.createElement(StudioDialogHost),React.createElement(LocalDevicesPanel)));</script></body></html>')
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(auth=>{sessionStorage.setItem('agent_studio_employee_auth',JSON.stringify(auth))},auth)
 await page.goto(uiOrigin+'/.tmp/computer-workspace/fixture.html')
 const card=page.locator('[data-device-id="'+device.id+'"]');await expect(card).toContainText('隔离验收电脑')
 await card.getByRole('button').first().click()
 const area=page.getByRole('region',{name:'系统内文件工作区',exact:true})
 await expect(area).toBeVisible();assert.equal(jobs.length,0,'select device does not execute a file operation')
   await area.getByLabel('文件工作区授权目录').selectOption('readonly')
  const permissionNotice=area.getByRole('status',{name:'未开放的文件操作'})
  await expect(permissionNotice).toContainText('编辑并保存');await expect(permissionNotice).toContainText('可恢复删除')
  await permissionNotice.getByRole('button',{name:'管理授权'}).click()
  await expect(page.getByRole('tab',{name:'授权管理',exact:true})).toHaveAttribute('aria-selected','true')
  pass('missing file actions are explained in the workbench and the permission shortcut routes to embedded permission management')
  await page.getByRole('tab',{name:'文件工作区',exact:true}).click()
  await area.getByLabel('文件工作区授权目录').selectOption('work')
  const workspaceTabs=page.getByRole('tablist',{name:'电脑工作区功能',exact:true})
  const firstCount=jobs.length
  await area.getByRole('button',{name:'新建文件',exact:true}).click()
  await area.getByLabel('文件操作目标位置').fill('declined.txt')
  await area.getByLabel('新建文本内容').fill('draft survives connection loss')
  await area.getByRole('button',{name:'确认新建',exact:true}).click()
  await page.locator('[data-studio-dialog]').getByRole('button',{name:'取消',exact:true}).click()
  assert.equal(jobs.length,firstCount);await assert.rejects(fs.access(path.join(work,'declined.txt')))
  const offlineRoute=async route=>{const response=await route.fetch(),data=await response.json();data.items=data.items.map(d=>({...d,seen_ms:Date.now()-90000}));await route.fulfill({response,json:data})}
  await page.route('**/__pb/api/local-devices',offlineRoute)
  await page.getByRole('button',{name:'刷新设备',exact:true}).click()
  await expect(area).toContainText('设备离线或状态待核实')
  await expect(area.getByRole('button',{name:'确认新建',exact:true})).toBeDisabled()
  await expect(area.getByLabel('新建文本内容')).toHaveValue('draft survives connection loss')
  await page.unroute('**/__pb/api/local-devices',offlineRoute)
  const unavailableRoute=route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"isolated_unavailable"}'})
  await page.route('**/__pb/api/local-devices',unavailableRoute)
  await page.getByRole('button',{name:'刷新设备',exact:true}).click()
  await expect(area.getByRole('button',{name:'确认新建',exact:true})).toBeDisabled()
  await expect(area.getByLabel('新建文本内容')).toHaveValue('draft survives connection loss')
  await page.unroute('**/__pb/api/local-devices',unavailableRoute)
  await page.getByRole('button',{name:'刷新设备',exact:true}).click()
  await expect(area.getByRole('button',{name:'确认新建',exact:true})).toBeEnabled()
  await expect(workspaceTabs.getByRole('tab',{name:'授权管理',exact:true})).toBeDisabled()
  assert.equal(jobs.length,firstCount)
  await area.getByRole('button',{name:'收起',exact:true}).click()
  await page.locator('[data-studio-dialog]').getByRole('button',{name:'放弃草稿',exact:true}).click()
  pass('cancelled writes and offline/unavailable inventory preserve drafts and never enqueue writes or lose scope')
const approve=async label=>{await page.locator('[data-studio-dialog]').getByRole('button',{name:label,exact:true}).click()}
 const action=async(name,destructive=false)=>{await area.getByRole('button',{name,exact:true}).click();if(!['读取目录','刷新目录','读取内容','读取回收记录'].includes(name))await approve(destructive?'确认执行变更':'批准本次操作')}
 const waitNotice=text=>expect(area.getByRole('status').filter({hasText:text}).last()).toBeVisible({timeout:15000})
 await action('读取目录');await expect(area.getByRole('button',{name:'notes.txt',exact:true})).toBeVisible({timeout:15000})
 await area.getByRole('button',{name:'notes.txt',exact:true}).click();await action('读取内容')
 const editor=area.getByLabel('文件文本编辑器');await expect(editor).toHaveValue('original text\n',{timeout:15000});await expect(editor).toBeEditable()
 pass('owner-scoped device selection and actual file read/hash reach integrated editor without a connector web page')
  const beforeNavigation=jobs.length
  await area.getByLabel('筛选文件名').fill('notes')
  await workspaceTabs.getByRole('tab',{name:'授权管理',exact:true}).click()
  await workspaceTabs.getByRole('tab',{name:'文件工作区',exact:true}).click()
  await expect(editor).toHaveValue('original text\n');await expect(area.getByLabel('筛选文件名')).toHaveValue('notes')
  await area.getByLabel('筛选文件名').fill('not-a-file');await expect(area.getByLabel('文件列表')).toContainText('当前列表无匹配文件')
  await area.getByLabel('筛选文件名').fill('');assert.equal(jobs.length,beforeNavigation)
  pass('cached file filtering and tab navigation retain the loaded document without issuing additional jobs')
  await action('用电脑软件打开');await waitNotice('已收到本机执行回执')
  await action('在电脑中定位');await waitNotice('已收到本机执行回执')
  assert.deepEqual(nativeRequests,[{file:path.join(work,'notes.txt'),reveal:false},{file:path.join(work,'notes.txt'),reveal:true}])
  pass('open and reveal run through the server queue and scoped file handlers with a verified non-launching OS adapter')
 await editor.fill('updated 中文\n');await area.getByRole('button',{name:'查看修改前后'}).click();await expect(area.getByLabel('修改前后对照')).toContainText('original text')
 await page.screenshot({path:path.join(out,'file-editor.png'),fullPage:true})
 await action('保存修改',true);await waitNotice('文件修改已收到成功回执');assert.equal(await fs.readFile(path.join(work,'notes.txt'),'utf8'),'updated 中文\n')
 pass('editing shows before/after and modifies the actual isolated file only after approval')
 await action('刷新目录');await expect(area.getByRole('button',{name:'notes.txt',exact:true})).toBeEnabled()
 await area.getByRole('button',{name:'notes.txt',exact:true}).click();await area.getByRole('button',{name:'移动 / 重命名',exact:true}).click()
 await area.getByLabel('文件操作目标位置').fill('renamed.txt');await action('确认移动 / 重命名',true);await waitNotice('文件已移动或重命名')
 await assert.rejects(fs.stat(path.join(work,'notes.txt')));assert.equal(await fs.readFile(path.join(work,'renamed.txt'),'utf8'),'updated 中文\n')
 await action('刷新目录');await expect(area.getByRole('button',{name:'renamed.txt',exact:true})).toBeVisible({timeout:15000})
 await area.getByRole('button',{name:'renamed.txt',exact:true}).click();await area.getByRole('button',{name:'复制',exact:true}).click();await area.getByLabel('文件操作目标位置').fill('copy.txt');await action('确认复制');await waitNotice('文件副本已创建')
 assert.equal(await fs.readFile(path.join(work,'copy.txt'),'utf8'),'updated 中文\n')
 pass('same-root move/rename and exclusive copy execute through real server queue and native runtime')
 await action('刷新目录');await expect(area.getByRole('button',{name:'copy.txt',exact:true})).toBeVisible({timeout:15000});await area.getByRole('button',{name:'copy.txt',exact:true}).click()
 await action('移入回收区',true);await waitNotice('文件已移入可恢复回收区');await assert.rejects(fs.stat(path.join(work,'copy.txt')))
 await area.getByRole('tab',{name:'可恢复回收区',exact:true}).click();await action('读取回收记录')
 await expect(area.getByRole('button',{name:'恢复',exact:true})).toBeVisible({timeout:15000})
 await fs.writeFile(path.join(work,'copy.txt'),'keep this occupied destination')
 await action('恢复',true);await expect(area.getByRole('alert')).toBeVisible({timeout:15000})
 assert.equal(await fs.readFile(path.join(work,'copy.txt'),'utf8'),'keep this occupied destination')
 await fs.unlink(path.join(work,'copy.txt')) // Only this disposable fixture's intentional collision.
 await action('恢复',true);await waitNotice('恢复已收到成功回执')
 assert.equal(await fs.readFile(path.join(work,'copy.txt'),'utf8'),'updated 中文\n')
 pass('recoverable trash and no-overwrite restore operate on actual files from the system UI')
 await area.getByRole('tab',{name:'文件',exact:true}).click();await area.getByRole('button',{name:'新建文件夹',exact:true}).click();await area.getByLabel('文件操作目标位置').fill('output');await action('确认新建');await waitNotice('文件夹已创建')
 assert.equal((await fs.stat(path.join(work,'output'))).isDirectory(),true)
 await action('刷新目录');await expect(area.getByRole('button',{name:'renamed.txt',exact:true})).toBeEnabled();await area.getByRole('button',{name:'renamed.txt',exact:true}).click();await action('读取内容');await expect(editor).toHaveValue('updated 中文\n',{timeout:15000})
 await editor.fill('conflicting content');await fs.writeFile(path.join(work,'renamed.txt'),'changed externally')
 await action('保存修改',true);await expect(area.getByRole('alert')).toBeVisible({timeout:15000});assert.equal(await fs.readFile(path.join(work,'renamed.txt'),'utf8'),'changed externally')
 await expect(editor).toHaveValue('conflicting content')
 pass('external write produces a conflict, preserves the external file and keeps the unsaved workbench draft')
 await area.getByRole('button',{name:'放弃草稿',exact:true}).click();await approve('放弃草稿')
 await area.getByRole('button',{name:'large.txt',exact:true}).click();await action('读取内容');await expect(editor).toHaveValue('x'.repeat(12000),{timeout:15000});await expect(editor).not.toBeEditable()
 pass('the existing 12k-character result truncation can never become an editable overwrite')
 await area.getByRole('button',{name:'新建文件',exact:true}).click();await area.getByLabel('文件操作目标位置').fill('lost-reply.txt');await area.getByLabel('新建文本内容').fill('exactly once')
 await page.route('**/__pb/api/local-devices/'+device.id+'/jobs',async route=>{const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed')},{times:1})
 await action('确认新建');await expect(area.getByRole('button',{name:'核实同一操作',exact:true})).toBeVisible({timeout:15000})
 await area.getByRole('button',{name:'核实同一操作',exact:true}).click();await waitNotice('原操作结果已核实')
 assert.equal(await fs.readFile(path.join(work,'lost-reply.txt'),'utf8'),'exactly once')
 assert.equal(jobs.filter(t=>t==='files.write').length,1)
 pass('lost POST receipt reuses the original request and performs the real write exactly once')
 // Exercise narrow and wide layouts on real rendered markup, without changing grants.
 for(const width of [390,768,1440,1780]){await page.setViewportSize({width,height:980});const m=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(m.scroll<=m.width+3,'overflow '+width+' '+JSON.stringify(m))}
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'file-workspace.png'),fullPage:true})
 pass('workspace fits 390/768/1440/1780px without horizontal page overflow')
 assert.deepEqual(errors,[])
 const result={checks,realChrome:true,realBackend:true,realFileRuntime:true,isolatedRootOnly:true,executedJobs:jobs.length,paidModelCalls:0,userFilesChanged:0,nativeApplicationOpened:false,nativeAdapterRequests:nativeRequests.length}
 await fs.writeFile(path.join(out,'integration-result.json'),JSON.stringify(result,null,2));console.log('COMPUTER_WORKSPACE_PASS '+JSON.stringify(result))
}catch(error){console.error('ISOLATED_BACKEND_DIAGNOSTIC '+backendLog.replace(/[A-Za-z0-9_-]{40,}/g,'[REDACTED]').slice(-3000));throw error}finally{
 closed=true;clearInterval(timer);await browser?.close();for(let n=0;n<100&&working;n++)await sleep(50)
 await runtime?.close();await ui?.close();await stopHeadlessPocketBase(backend)
 await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});await fs.rm(db,{recursive:true,force:true,maxRetries:5,retryDelay:100});await fs.rm(path.join(out,'fixture.html'),{force:true})
}
