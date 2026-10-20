"use strict"

// Common execution contract for PocketBase Goja Agent + Workflow runtimes.
// This guards the transport boundary. Validation never substitutes server-side
// owner checks, URL egress policy, or per-tool risk approvals.
var BUILTIN = {
  calculate: true, summarize: true, knowledge_search: true,
  web_fetch: true, web_search: true,
}

function invalid(code) { return { ok: false, error: code, value: null } }
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
function boundedJson(input) {
  var count = 0
  function walk(item, depth) {
    count++
    if (depth > 7 || count > 240) return false
    if (item === null || typeof item === "boolean") return true
    if (typeof item === "number") return Number.isFinite(item)
    if (typeof item === "string") return item.length <= 8000
    if (Array.isArray(item)) {
      if (item.length > 80) return false
      for (var i = 0; i < item.length; i++) if (!walk(item[i], depth + 1)) return false
      return true
    }
    if (!isRecord(item)) return false
    var keys = Object.keys(item)
    if (keys.length > 80) return false
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j]
      if (key === "__proto__" || key === "constructor" || key === "prototype" ||
          key.length > 100 || !walk(item[key], depth + 1)) return false
    }
    return true
  }
  if (!walk(input, 0)) return null
  var text = ""
  try { text = JSON.stringify(input) } catch (_) { return null }
  if (!text || text.length > 12000) return null
  try { return JSON.parse(text) } catch (_) { return null }
}
function inRangeString(x, low, high) {
  return typeof x === "string" && x.trim().length >= low && x.length <= high
}
function checkToolInput(toolName, raw) {
  var name = String(toolName || "")
  if (!isRecord(raw)) return invalid("tool_input_not_object")
  var value = boundedJson(raw)
  if (!value) return invalid("tool_input_invalid_or_oversized")
  if (!BUILTIN[name]) return { ok: true, error: "", value: value }
  if (name === "calculate")
    return inRangeString(value.expression, 1, 200)
      ? { ok: true, error: "", value: { expression: value.expression } }
      : invalid("tool_input_expression_invalid")
  if (name === "summarize")
    return inRangeString(value.text, 1, 6000) &&
      (value.focus === undefined || (typeof value.focus === "string" && value.focus.length <= 300))
      ? { ok: true, error: "", value: { text: value.text, focus: value.focus || "" } }
      : invalid("tool_input_summary_invalid")
  if (name === "knowledge_search")
    return inRangeString(value.query, 1, 300)
      ? { ok: true, error: "", value: { query: value.query } }
      : invalid("tool_input_query_invalid")
  if (name === "web_fetch")
    return inRangeString(value.url, 8, 2048) && /^https?:\/\/[^ \t\r\n]+$/i.test(value.url)
      ? { ok: true, error: "", value: { url: value.url } }
      : invalid("tool_input_url_invalid")
  if (name === "web_search") {
    var limit = value.limit === undefined ? 5 : Number(value.limit)
    if (!inRangeString(value.query, 1, 300) ||
        !Number.isInteger(limit) || limit < 1 || limit > 10)
      return invalid("tool_input_search_invalid")
    return { ok: true, error: "", value: { query: value.query, limit: limit } }
  }
  return invalid("tool_input_unknown")
}

module.exports = { checkToolInput: checkToolInput, isRecord: isRecord }
