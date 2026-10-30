import {test,expect} from '@playwright/test'
import {requireOriginalRunQueuedBrowserCi} from './helpers/pg-original-run-queued-browser-guard.mjs'
import {startOriginalRunQueuedBrowserFixture} from './helpers/pg-original-run-queued-browser-fixture.mjs'
import {originalQueuedBrowserSession} from './helpers/pg-original-run-queued-browser-actions.mjs'
test('actual original RunDetail four queued protocols, exact negative reads, original pending receipt and verified owner/source fences',async({},testInfo)=>{
 const permit=requireOriginalRunQueuedBrowserCi();expect(permit.story).toBe('original-run-detail-queued')
 const f=await startOriginalRunQueuedBrowserFixture();let b,p,switchPage,primary,completed=false,admission,zero,negativeReceipt,positiveReceipt,aclProof;const cleanup=[],steps={}
 const clean=async(label,work)=>{try{await work()}catch(error){cleanup.push({label,error})}}
 try{
  expect(f.backendProfile).toMatchObject({actual_F01_fixture:true,actual_global_selector:true,actual_four_engine_submit:true,actual_memory_context_audit:true,Worker_ticks:0,extra_model_probes:0,production_GO:false})
  admission=await f.proveAdmission();b=await originalQueuedBrowserSession(f);p=await b.page()
  const alice=f.owned.alice,bob=f.owned.bob,auto=alice.runs.agent_autonomous.run,bobAuto=bob.runs.agent_autonomous.run
  const detail=(who,kind,explicit=true)=>'/run-detail?run='+f.owned[who].runs[kind].run.id+(explicit?'&kind='+kind:'')
  const parent=who=>'/agent-run?spec='+f.owned[who].parent.id+'&run='+f.owned[who].runs.agent_autonomous.run.id+'&engine_kind=agent_autonomous'
  const ready=async(kind,who='alice')=>{
   const r=f.owned[who].runs[kind].run,resource=r.agent_spec_id??r.workflow_id
   await expect(p.getByRole('heading',{name:'运行概览',exact:true})).toBeVisible();await expect(p.getByText((kind.startsWith('agent_')?'Agent':'Workflow')+' ID '+resource+'（历史名称未提供）',{exact:true}).first()).toBeVisible()
   await expect(p.getByRole('heading',{name:'公开步骤状态快照',exact:true})).toBeVisible();await expect(p.getByText('当前快照没有可展示步骤。',{exact:true})).toBeVisible();await expect(p.getByText('已登记 0 个执行步骤（非模型轮次）',{exact:true})).toBeVisible()
   expect(await f.runState(who,r.id)).toMatchObject({id:r.id,step_count:0,actual_owner_verified:true})
  }
  await test.step('each explicit original detail kind reads its own actual queued run, public zero-step snapshot and stored resource identity',async()=>{
   await b.login(p,'alice',detail('alice','agent_single'))
   for(const kind of ['agent_single','workflow_safe','workflow_v2','agent_autonomous']){
    if(kind!=='agent_single')await p.goto(f.origin+detail('alice',kind),{waitUntil:'domcontentloaded'})
    await ready(kind)
    if(['agent_single','workflow_safe'].includes(kind)){for(const label of ['暂停','恢复','取消'])await expect(p.getByRole('button',{name:label,exact:true})).toBeDisabled()}
    if(kind==='workflow_v2'){await expect(p.getByRole('button',{name:'暂停',exact:true})).toBeDisabled();await expect(p.getByRole('button',{name:'恢复',exact:true})).toBeDisabled();await expect(p.getByRole('button',{name:'取消',exact:true})).toBeEnabled()}
    if(['workflow_v2','agent_autonomous'].includes(kind)){
     const collection=kind==='workflow_v2'?'workflow-v2-runs':'agent-autonomous-runs',r=f.owned.alice.runs[kind].run,response=b.wire(p,'/api/v2/'+collection+'/'+r.id+'/steps')
     await p.getByRole('button',{name:'重新读取公开步骤分页',exact:true}).click();const page=await response;expect(page.status()).toBe(200);expect(await page.json()).toMatchObject({items:[],next_after:null});await ready(kind)
    }
   }
   steps.actual_original_four_protocol_read_and_steps=true
  })
  await test.step('wrong explicit kind fails closed; the actual original parent history link without kind resolves exactly one real protocol and exactly three correlated404 reads',async()=>{
   const wrong=f.expectNotFound(auto.id,['workflow_v2'],'wrong_explicit_kind');await p.goto(f.origin+'/run-detail?run='+auto.id+'&kind=workflow_v2',{waitUntil:'domcontentloaded'});await expect(p.getByRole('heading',{name:'运行不存在或无权查看',exact:true})).toBeVisible();wrong.assertConsumed()
   await p.goto(f.origin+parent('alice'),{waitUntil:'domcontentloaded'});await expect(p.locator('#spec-select')).toHaveValue(alice.parent.id)
   const exact=f.expectNotFound(auto.id,['agent_single','workflow_safe','workflow_v2'],'legacy_kind_resolution'),link=p.locator('a[title="查看运行详情"][href="/run-detail?run='+auto.id+'"]')
   await expect(link).toHaveCount(1);await link.click();await expect(p).toHaveURL(f.origin+detail('alice','agent_autonomous',false));await ready('agent_autonomous');exact.assertConsumed()
   const correlated=f.observations.expected_not_found.filter(v=>v.target_id===auto.id&&v.reason==='legacy_kind_resolution');expect(correlated).toHaveLength(3);expect(new Set(correlated.map(v=>v.path)).size).toBe(3)
   const back=p.getByRole('link',{name:'在试跑页打开该方案',exact:true});await expect(back).toHaveAttribute('href',parent('alice'));await back.click();await expect(p).toHaveURL(f.origin+parent('alice'));await expect(p.locator('#spec-select')).toHaveValue(alice.parent.id)
   await p.goto(f.origin+detail('alice','agent_autonomous'),{waitUntil:'domcontentloaded'});await ready('agent_autonomous');steps.explicit_wrong_kind_and_actual_legacy_cross_link=true
  })
  await test.step('Native8s expiry leaves the exact original pause pending; a true negative receipt preserves it, then one original request commits and a positive readonly confirmation clears it',async()=>{
   const staged=f.stageNextOriginalPause(auto.id);await expect(p.getByRole('button',{name:'暂停',exact:true})).toBeEnabled();await p.getByRole('button',{name:'暂停',exact:true}).click();await staged.entered()
   const original=staged.request(),confirm=p.getByRole('button',{name:'核对原控制结果（不重发）',exact:true});await expect(confirm).toBeEnabled();expect(f.observations.controlled_client_timeouts).toBe(1)
   negativeReceipt=await f.controlReceipts('alice',auto.id,original,0)
   const negative=b.wire(p,'/api/v2/agent-autonomous-runs/'+auto.id+'/pause-confirm','POST');await confirm.click();expect(await (await negative).json()).toMatchObject({control_confirmed:false,run_control_confirmation:null})
   await expect(confirm).toBeEnabled();await expect(p.getByText('后台尚无原回执，原事务可能仍在完成；保留原操作，仅查询，不重发控制。',{exact:false})).toBeVisible();expect(f.observations.control_posts).toHaveLength(1);expect((await f.runState('alice',auto.id)).status).toBe('queued');await expect(p.getByRole('button',{name:'恢复',exact:true})).toHaveCount(0)
   staged.release();expect(await staged.done()).toMatchObject({actual_status:200,actual_run_id:auto.id});positiveReceipt=await f.controlReceipts('alice',auto.id,original,1)
   const positive=b.wire(p,'/api/v2/agent-autonomous-runs/'+auto.id+'/pause-confirm','POST');await confirm.click();const receipt=await (await positive).json();expect(receipt.control_confirmed).toBe(true);expect(receipt.run_control_confirmation).toMatchObject({run_id:auto.id,action:'pause',operation_id:original.operation_id})
   await expect(confirm).toHaveCount(0);await ready('agent_autonomous');expect((await f.runState('alice',auto.id)).status).toBe('paused');await expect(p.getByRole('button',{name:'恢复',exact:true})).toBeEnabled();expect(f.observations.control_posts).toHaveLength(1);expect(f.observations.confirmation_posts).toHaveLength(2);expect(f.observations.negative_control_confirmations).toBe(1);expect(f.observations.positive_control_confirmations).toBe(1)
   await b.image('original-run-detail-queued-alice-receipt.png',p);steps.real_original_pending_negative_then_positive_receipt_no_resend=true
  })
  await test.step('original V2 detail cancellation is a single real write; safe engines retain their unsupported-control state',async()=>{
   await p.goto(f.origin+detail('alice','workflow_v2'),{waitUntil:'domcontentloaded'});await ready('workflow_v2');const cancelled=b.wire(p,'/api/v2/workflow-v2-runs/'+alice.runs.workflow_v2.run.id+'/cancel','POST');await p.getByRole('button',{name:'取消',exact:true}).click();expect((await cancelled).status()).toBe(200);await expect(p.getByText('已取消',{exact:true}).first()).toBeVisible();expect((await f.runState('alice',alice.runs.workflow_v2.run.id)).status).toBe('cancelled');expect(f.observations.control_posts).toHaveLength(2);steps.actual_v2_cancel=true
  })
  await test.step('a real Native Cookie employee switch hides old detail, returns one exact foreign404, and Bob owns a separate actual run whose memory admission receipt observes ACL revoke',async()=>{
   await p.goto(f.origin+detail('alice','agent_autonomous'),{waitUntil:'domcontentloaded'});await ready('agent_autonomous');switchPage=await b.page();await switchPage.goto(f.origin+parent('alice'),{waitUntil:'domcontentloaded'});await expect(switchPage.locator('#spec-select')).toHaveValue(alice.parent.id)
   await b.logout(switchPage,'alice');await b.login(switchPage,'bob',parent('bob'));await b.focus(p);await expect(p.getByText(auto.instruction,{exact:true})).toHaveCount(0)
   const foreign=f.expectNotFound(auto.id,['agent_autonomous'],'foreign_owner');await p.goto(f.origin+detail('alice','agent_autonomous'),{waitUntil:'domcontentloaded'});await expect(p.getByRole('heading',{name:'运行不存在或无权查看',exact:true})).toBeVisible();foreign.assertConsumed()
   await b.closePage(switchPage);await p.goto(f.origin+detail('bob','agent_autonomous'),{waitUntil:'domcontentloaded'});await ready('agent_autonomous','bob');await expect(p.getByText(bobAuto.instruction,{exact:true})).toBeVisible();await b.image('original-run-detail-queued-bob-owned.png',p)
   aclProof=await f.revokeKnowledge();await p.getByRole('button',{name:'刷新当前运行',exact:true}).click();await expect(p.getByText('来源或权限已变化，正文与步骤内容已隐藏。',{exact:true})).toBeVisible();await expect(p.getByText(bobAuto.instruction,{exact:true})).toHaveCount(0);await expect(p.getByRole('button',{name:'暂停',exact:true})).toBeDisabled();expect(await f.runState('bob',bobAuto.id)).toMatchObject({status:'queued',step_count:0});steps.actual_cookie_foreign_owner_and_queued_source_acl_fence=true
  })
  await b.legacy.flush(p);zero=await b.zeros();expect(b.images).toHaveLength(2);expect(f.observations.expected_not_found).toHaveLength(5);completed=true
 }catch(error){primary=error}
 finally{
  if(b)await clean('actual_browser_close',()=>b.close());await clean('actual_fixture_close',()=>f.close());if(b)await clean('all_zero_after_cleanup',async()=>{zero=await b.zeros();expect(f.finalOwnerAudit()).toBe(true)})
  if(b)await b.writeAfterCleanup(testInfo,completed,primary,cleanup,{story:permit.story,head:permit.head,scope:'original employee RunDetail queued four-engine read/control/privacy, no execution',steps,actual_backend:f.backendProfile,actual_build:f.provenance,http:f.observations,admission:admission??null,negative_receipt:negativeReceipt??null,positive_receipt:positiveReceipt??null,actual_acl:aclProof??null,zero:zero??null,final_actual_owner_audit:f.finalOwnerAudit(),contract_gaps:['No model/generated output/provider compatibility acceptance.','No original event stream, historical names, complete configuration or temporary override snapshot, complete history pagination, execution durations or inferred model rounds.','Queued snapshots have zero steps; populated steps pagination and output bodies remain separate acceptance work.','Safe Agent and Workflow have no pause/resume/cancel contracts; V2 Workflow has cancellation only.','Cancel has no exact operation-specific confirmation contract.','Safe Agent queue has no separate submit audit contract.'],full_run_detail_page_complete:false,provider_network_acceptance:false,production_GO:false})
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup.map(v=>v.error)],'original_detail_queued_story_and_cleanup_failed');if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup.map(v=>v.error),'original_detail_queued_cleanup_failed')
})
