/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/agent_memories.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, spec_id:text, fact:text, tools_used:text, run_id:text, kind:text
// 路由: list
// list filter 字段: rh_user_id,spec_id
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("agent_memories") } catch (_) { existing = null }
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
      addField({ name: 'rh_user_id', type: 'text', required: true, max: 60 })
      addField({ name: 'spec_id', type: 'text', max: 60 })
      addField({ name: 'fact', type: 'text', max: 600 })
      addField({ name: 'tools_used', type: 'text', max: 300 })
      addField({ name: 'run_id', type: 'text', max: 60 })
      addField({ name: 'kind', type: 'text', max: 20 })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("agent_memories collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "agent_memories",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 60 },
          { name: 'spec_id', type: 'text', max: 60 },
          { name: 'fact', type: 'text', max: 600 },
          { name: 'tools_used', type: 'text', max: 300 },
          { name: 'run_id', type: 'text', max: 60 },
          { name: 'kind', type: 'text', max: 20 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("agent_memories collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("agent_memories bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/agent_memories?page=1&perPage=50&sort=-created&rh_user_id=...&spec_id=...
routerAdd("GET", "/api/agent_memories", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("agent_memories") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "agent_memories",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', required: true, max: 60 },
          { name: 'spec_id', type: 'text', max: 60 },
          { name: 'fact', type: 'text', max: 600 },
          { name: 'tools_used', type: 'text', max: 300 },
          { name: 'run_id', type: 'text', max: 60 },
          { name: 'kind', type: 'text', max: 20 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("agent_memories")
  }
  try {
    ensureCollLocal()
    var info = e.requestInfo()
    var query = info.query || {}
    var page = parseInt(String(query.page || "1"), 10) || 1
    var perPage = parseInt(String(query.perPage || "50"), 10) || 50
    if (perPage > 200) perPage = 200
    var sort = String(query.sort || "-created")
    var filterParts = []
    var params = {}
    if (query.rh_user_id !== undefined && query.rh_user_id !== "") {
      filterParts.push("rh_user_id = {:rh_user_id}")
      params.rh_user_id = String(query.rh_user_id)
    }
    if (query.spec_id !== undefined && query.spec_id !== "") {
      filterParts.push("spec_id = {:spec_id}")
      params.spec_id = String(query.spec_id)
    }
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("agent_memories", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("agent_memories", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("agent_memories list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
