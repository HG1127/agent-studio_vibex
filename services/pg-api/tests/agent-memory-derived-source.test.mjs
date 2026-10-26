// Proposed051 foundation only: synthetic SQL/source checks, no HTTP route,
// automatic writeback, memory injection, refinement worker or paid provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {withActor} from '../src/repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentMemoryRepository} from '../src/agent-memory-repository.ts'
import {loadAgentMemoryDerivedSource} from '../src/agent-memory-derived-source.ts'
import {parseAgentMemoryDerivedChange} from '../src/agent-memory-derived-contract.ts'
import {successfulMemoryFallback,failedMemoryLesson} from '../src/agent-memory-derived-text.ts'
import {agentMemoryHash} from '../src/agent-memory-contract.ts'
import {inspectAgentMemoryDerivedSchema,verifyAgentMemoryDerivedCredentials} from '../src/agent-memory-derived-audit.ts'
let catalogRecorded=false
async function fixture(){const f=await agentMemoryFixture();try{await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'));
  if(!catalogRecorded){catalogRecorded=true
    const constraints=(await f.db.query("SELECT conname AS name,pg_get_expr(conbin,conrelid) AS expression FROM pg_catalog.pg_constraint WHERE conrelid IN('agentstudio.agent_memory_derived_receipts'::regclass,'agentstudio.agent_memory_derived_entries'::regclass) AND contype='c' ORDER BY conname")).rows
    const functions=(await f.db.query("SELECT proname AS name,encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS source_sha256 FROM pg_catalog.pg_proc WHERE oid IN(to_regprocedure('agentstudio.agent_memory_run_source_sha256(uuid)'),to_regprocedure('agentstudio.agent_memory_derived_receipt_guard()'),to_regprocedure('agentstudio.agent_memory_derived_entry_guard()')) ORDER BY proname")).rows
    process.stdout.write('SYNTHETIC_DERIVED_SCHEMA_CATALOG '+JSON.stringify({constraints,functions})+'\n')
  }
  assert.equal(await inspectAgentMemoryDerivedSchema(f.pool),true)
  return f}catch(error){await f.close();throw error}}
async function runSource(f,{failed=false,memory=false}={}){
  const spec=f.resources.alice.spec,repo=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true,allowMemory:memory})
  const admitted=await repo.submit(f.identities.alice,spec.id,{expected_revision:spec.revision,max_steps:3,idempotency_key:'synthetic-derived-'+randomUUID(),instruction:memory?'记住：财务报告使用中文。整理财务报告':'整理财务报告'})
  const report=('可复用的合成财务报告 token=syntheticDerivedCredential\n').repeat(120);let calls=0
  await f.privateTls(async()=>{calls++;return JSON.stringify(failed?{action:'tool',tool:'synthetic_forbidden_tool',params:{}}:calls===1?{action:'tool',tool:'calculate',params:{expression:'2+2'}}:{action:'answer',answer:report})},async make=>{
    const done=await f.drive(()=>make({humanInputApproved:true,memoryExecutionApproved:memory}),admitted.run.id)
    assert.equal(done.run.status,failed?'failed':'succeeded')
  },{allowMemory:memory})
  const load=()=>withActor(f.pool,f.identities.alice,db=>loadAgentMemoryDerivedSource(db,f.users.alice,spec.id,admitted.run.id))
  return {id:admitted.run.id,spec,load,source:await load(),calls}
}
async function insert(db,owner,source,choice,text){
  const memory_id=choice.request_id,content_sha256=agentMemoryHash(text.fact),tools_sha256=agentMemoryHash(text.tools_used)
  await db.query('INSERT INTO agentstudio.agent_memory_derived_receipts(owner_user_id,request_id,memory_id,spec_id,source_run_id,action,kind,source_sha256,content_sha256,tools_sha256,request_sha256) VALUES($1::uuid,$2::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10)',
    [owner,memory_id,source.spec_id,source.run_id,choice.action,text.kind,choice.expected_source_sha256,content_sha256,tools_sha256,choice.request_sha256])
  await db.query('INSERT INTO agentstudio.agent_memory_derived_entries(owner_user_id,id,fact,tools_used,content_sha256,tools_sha256) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)',[owner,memory_id,text.fact,text.tools_used,content_sha256,tools_sha256])
  return {...source,memory_id,content_sha256,tools_sha256,kind:text.kind}
}
const choice=source=>parseAgentMemoryDerivedChange({action:source.status==='succeeded'?'save_success':'save_failure',request_id:randomUUID(),spec_id:source.spec_id,source_run_id:source.run_id,expected_source_sha256:source.source_sha256,confirm:true})
const counts=async f=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.agent_memory_derived_receipts)::integer AS receipts,(SELECT count(*) FROM agentstudio.agent_memory_derived_entries)::integer AS entries,(SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]

test('terminal source binds owner, exact run and original evidence; derived receipts carry no text and erasure cannot reinsert it',async()=>{
  const f=await fixture()
  try{
    const original=await runSource(f),{source}=original,before=await counts(f)
    assert.equal(original.calls,2);assert.deepEqual(source.tools_used,['calculate'])
    const text=successfulMemoryFallback(source.result_text,source.tools_used);assert.equal(text.fact.includes('syntheticDerivedCredential'),false);assert.ok(text.fact.length<=500)
    await assert.rejects(withActor(f.pool,f.identities.bob,db=>loadAgentMemoryDerivedSource(db,f.users.bob,source.spec_id,source.run_id)),e=>e.status===404)
    const foreign=await withActor(f.pool,f.identities.bob,db=>db.query('SELECT agentstudio.agent_memory_run_source_sha256($1::uuid) AS hash',[source.run_id]));assert.equal(foreign.rows[0].hash,null)
    const shifted=await withActor(f.pool,f.identities.alice,async db=>{await db.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");return db.query('SELECT agentstudio.agent_memory_run_source_sha256($1::uuid) AS hash',[source.run_id])});assert.equal(shifted.rows[0].hash,source.source_sha256)
    const saved=await withActor(f.pool,f.identities.alice,db=>insert(db,f.users.alice,source,choice(source),text))
    const metadata=JSON.stringify((await f.db.query('SELECT * FROM agentstudio.agent_memory_derived_receipts')).rows)
    assert.equal(metadata.includes(text.fact),false);assert.equal(metadata.includes('syntheticDerivedCredential'),false)
    for(const sql of ['UPDATE agentstudio.agent_memory_derived_receipts SET kind=\'lesson\'','DELETE FROM agentstudio.agent_memory_derived_receipts','UPDATE agentstudio.agent_memory_derived_entries SET fact=\'forged\'','TRUNCATE agentstudio.agent_memory_derived_entries'])
      await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(sql)),/permission denied/)
    const rights=(await f.db.query("SELECT NOT p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
      "has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AND NOT has_function_privilege('agentstudio_worker',p.oid,'EXECUTE') AND "+
      "NOT has_function_privilege('agentstudio_model_broker',p.oid,'EXECUTE') AND NOT has_function_privilege('agentstudio_bound_dispatch',p.oid,'EXECUTE') AND "+
      "NOT has_table_privilege('agentstudio_worker','agentstudio.agent_memory_derived_entries','SELECT,INSERT,UPDATE,DELETE') AS ok "+
      "FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('agentstudio.agent_memory_run_source_sha256(uuid)')")).rows[0]
    assert.equal(rights.ok,true)
    const erase=parseAgentMemoryDerivedChange({action:'forget',request_id:randomUUID(),spec_id:source.spec_id,memory_id:saved.memory_id,expected_content_sha256:saved.content_sha256,expected_tools_sha256:saved.tools_sha256,confirm:true})
    await withActor(f.pool,f.identities.alice,async db=>{
      await db.query('INSERT INTO agentstudio.agent_memory_derived_receipts(owner_user_id,request_id,memory_id,spec_id,source_run_id,action,kind,source_sha256,content_sha256,tools_sha256,request_sha256) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,\'forget\',$6,$7,$8,$9,$10)',[f.users.alice,erase.request_id,saved.memory_id,source.spec_id,source.run_id,saved.kind,source.source_sha256,saved.content_sha256,saved.tools_sha256,erase.request_sha256])
      await db.query('DELETE FROM agentstudio.agent_memory_derived_entries WHERE id=$1::uuid AND owner_user_id=$2::uuid',[saved.memory_id,f.users.alice])
    })
    await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query('INSERT INTO agentstudio.agent_memory_derived_entries(owner_user_id,id,fact,tools_used,content_sha256,tools_sha256) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)',[f.users.alice,saved.memory_id,text.fact,text.tools_used,saved.content_sha256,saved.tools_sha256])),/agent_memory_derived_entry_receipt_required/)
    const after=await counts(f);assert.equal(after.entries,0);assert.equal(after.receipts,2);assert.equal(after.jobs,before.jobs);assert.equal(after.effects,before.effects)
  }finally{await f.close()}
})

test('source/entry failures roll back the whole owned operation; success cannot be relabelled as a failure lesson',async()=>{
  const f=await fixture()
  try{
    const {source}=await runSource(f),text=successfulMemoryFallback(source.result_text,source.tools_used),base=await counts(f)
    for(const purpose of ['wrong_source','wrong_kind','utf16','after_entry']){
      const raw=choice(source),request=purpose==='wrong_source'?parseAgentMemoryDerivedChange({...Object.fromEntries(Object.entries(raw).filter(([key])=>key!=='request_sha256')),expected_source_sha256:'f'.repeat(64)}):purpose==='wrong_kind'?choice({...source,status:'failed'}):raw
      const payload=purpose==='wrong_kind'?{kind:'lesson',fact:'Forged lesson',tools_used:''}:purpose==='utf16'?{...text,fact:'😀'.repeat(500)}:text
      await assert.rejects(withActor(f.pool,f.identities.alice,async db=>{await insert(db,f.users.alice,source,request,payload);if(purpose==='after_entry')throw Error('synthetic_derived_final_audit_failure')}),purpose==='after_entry'?/synthetic_derived_final_audit_failure/:/agent_memory_derived_source_changed|agent_memory_derived_entry_receipt_required/)
      assert.deepEqual(await counts(f),base)
    }
    const failed=await runSource(f,{failed:true}),lesson=failedMemoryLesson(failed.source.status,failed.source.instruction,failed.source.error_code)
    assert.equal(lesson.kind,'lesson');assert.match(lesson.fact,/^教训：/)
    await withActor(f.pool,f.identities.alice,db=>insert(db,f.users.alice,failed.source,choice(failed.source),lesson))
  }finally{await f.close()}
})

test('a still-matching terminal fingerprint cannot substitute for current original memory provenance',async()=>{
  const f=await fixture()
  try{
    const original=await runSource(f,{memory:true}),memory=new AgentMemoryRepository(f.pool,{allowWrites:true}),entry=(await memory.list(f.identities.alice,original.spec.id)).items[0]
    await assert.rejects(withActor(f.pool,f.identities.alice,async db=>{
      await db.query("UPDATE agentstudio.runs SET status='failed' WHERE id=$1::uuid AND owner_user_id=$2::uuid",[original.id,f.users.alice])
      await assert.rejects(loadAgentMemoryDerivedSource(db,f.users.alice,original.spec.id,original.id),e=>e.code==='agent_memory_derived_source_unavailable')
      throw Error('synthetic_restore_original_terminal_state')
    }),/synthetic_restore_original_terminal_state/)
    await memory.change(f.identities.alice,{action:'forget',request_id:randomUUID(),spec_id:original.spec.id,memory_id:entry.id,expected_sha256:entry.content_sha256,confirm:true})
    const hash=await withActor(f.pool,f.identities.alice,db=>db.query('SELECT agentstudio.agent_memory_run_source_sha256($1::uuid) AS hash',[original.id]));assert.equal(hash.rows[0].hash,original.source.source_sha256)
    await assert.rejects(original.load,e=>e.status===409)
    assert.equal((await counts(f)).entries,0)
  }finally{await f.close()}
})

test('optional051 schema audit rejects data grants, helper authority, erased guards, source FK and quoted CHECK drift',async()=>{
  const f=await agentMemoryFixture()
  try{
    assert.equal(await inspectAgentMemoryDerivedSchema(f.pool),false)
    await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'))
    assert.equal(await inspectAgentMemoryDerivedSchema(f.pool),true)
    const fk=(await f.db.query("SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_memory_derived_receipts'::regclass AND contype='f' AND confrelid='agentstudio.runs'::regclass")).rows[0].conname
    assert.match(fk,/^[a-z0-9_]+$/)
    const changes=['GRANT UPDATE ON agentstudio.agent_memory_derived_entries TO agentstudio_api','GRANT SELECT ON agentstudio.agent_memory_derived_entries TO agentstudio_worker',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) TO PUBLIC',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) TO agentstudio_api WITH GRANT OPTION',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_derived_entry_guard() TO agentstudio_api',
      'ALTER FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) SECURITY DEFINER',
      'ALTER FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) IMMUTABLE',
      'ALTER TABLE agentstudio.agent_memory_derived_entries NO FORCE ROW LEVEL SECURITY',
      'ALTER TABLE agentstudio.agent_memory_derived_entries DISABLE TRIGGER agent_memory_derived_entry_receipt',
      'ALTER POLICY agent_memory_derived_receipts_owner_read ON agentstudio.agent_memory_derived_receipts USING(true)',
      'ALTER TABLE agentstudio.agent_memory_derived_receipts DROP CONSTRAINT "'+fk+'"',
      "ALTER TABLE agentstudio.agent_memory_derived_receipts DROP CONSTRAINT agent_memory_derived_receipts_source_sha256_check; ALTER TABLE agentstudio.agent_memory_derived_receipts ADD CONSTRAINT agent_memory_derived_receipts_source_sha256_check CHECK(source_sha256 ~ '^[a-f0-9 ]{64}$')",
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_051'",'DROP TABLE agentstudio.agent_memory_derived_entries']
    for(const sql of changes){await f.db.exec('BEGIN');try{await f.db.exec(sql);await assert.rejects(verifyAgentMemoryDerivedCredentials(f.db),/unsafe_agent_memory_derived_privileges/)}finally{await f.db.exec('ROLLBACK')}}
  }finally{await f.close()}
})
