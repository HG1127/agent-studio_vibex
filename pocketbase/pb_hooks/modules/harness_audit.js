"use strict"

// Redact model/tool credentials from user-visible run events and invocation
// metadata. Execution arguments remain unchanged; this is a log-only boundary.
var SENSITIVE_KEY = /(?:password|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|access[_-]?key)/i

function redact(value, depth) {
  var d = Number(depth) || 0
  if (d > 6) return "[redacted-depth]"
  if (Array.isArray(value)) {
    var a = []
    for (var i = 0; i < value.length && i < 50; i++) a.push(redact(value[i], d + 1))
    return a
  }
  if (value !== null && typeof value === "object") {
    var obj = {}
    var keys = Object.keys(value)
    for (var j = 0; j < keys.length && j < 60; j++) {
      var k = String(keys[j])
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue
      obj[k] = SENSITIVE_KEY.test(k) ? "***" : redact(value[k], d + 1)
    }
    return obj
  }
  if (typeof value === "string") return clean(value)
  return value
}
function clean(value) {
  var s = String(value || "")
  return s
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer ***")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "***")
    .replace(/([?&](?:api[_-]?key|token|secret|password|access[_-]?key)=)[^&\s"']+/gi, "$1***")
    .replace(/\b((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;"'}]+/gi, "$1***")
}
function excerpt(value, maxLength) {
  var v = typeof value === "string" ? clean(value) : redact(value, 0)
  var text = ""
  try { text = typeof v === "string" ? v : JSON.stringify(v) } catch (_) { text = "[unprintable]" }
  var size = Math.max(0, Math.min(2000, Math.floor(Number(maxLength) || 500)))
  return text.slice(0, size)
}
module.exports = { redact: redact, excerpt: excerpt, clean: clean }
