/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/agent_specs.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, name:text, spec:json, source:text, template_key:text
// 路由: list,get,create,update,delete
// list filter 字段: rh_user_id,source
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("agent_specs") } catch (_) { existing = null }
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
      addField({ name: 'rh_user_id', type: 'text', max: 64 })
      addField({ name: 'name', type: 'text', max: 120 })
      addField({ name: 'spec', type: 'json' })
      addField({ name: 'source', type: 'text', max: 20 })
      addField({ name: 'template_key', type: 'text', max: 40 })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("agent_specs collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "agent_specs",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', max: 64 },
          { name: 'name', type: 'text', max: 120 },
          { name: 'spec', type: 'json' },
          { name: 'source', type: 'text', max: 20 },
          { name: 'template_key', type: 'text', max: 40 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("agent_specs collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("agent_specs bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/agent_specs?page=1&perPage=50&sort=-created&rh_user_id=...&source=...
routerAdd("GET", "/api/agent_specs", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("agent_specs") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "agent_specs",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', max: 64 },
          { name: 'name', type: 'text', max: 120 },
          { name: 'spec', type: 'json' },
          { name: 'source', type: 'text', max: 20 },
          { name: 'template_key', type: 'text', max: 40 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("agent_specs")
  }
  try {
    ensureCollLocal()
    var info = e.requestInfo()
    var query = info.query || {}
    var page = parseInt(String(query.page || "1"), 10) || 1
    var perPage = parseInt(String(query.perPage || "50"), 10) || 50
    if (perPage > 200) perPage = 200
    var sort = String(query.sort || "-created")
    var filterParts = ["rh_user_id = {:owner_uid}"]
    var params = { owner_uid: uid }
    if (query.source !== undefined && query.source !== "") {
      filterParts.push("source = {:source}")
      params.source = String(query.source)
    }
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("agent_specs", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("agent_specs", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("agent_specs list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// GET /api/agent_specs/{id}
routerAdd("GET", "/api/agent_specs/{id}", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("agent_specs", id) } catch (_) { rec = null }
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "not_found" })
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "get_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// POST /api/agent_specs  body 字段: rh_user_id, name, spec, source, template_key
routerAdd("POST", "/api/agent_specs", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("agent_specs") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "agent_specs",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', max: 64 },
          { name: 'name', type: 'text', max: 120 },
          { name: 'spec', type: 'json' },
          { name: 'source', type: 'text', max: 20 },
          { name: 'template_key', type: 'text', max: 40 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("agent_specs")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("rh_user_id", uid)
    rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
    rec.set("spec", body.spec)
    rec.set("source", body.source === undefined || body.source === null ? "" : String(body.source))
    rec.set("template_key", body.template_key === undefined || body.template_key === null ? "" : String(body.template_key))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("agent_specs create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/agent_specs/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/agent_specs/{id}", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var body = (e.requestInfo() || {}).body || {}
    var result = null
    var helper = require(__hooks + "/modules/agent_collab.js")
    var history = require(__hooks + "/modules/agent_collab_history.js")
    $app.runInTransaction(function(tx) {
      var rec = null
      try { rec = tx.findRecordById("agent_specs", id) } catch (_) { rec = null }
      if (!rec || String(rec.get("rh_user_id") || "") !== uid)
        helper.fail("not_found",404)
      var previous = helper.decode(rec)
      var oldHash = helper.digest(previous)
      // Optional optimistic fence for future Owner editor clients. Current
      // existing clients remain backward compatible if no hash is supplied.
      if (body.expected_current_hash !== undefined) {
        var expected = String(body.expected_current_hash || "")
        if (!/^[a-f0-9]{64}$/i.test(expected))
          helper.fail("invalid_expected_hash",400)
        if (expected !== oldHash) helper.fail("collab_version_conflict",409)
      }
      // The database owner is immutable. No employee can patch another
      // employee's Agent merely by passing rh_user_id in the request.
      if ("name" in body) rec.set("name", body.name === undefined || body.name === null ? "" : String(body.name))
      if ("spec" in body) rec.set("spec", body.spec)
      if ("source" in body) rec.set("source", body.source === undefined || body.source === null ? "" : String(body.source))
      if ("template_key" in body) rec.set("template_key", body.template_key === undefined || body.template_key === null ? "" : String(body.template_key))
      var current = helper.decode(rec)
      var changed = "spec" in body && helper.digest(current) !== oldHash
      if (changed) {
        // Keep safe text only; use direct provenance because this is not an
        // editor proposal or a new approval.
        history.record(tx,{specId:id,ownerId:uid,actorId:uid,
          kind:"before_accept",entryType:"direct",spec:previous,
          note:"所有者直接修改前的描述/规划版本"})
      }
      tx.save(rec)
      if (changed) {
        history.record(tx,{specId:id,ownerId:uid,actorId:uid,
          kind:"accepted",entryType:"direct",spec:current,
          note:"所有者直接修改 Agent 配置后"})
        // Owner changes render any pending collaborator draft stale. Explicitly
        // reject them so they cannot be reviewed accidentally after an ABA.
        tx.db().newQuery(
          "UPDATE agent_studio_spec_proposals SET status='rejected',"+
          "reviewed_ms={:now},reviewer_uid={:owner} "+
          "WHERE spec_id={:spec} AND owner_uid={:owner} AND status='pending'"
        ).bind({now:new Date().getTime(),owner:uid,spec:id}).execute()
      }
      result = rec.publicExport()
    })
    return e.json(200, result)
  } catch (err) {
    if(err&&err.httpStatus)
      return e.json(err.httpStatus,{error:String(err.code||"update_failed")})
    try{$app.logger().error("agent_specs owner update failed","error",String(err))}catch(_){}
    return e.json(500,{error:"update_failed"})
  }
})
// DELETE /api/agent_specs/{id}
routerAdd("DELETE", "/api/agent_specs/{id}", function (e) {
  var _headers = (e.requestInfo() || {}).headers || {}
  var uid = String(_headers["x_rh_user_id"] || _headers["X-Rh-User-Id"] || _headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
  if (!uid) return e.json(401, { error: "rh_login_required", message: "Authentication required" })

  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("agent_specs", id) } catch (_) { rec = null }
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
