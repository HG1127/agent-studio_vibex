// Real Chrome + real isolated PocketBase + real connector runtime and filesystem.
// Native chooser/confirmation use adapters; selected network failures are injected to verify recovery.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {randomBytes,randomUUID} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {chromium,expect} from 'playwright/test'
import {createServer as createVite} from 'vite'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {prepareGuidedConnection} from '../local-executor/setup.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
import {runConnection} from '../local-executor/run.mjs'

const root=process.cwd(),out=path.join(root,'.tmp','embedded-permissions');await fs.mkdir(out,{recursive:true})
const home=await fs.mkdtemp(path.join(out,'home-')),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-embedded-db-'))
const folder=path.join(home,'工作资料'),extra=path.join(home,'另选资料'),output=path.join(home,'报告输出')
for(const p of [folder,extra,output])await fs.mkdir(p)
const selected=path.join(extra,'选择的文件.txt');await fs.writeFile(selected,'selected-only');await fs.writeFile(path.join(extra,'相邻文件.txt'),'not-authorized')
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+probe.address().port;await new Promise(r=>probe.close(r))
const website=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Granted site</title><h1>Real permission check</h1>')});await new Promise(r=>website.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+website.address().port
const password='isolated-embedded-2026!',key=randomBytes(24).toString('hex'),stop=new AbortController()
let pb,worker,browser,context,ui,configFile,token,other,id,confirmMode='yes',pickerMode='file',confirmations=0,checks=0,errors=[]
const pass=s=>{checks++;console.log('PASS '+s)}
const api=async(route,method='GET',body,auth=token,setup=false)=>{const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{}),...(setup?{'X-Agent-Studio-Setup-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json().catch(()=>({}))}}
const meta=async()=> (await api('/api/local-devices/'+id+'/permissions')).data
const cfg=async()=>JSON.parse(await fs.readFile(configFile,'utf8'))
const wait=async(fn,label)=>{for(let i=0;i<150;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,200))}throw Error('timeout: '+label)}
async function task(tool,args){const c=await api('/api/local-devices/'+id+'/jobs','POST',{tool,arguments:args,confirm:true,request_id:randomUUID()});if(c.status!==201)return c;return wait(async()=>{const j=await api('/api/local-jobs/'+c.data.id);return !['queued','running'].includes(j.data.status)?j:false},tool)}
const countJobs=()=>{const c=new DatabaseSync(path.join(db,'data.db'),{readOnly:true});try{return c.prepare('SELECT COUNT(*) AS n FROM studio_local_jobs').get().n}finally{c.close()}}
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http='+new URL(origin).host,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key}})
 let logs='';pb.stdout.on('data',b=>{logs=(logs+b.toString()).slice(-12000)});pb.stderr.on('data',b=>{logs=(logs+b.toString()).slice(-12000)})
 await wait(async()=>{try{return (await api('/api/health')).status===200}catch{return false}},'backend')
 const boot=await api('/api/studio/bootstrap','POST',{email:'embedded@example.test',password,display_name:'内嵌授权测试'},null,true);assert.equal(boot.status,201,JSON.stringify(boot.data))
 token=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'embedded@example.test',password},null)).data.token
 assert.equal((await api('/api/studio/users','POST',{email:'other-embedded@example.test',password,display_name:'其他员工',role:'employee'})).status,201)
 other=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'other-embedded@example.test',password},null)).data.token
 const pairing=(await api('/api/local-devices','POST',{name:'内嵌授权验证电脑'})).data;id=pairing.id
 const installed=await prepareGuidedConnection({format:'agent-studio-connect-v1',server:origin,name:'内嵌授权验证电脑',mode:'both',origins:[site],pairing:{id,code:pairing.pairing_code,expiresAt:pairing.expires_ms}},{home,chooseWorkspace:async()=>({path:folder,readOnly:true}),confirm:async()=>true,runtimeFactory:c=>createRuntime({...c,browser:{...c.browser,headless:true}})})
 configFile=installed.configFile
 const config=await cfg();config.browser.headless=true;delete config.permissionRevision;delete config.permissionManagementRevision;await fs.writeFile(configFile,JSON.stringify(config,null,2))
 const credentialFile=path.join(path.dirname(configFile),'.local-device-credentials.json'),credentials=await fs.readFile(credentialFile,'utf8')
 worker=runConnection(configFile,{signal:stop.signal,adapters:{home,pickFile:async()=>pickerMode==='cancel'?'':selected,pickFolder:async()=>pickerMode==='cancel'?'':output,confirm:async(review,signal)=>{confirmations++;assert.ok(review.message.includes(origin));if(confirmMode==='no')return false;if(confirmMode==='timeout')throw Error('permission_confirmation_timeout');if(confirmMode==='unavailable')throw Error('permission_confirmation_unavailable');if(confirmMode==='hold')return new Promise(resolve=>{if(signal.aborted)resolve(false);else signal.addEventListener('abort',()=>resolve(false),{once:true})});return true}}})
 let workerError;worker.catch(e=>{workerError=e})
 await wait(async()=>{if(workerError)throw workerError;const m=await meta();return m.available&&m.applied_revision===m.revision},'connector online')
 let m=await meta();assert.equal(m.protocol,'permissions-v2')
 const devices=(await api('/api/local-devices')).data.items;assert.equal(devices.length,1);assert.ok(!JSON.parse(devices[0].catalog).some(t=>t.name.startsWith('connector.')))
 assert.equal((await api('/api/local-devices/'+id+'/permissions','GET',undefined,other)).status,404)
 assert.equal((await api('/api/local-devices/'+id+'/controls','POST',{action:'sites-save',confirm:true,request_id:randomUUID(),permission_revision:m.revision,origins:[site]},other)).status,409)
 assert.equal((await api('/api/local-devices/'+id+'/permissions','GET',undefined,null)).status,401)
 assert.equal((await api('/api/local-devices/'+id+'/controls','POST',{action:'file-pick',confirm:true,request_id:randomUUID(),permission_revision:m.revision,kind:'file',path:'C:\\Windows'})).status,409)
 pass('owner isolation, explicit confirmation, no raw path injection and no model-callable permission tools')
 process.env.AGENT_STUDIO_PB_ORIGIN=origin
 ui=await createVite({configFile:path.join(root,'vibex-local/vite.local.config.ts'),server:{port:0,strictPort:false,host:'127.0.0.1',open:false},logLevel:'error'});await ui.listen()
 const webOrigin='http://127.0.0.1:'+ui.httpServer.address().port
 browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1440,height:960}})
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(webOrigin+'/login?next='+encodeURIComponent('/tool-hub?view=devices'))
 await page.getByLabel('工作邮箱',{exact:true}).fill('embedded@example.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click()
 const panel=page.getByRole('region',{name:'我的电脑与浏览器',exact:true})
 await panel.locator('[data-device-id="'+id+'"]').getByRole('button',{name:'检查连接',exact:true}).click()
 await page.getByRole('tab',{name:'授权管理',exact:true}).click()
 const scope=page.getByRole('region',{name:'工作目录授权',exact:true})
 await scope.getByRole('button',{name:'编辑网站',exact:true}).click()
 const sheet=page.getByRole('dialog',{name:'工作台授权管理',exact:true})
 await expect(sheet.getByLabel('添加授权网站')).toBeVisible();await expect(sheet).toContainText('无需切换管理网页')
 const initialJobs=countJobs();assert.equal(context.pages().length,1)
 const beforeDraft=await fs.readFile(configFile,'utf8'),beforeConfirm=confirmations
 await sheet.getByLabel('添加授权网站').fill('draft.example\nhttps://draft.example/path');await sheet.getByRole('button',{name:'添加',exact:true}).click()
 await sheet.getByRole('button',{name:'返回工作台',exact:true}).click();await expect(sheet).not.toBeVisible();await expect(scope).toContainText('未保存的草稿')
 await scope.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(sheet.getByRole('button',{name:'移除 https://draft.example',exact:true})).toBeVisible()
 assert.equal(confirmations,beforeConfirm);assert.equal(await fs.readFile(configFile,'utf8'),beforeDraft)
 await sheet.getByRole('button',{name:'放弃未保存修改',exact:true}).click();await expect(sheet.getByRole('button',{name:'移除 https://draft.example',exact:true})).toHaveCount(0)
 pass('closing and reopening preserves drafts without any backend mutation; explicit discard restores saved scope')
 await sheet.getByLabel('添加授权网站').fill('batch-one.example\nhttps://batch-two.example/path, batch-one.example')
 await expect(sheet.locator('[aria-label="网站变更摘要"]')).toContainText('新增 2 个')
 const batchConfirm=confirmations;await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
 assert.equal(confirmations,batchConfirm+1);assert.ok((await cfg()).browser.allowedOrigins.includes('https://batch-one.example'));assert.ok((await cfg()).browser.allowedOrigins.includes('https://batch-two.example'))
 for(const host of ['https://batch-one.example','https://batch-two.example'])await sheet.getByRole('button',{name:'移除 '+host,exact:true}).click()
 await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
 pass('batch paste normalizes and deduplicates domains; direct Save requires only one local confirmation')
  // The server accepts the POST, but its receipt never reaches the browser.
  // Recovery must keep the exact request identity even after the permission revision changes.
  for(const failure of ['transport','ambiguous-409']){
   const recoveredHost=failure==='transport'?'lost-receipt.example':'uncertain-receipt.example'
   const createRoute='**/__pb/api/local-devices/'+id+'/controls'
   const bodies=[];let acceptedId='',lostResponses=0
   const beforeConfirmations=confirmations
   const loseReceipt=async route=>{
    if(route.request().method()!=='POST'){await route.continue();return}
    bodies.push(route.request().postData())
    if(lostResponses<2){
     const upstream=await route.fetch();assert.equal(upstream.status(),201)
     const receipt=await upstream.json();if(acceptedId)assert.equal(receipt.id,acceptedId);acceptedId=receipt.id;lostResponses++
     if(failure==='transport')await route.abort('failed')
     else await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'unclassified_control_error'})})
    }else await route.continue()
   }
   await page.route(createRoute,loseReceipt)
   await sheet.getByLabel('添加授权网站').fill(recoveredHost)
   await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click()
   const restore=sheet.getByRole('button',{name:'恢复同一请求',exact:true})
   await expect(restore).toBeVisible({timeout:8000})
   await expect(sheet.getByRole('button',{name:'保存网站授权',exact:true})).toBeDisabled()
   await expect(sheet.getByRole('button',{name:'请先恢复请求回执',exact:true})).toBeDisabled()
   await wait(async()=>{const r=await api('/api/local-controls/'+acceptedId);return r.data.status==='succeeded'},'original accepted control completion')
   await wait(async()=>{const v=await meta();return v.applied_revision===v.revision&&v.sites.includes('https://'+recoveredHost)},'original permission applied')
   await restore.click();await expect(restore).toBeEnabled({timeout:8000})
   await restore.click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
   assert.equal(bodies.length,3);assert.equal(new Set(bodies).size,1);assert.equal(confirmations,beforeConfirmations+1)
   const database=new DatabaseSync(path.join(db,'data.db'),{readOnly:true})
   try{assert.equal(database.prepare('SELECT COUNT(*) AS n FROM studio_local_controls WHERE request_id LIKE ?').get('%:'+JSON.parse(bodies[0]).request_id).n,1)}finally{database.close()}
   await page.unroute(createRoute,loseReceipt)
   await sheet.getByRole('button',{name:'移除 https://'+recoveredHost,exact:true}).click()
   await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
   pass('lost create receipt ('+failure+') recovers one original control with identical payload and one local confirmation')
  }
  const rejectRoute='**/__pb/api/local-devices/'+id+'/controls',beforeRejected=await fs.readFile(configFile,'utf8'),beforeRejectedConfirm=confirmations
  const rejectCreate=async route=>{await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'device_busy'})})}
  await page.route(rejectRoute,rejectCreate);await sheet.getByLabel('添加授权网站').fill('rejected.example')
  await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click()
  await expect(sheet.getByRole('alert')).toContainText('正在处理任务')
  await expect(sheet.getByRole('button',{name:'恢复同一请求',exact:true})).toHaveCount(0)
  await expect(sheet.getByRole('button',{name:'保存网站授权',exact:true})).toBeEnabled()
  assert.equal(await fs.readFile(configFile,'utf8'),beforeRejected);assert.equal(confirmations,beforeRejectedConfirm)
  await page.unroute(rejectRoute,rejectCreate);await sheet.getByRole('button',{name:'放弃未保存修改',exact:true}).click()
  pass('a known pre-creation rejection releases recovery state and preserves the editable draft without changing permissions')
  const pickerCreateRoute='**/__pb/api/local-devices/'+id+'/controls'
  const beforeExpiredPick=await fs.readFile(configFile,'utf8');let expiredPickId=''
  const losePickerReceipt=async route=>{
   const body=route.request().postDataJSON()
   if(route.request().method()==='POST'&&body.action==='file-pick'&&!expiredPickId){
    const upstream=await route.fetch();assert.equal(upstream.status(),201);expiredPickId=(await upstream.json()).id;await route.abort('failed')
   }else await route.continue()
  }
  await sheet.getByRole('tab',{name:'文件与文件夹',exact:true}).click();await page.route(pickerCreateRoute,losePickerReceipt)
  await sheet.getByRole('button',{name:'选择单个文件',exact:true}).click();await expect(sheet.getByRole('button',{name:'恢复同一请求',exact:true})).toBeVisible()
  const expiredPick=await wait(async()=>{const r=await api('/api/local-controls/'+expiredPickId);return r.data.status==='succeeded'?r.data:false},'file picker completed before receipt recovery')
  // Expire only the isolated test record instead of waiting five wall-clock minutes.
  const expiryDb=new DatabaseSync(path.join(db,'data.db'))
  try{expiryDb.prepare('UPDATE studio_local_controls SET result=? WHERE id=?').run(JSON.stringify({...JSON.parse(expiredPick.result),expires_at:Date.now()-1000}),expiredPickId)}finally{expiryDb.close()}
  await page.unroute(pickerCreateRoute,losePickerReceipt);await sheet.getByRole('button',{name:'恢复同一请求',exact:true}).click()
  await expect(sheet.getByRole('alert')).toContainText('已过期')
  await expect(sheet.getByRole('button',{name:'选择单个文件',exact:true})).toBeEnabled()
  await expect(sheet.getByRole('button',{name:'重新检查结果',exact:true})).toHaveCount(0)
  await expect(sheet.getByRole('button',{name:'确认并保存授权',exact:true})).toHaveCount(0)
  assert.equal(await fs.readFile(configFile,'utf8'),beforeExpiredPick)
  await sheet.getByRole('button',{name:'选择单个文件',exact:true}).click();await expect(sheet).toContainText('已选择：选择的文件.txt',{timeout:30000})
  await sheet.getByRole('button',{name:'取消选择',exact:true}).click();assert.equal(await fs.readFile(configFile,'utf8'),beforeExpiredPick)
  await sheet.getByRole('tab',{name:'网站',exact:true}).click()
  pass('an expired recovered file selection releases its completed request and permits a fresh choice without authorizing files')


 await sheet.getByLabel('添加授权网站').fill('https://example.test/path');await sheet.getByRole('button',{name:'添加',exact:true}).click();await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click()
 await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000});assert.ok((await cfg()).browser.allowedOrigins.includes('https://example.test'));assert.equal(countJobs(),initialJobs)
 await sheet.getByRole('button',{name:'移除 https://example.test',exact:true}).click();await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
 assert.ok(!(await cfg()).browser.allowedOrigins.includes('https://example.test'))
 pass('in-workbench add/remove websites writes real config and verifies applied revision without another page')
 const navigated=await task('browser.browser_navigate',{url:site});assert.equal(navigated.data.status,'succeeded',JSON.stringify(navigated.data))
 pass('new scope is consumed by a real Chrome browser task')
 await sheet.getByLabel('添加授权网站').fill('keep-draft.example');await sheet.getByRole('button',{name:'添加',exact:true}).click()
 await sheet.getByRole('tab',{name:'文件与文件夹',exact:true}).click();await sheet.getByRole('button',{name:'选择单个文件',exact:true}).click()
 await expect(sheet).toContainText('已选择：选择的文件.txt',{timeout:30000});assert.ok(!await page.content().then(s=>s.includes(extra)))
 await sheet.getByRole('button',{name:'确认并保存授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
 const single=(await cfg()).roots.find(r=>r.allowedFiles?.includes('选择的文件.txt'));assert.ok(single&&single.readOnly)
 await wait(async()=>JSON.parse((await api('/api/local-devices')).data.items[0].catalog).some(t=>JSON.stringify(t).includes(single.name)),'catalog sync')
 assert.equal((await task('files.read',{root:single.name,path:'选择的文件.txt'})).data.status,'succeeded')
 assert.equal((await task('files.read',{root:single.name,path:'相邻文件.txt'})).data.status,'failed')
 pass('native-picker adapter returns opaque token; real single-file read works, neighbouring file stays denied')
 await sheet.getByRole('tab',{name:'网站',exact:true}).click();await expect(sheet.getByRole('button',{name:'移除 https://keep-draft.example',exact:true})).toBeVisible();await expect(sheet.getByRole('button',{name:'保存网站授权',exact:true})).toBeEnabled();assert.ok(!(await cfg()).browser.allowedOrigins.includes('https://keep-draft.example'))
 await sheet.getByRole('button',{name:'放弃未保存修改',exact:true}).click();await sheet.getByRole('tab',{name:'文件与文件夹',exact:true}).click()
 pass('saving a real file grant rebases revision without discarding or silently saving the website draft')
 pickerMode='folder';await sheet.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect(sheet).toContainText('已选择：报告输出',{timeout:30000});await sheet.getByLabel('允许新建文件 / 文件夹、复制文件（不覆盖）').check();for(const label of ['编辑已有文件','移动文件','可恢复删除与恢复','在连接电脑打开 / 定位'])await sheet.getByLabel(label,{exact:true}).check();await sheet.getByRole('button',{name:'确认并保存授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
 const outputRoot=(await cfg()).roots.find(r=>r.path===output);assert.ok(outputRoot&&!outputRoot.readOnly)
 assert.deepEqual(outputRoot.capabilities,{edit:true,move:true,delete:true,open:true})
 pass('workbench granular grant UI reaches native confirmation and persists all four explicit capabilities')
 await wait(async()=>JSON.parse((await api('/api/local-devices')).data.items[0].catalog).some(t=>t.name==='files.write'),'write catalog')
 assert.equal((await task('files.write',{root:outputRoot.name,path:'报告.txt',text:'test report'})).data.status,'succeeded')
 assert.equal(await fs.readFile(path.join(output,'报告.txt'),'utf8'),'test report')
 const outputRow=sheet.locator('div.rounded-lg.border').filter({has:page.locator('span.font-medium',{hasText:'报告输出'})}).first()
 await outputRow.getByRole('button',{name:'编辑细分权限',exact:true}).click();await outputRow.getByLabel('允许新建文件 / 文件夹、复制文件（不覆盖）').uncheck();await outputRow.getByRole('button',{name:'保存此授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
 assert.equal((await cfg()).roots.find(r=>r.name===outputRoot.name).readOnly,true)
 assert.deepEqual((await cfg()).roots.find(r=>r.name===outputRoot.name).capabilities,{edit:false,move:false,delete:false,open:true})
 await outputRow.getByRole('button',{name:'移除此授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000});assert.ok(!(await cfg()).roots.some(r=>r.name===outputRoot.name));assert.equal(await fs.readFile(path.join(output,'报告.txt'),'utf8'),'test report')
 pass('folder grant, real new-file creation, read-only downgrade and removal preserve disk contents')
 await sheet.getByRole('tab',{name:'网站',exact:true}).click()
 const beforeCancel=await fs.readFile(configFile,'utf8');confirmMode='hold';const oldCount=confirmations
 await sheet.getByLabel('添加授权网站').fill('https://cancelled.example');await sheet.getByRole('button',{name:'添加',exact:true}).click();await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await wait(()=>confirmations>oldCount,'native confirmation waiting')
 await expect(sheet.getByRole('note',{name:'本机确认窗口提示'})).toContainText('正在等您确认，不是在加载网页')
  await expect(sheet.getByRole('status')).toContainText('请求剩余约')
  await expect(sheet.getByRole('button',{name:'刷新状态',exact:true})).toBeEnabled()
  await sheet.getByRole('button',{name:'刷新状态',exact:true}).click()
  assert.equal(confirmations,oldCount+1,'refresh cannot open a second confirmation')
  const heartbeatDb=new DatabaseSync(path.join(db,'data.db'));try{heartbeatDb.prepare('UPDATE studio_local_devices SET seen_ms=? WHERE id=?').run(Date.now()-90000,id)}finally{heartbeatDb.close()}
  await wait(async()=>{const d=(await api('/api/local-devices')).data.items.find(d=>d.id===id);return d&&Date.now()-d.seen_ms<3000},'device heartbeat continues during native review')
  const unavailablePermissions='**/__pb/api/local-devices/'+id+'/permissions'
  await page.route(unavailablePermissions,route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}))
  await expect(sheet.getByRole('note',{name:'本机确认窗口提示'})).toContainText('连接状态待核实',{timeout:12000})
  assert.equal(await fs.readFile(configFile,'utf8'),beforeCancel)
  await page.unroute(unavailablePermissions)
  await sheet.getByRole('button',{name:'刷新状态',exact:true}).click()
  await expect(sheet.getByRole('note',{name:'本机确认窗口提示'})).toContainText('正在等您确认')
  assert.equal(confirmations,oldCount+1)
  pass('waiting state explains the native action, shows the deadline, survives lost status and keeps heartbeat without duplicate confirmation')
  await sheet.getByRole('button',{name:'取消本次请求',exact:true}).click();await expect(sheet).not.toBeVisible();await new Promise(r=>setTimeout(r,1600));assert.equal(await fs.readFile(configFile,'utf8'),beforeCancel);confirmMode='yes'
 pass('web cancellation aborts a running native-confirmation request before config write')
 await scope.getByRole('button',{name:'编辑网站',exact:true}).click();await expect(sheet.getByRole('button',{name:'移除 https://cancelled.example',exact:true})).toBeVisible();await sheet.getByRole('button',{name:'放弃未保存修改',exact:true}).click();await sheet.getByRole('button',{name:'移除 '+site,exact:true}).click();await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000});assert.equal((await cfg()).browser.enabled,false)
 await sheet.getByLabel('添加授权网站').fill(site);await sheet.getByRole('button',{name:'添加',exact:true}).click();await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000});assert.equal((await cfg()).browser.enabled,true)
 pass('revoking every website does not remove the management channel; adding it back succeeds')
 for(const mode of ['no','timeout','unavailable']){
   confirmMode=mode
   const original=await fs.readFile(configFile,'utf8'),confirmCount=confirmations
   await sheet.getByLabel('添加授权网站').fill(mode+'.example')
   await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click()
   if(mode==='no')await expect(sheet.getByRole('status')).toContainText('已取消',{timeout:15000})
   else await expect(sheet.getByRole('alert')).toContainText(mode==='timeout'?'超时':'未能打开',{timeout:15000})
   await expect(sheet.getByRole('button',{name:'保存网站授权',exact:true})).toBeEnabled()
   assert.equal(await fs.readFile(configFile,'utf8'),original)
   assert.equal(confirmations,confirmCount+1)
   await expect(sheet.getByRole('button',{name:'移除 https://'+mode+'.example',exact:true})).toBeVisible()
   await sheet.getByRole('button',{name:'放弃未保存修改',exact:true}).click()
   pass('native '+mode+' keeps exact original scope and editable draft without retry')
  }
  confirmMode='hold';const beforeExpiry=await fs.readFile(configFile,'utf8'),expiryConfirmations=confirmations
  await sheet.getByLabel('添加授权网站').fill('expired-request.example');await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click()
  await wait(()=>confirmations>expiryConfirmations,'expiry fixture reaches local review')
  const expireDb=new DatabaseSync(path.join(db,'data.db'));try{expireDb.prepare("UPDATE studio_local_controls SET deadline_ms=? WHERE device_id=? AND status='running'").run(Date.now()-1000,id)}finally{expireDb.close()}
  await expect(sheet.getByRole('alert')).toContainText('已过期',{timeout:15000})
  await expect(sheet.getByRole('button',{name:'保存网站授权',exact:true})).toBeEnabled()
  assert.equal(await fs.readFile(configFile,'utf8'),beforeExpiry)
  await sheet.getByRole('button',{name:'放弃未保存修改',exact:true}).click();confirmMode='yes'
  pass('expired server request becomes actionable and leaves the original scope unchanged')
  let interrupted=false;const controlReads='**/__pb/api/local-controls/*',beforeRecoveryConfirm=confirmations
 const dropRead=async route=>{if(!interrupted&&route.request().method()==='GET'){interrupted=true;await route.fulfill({status:503,contentType:'application/json',body:'{}'})}else await route.continue()}
 await page.route(controlReads,dropRead);await sheet.getByLabel('添加授权网站').fill('recover.example');await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click()
 await expect(sheet.getByRole('button',{name:'重新检查结果',exact:true})).toBeVisible({timeout:20000});await page.unroute(controlReads,dropRead)
 await sheet.getByRole('button',{name:'重新检查结果',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000});assert.equal(confirmations,beforeRecoveryConfirm+1)
 await sheet.getByRole('button',{name:'移除 https://recover.example',exact:true}).click();await sheet.getByRole('button',{name:'保存网站授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000})
 pass('lost status response is recovered by reading the original control, never a repeated mutation or confirmation')
 m=await meta();pickerMode='cancel'
 const repeat={action:'file-pick',kind:'file',confirm:true,request_id:randomUUID(),permission_revision:m.revision}
 const first=await api('/api/local-devices/'+id+'/controls','POST',repeat),second=await api('/api/local-devices/'+id+'/controls','POST',repeat);assert.equal(first.status,201);assert.equal(first.data.id,second.data.id)
 assert.equal((await api('/api/local-devices/'+id+'/controls','POST',{...repeat,kind:'folder'})).status,409)
 await wait(async()=> (await api('/api/local-controls/'+first.data.id)).data.status==='cancelled','picker cancellation')
 assert.equal((await api('/api/local-controls/'+first.data.id,'GET',undefined,other)).status,404)
 pass('request replay is deduplicated; conflicting replay and cross-account status reads are rejected')
 await sheet.getByRole('tab',{name:'文件与文件夹',exact:true}).click()
 for(let i=0;i<20;i++){const before=(await meta()).grants.length;if(!before)break;await sheet.getByRole('button',{name:'移除此授权',exact:true}).first().click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000});assert.equal((await meta()).grants.length,before-1)}
 assert.equal((await cfg()).files.enabled,false);pickerMode='folder'
 await sheet.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect(sheet).toContainText('已选择：报告输出',{timeout:30000});await sheet.getByRole('button',{name:'确认并保存授权',exact:true}).click();await expect(sheet.getByRole('status')).toContainText('新授权已生效',{timeout:45000});assert.equal((await cfg()).files.enabled,true)
 pass('all file grants can be revoked and restored in the workbench; legacy config upgrades without re-pairing')
 await expect(sheet).toContainText('当前授权已生效')
 for(const width of [390,768,1440,1780]){await page.setViewportSize({width,height:960});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));await sheet.screenshot({path:path.join(out,'embedded-'+width+'.png')})}
 assert.equal(context.pages().length,1);assert.deepEqual(errors,[]);assert.equal(await fs.readFile(credentialFile,'utf8'),credentials)
 pass('four viewport widths, one workbench page, no browser errors, same saved device credentials')
 console.log('EMBEDDED_PERMISSIONS_PASS '+JSON.stringify({checks,realBackend:true,realChrome:true,realFilesystem:true,nativeDialogs:'injected adapters',newManagementPages:0,realCredentialsChanged:false,paidModelCalls:0}))
}catch(error){console.error('EMBEDDED_PERMISSIONS_FAILED',error.message);throw error}
finally{stop.abort();await worker?.catch(()=>{});await browser?.close();await ui?.close();await new Promise(r=>website.close(r));await stopHeadlessPocketBase(pb).catch(()=>{});await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.rm(db,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
