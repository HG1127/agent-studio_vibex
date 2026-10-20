import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import fs from "node:fs"

const files = {
  input: "pocketbase/pb_hooks/modules/harness_tool_contracts.js",
  budget: "pocketbase/pb_hooks/modules/harness_budget.js",
  evidence: "pocketbase/pb_hooks/modules/harness_evidence.js",
}
function load(file) {
  const context = { module: { exports: {} } }
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { timeout: 1000 })
  return context.module.exports
}
const { checkToolInput } = load(files.input)
const { normalize, allowModelCall } = load(files.budget)
const { collect, formatPrompt } = load(files.evidence)
const { redact, excerpt } = load("pocketbase/pb_hooks/modules/harness_audit.js")

test("Harness V2: builtin tool schemas validate and normalize safe inputs", () => {
  assert.equal(checkToolInput("calculate", { expression: "1+2" }).ok, true)
  assert.equal(checkToolInput("calculate", { expression: 4 }).error, "tool_input_expression_invalid")
  assert.equal(checkToolInput("knowledge_search", { query: "" }).ok, false)
  assert.equal(checkToolInput("summarize", { text: "资料", focus: "重点" }).ok, true)
  assert.equal(checkToolInput("web_fetch", { url: "file:///etc/passwd" }).ok, false)
  const normalized = checkToolInput("web_search", { query: "Agent", limit: "3" })
  assert.equal(normalized.ok, true)
  assert.equal(normalized.value.limit, 3)
  assert.equal(checkToolInput("web_search", { query: "Agent", limit: 100 }).ok, false)
})
test("Harness V2: tool input bounds stop unsafe nested and prototype-related objects", () => {
  assert.equal(checkToolInput("remote", null).error, "tool_input_not_object")
  assert.equal(checkToolInput("remote", ["array"]).ok, false)
  assert.equal(checkToolInput("remote", { payload: "x".repeat(12001) }).ok, false)
  assert.equal(checkToolInput("remote", JSON.parse('{"__proto__":{"polluted":true}}')).ok, false)
  assert.equal(checkToolInput("remote", { payload: { constructor: { x: 1 } } }).ok, false)
  assert.equal(checkToolInput("remote", { amount: 4, nested: [1, "ok"] }).ok, true)
})
test("Harness V2: model-call budget denies requests before exceeding configured ceiling", () => {
  assert.equal(normalize(10, undefined).max_model_calls, 30)
  assert.equal(normalize(30, 200).ok, false)
  assert.equal(normalize(10, -1).ok, false)
  assert.equal(normalize(10, 1.2).ok, false)
  assert.equal(allowModelCall({ llm_calls: 4 }, 5).ok, true)
  assert.equal(allowModelCall({ llm_calls: 5 }, 5).error, "model_call_budget_exhausted")
  assert.equal(allowModelCall({ llm_calls: 6 }, 5).ok, false)
})
test("Harness V2: evidence references survive compacted summaries and are bounded", () => {
  let refs = collect([], "web_fetch",
    { url: "https://example.com/report?token=SECRET#part" }, "Source paragraph", 2)
  assert.equal(refs.length, 1)
  assert.equal(refs[0].locator, "https://example.com/report")
  assert.equal(refs[0].status, "retrieved")
  const sensitiveRefs = collect([], "web_fetch", { url: "https://example.com/report" },
    "Bearer model-secret-12345 and sk-example123456789", 2)
  assert.doesNotMatch(sensitiveRefs[0].excerpt, /model-secret-12345|sk-example123456789/)
  refs = collect(refs, "knowledge_search", {},
    "[Shareholders.pdf · 片段2]\nDirector X is named.\n[Fund.pdf · 片段5]\nFund info", 3)
  assert.equal(refs.length, 3)
  refs = collect(refs, "web_fetch", { url: "https://example.com/report" }, "updated", 4)
  assert.equal(refs.length, 3)
  assert.match(formatPrompt(refs), /未独立核验/)
  assert.match(formatPrompt(refs), /Shareholders.pdf/)
  assert.equal(collect([], "web_fetch", { url: "https://x:y@example.com/report" }, "x", 1).length, 0)
  let many = []
  for (let i = 0; i < 80; i++) {
    many = collect(many, "web_fetch", { url: "https://example.com/" + i }, "brief", i)
  }
  assert.equal(many.length, 64)
  assert.equal(many[0].locator, "https://example.com/16")
})
test("Harness V2: invocation logging redacts secrets while leaving execution arguments intact", () => {
  const input = { query: "test", password: "mypassword",
    nested: { authorization: "Bearer SECRET", items: [{ api_key: "sk-abc123456789" }] } }
  const logged = redact(input)
  assert.equal(logged.password, "***")
  assert.equal(logged.nested.authorization, "***")
  assert.equal(logged.nested.items[0].api_key, "***")
  assert.equal(input.password, "mypassword")
  assert.doesNotMatch(excerpt(input, 500), /mypassword|SECRET|sk-abc123456789/)
  assert.match(excerpt("Authorization: Bearer superSecret123", 200), /Bearer \*\*\*/)
})

test("Harness V2: both execution engines invoke server-side tool contract", () => {
  for (const f of ["pocketbase/pb_hooks/agent_engine.pb.js", "pocketbase/pb_hooks/workflow_api.pb.js"]) {
    const source = fs.readFileSync(f, "utf8")
    assert.match(source, /modules\/harness_tool_contracts\.js/)
    assert.match(source, /checkToolInput\(/)
  }
  const agent = fs.readFileSync("pocketbase/pb_hooks/agent_engine.pb.js", "utf8")
  assert.match(agent, /model_call_budget_exhausted/)
  assert.match(agent, /model_budget_persist_failed/)
  assert.match(agent, /budgetRecord\.set\("checkpoint", budgetCheckpoint\)/)
  assert.match(agent, /evidence_refs: evidenceRefs/)
  assert.match(agent, /harness_evidence\.js/)
})
