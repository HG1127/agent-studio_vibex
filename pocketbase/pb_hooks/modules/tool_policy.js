"use strict"

// Shared non-idempotent tool policy. Pure Goja-compatible contract.
// Never infer write safety from a tool's name or model suggestion alone.
// Authoritative connection ownership/enabled validation remains in the engines.
var BUILTINS = {
  result_read: true, result_list: true,tool_contract_get:true,
  business_quality_check:true,business_case_get:true,business_record_query:true,business_record_write:true,
  business_job_submit:true,business_job_status:true,business_job_cancel:true,business_fact_set_get:true,business_report_render:true,
  business_material_list:true,business_material_read:true,
  calculate: true, summarize: true, knowledge_search: true, web_fetch: true, web_search: true,
}

function classify(input) {
  var o = input || {}
  var name = String(o.toolName || "")
  var builtin = BUILTINS[name] === true
  var market = Boolean(o.market)
  var external = Boolean(o.external) || market
  var method = String(o.method || "POST").toUpperCase()
  var requiresJournal = !builtin && external && (market || method !== "GET")
  // External writes may have irreversible effects. A run-level optional
  // approval toggle must NEVER bypass a single-call confirmation for POST,
  // PUT, DELETE or discovered MCP actions. Read-only HTTP GET stays automatic.
  // The engine, not an API caller, owns the trusted alreadyApproved flag.
  var requiresApproval = !Boolean(o.alreadyApproved) && requiresJournal
  return {
    builtin: builtin,
    external: external,
    write: requiresJournal,
    requiresApproval: requiresApproval,
    approvalPolicy: o.mandatoryApproval && requiresJournal ? "mandatory" : (o.requireApproval ? "configured" : "none"),
    retryAllowed: !requiresJournal,
  }
}

// A write operation must never retry on an ambiguous error: provider may have committed.
function allowAutomaticRetry(policy, retryable) {
  return Boolean(retryable) && Boolean(policy) && policy.retryAllowed === true
}

module.exports = {
  classify: classify,
  allowAutomaticRetry: allowAutomaticRetry,
}
