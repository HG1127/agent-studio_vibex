/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/integration_tokens.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, agent_id:text, kind:text, name:text, token_hash:text, token_tail:text, enabled:bool, theme:json
// 路由: create,update,delete
// list filter 字段: (none)
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("integration_tokens") } catch (_) { existing = null }
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
      addField({ name: 'agent_id', type: 'text', required: true, max: 64 })
      addField({ name: 'kind', type: 'text', required: true, max: 10 })
      addField({ name: 'name', type: 'text', max: 100 })
      addField({ name: 'token_hash', type: 'text', required: true })
      addField({ name: 'token_tail', type: 'text', max: 8 })
      addField({ name: 'enabled', type: 'bool' })
      addField({ name: 'theme', type: 'json' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("integration_tokens collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "integration_tokens",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'agent_id', type: 'text', required: true, max: 64 },
          { name: 'kind', type: 'text', required: true, max: 10 },
          { name: 'name', type: 'text', max: 100 },
          { name: 'token_hash', type: 'text', required: true },
          { name: 'token_tail', type: 'text', max: 8 },
          { name: 'enabled', type: 'bool' },
          { name: 'theme', type: 'json' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("integration_tokens collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("integration_tokens bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// POST /api/integration_tokens  body 字段: rh_user_id, agent_id, kind, name, token_hash, token_tail, enabled, theme
routerAdd("POST", "/api/integration_tokens", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("integration_tokens") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "integration_tokens",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 64 },
          { name: 'agent_id', type: 'text', required: true, max: 64 },
          { name: 'kind', type: 'text', required: true, max: 10 },
          { name: 'name', type: 'text', max: 100 },
          { name: 'token_hash', type: 'text', required: true },
          { name: 'token_tail', type: 'text', max: 8 },
          { name: 'enabled', type: 'bool' },
          { name: 'theme', type: 'json' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("integration_tokens")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    rec.set("agent_id", body.agent_id === undefined || body.agent_id === null ? "" : String(body.agent_id))
    rec.set("kind", body.kind === undefined || body.kind === null ? "" : String(body.kind))
    rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    rec.set("token_hash", body.token_hash === undefined || body.token_hash === null ? "" : String(body.token_hash))
    rec.set("token_tail", body.token_tail === undefined || body.token_tail === null ? "" : String(body.token_tail))
    rec.set("enabled", !!body.enabled)
    rec.set("theme", body.theme)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("integration_tokens create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/integration_tokens/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/integration_tokens/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("integration_tokens", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("rh_user_id" in body) rec.set("rh_user_id", body.rh_user_id === undefined || body.rh_user_id === null ? "" : String(body.rh_user_id))
    if ("agent_id" in body) rec.set("agent_id", body.agent_id === undefined || body.agent_id === null ? "" : String(body.agent_id))
    if ("kind" in body) rec.set("kind", body.kind === undefined || body.kind === null ? "" : String(body.kind))
    if ("name" in body) rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    if ("token_hash" in body) rec.set("token_hash", body.token_hash === undefined || body.token_hash === null ? "" : String(body.token_hash))
    if ("token_tail" in body) rec.set("token_tail", body.token_tail === undefined || body.token_tail === null ? "" : String(body.token_tail))
    if ("enabled" in body) rec.set("enabled", !!body.enabled)
    if ("theme" in body) rec.set("theme", body.theme)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/integration_tokens/{id}
routerAdd("DELETE", "/api/integration_tokens/{id}", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("integration_tokens", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
