"use strict"

// Internal multimodal messages use the OpenAI content-block shape. Never
// fetch remote images here: local observations contain bounded raster data.
function blocks(content, provider) {
  if (!Array.isArray(content)) return provider === "gemini" ? [{ text: String(content || "") }] : String(content || "")
  return content.map(function(block) {
    if (block && block.type === "text") return provider === "gemini" ? { text: String(block.text || "") } : { type: "text", text: String(block.text || "") }
    var url = block && block.type === "image_url" && block.image_url && block.image_url.url
    if (typeof url !== "string" || url.length > 1398130) throw Error("invalid_model_image")
    var match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url)
    if (!match) throw Error("invalid_model_image")
    if (provider === "anthropic") return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } }
    if (provider === "gemini") return { inline_data: { mime_type: match[1], data: match[2] } }
    return { type: "image_url", image_url: { url: url } }
  })
}

// Pure Goja-compatible request builder shared by Agent/Workflow.
// Server owns tenant authorization, key decryption, timeouts and HTTP transport.
// A single synchronous provider call must stay below the fenced dispatch
// lease window (240s call cap + 30s margin inside the 600s lease).
// Goja's synchronous $http.send cannot run a JS timer to renew a lease while
// blocked; reject the idea of an unbounded timeout by clamping it here.
var MAX_TIMEOUT_SECONDS = 240
function normalizeTimeoutSeconds(value, fallback) {
  var n = Number(value)
  var f = Number(fallback)
  if (!isFinite(f) || f <= 0) f = 120
  if (!isFinite(n) || n <= 0) n = f
  if (n < 1) n = 1
  if (n > MAX_TIMEOUT_SECONDS) n = MAX_TIMEOUT_SECONDS
  return Math.floor(n)
}
// Do not log or persist this return value: it includes the live provider secret.
function buildRequest(provider, opts) {
  var p = provider === "anthropic" || provider === "gemini" ? provider : "openai"
  var base = String(opts.baseUrl || "").replace(/\/+$/, "")
  var key = String(opts.apiKey || "")
  var model = String(opts.model || "")
  var messages = Array.isArray(opts.messages) ? opts.messages : []
  var timeout = normalizeTimeoutSeconds(opts.timeout, 120)
  var maxTokens = opts.maxTokens
  if (p === "anthropic") {
    var system = ""
    var adapted = []
    for (var i = 0; i < messages.length; i++) {
      var item = messages[i] || {}
      var role = String(item.role || "user")
      var text = String(item.content || "")
      if (role === "system") {
        system = system ? system + "\n\n" + text : text
      } else {
        adapted.push({ role: role === "assistant" ? "assistant" : "user", content: blocks(item.content, p) })
      }
    }
    if (!adapted.length) adapted.push({ role: "user", content: "请继续。" })
    var body = { model: model, max_tokens: 4096, messages: adapted }
    if (system) body.system = system
    return {
      url: base + "/messages", method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body), timeout: timeout,
    }
  }
  if (p === "gemini") {
    var instruction = ""
    var contents = []
    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j] || {}
      var msgRole = String(msg.role || "user")
      var msgText = String(msg.content || "")
      if (msgRole === "system") {
        instruction = instruction ? instruction + "\n\n" + msgText : msgText
      } else {
        contents.push({ role: msgRole === "assistant" ? "model" : "user", parts: blocks(msg.content, p) })
      }
    }
    if (!contents.length) contents.push({ role: "user", parts: [{ text: "请继续。" }] })
    var data = { contents: contents }
    if (instruction) data.system_instruction = { parts: [{ text: instruction }] }
    return {
      url: base + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key),
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data), timeout: timeout,
    }
  }
  var openaiBody = { model: model, messages: messages.map(function(m) { return Object.assign({}, m, { content: blocks(m.content, p) }) }), max_tokens: maxTokens || 4096, stream: false }
  // MiniMax M3.1 defaults to max reasoning. Local interactive observations
  // expire quickly; the caller can explicitly choose its supported low tier.
  if (model === "MiniMax-M3.1-Flash" && opts.reasoningEffort === "low") openaiBody.reasoning_effort = "low"
  return {
    url: base + "/chat/completions", method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(openaiBody),
    timeout: timeout,
  }
}
module.exports = {
  buildRequest: buildRequest,
  normalizeTimeoutSeconds: normalizeTimeoutSeconds,
  MAX_TIMEOUT_SECONDS: MAX_TIMEOUT_SECONDS,
}
