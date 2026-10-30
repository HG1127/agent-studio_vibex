// Real GUI, disposable auth backend, real files and isolated Chrome MCP.
// Native OS pickers are injected; no user's files, credentials or sites are used.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {randomBytes,randomUUID} from 'node:crypto'
import {chromium,expect} from '@playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
import {connection,executeClaim} from '../local-executor/connection.mjs'
const root=process.cwd(),out=path.join(root,'.tmp','visual-permissions');await fs.mkdir(out,{recursive:true})
const home=await fs.mkdtemp(path.join(out,'home-')),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-permission-browser-'))
const folder=path.join(home,'选定资料'),output=path.join(home,'报告输出');await fs.mkdir(folder);await fs.mkdir(output)
const file=path.join(folder,'仅此文件.txt');await fs.writeFile(file,'SELECTED_FILE_CONTENT');await fs.writeFile(path.join(folder,'其他私密资料.txt'),'NEVER_READ_THIS')
const listen=async server=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port}
let callsA=0,callsB=0
const a=createServer((req,res)=>{callsA++;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>授权网站 A</h1>')})
const b=createServer((req,res)=>{callsB++;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>授权网站 B</h1>')})
const siteA=await listen(a),siteB=await listen(b),probe=createServer(),origin=await listen(probe);await new Promise(r=>probe.close(r))
let pb,manager,browser,runtime,checks=0;const errors=[],pass=s=>{checks++;console.log('PASS '+s)}
const secret=randomBytes(24).toString('hex'),password='visual-test-123!',pause=ms=>new Promise(r=>setTimeout(r,ms))
const api=async(route,method='GET',body,token,bootstrap=false)=>{const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(bootstrap?{'X-Agent-Studio-Setup-Key':secret}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json()}}
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http='+new URL(origin).host,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:secret}})
 pb.stdout.on('data',()=>{});pb.stderr.on('data',()=>{})
 let ready=false;for(let i=0;i<140;i++){try{if((await api('/api/health')).status===200){ready=true;break}}catch{}await pause(100)}assert.ok(ready)
 assert.equal((await api('/api/studio/bootstrap','POST',{email:'visual-permission@example.test',password,display_name:'图形授权验收'},null,true)).status,201)
 const token=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'visual-permission@example.test',password})).data.token
 const pairing=(await api('/api/local-devices','POST',{name:'可视授权测试电脑'},token)).data
 const ticket={format:'agent-studio-connect-v1',server:origin,name:'可视授权测试电脑',mode:'files',origins:[],pairing:{id:pairing.id,code:pairing.pairing_code,expiresAt:pairing.expires_ms}}
 const ticketPath=path.join(home,'ticket.json');await fs.writeFile(ticketPath,JSON.stringify(ticket))
 manager=await createConnectorManager({home,picker:async()=>output,filePicker:async()=>file})
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message))
 await page.goto(manager.origin+'/#'+manager.token);await expect(page.locator('#ticket')).toBeEnabled()
 await page.locator('#ticket').setInputFiles(ticketPath);await page.locator('#pick-file').click()
 await expect(page.locator('#scope')).toContainText('仅此文件.txt');await expect(page.locator('#write')).toBeDisabled()
 await page.locator('#consent').check();await page.locator('#connect').click();await expect(page.locator('#profiles')).toContainText('服务器已确认在线',{timeout:25000})
 const configFile=path.join(home,'.agent-studio','connections',pairing.id,'computer.local.json'),credentialFile=path.join(path.dirname(configFile),'.local-device-credentials.json')
 const credentials=await fs.readFile(credentialFile,'utf8'),auth=JSON.parse(credentials),executor=connection(origin,auth.token)
 let config=JSON.parse(await fs.readFile(configFile,'utf8'));assert.deepEqual(config.roots[0].allowedFiles,['仅此文件.txt'])
 pass('first connection selects one file in GUI with real read-only scope, no terminal or parent-folder grant')
 await page.getByRole('button',{name:'管理授权',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'管理网站与文件授权',exact:true})
 await expect(editor).toBeVisible();await page.locator('#site-input').fill(siteA+'/page');await page.locator('#site-add').click()
 await expect(page.locator('#permission-sites')).toContainText(siteA);await expect(page.locator('#permission-save')).toBeDisabled()
 await page.locator('#permission-stop').click();await page.locator('#approve').click();await expect(page.locator('#permission-save')).toBeEnabled({timeout:25000})
 await page.locator('#permission-save').click();await page.locator('#decline').click();await expect(editor).toBeVisible()
 assert.equal(JSON.parse(await fs.readFile(configFile,'utf8')).browser.enabled,false)
 await page.locator('#permission-save').click();await page.locator('#approve').click();await expect(editor).not.toBeVisible()
 assert.equal(await fs.readFile(credentialFile,'utf8'),credentials)
 config=JSON.parse(await fs.readFile(configFile,'utf8'));assert.deepEqual(config.browser.allowedOrigins,[siteA]);assert.equal(config.browser.channel,'chrome')
 pass('website added after binding, stopped and saved graphically; cancelled save changes nothing and credentials remain identical')
 runtime=await createRuntime({...config,browser:{...config.browser,headless:true}});await executor('/poll',{tools:runtime.tools})
 const enqueue=async(tool,args)=>{const r=await api('/api/local-devices/'+pairing.id+'/jobs','POST',{tool,arguments:args,confirm:true,request_id:randomUUID(),permission_revision:'forged'},token);assert.equal(r.status,201,JSON.stringify(r));return r.data.id}
 const execute=async id=>{const claimed=(await executor('/poll',{tools:runtime.tools})).job;assert.equal(claimed.id,id);await executeClaim(executor,runtime,claimed);return (await api('/api/local-jobs/'+id,'GET',undefined,token)).data}
 let job=await enqueue('browser.browser_navigate',{url:siteA});let result=await execute(job);assert.equal(result.status,'succeeded');assert.ok(callsA>0)
 assert.equal(JSON.parse(result.payload).permission_revision,config.permissionRevision,'server ignores a forged permission version')
 const oldJob=await enqueue('browser.browser_navigate',{url:siteB}),firstRevision=config.permissionRevision;await runtime.close();runtime=null
 await page.locator('#refresh').click();await page.getByRole('button',{name:'管理授权',exact:true}).click()
 await page.locator('#site-input').fill('https://*.example.com');await page.locator('#site-add').click();await expect(page.locator('#permission-error')).toContainText('通配符')
 await page.locator('#site-input').fill(siteB);await page.locator('#site-add').click()
 await page.locator('#permission-sites .permission-item').filter({hasText:siteA}).getByRole('button',{name:'移除网站'}).click()
 await page.locator('#files-tab').click();await page.locator('#grant-folder').click()
 await expect(page.locator('#permission-grants')).toContainText('报告输出');await page.getByRole('checkbox',{name:'允许在 报告输出 新建文件',exact:true}).check()
 for(const width of [390,768,1440,1780]){
  await page.setViewportSize({width,height:950});for(const tab of ['sites','files']){await page.locator('#'+tab+'-tab').click();assert.ok(await editor.evaluate(e=>e.scrollWidth<=e.clientWidth+3),'permission dialog overflow '+width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3))}
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('#sites-tab').click();await page.screenshot({path:path.join(out,'website-permissions.png')})
 await page.locator('#files-tab').click();await page.screenshot({path:path.join(out,'file-permissions.png')})
 await page.locator('#permission-save').click();await expect(page.locator('#confirm-text')).toContainText(siteB);await page.locator('#approve').click();await expect(editor).not.toBeVisible()
 config=JSON.parse(await fs.readFile(configFile,'utf8'));assert.notEqual(config.permissionRevision,firstRevision);assert.deepEqual(config.browser.allowedOrigins,[siteB])
 pass('existing website removed, new website added and output folder permission selected through GUI at four widths')
 runtime=await createRuntime({...config,browser:{...config.browser,headless:true}})
 result=await execute(oldJob);assert.equal(result.status,'failed');assert.match(result.result,/旧授权/);assert.equal(callsB,0)
 job=await enqueue('browser.browser_navigate',{url:siteB});result=await execute(job);assert.equal(result.status,'succeeded');assert.ok(callsB>0)
 const previousA=callsA;job=await enqueue('browser.browser_navigate',{url:siteA});result=await execute(job);assert.equal(result.status,'failed');assert.equal(callsA,previousA)
 pass('real Chrome opens newly authorized site, rejects removed site and never executes an old queued job under new authorization')
 const fileRoot=config.roots.find(r=>r.allowedFiles),folderRoot=config.roots.find(r=>!r.allowedFiles)
 job=await enqueue('files.list',{root:fileRoot.name,path:'.'});result=await execute(job);assert.equal(result.status,'succeeded');assert.deepEqual(JSON.parse(result.result).entries,[{name:'仅此文件.txt',directory:false}])
 job=await enqueue('files.read',{root:fileRoot.name,path:'其他私密资料.txt'});result=await execute(job);assert.equal(result.status,'failed');assert.ok(!result.result.includes('NEVER_READ_THIS'))
 job=await enqueue('files.write',{root:folderRoot.name,path:'确认生成.txt',text:'approved test output'});result=await execute(job);assert.equal(result.status,'succeeded');assert.equal(await fs.readFile(path.join(output,'确认生成.txt'),'utf8'),'approved test output')
 assert.equal(await fs.readFile(credentialFile,'utf8'),credentials);assert.equal((await api('/api/local-devices','GET',undefined,token)).data.items.length,1)
 pass('exact file-only read and separate output folder enforced end to end without rebinding or leaking sibling contents')
 await runtime.close();runtime=null;await page.locator('#refresh').click();await page.getByRole('button',{name:'管理授权',exact:true}).click()
 await page.locator('#permission-sites').getByRole('button',{name:'移除网站'}).click();await page.locator('#permission-cancel').click();await page.locator('#approve').click()
 assert.deepEqual(JSON.parse(await fs.readFile(configFile,'utf8')).browser.allowedOrigins,[siteB]);assert.deepEqual(errors,[])
 pass('discarding permission draft preserves all persisted scopes and no page errors occur')
 console.log('VISUAL_PERMISSIONS_BROWSER_PASS '+JSON.stringify({checks,realChrome:true,realBackend:true,realFilesystem:true,nativePickers:'injected adapters',widths:[390,768,1440,1780],paidModelCalls:0,productionMutated:false}))
}finally{
 await runtime?.close();await manager?.close();await browser?.close();await stopHeadlessPocketBase(pb).catch(()=>{})
 await Promise.all([new Promise(r=>a.close(r)),new Promise(r=>b.close(r))]);await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.rm(db,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
