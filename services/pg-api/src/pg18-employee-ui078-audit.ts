import {createHash} from 'node:crypto'
import {isProxy} from 'node:util/types'
import {verifyModelConfigReceiptGlobalInventory075} from './model-config-receipt-profile075-audit.ts'
import type {SqlClient,SqlPool} from './contracts.ts'
import type {CompleteProfilePool,CompleteProfileTarget} from './pg18-complete-profile.ts'
import {completeProfileReceipt,completeProfileReceiptBody} from './pg18-complete-profile-source.mjs'
import {freshRuntimeReceiptBody} from './pg18-fresh-runtime-install.ts'
import {checkedServiceLoginReceipt,serviceLogins} from './pg18-service-login-policy.mjs'
import {assertEmployeeUi078Snapshot,employeeUi078Receipt,employeeUi078ReceiptBody,type EmployeeUi078Snapshot} from './pg18-employee-ui078-source.mjs'
import {employeeUi078CatalogSql,employeeUi078CatalogDigest,employeeUi078LedgerRpcSql,employeeUi078LedgerRpcAuditSql,employeeUi078FunctionOidsSql} from './pg18-employee-ui078-catalog.mjs'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
import {inspectOptionalNativeHomeAuthoringSchema} from './native-home-authoring-audit.ts'
import {inspectOptionalNativeAgentCatalogSchema} from './native-agent-catalog-audit.ts'
import {inspectOptionalOriginalHomeKnowledgeStatisticsSchema} from './native-home-knowledge-stats-audit.ts'
import {inspectOptionalNativeMonitorInbox} from './native-monitor-inbox-audit.ts'
import {auditModelConfigReceipt075After069} from './model-config-receipt-startup075.ts'
import {inspectOriginalSchedulesSchema} from './original-schedules-audit.ts'
function fail(code:string):never{throw Error('employee_ui078_'+code)}
const sha=(text:string)=>createHash('sha256').update(text).digest('hex')
type LedgerRow={version:string;description:string}
type RpcRow=LedgerRow&{system_identifier:string;database_oid:string}
const positive=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v)
export function assertEmployeeUi078Ledger(rows:LedgerRow[],snapshot:EmployeeUi078Snapshot,target:CompleteProfileTarget,catalogSha256:string,combined=true):void{
 assertEmployeeUi078Snapshot(snapshot,snapshot.source_sha256)
 if(!Array.isArray(rows)||rows.length>128||Reflect.ownKeys(rows).length!==rows.length+1)fail('ledger_shape')
 for(let i=0;i<rows.length;i++){const item=Object.getOwnPropertyDescriptor(rows,String(i));if(!item||!('value'in item))fail('ledger_shape');const r=item.value;if(!r||Object.getPrototypeOf(r)!==Object.prototype)fail('ledger_shape');const d=Object.getOwnPropertyDescriptors(r);if(Reflect.ownKeys(d).sort().join(',')!=='description,version'||!d.version||!('value'in d.version)||typeof d.version.value!=='string'||!d.description||!('value'in d.description)||typeof d.description.value!=='string'||d.description.value.length>524288)fail('ledger_shape')}
 const expected=new Map(snapshot.literal_ledger.filter(r=>combined||snapshot.base.versions.includes(r.version)).map(r=>[r.version,r.description]))
 expected.set('pg18_fresh_runtime_001',freshRuntimeReceiptBody(snapshot.base.fresh));expected.set(completeProfileReceipt,completeProfileReceiptBody(snapshot.base))
 if(combined)expected.set(employeeUi078Receipt,employeeUi078ReceiptBody(snapshot,target,catalogSha256))
 for(const r of rows){if(r.version.startsWith('pg18_service_login_')){checkedServiceLoginReceipt(r.version,r.description,snapshot.base.fresh.source_sha256);if(expected.has(r.version))fail('duplicate_ledger');expected.set(r.version,r.description)}}
 const exact=[...expected].sort(([a],[b])=>a<b?-1:a>b?1:0)
 if(rows.length!==exact.length||rows.some((r,i)=>r.version!==exact[i]?.[0]||r.description!==exact[i]?.[1]))fail('whole_ledger_mismatch')
}
/** Bounded catalog-only mismatch evidence. Never changes the accepting set. */
export function employeeUi078FunctionInventoryDiagnostic(signatures:readonly string[],resolved:readonly {signature:string;oid:string|null}[],functions:readonly {oid:string;schema:string;name:string;kind?:string;arguments?:string;owner?:string;extension?:string|null}[],combined:boolean){
 const sample_limit=12,data=(v:unknown,key:string):unknown=>{if(!v||typeof v!=='object'||isProxy(v))return undefined;const d=Object.getOwnPropertyDescriptor(v,key);return d&&Object.hasOwn(d,'value')?d.value:undefined},identifier=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z_][a-zA-Z_0-9$]{0,62}$/.test(v)?v:null,oid=(v:unknown)=>positive(v)?v:null,text=(v:unknown)=>typeof v==='string'&&v.length<=256&&/^[a-zA-Z_0-9.\[\],()" ]*$/.test(v)?v:null
 const expected=new Set(resolved.map(r=>oid(data(r,'oid'))).filter((v):v is string=>v!==null)),actual=new Set(functions.map(r=>oid(data(r,'oid'))).filter((v):v is string=>v!==null)),missing=resolved.filter(r=>{const v=oid(data(r,'oid'));return v===null||!actual.has(v)}),unexpected=functions.filter(r=>{const v=oid(data(r,'oid'));return v===null||!expected.has(v)}),invalid=functions.filter(r=>oid(data(r,'oid'))===null)
 return {format:'employee_ui078_function_inventory_v1',phase:combined?'combined':'base',expected_signatures:signatures.length,resolved_rows:resolved.length,actual_rows:functions.length,expected_unique_oids:expected.size,actual_unique_oids:actual.size,missing_count:missing.length,unexpected_count:unexpected.length,invalid_actual_oid_count:invalid.length,duplicate_actual_oid_count:functions.length-invalid.length-actual.size,sample_limit,
  missing:missing.slice(0,sample_limit).map(r=>({oid:oid(data(r,'oid')),signature:text(data(r,'signature'))})),
  unexpected:unexpected.slice(0,sample_limit).map(r=>({oid:oid(data(r,'oid')),schema:typeof data(r,'schema')==='string'&&['agentstudio','agentstudio_auth'].includes(data(r,'schema') as string)?data(r,'schema'):null,name:identifier(data(r,'name')),kind:typeof data(r,'kind')==='string'&&['f','p','a','w'].includes(data(r,'kind') as string)?data(r,'kind'):null,arguments:text(data(r,'arguments')),owner:identifier(data(r,'owner')),extension:identifier(data(r,'extension'))})),truncated:missing.length>sample_limit||unexpected.length>sample_limit}
}
export async function inspectEmployeeUi078ActualCatalog(db:SqlClient,snapshot:EmployeeUi078Snapshot,combined=true):Promise<string>{
 assertEmployeeUi078Snapshot(snapshot,snapshot.source_sha256)
 const tables=(await db.query<{name:string;kind:string;enabled:boolean;forced:boolean}>("SELECT n.nspname||'.'||c.relname AS name,c.relkind::text AS kind,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f','S') ORDER BY n.nspname COLLATE \"C\",c.relname COLLATE \"C\"")).rows
 const names=combined?snapshot.tables:snapshot.base.tables
 if(tables.length!==names.length||tables.some((t,i)=>t.name!==names[i]||t.kind!=='r'||(t.name==='agentstudio.schema_migrations'?(t.enabled||t.forced):(!t.enabled||!t.forced))))fail('whole_table_inventory_mismatch')
 const signatures=combined?snapshot.functions:snapshot.base_functions
 const resolved=(await db.query<{signature:string;oid:string|null}>(employeeUi078FunctionOidsSql,[[...signatures]])).rows
 if(resolved.length!==signatures.length||resolved.some((v,i)=>v.signature!==signatures[i]||!positive(v.oid))||new Set(resolved.map(v=>v.oid)).size!==resolved.length)fail('function_oid_resolution_mismatch')
 const functions=(await db.query<{oid:string;schema:string;name:string}>("SELECT p.oid::text AS oid,n.nspname AS schema,p.proname AS name,p.prokind::text AS kind,pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,pg_catalog.pg_get_userbyid(p.proowner) AS owner,(SELECT e.extname FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.objid=p.oid AND d.refclassid='pg_catalog.pg_extension'::regclass AND d.deptype='e') AS extension FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') ORDER BY p.oid")).rows
 const expectedOids=new Set(resolved.map(v=>v.oid))
 if(functions.length!==expectedOids.size||functions.some(f=>!positive(f.oid)||!expectedOids.has(f.oid))||new Set(functions.map(v=>v.oid)).size!==functions.length){
  try{const diagnostic=employeeUi078FunctionInventoryDiagnostic(signatures,resolved,functions,combined);process.stderr.write('employee_ui078_function_inventory_diagnostic '+JSON.stringify(diagnostic)+'\n')}catch{}
  fail('whole_function_inventory_mismatch')
 }
 const shadows=(await db.query<{absent:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('agentstudio','agentstudio_auth') AND c.relname=ANY($1::text[])) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('agentstudio','agentstudio_auth') AND p.proname=ANY($2::text[])) AS absent",[names.map(n=>n.split('.')[1]),[...new Set(functions.map(f=>f.name))]])).rows
 if(shadows.length!==1||shadows[0]?.absent!==true)fail('foreign_catalog_shadow')
 const allowedLogins=new Set(['agentstudio_native_login',...Object.values(serviceLogins).map(v=>v.login)]),roles=(await db.query<{name:string;login:boolean;safe:boolean}>("SELECT rolname AS name,rolcanlogin AS login,NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL AND rolvaliduntil IS NULL AND rolconnlimit=-1 AS safe FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_') ORDER BY rolname COLLATE \"C\"")).rows,required=combined?snapshot.roles:snapshot.base.roles
 if(required.some(n=>!roles.some(r=>r.name===n))||roles.some(r=>r.safe!==true||typeof r.login!=='boolean'||!required.includes(r.name)&&!allowedLogins.has(r.name)||r.login&&!allowedLogins.has(r.name)||!required.includes(r.name)&&r.login!==true)||new Set(roles.map(v=>v.name)).size!==roles.length)fail('whole_role_inventory_mismatch')
 await verifyModelConfigReceiptGlobalInventory075(db)
 const catalog=(await db.query<{catalog:unknown}>(employeeUi078CatalogSql)).rows;if(catalog.length!==1||!catalog[0]?.catalog||typeof catalog[0].catalog!=='object')fail('catalog_shape')
 assertEmployeeUi078Snapshot(snapshot,snapshot.source_sha256);return employeeUi078CatalogDigest(catalog[0].catalog)
}
async function actualApi(db:SqlClient){
 const rows=(await db.query<{safe:boolean}>("SELECT session_user='agentstudio_stage_login' AND current_user=session_user AND current_database()='agent_studio' AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=5333 AND current_setting('server_version_num')::integer BETWEEN 180000 AND 189999 AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AND r.rolconnlimit=-1 AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=r.oid)=1 AND (SELECT count(*) FROM pg_catalog.pg_roles p WHERE p.oid<>r.oid AND pg_has_role(r.oid,p.oid,'MEMBER'))=1 AND EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid AND p.rolname='agentstudio_api' AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option) AS safe FROM pg_catalog.pg_roles r WHERE rolname=session_user")).rows
 if(rows.length!==1||rows[0]?.safe!==true)fail('actual_api_login_required')
 await db.query('SET LOCAL ROLE agentstudio_api')
}
async function original069(db:SqlClient){
 if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true||await verifyAgentCallerCredentials(db)!==true||await verifyOwnerToolTrialCredentials(db)!==true)fail('original069_catalog_audit_failed')
}
export async function verifyEmployeeUi078PreparedApi(pool:CompleteProfilePool,snapshot:EmployeeUi078Snapshot,target:CompleteProfileTarget){
 assertEmployeeUi078Snapshot(snapshot,snapshot.source_sha256);const db=await pool.connect();let begun=false,failed=false,destroy=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'");await actualApi(db)
  const rows=(await db.query<{database_oid:string}>("SELECT oid::text AS database_oid FROM pg_catalog.pg_database WHERE datname=current_database()")).rows
  if(rows.length!==1||rows[0]?.database_oid!==target.database_oid)fail('actual_api_database_required')
  await inspectEmployeeUi078ActualCatalog(db,snapshot,false);await original069(db);assertEmployeeUi078Snapshot(snapshot,snapshot.source_sha256)
 }catch(error){failed=true;throw error}finally{try{if(begun)await db.query('ROLLBACK')}catch{destroy=true;if(!failed)fail('prepared_api_rollback_required')}finally{db.release(destroy)}}
}
async function apiCatalog(pool:CompleteProfilePool,snapshot:EmployeeUi078Snapshot,expected:string,target:CompleteProfileTarget){
 assertEmployeeUi078Snapshot(snapshot,expected);const db=await pool.connect();let begun=false,destroy=false,failed=false
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'");await actualApi(db)
  const rpc=(await db.query<{oid:string;ok:boolean;source:string}>(employeeUi078LedgerRpcAuditSql)).rows
  if(rpc.length!==1||rpc[0]?.ok!==true||!positive(rpc[0].oid)||typeof rpc[0].source!=='string'||sha(rpc[0].source)!==snapshot.ledger_rpc_body_sha256)fail('ledger_rpc_source_oid_acl_required')
  // Invoke only after the exact live SECURITY DEFINER source/OID/ACL audit.
  const rows=(await db.query<RpcRow>(employeeUi078LedgerRpcSql)).rows
  if(!Array.isArray(rows)||rows.length<1||rows.some(r=>Object.keys(r).sort().join(',')!=='database_oid,description,system_identifier,version'||r.system_identifier!==target.system_identifier||r.database_oid!==target.database_oid))fail('actual_physical_target_required')
  const digest=await inspectEmployeeUi078ActualCatalog(db,snapshot,true)
  assertEmployeeUi078Ledger(rows.map(({version,description})=>({version,description})),snapshot,target,digest,true)
  await original069(db);assertEmployeeUi078Snapshot(snapshot,expected);return Object.freeze({catalog_sha256:digest,ledger_sha256:employeeUi078CatalogDigest(rows),rpc_oid:rpc[0].oid})
 }catch(error){failed=true;throw error}finally{try{if(begun)await db.query('ROLLBACK')}catch{destroy=true;if(!failed)fail('api_rollback_required')}finally{db.release(destroy)}}
}
/** Observe cleanup errors swallowed by a parent inspector, while forwarding
 * identical SQL, parameters, rows and actual login/connection identity. This
 * never supplies a replacement auditor or any positive catalog attestation. */
async function watchOriginalPool<T>(pool:SqlPool,run:(pool:SqlPool)=>Promise<T>):Promise<T>{
 let cleanupError:unknown,cleanupFailed=false
 const observed=Object.create(pool) as SqlPool
 Object.defineProperty(observed,'connect',{value:async function(){const db=await pool.connect();return {async query<Row>(sql:string,_params?:unknown[]){try{return await Reflect.apply(db.query,db,arguments) as {rows:Row[]}}catch(error){if(sql==='ROLLBACK'){cleanupError=error;cleanupFailed=true}throw error}},release(_destroy?:boolean){Reflect.apply(db.release,db,cleanupFailed?[true]:arguments)}}}})
 const value=await run(observed);if(cleanupFailed)throw cleanupError;return value
}
export async function verifyEmployeeUi078ApiPool(pool:SqlPool,snapshot:EmployeeUi078Snapshot,expected:string,target:CompleteProfileTarget){
 assertEmployeeUi078Snapshot(snapshot,expected)
 const before=await apiCatalog(pool,snapshot,expected,target)
 if(await watchOriginalPool(pool,inspectOptionalNativeHomeAuthoringSchema)!=='installed'||await watchOriginalPool(pool,inspectOptionalNativeAgentCatalogSchema)!=='installed'||await watchOriginalPool(pool,inspectOptionalOriginalHomeKnowledgeStatisticsSchema)!=='installed'||await watchOriginalPool(pool,inspectOptionalNativeMonitorInbox)!=='installed')fail('original070_073_audits_required')
 await watchOriginalPool(pool,auditModelConfigReceipt075After069)
 if(await watchOriginalPool(pool,inspectOriginalSchedulesSchema)!==true)fail('original078_audit_required')
 // New transaction: do not mistake an old repeatable-read snapshot for a
 // fresh observation after every original independent inspector completed.
 const after=await apiCatalog(pool,snapshot,expected,target)
 if(before.catalog_sha256!==after.catalog_sha256||before.ledger_sha256!==after.ledger_sha256||before.rpc_oid!==after.rpc_oid)fail('catalog_changed_during_audits')
 return Object.freeze({profile:'complete069-employee-ui078',source_sha256:expected,target,catalog_sha256:after.catalog_sha256,whole_real_ledger_verified:true,actual_API_login_verified:true,actual_physical_target_verified:true,original069_and070_073_075_078_audits_verified:true,old_complete069_identifier_accepts_combination:false,Native_server_process_entry_verified:false,production_GO:false})
}
