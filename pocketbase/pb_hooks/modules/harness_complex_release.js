"use strict"

// Server-side counterpart to the complex-Agent wizard's evidence gate.
// This is an auditable execution-trace check, NOT a factual truth assessor.
// It must never trust an "accepted"/"test_passed" boolean sent by a client.
function verify(spec, run, events) {
  var roles = Array.isArray(spec && spec.roles) ? spec.roles : []
  if (roles.length < 2) return { applicable: false, passed: true, issues: [] }
  var issues = []
  if (!run || String(run.status || "") !== "succeeded" ||
      !String(run.result || "").trim()) issues.push("missing_successful_result")
  if (!Array.isArray(events)) {
    events = []
    issues.push("missing_event_log")
  }
  if (roles.length > 8) issues.push("role_limit_exceeded")
  var known = {}
  var order = []
  var remaining = roles.slice()
  for (var i = 0; i < roles.length; i++) {
    var role = roles[i]
    if (!role || typeof role.id !== "string" ||
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(role.id) ||
        Object.prototype.hasOwnProperty.call(known, role.id)) {
      issues.push("invalid_or_duplicate_role")
      return { applicable: true, passed: false, issues: issues }
    }
    known[role.id] = true
  }
  while (remaining.length) {
    var advanced = false
    for (var j = 0; j < remaining.length; j++) {
      var next = remaining[j]
      var deps = Array.isArray(next.depends_on) ? next.depends_on : []
      if (!deps.every(function(id) { return order.some(function(done) { return done.id === id }) })) continue
      order.push(next)
      remaining.splice(j, 1)
      advanced = true
      break
    }
    if (!advanced) {
      issues.push("invalid_role_dependencies")
      return { applicable: true, passed: false, issues: issues }
    }
  }
  var checkpoint = run && run.checkpoint || {}
  var state = checkpoint && checkpoint.role_state || {}
  var completed = Array.isArray(state.completed) ? state.completed : []
  var outputs = state.outputs && typeof state.outputs === "object" && !Array.isArray(state.outputs)
    ? state.outputs : {}
  if (completed.length !== order.length || completed.some(function(id, index) {
    return id !== order[index].id
  })) issues.push("role_order_unverified")
  var completedEvents = {}
  for (var k = 0; k < events.length; k++) {
    var ev = events[k]
    var content = ev && ev.content || {}
    if (ev && ev.event_type === "status" && content.role_phase === "completed"
      && typeof content.role_id === "string") completedEvents[content.role_id] = true
  }
  for (var n = 0; n < order.length; n++) {
    var roleId = order[n].id
    if (!completedEvents[roleId] || typeof outputs[roleId] !== "string" ||
        !outputs[roleId].trim() || completed.indexOf(roleId) < 0)
      issues.push("stage_unverified:" + roleId)
  }

  var globalTools = Array.isArray(spec.tools) ? spec.tools : []
  var needs = Array.isArray(spec.capability_requirements) ? spec.capability_requirements : []
  var calls = events.filter(function(ev) {
    return ev && ev.event_type === "tool_call" && ev.content &&
      typeof ev.content.tool === "string" && Number.isSafeInteger(ev.step_index)
  })
  var results = events.filter(function(ev) { return ev && ev.event_type === "tool_result" })
  var approvals = events.filter(function(ev) { return ev && ev.event_type === "approval" && ev.content &&
    ev.content.decision === "approve" })
  for (var m = 0; m < needs.length; m++) {
    var need = needs[m]
    if (!need || need.required !== true) continue
    var tools = Array.isArray(need.suggested_tool_ids) ? need.suggested_tool_ids : []
    if (need.kind === "text" && need.access !== "write" && tools.length === 0) continue
    var allowed = tools.filter(function(tool) { return globalTools.indexOf(tool) >= 0 })
    if (!allowed.length) { issues.push("required_capability_unbound:" + need.id); continue }
    var owners = Array.isArray(need.role_ids) && need.role_ids.length ? need.role_ids :
      roles.filter(function(role) { return role.tools && role.tools.some(function(tool) {
        return allowed.indexOf(tool) >= 0
      }) }).map(function(role) { return role.id })
    if (!owners.length) { issues.push("required_capability_unowned:" + need.id); continue }
    for (var q = 0; q < owners.length; q++) {
      var id = owners[q]
      var role = roles.find(function(item) { return item.id === id })
      if (!role || !Array.isArray(role.tools)) {
        issues.push("capability_owner_not_authorized:" + need.id + ":" + id)
        continue
      }
      var granted = allowed.filter(function(tool) { return role.tools.indexOf(tool) >= 0 })
      if (!granted.length) {
        issues.push("capability_owner_not_authorized:" + need.id + ":" + id)
        continue
      }
      var matched = calls.some(function(call) {
        if (call.content.role_id !== id || granted.indexOf(call.content.tool) < 0) return false
        var observed = results.some(function(result) {
          return result.step_index === call.step_index &&
            result.content && result.content.tool === call.content.tool
        })
        if (!observed) return false
        if (need.access === "write") return approvals.some(function(approved) {
          return approved.step_index === call.step_index &&
            approved.content.tool === call.content.tool
        })
        return true
      })
      if (!matched) issues.push("required_tool_or_approval_unverified:" + need.id + ":" + id)
    }
  }
  // Deterministic literal assertions; passing them never proves a claim true.
  var quality = Array.isArray(spec.quality_checks) ? spec.quality_checks : []
  for (var z = 0; z < quality.length && z < 12; z++) {
    var check = quality[z]
    if (!check || typeof check !== "object") continue
    var expected = String(check.expected || "")
    var result = String(run && run.result || "")
    if (check.type === "contains" && (!expected || result.indexOf(expected) < 0))
      issues.push("quality_contains_failed")
    else if (check.type === "not_contains" && (!expected || result.indexOf(expected) >= 0))
      issues.push("quality_not_contains_failed")
    else if (check.type === "json_object") {
      try {
        var obj = JSON.parse(result)
        if (!obj || typeof obj !== "object" || Array.isArray(obj))
          issues.push("quality_json_object_failed")
      } catch (_) { issues.push("quality_json_object_failed") }
    }
  }
  return { applicable: true, passed: issues.length === 0, issues: issues }
}
module.exports = { verify: verify }
