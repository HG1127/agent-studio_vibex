// Fixed full069 Executor preparation, after the independently observed Review
// preparation. Only this new LOGIN is excluded from the pre-existing catalog
// comparison; the full role inventory is queried and unknown accounts refuse.
import {createHash} from 'node:crypto'
import {completeServiceTarget,completeServiceLedger} from './pg18-complete-service-core.mjs'
import {verifyCompleteProfile,completeProfileLocksSql} from './pg18-complete-profile.ts'
import {assertCompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'
import {serviceLoginKinds,serviceLogins} from './pg18-service-login-policy.mjs'
import {inspectComplete069ReviewWorker,complete069ReviewWorkerState,verifyComplete069ReviewWorkerLogin} from './pg18-complete-review-worker-core.mjs'
import {inspectNativeLocalExecutorPreflight} from './native-local-executor-service-preflight.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
import {complete069ExecutorAbi as abi,complete069ExecutorTargetGuardSql as targetGuard,complete069ExecutorReservationSql as reservation,complete069ExecutorActivationSql as activation,inspectComplete069ExecutorHba} from './pg18-complete-executor-plan.mjs'
const fail=code=>{throw Error('complete069_executor_'+code)},sha=v=>createHash('sha256').update(v).digest('hex')
const quote=v=>{if(!/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(v))fail('source_refused');return v.split('.').map(s=>'"'+s+'"').join('.')}
export async function complete069ExecutorBaseline(db){
 const roles=(await db.query("SELECT r.rolname AS name,r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil,r.rolconfig,a.rolpassword FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid ORDER BY r.rolname")).rows
 const memberships=(await db.query("SELECT c.rolname AS child,p.rolname AS parent,g.rolname AS grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor ORDER BY c.rolname,p.rolname,g.rolname")).rows
 const databases=(await db.query("SELECT d.datname,r.rolname AS grantee,g.rolname AS grantor,a.privilege_type,a.is_grantable FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a LEFT JOIN pg_roles r ON r.oid=a.grantee JOIN pg_roles g ON g.oid=a.grantor ORDER BY d.datname,a.grantee,a.grantor,a.privilege_type")).rows
 const objects=(await db.query("SELECT 'schema' AS kind,n.nspname AS name,pg_get_userbyid(n.nspowner) AS owner,n.nspacl::text AS acl FROM pg_namespace n UNION ALL SELECT 'relation',n.nspname||'.'||c.relname,pg_get_userbyid(c.relowner),c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace UNION ALL SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,pg_get_userbyid(c.relowner),a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped UNION ALL SELECT 'type',n.nspname||'.'||t.typname,pg_get_userbyid(t.typowner),t.typacl::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace UNION ALL SELECT 'routine',p.oid::regprocedure::text,pg_get_userbyid(p.proowner),p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace ORDER BY kind,name")).rows
  const defaults=(await db.query("SELECT pg_get_userbyid(d.defaclrole) AS owner,coalesce(n.nspname,'') AS schema,d.defaclobjtype AS kind,d.defaclacl::text AS acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY owner,schema,kind")).rows
  const policies=(await db.query("SELECT n.nspname AS schema,c.relname AS relation,p.polname AS name,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid) AS using_expression,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY n.nspname,c.relname,p.polname")).rows
  const parameters=(await db.query('SELECT parname,paracl::text AS acl FROM pg_parameter_acl ORDER BY parname')).rows
 return sha(JSON.stringify({roles:roles.filter(r=>r.name!==abi.login),memberships:memberships.filter(r=>r.child!==abi.login&&r.parent!==abi.login),databases:databases.filter(r=>r.grantee!==abi.login&&r.grantor!==abi.login),objects,defaults,policies,parameters}))
}

async function reviewHba(db){const rows=(await db.query('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error,options FROM pg_hba_file_rules ORDER BY rule_number')).rows;if(inspectComplete069ExecutorHba(rows).safe!==true)fail('hba_refused')}
async function freshState(db,snapshot){
 const r=(await db.query("SELECT (SELECT count(*)::int FROM agentstudio_auth.accounts) AS accounts,(SELECT count(*)::int FROM agentstudio.users) AS users,(SELECT count(*)::int FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.enabled AND a.is_admin AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1') AS admins")).rows[0]
 if(!r||r.accounts!==1||r.users!==1||r.admins!==1)fail('fresh_admin_state_required')
 for(const table of snapshot.tables){if(['agentstudio.schema_migrations','agentstudio.users','agentstudio_auth.accounts','agentstudio_auth.sessions'].includes(table))continue
  if((await db.query('SELECT NOT EXISTS(SELECT 1 FROM '+quote(table)+') AS empty')).rows[0]?.empty!==true)fail('fresh_business_state_required')
 }
}
export async function complete069ExecutorImage(db,snapshot){
 const images=[]
 if(snapshot.tables.length!==133)fail('source_refused')
 for(const table of snapshot.tables){const r=(await db.query("SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (SELECT to_jsonb(t) AS j FROM "+quote(table)+' t) s')).rows[0];if(typeof r?.hash!=='string'||!/^[a-f0-9]{64}$/.test(r.hash))fail('image_refused');images.push([table,r.hash])}
 return sha(JSON.stringify(images))
}
async function ledger(db,snapshot){
 const versions=(await db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows.map(r=>r.version)
 if(JSON.stringify(versions)!==JSON.stringify([...snapshot.versions,'pg18_fresh_runtime_001','pg18_complete_069_001'].sort()))fail('ledger_refused')
 return completeServiceLedger(db)
}
async function globalNames(db,snapshot,allowExecutor){
 // PostgreSQL reserves the pg_ namespace. Read ALL remaining global roles,
 // including names outside agentstudio_, and require the exact reviewed set.
 const rows=(await db.query("SELECT rolname AS name FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname")).rows
 const expected=[...new Set(['postgres',...snapshot.roles,'agentstudio_native_login',...serviceLoginKinds.map(k=>serviceLogins[k].login),'agentstudio_review_worker_login',...(allowExecutor?[abi.login]:[])])].sort()
 if(JSON.stringify(rows.map(r=>r.name))!==JSON.stringify(expected))fail('global_role_inventory_refused')
}
export async function complete069ExecutorState(db,baseline){
 await reviewHba(db)
 if(await complete069ExecutorBaseline(db)!==baseline)fail('baseline_catalog_changed')
 const r=(await db.query("SELECT r.rolcanlogin AS enabled,NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconnlimit=3 AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AS safe,a.rolpassword AS verifier FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid WHERE r.rolname='agentstudio_local_executor_login'")).rows[0]
 if(!r)return {present:false,enabled:false,verifier:null}
 if(r.enabled!==true||r.safe!==true||typeof r.verifier!=='string'||!r.verifier.startsWith('SCRAM-SHA-256$15000:'))fail('role_state_refused')
 const memberships=(await db.query("SELECT c.rolname AS child,p.rolname AS parent,NOT m.admin_option AND NOT m.inherit_option AND m.set_option AS safe FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid WHERE c.rolname=$1 OR p.rolname=$1 ORDER BY c.rolname,p.rolname",[abi.login])).rows
 if(memberships.length!==1||memberships[0].child!==abi.login||memberships[0].parent!==abi.group||memberships[0].safe!==true)fail('membership_refused')
 const direct=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','S') AND (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'SELECT,UPDATE,USAGE') ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)))) AND NOT has_schema_privilege($1,'agentstudio','USAGE,CREATE') AND NOT has_schema_privilege($1,'agentstudio_auth','USAGE,CREATE') AND EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.privilege_type='CONNECT' AND NOT a.is_grantable) AND has_database_privilege($1,current_database(),'CONNECT') AND NOT has_database_privilege($1,current_database(),'CREATE') AND NOT EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND (d.datname<>current_database() OR a.privilege_type<>'CONNECT' OR a.is_grantable)) AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE d.datname='agent_studio_telemetry' AND has_database_privilege($1,d.oid,'CONNECT')) AS ok",[abi.login])).rows[0]
 if(direct?.ok!==true)fail('direct_privileges_refused')
 return {present:true,enabled:true,verifier:r.verifier}
}

export async function complete069ExecutorPreflight(admin,api,review,snapshot,cfg,reviewIntent){
 assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256)
 if(reviewIntent.operation_id!==cfg.reviewOperationId)fail('review_predecessor_refused')
 const observed=await inspectComplete069ReviewWorker(admin,api,review,snapshot,{...cfg,operationId:cfg.reviewOperationId},reviewIntent)
 if(observed.observed_role_enabled!==true||observed.verifier_matches_intent!==true||observed.actual_login_verified!==true||observed.actual_api_catalog_verified!==true)fail('review_predecessor_refused')
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target);await globalNames(db,snapshot,false);await reviewHba(db);await freshState(db,snapshot)
  return {baseline:await complete069ExecutorBaseline(db),ledger:await ledger(db,snapshot),image:await complete069ExecutorImage(db,snapshot),reviewIntentSha256:sha(JSON.stringify(reviewIntent))}
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
async function lockedActualApi(api,target){
 const db=await api.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
  const r=(await db.query("SELECT session_user::text AS login,current_user::text AS actor,current_database() AS database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,host(inet_server_addr()) AS host,inet_server_port() AS port")).rows[0]
  if(r?.login!=='agentstudio_stage_login'||r.actor!==r.login||r.database!=='agent_studio'||r.database_oid!==target.database_oid||r.host!=='127.0.0.1'||r.port!==5333)fail('actual_api_login_required')
  await db.query('SET LOCAL ROLE agentstudio_api')
  if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true||await verifyAgentCallerCredentials(db)!==true||await verifyOwnerToolTrialCredentials(db)!==true)fail('actual_api_catalog_refused')
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
export async function prepareComplete069Executor(admin,api,review,snapshot,cfg,reviewIntent,verifier,before,start){
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN');begun=true;await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'")
  await completeServiceTarget(db,cfg.target);await db.query(targetGuard)
  if((await db.query(completeProfileLocksSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
  assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256)
  if(await ledger(db,snapshot)!==before.ledger||await complete069ExecutorImage(db,snapshot)!==before.image)fail('predecessor_state_changed')
  await globalNames(db,snapshot,false)
  if((await complete069ExecutorState(db,before.baseline)).present)fail('existing_role_no_takeover')
  // The original complete-profile inspector acquires these SAME schema locks
  // on its own admin connection. Under our held locks use the original live
  // Review state/login and independent API auditors directly; the complete
  // profile inspector still runs unchanged before this transaction and after
  // its COMMIT. No lock is released or positive auditor substituted here.
  const observed=await complete069ReviewWorkerState(db,reviewIntent.baseline_catalog_sha256)
  if(reviewIntent.operation_id!==cfg.reviewOperationId||observed.present!==true||sha(observed.verifier)!==reviewIntent.verifier_sha256||sha(JSON.stringify(reviewIntent))!==before.reviewIntentSha256)fail('review_predecessor_refused')
  await verifyComplete069ReviewWorkerLogin(review);await lockedActualApi(api,cfg.target)
  await freshState(db,snapshot)
  const enable=activation(verifier);await start(sha(verifier),before)
  await db.query(reservation);await db.query(enable)
  await globalNames(db,snapshot,true)
  const state=await complete069ExecutorState(db,before.baseline)
  if(state.present!==true||state.verifier!==verifier||await ledger(db,snapshot)!==before.ledger||await complete069ExecutorImage(db,snapshot)!==before.image)fail('precommit_refused')
  assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256);await completeServiceTarget(db,cfg.target)
  await db.query('COMMIT');begun=false;return true
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{});db.release()}
}
export async function verifyComplete069ExecutorLogin(pool){const v=await inspectNativeLocalExecutorPreflight(pool,{database:'agent_studio',port:5333});if(v.original_C_audit_verified!==true||v.read_only!==true||v.effect_executed!==false||v.live_service_proven!==false)fail('actual_executor_login_refused');return true}
export async function inspectComplete069Executor(admin,api,dedicated,snapshot,cfg,intent){
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target)
  if(intent.review_operation_id!==cfg.reviewOperationId)fail('review_predecessor_refused')
  const state=await complete069ExecutorState(db,intent.baseline_catalog_sha256)
  await globalNames(db,snapshot,state.present)
  const matches=state.present&&sha(state.verifier)===intent.verifier_sha256,ledgerUnchanged=await ledger(db,snapshot)===intent.ledger_sha256,imageUnchanged=await complete069ExecutorImage(db,snapshot)===intent.business_image_sha256
  if(!ledgerUnchanged||!imageUnchanged)fail('predecessor_state_changed')
  let login=false,catalog=false
  if(matches){login=await verifyComplete069ExecutorLogin(dedicated);const v=await verifyCompleteProfile(admin,api,snapshot,cfg.sourceSha256);catalog=v.full_catalog_audit_verified===true}
  return {observed_role_enabled:state.enabled,verifier_matches_intent:!!matches,actual_login_verified:login,actual_api_catalog_verified:catalog,migration_ledger_unchanged:ledgerUnchanged,all133_table_images_unchanged:imageUnchanged}
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
