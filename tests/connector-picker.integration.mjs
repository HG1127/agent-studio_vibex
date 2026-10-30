// Actual PocketBase, actual Chrome and actual UI component. Native result timing
// is controlled here; the Windows companion separately checks the real dialog.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {createServer as createVite} from 'vite'
import {chromium,expect} from 'playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
const root=process.cwd(),base=path.join(root,'.tmp','picker-progress');await fs.mkdir(base,{recursive:true})
const home=await fs.mkdtemp(path.join(base,'home-')),dbDir=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-picker-progress-')),folder=path.join(home,'研究报告')
await fs.mkdir(folder)
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const origin='http://127.0.0.1:'+port,key=randomBytes(24).toString('hex'),password='isolated-picker-123!'
let pb,ui,browser,manager,db,checks=0;const errors=[],pickers=[]
const pass=label=>{checks++;console.log('PASS '+label)}
const api=async(route,body,token,bootstrap=false)=>{const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(bootstrap?{'X-Agent-Studio-Setup-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:r.status,data:await r.json().catch(()=>({}))}}
const progress='/api/public/local-executor/setup-progress'
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+dbDir,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
 pb.stdout.on('data',()=>{});pb.stderr.on('data',()=>{})
 await expect.poll(async()=>{try{return (await api('/api/health')).status}catch{return 0}},{timeout:20000}).toBe(200)
 assert.equal((await api('/api/studio/bootstrap',{email:'picker-ui@example.test',password,display_name:'隔离测试'},null,true)).status,201)
 const auth=(await api('/api/collections/studio_users/auth-with-password',{identity:'picker-ui@example.test',password})).data,token=auth.token
 const pairing=(await api('/api/local-devices',{name:'选择目录状态隔离测试'},token)).data
 const identity={id:pairing.id,code:pairing.pairing_code},attemptA='a'.repeat(24),attemptB='b'.repeat(24)
 const report=(attempt,previousAttempt,sequence,stage,extra={})=>api(progress,{...identity,attempt,previousAttempt,sequence,stage,...extra})
 assert.equal((await api(progress+'/context',identity)).data.previousAttempt,'')
 assert.equal((await report(attemptA,'',1,'imported')).status,200)
 assert.equal((await report(attemptA,'',2,'choosing_folder')).status,200)
 let rows=(await api('/api/local-devices',undefined,token)).data.items
 assert.equal(rows.length,1);assert.equal(rows[0].setup_stage,'choosing_folder');assert.equal(rows[0].paired,false);assert.equal(rows[0].seen_ms,0);assert.equal(rows[0].pairing_expires_ms,pairing.expires_ms)
 const before=rows[0].setup_seen_ms
 assert.equal((await report(attemptA,'',1,'imported')).data.accepted,false)
 assert.equal((await api('/api/local-devices',undefined,token)).data.items[0].setup_seen_ms,before)
 assert.equal((await api(progress+'/context',identity)).data.previousAttempt,attemptA)
 assert.equal((await report(attemptB,attemptA,1,'imported')).status,200)
 assert.equal((await report(attemptA,'',1,'imported')).status,409)
 const simultaneous=await Promise.all(['c','d'].map(c=>report(c.repeat(24),attemptB,1,'imported')))
 assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,409])
 assert.equal((await report(attemptA,'',3,'ready_to_confirm')).status,409)
 assert.equal((await report(attemptB,attemptA,1,'imported',{path:'must-not-be-accepted'})).status,400)
 assert.equal((await api(progress+'/context',{...identity,code:'z'.repeat(48)})).status,401)
 assert.equal((await api('/api/local-devices')).status,401)
 pass('real SQLite CAS rejects stale attempts/replays; preparation cannot pair, heartbeat or extend ticket')
 db=new DatabaseSync(path.join(dbDir,'data.db'))
 const owner=db.prepare('SELECT owner FROM studio_local_devices WHERE id=?').get(pairing.id).owner
 db.prepare('UPDATE studio_local_devices SET owner=? WHERE id=?').run('other-owner-fixture',pairing.id)
 assert.equal((await api('/api/local-devices',undefined,token)).data.items.length,0)
 db.prepare('UPDATE studio_local_devices SET owner=? WHERE id=?').run(owner,pairing.id)
 db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(owner)
 assert.equal((await api(progress+'/context',identity)).status,401)
 db.prepare('UPDATE studio_users SET active=1 WHERE id=?').run(owner)
 db.prepare('UPDATE studio_local_devices SET pair_until=? WHERE id=?').run(Date.now()-1,pairing.id)
 assert.equal((await api(progress+'/context',identity)).status,401)
 const renewed=(await api('/api/local-devices/'+pairing.id+'/renew-pairing',{},token)).data
 assert.equal(renewed.id,pairing.id);assert.equal((await api(progress+'/context',identity)).status,401)
 const cleared=(await api('/api/local-devices',undefined,token)).data.items[0]
 assert.equal(cleared.setup_stage,'');assert.equal(cleared.setup_seen_ms,0);assert.equal(cleared.paired,false)
 pass('expired/old-code/inactive-owner reports rejected; renewal keeps same device and hides old progress')
 process.env.AGENT_STUDIO_PB_ORIGIN=origin
 ui=await createVite({root,server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});await ui.listen()
 const uiOrigin='http://127.0.0.1:'+ui.httpServer.address().port
 const html='<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from "react";import {createRoot} from "react-dom/client";import {ConnectComputerButton} from "/src/components/tool-hub/ConnectComputerButton.tsx";import "/src/index.css";createRoot(document.getElementById("root")).render(React.createElement(ConnectComputerButton,{mode:"files",continueDevice:window.__pickerDevice}));</script></body></html>'
 await fs.writeFile(path.join(base,'browser-fixture.html'),html)
 manager=await createConnectorManager({home,picker:options=>new Promise(resolve=>{pickers.push({...options,resolve});options.onStarted()})})
 browser=await chromium.launch({channel:'chrome',headless:true})
 const workbench=await browser.newPage({viewport:{width:1100,height:900}}),local=await browser.newPage({viewport:{width:1100,height:900}})
 for(const page of [workbench,local])page.on('pageerror',e=>errors.push(e.message))
 await workbench.addInitScript(({auth,device})=>{sessionStorage.setItem('agent_studio_employee_auth',JSON.stringify(auth));window.__pickerDevice=device},{auth,device:cleared})
 await workbench.goto(uiOrigin+'/.tmp/picker-progress/browser-fixture.html')
 await workbench.getByRole('button',{name:'连接电脑 / 浏览器',exact:true}).click()
 await workbench.getByLabel('我已解压连接器并打开本机管理窗口（已有可用组件也可）').check()
 await workbench.getByLabel('我在自己的电脑上操作，并同意以上访问范围。').check()
 const downloaded=workbench.waitForEvent('download')
 await workbench.getByRole('button',{name:'更新此设备的连接文件',exact:true}).click()
 const download=await downloaded,ticketFile=path.join(home,'ticket.json');await download.saveAs(ticketFile)
 const currentTicket=JSON.parse(await fs.readFile(ticketFile,'utf8'));assert.equal(currentTicket.pairing.id,pairing.id)
 await local.goto(manager.origin+'/#'+manager.token)
 await local.locator('#ticket').setInputFiles(ticketFile)
 await expect(workbench.getByText('本机已导入连接文件，等待确认范围',{exact:true})).toBeVisible({timeout:10000})
 await local.locator('#pick-folder').click()
 await expect(local.locator('#picker-status')).toBeVisible();await expect(local.locator('#cancel-picker')).toBeEnabled()
 await expect(local.locator('#refresh')).toBeEnabled();await expect(local.locator('#connect')).toBeDisabled()
 await expect(workbench.getByText('本机正在选择工作文件夹',{exact:true})).toBeVisible({timeout:10000})
 await local.screenshot({path:path.join(base,'local-choosing.png'),fullPage:true});await workbench.screenshot({path:path.join(base,'workbench-choosing.png'),fullPage:true})
 assert.equal((await api('/api/local-devices',undefined,token)).data.items.length,1)
 assert.equal((await api('/api/local-devices',undefined,token)).data.items[0].paired,false)
 pass('actual Chrome local UI and workbench show matching selection stage, elapsed time and enabled cancel')
 await local.locator('#cancel-picker').click()
 await expect(local.locator('#picker-status')).toContainText('正在取消')
 assert.equal(pickers[0].signal.aborted,true);await expect(local.locator('#pick-folder')).toBeDisabled()
 pickers[0].resolve(folder)
 await expect(local.locator('#pick-folder')).toBeEnabled();await expect(local.locator('#folder')).toContainText('默认使用专用')
 await expect(workbench.getByText('本机已取消本次选择，等待确认范围',{exact:true})).toBeVisible({timeout:10000})
 await local.locator('#pick-folder').click();await expect.poll(()=>pickers.length).toBe(2);pickers[1].resolve(folder)
 await expect(local.locator('#folder')).toContainText('研究报告');await expect(local.locator('#consent')).not.toBeChecked();await expect(local.locator('#connect')).toBeDisabled()
 await expect(workbench.getByText('本机已选好范围，等待本人确认',{exact:true})).toBeVisible({timeout:10000})
 await local.screenshot({path:path.join(base,'local-ready.png'),fullPage:true})
 rows=(await api('/api/local-devices',undefined,token)).data.items;assert.equal(rows.length,1);assert.equal(rows[0].paired,false);assert.equal(rows[0].seen_ms,0)
 pass('cancel discards late result; explicit retry selects only a draft, without consent or pairing')
 // Exercise pairing only for this disposable fixture, never a user's pending row.
 assert.equal((await api('/api/public/local-executor/pair',{code:currentTicket.pairing.code})).status,200)
 await expect(workbench.getByText('配对已完成，等待连接器启动',{exact:true})).toBeVisible({timeout:10000})
 rows=(await api('/api/local-devices',undefined,token)).data.items
 assert.equal(rows[0].setup_stage,'');assert.equal(rows[0].paired,true);assert.equal(rows[0].seen_ms,0)
 assert.equal((await api(progress+'/context',{id:pairing.id,code:currentTicket.pairing.code})).status,401)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM studio_local_jobs').get().n,0)
 assert.deepEqual(errors,[])
 pass('real pairing overrides progress but zero heartbeat never becomes online; no execution jobs')
 const result={checks,realChrome:true,realBackend:true,realWorkbenchComponent:true,nativePicker:'controlled here; independently tested on Windows',userDevicesChanged:0,paidModelCalls:0}
 await fs.writeFile(path.join(base,'integration-result.json'),JSON.stringify(result,null,2));console.log('PICKER_PROGRESS_PASS '+JSON.stringify(result))
}finally{
 for(const p of pickers)p.resolve('')
 await browser?.close();await manager?.close();await ui?.close();db?.close();await stopHeadlessPocketBase(pb)
 await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});await fs.rm(dbDir,{recursive:true,force:true,maxRetries:5,retryDelay:100})
 await fs.rm(path.join(base,'browser-fixture.html'),{force:true})
}
