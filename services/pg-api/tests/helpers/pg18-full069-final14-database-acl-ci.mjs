// Genuine isolated final13 fixture only. Never run locally. The opaque existing
// Final trust and original hosted-purpose guard precede credential or driver use.
// Every negative is an actual uncommitted ACL change, observed by actual SELECTs
// through the same pure whole-row comparator used by the runtime. ROLLBACK is
// mandatory; this function never grants runtime/Native/qualification authority.
import {performance} from 'node:perf_hooks'
import {assertFinalPathCiHost,assertFinalPathCiStable} from './pg18-full069-final-path-ci-guard.mjs'
import {finalContext,assertFinalStable} from '../../src/pg18-full069-final-trust.mjs'
import {readLivePrivate} from '../../src/pg18-full069-worker-live-trust.mjs'
import {verifyCompleteProfileOperatorRuntime,loadCompleteProfileOperatorPg} from '../../src/pg18-complete-operator-runtime.mjs'
import {final14CatalogSelects} from '../../src/pg18-full069-final14-catalog.mjs'
import {inspectFinal14DatabaseAclRows} from '../../src/pg18-full069-final14-database-acl.mjs'
const fail=()=>{throw Error('full069_final_path_ci_database_acl_negative')}
const cases=Object.freeze([
 ['missing_original_public_temp','REVOKE TEMPORARY ON DATABASE agent_studio FROM PUBLIC'],
 ['missing_F05_worker_connect','REVOKE CONNECT ON DATABASE agent_studio FROM agentstudio_plan_workflow_worker_login'],
 ['missing_F05_dispatch_connect','REVOKE CONNECT ON DATABASE agent_studio FROM agentstudio_plan_workflow_dispatch_login'],
 ['F05_worker_grant_option','GRANT CONNECT ON DATABASE agent_studio TO agentstudio_plan_workflow_worker_login WITH GRANT OPTION'],
 ['F05_dispatch_grant_option','GRANT CONNECT ON DATABASE agent_studio TO agentstudio_plan_workflow_dispatch_login WITH GRANT OPTION'],
 ['extra_business_public_connect','GRANT CONNECT ON DATABASE agent_studio TO PUBLIC'],
 ['extra_business_public_create','GRANT CREATE ON DATABASE agent_studio TO PUBLIC'],
 ['extra_source_group_connect','GRANT CONNECT ON DATABASE agent_studio TO agentstudio_plan_workflow_worker'],
 ['extra_telemetry_public_connect','GRANT CONNECT ON DATABASE agent_studio_telemetry TO PUBLIC'],
 ['extra_telemetry_public_temp','GRANT TEMPORARY ON DATABASE agent_studio_telemetry TO PUBLIC'],
 ['cross_database_F05_connect','GRANT CONNECT ON DATABASE postgres TO agentstudio_plan_workflow_worker_login'],
 ['extra_template0_public_temp','GRANT TEMPORARY ON DATABASE template0 TO PUBLIC'],
 ['extra_template1_public_temp','GRANT TEMPORARY ON DATABASE template1 TO PUBLIC'],
])
export async function runActualFinal14DatabaseAclNegatives(trust,guard){
 assertFinalPathCiHost();assertFinalPathCiStable(guard);const ctx=finalContext(trust);assertFinalStable(trust)
 const base=ctx.base,cap=verifyCompleteProfileOperatorRuntime(ctx.source.complete,base.profile.complete_source_sha256,{manifestFile:base.profile.runtime_manifest_file,manifestSha256:base.profile.runtime_manifest_sha256,lockSha256:base.profile.runtime_lock_sha256}),{Pool}=loadCompleteProfileOperatorPg(cap),bytes=readLivePrivate(base.profile.credentials.admin,{max:4096}).bytes,password=bytes.toString('utf8').replace(/\r?\n$/,'')
 if(!Buffer.from(bytes.toString('utf8')).equals(bytes)||password.length<32||password.length>512||/[^!-~]/.test(password))fail()
 const pool=new Pool({host:'127.0.0.1',port:5333,database:'agent_studio',user:'postgres',password,ssl:false,options:'',max:1,connectionTimeoutMillis:2000,idleTimeoutMillis:2000,statement_timeout:3000,query_timeout:4000});let db,begun=false,failed=false,primary=null,cleanup=null,passed=0
 pool.on('error',()=>{failed=true});const deadline=performance.now()+8000,current=()=>{if(failed||performance.now()>=deadline)fail()}
 try{
  db=await pool.connect();current();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE');begun=true
  await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'")
  const context=(await db.query(final14CatalogSelects.context)).rows
  if(context.length!==1||context[0].login!=='postgres'||context[0].actor!=='postgres'||context[0].database!=='agent_studio'||context[0].database_oid!==ctx.bindings.business_target.database_oid||context[0].system_identifier!==ctx.bindings.business_target.system_identifier||context[0].postmaster_started_us!==base.rootProfile.binding.postmaster_started_us||context[0].host!=='127.0.0.1'||context[0].port!==5333||context[0].version<180000||context[0].version>=190000||context[0].readonly!=='off'||context[0].isolation!=='repeatable read'||context[0].search_path!=='pg_catalog'||context[0].no_temp!==true||context[0].primary!==true||context[0].superuser!==true)fail()
  const roles=(await db.query(final14CatalogSelects.roles)).rows,databases=(await db.query(final14CatalogSelects.databases)).rows,read=async()=>{const rows=(await db.query(final14CatalogSelects.databaseAcl)).rows;current();return rows},baseline=await read(),baselineText=JSON.stringify(baseline)
  inspectFinal14DatabaseAclRows(baseline,databases,roles)
  for(const [name,sql]of cases){
   assertFinalPathCiHost();current();await db.query('SAVEPOINT final14_acl_negative')
   await db.query(sql);current();const observed=await read();let refused=false
   try{inspectFinal14DatabaseAclRows(observed,databases,roles)}catch(error){if(Object.getOwnPropertyDescriptor(error??{},'message')?.value==='full069_final14_catalog_database_acl')refused=true;else throw error}
   if(!refused||JSON.stringify(observed)===baselineText)fail()
   await db.query('ROLLBACK TO SAVEPOINT final14_acl_negative');await db.query('RELEASE SAVEPOINT final14_acl_negative');const restored=await read();inspectFinal14DatabaseAclRows(restored,databases,roles);if(JSON.stringify(restored)!==baselineText)fail();passed++
   process.stdout.write(JSON.stringify({event:'full069_final14_database_acl_actual_negative',case:name,actual_select_refused:true,rollback_restored_exact_rows:true,qualifies_run:false,production_GO:false})+'\n')
  }
  assertFinalStable(trust);assertFinalPathCiStable(guard);current()
 }catch(error){primary=error}
 finally{
  if(db){if(begun)try{await db.query('ROLLBACK');begun=false}catch(error){cleanup=error}try{db.release(cleanup!==null)}catch(error){cleanup??=error}}
  try{await pool.end()}catch(error){cleanup??=error}bytes.fill(0)
 }
 if(primary)throw primary;if(cleanup||begun||failed||passed!==cases.length)fail()
 return Object.freeze({actual_database_acl_negative_cases:passed,all_uncommitted_changes_rolled_back:true,record_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})
}
