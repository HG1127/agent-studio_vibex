// Pure values only: these tests never authenticate a user or execute SQL.
import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {AgentTemplateMarketValueError, agentTemplateMarketProtocol, agentTemplateMarketCategories,
  agentTemplateMarketCategoryLabels, agentTemplateMarketCanonicalJson, agentTemplateMarketDigest,
  agentTemplateMarketObject, agentTemplateMarketArray, agentTemplateMarketId, agentTemplateMarketInteger,
  parseAgentTemplateMarketDescriptions, parseAgentTemplateMarketSnapshot, parseAgentTemplateMarketQuery,
  parseAgentTemplateMarketPublishChoice, parseAgentTemplateMarketUseChoice, parseAgentTemplateMarketPublishIntent,
  parseAgentTemplateMarketUseIntent, parseAgentTemplateMarketLifecycleIntent, parseAgentTemplateMarketRecovery,
  agentTemplateMarketPublishAcknowledgement} from "../src/agent-template-market-contract.ts"

const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0")
const hash = "a".repeat(64)
const descriptions = () => ({goal: "研究公开信息", task_scope: "按范围整理", deliverables: ["交付物"], task_plan: ["步骤"], done_criteria: ["条件"]})
const snapshot = () => ({protocol: agentTemplateMarketProtocol, spec: {...descriptions(), tools: ["web_search"], knowledge_base_ids: [], quality_checks: [], require_approval: true, require_plan_review: true}})
const source = () => ({spec_id: id(1), revision: 2, source_sha256: hash})
const pin = () => ({template_id: id(3), revision: 4, snapshot_sha256: hash})
const publish = () => ({action: "publish", request_id: id(2), source: source(), name: "模板", description: "用途", category: "research", expected_snapshot_sha256: hash,
  confirm: true, acknowledgement: agentTemplateMarketPublishAcknowledgement})
const use = () => ({action: "use", request_id: id(2), template: pin(), copy_name: "我的副本", expected_copy_sha256: hash, confirm: true})

test("all four existing categories, search and source-name fallback choices are retained", () => {
  assert.deepEqual(agentTemplateMarketCategories, ["research", "knowledge", "data", "other"])
  assert.deepEqual(Object.values(agentTemplateMarketCategoryLabels), ["研究", "问答", "分析", "其他"])
  assert.deepEqual(parseAgentTemplateMarketQuery({}), {category: "all", search: ""})
  for (const category of agentTemplateMarketCategories) {
    assert.equal(parseAgentTemplateMarketQuery({category, search: "  研究 "}).search, "研究")
    assert.equal(parseAgentTemplateMarketPublishChoice({action: "preview_publish", source: source(), name: "", description: "用途", category}).category, category)
  }
  assert.equal(parseAgentTemplateMarketUseChoice({action: "preview_use", template: pin(), copy_name: ""}).copy_name, "")
  for (const bad of [{category: "paid"}, {search: "x".repeat(201)}, {owner_id: id(9)}, {public: true}]) assert.throws(() => parseAgentTemplateMarketQuery(bad), AgentTemplateMarketValueError)
})
test("all Native descriptive capacity survives without truncation, with explicit oversize rejection", () => {
  const full = {goal: "目".repeat(3000), task_scope: "域".repeat(4000), deliverables: Array(30).fill("交".repeat(500)),
    task_plan: Array(30).fill("步".repeat(500)), done_criteria: Array(30).fill("标".repeat(500))}
  assert.deepEqual(parseAgentTemplateMarketDescriptions(full), full)
  const complete = {...snapshot(), spec: {...snapshot().spec, ...full}}
  assert.deepEqual(parseAgentTemplateMarketSnapshot(complete), complete)
  for (const bad of [{goal: "x".repeat(3001)}, {task_scope: "x".repeat(4001)}, {deliverables: Array(31).fill("x")}, {task_plan: ["x".repeat(501)]}, {goal: " "}, {goal: "\ud800"}, {task_scope: "bad\0"}]) {
    assert.throws(() => parseAgentTemplateMarketDescriptions({...descriptions(), ...bad}), AgentTemplateMarketValueError)
  }
})
test("snapshot values cannot carry model, HTTP, MCP, KB, approval bypass or assertion payloads", () => {
  assert.deepEqual(parseAgentTemplateMarketSnapshot(snapshot()), snapshot())
  for (const extra of [{model_binding: {connection_id: id(4)}}, {http_tools: []}, {mcp_tools: []}, {knowledge_retrieval: {}},
    {knowledge_base_ids: [id(9)]}, {quality_checks: [{type: "contains", expected: "private"}]}, {require_approval: false},
    {require_plan_review: "true"}, {tools: ["mcp_private"]}, {tools: ["web_search", "web_search"]}, {headers: {authorization: "secret"}}]) {
    assert.throws(() => parseAgentTemplateMarketSnapshot({...snapshot(), spec: {...snapshot().spec, ...extra}}), AgentTemplateMarketValueError)
  }
  assert.throws(() => parseAgentTemplateMarketSnapshot({...snapshot(), owner_id: id(9)}))
  assert.throws(() => parseAgentTemplateMarketSnapshot({...snapshot(), protocol: "agent_release_v1"}))
})
test("publish requires reviewed source and public snapshot pins, exact confirmation and no fee/grant input", () => {
  assert.deepEqual(parseAgentTemplateMarketPublishIntent(publish()), publish())
  for (const extra of [{confirm: false}, {acknowledgement: "APPROVED"}, {expected_snapshot_sha256: "bad"}, {source: {...source(), revision: 0}},
    {source: {...source(), owner_id: id(9)}}, {owner_id: id(9)}, {fee_acknowledgement: "PAY"}, {built_in: true}, {spec: snapshot().spec}]) {
    assert.throws(() => parseAgentTemplateMarketPublishIntent({...publish(), ...extra}), AgentTemplateMarketValueError)
  }
  for (const extra of [{name: "x".repeat(121)}, {description: "x".repeat(121)}, {description: ""}, {category: "community"}]) {
    assert.throws(() => parseAgentTemplateMarketPublishIntent({...publish(), ...extra}))
  }
  assert.equal(parseAgentTemplateMarketPublishIntent({...publish(), name: "名".repeat(120)}).name.length, 120)
})
test("copy and lifecycle keep revision/snapshot/request pins and never accept recipient authority", () => {
  assert.deepEqual(parseAgentTemplateMarketUseIntent(use()), use())
  for (const extra of [{confirm: false}, {expected_copy_sha256: "bad"}, {recipient_id: id(9)}, {owner_id: id(9)}, {model_binding: {}},
    {template: {...pin(), snapshot_sha256: "A".repeat(64)}}, {template: {...pin(), revision: 0}}]) assert.throws(() => parseAgentTemplateMarketUseIntent({...use(), ...extra}))
  for (const action of ["unpublish", "republish", "delete"]) {
    const intent = {action, request_id: id(8), template: pin(), confirm: true}
    assert.deepEqual(parseAgentTemplateMarketLifecycleIntent(intent), intent)
    for (const extra of [{confirm: false}, {public: true}, {restore: true}, {owner_id: id(9)}, {request_id: "not-uuid"}]) assert.throws(() => parseAgentTemplateMarketLifecycleIntent({...intent, ...extra}))
  }
  for (const action of ["restore", "publish", "release", "use"]) assert.throws(() => parseAgentTemplateMarketLifecycleIntent({action, request_id: id(8), template: pin(), confirm: true}))
  assert.deepEqual(parseAgentTemplateMarketRecovery({action: "recover", request_id: id(2)}), {action: "recover", request_id: id(2)})
  assert.throws(() => parseAgentTemplateMarketRecovery({action: "recover", request_id: id(2), owner_id: id(9)}))
})
test("strict objects/arrays reject hidden code, sparse values, prototypes and malformed scalars", () => {
  let called = 0
  const accessor = Object.defineProperty(descriptions(), "goal", {enumerable: true, get() {called++; return "oops"}})
  assert.throws(() => parseAgentTemplateMarketDescriptions(accessor)); assert.equal(called, 0)
  const sparse = []; sparse.length = 1
  const hidden = Object.defineProperty({}, "goal", {value: "x"})
  for (const raw of [sparse, Object.assign([], {extra: 1}), Object.setPrototypeOf([], null)]) assert.throws(() => agentTemplateMarketArray(raw, 10))
  for (const raw of [hidden, {[Symbol("secret")]: 1}, Object.create({}), new Date(), []]) assert.throws(() => agentTemplateMarketObject(raw))
  for (const raw of [-0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1"]) assert.throws(() => agentTemplateMarketInteger(raw))
  assert.equal(agentTemplateMarketId("ABCDEF00-0000-4000-8000-000000000001"), "abcdef00-0000-4000-8000-000000000001")
})
test("browser WebCrypto digest matches actual SHA-256 canonical bytes and captures before await", async () => {
  const a = {z: 1, a: {q: ["文字", 2], p: true}}, b = {a: {p: true, q: ["文字", 2]}, z: 1}
  const expected = createHash("sha256").update(agentTemplateMarketCanonicalJson(a)).digest("hex")
  assert.equal(await agentTemplateMarketDigest(a), expected)
  assert.equal(await agentTemplateMarketDigest(b), expected)
  const mutable = {items: ["first"]}, pending = agentTemplateMarketDigest(mutable)
  mutable.items[0] = "changed"
  assert.equal(await pending, await agentTemplateMarketDigest({items: ["first"]}))
  assert.notEqual(await agentTemplateMarketDigest(mutable), await pending)
})
test("canonicalization rejects hidden execution, cycles, invalid values and excessive trees", () => {
  let called = 0
  const value = {toJSON() {called++; return {}}}
  const cycle = {}; cycle.self = cycle
  let deep = {}; for (let i = 0; i < 26; i++) deep = {next: deep}
  const tooMany = Array.from({length: 20}, () => Array(600).fill("x"))
  for (const raw of [value, cycle, deep, tooMany, undefined, 1n, -0, NaN, [undefined], "x".repeat(524289), "\udfff"]) assert.throws(() => agentTemplateMarketCanonicalJson(raw))
  assert.equal(called, 0)
  assert.equal(agentTemplateMarketCanonicalJson(JSON.parse('{"__proto__":{"safe":true}}')), '{"__proto__":{"safe":true}}')
  assert.equal(Object.prototype.safe, undefined)
})
