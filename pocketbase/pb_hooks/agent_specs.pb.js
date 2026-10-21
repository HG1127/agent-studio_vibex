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
    // Index creation must run AFTER the physical collection table exists.
    // Standalone onBootstrap hooks had race/order dependencies on a fresh DB.
    var catalogIndexes=[
      "CREATE INDEX IF NOT EXISTS idx_agent_catalog_owner_updated "+
        "ON agent_specs(rh_user_id,updated DESC,id DESC)",
      "CREATE INDEX IF NOT EXISTS idx_agent_catalog_owner_name "+
        "ON agent_specs(rh_user_id,name COLLATE NOCASE,id)",
      "CREATE INDEX IF NOT EXISTS idx_agent_catalog_owner_source "+
        "ON agent_specs(rh_user_id,source,updated DESC)"
    ]
    for(var ci=0;ci<catalogIndexes.length;ci++){
      $app.db().newQuery(catalogIndexes[ci]).execute()
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
    var page = Math.min(10000, Math.max(1, parseInt(String(query.page || "1"), 10) || 1))
    var perPage = Math.min(200, Math.max(1, parseInt(String(query.perPage || "50"), 10) || 50))
    var search = String(query.q || "").trim().slice(0, 100)
    var favoritesOnly = String(query.favorite || "") === "1"
    var sortInput = String(query.sort || "-created")
    // Never concatenate caller input into ORDER BY or SQL filter expressions.
    var orders = {
      "-created":"s.created DESC,s.id DESC",
      "-updated":"s.updated DESC,s.id DESC",
      "updated_desc":"s.updated DESC,s.id DESC",
      "created_desc":"s.created DESC,s.id DESC",
      "name_asc":"s.name COLLATE NOCASE ASC,s.id ASC",
      "name_desc":"s.name COLLATE NOCASE DESC,s.id DESC",
      "favorite_desc":"favorite DESC,s.updated DESC,s.id DESC"
    }
    var orderSql = orders[sortInput] || orders["-created"]
    var where = " WHERE s.rh_user_id={:owner}"
    var params = {owner:uid}
    if (query.source !== undefined && String(query.source) !== "" && String(query.source) !== "all") {
      where += " AND s.source={:source}"
      params.source = String(query.source).slice(0, 20)
    }
    if(search){
      // LIKE escapes % and _ rather than letting a search box become a wildcard.
      var safeSearch = search.replace(/[!%_]/g,function(ch){return "!"+ch})
      where += " AND (LOWER(s.name) LIKE {:q} ESCAPE '!' OR LOWER(CAST(s.spec AS TEXT)) LIKE {:q} ESCAPE '!')"
      params.q = "%" + safeSearch.toLowerCase() + "%"
    }
    if(favoritesOnly) where += " AND f.spec_id IS NOT NULL"
    var sqlFrom = " FROM agent_specs s LEFT JOIN agent_spec_favorites f " +
      "ON f.spec_id=s.id AND f.owner_uid=s.rh_user_id" + where
    var totalRow = new DynamicModel({total:0})
    $app.db().newQuery("SELECT COUNT(*) AS total"+sqlFrom).bind(params).one(totalRow)
    var rows = arrayOf(new DynamicModel({id:"",favorite:0}))
    var listParams = {}
    for(var k in params) listParams[k] = params[k]
    listParams.limit = perPage
    listParams.offset = (page - 1) * perPage
    $app.db().newQuery(
      "SELECT s.id AS id, CASE WHEN f.spec_id IS NULL THEN 0 ELSE 1 END AS favorite"+
      sqlFrom+" ORDER BY "+orderSql+" LIMIT {:limit} OFFSET {:offset}"
    ).bind(listParams).all(rows)
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var rec = null
      try { rec = $app.findRecordById("agent_specs",String(rows[i].id)) } catch (_) {}
      if(!rec || String(rec.get("rh_user_id") || "") !== uid) continue
      var item = rec.publicExport()
      item.favorite = Number(rows[i].favorite) === 1
      items.push(item)
    }
    return e.json(200, {
      items:items,page:page,perPage:perPage,
      totalItems:Number(totalRow.total||0),
      totalPages:Math.max(1,Math.ceil(Number(totalRow.total||0)/perPage)),
    })
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
    var roleShapeErrors = require(__hooks + "/modules/agent_roles.js").shapeErrors((body.spec || {}).roles)
    if (roleShapeErrors.length) return e.json(400, { error: "invalid_agent_roles", message: roleShapeErrors.join("；") })
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
      // Owner editor may supply its last known server timestamp; stale tabs
      // must not silently overwrite newer changes by collaborators.
      if (body.expected_updated !== undefined) {
        var expectedUpdated = String(body.expected_updated || "")
        if (!expectedUpdated || expectedUpdated.length > 80)
          helper.fail("invalid_expected_updated",400)
        if (expectedUpdated !== String(rec.getString("updated") || ""))
          helper.fail("spec_updated_conflict",409)
      }
      var previous = helper.decode(rec)
      if ("spec" in body && body.spec && typeof body.spec === "object" && !Array.isArray(body.spec)) {
        // An older editor has no role field. Preserve role scopes unless the
        // caller explicitly submits roles: [] to switch to a single assistant.
        if (body.spec.roles === undefined && previous.roles !== undefined)
          body.spec.roles = previous.roles
        if (body.spec.capability_requirements === undefined && previous.capability_requirements !== undefined)
          body.spec.capability_requirements = previous.capability_requirements
        var roleErrors = require(__hooks + "/modules/agent_roles.js").shapeErrors(body.spec.roles)
        if (roleErrors.length) {
          var roleError = new Error(roleErrors.join("；"))
          roleError.code = "invalid_agent_roles"; roleError.httpStatus = 400
          throw roleError
        }
      }
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
      var optimizationOrigin=null
      var feedbackHash=""
      var changedKeys=[]
      if(body.optimization_context!==undefined){
        if(!changed || body.expected_updated===undefined)
          helper.fail("optimization_requires_changed_spec_and_revision",409)
        var fromId=String((body.optimization_context||{}).source_run_id||"")
        if(!/^[A-Za-z0-9]{15}$/.test(fromId))
          helper.fail("invalid_optimization_source",400)
        var from=null
        try{from=tx.findRecordById("agent_runs",fromId)}catch(_){}
        if(!from || String(from.get("rh_user_id")||"")!==uid ||
          String(from.get("spec_id")||"")!==String(id))
          helper.fail("optimization_source_not_found",404)
        var feedback=null
        try{feedback=JSON.parse(from.getString("feedback")||"null")}catch(_){}
        if(!feedback || (feedback.rating!=="up" && feedback.rating!=="down"))
          helper.fail("optimization_feedback_required",409)
        feedbackHash=String($security.sha256(JSON.stringify(feedback)))
        optimizationOrigin=fromId
        var tracked=[
          "goal","task_scope","deliverables","task_plan","done_criteria",
          "tools","knowledge_base_ids","require_plan_review","require_approval","roles","capability_requirements"
        ]
        for(var ci=0;ci<tracked.length;ci++){
          var key=tracked[ci]
          if(JSON.stringify(previous[key]===undefined?null:previous[key]) !==
             JSON.stringify(current[key]===undefined?null:current[key]))
            changedKeys.push(key)
        }
        // This is an explicit feedback-driven change, not an inference
        // based merely on adjacent timestamps or similar wording.
        if(!changedKeys.length)helper.fail("no_trackable_optimization_change",409)
      }
      if (changed) {
        // Keep safe text only; use direct provenance because this is not an
        // editor proposal or a new approval.
        history.record(tx,{specId:id,ownerId:uid,actorId:uid,
          kind:"before_accept",entryType:"direct",spec:previous,
          note:"所有者直接修改前的描述/规划版本"})
      }
      tx.save(rec)
      if (changed) {
        var acceptedRevisionId=history.record(tx,{specId:id,ownerId:uid,actorId:uid,
          kind:"accepted",entryType:"direct",spec:current,
          note:optimizationOrigin?"已确认反馈驱动的 Agent 方案调整":"所有者直接修改 Agent 配置后"})
        if(optimizationOrigin){
          var auditId=$security.randomString(15)
          tx.db().newQuery(
            "INSERT INTO agent_optimization_lineage "+
            "(id,owner_uid,spec_id,source_run_id,before_hash,after_hash,"+
            "feedback_hash,changed_keys_json,accepted_revision_id,created_ms) "+
            "VALUES({:id},{:owner},{:spec},{:source},{:before},{:after},"+
            "{:feedback},{:keys},{:revision},{:now})"
          ).bind({
            id:auditId,owner:uid,spec:id,source:optimizationOrigin,
            before:oldHash,after:helper.digest(current),
            feedback:feedbackHash,keys:JSON.stringify(changedKeys),
            revision:acceptedRevisionId,now:Date.now(),
          }).execute()
          result={optimization_lineage_id:auditId}
        }
        // Owner changes render any pending collaborator draft stale. Explicitly
        // reject them so they cannot be reviewed accidentally after an ABA.
        tx.db().newQuery(
          "UPDATE agent_studio_spec_proposals SET status='rejected',"+
          "reviewed_ms={:now},reviewer_uid={:owner} "+
          "WHERE spec_id={:spec} AND owner_uid={:owner} AND status='pending'"
        ).bind({now:new Date().getTime(),owner:uid,spec:id}).execute()
      }
      var updatedRecord=rec.publicExport()
      result=result?Object.assign(updatedRecord,result):updatedRecord
    })
    return e.json(200, result)
  } catch (err) {
    if(err&&err.httpStatus)
      return e.json(err.httpStatus,{error:String(err.code||"update_failed"),
        message:err.code === "invalid_agent_roles" ? String(err.message) : undefined})
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
    try{$app.db().newQuery(
      "DELETE FROM agent_spec_favorites WHERE owner_uid={:uid} AND spec_id={:id}"
    ).bind({uid:uid,id:id}).execute()}catch(_){}
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
