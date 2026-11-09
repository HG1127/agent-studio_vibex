// Explicit combination on a prepared, empty-business disposable complete069.
// Does not replay base SQL or prepare credentials after extension installation.
import type {SqlClient,SqlPool} from './contracts.ts'
import {inspectCompleteProfile,verifyCompleteProfile,completeProfileTargetSql,completeProfileLocksSql,type CompleteProfilePool,type CompleteProfileTarget} from './pg18-complete-profile.ts'
import {completeServiceTarget,completeServiceCatalog,completeServiceInitialAdmin} from './pg18-complete-service-core.mjs'
import {assertEmployeeUi078Snapshot,employeeUi078Profile,employeeUi078Receipt,employeeUi078ReceiptBody,type EmployeeUi078Snapshot} from './pg18-employee-ui078-source.mjs'
import {assertEmployeeUi078Ledger,inspectEmployeeUi078ActualCatalog,verifyEmployeeUi078PreparedApi,verifyEmployeeUi078ApiPool} from './pg18-employee-ui078-audit.ts'
function fail(code:string):never{throw Error('employee_ui078_'+code)}
type StateName='pending'|'base_prepared'|'incomplete_or_foreign'|'employee_ui078_installed'
function result(snapshot:EmployeeUi078Snapshot,target:CompleteProfileTarget,state:StateName,verified=false,catalogSha256:string|null=null){return Object.freeze({state,profile:employeeUi078Profile,source_sha256:snapshot.source_sha256,target,structure_and_receipt_verified:verified,catalog_sha256:catalogSha256,full_catalog_audit_verified:false,Native_server_process_entry_verified:false,services_started:false,automatic_retry_authorized:false,production_GO:false})}
async function physical(db:SqlClient,expected:CompleteProfileTarget){
 await completeServiceTarget(db,expected);const rows=(await db.query<{system_identifier:string;database_oid:string}>(completeProfileTargetSql)).rows
 if(rows.length!==1||rows[0]?.system_identifier!==expected.system_identifier||rows[0]?.database_oid!==expected.database_oid)fail('target_changed')
 return Object.freeze({system_identifier:rows[0].system_identifier,database_oid:rows[0].database_oid})
}
async function metadata(db:SqlClient,snapshot:EmployeeUi078Snapshot,target:CompleteProfileTarget){
 const presence=(await db.query<{schema:boolean;auth:boolean}>("SELECT to_regnamespace('agentstudio') IS NOT NULL AS schema,to_regnamespace('agentstudio_auth') IS NOT NULL AS auth")).rows
 if(presence.length!==1||presence[0]?.schema!==true||presence[0]?.auth!==true)return result(snapshot,target,'incomplete_or_foreign')
 const extension=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='vector' AND extversion='0.8.7') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname NOT IN('vector','plpgsql')) AS ok")).rows
 if(extension.length!==1||extension[0]?.ok!==true)return result(snapshot,target,'incomplete_or_foreign')
 const ledger=(await db.query<{version:string;description:string}>('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version COLLATE "C"')).rows
 if(!Array.isArray(ledger)||ledger.some(r=>typeof r?.version!=='string'||typeof r?.description!=='string'))fail('ledger_shape')
 const installed=ledger.some(r=>r.version===employeeUi078Receipt),combined=installed||ledger.some(r=>snapshot.steps.some(s=>s.version===r.version))
 if(combined&&!installed)return result(snapshot,target,'incomplete_or_foreign')
 const digest=await inspectEmployeeUi078ActualCatalog(db,snapshot,combined)
 // Compare every actual row/version/description, including unknown extras.
 assertEmployeeUi078Ledger(ledger,snapshot,target,digest,combined)
 return result(snapshot,target,combined?'employee_ui078_installed':'base_prepared',combined,digest)
}
export async function inspectEmployeeUi078Profile(admin:CompleteProfilePool,snapshot:EmployeeUi078Snapshot,expected:string,target:CompleteProfileTarget){
 assertEmployeeUi078Snapshot(snapshot,expected);const db=await admin.connect();let begun=false,destroy=false,failed=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");const actual=await physical(db,target)
  if((await db.query<{locked:boolean}>(completeProfileLocksSql)).rows[0]?.locked!==true)return result(snapshot,actual,'pending')
  const state=await metadata(db,snapshot,actual);await physical(db,actual);assertEmployeeUi078Snapshot(snapshot,expected);return state
 }catch(error){failed=true;throw error}finally{try{if(begun)await db.query('ROLLBACK')}catch{destroy=true;if(!failed)fail('inspect_rollback_required')}finally{db.release(destroy)}}
}
export async function verifyEmployeeUi078Profile(admin:CompleteProfilePool,api:SqlPool,snapshot:EmployeeUi078Snapshot,expected:string,target:CompleteProfileTarget){
 const before=await inspectEmployeeUi078Profile(admin,snapshot,expected,target);if(!before.structure_and_receipt_verified)fail('combination_not_installed')
 const verified=await verifyEmployeeUi078ApiPool(api,snapshot,expected,target),after=await inspectEmployeeUi078Profile(admin,snapshot,expected,target)
 if(!after.structure_and_receipt_verified||before.catalog_sha256!==after.catalog_sha256||verified.catalog_sha256!==after.catalog_sha256)fail('combination_changed')
 return Object.freeze({...after,...verified,full_catalog_audit_verified:true,actual_api_login_verified:true,combination_installed_verified:true,feature_activation_authorized:false,production_GO:false})
}
const quote=(name:string)=>{if(!/^(?:agentstudio|agentstudio_auth)\.[a-z_][a-z_0-9]*$/.test(name))fail('table_source');return name.split('.').map(s=>'"'+s+'"').join('.')}
export async function installEmployeeUi078Profile(admin:CompleteProfilePool,api:SqlPool,snapshot:EmployeeUi078Snapshot,expected:string,target:CompleteProfileTarget){
 assertEmployeeUi078Snapshot(snapshot,expected)
 // Original exact069 identifier and original independent API verifier run on
 // the unextended real catalog. No caller-supplied filtered SQL facade exists.
 const base=await inspectCompleteProfile(admin,snapshot.base,snapshot.base.source_sha256,target);if(!base.structure_and_receipt_verified)fail('exact_prepared069_required')
 await verifyCompleteProfile(admin,api,snapshot.base,snapshot.base.source_sha256)
 const db=await admin.connect();let begun=false,committed=false,destroy=false,failed=false
 try{
  await db.query('BEGIN');begun=true;await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");const actual=await physical(db,target)
  if((await db.query<{locked:boolean}>(completeProfileLocksSql)).rows[0]?.locked!==true)fail('schema_lock_busy')
  if((await metadata(db,snapshot,actual)).state!=='base_prepared')fail('exact_prepared069_required')
  // This is the original catalog/HBA/independent-membership auditor, before
  // the new078 role exists. The new role is never hidden from an old auditor.
  const roles=await completeServiceCatalog(db,snapshot.base)
  if(roles.get('agentstudio_stage_login')?.login!==true||roles.get('agentstudio_native_login')?.login!==true)fail('original_native_preparation_required')
  for(const name of snapshot.base.tables)await db.query('LOCK TABLE '+quote(name)+' IN SHARE ROW EXCLUSIVE MODE')
  await completeServiceInitialAdmin(db,true)
  for(const name of snapshot.base.tables){if(['agentstudio.schema_migrations','agentstudio.users','agentstudio_auth.accounts'].includes(name))continue;if((await db.query<{empty:boolean}>('SELECT NOT EXISTS(SELECT 1 FROM '+quote(name)+') AS empty')).rows[0]?.empty!==true)fail('disposable_empty_business_required')}
  await verifyEmployeeUi078PreparedApi(api,snapshot,actual);await physical(db,actual);assertEmployeeUi078Snapshot(snapshot,expected)
  for(const step of snapshot.steps){assertEmployeeUi078Snapshot(snapshot,expected);await physical(db,actual);await db.query(step.sql)}
  await db.query('SET LOCAL search_path=pg_catalog')
  const digest=await inspectEmployeeUi078ActualCatalog(db,snapshot,true)
  await db.query('INSERT INTO agentstudio.schema_migrations(version,description) VALUES($1,$2)',[employeeUi078Receipt,employeeUi078ReceiptBody(snapshot,actual,digest)])
  const post=await metadata(db,snapshot,actual);if(!post.structure_and_receipt_verified||post.catalog_sha256!==digest)fail('uncommitted_combination_postflight_failed')
  for(const name of snapshot.tables){if(snapshot.base.tables.includes(name))continue;if((await db.query<{empty:boolean}>('SELECT NOT EXISTS(SELECT 1 FROM '+quote(name)+') AS empty')).rows[0]?.empty!==true)fail('extension_business_not_empty')}
  // Structural admin observations are not labeled an actual API audit.
  await physical(db,actual);assertEmployeeUi078Snapshot(snapshot,expected);await db.query('COMMIT');committed=true
 }catch(error){failed=true;throw error}finally{try{if(begun&&!committed)await db.query('ROLLBACK')}catch{destroy=true;if(!failed)fail('install_rollback_required')}finally{db.release(destroy)}}
 // An original semantic auditor refusal after commit yields no success ACK.
 // A timeout/lost ACK never authorizes replay; explicit independent verify only.
 const verified=await verifyEmployeeUi078Profile(admin,api,snapshot,expected,target)
 return Object.freeze({...verified,invocation_commit_acknowledged:true,base_sql_reexecuted:false,service_logins_or_passwords_prepared:false,services_started:false,automatic_retry_authorized:false})
}
