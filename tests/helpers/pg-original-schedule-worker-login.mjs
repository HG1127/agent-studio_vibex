// HOSTED FIXTURE ONLY. Never activates a production account or changes the fresh
// installer's NOLOGIN default. The closed story guard runs before any pg import.
import {requireOriginalScheduleWorkerCi} from './pg-original-schedule-worker-guard.mjs'
import {originalScheduleWorkerLogin as login,captureOriginalScheduleWorkerTarget,checkOriginalScheduleWorkerTarget,checkOriginalScheduleWorkerRole,checkOriginalScheduleWorkerMembers} from './pg-original-schedule-worker-login-policy.mjs'
export const originalScheduleWorkerRoleSQL=`SELECT r.rolname AS name,r.rolcanlogin AS login,r.rolsuper AS superuser,r.rolinherit AS inherits,r.rolbypassrls AS bypassrls,r.rolcreaterole AS createrole,r.rolcreatedb AS createdb,r.rolreplication AS replication,r.rolconfig AS config,r.rolvaliduntil::text AS valid_until,r.rolconnlimit AS connection_limit,a.rolpassword AS verifier,
 (SELECT count(*)::integer FROM pg_catalog.pg_stat_activity WHERE usename=r.rolname) AS connections,
 has_database_privilege(r.oid,current_database(),'CONNECT') AS connect,has_database_privilege(r.oid,current_database(),'CREATE') AS database_create,
 NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','S') AND (c.relowner=r.oid OR CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'SELECT,UPDATE,USAGE') ELSE has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND (p.proowner=r.oid OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=r.oid)))
 AND NOT has_schema_privilege(r.oid,'agentstudio','USAGE,CREATE') AND NOT has_schema_privilege(r.oid,'agentstudio_auth','USAGE,CREATE') AS no_direct_privileges
 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_authid a ON a.oid=r.oid WHERE r.rolname=$1`
const membersSQL="SELECT roleid::regrole::text AS role,member::regrole::text AS member,admin_option AS admin,inherit_option AS inherit,set_option AS set FROM pg_catalog.pg_auth_members WHERE member=$1::regrole OR roleid=$1::regrole ORDER BY roleid::regrole::text"
export const originalScheduleWorkerTargetSQL="SELECT pg_catalog.current_database() AS database,session_user::text AS login,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser,pg_catalog.current_setting('server_version_num')::integer AS version,NOT pg_catalog.pg_is_in_recovery() AS primary,(SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AS database_oid,(extract(epoch FROM pg_catalog.pg_postmaster_start_time())*1000000)::bigint::text AS postmaster_started_us,pg_catalog.host(pg_catalog.inet_server_addr()) AS server_addr,pg_catalog.inet_server_port() AS server_port"
const ledgerSQL='SELECT version,description FROM agentstudio.schema_migrations ORDER BY version'
export async function activateOriginalScheduleWorkerLogin(initializedAdmin,expectedDisabledPassword,env=process.env){
 const permit=requireOriginalScheduleWorkerCi(env)
 // The trusted reference is the already initialized base fixture's own admin
 // connection, never the new activation pool and never a caller-supplied seal.
 const initializedRows=(await initializedAdmin.query(originalScheduleWorkerTargetSQL)).rows
 if(initializedRows.length!==1)throw Error('original_schedule_worker_fixture_target_unconfirmed')
 const binding=captureOriginalScheduleWorkerTarget(initializedRows[0],permit.target)
 const [{createRequire},{randomBytes},secrets,policy]=await Promise.all([import('node:module'),import('node:crypto'),import('../../services/pg-api/src/pg18-service-login-secrets.mjs'),import('../../services/pg-api/src/pg18-service-login-policy.mjs')])
 const definition=policy.serviceLoginDefinition('worker')
 if(definition.login!==login||JSON.stringify(definition.groups)!=='["agentstudio_api","agentstudio_worker"]')throw Error('original_schedule_worker_fixed_login_changed')
 const pg=createRequire(new URL('../../services/pg-api/package.json',import.meta.url))('pg'),admin=new pg.Pool({...permit.target,max:1,statement_timeout:10000,query_timeout:15000})
 admin.on('error',()=>{})
 let oldVerifier,activated=false,finished=false,ledger
 const checkInstance=async db=>{const rows=(await db.query(originalScheduleWorkerTargetSQL)).rows;if(rows.length!==1)throw Error('original_schedule_worker_fixture_target_unconfirmed');checkOriginalScheduleWorkerTarget(rows[0],permit.target,binding)}
 const connectBoundAdmin=async()=>{const db=await admin.connect();try{await checkInstance(db);return db}catch(error){db.release(true);throw error}}
 const inspect=async(db,enabled)=>{await checkInstance(db);const rows=(await db.query(originalScheduleWorkerRoleSQL,[login])).rows;if(rows.length!==1)throw Error('original_schedule_worker_login_boundary_refused');const role=checkOriginalScheduleWorkerRole(rows[0],enabled);checkOriginalScheduleWorkerMembers((await db.query(membersSQL,[login])).rows);return role}
 const restore=async()=>{
  if(finished)return;finished=true
  try{if(activated){const db=await connectBoundAdmin();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(78044,1)');const enabled=(await db.query('SELECT rolcanlogin AS enabled FROM pg_catalog.pg_roles WHERE rolname=$1',[login])).rows[0]?.enabled;if(typeof enabled!=='boolean')throw Error('original_schedule_worker_restore_unconfirmed');const role=await inspect(db,enabled);if(role.connections!==0)throw Error('original_schedule_worker_connections_not_drained');if(enabled)await db.query("ALTER ROLE agentstudio_stage_worker NOLOGIN PASSWORD '"+oldVerifier+"'");const after=await inspect(db,false);if(after.verifier!==oldVerifier||JSON.stringify((await db.query(ledgerSQL)).rows)!==ledger)throw Error('original_schedule_worker_restore_unconfirmed');await db.query('COMMIT');activated=false}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}}}finally{await admin.end()}
 }
 try{
  const db=await connectBoundAdmin()
  try{
   await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(78044,1)')
   const before=await inspect(db,false);if(before.connections!==0||!secrets.matchesServiceScram(expectedDisabledPassword,before.verifier))throw Error('original_schedule_worker_disabled_state_unconfirmed')
   oldVerifier=before.verifier;ledger=JSON.stringify((await db.query(ledgerSQL)).rows)
   await db.query('ROLLBACK')
  }finally{db.release()}
  // Real TCP negative control with the actual existing SCRAM secret. A source
  // flag or an authentication failure for a wrong password cannot replace it.
  const denied=new pg.Pool({...permit.target,user:login,password:expectedDisabledPassword,max:1,connectionTimeoutMillis:5000});denied.on('error',()=>{})
  let refused=false
  try{const c=await denied.connect();c.release()}catch(error){if(error?.code==='28000'&&/not permitted to log in/.test(error.message??''))refused=true;else throw Error('original_schedule_worker_NOLOGIN_refusal_unconfirmed')}finally{await denied.end()}
  if(!refused)throw Error('original_schedule_worker_NOLOGIN_refusal_unconfirmed')
  const password=randomBytes(40).toString('hex'),verifier=secrets.serviceLoginVerifier(password),activateDb=await connectBoundAdmin()
  try{
   await activateDb.query('BEGIN');await activateDb.query('SELECT pg_advisory_xact_lock(78044,1)')
   const before=await inspect(activateDb,false);if(before.connections!==0||before.verifier!==oldVerifier||JSON.stringify((await activateDb.query(ledgerSQL)).rows)!==ledger)throw Error('original_schedule_worker_disabled_state_changed')
   for(const row of (await activateDb.query('SELECT rolpassword AS verifier FROM pg_catalog.pg_authid WHERE rolcanlogin AND rolpassword IS NOT NULL')).rows)if(secrets.matchesServiceScram(password,row.verifier))throw Error('original_schedule_worker_secret_reused')
   await activateDb.query("ALTER ROLE agentstudio_stage_worker LOGIN PASSWORD '"+verifier+"'")
   const after=await inspect(activateDb,true);if(after.verifier!==verifier||!secrets.matchesServiceScram(password,after.verifier)||JSON.stringify((await activateDb.query(ledgerSQL)).rows)!==ledger)throw Error('original_schedule_worker_activation_unconfirmed')
   // Mark before COMMIT so an uncertain acknowledgment still enters cleanup.
   activated=true;await activateDb.query('COMMIT')
  }catch(error){await activateDb.query('ROLLBACK').catch(()=>{});throw error}finally{activateDb.release()}
  // The caller opens this exact Worker login and invokes the existing actual
  // verifyPgWorkerRoleBoundary +044 audits before constructing any Worker.
  return{login,password,restore,evidence:Object.freeze({actual_NOLOGIN_TCP_refused:true,actual_admin_target_checked:true,actual_initialized_fixture_instance_bound:true,actual_NOINHERIT_memberships_checked:true,actual_no_direct_business_privileges:true,actual_independent_SCRAM_checked:true,migration_ledger_unchanged:true,production_GO:false})}
 }catch(error){try{await restore()}catch(cleanup){throw new AggregateError([error,cleanup],'original_schedule_worker_activation_cleanup_failed')}throw error}
}
