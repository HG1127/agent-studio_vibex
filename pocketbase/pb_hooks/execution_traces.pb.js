// Owner-scoped privacy-safe model/tool diagnostic spans.
// Trace IDs and run IDs are the same for this V7.3 first vertical slice.
routerAdd("GET", "/api/execution-traces", function(e) {
  try {
    var headers = (e.requestInfo() || {}).headers || {}
    var uid = String(headers["x_rh_user_id"] || headers["X-Rh-User-Id"] ||
      headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401,{error:"rh_login_required"})
    var query = (e.requestInfo() || {}).query || {}
    var kind = String(query.kind || "")
    var runId = String(query.run_id || "")
    if (kind !== "agent" && kind !== "workflow") {
      return e.json(400,{error:"invalid_run_kind"})
    }
    if (!/^[A-Za-z0-9]{15}$/.test(runId)) {
      return e.json(400,{error:"invalid_run_id"})
    }
    var collection = kind === "agent" ? "agent_runs" : "workflow_runs"
    var run = null
    try { run = $app.findRecordById(collection,runId) } catch (_) {}
    if (!run || String(run.get("rh_user_id") || "") !== uid) {
      return e.json(404,{error:"run_not_found"})
    }
    var rows = arrayOf(new DynamicModel({
      id:"",trace_id:"",run_kind:"",run_id:"",step_ref:"",operation:"",
      status:"",error_code:"",duration_ms:0,created_ms:0,
    }))
    $app.db().newQuery(
      "SELECT id,trace_id,run_kind,run_id,step_ref,operation,status,error_code,duration_ms,created_ms " +
      "FROM agent_studio_execution_spans WHERE rh_user_id={:uid} AND run_kind={:kind} AND run_id={:run} " +
      "ORDER BY created_ms DESC,id DESC LIMIT 100"
    ).bind({uid:uid,kind:kind,run:runId}).all(rows)
    var items = []
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i]
      items.push({
        id:String(r.id),trace_id:String(r.trace_id),run_kind:String(r.run_kind),
        run_id:String(r.run_id),step_ref:String(r.step_ref),operation:String(r.operation),
        status:String(r.status),error_code:String(r.error_code),
        duration_ms:Number(r.duration_ms),created_ms:Number(r.created_ms),
      })
    }
    return e.json(200,{items:items,limit:100,trace_id:runId,
      summary:require(__hooks + "/modules/trace_metrics.js").summarize(items)})
  } catch (_) {
    return e.json(500,{error:"trace_lookup_failed"})
  }
})
