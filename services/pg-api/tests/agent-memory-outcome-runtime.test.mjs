// Optional052, disposable SQL + private mTLS only. No target or paid provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {withActor} from '../src/repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentMemoryOutcomeRepository} from '../src/agent-memory-outcome-repository.ts'
import {AgentMemoryDerivedRepository} from '../src/agent-memory-derived-repository.ts'
import {inspectAgentMemoryOutcomeSchema,verifyAgentMemoryOutcomeCredentials} from '../src/agent-memory-outcome-audit.ts'
let catalogPrinted=false
async function fixture(){const f=await agentMemoryFixture();try{
  await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'));await f.db.exec(f.sql('migrations/pg_v9_052_agent_memory_outcome.sql'))
  if(!catalogPrinted){catalogPrinted=true
    const functions=(await f.db.query("SELECT proname,prosecdef,provolatile,prorettype::regtype::text AS result,oidvectortypes(proargtypes) AS arguments,encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS source_sha256 FROM pg_catalog.pg_proc WHERE pronamespace='agentstudio'::regnamespace AND proname LIKE 'agent_memory_outcome_%' ORDER BY proname")).rows
    process.stdout.write('SYNTHETIC_OUTCOME_SCHEMA_CATALOG '+JSON.stringify({functions})+'\n')
  }
  assert.equal(await inspectAgentMemoryOutcomeSchema(f.pool),true)
  return {...f,owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true,allowOutcomeMemory:true}),outcomes:new AgentMemoryOutcomeRepository(f.pool,{allowAdmission:true,allowWriteback:true}),derived:new AgentMemoryDerivedRepository(f.pool,{allowWrites:true})}
}catch(error){await f.close();throw error}}
const body=f=>({expected_revision:f.resources.alice.spec.revision,max_steps:1,idempotency_key:'synthetic-outcome-'+randomUUID(),instruction:'Private task token=syntheticOutcomeTask',remember_outcome:true})
const submit=(f,raw=body(f))=>f.owned.submit(f.identities.alice,f.resources.alice.spec.id,raw)
const status=(f,id)=>f.outcomes.status(f.identities.alice,id)
const finish=(f,id)=>withActor(f.pool,f.identities.alice,db=>f.outcomes.finishOwned(db,f.users.alice,id))
const stopChoice=state=>({request_id:randomUUID(),run_id:state.run_id,expected_intent_sha256:state.intent_sha256,confirm:true})
async function drive(f,id,{failed=false,scope=true}={}){
  let calls=0
  await f.privateTls(async()=>{calls++;return JSON.stringify(failed?{action:'tool',tool:'synthetic_forbidden_tool',params:{}}:{action:'answer',answer:'Complete report token=syntheticOutcomeResult\n'.repeat(190)})},async make=>{
    if(scope){const done=await f.drive(()=>make({humanInputApproved:true,outcomeMemoryApproved:true}),id);assert.equal(done.run.status,failed?'failed':'succeeded')}
    else{const tick=await make({humanInputApproved:true,outcomeMemoryApproved:false}).tick();assert.equal(tick.status,'paused')}
    assert.equal((await make({humanInputApproved:true,outcomeMemoryApproved:scope}).tick()).status,'idle')
  })
  return calls
}
const counts=async f=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.runs)::integer AS runs,(SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.agent_memory_outcome_consents)::integer AS consents,(SELECT count(*) FROM agentstudio.agent_memory_outcome_stops)::integer AS stops,(SELECT count(*) FROM agentstudio.agent_memory_outcome_results)::integer AS results,(SELECT count(*) FROM agentstudio.agent_memory_derived_entries)::integer AS entries,(SELECT count(*) FROM agentstudio.agent_memory_derived_receipts)::integer AS receipts')).rows[0]

test('optional052 audits exact invoker guards and narrow Native epoch access; delegated ACL, helper, default, FK or trigger drift refuses',async()=>{
  const f=await agentMemoryFixture()
  try{
    assert.equal(await inspectAgentMemoryOutcomeSchema(f.pool),false)
    await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'));await f.db.exec(f.sql('migrations/pg_v9_052_agent_memory_outcome.sql'))
    assert.equal(await inspectAgentMemoryOutcomeSchema(f.pool),true)
    const rights=(await f.db.query("SELECT NOT has_column_privilege('agentstudio_api','agentstudio_auth.accounts','governance_revision','SELECT') AND NOT has_column_privilege('agentstudio_api','agentstudio_auth.accounts','password_record','SELECT') AND has_function_privilege('agentstudio_api','agentstudio.agent_memory_outcome_epoch()','EXECUTE') AND NOT has_function_privilege('agentstudio_worker','agentstudio.agent_memory_outcome_epoch()','EXECUTE') AS ok")).rows[0]
    assert.equal(rights.ok,true)
    const fk=(await f.db.query("SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_memory_outcome_consents'::regclass AND confrelid='agentstudio.runs'::regclass AND contype='f'")).rows[0].conname;assert.match(fk,/^[a-z0-9_]+$/)
    for(const mutation of ['GRANT UPDATE ON agentstudio.agent_memory_outcome_consents TO agentstudio_api','GRANT SELECT ON agentstudio.agent_memory_outcome_results TO agentstudio_worker',
      'GRANT SELECT ON agentstudio.agent_memory_outcome_consents TO agentstudio_api WITH GRANT OPTION','GRANT INSERT(intent_sha256) ON agentstudio.agent_memory_outcome_stops TO agentstudio_api WITH GRANT OPTION',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch() TO PUBLIC','GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch() TO agentstudio_api WITH GRANT OPTION',
      'ALTER FUNCTION agentstudio.agent_memory_outcome_epoch() SECURITY INVOKER','ALTER FUNCTION agentstudio.agent_memory_outcome_id(uuid,uuid,text) SECURITY DEFINER',
      'ALTER TABLE agentstudio.agent_memory_outcome_stops NO FORCE ROW LEVEL SECURITY','ALTER TABLE agentstudio.agent_memory_outcome_consents DISABLE TRIGGER agent_memory_outcome_consent',
      'ALTER POLICY agent_memory_outcome_results_owner_insert ON agentstudio.agent_memory_outcome_results WITH CHECK(true)',
      "ALTER TABLE agentstudio.agent_memory_outcome_results ALTER created_at SET DEFAULT now()",'ALTER TABLE agentstudio.agent_memory_outcome_consents DROP CONSTRAINT "'+fk+'"',
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_052'",'DROP TABLE agentstudio.agent_memory_outcome_results']){
      await f.db.exec('BEGIN');try{await f.db.exec(mutation);await assert.rejects(verifyAgentMemoryOutcomeCredentials(f.db),/unsafe_agent_memory_outcome_privileges/)}finally{await f.db.exec('ROLLBACK')}
    }
  }finally{await f.close()}
})

test('Native outcome consent is atomic with the original run/job and survives read-only original recovery without a new grant',async()=>{
  const f=await fixture(),raw=body(f),role=f.resources.alice.spec
  try{
    await assert.rejects(new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}).submit(f.identities.alice,role.id,raw),e=>e.code==='agent_memory_outcome_admission_disabled')
    const before=await counts(f)
    f.setFault((sql,values)=>{if(sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('agent.memory_outcome_consent'))throw Error('synthetic_outcome_admission_rollback')})
    try{await assert.rejects(submit(f,raw),/synthetic_outcome_admission_rollback/)}finally{f.setFault(undefined)}
    assert.deepEqual(await counts(f),before)
    const started=await submit(f,raw),state=await status(f,started.run.id);assert.equal(state.enabled,true);assert.equal(state.state,'pending');assert.equal(started.outcome_memory.intent_sha256,state.intent_sha256)
    const sqlId=await withActor(f.pool,f.identities.alice,db=>db.query('SELECT agentstudio.agent_memory_outcome_id($1::uuid,$2::uuid,$3::text) AS id',[f.users.alice,started.run.id,state.intent_sha256]));assert.equal(sqlId.rows[0].id,state.memory_id)
    const prior=await new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}).submit(f.identities.alice,role.id,raw);assert.equal(prior.replayed,true)
    await assert.rejects(submit(f,{...raw,remember_outcome:false}),e=>e.code==='idempotency_key_conflict')
    await assert.rejects(f.outcomes.status(f.identities.bob,started.run.id),e=>e.status===404)
    const metadata=JSON.stringify((await f.db.query('SELECT * FROM agentstudio.agent_memory_outcome_consents')).rows);assert.equal(metadata.includes('syntheticOutcomeTask'),false)
    assert.equal((await counts(f)).runs,1);assert.equal((await counts(f)).jobs,1);assert.equal((await counts(f)).consents,1)
    for(const table of ['consents','stops','results'])for(const verb of ['UPDATE','DELETE FROM','TRUNCATE']){
      const statement=verb==='UPDATE'?'UPDATE agentstudio.agent_memory_outcome_'+table+' SET intent_sha256=repeat(\'a\',64)':verb+' agentstudio.agent_memory_outcome_'+table
      await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(statement)),/permission denied/)
    }
  }finally{await f.close()}
})

test('leased terminal success and genuine failure write one bounded owned memory with no extra model effect; forget never resurrects',async()=>{
  for(const failed of [false,true]){
    const f=await fixture(),raw=body(f)
    try{
      const started=await submit(f,raw),id=started.run.id;assert.equal(await drive(f,id,{failed}),1)
      const result=(await status(f,id)).result;assert.equal(result.decision,'stored');assert.match(result.source_sha256,/^[a-f0-9]{64}$/)
      const items=(await f.derived.list(f.identities.alice,f.resources.alice.spec.id)).items;assert.equal(items.length,1);assert.equal(items[0].kind,failed?'lesson':'fact');assert.equal(items[0].source_current,true);assert.equal(JSON.stringify(items).includes('syntheticOutcomeResult'),false)
      assert.equal((await finish(f,id)).replayed,true);assert.equal((await submit(f,raw)).replayed,true);assert.equal((await counts(f)).receipts,1)
      await f.derived.change(f.identities.alice,{action:'forget',request_id:randomUUID(),spec_id:items[0].spec_id,memory_id:items[0].id,expected_content_sha256:items[0].content_sha256,expected_tools_sha256:items[0].tools_sha256,confirm:true})
      assert.equal((await finish(f,id)).replayed,true);assert.equal((await counts(f)).entries,0);assert.equal((await counts(f)).results,1);assert.equal((await counts(f)).receipts,2)
    }finally{await f.close()}
  }
})

test('owner stop, governance ABA and missing Worker approval each fence automatic storage without minting authority',async()=>{
  for(const scenario of ['stop','epoch','worker']){
    const f=await fixture()
    try{
      const started=await submit(f),id=started.run.id,state=await status(f,id),choice=stopChoice(state)
      if(scenario==='stop'){
        await assert.rejects(f.outcomes.stop(f.identities.bob,choice),e=>e.status===404)
        await f.outcomes.stop(f.identities.alice,choice);assert.equal((await new AgentMemoryOutcomeRepository(f.pool).stop(f.identities.alice,choice,true)).replayed,true)
        await assert.rejects(f.outcomes.stop(f.identities.alice,{...choice,expected_intent_sha256:'f'.repeat(64)}),e=>e.code==='agent_memory_outcome_stop_conflict')
      }
      if(scenario==='epoch')await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[f.users.alice])
      assert.equal(await drive(f,id,{scope:scenario!=='worker'}),scenario==='worker'?0:1)
      const after=await status(f,id)
      if(scenario==='worker'){assert.equal(after.result,null);assert.equal((await f.owned.get(f.identities.alice,id)).run.last_error_code,'agent_memory_outcome_execution_disabled')}
      else{assert.equal(after.result.decision,scenario==='stop'?'revoked':'source_unavailable');if(scenario==='epoch')assert.equal(after.result.reason_code,'native_epoch_changed')}
      assert.equal((await counts(f)).entries,0);assert.equal((await counts(f)).receipts,0)
    }finally{await f.close()}
  }
})

test('storage/final-memory-audit failure cannot erase the terminal task result or resend its paid effect',async()=>{
  for(const outer of [false,true]){
    const f=await fixture()
    try{
      const started=await submit(f),id=started.run.id
      f.setFault((sql,values)=>{if(sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes(outer?'agent.memory_outcome_result':'agent.memory_derived_save_success'))throw Error('synthetic_outcome_storage_audit_failure')})
      try{assert.equal(await drive(f,id),1)}finally{f.setFault(undefined)}
      const task=await f.owned.get(f.identities.alice,id);assert.equal(task.run.status,'succeeded');assert.ok(task.run.result_text.length>4000)
      const after=await status(f,id);assert.equal((await counts(f)).entries,0);assert.equal((await counts(f)).receipts,0)
      if(outer){assert.equal(after.result,null);assert.equal(after.state,'unconfirmed');const events=(await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE action='agent.v2_memory_outcome_unconfirmed'")).rows;assert.equal(events.length,1)}
      else{assert.equal(after.result.decision,'write_failed');assert.equal((await finish(f,id)).replayed,true)}
    }finally{await f.close()}
  }
})

test('old opt-out runs keep their exact private hashes and cannot gain outcome consent through replay',async()=>{
  const f=await fixture(),raw={...body(f),remember_outcome:false}
  try{
    const started=await submit(f,raw),id=started.run.id
    const original=(await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[id])).rows[0].checkpoint
    const repeated=await submit(f,raw);assert.equal(repeated.replayed,true)
    assert.deepEqual((await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[id])).rows[0].checkpoint,original)
    await assert.rejects(submit(f,{...raw,remember_outcome:true}),e=>e.code==='idempotency_key_conflict')
    assert.equal((await status(f,id)).enabled,false);assert.equal((await counts(f)).consents,0)
    await assert.rejects(withActor(f.pool,f.identities.bob,db=>f.outcomes.admitOwned(db,f.users.alice,{run_id:id,spec_id:f.resources.alice.spec.id,spec_revision:1,instruction:raw.instruction,graph_sha256:'a'.repeat(64)})),e=>e.code==='owned_admission_context_required')
  }finally{await f.close()}
})
