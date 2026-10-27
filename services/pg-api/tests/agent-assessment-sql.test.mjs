// Hosted serial SQL on disposable synthetic data only. No provider is called.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentAssessmentFixture,assessmentRoles,assessmentRole,assessmentCall,assessmentArgs,assessmentProof,assessmentClaim,assessmentContext,assessmentReserve,
  assessmentFinish,assessmentPause,assessmentRequest,assessmentCancel,assessmentErase,assessmentFeedbackErase,assessmentRows,assessmentCounts,expireAssessmentLease,
  assessmentOutputHash,assessmentEvaluation,assessmentOptimization,assessmentAuditFault} from './helpers/agent-assessment-fixture.mjs'
import {verifyAgentAssessmentCredentials} from '../src/agent-assessment-audit.ts'
import {verifyAgentReviewCredentials} from '../src/agent-review-audit.ts'
import {verifyAgentFeedbackCredentials} from '../src/agent-feedback-audit.ts'
import {withActor} from '../src/repository.ts'

const serial={concurrency:false}
const denied=/permission denied/
const invalid=/agent_assessment_/
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
async function claimFor(f,p,worker=randomUUID()){
  const start=Date.now(),lease=await assessmentClaim(f,worker)
  assert.ok(lease);assert.equal(lease.request_id,p.raw.request_id);assert.equal(lease.worker_id,worker)
  assert.deepEqual(Object.keys(lease).sort(),['request_id','lease_token','lease_version','worker_id','lease_expires_at'].sort())
  assert.match(lease.lease_token,uuid);assert.ok(Number.isSafeInteger(lease.lease_version)&&lease.lease_version>0)
  const ttl=Date.parse(lease.lease_expires_at)-start
  assert.ok(ttl>0&&ttl<=91500,'fixed lease TTL is at most90s plus scheduling tolerance')
  assert.doesNotMatch(JSON.stringify(lease),/messages|choice|owner_user_id|api_key|identity|model_binding/)
  return assessmentProof(lease)
}
async function assertTamper(f,label,mutation){
  await f.db.exec('BEGIN')
  try{await f.db.exec(mutation);await assert.rejects(verifyAgentAssessmentCredentials(f.db),/unsafe_agent_assessment_privileges/,label)}
  finally{await f.db.exec('ROLLBACK')}
  assert.equal(await verifyAgentAssessmentCredentials(f.db),true,'rollback restores '+label)
}
async function assertSealedContext(f,p,proof){
  const context=await assessmentContext(f,proof)
  assert.deepEqual(context.identity,p.identity);assert.equal(context.owner_user_id,p.owner);assert.equal(context.request_id,p.raw.request_id)
  for(const key of ['purpose','request_sha256','input_sha256','content_sha256','owner_epoch','source_protocol'])assert.equal(context[key],p.receipt[key])
  assert.deepEqual(context.choice,p.choice);assert.deepEqual(context.messages,p.prepared.messages)
  assert.doesNotMatch(JSON.stringify(context.messages),/api_key|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|checkpoint/)
  return context
}

test('optional057 inventory, protected roles/routines, full predecessor audit and actual API/old-Worker table denials fail closed on drift',serial,async()=>{
  const f=await agentAssessmentFixture({installed:false})
  try{
    assert.equal(await verifyAgentAssessmentCredentials(f.db),false)
    await f.db.exec('BEGIN')
    try{await f.db.exec('CREATE TABLE agentstudio.agent_assessment_orphan(id integer)');await assert.rejects(verifyAgentAssessmentCredentials(f.db),/unsafe_agent_assessment_privileges/)}
    finally{await f.db.exec('ROLLBACK')}
    assert.equal(await verifyAgentAssessmentCredentials(f.db),false)
    await f.db.exec(f.sql('migrations/pg_v9_057_agent_assessment_execution.sql'))
    assert.equal(await verifyAgentAssessmentCredentials(f.db),true)
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentReviewCredentials),true)
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentFeedbackCredentials),true)
    for(const [label,mutation] of [
      ['API lease read','GRANT SELECT ON agentstudio.agent_assessment_leases TO agentstudio_api'],
      ['Worker private output read','GRANT SELECT ON agentstudio.agent_assessment_outputs TO agentstudio_review_worker'],
      ['dispatch output write','GRANT INSERT ON agentstudio.agent_assessment_outputs TO agentstudio_review_dispatch'],
      ['API explicit MAINTAIN','GRANT MAINTAIN ON agentstudio.agent_assessment_outputs TO agentstudio_api'],
      ['field grant','GRANT UPDATE(lease_token) ON agentstudio.agent_assessment_leases TO agentstudio_review_worker'],
      ['API claim grant','GRANT EXECUTE ON FUNCTION agentstudio.agent_assessment_claim(uuid) TO agentstudio_api'],
      ['legacy invite PUBLIC EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.reject_invite_snapshot_mutation() TO PUBLIC'],
      ['Worker context grant','GRANT EXECUTE ON FUNCTION agentstudio.agent_assessment_context(uuid,uuid,bigint,uuid) TO agentstudio_review_worker'],
      ['reserve security','ALTER FUNCTION agentstudio.agent_assessment_reserve(uuid,uuid,bigint,uuid) SECURITY INVOKER'],
      ['finish search path','ALTER FUNCTION agentstudio.agent_assessment_finish(uuid,uuid,bigint,uuid,jsonb) SET search_path=public'],
      ['claim source','CREATE OR REPLACE FUNCTION agentstudio.agent_assessment_claim(uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN RETURN NULL; END$$'],
      ['worker inheritance','ALTER ROLE agentstudio_review_worker INHERIT'],
      ['old Worker membership','GRANT agentstudio_review_dispatch TO agentstudio_worker'],
      ['output force RLS','ALTER TABLE agentstudio.agent_assessment_outputs NO FORCE ROW LEVEL SECURITY'],
      ['extra output trigger',`CREATE FUNCTION agentstudio.synthetic_assessment_extra() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
        REVOKE ALL ON FUNCTION agentstudio.synthetic_assessment_extra() FROM PUBLIC;
        CREATE TRIGGER synthetic_assessment_extra BEFORE INSERT ON agentstudio.agent_assessment_outputs FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_assessment_extra()`],
      ['missing stamp',"DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_057'"],
      ['partial schema','DROP TABLE agentstudio.agent_assessment_outputs'],
      ['extra prefixed object','CREATE TABLE agentstudio.agent_assessment_orphan(id integer)']
    ])await assertTamper(f,label,mutation)
    const snapshot={goal:'Synthetic reviewed immutable invite snapshot'},inviteColumns='id,owner_user_id,source_spec_id,safe_snapshot,token_hash,expires_at,created_at'
    const tokenHash=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','')
    const invite=(await withActor(f.pool,f.identities.alice,(db,owner)=>db.query(
      'INSERT INTO agentstudio.template_invites(owner_user_id,source_spec_id,safe_snapshot,token_hash,expires_at) VALUES($1,$2,$3::jsonb,$4,clock_timestamp()+interval \'1 hour\') RETURNING '+inviteColumns,
      [owner,f.resources.alice.spec.id,JSON.stringify(snapshot),tokenHash]))).rows[0]
    assert.ok(invite);assert.deepEqual(invite.safe_snapshot,snapshot)
    const caller=(await withActor(f.pool,f.identities.alice,db=>db.query("SELECT has_function_privilege(current_user,'agentstudio.reject_invite_snapshot_mutation()','EXECUTE') AS execute"))).rows[0]
    assert.equal(caller.execute,false,'ordinary API cannot directly execute the old trigger function after057')
    await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(
      'UPDATE agentstudio.template_invites SET safe_snapshot=$2::jsonb WHERE id=$1',[invite.id,JSON.stringify({goal:'Forbidden replacement snapshot'})])),
      error=>error.code==='23514'&&/immutable_template_invite_fields/.test(error.message),'the original installed trigger must still enforce immutable snapshots')
    const unchanged=(await withActor(f.pool,f.identities.alice,db=>db.query('SELECT '+inviteColumns+' FROM agentstudio.template_invites WHERE id=$1',[invite.id]))).rows[0]
    assert.deepEqual(unchanged,invite,'rejected snapshot UPDATE leaves every original immutable field intact')
    const revoked=(await withActor(f.pool,f.identities.alice,db=>db.query('UPDATE agentstudio.template_invites SET revoked_at=clock_timestamp() WHERE id=$1 RETURNING safe_snapshot,revoked_at',[invite.id]))).rows[0]
    assert.deepEqual(revoked.safe_snapshot,snapshot);assert.ok(revoked.revoked_at,'permitted lifecycle UPDATE still passes the installed trigger')
    assert.equal(await verifyAgentAssessmentCredentials(f.db),true)
    for(const role of ['agentstudio_api','agentstudio_worker',...Object.values(assessmentRoles)])for(const suffix of ['leases','effects','outcomes','outputs']){
      const table='agentstudio.agent_assessment_'+suffix
      for(const sql of ['INSERT INTO '+table+' DEFAULT VALUES','UPDATE '+table+' SET request_id=request_id','DELETE FROM '+table,'TRUNCATE '+table])
        await assert.rejects(assessmentRole(f,role,db=>db.query(sql)),denied,role+' '+sql)
      if(role!=='agentstudio_api'||['leases','outputs'].includes(suffix))
        await assert.rejects(assessmentRole(f,role,db=>db.query('SELECT * FROM '+table)),denied)
    }
    const proof={request_id:randomUUID(),lease_token:randomUUID(),lease_version:1,worker_id:randomUUID()}
    for(const role of ['agentstudio_api','agentstudio_worker','agentstudio_model_broker','agentstudio_native_auth','agentstudio_bound_dispatch'])for(const name of ['claim','context','reserve','finish','pause'])
      await assert.rejects(assessmentCall(f,role,name,name==='claim'?[proof.worker_id]:[...assessmentArgs(proof),...(name==='finish'?[{status:'unknown',failure_code:'synthetic_timeout'}]:[])]),denied)
    for(const name of ['context','reserve','finish'])await assert.rejects(assessmentCall(f,assessmentRoles.worker,name,[...assessmentArgs(proof),...(name==='finish'?[{status:'failed',failure_code:'synthetic_failure'}]:[])]),denied)
    for(const name of ['claim','pause'])await assert.rejects(assessmentCall(f,assessmentRoles.dispatch,name,name==='claim'?[proof.worker_id]:assessmentArgs(proof)),denied)
  }finally{await f.close()}
})

test('claim derives the real owner, returns only an opaque90s proof, safely reclaims expired pre-effect work and never reclaims after any committed reservation',serial,async()=>{
  const f=await agentAssessmentFixture()
  try{
    const p=await assessmentRequest(f,{purpose:'optimize'}),first=await claimFor(f,p),before=await assessmentCounts(f)
    assert.equal(first.lease_version,1)
    await assertSealedContext(f,p,first)
    assert.equal(await assessmentClaim(f),null,'an active lease is not concurrently claimable')
    for(const patch of [{request_id:randomUUID()},{lease_token:randomUUID()},{lease_version:2},{worker_id:randomUUID()}]){
      await assert.rejects(assessmentContext(f,{...first,...patch}),invalid)
      await assert.rejects(assessmentReserve(f,{...first,...patch}),invalid)
    }
    assert.deepEqual(await assessmentCounts(f),before)
    await expireAssessmentLease(f,first)
    await assert.rejects(assessmentContext(f,first),invalid)
    await assert.rejects(assessmentReserve(f,first),invalid)
    const second=await claimFor(f,p)
    assert.equal(second.lease_version,first.lease_version+1);assert.notEqual(second.lease_token,first.lease_token);assert.notEqual(second.worker_id,first.worker_id)
    await assert.rejects(assessmentContext(f,first),invalid)
    await assert.rejects(assessmentPause(f,first),invalid)
    await assertSealedContext(f,p,second)
    await assessmentReserve(f,second)
    const reserved=await assessmentRows(f,p.raw.request_id)
    assert.equal(reserved.leases.length,1);assert.equal(reserved.effects.length,1);assert.equal(reserved.outcomes.length,0);assert.equal(reserved.outputs.length,0)
    for(const key of ['owner_user_id','request_id','request_sha256','input_sha256','content_sha256'])
      assert.equal(reserved.effects[0][key],key==='owner_user_id'?p.owner:key==='request_id'?p.raw.request_id:p.receipt[key])
    await assert.rejects(assessmentReserve(f,second),invalid,'a prior reservation can never authorize another POST')
    await expireAssessmentLease(f,second)
    assert.equal(await assessmentClaim(f),null,'even an expired reserved lease is permanently non-reclaimable')
    await assert.rejects(assessmentFinish(f,second,{status:'succeeded',result:assessmentOptimization()}),invalid)
    assert.deepEqual((await assessmentRows(f,p.raw.request_id)).effects,reserved.effects)
    const foreign=await assessmentRequest(f,{who:'bob',purpose:'evaluate'})
    await assert.rejects(assessmentContext(f,{...second,request_id:foreign.raw.request_id}),invalid)
    const ownedForeign=await claimFor(f,foreign)
    assert.equal((await assessmentContext(f,ownedForeign)).owner_user_id,foreign.owner)
  }finally{await f.close()}
})

test('strict successful completions preserve zero scores/full descriptive capacity, seal canonical output hashes and replay once without role edits or old effects',serial,async()=>{
  const f=await agentAssessmentFixture()
  try{
    for(const purpose of ['evaluate','optimize']){
      const p=await assessmentRequest(f,{purpose}),proof=await claimFor(f,p),result=purpose==='evaluate'?assessmentEvaluation():assessmentOptimization(),completion={status:'succeeded',result}
      const role=await f.agents.get(p.identity,p.role.id)
      await assessmentReserve(f,proof)
      const before=await assessmentCounts(f)
      const invalidResults=purpose==='evaluate'?[{...result,score:-1},{...result,owner_user_id:p.owner},{...result,dimensions:result.dimensions.slice(1)}]:
        [{...result,descriptive:{...result.descriptive,tools:['web_fetch']}},{...result,accepted:true},{...result,descriptive:{goal:'界'.repeat(3001)}}]
      for(const value of invalidResults)await assert.rejects(assessmentFinish(f,proof,{status:'succeeded',result:value}),invalid)
      for(const value of [{status:'succeeded',result,owner_user_id:p.owner},{status:'failed',failure_code:'contains secret token=bad value'},{status:'unknown',failure_code:'synthetic_timeout',result}])
        await assert.rejects(assessmentFinish(f,proof,value),invalid)
      assert.deepEqual(await assessmentCounts(f),before)
      await assessmentFinish(f,proof,completion)
      const rows=await assessmentRows(f,p.raw.request_id)
      assert.equal(rows.effects.length,1);assert.equal(rows.outcomes.length,1);assert.equal(rows.outputs.length,1)
      assert.equal(rows.outcomes[0].status,'succeeded')
      assert.deepEqual(rows.outputs[0].result,result)
      assert.equal(rows.outputs[0].result_sha256,assessmentOutputHash(p,result))
      assert.equal(rows.outcomes[0].result_sha256,rows.outputs[0].result_sha256)
      assert.equal(rows.outputs[0].owner_user_id,p.owner)
      const recorded=await assessmentCounts(f)
      await assessmentFinish(f,proof,completion)
      assert.deepEqual(await assessmentCounts(f),recorded,'completion replay is readonly')
      const changed=purpose==='evaluate'?{...result,score:1}:{...result,rationale:'Different original result'}
      await assert.rejects(assessmentFinish(f,proof,{status:'succeeded',result:changed}),invalid)
      assert.deepEqual(await assessmentCounts(f),recorded)
      assert.equal(recorded.old_effects,before.old_effects);assert.equal(recorded.old_jobs,before.old_jobs)
      assert.equal(recorded.role_acceptances,before.role_acceptances);assert.equal(recorded.role_history,before.role_history)
      assert.deepEqual(await f.agents.get(p.identity,p.role.id),role)
    }
  }finally{await f.close()}
})

test('two Native owners deliberately reuse one request UUID without cross-binding lease proofs, effects, outputs or erasure',serial,async()=>{
  const f=await agentAssessmentFixture()
  try{
    const requestId=randomUUID(),alice=await assessmentRequest(f,{requestId,purpose:'evaluate'}),bob=await assessmentRequest(f,{requestId,who:'bob',purpose:'evaluate'})
    assert.equal(alice.raw.request_id,bob.raw.request_id);assert.notEqual(alice.owner,bob.owner)
    const firstAlice=await claimFor(f,alice),bobProof=await claimFor(f,bob)
    assert.notEqual(firstAlice.lease_token,bobProof.lease_token)
    assert.equal((await assessmentContext(f,firstAlice)).owner_user_id,alice.owner)
    assert.equal((await assessmentContext(f,bobProof)).owner_user_id,bob.owner)
    await expireAssessmentLease(f,firstAlice)
    const aliceProof=await claimFor(f,alice)
    assert.equal(aliceProof.lease_version,2);assert.equal(bobProof.lease_version,1)
    for(const mixed of [
      {...aliceProof,lease_token:bobProof.lease_token},
      {...bobProof,lease_token:aliceProof.lease_token},
      {...aliceProof,worker_id:bobProof.worker_id},
      {...bobProof,worker_id:aliceProof.worker_id},
      {...aliceProof,lease_version:bobProof.lease_version},
      {...bobProof,lease_version:aliceProof.lease_version}
    ]){
      await assert.rejects(assessmentContext(f,mixed),invalid)
      await assert.rejects(assessmentReserve(f,mixed),invalid)
      await assert.rejects(assessmentPause(f,mixed),invalid)
    }
    const aliceResult=assessmentEvaluation(),bobResult={...assessmentEvaluation(),score:7}
    await assessmentReserve(f,aliceProof);await assessmentReserve(f,bobProof)
    await assert.rejects(assessmentFinish(f,{...aliceProof,lease_token:bobProof.lease_token},{status:'succeeded',result:aliceResult}),invalid)
    await assessmentFinish(f,aliceProof,{status:'succeeded',result:aliceResult})
    await assessmentFinish(f,bobProof,{status:'succeeded',result:bobResult})
    const aliceRows=await assessmentRows(f,requestId,alice.owner),bobRows=await assessmentRows(f,requestId,bob.owner)
    for(const rows of [aliceRows,bobRows])for(const table of ['leases','effects','outcomes','outputs'])assert.equal(rows[table].length,1)
    assert.equal(aliceRows.effects[0].owner_user_id,alice.owner);assert.equal(bobRows.effects[0].owner_user_id,bob.owner)
    assert.equal(aliceRows.outputs[0].result_sha256,assessmentOutputHash(alice,aliceResult))
    assert.equal(bobRows.outputs[0].result_sha256,assessmentOutputHash(bob,bobResult))
    await assessmentErase(f,alice)
    assert.equal((await assessmentRows(f,requestId,alice.owner)).outputs.length,0)
    assert.deepEqual(await assessmentRows(f,requestId,bob.owner),bobRows,'Alice erasure must not affect Bob despite equal request UUID')
    assert.equal((await f.closed.confirm(bob.identity,bob.raw)).body_erased,false)
    assert.equal((await f.closed.confirm(alice.identity,alice.raw)).body_erased,true)
  }finally{await f.close()}
})

test('failed/unknown outcomes and a worker transport pause retain the one reservation, publish no body and never turn uncertainty into resending or an invented provider disposition',serial,async()=>{
  const f=await agentAssessmentFixture()
  try{
    for(const status of ['failed','unknown','pause']){
      const p=await assessmentRequest(f),proof=await claimFor(f,p)
      await assessmentReserve(f,proof)
      const before=await assessmentCounts(f)
      if(status==='pause')await assessmentPause(f,proof)
      else await assessmentFinish(f,proof,{status,failure_code:'synthetic_'+status})
      const rows=await assessmentRows(f,p.raw.request_id)
      assert.equal(rows.effects.length,1);assert.equal(rows.outputs.length,0);assert.equal(rows.outcomes.length,status==='pause'?0:1)
      if(status!=='pause'){
        assert.equal(rows.outcomes[0].status,status)
        assert.equal(rows.outcomes[0].failure_code,'synthetic_'+status)
        assert.doesNotMatch(JSON.stringify(rows.outcomes),/"result"\s*:\s*\{|"score"|"descriptive"/)
      }
      await expireAssessmentLease(f,proof)
      assert.equal(await assessmentClaim(f),null)
      await assert.rejects(assessmentReserve(f,proof),invalid)
      const after=await assessmentCounts(f)
      assert.equal(after.old_jobs,before.old_jobs);assert.equal(after.old_effects,before.old_effects)
    }
  }finally{await f.close()}
})

test('current Native epoch, cancellation, erasure and feedback replacement invalidate dispatch context and late output publication without reopening reserved work',serial,async()=>{
  const f=await agentAssessmentFixture()
  try{
    for(const action of ['cancel','erase','feedback_correction','feedback_erase','epoch']){
      const p=await assessmentRequest(f,{purpose:'optimize'}),proof=await claimFor(f,p)
      await assessmentReserve(f,proof)
      if(action==='cancel')await assessmentCancel(f,p)
      if(action==='erase')await assessmentErase(f,p)
      if(action==='feedback_erase')await assessmentFeedbackErase(f,p)
      if(action==='feedback_correction'){
        const state=await f.feedback.status(p.identity,p.runId)
        await f.feedback.change(p.identity,{...p.feedbackRaw,request_id:randomUUID(),expected_revision:state.revision})
      }
      if(action==='epoch')await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
      const before=await assessmentCounts(f)
      await assert.rejects(assessmentContext(f,proof),invalid,action+' context')
      await assert.rejects(assessmentFinish(f,proof,{status:'succeeded',result:assessmentOptimization()}),invalid,action+' late finish')
      assert.deepEqual(await assessmentCounts(f),before)
      const rows=await assessmentRows(f,p.raw.request_id)
      assert.equal(rows.effects.length,1);assert.equal(rows.outputs.length,0);assert.equal(rows.outcomes.length,0)
      assert.equal(await assessmentClaim(f),null,action+' must not reopen reserved work')
    }
    for(const action of ['cancel','erase','epoch']){
      const p=await assessmentRequest(f)
      if(action==='cancel')await assessmentCancel(f,p)
      if(action==='erase')await assessmentErase(f,p)
      if(action==='epoch')await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
      assert.equal(await assessmentClaim(f),null,action+' before claim is ineligible')
      assert.equal((await assessmentRows(f,p.raw.request_id)).leases.length,0)
    }
  }finally{await f.close()}
})

test('output FK physically cascades with056 input erasure while immutable effects/outcomes survive; neither late finish nor erased-request replay restores generated text',serial,async()=>{
  const f=await agentAssessmentFixture()
  try{
    const foreign=(await f.db.query(`SELECT confrelid::regclass::text AS target,confdeltype AS deletion,
      ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns
      FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_assessment_outputs'::regclass AND contype='f'`)).rows
    assert.ok(foreign.some(v=>v.target==='agentstudio.agent_review_inputs'&&v.deletion==='c'&&JSON.stringify(v.columns)===JSON.stringify(['owner_user_id','request_id'])))
    for(const action of ['erase','feedback_correction','feedback_erase']){
      const p=await assessmentRequest(f,{purpose:'optimize'}),proof=await claimFor(f,p),completion={status:'succeeded',result:assessmentOptimization()}
      await assessmentReserve(f,proof);await assessmentFinish(f,proof,completion)
      const original=await assessmentRows(f,p.raw.request_id)
      assert.equal(original.outputs.length,1)
      if(action==='erase')await assessmentErase(f,p)
      else if(action==='feedback_erase')await assessmentFeedbackErase(f,p)
      else{const state=await f.feedback.status(p.identity,p.runId);await f.feedback.change(p.identity,{...p.feedbackRaw,request_id:randomUUID(),expected_revision:state.revision})}
      const erased=await assessmentRows(f,p.raw.request_id)
      assert.equal(erased.outputs.length,0);assert.deepEqual(erased.effects,original.effects);assert.deepEqual(erased.outcomes,original.outcomes)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_review_inputs WHERE request_id=$1',[p.raw.request_id])).rows[0].n,0)
      const before=await assessmentCounts(f)
      // Original immutable completion confirms metadata without restoring any
      // physically erased body or producing a second outcome/audit record.
      const replay=await assessmentFinish(f,proof,completion)
      assert.equal(replay.state,'succeeded');assert.equal(replay.result_sha256,original.outcomes[0].result_sha256)
      assert.equal((await f.closed.submit(p.identity,p.raw)).body_erased,true)
      assert.deepEqual(await assessmentCounts(f),before)
      assert.equal((await assessmentRows(f,p.raw.request_id)).outputs.length,0)
      assert.equal(await assessmentClaim(f),null)
    }
  }finally{await f.close()}
})

test('each mandatory assessment audit failure atomically rolls claim, reservation, finish/output and pause back; only successful retry changes durable state',serial,async()=>{
  const f=await agentAssessmentFixture()
  try{
    const p=await assessmentRequest(f),worker=randomUUID(),before=await assessmentCounts(f)
    await assessmentAuditFault(f,()=>assert.rejects(assessmentClaim(f,worker),/synthetic_assessment_audit_failed/))
    assert.deepEqual(await assessmentCounts(f),before)
    const proof=await claimFor(f,p,worker),claimed=await assessmentRows(f,p.raw.request_id),claimCounts=await assessmentCounts(f)
    await assessmentAuditFault(f,()=>assert.rejects(assessmentReserve(f,proof),/synthetic_assessment_audit_failed/))
    assert.deepEqual(await assessmentCounts(f),claimCounts);assert.deepEqual(await assessmentRows(f,p.raw.request_id),claimed)
    await assessmentReserve(f,proof)
    const reserved=await assessmentRows(f,p.raw.request_id),reservedCounts=await assessmentCounts(f),completion={status:'succeeded',result:assessmentEvaluation()}
    await assessmentAuditFault(f,()=>assert.rejects(assessmentFinish(f,proof,completion),/synthetic_assessment_audit_failed/))
    assert.deepEqual(await assessmentCounts(f),reservedCounts);assert.deepEqual(await assessmentRows(f,p.raw.request_id),reserved)
    await assessmentFinish(f,proof,completion)
    assert.equal((await assessmentRows(f,p.raw.request_id)).outputs.length,1)
    const next=await assessmentRequest(f),nextProof=await claimFor(f,next)
    await assessmentReserve(f,nextProof)
    const pauseBefore=await assessmentCounts(f),pauseRows=await assessmentRows(f,next.raw.request_id)
    await assessmentAuditFault(f,()=>assert.rejects(assessmentPause(f,nextProof),/synthetic_assessment_audit_failed/))
    assert.deepEqual(await assessmentCounts(f),pauseBefore);assert.deepEqual(await assessmentRows(f,next.raw.request_id),pauseRows)
    await assessmentPause(f,nextProof)
    assert.equal((await assessmentRows(f,next.raw.request_id)).outcomes.length,0)
    const after=await assessmentCounts(f)
    assert.equal(after.effects,2);assert.equal(after.outputs,1);assert.equal(after.outcomes,1)
    assert.equal(after.old_effects,before.old_effects);assert.equal(after.role_acceptances,before.role_acceptances)
  }finally{await f.close()}
})
