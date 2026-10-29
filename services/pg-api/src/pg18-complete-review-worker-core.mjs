// One separately prepared LOGIN after the complete original C bootstrap.
// Original C catalog is used only BEFORE the new independently audited role.
import {createHash} from 'node:crypto'
import {completeServiceTarget,completeServiceLedger,completeServiceCatalog} from './pg18-complete-service-core.mjs'
import {verifyCompleteProfile,completeProfileLocksSql} from './pg18-complete-profile.ts'
import {assertCompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'
import {completeServiceDefinition} from './pg18-complete-service-plan.mjs'
import {serviceLoginKinds,serviceLogins} from './pg18-service-login-policy.mjs'
import {inspectAgentAssessmentOperatorPool} from './agent-assessment-service.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
import {complete069ReviewWorkerAbi as abi,complete069ReviewWorkerTargetGuardSql as targetGuard,complete069ReviewWorkerReservationSql as reservation,complete069ReviewWorkerActivationSql as activation,inspectComplete069ReviewWorkerHba} from './pg18-complete-review-worker-plan.mjs'
const fail=code=>{throw Error('complete069_review_worker_'+code)},sha=v=>createHash('sha256').update(v).digest('hex')
const originalLogins=[completeServiceDefinition('native-auth').login,...serviceLoginKinds.map(k=>serviceLogins[k].login)]
// This digest binds the pre-existing catalog proven by UNCHANGED C checks.
// Only the ONE named new role, its own membership and own DB ACL are omitted
// from comparison; their stricter live checks follow below. No role query is
// filtered and unexpected accounts or object ACL changes alter the digest.
export async function complete069ReviewWorkerBaseline(db){
 const roles=(await db.query("SELECT r.rolname AS name,r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil,r.rolconfig,a.rolpassword FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid WHERE r.rolname LIKE 'agentstudio_%' ORDER BY r.rolname")).rows
 const memberships=(await db.query("SELECT c.rolname AS child,p.rolname AS parent,g.rolname AS grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor WHERE c.rolname LIKE 'agentstudio_%' OR p.rolname LIKE 'agentstudio_%' ORDER BY c.rolname,p.rolname,g.rolname")).rows
 const databases=(await db.query("SELECT d.datname,r.rolname AS grantee,g.rolname AS grantor,a.privilege_type,a.is_grantable FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a LEFT JOIN pg_roles r ON r.oid=a.grantee JOIN pg_roles g ON g.oid=a.grantor ORDER BY d.datname,a.grantee,a.grantor,a.privilege_type")).rows
 const objects=(await db.query("SELECT 'schema' AS kind,n.nspname AS name,pg_get_userbyid(n.nspowner) AS owner,n.nspacl::text AS acl FROM pg_namespace n WHERE n.nspname IN('agentstudio','agentstudio_auth') UNION ALL SELECT 'relation',n.nspname||'.'||c.relname,pg_get_userbyid(c.relowner),c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') UNION ALL SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,pg_get_userbyid(c.relowner),a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND a.attnum>0 AND NOT a.attisdropped UNION ALL SELECT 'type',n.nspname||'.'||t.typname,pg_get_userbyid(t.typowner),t.typacl::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') UNION ALL SELECT 'routine',p.oid::regprocedure::text,pg_get_userbyid(p.proowner),p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') ORDER BY kind,name")).rows
 return sha(JSON.stringify({roles:roles.filter(r=>r.name!==abi.login),memberships:memberships.filter(r=>r.child!==abi.login&&r.parent!==abi.login),databases:databases.filter(r=>r.grantee!==abi.login&&r.grantor!==abi.login),objects}))
}
async function reviewHba(db){const rows=(await db.query('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error,options FROM pg_hba_file_rules ORDER BY rule_number')).rows;if(inspectComplete069ReviewWorkerHba(rows).safe!==true)fail('hba_refused')}
async function activeAdmin(db,fresh=false){
 const r=(await db.query("SELECT (SELECT count(*)::int FROM agentstudio_auth.accounts) AS accounts,(SELECT count(*)::int FROM agentstudio.users) AS users,(SELECT count(*)::int FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.enabled AND a.is_admin AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1') AS admins")).rows[0]
 if(!r||r.admins<1||fresh&&(r.accounts!==1||r.users!==1||r.admins!==1))fail('active_admin_required')
}
async function freshState(db,snapshot){
 await activeAdmin(db,true)
 for(const table of snapshot.tables){if(['agentstudio.schema_migrations','agentstudio.users','agentstudio_auth.accounts','agentstudio_auth.sessions'].includes(table))continue
  if(!/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(table))fail('source_refused')
  if((await db.query('SELECT NOT EXISTS(SELECT 1 FROM '+table.split('.').map(s=>'"'+s+'"').join('.')+') AS empty')).rows[0]?.empty!==true)fail('fresh_business_state_required')
 }
}
export async function complete069ReviewWorkerState(db,baseline){
 await reviewHba(db)
 if(await complete069ReviewWorkerBaseline(db)!==baseline)fail('baseline_catalog_changed')
 const r=(await db.query("SELECT r.rolcanlogin AS enabled,NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconnlimit=3 AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AS safe,a.rolpassword AS verifier FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid WHERE r.rolname='agentstudio_review_worker_login'")).rows[0]
 if(!r)return {present:false,enabled:false,verifier:null}
 if(r.enabled!==true||r.safe!==true||typeof r.verifier!=='string'||!r.verifier.startsWith('SCRAM-SHA-256$15000:'))fail('role_state_refused')
 const memberships=(await db.query("SELECT c.rolname AS child,p.rolname AS parent,NOT m.admin_option AND NOT m.inherit_option AND m.set_option AS safe FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid WHERE c.rolname=$1 OR p.rolname=$1 ORDER BY c.rolname,p.rolname",[abi.login])).rows
 if(memberships.length!==1||memberships[0].child!==abi.login||memberships[0].parent!==abi.group||memberships[0].safe!==true)fail('membership_refused')
 const direct=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','S') AND (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'SELECT,UPDATE,USAGE') ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)))) AND NOT has_schema_privilege($1,'agentstudio','USAGE,CREATE') AND NOT has_schema_privilege($1,'agentstudio_auth','USAGE,CREATE') AND EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.privilege_type='CONNECT' AND NOT a.is_grantable) AND has_database_privilege($1,current_database(),'CONNECT') AND NOT has_database_privilege($1,current_database(),'CREATE') AND NOT EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND (d.datname<>current_database() OR a.privilege_type<>'CONNECT' OR a.is_grantable)) AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE d.datname='agent_studio_telemetry' AND has_database_privilege($1,d.oid,'CONNECT')) AS ok",[abi.login])).rows[0]
 if(direct?.ok!==true)fail('direct_privileges_refused')
 return {present:true,enabled:true,verifier:r.verifier}
}
export async function complete069ReviewWorkerPreflight(admin,api,snapshot,cfg){
 const full=await verifyCompleteProfile(admin,api,snapshot,cfg.sourceSha256)
 if(full.full_catalog_audit_verified!==true||full.target.system_identifier!==cfg.target.system_identifier||full.target.database_oid!==cfg.target.database_oid)fail('full069_required')
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target)
 if((await db.query('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1) AS present',[abi.login])).rows[0]?.present!==false)fail('existing_role_no_takeover')
  const roles=await completeServiceCatalog(db,snapshot)
  if(originalLogins.some(n=>roles.get(n)?.login!==true))fail('original_seven_preparation_required')
  await freshState(db,snapshot);await reviewHba(db)
  const versions=(await db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows.map(r=>r.version)
  if(JSON.stringify(versions)!==JSON.stringify([...snapshot.versions,'pg18_fresh_runtime_001','pg18_complete_069_001'].sort()))fail('ledger_refused')
  return {baseline:await complete069ReviewWorkerBaseline(db),ledger:await completeServiceLedger(db)}
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
async function apiCatalog(api){
 const db=await api.connect();let begun=false
 try{await db.query('BEGIN READ ONLY');begun=true
  const r=(await db.query('SELECT session_user::text AS login,current_user::text AS actor')).rows[0]
  if(r?.login!=='agentstudio_stage_login'||r.actor!==r.login)fail('actual_api_login_required')
  await db.query('SET LOCAL ROLE agentstudio_api')
  if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true||await verifyAgentCallerCredentials(db)!==true||await verifyOwnerToolTrialCredentials(db)!==true)fail('actual_api_catalog_refused')
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
export async function prepareComplete069ReviewWorker(admin,api,snapshot,cfg,verifier,before,start){
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN');begun=true;await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
  await completeServiceTarget(db,cfg.target);await db.query(targetGuard)
  if((await db.query(completeProfileLocksSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
  assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256)
  if(await completeServiceLedger(db)!==before.ledger)fail('ledger_changed')
  if((await complete069ReviewWorkerState(db,before.baseline)).present)fail('existing_role_no_takeover')
  // Re-run the original strict pre-existing account catalog inside the DML
  // transaction. It is intentionally never widened to accept this new LOGIN.
  await completeServiceCatalog(db,snapshot);await freshState(db,snapshot);await apiCatalog(api)
  const enable=activation(verifier);await start(sha(verifier),before.baseline)
  await db.query(reservation);await db.query(enable)
  const state=await complete069ReviewWorkerState(db,before.baseline)
  if(state.present!==true||state.verifier!==verifier||await completeServiceLedger(db)!==before.ledger)fail('precommit_refused')
  assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256);await completeServiceTarget(db,cfg.target)
  await db.query('COMMIT');begun=false
  return true
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{});db.release()}
}
export async function verifyComplete069ReviewWorkerLogin(pool){
 await inspectAgentAssessmentOperatorPool(pool,{mode:'baota_pg18',host:'127.0.0.1',port:5333,database:'agent_studio',user:abi.login,expectedMajor:18},'worker')
 return true
}
export async function inspectComplete069ReviewWorker(admin,api,dedicated,snapshot,cfg,intent){
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target);await activeAdmin(db)
  const state=await complete069ReviewWorkerState(db,intent.baseline_catalog_sha256),matches=state.present&&sha(state.verifier)===intent.verifier_sha256
  const versions=(await db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows.map(r=>r.version)
  if(JSON.stringify(versions)!==JSON.stringify([...snapshot.versions,'pg18_fresh_runtime_001','pg18_complete_069_001'].sort()))fail('ledger_refused')
  let login=false,catalog=false
  if(matches){login=await verifyComplete069ReviewWorkerLogin(dedicated);const v=await verifyCompleteProfile(admin,api,snapshot,cfg.sourceSha256);catalog=v.full_catalog_audit_verified===true}
  return {observed_role_enabled:state.enabled,verifier_matches_intent:!!matches,actual_login_verified:login,actual_api_catalog_verified:catalog}
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
