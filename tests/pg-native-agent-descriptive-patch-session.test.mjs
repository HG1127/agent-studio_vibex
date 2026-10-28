// Pure session behavior with independently hashed synthetic wires; no SQL/provider/provenance claim.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createPgNativeAgentDescriptivePatchSession} from '../src/lib/pgNativeAgentDescriptivePatchSession.ts'
import {agentDescriptivePatchAcceptance, agentDescriptivePatchReceipt} from '../src/lib/pgNativeAgentDescriptivePatch.ts'
import {watchPgNativeOriginalTaskController, pgNativeOriginalTasksBlocked} from '../src/lib/pgNativeOwnTaskNavigation.ts'

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), h = c => c.repeat(64), copy = v => structuredClone(v)
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ?
  '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v)
const hash = v => createHash('sha256').update(canonical(v)).digest('hex')
const target = {review_id: id(1), spec_id: id(2), target_run_id: id(10)}
function vector() {
  const before = {goal: '原目标', task_scope: '原范围', deliverables: ['原交付'], task_plan: ['沿用计划'], done_criteria: ['原标准']}
  const descriptive = {goal: '原目标', task_scope: '', deliverables: [], done_criteria: ['新标准']}
  const provided_keys = ['goal', 'task_scope', 'deliverables', 'done_criteria'], patch_sha256 = hash({protocol: 'agent_descriptive_patch_model_v1', provided_keys, descriptive})
  const feedback_sources = [{run_id: id(20), feedback_id: id(30), feedback_sha256: h('a'), feedback_revision: 2, feedback_source_sha256: h('b'), statement_sha256: h('c')}]
  const binding = {source_kind: 'feedback_generated_descriptive_patch', mode: 'provided_fields',
    source: {purpose: 'optimize', ...target, review_request_sha256: h('1'), input_sha256: h('2'), content_sha256: h('3'), result_sha256: h('4'), completion_sha256: h('5'), source_owner_epoch: 5, source_protocol: 'employee_statement_anchor_v1'},
    feedback_sources, feedback_sources_sha256: hash({protocol: 'agent_descriptive_patch_feedback_v1', sources: feedback_sources}), anchor: {run_id: id(20), feedback_id: id(30)},
    before: {revision: 41, source_sha256: h('6'), descriptive: before}, model_patch: {provided_keys, descriptive, patch_sha256},
    candidate: {descriptive: {...before, ...descriptive}, candidate_sha256: h('8')}, changed_keys: ['task_scope', 'deliverables', 'done_criteria']}
  const preview = {protocol: 'agent_descriptive_patch_preview_v1', ...binding, preview_sha256: hash({protocol: 'agent_descriptive_patch_preview_binding_v1', ...binding}), recorded: false}
  const original = {action: 'accept', request_id: id(99), ...target, anchor_run_id: id(20), anchor_feedback_id: id(30), expected_preview_sha256: preview.preview_sha256,
    expected_result_sha256: h('4'), expected_patch_sha256: patch_sha256, expected_spec_revision: 41, expected_spec_sha256: h('6'), expected_candidate_sha256: h('8'),
    confirm: true, acceptance_acknowledgement: 'APPROVE_EXACT_GENERATED_DESCRIPTIVE_PATCH_V1'}
  const {before: _before, model_patch: _model, candidate: _candidate, ...common} = binding
  const core = {protocol: 'agent_descriptive_patch_receipt_v1', ...common, request_id: id(99), request_sha256: hash({protocol: 'agent_descriptive_patch_accept_intent_v1', ...original}),
    before: {revision: 41, source_sha256: h('6'), revision_id: id(90)}, after: {revision: 42, source_sha256: h('7'), revision_id: id(91)},
    provided_keys, patch_sha256, candidate_sha256: h('8'), preview_sha256: preview.preview_sha256, acceptance_owner_epoch: 5, created_at: '2026-10-28T01:02:03.123Z'}
  return {preview, original, receipt: {...core, receipt_sha256: hash(core), recorded: true, replayed: false}}
}
const wire = vector()
function sealReceipt(value) {const {receipt_sha256, recorded, replayed, ...core} = value; return {...value, receipt_sha256: hash(core)}}
function response(original = wire.original, replayed = false) {
  return sealReceipt({...copy(wire.receipt), request_id: original.request_id,
    request_sha256: hash({protocol: 'agent_descriptive_patch_accept_intent_v1', ...original}), replayed})
}
const fault = status => Object.assign(Error('synthetic'), {status})
function deferred() {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b}); return {promise, resolve, reject}}
async function fixture({available = true, acceptance = true, onAccepted = () => {}, key, api: supplied} = {}) {
  let keys = 0, expired = 0
  const calls = [], api = supplied ?? {
    previewAgentDescriptivePatch: async input => {calls.push(['preview', input]); return copy(wire.preview)},
    getAgentDescriptivePatch: async review => {calls.push(['receipt', review]); throw fault(404)},
    acceptAgentDescriptivePatch: async original => {calls.push(['accept', original]); return response(original)},
    confirmAgentDescriptivePatch: async original => {calls.push(['confirm', original]); return response(original, true)},
  }
  const model = createPgNativeAgentDescriptivePatchSession(api, {key: () => {keys++; return key ? key() : id(98 + keys)}, onExpired: () => expired++, onAccepted})
  model.setScopes({available, acceptance}); model.setActive(true); await model.select(target)
  return {api, model, calls, keys: () => keys, expired: () => expired, close: () => model.dispose()}
}

test('selection only discovers history and preview needs independent explicit configuration consent', async () => {
  const f = await fixture()
  try {assert.deepEqual(f.calls.map(c => c[0]), ['receipt']); await f.model.prepare(); await f.model.accept(false)
    assert.equal(f.keys(), 0); assert.equal(f.model.snapshot().canAccept, true); assert.equal(f.calls.filter(c => c[0] === 'accept').length, 0)
    assert.deepEqual(f.model.snapshot().preview.model_patch.provided_keys, ['goal', 'task_scope', 'deliverables', 'done_criteria'])
  } finally {f.close()}
})
test('closed fresh writes keep preview readable and never inherit fee approval', async () => {
  const f = await fixture({acceptance: false})
  try {await f.model.prepare(); await f.model.accept(true); assert.ok(f.model.snapshot().preview); assert.equal(f.model.snapshot().canAccept, false); assert.equal(f.keys(), 0)
    f.model.setScopes({available: true, acceptance: true}); assert.equal(f.model.snapshot().preview, null); await f.model.accept(true); assert.equal(f.keys(), 0)
  } finally {f.close()}
})
test('fresh success dispatches one immutable exact15-field original including patch hash', async () => {
  const f = await fixture()
  try {await f.model.prepare(); await f.model.accept(true); const original = f.calls.find(c => c[0] === 'accept')[1]
    assert.equal(Object.keys(original).length, 15); assert.equal(Object.isFrozen(original), true); assert.deepEqual(original, wire.original)
    assert.deepEqual(agentDescriptivePatchAcceptance(original), wire.original); assert.equal(original.expected_patch_sha256, wire.preview.model_patch.patch_sha256)
    assert.equal(f.model.snapshot().pending, null); assert.equal(f.model.snapshot().preview, null); assert.ok(f.model.snapshot().receipt); await f.model.accept(true); assert.equal(f.keys(), 1)
  } finally {f.close()}
})
test('double click is one mutation flight and pending blocks target changes and source reads', async () => {
  const f = await fixture(), gate = deferred()
  try {await f.model.prepare(); f.api.acceptAgentDescriptivePatch = original => {f.calls.push(['accept', original]); return gate.promise}
    const a = f.model.accept(true), b = f.model.accept(true); assert.equal(a, b); assert.equal(f.model.navigationBlocked(), true)
    await f.model.select(null); await f.model.select({...target, review_id: id(77)}); await f.model.prepare(); await f.model.refreshReceipt()
    assert.deepEqual(f.model.snapshot().target, target); assert.equal(f.keys(), 1); assert.equal(f.calls.filter(c => c[0] === 'accept').length, 1)
    gate.resolve(response()); await a; assert.equal(f.model.navigationBlocked(), false)
  } finally {gate.resolve(response()); f.close()}
})
test('lost response retains original through capability closure and explicit confirmation settles it', async () => {
  const seen = [], f = await fixture({onAccepted: value => seen.push(value)})
  try {await f.model.prepare(); f.api.acceptAgentDescriptivePatch = async original => {f.calls.push(['accept', original]); throw fault(0)}; await f.model.accept(true)
    const original = f.calls.find(c => c[0] === 'accept')[1]; f.model.setScopes({available: false, acceptance: false}); await f.model.select(null)
    f.model.setActive(false); assert.equal(f.model.snapshot().pending, null); assert.equal(f.model.navigationBlocked(), true); f.model.setActive(true)
    assert.equal(f.model.snapshot().pending.unknown, true); assert.equal(f.calls.filter(c => c[0] === 'confirm').length, 0)
    await f.model.confirm(); assert.equal(f.calls.find(c => c[0] === 'confirm')[1], original); assert.equal(seen.length, 1); assert.equal(f.keys(), 1)
  } finally {f.close()}
})
test('unknown404 or409 confirmation cannot discard original; retry uses the same body after writes close', async () => {
  const f = await fixture()
  try {await f.model.prepare(); f.api.acceptAgentDescriptivePatch = async original => {f.calls.push(['accept', original]); throw fault(503)}; await f.model.accept(true)
    const original = f.calls.find(c => c[0] === 'accept')[1]
    for (const code of [404, 409]) {f.api.confirmAgentDescriptivePatch = async () => {throw fault(code)}; await f.model.confirm(); assert.equal(f.model.snapshot().pending.unknown, true)}
    f.model.setScopes({available: false, acceptance: false}); f.api.acceptAgentDescriptivePatch = async value => {f.calls.push(['accept', value]); return response(value, true)}
    await f.model.retrySameRequest(); assert.equal(f.calls.filter(c => c[0] === 'accept')[1][1], original); assert.equal(f.keys(), 1); assert.equal(f.model.snapshot().pending, null)
  } finally {f.close()}
})
test('definitive fresh rejection releases only that intent while ambiguous statuses retain it', async () => {
  for (const code of [400, 403, 404, 405, 409, 413, 415, 0, 429, 500, 503]) {
    const f = await fixture()
    try {await f.model.prepare(); f.api.acceptAgentDescriptivePatch = async () => {throw fault(code)}; await f.model.accept(true)
      assert.equal(Boolean(f.model.snapshot().pending), [0, 429, 500, 503].includes(code)); assert.equal(f.model.snapshot().preview, null)
    } finally {f.close()}
  }
})
test('wrong original success remains unknown and notifies only after matching proof', async () => {
  const seen = [], f = await fixture({onAccepted: value => seen.push(value)})
  try {await f.model.prepare(); f.api.acceptAgentDescriptivePatch = async () => response({...wire.original, request_id: id(777)})
    await f.model.accept(true); assert.equal(seen.length, 0); assert.equal(f.model.snapshot().receipt, null); assert.ok(f.model.snapshot().pending.unknown)
    await f.model.confirm(); assert.equal(seen.length, 1); assert.ok(f.model.snapshot().receipt)
  } finally {f.close()}
})
test('receipt binding checks model-provided attribution in addition to the15-field original', async () => {
  for (const change of [value => {value.source.content_sha256 = h('e')}, value => {value.provided_keys = ['goal', 'task_scope', 'deliverables', 'task_plan', 'done_criteria']}]) {
    const f = await fixture()
    try {await f.model.prepare(); const changed = response(); change(changed); const sealed = sealReceipt(changed)
      await agentDescriptivePatchReceipt(sealed, {original: wire.original}) // Standalone history cannot recover preview attribution.
      f.api.acceptAgentDescriptivePatch = async () => sealed; await f.model.accept(true)
      assert.equal(f.model.snapshot().receipt, null); assert.ok(f.model.snapshot().pending.unknown)
    } finally {f.close()}
  }
})
test('readonly history after body erasure never creates pending or invokes accepted observer', async () => {
  const seen = [], f = await fixture({available: false, acceptance: false, onAccepted: value => seen.push(value)})
  try {f.api.getAgentDescriptivePatch = async review => {f.calls.push(['receipt', review]); return response(wire.original, true)}
    await f.model.refreshReceipt(); await f.model.confirm(); await f.model.retrySameRequest(); await f.model.prepare()
    assert.ok(f.model.snapshot().receipt); assert.equal(f.model.snapshot().pending, null); assert.equal(f.keys(), 0); assert.equal(seen.length, 0)
    assert.equal(f.calls.filter(c => c[0] !== 'receipt').length, 0)
  } finally {f.close()}
})
test('detached snapshots cannot rewrite original body, preview or receipt', async () => {
  const f = await fixture()
  try {await f.model.prepare(); f.model.snapshot().preview.model_patch.descriptive.goal = 'external edit'
    f.api.acceptAgentDescriptivePatch = async () => {throw fault(0)}; await f.model.accept(true)
    f.model.snapshot().pending.original.expected_patch_sha256 = h('0'); assert.equal(f.model.snapshot().pending.original.expected_patch_sha256, wire.original.expected_patch_sha256)
    await f.model.confirm(); f.model.snapshot().receipt.provided_keys.push('task_plan'); assert.deepEqual(f.model.snapshot().receipt.provided_keys, wire.receipt.provided_keys)
  } finally {f.close()}
})
test('visibility or scope changes fence late preview and reopening never auto-confirms', async () => {
  for (const change of [model => model.setActive(false), model => model.setScopes({available: false, acceptance: false})]) {
    const f = await fixture(), gate = deferred()
    try {f.api.previewAgentDescriptivePatch = () => gate.promise; const work = f.model.prepare(); change(f.model); gate.resolve(copy(wire.preview)); await work
      f.model.setActive(true); assert.equal(f.model.snapshot().preview, null); assert.equal(f.model.snapshot().loading, false); await f.model.accept(true); assert.equal(f.keys(), 0)
    } finally {gate.resolve(copy(wire.preview)); f.close()}
  }
})
test('new target fences old preview and invalid target cannot replace current metadata', async () => {
  const f = await fixture(), gate = deferred()
  try {f.api.previewAgentDescriptivePatch = () => gate.promise; const work = f.model.prepare(); await f.model.select({...target, review_id: id(77)})
    gate.resolve(copy(wire.preview)); await work; assert.equal(f.model.snapshot().preview, null); assert.equal(f.model.snapshot().target.review_id, id(77))
    await f.model.select({...target, owner_id: id(9)}); assert.equal(f.model.snapshot().target.review_id, id(77))
  } finally {gate.resolve(copy(wire.preview)); f.close()}
})
test('accepted observer sees settled state once and history rereads never notify again', async () => {
  const seen = []; let observed, f
  f = await fixture({onAccepted: value => {observed = f.model.snapshot(); seen.push(value); value.source.review_id = id(88)}})
  try {await f.model.prepare(); await f.model.accept(true); assert.equal(observed.pending, null); assert.ok(observed.receipt); assert.equal(seen.length, 1)
    f.api.getAgentDescriptivePatch = async () => response(wire.original, true); await f.model.refreshReceipt(); await f.model.confirm(); await f.model.retrySameRequest()
    assert.equal(seen.length, 1); assert.equal(f.model.snapshot().receipt.source.review_id, target.review_id)
  } finally {f.close()}
})
test('same-original replay cannot notify twice even after later selection in one lifetime', async () => {
  const seen = [], f = await fixture({onAccepted: value => seen.push(value), key: () => id(99)})
  try {await f.model.prepare(); await f.model.accept(true); await f.model.select(null); await f.model.select(target); await f.model.prepare()
    f.api.acceptAgentDescriptivePatch = async original => response(original, true); await f.model.accept(true); assert.equal(seen.length, 1)
  } finally {f.close()}
})
test('hidden settlement notifies once and observer exceptions cannot recreate unknown state', async () => {
  const seen = [], gate = deferred(), f = await fixture({onAccepted: value => seen.push(value)})
  try {await f.model.prepare(); f.api.acceptAgentDescriptivePatch = () => gate.promise; const work = f.model.accept(true); f.model.setActive(false)
    gate.resolve(response()); await work; assert.equal(seen.length, 1); assert.equal(f.model.snapshot().receipt, null); f.model.setActive(true); assert.ok(f.model.snapshot().receipt)
  } finally {gate.resolve(response()); f.close()}
  for (const onAccepted of [() => {throw Error('observer')}, async () => {throw Error('observer')}]) {
    const current = await fixture({onAccepted})
    try {await current.model.prepare(); await current.model.accept(true); await new Promise(resolve => setImmediate(resolve)); assert.ok(current.model.snapshot().receipt); assert.equal(current.model.snapshot().pending, null); assert.equal(current.model.snapshot().error, '')}
    finally {current.close()}
  }
})
test('live401 expires once while a disposed old employee/API response cannot expire or settle a new lifetime', async () => {
  const f = await fixture()
  try {await f.model.prepare(); f.api.acceptAgentDescriptivePatch = async () => {throw fault(401)}; await f.model.accept(true); await f.model.confirm(); assert.equal(f.expired(), 1); assert.equal(f.model.snapshot().target, null)} finally {f.close()}
  for (const fail of [true, false]) {
    const seen = [], old = await fixture({onAccepted: value => seen.push(value)}), gate = deferred()
    await old.model.prepare(); old.api.acceptAgentDescriptivePatch = () => gate.promise; const work = old.model.accept(true); old.close()
    const fresh = await fixture({onAccepted: value => seen.push(value)})
    try {if (fail) gate.reject(fault(401)); else gate.resolve(response()); await work
      assert.equal(old.expired(), 0); assert.equal(seen.length, 0); assert.deepEqual(fresh.model.snapshot().target, target); assert.equal(fresh.model.snapshot().receipt, null)
    } finally {fresh.close()}
  }
})
test('the existing task guard retains hidden pending and releases it on settlement or owner disposal', async () => {
  const f = await fixture(), unwatch = watchPgNativeOriginalTaskController(f.api, f.model)
  try {assert.equal(pgNativeOriginalTasksBlocked(f.api), false); await f.model.prepare(); f.api.acceptAgentDescriptivePatch = async () => {throw fault(0)}; await f.model.accept(true)
    f.model.setActive(false); assert.equal(pgNativeOriginalTasksBlocked(f.api), true); f.model.setActive(true); await f.model.confirm(); assert.equal(pgNativeOriginalTasksBlocked(f.api), false)
    f.close(); assert.equal(pgNativeOriginalTasksBlocked(f.api), false)
  } finally {unwatch(); f.close()}
})
