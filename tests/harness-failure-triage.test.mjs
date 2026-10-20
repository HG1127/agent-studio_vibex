import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const sandbox = { module: { exports: {} } }
vm.runInNewContext(
  fs.readFileSync("pocketbase/pb_hooks/modules/harness_failure_triage.js", "utf8"),
  sandbox, { timeout: 1200 },
)
const { diagnose, category } = sandbox.module.exports

test("unsafe external write outcomes require human reconciliation and never automatic replay", () => {
  for (const text of [
    "write_outcome_unknown: POST timed out, maybe written",
    "tool failed: write_outcome_unknown and network timeout",
    "外部写操作结果未确认，不能重试",
    "uncertain_write",
  ]) {
    const report = diagnose(text, { kind: "workflow", stage: "tool", stepRef: "node42", seq: 12, atMs: 1700000000000 })
    assert.equal(report.code, "external_write_uncertain")
    assert.equal(report.category, "external_write")
    assert.equal(report.requires_external_reconciliation, true)
    assert.equal(report.auto_retry_allowed, false)
    assert.equal(report.recommended_action, "verify_external_write")
    assert.equal(report.kind, "workflow")
    assert.equal(report.stage, "tool")
    assert.equal(report.step_ref, "node42")
    assert.equal(report.seq, 12)
    assert.equal(report.occurred_at, "2023-11-14T22:13:20.000Z")
  }
})
test("run budgets, deadlines and invalid inputs have actionable fixed categories", () => {
  assert.equal(category("run_runtime_deadline_exceeded"), "deadline")
  assert.equal(category("model_call_budget_exhausted"), "model_budget")
  assert.equal(category("已达最大步数上限"), "step_budget")
  assert.equal(category("工具参数无效"), "tool_input")
  assert.equal(category("stuck_loop_detected"), "loop")
  assert.equal(category("tool_approval_changed"), "approval")
  assert.equal(category("model_connection_required"), "auth")
  assert.equal(category("execution_step_failed"), "engine")
  assert.equal(diagnose("run_runtime_deadline_exceeded").recommended_action, "adjust_limits")
})
test("unknown failures are safe by default and never store secrets or raw provider outputs", () => {
  const raw = "Bearer supersecret sk-test0123456789 api_key=PRIVATE unknown problem"
  const report = diagnose(raw, { kind: "agent", stage: "BAD_STAGE",
    stepRef: "<admin-token-SECRET>", seq: -2 })
  const serialized = JSON.stringify(report)
  assert.equal(report.category, "unknown")
  assert.equal(report.requires_external_reconciliation, true)
  assert.equal(report.auto_retry_allowed, false)
  assert.equal(report.recovery_mode, "manual_review_then_new_run")
  assert.equal(report.stage, "runtime")
  assert.equal(report.seq, 0)
  assert.doesNotMatch(serialized, /supersecret|PRIVATE|sk-test0123456789/)
  assert.ok(serialized.length < 800)
})
test("new persistence paths write structured failure reports without a schema migration", () => {
  const agent = fs.readFileSync("pocketbase/pb_hooks/agent_engine.pb.js", "utf8")
  const workflow = fs.readFileSync("pocketbase/pb_hooks/workflow_api.pb.js", "utf8")
  const lifecycle = fs.readFileSync("pocketbase/pb_hooks/modules/harness_run_lifecycle.js", "utf8")
  for (const source of [agent, workflow, lifecycle]) assert.match(source, /failure_diagnostic/)
  assert.match(agent, /persistedCp\[cpKey\]/)
  assert.match(agent, /harness_failure_triage\.js/)
  assert.match(workflow, /harness_failure_triage\.js/)
  assert.match(lifecycle, /classifyFailure/)
})
