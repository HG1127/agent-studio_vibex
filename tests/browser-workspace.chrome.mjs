// Real Chrome UI + private disposable PocketBase + real MCP/Chrome target; no mocked application APIs.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
import {setTimeout as sleep} from 'node:timers/promises'
import {createServer as createVite} from 'vite'
import {chromium,expect} from 'playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {createRuntime} from '../local-executor/runtime.mjs'
import {connection,executeClaim} from '../local-executor/connection.mjs'
const root=process.cwd(),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-browser-ui-')),out=path.join(root,'.tmp/browser-navigation-diagnosis');await fs.mkdir(out,{recursive:true})
const key=randomBytes(24).toString('hex'),password='Disposable-browser-2026!',calls=[],errors=[]
let pb,ui,browser,runtime,worker,stop=false,consume=true,active=false,requests=0,checks=0,log=''
const pass=s=>{checks++;console.log('PASS '+s)}
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)))
const site=createServer((req,res)=>{requests++;if(req.url==='/drop'){req.socket.destroy();return}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(req.url==='/default'?'<title>恭喜，站点创建成功！</title><h1>这是默认index.html</h1>':'<title>业务页面验收</title><h1>浏览器网页已核验</h1>')})
const website=await listen(site),probe=createServer(),origin=await listen(probe);await new Promise(r=>probe.close(r))
const api=async(route,body,token,setup=false)=>{const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(setup?{'X-Agent-Studio-Setup-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const data=await r.json();assert.ok(r.ok,route+' '+r.status);return data}
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http='+new URL(origin).host,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
 pb.stdout.on('data',x=>log=(log+x).slice(-5000));pb.stderr.on('data',x=>log=(log+x).slice(-5000))
 await expect.poll(async()=>{try{return(await fetch(origin+'/api/health')).status}catch{return 0}},{timeout:20000}).toBe(200)
 await api('/api/studio/bootstrap',{email:'browser-fixture@example.test',password,display_name:'网页体验隔离验收'},null,true)
 const auth=await api('/api/collections/studio_users/auth-with-password',{identity:'browser-fixture@example.test',password}),device=await api('/api/local-devices',{name:'浏览器验收电脑'},auth.token),credential=await api('/api/public/local-executor/pair',{code:device.pairing_code})
 runtime=await createRuntime({roots:[{name:'work',path:db}],files:{enabled:false},browser:{enabled:true,headless:true,images:true,channel:'chrome',allowedOrigins:[website]}})
 const executor=connection(origin,credential.token);await executor('/poll',{tools:runtime.tools})
 worker=(async()=>{while(!stop){if(consume){const {job}=await executor('/poll',{tools:runtime.tools});if(job){active=true;calls.push(job.input.tool);try{await executeClaim(executor,runtime,job)}finally{active=false}}}await sleep(100)}})().catch(e=>{if(!stop)errors.push(e.message)})
 process.env.AGENT_STUDIO_PB_ORIGIN=origin;const empty=path.join(db,'empty-env');await fs.mkdir(empty)
 ui=await createVite({root,configFile:path.join(root,'vibex-local/vite.local.config.ts'),envDir:empty,server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/.tmp/**','**/dist/**']}},logLevel:'error'});await ui.listen()
 const base='http://127.0.0.1:'+ui.httpServer.address().port
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/login?next='+encodeURIComponent('/tool-hub?view=devices'));await page.getByLabel('工作邮箱',{exact:true}).fill('browser-fixture@example.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click()
 const devicePanel=page.getByRole('region',{name:'我的电脑与浏览器',exact:true});await expect(devicePanel).toBeVisible({timeout:25000});await devicePanel.getByRole('button',{name:'检查连接',exact:true}).click()
 const area=page.getByRole('region',{name:'无需 JSON 的连接检查',exact:true}),field=area.getByLabel('快速检查网页地址'),status=area.getByRole('status',{name:'网页状态核验'}),result=area.getByRole('status',{name:'连接检查结果'})
 await field.fill(website+'/good');assert.equal(requests,0)
 const approve=async()=>page.locator('[data-studio-dialog]').getByRole('button',{name:'批准这次检查',exact:true}).click()
 await area.getByRole('button',{name:'读取当前网页',exact:true}).click();await expect(page.locator('[aria-label="网页操作进度"]')).toContainText('等待你批准');await page.locator('[data-studio-dialog]').getByRole('button',{name:'取消',exact:true}).click();assert.equal(calls.length,0);assert.equal(requests,0)
 pass('typing a URL and declining approval perform no navigation or tool call')
 await area.getByRole('button',{name:'读取当前网页',exact:true}).click();await approve();await expect(status).toContainText('尚未打开网页',{timeout:15000});assert.deepEqual(calls,['browser.browser_snapshot']);assert.equal(requests,0);await expect(result).not.toContainText('真实检查完成')
 pass('reading an unopened browser explains the blank page and never claims website success')
 consume=false;await area.getByRole('button',{name:'打开目标网页',exact:true}).click();await approve();await expect(area.getByRole('status',{name:'网页操作进度'})).toContainText('等待本机连接器领取');await expect(field).toBeDisabled();consume=true
 await expect(status).toContainText('目标网页已打开',{timeout:30000});await expect(status).toContainText(website+'/good');await expect(area.getByLabel('网页内容预览')).toContainText('浏览器网页已核验')
 pass('explicit navigation reports queue progress and then the actual loaded URL and page content')
 const before=calls.length;await field.fill(website+'/other');await area.getByRole('button',{name:'读取当前网页',exact:true}).click();await approve();await expect(status).toContainText('未跳转到输入网址',{timeout:15000});await expect(status).toContainText(website+'/good');assert.equal(calls.length,before+1)
 pass('snapshot of an existing page is clearly distinguished from visiting the newly typed URL')
 await field.fill(website+'/default');await area.getByRole('button',{name:'打开目标网页',exact:true}).click();await approve();await expect(status).toContainText('站点默认页',{timeout:20000});await expect(status).toContainText('重装连接器不能替代网站部署')
 pass('hosting placeholder is surfaced as a website configuration issue')
 await field.fill(website+'/drop');await area.getByRole('button',{name:'打开目标网页',exact:true}).click();await approve();await expect(status).toContainText('没有确认打开目标网页',{timeout:20000});await expect(result).not.toContainText('真实检查完成')
 await field.fill(website+'/good');await area.getByRole('button',{name:'打开目标网页',exact:true}).click();await approve();await expect(status).toContainText('目标网页已打开',{timeout:20000})
 pass('navigation failure is visible inside the workbench and a new explicitly approved visit recovers')
 await area.getByRole('button',{name:'查看当前网页截图',exact:true}).click();await approve();await expect(area.getByRole('img',{name:'本地操作返回的截图'})).toBeVisible({timeout:20000})
 pass('the returned screenshot is rendered inside the workbench without claiming desktop embedding')
 consume=false;await field.fill(website+'/good');await area.getByRole('button',{name:'打开目标网页',exact:true}).click();await approve();await expect(result).toContainText('等待本机连接器领取');const stoppedCount=calls.length;await result.getByRole('button',{name:'停止本次操作',exact:true}).click();await expect(result).toContainText('本次操作已停止');consume=true;await sleep(300);assert.equal(calls.length,stoppedCount)
 pass('cancellation reads the real terminal job status and does not run the queued navigation')
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1050});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4),'overflow '+width)}
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'workbench-browser.png'),fullPage:true})
 const report={status:'PASS',checks,realChromeUI:true,realPocketBase:true,realMCP:true,toolCalls:calls.length,requests,mockedAPIs:false,userDataMutated:false};await fs.writeFile(path.join(out,'ui-acceptance.json'),JSON.stringify(report,null,2));console.log('BROWSER_WORKSPACE_ACCEPTANCE '+JSON.stringify(report))
} catch(e){console.error(e.stack+'\nBACKEND '+log);process.exitCode=1}
finally{stop=true;await browser?.close();await worker;await ui?.close();await runtime?.close();await stopHeadlessPocketBase(pb);site.closeAllConnections();await new Promise(r=>site.close(r));await fs.rm(db,{recursive:true,force:true,maxRetries:20,retryDelay:100});if(active)console.error('executor still active')}
