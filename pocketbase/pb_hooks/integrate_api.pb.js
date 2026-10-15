// integrate_api.pb.js — 发布与集成页唯一数据通路（前端 /integrate）+ 对外公开端点
//
// 管理端点（X-Rh-User-Id 登录鉴权 + 归属校验，非本人一律 404）：
//   GET    /api/integrate/agents              本人已发布 agent 列表（读 spec_versions published）
//   GET    /api/integrate/embed-config        读取嵌入配置（embed token 属公开凭证，随配置返回）
//   POST   /api/integrate/embed-config        生成/更新嵌入配置（token 复用，theme/enabled 可改）
//   GET    /api/integrate/keys                调用钥匙列表（仅尾 4 位，绝不回明文）
//   POST   /api/integrate/keys                创建钥匙（完整明文只在本次响应返回一次）
//   POST   /api/integrate/keys/{id}/reissue   重发钥匙（新明文只返回一次，旧钥匙立即失效）
//   DELETE /api/integrate/keys/{id}           吊销钥匙（enabled=false，公开端点立即 401）
//   GET    /api/integrate/invocations         本人集成调用记录（≤50，可按 source 过滤）
//   GET    /api/integrate/stats               累计/成功率/今日/来源分布聚合
//   POST   /api/integrate/test-run            在线试调（按 key_id 服务端换真实钥匙，走与外部完全相同的创建链路）
//   GET    /api/integrate/test-run/poll       试调轮询（登录鉴权，驱动 tick 与公开 poll 等价）
//
// 公开端点（免登录，token 鉴权，不读 X-Rh-User-Id、不走 /api/llm/ 前缀）：
//   POST /api/public/agent/run                body {token, input, session_id?} → {run_id}
//   GET  /api/public/agent/poll?token=&run_id=  驱动一步 tick（claim_until 防重叠由引擎负责）并回事件/状态
//   GET  /embed/{token}                       自包含嵌入聊天页 HTML（arc 浅色风、内联样式）
//   GET  /embed.js?token=                     悬浮球注入脚本（iframe 指向 /embed/{token}）
//
// 安全与约束：
//   - token 可逆混淆落库（charCode+3 点分，与 model_connections_api 同款，纵深防御非加密），
//     明文只在创建/重发响应返回一次；embed token 属页面源码级公开凭证，配置读取时随响应返回。
//   - 速率限制（真实生效）：同一 token ≤6 次/分钟、≤200 次/天，按 integration_invocations 聚合，超限 429。
//   - run 归属：公开 poll 校验 run.rh_user_id == token 归属者且 run.spec_id == token.agent_id，否则 404。
//   - tick 驱动：内部回环 POST 127.0.0.1:7000 的引擎 tick 路由并带 token 归属者 uid
//     （复用 agent_engine 全部逻辑与 claim_until 防重叠；计费身份不变：无网关 key 注入时引擎回退服务端 env key，
//     自定义模型走归属者连接记录）。
//   - 事件外发前统一抹 Bearer/key=/sk-/rhk_ 等敏感串。
//   - 5xx 一律 { error, message, fingerprint }；Goja 铁律：全 var、new Date().getTime()、
//     helper 全部内联进各自回调、self-contained（跨回调引用顶层 var 会 ReferenceError）。

// ============ 管理端点 ============

routerAdd("GET", "/api/integrate/agents", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var loadJson = function (rec, field) {
      var v = null
      try { v = rec.getString(field) } catch (_) {}
      if (!v) { try { v = rec.get(field) } catch (_) {} }
      if (v === null || v === undefined) return {}
      if (typeof v === "string") { try { return JSON.parse(v) } catch (_) { return {} } }
      if (typeof v === "object") return v
      return {}
    }
    var rows = []
    try {
      rows = $app.findRecordsByFilter("spec_versions", "rh_user_id = {:uid} && status = 'published'", "-published_at", 100, 0, { uid: uid })
    } catch (_) { rows = [] }
    var items = []
    var seen = {}
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]
      var specId = String(r.getString("spec_id") || "")
      if (!specId || seen[specId]) continue
      seen[specId] = true
      var nameVal = ""
      try {
        var specRec = $app.findRecordById("agent_specs", specId)
        if (String(specRec.get("rh_user_id")) === uid) nameVal = String(specRec.getString("name") || "")
      } catch (_) {}
      if (!nameVal) {
        var snap = loadJson(r, "spec_snapshot")
        nameVal = String(snap.name || "未命名助手")
      }
      items.push({
        agent_id: specId,
        name: nameVal,
        version_no: Number(r.get("version_no") || 0),
        version_id: String(r.id),
        published_at: String(r.getString("published_at") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate agents error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/integrate/embed-config", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var agentId = String(qp.agent_id || "").trim()
    if (!agentId) return e.json(400, { error: "bad_request", message: "缺少 agent_id" })
    var specRec = null
    try { specRec = $app.findRecordById("agent_specs", agentId) } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "agent_not_found", message: "助手不存在或无权访问" })
    }
    var loadJson = function (rec, field) {
      var v = null
      try { v = rec.getString(field) } catch (_) {}
      if (!v) { try { v = rec.get(field) } catch (_) {} }
      if (v === null || v === undefined) return {}
      if (typeof v === "string") { try { return JSON.parse(v) } catch (_) { return {} } }
      if (typeof v === "object") return v
      return {}
    }
    var deobfToken = function (stored) {
      var s = String(stored || "")
      if (!s || s.indexOf(".") < 0) return ""
      var parts = s.split(".")
      var out = ""
      for (var di = 0; di < parts.length; di++) {
        var dn = parseInt(parts[di], 10)
        if (isNaN(dn)) return ""
        out += String.fromCharCode(dn - 3)
      }
      return out
    }
    var tok = null
    try {
      tok = $app.findFirstRecordByFilter("integration_tokens", "rh_user_id = {:uid} && agent_id = {:aid} && kind = 'embed'", { uid: uid, aid: agentId })
    } catch (_) {}
    if (!tok) return e.json(200, { ok: true, exists: false })
    var theme = loadJson(tok, "theme")
    var enabled = true
    try { enabled = tok.getBool("enabled") } catch (_) {}
    return e.json(200, {
      ok: true,
      exists: true,
      token_id: String(tok.id),
      token: deobfToken(String(tok.getString("token_hash") || "")),
      token_tail: String(tok.getString("token_tail") || ""),
      enabled: enabled,
      theme: {
        position: String(theme.position || "bottom_right"),
        accent: String(theme.accent || "coral"),
        title: String(theme.title || ""),
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate embed-config get error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/integrate/embed-config", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var agentId = String(body.agent_id || "").trim()
    if (!agentId) return e.json(400, { error: "bad_request", message: "缺少 agent_id" })
    var specRec = null
    try { specRec = $app.findRecordById("agent_specs", agentId) } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "agent_not_found", message: "助手不存在或无权访问" })
    }
    var obfToken = function (plain) {
      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var genToken = function (prefix) {
      return prefix + $security.randomString(36)
    }
    var loadJson = function (rec, field) {
      var v = null
      try { v = rec.getString(field) } catch (_) {}
      if (!v) { try { v = rec.get(field) } catch (_) {} }
      if (v === null || v === undefined) return {}
      if (typeof v === "string") { try { return JSON.parse(v) } catch (_) { return {} } }
      if (typeof v === "object") return v
      return {}
    }
    var deobfToken = function (stored) {
      var s = String(stored || "")
      if (!s || s.indexOf(".") < 0) return ""
      var parts = s.split(".")
      var out = ""
      for (var di = 0; di < parts.length; di++) {
        var dn = parseInt(parts[di], 10)
        if (isNaN(dn)) return ""
        out += String.fromCharCode(dn - 3)
      }
      return out
    }
    // theme 白名单归一化（accent 存预设名，颜色由嵌入页按预设渲染，杜绝任意注入）
    var tok = null
    try {
      tok = $app.findFirstRecordByFilter("integration_tokens", "rh_user_id = {:uid} && agent_id = {:aid} && kind = 'embed'", { uid: uid, aid: agentId })
    } catch (_) {}
    var themeIn = body.theme
    if (!themeIn || typeof themeIn !== "object") {
      // 未携带 theme（如仅切换 enabled）时沿用已存配置，不重置
      themeIn = tok ? loadJson(tok, "theme") : {}
    }
    var position = String(themeIn.position || "bottom_right")
    if (position !== "bottom_left") position = "bottom_right"
    var accent = String(themeIn.accent || "coral")
    if (accent !== "coral" && accent !== "sunset" && accent !== "ocean" && accent !== "forest") accent = "coral"
    var title = String(themeIn.title || "").trim().slice(0, 40)
    if (!title) title = String(specRec.getString("name") || "AI 助手").slice(0, 40)
    var theme = { position: position, accent: accent, title: title }

    var plainToken = ""
    if (tok) {
      var nowEnabled = true
      try { nowEnabled = tok.getBool("enabled") } catch (_) {}
      if (body.enabled === true || body.enabled === false) nowEnabled = body.enabled === true
      tok.set("enabled", nowEnabled)
      tok.set("theme", theme)
      $app.save(tok)
      plainToken = deobfToken(String(tok.getString("token_hash") || ""))
      return e.json(200, {
        ok: true, token_id: String(tok.id), token: plainToken,
        token_tail: String(tok.getString("token_tail") || ""),
        enabled: nowEnabled, theme: theme,
      })
    }
    plainToken = genToken("rhe_")
    var col = $app.findCollectionByNameOrId("integration_tokens")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("agent_id", agentId)
    rec.set("kind", "embed")
    rec.set("name", "网页嵌入")
    rec.set("token_hash", obfToken(plainToken))
    rec.set("token_tail", plainToken.slice(-4))
    rec.set("enabled", body.enabled === false ? false : true)
    rec.set("theme", theme)
    $app.save(rec)
    return e.json(200, {
      ok: true, token_id: String(rec.id), token: plainToken,
      token_tail: plainToken.slice(-4),
      enabled: body.enabled === false ? false : true, theme: theme,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate embed-config post error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/integrate/keys", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var agentId = String(qp.agent_id || "").trim()
    if (!agentId) return e.json(400, { error: "bad_request", message: "缺少 agent_id" })
    var specRec = null
    try { specRec = $app.findRecordById("agent_specs", agentId) } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "agent_not_found", message: "助手不存在或无权访问" })
    }
    var rows = []
    try {
      rows = $app.findRecordsByFilter("integration_tokens", "rh_user_id = {:uid} && agent_id = {:aid} && kind = 'api'", "-created", 100, 0, { uid: uid, aid: agentId })
    } catch (_) { rows = [] }
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]
      var enabled = false
      try { enabled = r.getBool("enabled") } catch (_) {}
      items.push({
        id: String(r.id),
        name: String(r.getString("name") || "未命名钥匙"),
        token_tail: String(r.getString("token_tail") || ""),
        enabled: enabled,
        created: String(r.get("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate keys list error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/integrate/keys", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var agentId = String(body.agent_id || "").trim()
    var keyName = String(body.name || "").trim().slice(0, 30)
    if (!agentId) return e.json(400, { error: "bad_request", message: "缺少 agent_id" })
    if (!keyName) return e.json(400, { error: "bad_request", message: "请给钥匙起个名字" })
    var specRec = null
    try { specRec = $app.findRecordById("agent_specs", agentId) } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "agent_not_found", message: "助手不存在或无权访问" })
    }
    var pubVer = null
    try {
      pubVer = $app.findFirstRecordByFilter("spec_versions", "rh_user_id = {:uid} && spec_id = {:sid} && status = 'published'", { uid: uid, sid: agentId })
    } catch (_) {}
    if (!pubVer) {
      return e.json(409, { error: "not_published", message: "该助手还没有已发布版本，请先到「版本发布」页发布后再发放调用钥匙" })
    }
    var obfToken = function (plain) {
      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var genToken = function (prefix) {
      return prefix + $security.randomString(40)
    }
    var plainKey = genToken("rhk_")
    var col = $app.findCollectionByNameOrId("integration_tokens")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("agent_id", agentId)
    rec.set("kind", "api")
    rec.set("name", keyName)
    rec.set("token_hash", "sha256:" + $security.sha256(plainKey))
    rec.set("token_tail", plainKey.slice(-4))
    rec.set("enabled", true)
    rec.set("theme", {})
    $app.save(rec)
    // 完整明文只在本响应返回一次，之后任何接口只回尾 4 位
    return e.json(200, { ok: true, id: String(rec.id), name: keyName, token: plainKey, token_tail: plainKey.slice(-4) })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate keys create error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/integrate/keys/{id}/reissue", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try { rec = $app.findRecordById("integration_tokens", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid || String(rec.getString("kind")) !== "api") {
      return e.json(404, { error: "key_not_found", message: "钥匙不存在或无权操作" })
    }
    var obfToken = function (plain) {
      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var genToken = function (prefix) {
      return prefix + $security.randomString(40)
    }
    var plainKey = genToken("rhk_")
    rec.set("token_hash", "sha256:" + $security.sha256(plainKey))
    rec.set("token_tail", plainKey.slice(-4))
    rec.set("enabled", true)
    $app.save(rec)
    return e.json(200, { ok: true, id: String(rec.id), name: String(rec.getString("name") || ""), token: plainKey, token_tail: plainKey.slice(-4) })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate keys reissue error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/integrate/keys/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try { rec = $app.findRecordById("integration_tokens", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid || String(rec.getString("kind")) !== "api") {
      return e.json(404, { error: "key_not_found", message: "钥匙不存在或无权操作" })
    }
    rec.set("enabled", false)
    $app.save(rec)
    return e.json(200, { ok: true, id: String(rec.id) })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate keys revoke error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/integrate/invocations", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var limit = parseInt(qp.limit, 10)
    if (isNaN(limit) || limit < 1) limit = 50
    if (limit > 50) limit = 50
    var agentId = String(qp.agent_id || "").trim()
    var source = String(qp.source || "").trim()
    var filter = "rh_user_id = {:uid}"
    var params = { uid: uid }
    if (agentId) { filter += " && agent_id = {:aid}"; params.aid = agentId }
    if (source === "embed" || source === "api") { filter += " && source = {:src}"; params.src = source }
    var rows = []
    try { rows = $app.findRecordsByFilter("integration_invocations", filter, "-created", limit, 0, params) } catch (_) { rows = [] }
    // token_id → 钥匙名 映射（一次性拉本人全部 token）
    var nameMap = {}
    try {
      var tokRows = $app.findRecordsByFilter("integration_tokens", "rh_user_id = {:uid}", "-created", 200, 0, { uid: uid })
      for (var ti = 0; ti < tokRows.length; ti++) {
        nameMap[String(tokRows[ti].id)] = String(tokRows[ti].getString("name") || "")
      }
    } catch (_) {}
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]
      var latency = 0
      try { latency = Number(r.get("latency_ms") || 0) } catch (_) {}
      var tokenId = String(r.getString("token_id") || "")
      items.push({
        id: String(r.id),
        agent_id: String(r.getString("agent_id") || ""),
        token_id: tokenId,
        token_name: nameMap[tokenId] || "",
        source: String(r.getString("source") || ""),
        run_id: String(r.getString("run_id") || ""),
        input_summary: String(r.getString("input_summary") || ""),
        status: String(r.getString("status") || "running"),
        latency_ms: latency,
        error_code: String(r.getString("error_code") || ""),
        created: String(r.get("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate invocations error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/integrate/stats", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var agentId = String(qp.agent_id || "").trim()
    var base = "rh_user_id = {:uid}"
    var params = { uid: uid }
    if (agentId) { base += " && agent_id = {:aid}"; params.aid = agentId }
    var countOf = function (filter, p) {
      // countRecords 不接受字符串 filter（本 PB 构建），分页计数，安全上限 20 页
      var total = 0
      var page = 0
      while (page < 20) {
        var rows = []
        try { rows = $app.findRecordsByFilter("integration_invocations", filter, "-created", 500, page * 500, p) } catch (_) { return total }
        total += rows.length
        if (rows.length < 500) break
        page++
      }
      return total
    }
    var dayStart = new Date().toISOString().slice(0, 10) + " 00:00:00.000Z"
    var total = countOf(base, params)
    var success = countOf(base + ' && status = "success"', params)
    var failed = countOf(base + ' && status = "failed"', params)
    var running = countOf(base + ' && status = "running"', params)
    var pToday = { uid: uid, since: dayStart }
    if (agentId) pToday.aid = agentId
    var today = countOf(base + " && created >= {:since}", pToday)
    var fromEmbed = countOf(base + ' && source = "embed"', params)
    var fromApi = countOf(base + ' && source = "api"', params)
    var finished = success + failed
    var successRate = finished > 0 ? Math.round((success * 1000) / finished) / 10 : 0
    return e.json(200, {
      ok: true,
      total: total,
      success: success,
      failed: failed,
      running: running,
      today: today,
      source_embed: fromEmbed,
      source_api: fromApi,
      success_rate: successRate,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate stats error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— 在线试调：按 key_id 服务端换真实钥匙，创建链路与公开端点完全一致（含速率限制与调用留档）——
routerAdd("POST", "/api/integrate/test-run", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var keyId = String(body.key_id || "").trim()
    var input = String(body.input || "").trim()
    if (!keyId) return e.json(400, { error: "bad_request", message: "请选择调用钥匙" })
    if (!input) return e.json(400, { error: "bad_request", message: "请填写任务指令 input" })
    var keyRec = null
    try { keyRec = $app.findRecordById("integration_tokens", keyId) } catch (_) {}
    if (!keyRec || String(keyRec.get("rh_user_id") || "") !== uid || String(keyRec.getString("kind")) !== "api") {
      return e.json(404, { error: "key_not_found", message: "钥匙不存在或无权使用" })
    }
    var keyEnabled = false
    try { keyEnabled = keyRec.getBool("enabled") } catch (_) {}
    if (!keyEnabled) return e.json(409, { error: "key_disabled", message: "该钥匙已吊销，请重发或换一把" })
    var ownerUid = String(keyRec.get("rh_user_id"))
    var agentId = String(keyRec.getString("agent_id") || "")
    var tokenId = String(keyRec.id)

    // 速率限制（与公开端点同口径，按 integration_invocations 聚合，真实生效）
    var fmtMs = function (ms) { return new Date(ms).toISOString().slice(0, 23).replace("T", " ") + "Z" }
    var nowMs = new Date().getTime()
    var countOf = function (filter, p) {
      // 注意：本 PB 构建的 countRecords 不接受字符串 filter（dbx.Expression 转换失败），统一走 findRecordsByFilter 计数
      try {
        var rows = $app.findRecordsByFilter("integration_invocations", filter, "-created", 201, 0, p)
        return rows.length
      } catch (_) { return 0 }
    }
    var perMin = countOf("token_id = {:tid} && created >= {:since}", { tid: tokenId, since: fmtMs(nowMs - 60000) })
    if (perMin >= 6) return e.json(429, { error: "rate_limited", message: "调用过于频繁（同一钥匙每分钟最多 6 次），请稍后再试", retry_after_s: 60 })
    var perDay = countOf("token_id = {:tid} && created >= {:since}", { tid: tokenId, since: fmtMs(nowMs - 86400000) })
    if (perDay >= 200) return e.json(429, { error: "rate_limited", message: "今日调用已达上限（同一钥匙每天最多 200 次），请明天再试", retry_after_s: 3600 })

    var loadJson = function (rec, field) {
      var v = null
      try { v = rec.getString(field) } catch (_) {}
      if (!v) { try { v = rec.get(field) } catch (_) {} }
      if (v === null || v === undefined) return {}
      if (typeof v === "string") { try { return JSON.parse(v) } catch (_) { return {} } }
      if (typeof v === "object") return v
      return {}
    }
    var pubVer = null
    try {
      pubVer = $app.findFirstRecordByFilter("spec_versions", "rh_user_id = {:uid} && spec_id = {:sid} && status = 'published'", { uid: ownerUid, sid: agentId })
    } catch (_) {}
    if (!pubVer) return e.json(409, { error: "not_published", message: "该助手还没有已发布版本，无法对外调用" })
    var snap = loadJson(pubVer, "spec_snapshot")
    var specName = String(snap.name || "未命名助手")

    // 工具授权：spec.tools 里的内置五件套直接放行；外部工具名与归属者已启用连接精确匹配时授权
    var BUILTIN = { calculate: 1, summarize: 1, knowledge_search: 1, web_fetch: 1, web_search: 1 }
    var toolsCfg = { calculate: false, summarize: false, knowledge_search: false, web_fetch: false, web_search: false }
    var specTools = snap.tools || []
    var si = 0
    for (si = 0; si < specTools.length; si++) {
      var tn = String(specTools[si] || "").trim()
      if (tn && BUILTIN[tn]) toolsCfg[tn] = true
    }
    try {
      var connRows = $app.findRecordsByFilter("tool_connections", "id != '' && enabled = true", "-created", 100, 0, { uid: ownerUid })
      var connNames = {}
      for (var ci = 0; ci < connRows.length; ci++) {
        var cn = ""
        try { cn = String(connRows[ci].getString("name") || "") } catch (_) {}
        if (cn) connNames[cn] = true
      }
      var added = 0
      for (si = 0; si < specTools.length && added < 10; si++) {
        var tn2 = String(specTools[si] || "").trim().slice(0, 100)
        if (!tn2 || BUILTIN[tn2]) continue
        if (connNames[tn2] && toolsCfg[tn2] === undefined) { toolsCfg[tn2] = true; added++ }
      }
    } catch (_) {}

    var config = {
      tools: toolsCfg,
      max_steps: 10,
      stop_condition: "",
      stop_on_complete: true,
      source: "api",
      origin: "api",
      integration_token_id: tokenId,
      integration_token_name: String(keyRec.getString("name") || ""),
      custom_model: null,
    }
    var col = $app.findCollectionByNameOrId("agent_runs")
    var rec = new Record(col)
    rec.set("rh_user_id", ownerUid)
    rec.set("spec_id", agentId)
    rec.set("spec_name", specName)
    rec.set("instruction", input.slice(0, 2000))
    rec.set("status", "running")
    rec.set("current_step", 0)
    rec.set("max_steps", 10)
    rec.set("model", "claude-opus-4.8")
    rec.set("config", config)
    rec.set("result", "")
    rec.set("error", "")
    rec.set("checkpoint", { steps: [], seq: 1, claim_until: 0, done_steps: 0, parse_failures: 0 })
    $app.save(rec)
    var runId = String(rec.id)

    var evCol = $app.findCollectionByNameOrId("run_events")
    var ev = new Record(evCol)
    ev.set("run_id", runId)
    ev.set("step_index", 0)
    ev.set("seq", 1)
    ev.set("event_type", "status")
    ev.set("content", { message: "外部接口调用已创建，执行引擎开始逐步运行" })
    $app.save(ev)

    var invCol = $app.findCollectionByNameOrId("integration_invocations")
    var inv = new Record(invCol)
    inv.set("rh_user_id", ownerUid)
    inv.set("agent_id", agentId)
    inv.set("token_id", tokenId)
    inv.set("source", "api")
    inv.set("run_id", runId)
    inv.set("input_summary", input.slice(0, 500))
    inv.set("status", "running")
    inv.set("latency_ms", 0)
    inv.set("error_code", "")
    $app.save(inv)

    return e.json(200, { ok: true, run_id: runId, status: "running" })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate test-run error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— 试调轮询（登录鉴权）：驱动 tick + 回事件，语义与公开 poll 等价 ——
routerAdd("GET", "/api/integrate/test-run/poll", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var keyId = String(qp.key_id || "").trim()
    var runId = String(qp.run_id || "").trim()
    if (!keyId || !runId) return e.json(400, { error: "bad_request", message: "缺少 key_id 或 run_id" })
    var keyRec = null
    try { keyRec = $app.findRecordById("integration_tokens", keyId) } catch (_) {}
    if (!keyRec || String(keyRec.get("rh_user_id") || "") !== uid || String(keyRec.getString("kind")) !== "api") {
      return e.json(404, { error: "key_not_found", message: "钥匙不存在或无权使用" })
    }
    var run = null
    try { run = $app.findRecordById("agent_runs", runId) } catch (_) {}
    if (!run || String(run.get("rh_user_id") || "") !== uid || String(run.get("spec_id") || "") !== String(keyRec.get("agent_id") || "")) {
      return e.json(404, { error: "run_not_found", message: "运行不存在或无权查看" })
    }

    var sanitize = function (s) {
      return String(s || "")
        .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/g, "$1***")
        .replace(/([?&"']key["']?\s*[=:]\s*["']?)[^"'\s,&}]+/g, "$1***")
        .replace(/(sk-[A-Za-z0-9_\-]{4})[A-Za-z0-9_\-]+/g, "$1***")
        .replace(/(rh[ke]_[A-Za-z0-9]{4})[A-Za-z0-9]+/g, "$1***")
    }
    var runStatus = String(run.get("status"))
    if (runStatus === "running") {
      // 内部回环驱动引擎一步（带归属者 uid；claim_until 防重叠由引擎负责；超时/失败不影响状态回读）
      try {
        $http.send({
          url: "http://127.0.0.1:7000/api/llm/agent-engine/" + encodeURIComponent(runId) + "/tick",
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Rh-User-Id": uid },
          body: "{}",
          timeout: 25,
        })
      } catch (_) {}
      try { run = $app.findRecordById("agent_runs", runId) } catch (_) {}
      runStatus = String(run.get("status"))
    }
    var evRows = []
    try { evRows = $app.findRecordsByFilter("run_events", "run_id = {:rid}", "step_index,seq,created", 200, 0, { rid: runId }) } catch (_) { evRows = [] }
    var events = []
    for (var i = 0; i < evRows.length; i++) {
      var er = evRows[i]
      var content = null
      try {
        var cText = er.getString("content")
        content = cText ? JSON.parse(cText) : null
      } catch (_) {}
      if (!content || typeof content !== "object") {
        try { content = er.get("content") } catch (_) { content = {} }
      }
      var safeContent = content
      try { safeContent = JSON.parse(sanitize(JSON.stringify(content || {}))) } catch (_) { safeContent = { message: sanitize(JSON.stringify(content || {})).slice(0, 400) } }
      events.push({
        step_index: Number(er.get("step_index") || 0),
        seq: Number(er.get("seq") || 0),
        event_type: String(er.getString("event_type") || ""),
        content: safeContent,
        created: String(er.get("created") || ""),
      })
    }
    // 调用留档同步终态与耗时
    var latencyMs = 0
    if (runStatus === "succeeded" || runStatus === "failed" || runStatus === "cancelled") {
      try {
        var createdMs = new Date(String(run.get("created")).replace(" ", "T")).getTime()
        var updatedMs = new Date(String(run.get("updated")).replace(" ", "T")).getTime()
        if (!isNaN(createdMs) && !isNaN(updatedMs) && updatedMs > createdMs) latencyMs = updatedMs - createdMs
      } catch (_) {}
      try {
        var inv = $app.findFirstRecordByFilter("integration_invocations", "run_id = {:rid}", { rid: runId })
        if (inv && String(inv.getString("status")) === "running") {
          inv.set("status", runStatus === "succeeded" ? "success" : "failed")
          inv.set("latency_ms", latencyMs)
          if (runStatus !== "succeeded") inv.set("error_code", runStatus === "cancelled" ? "cancelled" : "run_failed")
          $app.save(inv)
        }
      } catch (_) {}
    }
    return e.json(200, {
      ok: true,
      run_id: runId,
      status: runStatus,
      result: String(run.get("result") || ""),
      error: sanitize(String(run.get("error") || "")),
      current_step: Number(run.get("current_step") || 0),
      max_steps: Number(run.get("max_steps") || 10),
      latency_ms: latencyMs,
      events: events,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("integrate test-poll error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// ============ 公开端点（免登录，token 鉴权） ============

routerAdd("POST", "/api/public/agent/run", function (e) {
  try {
    var body = (e.requestInfo() || {}).body || {}
    var token = String(body.token || "").trim()
    var input = String(body.input || "").trim()
    var sessionId = String(body.session_id || "").trim().slice(0, 64)
    if (!token) return e.json(401, { error: "token_required", message: "缺少调用凭证 token" })
    if (!input) return e.json(400, { error: "bad_request", message: "缺少任务指令 input" })
    var obfToken = function (plain) {
      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var tok = null
    try {
      tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: "sha256:" + $security.sha256(token) })
    } catch (_) {}
    if (!tok) { try { tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: obfToken(token) }) } catch (_) {} }
    if (!tok) return e.json(401, { error: "invalid_token", message: "调用凭证无效，请检查 token 是否正确" })
    var tokEnabled = false
    try { tokEnabled = tok.getBool("enabled") } catch (_) {}
    if (!tokEnabled) return e.json(401, { error: "token_disabled", message: "该调用凭证已被停用或吊销" })
    var kind = String(tok.getString("kind") || "")
    var source = kind === "embed" ? "embed" : "api"
    var ownerUid = String(tok.get("rh_user_id"))
    var agentId = String(tok.getString("agent_id") || "")
    var tokenId = String(tok.id)

    // 速率限制（真实生效）：同一 token ≤6 次/分钟、≤200 次/天，按调用留档聚合
    var fmtMs = function (ms) { return new Date(ms).toISOString().slice(0, 23).replace("T", " ") + "Z" }
    var nowMs = new Date().getTime()
    var countOf = function (filter, p) {
      // 注意：本 PB 构建的 countRecords 不接受字符串 filter（dbx.Expression 转换失败），统一走 findRecordsByFilter 计数
      try {
        var rows = $app.findRecordsByFilter("integration_invocations", filter, "-created", 201, 0, p)
        return rows.length
      } catch (_) { return 0 }
    }
    var perMin = countOf("token_id = {:tid} && created >= {:since}", { tid: tokenId, since: fmtMs(nowMs - 60000) })
    if (perMin >= 6) return e.json(429, { error: "rate_limited", message: "调用过于频繁（每分钟最多 6 次），请稍后再试", retry_after_s: 60 })
    var perDay = countOf("token_id = {:tid} && created >= {:since}", { tid: tokenId, since: fmtMs(nowMs - 86400000) })
    if (perDay >= 200) return e.json(429, { error: "rate_limited", message: "今日调用已达上限（每天最多 200 次），请明天再试", retry_after_s: 3600 })

    var loadJson = function (rec, field) {
      var v = null
      try { v = rec.getString(field) } catch (_) {}
      if (!v) { try { v = rec.get(field) } catch (_) {} }
      if (v === null || v === undefined) return {}
      if (typeof v === "string") { try { return JSON.parse(v) } catch (_) { return {} } }
      if (typeof v === "object") return v
      return {}
    }
    // 只允许调用已发布版本（config 取发布快照语义：工具授权按发布 spec.tools + 归属者已启用连接）
    var pubVer = null
    try {
      pubVer = $app.findFirstRecordByFilter("spec_versions", "rh_user_id = {:uid} && spec_id = {:sid} && status = 'published'", { uid: ownerUid, sid: agentId })
    } catch (_) {}
    if (!pubVer) return e.json(409, { error: "not_published", message: "该助手当前没有已发布版本，暂时无法调用" })
    var snap = loadJson(pubVer, "spec_snapshot")
    var specName = String(snap.name || "未命名助手")

    var BUILTIN = { calculate: 1, summarize: 1, knowledge_search: 1, web_fetch: 1, web_search: 1 }
    var toolsCfg = { calculate: false, summarize: false, knowledge_search: false, web_fetch: false, web_search: false }
    var specTools = snap.tools || []
    var si = 0
    for (si = 0; si < specTools.length; si++) {
      var tn = String(specTools[si] || "").trim()
      if (tn && BUILTIN[tn]) toolsCfg[tn] = true
    }
    try {
      var connRows = $app.findRecordsByFilter("tool_connections", "id != '' && enabled = true", "-created", 100, 0, { uid: ownerUid })
      var connNames = {}
      for (var ci = 0; ci < connRows.length; ci++) {
        var cn = ""
        try { cn = String(connRows[ci].getString("name") || "") } catch (_) {}
        if (cn) connNames[cn] = true
      }
      var added = 0
      for (si = 0; si < specTools.length && added < 10; si++) {
        var tn2 = String(specTools[si] || "").trim().slice(0, 100)
        if (!tn2 || BUILTIN[tn2]) continue
        if (connNames[tn2] && toolsCfg[tn2] === undefined) { toolsCfg[tn2] = true; added++ }
      }
    } catch (_) {}

    var config = {
      tools: toolsCfg,
      max_steps: 10,
      stop_condition: "",
      stop_on_complete: true,
      source: source,
      origin: source,
      session_id: sessionId || null,
      integration_token_id: tokenId,
      custom_model: null,
    }
    var col = $app.findCollectionByNameOrId("agent_runs")
    var rec = new Record(col)
    rec.set("rh_user_id", ownerUid)
    rec.set("spec_id", agentId)
    rec.set("spec_name", specName)
    rec.set("instruction", input.slice(0, 2000))
    rec.set("status", "running")
    rec.set("current_step", 0)
    rec.set("max_steps", 10)
    rec.set("model", "claude-opus-4.8")
    rec.set("config", config)
    rec.set("result", "")
    rec.set("error", "")
    rec.set("checkpoint", { steps: [], seq: 1, claim_until: 0, done_steps: 0, parse_failures: 0 })
    $app.save(rec)
    var runId = String(rec.id)

    var evCol = $app.findCollectionByNameOrId("run_events")
    var ev = new Record(evCol)
    ev.set("run_id", runId)
    ev.set("step_index", 0)
    ev.set("seq", 1)
    ev.set("event_type", "status")
    ev.set("content", { message: source === "embed" ? "网页嵌入访客已提交任务，执行引擎开始逐步运行" : "外部接口调用已创建，执行引擎开始逐步运行" })
    $app.save(ev)

    var invCol = $app.findCollectionByNameOrId("integration_invocations")
    var inv = new Record(invCol)
    inv.set("rh_user_id", ownerUid)
    inv.set("agent_id", agentId)
    inv.set("token_id", tokenId)
    inv.set("source", source)
    inv.set("run_id", runId)
    inv.set("input_summary", input.slice(0, 500))
    inv.set("status", "running")
    inv.set("latency_ms", 0)
    inv.set("error_code", "")
    $app.save(inv)

    return e.json(200, { ok: true, run_id: runId, status: "running" })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("public agent run error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/public/agent/poll", function (e) {
  try {
    var qp = (e.requestInfo() || {}).query || {}
    var token = String(qp.token || "").trim()
    var runId = String(qp.run_id || "").trim()
    if (!token || !runId) return e.json(400, { error: "bad_request", message: "缺少 token 或 run_id" })
    var obfToken = function (plain) {
      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var tok = null
    try {
      tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: "sha256:" + $security.sha256(token) })
    } catch (_) {}
    if (!tok) { try { tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: obfToken(token) }) } catch (_) {} }
    if (!tok) return e.json(401, { error: "invalid_token", message: "调用凭证无效，请检查 token 是否正确" })
    var tokEnabled = false
    try { tokEnabled = tok.getBool("enabled") } catch (_) {}
    if (!tokEnabled) return e.json(401, { error: "token_disabled", message: "该调用凭证已被停用或吊销" })
    var ownerUid = String(tok.get("rh_user_id"))
    var agentId = String(tok.getString("agent_id") || "")
    var run = null
    try { run = $app.findRecordById("agent_runs", runId) } catch (_) {}
    // 归属双校验：run 属于 token 归属者，且 run 的助手与 token 绑定的助手一致
    if (!run || String(run.get("rh_user_id") || "") !== ownerUid || String(run.get("spec_id")) !== agentId) {
      return e.json(404, { error: "run_not_found", message: "运行不存在或与该凭证不匹配" })
    }
    var sanitize = function (s) {
      return String(s || "")
        .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/g, "$1***")
        .replace(/([?&"']key["']?\s*[=:]\s*["']?)[^"'\s,&}]+/g, "$1***")
        .replace(/(sk-[A-Za-z0-9_\-]{4})[A-Za-z0-9_\-]+/g, "$1***")
        .replace(/(rh[ke]_[A-Za-z0-9]{4})[A-Za-z0-9]+/g, "$1***")
    }
    var runStatus = String(run.get("status"))
    if (runStatus === "running") {
      // 内部回环驱动引擎一步：带 token 归属者 uid 复用既有 tick（claim_until 防重叠）；
      // 出站超时 25s，超时/失败不阻断状态回读（下一次 poll 继续驱动）
      try {
        $http.send({
          url: "http://127.0.0.1:7000/api/llm/agent-engine/" + encodeURIComponent(runId) + "/tick",
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Rh-User-Id": ownerUid },
          body: "{}",
          timeout: 25,
        })
      } catch (_) {}
      try { run = $app.findRecordById("agent_runs", runId) } catch (_) {}
      runStatus = String(run.get("status"))
    }
    var evRows = []
    try { evRows = $app.findRecordsByFilter("run_events", "run_id = {:rid}", "step_index,seq,created", 200, 0, { rid: runId }) } catch (_) { evRows = [] }
    var events = []
    for (var i = 0; i < evRows.length; i++) {
      var er = evRows[i]
      var content = null
      try {
        var cText = er.getString("content")
        content = cText ? JSON.parse(cText) : null
      } catch (_) {}
      if (!content || typeof content !== "object") {
        try { content = er.get("content") } catch (_) { content = {} }
      }
      var safeContent = content
      try { safeContent = JSON.parse(sanitize(JSON.stringify(content || {}))) } catch (_) { safeContent = { message: sanitize(JSON.stringify(content || {})).slice(0, 400) } }
      events.push({
        step_index: Number(er.get("step_index") || 0),
        seq: Number(er.get("seq") || 0),
        event_type: String(er.getString("event_type") || ""),
        content: safeContent,
        created: String(er.get("created") || ""),
      })
    }
    var latencyMs = 0
    if (runStatus === "succeeded" || runStatus === "failed" || runStatus === "cancelled") {
      try {
        var createdMs = new Date(String(run.get("created")).replace(" ", "T")).getTime()
        var updatedMs = new Date(String(run.get("updated")).replace(" ", "T")).getTime()
        if (!isNaN(createdMs) && !isNaN(updatedMs) && updatedMs > createdMs) latencyMs = updatedMs - createdMs
      } catch (_) {}
      try {
        var inv = $app.findFirstRecordByFilter("integration_invocations", "run_id = {:rid}", { rid: runId })
        if (inv && String(inv.getString("status")) === "running") {
          inv.set("status", runStatus === "succeeded" ? "success" : "failed")
          inv.set("latency_ms", latencyMs)
          if (runStatus !== "succeeded") inv.set("error_code", runStatus === "cancelled" ? "cancelled" : "run_failed")
          $app.save(inv)
        }
      } catch (_) {}
    }
    return e.json(200, {
      ok: true,
      run_id: runId,
      status: runStatus,
      result: String(run.get("result") || ""),
      error: sanitize(String(run.get("error") || "")),
      current_step: Number(run.get("current_step") || 0),
      max_steps: Number(run.get("max_steps") || 10),
      latency_ms: latencyMs,
      events: events,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("public agent poll error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— GET /embed/{token}：自包含嵌入聊天页（内联样式，arc 浅色风；fetch 走相对路径 ../api/public/...，
//    直连 PB 与网关 __pb 前缀两种部署形态都能正确解析）——
routerAdd("GET", "/embed/{token}", function (e) {
  try {
    var token = String(e.request.pathValue("token") || "").trim()
    var failPage = function (title, msg) {
      return e.html(404, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fdf3ec;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#1a1a1f"><div style="max-width:360px;padding:28px;text-align:center;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08)"><div style="font-size:16px;font-weight:600">' + title + '</div><div style="margin-top:10px;font-size:13px;color:#6b6b74;line-height:1.6">' + msg + '</div></div></body></html>')
    }
    if (!token || !/^rh[ek]_[A-Za-z0-9]+$/.test(token)) return failPage("嵌入不可用", "链接中的调用凭证格式不正确。")
    var obfToken = function (plain) {
      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var tok = null
    try {
      tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: "sha256:" + $security.sha256(token) })
    } catch (_) {}
    if (!tok) { try { tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: obfToken(token) }) } catch (_) {} }
    if (!tok) return failPage("嵌入不可用", "调用凭证无效，请联系站点管理员确认嵌入代码是否最新。")
    var tokEnabled = false
    try { tokEnabled = tok.getBool("enabled") } catch (_) {}
    if (!tokEnabled) return failPage("嵌入已停用", "该助手的网页嵌入已被创建者停用，暂时无法对话。")
    if (String(tok.getString("kind") || "") !== "embed") return failPage("嵌入不可用", "该凭证类型不支持网页嵌入。")
    var loadJson = function (rec, field) {
      var v = null
      try { v = rec.getString(field) } catch (_) {}
      if (!v) { try { v = rec.get(field) } catch (_) {} }
      if (v === null || v === undefined) return {}
      if (typeof v === "string") { try { return JSON.parse(v) } catch (_) { return {} } }
      if (typeof v === "object") return v
      return {}
    }
    var theme = loadJson(tok, "theme")
    var ACCENTS = { coral: "#ff5f5f", sunset: "#ff7e5f", ocean: "#3b82f6", forest: "#10b981" }
    var accent = ACCENTS[String(theme.accent || "coral")] || "#ff5f5f"
    var esc = function (s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
    }
    var title = esc(String(theme.title || "AI 助手").slice(0, 40))
    var html = '<!doctype html>\n' +
      '<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + title + '</title>\n' +
      '<style>\n' +
      ':root { --accent: ' + accent + '; }\n' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }\n' +
      'html, body { height: 100%; }\n' +
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: linear-gradient(160deg, #fdf3ec 0%, #fff7f1 55%, #fdeee4 100%); color: #1a1a1f; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }\n' +
      '.hd { display: flex; align-items: center; gap: 10px; padding: 13px 16px; background: rgba(255,255,255,.88); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(26,26,31,.07); flex-shrink: 0; }\n' +
      '.hd .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px rgba(255,95,95,.14); flex-shrink: 0; }\n' +
      '.hd .tt { font-size: 15px; font-weight: 600; letter-spacing: .01em; }\n' +
      '.hd .sub { font-size: 11px; color: #8a8a93; margin-left: auto; flex-shrink: 0; }\n' +
      '.msgs { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 10px; }\n' +
      '.b { max-width: 86%; padding: 10px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.65; word-break: break-word; white-space: pre-wrap; animation: fadeUp .25s ease; }\n' +
      '@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }\n' +
      '.b-user { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 4px; box-shadow: 0 4px 14px rgba(255,95,95,.25); }\n' +
      '.b-agent { align-self: flex-start; background: #fff; border: 1px solid rgba(26,26,31,.07); border-bottom-left-radius: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.06); }\n' +
      '.b-step { align-self: flex-start; background: rgba(255,255,255,.62); border: 1px dashed rgba(26,26,31,.16); color: #6b6b74; font-size: 12px; padding: 7px 11px; border-radius: 10px; }\n' +
      '.b-err { align-self: flex-start; background: rgba(220,38,38,.07); border: 1px solid rgba(220,38,38,.25); color: #b91c1c; font-size: 12.5px; }\n' +
      '.typing { display: inline-flex; gap: 4px; align-items: center; }\n' +
      '.typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); opacity: .5; animation: blink 1.2s infinite; }\n' +
      '.typing i:nth-child(2) { animation-delay: .2s; } .typing i:nth-child(3) { animation-delay: .4s; }\n' +
      '@keyframes blink { 0%,100% { opacity: .3; } 50% { opacity: 1; } }\n' +
      '.inp { display: flex; gap: 8px; padding: 11px 12px; background: rgba(255,255,255,.92); backdrop-filter: blur(10px); border-top: 1px solid rgba(26,26,31,.07); flex-shrink: 0; }\n' +
      '.inp textarea { flex: 1; resize: none; border: 1px solid rgba(26,26,31,.12); border-radius: 12px; padding: 9px 12px; font-size: 13.5px; font-family: inherit; line-height: 1.5; outline: none; background: #fff; color: #1a1a1f; max-height: 96px; }\n' +
      '.inp textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(255,95,95,.14); }\n' +
      '.inp button { flex-shrink: 0; border: none; cursor: pointer; background: var(--accent); color: #fff; font-size: 13.5px; font-weight: 600; font-family: inherit; border-radius: 12px; padding: 0 18px; box-shadow: 0 4px 14px rgba(255,95,95,.28); transition: transform .15s ease, opacity .15s ease; }\n' +
      '.inp button:hover { transform: scale(1.04); }\n' +
      '.inp button:disabled { opacity: .5; cursor: not-allowed; transform: none; }\n' +
      '</style>\n</head>\n<body>\n' +
      '<div class="hd"><span class="dot"></span><span class="tt" id="hdTitle">' + title + '</span><span class="sub">在线助手 · 由 Agent Studio 驱动</span></div>\n' +
      '<div class="msgs" id="msgs"></div>\n' +
      '<div class="inp"><textarea id="ta" rows="1" placeholder="输入你的任务，Enter 发送…"></textarea><button id="send" type="button">发送</button></div>\n' +
      '<script>\n' +
      '(function () {\n' +
      '  var TOKEN = "' + token + '";\n' +
      '  var msgs = document.getElementById("msgs");\n' +
      '  var ta = document.getElementById("ta");\n' +
      '  var sendBtn = document.getElementById("send");\n' +
      '  var busy = false;\n' +
      '  var sessionId = "emb_" + Math.random().toString(36).slice(2, 10) + new Date().getTime().toString(36);\n' +
      '  var qs = {};\n' +
      '  (location.search || "").replace(/^\\?/, "").split("&").forEach(function (kv) {\n' +
      '    if (!kv) return; var p = kv.split("="); qs[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");\n' +
      '  });\n' +
      '  var ACCENTS = { coral: "#ff5f5f", sunset: "#ff7e5f", ocean: "#3b82f6", forest: "#10b981" };\n' +
      '  if (qs.accent && ACCENTS[qs.accent]) document.documentElement.style.setProperty("--accent", ACCENTS[qs.accent]);\n' +
      '  if (qs.title) { var t = qs.title.slice(0, 40); document.getElementById("hdTitle").textContent = t; document.title = t; }\n' +
      '  function scrollBottom() { msgs.scrollTop = msgs.scrollHeight; }\n' +
      '  function bubble(cls, text) {\n' +
      '    var d = document.createElement("div"); d.className = "b " + cls; d.textContent = text;\n' +
      '    msgs.appendChild(d); scrollBottom(); return d;\n' +
      '  }\n' +
      '  function typingBubble() {\n' +
      '    var d = document.createElement("div"); d.className = "b b-agent typing";\n' +
      '    d.innerHTML = "<i></i><i></i><i></i>"; msgs.appendChild(d); scrollBottom(); return d;\n' +
      '  }\n' +
      '  ta.addEventListener("keydown", function (ev) {\n' +
      '    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); doSend(); }\n' +
      '  });\n' +
      '  sendBtn.addEventListener("click", doSend);\n' +
      '  bubble("b-agent", "你好，我是「" + document.getElementById("hdTitle").textContent + "」，把任务交给我吧。");\n' +
      '  function doSend() {\n' +
      '    if (busy) return;\n' +
      '    var text = ta.value.trim();\n' +
      '    if (!text) return;\n' +
      '    busy = true; sendBtn.disabled = true; ta.value = "";\n' +
      '    bubble("b-user", text);\n' +
      '    var wait = typingBubble();\n' +
      '    var rendered = 0;\n' +
      '    fetch("../api/public/agent/run", {\n' +
      '      method: "POST", headers: { "Content-Type": "application/json" },\n' +
      '      body: JSON.stringify({ token: TOKEN, input: text, session_id: sessionId })\n' +
      '    }).then(function (r) { return r.json().then(function (d) { return { code: r.status, data: d }; }); })\n' +
      '      .then(function (res) {\n' +
      '        if (res.code !== 200 || !res.data.ok) {\n' +
      '          wait.remove();\n' +
      '          bubble("b-err", (res.data && res.data.message) || ("提交失败（HTTP " + res.code + "），请稍后再试"));\n' +
      '          busy = false; sendBtn.disabled = false; return;\n' +
      '        }\n' +
      '        pollRun(res.data.run_id);\n' +
      '      })\n' +
      '      .catch(function () {\n' +
      '        wait.remove(); bubble("b-err", "网络异常，提交失败，请稍后再试");\n' +
      '        busy = false; sendBtn.disabled = false;\n' +
      '      });\n' +
      '    function pollRun(runId) {\n' +
      '      fetch("../api/public/agent/poll?token=" + encodeURIComponent(TOKEN) + "&run_id=" + encodeURIComponent(runId))\n' +
      '        .then(function (r) { return r.json().then(function (d) { return { code: r.status, data: d }; }); })\n' +
      '        .then(function (res) {\n' +
      '          if (res.code !== 200 || !res.data.ok) {\n' +
      '            wait.remove();\n' +
      '            bubble("b-err", (res.data && res.data.message) || ("查询失败（HTTP " + res.code + "）"));\n' +
      '            busy = false; sendBtn.disabled = false; return;\n' +
      '          }\n' +
      '          var d = res.data;\n' +
      '          var evs = d.events || [];\n' +
      '          for (var i = rendered; i < evs.length; i++) {\n' +
      '            var ev = evs[i] || {}; var c = ev.content || {}; var et = ev.event_type;\n' +
      '            if (et === "thinking" && c.thought) bubble("b-step", "思考：" + String(c.thought).slice(0, 120));\n' +
      '            else if (et === "tool_call" && c.tool) bubble("b-step", "调用工具：" + c.tool);\n' +
      '            else if (et === "tool_result" && c.observation) bubble("b-step", "工具结果：" + String(c.observation).slice(0, 150));\n' +
      '            else if (et === "error") bubble("b-err", String(c.message || "运行出错").slice(0, 200));\n' +
      '          }\n' +
      '          rendered = evs.length;\n' +
      '          if (d.status === "succeeded") {\n' +
      '            wait.remove();\n' +
      '            bubble("b-agent", d.result || "（本次运行没有返回文本结果）");\n' +
      '            busy = false; sendBtn.disabled = false; return;\n' +
      '          }\n' +
      '          if (d.status === "failed" || d.status === "cancelled") {\n' +
      '            wait.remove();\n' +
      '            bubble("b-err", d.error || ("运行" + (d.status === "cancelled" ? "被取消" : "失败") + "，请稍后再试"));\n' +
      '            busy = false; sendBtn.disabled = false; return;\n' +
      '          }\n' +
      '          setTimeout(function () { pollRun(runId); }, 2500);\n' +
      '        })\n' +
      '        .catch(function () {\n' +
      '          setTimeout(function () { pollRun(runId); }, 4000);\n' +
      '        });\n' +
      '    }\n' +
      '  }\n' +
      '})();\n' +
      '</' + 'script>\n</body>\n</html>'
    return e.html(200, html)
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("embed page error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— GET /embed.js?token=：悬浮球注入脚本（贴到第三方网页 body 末尾；iframe 指向 /embed/{token}）——
routerAdd("GET", "/embed.js", function (e) {
  try {
    var qp = (e.requestInfo() || {}).query || {}
    var token = String(qp.token || "").trim()
    var failJs = '// 嵌入不可用：调用凭证无效或已停用\n'
    if (!token || !/^rh[ek]_[A-Za-z0-9]+$/.test(token)) return e.html(404, failJs)
    var obfToken = function (plain) {
      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var tok = null
    try {
      tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: "sha256:" + $security.sha256(token) })
    } catch (_) {}
    if (!tok) { try { tok = $app.findFirstRecordByFilter("integration_tokens", "token_hash = {:th}", { th: obfToken(token) }) } catch (_) {} }
    if (!tok) return e.html(404, failJs)
    var tokEnabled = false
    try { tokEnabled = tok.getBool("enabled") } catch (_) {}
    if (!tokEnabled) return e.html(404, '// 嵌入已停用：创建者关闭了该助手的网页嵌入\n')
    if (String(tok.getString("kind") || "") !== "embed") return e.html(404, failJs)
    var loadJson = function (rec, field) {
      var v = null
      try { v = rec.getString(field) } catch (_) {}
      if (!v) { try { v = rec.get(field) } catch (_) {} }
      if (v === null || v === undefined) return {}
      if (typeof v === "string") { try { return JSON.parse(v) } catch (_) { return {} } }
      if (typeof v === "object") return v
      return {}
    }
    var theme = loadJson(tok, "theme")
    var ACCENTS = { coral: "#ff5f5f", sunset: "#ff7e5f", ocean: "#3b82f6", forest: "#10b981" }
    var accent = ACCENTS[String(theme.accent || "coral")] || "#ff5f5f"
    var position = String(theme.position || "bottom_right") === "bottom_left" ? "bottom_left" : "bottom_right"
    var jsTitle = String(theme.title || "AI 助手").slice(0, 40).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    var sideCss = position === "bottom_left" ? "left: 20px;" : "right: 20px;"
    var mobileCss = position === "bottom_left" ? "left: 0;" : "right: 0;"
    var js = '(function () {\n' +
      '  if (document.getElementById("rh-agent-embed-root")) return;\n' +
      '  var TOKEN = "' + token + '";\n' +
      '  var TITLE = "' + jsTitle + '";\n' +
      '  var sc = document.currentScript;\n' +
      '  var src = String((sc && sc.src) || "");\n' +
      '  var base = src.replace(/\\/embed\\.js.*$/, "");\n' +
      '  if (!base) return;\n' +
      '  var embedUrl = base + "/embed/" + encodeURIComponent(TOKEN);\n' +
      '  var css = "" +\n' +
      '    "#rh-agent-embed-root { all: initial; }" +\n' +
      '    "#rh-agent-embed-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif; }" +\n' +
      '    ".rhae-bubble { position: fixed; bottom: 20px; ' + sideCss + ' width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; background: ' + accent + '; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.22); display: flex; align-items: center; justify-content: center; z-index: 2147483001; transition: transform .18s ease; }" +\n' +
      '    ".rhae-bubble:hover { transform: scale(1.08); }" +\n' +
      '    ".rhae-bubble svg { width: 26px; height: 26px; }" +\n' +
      '    ".rhae-panel { position: fixed; bottom: 88px; ' + sideCss + ' width: 380px; max-width: calc(100vw - 32px); height: 560px; max-height: calc(100vh - 120px); border-radius: 18px; overflow: hidden; background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,.24); z-index: 2147483000; display: none; flex-direction: column; }" +\n' +
      '    ".rhae-panel.rhae-open { display: flex; animation: rhaeIn .22s ease; }" +\n' +
      '    "@keyframes rhaeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }" +\n' +
      '    ".rhae-hd { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: ' + accent + '; color: #fff; flex-shrink: 0; }" +\n' +
      '    ".rhae-hd .rhae-tt { font-size: 14px; font-weight: 600; }" +\n' +
      '    ".rhae-hd .rhae-x { margin-left: auto; border: none; background: rgba(255,255,255,.18); color: #fff; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; }" +\n' +
      '    ".rhae-frame { flex: 1; border: none; width: 100%; }" +\n' +
      '    "@media (max-width: 480px) { .rhae-panel { bottom: 0; ' + mobileCss + ' width: 100vw; max-width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; } }";\n' +
      '  var style = document.createElement("style");\n' +
      '  style.textContent = css;\n' +
      '  document.head.appendChild(style);\n' +
      '  var root = document.createElement("div");\n' +
      '  root.id = "rh-agent-embed-root";\n' +
      '  root.innerHTML = \'<div class="rhae-panel" id="rhaePanel"><div class="rhae-hd"><span class="rhae-tt"></span><button class="rhae-x" type="button" id="rhaeClose" aria-label="关闭">×</button></div><iframe class="rhae-frame" id="rhaeFrame" title="" allow="clipboard-write"></iframe></div><button class="rhae-bubble" type="button" id="rhaeBubble" aria-label="打开在线助手"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg></button>\';\n' +
      '  var mount = function () {\n' +
      '    document.body.appendChild(root);\n' +
      '    var panel = document.getElementById("rhaePanel");\n' +
      '    var frame = document.getElementById("rhaeFrame");\n' +
      '    var bubble = document.getElementById("rhaeBubble");\n' +
      '    var closeBtn = document.getElementById("rhaeClose");\n' +
      '    panel.querySelector(".rhae-tt").textContent = TITLE;\n' +
      '    frame.title = TITLE;\n' +
      '    var loaded = false;\n' +
      '    bubble.addEventListener("click", function () {\n' +
      '      if (!loaded) { frame.src = embedUrl; loaded = true; }\n' +
      '      panel.classList.add("rhae-open");\n' +
      '    });\n' +
      '    closeBtn.addEventListener("click", function () { panel.classList.remove("rhae-open"); });\n' +
      '  };\n' +
      '  if (document.body) mount();\n' +
      '  else document.addEventListener("DOMContentLoaded", mount);\n' +
      '})();\n'
    return e.html(200, js)
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("embed js error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
