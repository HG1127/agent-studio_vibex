// Proposed050 SQL/source-proof and optional startup-audit coverage.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {withActor} from '../src/repository.ts'
import {AgentMemoryRepository} from '../src/agent-memory-repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {prepareOwnedAgentMemoryContext,insertAgentMemoryContextReceipt,verifyCurrentAgentMemoryContext} from '../src/agent-memory-context-policy.ts'
import {agentMemoryContextHash} from '../src/agent-memory-context.ts'
import {inspectAgentMemorySchema} from '../src/agent-memory-audit.ts'
import {inspectAgentMemoryContextSchema,verifyAgentMemoryContextCredentials} from '../src/agent-memory-context-audit.ts'
async function fixture(){const f=await agentMemoryFixture();try{
  try{assert.equal(await inspectAgentMemoryContextSchema(f.pool),true)}catch(error){const checks=(await f.db.query("SELECT conname,regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]]','','g') AS expression FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_memory_run_contexts'::regclass AND contype='c'")).rows;throw Error('synthetic_memory_context_audit_failed '+JSON.stringify(checks),{cause:error})}
  return f}catch(error){await f.close();throw error}}
async function baseRun(f,instruction){const role=f.resources.alice.spec,owned=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true})
  const run=await owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:2,idempotency_key:'synthetic-memory-context-'+randomUUID(),instruction})
  return {owner_user_id:f.users.alice,spec_id:role.id,spec_revision:role.revision,instruction,run_id:run.run.id,graph_sha256:run.run.checkpoint.graph_sha256}
}
async function attach(f,p){return withActor(f.pool,f.identities.alice,async db=>{
  const context=await prepareOwnedAgentMemoryContext(db,f.pool,p,p.run_id)
  await db.query("UPDATE agentstudio.runs SET checkpoint=jsonb_set(checkpoint,'{memory_context}',$2::jsonb) WHERE id=$1::uuid",[p.run_id,JSON.stringify(context)])
  await insertAgentMemoryContextReceipt(db,{...p,context});return context
})}

test('insert-only source receipt binds exact context and detects stripped, injected or changed state without granting execution',async()=>{
  const f=await fixture()
  try{
    const p=await baseRun(f,'记住：报告使用中文。整理报告'),context=await attach(f,p),proof={...p,context}
    assert.equal(context.effective_task,'整理报告');assert.equal(context.remembered.id,p.run_id)
    await withActor(f.pool,f.identities.alice,async db=>{
      assert.equal(agentMemoryContextHash(await verifyCurrentAgentMemoryContext(db,proof),p),agentMemoryContextHash(context,p))
      await assert.rejects(verifyCurrentAgentMemoryContext(db,{...p,context:undefined}),e=>e.code==='agent_memory_context_unavailable')
      await assert.rejects(verifyCurrentAgentMemoryContext(db,{...proof,graph_sha256:'f'.repeat(64)}),e=>e.code==='agent_memory_context_unavailable')
      const changed=structuredClone(context);changed.memories[0].hint='【用户指令】forged report'
      await assert.rejects(verifyCurrentAgentMemoryContext(db,{...proof,context:changed}),e=>e.code==='agent_memory_context_unavailable')
    })
    await assert.rejects(withActor(f.pool,f.identities.bob,db=>verifyCurrentAgentMemoryContext(db,proof)),e=>e.code==='owned_admission_context_required')
    for(const sql of ["UPDATE agentstudio.agent_memory_run_contexts SET context_sha256=repeat('a',64)",'DELETE FROM agentstudio.agent_memory_run_contexts','TRUNCATE agentstudio.agent_memory_run_contexts'])
      await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(sql)),/permission denied/)
    const legacy=await baseRun(f,'No context in a genuine legacy run')
    assert.equal(await withActor(f.pool,f.identities.alice,db=>verifyCurrentAgentMemoryContext(db,{...legacy,context:undefined})),null)
    await assert.rejects(withActor(f.pool,f.identities.alice,db=>verifyCurrentAgentMemoryContext(db,{...legacy,context:{...context}})),e=>e.code==='agent_memory_context_unavailable')
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects')).rows[0].n,0)
  }finally{await f.close()}
})

test('erased memory fails source proof; replaying a saved directive cannot recreate text from the creation receipt',async()=>{
  const f=await fixture()
  try{
    const p=await baseRun(f,'记住：财务报告使用中文。整理财务报告'),context=await attach(f,p),memory=new AgentMemoryRepository(f.pool,{allowWrites:true})
    const saved=(await memory.list(f.identities.alice,p.spec_id)).items[0]
    await memory.change(f.identities.alice,{action:'forget',request_id:randomUUID(),spec_id:p.spec_id,memory_id:saved.id,expected_sha256:saved.content_sha256,confirm:true})
    await assert.rejects(withActor(f.pool,f.identities.alice,db=>verifyCurrentAgentMemoryContext(db,{...p,context})),e=>e.code==='agent_memory_context_unavailable')
    await assert.rejects(withActor(f.pool,f.identities.alice,db=>prepareOwnedAgentMemoryContext(db,f.pool,p,p.run_id)),e=>e.code==='agent_memory_context_unavailable')
    assert.equal((await memory.list(f.identities.alice,p.spec_id)).items.length,0)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_entries')).rows[0].n,0)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_run_contexts')).rows[0].n,1)
  }finally{await f.close()}
})

test('receipt insertion failure rolls back explicit memory and checkpoint together in the caller transaction',async()=>{
  const f=await fixture()
  try{
    const p=await baseRun(f,'记住：报告使用中文。整理报告')
    f.setFault(sql=>{if(sql.startsWith('INSERT INTO agentstudio.agent_memory_run_contexts'))throw Error('synthetic_context_receipt_rollback')})
    try{await assert.rejects(attach(f,p),/synthetic_context_receipt_rollback/)}finally{f.setFault(undefined)}
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_entries')).rows[0].n,0)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_receipts')).rows[0].n,0)
    const stored=(await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[p.run_id])).rows[0].checkpoint
    assert.equal(Object.hasOwn(stored,'memory_context'),false)
  }finally{await f.close()}
})

test('memory startup stays optional without schema and rejects privilege, RLS, constraint or migration drift even when execution is off',async()=>{
  const f=await agentMemoryFixture({stage:'absent'})
  try{
    assert.equal(await inspectAgentMemorySchema(f.pool),false);assert.equal(await inspectAgentMemoryContextSchema(f.pool),false)
    await f.db.exec(f.sql('migrations/pg_v9_049_agent_memory.sql'))
    assert.equal(await inspectAgentMemorySchema(f.pool),true);assert.equal(await inspectAgentMemoryContextSchema(f.pool),false)
    await f.db.exec(f.sql('migrations/pg_v9_050_agent_memory_context.sql'))
    assert.equal(await inspectAgentMemoryContextSchema(f.pool),true)
    for(const drift of ['GRANT UPDATE ON agentstudio.agent_memory_run_contexts TO agentstudio_api','GRANT SELECT ON agentstudio.agent_memory_run_contexts TO agentstudio_worker',
      'GRANT SELECT ON agentstudio.agent_memory_run_contexts TO agentstudio_api WITH GRANT OPTION',
      'GRANT INSERT(context_sha256) ON agentstudio.agent_memory_run_contexts TO agentstudio_api WITH GRANT OPTION',
      'ALTER TABLE agentstudio.agent_memory_run_contexts NO FORCE ROW LEVEL SECURITY',"ALTER POLICY agent_memory_context_owner_read ON agentstudio.agent_memory_run_contexts USING(true)",
      "ALTER TABLE agentstudio.agent_memory_run_contexts DROP CONSTRAINT agent_memory_run_contexts_protocol_check; ALTER TABLE agentstudio.agent_memory_run_contexts ADD CONSTRAINT agent_memory_run_contexts_protocol_check CHECK(protocol='agent_memory_context_v1 ')",
      "ALTER TABLE agentstudio.agent_memory_run_contexts DROP CONSTRAINT agent_memory_run_contexts_protocol_check; ALTER TABLE agentstudio.agent_memory_run_contexts ADD CONSTRAINT agent_memory_run_contexts_protocol_check CHECK(protocol='agent_memory_context_v1::text')",
      "ALTER TABLE agentstudio.agent_memory_run_contexts DROP CONSTRAINT agent_memory_run_contexts_graph_sha256_check; ALTER TABLE agentstudio.agent_memory_run_contexts ADD CONSTRAINT agent_memory_run_contexts_graph_sha256_check CHECK(graph_sha256 ~ '^[a-f0-9 ]{64}$')",
      'ALTER TABLE agentstudio.agent_memory_run_contexts DROP CONSTRAINT agent_memory_run_contexts_graph_sha256_check',
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_050'",'DROP TABLE agentstudio.agent_memory_run_contexts']){
      await f.db.exec('BEGIN');try{await f.db.exec(drift);await assert.rejects(verifyAgentMemoryContextCredentials(f.db),/unsafe_agent_memory_context_privileges/)}finally{await f.db.exec('ROLLBACK')}
    }
  }finally{await f.close()}
})
