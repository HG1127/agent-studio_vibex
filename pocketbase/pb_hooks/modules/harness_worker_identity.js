"use strict"

// Attribute a claimed task lease only to a verified internal Worker request.
// A browser may send arbitrary X-Worker-Instance headers, but without the
// server-only token this remains unattributed. This helper grants NO lease
// renewal permission, and never exposes the token in a response.
function resolve(headers, expectedToken, enabled) {
  var h = headers || {}
  var expected = String(expectedToken || "")
  if (enabled !== true || expected.length < 32) return ""
  var supplied = String(h["x_agent_studio_worker_token"] ||
    h["X-Agent-Studio-Worker-Token"] || h["x-agent-studio-worker-token"] || "")
  var difference = expected.length ^ supplied.length
  for (var i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ (i < supplied.length ? supplied.charCodeAt(i) : 0)
  if (difference !== 0) return ""
  var instance = String(h["x_agent_studio_worker_instance"] ||
    h["X-Agent-Studio-Worker-Instance"] || h["x-agent-studio-worker-instance"] || "")
  // Legacy Worker deployments still carry the verified token but no ID.
  if (!instance) return "main"
  return /^w-[a-f0-9]{24}$/.test(instance) ? instance : ""
}

module.exports = { resolve: resolve }
