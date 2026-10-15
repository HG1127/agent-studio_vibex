/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/workflow_events.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: run_id:text, node_id:text, seq:number, event_type:text, content:json
// 路由: create,update,delete
// list filter 字段: run_id,node_id
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("workflow_events") } catch (_) { existing = null }
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
      addField({ name: 'run_id', type: 'text', required: true, max: 64 })
      addField({ name: 'node_id', type: 'text', max: 64 })
      addField({ name: 'seq', type: 'number' })
      addField({ name: 'event_type', type: 'text', max: 30 })
      addField({ name: 'content', type: 'json' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("workflow_events collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "workflow_events",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'run_id', type: 'text', required: true, max: 64 },
          { name: 'node_id', type: 'text', max: 64 },
          { name: 'seq', type: 'number' },
          { name: 'event_type', type: 'text', max: 30 },
          { name: 'content', type: 'json' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("workflow_events collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("workflow_events bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/workflow_events  body 字段: run_id, node_id, seq, event_type, content
routerAdd("POST", "/api/workflow_events", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("workflow_events") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "workflow_events",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'run_id', type: 'text', required: true, max: 64 },
          { name: 'node_id', type: 'text', max: 64 },
          { name: 'seq', type: 'number' },
          { name: 'event_type', type: 'text', max: 30 },
          { name: 'content', type: 'json' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("workflow_events")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("run_id", body.run_id === undefined || body.run_id === null ? "" : String(body.run_id))
    rec.set("node_id", body.node_id === undefined || body.node_id === null ? "" : String(body.node_id))
    rec.set("seq", (body.seq === undefined || body.seq === null) ? 0 : Number(body.seq))
    rec.set("event_type", body.event_type === undefined || body.event_type === null ? "" : String(body.event_type))
    rec.set("content", body.content)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("workflow_events create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/workflow_events/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/workflow_events/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("workflow_events", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("run_id" in body) rec.set("run_id", body.run_id === undefined || body.run_id === null ? "" : String(body.run_id))
    if ("node_id" in body) rec.set("node_id", body.node_id === undefined || body.node_id === null ? "" : String(body.node_id))
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
// DELETE /api/workflow_events/{id}
routerAdd("DELETE", "/api/workflow_events/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("workflow_events", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
