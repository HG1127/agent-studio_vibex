// In-memory UI state with injected API only. Not real DB/Owner authorization.
import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeTemplateMarketSession} from "../src/lib/pgNativeTemplateMarketSession.ts"
import {PgNativeTemplateMarketError} from "../src/lib/pgNativeTemplateMarket.ts"
import {deriveAgentTemplateMarketSnapshot, deriveAgentTemplateMarketPublishPreview, agentTemplateMarketCopyDigest} from "../services/pg-api/src/agent-template-market-result.ts"
import {agentTemplateMarketDigest} from "../services/pg-api/src/agent-template-market-contract.ts"
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), hash = "a".repeat(64)
const spec = {goal: "完整目标", task_scope: "完整范围", deliverables: ["完整交付"], task_plan: ["完整计划"], done_criteria: ["完整条件"], tools: ["web_search"], require_plan_review: true}
const snapshot = deriveAgentTemplateMarketSnapshot(spec).snapshot, snapshotSha = await agentTemplateMarketDigest(snapshot)
const source = {source: {spec_id: id(7), revision: 2, source_sha256: hash}, name: "我的方案"}
const baseItem = () => ({id: id(2), name: "研究模板", description: "研究用途", category: "research", source_spec_id: id(7), built_in: false, public: true,
  use_count: 2, created: "2026-10-29T00:00:00.000Z", revision: 1, snapshot_sha256: snapshotSha})
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done}); return {promise, resolve}}
function fixture(overrides = {}, settings = {}) {
  const calls = [], item = {...baseItem(), ...settings.item}, detail = {item, snapshot, is_mine: true, author_tail: "0001"}
  const receipt = intent => intent.action === "publish" ? {operation: "publish", request_id: intent.request_id, item: {...baseItem(), name: intent.name, description: intent.description, category: intent.category, use_count: 0}} : intent.action === "use" ?
    {operation: "use", request_id: intent.request_id, template_id: item.id, revision: item.revision, snapshot_sha256: snapshotSha, spec_id: id(9), spec_revision: 1, use_count: 3} :
    {operation: intent.action, request_id: intent.request_id, template_id: item.id, revision: item.revision + 1, snapshot_sha256: snapshotSha, public: intent.action === "republish", deleted: intent.action === "delete"}
  const api = {
    market: async query => {calls.push(["market", structuredClone(query)]); return {ok: true, items: [{...item, spec: snapshot.spec, is_mine: true, author_tail: "0001"}]}},
    mine: async () => ({ok: true, items: [item]}), sources: async () => ({ok: true, items: [{spec_id: source.source.spec_id, name: source.name, revision: 1}]}), source: async () => structuredClone(source),
    detail: async () => structuredClone(detail), previewPublish: async choice => deriveAgentTemplateMarketPublishPreview(choice, source.name, spec),
    previewUse: async choice => ({template: choice.template, name: choice.copy_name || item.name, snapshot, copy_sha256: await agentTemplateMarketCopyDigest(snapshot, choice.copy_name || item.name), resource_selection_required: true, starts_run: false}),
    mutate: async intent => {calls.push(["mutate", structuredClone(intent)]); return receipt(intent)}, recover: async intent => {calls.push(["recover", structuredClone(intent)]); return {status: "recorded", receipt: receipt(intent)}}, ...overrides,
  }
  let ids = 0, changed = 0, expired = 0
  const session = createPgNativeTemplateMarketSession(api, {employeeId: id(1), scopeKey: "login-one", requestId: () => id(100 + ++ids), onChanged: () => {changed++}, onExpired: () => {expired++}})
  session.setAvailability({available: true, writes: true}); session.setActive(true)
  return {session, api, calls, item, detail, receipt, ids: () => ids, changed: () => changed, expired: () => expired}
}
async function preparedCopy(f) {await f.session.openDetail(id(2)); f.session.setCopyName("我的独立助手"); await f.session.previewUse()}
async function preparedPublish(f) {await f.session.openPublish(); f.session.setPublishDraft({sourceId: id(7), name: "我的公开模板", description: "用途", category: "knowledge"}); await f.session.previewPublish()}

test("market/mine/query retain full categories, distinct ready/error/empty and immutable safe snapshots", async () => {
  const f = fixture(); await f.session.refresh()
  assert.equal(f.session.snapshot().marketStatus, "ready"); assert.deepEqual(f.session.snapshot().market[0].spec.task_plan, spec.task_plan)
  assert.throws(() => f.session.snapshot().market.push("tampered"))
  f.session.setQuery({category: "knowledge", search: "  keyword "}); assert.equal(f.session.snapshot().marketStatus, "idle"); assert.equal(f.session.snapshot().query.search, "keyword")
  await f.session.refresh(); assert.deepEqual(f.calls.at(-1), ["market", {category: "knowledge", search: "keyword"}])
  await f.session.selectTab("mine"); assert.equal(f.session.snapshot().mineStatus, "ready"); assert.equal(f.session.snapshot().mine.length, 1)
  const failed = fixture({market: async () => {throw Error("offline")}}); await failed.session.refresh()
  assert.equal(failed.session.snapshot().marketStatus, "error"); assert.equal(failed.session.snapshot().market.length, 0); assert.match(failed.session.snapshot().error, /失败/)
  const empty = fixture({market: async () => ({ok: true, items: []})}); await empty.session.refresh(); assert.equal(empty.session.snapshot().marketStatus, "ready")
})
test("publish requires current saved source, complete preview and explicit checkbox; any edit resets review", async () => {
  const f = fixture(); await preparedPublish(f)
  assert.equal(f.session.snapshot().publishPreview.source.revision, 2, "fresh private source proof is fetched after the lightweight option")
  assert.deepEqual(Object.keys(f.session.snapshot().sources[0]).sort(), ["spec_id", "name", "revision"].sort())
  assert.equal(f.session.snapshot().publishPreview.snapshot.spec.goal, spec.goal)
  await f.session.publish(); assert.equal(f.ids(), 0); assert.equal(f.calls.filter(c => c[0] === "mutate").length, 0)
  f.session.setReviewed(true); f.session.setPublishDraft({description: "更新后的用途"})
  assert.equal(f.session.snapshot().publishPreview, null); assert.equal(f.session.snapshot().publishDraft.reviewed, false)
  await f.session.publish(); assert.equal(f.ids(), 0)
  await f.session.previewPublish(); f.session.setReviewed(true); await f.session.publish()
  const intent = f.calls.find(c => c[0] === "mutate")[1]
  assert.equal(intent.action, "publish"); assert.equal(intent.source.revision, 2); assert.equal(intent.description, "更新后的用途")
  assert.equal(intent.expected_snapshot_sha256, snapshotSha); assert.equal(f.ids(), 1); assert.equal(f.changed(), 1)
  assert.equal(f.session.snapshot().publishOpen, false); assert.equal(f.session.snapshot().receipt.operation, "publish")
  assert.doesNotMatch(JSON.stringify(intent), /owner_id|recipient_id|model_binding|http_tools|mcp_tools|fee_acknowledgement/)
})
test("copy needs explicit preview/confirmation, retains all descriptions and never starts execution", async () => {
  const f = fixture(); await f.session.openDetail(id(2)); await f.session.copy(); assert.equal(f.ids(), 0)
  f.session.setCopyName("我的独立助手"); await f.session.previewUse()
  assert.deepEqual(f.session.snapshot().usePreview.snapshot.spec.done_criteria, spec.done_criteria)
  f.session.setCopyName("另一个名称"); assert.equal(f.session.snapshot().usePreview, null)
  await f.session.previewUse(); await f.session.copy()
  assert.equal(f.ids(), 1); assert.equal(f.session.snapshot().receipt.spec_id, id(9)); assert.match(f.session.snapshot().notice, /配置自己的模型与资源/)
  assert.equal(f.calls.find(c => c[0] === "mutate")[1].copy_name, "另一个名称")
  assert.equal(f.changed(), 1); assert.equal(f.session.snapshot().pending, null)
})
test("rapid duplicate confirmation enters one pending mutation and allocates only one request ID", async () => {
  const wait = deferred(); let calls = 0, intent
  const f = fixture({mutate: value => {calls++; intent = structuredClone(value); return wait.promise}})
  await preparedCopy(f); const first = f.session.copy(), second = f.session.copy()
  assert.equal(calls, 1); assert.equal(f.ids(), 1); assert.equal(f.session.snapshot().pending.request_id, intent.request_id)
  wait.resolve(f.receipt(intent)); await Promise.all([first, second])
  assert.equal(f.session.snapshot().receipt.request_id, intent.request_id); assert.equal(f.changed(), 1)
})
test("unpublish/republish/permanent-delete need fresh own detail and separate confirmation", async () => {
  for (const action of ["unpublish", "republish", "delete"]) {
    const f = fixture({}, {item: {public: action !== "republish"}})
    await f.session.openLifecycle(id(2), action); assert.equal(f.session.snapshot().lifecycle.confirmed, false)
    await f.session.commitLifecycle(); assert.equal(f.ids(), 0)
    f.session.setLifecycleConfirmed(true); await f.session.commitLifecycle()
    assert.equal(f.ids(), 1); const receipt = f.session.snapshot().receipt
    assert.equal(receipt.operation, action); assert.equal(receipt.deleted, action === "delete"); assert.equal(receipt.public, action === "republish")
  }
  const foreign = fixture({detail: async () => ({item: {...baseItem(), source_spec_id: ""}, snapshot, is_mine: false, author_tail: "0001"})})
  await foreign.session.openLifecycle(id(2), "delete"); assert.equal(foreign.session.snapshot().lifecycle, null); assert.equal(foreign.ids(), 0)
})
test("lost ACK retains exactly one original request; not_recorded never allocates or replays a mutation", async () => {
  let mutations = 0, original, lookups = 0
  const f = fixture({mutate: async intent => {mutations++; original = structuredClone(intent); throw new PgNativeTemplateMarketError(0, "template_market_outcome_unknown")},
    recover: async intent => {lookups++; assert.deepEqual(intent, original); return {status: "not_recorded", request_id: intent.request_id}}})
  await preparedCopy(f); await f.session.copy(); assert.equal(mutations, 1); assert.equal(f.ids(), 1)
  const pending = f.session.snapshot().pending; assert.equal(pending.request_id, original.request_id); assert.equal(Object.hasOwn(pending, "body"), false)
  await f.session.copy(); await f.session.previewUse(); await f.session.openPublish(); assert.equal(mutations, 1); assert.equal(f.ids(), 1)
  await f.session.recover(); await f.session.recover(); assert.equal(lookups, 2); assert.deepEqual(f.session.snapshot().pending, pending); assert.match(f.session.snapshot().notice, /不会自动重新提交/)
  f.session.setActive(false); assert.equal(f.session.snapshot().pending, null); assert.equal(f.session.snapshot().detail, null)
  f.session.setActive(true); assert.deepEqual(f.session.snapshot().pending, pending)
  f.session.setAvailability({available: true, writes: false}); await f.session.recover(); assert.equal(lookups, 3); assert.equal(mutations, 1)
})
test("recorded original result recovers under write opt-out without another ID or side effect", async () => {
  const f = fixture({mutate: async () => {throw new PgNativeTemplateMarketError(500, "template_market_outcome_unknown")}})
  await preparedCopy(f); await f.session.copy(); const original = f.session.snapshot().pending.request_id
  f.session.setAvailability({available: true, writes: false}); await f.session.recover()
  assert.equal(f.session.snapshot().pending, null); assert.equal(f.session.snapshot().receipt.request_id, original); assert.equal(f.session.snapshot().receipt.spec_id, id(9)); assert.equal(f.ids(), 1)
  assert.equal(f.changed(), 1); assert.equal(f.calls.filter(c => c[0] === "recover").length, 1)
})
test("publication and permanent-delete ACK recovery use original intent without restoring or republishing content", async () => {
  for (const operation of ["publish", "delete"]) {
    let sent
    const f = fixture({mutate: async intent => {sent = structuredClone(intent); throw new PgNativeTemplateMarketError(0, "template_market_outcome_unknown")}})
    if (operation === "publish") {await preparedPublish(f); f.session.setReviewed(true); await f.session.publish()}
    else {await f.session.openLifecycle(id(2), "delete"); f.session.setLifecycleConfirmed(true); await f.session.commitLifecycle()}
    assert.equal(f.session.snapshot().pending.request_id, sent.request_id); f.session.setAvailability({available: true, writes: false})
    await f.session.recover(); const receipt = f.session.snapshot().receipt
    assert.equal(receipt.operation, operation); assert.equal(receipt.request_id, sent.request_id); assert.equal(f.ids(), 1); assert.equal(f.changed(), 1)
    if (operation === "delete") {assert.equal(receipt.deleted, true); assert.equal(f.session.snapshot().detail, null); assert.match(f.session.snapshot().notice, /永久删除/)}
  }
})
test("CAS refusal clears obsolete confirmation and shows refresh; mismatched receipt remains uncertain", async () => {
  const stale = fixture({mutate: async () => {throw new PgNativeTemplateMarketError(409, "revision_conflict", true)}})
  await preparedCopy(stale); await stale.session.copy()
  assert.equal(stale.session.snapshot().pending, null); assert.equal(stale.session.snapshot().detail, null); assert.equal(stale.session.snapshot().usePreview, null); assert.match(stale.session.snapshot().error, /已变化/)
  assert.equal(stale.ids(), 1)
  const wrong = fixture({mutate: async intent => ({operation: "use", request_id: id(999), template_id: id(2), revision: 1, snapshot_sha256: snapshotSha, spec_id: id(9), spec_revision: 1, use_count: 3})})
  await preparedCopy(wrong); await wrong.session.copy(); assert.ok(wrong.session.snapshot().pending); assert.equal(wrong.session.snapshot().receipt, null)
})
test("session generation/hidden scope fences late reads and drops old employee data before reactivation", async () => {
  const wait = deferred(), f = fixture({market: () => wait.promise})
  const request = f.session.refresh(); assert.equal(f.session.snapshot().busy, true)
  f.session.setActive(false); f.session.setActive(true)
  wait.resolve({ok: true, items: [{...baseItem(), spec: snapshot.spec, is_mine: true, author_tail: "0001"}]}); await request
  assert.equal(f.session.snapshot().market.length, 0); assert.equal(f.session.snapshot().busy, false)
  assert.equal(f.session.matchesScope(f.api, id(1), "login-one"), true); assert.equal(f.session.matchesScope(f.api, id(1), "login-two"), false)
  await preparedPublish(f); f.session.setReviewed(true); f.session.setActive(false); f.session.setActive(true)
  assert.equal(f.session.snapshot().publishOpen, false); assert.equal(f.session.snapshot().publishPreview, null); assert.equal(f.session.snapshot().publishDraft.reviewed, false)
  f.session.dispose(); assert.equal(f.session.matchesScope(f.api, id(1), "login-one"), false); assert.equal(f.session.snapshot().market.length, 0)
})
test("401/403 and late mutation completion clear scoped content and cannot notify a replacement session", async () => {
  for (const status of [401, 403]) {
    const f = fixture({market: async () => {throw new PgNativeTemplateMarketError(status, "denied", true)}})
    await f.session.refresh(); assert.equal(f.session.snapshot().available, false); assert.equal(f.session.snapshot().market.length, 0); assert.equal(f.expired(), status === 401 ? 1 : 0)
  }
  const wait = deferred(), entered = deferred(), f = fixture({mutate: () => {entered.resolve(); return wait.promise}})
  await preparedCopy(f); const request = f.session.copy(); await entered.promise
  assert.ok(f.session.snapshot().pending); const intent = {request_id: f.session.snapshot().pending.request_id, action: "use"}
  f.session.dispose(); wait.resolve({operation: "use", request_id: intent.request_id, template_id: id(2), revision: 1, snapshot_sha256: snapshotSha, spec_id: id(9), spec_revision: 1, use_count: 3}); await request
  assert.equal(f.session.snapshot().receipt, null); assert.equal(f.changed(), 0)
})

test("401/403 cleared scope is emitted to subscribers before an external parent rerender", async () => {
  for (const status of [401, 403]) {
    let denied = false
    const f = fixture({market: async () => {if (denied) throw new PgNativeTemplateMarketError(status, "denied", true); return {ok: true, items: []}}})
    await preparedPublish(f); await f.session.openDetail(id(2))
    const frames = [], unsubscribe = f.session.subscribe(() => frames.push(f.session.snapshot()))
    denied = true; await f.session.refresh()
    assert.ok(frames.length > 0)
    assert.equal(frames.at(-1).available, false, "React subscriber must receive the cleared scope")
    assert.equal(frames.at(-1).detail, null)
    assert.equal(frames.at(-1).publishPreview, null)
    assert.deepEqual(frames.at(-1).sources, [])
    assert.equal(frames.at(-1).busy, false)
    unsubscribe()
  }
})

test("automatic inventory refresh retains the confirmed operation after parent write availability changes", async () => {
  for (const operation of ["publish", "use", "delete"]) {
    const f = fixture()
    if (operation === "publish") {await preparedPublish(f); f.session.setReviewed(true); await f.session.publish()}
    else if (operation === "use") {await preparedCopy(f); await f.session.copy()}
    else {await f.session.openLifecycle(id(2), "delete"); f.session.setLifecycleConfirmed(true); await f.session.commitLifecycle()}
    const confirmed = f.session.snapshot()
    assert.ok(confirmed.notice); assert.equal(confirmed.receipt.operation, operation)
    f.session.setAvailability({available: true, writes: false}); f.session.setAvailability({available: true, writes: true})
    await f.session.refresh({preserveNotice: true})
    assert.equal(f.session.snapshot().notice, confirmed.notice); assert.deepEqual(f.session.snapshot().receipt, confirmed.receipt)
    assert.equal(f.session.snapshot().marketStatus, "ready")
    assert.equal(f.calls.filter(call => call[0] === "mutate").length, 1)
    await f.session.refresh(); assert.equal(f.session.snapshot().notice, "", "a new explicit action clears the old notice")
  }
})

test("preserving a confirmed notice cannot retain it after authentication or access changes", async () => {
  for (const status of [401, 403]) {
    let denied = false
    const f = fixture({market: async () => {if (denied) throw new PgNativeTemplateMarketError(status, "denied", true); return {ok: true, items: []}}})
    await preparedPublish(f); f.session.setReviewed(true); await f.session.publish(); assert.ok(f.session.snapshot().notice)
    denied = true; await f.session.refresh({preserveNotice: true})
    assert.equal(f.session.snapshot().notice, ""); assert.equal(f.session.snapshot().receipt, null); assert.equal(f.session.snapshot().available, false)
  }
  const wait = deferred(), f = fixture({market: () => wait.promise})
  await preparedPublish(f); f.session.setReviewed(true); await f.session.publish()
  const pending = f.session.refresh({preserveNotice: true}); f.session.setActive(false); f.session.setActive(true)
  wait.resolve({ok: true, items: []}); await pending
  assert.equal(f.session.snapshot().notice, ""); assert.equal(f.session.snapshot().receipt, null)
})
