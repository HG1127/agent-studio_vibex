// Real embedded PostgreSQL, verified Native identities and no provider effects.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentFixture} from './helpers/workflow-v2-agent-fixture.mjs'
import {AgentMemoryRepository} from '../src/agent-memory-repository.ts'
import {agentMemoryHash} from '../src/agent-memory-contract.ts'
import {withActor} from '../src/repository.ts'
import {verifyAgentMemoryCredentials} from '../src/agent-memory-audit.ts'
const input=(role,fact='报告使用中文。')=>({action:'remember',request_id:randomUUID(),spec_id:role.id,expected_revision:role.revision,fact,confirm:true})
async function fixture(){const f=await agentFixture({autonomous:true,sharing:true,nativeEmployees:true});try{await f.db.exec(f.sql('migrations/pg_v9_049_agent_memory.sql'));return {...f,memory:new AgentMemoryRepository(f.pool,{allowWrites:true}),readonly:new AgentMemoryRepository(f.pool)}}catch(error){await f.close();throw error}}

test('owned manual memory: atomic receipts, erasure, original recovery, owner isolation and no resurrection',async()=>{
  const f=await fixture(),{alice,bob}=f.identities,role=f.resources.alice.spec,request=input(role,'report token=syntheticMemorySecret')
  try{
    assert.equal(await verifyAgentMemoryCredentials(f.db),true)
    await assert.rejects(f.memory.list({issuer:'https://unverified.invalid',subject:'alice'},role.id),e=>e.code==='native_employee_identity_required')
    await assert.rejects(f.memory.list(bob,role.id),e=>e.status===404)
    await assert.rejects(f.readonly.change(alice,request),e=>e.code==='agent_memory_writes_disabled')
    await assert.rejects(f.readonly.confirm(alice,request),e=>e.status===404)
    await assert.rejects(f.memory.change(alice,{...request,expected_revision:role.revision+1}),e=>e.code==='agent_revision_changed')
    f.setFault((sql,values)=>{if(sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('agent.memory_remember'))throw Error('synthetic_memory_audit_rollback')})
    try{await assert.rejects(f.memory.change(alice,request),/synthetic_memory_audit_rollback/)}finally{f.setFault(undefined)}
    assert.equal((await f.memory.list(alice,role.id)).items.length,0)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_receipts')).rows[0].n,0)
    const saved=await f.memory.change(alice,request)
    assert.equal(saved.memory_id,request.request_id);assert.equal(saved.replayed,false)
    assert.equal((await f.readonly.confirm(alice,request)).replayed,true)
    assert.equal((await f.readonly.change(alice,request)).replayed,true)
    await assert.rejects(f.memory.change(alice,{...request,fact:'different'}),e=>e.code==='agent_memory_request_conflict')
    const entries=(await f.memory.list(alice,role.id)).items
    assert.equal(entries.length,1);assert.equal(entries[0].fact,'report token=***');assert.equal(entries[0].kind,'user');assert.equal(entries[0].run_id,null)
    assert.equal(JSON.stringify(await f.db.query('SELECT * FROM agentstudio.agent_memory_entries')).includes('syntheticMemorySecret'),false)
    await withActor(f.pool,bob,async db=>{
      assert.equal((await db.query('SELECT * FROM agentstudio.agent_memory_entries')).rows.length,0)
      assert.equal((await db.query('SELECT * FROM agentstudio.agent_memory_receipts')).rows.length,0)
    })
    const forget={action:'forget',request_id:randomUUID(),spec_id:role.id,memory_id:saved.memory_id,expected_sha256:entries[0].content_sha256,confirm:true}
    await assert.rejects(f.memory.change(bob,forget),e=>e.status===404)
    await assert.rejects(f.memory.change(alice,{...forget,expected_sha256:agentMemoryHash('stale')}),e=>e.code==='agent_memory_content_changed')
    f.setFault((sql,values)=>{if(sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('agent.memory_forget'))throw Error('synthetic_forget_rollback')})
    try{await assert.rejects(f.memory.change(alice,forget),/synthetic_forget_rollback/)}finally{f.setFault(undefined)}
    assert.equal((await f.memory.list(alice,role.id)).items.length,1)
    await f.memory.change(alice,forget)
    assert.equal((await f.memory.list(alice,role.id)).items.length,0)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_entries')).rows[0].n,0)
    assert.equal((await f.readonly.confirm(alice,forget)).replayed,true)
    assert.equal((await f.readonly.change(alice,forget)).replayed,true)
    assert.equal((await f.memory.change(alice,request)).replayed,true)
    assert.equal((await f.memory.list(alice,role.id)).items.length,0)
    await assert.rejects(withActor(f.pool,alice,db=>db.query("INSERT INTO agentstudio.agent_memory_entries(owner_user_id,id,spec_id,kind,fact,content_sha256) VALUES($1,$2,$3,'user',$4,$5)",[f.users.alice,saved.memory_id,role.id,entries[0].fact,entries[0].content_sha256])),/agent_memory_entry_receipt_required/)
    for(const sql of ["UPDATE agentstudio.agent_memory_receipts SET action='remember'",'DELETE FROM agentstudio.agent_memory_receipts','TRUNCATE agentstudio.agent_memory_entries',"UPDATE agentstudio.agent_memory_entries SET fact='changed'"])
      await assert.rejects(withActor(f.pool,alice,db=>db.query(sql)),/permission denied/)
    const receipts=(await f.db.query('SELECT * FROM agentstudio.agent_memory_receipts')).rows
    assert.equal(receipts.length,2);assert.equal(JSON.stringify(receipts).includes('report'),false)
    const audits=(await f.db.query("SELECT action,metadata FROM agentstudio.audit_events WHERE action LIKE 'agent.memory_%'")).rows
    assert.equal(audits.length,2);assert.equal(JSON.stringify(audits).includes('report'),false)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects')).rows[0].n,0)
    for(const drift of ['GRANT UPDATE ON agentstudio.agent_memory_receipts TO agentstudio_api','GRANT SELECT ON agentstudio.agent_memory_entries TO agentstudio_worker',
      'ALTER TABLE agentstudio.agent_memory_entries NO FORCE ROW LEVEL SECURITY','DROP TRIGGER agent_memory_entry_receipt ON agentstudio.agent_memory_entries',
      "ALTER POLICY agent_memory_entries_owner_read ON agentstudio.agent_memory_entries USING(true)",
      "GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_entry_guard() TO PUBLIC",
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_049'"]){
      await f.db.exec('BEGIN');try{await f.db.exec(drift);await assert.rejects(verifyAgentMemoryCredentials(f.db),/unsafe_agent_memory_privileges/)}finally{await f.db.exec('ROLLBACK')}
    }
  }finally{await f.close()}
})

test('manual memory inventory is per role, latest50, and bounded in UTF16 even for direct owner SQL',async()=>{
  const f=await fixture(),{alice}=f.identities,role=f.resources.alice.spec
  try{
    for(let i=0;i<52;i++)await f.memory.change(alice,input(role,'report '+i))
    const page=await f.memory.list(alice,role.id)
    assert.equal(page.limit,50);assert.equal(page.items.length,50);assert.equal(page.items[0].fact,'report 51');assert.equal(page.items.at(-1).fact,'report 2')
    const fresh=await f.agents.create(alice,'Another role',role.spec)
    assert.equal((await f.memory.list(alice,fresh.id)).items.length,0)
    const id=randomUUID(),fact='😀'.repeat(251),hash=agentMemoryHash(fact)
    await assert.rejects(withActor(f.pool,alice,async db=>{
      await db.query("INSERT INTO agentstudio.agent_memory_receipts(owner_user_id,request_id,memory_id,spec_id,action,content_sha256,request_sha256) VALUES($1,$2,$2,$3,'remember',$4,$4)",[f.users.alice,id,role.id,hash])
      await db.query("INSERT INTO agentstudio.agent_memory_entries(owner_user_id,id,spec_id,kind,fact,content_sha256) VALUES($1,$2,$3,'user',$4,$5)",[f.users.alice,id,role.id,fact,hash])
    }),/agent_memory_entry_receipt_required/)
    await assert.rejects(withActor(f.pool,alice,db=>db.query('DELETE FROM agentstudio.agent_memory_entries')),/agent_memory_forget_receipt_required/)
    assert.equal((await f.memory.list(alice,role.id)).items.length,50)
  }finally{await f.close()}
})
