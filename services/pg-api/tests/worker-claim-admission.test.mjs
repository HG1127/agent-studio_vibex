import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {createWorkerClaimAdmission, WorkerClaimAdmissionError} from '../src/worker-claim-admission.ts'

const gate = () => createWorkerClaimAdmission({lanes: ['workflow_v2', 'scheduler']})
const commit = () => ({outcome: 'commit_confirmed'})
const rollback = () => ({outcome: 'rollback_confirmed'})
const bad = (work, code = 'invalid_worker_claim_admission_input') => assert.throws(work,
  error => error instanceof WorkerClaimAdmissionError && error.code === code && error.message === code)
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no}); return {promise, resolve, reject}}
const counts = model => {const view = model.snapshot(); return [view.closed, view.pending, view.uncertain]}

test('runner declarations are fixed copies and local snapshots do not claim system drain', () => {
  const input = {lanes: ['workflow_v2', 'scheduler']}, model = createWorkerClaimAdmission(input)
  input.lanes[0] = 'other'; input.lanes.push('third')
  assert.deepEqual(model.snapshot(), {closed: false, pending: 0, uncertain: 0,
    lanes: [{lane: 'workflow_v2', pending: 0, uncertain: 0}, {lane: 'scheduler', pending: 0, uncertain: 0}]})
  bad(() => model.tryEnter('other'))
  model.close(); assert.deepEqual(counts(model), [true, 0, 0])
  assert.equal('canDrain' in model, false); assert.equal('reopen' in model, false)
  assert.deepEqual(Object.keys(model.snapshot()), ['closed', 'pending', 'uncertain', 'lanes'])
})

test('a deferred pool or role wakeup after close cannot enter a new claim', async () => {
  const model = gate(), wake = deferred(); let calls = 0
  const queued = (async () => {
    await wake.promise
    const permit = model.tryEnter('workflow_v2')
    if (permit === null) return false
    return model.dispatch(permit, () => {calls++; return 'row'}).started
  })()
  model.close(); wake.resolve(); assert.equal(await queued, false)
  assert.equal(calls, 0); assert.deepEqual(counts(model), [true, 0, 0])
})

test('the final dispatch check catches even an accidental await after a reservation', async () => {
  const model = gate(), permit = model.tryEnter('workflow_v2'), wake = deferred(); let calls = 0
  const queued = (async () => {await wake.promise; return model.dispatch(permit, () => {calls++; return 'row'})})()
  assert.deepEqual(counts(model), [false, 1, 0])
  model.close(); wake.resolve()
  assert.deepEqual(await queued, {started: false}); assert.equal(calls, 0)
  assert.deepEqual(counts(model), [true, 0, 0])
  bad(() => model.confirm(permit, commit()), 'worker_claim_intent_settled')
})

test('registration and callback dispatch run synchronously before the next microtask', async () => {
  const model = gate(), order = [], permit = model.tryEnter('workflow_v2')
  const later = Promise.resolve().then(() => {order.push('close'); model.close()})
  const result = model.dispatch(permit, () => {order.push('query'); assert.equal(model.snapshot().pending, 1); return 7})
  order.push('returned'); assert.deepEqual(result, {started: true, value: 7})
  assert.deepEqual(order, ['query', 'returned']); await later
  assert.deepEqual(order, ['query', 'returned', 'close']); assert.deepEqual(counts(model), [true, 1, 0])
  model.confirm(permit, commit()); assert.deepEqual(counts(model), [true, 0, 0])
})

test('a returned claim row stays pending through a deferred COMMIT acknowledgement', async () => {
  const model = gate(), row = deferred(), transaction = deferred(), permit = model.tryEnter('workflow_v2')
  const result = model.dispatch(permit, () => row.promise)
  assert.equal(result.value, row.promise); row.resolve({claimed: true}); await result.value
  model.close(); assert.deepEqual(counts(model), [true, 1, 0])
  const settled = (async () => {await transaction.promise; model.confirm(permit, commit())})()
  await Promise.resolve(); assert.deepEqual(counts(model), [true, 1, 0])
  transaction.resolve(); await settled; assert.deepEqual(counts(model), [true, 0, 0])
})

test('explicit rollback confirmation is distinct from rejected query or a finally block', async () => {
  const model = gate(), permit = model.tryEnter('workflow_v2'), failure = Error('synthetic_query_failure')
  const result = model.dispatch(permit, () => Promise.reject(failure))
  try {await assert.rejects(result.value, error => error === failure)} finally {model.close()}
  assert.deepEqual(counts(model), [true, 1, 0])
  model.markUncertain(permit); assert.deepEqual(counts(model), [true, 1, 1])
  model.confirm(permit, rollback()); assert.deepEqual(counts(model), [true, 0, 0])
})

test('timeout, Abort and repeated close cannot clear an uncertain transaction', () => {
  const model = gate(), permit = model.tryEnter('workflow_v2'), operation = deferred()
  model.dispatch(permit, () => operation.promise); model.markUncertain(permit); model.markUncertain(permit)
  const controller = new AbortController(); controller.abort(); model.close(); model.close()
  bad(() => model.discardUndispatched(permit), 'worker_claim_intent_not_reserved')
  for (const evidence of [undefined, null, controller.signal, {outcome: 'timeout'}, {outcome: 'aborted'}, {outcome: 'claim_returned'},
    {outcome: 'commit_confirmed', host: 'PRIVATE'}, {outcome: 'rollback_confirmed', confirmed: false}]) bad(() => model.confirm(permit, evidence))
  assert.deepEqual(counts(model), [true, 1, 1])
  // A later real acknowledgement must be explicitly supplied by the owner;
  // this pure module cannot verify that the caller's attestation is truthful.
  model.confirm(permit, commit()); assert.deepEqual(counts(model), [true, 0, 0])
})

test('a synchronous dispatch throw preserves the original error and retains uncertainty', () => {
  const model = gate(), permit = model.tryEnter('workflow_v2'), failure = Error('may_have_sent_before_throw')
  assert.throws(() => model.dispatch(permit, () => {throw failure}), error => error === failure)
  assert.deepEqual(counts(model), [false, 1, 1]); model.close()
  assert.deepEqual(counts(model), [true, 1, 1])
  model.confirm(permit, rollback()); assert.deepEqual(counts(model), [true, 0, 0])
})

test('only a never-dispatched reservation may be discarded without transaction evidence', () => {
  const model = gate(), permit = model.tryEnter('scheduler')
  bad(() => model.confirm(permit, commit()), 'worker_claim_intent_not_dispatched')
  bad(() => model.markUncertain(permit), 'worker_claim_intent_not_dispatched')
  assert.deepEqual(counts(model), [false, 1, 0]); model.discardUndispatched(permit)
  assert.deepEqual(counts(model), [false, 0, 0])
  bad(() => model.dispatch(permit, () => 0), 'worker_claim_intent_not_reserved')
})

test('synchronous callback reentry cannot double-count uncertainty or resurrect a settled intent', () => {
  for (const action of ['uncertain', 'confirmed']) {
    const model = gate(), permit = model.tryEnter('workflow_v2'), failure = Error('after_reentry')
    assert.throws(() => model.dispatch(permit, () => {
      if (action === 'uncertain') model.markUncertain(permit)
      else model.confirm(permit, commit())
      throw failure
    }), error => error === failure)
    assert.deepEqual(counts(model), action === 'uncertain' ? [false, 1, 1] : [false, 0, 0])
  }
})

test('permits cannot be forged, cloned, proxied or used across gates, even with copied symbol descriptors', () => {
  const first = gate(), second = gate(), permit = first.tryEnter('workflow_v2')
  assert.equal(Object.isFrozen(permit), true)
  const copies = [{}, {...permit}, Object.create(Object.getPrototypeOf(permit), Object.getOwnPropertyDescriptors(permit)), new Proxy(permit, {})]
  for (const copy of copies) {
    bad(() => first.dispatch(copy, () => 0), 'invalid_worker_claim_permit')
    bad(() => first.markUncertain(copy), 'invalid_worker_claim_permit')
  }
  bad(() => second.dispatch(permit, () => 0), 'invalid_worker_claim_permit')
  bad(() => second.confirm(permit, commit()), 'invalid_worker_claim_permit')
  assert.deepEqual(counts(first), [false, 1, 0]); assert.deepEqual(counts(second), [false, 0, 0])
  first.discardUndispatched(permit)
})

test('duplicate dispatch and terminal confirmation never underflow counts or reopen a closed gate', () => {
  const model = gate(), permit = model.tryEnter('workflow_v2'); let calls = 0
  model.dispatch(permit, () => {calls++})
  bad(() => model.dispatch(permit, () => {calls++}), 'worker_claim_intent_not_reserved')
  model.confirm(permit, commit()); model.close(); model.close()
  bad(() => model.confirm(permit, rollback()), 'worker_claim_intent_settled')
  bad(() => model.markUncertain(permit), 'worker_claim_intent_settled')
  assert.equal(model.tryEnter('workflow_v2'), null); assert.equal(calls, 1)
  assert.deepEqual(counts(model), [true, 0, 0])
})

test('concurrent lane intents retain independent pending and uncertain counts until each known outcome', async () => {
  const model = gate(), operations = Array.from({length: 6}, deferred)
  const permits = operations.map((operation, index) => {
    const permit = model.tryEnter(index % 2 ? 'scheduler' : 'workflow_v2')
    model.dispatch(permit, () => operation.promise); return permit
  })
  assert.deepEqual(model.snapshot().lanes.map(row => row.pending), [3, 3])
  model.close(); model.markUncertain(permits[1]); model.markUncertain(permits[4])
  for (const operation of operations) operation.resolve('query_returned')
  await Promise.all(operations.map(operation => operation.promise))
  assert.deepEqual(counts(model), [true, 6, 2])
  for (const index of [0, 2, 3, 5]) model.confirm(permits[index], index % 2 ? rollback() : commit())
  assert.deepEqual(counts(model), [true, 2, 2])
  model.confirm(permits[1], rollback()); model.confirm(permits[4], commit())
  assert.deepEqual(model.snapshot().lanes.map(row => [row.pending, row.uncertain]), [[0, 0], [0, 0]])
})

test('configuration, evidence and lane declarations reject getters, hidden data, symbols and undeclared lanes', () => {
  let calls = 0
  for (const variant of ['getter', 'hidden', 'symbol']) {
    const config = {lanes: ['worker']}
    if (variant === 'getter') Object.defineProperty(config, 'lanes', {enumerable: true, get() {calls++; return ['worker']}})
    else if (variant === 'hidden') Object.defineProperty(config, 'private', {value: 1})
    else config[Symbol('private')] = 1
    bad(() => createWorkerClaimAdmission(config))
  }
  for (const declaration of [[], ['worker', 'worker'], ['Worker'], ['worker\n'], ['worker\r'], [' worker'], ['a'.repeat(49)], Array(1), Array.from({length: 33}, (_, i) => 'lane_' + i), ['worker', 1]])
    bad(() => createWorkerClaimAdmission({lanes: declaration}))
  const accessorLanes = ['worker']; Object.defineProperty(accessorLanes, '0', {enumerable: true, get() {calls++; return 'worker'}})
  bad(() => createWorkerClaimAdmission({lanes: accessorLanes}))
  const model = gate(), permit = model.tryEnter('workflow_v2'); model.dispatch(permit, () => 0)
  const evidence = {}; Object.defineProperty(evidence, 'outcome', {enumerable: true, get() {calls++; return 'commit_confirmed'}})
  bad(() => model.confirm(permit, evidence)); assert.equal(calls, 0)
  for (const lane of ['unregistered', '', null, {}, new String('workflow_v2')]) bad(() => model.tryEnter(lane))
  assert.deepEqual(counts(model), [false, 1, 0]); model.confirm(permit, commit())
})

test('status snapshots and API are frozen detached local values while query values remain untouched', () => {
  const model = gate(), before = model.snapshot(), permit = model.tryEnter('workflow_v2'), driverValue = {private_payload: 'not_in_snapshot'}
  const result = model.dispatch(permit, () => driverValue)
  assert.equal(result.value, driverValue); assert.equal(Object.isFrozen(driverValue), false)
  const current = model.snapshot()
  for (const value of [model, current, current.lanes, ...current.lanes]) assert.equal(Object.isFrozen(value), true)
  assert.equal(before.pending, 0); assert.equal(current.pending, 1); assert.notEqual(before.lanes, current.lanes)
  assert.doesNotMatch(JSON.stringify(current), /payload|private|permit|generation|host|pid|owner|clock|drain/i)
  assert.throws(() => {current.pending = 0}, TypeError); assert.throws(() => {current.lanes[0].pending = 0}, TypeError)
  model.confirm(permit, commit()); assert.equal(current.pending, 1)
})

test('zero-import local module evaluates without Node, a clock, network or timer globals', () => {
  const source = readFileSync(new URL('../src/worker-claim-admission.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /^\s*(?:import\b|export\s+[^\n]*\bfrom\s)/m)
  assert.doesNotMatch(source, /\b(?:process|require|fetch|XMLHttpRequest|WebSocket|Date|setTimeout|setInterval)\s*[.(]/)
  const script = stripTypeScriptTypes(source).replace(/\bexport\s+(?=const\b|class\b|function\b)/g, '')
  const view = runInNewContext(script + '\ncreateWorkerClaimAdmission({lanes:["worker"]}).snapshot()', {}, {timeout: 1000})
  assert.deepEqual(JSON.parse(JSON.stringify(view)), {closed: false, pending: 0, uncertain: 0, lanes: [{lane: 'worker', pending: 0, uncertain: 0}]})
  assert.equal(Object.isFrozen(view), true)
})
