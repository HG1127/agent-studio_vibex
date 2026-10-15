/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/market_connections.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, server_name:text, title:text, url:text, headers_sec:text, headers_count:number, tools:json, tool_count:number, enabled:bool, last_probe_status:text, last_probe_msg:text
// 路由: create,update,delete
// list filter 字段: rh_user_id
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("market_connections") } catch (_) { existing = null }
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
      addField({ name: 'server_name', type: 'text', max: 200 })
      addField({ name: 'title', type: 'text', max: 200 })
      addField({ name: 'url', type: 'text', required: true, max: 500 })
      addField({ name: 'headers_sec', type: 'text' })
      addField({ name: 'headers_count', type: 'number' })
      addField({ name: 'tools', type: 'json' })
      addField({ name: 'tool_count', type: 'number' })
      addField({ name: 'enabled', type: 'bool' })
      addField({ name: 'last_probe_status', type: 'text', max: 20 })
      addField({ name: 'last_probe_msg', type: 'text', max: 300 })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("market_connections collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "market_connections",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 100 },
          { name: 'server_name', type: 'text', max: 200 },
          { name: 'title', type: 'text', max: 200 },
          { name: 'url', type: 'text', required: true, max: 500 },
          { name: 'headers_sec', type: 'text' },
          { name: 'headers_count', type: 'number' },
          { name: 'tools', type: 'json' },
          { name: 'tool_count', type: 'number' },
          { name: 'enabled', type: 'bool' },
          { name: 'last_probe_status', type: 'text', max: 20 },
          { name: 'last_probe_msg', type: 'text', max: 300 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("market_connections collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("market_connections bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/market_connections  body 字段: rh_user_id, server_name, title, url, headers_sec, headers_count, tools, tool_count, enabled, last_probe_status, last_probe_msg
routerAdd("POST", "/api/market_connections", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("market_connections") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "market_connections",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 100 },
          { name: 'server_name', type: 'text', max: 200 },
          { name: 'title', type: 'text', max: 200 },
          { name: 'url', type: 'text', required: true, max: 500 },
          { name: 'headers_sec', type: 'text' },
          { name: 'headers_count', type: 'number' },
          { name: 'tools', type: 'json' },
          { name: 'tool_count', type: 'number' },
          { name: 'enabled', type: 'bool' },
          { name: 'last_probe_status', type: 'text', max: 20 },
          { name: 'last_probe_msg', type: 'text', max: 300 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("market_connections")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("server_name", body.server_name === undefined || body.server_name === null ? "" : String(body.server_name))
    rec.set("title", body.title === undefined || body.title === null ? "" : String(body.title))
    rec.set("url", body.url === undefined || body.url === null ? "" : String(body.url))
    rec.set("headers_sec", body.headers_sec === undefined || body.headers_sec === null ? "" : String(body.headers_sec))
    rec.set("headers_count", (body.headers_count === undefined || body.headers_count === null) ? 0 : Number(body.headers_count))
    rec.set("tools", body.tools)
    rec.set("tool_count", (body.tool_count === undefined || body.tool_count === null) ? 0 : Number(body.tool_count))
    rec.set("enabled", !!body.enabled)
    rec.set("last_probe_status", body.last_probe_status === undefined || body.last_probe_status === null ? "" : String(body.last_probe_status))
    rec.set("last_probe_msg", body.last_probe_msg === undefined || body.last_probe_msg === null ? "" : String(body.last_probe_msg))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("market_connections create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/market_connections/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/market_connections/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("market_connections", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("server_name" in body) rec.set("server_name", body.server_name === undefined || body.server_name === null ? "" : String(body.server_name))
    if ("title" in body) rec.set("title", body.title === undefined || body.title === null ? "" : String(body.title))
    if ("url" in body) rec.set("url", body.url === undefined || body.url === null ? "" : String(body.url))
    if ("headers_sec" in body) rec.set("headers_sec", body.headers_sec === undefined || body.headers_sec === null ? "" : String(body.headers_sec))
    if ("headers_count" in body) rec.set("headers_count", (body.headers_count === undefined || body.headers_count === null) ? 0 : Number(body.headers_count))
    if ("tools" in body) rec.set("tools", body.tools)
    if ("tool_count" in body) rec.set("tool_count", (body.tool_count === undefined || body.tool_count === null) ? 0 : Number(body.tool_count))
    if ("enabled" in body) rec.set("enabled", !!body.enabled)
    if ("last_probe_status" in body) rec.set("last_probe_status", body.last_probe_status === undefined || body.last_probe_status === null ? "" : String(body.last_probe_status))
    if ("last_probe_msg" in body) rec.set("last_probe_msg", body.last_probe_msg === undefined || body.last_probe_msg === null ? "" : String(body.last_probe_msg))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/market_connections/{id}
routerAdd("DELETE", "/api/market_connections/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("market_connections", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
