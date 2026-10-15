/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/spec_versions.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, spec_id:text, version_no:number, spec_snapshot:json, config_snapshot:json, note:text, test_run_id:text, test_passed:bool, status:text, published_at:date
// 路由: create,update,delete
// list filter 字段: rh_user_id,spec_id
// list 默认排序: -version_no

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("spec_versions") } catch (_) { existing = null }
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
      addField({ name: 'spec_id', type: 'text', required: true, max: 64 })
      addField({ name: 'version_no', type: 'number', required: true })
      addField({ name: 'spec_snapshot', type: 'json' })
      addField({ name: 'config_snapshot', type: 'json' })
      addField({ name: 'note', type: 'text', max: 500 })
      addField({ name: 'test_run_id', type: 'text', max: 64 })
      addField({ name: 'test_passed', type: 'bool' })
      addField({ name: 'status', type: 'text', max: 20 })
      addField({ name: 'published_at', type: 'date' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("spec_versions collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "spec_versions",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'spec_id', type: 'text', required: true, max: 64 },
          { name: 'version_no', type: 'number', required: true },
          { name: 'spec_snapshot', type: 'json' },
          { name: 'config_snapshot', type: 'json' },
          { name: 'note', type: 'text', max: 500 },
          { name: 'test_run_id', type: 'text', max: 64 },
          { name: 'test_passed', type: 'bool' },
          { name: 'status', type: 'text', max: 20 },
          { name: 'published_at', type: 'date' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("spec_versions collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("spec_versions bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/spec_versions  body 字段: rh_user_id, spec_id, version_no, spec_snapshot, config_snapshot, note, test_run_id, test_passed, status, published_at
routerAdd("POST", "/api/spec_versions", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("spec_versions") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "spec_versions",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'spec_id', type: 'text', required: true, max: 64 },
          { name: 'version_no', type: 'number', required: true },
          { name: 'spec_snapshot', type: 'json' },
          { name: 'config_snapshot', type: 'json' },
          { name: 'note', type: 'text', max: 500 },
          { name: 'test_run_id', type: 'text', max: 64 },
          { name: 'test_passed', type: 'bool' },
          { name: 'status', type: 'text', max: 20 },
          { name: 'published_at', type: 'date' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("spec_versions")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("spec_id", body.spec_id === undefined || body.spec_id === null ? "" : String(body.spec_id))
    rec.set("version_no", (body.version_no === undefined || body.version_no === null) ? 0 : Number(body.version_no))
    rec.set("spec_snapshot", body.spec_snapshot)
    rec.set("config_snapshot", body.config_snapshot)
    rec.set("note", body.note === undefined || body.note === null ? "" : String(body.note))
    rec.set("test_run_id", body.test_run_id === undefined || body.test_run_id === null ? "" : String(body.test_run_id))
    rec.set("test_passed", !!body.test_passed)
    rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    rec.set("published_at", body.published_at === undefined || body.published_at === null ? "" : String(body.published_at))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("spec_versions create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/spec_versions/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/spec_versions/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("spec_versions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("spec_id" in body) rec.set("spec_id", body.spec_id === undefined || body.spec_id === null ? "" : String(body.spec_id))
    if ("version_no" in body) rec.set("version_no", (body.version_no === undefined || body.version_no === null) ? 0 : Number(body.version_no))
    if ("spec_snapshot" in body) rec.set("spec_snapshot", body.spec_snapshot)
    if ("config_snapshot" in body) rec.set("config_snapshot", body.config_snapshot)
    if ("note" in body) rec.set("note", body.note === undefined || body.note === null ? "" : String(body.note))
    if ("test_run_id" in body) rec.set("test_run_id", body.test_run_id === undefined || body.test_run_id === null ? "" : String(body.test_run_id))
    if ("test_passed" in body) rec.set("test_passed", !!body.test_passed)
    if ("status" in body) rec.set("status", body.status === undefined || body.status === null ? "" : String(body.status))
    if ("published_at" in body) rec.set("published_at", body.published_at === undefined || body.published_at === null ? "" : String(body.published_at))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/spec_versions/{id}
routerAdd("DELETE", "/api/spec_versions/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("spec_versions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
