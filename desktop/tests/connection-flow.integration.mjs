// Production renderer + real private broker, connector child and disposable PB.
// Only the OS folder picker is replaced with a deterministic test-directory adapter.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {pipeline} from 'node:stream'
import {randomBytes,randomUUID} from 'node:crypto'
import {chromium,expect} from 'playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from '../../tests/helpers/headless-pocketbase.mjs'
import {createGateway} from '../gateway.mjs'
import {createDesktopComputer} from '../computer.mjs'
import {createConnectorManager} from '../../local-executor/desktop.mjs'
import {readGuidedProfile} from '../../local-executor/profiles.mjs'
import {verifyChromeInstalled} from '../../local-executor/browser-settings.mjs'

const root=process.cwd(),out=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-native-flow-'))
const data=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-native-flow-db-'))
const home=path.join(out,'connections'),folder=path.join(out,'工作资料'),preferencesFile=path.join(out,'preferences.json')
await fs.mkdir(home);await fs.mkdir(folder);await fs.writeFile(path.join(folder,'验收.txt'),'NATIVE_FLOW_FILE_OK')
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),key=randomBytes(24).toString('hex')
const wait=async(fn,label)=>{for(let i=0;i<160;i++){const r=await fn();if(r)return r;await sleep(250)}throw Error('timeout: '+label)}
const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const pbOrigin='http://127.0.0.1:'+probe.address().port;await new Promise(r=>probe.close(r))
let pb,workbench,gateway,manager,computer,browser,page,login,browserChecks=0,pickerCalls=0
const errors=[],sockets=new Set(),checks=[]
const pass=name=>{checks.push(name);console.log('PASS '+name)}
const api=async(route,method='GET',body)=>{const r=await fetch(pbOrigin+route,{method,headers:{'Content-Type':'application/json',Authorization:login?.token||'','X-Agent-Studio-Setup-Key':key},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>({}))}}
const startManager=async()=>{
 manager=await createConnectorManager({home,picker:async()=>{pickerCalls++;return folder},checkBrowser:async()=>{browserChecks++;await verifyChromeInstalled()},confirmReview:(review,signal)=>computer.confirmReview(review,signal),openWindow:async()=>{throw Error('separate_connector_window_forbidden')}})
 computer=createDesktopComputer({serverOrigin:server,manager,preferencesFile,desktopVersion:'0.1.0-preview.6',attention:()=>{void page?.evaluate(()=>window.dispatchEvent(new Event('native-test-attention')))}})
}
let server
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http='+new URL(pbOrigin).host,'--dir='+data,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex'),AGENT_STUDIO_BACKGROUND_WORKER:'false'}})
 pb.stdout.resume();pb.stderr.resume()
 await wait(async()=>{try{return (await api('/api/health')).status===200}catch{return false}},'PB startup')
 const password='Isolated-native-flow-2026!',email='native-flow@example.test'
 assert.equal((await api('/api/studio/bootstrap','POST',{email,password,display_name:'本机连接验收'})).status,201)
 login=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:email,password})).data;assert.ok(login.token)
 workbench=http.createServer((req,res)=>{if(!req.url.startsWith('/__pb/')){res.writeHead(404);res.end();return}const target=http.request(pbOrigin+req.url.slice(5),{method:req.method,headers:{...req.headers,host:new URL(pbOrigin).host}},up=>{res.writeHead(up.statusCode,up.headers);pipeline(up,res,()=>{})});target.on('error',()=>{res.writeHead(502);res.end()});pipeline(req,target,()=>{})})
 workbench.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))})
 await new Promise(r=>workbench.listen(0,'127.0.0.1',r));server='http://127.0.0.1:'+workbench.address().port
 gateway=await createGateway({webRoot:path.join(root,'dist'),serverOrigin:server})
 await startManager()
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--renderer-process-limit=2','--disable-gpu']})
 const context=await browser.newContext({viewport:{width:1440,height:1050}});page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message))
 await page.exposeFunction('__nativeComputer',async(action,input)=>{try{return await computer.request(action,input)}catch(e){console.log('NATIVE_ACTION_ERROR '+action+' '+e.message);throw e}})
 await page.addInitScript(({login,server})=>{
  sessionStorage.setItem('agent_studio_employee_auth',JSON.stringify(login))
  Object.defineProperty(window,'__STUDIO_DESKTOP_SERVER_ORIGIN__',{value:server})
  Object.defineProperty(window,'studioDesktop',{value:Object.freeze({version:2,computer:(action,input)=>window.__nativeComputer(action,input),prepareConnection:async ticket=>{await window.__nativeComputer('prepare',{ticket});return {ok:true}},openConnection:async()=>{window.dispatchEvent(new Event('native-test-attention'));return {ok:true}},onConnectionRequested:callback=>{const handler=()=>callback({});window.addEventListener('native-test-attention',handler);return()=>window.removeEventListener('native-test-attention',handler)}})})
 },{login,server})
 await page.goto(gateway.origin+'/tool-hub?view=devices')
 const toolbar=page.locator('[data-desktop-computer-toolbar]'),selector=toolbar.getByLabel('选择电脑')
 await expect(toolbar).toBeVisible();await expect(toolbar).toContainText('桌面版 0.1.0-preview.6')
 const connect=async(name,first=false)=>{
  if(first)await toolbar.getByRole('button',{name:'连接本机',exact:true}).click()
  else{await toolbar.getByRole('button',{name:'管理连接',exact:true}).click();await toolbar.getByRole('button',{name:'连接其他电脑',exact:true}).click()}
  const wizard=page.getByRole('dialog',{name:'连接电脑与浏览器',exact:true})
  await expect(wizard).toBeVisible();await wizard.getByLabel('电脑名称',{exact:true}).fill(name)
  await expect(wizard.getByLabel('允许浏览器访问的网站（选填，可稍后添加）')).toHaveValue('')
  await wizard.getByLabel('我在自己的电脑上操作，并同意以上访问范围。').check()
  await wizard.getByRole('button',{name:'下一步：设置本机授权',exact:true}).click()
  await expect(wizard.getByText('确认本机访问范围',{exact:true})).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await wizard.getByRole('button',{name:'选择文件夹',exact:true}).click()
  await expect(wizard).toContainText(folder)
  await wizard.getByLabel('我确认以上范围，只向当前账号授权这台电脑。').check()
  await wizard.getByRole('button',{name:'确认连接并启动',exact:true}).click()
  await expect(wizard.getByRole('heading',{name:name+' 已在线',exact:true})).toBeVisible({timeout:45000})
  await wizard.getByRole('button',{name:'完成，返回设备列表',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const id=await wait(async()=>{const s=await computer.request('state');return s.devices.find(d=>d.name===name)?.id},'paired device')
  await expect(selector).toHaveValue(id,{timeout:15000});await expect(toolbar.getByLabel('电脑连接状态')).toContainText('已连接')
  return id
 }
 const first=await connect('第一台本机',true)
 assert.equal(browserChecks,0);assert.equal(pickerCalls,1)
 const profile=await readGuidedProfile(first,{home}),config=JSON.parse(await fs.readFile(profile.configFile,'utf8'))
 assert.equal(config.browser.enabled,false);assert.deepEqual(config.browser.allowedOrigins,[])
 assert.equal(config.roots[0].readOnly,true)
 pass('one first-run wizard, optional websites, real folder scope and live connector heartbeat')
 await expect(page.getByRole('heading',{name:'我的电脑与浏览器'})).toBeVisible()
 await expect(page.locator('[aria-label="工作目录授权"]')).toBeAttached({timeout:15000})
 const queued=await api('/api/local-devices/'+first+'/jobs','POST',{tool:'files.read',arguments:{root:config.roots[0].name,path:'验收.txt'},confirm:true,request_id:randomUUID()});assert.equal(queued.status,201)
 const done=await wait(async()=>{const r=await api('/api/local-jobs/'+queued.data.id);return ['succeeded','failed'].includes(r.data.status)?r.data:false},'real file job')
 assert.equal(done.status,'succeeded');assert.ok(done.result.includes('NATIVE_FLOW_FILE_OK'))
 pass('main workspace automatically follows current computer and executes approved real file read')
 await page.getByRole('tab',{name:'授权管理',exact:true}).click()
 await page.getByRole('region',{name:'工作目录授权'}).getByRole('button',{name:'编辑网站',exact:true}).click()
 const editor=toolbar.getByRole('region',{name:'本机授权管理'})
 await expect(editor).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0)
 await editor.getByLabel('允许访问的网站',{exact:true}).fill('https://example.com')
 await editor.getByRole('button',{name:'更新网站草稿',exact:true}).click()
 await editor.getByRole('button',{name:'暂停此连接',exact:true}).click()
 await expect(editor.getByRole('button',{name:'暂停此连接',exact:true})).toHaveCount(0,{timeout:15000})
 await editor.getByLabel('我确认以上网站、文件范围和权限。').check()
 await editor.getByRole('button',{name:'保存授权',exact:true}).click()
 await expect(editor).toHaveCount(0,{timeout:15000})
 const updated=await readGuidedProfile(first,{home}),saved=JSON.parse(await fs.readFile(updated.configFile,'utf8'))
 assert.deepEqual(saved.browser.allowedOrigins,['https://example.com']);assert.equal(saved.browser.enabled,true);assert.equal(browserChecks,1)
 await toolbar.getByRole('button',{name:'连接电脑',exact:true}).click()
 await expect(toolbar.getByLabel('电脑连接状态')).toContainText('已连接',{timeout:15000})
 pass('workspace permission entry expands main UI; explicitly adding a website later persists only that website')
 // Close the expanded panel before using the second-connection entry helper.
 if(await toolbar.getByRole('button',{name:'管理连接',exact:true}).getAttribute('aria-expanded')==='true')await toolbar.getByRole('button',{name:'管理连接',exact:true}).click()
 const second=await connect('第二台本机')
 await selector.selectOption(first);await expect(selector).toHaveValue(first)
 await expect(page.locator('[aria-labelledby="local-devices-heading"]')).toContainText('第一台本机')
 await selector.selectOption(second);await expect(selector).toHaveValue(second)
 assert.equal(context.pages().length,1);await expect(page.getByRole('dialog')).toHaveCount(0)
 await page.screenshot({path:path.join(out,'main-computer-selector.png'),fullPage:true})
 pass('main selector switches both selected connection and workspace without opening any extra window')
 await manager.close();await startManager();await page.reload()
 await expect(selector).toHaveValue(second,{timeout:20000})
 await expect(toolbar.getByLabel('电脑连接状态')).toContainText('已连接',{timeout:30000})
 const restored=await computer.request('state');assert.equal(restored.selectedId,second)
 assert.equal(restored.profiles.find(p=>p.id===first).running,false);assert.equal(restored.profiles.find(p=>p.id===second).running,true)
 pass('fresh connector and application reload automatically restore only the last selected local computer')
 assert.deepEqual(errors,[])
 await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify({checks,version:'0.1.0-preview.6',realBackend:true,realConnectorChild:true,productionData:false,uiErrors:errors},null,2))
 console.log('NATIVE_FLOW_ACCEPTANCE '+out)
}finally{
 await browser?.close();await manager?.close();await gateway?.close()
 for(const s of sockets)s.destroy()
 if(workbench)await new Promise(r=>workbench.close(r))
 await stopHeadlessPocketBase(pb)
 console.log('NATIVE_FLOW_TEST_DATA '+out)
}
