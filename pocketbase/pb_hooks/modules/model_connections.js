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

// Successful server-side model tests authorize only the current permitted IDs.
// Re-read this evidence before each Agent/Workflow/embedding model invocation.
function verifiedModelIds(record) {
  if (!record) return []
  try {
    if (record.getBool("enabled") !== true ||
        String(record.getString("status") || "") !== "ok") return []
    var stamp = String(record.getString("last_checked_at") || "")
    if (!stamp || stamp.indexOf("0001-") === 0 ||
        !isFinite(Date.parse(stamp)) || Date.parse(stamp) <= 0) return []
    var raw = JSON.parse(record.getString("models") || "[]")
    if (!Array.isArray(raw)) return []
    var out = [], seen = {}
    for (var i = 0; i < raw.length && i < 300; i++) {
      if (typeof raw[i] !== "string") continue
      var id = raw[i].trim()
      if (!id || id.length > 200 || seen[id]) continue
      seen[id] = true
      out.push(id)
    }
    return out
  } catch (_) { return [] }
}

function getDefault(app, uid) {
  var rows = []
  try {
    rows = app.findRecordsByFilter("model_connections",
      "rh_user_id = {:uid}", "-created", 10, 0, { uid: String(uid || "") }) || []
  } catch (_) {}
  for (var i = 0; i < rows.length; i++) {
    if (!uid || String(rows[i].get("rh_user_id") || "") !== String(uid)) continue
    var models = verifiedModelIds(rows[i])
    if (models.length > 0)
      return { connection_id: String(rows[i].id), model_id: models[0] }
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
  var verified = verifiedModelIds(record)
  if (verified.length === 0)
    return { ok:false, error:"custom_connection_unverified", detail:"模型连接未经最新服务端测试，请到「模型连接」页重新测试" }
  var selected = String(model || "")
  if (verified.indexOf(selected) < 0)
    return { ok:false, error:"model_not_permitted", detail:"模型不在当前账号已验证的连接清单中，请重新选择" }
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
    model:selected, connectionId:connectionId,
  }
}

module.exports = { decodeKey:decodeKey, verifiedModelIds:verifiedModelIds,
  getDefault:getDefault, lookup:lookup }
