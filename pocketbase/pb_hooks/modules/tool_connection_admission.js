"use strict"

// A saved Agent tool name is not a permission to call an HTTP endpoint.
// This is checked at run creation, every tick and immediately before dispatch.
// Pure Goja/CommonJS; never reads credentials or makes network requests.
function isVerifiedExternalToolRecord(record, ownerId, exactName) {
  if (!record || !ownerId || !exactName) return false
  try {
    if (String(record.get("rh_user_id") || "") !== String(ownerId)) return false
    if (record.getBool("enabled") !== true) return false
    if (String(record.getString("name") || "") !== String(exactName)) return false
    if (String(record.getString("status") || "") !== "ok") return false
    var checked = String(record.getString("last_checked_at") || "")
    if (!checked || checked.indexOf("0001-") === 0) return false
    var timestamp = Date.parse(checked)
    return isFinite(timestamp) && timestamp > 0
  } catch (_) {
    return false
  }
}
// Fingerprint only the exact executable request. Raw header credentials remain
// on the server and are never written to approval checkpoints or event logs.
function executableConfigFingerprint(record, sha256) {
  if (!record || typeof sha256 !== "function") return ""
  try {
    var payload = JSON.stringify({
      connection_id: String(record.id || ""),
      url: String(record.getString("url") || ""),
      method: String(record.getString("method") || "POST").toUpperCase(),
      headers: String(record.getString("headers") || "[]"),
      body_template: String(record.getString("body_template") || ""),
      timeout_s: Number(record.getInt("timeout_s") || 15),
      contract: String(record.getString("contract") || ""),
    })
    var hash = String(sha256(payload) || "")
    return /^[0-9a-fA-F]{64}$/.test(hash) ? hash.toLowerCase() : ""
  } catch (_) { return "" }
}
module.exports = {
  isVerifiedExternalToolRecord: isVerifiedExternalToolRecord,
  executableConfigFingerprint: executableConfigFingerprint,
}
