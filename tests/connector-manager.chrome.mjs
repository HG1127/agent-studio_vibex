// Real local UI + disposable backend + IPC child connector. Native chooser is
// a controlled adapter; real filesystem/runtime/binding are not mocked.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {randomBytes} from 'node:crypto'
import {chromium,expect} from 'playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
const root=process.cwd(),base=path.join(root,'.tmp','portable-manager-test');await fs.mkdir(base,{recursive:true})
const home=await fs.mkdtemp(path.join(base,'home-')),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-manager-db-'))
const folder=path.join(home,'研究资料');await fs.mkdir(folder);await fs.writeFile(path.join(folder,'proof.txt'),'local-only-fixture')
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const origin='http://127.0.0.1:'+port,key=randomBytes(24).toString('hex'),password='manager-test-123!';let pb,manager,browser,checks=0
const errors=[],pass=text=>{checks++;console.log('PASS '+text)}
const api=async(route,method='GET',body,token,bootstrap=false)=>{const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(bootstrap?{'X-Agent-Studio-Setup-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:r.status,data:await r.json().catch(()=>({}))}}
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
 pb.stdout.on('data',()=>{});pb.stderr.on('data',()=>{})
 let ready=false;for(let i=0;i<130;i++){try{if((await api('/api/health')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready)
 assert.equal((await api('/api/studio/bootstrap','POST',{email:'portable-ui@example.test',password,display_name:'便携测试'},null,true)).status,201)
 const token=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'portable-ui@example.test',password})).data.token
 const pairing=(await api('/api/local-devices','POST',{name:'同事电脑隔离测试'},token)).data
 const ticket={format:'agent-studio-connect-v1',server:origin,name:'同事电脑隔离测试',mode:'files',origins:[],pairing:{id:pairing.id,code:pairing.pairing_code,expiresAt:pairing.expires_ms}}
 const file=path.join(home,'ticket.json');await fs.writeFile(file,JSON.stringify(ticket))
 let pickedFolder=folder
 manager=await createConnectorManager({home,picker:async()=>pickedFolder})
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:950}});page.on('pageerror',e=>errors.push(e.message))
 await page.goto(manager.origin+'/#'+manager.token)
 await expect(page.getByRole('heading',{name:'连接一次，按需使用电脑'})).toBeVisible()
 await expect(page.locator('main > section:visible').first().getByRole('heading',{name:'连接新账号或设备'})).toBeVisible()
 await expect(page.locator('main > section:visible').first()).toContainText('CMD 启动不等于已连接')
 assert.ok(!page.url().includes(manager.token));await page.reload();await expect(page.getByText('尚未找到已保存连接。',{exact:false})).toBeVisible()
 pass('local manager opens without project commands; refreshing retains only its own local tab session')
 await page.locator('#ticket').setInputFiles(file)
 await expect(page.locator('#review')).toBeVisible();await expect(page.locator('#scope')).toContainText('只读')
 assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items[0].paired,false)
 await expect(page.locator('#connect')).toBeDisabled()
 await page.locator('#pick-folder').click();await expect(page.locator('#folder')).toContainText('研究资料')
 await page.locator('#consent').check();await page.locator('#connect').click()
 await expect(page.locator('#profiles')).toContainText('服务器已确认在线',{timeout:25000})
 const inventory=(await api('/api/local-devices','GET',undefined,token)).data.items
 assert.equal(inventory.length,1);assert.equal(inventory[0].id,pairing.id);assert.equal(inventory[0].paired,true)
 assert.ok(!JSON.parse(inventory[0].catalog).some(t=>t.name==='files.write'))
 pass('native-folder adapter + explicit local confirmation bind real backend once and start real read-only child connector')
 await expect(page.locator('#workbench-home')).toBeVisible()
 await expect(page.locator('#workbench-home a')).toHaveAttribute('href',origin+'/tool-hub?view=devices&device='+pairing.id)
 assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items.length,1)
 pass('online native companion presents an explicit same-device workbench link without a new binding or automatic jobs')
 await expect(page.locator('#save-folder')).not.toBeVisible()
 assert.equal(await page.locator('#message').evaluate(e=>getComputedStyle(e).position),'relative')
 await expect(page.locator('#ticket')).toHaveValue('')
 for(const width of [390,768,1440,1780]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))}
 await page.setViewportSize({width:1440,height:950});await page.screenshot({path:path.join(base,'portable-manager.png'),fullPage:true})
 pass('standalone manager layout fits four widths without horizontal overflow')
 await page.getByRole('button',{name:'停止本机连接',exact:true}).click();await page.locator('#approve').click()
 await expect(page.locator('#profiles')).toContainText('未由本程序启动',{timeout:20000})
 const before=(await api('/api/local-devices','GET',undefined,token)).data.items.length
 await page.getByRole('button',{name:'恢复连接',exact:true}).click();await page.locator('#decline').click()
 assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items.length,before)
 await page.getByRole('button',{name:'恢复连接',exact:true}).click();await page.locator('#approve').click()
 await expect(page.locator('#profiles')).toContainText('服务器已确认在线',{timeout:25000})
 assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items.length,before)
 pass('graphical stop/resume keeps original binding; cancelling resume executes nothing')
 await page.getByRole('button',{name:'停止本机连接',exact:true}).click();await page.locator('#approve').click()
 await expect(page.locator('#profiles')).toContainText('未由本程序启动',{timeout:20000})
 const second=(await api('/api/local-devices','POST',{name:'尚未绑定的第二台测试设备'},token)).data
 const secondFile=path.join(home,'second-ticket.json')
 await fs.writeFile(secondFile,JSON.stringify({...ticket,name:'第二台测试设备',pairing:{id:second.id,code:second.pairing_code,expiresAt:second.expires_ms}}))
 await page.locator('#ticket').setInputFiles(secondFile);await page.locator('#pick-folder').click()
 await page.locator('#write').check();await expect(page.locator('#scope')).toContainText('允许新建')
 await page.locator('#consent').check()
 const localApi=async(route,body)=>{const r=await fetch(manager.origin+route,{method:body===undefined?'GET':'POST',headers:{'X-Connector-Session':manager.token,...(body===undefined?{}:{Origin:manager.origin,'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return r.json()}
 // Read-only refresh must preserve consent and the focused field when unchanged.
 await page.locator('#consent').focus()
 const unchanged=page.waitForResponse(r=>r.url()===manager.origin+'/api/state')
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await unchanged
 await expect(page.locator('#consent')).toBeFocused();await expect(page.locator('#consent')).toBeChecked()
 // Another authenticated local tab changes the scope: old approval must clear.
 await localApi('/api/access',{scope:'connect',readOnly:true})
 const changed=page.waitForResponse(r=>r.url()===manager.origin+'/api/state')
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await changed
 await expect(page.locator('#consent')).not.toBeChecked();await expect(page.locator('#connect')).toBeDisabled()
 pass('read-only refresh preserves focus; changed authorization from another local tab clears old consent')
 const originalNewFolder=await page.locator('#folder').innerText()
 await page.locator('details.settings summary').click()
 await page.locator('#edit-profile').selectOption(pairing.id)
 await expect(page.locator('#edit-current')).toContainText('同事电脑隔离测试')
 const changedFolder=path.join(home,'另一个专用资料目录');await fs.mkdir(changedFolder);pickedFolder=changedFolder
 await page.locator('#pick-edit-folder').click();await expect(page.locator('#edit-folder')).toContainText('另一个专用资料目录')
 await page.locator('#edit-write').check()
 await expect(page.locator('#folder')).toHaveText(originalNewFolder);await expect(page.locator('#write')).not.toBeChecked()
 await expect(page.locator('#scope')).toContainText('只读')
 await page.locator('#save-folder').click();await expect(page.locator('#confirm-text')).toContainText('同事电脑隔离测试');await page.locator('#approve').click()
 await expect(page.locator('#edit-profile')).toHaveValue('');await expect(page.locator('#review')).toBeVisible()
 const updated=JSON.parse(await fs.readFile(path.join(home,'.agent-studio','connections',pairing.id,'computer.local.json'),'utf8'))
 assert.equal(updated.roots[0].path,await fs.realpath(changedFolder));assert.equal(updated.roots[0].readOnly,false)
 assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items.find(d=>d.id===second.id).paired,false)
 pass('graphical folder edit changes only its selected saved device; unpaired new-device review stays read-only and unchanged')
 await page.locator('#consent').check()
 await page.route('**/api/state',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'injected_read_outage'})}))
 await page.locator('#refresh').click();await expect(page.locator('#message')).toContainText('暂时无法核实')
 await expect(page.locator('#connect')).toBeDisabled();await expect(page.locator('#scope')).toContainText('第二台测试设备')
 await page.unroute('**/api/state');await page.locator('#refresh').click()
 await expect(page.locator('#message')).toContainText('本机状态已恢复')
 await expect(page.locator('#consent')).not.toBeChecked();await expect(page.locator('#connect')).toBeDisabled()
 pass('local status outage preserves inputs, disables actions and recovers with fresh explicit consent instead of re-pairing')
 const invalid=path.join(home,'expired-ticket.json');await fs.writeFile(invalid,JSON.stringify({...ticket,pairing:{...ticket.pairing,expiresAt:Date.now()-1}}))
 await page.locator('#ticket').setInputFiles(invalid)
 await expect(page.locator('#message')).toContainText('过期')
 await expect(page.locator('#review')).not.toBeVisible()
 assert.equal((await localApi('/api/state')).review,null)
 const shortFile=path.join(home,'short-ticket.json');await fs.writeFile(shortFile,JSON.stringify({...ticket,pairing:{id:second.id,code:second.pairing_code,expiresAt:Date.now()+3500}}))
 await page.locator('#ticket').setInputFiles(shortFile);await page.locator('#consent').check()
 await expect(page.locator('#ticket-expiry')).toContainText('已过期',{timeout:10000});await expect(page.locator('#connect')).toBeDisabled()
 await expect(page.locator('#consent')).not.toBeChecked()
 await page.screenshot({path:path.join(base,'portable-manager-expired.png'),fullPage:true})
 await page.locator('#discard').click();await expect(page.locator('#review')).not.toBeVisible()
 assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items.find(d=>d.id===second.id).paired,false)
 pass('wrong or expired files clear old authorization; visible expiry and discard never consume pairing or alter saved devices')
 await page.screenshot({path:path.join(base,'portable-manager-recovery.png'),fullPage:true})
 // Revoke only the isolated test device; preserve its original local profile.
 const profileDir=path.join(home,'.agent-studio','connections',pairing.id)
 const originalConfig=await fs.readFile(path.join(profileDir,'computer.local.json')),originalCredential=await fs.readFile(path.join(profileDir,'.local-device-credentials.json'))
 const deviceCount=(await api('/api/local-devices','GET',undefined,token)).data.items.length
 assert.equal((await api('/api/local-devices/'+pairing.id+'/revoke','POST',{},token)).status,200)
 await page.getByRole('button',{name:'恢复连接',exact:true}).click();await page.locator('#approve').click()
 const failedCard=page.locator('[data-profile-id="'+pairing.id+'"]')
 await expect(failedCard).toContainText('原绑定未通过验证',{timeout:25000})
 await expect(failedCard.locator('[data-connection-message]')).toContainText('HTTP 401')
 await expect(failedCard.getByRole('button',{name:'重试原连接',exact:true})).toBeEnabled()
 await expect(failedCard.getByRole('button',{name:'停止本机连接',exact:true})).toBeDisabled()
 for(let i=0;i<3;i++){await page.locator('#refresh').click();await expect(failedCard).toContainText('原绑定未通过验证')}
 await failedCard.getByRole('button',{name:'重试原连接',exact:true}).click();await page.locator('#decline').click()
 await expect(failedCard).toContainText('原绑定未通过验证')
 await page.reload();await expect(failedCard).toContainText('原绑定未通过验证')
 await failedCard.getByRole('button',{name:'重试原连接',exact:true}).click();await page.locator('#approve').click()
 await expect(failedCard.getByRole('button',{name:'重试原连接',exact:true})).toBeEnabled({timeout:25000})
 const failedState=(await localApi('/api/state')).profiles.find(p=>p.id===pairing.id)
 assert.equal(failedState.state,'failed');assert.equal(failedState.reasonCode,'device_identity_rejected');assert.equal(failedState.running,false)
 assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items.length,deviceCount)
 assert.ok(originalConfig.equals(await fs.readFile(path.join(profileDir,'computer.local.json'))));assert.ok(originalCredential.equals(await fs.readFile(path.join(profileDir,'.local-device-credentials.json'))))
 await expect(page.locator('#connector-version')).toContainText((await localApi('/api/state')).version)
 await failedCard.getByRole('button',{name:'管理授权',exact:true}).click()
 await expect(page.locator('#permission-live')).toContainText('改动仅在草稿中')
 await expect(page.locator('#permission-stop')).toBeHidden()
 await page.locator('#permission-cancel').click()
 await page.screenshot({path:path.join(base,'portable-manager-identity-rejected.png'),fullPage:true})
 pass('real 401 remains visible after worker exit, polling, reload and cancelled retry; retry preserves identity and never creates a device')
 assert.deepEqual(errors,[])
 console.log('PORTABLE_MANAGER_BROWSER_PASS '+JSON.stringify({checks,realChrome:true,realBackend:true,realChildConnector:true,nativeFolderPicker:'injected-adapter',widths:[390,768,1440,1780],paidModelCalls:0}))
}finally{await manager?.close();await browser?.close();await stopHeadlessPocketBase(pb).catch(()=>{});await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.rm(db,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
