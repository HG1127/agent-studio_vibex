// Pure scheduling/transaction-ack tests. SQL strings are only recorded by a
// fake pool. No PG/PGlite, Worker process, credential file or network is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {AgentModelWorker} from '../src/model-worker.ts'

let providerCalls = 0
const provider = {async generate() {providerCalls++; throw Error('unexpected_provider_execution')}}
class TestWorker extends AgentModelWorker {constructor(pool, name) {super(pool, name, provider)}}
test.after(() => assert.equal(providerCalls, 0))

const get = name => readFileSync(new URL('../../../db/postgres/' + name, import.meta.url), 'utf8')
const claimSql = get('006_claim_agent_model.sql'), finishSql = get('003_finish_job.sql')
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const workerName = 'model_fake'
const lease = extra => ({id: id(1), run_id: id(2), owner_user_id: id(3), kind: 'run_tick', payload: {phase: 'model', spec_revision: 1},
  lease_owner: workerName, lease_token: id(4), lease_version: 1, lease_until: '2030-01-01T00:00:00.000Z', attempts: 1, max_attempts: 3, ...extra})
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no}); return {promise, resolve, reject}}
const bounded = {timeout: 5000}
const counts = worker => {const v = worker.claimAdmissionSnapshot(); return [v.closed, v.pending, v.uncertain]}
const scopeNames = ['knowledge_sharing_enabled', 'knowledge_embedding_settings_enabled', 'knowledge_embedding_consent_enabled',
  'knowledge_index_runtime_enabled', 'knowledge_query_runtime_enabled', 'knowledge_tool_runtime_enabled']
function label(sql) {
  if (sql === claimSql) return 'claim'
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
      const answer = () => sql === claimSql ? {rows: options.row === null ? [] : [options.row ?? lease()]} : {rows: []}
      const custom = options.query?.(sql, values)
      if (custom !== undefined) return custom
      return options.block === name ? wait.promise.then(answer) : Promise.resolve(answer())
    }, release() {releases++; if (options.releaseError) throw options.releaseError}}
  }}
  return {pool, statements, wait, reached: name => point(name).promise, connections: () => connections, releases: () => releases}
}

test('default constructor creates one model lane; repeated close and direct public claims cannot bypass it', async () => {
  const h = fakePool(), worker = new TestWorker(h.pool, workerName)
  assert.deepEqual(worker.claimAdmissionSnapshot(), {closed: false, pending: 0, uncertain: 0, lanes: [{lane: 'model', pending: 0, uncertain: 0}]})
  worker.closeNewClaims(); worker.closeNewClaims()
  assert.equal(await worker.claim(), null); assert.equal(await worker.claim(300), null)
  assert.equal(h.connections(), 0); assert.deepEqual(counts(worker), [true, 0, 0])
  assert.equal(Object.isFrozen(worker.claimAdmissionSnapshot().lanes[0]), true)
  assert.equal('canDrain' in worker.claimAdmissionSnapshot(), false)
  await assert.rejects(worker.claim(1), /invalid_model_lease/)
})

test('stop during pool, BEGIN, every scope SET or role await prevents the original claim SQL', bounded, async () => {
  for (const stage of ['connect', 'BEGIN', ...scopeNames.map(name => 'scope:' + name), 'SET LOCAL ROLE agentstudio_worker']) {
    const h = fakePool({block: stage}), worker = new TestWorker(h.pool, workerName)
    const work = worker.claim(); await h.reached(stage)
    worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 0, 0])
    h.wait.resolve(); assert.equal(await work, null)
    assert.equal(h.statements.some(x => x.sql === claimSql), false, stage)
    assert.equal(h.releases(), 1); assert.deepEqual(counts(worker), [true, 0, 0])
  }
})

test('an issued claim remains pending while its row is delayed, including after close', bounded, async () => {
  const h = fakePool({block: 'claim'}), worker = new TestWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('claim')
  worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 0])
  h.wait.resolve(); const job = await work
  assert.equal(job.id, id(1)); assert.deepEqual(counts(worker), [true, 0, 0])
  assert.equal(h.statements.filter(x => x.sql === claimSql).length, 1)
  assert.equal(await worker.claim(), null)
})

test('row validation and delayed COMMIT both retain the same pending intent', bounded, async () => {
  let worker, observed = []
  const row = lease(); Object.defineProperty(row, 'owner_user_id', {get() {observed.push(counts(worker)); return id(3)}})
  const h = fakePool({block: 'COMMIT', row}); worker = new TestWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('COMMIT')
  assert.deepEqual(observed, [[false, 1, 0]])
  worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 0])
  h.wait.resolve(); assert.equal(await work, row)
  assert.deepEqual(counts(worker), [true, 0, 0]); assert.equal(h.releases(), 1)
})

test('a no-row claim is still tracked until its transaction COMMIT confirms', bounded, async () => {
  const h = fakePool({row: null, block: 'COMMIT'}), worker = new TestWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('COMMIT')
  assert.deepEqual(counts(worker), [false, 1, 0]); h.wait.resolve()
  assert.equal(await work, null); assert.deepEqual(counts(worker), [false, 0, 0])
})

test('lost COMMIT acknowledgement stays uncertain even through an apparently successful ROLLBACK', bounded, async () => {
  const rollback = deferred(), lost = Error('commit_ack_lost')
  const h = fakePool({query(sql) {if (sql === 'COMMIT') return Promise.reject(lost); if (sql === 'ROLLBACK') return rollback.promise}})
  const worker = new TestWorker(h.pool, workerName), work = worker.claim()
  const rejected = assert.rejects(work, error => error === lost)
  await h.reached('ROLLBACK'); assert.deepEqual(counts(worker), [false, 1, 1])
  worker.closeNewClaims(); worker.closeNewClaims(); rollback.resolve({rows: []}); await rejected
  assert.deepEqual(counts(worker), [true, 1, 1]); assert.equal(h.releases(), 1)
  assert.equal(await worker.claim(), null); assert.deepEqual(counts(worker), [true, 1, 1])
})

test('a synchronous COMMIT throw is also an attempted commit, not evidence of rollback', async () => {
  const lost = Error('commit_sync_failure')
  const h = fakePool({query(sql) {if (sql === 'COMMIT') throw lost}}), worker = new TestWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), error => error === lost)
  assert.equal(h.statements.some(x => x.sql === 'ROLLBACK'), true)
  assert.deepEqual(counts(worker), [false, 1, 1])
})

test('a failed pre-COMMIT claim settles only after a real rollback acknowledgement', bounded, async () => {
  const rollback = deferred(), failed = Error('claim_rejected')
  const h = fakePool({query(sql) {if (sql === claimSql) return Promise.reject(failed); if (sql === 'ROLLBACK') return rollback.promise}})
  const worker = new TestWorker(h.pool, workerName), rejected = assert.rejects(worker.claim(), error => error === failed)
  await h.reached('ROLLBACK'); assert.deepEqual(counts(worker), [false, 1, 1])
  assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
  rollback.resolve({rows: []}); await rejected; assert.deepEqual(counts(worker), [false, 0, 0])
})

test('claim rejection with failed or timed-out ROLLBACK never clears uncertainty in finally', async () => {
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

test('invalid claimed rows roll back before COMMIT, retaining original lease validation', async () => {
  const h = fakePool({row: lease({lease_owner: 'another_worker'})}), worker = new TestWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), /invalid_model_claim/)
  assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
  assert.equal(h.statements.some(x => x.sql === 'ROLLBACK'), true)
  assert.deepEqual(counts(worker), [false, 0, 0])
})

test('connection and pre-dispatch scope failures create no submitted intent', async () => {
  const failed = Error('before_dispatch')
  for (const stage of ['connect', 'BEGIN', 'scope:' + scopeNames[2], 'SET LOCAL ROLE agentstudio_worker']) {
    const h = fakePool({connectError: stage === 'connect' ? failed : undefined,
      query(sql) {if (label(sql) === stage) return Promise.reject(failed)}})
    const worker = new TestWorker(h.pool, workerName)
    await assert.rejects(worker.claim(), error => error === failed)
    assert.deepEqual(counts(worker), [false, 0, 0]); assert.equal(h.statements.some(x => x.sql === claimSql), false)
  }
})


test('synchronous claim throws and failed rollback retain uncertainty through release errors', async () => {
  const claimError = Error('claim_sync_failure'), releaseError = Error('release_failure')
  const h = fakePool({releaseError, query(sql) {
    if (sql === claimSql) throw claimError
    if (sql === 'ROLLBACK') throw Error('rollback_sync_failure')
  }}), worker = new TestWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), error => error === releaseError)
  assert.deepEqual(counts(worker), [false, 1, 1]); assert.equal(h.releases(), 1)
  worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 1])
})

test('a release failure cannot clear a lost COMMIT acknowledgement', async () => {
  const releaseError = Error('release_failure')
  const h = fakePool({releaseError, query(sql) {if (sql === 'COMMIT') return Promise.reject(Error('commit_ack_lost'))}})
  const worker = new TestWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), error => error === releaseError)
  assert.deepEqual(counts(worker), [false, 1, 1])
})

test('concurrent public claims count independently and instances cannot close each other', bounded, async () => {
  const h = fakePool({block: 'COMMIT'}), worker = new TestWorker(h.pool, workerName)
  const work = [worker.claim(), worker.claim()]
  await h.reached('COMMIT'); await Promise.resolve()
  assert.deepEqual(counts(worker), [false, 2, 0])
  const other = new TestWorker(fakePool().pool, workerName)
  worker.closeNewClaims(); assert.deepEqual(counts(other), [false, 0, 0])
  h.wait.resolve(); await Promise.all(work)
  assert.deepEqual(counts(worker), [true, 0, 0]); assert.equal(h.releases(), 2)
})

test('closing claims preserves the held-job result, quarantine, and both original sweep paths without provider calls', async () => {
  const job = lease(), h = fakePool({row: job, query(sql) {
    if (sql.startsWith("SELECT to_regclass('agentstudio.knowledge_agent_observations') IS NOT NULL OR ")) return Promise.resolve({rows: [{installed: false}]})
    if (sql.startsWith('SELECT id,run_id,owner_user_id,kind,payload,lease_owner,')) return Promise.resolve({rows: [job]})
    if ((sql.startsWith('UPDATE agentstudio.external_effects ') && sql.includes('RETURNING run_id')) ||
        (sql.startsWith('UPDATE agentstudio.run_steps ') && sql.includes('RETURNING id')) ||
        (sql.startsWith('UPDATE agentstudio.runs ') && sql.includes('RETURNING id'))) return Promise.resolve({rows: [{id: job.run_id, run_id: job.run_id}]})
    if (sql === finishSql) return Promise.resolve({rows: [{id: job.id}]})
  }}), worker = new TestWorker(h.pool, workerName)
  assert.equal(await worker.claim(), job); worker.closeNewClaims()
  assert.deepEqual(await worker.succeed(job, 'Synthetic already-held result'), {status: 'succeeded', run_id: job.run_id})
  assert.deepEqual(await worker.unknown(job), {status: 'quarantined', run_id: job.run_id})
  assert.equal(await worker.sweepAmbiguous(), null); assert.equal(await worker.sweepUnstartedExhausted(), null)
  assert.equal(h.statements.filter(x => x.sql === claimSql).length, 1)
  assert.deepEqual(h.statements.filter(x => x.sql === finishSql).map(x => x.values), [
    [job.id, job.lease_token, job.lease_version, workerName, 'succeeded'],
    [job.id, job.lease_token, job.lease_version, workerName, 'failed']])
  assert.equal(providerCalls, 0); assert.deepEqual(counts(worker), [true, 0, 0]); assert.equal(h.releases(), 5)
})

test('the model kind and phase restrictions still reject malformed claims', async () => {
  for (const row of [lease({kind: 'workflow_tick'}), lease({payload: {phase: 'prepare'}}), lease({lease_version: 0})]) {
    const h = fakePool({row}), worker = new TestWorker(h.pool, workerName)
    await assert.rejects(worker.claim(), /invalid_model_claim/)
    assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false); assert.deepEqual(counts(worker), [false, 0, 0])
  }
})

// Evaluate the saved loop's main with explicit pure dependency mocks. The CLI
// dispatcher is excluded, no Worker process is spawned and no provider is called.
function loopHarness(options = {}) {
  let source = stripTypeScriptTypes(readFileSync(new URL('../src/model-worker-loop.ts', import.meta.url), 'utf8')).replace(/^#![^\n]*\n/, '')
  const cli = source.indexOf('\nconst launchArgs='); assert.ok(cli > 0); source = source.slice(0, cli)
  const imports = []
  source = source.replace(/^import\s+[\s\S]*?\s+from\s+["']([^"']+)["'];?[ \t]*(?:\r?\n|$)/gm, (_, specifier) => {imports.push(specifier); return ''})
  assert.doesNotMatch(source, /^\s*import\s/m)
  assert.ok(imports.includes('./worker-activation-guard.ts'))
  assert.equal(imports.some(name => /(?:model-worker|model-provider|bound-model-worker-runtime|workflow-safe-worker)\.ts$/.test(name)), false)
  source = source.replace(/\bimport\((["'])([^"']+)\1\)/g, (_, _quote, specifier) => 'testImport(' + JSON.stringify(specifier) + ')')
  const entered = deferred(), release = deferred(), handlers = new Map(), registrations = [], loaded = [], workers = [], logs = [], sleeps = []
  let poolEnds = 0, ticks = 0, readonlyCalls = 0, providerConstructions = 0
  const emit = name => {const fn = handlers.get(name); assert.equal(typeof fn, 'function'); handlers.delete(name); fn()}
  const stage = async name => {if (options.stage === name) {entered.resolve(); await release.promise}}
  class Pool {
    async connect() {throw Error('unexpected_query_in_loop_fixture')}
    async end() {poolEnds++}
  }
  class Worker extends AgentModelWorker {
    constructor(...args) {super(...args); workers.push(this); options.onConstruct?.(emit, this)}
    async tick() {ticks++; if (options.onTick) await options.onTick(emit, this); return {status: 'idle'}}
  }
  const env = {AGENT_STUDIO_PG_PILOT_ENABLED: 'true', AGENT_STUDIO_PG_MODEL_WORKER_ENABLED: 'true',
    
    AGENT_STUDIO_PG_WORKER_PASSWORD_FILE: '/synthetic/worker.secret', ...(options.pg18 ? {AGENT_STUDIO_PG_BAOTA18_ENABLED: 'true'} : {})}
  const context = {
    process: {env, argv: ['node', 'fixture', '--serve'], once(name, fn) {registrations.push(name); handlers.set(name, fn)},
      stdout: {write: line => logs.push(line)}, stderr: {write: line => logs.push(line)}},
    readFileSync: () => 'SyntheticClaimOnlyPassword#0123456789', lstatSync: () => ({isFile: () => true, isSymbolicLink: () => false, size: 64}),
    accessSync() {}, constants: {R_OK: 4}, randomUUID: () => id(9), sleep: async ms => {sleeps.push(ms)},
    selectKnowledgeSharing: () => true, selectPgRuntimeTarget: () => ({mode: 'baota_pg18', host: 'fake', port: 0, user: 'fake', database: 'fake'}),
    assertPgWorkerActivation() {}, assertPg18WorkerCredentialBinding() {}, assertPg18CredentialMetadata() {}, pgWorkerOfflinePlan() {return {}},
    verifyPgRuntimeTarget: () => stage('target'), verifyPgWorkerRoleBoundary: () => stage('role'), verifyKnowledgeRuntimeSchema: () => stage('knowledge'),
    verifyKnowledgeAgentSchema: () => stage('knowledge_agent'), verifyWorkflowSampleLineageSchema: () => stage('workflow_lineage'),
    async testImport(specifier) {
      loaded.push(specifier)
      if (specifier === 'pg') {await stage('driver'); return {Pool}}
      if (specifier === './model-worker.ts') {await stage('worker_import'); return {AgentModelWorker: Worker}}
      if (specifier === './model-provider.ts') {await stage('provider_import'); return {createStagingOpenAIProvider() {providerConstructions++; return provider}}}
      if (specifier === './bound-model-worker-runtime.ts') {await stage('transport_import'); return {
        selectBoundModelWorkerMode: () => options.bound ? 'bound' : 'staging',
        createApprovedBoundModelWorkerDispatch: () => async () => {throw Error('unexpected_bound_dispatch')}}}
      if (specifier === './pg18-native-worker-readonly.ts') return {runPg18NativeWorkerReadonlyPreflight: async () => {readonlyCalls++}}
      throw Error('unexpected_loop_fixture_import: ' + specifier)
    },
  }
  const main = runInNewContext(source + '\nmain', context, {timeout: 1000})
  return {main, entered, release, emit, loaded, workers, logs, sleeps, registrations, poolEnds: () => poolEnds, ticks: () => ticks,
    readonlyCalls: () => readonlyCalls, providerConstructions: () => providerConstructions}
}

test('startup awaits latch stop and close a subsequently constructed Worker before its first tick', bounded, async () => {
  for (const stage of ['driver', 'target', 'role', 'knowledge_agent', 'workflow_lineage', 'knowledge', 'worker_import', 'provider_import', 'transport_import']) {
    const h = loopHarness({stage}), work = h.main(false)
    await h.entered.promise; assert.equal(h.workers.length, 0); h.emit('SIGTERM'); h.release.resolve(); await work
    assert.equal(h.workers.length, 1); assert.deepEqual(counts(h.workers[0]), [true, 0, 0])
    assert.equal(h.ticks(), 0); assert.equal(h.poolEnds(), 1)
    assert.deepEqual(h.registrations, ['SIGTERM', 'SIGINT']); assert.deepEqual(h.sleeps, [])
    assert.equal(h.logs.some(line => line.includes('"state":"ready"')), false)
  }
})

test('construction-time and active-loop signals synchronously close new claims', bounded, async () => {
  const early = loopHarness({onConstruct: emit => emit('SIGTERM')}); await early.main(false)
  assert.deepEqual(counts(early.workers[0]), [true, 0, 0]); assert.equal(early.ticks(), 0)
  const active = loopHarness({onTick(emit, worker) {emit('SIGINT'); assert.deepEqual(counts(worker), [true, 0, 0])}})
  await active.main(false); assert.equal(active.ticks(), 1); assert.deepEqual(active.sleeps, [900]); assert.equal(active.poolEnds(), 1)
})

test('both model preflight branches avoid Worker, claim SQL, provider and bound transport imports', bounded, async () => {
  for (const pg18 of [false, true]) {
    const h = loopHarness({pg18}); await h.main(true)
    assert.equal(h.workers.length, 0); assert.equal(h.ticks(), 0); assert.equal(h.providerConstructions(), 0)
    assert.deepEqual(h.loaded, pg18 ? ['./pg18-native-worker-readonly.ts'] : ['pg'])
    if (pg18) assert.equal(h.readonlyCalls(), 1); else assert.equal(h.poolEnds(), 1)
  }
})

test('the owner-bound loop also latches stop without constructing a staging provider', bounded, async () => {
  const h = loopHarness({bound: true, onConstruct: emit => emit('SIGINT')}); await h.main(false)
  assert.equal(h.providerConstructions(), 0); assert.equal(h.ticks(), 0); assert.deepEqual(counts(h.workers[0]), [true, 0, 0])
})
