// Knowledge-base API: tenant-isolated SQL storage, text ingestion and cited lexical retrieval.
// This is deliberately an honest first-stage full-text index (not a vector embedding service).
// PocketBase Goja callbacks remain self-contained; no browser session is required for retrieval.
onBootstrap(function (e) {
  e.next()
  try {
    require(__hooks + "/modules/knowledge_schema.js").applyKnowledgeMigrations($app)
  } catch (err) {
    try { $app.logger().error("knowledge schema migration failed", "err", String((err && err.message) || err)) } catch (_) {}
    // Migration status must be verified during deployment; legacy tables could still serve requests.
  }
})
// Returns only the caller's bases, with real document and chunk counts.
routerAdd("GET", "/api/knowledge-bases", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var rows = arrayOf(new DynamicModel({
      id: "", name: "", description: "", created_ms: 0, updated_ms: 0,
      document_count: 0, chunk_count: 0,
    }))
    $app.db().newQuery(
      "SELECT b.id,b.name,b.description,b.created_ms,b.updated_ms," +
      "(SELECT COUNT(*) FROM agent_studio_kb_documents d WHERE d.base_id=b.id AND d.rh_user_id=b.rh_user_id) AS document_count," +
      "(SELECT COUNT(*) FROM agent_studio_kb_chunks c WHERE c.base_id=b.id AND c.rh_user_id=b.rh_user_id) AS chunk_count " +
      "FROM agent_studio_kb_bases b WHERE b.rh_user_id={:uid} ORDER BY b.updated_ms DESC LIMIT 100"
    ).bind({ uid: uid }).all(rows)
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]
      items.push({ id: String(r.id), name: String(r.name), description: String(r.description),
        created_ms: Number(r.created_ms), updated_ms: Number(r.updated_ms),
        document_count: Number(r.document_count), chunk_count: Number(r.chunk_count),
        access_role:"owner",owner_uid:uid,owner_name:"我" })
    }
    // Explicit staff sharing does not transfer ownership.
    var shared=require(__hooks+"/modules/knowledge_acl.js").listShared($app,uid)
    for(var si=0;si<shared.length;si++)items.push(shared[si])
    return e.json(200, { items: items })
  } catch (err) {
    try { $app.logger().error("knowledge list error", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "knowledge_list_failed" })
  }
})

routerAdd("POST", "/api/knowledge-bases/manage", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var body = (e.requestInfo() || {}).body || {}
    var action = String(body.action || "")
    var now = new Date().getTime()
    if (action === "create") {
      var name = String(body.name || "").trim()
      var description = String(body.description || "").trim()
      if (!name || name.length > 100 || description.length > 1000) return e.json(400, { error: "invalid_base_fields" })
      var id = $security.randomString(15)
      // Enforce per-owner quota and write atomically under a single SQLite writer.
      $app.runInTransaction(function (txApp) {
        var count = new DynamicModel({ total: 0 })
        txApp.db().newQuery("SELECT COUNT(*) AS total FROM agent_studio_kb_bases WHERE rh_user_id={:uid}")
          .bind({ uid: uid }).one(count)
        if (Number(count.total) >= 50) throw new Error("knowledge_limit")
        txApp.db().newQuery(
          "INSERT INTO agent_studio_kb_bases(id,rh_user_id,name,description,created_ms,updated_ms) " +
          "VALUES({:id},{:uid},{:name},{:desc},{:now},{:now})"
        ).bind({ id: id, uid: uid, name: name, desc: description, now: now }).execute()
      })
      return e.json(200, { ok: true, id: id })
    }
    var baseId = String(body.id || "").trim()
    if (!/^[A-Za-z0-9]{15}$/.test(baseId)) return e.json(400, { error: "invalid_base_id" })
    if (action === "update") {
      var updatedName = String(body.name || "").trim()
      var updatedDesc = String(body.description || "").trim()
      if (!updatedName || updatedName.length > 100 || updatedDesc.length > 1000) return e.json(400, { error: "invalid_base_fields" })
      var updated = $app.db().newQuery(
        "UPDATE agent_studio_kb_bases SET name={:name},description={:desc},updated_ms={:now} " +
        "WHERE id={:id} AND rh_user_id={:uid}"
      ).bind({ name: updatedName, desc: updatedDesc, now: now, id: baseId, uid: uid }).execute()
      if (Number(updated.rowsAffected()) !== 1) return e.json(404, { error: "base_not_found" })
      return e.json(200, { ok: true, id: baseId })
    }
    if (action === "delete") {
      $app.runInTransaction(function (txApp) {
        var removed = txApp.db().newQuery(
          "DELETE FROM agent_studio_kb_bases WHERE id={:id} AND rh_user_id={:uid}"
        ).bind({ id: baseId, uid: uid }).execute()
        if (Number(removed.rowsAffected()) !== 1) throw new Error("base_not_found")
        // Explicit cleanup is safe even before cascade triggers have been installed.
        txApp.db().newQuery("DELETE FROM agent_studio_kb_chunks WHERE base_id={:id} AND rh_user_id={:uid}")
          .bind({ id: baseId, uid: uid }).execute()
        txApp.db().newQuery("DELETE FROM agent_studio_kb_documents WHERE base_id={:id} AND rh_user_id={:uid}")
          .bind({ id: baseId, uid: uid }).execute()
      })
      return e.json(200, { ok: true, deleted: true })
    }
    return e.json(400, { error: "unknown_action" })
  } catch (err) {
    var code = String((err && err.message) || err)
    if (code === "base_not_found") return e.json(404, { error: code })
    if (code === "knowledge_limit") return e.json(429, { error: code, message: "每个账号最多创建50个知识库" })
    try { $app.logger().error("knowledge manage error", "err", code) } catch (_) {}
    return e.json(500, { error: "knowledge_manage_failed" })
  }
})
routerAdd("GET", "/api/knowledge-bases/documents", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var baseId = String(((e.requestInfo() || {}).query || {}).base_id || "")
    if (!/^[A-Za-z0-9]{15}$/.test(baseId)) return e.json(400, { error: "invalid_base_id" })
    var access=require(__hooks+"/modules/knowledge_acl.js").resolve($app,uid,baseId,"viewer")
    var ownerUid=access.owner_uid
    var rows = arrayOf(new DynamicModel({ id: "", filename: "", size_chars: 0, chunk_count: 0, created_ms: 0 }))
    $app.db().newQuery(
      "SELECT id,filename,size_chars,chunk_count,created_ms FROM agent_studio_kb_documents " +
      "WHERE base_id={:bid} AND rh_user_id={:uid} ORDER BY created_ms DESC LIMIT 100"
    ).bind({ bid: baseId, uid: ownerUid }).all(rows)
    var items = []
    for (var i = 0; i < rows.length; i++) items.push({
      id: String(rows[i].id), filename: String(rows[i].filename),
      size_chars: Number(rows[i].size_chars), chunk_count: Number(rows[i].chunk_count),
      created_ms: Number(rows[i].created_ms),
    })
    return e.json(200, { items: items })
  } catch (err) {
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"base_not_found")})
    try { $app.logger().error("knowledge documents list error", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "knowledge_documents_failed" })
  }
})

routerAdd("POST", "/api/knowledge-bases/documents", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var body = (e.requestInfo() || {}).body || {}
    var action = String(body.action || "")
    var baseId = String(body.base_id || "")
    if (!/^[A-Za-z0-9]{15}$/.test(baseId)) return e.json(400, { error: "invalid_base_id" })
    var acl=require(__hooks+"/modules/knowledge_acl.js")
    var ownerUid=acl.resolve($app,uid,baseId,"editor").owner_uid
    if (action === "delete") {
      var docId = String(body.document_id || "")
      if (!/^[A-Za-z0-9]{15}$/.test(docId)) return e.json(400, { error: "invalid_document_id" })
      $app.runInTransaction(function (txApp) {
        acl.resolve(txApp,uid,baseId,"editor")
        var removed = txApp.db().newQuery(
          "DELETE FROM agent_studio_kb_documents WHERE id={:did} AND base_id={:bid} AND rh_user_id={:uid} " +
          "AND EXISTS (SELECT 1 FROM agent_studio_kb_bases WHERE id={:bid} AND rh_user_id={:uid})"
        ).bind({ did: docId, bid: baseId, uid: ownerUid }).execute()
        if (Number(removed.rowsAffected()) !== 1) throw new Error("document_not_found")
        txApp.db().newQuery(
          "DELETE FROM agent_studio_kb_chunks WHERE document_id={:did} AND base_id={:bid} AND rh_user_id={:uid}"
        ).bind({ did: docId, bid: baseId, uid: ownerUid }).execute()
      })
      return e.json(200, { ok: true, deleted: true })
    }
    if (action !== "upload") return e.json(400, { error: "unknown_action" })
    var filename = String(body.filename || "").trim()
    var content = String(body.content || "").replace(/\r\n?/g, "\n").trim()
    if (!filename || filename.length > 180 || !/\.(txt|md|markdown|csv|tsv|json|html?|pdf|docx)$/i.test(filename)) {
      return e.json(400, { error: "unsupported_file_type", message: "请上传 TXT、Markdown、CSV、JSON、HTML、PDF 或 DOCX 文件的已提取文本" })
    }
    if (content.length < 1 || content.length > 160000) {
      return e.json(400, { error: "invalid_document_size", message: "单份文档内容需在1至160000字符之间" })
    }
    var chunks = []
    var start = 0
    while (start < content.length && chunks.length < 200) {
      var end = Math.min(start + 950, content.length)
      if (end < content.length) {
        var newline = content.lastIndexOf("\n", end)
        if (newline > start + 500) end = newline + 1
      }
      var passage = content.slice(start, end).trim()
      if (passage) chunks.push(passage)
      if (end >= content.length) break
      start = Math.max(start + 1, end - 120)
    }
    if (!chunks.length || chunks.length >= 200) return e.json(400, { error: "chunk_limit" })
    var id = $security.randomString(15)
    var now = new Date().getTime()
    // Atomic document + all chunks: no published partial document or race on the 80-document quota.
    $app.runInTransaction(function (txApp) {
      acl.resolve(txApp,uid,baseId,"editor")
      var owner = new DynamicModel({ total: 0 })
      txApp.db().newQuery("SELECT COUNT(*) AS total FROM agent_studio_kb_bases WHERE id={:bid} AND rh_user_id={:uid}")
        .bind({ bid: baseId, uid: ownerUid }).one(owner)
      if (!Number(owner.total)) throw new Error("base_not_found")
      var docs = new DynamicModel({ total: 0 })
      txApp.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_kb_documents WHERE base_id={:bid} AND rh_user_id={:uid}"
      ).bind({ bid: baseId, uid: ownerUid }).one(docs)
      if (Number(docs.total) >= 80) throw new Error("document_limit")
      txApp.db().newQuery(
        "INSERT INTO agent_studio_kb_documents(id,base_id,rh_user_id,filename,size_chars,chunk_count,created_ms) " +
        "VALUES({:id},{:bid},{:uid},{:name},{:size},{:chunks},{:now})"
      ).bind({ id: id, bid: baseId, uid: ownerUid, name: filename,
        size: content.length, chunks: chunks.length, now: now }).execute()
      for (var i = 0; i < chunks.length; i++) {
        txApp.db().newQuery(
          "INSERT INTO agent_studio_kb_chunks(id,base_id,document_id,rh_user_id,chunk_index,text_content) " +
          "VALUES({:id},{:bid},{:did},{:uid},{:idx},{:text})"
        ).bind({ id: $security.randomString(15), bid: baseId, did: id, uid: ownerUid,
          idx: i + 1, text: chunks[i] }).execute()
      }
      var updated = txApp.db().newQuery(
        "UPDATE agent_studio_kb_bases SET updated_ms={:now} WHERE id={:bid} AND rh_user_id={:uid}"
      ).bind({ now: now, bid: baseId, uid: ownerUid }).execute()
      if (Number(updated.rowsAffected()) !== 1) throw new Error("base_not_found")
    })
    // Persistent asynchronous indexing: an offline worker may pick up this
    // document later, even if the browser closes. A queue failure never makes
    // the already-committed document appear rolled back.
    var embeddingQueued=false
    try {
      var embedding=require(__hooks+"/modules/knowledge_embedding.js")
      if(embedding.getSettings($app,ownerUid)){
        embedding.enqueue($app,ownerUid,baseId)
        embeddingQueued=true
      }
    }catch(_){}
    return e.json(200, { ok: true, id: id, chunk_count: chunks.length,
      size_chars: content.length, semantic_queued:embeddingQueued })
  } catch (err) {
    if(err&&err.httpStatus)return e.json(err.httpStatus,{error:String(err.code||"base_not_found")})
    var code = String((err && err.message) || err)
    if (code === "base_not_found") return e.json(404, { error: code })
    if (code === "document_not_found") return e.json(404, { error: code })
    if (code === "document_limit") return e.json(429, { error: code, message: "每个知识库最多80份文档" })
    try { $app.logger().error("knowledge ingest error", "err", code) } catch (_) {}
    return e.json(500, { error: "knowledge_ingest_failed" })
  }
})
// Search never trusts caller-provided owner, only the authenticated user and owned base IDs.
routerAdd("POST", "/api/knowledge-bases/search", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var body = (e.requestInfo() || {}).body || {}
    var service = require(__hooks + "/modules/knowledge_search.js")
    var limit = body.limit === undefined ? 5 : body.limit
    var result = service.search($app, uid, body.base_ids, body.query, limit, {mode:body.mode||"auto"})
    return e.json(200, result)
  } catch (err) {
    if (err && err.httpStatus) return e.json(err.httpStatus, { error: String(err.code || "invalid_request") })
    try { $app.logger().error("knowledge search error", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "knowledge_search_failed" })
  }
})