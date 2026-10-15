"use strict"

// Minimal privacy-preserving execution trace repository.
// Never store prompts, model responses, credentials, tool args, provider URLs or HTTP headers.
function cleanWord(value, fallback, maxLength) {
  var text = String(value || "")
  return /^[A-Za-z0-9_.:-]+$/.test(text) ? text.slice(0, maxLength) : fallback
}

function record(app, data) {
  var d = data || {}
  var user = String(d.owner || "").trim()
  var runId = String(d.runId || "").trim()
  var kind = String(d.kind || "")
  var id = String(d.spanId || "")
  if (!user || !runId || !/^[A-Za-z0-9]{15,40}$/.test(id) ||
      (kind !== "agent" && kind !== "workflow")) {
    throw new Error("invalid_execution_span")
  }
  var status = d.status === "succeeded" ? "succeeded" : "failed"
  var errorCode = status === "failed" ? cleanWord(d.errorCode, "model_error", 80) : ""
  var elapsed = Math.max(0, Math.min(600000, Math.floor(Number(d.durationMs) || 0)))
  var timestamp = Number(d.createdMs) || new Date().getTime()
  app.db().newQuery(
    "INSERT INTO agent_studio_execution_spans (" +
    "id,rh_user_id,trace_id,run_kind,run_id,step_ref,operation,status,error_code,duration_ms,created_ms)" +
    " VALUES({:id},{:uid},{:trace},{:kind},{:run},{:step},{:operation},{:status},{:error},{:duration},{:created})"
  ).bind({
    id:id,uid:user,trace:runId,kind:kind,run:runId,
    step:cleanWord(d.stepRef,"unknown",50),
    operation:cleanWord(d.operation,"model",32),
    status:status,error:errorCode,duration:elapsed,created:timestamp,
  }).execute()
}

module.exports = { record:record }
