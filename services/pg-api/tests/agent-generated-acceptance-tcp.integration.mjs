// Authored genuine PG18 tests, NOT local passing evidence. Exact approved
// disposable Linux CI guard runs before dynamic DB/runtime fixture imports.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {generatedAcceptanceTarget,generatedAcceptanceFixture,generatedAcceptanceChoice,generatedPreviewChoice,generatedTracedPool,generatedBounded,generatedManualRoleInput,generatedRecoverySourceRead} from './helpers/agent-generated-acceptance-fixture.mjs'

const unavailable=error=>error.status===409
const sourceLock=/^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1::text,540\)\)/
const bodySql=/^SELECT agentstudio\.agent_opinion_body\(/
const mutatorSql=/^SELECT agentstudio\.agent_generated_accept\(/
const privateFields=/"(?:choice|messages|identity|owner_user_id|model_binding|lease_token|worker_id|descriptive|rationale|tools_note)"|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|api_key/
const observe=promise=>{const state={done:false};state.promise=promise.then(value=>{state.done=true;return {ok:true,value}},error=>{state.done=true;return {ok:false,error}});return state}
async function reached(trace,state,label){await generatedBounded(Promise.race([trace.hit,state.promise.then(reply=>{if(!reply.ok)throw reply.error;throw Error('missing_generated_gate_'+label)})]),label)}
async function success(state,label){const reply=await generatedBounded(state.promise,label);if(!reply.ok)throw reply.error;return reply.value}
async function blocked(admin,waiter,blocker,label){
  const until=Date.now()+7000
  while(Date.now()<until){
    const row=(await admin.query('SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_catalog.pg_stat_activity WHERE pid=$1',[waiter])).rows[0]
    if(row?.wait_event_type==='Lock'&&row.blockers.includes(blocker))return
    await delay(20)
  }
  assert.fail(label+': expected independent PostgreSQL backend lock was not observed')
}
function candidateResult(goal='生成独立配置😀'){
  return {descriptive:{goal,task_scope:'仅描述',deliverables:['核对'],task_plan:[],done_criteria:['留证']},tools_note:'No resource change',rationale:'Protected synthetic output'}
}
const withoutD=spec=>Object.fromEntries(Object.entries(spec).filter(([key])=>!['goal','task_scope','deliverables','task_plan','done_criteria'].includes(key)))
async function prepared(f,options={}){
  const p=await f.complete({...options,result:options.result??candidateResult('生成配置 '+randomUUID())})
  const preview=await f.generated.preview(p.identity,generatedPreviewChoice(p))
  return {...p,preview,original:generatedAcceptanceChoice(preview)}
}

test('generated acceptance foundation on real isolated PG18', {concurrency:false,timeout:600000},async t=>{
  generatedAcceptanceTarget() // no skip, no ambient DATABASE_URL fallback
  const f=await generatedAcceptanceFixture()
  const {AgentGeneratedAcceptanceRepository,AgentReviewLedgerRepository,AgentOptimizationRepository}=f.generatedClasses
  const {AgentReviewSourceRepository}=await import('../src/agent-review-source.ts')
  const {safeAgentSpec}=await import('../src/contracts.ts')
  const {withActor}=await import('../src/repository.ts')
  const {agentDescriptiveLimits:limits}=await import('../../../shared/agent-role-limits.mjs')
  try{
    await t.test('complete maximum output, unsorted multi-feedback and distinct target use real same-client Source, real045/055, and COMMIT publication',async()=>{
      const result=candidateResult('😀'.repeat(limits.goal/2))
      result.descriptive.task_scope='界'.repeat(limits.task_scope)
      for(const [key,char] of [['deliverables','交'],['task_plan','计'],['done_criteria','验']])result.descriptive[key]=Array(limits.list_items).fill(char.repeat(limits.list_item))
      const p=await prepared(f,{feedbackCount:2,targetDistinct:true,reverseSources:true,result})
      assert.notEqual(p.runId,p.preview.anchor.run_id);assert.ok(JSON.stringify(p.preview).length>23000)
      assert.deepEqual(p.preview.candidate.descriptive,result.descriptive)
      assert.deepEqual(p.choice.feedback_sources.map(x=>x.run_id),p.preview.feedback_sources.map(x=>x.run_id).toReversed())
      const before=await f.agents.get(p.identity,p.role.id),beforeRows=await f.snapshot()
      const trace=generatedTracedPool(f.pool,{before:/^COMMIT$/}),repo=new AgentGeneratedAcceptanceRepository(trace.pool,{allowAcceptance:true})
      const real=AgentReviewSourceRepository.prototype.prepareOnClient;let sourceCalls=0,sourceClient
      AgentReviewSourceRepository.prototype.prepareOnClient=async function(identity,db,owner,choice){sourceCalls++;sourceClient=db;assert.equal(owner,p.owner);assert.deepEqual(choice,p.choice);return real.call(this,identity,db,owner,choice)}
      const state=observe(repo.accept(p.identity,p.original))
      try{
        await reached(trace,state,'commit');assert.equal(state.done,false);assert.equal(await f.snapshot(),beforeRows,'uncommitted changes are not externally published')
        trace.release();const receipt=await success(state,'accepted')
        assert.equal(receipt.replayed,false);assert.equal(receipt.source.target_run_id,p.runId);assert.deepEqual(receipt.anchor,p.preview.anchor)
        assert.equal(sourceCalls,1);assert.ok(sourceClient);assert.equal(trace.trace[0].sql,'BEGIN');assert.equal(trace.trace.at(-1).sql,'COMMIT')
        assert.doesNotMatch(JSON.stringify(receipt),privateFields)
        const q=trace.trace,at=re=>q.findIndex(item=>re.test(item.sql))
        const epoch=at(/^SELECT agentstudio\.agent_memory_outcome_epoch/),request=at(/551/),body=at(bodySql),mutator=at(mutatorSql)
        const roleUpdate=at(/^SELECT id,name,spec,revision,requires_approval.* FOR UPDATE$/),roleShare=at(/^SELECT name,spec,revision,.* FOR SHARE$/)
        const runs=[...new Set([p.runId,...p.choice.feedback_sources.map(x=>x.run_id)])].sort()
        assert.deepEqual(q.filter(item=>sourceLock.test(item.sql)).slice(0,runs.length).map(item=>item.values[0]),runs.map(id=>p.owner+':'+id))
        assert.ok(epoch>=0&&request>epoch&&roleUpdate>request&&roleShare>roleUpdate&&body>roleShare&&mutator>body)
        const after=await f.agents.get(p.identity,p.role.id)
        assert.equal(after.name,before.name);assert.equal(after.revision,before.revision+1);assert.deepEqual(withoutD(after.spec),withoutD(before.spec))
        for(const key of ['goal','task_scope','deliverables','task_plan','done_criteria'])assert.deepEqual(after.spec[key],result.descriptive[key])
        const link=(await f.db.query('SELECT * FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.original.request_id])).rows[0]
        assert.equal(link.run_id,p.preview.anchor.run_id);assert.notEqual(link.run_id,p.runId);assert.equal(link.request_sha256,receipt.request_sha256)
        assert.equal(link.before_revision_id,receipt.before.revision_id);assert.equal(link.after_revision_id,receipt.after.revision_id)
        const revisions=(await f.db.query('SELECT id,kind,safe_spec FROM agentstudio.agent_collaboration_revisions WHERE id=ANY($1::uuid[])',[ [receipt.before.revision_id,receipt.after.revision_id] ])).rows
        assert.equal(revisions.length,2);assert.ok(revisions.some(r=>r.kind==='before_edit'));assert.ok(revisions.some(r=>r.kind==='edited'))
        const refs=(await f.db.query('SELECT run_id,feedback_id FROM agentstudio.agent_generated_feedback_refs WHERE owner_user_id=$1 AND request_id=$2 ORDER BY source_ordinal',[p.owner,p.original.request_id])).rows
        assert.deepEqual(refs,p.preview.feedback_sources.map(({run_id,feedback_id})=>({run_id,feedback_id})))
        const row=(await f.db.query('SELECT requires_approval FROM agentstudio.agent_specs WHERE id=$1',[p.role.id])).rows[0];assert.equal(row.requires_approval,true)
        const audit=(await f.db.query("SELECT actor_user_id,owner_user_id FROM agentstudio.audit_events WHERE action='agent.generated_acceptance' AND metadata->>'request_id'=$1",[p.original.request_id])).rows
        assert.deepEqual(audit,[{actor_user_id:p.owner,owner_user_id:p.owner}])
      }finally{trace.release();await state.promise;AgentReviewSourceRepository.prototype.prepareOnClient=real}
    })

    await t.test('independent gate closes only fresh acceptance; malformed bindings/manual055 collisions never attach generated witness',async()=>{
      const p=await prepared(f),baseline=await f.snapshot()
      await assert.rejects(f.generatedClosed.accept(p.identity,p.original),e=>e.status===403&&e.code==='agent_generated_acceptance_disabled')
      assert.equal(await f.snapshot(),baseline)
      for(const patch of [{expected_result_sha256:'0'.repeat(64)},{expected_preview_sha256:'0'.repeat(64)},{expected_candidate_sha256:'0'.repeat(64)},
        {expected_spec_sha256:'0'.repeat(64)},{expected_spec_revision:p.original.expected_spec_revision+1},{anchor_run_id:p.runId===p.original.anchor_run_id?randomUUID():p.runId}]){
        await assert.rejects(f.generated.accept(p.identity,{...p.original,...patch}),unavailable);assert.equal(await f.snapshot(),baseline)
      }
      // A genuine manual055 acceptance with a colliding ID is not generated provenance.
      const feedback=p.selected[0],current=await f.agents.get(p.identity,p.role.id),{require_approval:_,...input}=current.spec
      const manual=new AgentOptimizationRepository(f.pool,{allowAcceptance:true})
      const draft=await manual.preview(p.identity,{action:'preview',spec_id:current.id,run_id:feedback.runId,feedback_id:feedback.feedback.feedback_id,
        expected_feedback_sha256:feedback.feedback.feedback_sha256,expected_spec_revision:current.revision,expected_spec_sha256:p.preview.before.source_sha256,
        name:current.name,spec:generatedManualRoleInput(safeAgentSpec({...input,goal:'Real manual055 collision'}))})
      const original={action:'accept',request_id:p.original.request_id,spec_id:current.id,run_id:feedback.runId,feedback_id:feedback.feedback.feedback_id,
        expected_feedback_sha256:feedback.feedback.feedback_sha256,expected_spec_revision:current.revision,expected_spec_sha256:p.preview.before.source_sha256,
        name:current.name,spec:generatedManualRoleInput(draft.candidate.spec),confirm:true}
      await manual.accept(p.identity,original)
      const manualState=await f.snapshot();await assert.rejects(f.generated.accept(p.identity,p.original),unavailable);assert.equal(await f.snapshot(),manualState)
      await assert.rejects(f.generated.receipt(p.identity,p.raw.request_id),e=>e.status===404)
    })

    await t.test('original replay and metadata receipt survive role/model/feedback/body/epoch changes with fresh scope off and zero source reads',async()=>{
      const p=await prepared(f,{isolatedReviewModel:true}),accepted=await f.generated.accept(p.identity,p.original)
      const role=await f.agents.get(p.identity,p.role.id),{require_approval:_,...input}=role.spec
      await f.agents.update(p.identity,role.id,role.name,safeAgentSpec({...input,goal:'Later independent role edit'}),role.revision)
      await f.eraseOpinion(p);await f.eraseFeedback(p.selected[0])
      const model=p.choice.model_binding.connection_id
      assert.notEqual(model,role.spec.model_binding.connection_id,'closing isolated review model B cannot invalidate the default execution model A')
      await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[model])
      await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
      const snapshot=await f.snapshot()
      for(const operation of ['accept','confirm','receipt']){
          const trace=generatedTracedPool(f.pool,{fault(sql){if(generatedRecoverySourceRead(sql))throw Error('recovery_read_private_or_current_source')}})
          const closed=new AgentGeneratedAcceptanceRepository(trace.pool),receipt=await closed[operation](p.identity,operation==='receipt'?p.raw.request_id:p.original)
          assert.deepEqual(receipt,{...accepted,replayed:true});assert.doesNotMatch(JSON.stringify(receipt),privateFields)
          assert.equal(trace.trace.filter(({sql})=>generatedRecoverySourceRead(sql)).length,0)
      }
      assert.equal(await f.snapshot(),snapshot)
      await assert.rejects(f.generatedClosed.confirm(p.identity,{...p.original,expected_candidate_sha256:'0'.repeat(64)}),e=>e.status===409&&e.code==='agent_generated_request_conflict')
      await assert.rejects(f.generatedClosed.confirm(f.identities.bob,p.original),e=>e.status===404)
      const row=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_assessment_outputs WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id])).rows[0];assert.equal(row.n,0)
      const after=await f.agents.get(p.identity,p.role.id);assert.equal(after.spec.goal,'Later independent role edit')
    })

    await t.test('all partial/non-success/evaluate/stale-source states fail without role, provenance or audit changes',async()=>{
      const cases=[{purpose:'evaluate'}, {status:'failed'}, {status:'unknown'}, {result:{...candidateResult(),descriptive:{goal:'partial is readable but cannot apply'}}}]
      for(const options of cases){
        const p=await f.complete(options),snapshot=await f.snapshot()
        await assert.rejects(f.generated.preview(p.identity,generatedPreviewChoice(p)),unavailable);assert.equal(await f.snapshot(),snapshot)
      }
      const p=await prepared(f)
      await f.eraseOpinion(p);const snapshot=await f.snapshot()
      await assert.rejects(f.generated.accept(p.identity,p.original),unavailable);assert.equal(await f.snapshot(),snapshot)
    })

    await t.test('real failures at055,role,045,link,witness,refs,audit and COMMIT roll the entire compound acceptance back',async()=>{
      for(const point of ['intent','role','history','link','witness','refs','receipt_hash','audit','COMMIT']){
        const p=await prepared(f),snapshot=await f.snapshot()
        const target={intent:['agent_optimization_intents','INSERT'],role:['agent_specs','UPDATE'],history:['agent_collaboration_revisions','INSERT'],link:['agent_optimization_links','INSERT'],
          witness:['agent_generated_acceptances','INSERT'],refs:['agent_generated_feedback_refs','INSERT'],receipt_hash:['agent_generated_acceptances','INSERT'],audit:['audit_events','INSERT']}[point]
        let commitFault=false
        const gate=generatedTracedPool(f.pool,point==='COMMIT'?{fault(sql){if(sql==='COMMIT'){commitFault=true;throw Error('synthetic_generated_COMMIT_failure')}}}:{after:bodySql})
        const repo=new AgentGeneratedAcceptanceRepository(gate.pool,{allowAcceptance:true}),state=observe(repo.accept(p.identity,p.original))
        let installed=false
        try{
          if(target){
            await reached(gate,state,'fault_'+point)
            // nextval is deliberately nontransactional test instrumentation:
            // rollback must not erase proof that the exact fault was reached.
            const marker="PERFORM pg_catalog.nextval('agentstudio.synthetic_generated_fault_counter'::regclass); "
            const fault=marker+(point==='receipt_hash'?"NEW.receipt_sha256:=repeat('0',64); RETURN NEW;":"RAISE EXCEPTION 'synthetic_generated_"+point+"_failure';")
            const when=point==='audit'?" WHEN (NEW.action='agent.generated_acceptance')":""
            // The genuine045 history writer is SECURITY DEFINER owned by
            // agentstudio_collaboration. Its invoker fault trigger needs only
            // USAGE on this disposable marker sequence, not production grants.
            await f.db.exec("CREATE SEQUENCE agentstudio.synthetic_generated_fault_counter; GRANT USAGE ON SEQUENCE agentstudio.synthetic_generated_fault_counter TO agentstudio_collaboration; CREATE FUNCTION agentstudio.synthetic_generated_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN "+fault+" END$$; CREATE TRIGGER synthetic_generated_fault BEFORE "+target[1]+" ON agentstudio."+target[0]+" FOR EACH ROW"+when+" EXECUTE FUNCTION agentstudio.synthetic_generated_fault()")
            installed=true;gate.release()
          }
          const reply=await generatedBounded(state.promise,'failure_'+point);assert.equal(reply.ok,false)
          if(target){
            const detail=JSON.stringify({code:reply.error.code,message:reply.error.message})
            assert.equal((await f.db.query('SELECT is_called FROM agentstudio.synthetic_generated_fault_counter')).rows[0].is_called,true,'exact synthetic_generated_'+point+'_failure/corruption must execute; actual error='+detail)
            if(point==='receipt_hash'){assert.equal(reply.error.status,409);assert.equal(reply.error.code,'agent_generated_unavailable')}
            else{assert.equal(reply.error.code,'P0001',detail);assert.equal(reply.error.message,'synthetic_generated_'+point+'_failure',detail)}
          }
          else{assert.equal(commitFault,true);assert.equal(reply.error.message,'synthetic_generated_COMMIT_failure')}
          assert.ok(gate.trace.some(q=>q.sql==='ROLLBACK'));assert.equal(await f.snapshot(),snapshot,'failure at '+point+' must preserve all old/new/private business rows')
        }finally{
          gate.release();await state.promise
          if(installed)await f.db.exec('DROP TRIGGER synthetic_generated_fault ON agentstudio.'+target[0]+'; DROP FUNCTION agentstudio.synthetic_generated_fault(); DROP SEQUENCE agentstudio.synthetic_generated_fault_counter')
        }
      }
    })

    await t.test('same exact request uses independent backends, observed551 blocking and one genuine config mutation',async()=>{
      const p=await prepared(f),first=generatedTracedPool(f.pool,{after:mutatorSql}),second=generatedTracedPool(f.pool)
      const a=observe(new AgentGeneratedAcceptanceRepository(first.pool,{allowAcceptance:true}).accept(p.identity,p.original))
      let b
      try{
        await reached(first,a,'first_committed_mutator');b=observe(new AgentGeneratedAcceptanceRepository(second.pool,{allowAcceptance:true}).accept(p.identity,p.original))
        const pidA=await first.pid,pidB=await second.pid;assert.notEqual(pidA,pidB)
        await blocked(f.db,pidB,pidA,'same request551');assert.equal(b.done,false)
        first.release();const winner=await success(a,'request_winner'),replay=await success(b,'request_replay')
        assert.deepEqual(replay,{...winner,replayed:true})
        const count=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_generated_acceptances WHERE owner_user_id=$1 AND review_id=$2',[p.owner,p.raw.request_id])).rows[0];assert.equal(count.n,1)
      }finally{first.release();await a.promise;await b?.promise}
    })

    await t.test('same review different IDs and different reviews on same role serialize without double apply or deadlock',async()=>{
      for(const kind of ['same_review','different_review']){
        const p=await prepared(f),other=kind==='same_review'?p:await prepared(f)
        const choice=kind==='same_review'?{...p.original,request_id:randomUUID()}:other.original
        const first=generatedTracedPool(f.pool,{after:mutatorSql}),second=generatedTracedPool(f.pool)
        const a=observe(new AgentGeneratedAcceptanceRepository(first.pool,{allowAcceptance:true}).accept(p.identity,p.original));let b
        try{
          await reached(first,a,kind);b=observe(new AgentGeneratedAcceptanceRepository(second.pool,{allowAcceptance:true}).accept(other.identity,choice))
          const pidA=await first.pid,pidB=await second.pid;assert.notEqual(pidA,pidB);await blocked(f.db,pidB,pidA,kind)
          first.release();await success(a,kind+'_winner');const denied=await generatedBounded(b.promise,kind+'_loser');assert.equal(denied.ok,false);assert.ok(unavailable(denied.error))
          const role=await f.agents.get(p.identity,p.role.id);assert.equal(role.revision,p.preview.before.revision+1)
        }finally{first.release();await a.promise;await b?.promise}
      }
    })

    await t.test('ordinary role edits and genuine old055 acceptance race in both orders with actual blocking backends',async()=>{
      const {AgentSpecRepository}=await import('../src/repository.ts')
      for(const kind of ['ordinary','manual055'])for(const firstKind of ['generated','other']){
        const p=await prepared(f),role=await f.agents.get(p.identity,p.role.id),{require_approval:_,...input}=role.spec
        const candidate=safeAgentSpec({...input,goal:'Other explicit configuration '+randomUUID()})
        const feedback=p.selected[0],manual={action:'accept',request_id:randomUUID(),spec_id:role.id,run_id:feedback.runId,feedback_id:feedback.feedback.feedback_id,
          expected_feedback_sha256:feedback.feedback.feedback_sha256,expected_spec_revision:role.revision,expected_spec_sha256:p.preview.before.source_sha256,name:role.name,spec:generatedManualRoleInput(candidate),confirm:true}
        const generatedTrace=generatedTracedPool(f.pool,firstKind==='generated'?{after:bodySql}:{})
        const otherGate=kind==='manual055'?/^SELECT id,name,spec,revision,.* FOR UPDATE$/:/^UPDATE agentstudio\.agent_specs SET/
        const otherTrace=generatedTracedPool(f.pool,firstKind==='other'?{after:otherGate}:{})
        const generated=()=>observe(new AgentGeneratedAcceptanceRepository(generatedTrace.pool,{allowAcceptance:true}).accept(p.identity,p.original))
        const other=()=>observe(kind==='ordinary'?new AgentSpecRepository(otherTrace.pool).update(p.identity,role.id,role.name,candidate,role.revision):new AgentOptimizationRepository(otherTrace.pool,{allowAcceptance:true}).accept(p.identity,manual))
        let a,b
        const firstTrace=firstKind==='generated'?generatedTrace:otherTrace,secondTrace=firstKind==='generated'?otherTrace:generatedTrace
        try{
          a=firstKind==='generated'?generated():other();await reached(firstTrace,a,kind+'_'+firstKind)
          b=firstKind==='generated'?other():generated()
          const firstPid=await firstTrace.pid,secondPid=await secondTrace.pid;assert.notEqual(firstPid,secondPid)
          await blocked(f.db,secondPid,firstPid,kind+'_'+firstKind);firstTrace.release()
          await success(a,kind+'_'+firstKind+'_winner');const loser=await generatedBounded(b.promise,kind+'_loser')
          // Ordinary owner update's existing CAS contract returns null when a
          // revision lost, while055/generated repositories throw409.
          if(kind==='ordinary'&&firstKind==='generated'){assert.equal(loser.ok,true);assert.equal(loser.value,null)}
          else{assert.equal(loser.ok,false);assert.equal(loser.error.status,409)}
          const after=await f.agents.get(p.identity,role.id);assert.equal(after.revision,role.revision+1)
          if(firstKind==='generated')assert.equal((await f.generated.receipt(p.identity,p.raw.request_id)).recorded,true)
          else{assert.deepEqual(after.spec,candidate);await assert.rejects(f.generated.receipt(p.identity,p.raw.request_id),e=>e.status===404)}
        }finally{firstTrace.release();secondTrace.release();await a?.promise;await b?.promise}
      }
    })

    await t.test('feedback erasure,056 erasure and governance mutation genuinely block behind acceptance and winning erasure prevents later apply',async()=>{
      for(const kind of ['feedback','opinion','governance']){
        const p=await prepared(f),first=generatedTracedPool(f.pool,{after:bodySql})
        const a=observe(new AgentGeneratedAcceptanceRepository(first.pool,{allowAcceptance:true}).accept(p.identity,p.original));let b,other,governor
        try{
          await reached(first,a,'accept_'+kind)
          if(kind==='governance'){
            governor=await f.adminPool.connect();await governor.query('BEGIN')
            const pid=(await governor.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
            b=observe(governor.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner]))
            await blocked(f.db,pid,await first.pid,kind);first.release();await success(a,kind+'_accept');await success(b,kind+'_edit');await governor.query('COMMIT')
          }else{
            other=generatedTracedPool(f.pool)
            if(kind==='opinion')b=observe(new AgentReviewLedgerRepository(other.pool).change(p.identity,{action:'erase',request_id:randomUUID(),review_id:p.raw.request_id,expected_request_sha256:p.parsed.request_sha256,confirm:true}))
            else{
              const {AgentFeedbackRepository}=await import('../src/agent-feedback-repository.ts'),{reviewLedgerFeedbackErase}=await import('./helpers/agent-review-ledger-fixture.mjs')
              const raw=await reviewLedgerFeedbackErase(f,p.selected[0]);b=observe(new AgentFeedbackRepository(other.pool).change(p.identity,raw))
            }
            const otherPid=await other.pid;assert.notEqual(otherPid,await first.pid);await blocked(f.db,otherPid,await first.pid,kind)
            first.release();const accepted=await success(a,kind+'_accept');await success(b,kind+'_erase')
            assert.deepEqual(await f.generatedClosed.confirm(p.identity,p.original),{...accepted,replayed:true})
            assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_assessment_outputs WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id])).rows[0].n,0)
          }
        }finally{first.release();await a.promise;await b?.promise;if(governor){await governor.query('ROLLBACK').catch(()=>{});governor.release()}}
        const next=await prepared(f)
        if(kind==='feedback')await f.eraseFeedback(next.selected[0])
        else if(kind==='opinion')await f.eraseOpinion(next)
        else await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[next.owner])
        const snapshot=await f.snapshot();await assert.rejects(f.generated.accept(next.identity,next.original),unavailable);assert.equal(await f.snapshot(),snapshot)
      }
    })

    await t.test('direct API mutator derives genuine protected result and isolates owners; private tables and worker/dispatch stay denied',async()=>{
      const p=await prepared(f,{feedbackCount:2,targetDistinct:true,reverseSources:true})
      const lower=[...new Set([p.runId,...p.choice.feedback_sources.map(ref=>ref.run_id)])].sort()
      const holder=await f.adminPool.connect(),direct=generatedTracedPool(f.pool)
      let pending,receipt
      try{
        await holder.query('BEGIN')
        const blocker=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
        await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))',[p.owner+':'+lower[0]])
        pending=observe(withActor(direct.pool,p.identity,async db=>(await db.query('SELECT agentstudio.agent_generated_accept($1::jsonb) AS value',[JSON.stringify(p.original)])).rows[0].value))
        const waiter=await direct.pid;assert.notEqual(waiter,blocker);await blocked(f.db,waiter,blocker,'direct SQL first sorted540')
        for(const run of lower.slice(1))assert.equal((await holder.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1::text,540)) AS ok',[p.owner+':'+run])).rows[0].ok,true,'direct SQL must not hold a higher540 while blocked on the lowest')
        await holder.query('SELECT id FROM agentstudio.agent_specs WHERE id=$1 AND owner_user_id=$2 FOR UPDATE NOWAIT',[p.role.id,p.owner])
        await holder.query('SELECT request_id FROM agentstudio.agent_review_requests WHERE owner_user_id=$1 AND request_id=$2 FOR UPDATE NOWAIT',[p.owner,p.raw.request_id])
        await holder.query('COMMIT');receipt=await success(pending,'direct_SQL')
      }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();await pending?.promise}
      assert.equal(receipt.recorded,true);assert.equal(receipt.replayed,false);assert.doesNotMatch(JSON.stringify(receipt),privateFields)
      const shared=randomUUID(),sharedReview=randomUUID(),alice=await prepared(f,{who:'alice',reviewId:sharedReview}),bob=await prepared(f,{who:'bob',reviewId:sharedReview})
      const a=await f.generated.accept(alice.identity,{...alice.original,request_id:shared}),b=await f.generated.accept(bob.identity,{...bob.original,request_id:shared})
      assert.equal(a.source.review_id,sharedReview);assert.equal(b.source.review_id,sharedReview)
      assert.equal(a.request_id,shared);assert.equal(b.request_id,shared)
      assert.notEqual(a.source.spec_id,b.source.spec_id);assert.notEqual(a.source.target_run_id,b.source.target_run_id);assert.notEqual(a.receipt_sha256,b.receipt_sha256)
      assert.deepEqual(await f.generated.receipt(alice.identity,sharedReview),{...a,replayed:true})
      assert.deepEqual(await f.generated.receipt(bob.identity,sharedReview),{...b,replayed:true})
      await assert.rejects(f.generated.receipt(bob.identity,p.raw.request_id),e=>e.status===404)
      await assert.rejects(withActor(f.pool,p.identity,db=>db.query('SELECT agentstudio.agent_generated_receipt($1::uuid,$2::text)',[p.raw.request_id,'reviews'])),e=>e.code==='P0001'&&e.message==='invalid_agent_generated_request')
      for(const table of ['agent_generated_acceptances','agent_generated_feedback_refs'])
        for(const sql of ['SELECT * FROM agentstudio.'+table,'INSERT INTO agentstudio.'+table+' DEFAULT VALUES'])
          await assert.rejects(withActor(f.pool,p.identity,db=>db.query(sql)),e=>e.code==='42501')
      for(const [pool,role] of [[f.workerPool,'agentstudio_review_worker'],[f.dispatchPool,'agentstudio_review_dispatch']]){
        const db=await pool.connect()
        try{
          await db.query('BEGIN');await db.query('SET LOCAL ROLE '+role)
          assert.equal((await db.query("SELECT has_function_privilege(current_user,'agentstudio.agent_generated_accept(jsonb)','EXECUTE') AS ok")).rows[0].ok,false)
          await assert.rejects(db.query('SELECT agentstudio.agent_generated_receipt($1::uuid,$2::text)',[p.raw.request_id,'review']),e=>e.code==='42501')
        }finally{await db.query('ROLLBACK');db.release()}
      }
    })

    await t.test('account disable/re-enable and mapped OIDC SQL callers cannot revive or assume a Native source epoch',async()=>{
      const p=await prepared(f),before=await f.snapshot()
      await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false,governance_revision=governance_revision+1 WHERE user_id=$1',[p.owner])
      try{await assert.rejects(f.generated.accept(p.identity,p.original),e=>e.status===403)}
      finally{await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=true,governance_revision=governance_revision+1 WHERE user_id=$1',[p.owner])}
      await assert.rejects(f.generated.accept(p.identity,p.original),unavailable);assert.equal(await f.snapshot(),before,'governance ABA cannot mutate source or configuration business rows')
      const oidc=randomUUID(),subject='synthetic-generated-oidc-'+randomUUID(),email='generated-'+oidc+'@example.test'
      await f.db.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name,status) VALUES($1,'https://oidc.example.test',$2,'Synthetic foreign mapping','active')",[oidc,subject])
      await f.db.query('INSERT INTO agentstudio_auth.accounts(user_id,email,password_record,enabled) SELECT $1,$2,password_record,true FROM agentstudio_auth.accounts WHERE user_id=$3',[oidc,email,p.owner])
      await assert.rejects(withActor(f.pool,{issuer:'https://oidc.example.test',subject},db=>db.query('SELECT agentstudio.agent_generated_accept($1::jsonb)',[JSON.stringify(p.original)])),e=>e.code==='P0001'&&e.message==='native_employee_identity_required')
      await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[p.owner])
      try{await assert.rejects(f.generated.confirm(p.identity,p.original),e=>e.status===403)}
      finally{await f.db.query("UPDATE agentstudio.users SET status='active' WHERE id=$1",[p.owner]);await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+1 WHERE user_id=$1',[p.owner])}
    })
  }finally{await f.close()}
})
