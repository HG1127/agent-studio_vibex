// AUTHORED/UNRUN. Actual canonical original main/App page; final provider DATA only.
import {test,expect,chromium} from '@playwright/test'
import {requireToolHubOriginalHomeCi} from '../services/pg-api/tests/helpers/tool-hub-original-home-guard.mjs'
test('original ToolHub reads real owner Home facade without hidden405 or browser exceptions',async({},testInfo)=>{
 requireToolHubOriginalHomeCi()
 const {startOriginalToolHubGenuineFixture}=await import('./helpers/pg-original-toolhub-genuine-fixture.mjs'),f=await startOriginalToolHubGenuineFixture()
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
  browser=await chromium.launch();context=await browser.newContext({ignoreHTTPSErrors:true});page=await context.newPage()
  page.on('pageerror',e=>exceptions.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}))
  page.on('response',r=>{const u=new URL(r.url());if(r.status()>=400)badResponses.push({path:u.pathname,status:r.status()});if(u.pathname==='/__pg_native/api/v2/original-ui/agent-specs')homeReads.push(r.status())})
  page.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==f.browserOrigin)outside.push(r.url())})
  await page.goto(f.browserOrigin+'/login?next=%2Ftool-hub');await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials.alice.email);await page.getByLabel('密码',{exact:true}).fill(f.credentials.alice.password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).toHaveURL(f.url)
  await expect(page.getByRole('heading',{name:'工具中心',exact:true})).toBeVisible();await expect(page.getByText(resources.http.name,{exact:true})).toBeVisible();await expect.poll(()=>homeReads.length).toBeGreaterThan(0)
  expect(homeReads.every(status=>status===200)).toBe(true);await page.screenshot({path:testInfo.outputPath('canonical-original-toolhub-real-home-read.png'),fullPage:true})
  expect(exceptions).toEqual([]);expect(consoleErrors).toEqual([]);expect(failedRequests).toEqual([]);expect(badResponses).toEqual([]);expect(outside).toEqual([]);expect(Object.values(f.network).every(count=>count===0)).toBe(true)
 }finally{await context?.close();await browser?.close();await f.close()}
})
