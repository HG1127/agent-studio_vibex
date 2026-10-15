/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/run_events.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: run_id:text, step_index:number, seq:number, event_type:text, content:json
// 路由: list,get,create,update,delete
// list filter 字段: run_id,event_type
// list 默认排序: +created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("run_events") } catch (_) { existing = null }
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
      addField({ name: 'run_id', type: 'text', required: true })
      addField({ name: 'step_index', type: 'number' })
      addField({ name: 'seq', type: 'number' })
      addField({ name: 'event_type', type: 'text', required: true })
      addField({ name: 'content', type: 'json' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("run_events collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "run_events",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'run_id', type: 'text', required: true },
          { name: 'step_index', type: 'number' },
          { name: 'seq', type: 'number' },
          { name: 'event_type', type: 'text', required: true },
          { name: 'content', type: 'json' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("run_events collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("run_events bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/run_events?page=1&perPage=50&sort=-created&run_id=...&event_type=...
routerAdd("GET", "/api/run_events", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("run_events") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "run_events",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'run_id', type: 'text', required: true },
          { name: 'step_index', type: 'number' },
          { name: 'seq', type: 'number' },
          { name: 'event_type', type: 'text', required: true },
          { name: 'content', type: 'json' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("run_events")
  }
  try {
    ensureCollLocal()
    var info = e.requestInfo()
    var query = info.query || {}
    var _rid = String(query.run_id || "").trim()
    if (!_rid) return e.json(400, { error: "run_id_required" })
    var _parentRun = null
    try { _parentRun = $app.findRecordById("agent_runs", _rid) } catch (_) {}
    if (!_parentRun || String(_parentRun.get("rh_user_id") || "") !== uid) return e.json(404, { error: "run_not_found" })
    var page = parseInt(String(query.page || "1"), 10) || 1
    var perPage = parseInt(String(query.perPage || "50"), 10) || 50
    if (perPage > 200) perPage = 200
    var sort = String(query.sort || "+created")
    var filterParts = []
    var params = {}
    if (query.run_id !== undefined && query.run_id !== "") {
      filterParts.push("run_id = {:run_id}")
      params.run_id = String(query.run_id)
    }
    if (query.event_type !== undefined && query.event_type !== "") {
      filterParts.push("event_type = {:event_type}")
      params.event_type = String(query.event_type)
    }
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("run_events", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("run_events", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("run_events list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// GET /api/run_events/{id}
routerAdd("GET", "/api/run_events/{id}", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("run_events", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var _parent = null
    try { _parent = $app.findRecordById("agent_runs", String(rec.get("run_id") || "")) } catch (_) {}
    if (!_parent || String(_parent.get("rh_user_id") || "") !== uid) return e.json(404, { error: "not_found" })
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "get_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// POST /api/run_events  body 字段: run_id, step_index, seq, event_type, content
routerAdd("POST", "/api/run_events", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("run_events") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "run_events",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'run_id', type: 'text', required: true },
          { name: 'step_index', type: 'number' },
          { name: 'seq', type: 'number' },
          { name: 'event_type', type: 'text', required: true },
          { name: 'content', type: 'json' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("run_events")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("run_id", body.run_id === undefined || body.run_id === null ? "" : String(body.run_id))
    rec.set("step_index", (body.step_index === undefined || body.step_index === null) ? 0 : Number(body.step_index))
    rec.set("seq", (body.seq === undefined || body.seq === null) ? 0 : Number(body.seq))
    rec.set("event_type", body.event_type === undefined || body.event_type === null ? "" : String(body.event_type))
    rec.set("content", body.content)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("run_events create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/run_events/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/run_events/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("run_events", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("run_id" in body) rec.set("run_id", body.run_id === undefined || body.run_id === null ? "" : String(body.run_id))
    if ("step_index" in body) rec.set("step_index", (body.step_index === undefined || body.step_index === null) ? 0 : Number(body.step_index))
    if ("seq" in body) rec.set("seq", (body.seq === undefined || body.seq === null) ? 0 : Number(body.seq))
    if ("event_type" in body) rec.set("event_type", body.event_type === undefined || body.event_type === null ? "" : String(body.event_type))
    if ("content" in body) rec.set("content", body.content)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/run_events/{id}
routerAdd("DELETE", "/api/run_events/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("run_events", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
