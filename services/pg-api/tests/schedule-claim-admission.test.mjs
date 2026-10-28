// Pure recording-pool tests; repository admission is an explicit pure boundary
// mock. No SQL, database, Worker process, provider, MCP or network is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import {ScheduleRuntimeWorker} from '../src/schedule-runtime-worker.ts'
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no}); return {promise, resolve, reject}}
const bounded = {timeout: 5000}, workerName = 'schedule_fake'
const counts = worker => {const x = worker.claimAdmissionSnapshot(); return [x.closed, x.pending, x.uncertain]}
const claim = () => ({occurrence_id: id(1), lease_token: id(2), lease_version: 1, worker_id: workerName})
const scopes = ['knowledge_sharing_enabled', 'knowledge_embedding_settings_enabled', 'knowledge_embedding_consent_enabled',
  'knowledge_index_runtime_enabled', 'knowledge_query_runtime_enabled', 'knowledge_tool_runtime_enabled']
function fixture(options = {}) {
  const events = new Map(), wait = deferred(), statements = [], admissions = []
  let connections = 0, releases = 0
  const point = name => {if (!events.has(name)) events.set(name, deferred()); return events.get(name)}
  const peek = options.peek ?? {id: id(6), revision: 1, due: '2030-01-01T00:00:00.000Z', now: '2030-01-01T00:00:00.000Z',
    time_zone: 'UTC', anchor_at: '2030-01-01T00:00:00.000Z', rule: {kind: 'once', start_date: '2030-01-01', local_time: '00:00'}}
  const context = {occurrence_id: id(1), owner_user_id: id(3), identity: {issuer: 'synthetic', subject: 'employee'}, kind: options.kind ?? 'workflow',
    target_id: id(4), execution: {target_revision: 1, instruction: 'Synthetic scheduled work', max_steps: 1}, planned_run_id: id(5), authority_id: id(7)}
  const label = (sql, n) => {
    for (const [needle, name] of [['schedule_peek()', 'peek'], ['schedule_reserve(', 'reserve'], ['schedule_launch_context(', 'context'],
      ['identity_user_id(', 'identity'], ['schedule_register_origin(', 'register_origin'], ['schedule_launch_failed(', 'failure'], ['schedule_quarantine(', 'quarantine']]) if (sql.includes(needle)) return name
    const scope = scopes.find(x => sql.startsWith("SELECT set_config('agentstudio." + x + "'"))
    return (scope ? 'scope:' + scope : sql) + ':' + n
  }
  const pool = {async connect() {
    const n = ++connections; point('connect:' + n).resolve(); if (options.block === 'connect:' + n) await wait.promise
    return {query(sql, values = []) {
      const name = label(sql, n); statements.push({sql, values, name, connection: n}); point(name).resolve()
      const custom = options.query?.(name, n, sql, values); if (custom !== undefined) return custom
      const answer = () => ({rows: name === 'peek' ? [{item: options.noPeek ? null : peek}] : name === 'reserve' ? [{claim: options.noClaim ? null : options.claim ?? claim()}] :
        name === 'context' ? [{context: options.noContext ? null : context}] : name === 'identity' ? [{id: context.owner_user_id}] :
        name === 'register_origin' ? [{ok: true}] : name === 'failure' ? [{status: options.failureStatus ?? 'failed'}] : []})
      return options.block === name ? wait.promise.then(answer) : Promise.resolve(answer())
    }, release() {releases++; if (options.releaseErrorAt === n) throw Error('release_failure')}}
  }}
  const worker = new ScheduleRuntimeWorker(pool, workerName)
  const admit = async (...args) => {
    admissions.push(args); point('admitOwned').resolve(); if (options.block === 'admitOwned') await wait.promise
    if (options.admitError) throw options.admitError
    return {run: {id: context.planned_run_id}}
  }
  worker.flows.admitOwned = admit; worker.agents.admitOwned = admit
  return {worker, wait, statements, admissions, peek, context, reached: name => point(name).promise, connections: () => connections, releases: () => releases}
}

test('scheduler closes only new reservations and snapshots explicitly limit coverage', async () => {
  const h = fixture(); h.worker.closeNewClaims(); h.worker.closeNewClaims()
  assert.deepEqual(await h.worker.tick(), {status: 'idle'}); assert.equal(h.connections(), 0)
  const view = h.worker.claimAdmissionSnapshot()
  assert.deepEqual(counts(h.worker), [true, 0, 0]); assert.equal(view.coverage, 'local_schedule_reserve_and_launch_only')
  assert.equal(Object.isFrozen(view), true); assert.equal(Object.isFrozen(view.lanes[0]), true); assert.equal('canDrain' in view, false)
})

test('stop during peek and either pool/BEGIN/scope/role prelude cannot reach reserve', bounded, async () => {
  for (const stage of ['peek', 'COMMIT:1', ...[1, 2].flatMap(n => ['connect:' + n, 'BEGIN:' + n, ...scopes.map(s => 'scope:' + s + ':' + n), 'SET LOCAL ROLE agentstudio_worker:' + n])]) {
    const h = fixture({block: stage}), work = h.worker.tick(); await h.reached(stage)
    h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 0, 0]); h.wait.resolve(); await work
    assert.equal(h.statements.some(x => x.name === 'reserve'), false, stage); assert.equal(h.admissions.length, 0)
    assert.deepEqual(counts(h.worker), [true, 0, 0])
  }
})

test('stop after rule parsing still fails the final reservation gate', async () => {
  const h = fixture(), rule = h.peek.rule
  Object.defineProperty(h.peek, 'rule', {get() {h.worker.closeNewClaims(); return rule}})
  await h.worker.tick(); assert.equal(h.statements.some(x => x.name === 'reserve'), false); assert.equal(h.admissions.length, 0)
})

test('issued reserve and its COMMIT remain pending and continue the held occurrence after stop', bounded, async () => {
  for (const stage of ['reserve', 'COMMIT:2']) {
    const h = fixture({block: stage}), work = h.worker.tick(); await h.reached(stage)
    h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 1, 0]); h.wait.resolve()
    assert.deepEqual(await work, {status: 'started', run_id: id(5), occurrence_id: id(1)})
    assert.equal(h.admissions.length, 1); assert.equal(h.statements.filter(x => x.name === 'reserve').length, 1)
    assert.equal(h.statements.filter(x => x.name === 'register_origin').length, 1); assert.deepEqual(counts(h.worker), [true, 0, 0])
  }
})

test('reserve commit does not settle pending launch pool/scope/role/context/admission/origin/COMMIT waits', bounded, async () => {
  for (const stage of ['connect:3', 'BEGIN:3', ...scopes.map(s => 'scope:' + s + ':3'), 'SET LOCAL ROLE agentstudio_worker:3', 'context', 'identity', 'admitOwned', 'register_origin', 'COMMIT:3']) {
    const h = fixture({block: stage}), work = h.worker.tick(); await h.reached(stage)
    assert.equal(h.statements.some(x => x.name === 'COMMIT:2'), true); assert.deepEqual(counts(h.worker), [false, 1, 0])
    h.worker.closeNewClaims(); h.wait.resolve(); assert.equal((await work).status, 'started')
    assert.deepEqual(counts(h.worker), [true, 0, 0]); assert.equal(h.admissions.length, 1)
  }
})

test('direct public launch registers before pool await and remains allowed after close in both target kinds', bounded, async () => {
  for (const kind of ['workflow', 'agent']) {
    const h = fixture({kind, block: 'connect:1'}); h.worker.closeNewClaims()
    const work = h.worker.launch(claim()); await h.reached('connect:1'); assert.deepEqual(counts(h.worker), [true, 1, 0])
    h.wait.resolve(); assert.equal((await work).status, 'started'); assert.deepEqual(counts(h.worker), [true, 0, 0])
    assert.equal(h.statements.some(x => x.name === 'peek' || x.name === 'reserve'), false)
    const [,owner,target,raw,planned] = h.admissions[0]
    assert.equal(owner, id(3)); assert.equal(target, id(4)); assert.equal(planned, id(5)); assert.equal(raw.idempotency_key, 'schedule_' + id(1))
    assert.deepEqual(h.statements.find(x => x.name === 'register_origin').values, [id(1), id(2), 1, workerName, id(5)])
  }
})

test('lost reserve COMMIT acknowledgement remains uncertain after successful rollback, without launching', async () => {
  const lost = Error('reserve_commit_ack_lost'), h = fixture({query(name) {if (name === 'COMMIT:2') return Promise.reject(lost)}})
  await assert.rejects(h.worker.tick(), e => e === lost); assert.deepEqual(counts(h.worker), [false, 1, 1])
  assert.equal(h.admissions.length, 0); assert.equal(h.statements.some(x => x.name === 'ROLLBACK:2'), true)
  h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 1, 1])
})

test('a later successful held launch cannot clear an earlier uncertain reservation', bounded, async () => {
  const h = fixture({block: 'admitOwned', query(name) {if (name === 'COMMIT:2') return Promise.reject(Error('reserve_commit_ack_lost'))}})
  await assert.rejects(h.worker.tick()); h.worker.closeNewClaims()
  const work = h.worker.launch(claim()); await h.reached('admitOwned')
  assert.deepEqual(counts(h.worker), [true, 2, 1]); h.wait.resolve(); assert.equal((await work).status, 'started')
  assert.deepEqual(counts(h.worker), [true, 1, 1]); assert.equal(h.admissions.length, 1)
})

test('lost launch COMMIT stays uncertain even when original failure bookkeeping confirms already_started', async () => {
  const h = fixture({failureStatus: 'already_started', query(name) {if (name === 'COMMIT:3') return Promise.reject(Error('launch_commit_ack_lost'))}})
  assert.equal((await h.worker.tick()).status, 'already_started')
  assert.equal(h.admissions.length, 1); assert.equal(h.statements.filter(x => x.name === 'failure').length, 1)
  assert.deepEqual(counts(h.worker), [false, 1, 1])
})

test('pre-COMMIT admission failure settles only after rollback and original failure transaction acknowledge', bounded, async () => {
  const h = fixture({admitError: Error('admission_rejected'), block: 'ROLLBACK:3'}), work = h.worker.tick()
  await h.reached('ROLLBACK:3'); assert.deepEqual(counts(h.worker), [false, 1, 1]); h.worker.closeNewClaims(); h.wait.resolve()
  assert.equal((await work).status, 'failed'); assert.deepEqual(counts(h.worker), [true, 0, 0])
  assert.equal(h.statements.filter(x => x.name === 'reserve').length, 1); assert.equal(h.admissions.length, 1)
  assert.equal(h.statements.some(x => x.name === 'failure'), true)
})

test('admission or origin response loss with failed rollback is not erased by later known failure bookkeeping', async () => {
  for (const stage of ['admitOwned', 'register_origin']) {
    const h = fixture({admitError: stage === 'admitOwned' ? Error('admission_ack_lost') : undefined, query(name) {
      if (stage === 'register_origin' && name === stage) return Promise.reject(Error('origin_ack_lost'))
      if (name === 'ROLLBACK:3') return Promise.reject(Error('rollback_ack_lost'))
    }})
    assert.equal((await h.worker.tick()).status, 'failed'); assert.equal(h.statements.some(x => x.name === 'COMMIT:4'), true)
    assert.deepEqual(counts(h.worker), [false, 1, 1]); assert.equal(h.admissions.length, 1)
  }
})

test('origin response loss with acknowledged rollback can converge through original failure ledger', async () => {
  const h = fixture({query(name) {if (name === 'register_origin') return Promise.reject(Error('origin_ack_lost'))}})
  assert.equal((await h.worker.tick()).status, 'failed'); assert.deepEqual(counts(h.worker), [false, 0, 0])
  assert.equal(h.statements.some(x => x.name === 'ROLLBACK:3'), true); assert.equal(h.admissions.length, 1)
})

test('failure bookkeeping COMMIT loss or failed bookkeeping rollback retains the reserved occurrence', async () => {
  for (const stage of ['COMMIT:4', 'failure']) {
    const h = fixture({admitError: Error('admission_rejected'), query(name) {if (name === stage) return Promise.reject(Error('failure_ledger_unavailable'))}})
    await assert.rejects(h.worker.tick(), /failure_ledger_unavailable/)
    assert.deepEqual(counts(h.worker), [false, 1, 1]); assert.equal(h.admissions.length, 1)
  }
})

test('direct launch loses no uncertainty on COMMIT, rollback, synchronous throw or release errors', async () => {
  for (const stage of ['commit', 'rollback', 'release']) {
    const h = fixture({admitError: stage === 'rollback' ? Error('admission_rejected') : undefined,
      releaseErrorAt: stage === 'release' ? 1 : undefined, query(name) {
        if (stage === 'commit' && name === 'COMMIT:1') throw Error('commit_sync_failure')
        if (stage === 'rollback' && name === 'ROLLBACK:1') throw Error('rollback_sync_failure')
      }})
    await assert.rejects(h.worker.launch(claim())); assert.deepEqual(counts(h.worker), [false, 1, 1])
  }
})

test('empty and skipped reserves retain pending until COMMIT, with original skip semantics and no launch', bounded, async () => {
  for (const skipped of [false, true]) {
    const h = fixture({block: 'COMMIT:2', noClaim: !skipped, claim: {skipped: true, occurrence_id: id(1), reason: 'previous_run_incomplete'}})
    const work = h.worker.tick(); await h.reached('COMMIT:2'); assert.deepEqual(counts(h.worker), [false, 1, 0]); h.wait.resolve()
    assert.equal((await work).status, skipped ? 'skipped_overlap' : 'stale'); assert.deepEqual(counts(h.worker), [false, 0, 0]); assert.equal(h.admissions.length, 0)
  }
})

test('a synchronous reserve error and failed rollback/release cannot be hidden by finally', async () => {
  const h = fixture({releaseErrorAt: 2, query(name) {
    if (name === 'reserve') throw Error('reserve_sync_failure')
    if (name === 'ROLLBACK:2') throw Error('rollback_sync_failure')
  }})
  await assert.rejects(h.worker.tick(), /release_failure/); assert.deepEqual(counts(h.worker), [false, 1, 1]); assert.equal(h.admissions.length, 0)
})
