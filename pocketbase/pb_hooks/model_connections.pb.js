/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/model_connections.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, name:text, base_url:text, api_key:text, api_key_tail:text, enabled:bool, status:text, last_latency_ms:number, last_checked_at:date, models:json, last_error:text, provider:text
// 路由: create,update,delete
// list filter 字段: rh_user_id
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("model_connections") } catch (_) { existing = null }
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
      addField({ name: 'rh_user_id', type: 'text', required: true, max: 64 })
      addField({ name: 'name', type: 'text', required: true, max: 100 })
      addField({ name: 'base_url', type: 'text', required: true, max: 500 })
      addField({ name: 'api_key', type: 'text', max: 500 })
      addField({ name: 'api_key_tail', type: 'text', max: 8 })
      addField({ name: 'enabled', type: 'bool' })
      addField({ name: 'status', type: 'text', max: 20 })
      addField({ name: 'last_latency_ms', type: 'number' })
      addField({ name: 'last_checked_at', type: 'date' })
      addField({ name: 'models', type: 'json' })
      addField({ name: 'last_error', type: 'text', max: 1000 })
      addField({ name: 'provider', type: 'text', max: 20 })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("model_connections collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "model_connections",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'name', type: 'text', required: true, max: 100 },
          { name: 'base_url', type: 'text', required: true, max: 500 },
          { name: 'api_key', type: 'text', max: 500 },
          { name: 'api_key_tail', type: 'text', max: 8 },
          { name: 'enabled', type: 'bool' },
          { name: 'status', type: 'text', max: 20 },
          { name: 'last_latency_ms', type: 'number' },
          { name: 'last_checked_at', type: 'date' },
          { name: 'models', type: 'json' },
          { name: 'last_error', type: 'text', max: 1000 },
          { name: 'provider', type: 'text', max: 20 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("model_connections collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("model_connections bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/model_connections  body 字段: rh_user_id, name, base_url, api_key, api_key_tail, enabled, status, last_latency_ms, last_checked_at, models, last_error, provider
routerAdd("POST", "/api/model_connections", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("model_connections") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "model_connections",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'name', type: 'text', required: true, max: 100 },
          { name: 'base_url', type: 'text', required: true, max: 500 },
          { name: 'api_key', type: 'text', max: 500 },
          { name: 'api_key_tail', type: 'text', max: 8 },
          { name: 'enabled', type: 'bool' },
          { name: 'status', type: 'text', max: 20 },
          { name: 'last_latency_ms', type: 'number' },
          { name: 'last_checked_at', type: 'date' },
          { name: 'models', type: 'json' },
          { name: 'last_error', type: 'text', max: 1000 },
          { name: 'provider', type: 'text', max: 20 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("model_connections")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    rec.set("base_url", body.base_url === undefined || body.base_url === null ? "" : String(body.base_url))
    rec.set("api_key", body.api_key === undefined || body.api_key === null ? "" : String(body.api_key))
    rec.set("api_key_tail", body.api_key_tail === undefined || body.api_key_tail === null ? "" : String(body.api_key_tail))
    rec.set("enabled", !!body.enabled)
    rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    rec.set("last_latency_ms", (body.last_latency_ms === undefined || body.last_latency_ms === null) ? 0 : Number(body.last_latency_ms))
    rec.set("last_checked_at", body.last_checked_at === undefined || body.last_checked_at === null ? "" : String(body.last_checked_at))
    rec.set("models", body.models)
    rec.set("last_error", body.last_error === undefined || body.last_error === null ? "" : String(body.last_error))
    rec.set("provider", body.provider === undefined || body.provider === null ? "" : String(body.provider))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("model_connections create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/model_connections/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/model_connections/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("model_connections", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("name" in body) rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    if ("base_url" in body) rec.set("base_url", body.base_url === undefined || body.base_url === null ? "" : String(body.base_url))
    if ("api_key" in body) rec.set("api_key", body.api_key === undefined || body.api_key === null ? "" : String(body.api_key))
    if ("api_key_tail" in body) rec.set("api_key_tail", body.api_key_tail === undefined || body.api_key_tail === null ? "" : String(body.api_key_tail))
    if ("enabled" in body) rec.set("enabled", !!body.enabled)
    if ("status" in body) rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    if ("last_latency_ms" in body) rec.set("last_latency_ms", (body.last_latency_ms === undefined || body.last_latency_ms === null) ? 0 : Number(body.last_latency_ms))
    if ("last_checked_at" in body) rec.set("last_checked_at", body.last_checked_at === undefined || body.last_checked_at === null ? "" : String(body.last_checked_at))
    if ("models" in body) rec.set("models", body.models)
    if ("last_error" in body) rec.set("last_error", body.last_error === undefined || body.last_error === null ? "" : String(body.last_error))
    if ("provider" in body) rec.set("provider", body.provider === undefined || body.provider === null ? "" : String(body.provider))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/model_connections/{id}
routerAdd("DELETE", "/api/model_connections/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("model_connections", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
