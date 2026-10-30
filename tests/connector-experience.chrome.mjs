// Real Chrome + disposable PocketBase. Only isolated test devices emit synthetic
// signed heartbeats; UI discovery must never execute, re-pair or change permissions.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {createServer} from 'node:net'
import {DatabaseSync} from 'node:sqlite'
import {chromium,expect} from 'playwright/test'
import {createServer as createVite} from 'vite'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),out=path.join(root,'.tmp','connector-experience');await fs.mkdir(out,{recursive:true})
const db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-connector-experience-'))
const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r))
const origin='http://127.0.0.1:'+port,key=randomBytes(24).toString('hex'),password='Disposable-connector-experience-2026!',revision='d'.repeat(24)
const release=JSON.parse(await fs.readFile(path.join(root,'public/downloads/connector-release.json'),'utf8'))
let backend,ui,browser,timer,stopping=false,polling=false,checks=0,logs='',token
const devices=[],errors=[],requests=[],pass=message=>{checks++;console.log('PASS '+message)}
const api=async(route,body,auth=token,setup=false)=>{
 const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{}),...(setup?{'X-Agent-Studio-Setup-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)})
 const data=await r.json().catch(()=>({}));assert.ok(r.ok,route+' '+r.status+' '+JSON.stringify(data));return data
}
const counts=()=>{const c=new DatabaseSync(path.join(db,'data.db'),{readOnly:true});try{return {controls:c.prepare('SELECT COUNT(*) AS n FROM studio_local_controls').get().n,jobs:c.prepare('SELECT COUNT(*) AS n FROM studio_local_jobs').get().n}}finally{c.close()}}
async function heartbeat(){
 if(stopping||polling)return;polling=true
 try{for(const d of devices){const r=await fetch(origin+'/api/public/local-executor/control-poll',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Device-Token':d.credential.token},body:JSON.stringify({heartbeat_only:true,summary:{protocol:'permissions-v2',version:d.version,revision,applied_revision:revision,sites:['https://fixture.example'],grants:[],state:'online'}}),signal:AbortSignal.timeout(10000)});assert.ok(r.ok,'isolated authenticated heartbeat')}}catch(e){if(!stopping)errors.push(e.message)}finally{polling=false}
}
try{
 backend=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
 backend.stdout.on('data',b=>logs=(logs+String(b)).slice(-5000));backend.stderr.on('data',b=>logs=(logs+String(b)).slice(-5000))
 await expect.poll(async()=>{try{return(await fetch(origin+'/api/health')).status}catch{return 0}},{timeout:20000}).toBe(200)
 await api('/api/studio/bootstrap',{email:'experience@example.test',password,display_name:'连接体验隔离验收'},null,true)
 token=(await api('/api/collections/studio_users/auth-with-password',{identity:'experience@example.test',password},null)).token
 for(const version of ['0.1.0-preview.12','0.1.0-preview.99']){
  const d=await api('/api/local-devices',{name:'同名验收电脑'}),credential=await api('/api/public/local-executor/pair',{code:d.pairing_code},null)
  devices.push({...d,credential,version})
 }
 await api('/api/studio/users',{email:'other-experience@example.test',password,display_name:'其他员工',role:'employee'})
 const otherToken=(await api('/api/collections/studio_users/auth-with-password',{identity:'other-experience@example.test',password},null)).token
 const foreign=await api('/api/local-devices',{name:'不属于当前账号的电脑'},otherToken)
 await heartbeat();timer=setInterval(()=>void heartbeat(),1500)
 process.env.AGENT_STUDIO_PB_ORIGIN=origin
 ui=await createVite({configFile:path.join(root,'vibex-local/vite.local.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:false,open:false},logLevel:'error'});await ui.listen()
 const web='http://127.0.0.1:'+ui.httpServer.address().port
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1050}})
 page.on('pageerror',e=>errors.push(e.message))
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/__pb/')||u.pathname.startsWith('/downloads/'))requests.push({path:u.pathname,method:r.method()})})
 await page.goto(web+'/login?next='+encodeURIComponent('/tool-hub?view=devices'))
 await page.getByLabel('工作邮箱',{exact:true}).fill('experience@example.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click()
 const list=page.getByRole('region',{name:'本人设备清单',exact:true})
 await expect(list).toContainText('存在同名连接')
 await page.getByLabel('搜索本人设备').fill('#'+devices[0].id.slice(-6))
 await expect(list.locator('[data-device-id]')).toHaveCount(1)
 await list.locator('[data-device-id="'+devices[0].id+'"]').getByRole('button',{name:'检查连接',exact:true}).click()
 const overview=page.getByRole('region',{name:'当前电脑运行状态',exact:true})
 await expect(overview.getByTestId('running-connector-version')).toHaveText('0.1.0-preview.12')
 await expect(overview.getByTestId('download-connector-version')).toHaveText(release.version)
 await expect(overview).toContainText('运行中的旧版尚未切换')
 await overview.getByRole('button',{name:'查看安全升级步骤',exact:true}).click()
 const guide=overview.getByRole('region',{name:'保留连接的升级步骤'})
 await expect(guide).toContainText(devices[0].id.slice(-6));await expect(guide).toContainText('不要重新下载配对 JSON')
 assert.deepEqual(counts(),{jobs:0,controls:0})
 pass('same-name identifier search selects one owned device; download and actually running versions are visibly distinct')
 devices[0].version=release.version;await expect.poll(async()=>{await heartbeat();return(await api('/api/local-devices/'+devices[0].id+'/permissions')).version}).toBe(release.version)
 await overview.getByRole('button',{name:'核实版本与连接',exact:true}).click()
 await expect(overview.getByTestId('running-connector-version')).toHaveText(release.version)
 await expect(overview).toContainText('运行版本与本站发布版一致')
 pass('only a new authenticated executor report changes the running version; merely opening the upgrade guide never does')
 for(let i=0;i<3;i++){await heartbeat();await overview.getByRole('button',{name:'核实版本与连接',exact:true}).click();await expect(overview.getByTestId('download-connector-version')).toHaveText(release.version);await expect(overview).toContainText('连接与授权已就绪')}
 pass('freshly received heartbeat timestamps do not look offline against an older render clock')
 const noDownload=route=>route.fulfill({status:503,body:'unavailable'})
 await page.route('**/downloads/connector-release.json',noDownload)
 await overview.getByRole('button',{name:'核实版本与连接',exact:true}).click()
 await expect(overview.getByTestId('download-connector-version')).toHaveText('暂时无法核实')
 await expect(overview).not.toContainText('运行版本与本站发布版一致')
 await page.unroute('**/downloads/connector-release.json',noDownload)
 await overview.getByRole('button',{name:'核实版本与连接',exact:true}).click();await expect(overview.getByTestId('download-connector-version')).toHaveText(release.version)
 pass('download metadata failure is explicit unknown, never a fabricated upgrade confirmation')
 const outage=route=>route.fulfill({status:503,contentType:'application/json',body:'{}'})
 await page.route('**/__pb/api/local-devices',outage);await page.getByRole('button',{name:'刷新设备',exact:true}).click()
 await expect(page.getByRole('alert',{name:'当前设备状态异常',exact:true})).toBeVisible()
 await expect(overview).toContainText('状态未核实');await expect(overview).not.toContainText('连接与授权已就绪')
 assert.equal(await list.isVisible(),false)
 await page.unroute('**/__pb/api/local-devices',outage);await page.getByRole('button',{name:'重新核实当前设备',exact:true}).click()
 await expect(overview).toContainText('连接与授权已就绪')
 pass('inventory failure is visible while the device list is collapsed; same selected device and existing panels are retained')
 const permissionRoute='**/__pb/api/local-devices/'+devices[0].id+'/permissions'
 await page.route(permissionRoute,outage);await overview.getByRole('button',{name:'核实版本与连接',exact:true}).click()
 await expect(overview).toContainText('状态未核实');await expect(overview).toContainText('最近上报版本（当前未核实）')
 await page.unroute(permissionRoute,outage);await overview.getByRole('button',{name:'核实版本与连接',exact:true}).click();await expect(overview).toContainText('连接与授权已就绪')
 pass('permission channel failure demotes cached data; recovery is read-only and preserves binding')
 await page.getByRole('tab',{name:'授权管理',exact:true}).click();await page.getByRole('button',{name:'编辑网站',exact:true}).click()
 const sheet=page.getByRole('dialog',{name:'工作台授权管理',exact:true})
 await sheet.getByLabel('添加授权网站').fill('draft-only.example');await sheet.getByRole('button',{name:'返回工作台',exact:true}).click()
 await expect(page.getByRole('button',{name:'切换 / 管理设备',exact:true})).toBeDisabled()
 await expect(page.getByRole('tab',{name:'文件工作区',exact:true})).toBeDisabled()
 await expect(guide).toContainText('当前有草稿、审批或未核实的操作')
 await page.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(sheet.getByLabel('添加授权网站')).toHaveValue('draft-only.example')
 await sheet.getByRole('button',{name:'放弃未保存修改',exact:true}).click();await sheet.getByRole('button',{name:'返回工作台',exact:true}).click()
 await expect(page.getByRole('button',{name:'切换 / 管理设备',exact:true})).toBeEnabled()
 assert.deepEqual(counts(),{jobs:0,controls:0})
 pass('unsaved permission drafts prevent switching device or tab and are explicitly recoverable or discardable')
 const arrived=Promise.withResolvers(),releaseRead=Promise.withResolvers(),finished=Promise.withResolvers()
 const delayed=async route=>{const response=await route.fetch();arrived.resolve();await releaseRead.promise;try{await route.fulfill({response})}catch{/* Device switch intentionally aborts this stale response. */}finally{finished.resolve()}}
 await page.route(permissionRoute,delayed,{times:1});await overview.getByRole('button',{name:'核实版本与连接',exact:true}).click();await arrived.promise
 await page.getByRole('button',{name:'切换 / 管理设备',exact:true}).click();await page.getByLabel('搜索本人设备').fill('')
 await list.locator('[data-device-id="'+devices[1].id+'"]').getByRole('button',{name:'检查连接',exact:true}).click()
 await expect(overview.getByTestId('running-connector-version')).toHaveText('0.1.0-preview.99')
 releaseRead.resolve();await finished.promise
 await expect(overview.getByTestId('running-connector-version')).toHaveText('0.1.0-preview.99');await expect(overview).toContainText('无需降级')
 pass('late metadata from a previously selected same-name computer cannot overwrite the new device; newer builds are never asked to downgrade')
 await overview.getByRole('button',{name:'查看连接器使用说明',exact:true}).click()
 for(const width of [390,768,1440,1780]){await page.setViewportSize({width,height:1050});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4));await overview.screenshot({path:path.join(out,'connection-overview-'+width+'.png')})}
 pass('version, identity and upgrade guidance fit four viewport widths without horizontal page overflow')
 await page.goto(web+'/tool-hub?view=devices&device='+foreign.id)
 await expect(page.getByRole('region',{name:'本人设备清单',exact:true})).toContainText('同名验收电脑')
 await expect(page.getByRole('region',{name:'当前电脑运行状态',exact:true})).toHaveCount(0)
 await expect(page.getByRole('region',{name:'我的电脑与浏览器',exact:true})).not.toContainText('不属于当前账号的电脑')
 pass('an unowned device URL is not a connection selector and does not expose another account')
 assert.deepEqual(errors,[]);assert.deepEqual(counts(),{jobs:0,controls:0})
 assert.equal(requests.some(r=>r.method==='POST'&&/local-devices|local-controls|local-jobs/.test(r.path)),false)
 const report={checks,realChrome:true,realPocketBase:true,executorHeartbeats:'isolated authenticated fixtures',faultInjection:['download 503','inventory 503','permission 503','delayed previous-device response'],browserPermissionWrites:0,browserLocalJobs:0,userProfilesTouched:false}
 await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify(report,null,2))
 console.log('CONNECTOR_EXPERIENCE_CHROME_PASS '+JSON.stringify(report))
}catch(error){console.error('CONNECTOR_EXPERIENCE_CHROME_FAIL',error.stack||error,logs.slice(-1200));throw error}
finally{stopping=true;clearInterval(timer);while(polling)await new Promise(r=>setTimeout(r,50));await browser?.close();await ui?.close();await stopHeadlessPocketBase(backend).catch(()=>{});await fs.rm(db,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
