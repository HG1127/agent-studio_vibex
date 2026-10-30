import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {workerHeartbeatKinds, workerHeartbeatUnknownReasons, workerHeartbeatStaleAfterMs,
  WorkerHeartbeatContractError, parseWorkerHeartbeatSnapshot, createUnknownWorkerHeartbeatSnapshot} from '../src/worker-heartbeat-contract.ts'

const at = '2026-10-28T02:00:00.000Z'
const ago = milliseconds => new Date(Date.parse(at) - milliseconds).toISOString()
const unknown = (kind, reason = 'not_observed') => ({kind, state: 'unknown', last_seen_at: null, reason})
const snapshot = () => ({protocol: 'native_company_worker_heartbeats_v1', scope: 'company_worker_metadata_only',
  as_of: at, stale_after_ms: 90000, workers: workerHeartbeatKinds.map(kind => unknown(kind))})
const observed = (state, age) => ({kind: 'prepare', state, last_seen_at: ago(age),
  reason: {ready: 'fresh_ready_report', draining: 'fresh_draining_report', stale: 'heartbeat_expired'}[state]})
const bad = work => assert.throws(work, error => error instanceof WorkerHeartbeatContractError &&
  error.status === 503 && error.code === 'invalid_worker_heartbeat_projection' && error.message === error.code)
const withFirst = row => {const value = snapshot(); value.workers[0] = row; return value}

test('the stable protocol accepts exactly the eight ordered kinds and mixed real observation states', () => {
  assert.deepEqual(workerHeartbeatKinds, ['prepare', 'model', 'workflow_safe', 'workflow_v2', 'agent_autonomous', 'knowledge_index', 'knowledge_query', 'assessment'])
  assert.equal(workerHeartbeatStaleAfterMs, 90000) // Candidate window, not a long-running UAT result.
  const value = snapshot()
  value.workers[0] = observed('ready', 89999)
  value.workers[1] = {...observed('draining', 0), kind: 'model'}
  value.workers[2] = {...observed('stale', 90000), kind: 'workflow_safe'}
  assert.deepEqual(parseWorkerHeartbeatSnapshot(value), value)
  for (const protocol of ['native_company_worker_heartbeats_draft_v1', 'native_company_overview_v1', '', null]) bad(() => parseWorkerHeartbeatSnapshot({...value, protocol}))
  for (const scope of ['current_user', 'company_metadata_only', '', null]) bad(() => parseWorkerHeartbeatSnapshot({...value, scope}))
})

test('fresh ready/draining stop at the exact90000ms boundary; stale begins there and future evidence is rejected', () => {
  for (const state of ['ready', 'draining']) {
    for (const age of [0, 1, 89999]) assert.equal(parseWorkerHeartbeatSnapshot(withFirst(observed(state, age))).workers[0].state, state)
    for (const age of [-1, 90000, 90001]) bad(() => parseWorkerHeartbeatSnapshot(withFirst(observed(state, age))))
  }
  for (const age of [90000, 90001, 86400000]) assert.equal(parseWorkerHeartbeatSnapshot(withFirst(observed('stale', age))).workers[0].state, 'stale')
  for (const age of [-1, 0, 89999]) bad(() => parseWorkerHeartbeatSnapshot(withFirst(observed('stale', age))))
})

test('UTC timestamps require exact millisecond ISO spelling and a real Gregorian date', () => {
  for (const text of ['2024-02-29T00:00:00.000Z', '0001-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z'])
    assert.equal(createUnknownWorkerHeartbeatSnapshot(text).as_of, text)
  const invalid = ['', null, undefined, 0, new Date(at), '0000-01-01T00:00:00.000Z', '2026-02-29T00:00:00.000Z',
    '2026-02-30T00:00:00.000Z', '2026-10-28T24:00:00.000Z', '2026-10-28T02:00:60.000Z',
    '2026-10-28T02:00:00Z', '2026-10-28T02:00:00.00Z', '2026-10-28T02:00:00.0000Z',
    '2026-10-28T02:00:00.000+00:00', '2026-10-28t02:00:00.000z', at + '\n', at + '\0', ' ' + at]
  for (const text of invalid) {
    bad(() => parseWorkerHeartbeatSnapshot({...snapshot(), as_of: text}))
    bad(() => parseWorkerHeartbeatSnapshot(withFirst({...observed('ready', 0), last_seen_at: text})))
  }
})

test('state, reason and nullable observation time form a closed correlated union', () => {
  for (const reason of workerHeartbeatUnknownReasons) assert.deepEqual(parseWorkerHeartbeatSnapshot(withFirst(unknown('prepare', reason))).workers[0], unknown('prepare', reason))
  for (const reason of ['ready', 'heartbeat_expired', 'telemetry_not_installed', 'db_host_private', null, undefined])
    bad(() => parseWorkerHeartbeatSnapshot(withFirst({...unknown('prepare'), reason})))
  for (const time of [at, 0, undefined, '']) bad(() => parseWorkerHeartbeatSnapshot(withFirst({...unknown('prepare'), last_seen_at: time})))
  for (const state of ['ready', 'draining', 'stale']) {
    for (const reason of ['not_observed', null, undefined, 'fresh_ready_report', 'fresh_draining_report', 'heartbeat_expired']) {
      const row = observed(state, state === 'stale' ? 90000 : 0)
      if (row.reason !== reason) bad(() => parseWorkerHeartbeatSnapshot(withFirst({...row, reason})))
    }
    bad(() => parseWorkerHeartbeatSnapshot(withFirst({...observed(state, 90000), last_seen_at: null})))
  }
  for (const state of ['alive', 'offline', 'starting', '', null, undefined]) bad(() => parseWorkerHeartbeatSnapshot(withFirst({...unknown('prepare'), state})))
})

test('missing, duplicate, extra, unknown or reordered kinds cannot produce a partial Company snapshot', () => {
  for (const rows of [[], snapshot().workers.slice(1), [...snapshot().workers, unknown('prepare')],
    [...snapshot().workers].reverse(), snapshot().workers.map(() => unknown('prepare')),
    [unknown('scheduler'), ...snapshot().workers.slice(1)]]) bad(() => parseWorkerHeartbeatSnapshot({...snapshot(), workers: rows}))
  for (const kind of ['', null, undefined, 'Prepare', 'pb_main']) bad(() => parseWorkerHeartbeatSnapshot(withFirst({...unknown('prepare'), kind})))
})

test('the candidate TTL is an exact numeric protocol constant rather than caller-selected readiness', () => {
  for (const ttl of [0, -0, -1, 89999, 90001, 90000.5, '90000', null, undefined, NaN, Infinity])
    bad(() => parseWorkerHeartbeatSnapshot({...snapshot(), stale_after_ms: ttl}))
})

test('closed top-level and row keys exclude host, PID, identity, queue and paid payload fields', () => {
  for (const key of ['host', 'pid', 'lease_token', 'owner_id', 'run_id', 'queue', 'payload', 'worker_name', 'alive', 'configured']) {
    bad(() => parseWorkerHeartbeatSnapshot({...snapshot(), [key]: 'PRIVATE_SENTINEL'}))
    bad(() => parseWorkerHeartbeatSnapshot(withFirst({...unknown('prepare'), [key]: 'PRIVATE_SENTINEL'})))
  }
  for (const key of Object.keys(snapshot())) {const value = snapshot(); delete value[key]; bad(() => parseWorkerHeartbeatSnapshot(value))}
  for (const key of Object.keys(unknown('prepare'))) {const row = unknown('prepare'); delete row[key]; bad(() => parseWorkerHeartbeatSnapshot(withFirst(row)))}
})

test('symbols, non-enumerable properties and accessors are rejected without evaluating supplied getters', () => {
  let calls = 0
  for (const target of ['snapshot', 'row']) for (const variant of ['symbol', 'hidden', 'accessor']) {
    const value = snapshot(), object = target === 'snapshot' ? value : value.workers[0]
    if (variant === 'symbol') object[Symbol('private')] = 1
    else if (variant === 'hidden') Object.defineProperty(object, 'private', {value: 1})
    else Object.defineProperty(object, target === 'snapshot' ? 'as_of' : 'state', {enumerable: true, get() {calls++; return 'unknown'}})
    bad(() => parseWorkerHeartbeatSnapshot(value))
  }
  assert.equal(calls, 0)
})

test('plain data objects and dense ordinary arrays are required; null-prototype records remain valid', () => {
  for (const raw of [null, 0, '', [], new Date(), new (class {constructor() {Object.assign(this, snapshot())}})()]) bad(() => parseWorkerHeartbeatSnapshot(raw))
  const value = snapshot(); value.workers[0] = Object.assign(Object.create(null), value.workers[0])
  assert.equal(parseWorkerHeartbeatSnapshot(Object.assign(Object.create(null), value)).workers[0].state, 'unknown')
  for (const change of [rows => {delete rows[0]}, rows => {rows.extra = 1}, rows => {rows[Symbol('private')] = 1},
    rows => {Object.defineProperty(rows, 'private', {value: 1})}, rows => {Object.setPrototypeOf(rows, null)},
    rows => {Object.defineProperty(rows, '0', {enumerable: true, get() {throw Error('getter_not_allowed')}})}]) {
    const raw = snapshot(); change(raw.workers); bad(() => parseWorkerHeartbeatSnapshot(raw))
  }
})

test('validated snapshots are deeply frozen detached copies; mutation of input or shared constants cannot alter them', () => {
  const input = snapshot(), parsed = parseWorkerHeartbeatSnapshot(input)
  assert.notEqual(parsed, input); assert.notEqual(parsed.workers, input.workers); assert.notEqual(parsed.workers[0], input.workers[0])
  assert.equal(Object.isFrozen(parsed), true); assert.equal(Object.isFrozen(parsed.workers), true)
  assert.equal(parsed.workers.every(Object.isFrozen), true)
  assert.equal(Object.isFrozen(workerHeartbeatKinds), true); assert.equal(Object.isFrozen(workerHeartbeatUnknownReasons), true)
  input.workers[0].reason = 'component_disabled'; input.workers.pop(); input.as_of = 'changed'
  assert.equal(parsed.workers[0].reason, 'not_observed'); assert.equal(parsed.workers.length, 8); assert.equal(parsed.as_of, at)
  assert.throws(() => {parsed.workers[0].state = 'ready'}, TypeError)
  assert.throws(() => {parsed.workers.push(unknown('prepare'))}, TypeError)
})

test('unknown initialization requires an explicit time and never promises installed telemetry or samples a clock', () => {
  const first = createUnknownWorkerHeartbeatSnapshot(at), second = createUnknownWorkerHeartbeatSnapshot(at)
  assert.deepEqual(first, second); assert.notEqual(first.workers[0], second.workers[0])
  assert.equal(first.workers.every(row => row.state === 'unknown' && row.reason === 'not_instrumented' && row.last_seen_at === null), true)
  for (const reason of workerHeartbeatUnknownReasons) assert.equal(createUnknownWorkerHeartbeatSnapshot(at, reason).workers.every(row => row.reason === reason), true)
  bad(() => createUnknownWorkerHeartbeatSnapshot()); bad(() => createUnknownWorkerHeartbeatSnapshot(at, 'ready'))
})

test('the shared source has zero imports and evaluates with browser-only builtins, without network, DB or Node globals', () => {
  const source = readFileSync(new URL('../src/worker-heartbeat-contract.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /^\s*(?:import\b|export\s+[^\n]*\bfrom\s)/m)
  assert.doesNotMatch(source, /\b(?:process|require|fetch|XMLHttpRequest|WebSocket|Date\.now|setTimeout|setInterval)\s*[.(]/)
  const script = stripTypeScriptTypes(source).replace(/\bexport\s+(?=const\b|class\b|function\b)/g, '')
  const result = runInNewContext(script + '\nparseWorkerHeartbeatSnapshot(JSON.parse(input))', {input: JSON.stringify(snapshot())}, {timeout: 1000})
  assert.deepEqual(JSON.parse(JSON.stringify(result)), snapshot()); assert.equal(Object.isFrozen(result), true)
})
