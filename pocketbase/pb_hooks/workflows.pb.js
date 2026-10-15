/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/workflows.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, name:text, description:text, graph:json, source:text, require_approval:bool, spec_id:text
// 路由: create,update,delete
// list filter 字段: rh_user_id
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("workflows") } catch (_) { existing = null }
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
      addField({ name: 'description', type: 'text', max: 500 })
      addField({ name: 'graph', type: 'json' })
      addField({ name: 'source', type: 'text', max: 40 })
      addField({ name: 'require_approval', type: 'bool' })
      addField({ name: 'spec_id', type: 'text', max: 64 })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("workflows collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "workflows",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'name', type: 'text', required: true, max: 100 },
          { name: 'description', type: 'text', max: 500 },
          { name: 'graph', type: 'json' },
          { name: 'source', type: 'text', max: 40 },
          { name: 'require_approval', type: 'bool' },
          { name: 'spec_id', type: 'text', max: 64 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("workflows collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("workflows bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/workflows  body 字段: rh_user_id, name, description, graph, source, require_approval, spec_id
routerAdd("POST", "/api/workflows", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("workflows") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "workflows",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'name', type: 'text', required: true, max: 100 },
          { name: 'description', type: 'text', max: 500 },
          { name: 'graph', type: 'json' },
          { name: 'source', type: 'text', max: 40 },
          { name: 'require_approval', type: 'bool' },
          { name: 'spec_id', type: 'text', max: 64 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("workflows")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    rec.set("description", body.description === undefined || body.description === null ? "" : String(body.description))
    rec.set("graph", body.graph)
    rec.set("source", body.source === undefined || body.source === null ? "" : String(body.source))
    rec.set("require_approval", !!body.require_approval)
    rec.set("spec_id", body.spec_id === undefined || body.spec_id === null ? "" : String(body.spec_id))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("workflows create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/workflows/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/workflows/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("workflows", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("name" in body) rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    if ("description" in body) rec.set("description", body.description === undefined || body.description === null ? "" : String(body.description))
    if ("graph" in body) rec.set("graph", body.graph)
    if ("source" in body) rec.set("source", body.source === undefined || body.source === null ? "" : String(body.source))
    if ("require_approval" in body) rec.set("require_approval", !!body.require_approval)
    if ("spec_id" in body) rec.set("spec_id", body.spec_id === undefined || body.spec_id === null ? "" : String(body.spec_id))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/workflows/{id}
routerAdd("DELETE", "/api/workflows/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("workflows", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
