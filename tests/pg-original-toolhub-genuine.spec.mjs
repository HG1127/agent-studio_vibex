// AUTHORED/UNRUN. Exactly one fresh-service story, actual original main/App.
import {test,expect,chromium} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {TOOL_TRIAL_EFFECT_ACK} from '../services/pg-api/src/tool-trial-contract.ts'
import {requireOriginalToolHubGenuineCi} from './helpers/pg-original-toolhub-genuine-guard.mjs'
// Failure evidence only: fixed-size path/method/status/phase metadata.
// Never reads bodies, headers, cookies, request postData, page text or secrets.
function originalToolHubDiagnosticPath(raw,origin){try{const url=new URL(raw,origin);if(url.origin!==origin)return'<external-origin>';const path=url.pathname.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,':id').split('/').map(value=>value.length>40?':opaque':value).join('/');return path.length<=180?path:'<long-resource-path>'}catch{return'<invalid-resource-url>'}}
function originalToolHubDiagnosticAppend(rows,row,max){rows.push(row);if(rows.length>max)rows.shift()}
function createOriginalToolHubBoundedDiagnostics({origin,getPhase=()=> 'unobserved'}){
 if(typeof origin!=='string'||new URL(origin).origin!==origin||typeof getPhase!=='function')throw Error('invalid_bounded_diagnostic_scope')
 const errors=[],recent=[],consoleSources=[],detach=[];let dropped=0
 const phase=()=>{const value=getPhase();return typeof value==='string'&&/^[a-z_]{1,60}$/.test(value)?value:'unobserved'},append=(rows,row,max)=>{if(rows.length>=max)dropped++;originalToolHubDiagnosticAppend(rows,row,max)}
 return{attach(page){const response=r=>{const path=originalToolHubDiagnosticPath(r.url(),origin),status=r.status(),method=r.request().method();if(!Number.isSafeInteger(status)||status<100||status>599)return;const row={phase:phase(),path,method:['GET','POST','PATCH','DELETE','HEAD','OPTIONS'].includes(method)?method:'other',status};if(status>=400)append(errors,row,20);if(path.startsWith('/__pg_native/api/'))append(recent,row,30)},consoleMessage=m=>{if(m.type()==='error')append(consoleSources,{phase:phase(),path:originalToolHubDiagnosticPath(m.location()?.url??'',origin)},10)};page.on('response',response);page.on('console',consoleMessage);detach.push(()=>{page.off('response',response);page.off('console',consoleMessage)})},snapshot(){return{error_routes:errors.map(row=>({...row})),recent_native_routes:recent.map(row=>({...row})),console_error_sources:consoleSources.map(row=>({...row})),dropped}},dispose(){for(const off of detach.splice(0))off()}}
}

test('canonical ToolHub views: actual owner Home, calc/approval, numbered activity filters and truthful monitor',async({},testInfo)=>{
 requireOriginalToolHubGenuineCi()
 const {startOriginalToolHubGenuineFixture}=await import('./helpers/pg-original-toolhub-genuine-fixture.mjs'),f=await startOriginalToolHubGenuineFixture()
 let browser,context,page,phase='start';const contexts=[],exceptions=[],consoleErrors=[],failedRequests=[],badResponses=[],outside=[],traffic=[]
 const diagnostics=createOriginalToolHubBoundedDiagnostics({origin:f.browserOrigin,getPhase:()=>phase})
 const attach=p=>{
  diagnostics.attach(p)
  p.on('pageerror',e=>exceptions.push(String(e)));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});p.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}))
  p.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()})})
  p.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==f.browserOrigin)outside.push(r.url());if(u.pathname.startsWith('/__pg_native/api/v2/'))traffic.push({view:new URL(p.url()).searchParams.get('view'),path:u.pathname+u.search})})
 }
 const login=async(who,p)=>{await p.goto(f.browserOrigin+'/login?next=%2Ftool-hub%3Fview%3Ddebug');await p.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials[who].email);await p.getByLabel('密码',{exact:true}).fill(f.credentials[who].password);await p.getByRole('button',{name:'登录',exact:true}).click();await expect(p).toHaveURL(f.url)}
 const seedCalc=async()=>{
  const body={purpose:'tool',request_id:randomUUID(),target:{kind:'builtin',tool:'calculate'},arguments_json:'{"expression":"1+1"}',effect_consent:TOOL_TRIAL_EFFECT_ACK},headers={'X-AgentStudio-Expected-Employee':f.users.alice}
  const preview=await f.request('alice','/api/v2/tool-hub/trials/preview',body,{headers});expect(preview.status).toBe(200)
  const submitted=await f.request('alice','/api/v2/tool-hub/trials',body,{headers});expect(submitted.status).toBe(201);const id=submitted.body.receipt.run_id
  expect((await f.drive(id)).run.status).toBe('awaiting_approval');const current=await f.runs.get(await f.identityFor('alice'),id),pending=current.pending_effect;expect(pending.kind).toBe('tool')
  const approved=await f.request('alice','/api/v2/workflow-v2-runs/'+id+'/decision',{decision:'approved',step_key:pending.step_key,input_sha256:pending.input_sha256},{headers});expect(approved.status).toBe(200)
  expect((await f.drive(id,['succeeded','failed','paused'])).run.status).toBe('succeeded')
 }
 // Each UI filter invalidates the previous read scope. Observe the exact
 // real pair before the action, consume both bodies, then await current UI.
 const activityReady=async(query,action)=>{
  const list=page.waitForResponse(r=>r.request().method()==='GET'&&r.url()===f.browserOrigin+'/__pg_native/api/v2/tool-hub/invocations?'+query,{timeout:15000})
  const stats=page.waitForResponse(r=>r.request().method()==='GET'&&r.url()===f.browserOrigin+'/__pg_native/api/v2/tool-hub/stats',{timeout:15000})
  const pair=Promise.all([list,stats]);void pair.catch(()=>{})
  await action();const [rows,counts]=await pair
  expect(await rows.finished()).toBeNull();expect(await counts.finished()).toBeNull()
  await expect(page.getByRole('button',{name:'刷新调用记录',exact:true})).toBeEnabled()
 }
 try{
  expect(f.originalHomeReadOnly).toBe(true);const resources=await f.prepareResources('alice')
  for(const who of ['alice','bob']){const reply=await f.request(who,'/api/v2/original-ui/agent-specs?limit=50');expect(reply.status).toBe(200);expect(reply.body.items.some(row=>row.id===f.resources[who].spec.id)).toBe(true);expect(reply.body.items.every(row=>row.owner_user_id===f.users[who])).toBe(true)}
  expect((await f.request('alice','/api/v2/original-ui/agent-specs/'+f.resources.bob.spec.id)).status).toBe(404)
  browser=await chromium.launch();context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context);page=await context.newPage();attach(page);page.on('dialog',d=>d.accept())
  phase='canonical_debug';await login('alice',page);await expect(page.getByRole('heading',{name:'验证工具是否可执行',exact:true})).toBeVisible();await expect(page.getByText(new RegExp('^'+resources.http.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*'+String(resources.http.method||'POST').toUpperCase()+'$'))).toBeVisible();await expect(page.locator('nav[aria-label="执行资源操作流程"] a[href*="view=devices"]')).toBeVisible()
  const debug=page.locator('#debug-console'),run=()=>debug.getByRole('button',{name:'真实调用',exact:true}).click();await page.getByRole('button',{name:/计算器/}).click();await debug.locator('#th-expr').fill('6*7');const before=await f.counts();await run();await expect.poll(async()=> (await f.counts()).trials).toBe(before.trials+1);expect(await debug.getByText('调用成功',{exact:true}).count()).toBe(0)
  const receipt=(await f.trials.list(await f.identityFor('alice'),undefined,50)).items[0];phase='actual_original_worker_approval';expect((await f.drive(receipt.run_id)).run.status).toBe('awaiting_approval');await run();await expect.poll(async()=> (await f.runs.get(await f.identityFor('alice'),receipt.run_id)).approvals.find(a=>a.step_key)?.status).toBe('approved');expect((await f.drive(receipt.run_id,['succeeded','failed','paused'])).run.status).toBe('succeeded');await page.getByRole('button',{name:'刷新当前视图',exact:true}).click();await expect(debug.getByText('调用成功',{exact:true})).toBeVisible();await expect(debug.locator('pre')).toContainText('42')
  phase='actual_ledger_for_second_page';for(let i=0;i<20;i++)await seedCalc()
  phase='canonical_activity';await page.locator('nav[aria-label="执行资源操作流程"] a[href*="view=activity"]').click();await expect(page.getByRole('heading',{name:'调用记录与故障定位',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/下一页/})).toBeEnabled();await page.getByRole('button',{name:/下一页/}).click();await expect(page.locator('section[aria-label="工具调用记录"]')).toContainText('2 / 2');await expect(page.locator('section[aria-label="工具调用记录"] li')).toHaveCount(1)
  await page.getByRole('textbox',{name:'搜索工具名称',exact:true}).fill('calculate');await activityReady('view=original_page_v1&page=1&q=calculate',()=>page.getByRole('button',{name:'搜索',exact:true}).click());await activityReady('view=original_page_v1&page=1&q=calculate&status=success',()=>page.getByRole('combobox',{name:'筛选调用状态',exact:true}).selectOption('success'));await activityReady('view=original_page_v1&page=1&q=calculate&status=success&source=debug',()=>page.getByRole('combobox',{name:'筛选调用来源',exact:true}).selectOption('debug'));await expect(page.locator('section[aria-label="工具调用记录"]')).toContainText('1 / 2')
  phase='canonical_run_filter';await activityReady('view=original_page_v1&page=1&run_id='+receipt.run_id,()=>page.goto(f.browserOrigin+'/tool-hub?view=activity&runId='+receipt.run_id));await expect(page.getByText('当前运行：'+receipt.run_id,{exact:true})).toBeVisible();await expect(page.locator('section[aria-label="工具调用记录"] li')).toHaveCount(1);await page.screenshot({path:testInfo.outputPath('canonical-original-toolhub-activity-real-pg.png'),fullPage:true})
  phase='canonical_monitor';await page.locator('nav[aria-label="执行资源操作流程"] a[href*="view=monitor"]').click();await expect(page.getByRole('heading',{name:'运行状态与治理监控',exact:true})).toBeVisible();await expect(page.getByText('当前接口未提供状态',{exact:true})).toBeVisible()
  expect(traffic.filter(r=>r.view==='debug').every(r=>!r.path.includes('/tool-hub/stats')&&!r.path.includes('/tool-hub/harness')&&!r.path.includes('/tool-hub/invocations'))).toBe(true)
  expect(traffic.filter(r=>r.view==='activity').every(r=>!r.path.includes('/tool-connections')&&!r.path.includes('/original-ui/agent-specs')&&!r.path.includes('/tool-hub/harness'))).toBe(true)
  expect(traffic.filter(r=>r.view==='monitor').every(r=>!r.path.includes('/tool-connections')&&!r.path.includes('/original-ui/agent-specs')&&!r.path.includes('/tool-hub/invocations'))).toBe(true)
  phase='other_actual_employee';context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:375,height:950}});contexts.push(context);page=await context.newPage();attach(page);await login('bob',page);await expect(page.getByRole('heading',{name:'验证工具是否可执行',exact:true})).toBeVisible();await expect(page.getByText(new RegExp('^'+resources.http.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*'+String(resources.http.method||'POST').toUpperCase()+'$'))).toHaveCount(0);expect(await page.locator('body').innerText()).not.toContain(receipt.run_id);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  expect(exceptions).toEqual([]);expect(consoleErrors).toEqual([]);expect(failedRequests).toEqual([]);expect(badResponses).toEqual([]);expect(outside).toEqual([]);expect(Object.values(f.network).every(count=>count===0)).toBe(true)
 }catch(error){console.error('[canonical original ToolHub pending CI phase] '+phase);console.error('[original ToolHub bounded route/status] '+JSON.stringify(diagnostics.snapshot()));throw error}finally{diagnostics.dispose();for(const owned of contexts)await owned.close();await browser?.close();await f.close()}
})
