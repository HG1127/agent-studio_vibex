// Genuine separate-domain SchemaFull only. No runtime activation or Worker run.
// All SQL belongs to the exact guarded disposable hosted PG18 service.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'
import {workerHeartbeatDomainFixture} from './helpers/worker-heartbeat-domain-fixture.mjs'

const companySqlSha='fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923'
const dormant={schema:'telemetry_v1',phase:'schema_full_dormant',runtime_activated:false}
const unavailable=e=>e.status===503&&e.code==='worker_heartbeat_schema_unavailable'
const quote=s=>'"'+s.replaceAll('"','""')+'"'

async function businessImage(f){
 const tables=(await f.db.query("SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows
 assert.ok(tables.some(x=>x.nspname==='agentstudio_auth'&&x.relname==='sessions'))
 const parts=tables.map(({nspname,relname})=>"SELECT '"+nspname+'.'+relname+"'::text AS name,coalesce(jsonb_agg(jsonb_build_array(r.xmin::text,r.ctid::text,to_jsonb(r)) ORDER BY r.ctid),'[]'::jsonb) AS rows FROM "+quote(nspname)+'.'+quote(relname)+' r')
 const image=(await f.db.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY name) AS image FROM ('+parts.join(' UNION ALL ')+') s')).rows[0].image
 // The guarded synthetic administrator reads this image locally. Never log it.
 return createHash('sha256').update(JSON.stringify(image)).digest('hex')
}

async function install(pool,sql,{reject}={}){
 const db=await pool.connect()
 try{
  if(reject)await assert.rejects(db.query(sql),reject)
  else await db.query(sql)
 }finally{try{await db.query('ROLLBACK')}finally{db.release()}}
}

test('separate telemetry dormant SchemaFull on genuine PG18 beside unchanged full060/full061',{concurrency:false,timeout:900000},async t=>{
 requireWorkerHeartbeatCi() // Before any pg/runtime import or socket.
 const f=await workerHeartbeatDomainFixture()
 try{
  const [audit,core,company]=await Promise.all([
   import('../src/worker-heartbeat-audit.ts'),import('../src/worker-heartbeat-audit-core.ts'),import('../src/company-overview-audit.ts')
  ])
  const ddl061=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_061_company_overview.sql',import.meta.url),'utf8')
  assert.equal(createHash('sha256').update(ddl061).digest('hex'),companySqlSha)
  await install(f.adminPool,ddl061)
  const oldFull=()=>f.h.withActor(f.pool,f.identities.alice,async db=>{
   assert.equal(await f.h.verifyAgentDescriptivePatchCredentials(db),true)
   await company.verifyCompanyOverviewSchema(db)
  })
  await oldFull()
  const before=await businessImage(f)
  const ddl=readFileSync(new URL('../../../db/postgres/telemetry/001_worker_heartbeats.sql',import.meta.url),'utf8')
  assert.equal(createHash('sha256').update(ddl).digest('hex'),core.workerHeartbeatSchemaPins.sql,'frozen new telemetry SQL only')
  const inspect=()=>audit.inspectWorkerHeartbeatSchemaFull(f.telemetryPool)
  const full=async()=>assert.deepEqual(await inspect(),dormant)

  await t.test('fresh template0 database is separate and wrong-database installation changes no main rows',async()=>{
   await f.verifyTelemetryTarget();assert.equal(await inspect(),false)
   await install(f.adminPool,ddl,{reject:e=>e.message==='worker_heartbeat_install_target_refused'})
   await oldFull();assert.equal(await businessImage(f),before)
  })
  await t.test('exact dormant installation passes actual catalog audit and both unchanged predecessor FULL checks',async()=>{
   await f.verifyTelemetryTarget();await install(f.telemetryPool,ddl)
   try{await full()}catch(error){
    // Only bounded authored-domain catalog metadata. No business/auth rows,
    // credential values, query parameters or routine bodies are printed.
    const checks=(await f.telemetryPool.query("SELECT conname,pg_get_expr(conbin,conrelid) AS expression FROM pg_catalog.pg_constraint WHERE connamespace='studio_telemetry'::regnamespace ORDER BY conname")).rows
    process.stderr.write('TELEMETRY_V1_CONSTRAINT_DIAGNOSTIC '+JSON.stringify(checks).slice(0,12000)+'\n')
    throw error
   }
   await oldFull();assert.equal(await businessImage(f),before)
   assert.equal((await f.telemetryPool.query("SELECT count(*)::integer AS n FROM pg_catalog.pg_roles WHERE starts_with(rolname,'studio_telemetry_') AND rolcanlogin")).rows[0].n,0)
   assert.equal((await f.telemetryPool.query('SELECT count(*)::integer AS n FROM studio_telemetry.slot_state WHERE enabled OR generation IS NOT NULL OR last_sequence<>0 OR observed_at IS NOT NULL')).rows[0].n,0)
  })
  await t.test('schema inspection refuses a caller transaction without a consistent read-only snapshot',async()=>{
   const db=await f.telemetryPool.connect()
   try{await db.query('BEGIN');await assert.rejects(audit.verifyWorkerHeartbeatSchemaFull(db),unavailable)}
   finally{try{await db.query('ROLLBACK')}finally{db.release()}}
   await full()
  })
  await t.test('dormant functions do not authenticate an administrator SET ROLE as a reader or writer',async()=>{
   for(const [role,sql,code] of [
    ['studio_telemetry_reader','SELECT studio_telemetry.snapshot()','55000'],
    ['studio_telemetry_tx_prepare_1',"SELECT studio_telemetry.record('native_worker_heartbeat_report_v1','10000000-0000-4000-8000-000000000001',1,'ready','startup_checks_complete')",'22023']
   ]){
    const db=await f.telemetryPool.connect()
    try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE '+quote(role));await assert.rejects(db.query(sql),e=>e.code===code)}
    finally{try{await db.query('ROLLBACK')}finally{db.release()}}
   }
   await full()
  })
  // An alternate table AM can use the same builtin heap handler and preserve
  // all row/column/key/policy/ACL properties. Check the actual relation method,
  // not only a mocked aggregate "ok" or the presence of another catalog row.
  for(const table of ['kind_config','slot_state'])await t.test('actual alternate table method refuses and heap restoration recovers: '+table,async()=>{
   assert.equal((await f.telemetryPool.query("SELECT count(*)::integer AS n FROM pg_catalog.pg_am WHERE amname='telemetry_ci_heap_alias'")).rows[0].n,0)
   await f.telemetryPool.query('CREATE ACCESS METHOD telemetry_ci_heap_alias TYPE TABLE HANDLER pg_catalog.heap_tableam_handler')
   try{
    await full() // An unused AM alias alone does not invalidate either table.
    await f.telemetryPool.query('ALTER TABLE studio_telemetry.'+quote(table)+' SET ACCESS METHOD telemetry_ci_heap_alias')
    const actual=(await f.telemetryPool.query("SELECT am.amname::text AS method,am.amtype::text AS type,am.amhandler='pg_catalog.heap_tableam_handler'::regproc AS same_builtin_handler FROM pg_catalog.pg_class c JOIN pg_catalog.pg_am am ON am.oid=c.relam WHERE c.oid=$1::regclass",['studio_telemetry.'+table])).rows[0]
    assert.deepEqual(actual,{method:'telemetry_ci_heap_alias',type:'t',same_builtin_handler:true})
    await assert.rejects(inspect(),unavailable)
   }finally{
    await f.telemetryPool.query('ALTER TABLE studio_telemetry.'+quote(table)+' SET ACCESS METHOD heap')
    await f.telemetryPool.query('DROP ACCESS METHOD telemetry_ci_heap_alias')
   }
   await full()
  })
  const drifts=[
   ['unexpected LOGIN','ALTER ROLE studio_telemetry_reader LOGIN','ALTER ROLE studio_telemetry_reader NOLOGIN'],
   ['unexpected inheritance','ALTER ROLE studio_telemetry_tx_prepare_1 INHERIT','ALTER ROLE studio_telemetry_tx_prepare_1 NOINHERIT'],
   ['old API executable access','GRANT EXECUTE ON FUNCTION studio_telemetry.snapshot() TO agentstudio_api','REVOKE EXECUTE ON FUNCTION studio_telemetry.snapshot() FROM agentstudio_api'],
   ['unexpected public object','CREATE TABLE public.telemetry_ci_extra(value integer)','DROP TABLE public.telemetry_ci_extra'],
   ['function security drift','ALTER FUNCTION studio_telemetry.snapshot() SECURITY INVOKER','ALTER FUNCTION studio_telemetry.snapshot() SECURITY DEFINER'],
   ['enabled kind without runtime activation',"UPDATE studio_telemetry.kind_config SET instrumented=true,enabled=true WHERE kind='prepare'","UPDATE studio_telemetry.kind_config SET instrumented=false,enabled=false WHERE kind='prepare'"]
  ]
  for(const [label,change,restore] of drifts)await t.test('actual drift refuses and exact restoration recovers: '+label,async()=>{
   await full();await f.telemetryPool.query(change)
   try{await assert.rejects(inspect(),unavailable)}finally{await f.telemetryPool.query(restore)}
   await full()
  })
  await t.test('raw sensitive system-table ACL is rejected even when effective write is masked by PG18',async()=>{
   await f.telemetryPool.query('GRANT UPDATE ON pg_catalog.pg_authid TO studio_telemetry_reader')
   try{
    const actual=(await f.telemetryPool.query("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) g WHERE c.oid='pg_catalog.pg_authid'::regclass AND g.grantee='studio_telemetry_reader'::regrole AND g.privilege_type='UPDATE') AS raw")).rows[0]
    assert.equal(actual.raw,true)
    await assert.rejects(inspect(),unavailable)
   }finally{await f.telemetryPool.query('REVOKE UPDATE ON pg_catalog.pg_authid FROM studio_telemetry_reader')}
   await full()
  })
  await t.test('duplicate installation refuses without resetting the domain; original data and FULL audits remain intact',async()=>{
   await install(f.telemetryPool,ddl,{reject:e=>e.message==='worker_heartbeat_install_requires_empty_database'})
   await full();await f.verifyTelemetryTarget();await oldFull()
   assert.equal(await businessImage(f),before)
  })
 }finally{await f.close()}
})
