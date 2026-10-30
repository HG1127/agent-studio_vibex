// Real browser acceptance for the task-first UX. Disposable DB + two actual
// employee roles, no production data, model keys, background worker or inference.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
import {chromium,expect} from '@playwright/test'
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agentstudio-task-ux-'))
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),apiOrigin='http://127.0.0.1:'+port
const secret=randomBytes(24).toString('hex'),pass='Fixture-task-ux-2026!'
let pb,browser,ui,logs=''
let checks=0
const requests=[],errors=[]
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const out=path.join(root,'.tmp/task-first-ux')
fs.mkdirSync(out,{recursive:true})
async function api(route,method='GET',body,token,setup=false){
 const res=await fetch(apiOrigin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...(setup?{'X-Agent-Studio-Setup-Key':secret}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)})
 const data=await res.json().catch(()=>({}));return {status:res.status,data}
}
function passed(label){checks++;console.log('PASS '+label)}
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+tmp,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:secret,AGENT_STUDIO_BACKGROUND_WORKER:'false',AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
 pb.stdout.on('data',d=>logs=(logs+String(d)).slice(-5000));pb.stderr.on('data',d=>logs=(logs+String(d)).slice(-5000))
 let ready=false
 for(let i=0;i<120;i++){try{if((await api('/api/health')).status===200){ready=true;break}}catch{}await sleep(100)}
 assert.ok(ready,'disposable API not ready')
 assert.equal((await api('/api/studio/bootstrap','POST',{email:'ux-admin@example.test',password:pass,display_name:'隔离 UX 管理员'},null,true)).status,201)
 const boss=await api('/api/collections/studio_users/auth-with-password','POST',{identity:'ux-admin@example.test',password:pass})
 assert.equal(boss.status,200)
 assert.equal((await api('/api/studio/users','POST',{email:'ux-member@example.test',password:pass,display_name:'隔离 UX 普通员工',role:'employee'},boss.data.token)).status,201)
 const member=await api('/api/collections/studio_users/auth-with-password','POST',{identity:'ux-member@example.test',password:pass})
 assert.equal(member.status,200)
 const spec={goal:'核验测试数据并给出计算说明',task_scope:'仅测试数据，不连接真实服务',tools:['calculate'],task_plan:['计算','复核'],deliverables:['计算报告'],done_criteria:['列出计算过程'],knowledge_base_ids:[],require_plan_review:false}
 const created=await api('/api/agent_specs','POST',{name:'体验验收计算助手',spec},member.data.token)
 assert.ok([200,201].includes(created.status),'fixture Agent must be saved successfully')
 assert.match(created.data.id,/^[a-zA-Z0-9]{15}$/)
 const specId=created.data.id
 process.env.AGENT_STUDIO_PB_ORIGIN=apiOrigin
 const {preview}=await import('vite')
 ui=await preview({configFile:path.join(root,'vibex-local/vite.local.config.ts'),preview:{port:0,strictPort:false,host:'127.0.0.1',open:false},logLevel:'error'})
 const origin='http://127.0.0.1:'+ui.httpServer.address().port
 browser=await chromium.launch({channel:'msedge',headless:true})
 const memberContext=await browser.newContext({viewport:{width:1440,height:950}})
 const page=await memberContext.newPage()
 page.on('pageerror',e=>errors.push(e.message))
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/__pb/'))requests.push({method:r.method(),path:u.pathname})})
 async function login(p,email,next){await p.goto(origin+'/login?next='+encodeURIComponent(next));await p.getByLabel('工作邮箱',{exact:true}).fill(email);await p.getByLabel('密码',{exact:true}).fill(pass);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(url=>url.pathname===next.split('?')[0])}
 async function noOverflow(p,label){const m=await p.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));assert.ok(m.s<=m.w+4,label+': '+JSON.stringify(m))}
 await login(page,'ux-member@example.test','/account')
 await expect(page.getByRole('heading',{name:'我的账号与安全',exact:true})).toBeVisible()
 await expect(page.getByRole('region',{name:'我的账号安全'})).toBeVisible()
 assert.equal(requests.some(r=>r.path==='/__pb/api/studio/users'),false,'personal page must never query employee list')
 await page.getByRole('button',{name:'修改登录密码',exact:true}).click()
 await expect(page.getByLabel('当前密码',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'取消',exact:true}).click()
 assert.equal((await api('/api/studio/users','GET',undefined,member.data.token)).status,403)
 await page.goto(origin+'/staff');await page.waitForURL(url=>url.pathname==='/')
 passed('ordinary employee can access own password settings; staff APIs and route remain admin-only')
 await page.goto(origin+'/internal-overview');await expect(page.getByRole('heading',{name:'我的任务与待办',exact:true})).toBeVisible()
 await page.goto(origin+'/approvals?view=company');await expect(page.getByRole('heading',{name:'我的审批委托',exact:true})).toBeVisible()
 await expect(page.getByRole('region',{name:'公司运行统计'})).toHaveCount(0)
 assert.equal(requests.some(r=>r.path==='/__pb/api/studio/company/overview'),false)
 assert.equal((await api('/api/studio/company/overview','GET',undefined,member.data.token)).status,403)
 passed('personal overview and own delegations do not request or expose company data')
 await page.goto(origin+'/agent-run')
 await expect(page.locator('#run-quick-spec')).toBeVisible()
 await expect(page.locator('#agent-task-instruction')).toHaveCount(0)
 await page.locator('#run-quick-spec').selectOption(specId)
 await expect(page.locator('#agent-task-instruction')).toBeVisible()
 await expect(page.getByText('本次可操作的电脑',{exact:true})).toHaveCount(0)
 passed('task launcher appears after Agent selection; non-computer Agent has no irrelevant device form')
 await page.goto(origin+'/agent-create?spec='+specId+'&step=2')
 await expect(page.getByLabel('Agent 目标',{exact:true})).toBeVisible()
 const goal='已在真实浏览器审阅并更新的测试目标'
 await page.getByLabel('Agent 目标',{exact:true}).fill(goal)
 const before=requests.filter(r=>r.method==='PATCH'&&r.path.endsWith('/'+specId)).length
 await page.getByRole('button',{name:'保存并继续：连接资源',exact:true}).click()
 await page.waitForURL(u=>u.searchParams.get('step')==='3'&&u.searchParams.get('spec')===specId)
 assert.equal((await api('/api/agent_specs/'+specId,'GET',undefined,member.data.token)).data.spec.goal,goal)
 assert.equal(requests.filter(r=>r.method==='PATCH'&&r.path.endsWith('/'+specId)).length-before,1)
 passed('one save-and-continue click persists the correct draft once and opens resource setup')
 await page.goto(origin+'/skills')
 await expect(page.getByRole('heading',{name:'Skill 能力中心'})).toBeVisible()
 await expect(page.getByRole('dialog',{name:'导入可复用方法',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'导入 Skill',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'导入可复用方法',exact:true})
 await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'粘贴正文',exact:true}).click()
 await dialog.getByLabel('SKILL.md 正文').fill('---\nname: evidence-check\ndescription: Check evidence in research summaries.\n---\n# Method\nAlways list sources and uncertainty. Do not execute tools.')
 await dialog.getByRole('button',{name:'导入并待审核',exact:true}).click()
 await expect(dialog).toHaveCount(0)
 await expect(page.getByRole('region',{name:'Skill 版本审核'})).toContainText('evidence-check')
 await expect(page.getByText('当前版本尚未审核，不可绑定到角色',{exact:true})).toBeVisible()
 passed('Skill import is on demand, returns to actual version review, and never auto-approves')
 const widths=[390,768,1440,1780]
 for(const width of widths){
   await page.setViewportSize({width,height:900})
   await page.goto(origin+'/account');await expect(page.getByRole('heading',{name:'我的账号与安全',exact:true})).toBeVisible();await noOverflow(page,'account '+width)
   await page.goto(origin+'/skills');await expect(page.getByRole('heading',{name:'Skill 能力中心'})).toBeVisible();await noOverflow(page,'skills '+width)
   await page.goto(origin+'/execution-connections');await expect(page.getByRole('navigation',{name:'执行资源操作流程'})).toBeVisible()
   assert.equal(await page.getByRole('navigation',{name:'执行资源操作流程'}).getByRole('link').count(),5)
   assert.ok(!(await page.getByRole('navigation',{name:'执行资源操作流程'}).innerText()).includes('步骤'))
   await noOverflow(page,'resources '+width)
 }
 passed('account, Skills and resource navigation fit 390/768/1440/1780px without document overflow')
 const adminContext=await browser.newContext({viewport:{width:1440,height:950}})
 const admin=await adminContext.newPage(),adminRequests=[]
 admin.on('pageerror',e=>errors.push(e.message));admin.on('request',r=>adminRequests.push(new URL(r.url()).pathname))
 await login(admin,'ux-admin@example.test','/manager')
 await expect(admin.getByRole('region',{name:'待我审批',exact:true})).toBeVisible()
 assert.equal(adminRequests.includes('/__pb/api/studio/company/overview'),false,'approval inbox should not fetch unrelated company metrics')
 await admin.getByRole('button',{name:'公司运行',exact:true}).click()
 await expect(admin.getByRole('region',{name:'公司运行统计'})).toBeVisible()
 await expect(admin.getByRole('region',{name:'待我审批',exact:true})).toHaveCount(0)
 assert.ok(adminRequests.includes('/__pb/api/studio/company/overview'))
 await expect(admin.getByRole('link',{name:'检查执行器状态'})).toHaveAttribute('href','/tool-hub?view=monitor')
 await admin.screenshot({path:path.join(out,'manager-company.png'),fullPage:true})
 await admin.getByRole('button',{name:'我的委托',exact:true}).click()
 await expect(admin.getByRole('region',{name:'我的审批委托'})).toBeVisible()
 await expect(admin.getByRole('region',{name:'公司运行统计'})).toHaveCount(0)
 passed('manager tabs isolate inbox/company/delegations; monitor link opens the correct view')
 for(const width of widths){await admin.setViewportSize({width,height:900});await noOverflow(admin,'manager '+width)}
 passed('management view remains usable across all four viewport widths')
 assert.deepEqual(errors,[],'no unhandled browser exceptions')
 await page.setViewportSize({width:1440,height:950});await page.goto(origin+'/skills');await expect(page.getByRole('region',{name:'Skill 版本审核'})).toBeVisible();await page.screenshot({path:path.join(out,'skills-library.png'),fullPage:true})
 console.log('TASK_EXPERIENCE_BROWSER_PASS '+JSON.stringify({checks,roles:2,widths,realBrowser:true,realPocketBase:true,paidModelCalls:0,productionMutated:false}))
}catch(error){console.error('TASK_EXPERIENCE_BROWSER_FAIL',String(error?.stack||error));console.error(logs.slice(-2000));process.exitCode=1}
finally{
 await browser?.close().catch(()=>{})
 if(ui)await new Promise(resolve=>ui.httpServer.close(resolve))
 await stopHeadlessPocketBase(pb).catch(()=>{})
 fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
