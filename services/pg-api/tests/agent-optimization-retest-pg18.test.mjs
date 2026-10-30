// Additional F29 acceptance in a fresh matrix instance of the explicitly
// admitted F27 database job. Its own PG18 service avoids reusing another
// suite's data. No ordinary/local database or provider call.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {requireApprovalDelegationGenuineCi} from './helpers/approval-delegation-genuine-guard.mjs'
import {approvalDelegationGenuineFixture} from './helpers/approval-delegation-genuine-fixture.mjs'
test('F29 actual PG18 accepted optimization to explicit owned retest and original recovery',{concurrency:false,timeout:600000},async t=>{
 if(process.env.AGENT_STUDIO_F27_GENUINE_SUITE!=='database')throw Error('optimization_retest_owned_database_suite_required')
 requireApprovalDelegationGenuineCi()
 const [{AutonomousAgentRunRepository},{AgentFeedbackRepository},{AgentOptimizationRepository},{withActor}]=await Promise.all([import('../src/autonomous-agent-run-repository.ts'),import('../src/agent-feedback-repository.ts'),import('../src/agent-optimization-repository.ts'),import('../src/repository.ts')])
 const f=await approvalDelegationGenuineFixture(),alice=await f.identityFor('alice'),bob=await f.identityFor('bob')
 const feedback=new AgentFeedbackRepository(f.pool,{allowSubmit:true}),opt=new AgentOptimizationRepository(f.pool,{allowAcceptance:true}),runs=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true,allowOptimizationRetest:true})
 const count=async()=>(await f.db.query("SELECT (SELECT count(*)::integer FROM agentstudio.runs) runs,(SELECT count(*)::integer FROM agentstudio.jobs) jobs,(SELECT count(*)::integer FROM agentstudio.external_effects) effects,(SELECT count(*)::integer FROM agentstudio.audit_events WHERE metadata ? 'optimization_retest') links")).rows[0]
 const step=async(name,fn)=>{let cause;await t.test(name,async()=>{try{await fn()}catch(e){cause=e;throw e}});if(cause)throw cause}
 let source,accepted,raw,first,after
 try{
  await step('actual original API login over loopback PG18 and real Native sessions',async()=>{
   const db=await f.pool.connect();try{await db.query('BEGIN READ ONLY');const original=(await db.query('SELECT session_user login,current_user role,current_setting(\'server_version_num\')::integer version')).rows[0];assert.equal(original.login,db.connectionParameters.user);assert.notEqual(original.login,'agentstudio_admin');assert.equal(db.connection.stream.remoteAddress,'127.0.0.1');assert.equal(db.connection.stream.remotePort,5432);assert.ok(original.version>=180000&&original.version<190000);assert.equal(alice.issuer,'urn:agentstudio:local:v1');assert.equal(bob.issuer,alice.issuer)}finally{await db.query('ROLLBACK');db.release()}
  })
  await step('original feedback and explicit role acceptance create no new task or external effect',async()=>{
   const role=await f.agents.get(alice,f.resources.alice.spec.id)
   source=await f.owned.submit(alice,role.id,{expected_revision:role.revision,max_steps:1,idempotency_key:'f29-source-'+randomUUID(),instruction:'Synthetic F29 original task'})
   await f.owned.cancel(alice,source.run.id)
   const status=await feedback.status(alice,source.run.id),statement=await feedback.change(alice,{action:'submit',request_id:randomUUID(),spec_id:role.id,run_id:source.run.id,expected_revision:0,expected_source_sha256:status.source.source_sha256,rating:'down',tags:['复测'],comment:'Synthetic accepted source needs one explicit new trial',remember_lesson:false,confirm:true})
   const current=await f.agents.get(alice,role.id),{require_approval:_,...spec}=current.spec
   const digest=(await withActor(f.pool,alice,db=>db.query('SELECT agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) sha FROM agentstudio.agent_specs WHERE id=$1::uuid',[role.id]))).rows[0].sha
   const before=await count();accepted=await opt.accept(alice,{action:'accept',request_id:randomUUID(),spec_id:role.id,run_id:source.run.id,feedback_id:statement.feedback_id,expected_feedback_sha256:statement.feedback_sha256,expected_spec_revision:current.revision,expected_spec_sha256:digest,name:current.name,spec:{...spec,goal:'Synthetic F29 accepted role for explicit retest'},confirm:true})
   assert.deepEqual(await count(),before)
   raw={expected_revision:accepted.after_spec_revision,max_steps:1,idempotency_key:'f29-retest-'+randomUUID(),instruction:'Explicit synthetic new retest',optimization_lineage_id:accepted.request_id}
  })
  await step('default-off, another identity and another Owner cannot acquire retest authority',async()=>{
   const before=await count()
   await assert.rejects(new AutonomousAgentRunRepository(f.pool).submit(alice,accepted.spec_id,raw),e=>e.status===403&&e.code==='agent_optimization_retest_disabled')
   await assert.rejects(runs.submit({...alice,issuer:'urn:synthetic:other'},accepted.spec_id,raw),e=>e.status===403)
   await assert.rejects(runs.submit(bob,accepted.spec_id,raw),e=>e.status===404)
   assert.deepEqual(await count(),before)
  })
  await step('one original admission commits the run, job and immutable accepted-source association',async()=>{
   const before=await count();first=await runs.submit(alice,accepted.spec_id,raw);after=await count()
   assert.equal(first.run.status,'queued');assert.notEqual(first.run.id,source.run.id)
   assert.deepEqual(first.optimization_retest,{protocol:'agent_optimization_retest_v1',run_id:first.run.id,acceptance_request_id:accepted.request_id,source_run_id:source.run.id,spec_id:accepted.spec_id,spec_revision:accepted.after_spec_revision,source_sha256:accepted.after_spec_sha256,feedback_id:accepted.feedback_id,feedback_sha256:accepted.feedback_sha256,after_revision_id:accepted.after_revision_id})
   assert.equal(after.runs,before.runs+1);assert.equal(after.jobs,before.jobs+1);assert.equal(after.effects,before.effects);assert.equal(after.links,before.links+1)
   assert.deepEqual((await runs.get(alice,first.run.id)).optimization_retest,first.optimization_retest);assert.equal(await runs.get(bob,first.run.id),null)
   const key='f29-rollback-'+randomUUID();await assert.rejects(withActor(f.pool,alice,async(db,owner)=>{await runs.admitOwned(db,owner,accepted.spec_id,{...raw,idempotency_key:key});throw Error('synthetic_f29_rollback')}),/synthetic_f29_rollback/);assert.deepEqual(await count(),after)
  })
  await step('lost original recovers once; changed or omitted association cannot reuse its key',async()=>{
   const replay=await runs.submit(alice,accepted.spec_id,raw);assert.equal(replay.replayed,true);assert.equal(replay.run.id,first.run.id)
   const {optimization_lineage_id:_,...without}=raw
   for(const changed of [without,{...raw,optimization_lineage_id:randomUUID()}])await assert.rejects(runs.submit(alice,accepted.spec_id,changed),e=>e.status===409&&e.code==='idempotency_key_conflict')
   const status=await feedback.status(alice,source.run.id);await feedback.change(alice,{action:'erase_feedback',request_id:randomUUID(),spec_id:accepted.spec_id,run_id:source.run.id,expected_revision:status.revision,expected_feedback_sha256:status.current.feedback_sha256,confirm:true})
   await assert.rejects(runs.submit(alice,accepted.spec_id,{...raw,idempotency_key:'f29-changed-'+randomUUID()}),e=>e.status===409&&e.code==='agent_optimization_feedback_changed')
   assert.equal((await runs.submit(alice,accepted.spec_id,raw)).run.id,first.run.id);assert.deepEqual(await count(),after);await f.assertNoModelEffects()
  })
 }finally{await f.close()}
})
