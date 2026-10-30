// Data-only merge/refusal/source checks. No branded positive CI permit,
// bootstrap, original CLI, Node binary copy, Pool, SQL or TLS is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {companionCiFinalPathPurpose,companionCiFinalPathHarness,companionCiPackageBindings,companionCiFinalPathEnabled,mergeCompanionCiSourceRecords as merge} from './helpers/pg18-complete-companion-ci-contract.mjs'
import {companionCiHarnessFiles,collectCompleteCompanionCiStage,assertCompleteCompanionCiStage,inspectCompanionCiRelativeImports} from './helpers/pg18-complete-companion-ci-stage.mjs'
import {assertOwnedCompleteProfileCohort} from './helpers/pg18-complete-install-ci-containers.mjs'
import {assertCompleteCompanionCiDeploymentBinding} from './helpers/pg18-complete-companion-ci-fixture.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),read=n=>fs.readFileSync(root+'/'+n,'utf8'),hash=b=>createHash('sha256').update(b).digest('hex'),clone=v=>structuredClone(v),record=(path,sha256='a'.repeat(64))=>({path,sha256}),apps=[record('services/pg-api/src/pg18-full069-final-trust.mjs')],harness=companionCiHarnessFiles.map(p=>record(p,'b'.repeat(64)))
function overlay(patch={}){const manifest={format:'full069_final13_path_ci_source_overlay_v1',purpose:companionCiFinalPathPurpose,complete_source_sha256:'c'.repeat(64),final_source_sha256:'d'.repeat(64),control_source_sha256:'e'.repeat(64),control_package_bindings:clone(companionCiPackageBindings),application_additions:[record('db/postgres/telemetry/001_worker_heartbeats.sql'),...apps],harness_files:companionCiFinalPathHarness.map(p=>record(p)),...patch};return {manifest,source_sha256:hash(JSON.stringify(manifest))}}
test('five-only source record order and guide location remain unchanged without all13 purpose',()=>{
 const merged=merge(apps,harness);assert.deepEqual(merged.application_files,apps);assert.deepEqual(merged.harness_files,harness);assert.equal(merged.final_path_overlay,null);assert.equal(companionCiFinalPathEnabled(undefined),false);assert.throws(()=>companionCiFinalPathEnabled('true'),/final13_purpose/);assert.equal(companionCiFinalPathEnabled(companionCiFinalPathPurpose),true)
})
test('all13 independently seals Control SQL and10 fixed B helpers with only executable MJS in harness',()=>{
 const view=overlay(),m=merge(apps,harness,view);assert.equal(m.harness_files.length,15);assert.ok(m.harness_files.every(r=>/^services\/pg-api\/tests\/helpers\/.+\.mjs$/.test(r.path)));assert.ok(m.application_files.some(r=>r.path==='db/postgres/telemetry/001_worker_heartbeats.sql'));assert.ok(m.application_files.some(r=>r.path==='docs/PG18_FULL069_FIVE_COMPANION_CI_BRIDGE.md'));assert.equal(m.application_files.filter(r=>r.path===apps[0].path).length,1);assert.equal(m.final_path_overlay.source_sha256,view.source_sha256);assert.equal(Object.isFrozen(m.application_files[0]),true)
})
test('source overlap requires exact bytes across original, Control and harness categories',()=>{
 for(const view of [overlay({application_additions:[record(apps[0].path,'f'.repeat(64))]}),overlay({application_additions:[record(harness[0].path,'f'.repeat(64))]})])assert.throws(()=>merge(apps,harness,view),/overlay_(?:overlap|application)/)
 assert.throws(()=>merge([...apps,record('../escape')],harness),/overlay_record/)
})
test('missing, extra and duplicate B executable helpers cannot be silently broadened',()=>{
 for(const files of [companionCiFinalPathHarness.slice(1),[...companionCiFinalPathHarness,'services/pg-api/tests/helpers/arbitrary-entry.mjs'],[...companionCiFinalPathHarness.slice(0,-1),companionCiFinalPathHarness[0]]])assert.throws(()=>merge(apps,harness,overlay({harness_files:files.map(p=>record(p))})),/overlay_harness/)
})
test('Control package bindings retain the independent original package/lock pins',()=>{
 for(const bindings of [clone(companionCiPackageBindings).slice(1),companionCiPackageBindings.map((r,i)=>({...r,sha256:i===0?'0'.repeat(64):r.sha256}))])assert.throws(()=>merge(apps,harness,overlay({control_package_bindings:bindings})),/overlay_package_binding/)
 assert.throws(()=>merge(apps,harness,overlay({application_additions:[record('services/pg-api/package.json')]})),/overlay_application/)
})
test('a stale or differently purposed serialized overlay remains source DATA and cannot open a stage',async()=>{
 const bad=overlay();bad.manifest.control_source_sha256='0'.repeat(64);assert.throws(()=>merge(apps,harness,bad),/overlay_binding/);assert.throws(()=>merge(apps,harness,overlay({purpose:'arbitrary'})),/overlay_binding/)
 await assert.rejects(()=>collectCompleteCompanionCiStage({source_sha256:'a'.repeat(64)},{}));assert.throws(()=>assertCompleteCompanionCiStage(merge(apps,harness,overlay())),/stage_unsealed_reference/)
})
test('actual B overlay is imported from the same host guard module and checked again after deployment',()=>{
 const stage=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-stage.mjs');assert.ok(stage.includes("B=await import('./pg18-full069-final-path-ci-sources.mjs')"));assert.ok(stage.includes('captureFinalPathCiSourceOverlay(permit,base,complete,snapshot,{deployment,stageSourceProof})'));assert.ok(stage.includes('B.assertFinalPathCiSourceOverlay(overlay)'));assert.ok(stage.includes('overlay_source_parent'));assert.ok(stage.includes('AGENT_STUDIO_COMPANION_CI_SOURCE_MANIFEST_SHA256'));assert.ok(!stage.includes("pathToFileURL(base+'/services/pg-api/tests/helpers/pg18-full069-final-path-ci-sources.mjs'"))
})
test('Node copy checks the input FD without requiring cache ownership, then enforces Root ownership on the deployed copy',()=>{
 const fixture=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-fixture.mjs');for(const text of ['function ownedNodeInput()','fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW','node_input_changed','a.nlink!==1','s.nodeInput=input.input',"write(s.node,bytes,0o555)",'a.uid!==0||a.gid!==0',"'AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE'"])assert.ok(fixture.includes(text),text)
 const input=fixture.slice(fixture.indexOf('function ownedNodeInput()'),fixture.indexOf('function deployed(s)'));assert.ok(!input.includes('a.uid!==0'));assert.ok(!input.includes('chmod'));assert.ok(!input.includes('chown'))
 assert.ok(input.includes('0x7f,0x45,0x4c,0x46'));assert.ok(!input.includes('a.nlink!==1'));assert.ok(input.includes('268435456'))
})
test('the actual original CI guard relative edge includes the missing ephemeral guard and helper cycles close',async()=>{
 const base='services/pg-api/tests/helpers/',pending=companionCiHarnessFiles.filter(p=>p.endsWith('.mjs')),seen=new Set(),terminals=new Set()
 while(pending.length){const file=pending.pop();if(seen.has(file))continue;seen.add(file);for(const edge of await inspectCompanionCiRelativeImports(file,read(file))){if(edge.to===base+'pg18-full069-final-path-ci-sources.mjs')continue;if(edge.to.startsWith(base))pending.push(edge.to);else{assert.ok(fs.existsSync(root+'/'+edge.to),edge.to);terminals.add(edge.to)}}}
 for(const name of ['pg18-complete-install-ci-guard.mjs','pg18-complete-install-ci-containers.mjs','pg18-complete-install-ci-stage.mjs','pg18-complete-plan-workflow-ci-stage.mjs'])assert.ok(seen.has(base+name),name)
 assert.ok(terminals.has('services/pg-api/src/pg18-ephemeral-ci-guard.mjs'));await assert.rejects(()=>inspectCompanionCiRelativeImports(base+'example.mjs',"import '../../../../outside.mjs'"),/closure_relative_path/)
})
test('cohort admission uses private original target state and rejects caller DTOs before any deployment or Pool',()=>{
 assert.throws(()=>assertOwnedCompleteProfileCohort({}, {}, {}));const fixture=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-fixture.mjs'),containers=read('services/pg-api/tests/helpers/pg18-complete-install-ci-containers.mjs'),start=containers.indexOf('export function assertOwnedCompleteProfileCohort'),end=containers.indexOf('async function owned(target,trace)',start),body=containers.slice(start,end)
 for(const text of ['targets.get(target)','s.loaded!==loaded','keys.some(k=>s.b[k]!==b[k])','loaded.stageNonce!==b.nonce','loaded.stageInput!==input','s.id!==b.mainId','target.databaseOid!==s.oid'])assert.ok(body.includes(text),text)
 assert.ok(!body.includes('pool.query'));assert.ok(!body.includes('command('));assert.ok(fixture.includes('assertOwnedCompleteProfileCohort(permit,loaded,target)'));assert.ok(fixture.includes('admission(loaded,ownedTarget);const handle'));assert.ok(fixture.includes('admission(s.loaded,s.target);const p=await ownedCompleteProfilePool'))
})
test('only server-side verifier SHA leaves the role query while all role fields and catalog checks remain',()=>{
 const fixture=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-fixture.mjs'),query=/client\.query\("(SELECT a\.oid::text[^"\n]+)"\)/.exec(fixture)?.[1];assert.ok(query)
 const digest="CASE WHEN a.rolpassword IS NULL THEN NULL ELSE encode(sha256(convert_to(a.rolpassword,'UTF8')),'hex') END AS verifier_sha256",fields=['a.oid::text','a.rolname','a.rolcanlogin','a.rolinherit','a.rolsuper','a.rolbypassrls','a.rolcreatedb','a.rolcreaterole','a.rolreplication','a.rolconnlimit','r.rolconfig','a.rolvaliduntil']
 assert.equal(query,'SELECT '+fields.join(',')+','+digest+' FROM pg_catalog.pg_authid AS a JOIN pg_catalog.pg_roles AS r ON r.oid=a.oid ORDER BY a.rolname');assert.doesNotMatch(query,/a\.rolconfig|SELECT\s+\*/);assert.doesNotMatch(query.replace(digest,'verifier_sha256'),/rolpassword/);assert.equal(query.match(/a\.rolpassword/g).length,2)
 for(const text of ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','JSON.stringify({roles,members,dbs,settings,objects,rls})','all_global_roles_memberships_ACLs_unchanged','business_or_global_catalog_changed'])assert.ok(fixture.includes(text),text)
})

test('B deployment-binding API is a synchronous four-argument export and counterfeit handles refuse',()=>{
 assert.equal(typeof assertCompleteCompanionCiDeploymentBinding,'function');assert.equal(assertCompleteCompanionCiDeploymentBinding.length,4)
 const dto={root:'/var/lib/agentstudio-full069-final-companion-ci-forged',node:'/forged/node24',stage_input:'/forged',business_target:{system_identifier:'1',database_oid:'2'}},loaded={},target={}
 for(const handle of [undefined,null,{},Object.freeze(Object.create(null)),dto,structuredClone(dto)])assert.throws(()=>assertCompleteCompanionCiDeploymentBinding(handle,{},loaded,target),/complete_companion_ci_untrusted_deployment/)
 assert.throws(()=>assertCompleteCompanionCiDeploymentBinding(),/complete_companion_ci_untrusted_deployment/)
})

test('binding requires live private state, exact references, original permit cohort and deployed-source checks before success',()=>{
 const fixture=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-fixture.mjs'),start=fixture.indexOf('export function assertCompleteCompanionCiDeploymentBinding('),end=fixture.indexOf('export function completeCompanionCiDeploymentView(',start),body=fixture.slice(start,end)
 const steps=['(handle,permit,loaded,ownedTarget)','const s=state(handle)',"if(s.loaded!==loaded||s.target!==ownedTarget)fail('deployment_reference_mismatch')",'assertOwnedCompleteProfileCohort(permit,loaded,ownedTarget)','deployed(s);return true'];let previous=-1
 for(const step of steps){const current=body.indexOf(step);assert.ok(current>previous,step);previous=current}
 assert.ok(fixture.includes("const s=contexts.get(handle);if(!s||s.closed)fail('untrusted_deployment')"));assert.ok(fixture.includes('admission(s.loaded,s.target);const root=fs.lstatSync(s.root)'))
 for(const text of ['root.dev!==s.directory.dev','root.ino!==s.directory.ino','sha(fs.readFileSync(name))!==r.sha256',"fail('deployed_file_changed')"])assert.ok(fixture.includes(text),text)
 assert.doesNotMatch(body,/async|await|\.query\(|command\(|JSON\.parse|Object\.assign|\.set\(/)
})
test('loader paths are frozen and every cleanup checks UID absence and owned executable use even with no network rows',()=>{
 const stage=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-stage.mjs'),fixture=read('services/pg-api/tests/helpers/pg18-complete-companion-ci-fixture.mjs');assert.ok(stage.includes('paths:Object.freeze(cap.manifest.application_files.map'));assert.ok(stage.includes('ci_relative_imports:closure.edges'));assert.ok(fixture.includes("fail('cleanup_running');uidAbsent();ownedNodeUnused(s);if(s.network.length)"));assert.ok(fixture.includes("fs.statSync('/proc/'+pid+'/exe')"))
})
