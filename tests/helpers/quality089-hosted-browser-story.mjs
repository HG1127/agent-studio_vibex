
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
export async function quality089HostedBrowserStory(f){
 assert.equal(f.permit.suite,'worker-browser');assert(f.dispatch)
 const [{chromium,expect},actions]=await Promise.all([import('@playwright/test'),import('./pg-original-version-release-completion-browser-actions.mjs')])
 const browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+f.spki]}),context=await browser.newContext({viewport:{width:1360,height:1000},serviceWorkers:'block'}),outside=[],posts=[],receipts=[]
 let page,ws=0
 const wire=(path,method)=>page.waitForResponse(r=>new URL(r.url()).origin===f.origin&&new URL(r.url()).pathname==='/__pg_native'+path&&r.request().method()===method)
 const qualityPath='/api/v2/original-ui/agent-quality/'+f.specId,releasePath='/api/v2/original-ui/agent-releases/'+f.specId
 const settle=async()=>{await expect(page.getByRole('heading',{name:'发布流水线',exact:true})).toBeVisible();await expect(page.locator('#vr-spec-select')).toHaveValue(f.specId);await expect(page.getByRole('button',{name:'刷新版本',exact:true})).toBeEnabled()}
 const goQuality=async()=>{await page.goto(f.origin+'/agent-run?spec='+f.specId);await expect(page.getByRole('tab',{name:'成果与反馈',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:/^执行过程/})).toBeVisible();await page.getByRole('tab',{name:'验收条件',exact:true}).click();return page.getByRole('region',{name:'可验证的运行质量断言',exact:true})}
 const finish=async run=>{
  const record={known:[]}
  await f.tickUntilStatus(run,'awaiting_approval');await page.goto(f.origin+'/run-detail?run='+run+'&kind=agent_autonomous')
  await actions.approveOriginalStep(page,f,run,'启动当前助手',{record})
  await f.tickUntilStatus(run,'awaiting_approval');await actions.approveOriginalStep(page,f,run,'模型调用',{record})
  await f.tickUntilStatus(run,'awaiting_input');await actions.replyOriginalInput(page,f,run,true,{record})
  await f.tickUntilStatus(run,'awaiting_approval');await actions.approveOriginalStep(page,f,run,'模型调用',{record})
  await f.tickUntilStatus(run,'awaiting_input');await actions.replyOriginalInput(page,f,run,false,{record})
  await f.tickUntilStatus(run,'awaiting_approval');await actions.approveOriginalStep(page,f,run,'模型调用',{record})
  await f.tickUntilStatus(run,'awaiting_approval');await actions.approveOriginalStep(page,f,run,'工具调用',{record})
  await f.tickUntilStatus(run,'awaiting_approval');await actions.approveOriginalStep(page,f,run,'模型调用',{record})
  await f.tickUntilStatus(run,'succeeded');return record
 }
 const register=async n=>{await page.goto(f.origin+'/version-release?spec='+f.specId);await settle();await page.getByLabel('本次 Agent 验收测试指令',{exact:true}).fill('Release completion source '+f.sourceNonce+' iteration '+n);const fee=page.getByRole('checkbox',{name:/我确认创建验收任务/}),button=page.getByRole('button',{name:'运行测试',exact:true});await expect(button).toBeDisabled();await fee.check();const response=wire(releasePath+'/acceptance','POST');await button.click();const actual=await response;expect(actual.status()).toBe(200);return(await actual.json()).item.run_id}
 try{
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==f.origin){outside.push('outside_origin');await route.abort()}else await route.continue()})
  await context.routeWebSocket('**/*',socket=>{ws++;socket.close()})
  page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000)
  page.on('request',r=>{if(new URL(r.url()).pathname==='/__pg_native'+qualityPath&&r.method()==='POST')posts.push(r.postDataJSON());if(new URL(r.url()).pathname.startsWith('/__pg_native'+qualityPath+'/receipts/')&&r.method()==='GET')receipts.push(r.url())})
  await page.goto(f.origin+'/login?next='+encodeURIComponent('/agent-run?spec='+f.specId))
  await page.getByRole('textbox',{name:'工作邮箱',exact:true}).fill(f.credentials.alice.email);await page.getByLabel('密码',{exact:true}).fill(f.credentials.alice.password)
  const login=wire('/api/native-auth/login','POST');await page.getByRole('button',{name:'登录',exact:true}).click();expect((await login).status()).toBe(200)
  const browserCookies=(await context.cookies(f.origin)).filter(c=>c.name==='__Host-agentstudio_session');expect(browserCookies).toHaveLength(1);expect(browserCookies[0]).toMatchObject({httpOnly:true,secure:true,sameSite:'Strict',path:'/',domain:'localhost'})
  let card=await goQuality();await card.getByRole('button',{name:'添加断言',exact:true}).click()
  const field=()=>card.getByPlaceholder('例如：风险提示 / 核心结论',{exact:true})
  await field().fill(' exact literal condition ');const known=wire(qualityPath,'POST');await card.getByRole('button',{name:'保存检查条件',exact:true}).click();const actual=await known;expect(actual.status()).toBe(200);const first=(await actual.json()).item;expect(first.after.checks).toEqual([{type:'contains',expected:' exact literal condition '}]);await f.assertQualityReceiptAndOwnerAudit(first)
  await field().fill('Never generated forbidden condition');await f.dropNextActualQualityReply()
  const failed=page.waitForEvent('requestfailed',{predicate:r=>new URL(r.url()).pathname==='/__pg_native'+qualityPath&&r.method()==='POST'});void failed.catch(()=>{})
  await card.getByRole('button',{name:'保存检查条件',exact:true}).click();expect((await failed).failure()).toBeTruthy()
  await expect.poll(()=>f.observations.committed_losses.length).toBe(1)
  const markerKey='agentstudio.original.quality.v1.'+f.employeeId+'.'+f.specId
  const marker=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),markerKey);expect(Object.keys(marker).sort()).toEqual(['protocol','employee_id','spec_id','request_id','request_sha256','expected_spec_revision','expected_source_sha256','expected_checks_sha256'].sort());expect(JSON.stringify(marker)).not.toContain('Never generated')
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('tab',{name:'验收条件',exact:true}).click();card=page.getByRole('region',{name:'可验证的运行质量断言',exact:true})
  const before=await f.counts(),postCount=posts.length;const recovered=wire(qualityPath+'/receipts/'+marker.request_id,'GET');await card.getByRole('button',{name:'核对原保存结果（不重发）',exact:true}).click();expect((await recovered).status()).toBe(200);expect(posts.length).toBe(postCount);expect(await f.counts()).toEqual(before);await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),markerKey)).toBe(null)
  const latest=card.getByRole('button',{name:'读取最新检查条件',exact:true});if(await latest.isVisible())await latest.click();await expect(field()).toHaveValue('Never generated forbidden condition');expect(posts).toHaveLength(2);expect(receipts).toHaveLength(1)
  // First genuine Worker succeeds, while nonmatching quality cannot be overridden by an untested acknowledgement.
  const failedQualityRun=await register(1);const firstInteractions=await finish(failedQualityRun),failedProof=await f.actualRunProof(failedQualityRun,{qualityPassed:false})
  const w=await f.releases.workspace(f.identities.alice,f.specId,f.employeeId),snapshot=await f.request('alice',releasePath+'/change','POST',{action:'snapshot',request_id:randomUUID(),expected_spec_revision:w.spec_revision,source_sha256:w.source_sha256,note:'Synthetic nonmatching quality release',test_run_id:null});expect(snapshot.status).toBe(200)
  const version=await f.releases.detail(f.identities.alice,f.specId,snapshot.body.item.version_id,f.employeeId),current=await f.releases.workspace(f.identities.alice,f.specId,f.employeeId),blocked=await f.request('alice',releasePath+'/change','POST',{action:'publish',request_id:randomUUID(),expected_spec_revision:current.spec_revision,source_sha256:current.source_sha256,version_id:version.id,version_sha256:version.version_sha256,expected_version_revision:version.revision,expected_release_revision:current.release_revision,confirm:true,acknowledge_untested:true});expect(blocked.status).toBe(409)
  card=await goQuality();await field().fill('Synthetic completed release result ');const changed=wire(qualityPath,'POST');await card.getByRole('button',{name:'保存检查条件',exact:true}).click();expect((await changed).status()).toBe(200)
  const run=await register(2);expect(run).not.toBe(failedQualityRun);const secondInteractions=await finish(run),proof=await f.actualRunProof(run)
  await page.goto(f.origin+'/version-release?spec='+f.specId+'&testRun='+run);await settle();await expect(page.getByText('验收测试通过',{exact:true})).toBeVisible()
  await page.getByPlaceholder('版本备注（可选）：这一版改了什么、为什么存',{exact:true}).fill('Synthetic actual Worker quality-passed version')
  const save=wire(releasePath+'/change','POST');await page.getByRole('button',{name:'保存版本',exact:true}).click();const saved=await save;expect(saved.status()).toBe(200);const item=(await saved.json()).item
  const {releaseReview}=await import('./pg-original-version-release-browser-actions.mjs'),review=await releaseReview(page,item.version_no,'publish')
  await expect(review.dialog.getByText('此版本未取得当前有效验收证明，我已核对完整配置并确认继续发布。',{exact:true})).toHaveCount(0)
  const publish=wire(releasePath+'/change','POST');await review.button.click();expect((await publish).status()).toBe(200);await expect(page.getByText('当前发布：v'+item.version_no,{exact:true})).toBeVisible()
  const rows=(await f.db.query("SELECT v.test_passed,v.test_run_id,v.status,q.checks_sha256,q.checks FROM agentstudio.agent_release_versions v JOIN agentstudio.agent_quality089_versions m ON m.version_id=v.id JOIN agentstudio.agent_quality089_revisions q ON q.spec_id=m.spec_id AND q.owner_user_id=m.owner_user_id AND q.spec_revision=m.spec_revision WHERE v.id=$1::uuid AND v.owner_user_id=$2::uuid",[item.version_id,f.employeeId])).rows;expect(rows).toHaveLength(1);expect(rows[0].test_passed).toBe(true);expect(rows[0].test_run_id).toBe(run);expect(rows[0].status).toBe('published');expect(rows[0].checks).toEqual([{type:'contains',expected:'Synthetic completed release result '}])
  const publishAudits=(await f.db.query("SELECT owner_user_id,actor_user_id,result,metadata FROM agentstudio.audit_events WHERE owner_user_id=$1::uuid AND actor_user_id=$1::uuid AND target_kind='agent_spec' AND target_id=$2 AND action='agent.release.publish'",[f.employeeId,f.specId])).rows;expect(publishAudits).toHaveLength(1);expect(publishAudits[0].result).toBe('succeeded');expect(publishAudits[0].metadata.version_id).toBe(item.version_id);expect(publishAudits[0].metadata.test_passed_at_save).toBe(true);expect(publishAudits[0].metadata.acknowledge_untested).toBe(false)

  expect(outside).toEqual([]);expect(ws).toBe(0);expect(f.observations.legacy_requests).toBe(0);expect(posts).toHaveLength(3);const bounds=await f.dispatch.bounds();expect(bounds).toMatchObject({synthetic_model_calls:8,synthetic_tool_calls:2,synthetic_probe_calls:1,external_provider_contacts:0})
  return {actual_original_AgentRun_tabs:['成果与反馈','执行过程','验收条件'],actual_browser_Cookie:true,actual_commit_disconnect:true,receipt_GETs:1,quality_POSTs:3,POST_replays:0,failed_quality_run:failedProof,untested_ack_failed_quality_refused:true,successful_quality_run:proof,actual_original_version_page_tested_publication:true,actual_version_quality_manifest:true,original_decision_receipts:firstInteractions.known.length+secondInteractions.known.length,bounds,production_GO:false}
 }finally{await context.close();await browser.close()}
}
