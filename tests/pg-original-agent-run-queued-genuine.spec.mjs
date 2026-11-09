import {test,expect} from '@playwright/test'
import {requireOriginalRunQueuedBrowserCi} from './helpers/pg-original-run-queued-browser-guard.mjs'
import {startOriginalRunQueuedBrowserFixture} from './helpers/pg-original-run-queued-browser-fixture.mjs'
import {originalQueuedBrowserSession} from './helpers/pg-original-run-queued-browser-actions.mjs'
test('actual original AgentRun queued read/cancel, complete owner models and real unavailable/403/401/owner/ACL privacy fences',async({},testInfo)=>{
 const permit=requireOriginalRunQueuedBrowserCi();expect(permit.story).toBe('original-agent-run-queued')
 const originalQueuedPhases=new Set(["fixture_enter","fixture_ready","queue_enter","queue_passed","cancel_enter","cancel_passed","identity_enter","identity_passed","feedback_enter","feedback_checkpoint_ready","feedback_history_enter","feedback_history_ready","feedback_draft_ready","feedback_headers_received","feedback_body_received","feedback_dialog_received","feedback_revocation_armed","feedback_click_returned","feedback_dialog_accepted","feedback_403_verified","feedback_private_hidden","feedback_no_receipt_verified","feedback_restored","feedback_passed","logout_enter","logout_passed","owner_acl_enter","owner_acl_passed","zero_enter","zero_passed","story_refused","cleanup_enter","cleanup_ready","artifact_enter","artifact_ready"])
 const observeOriginalQueuedPhase=stage=>{if(!originalQueuedPhases.has(stage))return;try{process.stderr.write(JSON.stringify({event:'original_queued_browser_phase',stage,observed_data_only:true,production_GO:false})+'\n')}catch{}}
 observeOriginalQueuedPhase('fixture_enter')
 const f=await startOriginalRunQueuedBrowserFixture();observeOriginalQueuedPhase('fixture_ready');let b,p,switchPage,primary,completed=false,admission,zero,aclProof,feedbackProof;const cleanup=[],steps={}
 const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 try{
  expect(f.backendProfile).toMatchObject({actual_F01_fixture:true,actual_global_selector:true,actual_four_engine_submit:true,actual_memory_context_audit:true,actual_model_selector_rows:61,Worker_ticks:0,extra_model_probes:0,production_GO:false})
  admission=await f.proveAdmission();b=await originalQueuedBrowserSession(f);p=await b.page()
  const alice=f.owned.alice,bob=f.owned.bob,aliceRun=alice.runs.agent_autonomous.run,bobRun=bob.runs.agent_autonomous.run
  const target=who=>'/agent-run?spec='+f.owned[who].parent.id+'&run='+f.owned[who].runs.agent_autonomous.run.id+'&engine_kind=agent_autonomous'
  const task=page=>page.locator('#agent-task-instruction'),feedback=page=>page.getByPlaceholder('补充一句话（可选）',{exact:false}),runButton=page=>page.locator('#agent-run-submit'),newTaskButton=page=>page.getByRole('button',{name:'发起新任务',exact:true})
  const settings=async(page,tab,read)=>{await page.getByRole('button',{name:'打开本次 Agent 配置',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Agent 配置与资源',exact:true});await expect(drawer).toBeVisible();await drawer.getByRole('tab',{name:tab,exact:true}).click();await read(drawer);await drawer.getByRole('button',{name:'返回试跑',exact:true}).click();await expect(drawer).toHaveCount(0)}
  const budget=async(page,value)=>settings(page,'执行预算',async drawer=>{await expect(drawer.locator('#max-steps')).toHaveValue(value)})
  const prepareNewTask=async(page,specId)=>{await expect(newTaskButton(page)).toBeEnabled();await newTaskButton(page).click();await expect(page.locator('#run-quick-spec')).toHaveValue(specId);await expect(task(page)).toBeVisible();await expect(page.getByRole('heading',{name:'任务指令',exact:true})).toBeVisible()}
  const selectHistory=async(page,run,specId)=>{const entry=page.getByRole('region',{name:'任务快速切换',exact:true}).getByRole('button').filter({hasText:run.instruction});await expect(entry).toHaveCount(1);await entry.click();await expect(entry).toHaveAttribute('aria-current','true');await expect(page.locator('#run-quick-spec')).toHaveValue(specId);await expect(task(page)).toHaveCount(0);await expect(page.getByRole('region',{name:'本次任务摘要',exact:true}).getByText(run.instruction,{exact:true}).first()).toBeVisible();await expect(page.getByRole('link',{name:'查看该任务完整记录',exact:true})).toHaveAttribute('href','/run-detail?run='+run.id)}
  const privateHidden=async page=>{await expect(task(page)).toHaveCount(0);await expect(runButton(page)).toHaveCount(0);await expect(newTaskButton(page)).toBeDisabled();await expect(page.locator('#run-quick-spec')).toHaveValue('');await expect(page.locator('#run-quick-spec')).toBeDisabled()}
  const draft='synthetic-queued-private-alice-local-task',comment='synthetic-queued-private-alice-feedback',bobDraft='synthetic-queued-private-bob-local-task';for(const value of [draft,comment,bobDraft])b.secrets.add(value)
  await test.step('original index/App route uses61 actual owned models, including the ready binding on page2; existing queued task is read without execution',async()=>{
   observeOriginalQueuedPhase('queue_enter')
   await b.login(p,'alice',target('alice'));await expect(p.getByRole('heading',{name:'试跑与结果',exact:true})).toBeVisible();await expect(p.locator('#run-quick-spec')).toHaveValue(alice.parent.id);await expect(task(p)).toHaveCount(0);await expect(newTaskButton(p)).toBeDisabled()
   const binding=alice.parent.spec.model_binding;await settings(p,'模型与工具',async drawer=>{await expect(drawer.locator('#spec-select')).toHaveValue(alice.parent.id);await expect(drawer.locator('#model-select')).toHaveValue('custom:'+binding.connection_id+':'+binding.model_id)})
   expect(f.observations.paging_requests).toBeGreaterThanOrEqual(2);expect(f.observations.paging_complete_responses).toBeGreaterThan(0);expect(f.observations.partial_model_reads).toBe(0)
   expect(await f.runState('alice',aliceRun.id)).toMatchObject({status:'queued',step_count:0,actual_owner_verified:true});await expect(p.getByRole('button',{name:'取消任务',exact:true})).toBeEnabled();steps.original_parent_actual_queue_and_complete_models=true;observeOriginalQueuedPhase('queue_passed')
  })
  await test.step('real cancel commits behind lost reply; existing original cancel control reads the same terminal task without resending cancellation',async()=>{
   observeOriginalQueuedPhase('cancel_enter')
   const failed=b.controlDisconnect(p,'/api/v2/agent-autonomous-runs/'+aliceRun.id+'/cancel'),dropped=f.dropNextActualCancelReply(aliceRun.id,'agent_autonomous'),dialog=b.expectedDialog(p,'confirm','取消本人任务')
   const terminalRead=p.waitForResponse(async response=>new URL(response.url()).pathname==='/__pg_native/api/v2/agent-autonomous-runs/'+aliceRun.id&&response.request().method()==='GET'&&response.status()===200&&(await response.json()).run?.status==='cancelled');void terminalRead.catch(()=>{})
   await p.getByRole('button',{name:'取消任务',exact:true}).click();await dialog;expect((await dropped.entered()).actual_committed_status).toBe(200);expect(await dropped.clientClosed()).toMatchObject({actual_proxy_response_closed:true,actual_socket_destroyed:true});expect(await failed.failed()).toMatchObject({actual_requestfailed:true,same_original_request:true})
   // Unknown cancel suspends automatic polling. The existing cancel control
   // enters the pendingMutation read-only branch and never resends the POST.
   await expect(p.getByRole('button',{name:'取消任务',exact:true})).toBeEnabled();await p.getByRole('button',{name:'取消任务',exact:true}).click()
   expect((await terminalRead).status()).toBe(200);expect((await (await terminalRead).json()).run).toMatchObject({id:aliceRun.id,owner_user_id:f.users.alice,status:'cancelled'});await expect(p.getByText('已取消',{exact:true}).first()).toBeVisible();await expect(p.getByRole('button',{name:'取消任务',exact:true})).toHaveCount(0)
   expect(f.observations.control_posts.filter(v=>v.path.endsWith('/'+aliceRun.id+'/cancel'))).toHaveLength(1);expect((await f.runState('alice',aliceRun.id)).status).toBe('cancelled');steps.original_unknown_cancel_only_reads=true;await prepareNewTask(p,alice.parent.id);await expect(task(p)).toHaveValue('');steps.original_cancelled_page_can_prepare_new_task=true;observeOriginalQueuedPhase('cancel_passed')
  })
  await test.step('real identity response loss hides local drafts and disables fresh actions; same verified owner may recover unsubmitted task/budget',async()=>{
   observeOriginalQueuedPhase('identity_enter')
   await task(p).fill(draft);await settings(p,'执行预算',async drawer=>{const limit=drawer.locator('#max-steps');await expect(limit).toBeEnabled();await limit.focus();await limit.press('End');for(let i=0;i<3;i++)await limit.press('ArrowLeft');await expect(limit).toHaveValue('27')})
   const identityFailed=b.identityDisconnect(p),identityDrop=f.dropNextActualIdentity(f.users.alice);await b.focus(p);expect(await identityDrop.done()).toMatchObject({status:200,forwarded_body_bytes:1,write_callback_confirmed:true,before_client_deadline:true,actual_native_me_verified:true,expected_employee:f.users.alice,actual_proxy_response_closed:true,actual_socket_destroyed:true});expect(await identityFailed.failed()).toEqual({actual_requestfailed:true,same_original_get:true});await privateHidden(p);await budget(p,'10')
   expect(f.observations.controlled_identity_drops).toBe(1);await b.focus(p);await expect(task(p)).toHaveValue(draft);await budget(p,'27')
   await task(p).fill('');await b.image('original-agent-run-queued-alice-restored.png',p);steps.actual_unavailable_hides_and_same_owner_recovers=true;observeOriginalQueuedPhase('identity_passed')
  })
  await test.step('actual feedback permission is withdrawn through the real selector at the original POST after fresh review; true403 writes no receipt and hides every local private field',async()=>{
   observeOriginalQueuedPhase('feedback_enter')
   const checkpoint=await f.feedbackCheckpoint();observeOriginalQueuedPhase('feedback_checkpoint_ready');await task(p).fill(draft);observeOriginalQueuedPhase('feedback_history_enter');await selectHistory(p,aliceRun,alice.parent.id);observeOriginalQueuedPhase('feedback_history_ready');await p.getByRole('tab',{name:'成果与反馈',exact:true}).click();await p.getByRole('button',{name:'结果不错',exact:true}).click();await feedback(p).fill(comment);observeOriginalQueuedPhase('feedback_draft_ready')
    // Begin reading the original response at its event, before the page can navigate.
    const response=b.wire(p,'/api/v2/agent-feedback/'+aliceRun.id+'/change','POST').then(async reply=>{observeOriginalQueuedPhase('feedback_headers_received');const status=reply.status(),body=await reply.json();observeOriginalQueuedPhase('feedback_body_received');return{status,body}}),dialog=b.expectedDialog(p,'confirm','保存本人对此运行的评价',async()=>{observeOriginalQueuedPhase('feedback_dialog_received');await f.armFeedbackRevocationAtOriginalSubmit(aliceRun.id);observeOriginalQueuedPhase('feedback_revocation_armed')});void response.catch(()=>{})
    await p.getByRole('button',{name:'提交反馈',exact:true}).click();observeOriginalQueuedPhase('feedback_click_returned');await dialog;observeOriginalQueuedPhase('feedback_dialog_accepted');const denied=await response;expect(denied.status).toBe(403);expect(denied.body.error).toBe('agent_feedback_submission_disabled');observeOriginalQueuedPhase('feedback_403_verified')
   await privateHidden(p);observeOriginalQueuedPhase('feedback_private_hidden');await expect(feedback(p)).toHaveCount(0);expect(f.observations.controlled_feedback403).toBe(1);feedbackProof=await f.feedbackUnchanged(checkpoint);observeOriginalQueuedPhase('feedback_no_receipt_verified')
   const before=f.observations.feedback_posts.length;await expect(task(p)).toHaveCount(0);await expect(newTaskButton(p)).toBeDisabled();await settings(p,'执行预算',async drawer=>{const limit=drawer.locator('#max-steps');await limit.focus();await limit.press('End');await expect(limit).toHaveValue('10')});expect(f.observations.feedback_posts).toHaveLength(before)
   f.restoreFeedbackSubmission();await b.focus(p);await expect(task(p)).toHaveCount(0);await expect(feedback(p)).toHaveValue(comment);await budget(p,'27');expect(f.observations.feedback_posts).toHaveLength(1);observeOriginalQueuedPhase('feedback_restored');await prepareNewTask(p,alice.parent.id);await expect(task(p)).toHaveValue('');await task(p).fill(draft);steps.actual_selector_revocation403_and_no_receipt=true;observeOriginalQueuedPhase('feedback_passed')
  })
  await test.step('real shared Cookie logout produces401, clears local drafts, and a later same-owner login cannot resurrect owner-cleared input',async()=>{
   observeOriginalQueuedPhase('logout_enter')
   switchPage=await b.page();await switchPage.goto(f.origin+target('alice'),{waitUntil:'domcontentloaded'});await expect(switchPage.locator('#run-quick-spec')).toHaveValue(alice.parent.id)
   const before=f.observations.actual_signed_out401;await b.logout(switchPage,'alice');await b.focus(p);await privateHidden(p);await budget(p,'10');expect(f.observations.actual_signed_out401).toBeGreaterThan(before)
   await b.login(switchPage,'alice',target('alice'));await b.focus(p);await expect(task(p)).toHaveValue('');await budget(p,'10');await expect(runButton(p)).toBeDisabled();steps.real401_and_owner_clear=true;observeOriginalQueuedPhase('logout_passed')
  })
  await test.step('actual Cookie switches to Bob; old Alice controller stays hidden and Bob queued source invalidates after a real KB ACL revoke through its actual admission memory receipt',async()=>{
   observeOriginalQueuedPhase('owner_acl_enter')
   await b.logout(switchPage,'alice');await b.login(switchPage,'bob','/agent-run?spec='+bob.parent.id);await b.focus(p);await expect(task(p)).toHaveCount(0);await expect(runButton(p)).toHaveCount(0);await expect(p.getByText(draft,{exact:false})).toHaveCount(0)
   await b.focus(switchPage);await expect(switchPage.locator('#run-quick-spec')).toHaveValue(bob.parent.id);await prepareNewTask(switchPage,bob.parent.id);await task(switchPage).fill(bobDraft);await selectHistory(switchPage,bobRun,bob.parent.id)
   const unavailable=switchPage.waitForResponse(async r=>new URL(r.url()).pathname==='/__pg_native/api/v2/agent-autonomous-runs/'+bobRun.id&&r.status()===200&&(await r.json()).knowledge_outputs_available===false)
   aclProof=await f.revokeKnowledge();await unavailable;await privateHidden(switchPage);await expect(switchPage.locator('#run-quick-spec')).toHaveValue('')
   await expect(switchPage.getByText(bobDraft,{exact:false})).toHaveCount(0);await b.image('original-agent-run-queued-bob-acl-hidden.png',switchPage);steps.real_owner_and_actual_source_acl_fence=true;observeOriginalQueuedPhase('owner_acl_passed')
  })
  observeOriginalQueuedPhase('zero_enter')
  await b.legacy.flush(p);await b.legacy.flush(switchPage);zero=await b.zeros();expect(b.images).toHaveLength(2);expect(f.observations.control_posts).toHaveLength(1);expect(f.observations.feedback_posts).toHaveLength(1);completed=true;observeOriginalQueuedPhase('zero_passed')
 }catch(error){observeOriginalQueuedPhase('story_refused');primary=error}
 finally{
  observeOriginalQueuedPhase('cleanup_enter')
  if(b)await clean('actual_browser_close',()=>b.close());await clean('actual_fixture_close',()=>f.close());if(b)await clean('all_zero_after_cleanup',async()=>{zero=await b.zeros();expect(f.finalOwnerAudit()).toBe(true)})
  observeOriginalQueuedPhase('cleanup_ready');observeOriginalQueuedPhase('artifact_enter')
  if(b)await b.writeAfterCleanup(testInfo,completed,primary,cleanup,{story:permit.story,head:permit.head,scope:'original employee App queued read/control/privacy, no execution',steps,actual_backend:f.backendProfile,actual_build:f.provenance,http:f.observations,admission:admission??null,feedback:feedbackProof??null,actual_acl:aclProof??null,zero:zero??null,final_actual_owner_audit:f.finalOwnerAudit(),contract_gaps:['No generated output or model/provider compatibility acceptance.','Original parent question/plan controls remain unmounted; no fabricated waiting-input state.','Safe Agent submission has no separate submit audit contract.','Cancel has no exact operation-specific confirmation endpoint; actual lost original response was observed by host, UI recovery only reads terminal state.','No complete run-history pagination/timeline/historical-title/temporary-override acceptance.'],full_parent_page_complete:false,provider_network_acceptance:false,production_GO:false})
   observeOriginalQueuedPhase('artifact_ready')
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup.map(v=>v.error)],'original_parent_queued_story_and_cleanup_failed');if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup.map(v=>v.error),'original_parent_queued_cleanup_failed')
})
