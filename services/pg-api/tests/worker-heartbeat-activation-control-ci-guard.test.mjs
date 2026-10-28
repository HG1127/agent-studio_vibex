import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {planWorkerHeartbeatActivationControlCi,requireWorkerHeartbeatActivationControlCi,
 workerHeartbeatActivationControlCiMainOptions,workerHeartbeatActivationControlCiDescriptor} from './helpers/worker-heartbeat-activation-control-ci-guard.mjs'

const prefix='AGENT_STUDIO_TELEMETRY_CONTROL_CI_',branch='refs/heads/codex/pg18-worker-heartbeat-20261028'
const safe={GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),
 RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',
 GITHUB_WORKFLOW:'Agent Studio PG18 telemetry control isolated verification',GITHUB_JOB:'pg18-telemetry-control-domain',
 GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:branch,
 GITHUB_WORKFLOW_REF:'HG1127/agent-studio_vibex/.github/workflows/pg18-telemetry-control-ci.yml@'+branch,
 AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',
 AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',
 AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123456789',
 [prefix+'MODE']:'OWNED_SYNTHETIC_CONTROL_ONLY',[prefix+'WRITE_APPROVED']:'YES_DISPOSABLE_CONTROL_FIXTURE_ONLY'}
const denied=f=>assert.throws(f,/refuse_non_ephemeral_(?:pg18|telemetry_control)_ci/)
test('the closed plan retains the original disposable sponsor and fixes a new owned container',()=>{
 const p=planWorkerHeartbeatActivationControlCi(safe)
 assert.equal(p.main.host,'127.0.0.1');assert.equal(p.main.port,5432);assert.equal(p.main.database,'agentstudio_pg18_ci')
 assert.equal(p.main.user,'agentstudio_admin');assert.equal(p.new_container_port,5333)
 assert.equal(p.fixed_native_database,'agent_studio');assert.equal(p.fixed_telemetry_database,'agent_studio_telemetry')
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.main))
 for(const k of ['production_target_reused','production_capability','provider_calls','production_cutover_allowed'])assert.equal(p[k],false)
})
test('no plan, clone, wrapper or borrowed workflow object grants fixture authority',()=>{
 const p=planWorkerHeartbeatActivationControlCi(safe)
 for(const f of [p,structuredClone(p),{...p},Object.create(p),new Proxy(p,{}),{},null,undefined]){
  denied(()=>workerHeartbeatActivationControlCiMainOptions(f));denied(()=>workerHeartbeatActivationControlCiDescriptor(f))
 }
})
test('real-process admission never accepts caller-supplied GitHub environment data',()=>{
 for(const env of [safe,{...safe},Object.freeze({...safe}),Object.create(null)])denied(()=>requireWorkerHeartbeatActivationControlCi(env))
})
test('the original main database and credential restrictions are unchanged',()=>{
 for(const patch of [{DATABASE_URL:'postgres://forbidden/agent_studio'}, {PGHOST:'127.0.0.1'},
  {AGENT_STUDIO_PG18_CI_PORT:'5333'},{AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio'},
  {AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio_telemetry'},{AGENT_STUDIO_PG18_CI_HOST:'192.168.1.133'},
  {AGENT_STUDIO_PG18_CI_ADMIN_USER:'postgres'},{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'other'},
  {AGENT_STUDIO_PG18_CI_WRITE_APPROVED:undefined}])denied(()=>planWorkerHeartbeatActivationControlCi({...safe,...patch}))
})
test('every hosted workflow marker and revision is exact and pull requests cannot activate the fixture',()=>{
 for(const patch of [{RUNNER_OS:'Windows'},{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_REPOSITORY:'other/repo'},
  {GITHUB_WORKFLOW:'Agent Studio PG18 worker heartbeat isolated verification'},{GITHUB_JOB:'pg18-worker-heartbeat-domain'},
  {GITHUB_EVENT_NAME:'pull_request'},{GITHUB_EVENT_NAME:'pull_request_target'},{GITHUB_RUN_ATTEMPT:'0'},
  {GITHUB_RUN_ID:'0'},{GITHUB_SHA:'a'.repeat(39)},{GITHUB_REF:'refs/heads/main'},
  {GITHUB_WORKFLOW_REF:'other/ref'}])denied(()=>planWorkerHeartbeatActivationControlCi({...safe,...patch}))
 assert.equal(planWorkerHeartbeatActivationControlCi({...safe,GITHUB_EVENT_NAME:'push'}).source_revision,safe.GITHUB_SHA)
})
test('separate approval and all target aliases are closed',()=>{
 for(const patch of [{[prefix+'MODE']:'production'},{[prefix+'WRITE_APPROVED']:undefined},
  {[prefix+'HOST']:'127.0.0.1'},{[prefix+'DATABASE']:'agent_studio'},
  {TELEMETRY_DATABASE_URL:'postgres://forbidden/db'},{CONTROL_DATABASE_URL:'postgres://forbidden/db'},
  {CONTROL_PGPORT:'5333'},{TELEMETRY_PGHOST:'127.0.0.1'}])denied(()=>planWorkerHeartbeatActivationControlCi({...safe,...patch}))
})
test('accessor and symbolic environment entries are rejected without reading their values',()=>{
 let calls=0;const env={...safe}
 Object.defineProperty(env,'GITHUB_JOB',{enumerable:true,get(){calls++;return safe.GITHUB_JOB}})
 denied(()=>planWorkerHeartbeatActivationControlCi(env));assert.equal(calls,0)
 denied(()=>planWorkerHeartbeatActivationControlCi({...safe,[Symbol('extra')]:'x'}))
})
test('ordinary actual invocation refuses before filesystem, process, network or database imports',()=>{
 const url=new URL('./helpers/worker-heartbeat-activation-control-ci-guard.mjs',import.meta.url).href
 const code=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(['pg','node:fs','node:net','node:tls','node:child_process'].includes(s))throw Error('unexpected_ci_effect_import');return n(s,c)}});const m=await import(${JSON.stringify(url)});m.requireWorkerHeartbeatActivationControlCi();`
 const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH??'',CI:'false',GITHUB_ACTIONS:'false'}})
 assert.equal(r.status,1);assert.match(r.stderr,/refuse_non_ephemeral_telemetry_control_ci/)
 assert.doesNotMatch(r.stdout+r.stderr,/unexpected_ci_effect_import|ERR_MODULE_NOT_FOUND|ECONNREFUSED/)
 const source=readFileSync(new URL('./helpers/worker-heartbeat-activation-control-ci-guard.mjs',import.meta.url),'utf8')
 assert.doesNotMatch(source,/from ['"]pg['"]|import\(['"]pg['"]|node:fs|node:net|node:tls|node:child_process/)
})
test('new container operations reject every forged or cloned lease before target or Docker activity',async()=>{
 const m=await import('./helpers/worker-heartbeat-activation-control-ci-container.mjs')
 const plan=planWorkerHeartbeatActivationControlCi(safe)
 for(const ref of [plan,structuredClone(plan),{},Object.create(null),null,undefined]){
  await assert.rejects(m.createTelemetryControlCiContainer(ref),/refuse_non_ephemeral_telemetry_control_ci/)
  for(const f of [m.createTelemetryControlCiDatabase,m.verifyTelemetryControlCiContainer,m.closeTelemetryControlCiContainer])
   await assert.rejects(f(ref),/telemetry_control_container_ci_refused:private_created_lease_required/)
  for(const f of [m.telemetryControlCiContainerNativeOptions,m.telemetryControlCiContainerTelemetryOptions])
   assert.throws(()=>f(ref),/telemetry_control_container_ci_refused:private_created_lease_required/)
 }
})
test('ordinary container setup rejects before importing a driver or allocating Docker configuration',()=>{
 const url=new URL('./helpers/worker-heartbeat-activation-control-ci-container.mjs',import.meta.url).href
 const code=`import {registerHooks} from 'node:module';import fs from 'node:fs';registerHooks({resolve(s,c,n){if(s==='pg')throw Error('unexpected_ci_driver');return n(s,c)}});const m=await import(${JSON.stringify(url)});fs.openSync=fs.mkdtempSync=()=>{throw Error('unexpected_ci_file_allocation')};await m.createTelemetryControlCiContainer({});`
 const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH??'',CI:'false',GITHUB_ACTIONS:'false'}})
 assert.equal(r.status,1);assert.match(r.stderr,/refuse_non_ephemeral_telemetry_control_ci/)
 assert.doesNotMatch(r.stdout+r.stderr,/unexpected_ci_driver|unexpected_ci_file_allocation|ERR_MODULE_NOT_FOUND|ECONNREFUSED/)
})
test('stage production and descriptor lookup reject forged CI/stage references before any source capture or filesystem allocation',async()=>{
 const m=await import('./helpers/worker-heartbeat-activation-control-ci-stage.mjs')
 const plan=planWorkerHeartbeatActivationControlCi(safe)
 for(const ref of [plan,structuredClone(plan),{},null,undefined]){
  await assert.rejects(m.publishWorkerHeartbeatControlCiStages(ref),/refuse_non_ephemeral_telemetry_control_ci/)
  denied(()=>m.describeWorkerHeartbeatControlCiStages(ref,{}))
 }
})
test('ordinary stage invocation has no source/runtime/parser import or output filesystem effects',()=>{
 const url=new URL('./helpers/worker-heartbeat-activation-control-ci-stage.mjs',import.meta.url).href
 const code=`import {registerHooks} from 'node:module';import fs from 'node:fs';registerHooks({resolve(s,c,n){if(['pg','typescript'].includes(s)||/activation-control-(?:source|runtime)\.mjs$/.test(s))throw Error('unexpected_stage_runtime_import');return n(s,c)}});const m=await import(${JSON.stringify(url)});fs.openSync=fs.mkdirSync=fs.chmodSync=()=>{throw Error('unexpected_stage_output')};await m.publishWorkerHeartbeatControlCiStages({});`
 const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH??'',CI:'false',GITHUB_ACTIONS:'false'}})
 assert.equal(r.status,1);assert.match(r.stderr,/refuse_non_ephemeral_telemetry_control_ci/)
 assert.doesNotMatch(r.stdout+r.stderr,/unexpected_stage_runtime_import|unexpected_stage_output|ERR_MODULE_NOT_FOUND|ECONNREFUSED/)
})
test('actual control and writer integration entries refuse before effectful fixture or source imports',()=>{
 for(const entry of ['worker-heartbeat-activation-control-ci.integration.mjs','worker-heartbeat-writer-ci.integration.mjs']){
  const url=new URL('./'+entry,import.meta.url).href
  const code=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(/(?:activation-control|worker-heartbeat-writer)-ci-(?:fixture|stage)\\.mjs$/.test(s)||['pg','node:fs','node:net','node:child_process'].includes(s))throw Error('unexpected_control_ci_effect');return n(s,c)}});await import(${JSON.stringify(url)});`
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH??'',CI:'false',GITHUB_ACTIONS:'false'}})
  assert.equal(r.status,1,entry);assert.match(r.stderr,/refuse_non_ephemeral_telemetry_control_ci/,entry)
  assert.doesNotMatch(r.stdout+r.stderr,/unexpected_control_ci_effect|ERR_MODULE_NOT_FOUND|ECONNREFUSED/,entry)
 }
})
test('actual fixture factory rejects fabricated proof and stage before driver or effectful helper imports',async()=>{
 const {createWorkerHeartbeatActivationControlCiFixture:create}=await import('./helpers/worker-heartbeat-activation-control-ci-fixture.mjs')
 const plan=planWorkerHeartbeatActivationControlCi(safe)
 for(const proof of [plan,structuredClone(plan),{},null,undefined])await assert.rejects(create(proof,{}),/refuse_non_ephemeral_telemetry_control_ci/)
})
