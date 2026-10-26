// Optional053, synthetic SQL and private mTLS only. Never a target database.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {HttpError} from '../src/contracts.ts'
import {withActor} from '../src/repository.ts'
import {WorkflowV2Worker} from '../src/workflow-v2-worker.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentMemoryOutcomeRepository} from '../src/agent-memory-outcome-repository.ts'
import {AgentMemoryDerivedRepository} from '../src/agent-memory-derived-repository.ts'
import {inspectAgentMemoryFailureSourceSchema,verifyAgentMemoryFailureSourceCredentials} from '../src/agent-memory-failure-source-audit.ts'
import {loadAgentMemoryDerivedSource} from '../src/agent-memory-derived-source.ts'
const callSql='SELECT agentstudio.agent_memory_record_failure_source($1::uuid,$2::uuid,$3::bigint,$4::text) AS recorded'
const activeSql='SELECT status FROM agentstudio.users WHERE id=$1::uuid'
async function fixture({source=true}={}){
  const f=await agentMemoryFixture()
  try{
    await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'));await f.db.exec(f.sql('migrations/pg_v9_052_agent_memory_outcome.sql'))
    if(source){await f.db.exec(f.sql('migrations/pg_v9_053_agent_memory_failure_source.sql'));assert.equal(await inspectAgentMemoryFailureSourceSchema(f.pool),true)}
    return {...f,owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true,allowOutcomeMemory:true}),outcomes:new AgentMemoryOutcomeRepository(f.pool,{allowWriteback:true}),derived:new AgentMemoryDerivedRepository(f.pool,{allowWrites:true})}
  }catch(error){await f.close();throw error}
}
const body=(f,remember=true)=>({expected_revision:f.resources.alice.spec.revision,max_steps:1,require_plan_review:false,idempotency_key:'synthetic-failure-'+randomUUID(),instruction:'Private failure task token=syntheticFailureSourceCredential',remember_outcome:remember})
const counts=async f=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.agent_memory_failure_sources)::integer AS proofs,(SELECT count(*) FROM agentstudio.agent_memory_derived_entries)::integer AS entries,(SELECT count(*) FROM agentstudio.agent_memory_derived_receipts)::integer AS receipts,(SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
async function early(f,{remember=true,fault,beforeExecute}={}){
  const raw=body(f,remember),started=await f.owned.submit(f.identities.alice,f.resources.alice.spec.id,raw);let calls=0,tick,job
  await f.privateTls(async()=>{calls++;return JSON.stringify({action:'answer',answer:'must never be called'})},async make=>{
    const worker=make({humanInputApproved:true,outcomeMemoryApproved:true});job=await worker.claim();assert.equal(job.run_id,started.run.id)
    if(beforeExecute)await beforeExecute(job)
    let once=true
    f.setFault((sql,values)=>{if(once&&sql===activeSql){once=false;throw new HttpError(409,'synthetic_worker_preparation_failed')}fault?.(sql,values)})
    try{tick=await worker.execute(job)}finally{f.setFault(undefined)}
    assert.equal((await worker.tick()).status,'idle')
  })
  assert.equal(calls,0);return {raw,started,tick,job,calls}
}

test('optional053 requires exact immutable metadata, Worker-only definer and owner-only read; privilege and structural drift refuse',async()=>{
  const f=await fixture({source:false})
  try{
    assert.equal(await inspectAgentMemoryFailureSourceSchema(f.pool),false)
    await f.db.exec(f.sql('migrations/pg_v9_053_agent_memory_failure_source.sql'));assert.equal(await inspectAgentMemoryFailureSourceSchema(f.pool),true)
    const rights=(await f.db.query("SELECT has_table_privilege('agentstudio_api','agentstudio.agent_memory_failure_sources','SELECT') AND NOT has_any_column_privilege('agentstudio_api','agentstudio.agent_memory_failure_sources','INSERT,UPDATE,REFERENCES') AND NOT has_table_privilege('agentstudio_api','agentstudio.agent_memory_failure_sources','DELETE,TRUNCATE,TRIGGER') AND NOT has_table_privilege('agentstudio_worker','agentstudio.agent_memory_failure_sources','SELECT') AND has_function_privilege('agentstudio_worker','agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text)','EXECUTE') AND NOT has_function_privilege('agentstudio_api','agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text)','EXECUTE') AS ok")).rows[0]
    assert.equal(rights.ok,true)
    const fn=(await f.db.query("SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS source_sha256 FROM pg_catalog.pg_proc WHERE oid='agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text)'::regprocedure")).rows[0]
    process.stdout.write('SYNTHETIC_FAILURE_SOURCE_CATALOG '+JSON.stringify(fn)+'\n')
    const fk=(await f.db.query("SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_memory_failure_sources'::regclass AND confrelid='agentstudio.jobs'::regclass AND contype='f'")).rows[0].conname;assert.match(fk,/^[a-z0-9_]+$/)
    for(const mutation of ['GRANT SELECT ON agentstudio.agent_memory_failure_sources TO agentstudio_worker','GRANT INSERT(source_sha256) ON agentstudio.agent_memory_failure_sources TO agentstudio_api',
      'GRANT SELECT ON agentstudio.agent_memory_failure_sources TO agentstudio_api WITH GRANT OPTION','GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) TO agentstudio_api',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) TO PUBLIC','GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) TO agentstudio_worker WITH GRANT OPTION',
      'ALTER FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) SECURITY INVOKER','ALTER TABLE agentstudio.agent_memory_failure_sources NO FORCE ROW LEVEL SECURITY',
      'ALTER POLICY agent_memory_failure_owner_read ON agentstudio.agent_memory_failure_sources USING(true)',"ALTER TABLE agentstudio.agent_memory_failure_sources ALTER created_at SET DEFAULT now()",
      'CREATE INDEX synthetic_extra_failure_index ON agentstudio.agent_memory_failure_sources(job_id)','ALTER TABLE agentstudio.agent_memory_failure_sources DROP CONSTRAINT "'+fk+'"',
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_053'",'DROP TABLE agentstudio.agent_memory_failure_sources']){
      await f.db.exec('BEGIN');try{await f.db.exec(mutation);await assert.rejects(verifyAgentMemoryFailureSourceCredentials(f.db),/unsafe_agent_memory_failure_source_privileges/)}finally{await f.db.exec('ROLLBACK')}
    }
  }finally{await f.close()}
})

test('a genuine leased failure before any VM/provider writes one bounded lesson; original recovery and forget never resurrect it',async()=>{
  const f=await fixture()
  try{
    const {started,raw,tick,job}=await early(f),id=started.run.id;assert.equal(tick.status,'failed')
    const row=(await f.db.query('SELECT status,last_error_code,checkpoint FROM agentstudio.runs WHERE id=$1',[id])).rows[0]
    assert.equal(row.status,'failed');assert.equal(row.last_error_code,'synthetic_worker_preparation_failed');assert.equal(Object.hasOwn(row.checkpoint,'agent_state'),false)
    const proof=(await f.db.query('SELECT * FROM agentstudio.agent_memory_failure_sources WHERE run_id=$1',[id])).rows[0]
    assert.match(proof.source_sha256,/^[a-f0-9]{64}$/);assert.match(proof.worker_sha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(proof).includes('Private failure task'),false);assert.equal(JSON.stringify(proof).includes(job.lease_token),false)
    assert.equal((await f.outcomes.status(f.identities.alice,id)).result.decision,'stored')
    const item=(await f.derived.list(f.identities.alice,f.resources.alice.spec.id)).items[0];assert.equal(item.kind,'lesson');assert.equal(item.source_current,true);assert.equal(item.tools_used,'');assert.match(item.fact,/synthetic_worker_preparation_failed/);assert.equal(item.fact.includes('syntheticFailureSourceCredential'),false)
    await assert.rejects(f.derived.preview(f.identities.bob,f.resources.alice.spec.id,id),e=>e.status===404)
    assert.equal((await f.owned.submit(f.identities.alice,f.resources.alice.spec.id,raw)).replayed,true)
    await f.derived.change(f.identities.alice,{action:'forget',request_id:randomUUID(),spec_id:item.spec_id,memory_id:item.id,expected_content_sha256:item.content_sha256,expected_tools_sha256:item.tools_sha256,confirm:true})
    assert.equal((await withActor(f.pool,f.identities.alice,db=>f.outcomes.finishOwned(db,f.users.alice,id))).replayed,true)
    assert.deepEqual(await counts(f),{proofs:1,entries:0,receipts:2,jobs:1,effects:0})
  }finally{await f.close()}
})

test('opt-out failures record no memory but permit a fresh explicit owner failure save; positive facts cannot be invented',async()=>{
  const f=await fixture()
  try{
    const {started}=await early(f,{remember:false}),id=started.run.id;assert.equal((await f.outcomes.status(f.identities.alice,id)).enabled,false);assert.equal((await counts(f)).entries,0)
    const preview=await f.derived.preview(f.identities.alice,f.resources.alice.spec.id,id);assert.equal(preview.kind,'lesson')
    const choice={action:'save_failure',request_id:randomUUID(),spec_id:preview.spec_id,source_run_id:id,expected_source_sha256:preview.source_sha256,confirm:true}
    await assert.rejects(f.derived.change(f.identities.alice,{...choice,action:'save_success'}),e=>e.status===409)
    assert.equal((await f.derived.change(f.identities.alice,choice)).kind,'lesson');assert.equal((await f.derived.confirm(f.identities.alice,choice)).replayed,true)
    assert.deepEqual(await counts(f),{proofs:1,entries:1,receipts:1,jobs:1,effects:0})
  }finally{await f.close()}
})

test('API cannot mint a failure proof; Worker calls still need the exact owner/token/version and an actually failed terminal row',async()=>{
  const f=await fixture()
  try{
    const started=await f.owned.submit(f.identities.alice,f.resources.alice.spec.id,body(f,false)),id=started.run.id
    const worker=new WorkflowV2Worker(f.pool,'synthetic-failure-proof-only',{executionMode:'agent_native_v2',agentExecutionApproved:true,humanInputApproved:true}),job=await worker.claim();assert.equal(job.run_id,id)
    const invoke=(identity,token=job.lease_token,version=job.lease_version,asWorker=true)=>withActor(f.pool,identity,async db=>{if(asWorker)await db.query('SET LOCAL ROLE agentstudio_worker');return db.query(callSql,[job.id,token,version,worker.workerId])})
    await assert.rejects(invoke(f.identities.alice,job.lease_token,job.lease_version,false),/permission denied/)
    await assert.rejects(invoke(f.identities.alice),/agent_memory_failure_terminal_required/)
    await assert.rejects(invoke(f.identities.bob),/agent_memory_failure_lease_required/)
    await assert.rejects(invoke(f.identities.alice,randomUUID()),/agent_memory_failure_lease_required/)
    await assert.rejects(invoke(f.identities.alice,job.lease_token,Number(job.lease_version)+1),/agent_memory_failure_lease_required/)
    await f.db.query("UPDATE agentstudio.runs SET status='failed',last_error_code='synthetic_unattested_failure',finished_at=clock_timestamp() WHERE id=$1",[id])
    await assert.rejects(f.derived.preview(f.identities.alice,f.resources.alice.spec.id,id),e=>e.status===409)
    for(const statement of ["INSERT INTO agentstudio.agent_memory_failure_sources(owner_user_id) VALUES(agentstudio.actor_id())","UPDATE agentstudio.agent_memory_failure_sources SET error_code='forged'",'DELETE FROM agentstudio.agent_memory_failure_sources','TRUNCATE agentstudio.agent_memory_failure_sources'])await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(statement)),/permission denied/)
    assert.equal((await counts(f)).proofs,0)
  }finally{await f.close()}
})

test('failure proof never substitutes for changed terminal snapshots, revoked role sources or a newly unknown effect',async()=>{
  const f=await fixture()
  try{
    const {started}=await early(f,{remember:false}),id=started.run.id,spec=f.resources.alice.spec
    for(const mutate of [
      db=>db.query("UPDATE agentstudio.runs SET last_error_code='changed_failure' WHERE id=$1",[id]),
      db=>db.query('UPDATE agentstudio.agent_specs SET revision=revision+1 WHERE id=$1',[spec.id]),
      db=>db.query("INSERT INTO agentstudio.external_effects(owner_user_id,run_id,step_key,tool_name,arguments_sha256,idempotency_key,status) VALUES($1,$2,'wf2_00002_agent_a01m','workflow:model',$3,$4,'unknown')",[f.users.alice,id,'a'.repeat(64),'synthetic-after-failure-'+randomUUID()])
    ])await assert.rejects(withActor(f.pool,f.identities.alice,async db=>{await mutate(db);await loadAgentMemoryDerivedSource(db,f.users.alice,spec.id,id)}),e=>e.status===409)
    assert.equal((await f.derived.preview(f.identities.alice,spec.id,id)).kind,'lesson')
    assert.equal((await withActor(f.pool,f.identities.bob,db=>db.query('SELECT run_id FROM agentstudio.agent_memory_failure_sources'))).rows.length,0)
  }finally{await f.close()}
})

test('a preparation error after an unresolved effect pauses without any failure proof, memory, provider resend or false terminal claim',async()=>{
  const f=await fixture()
  try{
    const {started,tick}=await early(f,{beforeExecute:job=>f.db.query("INSERT INTO agentstudio.external_effects(owner_user_id,run_id,step_key,tool_name,arguments_sha256,idempotency_key,status) VALUES($1,$2,'wf2_00002_agent_a01m','workflow:model',$3,$4,'started')",[job.owner_user_id,job.run_id,'a'.repeat(64),'synthetic-unresolved-'+randomUUID()])})
    assert.equal(tick.status,'paused');const task=await f.owned.get(f.identities.alice,started.run.id);assert.equal(task.run.status,'paused');assert.equal(task.run.last_error_code,'workflow_v2_effect_outcome_unknown')
    assert.equal((await f.outcomes.status(f.identities.alice,started.run.id)).result,null)
    assert.deepEqual(await counts(f),{proofs:0,entries:0,receipts:0,jobs:1,effects:1});assert.equal((await f.db.query('SELECT status FROM agentstudio.external_effects')).rows[0].status,'unknown')
  }finally{await f.close()}
})

test('failure attestation/proof-audit/storage failures preserve the real terminal task and never call a provider',async()=>{
  for(const scenario of ['procedure','proof_audit','memory_audit']){
    const f=await fixture()
    try{
      const {started,tick}=await early(f,{fault:(sql,values)=>{
        if(scenario==='procedure'&&sql===callSql||sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes(scenario==='proof_audit'?'workflow.v2_failure_source_recorded':scenario==='memory_audit'?'agent.memory_derived_save_failure':'never'))throw Error('synthetic_failure_storage_fault')
      }})
      assert.equal(tick.status,'failed');assert.equal((await f.owned.get(f.identities.alice,started.run.id)).run.status,'failed')
      const result=(await f.outcomes.status(f.identities.alice,started.run.id)).result;assert.equal(result.decision,scenario==='memory_audit'?'write_failed':'source_unavailable')
      const state=await counts(f);assert.equal(state.proofs,scenario==='memory_audit'?1:0);assert.equal(state.entries,0);assert.equal(state.receipts,0);assert.equal(state.effects,0);assert.equal(state.jobs,1)
    }finally{await f.close()}
  }
})
