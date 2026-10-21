/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/agent_runs.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, spec_id:text, spec_name:text, instruction:text, status:text, current_step:number, max_steps:number, model:text, config:json, result:text, error:text, checkpoint:json, evaluation:json, feedback:json
// 路由: list,get,create,update,delete
// list filter 字段: rh_user_id,spec_id,status
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("agent_runs") } catch (_) { existing = null }
    if (existing) {
      var changed = false
      function hasField(name) {
        try { return !!existing.fields.getByName(name) } catch (_) {}
        try {
          for (var i = 0; i < existing.fields.length; i++) {
            if (String(existing.fields[i].name) === String(name)) return true
          }
        } catch (_) {}
        return false
      }
      function addField(def) {
        if (hasField(def.name)) return
        try { existing.fields.add(new Field(def)); changed = true } catch (_) {}
      }
      addField({ name: 'rh_user_id', type: 'text', required: true })
      addField({ name: 'spec_id', type: 'text' })
      addField({ name: 'spec_name', type: 'text' })
      addField({ name: 'instruction', type: 'text' })
      addField({ name: 'status', type: 'text', required: true })
      addField({ name: 'current_step', type: 'number' })
      addField({ name: 'max_steps', type: 'number' })
      addField({ name: 'model', type: 'text' })
      addField({ name: 'config', type: 'json' })
      addField({ name: 'spec_snapshot', type: 'json' })
      addField({ name: 'result', type: 'text' })
      addField({ name: 'error', type: 'text' })
      addField({ name: 'checkpoint', type: 'json' })
      addField({ name: 'evaluation', type: 'json' })
      addField({ name: 'feedback', type: 'json' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("agent_runs collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "agent_runs",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true },
          { name: 'spec_id', type: 'text' },
          { name: 'spec_name', type: 'text' },
          { name: 'instruction', type: 'text' },
          { name: 'status', type: 'text', required: true },
          { name: 'current_step', type: 'number' },
          { name: 'max_steps', type: 'number' },
          { name: 'model', type: 'text' },
          { name: 'config', type: 'json' },
          { name: 'spec_snapshot', type: 'json' },
          { name: 'result', type: 'text' },
          { name: 'error', type: 'text' },
          { name: 'checkpoint', type: 'json' },
          { name: 'evaluation', type: 'json' },
          { name: 'feedback', type: 'json' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("agent_runs collection created") } catch (_) {}
    }
    // Build the owner-scoped history index after agent_runs was created.
    $app.db().newQuery(
      "CREATE INDEX IF NOT EXISTS idx_run_history_owner_spec_created "+
      "ON agent_runs(rh_user_id,spec_id,created DESC,id DESC)"
    ).execute()
  } catch (err) {
    try { $app.logger().error("agent_runs bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/agent_runs?page=1&perPage=50&sort=-created&rh_user_id=...&spec_id=...&status=...
routerAdd("GET", "/api/agent_runs", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("agent_runs") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "agent_runs",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true },
          { name: 'spec_id', type: 'text' },
          { name: 'spec_name', type: 'text' },
          { name: 'instruction', type: 'text' },
          { name: 'status', type: 'text', required: true },
          { name: 'current_step', type: 'number' },
          { name: 'max_steps', type: 'number' },
          { name: 'model', type: 'text' },
          { name: 'config', type: 'json' },
          { name: 'spec_snapshot', type: 'json' },
          { name: 'result', type: 'text' },
          { name: 'error', type: 'text' },
          { name: 'checkpoint', type: 'json' },
          { name: 'evaluation', type: 'json' },
          { name: 'feedback', type: 'json' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("agent_runs")
  }
  try {
    ensureCollLocal()
    var info = e.requestInfo()
    var query = info.query || {}
    var page = parseInt(String(query.page || "1"), 10) || 1
    var perPage = parseInt(String(query.perPage || "50"), 10) || 50
    if (perPage > 200) perPage = 200
    var sort = String(query.sort || "-created")
    var filterParts = ["rh_user_id = {:owner_uid}"]
    var params = { owner_uid: uid }
    if (query.spec_id !== undefined && query.spec_id !== "") {
      filterParts.push("spec_id = {:spec_id}")
      params.spec_id = String(query.spec_id)
    }
    if (query.status !== undefined && query.status !== "") {
      filterParts.push("status = {:status}")
      params.status = String(query.status)
    }
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("agent_runs", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("agent_runs", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("agent_runs list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// GET /api/agent_runs/{id}
routerAdd("GET", "/api/agent_runs/{id}", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("agent_runs", id) } catch (_) { rec = null }
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "not_found" })
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "get_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// POST /api/agent_runs  body 字段: rh_user_id, spec_id, spec_name, instruction, status, current_step, max_steps, model, config, result, error, checkpoint, evaluation, feedback
routerAdd("POST", "/api/agent_runs", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("agent_runs") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "agent_runs",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true },
          { name: 'spec_id', type: 'text' },
          { name: 'spec_name', type: 'text' },
          { name: 'instruction', type: 'text' },
          { name: 'status', type: 'text', required: true },
          { name: 'current_step', type: 'number' },
          { name: 'max_steps', type: 'number' },
          { name: 'model', type: 'text' },
          { name: 'config', type: 'json' },
          { name: 'spec_snapshot', type: 'json' },
          { name: 'result', type: 'text' },
          { name: 'error', type: 'text' },
          { name: 'checkpoint', type: 'json' },
          { name: 'evaluation', type: 'json' },
          { name: 'feedback', type: 'json' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("agent_runs")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("spec_id", body.spec_id === undefined || body.spec_id === null ? "" : String(body.spec_id))
    rec.set("spec_name", body.spec_name === undefined || body.spec_name === null ? "" : String(body.spec_name))
    rec.set("instruction", body.instruction === undefined || body.instruction === null ? "" : String(body.instruction))
    rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    rec.set("current_step", (body.current_step === undefined || body.current_step === null) ? 0 : Number(body.current_step))
    rec.set("max_steps", (body.max_steps === undefined || body.max_steps === null) ? 0 : Number(body.max_steps))
    rec.set("model", body.model === undefined || body.model === null ? "" : String(body.model))
    rec.set("config", body.config)
    rec.set("result", body.result === undefined || body.result === null ? "" : String(body.result))
    rec.set("error", body.error === undefined || body.error === null ? "" : String(body.error))
    rec.set("checkpoint", body.checkpoint)
    rec.set("evaluation", body.evaluation)
    rec.set("feedback", body.feedback)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("agent_runs create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/agent_runs/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/agent_runs/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("agent_runs", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("spec_id" in body) rec.set("spec_id", body.spec_id === undefined || body.spec_id === null ? "" : String(body.spec_id))
    if ("spec_name" in body) rec.set("spec_name", body.spec_name === undefined || body.spec_name === null ? "" : String(body.spec_name))
    if ("instruction" in body) rec.set("instruction", body.instruction === undefined || body.instruction === null ? "" : String(body.instruction))
    if ("status" in body) rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    if ("current_step" in body) rec.set("current_step", (body.current_step === undefined || body.current_step === null) ? 0 : Number(body.current_step))
    if ("max_steps" in body) rec.set("max_steps", (body.max_steps === undefined || body.max_steps === null) ? 0 : Number(body.max_steps))
    if ("model" in body) rec.set("model", body.model === undefined || body.model === null ? "" : String(body.model))
    if ("config" in body) rec.set("config", body.config)
    if ("result" in body) rec.set("result", body.result === undefined || body.result === null ? "" : String(body.result))
    if ("error" in body) rec.set("error", body.error === undefined || body.error === null ? "" : String(body.error))
    if ("checkpoint" in body) rec.set("checkpoint", body.checkpoint)
    if ("evaluation" in body) rec.set("evaluation", body.evaluation)
    if ("feedback" in body) rec.set("feedback", body.feedback)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/agent_runs/{id}
routerAdd("DELETE", "/api/agent_runs/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("agent_runs", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
