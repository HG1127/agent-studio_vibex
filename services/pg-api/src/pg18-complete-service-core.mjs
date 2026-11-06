// Independent fresh full069 account preparation. All catalog proofs below use
// real SQL clients; callers cannot inject an auditor or replace a positive proof.
import {createHash} from 'node:crypto'
import {inspectCompleteProfile,verifyCompleteProfile,completeProfileTargetSql,completeProfileLocksSql} from './pg18-complete-profile.ts'
import {assertCompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'
import {completeServiceActions,completeServiceDefinition,completeServiceSql} from './pg18-complete-service-plan.mjs'
import {serviceLoginKinds,serviceLogins} from './pg18-service-login-policy.mjs'
import {matchesServiceScram,validateServiceLoginPassword,serviceLoginVerifier} from './pg18-service-login-secrets.mjs'
import {verifyPg18ServiceHbaOrder} from './native-activation-cli.mjs'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
const fail=code=>{throw Error('complete_service_'+code)},sha=s=>createHash('sha256').update(s).digest('hex')
const logins=Object.freeze(['agentstudio_native_login',...serviceLoginKinds.map(k=>serviceLogins[k].login)])
const definitions=[completeServiceDefinition('native-auth'),...serviceLoginKinds.map(k=>serviceLogins[k])]
const quote=v=>{if(!/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(v))fail('source_refused');return v.split('.').map(s=>'"'+s+'"').join('.')}
export async function completeServiceTarget(db,expected){
 const r=(await db.query(completeProfileTargetSql)).rows[0]
 if(!r||r.database!=='agent_studio'||r.login!=='postgres'||r.actor!=='postgres'||r.host!=='127.0.0.1'||r.port!==5333||r.version<180000||r.version>=190000||r.primary!==true||r.super!==true||r.system_identifier!==expected.system_identifier||r.database_oid!==expected.database_oid)fail('target_refused')
 if((await db.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()')).rows[0]?.owner!=='postgres')fail('database_owner_refused')
 return true
}
export async function completeServiceLedger(db){return sha(JSON.stringify((await db.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows))}
export async function completeServiceInitialAdmin(db,required){
 const r=(await db.query("SELECT (SELECT count(*)::int FROM agentstudio_auth.accounts) AS accounts,(SELECT count(*)::int FROM agentstudio_auth.sessions) AS sessions,(SELECT count(*)::int FROM agentstudio.users) AS users,(SELECT count(*)::int FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.enabled AND a.is_admin AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1') AS admins")).rows[0]
 if(!r||r.sessions!==0||(required?(r.accounts!==1||r.users!==1||r.admins!==1):(r.accounts!==0||r.users!==0||r.admins!==0)))fail('fresh_admin_state_required')
 return required
}
async function freshBusinessState(db,snapshot,adminRequired){
 await completeServiceInitialAdmin(db,adminRequired)
 for(const table of snapshot.tables){if(['agentstudio.schema_migrations','agentstudio.users','agentstudio_auth.accounts'].includes(table))continue
  if((await db.query('SELECT NOT EXISTS(SELECT 1 FROM '+quote(table)+') AS empty')).rows[0]?.empty!==true)fail('fresh_business_state_required')
 }
}
async function directLoginPrivileges(db,login){
 const r=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','S') AND (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'SELECT,UPDATE,USAGE') ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)))) AND NOT has_schema_privilege($1,'agentstudio','USAGE,CREATE') AND NOT has_schema_privilege($1,'agentstudio_auth','USAGE,CREATE') AND has_database_privilege($1,current_database(),'CONNECT') AND NOT has_database_privilege($1,current_database(),'CREATE') AND NOT EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND (d.datname<>current_database() OR a.privilege_type<>'CONNECT' OR a.is_grantable)) AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE d.datname='agent_studio_telemetry' AND has_database_privilege($1,d.oid,'CONNECT')) AS ok",[login])).rows[0]
 if(r?.ok!==true)fail('direct_privileges_refused')
}
export async function completeServiceCatalog(db,snapshot){
 const names=[...new Set([...snapshot.roles,...logins])]
 const rows=(await db.query("SELECT r.rolname AS name,r.rolcanlogin AS login,NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AND r.rolconnlimit=-1 AS safe,a.rolpassword AS verifier FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid WHERE r.rolname LIKE 'agentstudio_%' ORDER BY r.rolname")).rows
 const byName=new Map(rows.map(r=>[r.name,r]))
 if(snapshot.roles.some(n=>!byName.has(n))||rows.some(r=>!names.includes(r.name)||r.safe!==true||typeof r.login!=='boolean'||!logins.includes(r.name)&&(r.login||r.verifier!==null)||r.verifier!==null&&!r.verifier.startsWith('SCRAM-SHA-256$')))fail('role_catalog_refused')
 const expected=['agentstudio_native_login:agentstudio_native_auth','agentstudio_stage_login:agentstudio_api','agentstudio_stage_worker:agentstudio_api','agentstudio_stage_worker:agentstudio_worker']
 for(const d of definitions){const r=byName.get(d.login);if(r?.login&&r.verifier===null)fail('role_password_required');if(r&& !['agentstudio_native_login','agentstudio_stage_login','agentstudio_stage_worker'].includes(r.name)){
   if(!r.login)fail('unrecorded_optional_reservation_refused');expected.push(...d.groups.map(g=>d.login+':'+g))
  }if(r)await directLoginPrivileges(db,d.login)}
 const memberships=(await db.query("SELECT c.rolname AS child,p.rolname AS parent,NOT m.admin_option AND NOT m.inherit_option AND m.set_option AS safe FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid WHERE c.rolname=ANY($1::text[]) OR p.rolname=ANY($1::text[]) ORDER BY c.rolname,p.rolname",[names])).rows
 if(memberships.some(r=>r.safe!==true)||JSON.stringify(memberships.map(r=>r.child+':'+r.parent))!==JSON.stringify(expected.sort()))fail('role_membership_refused')
 const hba=(await db.query('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number')).rows
 for(const d of definitions){const p=verifyPg18ServiceHbaOrder(hba,d.login);if(!p.local||!p.tcp)fail('hba_refused')}
 return byName
}
// Actual independent API connection while the admin transaction holds the
// original schema locks. No privileged pool is wrapped as a runtime identity.
async function catalogOnActualApi(api){
 const db=await api.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
  const r=(await db.query("SELECT session_user::text AS login,current_user::text AS actor,current_database() AS database,inet_server_port() AS port,host(inet_server_addr()) AS host")).rows[0]
  if(r?.login!=='agentstudio_stage_login'||r.actor!==r.login||r.database!=='agent_studio'||r.port!==5333||r.host!=='127.0.0.1')fail('actual_api_login_required')
  await db.query('SET LOCAL ROLE agentstudio_api')
  if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true||await verifyAgentCallerCredentials(db)!==true||await verifyOwnerToolTrialCredentials(db)!==true)fail('actual_api_catalog_refused')
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
export async function completeServiceActualLogin(pool,action){
 const d=completeServiceDefinition(action),db=await pool.connect();let begun=false
 try{await db.query('BEGIN READ ONLY');begun=true
  const r=(await db.query("SELECT session_user::text AS login,current_user::text AS actor,current_database() AS database,inet_server_port() AS port,host(inet_server_addr()) AS host,rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND rolconfig IS NULL AND rolvaliduntil IS NULL AS safe FROM pg_roles WHERE rolname=session_user")).rows[0]
  if(!r||r.login!==d.login||r.actor!==d.login||r.database!=='agent_studio'||r.port!==5333||r.host!=='127.0.0.1'||r.safe!==true)fail('actual_login_refused')
  const actual=(await db.query("SELECT r.rolname AS name,NOT a.admin_option AND NOT a.inherit_option AND a.set_option AS safe FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid WHERE a.member=(SELECT oid FROM pg_roles WHERE rolname=session_user) ORDER BY r.rolname")).rows
  if(actual.some(r=>r.safe!==true)||JSON.stringify(actual.map(r=>r.name))!==JSON.stringify([...d.groups].sort()))fail('actual_login_membership_refused')
  for(const group of d.groups){await db.query('SET LOCAL ROLE '+group);if((await db.query('SELECT current_user::text AS actor')).rows[0]?.actor!==group)fail('actual_role_switch_refused');await db.query('RESET ROLE')}
  return true
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
export async function completeServicePreflight(admin,api,snapshot,cfg){
 assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256)
 const p=await inspectCompleteProfile(admin,snapshot,cfg.sourceSha256,cfg.target)
 if(!p.structure_and_receipt_verified)fail('full_profile_required')
 if(cfg.action!=='api')await verifyCompleteProfile(admin,api,snapshot,cfg.sourceSha256)
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target)
  const ledger=(await db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows
  if(JSON.stringify(ledger.map(r=>r.version))!==JSON.stringify([...snapshot.versions,'pg18_fresh_runtime_001','pg18_complete_069_001'].sort()))fail('foreign_activation_receipt_refused')
  const roles=await completeServiceCatalog(db,snapshot),required=!['api','native-auth','first-admin'].includes(cfg.action)
  await freshBusinessState(db,snapshot,required)
  if(cfg.action==='api'&&logins.some(n=>roles.get(n)?.login))fail('inert_api_seed_required')
  if(cfg.action!=='api'&&roles.get('agentstudio_stage_login')?.login!==true)fail('api_preparation_required')
  if(cfg.action==='first-admin'||required){if(roles.get('agentstudio_native_login')?.login!==true)fail('native_auth_preparation_required')}
  return {ledger:await completeServiceLedger(db),roles}
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
// beforeCommit must durably write the external intent before the first role
// change. No DB ledger INSERT, password rotation or service launch occurs.
export async function prepareCompleteServiceRole(admin,api,snapshot,cfg,password,expectedLedger,beforeCommit){
 if(!completeServiceActions.includes(cfg.action)||cfg.action==='first-admin')fail('action_refused')
 validateServiceLoginPassword(password)
 const d=completeServiceDefinition(cfg.action),db=await admin.connect();let begun=false
 try{await db.query('BEGIN');begun=true;await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
  await completeServiceTarget(db,cfg.target)
  if((await db.query(completeProfileLocksSql)).rows[0]?.locked!==true||(await db.query('SELECT pg_try_advisory_xact_lock(61824,20261016) AS locked')).rows[0]?.locked!==true)fail('schema_or_admin_lock_busy')
  if(await completeServiceLedger(db)!==expectedLedger)fail('ledger_changed')
  const roles=await completeServiceCatalog(db,snapshot),r=roles.get(d.login)
  if(r?.login)fail('already_prepared_no_replay')
  if(['api','worker'].includes(cfg.action)&&(!r?.verifier||!matchesServiceScram(password,r.verifier)))fail('original_secret_required')
  if(cfg.action==='native-auth'&&(!r||r.verifier!==null)||!['api','worker','native-auth'].includes(cfg.action)&&r)fail('unexpected_role_state')
  if([...roles.values()].filter(v=>v.name!==d.login&&v.verifier!==null).some(v=>matchesServiceScram(password,v.verifier)))fail('secret_reused')
  await freshBusinessState(db,snapshot,!['api','native-auth'].includes(cfg.action))
  if(cfg.action!=='api')await catalogOnActualApi(api)
  const verifier=['api','worker'].includes(cfg.action)?r.verifier:serviceLoginVerifier(password)
  // This is a locally generated canonical SCRAM verifier; SQL receives no
  // plaintext password. The external record contains only this digest.
  await beforeCommit(sha(verifier))
  for(const statement of completeServiceSql(cfg.action,['api','worker'].includes(cfg.action)?undefined:verifier))await db.query(statement)
  await completeServiceCatalog(db,snapshot)
  if(await completeServiceLedger(db)!==expectedLedger)fail('ledger_changed')
  assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256);await completeServiceTarget(db,cfg.target)
  await db.query('COMMIT');begun=false
  return {commitAcknowledged:true,verifierSha256:sha(verifier)}
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{});db.release()}
}
