// Pure CI admission tests only. Never construct pg, open a DB or run SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {planWorkerHeartbeatCi,requireWorkerHeartbeatCi,workerHeartbeatCiAdminOptions} from './helpers/worker-heartbeat-ci-guard.mjs'

const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)))
const prefix='AGENT_STUDIO_WORKER_HEARTBEAT_CI_'
const safe={GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123456789',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',
 GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio PG18 worker heartbeat isolated verification',GITHUB_JOB:'pg18-worker-heartbeat-domain',
 AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',
 AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',
 AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123456789',
 [prefix+'MODE']:'SYNTHETIC_DOMAIN_ONLY',[prefix+'WRITE_APPROVED']:'YES_DISPOSABLE_TELEMETRY_ONLY'}

test('the immutable pure plan keeps the original main guard and a separate fixed empty telemetry target',()=>{
 const plan=planWorkerHeartbeatCi(safe)
 assert.equal(plan.main.database,'agentstudio_pg18_ci');assert.equal(plan.telemetry_database,'agent_studio_telemetry')
 assert.equal(plan.main.host,'127.0.0.1');assert.equal(plan.main.port,5432);assert.equal(plan.main.user,'agentstudio_admin')
 for(const key of ['creates_production_database','old_database_reused','provider_calls','production_cutover_allowed'])assert.equal(plan[key],false)
 assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.main));assert.throws(()=>{plan.telemetry_database='agent_studio'},TypeError)
})

test('neither a valid plan nor its clone grants database authority',()=>{
 const plan=planWorkerHeartbeatCi(safe)
 for(const candidate of [plan,structuredClone(plan),{...plan},Object.create(plan),new Proxy(plan,{}),{},null,undefined]){
  for(const kind of ['main','telemetry','agent_studio','other'])assert.throws(()=>workerHeartbeatCiAdminOptions(candidate,kind),/refuse_non_ephemeral_worker_heartbeat_ci/)
 }
})

test('the original main target restrictions are never weakened to create telemetry',()=>{
 for(const patch of [{DATABASE_URL:'postgres://do-not-connect/agent_studio'},{PGHOST:'127.0.0.1'},
  {AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio'},{AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio_telemetry'},
  {AGENT_STUDIO_PG18_CI_PORT:'5333'},{AGENT_STUDIO_PG18_CI_HOST:'192.168.1.133'},
  {AGENT_STUDIO_PG18_CI_ADMIN_USER:'postgres'},{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'not-synthetic'},
  {GITHUB_ACTIONS:'false'},{CI:'false'},{AGENT_STUDIO_PG18_CI_WRITE_APPROVED:undefined}]){
  assert.throws(()=>planWorkerHeartbeatCi({...safe,...patch}),/refuse_non_ephemeral_pg18_ci/)
 }
})

test('telemetry has its own explicit disposable approval and rejects all target aliases',()=>{
 for(const patch of [{[prefix+'MODE']:undefined},{[prefix+'WRITE_APPROVED']:undefined},
  {[prefix+'MODE']:'production'},{[prefix+'HOST']:'127.0.0.1'},{[prefix+'DATABASE']:'agent_studio'},
  {TELEMETRY_DATABASE_URL:'postgres://do-not-connect/agent_studio_telemetry'},{TELEMETRY_PGHOST:'127.0.0.1'},
  {TELEMETRY_PGPORT:'5432'},{TELEMETRY_PGDATABASE:'agent_studio_telemetry'}]){
  assert.throws(()=>planWorkerHeartbeatCi({...safe,...patch}),/refuse_non_ephemeral_worker_heartbeat_ci/)
 }
})

test('runtime authority uses actual Linux and exact hosted workflow/job/repository markers',()=>{
 for(const patch of [{RUNNER_OS:'Windows'},{RUNNER_ENVIRONMENT:'self-hosted'},
  {GITHUB_REPOSITORY:'other/agent-studio_vibex'},{GITHUB_WORKFLOW:'other'},{GITHUB_JOB:'other'}]){
  assert.throws(()=>requireWorkerHeartbeatCi({...safe,...patch}),/refuse_non_ephemeral_worker_heartbeat_ci/)
 }
 if(process.platform!=='linux')assert.throws(()=>requireWorkerHeartbeatCi(safe),/refuse_non_ephemeral_worker_heartbeat_ci/)
 // No host/platform override exists. Positive real-host admission belongs to
 // the genuine ephemeral Linux integration, not a manufactured local proof.
})

test('ordinary-machine import and invocation refuse before any runtime or socket import',()=>{
 const modulePath=new URL('./helpers/worker-heartbeat-ci-guard.mjs',import.meta.url).href
 const child=spawnSync(process.execPath,['--input-type=module','-e',`import {requireWorkerHeartbeatCi} from ${JSON.stringify(modulePath)};requireWorkerHeartbeatCi();`],
  {cwd:root,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH??'',CI:'false',GITHUB_ACTIONS:'false',DATABASE_URL:'forbidden://do-not-connect'}})
 assert.equal(child.status,1);assert.match(child.stderr,/refuse_non_ephemeral_pg18_ci/)
 assert.doesNotMatch(child.stdout+child.stderr,/ERR_MODULE_NOT_FOUND|Cannot find|ECONNREFUSED|password authentication failed/)
 const source=readFileSync(new URL('./helpers/worker-heartbeat-ci-guard.mjs',import.meta.url),'utf8')
 assert.match(source,/import \{requireEphemeralPg18Ci\} from/)
 assert.doesNotMatch(source,/import\(['"]pg['"]|from ['"]pg['"]|\bPool\b|\bClient\b|node:net|node:tls|readFile|execFile|spawn/)
})
