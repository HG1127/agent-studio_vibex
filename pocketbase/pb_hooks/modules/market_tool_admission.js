"use strict"

// A human approval applies to exactly one MCP server, its current encrypted
// credentials, discovered tool schema and selected tool identity.
// Never store unencrypted header values or tool arguments in checkpoints.
function marketApprovalFingerprint(record, ownerId, exactToolId, sha256) {
  if (!record || !ownerId || typeof sha256 !== "function") return ""
  var full = String(exactToolId || "")
  var parsed = /^mkt__([A-Za-z0-9]{15})__([A-Za-z0-9_./:-]{1,120})$/.exec(full)
  if (!parsed) return ""
  try {
    if (String(record.id || "") !== parsed[1]) return ""
    if (String(record.get("rh_user_id") || "") !== String(ownerId)) return ""
    if (record.getBool("enabled") !== true) return ""
    if (String(record.getString("last_probe_status") || "") !== "ok") return ""
    var toolCount = Number(record.getInt("tool_count") || 0)
    if (!isFinite(toolCount) || toolCount < 1 || toolCount > 60) return ""
    var toolsJson = String(record.getString("tools") || "")
    var tools = JSON.parse(toolsJson)
    if (!Array.isArray(tools) || !tools.some(function(item) {
      return item && typeof item.name === "string" && item.name === parsed[2]
    })) return ""
    var url = String(record.getString("url") || "")
    if (!/^https?:\/\/\S+$/i.test(url)) return ""
    var serialized = JSON.stringify({
      scope: "agent-mcp-human-approval-v1",
      owner: String(ownerId),
      connection_id: parsed[1],
      exact_tool_id: full,
      url: url,
      headers_sec: String(record.getString("headers_sec") || ""),
      tools_snapshot: toolsJson,
      tool_count: toolCount,
    })
    var digest = String(sha256(serialized) || "")
    return /^[a-fA-F0-9]{64}$/.test(digest) ? digest.toLowerCase() : ""
  } catch (_) { return "" }
}

module.exports = { marketApprovalFingerprint: marketApprovalFingerprint }
