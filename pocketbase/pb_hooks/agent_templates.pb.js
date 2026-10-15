/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/agent_templates.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: rh_user_id:text, name:text, description:text, category:text, spec:json, source_spec_id:text, built_in:bool, public:bool, use_count:number
// 路由: list
// list filter 字段: rh_user_id
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("agent_templates") } catch (_) { existing = null }
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
      addField({ name: 'description', type: 'text', max: 300 })
      addField({ name: 'category', type: 'text', max: 20 })
      addField({ name: 'spec', type: 'json' })
      addField({ name: 'source_spec_id', type: 'text', max: 40 })
      addField({ name: 'built_in', type: 'bool' })
      addField({ name: 'public', type: 'bool' })
      addField({ name: 'use_count', type: 'number' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("agent_templates collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "agent_templates",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'rh_user_id', type: 'text', max: 64 },
          { name: 'name', type: 'text', max: 120 },
          { name: 'description', type: 'text', max: 300 },
          { name: 'category', type: 'text', max: 20 },
          { name: 'spec', type: 'json' },
          { name: 'source_spec_id', type: 'text', max: 40 },
          { name: 'built_in', type: 'bool' },
          { name: 'public', type: 'bool' },
          { name: 'use_count', type: 'number' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("agent_templates collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("agent_templates bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/agent_templates?page=1&perPage=50&sort=-created&rh_user_id=...
routerAdd("GET", "/api/agent_templates", function (e) {
  // Direct collection mutation bypasses the authorization workflow; use the dedicated business API instead.
  return e.json(403, { error: "direct_collection_api_disabled", message: "Use the authorized business API" })

  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("agent_templates") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "agent_templates",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'rh_user_id', type: 'text', max: 64 },
          { name: 'name', type: 'text', max: 120 },
          { name: 'description', type: 'text', max: 300 },
          { name: 'category', type: 'text', max: 20 },
          { name: 'spec', type: 'json' },
          { name: 'source_spec_id', type: 'text', max: 40 },
          { name: 'built_in', type: 'bool' },
          { name: 'public', type: 'bool' },
          { name: 'use_count', type: 'number' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("agent_templates")
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
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("agent_templates", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("agent_templates", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("agent_templates list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
