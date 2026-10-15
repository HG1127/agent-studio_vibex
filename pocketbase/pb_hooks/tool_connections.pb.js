/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/tool_connections.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, name:text, description:text, url:text, method:text, headers:json, body_template:text, timeout_s:number, enabled:bool, status:text, last_latency_ms:number, last_checked_at:date, last_error:text
// 路由: create,update,delete
// list filter 字段: rh_user_id
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("tool_connections") } catch (_) { existing = null }
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
      addField({ name: 'rh_user_id', type: 'text', required: true, max: 100 })
      addField({ name: 'name', type: 'text', required: true, max: 100 })
      addField({ name: 'description', type: 'text', required: true, max: 500 })
      addField({ name: 'url', type: 'text', required: true, max: 1000 })
      addField({ name: 'method', type: 'text', max: 10 })
      addField({ name: 'headers', type: 'json' })
      addField({ name: 'body_template', type: 'text', max: 20000 })
      addField({ name: 'timeout_s', type: 'number' })
      addField({ name: 'enabled', type: 'bool' })
      addField({ name: 'status', type: 'text', max: 20 })
      addField({ name: 'last_latency_ms', type: 'number' })
      addField({ name: 'last_checked_at', type: 'date' })
      addField({ name: 'last_error', type: 'text', max: 1000 })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("tool_connections collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "tool_connections",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 100 },
          { name: 'name', type: 'text', required: true, max: 100 },
          { name: 'description', type: 'text', required: true, max: 500 },
          { name: 'url', type: 'text', required: true, max: 1000 },
          { name: 'method', type: 'text', max: 10 },
          { name: 'headers', type: 'json' },
          { name: 'body_template', type: 'text', max: 20000 },
          { name: 'timeout_s', type: 'number' },
          { name: 'enabled', type: 'bool' },
          { name: 'status', type: 'text', max: 20 },
          { name: 'last_latency_ms', type: 'number' },
          { name: 'last_checked_at', type: 'date' },
          { name: 'last_error', type: 'text', max: 1000 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("tool_connections collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("tool_connections bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/tool_connections  body 字段: rh_user_id, name, description, url, method, headers, body_template, timeout_s, enabled, status, last_latency_ms, last_checked_at, last_error
routerAdd("POST", "/api/tool_connections", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("tool_connections") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "tool_connections",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 100 },
          { name: 'name', type: 'text', required: true, max: 100 },
          { name: 'description', type: 'text', required: true, max: 500 },
          { name: 'url', type: 'text', required: true, max: 1000 },
          { name: 'method', type: 'text', max: 10 },
          { name: 'headers', type: 'json' },
          { name: 'body_template', type: 'text', max: 20000 },
          { name: 'timeout_s', type: 'number' },
          { name: 'enabled', type: 'bool' },
          { name: 'status', type: 'text', max: 20 },
          { name: 'last_latency_ms', type: 'number' },
          { name: 'last_checked_at', type: 'date' },
          { name: 'last_error', type: 'text', max: 1000 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("tool_connections")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    rec.set("description", body.description === undefined || body.description === null ? "" : String(body.description))
    rec.set("url", body.url === undefined || body.url === null ? "" : String(body.url))
    rec.set("method", body.method === undefined || body.method === null ? "" : String(body.method))
    rec.set("headers", body.headers)
    rec.set("body_template", body.body_template === undefined || body.body_template === null ? "" : String(body.body_template))
    rec.set("timeout_s", (body.timeout_s === undefined || body.timeout_s === null) ? 0 : Number(body.timeout_s))
    rec.set("enabled", !!body.enabled)
    rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    rec.set("last_latency_ms", (body.last_latency_ms === undefined || body.last_latency_ms === null) ? 0 : Number(body.last_latency_ms))
    rec.set("last_checked_at", body.last_checked_at === undefined || body.last_checked_at === null ? "" : String(body.last_checked_at))
    rec.set("last_error", body.last_error === undefined || body.last_error === null ? "" : String(body.last_error))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("tool_connections create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/tool_connections/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/tool_connections/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("tool_connections", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("name" in body) rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    if ("description" in body) rec.set("description", body.description === undefined || body.description === null ? "" : String(body.description))
    if ("url" in body) rec.set("url", body.url === undefined || body.url === null ? "" : String(body.url))
    if ("method" in body) rec.set("method", body.method === undefined || body.method === null ? "" : String(body.method))
    if ("headers" in body) rec.set("headers", body.headers)
    if ("body_template" in body) rec.set("body_template", body.body_template === undefined || body.body_template === null ? "" : String(body.body_template))
    if ("timeout_s" in body) rec.set("timeout_s", (body.timeout_s === undefined || body.timeout_s === null) ? 0 : Number(body.timeout_s))
    if ("enabled" in body) rec.set("enabled", !!body.enabled)
    if ("status" in body) rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    if ("last_latency_ms" in body) rec.set("last_latency_ms", (body.last_latency_ms === undefined || body.last_latency_ms === null) ? 0 : Number(body.last_latency_ms))
    if ("last_checked_at" in body) rec.set("last_checked_at", body.last_checked_at === undefined || body.last_checked_at === null ? "" : String(body.last_checked_at))
    if ("last_error" in body) rec.set("last_error", body.last_error === undefined || body.last_error === null ? "" : String(body.last_error))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/tool_connections/{id}
routerAdd("DELETE", "/api/tool_connections/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("tool_connections", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
