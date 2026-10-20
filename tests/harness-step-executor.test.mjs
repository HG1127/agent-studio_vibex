import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import vm from "node:vm"

function load(path) {
  const context = { module: { exports: {} } }
  vm.runInNewContext(fs.readFileSync(path, "utf8"), context, { timeout: 1500 })
  return context.module.exports
}
const exec = load("pocketbase/pb_hooks/modules/harness_step_executor.js")
const validation = load("pocketbase/pb_hooks/modules/harness_tool_contracts.js")
const policies = load("pocketbase/pb_hooks/modules/tool_policy.js")
const deadline = (cp, now) => !cp?.execution_deadline_ms || now < cp.execution_deadline_ms
const sha256 = input => createHash("sha256").update(input).digest("hex")
function prepare(options) {
  return exec.prepareToolStep({
    checkpoint: {}, nowMs: Date.now(), ...options,
  }, validation, policies, deadline)
}
test("shared model gate admits valid tasks and refuses expired runs", () => {
  assert.equal(exec.prepareModelStep({}, deadline, 200).ok, true)
  assert.equal(exec.prepareModelStep({ execution_deadline_ms: 100 }, deadline, 100).error,
    "run_runtime_deadline_exceeded")
  assert.throws(() => exec.prepareModelStep({}, null, 200), /model_step_guard_required/)
})
test("Agent and Workflow share identical validated tool schema and risk assessment", () => {
  const valid = prepare({ toolName: "calculate", input: { expression: "(2+3)*4" },
    requireApproval: true, mandatoryApproval: true })
  assert.equal(valid.ok, true)
  assert.equal(valid.policy.write, false)
  assert.equal(valid.requiresApproval, false)
  const read = prepare({ toolName: "FetchLedger", input: { query: "look" },
    external: true, method: "GET", requireApproval: true })
  assert.equal(read.ok, true)
  assert.equal(read.policy.write, false)
  const post = prepare({ toolName: "WriteLedger", input: { payload: "hello" },
    external: true, method: "POST", mandatoryApproval: true })
  assert.equal(post.ok, true)
  assert.equal(post.requiresApproval, true)
  assert.equal(post.policy.retryAllowed, false)
  assert.equal(prepare({ toolName: "calculate", input: { expression: 12 } }).error,
    "tool_input_expression_invalid")
  assert.equal(prepare({ toolName: "WriteLedger", input: JSON.parse('{"constructor":{"unsafe":true}}') }).ok, false)
  assert.equal(prepare({ toolName: "web_fetch", input: { url: "file:///etc/passwd" } }).ok, false)
  assert.equal(prepare({ toolName: "WriteLedger", input: { x: true }, checkpoint: { execution_deadline_ms: 20 }, nowMs: 20 }).error,
    "run_runtime_deadline_exceeded")
})
test("approval hash is bound to exact arguments, target, connection and method", () => {
  const base = { toolName: "Transfer", method: "POST", connectionId: "conn42",
    destination: sha256("https://example.invalid/transfer"), value: { amount: 10 } }
  const a = exec.approvalDigest(sha256, base)
  assert.match(a, /^[a-f0-9]{64}$/)
  assert.equal(exec.approvalMatches(a, exec.approvalDigest(sha256, { ...base })), true)
  for (const change of [
    { method: "GET" }, { connectionId: "conn43" },
    { destination: sha256("https://other.invalid/transfer") },
    { value: { amount: 11 } }, { toolName: "Refund" },
  ]) {
    const changed = exec.approvalDigest(sha256, { ...base, ...change })
    assert.equal(exec.approvalMatches(a, changed), false)
  }
  assert.equal(exec.approvalMatches("", a), false, "Legacy node-only approval cannot bypass binding")
  assert.equal(exec.approvalMatches("0".repeat(64), a), false)
  assert.throws(() => exec.approvalDigest(() => "invalid", base), /approval_digest_invalid/)
})
test("shared retry runner retries read-only transient errors once, never writes", () => {
  let calls = 0
  const readPolicy = prepare({ toolName: "ReadOnce", input: {}, external: true, method: "GET" }).policy
  const read = exec.executeWithRetry(readPolicy, () => {
    calls++
    return calls === 1 ? { err: "timeout", retryable: true } : { out: "OK", err: "" }
  })
  assert.equal(read.retried, true)
  assert.equal(read.result.out, "OK")
  assert.equal(calls, 2)
  calls = 0
  const writePolicy = prepare({ toolName: "WriteOnce", input: {}, external: true, method: "POST" }).policy
  const failedWrite = exec.executeWithRetry(writePolicy, () => {
    calls++
    return { toolErr: "timeout", retryable: true }
  })
  assert.equal(failedWrite.retried, false)
  assert.equal(calls, 1)
  const cached = exec.executeWithRetry(writePolicy, () => {
    calls++
    throw Error("Should not call external provider when durable success cached")
  }, { output: "cached", toolErr: "" })
  assert.equal(cached.fromCache, true)
  assert.equal(cached.result.output, "cached")
  assert.equal(calls, 1)
})
test("Goja integration: both runtimes import shared step executor", () => {
  for (const file of [
    "pocketbase/pb_hooks/agent_engine.pb.js",
    "pocketbase/pb_hooks/workflow_api.pb.js",
  ]) {
    const code = fs.readFileSync(file, "utf8")
    assert.match(code, /modules\/harness_step_executor\.js/)
    assert.match(code, /prepareToolStep\(/)
    assert.match(code, /prepareModelStep\(/)
    assert.match(code, /executeWithRetry\(/)
    assert.match(code, /approvalDigest\(/)
  }
})
