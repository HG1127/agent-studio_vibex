// Independently named employee UI combination. No old profile is relabeled.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {captureCompleteProfileSources,assertCompleteProfileSnapshot,assertCompleteProfileDeployment,completeProfileReceiptBody} from './pg18-complete-profile-source.mjs'
import {employeeUi078LiteralLedger,employeeUi078FunctionSignatures,employeeUi078Canonical} from './pg18-employee-ui078-catalog.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),captured=new WeakSet(),sha=b=>createHash('sha256').update(b).digest('hex'),fail=()=>{throw Error('employee_ui078_source_refused')}
export const employeeUi078Profile='complete069-employee-ui078',employeeUi078Receipt='pg18_complete069_employee_ui078_001',employeeUi078CatalogReceipt='pg18_employee_ui078_catalog_001'
export const employeeUi078SqlPins=Object.freeze([
 {path:'db/postgres/migrations/pg_v9_070_home_authoring.sql',version:'pg_v9_070',sha256:'f4b37261c7164aaa58257b7b357eef0047cb3f82fb11364ae14aea7d9874cd69'},
 {path:'db/postgres/migrations/pg_v9_071_agent_catalog.sql',version:'pg_v9_071',sha256:'5ede3c83171fe277935398f09a87a6f27744ec6d4269a2a5494929c24548bad1'},
 {path:'db/postgres/migrations/pg_v9_072_home_knowledge_statistics.sql',version:'pg_v9_072',sha256:'bba0d5264ea95bc783d6df35741a97a32a7deb8d51c613f70864ff7e88f23abd'},
 {path:'db/postgres/migrations/pg_v9_073_monitor_inbox.sql',version:'pg_v9_073',sha256:'ba25340ea909384e46d25ab530f062c93bed9bbbb2d3edf3ebc22c2b12b664db'},
 {path:'db/postgres/migrations/pg_v9_075_model_config_write_receipts.sql',version:'pg_v9_075',sha256:'8237a97196a43d47dbf190414f9a516d8859eb16a755f21875b70748949123f0'},
 {path:'db/postgres/migrations/pg_v9_078_original_schedule_contract.sql',version:'pg_v9_078',sha256:'4e4c5292e2b1c37f142b6b6a6c982acfc5463930523138118b2f9102f5f95e4d'},
 {path:'db/postgres/profiles/employee_ui078_catalog_ledger.sql',version:employeeUi078CatalogReceipt,sha256:'c780c38a35e18a88b51c0fd982bf40d70db76e8c5c1877545cb13e1df8bd6fcc'},
].map(Object.freeze))
const freeze=v=>{if(v&&typeof v==='object'){for(const item of Object.values(v))freeze(item);Object.freeze(v)}return v}
function raw(relative){
 if(!/^db\/postgres\/[a-zA-Z0-9_./-]+$/.test(relative)||relative.split('/').some(v=>!v||v==='.'||v==='..'))fail()
 let file=root;for(const part of relative.split('/')){if(fs.lstatSync(file).isSymbolicLink())fail();file=path.join(file,part)}const before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>16*1024*1024||fs.realpathSync(file)!==file)fail();const bytes=fs.readFileSync(file),after=fs.lstatSync(file)
 if(bytes.length!==before.size||['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'].some(k=>before[k]!==after[k])||bytes.includes(0)||bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf||!Buffer.from(bytes.toString('utf8')).equals(bytes))fail();return bytes
}
export function employeeUi078SqlBody(relative,bytes){
 const pin=employeeUi078SqlPins.find(p=>p.path===relative);if(!pin||!Buffer.isBuffer(bytes)||sha(bytes)!==pin.sha256)fail()
 let text=bytes.toString('utf8');const commands=text.match(/^\s*\\[^\r\n]*/gm)??[]
 if(pin.version==='pg_v9_078'){if(commands.length!==1||commands[0].trim()!=='\\set ON_ERROR_STOP on')fail();text=text.replace(/^\\set ON_ERROR_STOP on\r?\n/m,'')}else if(commands.length)fail()
 const begins=[...text.matchAll(/^BEGIN;\r?\n/gm)],ends=[...text.matchAll(/^COMMIT;(?:\r?\n|$)/gm)]
 if(begins.length!==1||ends.length!==1||begins[0].index>=ends[0].index||!/^\s*$/.test(text.slice(ends[0].index+ends[0][0].length))||/^\s*\\/m.test(text))fail()
 return text.slice(0,begins[0].index)+text.slice(begins[0].index+begins[0][0].length,ends[0].index)+text.slice(ends[0].index+ends[0][0].length)
}
export async function captureEmployeeUi078Sources(){
 const base=await captureCompleteProfileSources();assertCompleteProfileSnapshot(base,base.source_sha256)
 if(base.manifest.profile!=='complete069'||base.manifest.sql_sources.length!==53||base.manifest.latest_migration!=='pg_v9_069')fail()
 for(const file of ['baota-pg18-employee-ui078-init.mjs','pg18-employee-ui078-source.mjs','pg18-employee-ui078-source.d.mts','pg18-employee-ui078-catalog.mjs','pg18-employee-ui078-profile.ts','pg18-employee-ui078-audit.ts','native-employee-ui078-profile.ts'])if(!base.manifest.sources.some(v=>v.path==='services/pg-api/src/'+file))fail()
 const functions=new Set(),baseFunctions=new Set(),ledger=new Map(),steps=[],tables=new Set(base.tables)
 const all=[...base.manifest.sql_sources,...employeeUi078SqlPins]
 for(const [i,pin]of all.entries()){
  const bytes=raw(pin.path);if(sha(bytes)!==pin.sha256)fail();const text=bytes.toString('utf8'),decl=employeeUi078FunctionSignatures(text),count=[...text.matchAll(/\b(?:CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?agentstudio(?:_auth)?\./gi)].length
  if(count!==decl.length)fail();for(const f of decl){if(f.action==='create')functions.add(f.signature);else functions.delete(f.signature)}
  for(const row of employeeUi078LiteralLedger(text)){if(ledger.has(row.version)&&ledger.get(row.version)!==row.description)fail();ledger.set(row.version,row.description)}
  if(i===52)for(const f of functions)baseFunctions.add(f)
  if(i>=53){for(const m of text.matchAll(/\bCREATE TABLE(?: IF NOT EXISTS)?\s+(agentstudio(?:_auth)?\.[a-z_][a-z_0-9]*)/g))tables.add(m[1]);steps.push({...pin,sql:employeeUi078SqlBody(pin.path,bytes)})}
 }
 const versions=[...base.versions,...employeeUi078SqlPins.map(p=>p.version)].sort();if(employeeUi078Canonical([...ledger.keys()].sort())!==employeeUi078Canonical(versions))fail()
 const rpc=steps.at(-1).sql.match(/AS \$ledger\$([\s\S]*?)\$ledger\$;/);if(!rpc)fail()
 const manifest={profile:employeeUi078Profile,base_profile:'complete069',base_source_sha256:base.source_sha256,base_manifest:base.manifest,extension_sql_sources:employeeUi078SqlPins,extension_order:employeeUi078SqlPins.map(p=>p.version),excluded_optional_versions:['pg_v9_074','pg_v9_076','pg_v9_077'],default_profile_changed:false,old_current_identifier_accepts_combination:false,prepared_disposable_empty_business_required:true,metadata_interface:{signature:'agentstudio.employee_ui078_catalog_ledger()',body_sha256:sha(rpc[1]),scope:'actual physical target and whole real ledger only; no business rows or old table column grants'},all_function_signatures:[...functions].sort()}
 const snapshot=freeze({base,manifest,source_sha256:sha(employeeUi078Canonical(manifest)),steps,tables:[...tables].sort(),roles:[...base.roles,'agentstudio_original_schedules'].sort(),versions,literal_ledger:[...ledger].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([version,description])=>({version,description})),base_functions:[...baseFunctions].sort(),functions:[...functions].sort(),ledger_rpc_body_sha256:sha(rpc[1])});captured.add(snapshot);return snapshot
}
export function assertEmployeeUi078Snapshot(snapshot,expected){
 if(!captured.has(snapshot)||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||snapshot.source_sha256!==expected||sha(employeeUi078Canonical(snapshot.manifest))!==expected)fail()
 assertCompleteProfileSnapshot(snapshot.base,snapshot.base.source_sha256);for(const pin of employeeUi078SqlPins)if(sha(raw(pin.path))!==pin.sha256)fail()
}
export function assertEmployeeUi078Deployment(snapshot,expected){
 assertEmployeeUi078Snapshot(snapshot,expected);assertCompleteProfileDeployment(snapshot.base,snapshot.base.source_sha256)
 for(const pin of employeeUi078SqlPins){let file=path.join(root,pin.path);for(;;){const st=fs.lstatSync(file);if(st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o022)!==0)fail();const parent=path.dirname(file);if(parent===file)break;file=parent}}
}
export function employeeUi078ReceiptBody(snapshot,target,catalogSha256){
 assertEmployeeUi078Snapshot(snapshot,snapshot.source_sha256)
 if(!target||Object.keys(target).sort().join(',')!=='database_oid,system_identifier'||!Object.values(target).every(v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v))||typeof catalogSha256!=='string'||!/^[a-f0-9]{64}$/.test(catalogSha256))fail()
 return employeeUi078Canonical({profile:employeeUi078Profile,source_sha256:snapshot.source_sha256,base_source_sha256:snapshot.base.source_sha256,base_receipt_sha256:sha(completeProfileReceiptBody(snapshot.base)),extension_sql_sources:employeeUi078SqlPins,target,catalog_sha256:catalogSha256,legacy_rows_copied:0})
}
export function employeeUi078Plan(snapshot){
 assertEmployeeUi078Snapshot(snapshot,snapshot.source_sha256)
 return freeze({mode:'plan',...snapshot.manifest,source_sha256:snapshot.source_sha256,base_sql_count:53,extension_sql_count:7,tables:snapshot.tables,roles:snapshot.roles,versions:[...snapshot.versions,'pg18_fresh_runtime_001','pg18_complete_069_001',employeeUi078Receipt].sort(),required_preparation_before_extensions:['api','native-auth','first-admin','every separately selected original Worker/service account'],existing_company_upgrade_supported:false,default050_059_060_and_original53_SQL_unchanged:true,actual_login_audit_required:true,Native_server_process_entry_verified:false,full_catalog_runtime_verified:false,services_started:false,SQL_executed:false,network_used:false,secret_read:false,provider_calls:0,production_GO:false})
}
