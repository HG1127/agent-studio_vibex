// Disposable standalone users/database and synthetic history. No model, worker,
// real user records or production preview touched. Real API + Chrome rendering.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {createServer} from 'node:net'
import {chromium,expect} from '@playwright/test'
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from './helpers/headless-pocketbase.mjs'
const root=process.cwd(),db=await fs.mkdtemp(path.join(os.tmpdir(),'agentstudio-archive-ui-'))
const out=path.join(root,'.tmp','record-first');await fs.mkdir(out,{recursive:true})
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const origin='http://127.0.0.1:'+port,secret=randomBytes(24).toString('hex'),password='Archive-test-only-2026!'
let pb,ui,browser,checks=0
const errors=[],metrics=[],pass=text=>{checks++;console.log('PASS '+text)}
const api=async(route,method='GET',body,token,extra={})=>{const res=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});return {status:res.status,data:await res.json().catch(()=>({}))}}
try{
 pb=spawnHeadlessPocketBase(path.join(root,'vibex-local/bin/windows/pocketbase.exe'),['serve','--http=127.0.0.1:'+port,'--dir='+db,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{cwd:path.join(root,'pocketbase'),env:{AGENT_STUDIO_AUTH_MODE:'standalone',AGENT_STUDIO_LEGACY_TEST_ONLY:'false',AGENT_STUDIO_ALLOW_ANON:'false',AGENT_STUDIO_BOOTSTRAP_SECRET:secret,AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString('hex')}})
 pb.stdout.on('data',()=>{});pb.stderr.on('data',()=>{})
 let ready=false;for(let i=0;i<150;i++){try{if((await api('/api/health')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready)
 assert.equal((await api('/api/studio/bootstrap','POST',{email:'archive@example.test',password,display_name:'运行记录测试'},null,{'X-Agent-Studio-Setup-Key':secret})).status,201)
 const login=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'archive@example.test',password})).data
 const token=login.token
 assert.equal((await api('/api/studio/users','POST',{email:'empty-archive@example.test',password,display_name:'空记录员工',role:'employee'},token)).status,201)
 const other=(await api('/api/collections/studio_users/auth-with-password','POST',{identity:'empty-archive@example.test',password})).data
 const spec=(await api('/api/agent_specs','POST',{name:'季度研究助手',spec:{goal:'fixture only',tools:[],task_plan:['check'],deliverables:['报告'],done_criteria:['可追溯']}},token)).data
 const started=await api('/api/agent-runs/start','POST',{spec_id:spec.id,instruction:'fixture'},token);assert.equal(started.status,200)
 const seed=started.data.run_id,sql=new DatabaseSync(path.join(db,'data.db'))
 const record=sql.prepare('SELECT * FROM agent_runs WHERE id=?').get(seed)
 const columns=Object.keys(record),insert=sql.prepare('INSERT INTO agent_runs ('+columns.map(c=>'"'+c+'"').join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')')
 const statuses=['succeeded','failed','awaiting_input','running','cancelled','paused']
 const ids=[]
 try{
  sql.prepare('DELETE FROM agent_runs WHERE id=?').run(seed)
  for(let i=0;i<47;i++){
   const id=randomBytes(8).toString('hex').slice(0,15);ids.push(id)
   const row={...record,id,status:statuses[i%statuses.length],instruction:i===46?'营收100%核验':'季度报告 '+String(i+1).padStart(2,'0'),result:'已验证的测试成果 '+i,current_step:2,created:new Date(Date.now()-(i===45?65*86400000:i*60000)).toISOString().replace('T',' '),updated:new Date().toISOString().replace('T',' ')}
   insert.run(...columns.map(c=>row[c]))
  }
 }finally{sql.close()}
 const first=await api('/api/agent-runs/recent?archive=1&page=1',undefined,undefined,token)
 assert.equal(first.status,200);assert.equal(first.data.totalItems,47);assert.equal(first.data.items.length,20);assert.equal(first.data.totalPages,3)
 const second=(await api('/api/agent-runs/recent?archive=1&page=2',undefined,undefined,token)).data
 assert.equal(second.items.length,20);assert.ok(second.items.every(r=>!first.data.items.some(a=>a.id===r.id)))
 const last=(await api('/api/agent-runs/recent?archive=1&page=3',undefined,undefined,token)).data;assert.equal(last.items.length,7)
 assert.equal((await api('/api/agent-runs/recent?archive=1&q='+encodeURIComponent('100%'),undefined,undefined,token)).data.totalItems,1)
 assert.equal((await api('/api/agent-runs/recent?archive=1&q='+encodeURIComponent("' OR 1=1 --"),undefined,undefined,token)).data.totalItems,0)
 assert.equal((await api('/api/agent-runs/recent?archive=1&days=7',undefined,undefined,token)).data.totalItems,46)
 const pending=(await api('/api/agent-runs/recent?archive=1&status=attention',undefined,undefined,token)).data;assert.ok(pending.items.every(r=>r.status==='awaiting_input'));assert.equal(pending.totalItems,8)
 for(const query of ['page=-1','page=1.5','status=admin','days=999'])assert.equal((await api('/api/agent-runs/recent?archive=1&'+query,undefined,undefined,token)).status,400)
 assert.equal((await api('/api/agent-runs/recent?archive=1')).status,401)
 const foreign=await api('/api/agent-runs/recent?archive=1&rh_user_id='+login.record.id,undefined,undefined,other.token,{'X-Rh-User-Id':login.record.id})
 assert.equal(foreign.data.totalItems,0);assert.equal((await api('/api/agent-runs/'+ids[0]+'/detail',undefined,undefined,other.token)).status,404)
 pass('owner-scoped SQL archive pages all 47 synthetic records; status/date/literal search, spoofed owner and legacy recent contract are safe')
 assert.equal((await api('/api/agent-runs/recent?limit=5',undefined,undefined,token)).data.items.length,5)
 process.env.AGENT_STUDIO_PB_ORIGIN=origin
 const {preview}=await import('vite');ui=await preview({configFile:path.join(root,'vibex-local/vite.local.config.ts'),preview:{port:0,strictPort:false,host:'127.0.0.1',open:false},logLevel:'error'})
 const uiOrigin='http://127.0.0.1:'+ui.httpServer.address().port
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:960}})
 page.on('pageerror',e=>errors.push(e.message))
 const loginUi=async(p,email)=>{await p.goto(uiOrigin+'/login?next=/run-detail');await p.getByLabel('工作邮箱',{exact:true}).fill(email);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await expect(p.getByRole('region',{name:'运行记录工作区'})).toBeVisible({timeout:20000})}
 await loginUi(page,'archive@example.test')
 const workspace=page.getByRole('region',{name:'运行记录工作区'}),table=page.getByRole('table',{name:'运行记录列表'})
 await expect(table.locator('tbody tr')).toHaveCount(20)
 await expect(page.getByText('还没有选中某次运行',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'随时调整 Agent 方案',exact:true})).toHaveCount(0)

 for(const width of [390,768,1440,1780]){
  await page.setViewportSize({width,height:960});const geometry=await page.evaluate(()=>{const main=document.querySelector('main[data-studio-fluid-page="run-detail"]'),list=document.querySelector('[aria-label="运行记录工作区"]'),first=document.querySelector('table[aria-label="运行记录列表"] tbody tr');return {width:innerWidth,scroll:document.documentElement.scrollWidth,listWidth:list.getBoundingClientRect().width,mainWidth:main.getBoundingClientRect().width,firstRowY:first.getBoundingClientRect().top}})
  assert.ok(geometry.scroll<=width+3,JSON.stringify(geometry));assert.ok(geometry.listWidth>=geometry.mainWidth*.8);assert.ok(geometry.firstRowY<450,JSON.stringify(geometry));metrics.push(geometry)
  await page.screenshot({path:path.join(out,'run-archive-'+width+'.png'),fullPage:false})
 }
 pass('full-width record table is visible in the first screen at four widths with no giant introductory card or horizontal page overflow')
 await page.setViewportSize({width:1440,height:960})
 await page.getByRole('button',{name:'下一页运行记录',exact:true}).click();await expect(page.getByRole('navigation',{name:'运行记录分页'})).toContainText('第 2 / 3 页')
 const rowId=second.items[0].id
 await page.getByRole('button',{name:'打开运行详情 '+rowId,exact:true}).click();await expect(page.getByRole('region',{name:'运行档案内容'})).toBeVisible({timeout:15000})
 await page.getByRole('button',{name:'返回运行记录',exact:true}).click();await expect(page.getByRole('navigation',{name:'运行记录分页'})).toContainText('第 2 / 3 页')
 await page.getByLabel('运行状态筛选').selectOption('failed');await expect(page.getByRole('navigation',{name:'运行记录分页'})).toContainText('第 1 / 1 页')
 await expect(table.locator('tbody tr')).toHaveCount(8)
 await page.getByLabel('搜索运行记录').fill('报告 02');await page.getByRole('button',{name:'搜索',exact:true}).click();await expect(table.locator('tbody tr')).toHaveCount(1)
 await table.locator('tbody button').first().click();await expect(page.getByRole('region',{name:'运行档案内容'})).toBeVisible();await page.goBack();await expect(page.getByLabel('搜索运行记录')).toHaveValue('报告 02');await expect(page.getByLabel('运行状态筛选')).toHaveValue('failed')
 pass('pagination and filters persist across detail/back; no task is executed by list navigation')
 await page.goto(uiOrigin+'/run-detail?run=missingrun00000');await expect(page.getByText('运行不存在或无权查看',{exact:true})).toBeVisible();await expect(table.locator('tbody tr')).toHaveCount(20)
 await page.goto(uiOrigin+'/run-detail')
 await page.route('**/api/agent-runs/recent?**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}))
 await page.getByRole('button',{name:'刷新运行记录',exact:true}).click();await expect(workspace.getByRole('alert')).toContainText('不代表没有历史记录');await expect(page.getByText('还没有运行记录',{exact:true})).toHaveCount(0)
 await page.unroute('**/api/agent-runs/recent?**');await page.getByRole('button',{name:'重新加载记录',exact:true}).click();await expect(table.locator('tbody tr')).toHaveCount(20)
 pass('unavailable/foreign run and network failures keep a compact actionable state rather than a false empty history')
 await page.route('**/api/agent-runs/recent?**',async route=>{const response=await route.fetch(),body=await response.json();await route.fulfill({json:{ok:true,items:body.items}})})
 await page.getByRole('button',{name:'刷新运行记录',exact:true}).click();await expect(workspace.getByText(/当前后端仅提供最近 20 条/)).toBeVisible();await expect(page.getByRole('button',{name:'下一页运行记录',exact:true})).toBeDisabled()
 await page.unroute('**/api/agent-runs/recent?**')
 pass('old preview backend is explicitly recent-only; no fabricated totals or fake paging')
 // A separate browser context has no employee history and no inherited session.
 const emptyContext=await browser.newContext(),empty=await emptyContext.newPage({viewport:{width:1440,height:960}})
 await loginUi(empty,'empty-archive@example.test');await expect(empty.getByText('还没有运行记录',{exact:true})).toBeVisible()
 const emptySize=await empty.locator('[data-workspace-empty]').boundingBox();assert.ok(emptySize.height<150)
 await empty.screenshot({path:path.join(out,'run-archive-empty.png'),fullPage:false})
 const pages=[['/version-release','还没有已保存的助手方案'],['/agent-collaboration','选择一个 Agent 查看协作方案'],['/knowledge-bases','选择或创建知识库']]
 // These routes are checked on the existing authenticated owner; no records created.
 for(const [url,title] of pages){await empty.goto(uiOrigin+url);await expect(empty.getByText(title,{exact:true})).toBeVisible({timeout:15000});for(const width of [390,1440]){await empty.setViewportSize({width,height:960});assert.ok(await empty.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3));const box=await empty.locator('[data-workspace-empty]').first().boundingBox();assert.ok(box.height<190,url+' empty state height '+box.height)}}
 pass('empty archive, version release, collaboration and knowledge states stay compact without blocking lists or controls')
 assert.deepEqual(errors,[])
 console.log('RECORDS_FIRST_BROWSER_PASS '+JSON.stringify({checks,metrics,realChrome:true,realStandaloneApi:true,syntheticHistoryRows:47,productionMutated:false,paidModelCalls:0}))
}catch(error){console.error('RECORDS_FIRST_FAILURE',error);throw error}finally{await browser?.close();await ui?.httpServer?.close();await stopHeadlessPocketBase(pb).catch(()=>{});await fs.rm(db,{recursive:true,force:true,maxRetries:6,retryDelay:200})}
