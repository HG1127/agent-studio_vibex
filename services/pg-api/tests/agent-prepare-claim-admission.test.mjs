// Pure scheduling/transaction-ack tests. SQL strings are only recorded by a
// fake pool. No PG/PGlite, Worker process, credential file or network is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {AgentPrepareWorker} from '../src/agent-worker.ts'

const get = name => readFileSync(new URL('../../../db/postgres/' + name, import.meta.url), 'utf8')
const claimSql = get('005_claim_agent_prepare.sql'), finishSql = get('003_finish_job.sql'), retrySql = get('004_retry_job.sql')
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const workerName = 'prepare_fake'
const lease = extra => ({id: id(1), run_id: id(2), owner_user_id: id(3), kind: 'run_tick', payload: {phase: 'prepare', spec_revision: 1},
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
    }, release() {releases++}}
  }}
  return {pool, statements, wait, reached: name => point(name).promise, connections: () => connections, releases: () => releases}
}

test('default constructor creates one prepare lane; repeated close and direct public claims cannot bypass it', async () => {
  const h = fakePool(), worker = new AgentPrepareWorker(h.pool, workerName)
  assert.deepEqual(worker.claimAdmissionSnapshot(), {closed: false, pending: 0, uncertain: 0, lanes: [{lane: 'prepare', pending: 0, uncertain: 0}]})
  worker.closeNewClaims(); worker.closeNewClaims()
  assert.equal(await worker.claim(), null); assert.equal(await worker.claim(300), null)
  assert.equal(h.connections(), 0); assert.deepEqual(counts(worker), [true, 0, 0])
  assert.equal(Object.isFrozen(worker.claimAdmissionSnapshot().lanes[0]), true)
  assert.equal('canDrain' in worker.claimAdmissionSnapshot(), false)
  await assert.rejects(worker.claim(1), /invalid_lease_duration/)
})

test('stop during pool, BEGIN, every scope SET or role await prevents the real005 SQL', bounded, async () => {
  for (const stage of ['connect', 'BEGIN', ...scopeNames.map(name => 'scope:' + name), 'SET LOCAL ROLE agentstudio_worker']) {
    const h = fakePool({block: stage}), worker = new AgentPrepareWorker(h.pool, workerName)
    const work = worker.claim(); await h.reached(stage)
    worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 0, 0])
    h.wait.resolve(); assert.equal(await work, null)
    assert.equal(h.statements.some(x => x.sql === claimSql), false, stage)
    assert.equal(h.releases(), 1); assert.deepEqual(counts(worker), [true, 0, 0])
  }
})

test('an issued claim remains pending while its row is delayed, including after close', bounded, async () => {
  const h = fakePool({block: 'claim'}), worker = new AgentPrepareWorker(h.pool, workerName)
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
  const h = fakePool({block: 'COMMIT', row}); worker = new AgentPrepareWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('COMMIT')
  assert.deepEqual(observed, [[false, 1, 0]])
  worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 0])
  h.wait.resolve(); assert.equal(await work, row)
  assert.deepEqual(counts(worker), [true, 0, 0]); assert.equal(h.releases(), 1)
})

test('a no-row claim is still tracked until its transaction COMMIT confirms', bounded, async () => {
  const h = fakePool({row: null, block: 'COMMIT'}), worker = new AgentPrepareWorker(h.pool, workerName)
  const work = worker.claim(); await h.reached('COMMIT')
  assert.deepEqual(counts(worker), [false, 1, 0]); h.wait.resolve()
  assert.equal(await work, null); assert.deepEqual(counts(worker), [false, 0, 0])
})

test('lost COMMIT acknowledgement stays uncertain even through an apparently successful ROLLBACK', bounded, async () => {
  const rollback = deferred(), lost = Error('commit_ack_lost')
  const h = fakePool({query(sql) {if (sql === 'COMMIT') return Promise.reject(lost); if (sql === 'ROLLBACK') return rollback.promise}})
  const worker = new AgentPrepareWorker(h.pool, workerName), work = worker.claim()
  const rejected = assert.rejects(work, error => error === lost)
  await h.reached('ROLLBACK'); assert.deepEqual(counts(worker), [false, 1, 1])
  worker.closeNewClaims(); worker.closeNewClaims(); rollback.resolve({rows: []}); await rejected
  assert.deepEqual(counts(worker), [true, 1, 1]); assert.equal(h.releases(), 1)
  assert.equal(await worker.claim(), null); assert.deepEqual(counts(worker), [true, 1, 1])
})

test('a synchronous COMMIT throw is also an attempted commit, not evidence of rollback', async () => {
  const lost = Error('commit_sync_failure')
  const h = fakePool({query(sql) {if (sql === 'COMMIT') throw lost}}), worker = new AgentPrepareWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), error => error === lost)
  assert.equal(h.statements.some(x => x.sql === 'ROLLBACK'), true)
  assert.deepEqual(counts(worker), [false, 1, 1])
})

test('a failed pre-COMMIT claim settles only after a real rollback acknowledgement', bounded, async () => {
  const rollback = deferred(), failed = Error('claim_rejected')
  const h = fakePool({query(sql) {if (sql === claimSql) return Promise.reject(failed); if (sql === 'ROLLBACK') return rollback.promise}})
  const worker = new AgentPrepareWorker(h.pool, workerName), rejected = assert.rejects(worker.claim(), error => error === failed)
  await h.reached('ROLLBACK'); assert.deepEqual(counts(worker), [false, 1, 1])
  assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
  rollback.resolve({rows: []}); await rejected; assert.deepEqual(counts(worker), [false, 0, 0])
})

test('claim rejection with failed or timed-out ROLLBACK never clears uncertainty in finally', async () => {
  for (const message of ['rollback_rejected', 'rollback_timeout']) {
    const failed = Error('claim_rejected'), h = fakePool({query(sql) {
      if (sql === claimSql) return Promise.reject(failed)
      if (sql === 'ROLLBACK') return Promise.reject(Error(message))
    }}), worker = new AgentPrepareWorker(h.pool, workerName)
    await assert.rejects(worker.claim(), error => error === failed)
    assert.deepEqual(counts(worker), [false, 1, 1]); assert.equal(h.releases(), 1)
    worker.closeNewClaims(); assert.deepEqual(counts(worker), [true, 1, 1])
  }
})

test('invalid claimed rows roll back before COMMIT, retaining original lease validation', async () => {
  const h = fakePool({row: lease({lease_owner: 'another_worker'})}), worker = new AgentPrepareWorker(h.pool, workerName)
  await assert.rejects(worker.claim(), /invalid_claim_payload/)
  assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
  assert.equal(h.statements.some(x => x.sql === 'ROLLBACK'), true)
  assert.deepEqual(counts(worker), [false, 0, 0])
})

test('connection and pre-dispatch scope failures create no submitted intent', async () => {
  const failed = Error('before_dispatch')
  for (const stage of ['connect', 'BEGIN', 'scope:' + scopeNames[2], 'SET LOCAL ROLE agentstudio_worker']) {
    const h = fakePool({connectError: stage === 'connect' ? failed : undefined,
      query(sql) {if (label(sql) === stage) return Promise.reject(failed)}})
    const worker = new AgentPrepareWorker(h.pool, workerName)
    await assert.rejects(worker.claim(), error => error === failed)
    assert.deepEqual(counts(worker), [false, 0, 0]); assert.equal(h.statements.some(x => x.sql === claimSql), false)
  }
})

test('closing new claims preserves original owned prepare, finish, retry and sweep paths', async () => {
  const job = lease(), h = fakePool({row: job, query(sql) {
    if (sql.startsWith('SELECT id,run_id,owner_user_id,kind,payload,lease_owner,')) return Promise.resolve({rows: [job]})
    if (sql.startsWith('SELECT id,agent_spec_id,status FROM agentstudio.runs')) return Promise.resolve({rows: [{id: job.run_id, agent_spec_id: id(5), status: 'queued'}]})
    if (sql.startsWith('SELECT revision FROM agentstudio.agent_specs')) return Promise.resolve({rows: [{revision: 1}]})
    if (sql.startsWith('INSERT INTO agentstudio.run_steps') || sql.startsWith('INSERT INTO agentstudio.approvals') || sql.startsWith('UPDATE agentstudio.runs ')) return Promise.resolve({rows: [{id: id(6)}]})
    if (sql === finishSql || sql === retrySql) return Promise.resolve({rows: [{id: job.id}]})
  }}), worker = new AgentPrepareWorker(h.pool, workerName)
  assert.equal(await worker.claim(), job); worker.closeNewClaims()
  assert.deepEqual(await worker.prepare(job), {status: 'prepared', run_id: job.run_id})
  assert.deepEqual(await worker.resolveFailure(job), {status: 'retry_scheduled', run_id: job.run_id})
  assert.equal(await worker.sweepExhausted(), null)
  assert.equal(h.statements.filter(x => x.sql === claimSql).length, 1)
  assert.equal(h.statements.some(x => x.sql === finishSql), true); assert.equal(h.statements.some(x => x.sql === retrySql), true)
  const finished = h.statements.find(x => x.sql === finishSql)
  assert.deepEqual(finished.values, [job.id, job.lease_token, job.lease_version, workerName, 'succeeded'])
  assert.deepEqual(counts(worker), [true, 0, 0]); assert.equal(h.releases(), 4)
})

// Evaluate the actual loop's main function with dependency imports replaced by
// explicit pure mocks. CLI dispatch is not evaluated; no process is spawned.
function loopHarness(options = {}) {
  let source = stripTypeScriptTypes(readFileSync(new URL('../src/worker-loop.ts', import.meta.url), 'utf8')).replace(/^#![^\n]*\n/, '')
  const cli = source.indexOf('\nconst launchArgs='); assert.ok(cli > 0); source = source.slice(0, cli)
  const imports = []
  source = source.replace(/^import\s+[\s\S]*?\s+from\s+["']([^"']+)["'];?[ \t]*(?:\r?\n|$)/gm, (_, specifier) => {imports.push(specifier); return ''})
  assert.doesNotMatch(source, /^\s*import\s/m)
  assert.ok(imports.includes('./worker-activation-guard.ts'))
  source = source.replace(/\bimport\((["'])([^"']+)\1\)/g, (_, _quote, specifier) => 'testImport(' + JSON.stringify(specifier) + ')')
  const entered = deferred(), release = deferred(), handlers = new Map(), registrations = [], loaded = [], workers = [], logs = [], sleeps = []
  let poolEnds = 0, ticks = 0, readonlyCalls = 0
  const emit = name => {const fn = handlers.get(name); assert.equal(typeof fn, 'function'); handlers.delete(name); fn()}
  const stage = async name => {if (options.stage === name) {entered.resolve(); await release.promise}}
  class Pool {
    async connect() {throw Error('unexpected_real_worker_query_in_loop_fixture')}
    async end() {poolEnds++}
  }
  class Worker extends AgentPrepareWorker {
    constructor(...args) {super(...args); workers.push(this); options.onConstruct?.(emit, this)}
    async tick() {ticks++; if (options.onTick) await options.onTick(emit, this); return {status: 'idle'}}
  }
  const env = {AGENT_STUDIO_PG_PILOT_ENABLED: 'true', AGENT_STUDIO_PG_PREPARE_WORKER_ENABLED: 'true',
    AGENT_STUDIO_PG_WORKER_PASSWORD_FILE: '/synthetic/worker.secret', ...(options.pg18 ? {AGENT_STUDIO_PG_BAOTA18_ENABLED: 'true'} : {})}
  const context = {
    process: {env, argv: ['node', 'fixture', '--serve'], once(name, fn) {registrations.push(name); handlers.set(name, fn)},
      stdout: {write: line => logs.push(line)}, stderr: {write: line => logs.push(line)}},
    readFileSync: () => 'SyntheticPrepareOnlyPassword#0123456789', lstatSync: () => ({isFile: () => true, isSymbolicLink: () => false, size: 64}),
    accessSync() {}, constants: {R_OK: 4}, randomUUID: () => id(9), sleep: async ms => {sleeps.push(ms)},
    selectKnowledgeSharing: () => options.stage === 'knowledge', selectPgRuntimeTarget: () => ({mode: 'synthetic', host: 'fake', port: 0, user: 'fake', database: 'fake'}),
    assertPgWorkerActivation() {}, assertPg18WorkerCredentialBinding() {}, assertPg18CredentialMetadata() {}, pgWorkerOfflinePlan() {return {}},
    verifyPgRuntimeTarget: () => stage('target'), verifyPgWorkerRoleBoundary: () => stage('role'), verifyKnowledgeRuntimeSchema: () => stage('knowledge'),
    async testImport(specifier) {
      loaded.push(specifier)
      if (specifier === 'pg') {await stage('driver'); return {Pool}}
      if (specifier === './agent-worker.ts') {await stage('worker_import'); return {AgentPrepareWorker: Worker}}
      if (specifier === './pg18-native-worker-readonly.ts') return {runPg18NativeWorkerReadonlyPreflight: async () => {readonlyCalls++}}
      throw Error('unexpected_loop_fixture_import')
    },
  }
  const main = runInNewContext(source + '\nmain', context, {timeout: 1000})
  return {main, entered, release, emit, loaded, workers, logs, sleeps, registrations, poolEnds: () => poolEnds, ticks: () => ticks, readonlyCalls: () => readonlyCalls}
}

test('startup driver, target, role, scope and lazy-import waits latch stop before a Worker can claim', bounded, async () => {
  for (const stage of ['driver', 'target', 'role', 'knowledge', 'worker_import']) {
    const h = loopHarness({stage}), work = h.main(false)
    await h.entered.promise; assert.equal(h.workers.length, 0); h.emit('SIGTERM'); h.release.resolve(); await work
    assert.equal(h.workers.length, 1); assert.deepEqual(counts(h.workers[0]), [true, 0, 0])
    assert.equal(h.ticks(), 0); assert.equal(h.poolEnds(), 1)
    assert.deepEqual(h.registrations, ['SIGTERM', 'SIGINT']); assert.deepEqual(h.sleeps, [])
    assert.equal(h.logs.some(line => line.includes('"state":"ready"')), false)
  }
})

test('a signal inside construction is latched and an active-loop signal closes claims synchronously', bounded, async () => {
  const early = loopHarness({onConstruct: emit => emit('SIGTERM')}); await early.main(false)
  assert.deepEqual(counts(early.workers[0]), [true, 0, 0]); assert.equal(early.ticks(), 0)
  const active = loopHarness({onTick(emit, worker) {emit('SIGINT'); assert.deepEqual(counts(worker), [true, 0, 0])}})
  await active.main(false); assert.equal(active.ticks(), 1); assert.deepEqual(active.sleeps, [750]); assert.equal(active.poolEnds(), 1)
})

test('both preflight paths still avoid loading AgentPrepareWorker and its claim SQL', bounded, async () => {
  for (const pg18 of [false, true]) {
    const h = loopHarness({pg18}); await h.main(true)
    assert.equal(h.loaded.includes('./agent-worker.ts'), false); assert.equal(h.workers.length, 0); assert.equal(h.ticks(), 0)
    if (pg18) {assert.equal(h.readonlyCalls(), 1); assert.deepEqual(h.loaded, ['./pg18-native-worker-readonly.ts'])}
    else assert.equal(h.poolEnds(), 1)
  }
})
