// Literal catalog DATA and existing SqlClient transports only. No PG/Pool/runtime.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {monitor074Catalog} from './helpers/monitor074-catalog-data.mjs'
import {verifyMonitorLiveSchema,monitorLivePresenceSql} from '../src/native-monitor-live-audit.ts'
import {monitorLiveTables} from '../src/native-monitor-live-schema.ts'
import {ordinaryCaseTables} from '../src/native-ordinary-case-schema.ts'
import {checkedMonitorLiveSchemaProfile,monitorLiveIncomingSql,monitorLiveExtensionPresence,readMonitorLiveExtensionPresence} from '../src/native-monitor-schema-profile.ts'
import {NativeMonitorLiveRepository} from '../src/native-monitor-live-repository.ts'
import {requireMonitorOrdinaryProfileCi} from './helpers/monitor-ordinary-profile-ci-guard.mjs'

const profile='monitor074-ordinary077',row=()=>({constraint_oid:'800001',name:'ordinary_case_runs_fk3',source_schema:'agentstudio',source_table:'ordinary_case_runs',source_oid:'800002',owner_oid:'10',target_schema:'agentstudio',target_table:'monitor_live_cases',target_oid:'800003',target_owner_oid:'10',kind:'f',keys:[4,3],target_keys:[1,2],update_action:'a',delete_action:'a',match:'s',valid:true,enforced:true,deferrable:false,deferred:false,local:true,ordinary:true,no_inherit:true,definition:'FOREIGN KEY (case_id, owner_user_id) REFERENCES agentstudio.monitor_live_cases(id, owner_user_id)',table_ordinary:true})
function transport({incoming=[row()],extraPresence=true,mutation}={}){
 const f=monitor074Catalog((stage,target,rows,p)=>{if(stage==='presence'&&target==='074'&&extraPresence)rows.push({kind:'constraint',name:'ordinary_case_runs_fk3'});mutation?.(stage,target,rows,p)})
 const queries=[],db={...f.db,query:async(sql,p)=>{queries.push({sql,p});return sql===monitorLiveIncomingSql?{rows:incoming}:f.db.query(sql,p)}}
 return{...f,db,queries}
}
test('the named ordinary profile binds the authored077 FK and original074 key order',()=>{
 const source=ordinaryCaseTables.find(t=>t.name==='ordinary_case_runs'),target=monitorLiveTables.find(t=>t.name==='monitor_live_cases'),fk=source.constraints.find(c=>c.name==='ordinary_case_runs_fk3')
 assert.equal(fk.type,'f');assert.deepEqual(fk.keys.map(k=>source.columns.findIndex(c=>c.name===k)+1),row().keys)
 assert.deepEqual(['id','owner_user_id'].map(k=>target.columns.findIndex(c=>c.name===k)+1),row().target_keys)
 assert.equal(fk.definition.replace(/\s+/g,''),row().definition.replace(/\s+/g,''))
 assert.deepEqual(monitorLiveExtensionPresence(profile,[row()]),['constraint:ordinary_case_runs_fk3'])
})
test('original default074 still rejects even the known077 FK and performs no extension admission query',async()=>{
 const f=transport();await assert.rejects(verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
 assert.equal(f.queries.some(q=>q.sql===monitorLiveIncomingSql),false)
 let calls=0;assert.deepEqual(await readMonitorLiveExtensionPresence({query(){calls++;throw Error('no_query')}},'monitor074'),[]);assert.equal(calls,0)
})
test('explicit074+077 composes the unchanged complete073+074 catalog checks with one exact incoming edge',async()=>{
 const f=transport();await verifyMonitorLiveSchema(f.db,profile)
 const incoming=f.queries.filter(q=>q.sql===monitorLiveIncomingSql);assert.equal(incoming.length,1);assert.deepEqual(incoming[0].p,[monitorLiveTables.map(t=>t.name)])
 assert(f.queries.some(q=>q.sql===monitorLivePresenceSql));assert(f.trace.some(q=>q.sql.startsWith("SELECT p.prokind='f'")))
})
test('named profile refuses missing, duplicate and unrelated incoming constraints',async()=>{
 for(const incoming of [[],[row(),row()],[row(),{...row(),name:'shadow_incoming'}]])await assert.rejects(verifyMonitorLiveSchema(transport({incoming}).db,profile),/unsafe_monitor_live/)
 await assert.rejects(verifyMonitorLiveSchema(transport({extraPresence:false}).db,profile),/unsafe_monitor_live/)
 await assert.rejects(verifyMonitorLiveSchema(transport({mutation(stage,target,rows){if(stage==='presence'&&target==='074')rows.push({kind:'constraint',name:'unrelated_incoming'})}}).db,profile),/unsafe_monitor_live/)
})
test('every FK identity, key, action and constraint safety field remains exact',()=>{
 const altered={constraint_oid:'0',name:'renamed',source_schema:'other',source_table:'unrelated',source_oid:'800003',owner_oid:'20',target_schema:'other',target_table:'monitor_live_events',target_oid:'0',target_owner_oid:'20',kind:'c',keys:[3,4],target_keys:[2,1],update_action:'c',delete_action:'c',match:'f',valid:false,enforced:false,deferrable:true,deferred:true,local:false,ordinary:false,no_inherit:false,definition:'FOREIGN KEY (case_id) REFERENCES agentstudio.monitor_live_cases(id)',table_ordinary:false}
 for(const [key,value]of Object.entries(altered))assert.throws(()=>monitorLiveExtensionPresence(profile,[{...row(),[key]:value}]),/unsafe_monitor_live/,key)
 for(const key of Object.keys(row())){const v=row();delete v[key];assert.throws(()=>monitorLiveExtensionPresence(profile,[v]),/unsafe_monitor_live/,key)}
})
test('explicit compatibility does not bypass original body, ACL, policy or extra-object refusals',async()=>{
 for(const [stage,target,change]of [['presence','074',rows=>rows.push({kind:'function',name:'monitor_live_extra'})],['presence','073',rows=>rows.push({kind:'relation',name:'native_monitor_extra'})]]){
  await assert.rejects(verifyMonitorLiveSchema(transport({mutation(s,t,rows){if(s===stage&&t===target)change(rows)}}).db,profile),/unsafe_.*monitor/)
 }
})
test('unknown or unapproved wider profile has no fallback and starts no SQL',async()=>{
 for(const value of [undefined,null,true,'ordinary077','monitor074-material080','monitor074-ordinary077-material080-artifact081',{},[]])assert.throws(()=>checkedMonitorLiveSchemaProfile(value),/unsafe_monitor_live/)
 let queried=0;await assert.rejects(verifyMonitorLiveSchema({query(){queried++;throw Error('not_reached')}},'unknown'),/unsafe_monitor_live/);assert.equal(queried,0)
})
test('closed incoming DATA rejects accessors, proxies and extra fields without reading them',()=>{
 let read=0;const value=row();Object.defineProperty(value,'owner_oid',{get(){read++;throw Error('must_not_read')},enumerable:true})
 for(const rows of [[value],[new Proxy(row(),{get(){read++;throw Error('must_not_read')}})],[{...row(),unknown:true}],new Proxy([row()],{get(){read++;throw Error('must_not_read')}})])assert.throws(()=>monitorLiveExtensionPresence(profile,rows),/unsafe_monitor_live/)
 const rows=[row()];Object.defineProperty(rows,'0',{get(){read++;throw Error('must_not_read')},enumerable:true});assert.throws(()=>monitorLiveExtensionPresence(profile,rows),/unsafe_monitor_live/)
 assert.equal(read,0)
})
test('ordinary repository profile requires original evidence, receipt reader and full077 auditor together',()=>{
 const pool={connect:async()=>{throw Error('no_runtime_connection')}}
 assert.throws(()=>new NativeMonitorLiveRepository(pool,{schemaProfile:null}),/unsafe_monitor_live_schema_profile/)
 assert.throws(()=>new NativeMonitorLiveRepository(pool,{schemaProfile:profile}),/ordinary_case_schema_audit_required/)
 for(const missing of ['evidence','readReceipt','assertReady']){const options={schemaProfile:profile,evidence:()=>{},readReceipt:()=>{},assertReady:async()=>{}};delete options[missing];assert.throws(()=>new NativeMonitorLiveRepository(pool,options),/ordinary_case_schema_audit_required/)}
 const runtime=fs.readFileSync(new URL('../src/native-monitor-live-runtime.ts',import.meta.url),'utf8'),ordinary=fs.readFileSync(new URL('../src/native-ordinary-case-audit.ts',import.meta.url),'utf8')
 assert(runtime.includes("input.ordinaryCaseEnabled===true?'monitor074-ordinary077':'monitor074'"));assert(runtime.includes('assertReady:verifyOrdinaryCaseSchema,schemaProfile'))
 assert(ordinary.includes("await verifyMonitorLiveSchema(db,'monitor074-ordinary077')"))
})
test('external constraint query retains all source schemas and names with no LIMIT or allowlist filtering',()=>{
 const where=monitorLiveIncomingSql.slice(monitorLiveIncomingSql.indexOf('WHERE tn.nspname'))
 assert(!/\bLIMIT\b|c\.conname\s*(?:=|IN)|c\.contype\s*=|sn\.nspname\s*=/.test(where.replace("NOT(sn.nspname='agentstudio' AND s.relname=ANY($1::text[]))",'')))
 assert(monitorLiveIncomingSql.includes('s.oid=c.conrelid'));assert(monitorLiveIncomingSql.includes('t.oid=c.confrelid'));assert(monitorLiveIncomingSql.includes('c.conenforced'))
})
const ciHead='a'.repeat(40),ci=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-genuine',AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',GITHUB_RUN_ID:'12345',GITHUB_SHA:ciHead,GITHUB_REF:'refs/heads/codex/pg18-worker-heartbeat-profile-ci',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-12345',AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_CI:'YES_DISPOSABLE_MONITOR074_ORDINARY077_SCHEMA_ONLY',AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_SUITE:'monitor074-ordinary077',AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_EXPECTED_HEAD:ciHead})
test('new schema-only hosted purpose requires an independent exact head job target and grant',()=>{
 const permit=requireMonitorOrdinaryProfileCi(ci(),'linux',1001);assert.equal(permit.profile,profile);assert.equal(permit.runtime_authorization,false);assert.equal(permit.production_GO,false)
 assert.throws(()=>requireMonitorOrdinaryProfileCi())
 for(const patch of [{GITHUB_JOB:'pg18-agent-design-browser'},{AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_CI:undefined},{AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_SUITE:'monitor074'},{AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_EXPECTED_HEAD:'b'.repeat(40)},{AGENT_STUDIO_NATIVE_MONITOR074_CI:'YES_DISPOSABLE_MONITOR074_LIVE_CHAIN_ONLY'},{AGENT_STUDIO_NATIVE_MONITOR073_CI:'YES_DISPOSABLE_MONITOR073_METADATA_ONLY'},{AGENT_STUDIO_PG18_CI_HOST:'company.invalid'},{DATABASE_URL:'postgres://company.invalid/company'},{NODE_OPTIONS:'--require injected'}])assert.throws(()=>requireMonitorOrdinaryProfileCi({...ci(),...patch},'linux',1001))
 for(const [platform,uid]of [['win32',1001],['linux',0]])assert.throws(()=>requireMonitorOrdinaryProfileCi(ci(),platform,uid))
})
test('new actual test checks source and purpose before fixture imports and retains real negative installations',()=>{
 const value=fs.readFileSync(new URL('./native-monitor-ordinary-profile-genuine-pg18.test.mjs',import.meta.url),'utf8')
 assert(value.indexOf('const permit=requireMonitorOrdinaryProfileCi()')<value.indexOf("import('node:fs')"));assert(value.indexOf('sources()')<value.indexOf("import('./helpers/agent-design-genuine-fixture.mjs')"))
 for(const token of ["inspectOptionalMonitorLive(f.pool,permit.profile)","inspectOptionalMonitorLive(f.pool),/unsafe_monitor_live/","inspectOptionalOrdinaryCase(f.pool)",'ON DELETE CASCADE','fixture_unapproved_monitor_edge','await f.close()'])assert(value.includes(token),token)
 assert(!/new (?:Pool|PGlite|WorkflowV2Worker)|\.tick\(|createServer|\.listen\(|https\.request|fetch\(/.test(value))
 const workflow=fs.readFileSync(new URL('../../../.github/workflows/pg18-agent-design-genuine-ci.yml',import.meta.url),'utf8');assert(workflow.includes("if: matrix.suite == 'monitor074-ordinary077'"));assert(workflow.includes('AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_EXPECTED_HEAD: ${{ github.sha }}'));assert(workflow.includes('tests/native-monitor-ordinary-profile-genuine-pg18.test.mjs'))
})
