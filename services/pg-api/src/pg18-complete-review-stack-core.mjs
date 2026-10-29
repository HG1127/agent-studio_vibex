// Three fixed identities only. No Worker/Broker start, provider, queue RPC,
// original receipt mutation, identity spoofing or injected positive auditor.
import {createHash} from 'node:crypto'
import {completeServiceTarget,completeServiceLedger} from './pg18-complete-service-core.mjs'
import {verifyCompleteProfile,completeProfileLocksSql} from './pg18-complete-profile.ts'
import {assertCompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'
import {verifyPg18ServiceHbaOrder} from './native-activation-cli.mjs'
import {inspectExecutorHba} from './native-local-executor-operator-plan.mjs'
import {inspectNativeLocalDevicePool} from './native-local-device-audit.ts'
import {verifyPgRuntimeTarget} from './pg-runtime-target.ts'
import {complete069ExecutorBaseline,complete069ExecutorImage} from './pg18-complete-executor-core.mjs'
import {inspectComplete069ReviewWorkerHba} from './pg18-complete-review-worker-plan.mjs'
import {inspectAgentAssessmentOperatorPool,inspectAgentDesignOperatorPool} from './agent-assessment-service.ts'
import {loadAgentDesignAuditVerifier} from './agent-design-runtime-policy.ts'
import {verifyBoundDispatchRole} from './bound-dispatch-role-preflight.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
import {reviewStackDefinitions as defs,reviewStackPriorLogins as prior,inspectReviewStackRoleMatrix,inspectReviewStackHba,reviewStackSql} from './pg18-complete-review-stack-plan.mjs'
const fail=code=>{throw Error('complete069_review_stack_'+code)},sha=v=>createHash('sha256').update(v).digest('hex'),newNames=new Set(defs.map(d=>d.login))
const runtimeTarget=user=>({mode:'baota_pg18',host:'127.0.0.1',port:5333,database:'agent_studio',user,expectedMajor:18})
const quote=table=>{if(!/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(table))fail('source_refused');return table.split('.').map(s=>'"'+s+'"').join('.')}
export async function reviewStackImages(db,snapshot){
 if(snapshot.tables.length!==133)fail('table_set_refused')
 const image=[]
 for(const table of snapshot.tables){const r=(await db.query("SELECT count(*)::text AS count,encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (SELECT to_jsonb(t) AS j FROM "+quote(table)+' t) s')).rows[0];if(!r||typeof r.count!=='string'||!/^\d+$/.test(r.count)||typeof r.hash!=='string'||!/^[a-f0-9]{64}$/.test(r.hash))fail('image_shape_refused');image.push([table,r.count,r.hash])}
 return sha(JSON.stringify(image))
}
async function directPrivileges(db,login){
 const r=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','S') AND (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'SELECT,UPDATE,USAGE') ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)))) AND NOT has_schema_privilege($1,'agentstudio','USAGE,CREATE') AND NOT has_schema_privilege($1,'agentstudio_auth','USAGE,CREATE') AND EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.privilege_type='CONNECT' AND NOT a.is_grantable) AND has_database_privilege($1,current_database(),'CONNECT') AND NOT has_database_privilege($1,current_database(),'CREATE') AND NOT EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND (d.datname<>current_database() OR a.privilege_type<>'CONNECT' OR a.is_grantable)) AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE d.datname='agent_studio_telemetry' AND has_database_privilege($1,d.oid,'CONNECT')) AS ok",[login])).rows[0]
 if(r?.ok!==true)fail('direct_privileges_refused')
}
export async function readReviewStackCatalog(db,snapshot,phase){
 const roles=(await db.query("SELECT r.oid::text AS id,r.rolname AS name,r.rolcanlogin AS login,r.rolinherit AS inherit,r.rolsuper AS superuser,r.rolbypassrls AS bypassrls,r.rolcreatedb AS createdb,r.rolcreaterole AS createrole,r.rolreplication AS replication,r.rolconnlimit AS connlimit,r.rolconfig AS config,r.rolvaliduntil AS until,a.rolpassword AS verifier FROM pg_roles r JOIN pg_authid a ON a.oid=r.oid ORDER BY r.rolname")).rows
 const memberships=(await db.query('SELECT c.rolname AS child,p.rolname AS parent,g.rolname AS grantor,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS "set" FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor ORDER BY c.rolname,p.rolname,g.rolname')).rows
 const present=roles.filter(r=>newNames.has(r.name)).length
 if(!['empty','prepared','either'].includes(phase))fail('phase_refused')
 if(present!==0&&present!==3||phase==='prepared'&&present!==3)fail('partial_role_state_refused')
 if(phase==='empty'&&present!==0)fail('existing_roles_no_takeover')
 const prepared=present===3,matrix=inspectReviewStackRoleMatrix(roles,memberships,snapshot.roles,prepared)
 const settings=(await db.query('SELECT setdatabase::text AS database_oid,setrole::text AS role_oid,setconfig AS config FROM pg_db_role_setting ORDER BY setdatabase,setrole')).rows
 if(settings.some(r=>r.role_oid!=='0'))fail('role_settings_refused')
 const databases=(await db.query("SELECT d.datname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,pg_get_userbyid(a.grantor)::text AS grantor,a.privilege_type,a.is_grantable FROM pg_database d,LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a ORDER BY d.datname,a.grantee,a.grantor,a.privilege_type")).rows
 for(const r of databases){if(!roles.some(v=>v.name===r.grantor)||r.grantee!=='PUBLIC'&&!roles.some(v=>v.name===r.grantee)||newNames.has(r.grantor))fail('database_acl_refused');if(newNames.has(r.grantee)&&(r.datname!=='agent_studio'||r.privilege_type!=='CONNECT'||r.is_grantable!==false||r.grantor!=='postgres'))fail('database_acl_refused')}
 if(prepared)for(const d of defs)if(databases.filter(r=>r.grantee===d.login).length!==1)fail('database_acl_refused')
 // Old ACLs across ALL schemas are compared; no new login's object grants are
 // removed from this digest. There is no narrowing of original object audits.
 const objects=(await db.query("SELECT 'schema' AS kind,n.nspname::text AS name,pg_get_userbyid(n.nspowner)::text AS owner,n.nspacl::text AS acl FROM pg_namespace n UNION ALL SELECT 'relation',n.nspname||'.'||c.relname,pg_get_userbyid(c.relowner),c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace UNION ALL SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,pg_get_userbyid(c.relowner),a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped UNION ALL SELECT 'type',n.nspname||'.'||t.typname,pg_get_userbyid(t.typowner),t.typacl::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace UNION ALL SELECT 'routine',p.oid::regprocedure::text,pg_get_userbyid(p.proowner),p.proacl::text FROM pg_proc p UNION ALL SELECT 'default',d.oid::text,pg_get_userbyid(d.defaclrole),d.defaclacl::text FROM pg_default_acl d UNION ALL SELECT 'foreign_server',s.srvname,pg_get_userbyid(s.srvowner),s.srvacl::text FROM pg_foreign_server s UNION ALL SELECT 'foreign_wrapper',w.fdwname,pg_get_userbyid(w.fdwowner),w.fdwacl::text FROM pg_foreign_data_wrapper w ORDER BY kind,name")).rows
 for(const d of [...prior,...(prepared?defs:[])])await directPrivileges(db,d.login)
 const hba=(await db.query('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error,options FROM pg_hba_file_rules ORDER BY rule_number')).rows
 if(!inspectReviewStackHba(hba)||!inspectComplete069ReviewWorkerHba(hba).safe||!inspectExecutorHba(hba).safe||prior.filter(d=>!['agentstudio_review_worker_login','agentstudio_local_executor_login'].includes(d.login)).some(d=>{const v=verifyPg18ServiceHbaOrder(hba,d.login);return !v.local||!v.tcp}))fail('hba_refused')
 // The three authorized new identities are normalized ONLY AFTER every global
 // row, exact matrix, memberships and their direct DB/object ACLs were checked.
 const policies=(await db.query("SELECT n.nspname AS schema,c.relname AS relation,p.polname AS name,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid) AS using_expression,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY n.nspname,c.relname,p.polname")).rows
 const parameters=(await db.query('SELECT parname,paracl::text AS acl FROM pg_parameter_acl ORDER BY parname')).rows
 const tablespaces=(await db.query('SELECT spcname AS name,pg_get_userbyid(spcowner) AS owner,spcacl::text AS acl FROM pg_tablespace ORDER BY spcname')).rows
 const baseline=sha(JSON.stringify({roles:roles.filter(r=>!newNames.has(r.name)),memberships:memberships.filter(r=>!newNames.has(r.child)),databases:databases.filter(r=>!newNames.has(r.grantee)),objects,settings,policies,parameters,tablespaces}))
 return {prepared,matrix,baseline,verifiers:Object.fromEntries(roles.filter(r=>newNames.has(r.name)).map(r=>[r.name,r.verifier])),knownVerifiers:Object.fromEntries(roles.map(r=>[r.name,r.verifier])),allVerifiers:roles.map(r=>r.verifier).filter(v=>typeof v==='string')}
}
async function activeAdmin(db){if((await db.query("SELECT EXISTS(SELECT 1 FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.enabled AND a.is_admin AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1') AS ready")).rows[0]?.ready!==true)fail('active_admin_required')}
async function exactLedger(db,snapshot){const rows=(await db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows;if(JSON.stringify(rows.map(r=>r.version))!==JSON.stringify([...snapshot.versions,'pg18_fresh_runtime_001','pg18_complete_069_001'].sort()))fail('ledger_refused');return completeServiceLedger(db)}
async function apiCatalog(api){const db=await api.connect();let begun=false;try{await db.query('BEGIN READ ONLY');begun=true;const r=(await db.query('SELECT session_user::text AS login,current_user::text AS actor')).rows[0];if(r?.login!=='agentstudio_stage_login'||r.actor!==r.login)fail('actual_api_required');await db.query('SET LOCAL ROLE agentstudio_api');if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true||await verifyAgentCallerCredentials(db)!==true||await verifyOwnerToolTrialCredentials(db)!==true)fail('actual_api_catalog_refused')}finally{if(begun)await db.query('ROLLBACK');db.release()}}
export async function verifyReviewStackPriorPools(pools){
 await verifyBoundDispatchRole(pools.api,runtimeTarget('agentstudio_stage_login'),'api')
 await verifyBoundDispatchRole(pools.model_broker,runtimeTarget('agentstudio_model_broker_login'),'broker')
 await inspectAgentAssessmentOperatorPool(pools.review_worker,runtimeTarget('agentstudio_review_worker_login'),'worker')
 await verifyPgRuntimeTarget(pools.executor,runtimeTarget('agentstudio_local_executor_login'))
 await inspectNativeLocalDevicePool(pools.executor,'agentstudio_local_executor')
 return true
}
export async function verifyReviewStackNewPools(pools){
 await inspectAgentAssessmentOperatorPool(pools.review_dispatch,runtimeTarget('agentstudio_review_dispatch_login'),'dispatch')
 const audit=await loadAgentDesignAuditVerifier()
 await inspectAgentDesignOperatorPool(pools.design_worker,runtimeTarget('agentstudio_design_worker_login'),'worker',audit)
 await inspectAgentDesignOperatorPool(pools.design_dispatch,runtimeTarget('agentstudio_design_dispatch_login'),'dispatch',audit)
 return true
}
export async function reviewStackPreflight(admin,pools,snapshot,cfg){
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target);assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256)
  const state=await readReviewStackCatalog(db,snapshot,'empty');await activeAdmin(db)
  return {baseline:state.baseline,ledger:await exactLedger(db,snapshot),images:await reviewStackImages(db,snapshot),allVerifiers:state.allVerifiers,knownVerifiers:state.knownVerifiers,executorBaseline:await complete069ExecutorBaseline(db),executorImage:await complete069ExecutorImage(db,snapshot)}
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
}
export async function prepareReviewStack(admin,pools,snapshot,cfg,verifiers,before,start){
 const db=await admin.connect();let begun=false
 try{await db.query('BEGIN');begun=true;await db.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");await completeServiceTarget(db,cfg.target)
  if((await db.query(completeProfileLocksSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
  await db.query('LOCK TABLE '+snapshot.tables.map(quote).join(',')+' IN SHARE MODE')
  assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256);const old=await readReviewStackCatalog(db,snapshot,'empty');await activeAdmin(db)
  if(old.baseline!==before.baseline||await exactLedger(db,snapshot)!==before.ledger||await reviewStackImages(db,snapshot)!==before.images)fail('before_state_changed')
  await apiCatalog(pools.api)
  const statements=reviewStackSql(verifiers);await start(Object.fromEntries(defs.map(d=>[d.login,sha(verifiers[d.login])])),before)
  for(const statement of statements)await db.query(statement)
  const next=await readReviewStackCatalog(db,snapshot,'prepared')
  if(next.baseline!==before.baseline||defs.some(d=>next.verifiers[d.login]!==verifiers[d.login])||await exactLedger(db,snapshot)!==before.ledger||await reviewStackImages(db,snapshot)!==before.images)fail('precommit_state_changed')
  await apiCatalog(pools.api);assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256);await completeServiceTarget(db,cfg.target)
  await db.query('COMMIT');begun=false;return true
 }finally{if(begun)await db.query('ROLLBACK').catch(()=>{});db.release()}
}
export async function observeReviewStack(admin,pools,snapshot,cfg,intent){
 const db=await admin.connect();let begun=false,state,ledger,images
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await completeServiceTarget(db,cfg.target);assertCompleteProfileSnapshot(snapshot,cfg.sourceSha256);await activeAdmin(db)
  state=await readReviewStackCatalog(db,snapshot,'either');ledger=await exactLedger(db,snapshot);images=await reviewStackImages(db,snapshot)
 }finally{if(begun)await db.query('ROLLBACK');db.release()}
 const evidence={role_matrix_verified:true,old_catalog_unchanged:state.baseline===intent.before_catalog_sha256,migration_ledger_unchanged:ledger===intent.before_ledger_sha256,all_table_images_unchanged:images===intent.before_images_sha256,verifiers_match_intent:state.prepared&&defs.every(d=>sha(state.verifiers[d.login])===intent.verifier_sha256s[d.login]),prior_logins_verified:false,new_logins_verified:false,actual_api_catalog_verified:false}
 if(!evidence.old_catalog_unchanged||!evidence.migration_ledger_unchanged||!evidence.all_table_images_unchanged)fail('observed_state_changed')
 evidence.prior_logins_verified=await verifyReviewStackPriorPools(pools)
 if(evidence.verifiers_match_intent)evidence.new_logins_verified=await verifyReviewStackNewPools(pools)
 const full=await verifyCompleteProfile(admin,pools.api,snapshot,cfg.sourceSha256);evidence.actual_api_catalog_verified=full.full_catalog_audit_verified===true
 return evidence
}
