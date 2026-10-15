"use strict"

// Shared non-idempotent tool policy. Pure Goja-compatible contract.
// Never infer write safety from a tool's name or model suggestion alone.
// Authoritative connection ownership/enabled validation remains in the engines.
var BUILTINS = {
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
  var requiresApproval = Boolean(o.requireApproval) && !Boolean(o.alreadyApproved) && requiresJournal
  return {
    builtin: builtin,
    external: external,
    write: requiresJournal,
    requiresApproval: requiresApproval,
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
