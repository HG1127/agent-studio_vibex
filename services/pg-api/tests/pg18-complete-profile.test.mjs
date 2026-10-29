// Pure source and actual-function state models. They do not claim PostgreSQL
// installation, catalog verification, service activation or a 24h observation.
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import * as sources from '../src/pg18-complete-profile-source.mjs'
import {parseCompleteProfileArguments,runCompleteProfile,completeProfileRefusalCode} from '../src/baota-pg18-complete-init.mjs'
import {serviceLogins} from '../src/pg18-service-login-policy.mjs'

const source=fileURLToPath(new URL('../src/pg18-complete-profile.ts',import.meta.url)),cli=fileURLToPath(new URL('../src/baota-pg18-complete-init.mjs',import.meta.url)),root=fileURLToPath(new URL('../../../',import.meta.url)),text=fs.readFileSync(source,'utf8'),cliText=fs.readFileSync(cli,'utf8'),hash=x=>createHash('sha256').update(x).digest('hex'),snapshot=await sources.captureCompleteProfileSources(),expected=snapshot.source_sha256
test('complete closure includes its independent loader declarations and original initializer before admission',()=>{
 for(const name of ['pg18-complete-operator-runtime.mjs','pg18-complete-operator-runtime.d.mts','baota-pg18-fresh-init.mjs'])assert.ok(snapshot.manifest.sources.some(r=>r.path==='services/pg-api/src/'+name))
 assert.ok(snapshot.manifest.imports.some(e=>e.from==='services/pg-api/src/baota-pg18-complete-init.mjs'&&e.to==='services/pg-api/src/pg18-complete-operator-runtime.mjs'))
})
test('refusal diagnostics expose only closed predecessor codes and SQLSTATE, never driver message or credentials',()=>{
 assert.equal(completeProfileRefusalCode(Error('external_secret_file_required')),'complete067_predecessor_external_secret_file_required')
 assert.equal(completeProfileRefusalCode(Object.assign(Error('secret SQL password body'),{code:'42P01'})),'complete067_sqlstate_42P01')
 assert.equal(completeProfileRefusalCode(Error('password=private SQL text')),'complete067_operation_refused')
 assert.equal(completeProfileRefusalCode(Object.defineProperty({},'message',{get(){throw Error('must not invoke')}})),'complete067_operation_refused')
})
function functionText(body,name){const tree=ts.createSourceFile('x.ts',body,ts.ScriptTarget.Latest,true),node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(tree)}
function load(body,globals){const ctx=vm.createContext({exports:{},...globals});vm.runInContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,ctx);return ctx}
const target={system_identifier:'7000000000000000001',database_oid:'81'},validTarget={...target,database:'agent_studio',login:'postgres',actor:'postgres',host:'127.0.0.1',port:5333,version:180006,primary:true,super:true,pid:71,backend_start:'2026-10-29 06:00:00+00'},fakeSnapshot={source_sha256:'a'.repeat(64),fresh:{source_sha256:'b'.repeat(64)},roles:['agentstudio_api','agentstudio_extra','agentstudio_stage_login'].sort(),tables:['agentstudio.business','agentstudio.schema_migrations'].sort(),versions:['pg_v9_001','pg_v9_050','pg_v9_051','pg_v9_067'],steps:[{version:'pg_v9_051',sql:'actual_step_051'},{version:'pg_v9_067',sql:'actual_step_067'}]}
function coreModel(options={}){
 const trace=[],state={mode:options.mode??'installed',ledger:options.ledger??'complete',unsafe:options.unsafe??false},audits=[]
 let sourceChecks=0,baseline=0,released=0,apiReleases=0,targetReads=0
 const freshReceipt=()=> 'original050_receipt',receipt=()=> 'complete067_receipt'
 const db={async query(sql,values=[]){trace.push(sql)
  if(sql.startsWith('SELECT current_database()')){targetReads++;return {rows:[{...validTarget,...options.target,...(options.changedTarget&&targetReads>1?{system_identifier:'7000000000000000002'}:{})}]}}
  if(sql.startsWith('SELECT pg_try_advisory'))return {rows:[{locked:options.busy!==true}]}
  if(sql.startsWith('SELECT to_regnamespace'))return {rows:[{schema:state.mode!=='empty',auth:state.mode!=='empty'}]}
  if(sql.startsWith('SELECT NOT EXISTS(SELECT 1 FROM pg_class'))return {rows:[{empty:!options.foreign}]}
  if(sql==='SELECT version,description FROM agentstudio.schema_migrations ORDER BY version'){
   if(options.ledgerError)throw Error('relation_missing')
   const versions=state.ledger==='050'?['pg_v9_001','pg_v9_050','pg18_fresh_runtime_001']:state.ledger==='068'?[...fakeSnapshot.versions,'pg_v9_068','pg18_fresh_runtime_001',sources.completeProfileReceipt]:[...fakeSnapshot.versions,'pg18_fresh_runtime_001',sources.completeProfileReceipt]
   return {rows:versions.sort().filter(v=>!options.missingReceipt||v!==sources.completeProfileReceipt).map(version=>({version,description:version==='pg18_fresh_runtime_001'?freshReceipt():version===sources.completeProfileReceipt?receipt():'source_migration'}))}
  }
  if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM pg_extension'))return {rows:[{ok:!options.badExtension}]}
  if(sql.startsWith("SELECT n.nspname||'.'||c.relname"))return {rows:fakeSnapshot.tables.map(name=>({name,enabled:name!=='agentstudio.schema_migrations',forced:name!=='agentstudio.schema_migrations'&&!options.badRls}))}
  if(sql.startsWith('SELECT rolname AS name'))return {rows:fakeSnapshot.roles.map(name=>({name,login:options.apiLogin===true&&name==='agentstudio_stage_login',safe:!state.unsafe}))}
  if(sql.startsWith('SELECT count(*)::integer AS count FROM pg_roles'))return {rows:[{count:options.collision?1:0}]}
  if(fakeSnapshot.steps.some(step=>step.sql===sql)){assert.equal(baseline,1);return {rows:[]}}
  if(sql.startsWith('INSERT INTO agentstudio.schema_migrations')){assert.equal(values[0],sources.completeProfileReceipt);assert.equal(values[1],receipt());state.mode='installed';state.ledger='complete';return {rows:[]}}
  if(sql.startsWith('SELECT NOT EXISTS(SELECT 1 FROM "'))return {rows:[{empty:!options.nonempty}]}
  if(sql.startsWith('BEGIN')||sql.startsWith('SET LOCAL')||sql==='ROLLBACK')return {rows:[]}
  throw Error('unexpected model SQL '+sql)
 },release(){released++}}
 const apiDb={async query(sql){audits.push(sql);if(sql.startsWith('SELECT session_user'))return {rows:[{login:options.badApi?'postgres':'agentstudio_stage_login',actor:options.badApi?'postgres':'agentstudio_stage_login',database:'agent_studio',database_oid:'81',host:'127.0.0.1',port:5333,version:180006,safe:true}]};return {rows:[]}},release(){apiReleases++}}
 const imported={assertCompleteProfileSnapshot(s,d){sourceChecks++;assert.equal(s,fakeSnapshot);assert.equal(d,s.source_sha256)},completeProfileName:sources.completeProfileName,completeProfileReceipt:sources.completeProfileReceipt,completeProfileReceiptBody:receipt,freshRuntimeReceiptBody:freshReceipt,checkedServiceLoginReceipt(){throw Error('foreign service receipt')},serviceLogins,async installFreshRuntime(_db,s){assert.equal(_db,db);assert.equal(s,fakeSnapshot.fresh);baseline++;trace.push('ORIGINAL_050_INSTALL_AND_AUDIT')},async verifyApprovalDelegationCredentials(_db){assert.equal(_db,apiDb);audits.push('REAL_066_CHAIN_ENTRY');if(options.auditThrows)throw Error('auditor_failed');return options.auditFalse!==true},async verifyNativeLocalDeviceSchema(_db){assert.equal(_db,apiDb);audits.push('REAL_067_DEVICE_CHAIN_ENTRY');if(options.localAuditThrows)throw Error('local_auditor_failed');return options.localAuditFalse!==true}}
 const tree=ts.createSourceFile('core.ts',text,ts.ScriptTarget.Latest,true),body=tree.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(tree)).join('\n'),ctx=load(body,imported)
 return {api:ctx.exports,admin:{async connect(){return db}},apiPool:{async connect(){return apiDb}},db,trace,state,audits,sourceChecks:()=>sourceChecks,baseline:()=>baseline,released:()=>released,apiReleases:()=>apiReleases}
}

test('complete067 is explicit; no implicit profile, existing upgrade, retarget or argument aliases',()=>{
 assert.equal(parseCompleteProfileArguments(['--plan','--profile','complete067']).mode,'plan')
 const good=['--install','--profile','complete067','--confirm-empty-database','agent_studio','--expected-source-sha256',expected];assert.equal(parseCompleteProfileArguments(good).mode,'install')
 for(const argv of [[],['--plan'],['--plan','--profile','complete068'],[...good,'--force'],good.map(x=>x==='agent_studio'?'production':x),good.map(x=>x==='--confirm-empty-database'?'--confirm-database':x)])assert.throws(()=>parseCompleteProfileArguments(argv),/invalid_arguments/)
})
test('plan is executable and reads no environment or PG driver, secret, subprocess or network',async()=>{
 const env=new Proxy({}, {get(){throw Error('environment read')},ownKeys(){throw Error('environment inspected')}}),plan=await runCompleteProfile(['--plan','--profile','complete067'],env)
 assert.equal(plan.sql_sources.length,51);assert.equal(plan.latest_migration,'pg_v9_067');assert.equal(plan.default_fresh_latest,'pg_v9_050');assert.equal(plan.network_used,false);assert.equal(plan.secret_read,false);assert.equal(plan.writes_performed,false);assert.equal(plan.production_cutover_allowed,false);assert.equal(plan.source_sha256,expected)
 assert.equal(plan.predecessors.generated,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb');assert.equal(plan.predecessors.descriptive,'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67')
})
test('snapshot is private and deeply frozen; copied snapshots, wrong expected digests and arbitrary SQL are rejected',()=>{
 assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot.steps[0]),true);assert.equal(Object.isFrozen(snapshot.manifest.sources),true);sources.assertCompleteProfileSnapshot(snapshot,expected)
 assert.throws(()=>sources.assertCompleteProfileSnapshot({...snapshot},expected),/source_refused/);assert.throws(()=>sources.assertCompleteProfileSnapshot(snapshot,'0'.repeat(64)),/source_refused/)
 const pin=sources.completeProfileSqlPins.at(-1),raw=fs.readFileSync(root+pin.path);assert.throws(()=>sources.completeProfileSqlBody(pin.path,Buffer.concat([raw,Buffer.from('-- changed')])),/source_refused/);assert.throws(()=>sources.completeProfileSqlBody('db/postgres/unreviewed.sql',raw),/source_refused/)
})
test('all seventeen additions retain every SQL function-body byte while removing only the two outer transaction lines',()=>{
 assert.equal(snapshot.steps.length,17)
 for(const [i,step]of snapshot.steps.entries()){assert.equal(step.version,'pg_v9_'+String(i+51).padStart(3,'0'));const raw=fs.readFileSync(root+step.path),original=raw.toString('utf8'),expectedBody=original.replace(/^BEGIN;\r?\n/m,'').replace(/^COMMIT;(?:\r?\n|$)/m,'');assert.equal(step.sql,expectedBody);assert.equal(sources.completeProfileSqlBody(step.path,raw),expectedBody);assert.ok(snapshot.manifest.sql_sources.some(p=>p.path===step.path&&p.sha256===hash(raw)))}
 assert.equal(snapshot.steps.find(s=>s.version==='pg_v9_059').sql,snapshot.generated.body);assert.equal(snapshot.steps.find(s=>s.version==='pg_v9_060').sql,snapshot.descriptive.body)
})
test('read-only classification refuses 050, unexpected068, missing receipts, unsafe roles, changed RLS and foreign empty schemas',async()=>{
 for(const option of [{ledger:'050'},{ledger:'068'},{missingReceipt:true},{unsafe:true},{badRls:true},{badExtension:true},{mode:'empty',foreign:true}]){const m=coreModel(option),r=await m.api.inspectCompleteProfile(m.admin,fakeSnapshot,fakeSnapshot.source_sha256);assert.equal(r.state,'incomplete_or_foreign');assert.equal(r.structure_and_receipt_verified,false);assert.equal(m.baseline(),0);assert.ok(m.trace.includes('ROLLBACK'));assert.equal(m.trace.some(s=>/^(?:ALTER|INSERT|CREATE|DROP|COMMIT)/.test(s)),false)}
 const pending=coreModel({busy:true}),r=await pending.api.inspectCompleteProfile(pending.admin,fakeSnapshot,fakeSnapshot.source_sha256);assert.equal(r.state,'pending');assert.equal(pending.trace.some(s=>s.startsWith('SELECT version')),false)
 const absent=coreModel({ledgerError:true});await assert.rejects(absent.api.inspectCompleteProfile(absent.admin,fakeSnapshot,fakeSnapshot.source_sha256),/relation_missing/)
})
test('one original050 installer/auditor precedes additions; core never owns COMMIT, rollback or a second transaction',async()=>{
 const m=coreModel({mode:'empty'}),r=await m.api.installCompleteProfile(m.db,fakeSnapshot,fakeSnapshot.source_sha256,target)
 assert.equal(m.baseline(),1);assert.ok(m.trace.indexOf('ORIGINAL_050_INSTALL_AND_AUDIT')<m.trace.indexOf(fakeSnapshot.steps[0].sql));assert.equal(m.trace.filter(s=>fakeSnapshot.steps.some(step=>step.sql===s)).length,2);assert.equal(m.trace.some(s=>/^(?:BEGIN|COMMIT|ROLLBACK)/.test(s)),false);assert.equal(r.actual_login_audit_required,true);assert.equal(r.service_logins_enabled,false);assert.equal(r.services_started,false);assert.equal(r.production_cutover_allowed,false);assert.ok(m.sourceChecks()>=4)
 for(const option of [{collision:true},{target:{port:5432}},{target:{login:'agentstudio_admin'}},{changedTarget:true},{nonempty:true}]){const bad=coreModel({mode:'empty',...option});await assert.rejects(bad.api.installCompleteProfile(bad.db,fakeSnapshot,fakeSnapshot.source_sha256,target),/complete067_/);assert.equal(bad.trace.includes('COMMIT'),false);assert.equal(bad.trace.includes('ROLLBACK'),false)}
})
test('full audit needs a separate actual API LOGIN; admin identity, false auditor and thrown auditor cannot become verified',async()=>{
 const m=coreModel({apiLogin:true}),r=await m.api.verifyCompleteProfile(m.admin,m.apiPool,fakeSnapshot,fakeSnapshot.source_sha256);assert.equal(r.full_catalog_audit_verified,true);assert.equal(r.actual_api_login_verified,true);assert.equal(r.production_cutover_allowed,false);assert.ok(m.audits.indexOf('SET LOCAL ROLE agentstudio_api')<m.audits.indexOf('REAL_066_CHAIN_ENTRY'));assert.equal(m.trace.includes('REAL_066_CHAIN_ENTRY'),false);assert.ok(m.audits.indexOf('REAL_066_CHAIN_ENTRY')<m.audits.indexOf('REAL_067_DEVICE_CHAIN_ENTRY'));assert.equal(m.apiReleases(),1)
 for(const option of [{badApi:true},{auditFalse:true},{auditThrows:true},{localAuditFalse:true},{localAuditThrows:true}]){const bad=coreModel(option);await assert.rejects(bad.api.verifyCompleteProfile(bad.admin,bad.apiPool,fakeSnapshot,fakeSnapshot.source_sha256));assert.equal(bad.apiReleases(),1);assert.ok(bad.audits.includes('ROLLBACK'));if(option.badApi)assert.equal(bad.audits.includes('REAL_066_CHAIN_ENTRY'),false)}
})

function parentModel(before,after,child={exit_code:null,exceeded:true,committed:null}){
 let inspections=0,children=0,ends=0,secretReads=0
 const core={async inspectCompleteProfile(_admin,s,d,bound){assert.equal(s,fakeSnapshot);assert.equal(d,s.source_sha256);inspections++;if(inspections===1)return before;assert.equal(bound,before.target);return after}}
 const body=['parseCompleteProfileArguments','poolOptions','runCompleteProfile'].map(name=>functionText(cliText,name)).join('\n'),globals={completeProfileName:'complete067',fail:code=>{throw Error('complete067_'+code)},digest:v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),captureCompleteProfileSources:async()=>fakeSnapshot,assertCompleteProfileSnapshot:()=>{},completeProfilePlan:()=>{},host:()=>{},dependencies:async()=>({pg:{Pool:class{on(){}async end(){ends++}}},boundary:()=>{}}),installChild:async(d,bound)=>{children++;assert.equal(d,fakeSnapshot.source_sha256);assert.equal(bound,before.target);return child},process:{env:{}},require(name){if(name==='./pg18-complete-profile.ts')return core;if(name==='./native-activation-cli.mjs')return {readPg18OperatorSecret(){secretReads++;return {password:'admin-secret',device:1,inode:2}}};throw Error('unexpected import '+name)}}
 const ctx=load(body,globals),argv=['--install','--profile','complete067','--confirm-empty-database','agent_studio','--expected-source-sha256',fakeSnapshot.source_sha256]
 return {run:()=>ctx.exports.runCompleteProfile(argv,{}),children:()=>children,inspections:()=>inspections,ends:()=>ends,secretReads:()=>secretReads}
}
const observed=(state,verified=false)=>({state,target,structure_and_receipt_verified:verified,source_sha256:fakeSnapshot.source_sha256,production_cutover_allowed:false})
test('lost ACK, timeout and pending physical state never replay DDL or turn physical receipt into this invocation commit proof',async()=>{
 for(const after of [observed('empty'),observed('pending'),observed('schema_installed_inert',true)]){const m=parentModel(observed('empty'),after),r=await m.run();assert.equal(m.children(),1);assert.equal(m.inspections(),2);assert.equal(m.ends(),1);assert.equal(r.commit_unknown,true);assert.equal(r.invocation_commit_acknowledged,false);assert.equal(r.cleanup_performed,false);assert.equal(r.actual_login_audit_required,true);assert.equal(r.production_cutover_allowed,false)}
 const existing=parentModel(observed('schema_installed_inert',true));const r=await existing.run();assert.equal(existing.children(),0);assert.equal(r.already_installed,true);assert.equal(r.writes_performed,false);assert.equal(r.invocation_commit_acknowledged,false)
 for(const state of ['pending','incomplete_or_foreign']){const m=parentModel(observed(state));await assert.rejects(m.run(),/complete067_/);assert.equal(m.children(),0);assert.equal(m.ends(),1)}
})
test('only matching own child ACK plus durable postflight can acknowledge this invocation',async()=>{
 const ack={exit_code:0,exceeded:false,committed:target},m=parentModel(observed('empty'),observed('schema_installed_inert',true),ack),r=await m.run();assert.equal(r.invocation_commit_acknowledged,true);assert.equal(r.commit_unknown,false)
 const changed=parentModel(observed('empty'),observed('schema_installed_inert',true),{...ack,committed:{...target,database_oid:'82'}});assert.equal((await changed.run()).commit_unknown,true)
 const missing=parentModel(observed('empty'),observed('empty'),ack);await assert.rejects(missing.run(),/durable_postflight_failed/);assert.equal(missing.children(),1)
})
test('child commit projection rejects extra fields and unsafe target identifiers; only fixed three-field message survives',()=>{
 const body=functionText(cliText,'acceptedCommitMessage'),ctx=load(body,{own:value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype});vm.runInContext('globalThis.project=acceptedCommitMessage',ctx)
 const valid={kind:'complete067_committed',source_sha256:expected,target}
 assert.equal(ctx.project(valid,expected).database_oid,target.database_oid)
 for(const value of [{...valid,pid:71},{...valid,source_sha256:'0'.repeat(64)},{...valid,target:{...target,role:'postgres'}},{...valid,target:{...target,database_oid:'0'}},{...valid,kind:'complete068_committed'}])assert.equal(ctx.project(value,expected),null)
})

test('reviewed SQL pin records and accepted raw-byte variants are deeply immutable before any capture',()=>{
 for(const pin of sources.completeProfileSqlPins){assert.equal(Object.isFrozen(pin),true);assert.equal(Object.isFrozen(pin.accepted_sha256s),true);assert.throws(()=>{pin.path='db/postgres/foreign.sql'},TypeError);assert.throws(()=>pin.accepted_sha256s.push('0'.repeat(64)),TypeError)}
 assert.equal(sources.completeProfileSqlPins.at(-1).path,'db/postgres/migrations/pg_v9_067_native_local_devices.sql')
})
