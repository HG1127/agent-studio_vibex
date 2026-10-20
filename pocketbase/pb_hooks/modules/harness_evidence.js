"use strict"

// Evidence references are durable metadata. They are not independently verified
// facts or full document archives; large source bodies remain in their original
// authorized knowledge bases / tool execution events.
function clean(s, size) {
  return String(s || "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer ***")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "***")
    .replace(/([?&](?:api[_-]?key|token|secret|password)=)[^&\s"\']+/gi, "$1***")
    .trim().slice(0, size)
}
function sanitizeUrl(raw) {
  var url = String(raw || "").trim()
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return ""
  var body = url.replace(/^https?:\/\//i, "")
  if (body.split("/")[0].indexOf("@") >= 0) return ""
  url = url.split(/[?#]/)[0].replace(/[)\],.;。，；]+$/, "")
  return url.length <= 600 ? url : ""
}
function collect(existing, toolName, input, output, step) {
  var rows = Array.isArray(existing) ? existing.slice(-64) : []
  var tool = String(toolName || "")
  var obs = String(output || "")
  var idx = Number(step) || 0
  function put(type, locator, excerpt) {
    if (!locator) return
    locator = clean(locator, 600)
    var key = type + "|" + locator
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].type + "|" + rows[i].locator === key) return
    }
    rows.push({ type: type, locator: locator, excerpt: clean(excerpt, 180),
      step: idx, status: "retrieved" })
  }
  if (tool === "web_fetch") {
    put("url", sanitizeUrl((input || {}).url), obs)
  } else if (tool === "web_search") {
    var urls = obs.match(/https?:\/\/[^\s<>"'\])]+/gi) || []
    for (var u = 0; u < urls.length && u < 5; u++) {
      var url = sanitizeUrl(urls[u])
      if (url) put("url", url, "")
    }
  } else if (tool === "knowledge_search") {
    var rx = /\[([^\]\r\n]{1,160}·\s*片段[0-9]{1,6})\]/g
    var found = 0, match
    while ((match = rx.exec(obs)) !== null && found < 5) {
      put("knowledge", "[" + match[1] + "]", obs.slice(rx.lastIndex, rx.lastIndex + 180))
      found++
    }
  }
  return rows.slice(-64)
}
function formatPrompt(existing) {
  if (!Array.isArray(existing) || !existing.length) return ""
  var lines = []
  for (var i = Math.max(0, existing.length - 14); i < existing.length; i++) {
    var ref = existing[i] || {}
    var type = ref.type === "knowledge" ? "知识" : "网页"
    var locator = clean(ref.locator, 600)
    if (!locator) continue
    lines.push("- " + type + ": " + locator + "（第" + (Number(ref.step) || 0) + "步；已检索，未独立核验）")
  }
  return lines.join("\n").slice(0, 2600)
}
module.exports = { collect: collect, formatPrompt: formatPrompt, sanitizeUrl: sanitizeUrl }
