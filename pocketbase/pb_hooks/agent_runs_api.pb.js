// agent_runs_api.pb.js — 运行详情页（run-detail）归属校验数据通路
// 表结构由 MCP 装的 agent_runs.pb.js / run_events.pb.js 提供；本文件是运行详情页唯一数据通路：
//   GET /api/agent-runs/{id}/detail   单次运行完整档案（归属校验，非本人/不存在一律 404）
//   GET /api/agent-runs/recent?limit=N 当前用户最近运行精简列表（limit 钳制 1..20，默认 5）
// 安全约束：通用 /api/agent_runs、/api/run_events 路由无归属校验，前端详情数据禁止直读，只走本文件。
// Goja 铁律：全部 var、helper 就地定义、每个回调 self-contained、json 字段 getString 优先、
// 5xx 一律 { error, message, fingerprint }。

routerAdd("GET", "/api/agent-runs/{id}/detail", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()
    if (!id) return e.json(404, { error: "not_found", message: "运行不存在或无权查看" })

    var runRec = null
    try {
      runRec = $app.findRecordById("agent_runs", id)
    } catch (_) {}
    if (!runRec || String(runRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "运行不存在或无权查看" })
    }

    var parseJsonField = function (rec, field) {
      var text = ""
      try {
        text = rec.getString(field)
      } catch (_) {
        text = ""
      }
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch (_) {
        return null
      }
    }

    var configObj = parseJsonField(runRec, "config")
    var checkpointObj = parseJsonField(runRec, "checkpoint")

    // 方案配置快照：run 表未存快照列，服务端实时读本人 agent_specs 现配置（已删则回 null，前端回落 config）
    var specSnapshot = null
    var specId = String(runRec.get("spec_id") || "")
    if (specId) {
      try {
        var specRec = $app.findRecordById("agent_specs", specId)
        if (specRec && String(specRec.get("rh_user_id")) === uid) {
          var specObj = parseJsonField(specRec, "spec")
          if (specObj && typeof specObj === "object") {
            specObj.name = String(specRec.getString("name") || "")
            specSnapshot = specObj
          }
        }
      } catch (_) {}
    }

    var runOut = {
      id: String(runRec.id),
      rh_user_id: String(runRec.get("rh_user_id") || ""),
      spec_id: specId,
      spec_name: String(runRec.getString("spec_name") || ""),
      instruction: String(runRec.getString("instruction") || ""),
      status: String(runRec.getString("status") || ""),
      current_step: Number(runRec.getInt("current_step") || 0),
      max_steps: Number(runRec.getInt("max_steps") || 0),
      model: String(runRec.getString("model") || ""),
      config: configObj,
      checkpoint: checkpointObj,
      result: String(runRec.getString("result") || ""),
      error: String(runRec.getString("error") || ""),
      evaluation: parseJsonField(runRec, "evaluation"),
      feedback: parseJsonField(runRec, "feedback"),
      created: String(runRec.getString("created") || ""),
      updated: String(runRec.getString("updated") || ""),
    }

    var evRows = []
    try {
      evRows = $app.findRecordsByFilter(
        "run_events",
        "run_id = {:rid}",
        "step_index,seq,created",
        500,
        0,
        { rid: String(runRec.id) },
      )
    } catch (_) {
      evRows = []
    }
    var events = []
    for (var i = 0; i < evRows.length; i++) {
      var ev = evRows[i]
      events.push({
        id: String(ev.id),
        run_id: String(ev.get("run_id") || ""),
        step_index: Number(ev.getInt("step_index") || 0),
        seq: Number(ev.getInt("seq") || 0),
        event_type: String(ev.getString("event_type") || "status"),
        content: parseJsonField(ev, "content") || {},
        created: String(ev.getString("created") || ""),
      })
    }

    return e.json(200, { ok: true, run: runOut, spec_snapshot: specSnapshot, events: events })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent_runs detail error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/agent-runs/recent", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var query = (e.requestInfo() || {}).query || {}
    var limit = Number(query.limit || 5)
    if (!limit || limit < 1) limit = 5
    if (limit > 20) limit = 20

    var rows = $app.findRecordsByFilter("agent_runs", "rh_user_id = {:uid}", "-created", limit, 0, { uid: uid })
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var rec = rows[i]
      var cfgObj = null
      try {
        var cfgText = rec.getString("config")
        if (cfgText) cfgObj = JSON.parse(cfgText)
      } catch (_) {
        cfgObj = null
      }
      items.push({
        id: String(rec.id),
        spec_id: String(rec.get("spec_id") || ""),
        spec_name: String(rec.getString("spec_name") || ""),
        instruction: String(rec.getString("instruction") || ""),
        status: String(rec.getString("status") || ""),
        current_step: Number(rec.getInt("current_step") || 0),
        max_steps: Number(rec.getInt("max_steps") || 0),
        model: String(rec.getString("model") || ""),
        source: cfgObj && typeof cfgObj === "object" ? String(cfgObj.source || "") : "",
        created: String(rec.getString("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent_runs recent error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
