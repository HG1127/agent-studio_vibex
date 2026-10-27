// AUTHORED ONLY: actual PG18 results remain pending the dedicated CI job.
// The exact original Linux GitHub target guard precedes all runtime imports.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {descriptivePatchTarget,descriptivePatchFixture,descriptivePatchTracedPool,descriptivePatchBounded} from './helpers/agent-descriptive-patch-fixture.mjs'

const D=['goal','task_scope','deliverables','task_plan','done_criteria']
const withoutD=spec=>Object.fromEntries(Object.entries(spec).filter(([key])=>!D.includes(key)))
const full=()=>({goal:'完整合成目标 '+randomUUID(),task_scope:'描述边界',deliverables:['交付😀'],task_plan:['核对'],done_criteria:['验收']})
const bodySql=/^SELECT agentstudio\.agent_opinion_body\(/
const patchSql=/^SELECT agentstudio\.agent_descriptive_patch_accept\(/
const oldSql=/^SELECT agentstudio\.agent_generated_accept\(/
const privateReceipt=/"(?:choice|messages|identity|owner_user_id|model_binding|lease_token|worker_id|descriptive|rationale|tools_note|comment)"|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|api_key/
const sqlFailure=e=>e.code==='P0001'&&/^agent_(?:descriptive_patch|generated|opinion|optimization)_/.test(e.message)
const refused=e=>e.status===409||sqlFailure(e)
const observe=promise=>{const state={done:false};state.promise=promise.then(value=>{state.done=true;return {ok:true,value}},error=>{state.done=true;return {ok:false,error}});return state}
async function reached(trace,state,label){await descriptivePatchBounded(Promise.race([trace.hit,state.promise.then(r=>{if(!r.ok)throw r.error;throw Error('missing_descriptive_patch_gate_'+label)})]),label)}
async function success(state,label){const r=await descriptivePatchBounded(state.promise,label);if(!r.ok)throw r.error;return r.value}
async function blocking(admin,waiter,blocker,label){
  const until=Date.now()+7000
  while(Date.now()<until){
    const row=(await admin.query('SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_catalog.pg_stat_activity WHERE pid=$1',[waiter])).rows[0]
    if(row?.wait_event_type==='Lock'&&row.blockers.includes(blocker))return
    await delay(20)
  }
  assert.fail(label+': independent real PostgreSQL backend did not show the required blocking edge')
}
async function count(f,table,owner,request){
  assert.ok(['agent_optimization_intents','agent_optimization_links','agent_generated_acceptances','agent_descriptive_patch_acceptances','agent_descriptive_patch_feedback_refs'].includes(table))
  return (await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.'+table+' WHERE owner_user_id=$1 AND request_id=$2',[owner,request])).rows[0].n
}
async function actualChain(f,p,receipt){
  const {original:q,preview}=p
  const witness=(await f.db.query('SELECT * FROM agentstudio.agent_descriptive_patch_acceptances WHERE owner_user_id=$1 AND request_id=$2',[p.owner,q.request_id])).rows[0]
  const intent=(await f.db.query('SELECT * FROM agentstudio.agent_optimization_intents WHERE owner_user_id=$1 AND request_id=$2',[p.owner,q.request_id])).rows[0]
  const link=(await f.db.query('SELECT * FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1 AND request_id=$2',[p.owner,q.request_id])).rows[0]
  assert.ok(witness&&intent&&link);assert.match(intent.transaction_id,/^[0-9]+$/)
  assert.equal(witness.review_id,p.raw.request_id);assert.equal(witness.target_run_id,p.runId);assert.equal(witness.request_sha256,receipt.request_sha256)
  assert.equal(witness.patch_sha256,preview.model_patch.patch_sha256);assert.deepEqual(witness.provided_keys,preview.model_patch.provided_keys)
  assert.equal(witness.candidate_sha256,preview.candidate.candidate_sha256);assert.notEqual(witness.candidate_sha256,witness.optimization_candidate_sha256)
  assert.equal(witness.optimization_candidate_sha256,intent.candidate_sha256);assert.equal(link.candidate_sha256,intent.candidate_sha256)
  assert.equal(link.run_id,preview.anchor.run_id);assert.equal(link.feedback_id,preview.anchor.feedback_id);assert.equal(link.request_sha256,receipt.request_sha256)
  assert.equal(link.before_revision_id,receipt.before.revision_id);assert.equal(link.after_revision_id,receipt.after.revision_id)
  assert.equal(Number(link.after_spec_revision),Number(link.before_spec_revision)+1)
  const history=(await f.db.query('SELECT id,owner_user_id,actor_user_id,spec_id,kind,spec_revision,source_sha256,safe_spec FROM agentstudio.agent_collaboration_revisions WHERE id=ANY($1::uuid[])',[[receipt.before.revision_id,receipt.after.revision_id]])).rows
  assert.equal(history.length,2)
  for(const [key,kind] of [['before','before_edit'],['after','edited']]){
    const row=history.find(r=>r.id===receipt[key].revision_id);assert.equal(row.kind,kind);assert.equal(row.owner_user_id,p.owner);assert.equal(row.actor_user_id,p.owner);assert.equal(row.spec_id,p.role.id)
    assert.equal(Number(row.spec_revision),receipt[key].revision);assert.equal(row.source_sha256,receipt[key].source_sha256)
    assert.deepEqual(row.safe_spec,key==='before'?preview.before.descriptive:preview.candidate.descriptive)
  }
  const refs=(await f.db.query('SELECT run_id,feedback_id,feedback_sha256,feedback_revision,feedback_source_sha256,statement_sha256 FROM agentstudio.agent_descriptive_patch_feedback_refs WHERE owner_user_id=$1 AND request_id=$2 ORDER BY source_ordinal',[p.owner,q.request_id])).rows.map(r=>({...r,feedback_revision:Number(r.feedback_revision)}))
  assert.deepEqual(refs,preview.feedback_sources)
  const audits=(await f.db.query("SELECT owner_user_id,actor_user_id,metadata FROM agentstudio.audit_events WHERE action='agent.descriptive_patch_acceptance' AND metadata->>'request_id'=$1",[q.request_id])).rows
  assert.equal(audits.length,1);assert.equal(audits[0].owner_user_id,p.owner);assert.equal(audits[0].actor_user_id,p.owner)
  assert.equal(audits[0].metadata.receipt_sha256,receipt.receipt_sha256);assert.deepEqual(audits[0].metadata.provided_keys,receipt.provided_keys)
  assert.doesNotMatch(JSON.stringify(receipt),privateReceipt)
}

test('S1 descriptive patch genuine independent PG18 foundation',{concurrency:false,timeout:900000},async t=>{
  descriptivePatchTarget() // no skip, ambient URL or local target alternative
  const f=await descriptivePatchFixture()
  const {withActor,safeAgentSpec,verifyAgentDescriptivePatchCredentials,inspectAgentDescriptivePatchSchema,verifyAgentGeneratedCredentials,verifyAgentOpinionCredentials,verifyAgentOptimizationCredentials,generatedManualRoleInput,generatedAcceptanceChoice,generatedPreviewChoice,generatedRecoverySourceRead}=f.h
  const fullAudits=()=>withActor(f.pool,f.identities.alice,async db=>{
    for(const verify of [verifyAgentOptimizationCredentials,verifyAgentOpinionCredentials,verifyAgentGeneratedCredentials,verifyAgentDescriptivePatchCredentials])assert.equal(await verify(db),true)
  })
  const oldDirect=(identity,original,pool=f.pool)=>withActor(pool,identity,async db=>(await db.query('SELECT agentstudio.agent_generated_accept($1::jsonb) AS value',[JSON.stringify(original)])).rows[0].value)
  try{
    await t.test('unchanged old FULL chains and mandatory new FULL audits coexist; all effective nonsuperuser privileges remain closed',async()=>{
      const before=await f.patchSnapshot();await fullAudits();assert.equal(await inspectAgentDescriptivePatchSchema(f.pool),true);assert.equal(await f.patchSnapshot(),before)
      assert.ok(f.patchSnapshotTables.includes('agent_descriptive_patch_acceptances'));assert.ok(f.patchSnapshotTables.includes('agent_descriptive_patch_feedback_refs'))
      const privileges=(await f.db.query(`SELECT r.rolname,r.rolcanlogin,
        has_any_column_privilege(r.oid,'agentstudio.agent_descriptive_patch_acceptances','SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,'agentstudio.agent_descriptive_patch_acceptances','DELETE,TRUNCATE,TRIGGER,MAINTAIN') AS witness,
        has_any_column_privilege(r.oid,'agentstudio.agent_descriptive_patch_feedback_refs','SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,'agentstudio.agent_descriptive_patch_feedback_refs','DELETE,TRUNCATE,TRIGGER,MAINTAIN') AS refs,
        has_function_privilege(r.oid,'agentstudio.agent_descriptive_patch_accept(jsonb)','EXECUTE') AS accept,
        has_function_privilege(r.oid,'agentstudio.agent_descriptive_patch_receipt(uuid,text)','EXECUTE') AS receipt
        FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper ORDER BY r.rolname`)).rows
      assert.ok(privileges.some(r=>r.rolname==='agentstudio_api'))
      for(const r of privileges){
        if(['pg_read_all_data','pg_write_all_data','pg_maintain'].includes(r.rolname)){
          assert.equal(r.rolcanlogin,false)
          assert.equal((await f.db.query('SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles m WHERE NOT m.rolsuper AND m.rolname<>$1 AND pg_has_role(m.oid,$1,\'MEMBER\')) AS ok',[r.rolname])).rows[0].ok,true)
        }else{assert.equal(r.witness,false,r.rolname);assert.equal(r.refs,false,r.rolname)}
        assert.equal(r.accept,r.rolname==='agentstudio_api',r.rolname);assert.equal(r.receipt,r.rolname==='agentstudio_api',r.rolname)
      }
      for(const table of ['agent_descriptive_patch_acceptances','agent_descriptive_patch_feedback_refs'])for(const sql of ['SELECT * FROM agentstudio.'+table,'INSERT INTO agentstudio.'+table+' DEFAULT VALUES'])await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(sql)),e=>e.code==='42501')
      for(const [pool,role] of [[f.workerPool,'agentstudio_review_worker'],[f.dispatchPool,'agentstudio_review_dispatch'],[f.secretPool,'agentstudio_model_broker']]){
        const db=await pool.connect()
        try{await db.query('BEGIN');await db.query('SET LOCAL ROLE '+role);assert.equal((await db.query('SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false)
          await assert.rejects(db.query('SELECT agentstudio.agent_descriptive_patch_receipt($1::uuid,$2::text)',[randomUUID(),'review']),e=>e.code==='42501')
        }finally{await db.query('ROLLBACK');db.release()}
      }
    })

    await t.test('actual partial1..4,full5,clear and provided-versus-changed produce genuine055/045/two-witness/audit and retain every nonD byte',async()=>{
      const cases=[()=>({goal:'一字段 '+randomUUID()}),()=>({goal:'二字段 '+randomUUID(),task_scope:'范围'}),()=>({goal:'三字段 '+randomUUID(),deliverables:['核对'],task_plan:['执行']}),()=>({goal:'四字段 '+randomUUID(),task_scope:'',deliverables:[],task_plan:[]}),()=>full(),s=>({goal:s.goal,done_criteria:[]})]
      for(let i=0;i<cases.length;i++){
        const p=await f.patchReady({descriptive:cases[i],feedbackCount:i===0?2:1,targetDistinct:i===0,reverseSources:i===0})
        const before=await f.agents.get(p.identity,p.role.id),receipt=await f.patchAccept(p,p.original),after=await f.agents.get(p.identity,p.role.id)
        assert.equal(Object.keys(p.original).length,15);assert.equal(receipt.recorded,true);assert.equal(receipt.replayed,false)
        assert.equal(after.revision,before.revision+1);assert.equal(after.name,before.name);assert.deepEqual(withoutD(after.spec),withoutD(before.spec));assert.equal(after.spec.require_approval,true)
        assert.equal((await f.db.query('SELECT requires_approval FROM agentstudio.agent_specs WHERE id=$1',[p.role.id])).rows[0].requires_approval,true)
        const supplied=p.result.descriptive;assert.deepEqual(receipt.provided_keys,D.filter(k=>Object.hasOwn(supplied,k)))
        for(const k of D)assert.deepEqual(after.spec[k],Object.hasOwn(supplied,k)?supplied[k]:before.spec[k])
        if(i===3){assert.equal(after.spec.task_scope,'');assert.deepEqual(after.spec.deliverables,[])}
        if(i===5){assert.deepEqual(receipt.provided_keys,['goal','done_criteria']);assert.deepEqual(receipt.changed_keys,['done_criteria'])}
        await actualChain(f,p,receipt)
      }
    })

    await t.test('legal inherited credential-like synthetic text stays byte-identical through partial accept and after real source erasure receipt recovery',async()=>{
      const identity=f.identities.alice,role=await f.agents.get(identity,f.resources.alice.spec.id),{require_approval:_,...input}=role.spec
      const inherited='Retain api_key=synthetic_inherited_marker_only without copying it into model output'
      await f.agents.update(identity,role.id,role.name,safeAgentSpec({...input,task_scope:inherited}),role.revision)
      const p=await f.patchReady({descriptive:{goal:'只更新实际生成目标 '+randomUUID()}})
      assert.equal(Object.hasOwn(p.preview.model_patch.descriptive,'task_scope'),false);assert.equal(p.preview.candidate.descriptive.task_scope,inherited)
      const accepted=await f.patchAccept(p,p.original);assert.equal((await f.agents.get(identity,role.id)).spec.task_scope,inherited)
      await actualChain(f,p,accepted);await f.eraseOpinion(p);for(const s of p.selected)await f.eraseFeedback(s)
      assert.deepEqual(await f.patchReceipt(identity,p.original.request_id,'request',{expected:p.original}),{...accepted,replayed:true})
      assert.deepEqual(await f.patchDirectAccept(identity,p.original),{...accepted,replayed:true})
      // Restore this synthetic fixture's current scope through a genuine
      // ordinary owner edit before exercising unchanged059 later. Its old
      // full5 receipt intentionally retains its own frozen text constraints.
      const current=await f.agents.get(identity,role.id),{require_approval:__,...next}=current.spec
      await f.agents.update(identity,current.id,current.name,safeAgentSpec({...next,task_scope:'Synthetic scope after inherited-text case'}),current.revision)
    })

    await t.test('COMMIT publication uses one actual Native client and real Source, preserving row visibility and lock order',async()=>{
      const p=await f.patchReady({feedbackCount:2,targetDistinct:true,reverseSources:true}),before=await f.patchSnapshot(),trace=descriptivePatchTracedPool(f.pool,{before:/^COMMIT$/})
      const pending=observe(f.patchAccept(p,p.original,{pool:trace.pool}))
      try{
        await reached(trace,pending,'commit');assert.equal(pending.done,false);assert.equal(await f.patchSnapshot(),before)
        const q=trace.trace,at=re=>q.findIndex(x=>re.test(x.sql)),runs=[...new Set([p.runId,...p.choice.feedback_sources.map(r=>r.run_id)])].sort()
        const locks=q.filter(x=>/^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1::text,540\)/.test(x.sql)).slice(0,runs.length)
        assert.deepEqual(locks.map(x=>x.values[0]),runs.map(id=>p.owner+':'+id))
        assert.ok(at(/551/)<at(/ FOR UPDATE$/));assert.ok(at(/^SELECT id,name,spec,revision,requires_approval.* FOR UPDATE$/)<at(/^SELECT name,spec,revision,.* FOR SHARE$/));assert.ok(at(/^SELECT name,spec,revision,.* FOR SHARE$/)<at(bodySql));assert.ok(at(bodySql)<at(patchSql))
        trace.release();const receipt=await success(pending,'commit_published');assert.equal(trace.trace[0].sql,'BEGIN');assert.equal(trace.trace.at(-1).sql,'COMMIT');await actualChain(f,p,receipt)
      }finally{trace.release();await pending.promise}
    })

    await t.test('actual repository defaults fresh acceptance closed; readonly preview and exact original recovery are separate',async()=>{
      const p=await f.patchReady(),before=await f.patchSnapshot(),trace=descriptivePatchTracedPool(f.pool),closed=new f.h.AgentDescriptivePatchAcceptanceRepository(trace.pool)
      assert.equal(closed.accepting,false)
      await assert.rejects(closed.accept(p.identity,p.original),e=>e.status===403&&e.code==='agent_descriptive_patch_acceptance_disabled')
      assert.equal(trace.trace.some(q=>bodySql.test(q.sql)),false);assert.equal(await f.patchSnapshot(),before)
      assert.deepEqual(await f.patchClosed.preview(p.identity,{action:'preview',review_id:p.raw.request_id,spec_id:p.role.id,target_run_id:p.runId}),p.preview)
      await assert.rejects(f.patchClosed.confirm(p.identity,p.original),e=>e.status===404);await assert.rejects(f.patchClosed.receipt(p.identity,p.raw.request_id),e=>e.status===404)
      assert.equal(await f.patchSnapshot(),before)
    })

    await t.test('actual COMMIT followed by injected reply loss is recovered by the same frozen original through closed confirm/replay',async()=>{
      const p=await f.patchReady(),q=p.original,saved=structuredClone(q);let committed=false
      const trace=descriptivePatchTracedPool(f.pool,{afterFault(sql){if(sql==='COMMIT'){committed=true;throw Error('synthetic_patch_lost_commit_reply')}}})
      await assert.rejects(f.patchAccept(p,q,{pool:trace.pool}),/synthetic_patch_lost_commit_reply/)
      assert.equal(committed,true,'fault is AFTER actual PostgreSQL COMMIT, never a fake uncommitted result')
      assert.deepEqual(q,saved);assert.equal(Object.isFrozen(q),true);assert.equal(await count(f,'agent_descriptive_patch_acceptances',p.owner,q.request_id),1)
      const before=await f.patchSnapshot(),confirmed=await f.patchClosed.confirm(p.identity,q),replay=await f.patchClosed.accept(p.identity,q),byReview=await f.patchClosed.receipt(p.identity,p.raw.request_id)
      assert.equal(confirmed.replayed,true);assert.deepEqual(replay,confirmed);assert.deepEqual(byReview,confirmed);assert.equal(await f.patchSnapshot(),before)
      await actualChain(f,p,confirmed)
    })

    await t.test('bad owner/epoch/current review-model/feedback/result/preview/patch/candidate refuse with no business or new-witness writes',async()=>{
      const p=await f.patchReady({isolatedReviewModel:true}),before=await f.patchSnapshot()
      for(const patch of [{owner_user_id:p.owner},{selected_keys:['goal']},{human_patch:{goal:'forged'}},{descriptive:{goal:'forged'}},{confirm:false},{acceptance_acknowledgement:'APPROVE_ONE_PAID_AGENT_OPTIMIZATION_V1'}]){
        await assert.rejects(f.patchDirectAccept(p.identity,{...p.original,...patch}),e=>e.code==='P0001'&&e.message==='invalid_agent_descriptive_patch_request');assert.equal(await f.patchSnapshot(),before)
      }
      for(const patch of [{expected_preview_sha256:'0'.repeat(64)},{expected_result_sha256:'0'.repeat(64)},{expected_patch_sha256:'0'.repeat(64)},{expected_candidate_sha256:'0'.repeat(64)},{expected_spec_sha256:'0'.repeat(64)},{expected_spec_revision:p.original.expected_spec_revision+1},{target_run_id:randomUUID()},{anchor_run_id:randomUUID()}]){
        await assert.rejects(f.patchDirectAccept(p.identity,{...p.original,...patch}),refused);assert.equal(await f.patchSnapshot(),before)
      }
      await assert.rejects(f.patchDirectAccept(f.identities.bob,p.original),refused);assert.equal(await f.patchSnapshot(),before)
      for(const kind of ['epoch','model','feedback','role_resource']){
        const next=await f.patchReady({isolatedReviewModel:true})
        let saved
        if(kind==='epoch')await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[next.owner])
        else if(kind==='model')await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[next.choice.model_binding.connection_id])
        else if(kind==='feedback')await f.eraseFeedback(next.selected[0])
        else{
          const id=next.role.spec.model_binding.connection_id;saved=(await f.db.query('SELECT id,enabled,revision FROM agentstudio.model_connections WHERE id=$1',[id])).rows[0]
          await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[id])
        }
        try{const snapshot=await f.patchSnapshot();await assert.rejects(f.patchAccept(next,next.original),refused);assert.equal(await f.patchSnapshot(),snapshot);await assert.rejects(f.patchDirectAccept(next.identity,next.original),refused);assert.equal(await f.patchSnapshot(),snapshot)}
        finally{if(saved)await f.db.query('UPDATE agentstudio.model_connections SET enabled=$2,revision=$3 WHERE id=$1',[saved.id,saved.enabled,saved.revision])}
      }
    })

    await t.test('actual055/role/045/link/new witness/ref/hash/audit faults roll back ALL old and new business rows',async()=>{
      const targets={intent:['agent_optimization_intents','INSERT'],role:['agent_specs','UPDATE'],history:['agent_collaboration_revisions','INSERT'],link:['agent_optimization_links','INSERT'],witness:['agent_descriptive_patch_acceptances','INSERT'],refs:['agent_descriptive_patch_feedback_refs','INSERT'],receipt_hash:['agent_descriptive_patch_acceptances','INSERT'],audit:['audit_events','INSERT']}
      for(const [point,[table,event]] of Object.entries(targets)){
        const p=await f.patchReady(),before=await f.patchSnapshot(),trace=descriptivePatchTracedPool(f.pool,{after:bodySql}),pending=observe(f.patchAccept(p,p.original,{pool:trace.pool}))
        let installed=false
        try{
          await reached(trace,pending,'fault_'+point)
          const marker="PERFORM pg_catalog.nextval('agentstudio.synthetic_patch_fault_counter'::regclass); "
          const fault=point==='receipt_hash'?"NEW.receipt_sha256:=repeat('0',64); RETURN NEW;":"RAISE EXCEPTION 'synthetic_patch_"+point+"_failure';"
          const when=point==='audit'?" WHEN (NEW.action='agent.descriptive_patch_acceptance')":""
          await f.db.exec('CREATE SEQUENCE agentstudio.synthetic_patch_fault_counter; GRANT USAGE ON SEQUENCE agentstudio.synthetic_patch_fault_counter TO agentstudio_collaboration; CREATE FUNCTION agentstudio.synthetic_patch_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN '+marker+fault+' END$$; REVOKE ALL ON FUNCTION agentstudio.synthetic_patch_fault() FROM PUBLIC; CREATE TRIGGER synthetic_patch_fault BEFORE '+event+' ON agentstudio.'+table+' FOR EACH ROW'+when+' EXECUTE FUNCTION agentstudio.synthetic_patch_fault()')
          installed=true;trace.release()
          const reply=await descriptivePatchBounded(pending.promise,'fault_result_'+point)
          assert.equal(reply.ok,false);assert.equal((await f.db.query('SELECT is_called FROM agentstudio.synthetic_patch_fault_counter')).rows[0].is_called,true,'the exact real fault trigger must execute at '+point)
          if(point==='receipt_hash')assert.ok(refused(reply.error))
          else{assert.equal(reply.error.code,'P0001');assert.equal(reply.error.message,'synthetic_patch_'+point+'_failure')}
          assert.ok(trace.trace.some(q=>q.sql==='ROLLBACK'));assert.equal(await f.patchSnapshot(),before,'all actual old/new/role/history/audit rows roll back at '+point)
        }finally{
          trace.release();await pending.promise
          if(installed)await f.db.exec('DROP TRIGGER synthetic_patch_fault ON agentstudio.'+table+'; DROP FUNCTION agentstudio.synthetic_patch_fault(); DROP SEQUENCE agentstudio.synthetic_patch_fault_counter')
        }
        const accepted=await f.patchAccept(p,p.original);assert.equal(accepted.replayed,false);await actualChain(f,p,accepted)
      }
    })

    await t.test('same exact UUID uses observed551 blocking and returns the immutable original without a second change',async()=>{
      const p=await f.patchReady(),first=descriptivePatchTracedPool(f.pool,{after:patchSql}),second=descriptivePatchTracedPool(f.pool),a=observe(f.patchAccept(p,p.original,{pool:first.pool}))
      let b
      try{
        await reached(first,a,'same_request');b=observe(f.patchAccept(p,p.original,{pool:second.pool}))
        const pa=await first.pid,pb=await second.pid;assert.notEqual(pa,pb);await blocking(f.db,pb,pa,'same request551');assert.equal(b.done,false)
        first.release();const accepted=await success(a,'same_request_winner'),replay=await success(b,'same_request_replay')
        assert.deepEqual(replay,{...accepted,replayed:true});assert.equal(await count(f,'agent_descriptive_patch_acceptances',p.owner,p.original.request_id),1)
        assert.equal((await f.agents.get(p.identity,p.role.id)).revision,p.role.revision+1);await actualChain(f,p,accepted)
      }finally{first.release();await a.promise;await b?.promise}
    })

    await t.test('same new-family review with different UUIDs serializes on actual source locks with one intended change',async()=>{
      const p=await f.patchReady(),other=f.patchOriginal(p.preview),first=descriptivePatchTracedPool(f.pool,{after:bodySql}),second=descriptivePatchTracedPool(f.pool),a=observe(f.patchAccept(p,p.original,{pool:first.pool}))
      let b
      try{
        await reached(first,a,'different_UUID_same_review');b=observe(f.patchAccept(p,other,{pool:second.pool}))
        const pa=await first.pid,pb=await second.pid;assert.notEqual(pa,pb);await blocking(f.db,pb,pa,'same review540');first.release()
        const winner=await success(a,'same_review_winner'),loser=await descriptivePatchBounded(b.promise,'same_review_loser');assert.equal(loser.ok,false);assert.ok(refused(loser.error))
        assert.equal((await f.agents.get(p.identity,p.role.id)).revision,p.role.revision+1)
        assert.equal(await count(f,'agent_descriptive_patch_acceptances',p.owner,p.original.request_id),1);assert.equal(await count(f,'agent_descriptive_patch_acceptances',p.owner,other.request_id),0)
        await actualChain(f,p,winner)
      }finally{first.release();await a.promise;await b?.promise}
    })

    await t.test('both full5 family orders use independent backends and real blocking; kernel AND direct SQL cannot double accept',async()=>{
      for(const mode of ['kernel','direct'])for(const leader of ['old059','new060']){
        const p=await f.patchReady({descriptive:full(),feedbackCount:2,targetDistinct:true,reverseSources:true}),oldPreview=await f.generated.preview(p.identity,generatedPreviewChoice(p)),oldOriginal=generatedAcceptanceChoice(oldPreview)
        assert.notEqual(oldOriginal.request_id,p.original.request_id)
        const before=await f.patchSnapshot(),first=descriptivePatchTracedPool(f.pool,{after:mode==='kernel'?bodySql:leader==='old059'?oldSql:patchSql}),second=descriptivePatchTracedPool(f.pool)
        const invoke=(family,pool)=>family==='old059'?(mode==='kernel'?new f.generatedClasses.AgentGeneratedAcceptanceRepository(pool,{allowAcceptance:true}).accept(p.identity,oldOriginal):oldDirect(p.identity,oldOriginal,pool)):(mode==='kernel'?f.patchAccept(p,p.original,{pool}):f.patchDirectAccept(p.identity,p.original,{pool}))
        const a=observe(invoke(leader,first.pool));let b
        try{
          await reached(first,a,mode+'_'+leader);assert.equal(await f.patchSnapshot(),before,'leader remains uncommitted')
          b=observe(invoke(leader==='old059'?'new060':'old059',second.pool))
          const pa=await first.pid,pb=await second.pid;assert.notEqual(pa,pb);await blocking(f.db,pb,pa,mode+'_'+leader+'_540_role');assert.equal(b.done,false)
          first.release();const accepted=await success(a,mode+'_'+leader+'_winner'),loser=await descriptivePatchBounded(b.promise,mode+'_'+leader+'_loser')
          assert.equal(accepted.replayed,false);assert.equal(loser.ok,false);assert.ok(refused(loser.error),String(loser.error))
          assert.equal((await f.agents.get(p.identity,p.role.id)).revision,p.role.revision+1)
          const oldCount=await count(f,'agent_generated_acceptances',p.owner,oldOriginal.request_id),newCount=await count(f,'agent_descriptive_patch_acceptances',p.owner,p.original.request_id)
          assert.equal(oldCount+newCount,1);assert.equal(oldCount,leader==='old059'?1:0);assert.equal(newCount,leader==='new060'?1:0)
          assert.equal(await count(f,'agent_optimization_links',p.owner,oldOriginal.request_id)+await count(f,'agent_optimization_links',p.owner,p.original.request_id),1)
          assert.equal(await count(f,'agent_optimization_intents',p.owner,oldOriginal.request_id)+await count(f,'agent_optimization_intents',p.owner,p.original.request_id),1)
          if(leader==='new060')await actualChain(f,p,accepted)
        }finally{first.release();await a.promise;await b?.promise}
      }
    })

    await t.test('direct060 SQL locks the lowest complete540 before higher runs, role or private request rows',async()=>{
      const p=await f.patchReady({feedbackCount:2,targetDistinct:true,reverseSources:true}),runs=[...new Set([p.runId,...p.choice.feedback_sources.map(s=>s.run_id)])].sort(),holder=await f.adminPool.connect(),trace=descriptivePatchTracedPool(f.pool)
      let pending
      try{
        await holder.query('BEGIN');const blocker=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
        await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))',[p.owner+':'+runs[0]])
        pending=observe(f.patchDirectAccept(p.identity,p.original,{pool:trace.pool}));const waiter=await trace.pid;assert.notEqual(waiter,blocker);await blocking(f.db,waiter,blocker,'direct060 lowest540')
        for(const run of runs.slice(1))assert.equal((await holder.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1::text,540)) AS ok',[p.owner+':'+run])).rows[0].ok,true)
        await holder.query('SELECT id FROM agentstudio.agent_specs WHERE id=$1 AND owner_user_id=$2 FOR UPDATE NOWAIT',[p.role.id,p.owner])
        await holder.query('SELECT request_id FROM agentstudio.agent_review_requests WHERE owner_user_id=$1 AND request_id=$2 FOR UPDATE NOWAIT',[p.owner,p.raw.request_id])
        await holder.query('COMMIT');await actualChain(f,p,await success(pending,'direct060_unblocked'))
      }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();await pending?.promise}
    })

    await t.test('same UUID cross059/new060 and genuine manual055 conflicts in both directions without false-family witness',async()=>{
      for(const leader of ['old059','new060']){
        const p=await f.patchReady({descriptive:full()}),oldPreview=await f.generated.preview(p.identity,generatedPreviewChoice(p)),oldOriginal=generatedAcceptanceChoice(oldPreview,p.original.request_id)
        if(leader==='old059')await oldDirect(p.identity,oldOriginal);else await f.patchDirectAccept(p.identity,p.original)
        const snapshot=await f.patchSnapshot()
        if(leader==='old059')await assert.rejects(f.patchDirectAccept(p.identity,p.original),e=>e.code==='P0001'&&e.message==='agent_descriptive_patch_request_conflict')
        else await assert.rejects(oldDirect(p.identity,oldOriginal),e=>e.code==='P0001'&&e.message==='agent_generated_request_conflict')
        assert.equal(await f.patchSnapshot(),snapshot);assert.equal(await count(f,'agent_descriptive_patch_acceptances',p.owner,p.original.request_id),leader==='new060'?1:0)
      }
      for(const leader of ['manual055','new060']){
        const p=await f.patchReady(),feedback=p.selected[0],role=await f.agents.get(p.identity,p.role.id),{require_approval:_,...input}=role.spec,manual=new f.generatedClasses.AgentOptimizationRepository(f.pool,{allowAcceptance:true})
        const draft=await manual.preview(p.identity,{action:'preview',spec_id:role.id,run_id:feedback.runId,feedback_id:feedback.feedback.feedback_id,expected_feedback_sha256:feedback.feedback.feedback_sha256,expected_spec_revision:role.revision,expected_spec_sha256:p.preview.before.source_sha256,name:role.name,spec:generatedManualRoleInput(safeAgentSpec({...input,goal:'Real055 namespace collision '+randomUUID()}))})
        const q={action:'accept',request_id:p.original.request_id,spec_id:role.id,run_id:feedback.runId,feedback_id:feedback.feedback.feedback_id,expected_feedback_sha256:feedback.feedback.feedback_sha256,expected_spec_revision:role.revision,expected_spec_sha256:p.preview.before.source_sha256,name:role.name,spec:generatedManualRoleInput(draft.candidate.spec),confirm:true}
        if(leader==='manual055')await manual.accept(p.identity,q);else await f.patchDirectAccept(p.identity,p.original)
        const snapshot=await f.patchSnapshot()
        if(leader==='manual055')await assert.rejects(f.patchDirectAccept(p.identity,p.original),e=>e.code==='P0001'&&e.message==='agent_descriptive_patch_request_conflict')
        else await assert.rejects(manual.accept(p.identity,q),e=>e.status===409)
        assert.equal(await f.patchSnapshot(),snapshot);assert.equal(await count(f,'agent_descriptive_patch_acceptances',p.owner,p.original.request_id),leader==='new060'?1:0)
      }
    })

    await t.test('immutable original and review receipts survive real body/feedback erasure and later role/model/epoch changes',async()=>{
      const p=await f.patchReady({isolatedReviewModel:true}),accepted=await f.patchAccept(p,p.original),current=await f.agents.get(p.identity,p.role.id),{require_approval:_,...input}=current.spec
      await f.agents.update(p.identity,current.id,current.name,safeAgentSpec({...input,goal:'Later ordinary owner edit '+randomUUID()}),current.revision)
      await f.eraseOpinion(p);for(const s of p.selected)await f.eraseFeedback(s)
      await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[p.choice.model_binding.connection_id])
      await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_assessment_outputs WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id])).rows[0].n,0)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_feedback_bodies WHERE owner_user_id=$1 AND feedback_id=ANY($2::uuid[])',[p.owner,p.selected.map(s=>s.feedback.feedback_id)])).rows[0].n,0)
      const snapshot=await f.patchSnapshot()
      for(const mode of ['request','review','actual_accept_replay','repo_accept','repo_confirm','repo_receipt']){
        const trace=descriptivePatchTracedPool(f.pool,{fault(sql){if(generatedRecoverySourceRead(sql))throw Error('recovery_attempted_private_or_current_Source')}})
        const closed=new f.h.AgentDescriptivePatchAcceptanceRepository(trace.pool)
        const recovered=mode==='actual_accept_replay'?await f.patchDirectAccept(p.identity,p.original,{pool:trace.pool}):mode.startsWith('repo_')?await closed[mode.slice(5)](p.identity,mode==='repo_receipt'?p.raw.request_id:p.original):await f.patchReceipt(p.identity,mode==='request'?p.original.request_id:p.raw.request_id,mode,{pool:trace.pool,expected:p.original})
        assert.deepEqual(recovered,{...accepted,replayed:true});assert.equal(trace.trace.filter(q=>generatedRecoverySourceRead(q.sql)).length,0);assert.doesNotMatch(JSON.stringify(recovered),privateReceipt)
      }
      assert.equal(await f.patchSnapshot(),snapshot)
      await assert.rejects(f.patchDirectAccept(p.identity,{...p.original,expected_patch_sha256:'0'.repeat(64)}),e=>e.code==='P0001'&&e.message==='agent_descriptive_patch_request_conflict');assert.equal(await f.patchSnapshot(),snapshot)
      assert.equal(await f.patchReceipt(f.identities.bob,p.raw.request_id,'review'),null)
    })

    await t.test('A to B to A configuration and account governance ABA do not revive the immutable paid choice',async()=>{
      const p=await f.patchReady(),role=await f.agents.get(p.identity,p.role.id),{require_approval:_,...input}=role.spec
      await f.agents.update(p.identity,role.id,role.name,safeAgentSpec({...input,goal:'Temporary actual edit '+randomUUID()}),role.revision)
      const changed=await f.agents.get(p.identity,role.id);await f.agents.update(p.identity,role.id,role.name,safeAgentSpec(input),changed.revision)
      const restored=await f.agents.get(p.identity,role.id);assert.deepEqual(restored.spec,role.spec);assert.equal(restored.revision,role.revision+2)
      const before=await f.patchSnapshot();await assert.rejects(f.patchAccept(p,p.original),refused);await assert.rejects(f.patchDirectAccept(p.identity,p.original),refused);assert.equal(await f.patchSnapshot(),before)
      const next=await f.patchReady();await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false,governance_revision=governance_revision+1 WHERE user_id=$1',[next.owner])
      try{await assert.rejects(f.patchAccept(next,next.original),e=>e.status===403)}
      finally{await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=true,governance_revision=governance_revision+1 WHERE user_id=$1',[next.owner])}
      const snapshot=await f.patchSnapshot();await assert.rejects(f.patchDirectAccept(next.identity,next.original),refused);assert.equal(await f.patchSnapshot(),snapshot)
    })

    await t.test('owner-scoped same request/review UUIDs remain separate actual events with no cross-owner recovery',async()=>{
      const reviewId=randomUUID(),requestId=randomUUID(),a=await f.patchReady({who:'alice',reviewId,requestId}),b=await f.patchReady({who:'bob',reviewId,requestId})
      const ar=await f.patchAccept(a,a.original),br=await f.patchAccept(b,b.original)
      assert.equal(ar.request_id,br.request_id);assert.equal(ar.source.review_id,br.source.review_id);assert.notEqual(ar.source.spec_id,br.source.spec_id);assert.notEqual(ar.receipt_sha256,br.receipt_sha256)
      assert.deepEqual(await f.patchReceipt(a.identity,reviewId,'review',{expected:a.original}),{...ar,replayed:true});assert.deepEqual(await f.patchReceipt(b.identity,reviewId,'review',{expected:b.original}),{...br,replayed:true})
      const snapshot=await f.patchSnapshot();await assert.rejects(f.patchDirectAccept(b.identity,a.original),refused);assert.equal(await f.patchSnapshot(),snapshot)
    })

    await t.test('extra new-family FK/ACL/body/schema drift and unchanged059 extra-FK rejection stay strict in real catalogs',async()=>{
      const drift=[
        ['GRANT SELECT ON agentstudio.agent_descriptive_patch_acceptances TO agentstudio_api',false],
        ['GRANT EXECUTE ON FUNCTION agentstudio.agent_descriptive_patch_accept(jsonb) TO agentstudio_review_worker',false],
        ['ALTER TABLE agentstudio.agent_descriptive_patch_acceptances DISABLE ROW LEVEL SECURITY',false],
        ["CREATE OR REPLACE FUNCTION agentstudio.agent_descriptive_patch_receipt(uuid,text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $bad$BEGIN RETURN NULL; END$bad$",false],
        ['CREATE TABLE public.agent_descriptive_patch_shadow(id uuid)',false],
        ['CREATE TABLE public.synthetic_patch_extra_child(owner_user_id uuid,request_id uuid,FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_descriptive_patch_acceptances(owner_user_id,request_id))',false],
        ['CREATE TABLE public.synthetic_patch_old_child(owner_user_id uuid,request_id uuid,FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_generated_acceptances(owner_user_id,request_id))',true],
        ['CREATE INDEX synthetic_patch_extra_index ON agentstudio.agent_descriptive_patch_acceptances(created_at)',false]
      ]
      for(const [ddl,oldMustRefuse] of drift){
        const db=await f.adminPool.connect()
        try{
          await db.query('BEGIN');await db.query(ddl);await db.query('SET LOCAL ROLE agentstudio_api')
          await assert.rejects(verifyAgentDescriptivePatchCredentials(db),/unsafe_agent_descriptive_patch_privileges/)
          if(oldMustRefuse)await assert.rejects(verifyAgentGeneratedCredentials(db),/unsafe_agent_generated_privileges/)
          else assert.equal(await verifyAgentGeneratedCredentials(db),true)
        }finally{await db.query('ROLLBACK');db.release()}
        await fullAudits();assert.equal(await inspectAgentDescriptivePatchSchema(f.pool),true)
      }
    })

    await t.test('provided model text requiring redaction is still rejected by actual057 and produces no acceptance',async()=>{
      const who=f.identities.alice,role=await f.agents.get(who,f.resources.alice.spec.id),reviewId=randomUUID()
      const before=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_descriptive_patch_acceptances')).rows[0].n
      await assert.rejects(f.complete({reviewId,result:{descriptive:{goal:'api_key=synthetic_provided_output_marker_only'},tools_note:'No grant',rationale:'Actual invalid model output'}}),e=>e.code==='P0001'||e.status===400)
      assert.deepEqual((await f.agents.get(who,role.id)).spec,role.spec)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_descriptive_patch_acceptances')).rows[0].n,before)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_assessment_outputs WHERE request_id=$1',[reviewId])).rows[0].n,0)
      const paid=(await f.db.query('SELECT request_sha256 FROM agentstudio.agent_review_requests WHERE owner_user_id=$1 AND request_id=$2',[f.users.alice,reviewId])).rows[0]
      if(paid)await f.closed.change(who,{action:'erase',request_id:randomUUID(),review_id:reviewId,expected_request_sha256:paid.request_sha256,confirm:true})
    })
  }finally{await f.close()}
})
