// Candidates and DTOs only. No real SQL, employee, ACL, receipt or copy positive.
import test from "node:test"
import assert from "node:assert/strict"
import {agentTemplateMarketProtocol, agentTemplateMarketDigest, agentTemplateMarketPublishAcknowledgement} from "../src/agent-template-market-contract.ts"
import {deriveAgentTemplateMarketSnapshot, deriveAgentTemplateMarketPublishPreview, deriveAgentTemplateMarketCopy,
  agentTemplateMarketCreateInput, agentTemplateMarketCopyDigest, agentTemplateMarketIntentDigest,
  parseAgentTemplateMarketRow, parseAgentTemplateMarketPage, parseAgentTemplateMarketMinePage,
  parseAgentTemplateMarketMineRow, parseAgentTemplateMarketReceipt, parseAgentTemplateMarketRecoveryResult} from "../src/agent-template-market-result.ts"

const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), hash = "a".repeat(64)
const sourcePin = () => ({spec_id: id(1), revision: 2, source_sha256: hash})
const source = () => ({goal: "完整目标", task_scope: "范围和边界", deliverables: ["报告", "出处"], task_plan: ["研究", "核对"], done_criteria: ["可核查"],
  tools: ["网络搜索", "WEB_SEARCH", "统计计算", "knowledge_search", "http_private", "mcp_private", "private_unknown"],
  knowledge_base_ids: [id(30)], require_approval: false, require_plan_review: true,
  model_binding: {connection_id: id(20), connection_revision: 9, model_id: "PRIVATE_MODEL"},
  http_tools: [{name: "http_private", description: "PRIVATE_CONNECTOR", connection_id: id(21), connection_revision: 3, headers: {authorization: "PRIVATE_SECRET"}}],
  mcp_tools: [{name: "mcp_private", connection_id: id(22), connection_revision: 4, tool_name: "PRIVATE_TOOL", catalog_sha256: "b".repeat(64)}],
  knowledge_retrieval: {profile_id: id(23), profile_revision: 5, consent_revision: 6, mode: "semantic"},
  quality_checks: [{type: "contains", expected: "PRIVATE_ASSERTION"}], credential_blob: "PRIVATE_CREDENTIAL"})
const snap = () => deriveAgentTemplateMarketSnapshot(source()).snapshot
const mine = (extra = {}) => ({id: id(2), name: "研究模板", description: "研究用途", category: "research", source_spec_id: id(1), built_in: false,
  public: true, use_count: 0, created: "2026-10-29T00:00:00.000Z", revision: 1, snapshot_sha256: hash, ...extra})
const row = (extra = {}) => ({...mine({source_spec_id: ""}), spec: snap().spec, is_mine: false, author_tail: "0009", ...extra})
const lifecycle = (operation = "unpublish", extra = {}) => ({operation, request_id: id(8), template_id: id(2), revision: 2, snapshot_sha256: hash,
  public: operation === "republish", deleted: operation === "delete", ...extra})

test("snapshot preserves every descriptive field and plan review while stripping source capabilities and private values", () => {
  const original = source(), before = structuredClone(original), {snapshot, removed, authority} = deriveAgentTemplateMarketSnapshot(original)
  for (const key of ["goal", "task_scope", "deliverables", "task_plan", "done_criteria", "require_plan_review"]) assert.deepEqual(snapshot.spec[key], original[key])
  assert.deepEqual(snapshot.spec.tools, ["web_search", "calculate", "knowledge_search"])
  assert.deepEqual(snapshot.spec.knowledge_base_ids, []); assert.deepEqual(snapshot.spec.quality_checks, [])
  assert.equal(snapshot.spec.require_approval, true); assert.equal(authority, false)
  assert.deepEqual(removed, {model_binding: true, http_tools: 1, mcp_tools: 1, knowledge_bases: 1, knowledge_retrieval: true,
    quality_checks: 1, unknown_tools: 3, unknown_fields: 1})
  assert.doesNotMatch(JSON.stringify({snapshot, removed}), /PRIVATE_|000000000020|000000000021|000000000022|000000000023|000000000030|http_private|mcp_private/)
  assert.deepEqual(original, before)
  snapshot.spec.deliverables.push("new"); assert.deepEqual(original.deliverables, before.deliverables)
})
test("all aliases are canonical builtins, duplicate aliases collapse and inherited object names never become tools", () => {
  const input = source(); input.tools = ["计算器", "数学计算", "文本摘要", "内容摘要", "知识库检索", "网页搜索", "联网搜索", "网页内容提取", "网页抓取", "constructor", "__proto__", "toString"]
  const {snapshot, removed} = deriveAgentTemplateMarketSnapshot(input)
  assert.deepEqual(snapshot.spec.tools, ["calculate", "summarize", "knowledge_search", "web_search", "web_fetch"])
  assert.equal(removed.unknown_tools, 3)
  const shadowed = source(); shadowed.tools = ["web_search"]; shadowed.http_tools = [{name: "web_search", secret: "PRIVATE"}]
  assert.deepEqual(deriveAgentTemplateMarketSnapshot(shadowed).snapshot.spec.tools, [])
  shadowed.http_tools = [{name: "网页搜索", secret: "PRIVATE"}]
  assert.deepEqual(deriveAgentTemplateMarketSnapshot(shadowed).snapshot.spec.tools, [])
})
test("source absence defaults only optional safety fields and malformed values cannot be silently truncated", () => {
  const minimal = {goal: "目标", task_scope: "", deliverables: [], task_plan: [], done_criteria: [], tools: []}
  const {snapshot} = deriveAgentTemplateMarketSnapshot(minimal)
  assert.equal(snapshot.spec.require_plan_review, false); assert.equal(snapshot.spec.require_approval, true)
  for (const extra of [{goal: "x".repeat(3001)}, {deliverables: ["x".repeat(501)]}, {tools: Array(51).fill("web_search")},
    {knowledge_base_ids: "private"}, {require_plan_review: 1}, {require_approval: "false"}, {http_tools: [{name: 2}]}]) assert.throws(() => deriveAgentTemplateMarketSnapshot({...minimal, ...extra}))
  let called = 0
  const raw = Object.defineProperty(source(), "credential_blob", {enumerable: true, get() {called++; return "PRIVATE"}})
  assert.throws(() => deriveAgentTemplateMarketSnapshot(raw)); assert.equal(called, 0)
})
test("publish preview pins public bytes, keeps fallback name and does not claim to validate the source owner", async () => {
  const choice = {action: "preview_publish", source: sourcePin(), name: "", description: " 用途 ", category: "knowledge"}
  const result = await deriveAgentTemplateMarketPublishPreview(choice, "原方案名", source())
  assert.equal(result.name, "原方案名"); assert.equal(result.description, "用途"); assert.equal(result.category, "knowledge")
  assert.deepEqual(result.source, sourcePin()); assert.equal(result.snapshot_sha256, await agentTemplateMarketDigest(result.snapshot))
  assert.equal(result.public_text_review_required, true); assert.equal(result.authority, false)
  const privateChange = source(); privateChange.model_binding.connection_revision++
  assert.equal((await deriveAgentTemplateMarketPublishPreview(choice, "原方案名", privateChange)).snapshot_sha256, result.snapshot_sha256,
    "public digest deliberately cannot prove private source revision/authority")
  const publicChange = source(); publicChange.goal = "不同目标"
  assert.notEqual((await deriveAgentTemplateMarketPublishPreview(choice, "原方案名", publicChange)).snapshot_sha256, result.snapshot_sha256)
  await assert.rejects(deriveAgentTemplateMarketPublishPreview(choice, "", source()))
})
test("copy is an independent safe candidate with no owner, source grants, runtime dispatch or approval bypass", () => {
  const snapshot = snap(), candidate = deriveAgentTemplateMarketCopy(snapshot, "研究模板", "我的研究")
  assert.equal(candidate.name, "我的研究"); assert.equal(candidate.spec.require_approval, true)
  assert.equal(candidate.resource_selection_required, true); assert.equal(candidate.starts_run, false); assert.equal(candidate.authority, false)
  const input = agentTemplateMarketCreateInput(snapshot)
  assert.deepEqual(Object.keys(input).sort(), ["goal", "task_scope", "deliverables", "task_plan", "done_criteria", "tools", "knowledge_base_ids", "require_plan_review"].sort())
  assert.deepEqual(input.knowledge_base_ids, []); assert.equal(input.require_plan_review, true)
  assert.doesNotMatch(JSON.stringify(candidate), /owner_id|connection_id|model_binding|http_tools|mcp_tools|knowledge_retrieval|quality_checks/)
  candidate.spec.task_plan.push("changed"); assert.deepEqual(snapshot.spec.task_plan, ["研究", "核对"])
  assert.equal(deriveAgentTemplateMarketCopy(snapshot, "默认名称").name, "默认名称")
  assert.throws(() => deriveAgentTemplateMarketCopy({...snapshot, owner_id: id(9)}, "研究模板"))
})
test("copy digest binds exact renamed candidate; every normalized mutation intent remains separately pinned", async () => {
  const a = await agentTemplateMarketCopyDigest(snap(), "模板", "甲"), b = await agentTemplateMarketCopyDigest(snap(), "模板", "乙")
  assert.notEqual(a, b)
  const intent = {action: "use", request_id: id(8), template: {template_id: id(2), revision: 1, snapshot_sha256: hash}, copy_name: "甲", expected_copy_sha256: a, confirm: true}
  const digest = await agentTemplateMarketIntentDigest("use", intent)
  for (const change of [{request_id: id(9)}, {copy_name: "乙"}, {expected_copy_sha256: b}, {template: {...intent.template, revision: 2}}, {template: {...intent.template, snapshot_sha256: "b".repeat(64)}}]) assert.notEqual(await agentTemplateMarketIntentDigest("use", {...intent, ...change}), digest)
  const publish = {action: "publish", request_id: id(8), source: sourcePin(), name: "模板", description: "用途", category: "research", expected_snapshot_sha256: hash,
    confirm: true, acknowledgement: agentTemplateMarketPublishAcknowledgement}
  assert.notEqual(await agentTemplateMarketIntentDigest("publish", publish), await agentTemplateMarketIntentDigest("publish", {...publish, source: {...sourcePin(), revision: 3}}))
  const life = {action: "unpublish", request_id: id(8), template: intent.template, confirm: true}
  assert.notEqual(await agentTemplateMarketIntentDigest("unpublish", life), await agentTemplateMarketIntentDigest("delete", {...life, action: "delete"}))
  await assert.rejects(agentTemplateMarketIntentDigest("delete", life))
  await assert.rejects(agentTemplateMarketIntentDigest("use", {...intent, owner_id: id(9)}))
})
test("market and mine retain metadata, public snapshot and safe display attribution without foreign source identifiers", () => {
  assert.deepEqual(parseAgentTemplateMarketRow(row()), row())
  assert.deepEqual(parseAgentTemplateMarketMineRow(mine({public: false, use_count: 12, revision: 3})), mine({public: false, use_count: 12, revision: 3}))
  assert.deepEqual(parseAgentTemplateMarketPage({ok: true, items: [row()]}), {ok: true, items: [row()]})
  assert.equal(parseAgentTemplateMarketMinePage({ok: true, items: [mine({public: false})]}).items[0].public, false)
  assert.equal(parseAgentTemplateMarketRow(row({is_mine: true, source_spec_id: id(1)})).source_spec_id, id(1))
  assert.equal(parseAgentTemplateMarketRow(row({built_in: true, author_tail: ""})).built_in, true)
  for (const change of [{public: false}, {source_spec_id: id(1)}, {owner_id: id(9)}, {author_tail: "full-user-id"}, {revision: 0}, {use_count: -1},
    {created: "2026-02-30T00:00:00.000Z"}, {spec: {...snap().spec, model_binding: {}}}, {built_in: true, is_mine: true}, {built_in: true, author_tail: "0001"}]) assert.throws(() => parseAgentTemplateMarketRow(row(change)))
  assert.throws(() => parseAgentTemplateMarketMineRow(mine({built_in: true})))
  assert.throws(() => parseAgentTemplateMarketPage({ok: true, items: [row(), row()]}))
  assert.throws(() => parseAgentTemplateMarketMinePage({ok: true, items: [mine(), mine()]}))
  assert.throws(() => parseAgentTemplateMarketPage({ok: true, items: Array(201).fill(row())}))
})
test("all five operation receipt shapes retain immutable results and distinguish deletion from visibility recovery", () => {
  const publish = {operation: "publish", request_id: id(8), item: mine()}
  const use = {operation: "use", request_id: id(8), template_id: id(2), revision: 1, snapshot_sha256: hash, spec_id: id(3), spec_revision: 1, use_count: 1}
  for (const receipt of [publish, use, lifecycle(), lifecycle("republish"), lifecycle("delete")]) {
    assert.deepEqual(parseAgentTemplateMarketReceipt(receipt), receipt)
    assert.deepEqual(parseAgentTemplateMarketRecoveryResult({status: "recorded", receipt}), {status: "recorded", receipt})
    assert.throws(() => parseAgentTemplateMarketReceipt({...receipt, owner_id: id(9)}))
  }
  assert.deepEqual(parseAgentTemplateMarketRecoveryResult({status: "not_recorded", request_id: id(8)}), {status: "not_recorded", request_id: id(8)})
  for (const receipt of [lifecycle("delete", {deleted: false}), lifecycle("delete", {public: true}), lifecycle("republish", {deleted: true}),
    lifecycle("restore"), {...use, spec_revision: 2}, {...use, use_count: 0}, {...publish, item: mine({use_count: 1})}, {...publish, item: mine({public: false})}]) assert.throws(() => parseAgentTemplateMarketReceipt(receipt))
  for (const result of [{status: "restored", request_id: id(8)}, {status: "not_recorded", request_id: id(8), retry_safe: true}, {status: "recorded", receipt: lifecycle(), owner_id: id(9)}]) assert.throws(() => parseAgentTemplateMarketRecoveryResult(result))
})
