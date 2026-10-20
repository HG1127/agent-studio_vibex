"use strict"

// Shared read-only recovery advice: creates safe, bounded failure metadata.
// This module never retries requests, mutates external services or exposes
// raw provider responses/secrets. Codes and hints come from a fixed allowlist.
var CATEGORY = {
  external_write: ["external_write_uncertain", "必须先核查目标系统中的实际写入结果", "verify_external_write", true],
  write_journal: ["write_journal_unavailable", "写入审计不可用，请联系管理员检查服务后新建任务", "contact_operator", true],
  deadline: ["run_runtime_deadline_exceeded", "任务运行时限已达到，请调整时限并新建任务", "adjust_limits", false],
  model_budget: ["model_call_budget_exhausted", "模型调用次数达到上限，请调整预算并新建任务", "adjust_limits", false],
  step_budget: ["step_budget_exhausted", "最大执行步数已达到，请重新评估任务范围和预算", "adjust_limits", false],
  approval: ["approval_revalidation_required", "工具授权或审批已失效，需重新核对并授权", "review_approval", false],
  tool_input: ["tool_input_invalid", "工具参数不符合契约，请修改输入或工具 Schema", "fix_tool_inputs", false],
  auth: ["permission_or_credentials", "权限或模型连接不可用，请核对员工授权及连接配置", "check_permissions", false],
  lease: ["execution_lease_lost", "任务执行权发生变化，请核对最新任务状态，禁止旧 Worker 重放", "inspect_lease", false],
  model: ["model_provider_failure", "模型服务调用失败，请检查连接和用量后新建任务", "check_model_connection", false],
  network: ["read_network_failure", "网络/读取请求失败，可在确认不涉及外部写入后新建任务", "inspect_network", false],
  loop: ["stuck_loop_detected", "任务发生重复调用，请优化计划或终止条件后新建任务", "adjust_plan", false],
  engine: ["execution_step_failed", "引擎未能可靠完成检查点写入，请联系管理员检查执行日志", "contact_operator", false],
  unknown: ["unclassified_failure", "未能安全识别原因，请先人工检查执行记录与外部副作用", "manual_review", true],
}
var STAGES = {
  runtime: true, planner: true, model: true, tool: true,
  workflow_node: true, worker: true, approval: true, storage: true,
}
function category(raw) {
  var s = String(raw || "").slice(0, 2048).toLowerCase()
  // Conservative precedence: a write result might have been committed, even
  // if an HTTP timeout or an invalid tool error is also in the message.
  if (/write_outcome_unknown|写操作结果不明|外部写.*未确认|写操作.*结果未确认|uncertain[_ -]?write/.test(s)) return "external_write"
  if (/write_journal_unavailable|journal_result_not_persisted|写操作审计.*不可用/.test(s)) return "write_journal"
  if (/run_runtime_deadline_exceeded|运行总时限|最长运行时间|任务总时限/.test(s)) return "deadline"
  if (/model_call_budget_exhausted|模型调用.*预算.*耗尽/.test(s)) return "model_budget"
  if (/最大步数上限|节点执行总次数.*上限|max_steps_exhausted/.test(s)) return "step_budget"
  if (/approval_.*changed|tool_approval_required|tool_approval_changed|审批.*失效|批准.*失效/.test(s)) return "approval"
  if (/tool_input_invalid|tool_input_.*invalid|工具参数无效|入参模板.*合法 json/.test(s)) return "tool_input"
  if (/execution_lease_lost|execution_run_not_running|model_budget_checkpoint_conflict/.test(s)) return "lease"
  if (/auth[_-]|permission|unauthorized|credential|connection_disabled|model_connection_required|api[_-]?key.*missing/.test(s)) return "auth"
  if (/stuck_loop_detected|卡死循环|连续.*相同.*工具/.test(s)) return "loop"
  if (/model.*(timeout|failed|unavailable)|规划调用失败|模型.*失败/.test(s)) return "model"
  if (/network|unreachable|read.*timeout|custom_tool_timeout|web_fetch.*失败|连接失败/.test(s)) return "network"
  if (/execution_step_failed|model_budget_persist_failed|savecheckpoint|执行异常|引擎执行异常/.test(s)) return "engine"
  return "unknown"
}
function diagnose(raw, options) {
  var o = options || {}
  var key = category(raw)
  var spec = CATEGORY[key]
  var kind = o.kind === "workflow" ? "workflow" : "agent"
  var stage = STAGES[o.stage] === true ? o.stage : (kind === "workflow" ? "workflow_node" : "runtime")
  var step = String(o.stepRef || "")
    .replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 65)
  var seq = Number(o.seq || 0)
  if (!Number.isSafeInteger(seq) || seq < 0) seq = 0
  var when = Number(o.atMs)
  if (!Number.isSafeInteger(when) || when < 0) when = Date.now()
  return {
    version: 1, kind: kind, category: key, code: spec[0],
    stage: stage, step_ref: step, seq: seq, occurred_at: new Date(when).toISOString(),
    explanation: spec[1], recommended_action: spec[2],
    requires_external_reconciliation: spec[3],
    auto_retry_allowed: false,
    // Existing run checkpoints remain immutable; no in-place replay API.
    recovery_mode: "manual_review_then_new_run",
  }
}
module.exports = { diagnose: diagnose, category: category }
