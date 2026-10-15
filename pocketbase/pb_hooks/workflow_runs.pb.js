/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/workflow_runs.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, workflow_id:text, workflow_name:text, instruction:text, status:text, graph_snapshot:json, checkpoint:json, result:text, error:text, done_nodes:number, total_nodes:number
// 路由: create,update,delete
// list filter 字段: rh_user_id,workflow_id,status
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("workflow_runs") } catch (_) { existing = null }
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
      addField({ name: 'workflow_id', type: 'text', required: true, max: 64 })
      addField({ name: 'workflow_name', type: 'text', max: 100 })
      addField({ name: 'instruction', type: 'text', max: 2000 })
      addField({ name: 'status', type: 'text', max: 20 })
      addField({ name: 'graph_snapshot', type: 'json' })
      addField({ name: 'checkpoint', type: 'json' })
      addField({ name: 'result', type: 'text' })
      addField({ name: 'error', type: 'text' })
      addField({ name: 'done_nodes', type: 'number' })
      addField({ name: 'total_nodes', type: 'number' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("workflow_runs collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "workflow_runs",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'workflow_id', type: 'text', required: true, max: 64 },
          { name: 'workflow_name', type: 'text', max: 100 },
          { name: 'instruction', type: 'text', max: 2000 },
          { name: 'status', type: 'text', max: 20 },
          { name: 'graph_snapshot', type: 'json' },
          { name: 'checkpoint', type: 'json' },
          { name: 'result', type: 'text' },
          { name: 'error', type: 'text' },
          { name: 'done_nodes', type: 'number' },
          { name: 'total_nodes', type: 'number' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("workflow_runs collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("workflow_runs bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/workflow_runs  body 字段: rh_user_id, workflow_id, workflow_name, instruction, status, graph_snapshot, checkpoint, result, error, done_nodes, total_nodes
routerAdd("POST", "/api/workflow_runs", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("workflow_runs") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "workflow_runs",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'workflow_id', type: 'text', required: true, max: 64 },
          { name: 'workflow_name', type: 'text', max: 100 },
          { name: 'instruction', type: 'text', max: 2000 },
          { name: 'status', type: 'text', max: 20 },
          { name: 'graph_snapshot', type: 'json' },
          { name: 'checkpoint', type: 'json' },
          { name: 'result', type: 'text' },
          { name: 'error', type: 'text' },
          { name: 'done_nodes', type: 'number' },
          { name: 'total_nodes', type: 'number' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("workflow_runs")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("workflow_id", body.workflow_id === undefined || body.workflow_id === null ? "" : String(body.workflow_id))
    rec.set("workflow_name", body.workflow_name === undefined || body.workflow_name === null ? "" : String(body.workflow_name))
    rec.set("instruction", body.instruction === undefined || body.instruction === null ? "" : String(body.instruction))
    rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    rec.set("graph_snapshot", body.graph_snapshot)
    rec.set("checkpoint", body.checkpoint)
    rec.set("result", body.result === undefined || body.result === null ? "" : String(body.result))
    rec.set("error", body.error === undefined || body.error === null ? "" : String(body.error))
    rec.set("done_nodes", (body.done_nodes === undefined || body.done_nodes === null) ? 0 : Number(body.done_nodes))
    rec.set("total_nodes", (body.total_nodes === undefined || body.total_nodes === null) ? 0 : Number(body.total_nodes))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("workflow_runs create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/workflow_runs/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/workflow_runs/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("workflow_runs", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("workflow_id" in body) rec.set("workflow_id", body.workflow_id === undefined || body.workflow_id === null ? "" : String(body.workflow_id))
    if ("workflow_name" in body) rec.set("workflow_name", body.workflow_name === undefined || body.workflow_name === null ? "" : String(body.workflow_name))
    if ("instruction" in body) rec.set("instruction", body.instruction === undefined || body.instruction === null ? "" : String(body.instruction))
    if ("status" in body) rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    if ("graph_snapshot" in body) rec.set("graph_snapshot", body.graph_snapshot)
    if ("checkpoint" in body) rec.set("checkpoint", body.checkpoint)
    if ("result" in body) rec.set("result", body.result === undefined || body.result === null ? "" : String(body.result))
    if ("error" in body) rec.set("error", body.error === undefined || body.error === null ? "" : String(body.error))
    if ("done_nodes" in body) rec.set("done_nodes", (body.done_nodes === undefined || body.done_nodes === null) ? 0 : Number(body.done_nodes))
    if ("total_nodes" in body) rec.set("total_nodes", (body.total_nodes === undefined || body.total_nodes === null) ? 0 : Number(body.total_nodes))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/workflow_runs/{id}
routerAdd("DELETE", "/api/workflow_runs/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("workflow_runs", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
