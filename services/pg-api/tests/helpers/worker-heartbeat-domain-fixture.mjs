// Authored for one disposable hosted PG18 job. Importing opens no connection.
// The service container owns cleanup: never DROP or reuse an existing database.
import assert from 'node:assert/strict'
import {requireWorkerHeartbeatCi,workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

const identitySql=`SELECT current_database() AS database,current_user AS actor,session_user AS session,
 current_setting('server_version_num')::integer AS version,current_setting('server_encoding') AS encoding,
 d.oid::integer AS database_oid,d.datdba::integer AS owner_oid,r.rolsuper AS super,
 (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_id
 FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database()`

function identity(row,database){
 assert.equal(row.database,database)
 assert.equal(row.actor,'agentstudio_admin');assert.equal(row.session,row.actor)
 assert.equal(row.super,true);assert.ok(row.version>=180000&&row.version<190000)
 assert.equal(row.encoding,'UTF8')
 assert.ok(Number.isSafeInteger(row.database_oid)&&row.database_oid>0)
 assert.ok(Number.isSafeInteger(row.owner_oid)&&row.owner_oid>0)
 assert.match(row.system_id,/^[1-9][0-9]{0,19}$/)
}

export async function workerHeartbeatDomainFixture(){
 const capability=requireWorkerHeartbeatCi() // Before all database/runtime imports.
 const options=workerHeartbeatCiAdminOptions(capability,'telemetry')
 const [{descriptivePatchFixture},{default:pg}]=await Promise.all([
  import('./agent-descriptive-patch-fixture.mjs'),import('pg')
 ])
 const f=await descriptivePatchFixture()
 let telemetryPool,createdOid,ended=false
 try{
  const main=(await f.adminPool.query(identitySql)).rows[0]
  identity(main,'agentstudio_pg18_ci')
  const existing=(await f.adminPool.query(`SELECT
   EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname='agent_studio_telemetry') AS database,
   EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE starts_with(rolname,'studio_telemetry_')) AS roles`)).rows[0]
  assert.deepEqual(existing,{database:false,roles:false},'refuse pre-existing domain; never reuse or remove it')
  await f.adminPool.query("CREATE DATABASE agent_studio_telemetry WITH TEMPLATE template0 ENCODING 'UTF8' OWNER agentstudio_admin")
  const created=(await f.adminPool.query("SELECT oid::integer AS id,datdba::integer AS owner FROM pg_catalog.pg_database WHERE datname='agent_studio_telemetry'")).rows
  assert.equal(created.length,1);assert.equal(created[0].owner,main.owner_oid)
  createdOid=created[0].id
  assert.ok(Number.isSafeInteger(createdOid)&&createdOid>0&&createdOid!==main.database_oid)
  telemetryPool=new pg.Pool({...options,max:2})
  const verifyTarget=async()=>{
   const current=(await telemetryPool.query(identitySql)).rows[0]
   identity(current,'agent_studio_telemetry')
   assert.equal(current.database_oid,createdOid);assert.equal(current.owner_oid,main.owner_oid)
   assert.equal(current.system_id,main.system_id,'both databases must belong to the same actual disposable cluster')
   return true
  }
  await verifyTarget()
  const empty=(await telemetryPool.query(`SELECT
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE NOT starts_with(nspname,'pg_') AND nspname NOT IN('public','information_schema')) AND
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AND
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql') AS empty`)).rows[0]
  assert.equal(empty.empty,true,'template0 domain must be genuinely empty before authored installation')
  return {...f,telemetryPool,verifyTelemetryTarget:verifyTarget,telemetryDatabaseOid:createdOid,
   async close(){
    if(ended)return
    ended=true
    try{await telemetryPool.end()}finally{await f.close()}
    // Do not DROP DATABASE/roles. GitHub removes this job's disposable service.
   }}
 }catch(error){
  try{await telemetryPool?.end()}finally{await f.close()}
  throw error
 }
}
