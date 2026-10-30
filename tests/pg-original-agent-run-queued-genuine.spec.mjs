import {test,expect} from '@playwright/test'
import {requireOriginalRunQueuedBrowserCi} from './helpers/pg-original-run-queued-browser-guard.mjs'
import {startOriginalRunQueuedBrowserFixture} from './helpers/pg-original-run-queued-browser-fixture.mjs'
import {originalQueuedBrowserSession} from './helpers/pg-original-run-queued-browser-actions.mjs'
test('actual original AgentRun queued read/cancel, complete owner models and real unavailable/403/401/owner/ACL privacy fences',async({},testInfo)=>{
 const permit=requireOriginalRunQueuedBrowserCi();expect(permit.story).toBe('original-agent-run-queued')
 const f=await startOriginalRunQueuedBrowserFixture();let b,p,switchPage,primary,completed=false,admission,zero,aclProof,feedbackProof;const cleanup=[],steps={}
 const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 try{
  expect(f.backendProfile).toMatchObject({actual_F01_fixture:true,actual_global_selector:true,actual_four_engine_submit:true,actual_memory_context_audit:true,actual_model_selector_rows:61,Worker_ticks:0,extra_model_probes:0,production_GO:false})
  admission=await f.proveAdmission();b=await originalQueuedBrowserSession(f);p=await b.page()
  const alice=f.owned.alice,bob=f.owned.bob,aliceRun=alice.runs.agent_autonomous.run,bobRun=bob.runs.agent_autonomous.run
  const target=who=>'/agent-run?spec='+f.owned[who].parent.id+'&run='+f.owned[who].runs.agent_autonomous.run.id+'&engine_kind=agent_autonomous'
  const task=page=>page.getByPlaceholder('给助手下达一个具体任务',{exact:false}),feedback=page=>page.getByPlaceholder('补充一句话（可选）',{exact:false}),runButton=page=>page.getByRole('button',{name:/^(运行|创建中…)$/})
  const draft='synthetic-queued-private-alice-local-task',comment='synthetic-queued-private-alice-feedback',bobDraft='synthetic-queued-private-bob-local-task';for(const value of [draft,comment,bobDraft])b.secrets.add(value)
  await test.step('original index/App route uses61 actual owned models, including the ready binding on page2; existing queued task is read without execution',async()=>{
   await b.login(p,'alice',target('alice'));await expect(p.getByRole('heading',{name:'任务指令',exact:true})).toBeVisible();await expect(p.locator('#spec-select')).toHaveValue(alice.parent.id)
   const binding=alice.parent.spec.model_binding;await expect(p.locator('#model-select')).toHaveValue('custom:'+binding.connection_id+':'+binding.model_id)
   expect(f.observations.paging_requests).toBeGreaterThanOrEqual(2);expect(f.observations.paging_complete_responses).toBeGreaterThan(0);expect(f.observations.partial_model_reads).toBe(0)
   expect(await f.runState('alice',aliceRun.id)).toMatchObject({status:'queued',step_count:0,actual_owner_verified:true});await expect(p.getByRole('button',{name:'取消',exact:true})).toBeEnabled();steps.original_parent_actual_queue_and_complete_models=true
  })
  await test.step('real cancel commits behind lost reply; second original action only reads the same task and does not resend cancellation',async()=>{
   const failed=b.controlDisconnect(p,'/api/v2/agent-autonomous-runs/'+aliceRun.id+'/cancel'),dropped=f.dropNextActualCancelReply(aliceRun.id,'agent_autonomous'),dialog=b.expectedDialog(p,'confirm','取消本人任务')
   await p.getByRole('button',{name:'取消',exact:true}).click();await dialog;expect((await dropped.entered()).actual_committed_status).toBe(200);expect(await dropped.clientClosed()).toMatchObject({actual_proxy_response_closed:true,actual_socket_destroyed:true});expect(await failed.failed()).toMatchObject({actual_requestfailed:true,same_original_request:true})
   await expect(p.getByRole('button',{name:'取消',exact:true})).toBeEnabled();const read=b.wire(p,'/api/v2/agent-autonomous-runs/'+aliceRun.id)
   await p.getByRole('button',{name:'取消',exact:true}).click();expect((await read).status()).toBe(200);await expect(p.getByText('已取消',{exact:true}).first()).toBeVisible()
   expect(f.observations.control_posts.filter(v=>v.path.endsWith('/'+aliceRun.id+'/cancel'))).toHaveLength(1);expect((await f.runState('alice',aliceRun.id)).status).toBe('cancelled');steps.original_unknown_cancel_only_reads=true
  })
  await test.step('real identity response loss hides local drafts and disables fresh actions; same verified owner may recover unsubmitted task/budget',async()=>{
   await task(p).fill(draft);await expect(p.locator('#max-steps')).toBeEnabled();await p.locator('#max-steps').focus();await p.locator('#max-steps').press('End');for(let i=0;i<3;i++)await p.locator('#max-steps').press('ArrowLeft');await expect(p.locator('#max-steps')).toHaveValue('27')
   f.dropNextActualIdentity();await b.focus(p);await expect(task(p)).toHaveValue('');await expect(p.locator('#max-steps')).toHaveValue('10');await expect(runButton(p)).toBeDisabled()
   expect(f.observations.controlled_identity_drops).toBe(1);await b.focus(p);await expect(task(p)).toHaveValue(draft);await expect(p.locator('#max-steps')).toHaveValue('27')
   await task(p).fill('');await b.image('original-agent-run-queued-alice-restored.png',p);steps.actual_unavailable_hides_and_same_owner_recovers=true
  })
  await test.step('actual feedback permission is withdrawn through the real selector after original confirmation opens; true403 writes no receipt and hides every local private field',async()=>{
   const checkpoint=await f.feedbackCheckpoint();await task(p).fill(draft);await p.getByRole('button',{name:'结果不错',exact:true}).click();await feedback(p).fill(comment)
   const response=b.wire(p,'/api/v2/agent-feedback/'+aliceRun.id+'/change','POST'),dialog=b.expectedDialog(p,'confirm','保存本人对此运行的评价',async()=>f.revokeFeedbackBeforeOriginalSubmit(aliceRun.id))
   await p.getByRole('button',{name:'提交反馈',exact:true}).click();await dialog;const denied=await response;expect(denied.status()).toBe(403);expect((await denied.json()).error).toBe('agent_feedback_submission_disabled')
   await expect(task(p)).toHaveValue('');await expect(feedback(p)).toHaveCount(0);await expect(runButton(p)).toBeDisabled();expect(f.observations.controlled_feedback403).toBe(1);feedbackProof=await f.feedbackUnchanged(checkpoint)
   const before=f.observations.feedback_posts.length;await task(p).fill('synthetic-queued-private-ignored');await expect(task(p)).toHaveValue('');expect(f.observations.feedback_posts).toHaveLength(before)
   f.restoreFeedbackSubmission();await b.focus(p);await expect(task(p)).toHaveValue(draft);expect(f.observations.feedback_posts).toHaveLength(1);steps.actual_selector_revocation403_and_no_receipt=true
  })
  await test.step('real shared Cookie logout produces401, clears local drafts, and a later same-owner login cannot resurrect owner-cleared input',async()=>{
   switchPage=await b.page();await switchPage.goto(f.origin+target('alice'),{waitUntil:'domcontentloaded'});await expect(switchPage.locator('#spec-select')).toHaveValue(alice.parent.id)
   const before=f.observations.actual_signed_out401;await b.logout(switchPage,'alice');await b.focus(p);await expect(task(p)).toHaveValue('');await expect(p.locator('#max-steps')).toHaveValue('10');await expect(runButton(p)).toBeDisabled();expect(f.observations.actual_signed_out401).toBeGreaterThan(before)
   await b.login(switchPage,'alice',target('alice'));await b.focus(p);await expect(task(p)).toHaveValue('');await expect(p.locator('#max-steps')).toHaveValue('10');steps.real401_and_owner_clear=true
  })
  await test.step('actual Cookie switches to Bob; old Alice controller stays hidden and Bob queued source invalidates after a real KB ACL revoke through its actual admission memory receipt',async()=>{
   await b.logout(switchPage,'alice');await b.login(switchPage,'bob',target('bob'));await b.focus(p);await expect(task(p)).toHaveValue('');await expect(runButton(p)).toBeDisabled();await expect(p.getByText(draft,{exact:false})).toHaveCount(0)
   await b.focus(switchPage);await expect(switchPage.locator('#spec-select')).toHaveValue(bob.parent.id);await task(switchPage).fill(bobDraft)
   const unavailable=switchPage.waitForResponse(async r=>new URL(r.url()).pathname==='/__pg_native/api/v2/agent-autonomous-runs/'+bobRun.id&&r.status()===200&&(await r.json()).knowledge_outputs_available===false)
   aclProof=await f.revokeKnowledge();await unavailable;await expect(task(switchPage)).toHaveValue('');await expect(runButton(switchPage)).toBeDisabled();await expect(switchPage.locator('#spec-select')).toHaveValue('')
   await expect(switchPage.getByText(bobDraft,{exact:false})).toHaveCount(0);await b.image('original-agent-run-queued-bob-acl-hidden.png',switchPage);steps.real_owner_and_actual_source_acl_fence=true
  })
  await b.legacy.flush(p);await b.legacy.flush(switchPage);zero=await b.zeros();expect(b.images).toHaveLength(2);expect(f.observations.control_posts).toHaveLength(1);expect(f.observations.feedback_posts).toHaveLength(1);completed=true
 }catch(error){primary=error}
 finally{
  if(b)await clean('actual_browser_close',()=>b.close());await clean('actual_fixture_close',()=>f.close());if(b)await clean('all_zero_after_cleanup',async()=>{zero=await b.zeros();expect(f.finalOwnerAudit()).toBe(true)})
  if(b)await b.writeAfterCleanup(testInfo,completed,primary,cleanup,{story:permit.story,head:permit.head,scope:'original employee App queued read/control/privacy, no execution',steps,actual_backend:f.backendProfile,actual_build:f.provenance,http:f.observations,admission:admission??null,feedback:feedbackProof??null,actual_acl:aclProof??null,zero:zero??null,final_actual_owner_audit:f.finalOwnerAudit(),contract_gaps:['No generated output or model/provider compatibility acceptance.','Original parent question/plan controls remain unmounted; no fabricated waiting-input state.','Safe Agent submission has no separate submit audit contract.','Cancel has no exact operation-specific confirmation endpoint; actual lost original response was observed by host, UI recovery only reads terminal state.','No complete run-history pagination/timeline/historical-title/temporary-override acceptance.'],full_parent_page_complete:false,provider_network_acceptance:false,production_GO:false})
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup.map(v=>v.error)],'original_parent_queued_story_and_cleanup_failed');if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup.map(v=>v.error),'original_parent_queued_cleanup_failed')
})
