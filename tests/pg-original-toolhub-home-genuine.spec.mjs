// AUTHORED/UNRUN. Actual canonical original main/App page; final provider DATA only.
import {test,expect,chromium} from '@playwright/test'
import {requireToolHubOriginalHomeCi} from '../services/pg-api/tests/helpers/tool-hub-original-home-guard.mjs'
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

test('original ToolHub reads real owner Home facade without hidden405 or browser exceptions',async({},testInfo)=>{
 requireToolHubOriginalHomeCi()
 const {startOriginalToolHubGenuineFixture}=await import('./helpers/pg-original-toolhub-genuine-fixture.mjs'),f=await startOriginalToolHubGenuineFixture()
 let diagnosticPhase='login';const diagnostics=createOriginalToolHubBoundedDiagnostics({origin:f.browserOrigin,getPhase:()=>diagnosticPhase})
 let browser,context,page;const exceptions=[],consoleErrors=[],failedRequests=[],badResponses=[],outside=[],homeReads=[]
 try{
  expect(f.originalHomeReadOnly).toBe(true)
  const alice=f.resources.alice.spec,bob=f.resources.bob.spec,resources=await f.prepareResources('alice')
  for(const who of ['alice','bob']){const list=await f.request(who,'/api/v2/original-ui/agent-specs?limit=50');expect(list.status).toBe(200);expect(list.headers['cache-control']).toBe('no-store');expect(list.body.items.some(row=>row.id===f.resources[who].spec.id)).toBe(true);expect(list.body.items.every(row=>row.owner_user_id===f.users[who])).toBe(true)}
  expect((await f.request('alice','/api/v2/original-ui/agent-specs/'+bob.id)).status).toBe(404)
  expect((await f.request('bob','/api/v2/original-ui/agent-specs/'+alice.id)).status).toBe(404)
  expect((await f.raw(f.nativeOrigin+'/api/v2/original-ui/agent-specs?limit=50')).status).toBe(401)
  expect((await f.request('alice','/api/v2/original-ui/agent-specs',{})).status).toBe(405)
  const installed=(await f.db.query("SELECT version FROM agentstudio.schema_migrations WHERE version IN('pg_v9_066','pg_v9_067','pg_v9_068','pg_v9_070','pg_v9_071','pg_v9_072','pg_v9_089') ORDER BY version")).rows.map(row=>row.version);expect(installed).toEqual(['pg_v9_066','pg_v9_068','pg_v9_070'])
  browser=await chromium.launch();context=await browser.newContext({ignoreHTTPSErrors:true});page=await context.newPage();diagnostics.attach(page)
  page.on('pageerror',e=>exceptions.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}))
  page.on('response',r=>{const u=new URL(r.url());if(r.status()>=400)badResponses.push({path:u.pathname,status:r.status()});if(u.pathname==='/__pg_native/api/v2/original-ui/agent-specs')homeReads.push(r.status())})
  page.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==f.browserOrigin)outside.push(r.url())})
  await page.goto(f.browserOrigin+'/login?next=%2Ftool-hub%3Fview%3Ddebug');await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials.alice.email);await page.getByLabel('密码',{exact:true}).fill(f.credentials.alice.password);await page.getByRole('button',{name:'登录',exact:true}).click();diagnosticPhase='post_login';await expect(page).toHaveURL(f.url)
  await expect(page.getByRole('heading',{name:'验证工具是否可执行',exact:true})).toBeVisible();await expect(page.getByText(new RegExp('^'+resources.http.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*'+String(resources.http.method||'POST').toUpperCase()+'$'))).toBeVisible();await expect.poll(()=>homeReads.length).toBeGreaterThan(0)
  expect(homeReads.every(status=>status===200)).toBe(true);await page.screenshot({path:testInfo.outputPath('canonical-original-toolhub-real-home-read.png'),fullPage:true})
  expect(exceptions).toEqual([]);expect(consoleErrors).toEqual([]);expect(failedRequests).toEqual([]);expect(badResponses).toEqual([]);expect(outside).toEqual([]);expect(Object.values(f.network).every(count=>count===0)).toBe(true)
 }catch(error){console.error('[original Home bounded route/status] '+JSON.stringify(diagnostics.snapshot()));throw error}finally{diagnostics.dispose();await context?.close();await browser?.close();await f.close()}
})
