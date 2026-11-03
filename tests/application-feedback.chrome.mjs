// Existing employee pages, real standalone JWT + temporary SQLite + connector
// protocol + Chromium. Only application execution is a deterministic fixture.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {createServer as createVite} from 'vite'
import {chromium} from 'playwright'
import {expect} from 'playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {executeClaim,connection} from '../local-executor/connection.mjs'
import {APPLICATION_FAILURE_MESSAGES} from '../local-executor/application-feedback.mjs'

const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-app-feedback-'))
const key=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex'),appId='a'.repeat(24)
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
const origin='http://127.0.0.1:'+port,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let backend,ui,browser,timer,polling=false,stopping=false,token='',executor,nextFailure='',executions=0,logs=''
const errors=[],effects=[]
async function api(route,body,auth=token,extra={}){
 const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{}),...extra},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)})
 const data=await response.json();assert.ok(response.ok,route+' '+response.status+' '+JSON.stringify(data));return data
}
const catalog=['apps.launch','apps.windows'].map(name=>({name,description:'Synthetic application fixture',inputSchema:{type:'object',properties:{app:{type:'string',enum:[appId]}},required:['app'],additionalProperties:false,
 ...(name==='apps.windows'?{'x-studio-applications':[{id:appId,name:'WorkBuddy 测试应用',adapter:'desktop',control:true}]}:{})}}))
async function poll(){
 if(stopping||polling)return;polling=true
 try{const {job}=await executor('/poll',{tools:catalog});if(job)await executeClaim(executor,{execute:async input=>{
  executions++;effects.push(input.tool);if(nextFailure)throw Error(nextFailure)
  return JSON.stringify({status:'ready',accepted:true,windows:[{id:'123',title:'Synthetic application window'}]})
 }},job)}catch(error){if(!stopping)errors.push(error.message)}finally{polling=false}
}
try{
 backend=spawnHeadlessPocketBase(process.env.POCKETBASE_BIN||path.join(root,'vibex-local/bin/windows/pocketbase.exe'),[
  'serve','--http=127.0.0.1:'+port,'--dir='+temp,'--hooksDir='+path.join(root,'pocketbase/pb_hooks'),
 ],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_BACKGROUND_WORKER:'false'}})
 backend.stdout.on('data',b=>logs=(logs+String(b)).slice(-4000));backend.stderr.on('data',b=>logs=(logs+String(b)).slice(-4000))
 await expect.poll(async()=>{try{return(await fetch(origin+'/api/health')).status}catch{return 0}},{timeout:30000}).toBe(200)
 await api('/api/studio/bootstrap',{email:'app-feedback@example.test',password,display_name:'应用反馈测试'},'',{'X-Agent-Studio-Setup-Key':key})
 token=(await api('/api/collections/studio_users/auth-with-password',{identity:'app-feedback@example.test',password},'')).token
 const device=await api('/api/local-devices',{name:'应用诊断测试电脑'})
 const credentials=await api('/api/public/local-executor/pair',{code:device.pairing_code},'')
 executor=connection(origin,credentials.token);await poll();timer=setInterval(()=>void poll(),150)
 process.env.AGENT_STUDIO_PB_ORIGIN=origin
 ui=await createVite({configFile:path.join(root,'vibex-local/vite.local.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:false,open:false},logLevel:'error'});await ui.listen()
 const web='http://127.0.0.1:'+ui.httpServer.address().port
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message))
 await page.goto(web+'/login?next='+encodeURIComponent('/tool-hub?view=devices&device='+device.id))
 await page.getByLabel('工作邮箱',{exact:true}).fill('app-feedback@example.test');await page.getByLabel('密码',{exact:true}).fill(password)
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await page.getByRole('tab',{name:'本地应用',exact:true}).click({timeout:30000})
 const apps=page.getByRole('region',{name:'本地应用工作区',exact:true}),launch=apps.getByRole('button',{name:'启动应用',exact:true})
 const task=apps.getByRole('textbox',{name:'希望应用完成什么任务？',exact:true});await task.fill('合成任务草稿；本测试不提交业务任务')
 for(const code of ['application_binary_changed','application_launcher_needs_review','application_native_timeout','application_binary_missing','application_launch_denied']){
  nextFailure=code;const before=executions;await launch.click()
  await expect(apps.getByRole('alert')).toHaveText(APPLICATION_FAILURE_MESSAGES[code],{timeout:20000})
  await expect(apps.getByRole('alert')).not.toContainText('local_execution_failed')
  await expect(task).toHaveValue('合成任务草稿；本测试不提交业务任务')
  await expect(launch).toBeEnabled();assert.equal(executions,before+1)
 }
 await apps.getByText('本次操作回执',{exact:true}).click();await expect(apps.locator('details')).toContainText('application_launch_denied')
 nextFailure='';await launch.click();await expect(apps.getByLabel('应用窗口',{exact:true})).toHaveValue('123',{timeout:20000})
 await expect(apps.getByRole('alert')).toHaveCount(0)
 nextFailure='application_window_changed';await apps.getByRole('button',{name:'刷新应用窗口',exact:true}).click()
 await expect(apps.getByRole('alert')).toHaveText(APPLICATION_FAILURE_MESSAGES.application_window_changed,{timeout:20000})
 await expect(apps.getByLabel('应用窗口',{exact:true})).toHaveValue('')
 assert.deepEqual(effects,['apps.launch','apps.launch','apps.launch','apps.launch','apps.launch','apps.launch','apps.windows'])
 assert.equal((await api('/api/agent_specs')).totalItems,0,'manual launch must never submit the typed business task')
 assert.deepEqual(errors,[])
 await fs.mkdir(path.join(root,'.tmp'),{recursive:true});await page.screenshot({path:path.join(root,'.tmp/application-feedback.png'),fullPage:true})
 console.log('PASS application feedback: verified employee UI, 5 specific failures, safe receipts, preserved draft, recovery and stale-window reset; no real app actions or model calls')
}catch(error){console.error('APP_FEEDBACK_TEST_FAIL',error.message,logs.slice(-1500));throw error}
finally{
 stopping=true;clearInterval(timer);while(polling)await sleep(50)
 await browser?.close();await ui?.close();await stopHeadlessPocketBase(backend)
 const resolved=await fs.realpath(temp),intended=await fs.realpath(os.tmpdir());assert.equal(path.dirname(resolved).toLowerCase(),intended.toLowerCase());assert.ok(path.basename(resolved).startsWith('agentstudio-app-feedback-'))
 await fs.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
