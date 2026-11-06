// Pure parsers, refusal boundaries and source inspection only. No positive
// trust/runtime handle, actual application process, Pool, SQL or TLS is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {companionCiPurpose,companionCiF05Purpose,companionCiSpecs,companionCiAccountLeaves,companionCiExpectedRawPreflight,parseFinalCompanionCiArgs,companionCiReportShape} from './helpers/pg18-complete-companion-ci-contract.mjs'
import {completeCompanionCiStageEnabled,collectCompleteCompanionCiStage,verifyCompleteCompanionCiStage,assertCompleteCompanionCiStage,companionCiHarnessFiles} from './helpers/pg18-complete-companion-ci-stage.mjs'
import {prepareCompleteCompanionCiDeployment,completeCompanionCiDeploymentView,installCompleteCompanionCiNetwork,runCompleteCompanionCiDeployment} from './helpers/pg18-complete-companion-ci-fixture.mjs'
import {runActualFiveCompanionCi} from './helpers/pg18-complete-companion-ci-run.mjs'
import {inspectFinalCompanionNetworkPolicy} from '../src/pg18-full069-final-companion-contract.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),read=n=>fs.readFileSync(root+'/'+n,'utf8'),ts=createRequire(import.meta.url)('typescript')
const argv=['--run','--expected-complete-source-sha256','a'.repeat(64),'--expected-final-source-sha256','b'.repeat(64),'--expected-system-identifier','123456789','--expected-database-oid','16384']
test('CI accepts only the fixed two source pins and exact physical target arguments',()=>{
 assert.deepEqual(parseFinalCompanionCiArgs(argv),{completeSha:'a'.repeat(64),finalSha:'b'.repeat(64),target:{system_identifier:'123456789',database_oid:'16384'}})
 for(const args of [[],argv.slice(1),[...argv,'--minimum-ms','5000'],argv.map((v,i)=>i===1?'--target':v),argv.map((v,i)=>i===2?'A'.repeat(64):v),argv.map((v,i)=>i===6?'18446744073709551616':v),argv.map((v,i)=>i===6?'01':v),argv.map((v,i)=>i===8?'4294967296':v),argv.map((v,i)=>i===8?'0':v)])assert.throws(()=>parseFinalCompanionCiArgs(args),/arguments/)
})
test('CI uses five disjoint numeric identities,14 existing account leaves and separately approved F05 purpose',()=>{
 assert.equal(companionCiPurpose,'YES_DISPOSABLE_FULL069_FIVE_COMPANIONS_ONLY');assert.equal(companionCiF05Purpose,'YES_DISPOSABLE_FULL069_FIXED_F05_PAIR_ONLY')
 assert.equal(Object.keys(companionCiAccountLeaves).length,14);assert.equal(new Set(Object.values(companionCiAccountLeaves)).size,14)
 assert.deepEqual(companionCiSpecs.map(s=>s.uid),[61021,61022,61023,61024,61025]);assert.ok(companionCiSpecs.every(s=>s.uid===s.gid&&s.groups.length===0))
 assert.equal(companionCiSpecs[3].origin,companionCiSpecs[4].origin);assert.equal(companionCiSpecs[2].design_enabled,true)
 for(const spec of companionCiSpecs){const data=companionCiExpectedRawPreflight(spec.id);assert.ok(data.at(-1)===10);assert.equal(JSON.parse(data).mode,'preflight')}
 assert.throws(()=>companionCiExpectedRawPreflight('native'))
})
test('serialized stage references and caller objects cannot supply CI authority',async()=>{
 assert.throws(()=>completeCompanionCiStageEnabled({}));await assert.rejects(()=>collectCompleteCompanionCiStage({},{}));await assert.rejects(()=>verifyCompleteCompanionCiStage({},'/fake','/fake',{},'a'.repeat(64)))
 assert.throws(()=>assertCompleteCompanionCiStage({manifest:{},assert:()=>true}),/stage_unsealed_reference/)
 assert.throws(()=>completeCompanionCiDeploymentView({ready:true}),/untrusted_deployment/);assert.throws(()=>installCompleteCompanionCiNetwork({ready:true}),/untrusted_deployment/);await assert.rejects(()=>runCompleteCompanionCiDeployment({ready:true}),/untrusted_deployment/)
})
test('CI admission refuses a local author before target preparation or actual originals',async()=>{
 await assert.rejects(()=>prepareCompleteCompanionCiDeployment({ready:true},{systemIdentifier:'1',databaseOid:'1'}))
 if(process.platform==='win32')await assert.rejects(()=>runActualFiveCompanionCi(argv));else await assert.rejects(()=>runActualFiveCompanionCi([]),/arguments/)
})
test('aggregate claims alone cannot satisfy an actual five-companion report',()=>{
 for(const data of [{},{format:'complete069_five_companion_actual_v1',actual_preflights:5,actual_original_processes:5,fresh_TLS_brokers:4,actual_F05_worker:true,all_graceful:true,no_forced_stop:true,all_owned_processes_absent:true,preflights:Array(5).fill({}),startup:Array(5).fill({}),stops:Array(5).fill({}),qualification_started:false,minimum_duration_observed:false,qualifies_run:false,production_GO:false}])assert.throws(()=>companionCiReportShape(data),/actual_report/)
})
test('earlier original Native UID jumps may retain their harmless fixed quoted comment',()=>{
 const rules=['*filter',':OUTPUT ACCEPT [0:0]','-A OUTPUT -m owner --uid-owner 61001 -m comment --comment "owned-full069-source-review" -j AS_F069_source',...companionCiSpecs.map(s=>'-A OUTPUT -m owner --uid-owner '+s.uid+' -j ASFC'+s.uid),...companionCiSpecs.map(s=>'-A ASFC'+s.uid+' -j REJECT --reject-with icmp6-port-unreachable'),'COMMIT'].join('\n')
 assert.equal(inspectFinalCompanionNetworkPolicy(rules,companionCiSpecs,6),true)
 assert.throws(()=>inspectFinalCompanionNetworkPolicy(rules.replace('--uid-owner 61001','--uid-owner 61021'),companionCiSpecs,6),/network_order/)
 assert.throws(()=>inspectFinalCompanionNetworkPolicy(rules.replace('--uid-owner 61001','--uid-owner 61001-61030'),companionCiSpecs,6),/network_order/)
})
test('deployed actual CLI reopens B trust and runtime in the same source tree, then uses the actual canonical launcher',()=>{
 const text=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-run.mjs')
 for(const required of ['openFull069FinalTrust(true)','openFinalRunStore(trust)','openFull069FinalRuntime(trust)','full069FinalPreflight(runtime)','openFull069FinalCompanions(trust)','await preflightFull069FinalCompanions(handle)','await startFull069FinalCompanions(handle)','await observeFull069FinalCompanions(handle,{ready:true})','await stopFull069FinalCompanions(handle)','await closeFull069FinalRuntime(runtime)','qualification_started:false','minimum_duration_observed:false'])assert.ok(text.includes(required),required)
 assert.doesNotMatch(text,/--minimum-ms|BEGIN_receipt|END_receipt|new Pool|verifyCompleteProfile\(|create.*Adapter|clock:/)
})
test('deployment verification, source union and cleanup remain before-and-after fail-closed boundaries',()=>{
 const text=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-fixture.mjs'),stage=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-stage.mjs')
 for(const required of ["const contexts=new WeakMap()","root.dev!==s.directory.dev","a.nlink!==1","(a.mode&0o7777)!==mode","fs.realpathSync(name)!==name","BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY","await client.query('ROLLBACK')","s.running=true;s.ran=true;try{await target(s)","finally{s.running=false}",'business_or_global_catalog_changed','business_backend_remains',"chain='ASFC'+spec.uid","uidAbsent()","path.dirname(s.root)!=='/var/lib'"])assert.ok(text.includes(required),required)
 assert.ok(stage.includes('captureFull069FinalSources()'));assert.ok(stage.includes('source_union_overlap'));assert.ok(stage.includes('AGENT_STUDIO_COMPANION_CI_SOURCE_MANIFEST_SHA256'));assert.ok(!stage.includes('AGENT_STUDIO_COMPLETE_PROFILE_CI_COMPANION_'));assert.ok(stage.includes('const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)'))
 assert.ok(companionCiHarnessFiles.includes('services/pg-api/tests/helpers/pg18-complete-install-ci-guard.mjs'))
})
test('all new CI helpers parse with the pinned real AST; probe checks the original IP certificate identity',()=>{
 for(const n of ['contract','stage','fixture','run']){const file='services/pg-api/tests/helpers/pg18-complete-companion-ci-'+n+'.mjs',ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(ast.parseDiagnostics.length,0,file)}
 const parent=read('services/pg-api/src/pg18-full069-final-companions.mjs');assert.ok(parent.includes("checkServerIdentity('127.0.0.1',peer)"));assert.ok(parent.includes("servername:''"));assert.ok(parent.includes('try{identity(s,c)}catch{unknown=true}'));assert.doesNotMatch(parent,/rejectUnauthorized:false/)
})
