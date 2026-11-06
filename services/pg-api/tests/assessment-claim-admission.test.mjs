// Saved assessment Worker evaluated with explicit pure session/full-audit mocks.
// Real admission gate and DTO parsers, recording pool only; no DB/provider/process.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {isUuid} from '../src/contracts.ts'
import {createWorkerClaimAdmission} from '../src/worker-claim-admission.ts'
import * as contract from '../src/agent-assessment-contract.ts'
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const workerId = id(9), bounded = {timeout: 5000}
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no}); return {promise, resolve, reject}}
const counts = worker => {const x = worker.claimAdmissionSnapshot(); return [x.closed, x.pending, x.uncertain]}
const rawClaim = extra => ({request_id: id(1), lease_token: id(2), lease_version: 1, worker_id: workerId, lease_expires_at: '2030-01-01T00:00:00.000Z', ...extra})
function fixture(options = {}) {
  const events = new Map(), wait = deferred(), statements = [], audits = [], dispatched = []
  let connections = 0, releases = 0
  const point = name => {if (!events.has(name)) events.set(name, deferred()); return events.get(name)}
  const stage = async name => {point(name).resolve(); if (options.block === name) await wait.promise}
  let source = stripTypeScriptTypes(readFileSync(new URL('../src/agent-assessment-worker.ts', import.meta.url), 'utf8'))
  const imports = []
  source = source.replace(/^import\s+[\s\S]*?\s+from\s+["']([^"']+)["'];?[ \t]*(?:\r?\n|$)/gm, (_, specifier) => {imports.push(specifier); return ''})
  assert.doesNotMatch(source, /^\s*import\s/m); assert.ok(imports.includes('./agent-assessment-audit.ts')); assert.ok(imports.includes('./agent-assessment-role.ts'))
  source = source.replace('export class AgentAssessmentWorker', 'class AgentAssessmentWorker')
  const context = {...contract, isUuid, setTimeout, clearTimeout, Date,
    // Host factory validates host-realm records; normalize this fixed internal
    // literal across the VM boundary, preserving the real per-instance gate.
    createWorkerClaimAdmission(raw) {
      assert.equal(raw.lanes.length, 1); assert.equal(raw.lanes[0], 'assessment')
      const gate = createWorkerClaimAdmission({lanes: ['assessment']})
      return Object.freeze({...gate, confirm(permit, evidence) {
        assert.deepEqual(Object.keys(evidence), ['outcome'])
        return gate.confirm(permit, {outcome: evidence.outcome})
      }})
    },
    async assertAgentAssessmentSession(db, role) {assert.equal(role, 'agentstudio_review_worker'); audits.push('session:' + db.number); await stage('session:' + db.number); if (options.sessionError) throw options.sessionError},
    async verifyAgentAssessmentCredentials(db) {audits.push('audit:' + db.number); await stage('audit:' + db.number); return options.auditAllowed !== false},
  }
  const Worker = runInNewContext(source + '\nAgentAssessmentWorker', context, {timeout: 1000})
  const pool = {async connect() {
    const number = ++connections; await stage('connect:' + number)
    if (options.connectError) throw options.connectError
    return {number, query(sql, values = []) {
      const name = sql.includes('agent_assessment_claim(') ? 'claim' : sql.includes('agent_assessment_pause(') ? 'pause' : sql + ':' + number
      statements.push({sql, values: Array.from(values), name, connection: number}); point(name).resolve()
      const custom = options.query?.(name, sql, number); if (custom !== undefined) return custom
      const answer = () => ({rows: name === 'claim' ? [{value: options.noClaim ? null : options.row ?? rawClaim()}] : name === 'pause' ? [{value: {request_id: id(1), state: 'paused'}}] :
        sql === 'SELECT current_user AS role' ? [{role: options.badRole ? 'wrong' : 'agentstudio_review_worker'}] : []})
      return options.block === name ? wait.promise.then(answer) : Promise.resolve(answer())
    }, release() {releases++; if (options.releaseErrorAt === number) throw Error('release_failure')}}
  }}
  const dispatch = async proof => {dispatched.push(proof); await stage('dispatch'); if (options.dispatchError) throw options.dispatchError
    return options.reply ?? {request_id: id(1), state: 'succeeded', result_sha256: 'a'.repeat(64)}}
  const worker = new Worker(pool, workerId, dispatch, options.disabled ? {} : {executionEnabled: true, executionApproval: contract.agentAssessmentApproval})
  return {worker, pool, wait, statements, audits, dispatched, reached: name => point(name).promise, connections: () => connections, releases: () => releases}
}
const preludes = ['connect:1', 'BEGIN:1', 'session:1', 'SET LOCAL ROLE agentstudio_review_worker:1', "SET LOCAL lock_timeout='3s':1",
  "SET LOCAL statement_timeout='5s':1", 'SELECT current_user AS role:1', 'audit:1']

test('assessment keeps activation/default behavior and reports only its immutable local claim lane', async () => {
  const disabled = fixture({disabled: true}); assert.equal((await disabled.worker.tick()).state, 'disabled'); assert.equal(disabled.connections(), 0)
  const h = fixture(); assert.deepEqual(h.worker.claimAdmissionSnapshot().lanes.map(x => x.lane), ['assessment'])
  h.worker.closeNewClaims(); h.worker.closeNewClaims(); assert.equal((await h.worker.tick()).state, 'idle'); assert.equal(h.connections(), 0)
  assert.equal(Object.isFrozen(h.worker.claimAdmissionSnapshot().lanes[0]), true); assert.equal('canDrain' in h.worker.claimAdmissionSnapshot(), false)
})

test('stop during pool, session, budgets, role and full-audit awaits prevents the actual claim RPC', bounded, async () => {
  for (const stage of preludes) {
    const h = fixture({block: stage}), work = h.worker.tick(); await h.reached(stage)
    h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 0, 0]); h.wait.resolve(); assert.equal((await work).state, 'idle')
    assert.equal(h.statements.some(x => x.name === 'claim'), false, stage); assert.equal(h.dispatched.length, 0)
  }
})

test('session/full-audit/role checks still fail closed before claiming', async () => {
  for (const options of [{sessionError: Error('session_refused')}, {auditAllowed: false}, {badRole: true}, {connectError: Error('connect_refused')}]) {
    const h = fixture(options); await assert.rejects(h.worker.tick()); assert.deepEqual(counts(h.worker), [false, 0, 0])
    assert.equal(h.statements.some(x => x.name === 'claim'), false); assert.equal(h.dispatched.length, 0)
  }
})

test('BEGIN and every SQL role/budget prelude failure create no submitted claim', async () => {
  for (const stage of preludes.filter(x => !/^(connect|session|audit):/.test(x))) {
    const h = fixture({query(name) {if (name === stage) return Promise.reject(Error('prelude_query_refused'))}})
    await assert.rejects(h.worker.tick(), /prelude_query_refused/)
    assert.deepEqual(counts(h.worker), [false, 0, 0]); assert.equal(h.statements.some(x => x.name === 'claim'), false)
  }
})

test('actual claim parsing and row validation remain pending through COMMIT; proof is built only afterwards', bounded, async () => {
  let h; const seen = [], row = new Proxy(rawClaim(), {ownKeys(target) {seen.push(counts(h.worker)); return Reflect.ownKeys(target)}})
  h = fixture({row, block: 'COMMIT:1'}); const work = h.worker.tick(); await h.reached('COMMIT:1')
  assert.ok(seen.length > 0); assert.ok(seen.every(x => x[1] === 1)); assert.equal(h.dispatched.length, 0)
  h.worker.closeNewClaims(); h.wait.resolve(); assert.equal((await work).state, 'succeeded'); assert.deepEqual(counts(h.worker), [true, 0, 0])
  assert.deepEqual(Object.keys(h.dispatched[0]).sort(), ['lease_token', 'lease_version', 'request_id', 'worker_id'])
})

test('null and delayed claimed rows stay pending until the claim helper commits', bounded, async () => {
  for (const noClaim of [false, true]) {
    const stage = noClaim ? 'COMMIT:1' : 'claim', h = fixture({noClaim, block: stage}), work = h.worker.tick()
    await h.reached(stage); assert.deepEqual(counts(h.worker), [false, 1, 0]); h.worker.closeNewClaims(); h.wait.resolve()
    assert.equal((await work).state, noClaim ? 'idle' : 'succeeded'); assert.deepEqual(counts(h.worker), [true, 0, 0])
  }
})

test('lost claim COMMIT ack stays uncertain after rollback and running-finally reset', bounded, async () => {
  const h = fixture({block: 'ROLLBACK:1', query(name) {if (name === 'COMMIT:1') return Promise.reject(Error('commit_ack_lost'))}})
  const work = assert.rejects(h.worker.tick(), /commit_ack_lost/); await h.reached('ROLLBACK:1')
  assert.deepEqual(counts(h.worker), [false, 1, 1]); h.worker.closeNewClaims(); h.wait.resolve(); await work
  assert.deepEqual(counts(h.worker), [true, 1, 1]); assert.equal((await h.worker.tick()).state, 'idle')
  assert.deepEqual(counts(h.worker), [true, 1, 1]); assert.equal(h.dispatched.length, 0)
})

test('sync COMMIT, sync/async claim+rollback and release errors preserve uncertain evidence', async () => {
  for (const stage of ['commit', 'sync_rollback', 'async_rollback']) {
    const h = fixture({releaseErrorAt: stage === 'commit' ? undefined : 1, query(name) {
      if (stage === 'commit' && name === 'COMMIT:1') throw Error('commit_sync_failure')
      if (stage !== 'commit' && name === 'claim') {if (stage === 'sync_rollback') throw Error('claim_sync_failure'); return Promise.reject(Error('claim_rejected'))}
      if (stage !== 'commit' && name === 'ROLLBACK:1') {if (stage === 'sync_rollback') throw Error('rollback_sync_failure'); return Promise.reject(Error('rollback_ack_lost'))}
    }})
    await assert.rejects(h.worker.tick()); assert.deepEqual(counts(h.worker), [false, 1, 1]); assert.equal(h.dispatched.length, 0)
  }
})

test('pre-COMMIT claim failure clears only after a real rollback acknowledges', bounded, async () => {
  const h = fixture({block: 'ROLLBACK:1', query(name) {if (name === 'claim') return Promise.reject(Error('claim_rejected'))}})
  const work = assert.rejects(h.worker.tick(), /claim_rejected/); await h.reached('ROLLBACK:1')
  assert.deepEqual(counts(h.worker), [false, 1, 1]); h.wait.resolve(); await work; assert.deepEqual(counts(h.worker), [false, 0, 0])
})

test('malformed and cross-worker claim rows fail their original parser/worker-id guard before COMMIT', async () => {
  for (const row of [rawClaim({lease_version: 0}), rawClaim({worker_id: id(8)})]) {
    const h = fixture({row}); await assert.rejects(h.worker.tick()); assert.deepEqual(counts(h.worker), [false, 0, 0])
    assert.equal(h.statements.some(x => x.name === 'COMMIT:1'), false); assert.equal(h.dispatched.length, 0)
  }
})

test('close never blocks owned pause; the shared helper repeats full session/role/audit checks', bounded, async () => {
  const h = fixture({block: 'dispatch', dispatchError: Error('private_rpc_unknown')}), work = h.worker.tick()
  await h.reached('dispatch'); h.worker.closeNewClaims(); assert.deepEqual(counts(h.worker), [true, 0, 0])
  assert.equal((await h.worker.tick()).state, 'busy'); h.wait.resolve(); assert.equal((await work).state, 'paused')
  assert.deepEqual(h.audits, ['session:1', 'audit:1', 'session:2', 'audit:2'])
  assert.equal(h.statements.filter(x => x.name === 'claim').length, 1); assert.equal(h.statements.filter(x => x.name === 'pause').length, 1)
  assert.deepEqual(h.statements.find(x => x.name === 'pause').values, [id(1), id(2), 1, workerId])
  assert.equal(h.dispatched.length, 1); assert.deepEqual(counts(h.worker), [true, 0, 0])
})

test('pause COMMIT loss and reply mismatch remain owned-work outcomes, never claim evidence or resend triggers', async () => {
  const h = fixture({reply: {request_id: id(8), state: 'paused'}, query(name) {if (name === 'COMMIT:2') return Promise.reject(Error('pause_ack_lost'))}})
  const result = await h.worker.tick(); assert.equal(result.state, 'unknown'); assert.equal(result.request_id, id(1))
  assert.equal(h.dispatched.length, 1); assert.equal(h.statements.filter(x => x.name === 'claim').length, 1)
  assert.equal(h.statements.filter(x => x.name === 'pause').length, 1); assert.deepEqual(counts(h.worker), [false, 0, 0])
})
