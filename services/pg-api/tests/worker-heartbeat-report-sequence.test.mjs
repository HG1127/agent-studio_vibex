import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {createWorkerHeartbeatReportSequence, nextWorkerHeartbeatReportSequence,
  WorkerHeartbeatReportSequenceError} from '../src/worker-heartbeat-report-sequence.ts'

const generation = '12345678-1234-4234-8234-123456789abc'
const otherGeneration = '87654321-4321-4321-b321-cba987654321'
const checked = () => ({type: 'startup_checks_complete', completed: true})
const drain = () => ({type: 'drain', new_claims_closed: true})
const machine = () => createWorkerHeartbeatReportSequence({generation})
const bad = (work, code = 'invalid_worker_heartbeat_report_sequence_input') => assert.throws(work,
  error => error instanceof WorkerHeartbeatReportSequenceError && error.code === code && error.message === code)

test('a new process starts unknown with pending checks; reports alone cannot make it ready', () => {
  const model = machine()
  for (let sequence = 1; sequence <= 3; sequence++) assert.deepEqual(model.nextReport(), {
    protocol: 'native_worker_heartbeat_report_v1', generation, sequence, state: 'unknown', reason: 'startup_checks_pending'})
  bad(() => model.transition({type: 'startup_checks_complete'}))
  assert.equal(model.nextReport().sequence, 4)
  assert.equal(model.nextReport().state, 'unknown')
})

test('ready requires the explicit complete event and loop failure returns to unknown', () => {
  const model = machine()
  model.transition(checked()); assert.deepEqual(model.nextReport(), {
    protocol: 'native_worker_heartbeat_report_v1', generation, sequence: 1, state: 'ready', reason: 'startup_checks_complete'})
  model.transition({type: 'loop_unavailable'})
  assert.deepEqual(model.nextReport(), {protocol: 'native_worker_heartbeat_report_v1', generation, sequence: 2, state: 'unknown', reason: 'loop_unavailable'})
  model.transition(checked()); assert.equal(model.nextReport().state, 'ready')
  model.transition(checked()); assert.equal(model.nextReport().sequence, 4)
})

test('false, missing or caller-invented check and drain attestations do not alter readiness', () => {
  const model = machine()
  for (const value of [false, undefined, 1, 'true', null, {}, []]) {
    bad(() => model.transition({type: 'startup_checks_complete', completed: value}))
    bad(() => model.transition({type: 'drain', new_claims_closed: value}))
  }
  for (const value of [{type: 'ready'}, {type: 'draining'}, {type: 'drain'}, {type: 'healthy'}, {}]) bad(() => model.transition(value))
  assert.deepEqual(model.nextReport(), {protocol: 'native_worker_heartbeat_report_v1', generation, sequence: 1, state: 'unknown', reason: 'startup_checks_pending'})
})

test('explicit closed admission can drain before readiness or after it', () => {
  for (const startReady of [false, true]) {
    const model = machine(); if (startReady) model.transition(checked())
    model.transition(drain())
    assert.deepEqual(model.nextReport(), {protocol: 'native_worker_heartbeat_report_v1', generation, sequence: 1, state: 'draining', reason: 'new_claims_closed'})
  }
})

test('draining is terminal: ready and unknown are rejected, repeated drain is idempotent', () => {
  const model = machine(); model.transition(checked()); model.transition(drain())
  const first = model.nextReport()
  bad(() => model.transition(checked()), 'worker_heartbeat_report_sequence_draining')
  bad(() => model.transition({type: 'loop_unavailable'}), 'worker_heartbeat_report_sequence_draining')
  model.transition(drain()); model.transition(drain())
  assert.deepEqual(model.nextReport(), {...first, sequence: 2})
})

test('each report has a newer safe positive sequence while earlier ready data remains frozen and unchanged', () => {
  const model = machine(); model.transition(checked()); const ready = model.nextReport()
  model.transition(drain()); const draining = model.nextReport()
  assert.equal(ready.state, 'ready'); assert.equal(ready.sequence, 1)
  assert.equal(draining.state, 'draining'); assert.equal(draining.sequence, 2)
  assert.equal(Object.isFrozen(ready), true); assert.equal(Object.isFrozen(draining), true); assert.notEqual(ready, draining)
  assert.throws(() => {ready.sequence = 999}, TypeError)
  assert.throws(() => {draining.state = 'ready'}, TypeError)
  assert.deepEqual(Object.keys(ready), ['protocol', 'generation', 'sequence', 'state', 'reason'])
  assert.equal(Number.isSafeInteger(draining.sequence) && draining.sequence > 0, true)
})

test('the shared counter primitive rejects overflow instead of wrapping, resetting or emitting an unsafe integer', () => {
  assert.equal(nextWorkerHeartbeatReportSequence(0), 1)
  assert.equal(nextWorkerHeartbeatReportSequence(1), 2)
  assert.equal(nextWorkerHeartbeatReportSequence(Number.MAX_SAFE_INTEGER - 1), Number.MAX_SAFE_INTEGER)
  bad(() => nextWorkerHeartbeatReportSequence(Number.MAX_SAFE_INTEGER), 'worker_heartbeat_report_sequence_exhausted')
  for (const value of [-0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, -Infinity, NaN, '0', null, undefined, 1n, new Number(0)])
    bad(() => nextWorkerHeartbeatReportSequence(value))
})

test('new boot generations use independent instances and never rewrite another instance reports', () => {
  const first = machine(), second = createWorkerHeartbeatReportSequence({generation: otherGeneration})
  first.transition(drain()); const old = first.nextReport()
  second.transition(checked()); const current = second.nextReport()
  assert.equal(old.generation, generation); assert.equal(old.state, 'draining'); assert.equal(old.sequence, 1)
  assert.equal(current.generation, otherGeneration); assert.equal(current.state, 'ready'); assert.equal(current.sequence, 1)
  assert.equal(first.nextReport().sequence, 2)
})

test('boot syntax is fixed lowercase UUIDv4; the caller cannot inject initial readiness or sequence', () => {
  for (const value of ['', null, undefined, 0, {}, generation.toUpperCase(), generation + '\n', generation.slice(1),
    '00000000-0000-0000-0000-000000000000', generation.replace('-4234-', '-1234-'), generation.replace('-8234-', '-7234-')])
    bad(() => createWorkerHeartbeatReportSequence({generation: value}))
  for (const key of ['state', 'sequence', 'initialSequence', 'kind', 'owner', 'host', 'pid', 'clock', 'task', 'provider', 'payload', 'ack'])
    bad(() => createWorkerHeartbeatReportSequence({generation, [key]: 'PRIVATE'}))
  for (const raw of [null, [], 1, generation, new (class {generation = generation})()]) bad(() => createWorkerHeartbeatReportSequence(raw))
})

test('input and event mutation cannot affect copied generation, state or closed report fields', () => {
  const input = {generation}, selected = checked(), model = createWorkerHeartbeatReportSequence(input)
  model.transition(selected); input.generation = otherGeneration; selected.completed = false; selected.host = 'PRIVATE'
  assert.deepEqual(model.nextReport(), {protocol: 'native_worker_heartbeat_report_v1', generation, sequence: 1, state: 'ready', reason: 'startup_checks_complete'})
  for (const raw of [{...checked(), kind: 'model'}, {...checked(), new_claims_closed: true}, {...drain(), completed: true},
    {type: 'loop_unavailable', completed: true}, {...drain(), payload: 'PRIVATE'}, [], null, new (class {type = 'loop_unavailable'})()]) bad(() => model.transition(raw))
  assert.equal(model.nextReport().sequence, 2); assert.equal(model.nextReport().state, 'ready')
})

test('getters, hidden data and symbols never enter a report or execute while being validated', () => {
  let calls = 0
  for (const scope of ['factory', 'event']) for (const variant of ['getter', 'hidden', 'symbol']) {
    const value = scope === 'factory' ? {generation} : checked()
    if (variant === 'getter') Object.defineProperty(value, scope === 'factory' ? 'generation' : 'completed', {enumerable: true, get() {calls++; return true}})
    else if (variant === 'hidden') Object.defineProperty(value, 'private', {value: 'PRIVATE'})
    else value[Symbol('private')] = 'PRIVATE'
    const model = machine()
    bad(() => scope === 'factory' ? createWorkerHeartbeatReportSequence(value) : model.transition(value))
    assert.equal(model.nextReport().state, 'unknown')
  }
  assert.equal(calls, 0)
  const model = createWorkerHeartbeatReportSequence(Object.assign(Object.create(null), {generation}))
  model.transition(Object.assign(Object.create(null), checked())); assert.equal(model.nextReport().state, 'ready')
})

test('the factory API is frozen and the zero-import module evaluates without Node, network, timers or a clock', () => {
  const model = machine(); assert.equal(Object.isFrozen(model), true)
  assert.throws(() => {model.nextReport = () => ({state: 'ready'})}, TypeError)
  const source = readFileSync(new URL('../src/worker-heartbeat-report-sequence.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /^\s*(?:import\b|export\s+[^\n]*\bfrom\s)/m)
  assert.doesNotMatch(source, /\b(?:process|require|fetch|XMLHttpRequest|WebSocket|Date|setTimeout|setInterval)\s*[.(]/)
  const script = stripTypeScriptTypes(source).replace(/\bexport\s+(?=class\b|function\b|const\b)/g, '')
  const result = runInNewContext(script + '\ncreateWorkerHeartbeatReportSequence({generation}).nextReport()', {generation}, {timeout: 1000})
  assert.deepEqual(JSON.parse(JSON.stringify(result)), machine().nextReport()); assert.equal(Object.isFrozen(result), true)
})
