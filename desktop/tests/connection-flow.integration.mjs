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
import {inspectApplication} from '../../local-executor/applications.mjs'
import {createApplicationFixture} from '../../tests/helpers/application-fixture.windows.mjs'

const root=process.cwd(),out=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-native-flow-'))
const data=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-native-flow-db-'))
const home=path.join(out,'connections'),folder=path.join(out,'工作资料'),preferencesFile=path.join(out,'preferences.json')
await fs.mkdir(home);await fs.mkdir(folder);await fs.writeFile(path.join(folder,'验收.txt'),'NATIVE_FLOW_FILE_OK')
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),key=randomBytes(24).toString('hex')
const wait=async(fn,label)=>{for(let i=0;i<160;i++){const r=await fn();if(r)return r;await sleep(250)}throw Error('timeout: '+label)}
const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const pbOrigin='http://127.0.0.1:'+probe.address().port;await new Promise(r=>probe.close(r))
let pb,workbench,gateway,manager,computer,browser,page,login,browserChecks=0,pickerCalls=0,applicationFixture,modelFixture
const desktopVersion=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8')).version
const errors=[],sockets=new Set(),checks=[]
const nativeFiles=process.argv.includes('--native-file-actions'),nativeFile='AgentStudio-UI-文件调度验收.md'
if(nativeFiles){await fs.writeFile(path.join(folder,nativeFile),'NATIVE-FILE-UI-ONLY-20261030');await fs.writeFile(path.join(folder,'do-not-execute.exe'),'INERT-REJECTION-FIXTURE')}
const pass=name=>{checks.push(name);console.log('PASS '+name)}
const api=async(route,method='GET',body)=>{const r=await fetch(pbOrigin+route,{method,headers:{'Content-Type':'application/json',Authorization:login?.token||'','X-Agent-Studio-Setup-Key':key},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>({}))}}
const startManager=async()=>{
 manager=await createConnectorManager({home,picker:async()=>{pickerCalls++;return folder},...(applicationFixture?{discoverApplications:async()=>[await inspectApplication(applicationFixture.exe,{name:'Synthetic UI acceptance'})]}:{}),checkBrowser:async()=>{browserChecks++;await verifyChromeInstalled()},confirmReview:(review,signal)=>computer.confirmReview(review,signal),openWindow:async()=>{throw Error('separate_connector_window_forbidden')}})
 computer=createDesktopComputer({serverOrigin:server,manager,preferencesFile,desktopVersion,attention:()=>{void page?.evaluate(()=>window.dispatchEvent(new Event('native-test-attention')))}})
}
let server
try{
 if(process.argv.includes('--native-applications'))applicationFixture=await createApplicationFixture(path.join(out,'app-fixture'))
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http='+new URL(pbOrigin).host,'--dir='+data,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex'),AGENT_STUDIO_BACKGROUND_WORKER:'false'}})
 pb.stdout.resume();pb.stderr.resume()
 await wait(async()=>{try{return (await api('/api/health')).status===200}catch{return false}},'PB startup')
 const password='Isolated-native-flow-2026!',email='native-flow@example.test'
 assert.equal((await api('/api/studio/bootstrap','POST',{email,password,display_name:'本机连接验收'})).status,201)
 login=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:email,password})).data;assert.ok(login.token)
 workbench=http.createServer((req,res)=>{if(!req.url.startsWith('/__pb/')){res.writeHead(404);res.end();return}const target=http.request(pbOrigin+req.url.slice(5),{method:req.method,headers:{...req.headers,host:new URL(pbOrigin).host}},up=>{if(res.destroyed){up.destroy();return}res.writeHead(up.statusCode,up.headers);pipeline(up,res,()=>{})});target.on('error',()=>{res.writeHead(502);res.end()});pipeline(req,target,()=>{})})
 workbench.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))})
 await new Promise(r=>workbench.listen(0,'127.0.0.1',r));server='http://127.0.0.1:'+workbench.address().port
 gateway=await createGateway({webRoot:path.join(root,'dist'),serverOrigin:server})
 await startManager()
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--renderer-process-limit=2','--disable-gpu']})
 const context=await browser.newContext({viewport:{width:1440,height:1050}});page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message))
 page.on('response',async r=>{if(r.status()>=400&&/\/local-devices\//.test(r.url()))console.log('LOCAL_API_REJECTION '+r.status()+' '+(await r.text()).slice(0,400))})
 await page.exposeFunction('__nativeComputer',async(action,input)=>{try{return await computer.request(action,input)}catch(e){console.log('NATIVE_ACTION_ERROR '+action+' '+e.message);throw e}})
 await page.addInitScript(({login,server})=>{
  sessionStorage.setItem('agent_studio_employee_auth',JSON.stringify(login))
  Object.defineProperty(window,'__STUDIO_DESKTOP_SERVER_ORIGIN__',{value:server})
  Object.defineProperty(window,'studioDesktop',{value:Object.freeze({version:2,computer:(action,input)=>window.__nativeComputer(action,input),prepareConnection:async ticket=>{await window.__nativeComputer('prepare',{ticket});return {ok:true}},openConnection:async()=>{window.dispatchEvent(new Event('native-test-attention'));return {ok:true}},onConnectionRequested:callback=>{const handler=()=>callback({});window.addEventListener('native-test-attention',handler);return()=>window.removeEventListener('native-test-attention',handler)}})})
 },{login,server})
 await page.goto(gateway.origin+'/tool-hub?view=devices')
 const toolbar=page.locator('[data-desktop-computer-toolbar]'),selector=toolbar.getByLabel('选择电脑')
 await expect(toolbar).toBeVisible();await expect(toolbar).toContainText('桌面版 '+desktopVersion)
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
 if(applicationFixture){
  if(await toolbar.getByRole('button',{name:'管理连接',exact:true}).getAttribute('aria-expanded')!=='true')await toolbar.getByRole('button',{name:'管理连接',exact:true}).click()
  await toolbar.getByRole('button',{name:'应用授权',exact:true}).click()
  const grants=toolbar.getByRole('region',{name:'应用长期授权'})
  await expect(grants).toBeVisible();await grants.getByRole('checkbox',{name:/Synthetic UI acceptance/}).check()
  await grants.getByLabel('允许窗口点击、输入与按键（每次操作仍需确认）').check()
  await grants.getByLabel('我确认长期授权以上应用及勾选的操作范围。').check()
  await expect(grants.getByRole('button',{name:'保存应用授权',exact:true})).toBeEnabled({timeout:15000})
  await grants.getByRole('button',{name:'保存应用授权',exact:true}).click();await expect(grants).toHaveCount(0)
  const approved=await readGuidedProfile(first,{home});assert.equal(approved.applications.grants.length,1);assert.equal(approved.applications.grants[0].control,true)
  await expect(toolbar.getByLabel('电脑连接状态')).toContainText('已连接',{timeout:20000})
  await page.getByRole('tab',{name:'本地应用',exact:true}).click();const apps=page.getByRole('region',{name:'本地应用工作区'})
  await expect(apps.getByLabel('选择已授权应用')).toBeVisible({timeout:20000});await apps.getByRole('button',{name:'刷新应用窗口',exact:true}).click()
  await expect(apps.getByLabel('应用窗口')).not.toHaveValue('',{timeout:20000})
  const observe=async target=>{await expect(apps.getByRole('button',{name:'观察窗口与控件',exact:true})).toBeEnabled({timeout:20000});await apps.getByRole('button',{name:'观察窗口与控件',exact:true}).click();await expect(apps.getByLabel('目标控件')).toBeVisible({timeout:20000});const option=await apps.getByLabel('目标控件').locator('option').filter({hasText:target}).getAttribute('value');await apps.getByLabel('目标控件').selectOption(option)}
  const confirm=async()=>{await expect(toolbar.getByRole('heading',{name:'请确认本次应用操作',exact:true})).toBeVisible({timeout:20000});await toolbar.getByLabel('我已核对目标、内容，并同意本次操作。').check();await toolbar.getByRole('button',{name:'确认应用',exact:true}).click()}
  await observe('Fixture editor');await apps.getByLabel('输入内容',{exact:true}).fill('UI_NATIVE_APPLICATION_PASSED')
  await apps.getByRole('button',{name:'输入到控件',exact:true}).click();await confirm()
  await expect(apps.getByRole('status')).toHaveCount(0,{timeout:20000})
  await observe('Save test receipt');await apps.getByRole('button',{name:'点击控件',exact:true}).click();await confirm()
  await wait(async()=>{try{return await fs.readFile(applicationFixture.receipt,'utf8')==='UI_NATIVE_APPLICATION_PASSED\n1'}catch{return false}},'real application receipt')
  await expect(apps.getByRole('status')).toHaveCount(0,{timeout:20000});await page.screenshot({path:path.join(out,'applications-workspace.png'),fullPage:true})
  pass('persistent application grants, real connector catalog, UIA typing/click, private in-app approvals and native receipt through original employee UI')
  let modelCalls=0,modelReceivedWindow=false
  modelFixture=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const payload=JSON.parse(body),messages=JSON.stringify(payload.messages);modelCalls++;if(messages.includes('Application acceptance fixture'))modelReceivedWindow=true;const response=modelCalls===1?{action:'tool',tool:'local_computer',tool_input:{tool:'apps.windows',arguments:{app:approved.applications.grants[0].id}}}:{action:'final',final_answer:'APPLICATION_AGENT_WINDOW_VERIFIED'};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:JSON.stringify(response)}}]}))})
  await new Promise(r=>modelFixture.listen(0,'127.0.0.1',r));const modelOrigin='http://127.0.0.1:'+modelFixture.address().port
  const connection=(await api('/api/model-connections','POST',{name:'Application loopback fixture',provider:'openai',api_key:'local-fixture-only',base_url:modelOrigin+'/v1',models:['fixture']})).data
  const spec=(await api('/api/agent_specs','POST',{name:'Application dispatch acceptance',spec:{goal:'查看已授权应用窗口',task_scope:'只查询专用测试程序窗口',tools:[],task_plan:['查询应用窗口','汇报结果'],deliverables:['窗口回执'],done_criteria:['读取实际授权应用窗口'],capability_requirements:[{id:'application_window',title:'Synthetic UI acceptance 读取窗口',purpose:'查询本人授权的应用窗口与控件',kind:'desktop',access:'read',required:true,role_ids:['reader'],search_terms:['Synthetic UI acceptance'],suggested_tool_ids:[]}],roles:[{id:'reader',name:'窗口核验员',responsibility:'核验应用窗口',tasks:['查询专用应用窗口'],inputs:[],deliverables:['窗口回执'],depends_on:[],tools:[],done_criteria:['读取实际窗口数据']}]}})).data
  await page.goto(gateway.origin+'/agent-create?step=3&spec='+spec.id)
  const devicePicker=page.getByRole('region',{name:'本次任务设备选择'})
  await expect(devicePicker.locator('select')).toHaveValue(first,{timeout:20000})
  const chooseApp=page.getByRole('button',{name:/所选电脑的已授权能力 · 选用并分配/})
  await expect(chooseApp).toBeEnabled({timeout:20000});await chooseApp.click()
  await page.getByRole('button',{name:'保存到我的助手',exact:true}).click()
  await expect(page.getByText('已保存进「我的 Agent」，接下来可以连接资源并试跑。',{exact:true})).toBeVisible()
  const bound=(await api('/api/agent_specs/'+spec.id)).data
  assert.deepEqual(bound.spec.tools,['local_computer']);assert.deepEqual(bound.spec.roles[0].tools,['local_computer'])
  await page.getByRole('button',{name:'下一步：试跑验证',exact:true}).click()
  await page.getByRole('link',{name:'前往试跑当前 Agent',exact:true}).click()
  await expect(page.locator('#run-quick-spec')).toHaveValue(spec.id)
  assert.equal(new URL(page.url()).searchParams.get('device'),first)
  await page.locator('#agent-task-instruction').fill('仅检查专用应用窗口，不执行输入或发送消息')
  await page.getByRole('button',{name:'运行',exact:true}).click()
  await page.getByRole('button',{name:'批准并继续执行',exact:true}).click({timeout:30000})
  await expect(page.getByRole('document',{name:'格式化运行成果'}).getByText('APPLICATION_AGENT_WINDOW_VERIFIED',{exact:true})).toBeVisible({timeout:30000})
  const runId=new URL(page.url()).searchParams.get('run'),agentState=(await api('/api/agent_runs/'+runId)).data
  assert.equal(agentState.status,'succeeded',JSON.stringify(agentState));assert.equal(modelReceivedWindow,true);assert.ok(modelCalls>=2)
  pass('creation wizard discovers exact app grant, explicitly binds the responsible role, carries the selected device to trial and dispatches approved apps.windows with a real native receipt')
  await page.goto(gateway.origin+'/tool-hub?view=devices')
  if(await toolbar.getByRole('button',{name:'管理连接',exact:true}).getAttribute('aria-expanded')!=='true')await toolbar.getByRole('button',{name:'管理连接',exact:true}).click()
  await toolbar.getByRole('button',{name:'应用授权',exact:true}).click();await expect(grants).toBeVisible();await grants.getByRole('button',{name:'清空选择',exact:true}).click();await grants.getByRole('button',{name:'暂停此连接',exact:true}).click();await grants.getByLabel('我确认长期授权以上应用及勾选的操作范围。').check();await expect(grants.getByRole('button',{name:'保存应用授权',exact:true})).toBeEnabled({timeout:15000});await grants.getByRole('button',{name:'保存应用授权',exact:true}).click();await expect(grants).toHaveCount(0)
  await toolbar.getByRole('button',{name:'连接电脑',exact:true}).click();await expect(toolbar.getByLabel('电脑连接状态')).toContainText('已连接',{timeout:20000});assert.deepEqual((await readGuidedProfile(first,{home})).applications.grants,[])
  pass('removing selected applications revokes their persisted capabilities without changing the computer binding')
 }
 await page.getByRole('tab',{name:'授权管理',exact:true}).click()
 await page.getByRole('region',{name:'工作目录授权'}).getByRole('button',{name:'编辑网站',exact:true}).click()
 const editor=toolbar.getByRole('region',{name:'本机授权管理'})
 await expect(editor).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0)
 await editor.getByLabel('允许访问的网站',{exact:true}).fill('https://example.com')
 await editor.getByRole('button',{name:'更新网站草稿',exact:true}).click()
 if(nativeFiles){const openGrant=editor.getByLabel('在本机打开 / 定位',{exact:true});await openGrant.click();await expect(openGrant).toBeChecked({timeout:10000})}
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
 if(nativeFiles){
  await page.getByRole('tab',{name:'文件工作区',exact:true}).click()
  const files=page.getByRole('region',{name:'系统内文件工作区'}),feedback=files.getByLabel('电脑软件执行状态')
  await files.getByRole('button',{name:'读取目录',exact:true}).click()
  await files.getByRole('button',{name:nativeFile,exact:true}).click()
  await expect(files.getByRole('button',{name:'用记事本打开',exact:true})).toBeEnabled({timeout:15000})
  await files.getByRole('button',{name:'用记事本打开',exact:true}).click()
  await page.getByRole('button',{name:'批准本次操作',exact:true}).click()
  await expect(feedback).toContainText('系统记事本',{timeout:30000})
  await files.getByRole('button',{name:'在电脑中定位',exact:true}).click()
  await page.getByRole('button',{name:'批准本次操作',exact:true}).click()
  await expect(feedback).toContainText('资源管理器',{timeout:30000})
  await files.getByRole('button',{name:'do-not-execute.exe',exact:true}).click()
  await expect(files.getByRole('button',{name:'用电脑软件打开',exact:true})).toBeDisabled()
  await expect(files.getByRole('button',{name:'在电脑中定位',exact:true})).toBeEnabled()
  await files.getByRole('button',{name:nativeFile,exact:true}).click()
  await page.screenshot({path:path.join(out,'file-application-feedback.png'),fullPage:true})
  pass('real UI approval, unchanged job contract, native Notepad/Explorer acknowledgements and disabled executable opening without blocking file selection')
 }
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
 await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify({checks,version:desktopVersion,realBackend:true,realConnectorChild:true,productionData:false,uiErrors:errors},null,2))
 console.log('NATIVE_FLOW_ACCEPTANCE '+out)
 if(process.argv.includes('--keep-open'))for(let i=0;i<1200;i++){try{await fs.access(path.join(out,'finish'));break}catch{}await sleep(1000)}
}finally{
 await browser?.close();await manager?.close();await gateway?.close()
 await applicationFixture?.close()
 if(modelFixture){modelFixture.closeAllConnections();await new Promise(r=>modelFixture.close(r))}
 for(const s of sockets)s.destroy()
 if(workbench)await new Promise(r=>workbench.close(r))
 await stopHeadlessPocketBase(pb)
 console.log('NATIVE_FLOW_TEST_DATA '+out)
}
