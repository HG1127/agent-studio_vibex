// Explicit fresh-only complete067 assembly. No existing schema is upgraded,
// repaired or deleted. Only the original fresh initializer owns its transaction.
import type {SqlClient} from './contracts.ts'
import {installFreshRuntime,freshRuntimeReceiptBody} from './pg18-fresh-runtime-install.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {checkedServiceLoginReceipt,serviceLogins} from './pg18-service-login-policy.mjs'
import {assertCompleteProfileSnapshot,completeProfileName,completeProfileReceipt,completeProfileReceiptBody,type CompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'

function fail(code:string):never{throw Error('complete067_'+code)}
const baselineRoles=['agentstudio_api','agentstudio_worker','agentstudio_stage_login','agentstudio_stage_worker','agentstudio_model_broker']
const allowedLogins=new Set(['agentstudio_native_login',...Object.values(serviceLogins).map(s=>s.login)])
export const completeProfileLocksSql='SELECT pg_try_advisory_xact_lock(61824,271828) AND pg_try_advisory_xact_lock(61824,20261024) AS locked'
export const completeProfileTargetSql="SELECT current_database() AS database,session_user::text AS login,current_user::text AS actor,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,NOT pg_is_in_recovery() AS primary,(pg_control_system()).system_identifier::text AS system_identifier,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super,pg_backend_pid() AS pid,(SELECT backend_start::text FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_start"
export type CompleteProfileTarget=Readonly<{system_identifier:string;database_oid:string}>
export type CompleteProfilePool=Readonly<{connect():Promise<SqlClient&{release(destroy?:boolean):void}>}>
export type CompleteProfileState=Readonly<{state:'pending'|'empty'|'incomplete_or_foreign'|'schema_installed_inert'|'schema_installed_services_prepared';profile:'complete067';source_sha256:string;target:CompleteProfileTarget;structure_and_receipt_verified:boolean;full_catalog_audit_verified:false;services_started:false;automatic_retry_authorized:false;production_cutover_allowed:false}>
async function target(db:SqlClient,expected?:CompleteProfileTarget):Promise<CompleteProfileTarget>{
 const r=(await db.query<Record<string,unknown>>(completeProfileTargetSql)).rows[0]
 if(!r||r.database!=='agent_studio'||r.login!=='postgres'||r.actor!=='postgres'||r.host!=='127.0.0.1'||r.port!==5333||typeof r.version!=='number'||r.version<180000||r.version>=190000||r.primary!==true||r.super!==true||typeof r.system_identifier!=='string'||!/^[1-9][0-9]{0,19}$/.test(r.system_identifier)||typeof r.database_oid!=='string'||!/^[1-9][0-9]{0,19}$/.test(r.database_oid)||!Number.isSafeInteger(r.pid)||typeof r.backend_start!=='string')fail('target_refused')
 const result={system_identifier:r.system_identifier,database_oid:r.database_oid}
 if(expected&&(expected.system_identifier!==result.system_identifier||expected.database_oid!==result.database_oid))fail('target_changed')
 return Object.freeze(result)
}
function result(snapshot:CompleteProfileSnapshot,actual:CompleteProfileTarget,state:CompleteProfileState['state'],verified=false):CompleteProfileState{return Object.freeze({state,profile:completeProfileName,source_sha256:snapshot.source_sha256,target:actual,structure_and_receipt_verified:verified,full_catalog_audit_verified:false,services_started:false,automatic_retry_authorized:false,production_cutover_allowed:false})}
async function metadata(db:SqlClient,snapshot:CompleteProfileSnapshot,actual:CompleteProfileTarget):Promise<CompleteProfileState>{
 const presence=(await db.query<{schema:boolean;auth:boolean}>("SELECT to_regnamespace('agentstudio') IS NOT NULL AS schema,to_regnamespace('agentstudio_auth') IS NOT NULL AS auth")).rows[0]
 if(!presence||typeof presence.schema!=='boolean'||typeof presence.auth!=='boolean')fail('state_shape')
 if(!presence.schema&&!presence.auth){
  const empty=(await db.query<{empty:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','m','v','f','S')) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN('public','information_schema')) AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])) AS empty",[[...snapshot.roles]])).rows[0]
  if(typeof empty?.empty!=='boolean')fail('state_shape')
  return result(snapshot,actual,empty.empty?'empty':'incomplete_or_foreign')
 }
 if(!presence.schema||!presence.auth)return result(snapshot,actual,'incomplete_or_foreign')
 const ledger=(await db.query<{version:string;description:string}>('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows
 const expected=[...snapshot.versions,'pg18_fresh_runtime_001',completeProfileReceipt].sort(),serviceReceipts=[]
 for(const r of ledger.filter(r=>r.version.startsWith('pg18_service_login_'))){try{serviceReceipts.push(checkedServiceLoginReceipt(r.version,r.description,snapshot.fresh.source_sha256));expected.push(r.version)}catch{return result(snapshot,actual,'incomplete_or_foreign')}}
 expected.sort()
 if(JSON.stringify(ledger.map(r=>r.version))!==JSON.stringify(expected)||ledger.find(r=>r.version===completeProfileReceipt)?.description!==completeProfileReceiptBody(snapshot)||ledger.find(r=>r.version==='pg18_fresh_runtime_001')?.description!==freshRuntimeReceiptBody(snapshot.fresh))return result(snapshot,actual,'incomplete_or_foreign')
 const extension=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector' AND extversion='0.8.7') AS ok")).rows[0]
 if(extension?.ok!==true)return result(snapshot,actual,'incomplete_or_foreign')
 const tables=(await db.query<{name:string;enabled:boolean;forced:boolean}>("SELECT n.nspname||'.'||c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname")).rows
 if(JSON.stringify(tables.map(t=>t.name))!==JSON.stringify(snapshot.tables)||tables.some(t=>t.name==='agentstudio.schema_migrations'?(t.enabled||t.forced):(!t.enabled||!t.forced)))return result(snapshot,actual,'incomplete_or_foreign')
 const roles=(await db.query<{name:string;login:boolean;safe:boolean}>("SELECT rolname AS name,rolcanlogin AS login,NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL AND rolvaliduntil IS NULL AS safe FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",[[...snapshot.roles]])).rows
 if(JSON.stringify(roles.map(r=>r.name))!==JSON.stringify(snapshot.roles)||roles.some(r=>r.safe!==true||typeof r.login!=='boolean'||r.login&&!allowedLogins.has(r.name)))return result(snapshot,actual,'incomplete_or_foreign')
 // This is structural identification only. Full routine/ACL/constraint checks
 // run below on an independently authenticated API LOGIN, never on this admin.
 const hasLogin=roles.some(r=>r.login)||serviceReceipts.length>0
 return result(snapshot,actual,hasLogin?'schema_installed_services_prepared':'schema_installed_inert',true)
}
export async function inspectCompleteProfile(pool:CompleteProfilePool,snapshot:CompleteProfileSnapshot,expectedSource:string,expectedTarget?:CompleteProfileTarget):Promise<CompleteProfileState>{
 assertCompleteProfileSnapshot(snapshot,expectedSource)
 const db=await pool.connect();let begun=false,destroy=false
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
  await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
  const actual=await target(db,expectedTarget)
  if((await db.query<{locked:boolean}>(completeProfileLocksSql)).rows[0]?.locked!==true)return result(snapshot,actual,'pending')
  assertCompleteProfileSnapshot(snapshot,expectedSource)
  const state=await metadata(db,snapshot,actual)
  assertCompleteProfileSnapshot(snapshot,expectedSource);await target(db,actual);return state
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{destroy=true});db.release(destroy)}
}
// The original050 initializer calls this only after its original empty-target,
// independent-credential and baseline-role checks, within its original BEGIN.
export async function installCompleteProfile(db:SqlClient,snapshot:CompleteProfileSnapshot,expectedSource:string,expectedTarget?:CompleteProfileTarget){
 assertCompleteProfileSnapshot(snapshot,expectedSource)
 const actual=await target(db,expectedTarget)
 if((await db.query<{locked:boolean}>(completeProfileLocksSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
 const extraRoles=snapshot.roles.filter(r=>!baselineRoles.includes(r))
 if((await db.query<{count:number}>('SELECT count(*)::integer AS count FROM pg_roles WHERE rolname=ANY($1::text[])',[[...extraRoles]])).rows[0]?.count!==0)fail('global_role_collision')
 // The default050 exact validator still runs with its ORIGINAL table/version
 // list here, before optional additions; it is neither relaxed nor replaced.
 await installFreshRuntime(db,snapshot.fresh)
 for(const step of snapshot.steps){assertCompleteProfileSnapshot(snapshot,expectedSource);await target(db,actual);await db.query(step.sql)}
 await db.query('SET LOCAL search_path=pg_catalog,public')
 await db.query('INSERT INTO agentstudio.schema_migrations(version,description) VALUES($1,$2)',[completeProfileReceipt,completeProfileReceiptBody(snapshot)])
 const observed=await metadata(db,snapshot,actual)
 if(observed.state!=='schema_installed_inert')fail('postflight_failed')
 for(const name of snapshot.tables){if(name==='agentstudio.schema_migrations')continue
  if(!/^(agentstudio|agentstudio_auth)\.[a-z_]+$/.test(name))fail('source_refused')
  const identifier=name.split('.').map(p=>'"'+p+'"').join('.')
  if((await db.query<{empty:boolean}>('SELECT NOT EXISTS(SELECT 1 FROM '+identifier+') AS empty')).rows[0]?.empty!==true)fail('nonempty_business_table')
 }
 assertCompleteProfileSnapshot(snapshot,expectedSource);await target(db,actual)
 return {target:actual,profile:completeProfileName,source_sha256:expectedSource,schema_precommit_checked:true,actual_login_audit_required:true,service_logins_enabled:false,services_started:false,production_cutover_allowed:false}
}
export async function verifyCompleteProfile(admin:CompleteProfilePool,api:CompleteProfilePool,snapshot:CompleteProfileSnapshot,expectedSource:string){
 const before=await inspectCompleteProfile(admin,snapshot,expectedSource)
 if(!before.structure_and_receipt_verified)fail('schema_not_installed')
 const db=await api.connect();let begun=false,destroy=false
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
  await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
  const r=(await db.query<{login:string;actor:string;database:string;database_oid:string;host:string;port:number;version:number;safe:boolean}>("SELECT session_user::text AS login,current_user::text AS actor,current_database() AS database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AS safe FROM pg_roles r WHERE rolname=session_user")).rows[0]
  if(!r||r.login!=='agentstudio_stage_login'||r.actor!==r.login||r.database!=='agent_studio'||r.database_oid!==before.target.database_oid||r.host!=='127.0.0.1'||r.port!==5333||r.version<180000||r.version>=190000||r.safe!==true)fail('actual_api_login_required')
  await db.query('SET LOCAL ROLE agentstudio_api')
  // Actual067 device audit plus066->065->064->063->062->061->060->059 and the prior058 chain. Missing module,
  // unsafe session or false/throwing auditor cannot be substituted with success.
  if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true)fail('full_catalog_audit_failed')
  assertCompleteProfileSnapshot(snapshot,expectedSource)
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{destroy=true});db.release(destroy)}
 const after=await inspectCompleteProfile(admin,snapshot,expectedSource,before.target)
 if(!after.structure_and_receipt_verified)fail('schema_changed')
 return {...after,full_catalog_audit_verified:true,actual_api_login_verified:true,installed_profile_verified:true,feature_activation_authorized:false,production_cutover_allowed:false}
}
