"use strict"

// Owner-scoped model connection repository for PocketBase Goja.
// Credentials NEVER leave the server, MUST NOT be logged or included in trace spans.
// Existing legacy obfuscation is read-only compatibility; new secrets use AES-GCM.
function decodeKey(stored, secret, decrypt) {
  var text = String(stored || "")
  if (text.indexOf("gcm1:") === 0) {
    if (String(secret || "").length !== 32 || typeof decrypt !== "function") return ""
    try { return String(decrypt(text.substring(5), secret) || "") } catch (_) { return "" }
  }
  if (!text) return ""
  // Read old legacy format without writing new obfuscated secrets.
  if (text.indexOf(".") < 0 && !/^[0-9]+$/.test(text)) return text
  var parts = text.split(".")
  var output = ""
  for (var i = 0; i < parts.length; i++) {
    var number = parseInt(parts[i], 10)
    if (isNaN(number)) return text
    output += String.fromCharCode(number - 3)
  }
  return output
}

function getDefault(app, uid) {
  var rows = []
  try {
    rows = app.findRecordsByFilter("model_connections",
      "rh_user_id = {:uid}", "-created", 10, 0, { uid: String(uid || "") }) || []
  } catch (_) {}
  for (var i = 0; i < rows.length; i++) {
    var enabled = false
    try { enabled = rows[i].getBool("enabled") } catch (_) {}
    if (!enabled) continue
    var models = []
    try { models = JSON.parse(rows[i].getString("models") || "[]") } catch (_) {}
    if (Array.isArray(models) && models.length > 0) {
      return { connection_id: String(rows[i].id), model_id: String(models[0]) }
    }
  }
  return null
}

function lookup(app, owner, id, model, security) {
  var uid = String(owner || "")
  var connectionId = String(id || "")
  var record = null
  try { record = app.findRecordById("model_connections", connectionId) } catch (_) {}
  if (!record || String(record.get("rh_user_id") || "") !== uid || !uid) {
    return { ok:false, error:"custom_connection_missing", detail:"自定义模型连接不存在或已删除" }
  }
  var enabled = false
  try { enabled = record.getBool("enabled") } catch (_) {}
  if (!enabled) return { ok:false, error:"custom_connection_disabled", detail:"该模型连接已停用，请在「模型连接」页重新启用" }
  var provider = "openai"
  try { provider = String(record.getString("provider") || "") } catch (_) {}
  if (provider !== "anthropic" && provider !== "gemini") provider = "openai"
  var baseUrl = String(record.getString("base_url") || "").replace(/\/+$/, "")
  if (!baseUrl && provider === "anthropic") baseUrl = "https://api.anthropic.com/v1"
  if (!baseUrl && provider === "gemini") baseUrl = "https://generativelanguage.googleapis.com/v1beta"
  var credentials = security || {}
  var apiKey = decodeKey(
    String(record.getString("api_key") || ""), credentials.secretKey, credentials.decrypt
  )
  if (!baseUrl || !apiKey) {
    return { ok:false, error:"custom_connection_invalid", detail:"连接配置不完整" }
  }
  return {
    ok:true, provider:provider, baseUrl:baseUrl, apiKey:apiKey,
    model:String(model || ""), connectionId:connectionId,
  }
}

module.exports = { decodeKey:decodeKey, getDefault:getDefault, lookup:lookup }
