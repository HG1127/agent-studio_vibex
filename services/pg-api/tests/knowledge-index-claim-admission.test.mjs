// Actual Worker + role helper, recording fake pool only. No DB or paid RPC.
import test from 'node:test'
import assert from 'node:assert/strict'
import {KnowledgeIndexWorker} from '../src/knowledge-index-worker.ts'
import {withKnowledgeIndexRole} from '../src/knowledge-index-role.ts'
const kind = 'index', lane = 'knowledge_' + kind
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no}); return {promise, resolve, reject}}
const bounded = {timeout: 5000}, claimSql = 'SELECT agentstudio.' + lane + '_claim($1::uuid) AS value'
const counts = worker => {const x = worker.claimAdmissionSnapshot(); return [x.closed, x.pending, x.uncertain]}
const prelude = ['BEGIN', 'SET LOCAL ROLE agentstudio_knowledge_index_worker', "SET LOCAL lock_timeout='3s'", "SET LOCAL statement_timeout='5s'",
  ...(kind === 'index' ? ["SELECT set_config('agentstudio.knowledge_index_runtime_enabled','true',true)"] : [
    "SELECT set_config('agentstudio.knowledge_index_runtime_enabled','false',true)",
    "SELECT set_config('agentstudio.knowledge_sharing_enabled',$1::text,true)",
    "SELECT set_config('agentstudio.knowledge_query_runtime_enabled','true',true)",
    "SELECT set_config('agentstudio.knowledge_tool_runtime_enabled',$1::text,true)"])]
function fixture(options = {}) {
  const events = new Map(), wait = deferred(), statements = [], dispatched = []
  let connections = 0, releases = 0, worker
  const point = name => {if (!events.has(name)) events.set(name, deferred()); return events.get(name)}
  const pool = {knowledgeIndexRuntime: kind === 'index', knowledgeQueryRuntime: kind === 'query', knowledgeSharing: true, knowledgeToolRuntime: true,
    async connect() {
      connections++; point('connect').resolve(); if (options.block === 'connect') await wait.promise
      if (options.connectError) throw options.connectError
      return {query(sql, values = []) {
        const name = sql === claimSql ? 'claim' : sql; statements.push({sql, values}); point(name).resolve()
        const custom = options.query?.(sql, values); if (custom !== undefined) return custom
        const answer = () => ({rows: sql === claimSql ? [{value: options.noClaim ? null : options.row ?? {attempt_id: id(1), worker_id: worker.workerId, lease_token: 'a'.repeat(64)}}] : []})
        return options.block === name ? wait.promise.then(answer) : Promise.resolve(answer())
      }, release() {releases++; if (options.releaseError) throw options.releaseError}}
    }}
  const dispatch = async (claim, signal) => {
    dispatched.push({claim, signal}); point('dispatch').resolve(); if (options.block === 'dispatch') await wait.promise
    if (options.dispatchError) throw options.dispatchError
    return kind === 'index' ? {status: 'indexed', chunks: 1} : {status: 'retrieved'}
  }
  worker = new KnowledgeIndexWorker(pool, dispatch, {approvedForIsolatedUat: true})
  return {worker, pool, wait, statements, dispatched, reached: name => point(name).promise, connections: () => connections, releases: () => releases}
}

test('fixed local lane, constructor/runtime gates, immutable snapshot and closed direct claims', async () => {
  const h = fixture(); assert.deepEqual(h.worker.claimAdmissionSnapshot(), {closed: false, pending: 0, uncertain: 0, lanes: [{lane, pending: 0, uncertain: 0}]})
  h.worker.closeNewClaims(); h.worker.closeNewClaims(); assert.equal(await h.worker.claim(), null); assert.equal(h.connections(), 0)
  assert.equal(Object.isFrozen(h.worker.claimAdmissionSnapshot().lanes[0]), true); assert.equal('canDrain' in h.worker.claimAdmissionSnapshot(), false)
  assert.throws(() => new KnowledgeIndexWorker(h.pool, async () => {}, {approvedForIsolatedUat: false}), /worker_disabled/)
  await assert.rejects(withKnowledgeIndexRole({}, 'worker', async () => null), /runtime_disabled/)
})

test('stop at connect, BEGIN, role, both budgets and every scope await prevents actual claim RPC', bounded, async () => {
  for (const stage of ['connect', ...prelude]) {
    const h = fixture({block: stage}), work = h.worker.claim(); await h.reached(stage)
    h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 0, 0]); h.wait.resolve(); assert.equal(await work, null)
    assert.equal(h.statements.some(x => x.sql === claimSql), false, stage); assert.equal(h.dispatched.length, 0)
  }
})

test('issued claim and actual parser remain pending until the helper COMMIT acknowledges', bounded, async () => {
  let h; const observed = [], row = {attempt_id: id(1), worker_id: id(2)}
  Object.defineProperty(row, 'lease_token', {enumerable: true, get() {observed.push(counts(h.worker)); return 'a'.repeat(64)}})
  h = fixture({row, block: 'COMMIT'}); const work = h.worker.claim(); await h.reached('COMMIT')
  assert.ok(observed.length > 0); assert.ok(observed.every(x => x[1] === 1 && x[2] === 0))
  h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 1, 0]); h.wait.resolve()
  assert.equal((await work).attempt_id, id(1)); assert.deepEqual(counts(h.worker), [true, 0, 0])
})

test('delayed claim and null claim are tracked through transaction confirmation', bounded, async () => {
  for (const noClaim of [false, true]) {
    const h = fixture({noClaim, block: noClaim ? 'COMMIT' : 'claim'}), work = h.worker.claim()
    await h.reached(noClaim ? 'COMMIT' : 'claim'); assert.deepEqual(counts(h.worker), [false, 1, 0])
    h.worker.closeNewClaims(); h.wait.resolve(); assert.equal((await work) === null, noClaim); assert.deepEqual(counts(h.worker), [true, 0, 0])
  }
})

test('lost helper COMMIT ack remains uncertain even after later rollback ACK and finally release', bounded, async () => {
  const rollback = deferred(), lost = Error('commit_ack_lost'), h = fixture({query(sql) {
    if (sql === 'COMMIT') return Promise.reject(lost); if (sql === 'ROLLBACK') return rollback.promise
  }}), work = assert.rejects(h.worker.claim(), error => error === lost)
  await h.reached('ROLLBACK'); assert.deepEqual(counts(h.worker), [false, 1, 1]); h.worker.closeNewClaims()
  rollback.resolve({rows: []}); await work; assert.deepEqual(counts(h.worker), [true, 1, 1]); assert.equal(h.releases(), 1)
  assert.equal(await h.worker.claim(), null); assert.deepEqual(counts(h.worker), [true, 1, 1])
})

test('synchronous COMMIT invocation is still an attempted commit', async () => {
  const h = fixture({query(sql) {if (sql === 'COMMIT') throw Error('commit_sync_failure')}})
  await assert.rejects(h.worker.claim(), /commit_sync_failure/); assert.deepEqual(counts(h.worker), [false, 1, 1])
  assert.equal(h.statements.some(x => x.sql === 'ROLLBACK'), true)
})

test('pre-COMMIT rejection settles only after an acknowledged rollback', bounded, async () => {
  const h = fixture({block: 'ROLLBACK', query(sql) {if (sql === claimSql) return Promise.reject(Error('claim_rejected'))}})
  const work = assert.rejects(h.worker.claim(), /claim_rejected/); await h.reached('ROLLBACK')
  assert.deepEqual(counts(h.worker), [false, 1, 1]); h.wait.resolve(); await work; assert.deepEqual(counts(h.worker), [false, 0, 0])
  assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
})

test('query, rollback and release failures cannot finally clear uncertainty', async () => {
  for (const sync of [false, true]) {
    const h = fixture({releaseError: Error('release_failure'), query(sql) {
      if (sql === claimSql) {if (sync) throw Error('claim_sync_failure'); return Promise.reject(Error('claim_rejected'))}
      if (sql === 'ROLLBACK') {if (sync) throw Error('rollback_sync_failure'); return Promise.reject(Error('rollback_ack_lost'))}
    }})
    await assert.rejects(h.worker.claim(), /release_failure/); assert.deepEqual(counts(h.worker), [false, 1, 1]); assert.equal(h.releases(), 1)
  }
})

test('actual malformed-row parsing rolls back before COMMIT and retains original contract validation', async () => {
  const h = fixture({row: {attempt_id: id(1), worker_id: id(2), lease_token: 'bad'}})
  await assert.rejects(h.worker.claim(), /invalid_knowledge_index_claim/)
  assert.deepEqual(counts(h.worker), [false, 0, 0]); assert.equal(h.statements.some(x => x.sql === 'COMMIT'), false)
})

test('all pre-dispatch helper failures leave no submitted claim intent', async () => {
  for (const stage of ['connect', ...prelude]) {
    const h = fixture({connectError: stage === 'connect' ? Error('prelude_rejected') : undefined,
      query(sql) {if (sql === stage) return Promise.reject(Error('prelude_rejected'))}})
    await assert.rejects(h.worker.claim(), /prelude_rejected/); assert.deepEqual(counts(h.worker), [false, 0, 0])
    assert.equal(h.statements.some(x => x.sql === claimSql), false)
  }
})

test('old three-argument broker helper retains role, budgets, flags and body behavior', async () => {
  const h = fixture(), result = await withKnowledgeIndexRole(h.pool, 'broker', async db => {await db.query('legacy_body'); return 'legacy_result'})
  assert.equal(result, 'legacy_result'); assert.equal(h.statements[1].sql, 'SET LOCAL ROLE agentstudio_knowledge_index_broker')
  assert.equal(h.statements.some(x => x.sql === "SET LOCAL lock_timeout='3s'"), true)
  assert.equal(h.statements.some(x => x.sql === "SET LOCAL statement_timeout='5s'"), true)
  assert.equal(h.statements.at(-1).sql, 'COMMIT'); assert.equal(h.releases(), 1)
  if (kind === 'query') {
    assert.deepEqual(h.statements.find(x => x.sql.includes('knowledge_sharing_enabled')).values, ['true'])
    assert.deepEqual(h.statements.find(x => x.sql.includes('knowledge_tool_runtime_enabled')).values, ['true'])
  }
})

test('optional observer reports real BEGIN/role failures, rollback acknowledgement and commit delivery separately', async () => {
  for (const stage of ['BEGIN', prelude[1], 'COMMIT']) {
    const events = [], h = fixture({query(sql) {if (sql === stage) return Promise.reject(Error('helper_rejected'))}})
    await assert.rejects(withKnowledgeIndexRole(h.pool, 'worker', async () => null, event => events.push(event)), /helper_rejected/)
    assert.deepEqual(events, stage === 'BEGIN' ? ['failure'] : stage === 'COMMIT' ? ['before_commit', 'failure', 'rollback_confirmed'] : ['failure', 'rollback_confirmed'])
  }
})

test('close during a claim COMMIT preserves the original single held dispatch and paid-result parser', bounded, async () => {
  const h = fixture({block: 'COMMIT'}), work = h.worker.tick(); await h.reached('COMMIT'); h.worker.closeNewClaims()
  assert.equal(h.dispatched.length, 0); h.wait.resolve()
  assert.equal((await work).status, kind === 'index' ? 'indexed' : 'retrieved'); assert.equal(h.dispatched.length, 1)
  assert.equal(h.statements.filter(x => x.sql === claimSql).length, 1); assert.deepEqual(counts(h.worker), [true, 0, 0])
})

test('local claim zero counts do not describe a held transport or its uncertain outcome', bounded, async () => {
  const h = fixture({block: 'dispatch', dispatchError: Error('private_transport_unknown')}), work = h.worker.tick()
  await h.reached('dispatch'); h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 0, 0])
  h.wait.resolve(); assert.equal((await work).status, 'uncertain'); assert.equal(h.dispatched.length, 1)
  assert.equal(await h.worker.claim(), null); assert.equal(h.statements.filter(x => x.sql === claimSql).length, 1)
})

test('concurrent claim transactions retain independent local intents', bounded, async () => {
  const h = fixture({block: 'COMMIT'}), work = [h.worker.claim(), h.worker.claim()]
  await h.reached('COMMIT'); await Promise.resolve(); assert.deepEqual(counts(h.worker), [false, 2, 0])
  h.worker.closeNewClaims(); h.wait.resolve(); await Promise.all(work); assert.deepEqual(counts(h.worker), [true, 0, 0])
})

test('run abort synchronously closes admission during startup and preserves the old aborted-held-claim policy', bounded, async () => {
  const h = fixture({block: prelude.at(-1)}), controller = new AbortController(), work = h.worker.run(controller.signal, 100)
  await h.reached(prelude.at(-1)); controller.abort(); assert.deepEqual(counts(h.worker), [true, 0, 0]); h.wait.resolve(); await work
  assert.equal(h.statements.some(x => x.sql === claimSql), false); assert.equal(h.dispatched.length, 0)
  const owned = fixture({block: 'COMMIT'}), stop = new AbortController(), running = owned.worker.run(stop.signal, 100)
  await owned.reached('COMMIT'); stop.abort(); assert.deepEqual(counts(owned.worker), [true, 1, 0]); owned.wait.resolve(); await running
  assert.equal(owned.dispatched.length, 0); assert.deepEqual(counts(owned.worker), [true, 0, 0])
  const early = fixture(), done = new AbortController(); done.abort(); await early.worker.run(done.signal)
  assert.deepEqual(counts(early.worker), [true, 0, 0]); assert.equal(early.connections(), 0)
  await assert.rejects(early.worker.run(done.signal, 1), /invalid_knowledge_index_poll/)
})

test('run abort and its cleanup cannot clear a lost claim COMMIT acknowledgement', bounded, async () => {
  const h = fixture({block: 'ROLLBACK', query(sql) {if (sql === 'COMMIT') return Promise.reject(Error('commit_ack_lost'))}})
  const controller = new AbortController(), work = h.worker.run(controller.signal, 100)
  await h.reached('ROLLBACK'); controller.abort(); assert.deepEqual(counts(h.worker), [true, 1, 1])
  h.wait.resolve(); await work; assert.deepEqual(counts(h.worker), [true, 1, 1]); assert.equal(h.dispatched.length, 0)
})
