import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {requireNativeLocalDeviceGenuineCi} from './helpers/native-local-device-genuine-guard.mjs'
requireNativeLocalDeviceGenuineCi()
test('actual SQL067 catalog, original LOGIN, privilege, immutable and predecessor fences',async t=>{
 const {nativeLocalDeviceGenuineFixture}=await import('./helpers/native-local-device-genuine-fixture.mjs'),f=await nativeLocalDeviceGenuineFixture();t.after(()=>f.close())
 const inspect=()=>f.audit.inspectNativeLocalDevicePool(f.pool,'agentstudio_api')
 const inspectExecutor=()=>f.audit.inspectNativeLocalDevicePool(f.executorPool,'agentstudio_local_executor')
 let executorToken,executorDeviceId
 const rpc=()=>f.executor(executorToken,'poll',{catalog:[],claim:randomBytes(32).toString('hex')})
 async function executorQuery(sql,role=true,pool=f.executorPool){const db=await pool.connect();try{await db.query('BEGIN READ ONLY');if(role)await db.query('SET LOCAL ROLE '+(pool===f.executorPool?'agentstudio_local_executor':'agentstudio_api'));return(await db.query(sql)).rows}finally{await db.query('ROLLBACK');db.release()}}
 async function rejectedCatalog(){await assert.rejects(inspect);await assert.rejects(inspectExecutor);assert.equal((await rpc()).status,503)}
 async function restoredCatalog(){assert.equal(await inspect(),true);assert.equal(await inspectExecutor(),true);assert.equal((await rpc()).status,200)}
 await t.test('actual installed catalog and independent executor LOGIN pass their own auditors',async()=>{assert.equal(await inspect(),true);assert.equal(await f.audit.inspectNativeLocalDevicePool(f.executorPool,'agentstudio_local_executor'),true)})
 await t.test('independent executor passes its complete per-RPC audit and real pairing/poll path without table access',async()=>{
  await f.login('alice');const created=await f.request('alice','/api/v2/local-devices',{action:'create',request_id:randomUUID(),name:'Synthetic catalog-bound executor'})
  assert.equal(created.status,200);executorDeviceId=created.body.receipt.id;executorToken=randomBytes(32).toString('hex')
  assert.equal((await f.executor(null,'pair',{request_id:randomUUID(),pairing_code:created.body.pairing_code,device_token:executorToken})).status,200)
  await restoredCatalog()
 })
 await t.test('actual expiry cancels queued and running jobs after a catalog change without claiming or executing either again',async()=>{
  const catalog=[{name:'synthetic.expiry_probe',description:'CI protocol catalog only; no local implementation or effect',inputSchema:{type:'object',additionalProperties:false,properties:{label:{type:'string'}},required:['label']}}]
  for(const state of ['queued','running']){
   assert.equal((await f.executor(executorToken,'poll',{catalog,claim:randomBytes(32).toString('hex')})).status,200)
   const made=await f.request('alice','/api/v2/local-devices',{action:'enqueue',request_id:randomUUID(),id:executorDeviceId,input:{tool:'synthetic.expiry_probe',arguments:{label:state}},confirm:true});assert.equal(made.status,200)
   if(state==='running'){const claimed=await f.executor(executorToken,'poll',{catalog,claim:randomBytes(32).toString('hex')});assert.equal(claimed.status,200);assert.equal(claimed.body.job.id,made.body.receipt.id)}
   const changed=[{...catalog[0],description:'Changed synthetic catalog; old jobs must be cancelled'}],polled=await f.executor(executorToken,'poll',{catalog:changed,claim:randomBytes(32).toString('hex')});assert.equal(polled.status,200);assert.equal(polled.body.job,null)
   const actual=await f.request('alice','/api/v2/local-devices/jobs/'+made.body.receipt.id);assert.equal(actual.status,200);assert.equal(actual.body.status,'cancelled');assert.equal(actual.body.error,'catalog_changed')
   const row=(await f.db.query('SELECT status,error,result,claim_hash IS NOT NULL AS was_claimed FROM agentstudio.native_local_jobs WHERE id=$1',[made.body.receipt.id])).rows[0];assert.equal(row.status,'cancelled');assert.equal(row.error,'catalog_changed');assert.equal(row.result,null);assert.equal(row.was_claimed,state==='running')
   const replay=await f.executor(executorToken,'poll',{catalog:changed,claim:randomBytes(32).toString('hex')});assert.equal(replay.status,200);assert.equal(replay.body.job,null)
  }
  await restoredCatalog()
 })
 await t.test('fixed no-argument marker RPC reads the actual installed row and grants no direct schema_migrations access',async()=>{
  assert.deepEqual(await executorQuery('SELECT agentstudio.native_local_executor_installed() AS installed'),[{installed:true}])
  await assert.rejects(()=>executorQuery('SELECT version FROM agentstudio.schema_migrations'),{code:'42501'})
  await assert.rejects(()=>executorQuery('SELECT agentstudio.native_local_executor_installed()',false),{code:'42501'})
  await assert.rejects(()=>executorQuery('SELECT agentstudio.native_local_executor_installed()',true,f.pool),{code:'42501'})
  await assert.rejects(()=>f.db.query('SELECT agentstudio.native_local_executor_installed()'),/native_local_original_login_required/)
 })
 await t.test('removing the actual067 installed row denies startup and each executor RPC, then exact restoration passes',async()=>{
  const saved=(await f.db.query("DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_067' RETURNING version,description,applied_at")).rows;assert.equal(saved.length,1)
  try{assert.deepEqual(await executorQuery('SELECT agentstudio.native_local_executor_installed() AS installed'),[{installed:false}]);await rejectedCatalog()}
  finally{await f.db.query('INSERT INTO agentstudio.schema_migrations(version,description,applied_at) VALUES($1,$2,$3)',[saved[0].version,saved[0].description,saved[0].applied_at])}
  await restoredCatalog()
 })
 await t.test('constant true marker source is refused before it can supply installed proof',async()=>{
  const saved=(await f.db.query("SELECT pg_get_functiondef('agentstudio.native_local_executor_installed()'::regprocedure) AS definition")).rows[0]
  await mutation("CREATE OR REPLACE FUNCTION agentstudio.native_local_executor_installed() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS 'BEGIN RETURN true;END'",saved.definition)
 })
 await t.test('PUBLIC and API grants on the marker RPC are rejected by the exact31-function surface',async()=>{
  for(const role of ['PUBLIC','agentstudio_api'])await mutation('GRANT EXECUTE ON FUNCTION agentstudio.native_local_executor_installed() TO '+role,'REVOKE EXECUTE ON FUNCTION agentstudio.native_local_executor_installed() FROM '+role)
 })
 await t.test('marker RPC itself rejects an unsafe original LOGIN even after SET ROLE',async()=>{
  await f.db.exec('ALTER ROLE synthetic_local_executor INHERIT')
  try{await assert.rejects(()=>executorQuery('SELECT agentstudio.native_local_executor_installed()'),/native_local_original_login_required/);assert.equal(await inspect(),true);await assert.rejects(inspectExecutor);assert.equal((await rpc()).status,503)}
  finally{await f.db.exec('ALTER ROLE synthetic_local_executor NOINHERIT')}
  await restoredCatalog()
 })
 await t.test('original LOGIN proof occurs before SET ROLE and rejects a role-switched caller',async()=>{const db=await f.pool.connect();try{await db.query('BEGIN READ ONLY');assert.equal(await f.audit.verifyNativeLocalDeviceOriginal(db,'agentstudio_api'),true);await db.query('SET LOCAL ROLE agentstudio_api');await assert.rejects(()=>f.audit.verifyNativeLocalDeviceOriginal(db,'agentstudio_api'))}finally{await db.query('ROLLBACK');db.release()}})
 async function mutation(unsafe,restore){await f.db.exec(unsafe);try{await rejectedCatalog()}finally{await f.db.exec(restore)}await restoredCatalog()}
 await t.test('raw table and column grants are refused, then actual restored catalog passes',()=>mutation('GRANT SELECT ON agentstudio.native_local_devices TO agentstudio_api','REVOKE SELECT ON agentstudio.native_local_devices FROM agentstudio_api'))
 await t.test('PUBLIC function capability is refused',()=>mutation('GRANT EXECUTE ON FUNCTION agentstudio.native_local_record(jsonb) TO PUBLIC','REVOKE EXECUTE ON FUNCTION agentstudio.native_local_record(jsonb) FROM PUBLIC'))
 await t.test('disabled monotone trigger is refused',()=>mutation('ALTER TABLE agentstudio.native_local_jobs DISABLE TRIGGER native_local_jobs_monotone','ALTER TABLE agentstudio.native_local_jobs ENABLE TRIGGER native_local_jobs_monotone'))
 await t.test('unreviewed additional routine is refused',()=>mutation("CREATE FUNCTION agentstudio.native_local_extra() RETURNS integer LANGUAGE sql AS 'SELECT 1'",'DROP FUNCTION agentstudio.native_local_extra()'))
 await t.test('actual function source mutation is refused without trusting a callback or function name',async()=>{const row=(await f.db.query("SELECT pg_get_functiondef('agentstudio.native_local_ms(timestamptz)'::regprocedure) AS definition")).rows[0];await mutation("CREATE OR REPLACE FUNCTION agentstudio.native_local_ms(v timestamptz) RETURNS bigint LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS 'SELECT 1::bigint'",row.definition)})
 await t.test('predecessor canonical digest body is pinned, not merely referenced by name',async()=>{const row=(await f.db.query("SELECT pg_get_functiondef('agentstudio.agent_design_digest(jsonb)'::regprocedure) AS definition")).rows[0];await mutation("CREATE OR REPLACE FUNCTION agentstudio.agent_design_digest(jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS 'SELECT repeat(''0'',64)'",row.definition)})
 await t.test('original numeric canonicalizer requires its exact extra_float_digits=3 setting',async()=>{
  await mutation('ALTER FUNCTION agentstudio.agent_design_number(numeric) SET extra_float_digits=2','ALTER FUNCTION agentstudio.agent_design_number(numeric) SET extra_float_digits=3')
  await mutation('ALTER FUNCTION agentstudio.agent_design_number(numeric) RESET extra_float_digits','ALTER FUNCTION agentstudio.agent_design_number(numeric) SET extra_float_digits=3')
 })
 await t.test('an extra numeric GUC on any other pinned predecessor is refused',()=>mutation('ALTER FUNCTION agentstudio.agent_design_digest(jsonb) SET extra_float_digits=3','ALTER FUNCTION agentstudio.agent_design_digest(jsonb) RESET extra_float_digits'))
 await t.test('executor direct access to Native accounts is rejected before role selection',async()=>{await f.db.exec('GRANT USAGE ON SCHEMA agentstudio_auth TO synthetic_local_executor');try{await assert.rejects(()=>f.audit.inspectNativeLocalDevicePool(f.executorPool,'agentstudio_local_executor'))}finally{await f.db.exec('REVOKE USAGE ON SCHEMA agentstudio_auth FROM synthetic_local_executor')}assert.equal(await f.audit.inspectNativeLocalDevicePool(f.executorPool,'agentstudio_local_executor'),true)})
 await t.test('owner receipts reject UPDATE and DELETE even by fixture administrator',async()=>{for(const operation of ['UPDATE agentstudio.native_local_receipts SET request_sha256=repeat(\'0\',64)','DELETE FROM agentstudio.native_local_receipts'])await assert.rejects(()=>f.db.exec(operation),/native_local_immutable/)})
})
