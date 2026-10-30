// Workbench -> real authenticated device job -> real child IPC -> local GUI.
// Window creation is a headless Chrome adapter, not a fake operation result.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {randomBytes,randomUUID} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {chromium,expect} from '@playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {prepareGuidedConnection} from '../local-executor/setup.mjs'

const root=process.cwd(),out=path.join(root,'.tmp','permission-entry');await fs.mkdir(out,{recursive:true})
const home=await fs.mkdtemp(path.join(out,'home-')),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-entry-db-'))
const folder=path.join(home,'测试工作资料');await fs.mkdir(folder);await fs.writeFile(path.join(folder,'fixture.txt'),'do not read automatically')
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+probe.address().port;await new Promise(r=>probe.close(r))
const key=randomBytes(24).toString('hex'),password='entry-test-123!',errors=[],openedPages=[],openUrls=[]
let pb,manager,browser,context,ui,checks=0
const pass=text=>{checks++;console.log('PASS '+text)}
const api=async(route,method='GET',body,token,setup=false)=>{const response=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(setup?{'X-Agent-Studio-Setup-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});return {status:response.status,data:await response.json().catch(()=>({}))}}
const jobRows=()=>{const connection=new DatabaseSync(path.join(db,'data.db'),{readOnly:true,timeout:5000});try{return connection.prepare('SELECT payload,status,result FROM studio_local_jobs').all()}finally{connection.close()}}
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http='+new URL(origin).host,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key}})
 pb.stdout.on('data',()=>{});pb.stderr.on('data',()=>{})
 let ready=false;for(let i=0;i<130;i++){try{if((await api('/api/health')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready)
 assert.equal((await api('/api/studio/bootstrap','POST',{email:'entry@example.test',password,display_name:'授权入口测试'},null,true)).status,201)
 const token=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'entry@example.test',password})).data.token
 assert.equal((await api('/api/studio/users','POST',{email:'other-entry@example.test',password,display_name:'其他测试员工',role:'employee'},token)).status,201)
 const other=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'other-entry@example.test',password})).data.token
 const pairing=(await api('/api/local-devices','POST',{name:'授权入口测试电脑'},token)).data
 const ticket={format:'agent-studio-connect-v1',server:origin,name:'授权入口测试电脑',mode:'files',origins:[],pairing:{id:pairing.id,code:pairing.pairing_code,expiresAt:pairing.expires_ms}}
 const installed=await prepareGuidedConnection(ticket,{home,chooseWorkspace:async()=>({path:folder,readOnly:true}),confirm:async()=>true})
 const originalConfig=await fs.readFile(installed.configFile,'utf8'),credentials=await fs.readFile(path.join(path.dirname(installed.configFile),'.local-device-credentials.json'),'utf8')
 browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1440,height:960}})
 manager=await createConnectorManager({home,picker:async()=>folder,filePicker:async()=>path.join(folder,'fixture.txt'),openWindow:async url=>{
  openUrls.push(url);const opened=await context.newPage();opened.on('pageerror',e=>errors.push(e.message));await opened.goto(url);openedPages.push(opened)
 }})
 const local=await context.newPage();local.on('pageerror',e=>errors.push(e.message));await local.goto(manager.origin+'/#'+manager.token)
 await local.getByRole('button',{name:'恢复连接',exact:true}).click();await local.locator('#approve').click()
 await expect(local.locator('#profiles')).toContainText('服务器已确认在线',{timeout:25000})
 const device=(await api('/api/local-devices','GET',undefined,token)).data.items[0]
 assert.ok(JSON.parse(device.catalog).some(t=>t.name==='connector.open_permissions'))
 assert.doesNotMatch(device.catalog,/studio-local-session|#|127\.0\.0\.1/)
 process.env.AGENT_STUDIO_PB_ORIGIN=origin
 const {preview}=await import('vite');ui=await preview({configFile:path.join(root,'vibex-local/vite.local.config.ts'),preview:{port:0,strictPort:false,host:'127.0.0.1',open:false},logLevel:'error'})
 const webOrigin='http://127.0.0.1:'+ui.httpServer.address().port,page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(webOrigin+'/login?next='+encodeURIComponent('/tool-hub?view=devices'))
 await page.getByLabel('工作邮箱',{exact:true}).fill('entry@example.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click()
 const panel=page.getByRole('region',{name:'我的电脑与浏览器',exact:true})
 await panel.locator('[data-device-id="'+pairing.id+'"]').getByRole('button',{name:'检查连接',exact:true}).click()
 const scope=page.getByRole('region',{name:'工作目录授权',exact:true})
 await expect(scope.getByRole('heading',{name:'授权管理',exact:true})).toBeVisible()
 await expect(scope).toContainText('测试工作资料');await expect(scope.getByRole('button',{name:'编辑网站',exact:true})).toBeVisible()
 for(const width of [390,768,1440,1780]){await page.setViewportSize({width,height:960});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));await scope.screenshot({path:path.join(out,'workbench-permissions-'+width+'.png')})}
 await page.setViewportSize({width:1440,height:960})
 await scope.getByRole('button',{name:'管理网站与文件授权',exact:true}).click()
 const sheet=page.getByRole('dialog',{name:'工作台授权管理',exact:true})
 await expect(sheet).toContainText('已支持从工作台打开本机编辑器')
 assert.equal(jobRows().length,0);assert.equal(openedPages.length,0)
 pass('current workbench visibly separates websites and files at four widths; inspecting scope enqueues nothing')
 await sheet.getByRole('button',{name:'在本机编辑网站',exact:true}).click()
 await expect.poll(()=>openedPages.length,{timeout:25000}).toBe(1)
 const native=openedPages[0];await expect(native.getByRole('dialog',{name:'管理网站与文件授权',exact:true})).toBeVisible()
 await expect(native.locator('#sites-tab')).toHaveAttribute('aria-selected','true')
 await expect(native.locator('#permission-target')).toContainText('授权入口测试电脑')
 await expect(sheet.getByRole('status')).toContainText('已向')
 assert.equal(native.url().includes(manager.token),false)
 assert.equal(await fs.readFile(installed.configFile,'utf8'),originalConfig)
 assert.equal(await fs.readFile(path.join(path.dirname(installed.configFile),'.local-device-credentials.json'),'utf8'),credentials)
 assert.equal(jobRows().length,1);assert.equal(jobRows()[0].status,'succeeded')
 assert.equal(JSON.parse(jobRows()[0].payload).tool,'connector.open_permissions')
 assert.ok(!JSON.stringify(jobRows()).includes(manager.token));assert.ok(!JSON.stringify(jobRows()).includes(folder))
 pass('one workbench click traverses real device queue and IPC into the correct local website editor; no permissions or credentials change')
 await native.locator('#site-input').fill('https://example.test');await native.locator('#site-add').click()
 await expect(native.locator('#permission-sites')).toContainText('https://example.test')
 const count=jobRows().length
 const denied=await api('/api/local-devices/'+pairing.id+'/jobs','POST',{tool:'connector.open_permissions',arguments:{panel:'files'},confirm:true,request_id:randomUUID()},other)
 assert.equal(denied.status,409);assert.equal(jobRows().length,count)
 await new Promise(r=>setTimeout(r,2100))
 await sheet.getByRole('tab',{name:'文件与文件夹',exact:true}).click();await sheet.getByRole('button',{name:'在本机选择文件',exact:true}).click()
 await expect.poll(()=>openedPages.length,{timeout:25000}).toBe(2)
 const nativeFiles=openedPages[1];await expect(nativeFiles.locator('#files-tab')).toHaveAttribute('aria-selected','true')
 await expect(nativeFiles.locator('#permission-summary')).toContainText('尚未保存')
 await nativeFiles.locator('#sites-tab').click();await expect(nativeFiles.locator('#permission-sites')).toContainText('https://example.test')
 await nativeFiles.locator('#files-tab').click();await nativeFiles.locator('#grant-file').click()
 await expect(nativeFiles.locator('#permission-grants')).toContainText('fixture.txt')
 await nativeFiles.screenshot({path:path.join(out,'local-editor-opened-from-workbench.png'),fullPage:false})
 assert.equal(await fs.readFile(installed.configFile,'utf8'),originalConfig)
 pass('file entry focuses the same device, preserves its unsaved website draft, and other employees cannot open it')
 await nativeFiles.locator('#permission-cancel').click();await nativeFiles.locator('#approve').click()
 await expect(nativeFiles.locator('#permission-editor')).not.toBeVisible()
 assert.equal(await fs.readFile(installed.configFile,'utf8'),originalConfig)
 await sheet.getByRole('button',{name:'返回工作台',exact:true}).click()
 const legacy=async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,items:data.items.map(d=>({...d,catalog:JSON.stringify(JSON.parse(d.catalog).filter(t=>t.name!=='connector.open_permissions'))}))}})}
 await page.route('**/__pb/api/local-devices',legacy);await panel.getByRole('button',{name:'刷新设备',exact:true}).click()
 await scope.getByRole('button',{name:'编辑网站',exact:true}).click();await expect(sheet).toContainText('这条连接尚未提供一键打开入口')
 assert.equal(openedPages.length,2);assert.equal(jobRows().length,2)
 await sheet.getByRole('button',{name:'返回工作台',exact:true}).click();await page.unroute('**/__pb/api/local-devices',legacy)
 pass('older connectors show truthful upgrade/manual entry instead of a fake editor or automatic rebinding')
 await page.route('**/__pb/api/local-devices',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}))
 await panel.getByRole('button',{name:'刷新设备',exact:true}).click()
 await expect(scope.getByRole('button',{name:'编辑网站',exact:true})).toBeDisabled()
 assert.equal(jobRows().length,2);assert.equal(await fs.readFile(installed.configFile,'utf8'),originalConfig)
 await page.unroute('**/__pb/api/local-devices')
 assert.deepEqual(errors,[])
 pass('unverified inventory disables opening; cancellation preserves real scopes and no file/browser task is executed')
 console.log('PERMISSION_ENTRY_BROWSER_PASS '+JSON.stringify({checks,realChrome:true,realBackend:true,realChildIpc:true,windowAdapter:'headless Chrome newPage',nativePickers:'injected',openingJobs:jobRows().length,permissionWrites:0,paidModelCalls:0,productionMutated:false}))
}finally{await manager?.close();await browser?.close();await ui?.httpServer?.close();await stopHeadlessPocketBase(pb).catch(()=>{});await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.rm(db,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
