import {hostedQuality089Phase,hostedQuality089Sync,hostedQuality089InventoryRefusal} from './hosted-profile-diagnostic.mjs'

import {employeeQuality089Profile,employeeQuality089Receipt,employeeQuality089Migration,quality089ReceiptBody,quality089Target,assertQuality089CatalogDelta} from './employee-quality089-contract.mjs'
import {assertEmployeeQuality089Snapshot} from './employee-quality089-source.mjs'
import {employeeUi078CatalogSql,employeeUi078CatalogDigest,employeeUi078Canonical as canonical,employeeUi078LedgerRpcSql,employeeUi078LedgerRpcAuditSql,employeeUi078FunctionOidsSql} from './pg18-employee-ui078-catalog.mjs'
import {employeeUi078Receipt,employeeUi078ReceiptBody} from './pg18-employee-ui078-source.mjs'
import {verifyEmployeeUi078Profile} from './pg18-employee-ui078-profile.ts'
import {inspectAgentReleaseSchema} from './agent-release-audit.ts'
import {completeServiceTarget} from './pg18-complete-service-core.mjs'
import {completeProfileLocksSql} from './pg18-complete-profile.ts'
import {completeProfileReceipt,completeProfileReceiptBody} from './pg18-complete-profile-source.mjs'
import {freshRuntimeReceiptBody} from './pg18-fresh-runtime-install.ts'
import {checkedServiceLoginReceipt,serviceLogins} from './pg18-service-login-policy.mjs'
import {verifyOriginalQuality089Schema} from './original-quality089-audit.ts'
import {originalQuality089Profile} from './original-quality089-profile.mjs'
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
import {createHash} from 'node:crypto'
const fail=code=>{try{hostedQuality089InventoryRefusal(code)}catch{}throw Error('employee_quality089_'+code)},sha=s=>createHash('sha256').update(s).digest('hex')
async function catalog(db){const r=(await db.query(employeeUi078CatalogSql)).rows;if(r.length!==1||!r[0]?.catalog)fail('catalog_shape');return r[0].catalog}
async function inventory(db,s,context){
 const names=(await db.query("SELECT n.nspname||'.'||c.relname AS name,c.relkind::text AS kind,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f','S') ORDER BY n.nspname COLLATE \"C\",c.relname COLLATE \"C\"")).rows
 if(names.length!==s.tables.length||names.some((v,i)=>v.name!==s.tables[i]||v.kind!=='r'||(v.name==='agentstudio.schema_migrations'?(v.enabled||v.forced):(!v.enabled||!v.forced))))fail('whole_table_inventory')
 const wanted=[...s.parent.functions,...originalQuality089Profile.newFunctions.map(f=>'agentstudio.'+f)].sort(),resolved=(await db.query(employeeUi078FunctionOidsSql,[wanted])).rows
 if(resolved.length!==wanted.length||resolved.some((v,i)=>v.signature!==wanted[i]||!/^[1-9][0-9]*$/.test(v.oid))||new Set(resolved.map(v=>v.oid)).size!==wanted.length)fail('function_resolution')
 const actual=(await db.query("SELECT p.oid::text AS oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')")).rows
 if(actual.length!==wanted.length||actual.some(v=>!resolved.some(r=>r.oid===v.oid)))fail('whole_function_inventory')
 const allowed=new Set(['agentstudio_native_login',...Object.values(serviceLogins).map(v=>v.login)]),roles=(await db.query("SELECT rolname AS name,rolcanlogin AS login,NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL AND rolvaliduntil IS NULL AND rolconnlimit=-1 AS safe FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_')")).rows
 if(s.roles.some(n=>!roles.some(r=>r.name===n))||roles.some(r=>!r.safe||(!s.roles.includes(r.name)&&!allowed.has(r.name))||r.login&&!allowed.has(r.name)||!s.roles.includes(r.name)&&!r.login))fail('whole_role_inventory')
 const shadows=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('agentstudio','agentstudio_auth') AND c.relname=ANY($1::text[])) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('agentstudio','agentstudio_auth') AND p.proname=ANY($2::text[])) AS absent",[s.tables.map(n=>n.split('.')[1]),wanted.map(n=>n.split('.')[1].split('(')[0])])).rows
 if(shadows.length!==1||shadows[0].absent!==true)fail('foreign_shadow')
 const global=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE NOT starts_with(rolname,'pg_') AND NOT starts_with(rolname,'agentstudio_') AND rolname<>'postgres') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN('information_schema','public','agentstudio','agentstudio_auth')) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN('information_schema','agentstudio','agentstudio_auth') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_catalog.pg_extension'::regclass AND d.deptype='e' AND e.extname='vector' AND e.extversion='0.8.7')) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN('information_schema','agentstudio','agentstudio_auth') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.objid=p.oid AND d.refclassid='pg_catalog.pg_extension'::regclass AND d.deptype='e' AND e.extname='vector' AND e.extversion='0.8.7')) AS closed")).rows
 if(global.length!==1||global[0].closed!==true)fail('global_inventory')
 if(context==='api')await verifyOriginalQuality089Schema(db);else if(context!=='admin')fail('catalog_context')
}
export function assertEmployeeQuality089Ledger(rows,s,target,parentCatalog,digest){
 const expected=new Map(s.parent.literal_ledger.map(r=>[r.version,r.description]))
 expected.set('pg18_fresh_runtime_001',freshRuntimeReceiptBody(s.parent.base.fresh));expected.set(completeProfileReceipt,completeProfileReceiptBody(s.parent.base));expected.set(employeeUi078Receipt,employeeUi078ReceiptBody(s.parent,target,parentCatalog))
 expected.set(employeeQuality089Migration.version,employeeQuality089Migration.description);expected.set(employeeQuality089Receipt,quality089ReceiptBody(s,target,parentCatalog,digest))
 for(const r of rows)if(typeof r?.version==='string'&&r.version.startsWith('pg18_service_login_')){checkedServiceLoginReceipt(r.version,r.description,s.parent.base.fresh.source_sha256);if(expected.has(r.version))fail('ledger_duplicate');expected.set(r.version,r.description)}
 const want=[...expected].sort(([a],[b])=>a<b?-1:a>b?1:0)
 if(rows.length!==want.length||rows.some((v,i)=>Object.keys(v).sort().join(',')!=='description,version'||v.version!==want[i][0]||v.description!==want[i][1]))fail('whole_ledger')
}
async function auditApi(pool,s,target){return await hostedQuality089Phase('audit_body',async()=>{
 const db=await hostedQuality089Phase('audit_01',()=>pool.connect());let begun=false,discard=false,auditFailed=false
 try{await hostedQuality089Phase('audit_02',()=>db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));begun=true;await hostedQuality089Phase('audit_03',()=>db.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='45s'; SET LOCAL lock_timeout='5s'"))
 const login=(await hostedQuality089Phase('audit_04',()=>db.query("SELECT session_user::text AS login,current_user::text AS actor,current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolcanlogin AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AND r.rolconnlimit=-1 AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1 AND EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid WHERE m.member=r.oid AND g.rolname='agentstudio_api' AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option) AS safe FROM pg_roles r WHERE r.rolname=session_user"))).rows
 if(login.length!==1||login[0].login!=='agentstudio_stage_login'||login[0].actor!==login[0].login||login[0].database!=='agent_studio'||login[0].host!=='127.0.0.1'||login[0].port!==5333||login[0].version<180000||login[0].version>=190000||login[0].safe!==true)fail('actual_api_login')
 await hostedQuality089Phase('audit_05',()=>db.query('SET LOCAL ROLE agentstudio_api'))
 const rpc=(await hostedQuality089Phase('audit_06',()=>db.query(employeeUi078LedgerRpcAuditSql))).rows
 if(rpc.length!==1||rpc[0].ok!==true||sha(rpc[0].source)!==s.parent.ledger_rpc_body_sha256)fail('actual_ledger_rpc')
 const all=(await hostedQuality089Phase('audit_07',()=>db.query(employeeUi078LedgerRpcSql))).rows;if(!all.length||all.some(r=>r.system_identifier!==target.system_identifier||r.database_oid!==target.database_oid))fail('physical_target')
 const receipt=all.find(r=>r.version===employeeQuality089Receipt);let body;try{body=JSON.parse(receipt.description)}catch{fail('receipt_missing')}
 const c=await hostedQuality089Phase('audit_08',()=>catalog(db)),digest=employeeUi078CatalogDigest(c);await hostedQuality089Phase('audit_09',()=>inventory(db,s,'api'))
 assertEmployeeQuality089Ledger(all.map(({version,description})=>({version,description})),s,target,body.parent_catalog_sha256,digest)
 for(const check of [verifyApprovalDelegationCredentials,verifyNativeLocalDeviceSchema,verifyAgentCallerCredentials,verifyOwnerToolTrialCredentials])if(await hostedQuality089Phase('audit_10',()=>check(db))!==true)fail('original069_semantic_audit')
 assertEmployeeQuality089Snapshot(s,s.source_sha256);return {digest,parentCatalog:body.parent_catalog_sha256,rpcOid:rpc[0].oid}
 }catch(error){auditFailed=true;if(!begun)discard=true;throw error}
 finally{if(begun)try{await hostedQuality089Phase('audit_11',()=>db.query('ROLLBACK'))}catch{discard=true}try{hostedQuality089Sync('audit_release',()=>db.release(discard))}catch{if(!auditFailed&&!discard)fail('api_release')}if(discard&&!auditFailed)fail('api_rollback')}
})}

async function watchRollback(pool,inspect){return await hostedQuality089Phase('inspect_body',async()=>{
 let failed=false,error;const observed=Object.create(pool)
 Object.defineProperty(observed,'connect',{value:async function(){const db=await hostedQuality089Phase('inspect_01',()=>pool.connect());return{async query(sql){try{return await hostedQuality089Phase(sql==='ROLLBACK'?'inspect_rollback':'inspect_02',()=>Reflect.apply(db.query,db,arguments))}catch(e){if(sql==='ROLLBACK'){failed=true;error=e}throw e}},release(){return hostedQuality089Sync('inspect_release',()=>Reflect.apply(db.release,db,failed?[true]:arguments))}}}})
 const result=await hostedQuality089Phase('inspect_03',()=>inspect(observed));if(failed)throw error;return result
})}

export async function verifyEmployeeQuality089ApiPool(pool,s,expected,target){return await hostedQuality089Phase('verify_body',async()=>{
 assertEmployeeQuality089Snapshot(s,expected);quality089Target(target);const before=await hostedQuality089Phase('verify_01',()=>auditApi(pool,s,target))
 for(const check of [inspectOptionalNativeHomeAuthoringSchema,inspectOptionalNativeAgentCatalogSchema,inspectOptionalOriginalHomeKnowledgeStatisticsSchema,inspectOptionalNativeMonitorInbox])if(await hostedQuality089Phase('verify_02',()=>watchRollback(pool,check))!=='installed')fail('parent_optional_audit')
 await hostedQuality089Phase('verify_03',()=>watchRollback(pool,auditModelConfigReceipt075After069));if(await hostedQuality089Phase('verify_04',()=>watchRollback(pool,inspectOriginalSchedulesSchema))!==true)fail('parent_schedule_audit')
 const after=await hostedQuality089Phase('verify_05',()=>auditApi(pool,s,target));if(canonical(before)!==canonical(after))fail('catalog_changed')
 return Object.freeze({profile:employeeQuality089Profile,source_sha256:expected,target,catalog_sha256:after.digest,actual_API_LOGIN:true,whole_catalog_and_ledger:true,original046_preinstall_and069_070_073_075_078_089_audits:true,old_profile_accepts089:false,Native_server_process_entry_verified:false,production_GO:false})
})}
export async function installEmployeeQuality089Profile(admin,api,s,expected,target){return await hostedQuality089Phase('install_body',async()=>{
 assertEmployeeQuality089Snapshot(s,expected);quality089Target(target)
 await hostedQuality089Phase('install_01',()=>verifyEmployeeUi078Profile(admin,api,s.parent,s.parent.source_sha256,target))
 if(await hostedQuality089Phase('install_02',()=>inspectAgentReleaseSchema(api))!==true)fail("original046_preinstall_semantic_audit")
 const db=await hostedQuality089Phase('install_03',()=>admin.connect());let begun=false,committed=false,discard=false,auditFailed=false
 try{await hostedQuality089Phase('install_04',()=>db.query('BEGIN'));begun=true;await hostedQuality089Phase('install_05',()=>db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'"));await hostedQuality089Phase('install_06',()=>completeServiceTarget(db,target))
 if((await hostedQuality089Phase('install_07',()=>db.query(completeProfileLocksSql))).rows[0]?.locked!==true)fail('schema_lock')
 for(const n of s.parent.tables)await hostedQuality089Phase('install_08',()=>db.query('LOCK TABLE '+n.split('.').map(x=>'"'+x+'"').join('.')+' IN SHARE ROW EXCLUSIVE MODE'))
 for(const n of s.parent.tables){if(['agentstudio.schema_migrations','agentstudio.users','agentstudio_auth.accounts'].includes(n))continue;if((await hostedQuality089Phase('install_09',()=>db.query('SELECT NOT EXISTS(SELECT 1 FROM '+n+') AS empty'))).rows[0]?.empty!==true)fail('empty_disposable_required')}
 const before=await hostedQuality089Phase('install_10',()=>catalog(db)),parentCatalog=employeeUi078CatalogDigest(before)
 const oldReceipt=(await hostedQuality089Phase('install_11',()=>db.query('SELECT description FROM agentstudio.schema_migrations WHERE version=$1',[employeeUi078Receipt]))).rows
 if(oldReceipt.length!==1||oldReceipt[0].description!==employeeUi078ReceiptBody(s.parent,target,parentCatalog))fail('parent_catalog_changed')
 assertEmployeeQuality089Snapshot(s,expected);await hostedQuality089Phase('install_12',()=>db.query(s.sql));await hostedQuality089Phase('install_13',()=>db.query('SET LOCAL search_path=pg_catalog'))
 await hostedQuality089Phase('install_14',()=>inventory(db,s,'admin'));const after=await hostedQuality089Phase('install_15',()=>catalog(db));assertQuality089CatalogDelta(before,after);const digest=employeeUi078CatalogDigest(after)
 const description=quality089ReceiptBody(s,target,parentCatalog,digest);await hostedQuality089Phase('install_16',()=>db.query('INSERT INTO agentstudio.schema_migrations(version,description) VALUES($1,$2)',[employeeQuality089Receipt,description]))
 assertEmployeeQuality089Ledger((await hostedQuality089Phase('install_17',()=>db.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version COLLATE "C"'))).rows,s,target,parentCatalog,digest)
 await hostedQuality089Phase('install_18',()=>completeServiceTarget(db,target));assertEmployeeQuality089Snapshot(s,expected);await hostedQuality089Phase('install_19',()=>db.query('COMMIT'));committed=true
 }catch(error){auditFailed=true;if(!begun)discard=true;throw error}
 finally{if(begun&&!committed)try{await hostedQuality089Phase('install_20',()=>db.query('ROLLBACK'))}catch{discard=true}try{hostedQuality089Sync('install_release',()=>db.release(discard))}catch{if(!auditFailed&&!discard)fail('install_release')}if(discard&&!auditFailed)fail('install_rollback')}
 return await hostedQuality089Phase('install_21',()=>verifyEmployeeQuality089ApiPool(api,s,expected,target))
})}
