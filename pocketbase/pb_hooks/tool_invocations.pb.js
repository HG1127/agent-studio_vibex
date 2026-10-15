/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/tool_invocations.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, tool_name:text, tool_kind:text, source:text, run_id:text, status:text, latency_ms:number, input_summary:text, output_excerpt:text, error_code:text, retried:bool
// 路由: create,update,delete
// list filter 字段: rh_user_id,tool_name
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("tool_invocations") } catch (_) { existing = null }
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
      addField({ name: 'tool_name', type: 'text', required: true, max: 100 })
      addField({ name: 'tool_kind', type: 'text', max: 20 })
      addField({ name: 'source', type: 'text', max: 20 })
      addField({ name: 'run_id', type: 'text', max: 60 })
      addField({ name: 'status', type: 'text', max: 20 })
      addField({ name: 'latency_ms', type: 'number' })
      addField({ name: 'input_summary', type: 'text', max: 500 })
      addField({ name: 'output_excerpt', type: 'text', max: 1000 })
      addField({ name: 'error_code', type: 'text', max: 100 })
      addField({ name: 'retried', type: 'bool' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("tool_invocations collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "tool_invocations",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 100 },
          { name: 'tool_name', type: 'text', required: true, max: 100 },
          { name: 'tool_kind', type: 'text', max: 20 },
          { name: 'source', type: 'text', max: 20 },
          { name: 'run_id', type: 'text', max: 60 },
          { name: 'status', type: 'text', max: 20 },
          { name: 'latency_ms', type: 'number' },
          { name: 'input_summary', type: 'text', max: 500 },
          { name: 'output_excerpt', type: 'text', max: 1000 },
          { name: 'error_code', type: 'text', max: 100 },
          { name: 'retried', type: 'bool' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("tool_invocations collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("tool_invocations bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/tool_invocations  body 字段: rh_user_id, tool_name, tool_kind, source, run_id, status, latency_ms, input_summary, output_excerpt, error_code, retried
routerAdd("POST", "/api/tool_invocations", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("tool_invocations") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "tool_invocations",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 100 },
          { name: 'tool_name', type: 'text', required: true, max: 100 },
          { name: 'tool_kind', type: 'text', max: 20 },
          { name: 'source', type: 'text', max: 20 },
          { name: 'run_id', type: 'text', max: 60 },
          { name: 'status', type: 'text', max: 20 },
          { name: 'latency_ms', type: 'number' },
          { name: 'input_summary', type: 'text', max: 500 },
          { name: 'output_excerpt', type: 'text', max: 1000 },
          { name: 'error_code', type: 'text', max: 100 },
          { name: 'retried', type: 'bool' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("tool_invocations")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("tool_name", body.tool_name === undefined || body.tool_name === null ? "" : String(body.tool_name))
    rec.set("tool_kind", body.tool_kind === undefined || body.tool_kind === null ? "" : String(body.tool_kind))
    rec.set("source", body.source === undefined || body.source === null ? "" : String(body.source))
    rec.set("run_id", body.run_id === undefined || body.run_id === null ? "" : String(body.run_id))
    rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    rec.set("latency_ms", (body.latency_ms === undefined || body.latency_ms === null) ? 0 : Number(body.latency_ms))
    rec.set("input_summary", body.input_summary === undefined || body.input_summary === null ? "" : String(body.input_summary))
    rec.set("output_excerpt", body.output_excerpt === undefined || body.output_excerpt === null ? "" : String(body.output_excerpt))
    rec.set("error_code", body.error_code === undefined || body.error_code === null ? "" : String(body.error_code))
    rec.set("retried", !!body.retried)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("tool_invocations create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/tool_invocations/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/tool_invocations/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("tool_invocations", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("tool_name" in body) rec.set("tool_name", body.tool_name === undefined || body.tool_name === null ? "" : String(body.tool_name))
    if ("tool_kind" in body) rec.set("tool_kind", body.tool_kind === undefined || body.tool_kind === null ? "" : String(body.tool_kind))
    if ("source" in body) rec.set("source", body.source === undefined || body.source === null ? "" : String(body.source))
    if ("run_id" in body) rec.set("run_id", body.run_id === undefined || body.run_id === null ? "" : String(body.run_id))
    if ("status" in body) rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    if ("latency_ms" in body) rec.set("latency_ms", (body.latency_ms === undefined || body.latency_ms === null) ? 0 : Number(body.latency_ms))
    if ("input_summary" in body) rec.set("input_summary", body.input_summary === undefined || body.input_summary === null ? "" : String(body.input_summary))
    if ("output_excerpt" in body) rec.set("output_excerpt", body.output_excerpt === undefined || body.output_excerpt === null ? "" : String(body.output_excerpt))
    if ("error_code" in body) rec.set("error_code", body.error_code === undefined || body.error_code === null ? "" : String(body.error_code))
    if ("retried" in body) rec.set("retried", !!body.retried)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/tool_invocations/{id}
routerAdd("DELETE", "/api/tool_invocations/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("tool_invocations", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
