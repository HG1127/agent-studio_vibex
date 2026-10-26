import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {withActor} from '../src/repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentMemoryRepository} from '../src/agent-memory-repository.ts'
import {AgentMemoryDerivedRepository} from '../src/agent-memory-derived-repository.ts'
async function fixture(){const f=await agentMemoryFixture();try{await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'));return {...f,derived:new AgentMemoryDerivedRepository(f.pool,{allowWrites:true}),readonly:new AgentMemoryDerivedRepository(f.pool)}}catch(error){await f.close();throw error}}
async function sourceRun(f,memory=false){
  const role=f.resources.alice.spec,repo=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true,allowMemory:memory}),instruction=memory?'记住：财务报告使用中文。整理财务报告':'整理报告'
  const started=await repo.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:1,idempotency_key:'synthetic-derived-repo-'+randomUUID(),instruction})
  let calls=0;const report=('报告 token=syntheticDerivedRepoToken\n').repeat(160)
  await f.privateTls(async()=>{calls++;return JSON.stringify({action:'answer',answer:report})},async make=>{assert.equal((await f.drive(()=>make({humanInputApproved:true,memoryExecutionApproved:memory}),started.run.id)).run.status,'succeeded')},{allowMemory:memory})
  return {role,id:started.run.id,calls}
}
const save=preview=>({action:'save_success',request_id:randomUUID(),spec_id:preview.spec_id,source_run_id:preview.run_id,expected_source_sha256:preview.source_sha256,confirm:true})
const forget=row=>({action:'forget',request_id:randomUUID(),spec_id:row.spec_id,memory_id:row.memory_id??row.id,expected_content_sha256:row.content_sha256,expected_tools_sha256:row.tools_sha256,confirm:true})
const counts=async f=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.agent_memory_derived_entries)::integer AS entries,(SELECT count(*) FROM agentstudio.agent_memory_derived_receipts)::integer AS receipts,(SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]

test('owned derived preview/save is source-bound and default-off; receipts recover read-only without extra jobs or model calls',async()=>{
  const f=await fixture()
  try{
    const source=await sourceRun(f),preview=await f.readonly.preview(f.identities.alice,source.role.id,source.id),request=save(preview),before=await counts(f)
    assert.equal(source.calls,1);assert.equal(preview.kind,'fact');assert.equal(preview.fact.includes('syntheticDerivedRepoToken'),false);assert.ok(preview.fact.length<=500)
    await assert.rejects(f.readonly.change(f.identities.alice,request),e=>e.code==='agent_memory_derived_writes_disabled')
    await assert.rejects(f.derived.preview(f.identities.bob,source.role.id,source.id),e=>e.status===404)
    await assert.rejects(f.derived.change(f.identities.bob,request),e=>e.status===404)
    await assert.rejects(f.derived.change({issuer:'https://forged.invalid',subject:'alice'},request),e=>e.code==='native_employee_identity_required')
    await assert.rejects(withActor(f.pool,f.identities.bob,db=>f.derived.changeOwned(db,f.users.alice,request)),e=>e.code==='owned_admission_context_required')
    const recorded=await f.derived.change(f.identities.alice,request);assert.equal(recorded.recorded,true);assert.equal(recorded.replayed,false)
    assert.equal(Object.hasOwn(recorded,'fact'),false);assert.equal(Object.hasOwn(recorded,'request_sha256'),false)
    assert.equal((await f.readonly.change(f.identities.alice,request)).replayed,true);assert.equal((await f.readonly.confirm(f.identities.alice,request)).replayed,true)
    const listed=await f.derived.list(f.identities.alice,source.role.id);assert.equal(listed.items.length,1);assert.equal(listed.items[0].source_current,true);assert.equal(listed.items[0].fact,preview.fact)
    const after=await counts(f);assert.equal(after.jobs,before.jobs);assert.equal(after.effects,before.effects);assert.equal(after.entries,1);assert.equal(after.receipts,1)
  }finally{await f.close()}
})

test('revoked original memory hides derived text; owner can erase unavailable text and old save replay never recreates it',async()=>{
  const f=await fixture()
  try{
    const source=await sourceRun(f,true),preview=await f.derived.preview(f.identities.alice,source.role.id,source.id),request=save(preview),recorded=await f.derived.change(f.identities.alice,request)
    const memories=new AgentMemoryRepository(f.pool,{allowWrites:true}),entry=(await memories.list(f.identities.alice,source.role.id)).items[0]
    await memories.change(f.identities.alice,{action:'forget',request_id:randomUUID(),spec_id:source.role.id,memory_id:entry.id,expected_sha256:entry.content_sha256,confirm:true})
    await assert.rejects(f.derived.preview(f.identities.alice,source.role.id,source.id),e=>e.status===409)
    const hidden=(await f.derived.list(f.identities.alice,source.role.id)).items[0];assert.equal(hidden.source_current,false);assert.equal(hidden.fact,null);assert.equal(hidden.tools_used,null)
    const erase=forget(recorded);assert.equal((await f.derived.change(f.identities.alice,erase)).recorded,true)
    assert.equal((await f.readonly.confirm(f.identities.alice,erase)).replayed,true);assert.equal((await f.readonly.change(f.identities.alice,request)).replayed,true)
    assert.equal((await f.derived.list(f.identities.alice,source.role.id)).items.length,0);assert.equal((await counts(f)).entries,0)
  }finally{await f.close()}
})

test('derived creation and final audit roll back together; a changed original intent conflicts before any new write',async()=>{
  const f=await fixture()
  try{
    const source=await sourceRun(f),preview=await f.derived.preview(f.identities.alice,source.role.id,source.id),request=save(preview),before=await counts(f)
    f.setFault((sql,values)=>{if(sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('agent.memory_derived_save_success'))throw Error('synthetic_derived_audit_rollback')})
    try{await assert.rejects(f.derived.change(f.identities.alice,request),/synthetic_derived_audit_rollback/)}finally{f.setFault(undefined)}
    assert.deepEqual(await counts(f),before);await assert.rejects(f.readonly.confirm(f.identities.alice,request),e=>e.status===404)
    await f.derived.change(f.identities.alice,request)
    await assert.rejects(f.readonly.change(f.identities.alice,{...request,expected_source_sha256:'f'.repeat(64)}),e=>e.code==='agent_memory_derived_request_conflict')
    const audits=(await f.db.query("SELECT metadata::text AS metadata FROM agentstudio.audit_events WHERE action='agent.memory_derived_save_success'")).rows
    assert.equal(audits.length,1);assert.equal(audits[0].metadata.includes('syntheticDerivedRepoToken'),false)
  }finally{await f.close()}
})
