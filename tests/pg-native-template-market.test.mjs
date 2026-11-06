// Pure transport/DTO tests with injected fetch; no real employee, network or ACL.
import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeTemplateMarketApi, parseTemplateMarketDetail, parseTemplateMarketPublishPreview, parseTemplateMarketUsePreview,
  templateMarketPublishBody, templateMarketUseBody, templateMarketReceipt, decodeTemplateMarketJson} from "../src/lib/pgNativeTemplateMarket.ts"
import {deriveAgentTemplateMarketSnapshot, deriveAgentTemplateMarketPublishPreview, agentTemplateMarketCopyDigest} from "../services/pg-api/src/agent-template-market-result.ts"
import {agentTemplateMarketDigest} from "../services/pg-api/src/agent-template-market-contract.ts"

const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), hash = "a".repeat(64)
const spec = {goal: "公开研究目标", task_scope: "完整范围", deliverables: ["报告"], task_plan: ["核对"], done_criteria: ["出处"], tools: ["web_search"], require_plan_review: true}
const snapshot = deriveAgentTemplateMarketSnapshot(spec).snapshot, snapshotSha = await agentTemplateMarketDigest(snapshot)
const source = {source: {spec_id: id(1), revision: 2, source_sha256: hash}, name: "我的方案"}
const item = (extra = {}) => ({id: id(2), name: "研究模板", description: "公开用途", category: "research", source_spec_id: "", built_in: false, public: true,
  use_count: 2, created: "2026-10-29T00:00:00.000Z", revision: 1, snapshot_sha256: snapshotSha, ...extra})
const pin = () => ({template_id: id(2), revision: 1, snapshot_sha256: snapshotSha})
const row = () => ({...item(), spec: snapshot.spec, is_mine: false, author_tail: "0001"})
const pub = await deriveAgentTemplateMarketPublishPreview({action: "preview_publish", source: source.source, name: "模板", description: "用途", category: "research"}, source.name, spec)
const use = {template: pin(), name: "我的副本", snapshot, copy_sha256: await agentTemplateMarketCopyDigest(snapshot, "我的副本"), resource_selection_required: true, starts_run: false}
const response = (value, status = 200, headers = {}) => new Response(typeof value === "string" ? value : JSON.stringify(value), {status, headers: {"Content-Type": "application/json", ...headers}})
const useReceipt = (intent, extra = {}) => ({operation: "use", request_id: intent.request_id, template_id: intent.template.template_id,
  revision: intent.template.revision, snapshot_sha256: intent.template.snapshot_sha256, spec_id: id(9), spec_revision: 1, use_count: 3, ...extra})

test("all fixed market/mine/source/detail routes use Native same-origin Cookie and safe read metadata", async () => {
  const calls = [], replies = [{ok: true, items: [row()]}, {ok: true, items: [item({source_spec_id: id(1), public: false})]}, {ok: true, items: [{spec_id: id(1), name: source.name, revision: 2}]}, source,
    {item: item(), snapshot, is_mine: false, author_tail: "0001"}]
  const api = createPgNativeTemplateMarketApi({rootPath: "", transport: async (url, init) => {calls.push({url, init}); return response(replies.shift())}})
  assert.equal((await api.market({category: "research", search: "中文 & ?"})).items.length, 1)
  assert.equal((await api.mine()).items[0].public, false); assert.equal((await api.sources()).items[0].name, source.name)
  assert.deepEqual(await api.source(id(1)), source); assert.equal((await api.detail(id(2))).item.id, id(2))
  assert.deepEqual(calls.map(call => call.url), ["/api/v2/template-market/market?category=research&search=%E4%B8%AD%E6%96%87+%26+%3F", "/api/v2/template-market/mine", "/api/v2/template-market/sources", "/api/v2/template-market/sources/" + id(1), "/api/v2/template-market/" + id(2)])
  for (const {init} of calls) {assert.equal(init.method, "GET"); assert.equal(init.credentials, "same-origin"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.equal(init.headers.Authorization, undefined); assert.equal(init.headers["X-Rh-User-Id"], undefined); assert.equal(init.body, undefined)}
})
test("publish/copy previews validate complete safe snapshots and exact visible content digests", async () => {
  const calls = [], api = createPgNativeTemplateMarketApi({transport: async (url, init) => {calls.push({url, init}); return response(url.endsWith("preview-publish") ? pub : use)}})
  const choice = {action: "preview_publish", source: source.source, name: "模板", description: "用途", category: "research"}
  assert.deepEqual(await api.previewPublish(choice), pub)
  assert.deepEqual(await api.previewUse({action: "preview_use", template: pin(), copy_name: use.name}), use)
  for (const {url, init} of calls) {assert.match(url, /^\/__pg_native\/api\/v2\/template-market\/preview-/); assert.equal(init.method, "POST"); assert.equal(init.headers["X-AgentStudio-Request"], "1"); assert.equal(init.headers["Content-Type"], "application/json")}
  for (const bad of [{...pub, snapshot_sha256: hash}, {...pub, snapshot: {...snapshot, spec: {...snapshot.spec, model_binding: {}}}}, {...pub, authority: true}]) await assert.rejects(parseTemplateMarketPublishPreview(bad))
  for (const bad of [{...use, copy_sha256: hash}, {...use, template: {...pin(), snapshot_sha256: hash}}, {...use, starts_run: true}, {...use, resource_selection_required: false}]) await assert.rejects(parseTemplateMarketUsePreview(bad))
  const wrong = createPgNativeTemplateMarketApi({transport: async () => response({...pub, source: {...source.source, revision: 8}})})
  await assert.rejects(wrong.previewPublish(choice), error => error.status === 503)
})
test("lightweight source options reject private or fabricated source pins and validate display revision", async () => {
  for (const option of [{spec_id: id(1), name: "选项", revision: 1, source_sha256: hash}, {source: source.source, name: source.name},
    {spec_id: id(1), name: "选项", revision: 0}, {spec_id: id(1), name: "选项", revision: "1"}]) {
    await assert.rejects(createPgNativeTemplateMarketApi({transport: async () => response({ok: true, items: [option]})}).sources(), error => error.status === 503)
  }
})
test("full-capacity market rows may exceed one-preview byte cap without losing descriptions", async () => {
  const full = deriveAgentTemplateMarketSnapshot({goal: "目".repeat(3000), task_scope: "域".repeat(4000), deliverables: Array(30).fill("交".repeat(500)),
    task_plan: Array(30).fill("步".repeat(500)), done_criteria: Array(30).fill("标".repeat(500)), tools: ["web_search"]}).snapshot
  const fullSha = await agentTemplateMarketDigest(full), payload = {ok: true, items: Array.from({length: 4}, (_, index) => ({...row(), id: id(30 + index), spec: full.spec, snapshot_sha256: fullSha}))}
  assert.ok(new TextEncoder().encode(JSON.stringify(payload)).byteLength > 524288)
  const page = await createPgNativeTemplateMarketApi({transport: async () => response(payload)}).market()
  assert.equal(page.items.length, 4); assert.equal(page.items[3].spec.deliverables[29].length, 500); assert.equal(page.items[3].spec.goal.length, 3000)
})
test("all five confirmed actions retain exact intent and correlate immutable returned receipt", async () => {
  const intents = [templateMarketPublishBody(pub, id(8)), templateMarketUseBody(use, id(8)), ...["unpublish", "republish", "delete"].map(action => ({action, request_id: id(8), template: pin(), confirm: true}))]
  const calls = [], api = createPgNativeTemplateMarketApi({rootPath: "", transport: async (url, init) => {
    const intent = JSON.parse(init.body); calls.push({url, init, intent})
    if (intent.action === "publish") return response({operation: "publish", request_id: intent.request_id, item: item({source_spec_id: id(1), name: pub.name, description: pub.description, use_count: 0})})
    if (intent.action === "use") return response(useReceipt(intent))
    return response({operation: intent.action, request_id: intent.request_id, template_id: id(2), revision: 2, snapshot_sha256: snapshotSha, public: intent.action === "republish", deleted: intent.action === "delete"})
  }})
  for (const intent of intents) {const receipt = await api.mutate(intent); assert.equal(receipt.request_id, intent.request_id); assert.equal(receipt.operation, intent.action)}
  assert.deepEqual(calls.map(call => call.intent), intents)
  assert.deepEqual(calls.map(call => [call.url, call.init.method]), [["/api/v2/template-market/publish", "POST"], ["/api/v2/template-market/" + id(2) + "/use", "POST"], ["/api/v2/template-market/" + id(2) + "/unpublish", "POST"], ["/api/v2/template-market/" + id(2) + "/republish", "POST"], ["/api/v2/template-market/" + id(2), "DELETE"]])
  for (const call of calls) assert.equal(call.init.headers["X-AgentStudio-Request"], "1")
  const intent = intents[1]
  for (const extra of [{request_id: id(7)}, {template_id: id(5)}, {revision: 2}, {snapshot_sha256: hash}, {owner_id: id(3)}]) assert.throws(() => templateMarketReceipt(useReceipt(intent, extra), intent))
})
test("unknown ACK has no POST replay; recovery is read-only and must match original request and target", async () => {
  const intent = templateMarketUseBody(use, id(8)); let calls = 0
  const api = createPgNativeTemplateMarketApi({transport: async (url, init) => {calls++; if (init.method === "POST") throw Error("lost ACK"); assert.equal(url, "/__pg_native/api/v2/template-market/requests/" + id(8)); assert.equal(init.method, "GET"); assert.equal(init.body, undefined); return response({status: "recorded", receipt: useReceipt(intent)})}})
  await assert.rejects(api.mutate(intent), error => error.status === 0 && !error.definitive); assert.equal(calls, 1)
  assert.equal((await api.recover(intent)).receipt.spec_id, id(9)); assert.equal(calls, 2)
  for (const payload of [{status: "not_recorded", request_id: id(7)}, {status: "recorded", receipt: useReceipt(intent, {template_id: id(7)})}]) await assert.rejects(createPgNativeTemplateMarketApi({transport: async () => response(payload)}).recover(intent), error => error.status === 503)
})
test("only own unlisted detail is shape-readable; corrupted/foreign source and capability payloads are refused", async () => {
  const own = {item: item({source_spec_id: id(1), public: false}), snapshot, is_mine: true, author_tail: "0001"}
  assert.equal((await parseTemplateMarketDetail(own)).item.public, false)
  for (const bad of [{...own, is_mine: false}, {...own, item: {...own.item, built_in: true}}, {...own, item: {...own.item, snapshot_sha256: hash}},
    {...own, owner_id: id(1)}, {...own, snapshot: {...snapshot, spec: {...snapshot.spec, knowledge_base_ids: [id(1)]}}}]) await assert.rejects(parseTemplateMarketDetail(bad))
  await assert.rejects(createPgNativeTemplateMarketApi({transport: async () => response({...source, source: {...source.source, spec_id: id(7)}})}).source(id(1)), error => error.status === 503)
})
test("duplicate keys, malformed UTF8, wrong media type and response length mismatches fail closed", async () => {
  const page = JSON.stringify({ok: true, items: [row()]})
  const replies = [response(page.replace('"ok":true', '"ok":true,"o\\u006b":true')), response("prefix " + page),
    response(page, 200, {"Content-Type": "text/html"}), response(page, 200, {"Content-Length": "2"}), response(page, 200, {"Content-Length": "33554433"}),
    new Response(new Uint8Array([0xc3, 0x28]), {headers: {"Content-Type": "application/json"}})]
  for (const reply of replies) await assert.rejects(createPgNativeTemplateMarketApi({transport: async () => reply}).market(), error => error.status === 503)
  for (const text of ['{"a":1,"\\u0061":2}', '\ufeff{}', '{} trailing', '{"a":-0}', '{"a":1e999}']) assert.throws(() => decodeTemplateMarketJson(text))
})
test("timeout cancels a stalled stream and known 4xx differs from unknown server errors", async () => {
  let calls = 0, cancelled = 0
  const api = createPgNativeTemplateMarketApi({timeoutMs: 20, transport: async () => {calls++; return new Response(new ReadableStream({cancel() {cancelled++}}), {headers: {"Content-Type": "application/json"}})}})
  await assert.rejects(api.mutate(templateMarketUseBody(use, id(8))), error => error.status === 0); assert.equal(calls, 1); assert.equal(cancelled, 1)
  for (const status of [400, 404, 409, 412, 428]) await assert.rejects(createPgNativeTemplateMarketApi({transport: async () => response({error: "template_source_changed"}, status)}).market(), error => error.status === status && error.definitive)
  await assert.rejects(createPgNativeTemplateMarketApi({transport: async () => response({error: "internal_error"}, 500)}).market(), error => error.status === 500 && !error.definitive)
})
test("external origins, caller identity options and extra intent grants cause no transport call", () => {
  for (const config of [{rootPath: "https://outside.invalid"}, {actor: id(1)}, {headers: {Authorization: "x"}}, {timeoutMs: 8001}]) assert.throws(() => createPgNativeTemplateMarketApi(config))
  let calls = 0; const api = createPgNativeTemplateMarketApi({transport: async () => {calls++; return response({})}})
  for (const extra of [{owner_id: id(1)}, {recipient_id: id(1)}, {fee_acknowledgement: "PAY"}, {model_binding: {}}]) assert.throws(() => api.mutate({...templateMarketUseBody(use, id(8)), ...extra}))
  assert.equal(calls, 0)
})
