
import {prepareStaffCompositeAdditionalLogins} from './employee-staff084-logins.mjs'
import {staffCompositeMode,staffCompositeReceipt,staffCompositeLogins,staffCompositeTarget,staffCompositeReceiptBody,staffCompositeSha,assertStaffComposite14Logins,assertStaffCompositeDelta} from './employee-staff084-contract.mjs'
import {captureEmployeeStaff084Sources,assertEmployeeStaff084Snapshot} from './employee-staff084-source.mjs'
import {employeeUi078CatalogSql,employeeUi078CatalogDigest,employeeUi078Canonical as canonical,employeeUi078FunctionOidsSql} from './pg18-employee-ui078-catalog.mjs'
import {employeeUi078Receipt,employeeUi078ReceiptBody} from './pg18-employee-ui078-source.mjs'
import {verifyEmployeeUi078Profile} from './pg18-employee-ui078-profile.ts'
import {inspectEmployeeGovernanceSchema} from './native-employee-governance-audit.mjs'
import {inspectAgentReleaseSchema} from './agent-release-audit.ts'
import {verifyComplete078Staff084Schema} from './original-staff-audit084.mjs'
import {verifyComplete078StaffQuality089AuthSchema} from './staff084-quality089-auth-audit.mjs'
import {completeServiceTarget} from './pg18-complete-service-core.mjs'
import {completeProfileLocksSql} from './pg18-complete-profile.ts'
import {completeProfileReceipt,completeProfileReceiptBody} from './pg18-complete-profile-source.mjs'
import {freshRuntimeReceiptBody} from './pg18-fresh-runtime-install.ts'
import {checkedServiceLoginReceipt} from './pg18-service-login-policy.mjs'
const bad=code=>{throw Error('staff_composite_'+code)},metadataSignature='agentstudio.staff084_composite_ledger()'
export const staffCompositeLedgerSQL='SELECT system_identifier,database_oid,version,description FROM agentstudio.staff084_composite_ledger() ORDER BY version COLLATE "C"'
export const staffCompositeMetadataAuditSQL="SELECT p.oid::text AS oid,p.prosrc AS source,p.prokind='f' AND p.prosecdef AND p.provolatile='s' AND NOT p.proisstrict AND NOT p.proleakproof AND p.proretset AND p.pronargs=0 AND p.pronargdefaults=0 AND p.provariadic=0 AND p.prosupport=0 AND p.prosqlbody IS NULL AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND l.lanname='sql' AND r.rolname='postgres' AND r.rolsuper AND p.prorettype='record'::regtype AND p.proargmodes=ARRAY['t','t','t','t']::\"char\"[] AND p.proargnames=ARRAY['system_identifier','database_oid','version','description']::text[] AND p.proallargtypes=ARRAY['text'::regtype,'text'::regtype,'text'::regtype,'text'::regtype]::oid[] AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles x WHERE NOT x.rolsuper AND pg_has_role(x.oid,p.proowner,'MEMBER')) AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='agentstudio_api'),(SELECT oid FROM pg_roles WHERE rolname='agentstudio_native_auth')) OR a.grantee<>p.proowner AND a.is_grantable) AND has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AND has_function_privilege('agentstudio_native_auth',p.oid,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_roles x WHERE NOT x.rolsuper AND x.rolname NOT IN('agentstudio_api','agentstudio_native_auth') AND has_function_privilege(x.oid,p.oid,'EXECUTE')) AS safe FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE n.nspname='agentstudio' AND p.proname='staff084_composite_ledger'"
export async function staffCompositeCatalog(db){const r=(await db.query(employeeUi078CatalogSql)).rows;if(r.length!==1||!r[0]?.catalog)bad('catalog_shape');return r[0].catalog}
export async function inspectStaffComposite14Logins(db){
 const names=staffCompositeLogins.map(d=>d.login),rows=(await db.query("SELECT r.rolname AS name,r.rolcanlogin AS login,r.rolsuper AS super,r.rolinherit AS inherit,r.rolbypassrls AS bypass,r.rolcreatedb AS createdb,r.rolcreaterole AS createrole,r.rolreplication AS replication,r.rolconfig AS config,r.rolconnlimit AS limit,r.rolvaliduntil::text AS valid_until,(EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f','S') AND (c.relowner=r.oid OR CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE') ELSE has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN') END)) OR has_schema_privilege(r.oid,'agentstudio','USAGE,CREATE') OR has_schema_privilege(r.oid,'agentstudio_auth','USAGE,CREATE') OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND (p.proowner=r.oid OR has_function_privilege(r.oid,p.oid,'EXECUTE'))) OR NOT has_database_privilege(r.oid,current_database(),'CONNECT') OR has_database_privilege(r.oid,current_database(),'CREATE') OR EXISTS(SELECT 1 FROM pg_catalog.pg_database d,LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a WHERE a.grantee=r.oid AND (d.datname<>current_database() OR a.privilege_type<>'CONNECT' OR a.is_grantable))) AS direct_privileges FROM pg_catalog.pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname",[names])).rows
 const memberships=(await db.query("SELECT c.rolname AS member,g.rolname AS group,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS set FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles g ON g.oid=m.roleid WHERE c.rolname=ANY($1::text[]) OR g.rolname=ANY($1::text[]) ORDER BY c.rolname,g.rolname",[names])).rows
 assertStaffComposite14Logins(rows,memberships)
}
async function inventory(db,s,role){
 const tables=(await db.query("SELECT n.nspname||'.'||c.relname AS name,c.relkind::text AS kind,c.relrowsecurity AS rls,c.relforcerowsecurity AS force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f','S') ORDER BY n.nspname COLLATE \"C\",c.relname COLLATE \"C\"")).rows
 if(tables.length!==s.tables.length||tables.some((r,i)=>r.name!==s.tables[i]||r.kind!=='r'||(r.name==='agentstudio.schema_migrations'?(r.rls||r.force):(!r.rls||!r.force))))bad('whole_table_inventory')
 let qualityFunctions=[]
 if(s.mode.quality){const {originalQuality089Profile}=await import('./original-quality089-profile.mjs');qualityFunctions=originalQuality089Profile.newFunctions.map(f=>'agentstudio.'+f);if(role==='agentstudio_api'){const {verifyOriginalQuality089Schema}=await import('./original-quality089-audit.ts');await verifyOriginalQuality089Schema(db)}else if(role==='agentstudio_native_auth'){const {assertStaffQuality089AuthPublicCatalog,originalQuality089CatalogSQL}=await import('./staff084-quality089-public-auth-audit.mjs');const rows=(await db.query(originalQuality089CatalogSQL)).rows;if(rows.length!==1)bad('quality_auth_public_catalog');assertStaffQuality089AuthPublicCatalog(rows[0].value)}else if(role!=='postgres')bad('quality_catalog_LOGIN')}
 const signatures=[...s.parent.functions,'agentstudio_auth.original_staff_revision_guard()',metadataSignature,...qualityFunctions].sort(),resolved=(await db.query(employeeUi078FunctionOidsSql,[signatures])).rows
 if(resolved.length!==signatures.length||resolved.some((r,i)=>r.signature!==signatures[i]||!/^[1-9][0-9]*$/.test(r.oid))||new Set(resolved.map(r=>r.oid)).size!==resolved.length)bad('function_resolution')
 const actual=(await db.query("SELECT p.oid::text AS oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')")).rows;if(actual.length!==signatures.length||actual.some(r=>!resolved.some(v=>v.oid===r.oid)))bad('whole_function_inventory')
 const required=new Set([...s.parent.roles,...staffCompositeLogins.map(v=>v.login),...(s.mode.quality?['agentstudio_quality089']:[])]),roles=(await db.query("SELECT rolname AS name,rolcanlogin AS login,NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL AND rolvaliduntil IS NULL AS safe FROM pg_roles WHERE NOT starts_with(rolname,'pg_') AND rolname<>'postgres'")).rows
 if(roles.length!==required.size||roles.some(r=>!required.has(r.name)||r.safe!==true||r.login!==staffCompositeLogins.some(d=>d.login===r.name)))bad('whole_role_inventory')
 await inspectStaffComposite14Logins(db)
 const shadows=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN('information_schema','public','agentstudio','agentstudio_auth')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN('information_schema','agentstudio','agentstudio_auth') AND NOT EXISTS(SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e' AND e.extname='vector' AND e.extversion='0.8.7')) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN('information_schema','agentstudio','agentstudio_auth') AND NOT EXISTS(SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e' AND e.extname='vector' AND e.extversion='0.8.7')) AS safe")).rows
 if(shadows.length!==1||shadows[0].safe!==true)bad('foreign_inventory')
}
export function assertStaffCompositeLedger(rows,s,target,parentCatalog,digest){
 const expected=new Map(s.parent.literal_ledger.map(r=>[r.version,r.description]))
 expected.set('pg18_fresh_runtime_001',freshRuntimeReceiptBody(s.parent.base.fresh));expected.set(completeProfileReceipt,completeProfileReceiptBody(s.parent.base));expected.set(employeeUi078Receipt,employeeUi078ReceiptBody(s.parent,target,parentCatalog))
 for(const r of s.literal_ledger)expected.set(r.version,r.description)
 expected.set(staffCompositeReceipt,staffCompositeReceiptBody(s,target,parentCatalog,digest))
 for(const r of rows)if(typeof r?.version==='string'&&r.version.startsWith('pg18_service_login_')){checkedServiceLoginReceipt(r.version,r.description,s.parent.base.fresh.source_sha256);if(expected.has(r.version))bad('ledger_duplicate');expected.set(r.version,r.description)}
 const want=[...expected].sort(([a],[b])=>a<b?-1:a>b?1:0);if(rows.length!==want.length||rows.some((r,i)=>Object.keys(r).sort().join(',')!=='description,version'||r.version!==want[i][0]||r.description!==want[i][1]))bad('whole_ledger')
}
async function audit(db,s,target,role){
 assertEmployeeStaff084Snapshot(s,s.source_sha256);staffCompositeTarget(target)
 const identity=(await db.query("SELECT session_user::text AS login,current_user::text AS role,current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,current_setting('search_path') AS search_path,NOT pg_is_in_recovery() AS primary")).rows
 const login=role==='agentstudio_native_auth'?'agentstudio_native_login':'agentstudio_stage_login';if(identity.length!==1||identity[0].login!==login||identity[0].role!==role||identity[0].database!=='agent_studio'||identity[0].host!=='127.0.0.1'||identity[0].port!==5333||identity[0].version<180000||identity[0].version>=190000||identity[0].primary!==true||identity[0].search_path!=='pg_catalog')bad('actual_LOGIN_required')
 const fn=(await db.query(staffCompositeMetadataAuditSQL)).rows;if(fn.length!==1||fn[0].safe!==true||staffCompositeSha(fn[0].source)!==s.metadata_body_sha256)bad('metadata_RPC_source_ACL')
 const records=(await db.query(staffCompositeLedgerSQL)).rows;if(!records.length||records.some(r=>Object.keys(r).sort().join(',')!=='database_oid,description,system_identifier,version'||r.system_identifier!==target.system_identifier||r.database_oid!==target.database_oid))bad('physical_target')
 const raw=records.find(r=>r.version===staffCompositeReceipt);let body;try{body=JSON.parse(raw.description)}catch{bad('receipt_required')}
 const value=await staffCompositeCatalog(db),digest=employeeUi078CatalogDigest(value);await inventory(db,s,role);assertStaffCompositeLedger(records.map(({version,description})=>({version,description})),s,target,body.parent_catalog_sha256,digest);assertEmployeeStaff084Snapshot(s,s.source_sha256)
 return {catalog_sha256:digest,metadata_oid:fn[0].oid}
}
async function stateOnAuth(db){
 const rows=(await db.query("SELECT description FROM agentstudio.schema_migrations WHERE version='pg18_employee_staff084_composite_001'")).rows;if(rows.length!==1)bad('receipt_required')
 let body;try{body=JSON.parse(rows[0].description)}catch{bad('receipt_required')}
 const mode=staffCompositeMode(body.profile),snapshot=await captureEmployeeStaff084Sources(mode.profile);if(snapshot.source_sha256!==body.source_sha256)bad('source_changed');return {snapshot,target:staffCompositeTarget(body.target)}
}
export async function verifyEmployeeStaff084AuthClient(db){
 const {snapshot,target}=await stateOnAuth(db),before=await audit(db,snapshot,target,'agentstudio_native_auth')
 if(snapshot.mode.quality)await verifyComplete078StaffQuality089AuthSchema(db);else await verifyComplete078Staff084Schema(db)
 const after=await audit(db,snapshot,target,'agentstudio_native_auth');if(canonical(before)!==canonical(after))bad('auth_catalog_changed');return true
}
export async function verifyEmployeeStaff084Pool(pool,s,expected,target,kind){
 assertEmployeeStaff084Snapshot(s,expected);if(!['api','auth'].includes(kind))bad('LOGIN_kind')
 const db=await pool.connect();let begun=false,discard=false,primary
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query('SET LOCAL ROLE '+(kind==='auth'?'agentstudio_native_auth':'agentstudio_api'));await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='45s'; SET LOCAL lock_timeout='5s'");await audit(db,s,target,kind==='auth'?'agentstudio_native_auth':'agentstudio_api');if(kind==='auth')await verifyEmployeeStaff084AuthClient(db);return Object.freeze({profile:s.mode.profile,source_sha256:expected,target,actual_LOGIN:kind==='auth'?'agentstudio_native_login':'agentstudio_stage_login',whole_auth_and_public_catalog:true,original_14_LOGIN_grants_verified:true,old_profile_accepts_additions:false,production_GO:false})}
 catch(error){primary=error;throw error}
 finally{if(begun)try{await db.query('ROLLBACK')}catch{discard=true}try{db.release(discard)}catch{if(primary===undefined)bad('audit_release_unconfirmed')}if(discard&&primary===undefined)bad('audit_rollback_unconfirmed')}
}
/** Hosted initializer only invokes this after owning a new cluster. Additional
 * original LOGIN creation is performed by its closed helper inside this same tx. */
export async function installEmployeeStaff084Profile(admin,api,auth,s,expected,target,extraSecrets){
 assertEmployeeStaff084Snapshot(s,expected);staffCompositeTarget(target)
 await verifyEmployeeUi078Profile(admin,api,s.parent,s.parent.source_sha256,target)
 if(await inspectEmployeeGovernanceSchema(api)!==true||await inspectAgentReleaseSchema(api)!==true)bad('original047_046_preinstall_audit')
 const db=await admin.connect();let begun=false,committed=false,discard=false,primary
 try{await db.query('BEGIN');begun=true;await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");await completeServiceTarget(db,target);if((await db.query(completeProfileLocksSql)).rows[0]?.locked!==true)bad('schema_lock')
 for(const name of s.parent.tables)await db.query('LOCK TABLE '+name.split('.').map(x=>'"'+x+'"').join('.')+' IN SHARE ROW EXCLUSIVE MODE')
 for(const name of s.parent.tables){if(['agentstudio.schema_migrations','agentstudio.users','agentstudio_auth.accounts'].includes(name))continue;if((await db.query('SELECT NOT EXISTS(SELECT 1 FROM '+name+') AS empty')).rows[0]?.empty!==true)bad('empty_business_required')}
 const before=await staffCompositeCatalog(db),parentCatalog=employeeUi078CatalogDigest(before),receipt=(await db.query('SELECT description FROM agentstudio.schema_migrations WHERE version=$1',[employeeUi078Receipt])).rows
 if(receipt.length!==1||receipt[0].description!==employeeUi078ReceiptBody(s.parent,target,parentCatalog))bad('parent_catalog_changed')
 // No observer/approval callback can mint success: actual14 metadata, all source,
 // auth audit and post-commit real-login checks remain independently mandatory.
 await prepareStaffCompositeAdditionalLogins(db,extraSecrets)
 await db.query("SELECT set_config('agentstudio.original_staff_profile','native047-original-staff084',true),set_config('agentstudio.original_staff_approval','APPROVE_DISPOSABLE_ORIGINAL_STAFF_084_SCHEMA_ONLY',true)")
 for(const step of s.steps){assertEmployeeStaff084Snapshot(s,expected);await completeServiceTarget(db,target);await db.query(step.sql)}
 await db.query('SET LOCAL search_path=pg_catalog');await inventory(db,s,'postgres');const after=await staffCompositeCatalog(db);assertStaffCompositeDelta(before,after,s.mode.quality);const digest=employeeUi078CatalogDigest(after)
 await db.query('INSERT INTO agentstudio.schema_migrations(version,description) VALUES($1,$2)',[staffCompositeReceipt,staffCompositeReceiptBody(s,target,parentCatalog,digest)]);assertStaffCompositeLedger((await db.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version COLLATE "C"')).rows,s,target,parentCatalog,digest);await completeServiceTarget(db,target);assertEmployeeStaff084Snapshot(s,expected);await db.query('COMMIT');committed=true
 }catch(error){primary=error;throw error}
 finally{if(begun&&!committed)try{await db.query('ROLLBACK')}catch{discard=true}try{db.release(discard)}catch{if(primary===undefined)bad('install_release_unconfirmed')}if(discard&&primary===undefined)bad('install_rollback_unconfirmed')}
 const apiProof=await verifyEmployeeStaff084Pool(api,s,expected,target,'api'),authProof=await verifyEmployeeStaff084Pool(auth,s,expected,target,'auth');return {api:apiProof,auth:authProof,actual_extra_LOGIN_connections_verified:false,services_started:false,production_GO:false}
}
