/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/market_i18n.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: server_name:text, zh_title:text, zh_desc:text
// 路由: create,update,delete
// list filter 字段: server_name
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("market_i18n") } catch (_) { existing = null }
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
      addField({ name: 'server_name', type: 'text', required: true, max: 200 })
      addField({ name: 'zh_title', type: 'text', max: 200 })
      addField({ name: 'zh_desc', type: 'text', max: 600 })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("market_i18n collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "market_i18n",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'server_name', type: 'text', required: true, max: 200 },
          { name: 'zh_title', type: 'text', max: 200 },
          { name: 'zh_desc', type: 'text', max: 600 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("market_i18n collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("market_i18n bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/market_i18n  body 字段: server_name, zh_title, zh_desc
routerAdd("POST", "/api/market_i18n", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("market_i18n") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "market_i18n",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'server_name', type: 'text', required: true, max: 200 },
          { name: 'zh_title', type: 'text', max: 200 },
          { name: 'zh_desc', type: 'text', max: 600 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("market_i18n")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("server_name", body.server_name === undefined || body.server_name === null ? "" : String(body.server_name))
    rec.set("zh_title", body.zh_title === undefined || body.zh_title === null ? "" : String(body.zh_title))
    rec.set("zh_desc", body.zh_desc === undefined || body.zh_desc === null ? "" : String(body.zh_desc))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("market_i18n create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/market_i18n/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/market_i18n/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("market_i18n", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("server_name" in body) rec.set("server_name", body.server_name === undefined || body.server_name === null ? "" : String(body.server_name))
    if ("zh_title" in body) rec.set("zh_title", body.zh_title === undefined || body.zh_title === null ? "" : String(body.zh_title))
    if ("zh_desc" in body) rec.set("zh_desc", body.zh_desc === undefined || body.zh_desc === null ? "" : String(body.zh_desc))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/market_i18n/{id}
routerAdd("DELETE", "/api/market_i18n/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("market_i18n", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
