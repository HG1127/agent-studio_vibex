// Pure fake-pool transaction acknowledgement tests. No DB, provider or process.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {WorkflowV2Worker} from '../src/workflow-v2-worker.ts'
import {ScheduleRuntimeWorker} from '../src/schedule-runtime-worker.ts'
import {selectNativeLocalDeviceExecution} from '../src/native-local-device-runtime-policy.ts'
import {selectAgentCallerExecution} from '../src/agent-caller-execution-opt-in.ts'

for (const mode of ['workflow_native_v2', 'agent_native_v2']) {
const spec = (name, ...args) => test(mode + ': ' + name, ...args)
class TestWorker extends WorkflowV2Worker {constructor(pool, name) {super(pool, name, {executionMode: mode})}}
const get = name => readFileSync(new URL('../../../db/postgres/' + name, import.meta.url), 'utf8')
const claimSql = get(mode === 'agent_native_v2' ? '009_claim_autonomous_agent.sql' : '008_claim_workflow_v2.sql')
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const workerName = 'prepare_fake'
const lease = extra => ({id: id(1), run_id: id(2), owner_user_id: id(3), kind: mode === 'agent_native_v2' ? 'run_tick' : 'workflow_tick', payload: {phase: mode, graph_sha256: 'a'.repeat(64), ...(mode === 'agent_native_v2' ? {agent_spec_id: id(5), spec_revision: 1} : {workflow_id: id(5), workflow_revision: 1})},
  lease_owner: workerName, lease_token: id(4), lease_version: 1, lease_until: '2030-01-01T00:00:00.000Z', attempts: 1, max_attempts: 3, ...extra})
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no}); return {promise, resolve, reject}}
const bounded = {timeout: 5000}
const counts = worker => {const v = worker.claimAdmissionSnapshot(); return [v.closed, v.pending, v.uncertain]}
const scopeNames = ['knowledge_sharing_enabled', 'knowledge_embedding_settings_enabled', 'knowledge_embedding_consent_enabled',
  'knowledge_index_runtime_enabled', 'knowledge_query_runtime_enabled', 'knowledge_tool_runtime_enabled']
function label(sql) {
  if (sql === claimSql) return 'claim'
  if (sql.startsWith('SELECT j.* FROM agentstudio.jobs j ')) return 'reconcile'
  const scope = scopeNames.find(name => sql.startsWith("SELECT set_config('agentstudio." + name + "'"))
  return scope ? 'scope:' + scope : sql
}
function fakePool(options = {}) {
  const events = new Map(), statements = [], wait = deferred()
  let connections = 0, releases = 0
  const point = name => {if (!events.has(name)) events.set(name, deferred()); return events.get(name)}
  const pool = {async connect() {
    connections++; point('connect').resolve()
    if (options.block === 'connect') await wait.promise
    if (options.connectError) throw options.connectError
    return {query(sql, values = []) {
      statements.push({sql, values}); const name = label(sql); point(name).resolve()
      const answer = () => sql === claimSql ? {rows: options.row === null ? [] : [options.row ?? lease()]} : sql.startsWith('SELECT j.* FROM agentstudio.jobs j ') ? {rows: options.reconcileRow ? [options.reconcileRow] : []} : {rows: []}
      const custom = options.query?.(sql, values)
      if (custom !== undefined) return custom
      return options.block === name ? wait.promise.then(answer) : Promise.resolve(answer())
    }, release() {releases++; if (options.releaseError) throw options.releaseError}}
  }}
  return {pool, statements, wait, reached: name => point(name).promise, connections: () => connections, releases: () => releases}
}

spec('instance creates one fixed mode lane; repeated close and direct public claims cannot bypass it', async () => {
  const h = fakePool(), worker = new TestWorker(h.pool, workerName)
  assert.deepEqual(worker.claimAdmissionSnapshot(), {closed: false, pending: 0, uncertain: 0, lanes: [{lane: mode, pending: 0, uncertain: 0}]})
  worker.closeNewClaims(); worker.closeNewClaims()
  assert.equal(await worker.claim(), null); assert.equal(await worker.claim(300), null)
  assert.equal(h.connections(), 0); assert.deepEqual(counts(worker), [true, 0, 0])
  assert.equal(Object.isFrozen(worker.claimAdmissionSnapshot().lanes[0]), true)
  assert.equal('canDrain' in worker.claimAdmissionSnapshot(), false)
})

spec('stop during pool, BEGIN, every scope SET or role await prevents the matching008/009 SQL', bounded, async () => {
  for (const stage of ['connect', 'BEGIN', ...scopeNames.map(name => 'scope:' + name), 'SET LOCAL ROLE agentstudio_worker']) {
    const h = fakePool({block: stage}), worker = new TestWorker(h.pool, workerName)
    const work = worker.claim(); await h.reached(stage)
    worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 0, 0])
    h.wait.resolve(); assert.equal(await work, null)
    assert.equal(h.statements.some(x => x.sql === claimSql), false, stage)
    assert.equal(h.releases(), 1); assert.deepEqual(counts(worker), [true, 0, 0])
  }
})

spec('an issued claim remains pending while its row is delayed, including after close', bounded, async () => {
  const h = fakePool({block: 'claim'}), worker = new TestWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('claim')
  worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 0])
  h.wait.resolve(); const job = await work
  assert.equal(job.id, id(1)); assert.deepEqual(counts(worker), [true, 0, 0])
  assert.equal(h.statements.filter(x => x.sql === claimSql).length, 1)
  assert.equal(await worker.claim(), null)
})

spec('row validation and delayed COMMIT both retain the same pending intent', bounded, async () => {
  let worker, observed = []
  const row = lease(); Object.defineProperty(row, 'owner_user_id', {get() {observed.push(counts(worker)); return id(3)}})
  const h = fakePool({block: 'COMMIT', row}); worker = new TestWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('COMMIT')
  assert.deepEqual(observed, [[false, 1, 0]])
  worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 0])
  h.wait.resolve(); assert.equal(await work, row)
  assert.deepEqual(counts(worker), [true, 0, 0]); assert.equal(h.releases(), 1)
})

spec('a no-row claim is still tracked until its transaction COMMIT confirms', bounded, async () => {
  const h = fakePool({row: null, block: 'COMMIT'}), worker = new TestWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('COMMIT')
  assert.deepEqual(counts(worker), [false, 1, 0]); h.wait.resolve()
  assert.equal(await work, null); assert.deepEqual(counts(worker), [false, 0, 0])
})

spec('lost COMMIT acknowledgement stays uncertain even through an apparently successful ROLLBACK', bounded, async () => {
  const rollback = deferred(), lost = Error('commit_ack_lost')
  const h = fakePool({query(sql) {if (sql === 'COMMIT') return Promise.reject(lost); if (sql === 'ROLLBACK') return rollback.promise}})
  const worker = new TestWorker(h.pool, workerName), work = worker.claim()
  const rejected = assert.rejects(work, error => error === lost)
  await h.reached('ROLLBACK'); assert.deepEqual(counts(worker), [false, 1, 1])
  worker.closeNewClaims(); worker.closeNewClaims(); rollback.resolve({rows: []}); await rejected
  assert.deepEqual(counts(worker), [true, 1, 1]); assert.equal(h.releases(), 1)
  assert.equal(await worker.claim(), null); assert.deepEqual(counts(worker), [true, 1, 1])
})

spec('a synchronous COMMIT throw is also an attempted commit, not evidence of rollback', async () => {
  const lost = Error('commit_sync_failure')
  const h = fakePool({query(sql) {if (sql === 'COMMIT') throw lost}}), worker = new TestWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), error => error === lost)
  assert.equal(h.statements.some(x => x.sql === 'ROLLBACK'), true)
  assert.deepEqual(counts(worker), [false, 1, 1])
})

spec('a failed pre-COMMIT claim settles only after a real rollback acknowledgement', bounded, async () => {
  const rollback = deferred(), failed = Error('claim_rejected')
  const h = fakePool({query(sql) {if (sql === claimSql) return Promise.reject(failed); if (sql === 'ROLLBACK') return rollback.promise}})
  const worker = new TestWorker(h.pool, workerName), rejected = assert.rejects(worker.claim(), error => error === failed)
  await h.reached('ROLLBACK'); assert.deepEqual(counts(worker), [false, 1, 1])
  assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
  rollback.resolve({rows: []}); await rejected; assert.deepEqual(counts(worker), [false, 0, 0])
})

spec('claim rejection with failed or timed-out ROLLBACK never clears uncertainty in finally', async () => {
  for (const message of ['rollback_rejected', 'rollback_timeout']) {
    const failed = Error('claim_rejected'), h = fakePool({query(sql) {
      if (sql === claimSql) return Promise.reject(failed)
      if (sql === 'ROLLBACK') return Promise.reject(Error(message))
    }}), worker = new TestWorker(h.pool, workerName)
    await assert.rejects(worker.claim(), error => error === failed)
    assert.deepEqual(counts(worker), [false, 1, 1]); assert.equal(h.releases(), 1)
    worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 1])
  }
})

spec('invalid claimed rows roll back before COMMIT, retaining original lease validation', async () => {
  const h = fakePool({row: lease({lease_owner: 'another_worker'})}), worker = new TestWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), /invalid_workflow_v2_claim/)
  assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
  assert.equal(h.statements.some(x => x.sql === 'ROLLBACK'), true)
  assert.deepEqual(counts(worker), [false, 0, 0])
})

spec('connection and pre-dispatch scope failures create no submitted intent', async () => {
  const failed = Error('before_dispatch')
  for (const stage of ['connect', 'BEGIN', 'scope:' + scopeNames[2], 'SET LOCAL ROLE agentstudio_worker']) {
    const h = fakePool({connectError: stage === 'connect' ? failed : undefined,
      query(sql) {if (label(sql) === stage) return Promise.reject(failed)}})
    const worker = new TestWorker(h.pool, workerName)
    await assert.rejects(worker.claim(), error => error === failed)
    assert.deepEqual(counts(worker), [false, 0, 0]); assert.equal(h.statements.some(x => x.sql === claimSql), false)
  }
})


spec('synchronous claim and release errors cannot clear uncertain transactions', async () => {
  const releaseError = Error('release_failure'), h = fakePool({releaseError, query(sql) {
    if (sql === claimSql) throw Error('claim_sync_failure')
    if (sql === 'ROLLBACK') throw Error('rollback_sync_failure')
  }}), worker = new TestWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), error => error === releaseError)
  assert.deepEqual(counts(worker), [false, 1, 1]); worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 1])
})

spec('two concurrent claims retain independent intents through COMMIT after close', bounded, async () => {
  const h = fakePool({block: 'COMMIT'}), worker = new TestWorker(h.pool, workerName)
  const work = [worker.claim(), worker.claim()]
  await h.reached('COMMIT'); await Promise.resolve()
  assert.deepEqual(counts(worker), [false, 2, 0]); worker.closeNewClaims(); h.wait.resolve()
  await Promise.all(work); assert.deepEqual(counts(worker), [true, 0, 0]); assert.equal(h.releases(), 2)
})

spec('stop during reconciliation allows the original cleanup but no subsequent008/009 claim', bounded, async () => {
  for (const reconcileRow of [null, lease()]) {
    const h = fakePool({block: 'reconcile', reconcileRow}), worker = new TestWorker(h.pool, workerName)
    const work = worker.tick(); await h.reached('reconcile'); worker.closeNewClaims(); h.wait.resolve()
    assert.equal((await work).status, reconcileRow ? 'paused' : 'idle')
    assert.equal(h.statements.some(x => x.sql === claimSql), false)
    assert.equal(h.statements.some(x => x.sql.startsWith("UPDATE agentstudio.external_effects SET status='unknown'")), Boolean(reconcileRow))
    assert.deepEqual(counts(worker), [true, 0, 0])
  }
})

spec('held execute and original ambiguous-effect lease finish remain usable after close', async () => {
  const job = lease(), h = fakePool({query(sql) {
    if (sql.startsWith('SELECT id,run_id,owner_user_id,kind,payload,lease_owner,')) return Promise.resolve({rows: [job]})
    if (sql.startsWith('SELECT 1 FROM agentstudio.external_effects ')) return Promise.resolve({rows: [{value: 1}]})
    if (sql.startsWith('UPDATE agentstudio.jobs SET status=$6::text')) return Promise.resolve({rows: [{id: job.id}]})
  }}), worker = new TestWorker(h.pool, workerName)
  assert.equal((await worker.claim()).id, job.id); worker.closeNewClaims()
  assert.deepEqual(await worker.execute(job), {status: 'stale', run_id: job.run_id})
  // TS-private transaction helper is exercised directly to avoid any executor.
  assert.deepEqual(await worker.fail(job, 'synthetic_failure'), {status: 'paused', run_id: job.run_id})
  const ack = h.statements.find(x => x.sql.startsWith('UPDATE agentstudio.jobs SET status=$6::text'))
  assert.deepEqual(ack.values, [job.id, job.owner_user_id, job.lease_token, job.lease_version, workerName, 'failed'])
  assert.equal(h.statements.filter(x => x.sql === claimSql).length, 1)
  assert.deepEqual(counts(worker), [true, 0, 0])
})
}

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no}); return {promise, resolve, reject}}
const counts = worker => {const x = worker.claimAdmissionSnapshot(); return [x.closed, x.pending, x.uncertain]}
const bounded = {timeout: 5000}

test('the unchanged default constructor selects only the workflow V2 lane', () => {
  const worker = new WorkflowV2Worker({async connect() {throw Error('unexpected_query')}}, 'v2_default')
  assert.deepEqual(worker.claimAdmissionSnapshot().lanes.map(x => x.lane), ['workflow_native_v2'])
  worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 0, 0])
})

// Read the real saved CLI function, exclude its dispatcher, and replace every
// dependency by explicit pure mocks. No process, adapters, credentials or SQL run.
function loopHarness(options = {}) {
  let source = stripTypeScriptTypes(readFileSync(new URL('../src/workflow-v2-worker-loop.ts', import.meta.url), 'utf8'))
  assert.equal(source.match(/export function runV2WorkerCli/g)?.length, 1)
  source = source.replace('export function runV2WorkerCli', 'function runV2WorkerCli')
  const cli = source.indexOf('\n  const args=process.argv.slice(2)'); assert.ok(cli > 0); source = source.slice(0, cli) + '\nreturn main\n}'
  const imports = []
  source = source.replace(/^import\s+[\s\S]*?\s+from\s+["']([^"']+)["'];?[ \t]*(?:\r?\n|$)/gm, (_, specifier) => {imports.push(specifier); return ''})
  assert.doesNotMatch(source, /^\s*import\s/m)
  assert.equal(imports.includes('./workflow-v2-worker.ts'), false); assert.equal(imports.includes('./schedule-runtime-worker.ts'), false)
  source = source.replace(/\bimport\((["'])([^"']+)\1\)/g, (_, _quote, specifier) => 'testImport(' + JSON.stringify(specifier) + ')')
  const entered = deferred(), release = deferred(), handlers = new Map(), loaded = [], workers = [], schedulers = [], registrations = [], sleeps = [], logs = []
  let poolEnds = 0, workerTicks = 0, schedulerTicks = 0
  const emit = name => {const fn = handlers.get(name); assert.equal(typeof fn, 'function'); handlers.delete(name); fn()}
  const stage = async name => {if (options.stage === name) {entered.resolve(); await release.promise}}
  const inspect = async name => {await stage(name); return true}
  class Pool {async connect() {throw Error('unexpected_loop_sql')}; async end() {poolEnds++}}
  class Worker extends WorkflowV2Worker {
    constructor(...args) {super(...args); workers.push(this); options.onWorkerConstruct?.(emit, this)}
    async tick() {workerTicks++; await options.onWorkerTick?.(emit, this); return {status: 'idle'}}
  }
  class Scheduler extends ScheduleRuntimeWorker {
    constructor(...args) {super(...args); schedulers.push(this); options.onScheduleConstruct?.(emit, this)}
    async tick() {schedulerTicks++; await stage('scheduler_tick'); await options.onScheduleTick?.(emit, this); return {status: 'idle'}}
  }
  const identityPool = value => value
  const context = {
    process: {env: {AGENT_STUDIO_PG_PILOT_ENABLED: 'true', AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_ENABLED: 'true',
      AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_APPROVED: 'APPROVE_ISOLATED_PG_WORKFLOW_V2_RUNTIME_ONLY',
      AGENT_STUDIO_PG_WORKER_PASSWORD_FILE: '/synthetic/worker.secret', AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT: 'synthetic'},
      argv: ['node', 'fixture', '--serve'], once(name, fn) {registrations.push(name); handlers.set(name, fn)},
      stdout: {write(line) {logs.push(line); if (line.includes('"state":"ready"')) options.onReady?.(emit)}}, stderr: {write: line => logs.push(line)}},
    readFileSync: () => 'SyntheticV2ClaimOnlyPassword#0123456789', lstatSync: () => ({isFile: () => true, isSymbolicLink: () => false, size: 64}),
    accessSync() {}, constants: {R_OK: 4}, randomUUID: () => id(9), sleep: async ms => {sleeps.push(ms)},
    selectWorkflowV2ModelExecution: () => true, selectWorkflowV2ToolExecution: () => true, selectKnowledgeToolRuntime: () => true,
    selectScheduleRuntime: () => options.schedule !== false, selectAutonomousAgentExecution: () => true, selectWorkflowAgentExecution: () => false,
    selectAgentMemoryRuntime: () => false, selectAgentOutcomeMemoryWrites: () => false, selectMcpExecution: () => false,
    selectNativeLocalDeviceExecution,
    selectAgentCallerExecution,
    verifyNativeLocalDeviceSchema: () => {throw Error('unexpected_local_device_schema_in_original_claim_fixture')},
    selectKnowledgeSharing: () => true, selectPgRuntimeTarget: () => ({mode: 'baota_pg18', host: 'fake', port: 0, user: 'fake', database: 'fake'}),
    assertPgWorkerActivation() {}, assertPg18WorkerCredentialBinding() {}, assertPg18CredentialMetadata() {}, pgWorkerOfflinePlan() {return {}},
    scopedKnowledgeToolPool: identityPool, scopedKnowledgeQueryPool: identityPool, scopedEmbeddingConsentPool: identityPool, scopedEmbeddingSettingsPool: identityPool,
    verifyPgRuntimeTarget: () => stage('target'), verifyPgWorkerRoleBoundary: () => stage('role'), verifyWorkflowSampleLineageSchema: () => stage('lineage'),
    verifyScheduleRuntimeSchema: () => stage('schedule_schema'), verifyKnowledgeRuntimeSchema: () => stage('knowledge'), verifyKnowledgeToolSchema: () => stage('knowledge_tool'),
    inspectAgentHumanInputSchema: () => inspect('human'), inspectAgentMemorySchema: () => inspect('memory'), inspectAgentMemoryContextSchema: () => inspect('memory_context'),
    inspectAgentMemoryOutcomeSchema: () => inspect('outcome'), inspectAgentMemoryFailureSourceSchema: () => inspect('failure_source'),
    readBoundRuntimeCredential: () => 'synthetic', workflowV2ModelEffectExecutor: () => ({supports: () => false, execute() {throw Error('unexpected_provider')}}),
    workflowV2ToolEffectExecutor: () => ({supports: () => false, execute() {throw Error('unexpected_tool')}}),
    async testImport(specifier) {
      loaded.push(specifier)
      if (specifier === 'pg') {await stage('driver'); return {Pool}}
      if (specifier === './workflow-v2-worker.ts') {await stage('worker_import'); return {WorkflowV2Worker: Worker}}
      if (specifier === './schedule-runtime-worker.ts') {await stage('schedule_import'); return {ScheduleRuntimeWorker: Scheduler}}
      throw Error('unexpected_loop_fixture_import: ' + specifier)
    },
  }
  const main = runInNewContext(source + '\nrunV2WorkerCli', context, {timeout: 1000})(options.autonomous === true)
  return {main, entered, release, emit, loaded, workers, schedulers, registrations, sleeps, logs,
    poolEnds: () => poolEnds, workerTicks: () => workerTicks, schedulerTicks: () => schedulerTicks}
}

test('V2 startup await signals are latched before either execution Worker can claim', bounded, async () => {
  for (const stage of ['driver', 'target', 'role', 'lineage', 'schedule_schema', 'knowledge', 'knowledge_tool', 'human', 'memory', 'memory_context', 'outcome', 'failure_source', 'worker_import', 'schedule_import']) {
    const h = loopHarness({stage}), work = h.main('serve'); await h.entered.promise; h.emit('SIGTERM'); h.release.resolve(); await work
    assert.equal(h.workerTicks(), 0); assert.equal(h.schedulerTicks(), 0); assert.equal(h.poolEnds(), 1)
    assert.deepEqual(counts(h.workers[0]), [true, 0, 0]); assert.deepEqual(h.registrations, ['SIGTERM', 'SIGINT'])
    assert.equal(h.logs.some(line => line.includes('"state":"ready"')), false)
  }
})

test('signals during both constructors and an active worker synchronously close existing instances', bounded, async () => {
  const early = loopHarness({onWorkerConstruct: emit => emit('SIGTERM')}); await early.main('serve')
  assert.deepEqual(counts(early.workers[0]), [true, 0, 0]); assert.equal(early.schedulers.length, 0)
  const scheduler = loopHarness({onScheduleConstruct: emit => emit('SIGINT')}); await scheduler.main('serve')
  assert.deepEqual(counts(scheduler.workers[0]), [true, 0, 0]); assert.deepEqual(counts(scheduler.schedulers[0]), [true, 0, 0])
  const active = loopHarness({onWorkerTick(emit, worker) {emit('SIGTERM'); assert.deepEqual(counts(worker), [true, 0, 0])}})
  await active.main('serve'); assert.equal(active.workerTicks(), 1); assert.deepEqual(counts(active.schedulers[0]), [true, 0, 0]); assert.deepEqual(active.sleeps, [])
})

test('stop while awaiting scheduler tick prevents the following workflow claim', bounded, async () => {
  const h = loopHarness({stage: 'scheduler_tick'}), work = h.main('serve')
  await h.entered.promise; h.emit('SIGINT')
  assert.deepEqual(counts(h.workers[0]), [true, 0, 0]); assert.deepEqual(counts(h.schedulers[0]), [true, 0, 0])
  h.release.resolve(); await work; assert.equal(h.workerTicks(), 0); assert.equal(h.schedulerTicks(), 1); assert.deepEqual(h.sleeps, [])
})

test('autonomous mode without scheduler closes before tick and preflight imports no execution sources', bounded, async () => {
  const h = loopHarness({autonomous: true, onReady: emit => emit('SIGTERM')}); await h.main('serve')
  assert.equal(h.schedulers.length, 0); assert.equal(h.workerTicks(), 0); assert.equal(h.loaded.includes('./schedule-runtime-worker.ts'), false)
  assert.deepEqual(h.workers[0].claimAdmissionSnapshot().lanes.map(x => x.lane), ['agent_native_v2'])
  for (const autonomous of [false, true]) {
    const p = loopHarness({autonomous}); await p.main('preflight')
    assert.deepEqual(p.loaded, ['pg']); assert.equal(p.workers.length, 0); assert.equal(p.schedulers.length, 0); assert.equal(p.poolEnds(), 1)
  }
})
