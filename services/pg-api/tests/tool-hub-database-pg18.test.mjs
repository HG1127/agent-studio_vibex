// Actual069 catalog/deparser/ACL/RLS/trigger checks on one dedicated fresh PG18.
// Every deliberate catalog mutation is restored before the next assertion.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {toolHubGenuineFixture} from './helpers/tool-hub-genuine-fixture.mjs'
const table='agentstudio.toolhub_trials',mutations=[
 ['extra table','CREATE TABLE agentstudio.toolhub_fixture_extra(id integer)','DROP TABLE agentstudio.toolhub_fixture_extra'],
 ['extra index','CREATE INDEX ix_toolhub_fixture_extra ON '+table+'(created_at)','DROP INDEX agentstudio.ix_toolhub_fixture_extra'],
 ['extra type',"CREATE TYPE agentstudio.toolhub_fixture_extra AS ENUM('x')",'DROP TYPE agentstudio.toolhub_fixture_extra'],
 ['extra schema','CREATE SCHEMA toolhub_fixture_extra','DROP SCHEMA toolhub_fixture_extra'],
 ['extra function',"CREATE FUNCTION agentstudio.toolhub_fixture_extra() RETURNS boolean LANGUAGE sql AS 'SELECT true'",'DROP FUNCTION agentstudio.toolhub_fixture_extra()'],
 ['disabled RLS','ALTER TABLE '+table+' DISABLE ROW LEVEL SECURITY','ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY'],
 ['unforced RLS','ALTER TABLE '+table+' NO FORCE ROW LEVEL SECURITY','ALTER TABLE '+table+' FORCE ROW LEVEL SECURITY'],
 ['extra policy','CREATE POLICY f069_extra ON '+table+' TO agentstudio_api USING(true)','DROP POLICY f069_extra ON '+table],
 ['API update grant','GRANT UPDATE ON '+table+' TO agentstudio_api','REVOKE UPDATE ON '+table+' FROM agentstudio_api'],
 ['API column grant','GRANT SELECT(target) ON '+table+' TO agentstudio_api','REVOKE SELECT(target) ON '+table+' FROM agentstudio_api'],
 ['Worker grant','GRANT SELECT ON '+table+' TO agentstudio_worker','REVOKE SELECT ON '+table+' FROM agentstudio_worker'],
 ['PUBLIC grant','GRANT SELECT ON '+table+' TO PUBLIC','REVOKE SELECT ON '+table+' FROM PUBLIC'],
 ['helper API execute','GRANT EXECUTE ON FUNCTION agentstudio.toolhub_trial_link_valid() TO agentstudio_api','REVOKE EXECUTE ON FUNCTION agentstudio.toolhub_trial_link_valid() FROM agentstudio_api'],
 ['helper PUBLIC execute','GRANT EXECUTE ON FUNCTION agentstudio.toolhub_trial_one_run() TO PUBLIC','REVOKE EXECUTE ON FUNCTION agentstudio.toolhub_trial_one_run() FROM PUBLIC'],
 ['nullable target','ALTER TABLE '+table+' ALTER COLUMN target DROP NOT NULL','ALTER TABLE '+table+' ALTER COLUMN target SET NOT NULL'],
 ['changed default',"ALTER TABLE "+table+" ALTER COLUMN created_at SET DEFAULT now()",'ALTER TABLE '+table+' ALTER COLUMN created_at SET DEFAULT clock_timestamp()'],
 ['extra storage setting','ALTER TABLE '+table+' SET(fillfactor=90)','ALTER TABLE '+table+' RESET(fillfactor)'],
 ['replica identity','ALTER TABLE '+table+' REPLICA IDENTITY FULL','ALTER TABLE '+table+' REPLICA IDENTITY DEFAULT'],
 ['link trigger disabled','ALTER TABLE '+table+' DISABLE TRIGGER toolhub_trial_link_valid','ALTER TABLE '+table+' ENABLE TRIGGER toolhub_trial_link_valid'],
 ['source trigger disabled','ALTER TABLE agentstudio.workflows DISABLE TRIGGER toolhub_trial_source_immutable','ALTER TABLE agentstudio.workflows ENABLE TRIGGER toolhub_trial_source_immutable'],
 ['ordinary second-run trigger disabled','ALTER TABLE agentstudio.runs DISABLE TRIGGER toolhub_trial_one_run','ALTER TABLE agentstudio.runs ENABLE TRIGGER toolhub_trial_one_run'],
 ['RI trigger disabled','ALTER TABLE '+table+' DISABLE TRIGGER ALL','ALTER TABLE '+table+' ENABLE TRIGGER ALL'],
 ['inbound FK','CREATE TABLE agentstudio.f069_fixture_reference(id uuid REFERENCES '+table+'(run_id))','DROP TABLE agentstudio.f069_fixture_reference'],
 ['attached statistics','CREATE STATISTICS agentstudio.f069_fixture_stats ON purpose,source_kind FROM '+table,'DROP STATISTICS agentstudio.f069_fixture_stats'],
 ['unsafe search path','ALTER FUNCTION agentstudio.toolhub_trial_link_valid() SET search_path=public,pg_catalog','ALTER FUNCTION agentstudio.toolhub_trial_link_valid() SET search_path=pg_catalog'],
 ['invoker flag','ALTER FUNCTION agentstudio.toolhub_trial_one_run() SECURITY INVOKER','ALTER FUNCTION agentstudio.toolhub_trial_one_run() SECURITY DEFINER'],
 ['parallel flag','ALTER FUNCTION agentstudio.toolhub_trial_one_run() PARALLEL SAFE','ALTER FUNCTION agentstudio.toolhub_trial_one_run() PARALLEL UNSAFE'],
]
test('F16-19 actual069 catalog and owner transaction boundaries',{concurrency:false,timeout:900000},async t=>{
 if(process.env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE!=='database')throw Error('tool_hub_genuine_database_suite_required')
 const f=await toolHubGenuineFixture(),step=async(name,work)=>{let failure,done=false;await t.test(name,async()=>{try{await work();done=true}catch(error){failure=error;throw error}});if(failure)throw failure;if(!done)throw Error('tool_hub_database_step_incomplete')},audit=async()=>{const db=await f.pool.connect();try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api');const observed=(await db.query("SELECT session_user login,current_user role,current_setting('server_version_num')::integer version")).rows[0];assert.equal(observed.login,'synthetic_assessment_api');assert.equal(observed.role,'agentstudio_api');assert.equal(db.connection.stream.remoteAddress,'127.0.0.1');assert.equal(db.connection.stream.remotePort,5432);assert.ok(observed.version>=180000&&observed.version<190000);return await f.audit(db)}finally{await db.query('ROLLBACK');db.release()}},positive=async()=>assert.equal(await audit(),true)
 try{
  await step('full actual069 catalog and PostgreSQL deparser pass exact source and original Native guard',positive)
  for(const [name,apply,restore]of mutations)await step('actual auditor refuses '+name+' and exact restoration passes',async()=>{let changed=false;try{await f.db.query(apply);changed=true;await assert.rejects(audit(),/unsafe_owner_tool_trial_privileges/);assert.equal((await f.request('alice','/api/v2/tool-hub/stats')).status,503)}finally{if(changed)await f.db.query(restore)}await positive()})
  await step('second login parent is refused without impersonating an administrator as API',async()=>{let created=false,granted=false;try{await f.db.query('CREATE ROLE f069_fixture_parent NOLOGIN');created=true;await f.db.query('GRANT f069_fixture_parent TO synthetic_assessment_api WITH INHERIT FALSE, SET TRUE');granted=true;await assert.rejects(audit(),/unsafe_owner_tool_trial_privileges/)}finally{if(granted)await f.db.query('REVOKE f069_fixture_parent FROM synthetic_assessment_api');if(created)await f.db.query('DROP ROLE f069_fixture_parent')}await positive()})
  await step('actual routine body pin rejects replacement and restores exact original pg_get_functiondef',async()=>{const before=(await f.db.query("SELECT pg_get_functiondef('agentstudio.toolhub_trial_one_run()'::regprocedure) AS definition")).rows[0].definition;try{await f.db.query("CREATE OR REPLACE FUNCTION agentstudio.toolhub_trial_one_run() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $x$ BEGIN RETURN NEW; END $x$");await assert.rejects(audit(),/unsafe_owner_tool_trial_privileges/)}finally{await f.db.query(before)}await positive()})
  await step('owner policy and SQL NULL-sensitive target/fee CHECKs cannot be replaced by superficially similar conditions',async()=>{const constraint=(await f.db.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='agentstudio.toolhub_trials'::regclass AND contype='c'")).rows.find(r=>r.definition.includes("'kind'"));assert.ok(constraint);assert.match(constraint.conname,/^[a-z0-9_]+$/);try{await f.db.query('ALTER TABLE '+table+' DROP CONSTRAINT '+constraint.conname);await f.db.query('ALTER TABLE '+table+' ADD CONSTRAINT '+constraint.conname+" CHECK(target->>'kind'=source_kind)");await assert.rejects(audit(),/unsafe_owner_tool_trial_privileges/)}finally{await f.db.query('ALTER TABLE '+table+' DROP CONSTRAINT IF EXISTS '+constraint.conname);await f.db.query('ALTER TABLE '+table+' ADD CONSTRAINT '+constraint.conname+' '+constraint.definition)}await positive()})
  await step('real API owns SELECT/INSERT only; Worker cannot select receipt table or execute private trigger helpers',async()=>{const {withActor}=await import('../src/repository.ts'),alice=await f.identityFor('alice'),choice={purpose:'tool',request_id:randomUUID(),target:{kind:'builtin',tool:'calculate'},arguments_json:'{"expression":"8+1"}',effect_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_EFFECT'},reply=await f.request('alice','/api/v2/tool-hub/trials',choice);assert.equal(reply.status,201);const receipt=reply.body.receipt;assert.equal(await withActor(f.pool,alice,async db=>(await db.query('SELECT count(*)::integer AS n FROM '+table+' WHERE request_id=$1',[choice.request_id])).rows[0].n),1);assert.equal(await withActor(f.pool,await f.identityFor('bob'),async db=>(await db.query('SELECT count(*)::integer AS n FROM '+table+' WHERE request_id=$1',[choice.request_id])).rows[0].n),0)
   for(const sql of ['UPDATE '+table+' SET target=target WHERE request_id=$1','DELETE FROM '+table+' WHERE request_id=$1'])await assert.rejects(withActor(f.pool,alice,db=>db.query(sql,[choice.request_id])),e=>e.code==='42501')
   const worker=await f.workflowWorkerPool.connect();try{await worker.query('BEGIN');await worker.query('SET LOCAL ROLE agentstudio_worker');await assert.rejects(worker.query('SELECT * FROM '+table),e=>e.code==='42501')}finally{await worker.query('ROLLBACK');worker.release()}
   const before=await f.counts();for(const badTarget of [{},{kind:'builtin'}])await assert.rejects(f.db.query('INSERT INTO '+table+" SELECT owner_user_id,$2::uuid,purpose,source_kind,$3::jsonb,target_identity_sha256,arguments_sha256,request_sha256,graph_sha256,workflow_id,run_id,effect_consent,fee_consent,created_at FROM "+table+' WHERE request_id=$1',[choice.request_id,randomUUID(),JSON.stringify(badTarget)]),e=>e.code==='23514');assert.deepEqual(await f.counts(),before);assert.equal((await f.request('bob','/api/v2/tool-hub/trials/'+receipt.request_id)).status,404)
  })
  await step('final exact catalog and original role/ledger boundaries hold with no provider executions',async()=>{await positive();assert.equal(f.network.http,0);assert.equal(f.network.mcp,0);assert.equal(f.network.model,0)})
 }finally{await f.close()}
})
