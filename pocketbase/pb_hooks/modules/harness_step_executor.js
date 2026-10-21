"use strict"

// Shared, pure Goja-compatible preflight + attempt runner for Agent/Workflow.
// Does not replace per-tool execution adapters, auth/ACL, durable write journal,
// network egress restrictions or approval route ownership checks.
function prepareToolStep(options, validation, policyService, deadlineGuard) {
  var o = options || {}
  var name = String(o.toolName || "")
  if (!name || name.length > 120)
    return { ok: false, error: "tool_name_invalid" }
  if (!validation || typeof validation.checkToolInput !== "function" ||
      !policyService || typeof policyService.classify !== "function" ||
      typeof deadlineGuard !== "function")
    throw new Error("step_contract_dependencies_invalid")

  if (!deadlineGuard(o.checkpoint || {}, o.nowMs))
    return { ok: false, error: "run_runtime_deadline_exceeded" }
  var args = validation.checkToolInput(name, o.input)
  if (!args.ok)
    return { ok: false, error: args.error }
  var policy = policyService.classify({
    toolName: name,
    market: o.market === true,
    external: o.external === true,
    method: o.method,
    requireApproval: o.requireApproval === true,
    mandatoryApproval: o.mandatoryApproval === true,
    alreadyApproved: o.alreadyApproved === true,
  })
  return {
    ok: true,
    toolName: name,
    value: args.value,
    policy: policy,
    requiresApproval: policy.requiresApproval === true,
  }
}

// Both model call paths use the same admission check; provider routing,
// budgets and actual HTTP calls remain in their established adapters.
function prepareModelStep(checkpoint, deadlineGuard, nowMs) {
  if (typeof deadlineGuard !== "function")
    throw new Error("model_step_guard_required")
  if (!deadlineGuard(checkpoint || {}, nowMs))
    return { ok: false, error: "run_runtime_deadline_exceeded" }
  return { ok: true }
}

// Authorization fingerprint binds an approval to the EXACT validated tool
// arguments, external target and HTTP method. It is stored only as SHA-256;
// never store complete credentials or rendered headers in the approval log.
function canonicalApprovalValue(value) {
  // The Goja/PocketBase JSON serializer may reorder object keys when storing
  // an awaiting-approval checkpoint. An unchanged call MUST hash identically
  // after resume; changed arguments, targets or tools MUST still invalidate it.
  if (Array.isArray(value)) {
    var list = []
    for (var i = 0; i < value.length; i++) list.push(canonicalApprovalValue(value[i]))
    return list
  }
  if (value && typeof value === "object") {
    var keys = Object.keys(value).sort()
    var out = {}
    for (var j = 0; j < keys.length; j++)
      out[keys[j]] = canonicalApprovalValue(value[keys[j]])
    return out
  }
  return value
}
function approvalDigest(sha256, input) {
  if (typeof sha256 !== "function")
    throw new Error("approval_digest_provider_required")
  var o = input || {}
  var descriptor = JSON.stringify([
    "harness-approval-v3-canonical",
    String(o.toolName || ""),
    String(o.method || "POST").toUpperCase(),
    String(o.connectionId || ""),
    String(o.destination || ""),
    canonicalApprovalValue(o.value),
  ])
  if (!descriptor || descriptor.length > 15000)
    throw new Error("approval_digest_input_invalid")
  var digest = String(sha256(descriptor) || "")
  if (!/^[0-9a-f]{64}$/.test(digest))
    throw new Error("approval_digest_invalid")
  return digest
}
function approvalMatches(saved, current) {
  return /^[0-9a-f]{64}$/.test(String(saved || "")) &&
    String(saved) === String(current)
}

// A cached durable success skips execution. Otherwise read-only retryable
// calls may retry ONCE; unknown/non-idempotent writes never auto-retry.
function executeWithRetry(policy, executeOnce, cached) {
  if (!policy || typeof executeOnce !== "function")
    throw new Error("step_executor_invalid")
  var cachedHit = cached !== undefined && cached !== null
  var first = cachedHit ? cached : executeOnce()
  var result = first || {}
  var err = String(result.toolErr || result.err || "")
  var canRetry = !cachedHit && err && result.retryable === true &&
    policy.retryAllowed === true
  if (canRetry) result = executeOnce() || {}
  return { result: result, retried: Boolean(canRetry), fromCache: cachedHit }
}

module.exports = {
  prepareToolStep: prepareToolStep,
  prepareModelStep: prepareModelStep,
  approvalDigest: approvalDigest,
  approvalMatches: approvalMatches,
  executeWithRetry: executeWithRetry,
}
