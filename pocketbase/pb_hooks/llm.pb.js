/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/llm.pb.js — 站内 LLM 中转（自备密钥批次：内置平台通道已移除）
//
// 路由约定:
//   POST /api/llm/chat   body.model=<模型名提示, 可选> / body.connection_id=<可选, 指定连接>
//   POST /api/llm/poll   body.request_id=<same request_id>
//   GET  /api/llm/models 返回当前登录用户已启用模型连接里的模型清单
//
// 密钥来源（自备密钥批次）:
//   只从服务端 model_connections 记录取（混淆存储、服务端反混淆），绝不经前端；
//   连接解析顺序：body.connection_id（需归属当前用户且启用）→ 当前用户默认连接
//   （第一个启用且 models 非空的）。无连接 → 400 model_connection_required。
//   注意：Goja 每个 routerAdd 回调独立作用域，helper 一律定义在回调内部。
//
// 稳定性契约:
//   /chat 同步 $http.send（≤120s），客户端会提前放弃等待并转 /poll；本 handler 必须继续跑完并写 llm_jobs。
//   PB 不允许字段名叫 model → 表字段用 model_name。

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("llm_jobs") } catch (_) { existing = null }
    if (existing) {
      var ownerField = null
      try { ownerField = existing.fields.getByName("rh_user_id") } catch (_) {}
      if (!ownerField) {
        existing.fields.add(new Field({ name: "rh_user_id", type: "text", max: 120 }))
        $app.save(existing)
      }
    } else {
      var col = new Collection({
        type: "base", name: "llm_jobs",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: "request_id", type: "text", required: true, max: 160 },
          { name: "rh_user_id", type: "text", max: 120 },
          { name: "model_name", type: "text", required: true, max: 80 },
          { name: "page", type: "text", max: 64 },
          { name: "status", type: "text", required: true, max: 32 },
          { name: "result_text", type: "text", max: 80000 },
          { name: "error_message", type: "text", max: 4000 },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_llm_jobs_request_id ON llm_jobs (request_id)"],
      })
      $app.save(col)
      try { $app.logger().info("llm_jobs created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("llm_jobs bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

routerAdd("GET", "/api/llm/models", function (e) {
  try {
    var h = e.requestInfo().headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录账号" })
    var rows = []
    try { rows = $app.findRecordsByFilter("model_connections", "rh_user_id = {:uid}", "-created", 20, 0, { uid: uid }) } catch (_) {}
    rows = (rows || []).filter(function (r) { try { return r.getBool("enabled") } catch (_e) { return false } })
    var conn = null
    for (var ri = 0; ri < rows.length; ri++) {
      var mList0 = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(rows[ri])
      if (Array.isArray(mList0) && mList0.length > 0) { conn = rows[ri]; break }
    }
    var items = []
    if (conn) {
      var mListRaw = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(conn)
      var mList = Array.isArray(mListRaw) ? mListRaw : []
      for (var mi = 0; mi < mList.length; mi++) {
        items.push({ model: String(mList[mi]), connection_id: String(conn.id), provider: String(conn.getString("provider") || "openai") })
      }
    }
    return e.json(200, { ok: true, models: items })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "llm_models_error", message: msg, fingerprint: msg.substring(0, 80) })
  }
})

routerAdd("POST", "/api/llm/chat", function (e) {
  // 服务端混淆密钥反混淆（与 model_connections_api 的 obfKey 对应：字符码 +3 点分）
  function deobfKey(stored) {
    var s = String(stored || "")
      if (s.indexOf("gcm1:") === 0) {
        var _secretKey = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
        if (_secretKey.length !== 32) return ""
        try { return String($security.decrypt(s.substring(5), _secretKey)) } catch (_) { return "" }
      }

    if (!s) return ""
    if (s.indexOf(".") < 0 && !/^[0-9]+$/.test(s)) return s
    var parts = s.split(".")
    var out = ""
    for (var di = 0; di < parts.length; di++) {
      var dn = parseInt(parts[di], 10)
      if (isNaN(dn)) return s
      out += String.fromCharCode(dn - 3)
    }
    return out
  }
  // 解析连接：指定 id（归属+启用校验）→ 默认（第一个启用且 models 非空）
  function resolveConn(uid, wantedId) {
    var rows = []
    try {
      rows = $app.findRecordsByFilter("model_connections", "rh_user_id = {:uid}", "-created", 20, 0, { uid: uid })
      rows = (rows || []).filter(function (r) { try { return r.getBool("enabled") } catch (_e) { return false } })
    } catch (_) {}
    if (wantedId) {
      for (var wi = 0; wi < rows.length; wi++) {
        if (String(rows[wi].id) === String(wantedId)) return rows[wi]
      }
      return null
    }
    for (var ri = 0; ri < rows.length; ri++) {
      var mList = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(rows[ri])
      if (Array.isArray(mList) && mList.length > 0) return rows[ri]
    }
    return null
  }
  // 三协议出站 → { ok, content } / { ok:false, error, detail }
  function callConn(conn, modelId, messages, maxTokens, timeoutSec, strictDebugBudget) {
    var base = String(conn.getString("base_url") || "").replace(/\/+$/, "")
    var key = deobfKey(String(conn.getString("api_key") || ""))
    var prov = "openai"
    try { prov = String(conn.getString("provider") || "") } catch (_) {}
    if (prov !== "anthropic" && prov !== "gemini") prov = "openai"
    if (!base && prov === "anthropic") base = "https://api.anthropic.com/v1"
    if (!base && prov === "gemini") base = "https://generativelanguage.googleapis.com/v1beta"
    if (!base || !key) return { ok: false, error: "custom_connection_invalid", detail: "模型连接配置不完整，请到「模型连接」页检查" }
    var sanitize = function (s) { return String(s || "").replace(/([?&]key=)[^&\s"']+/g, "$1***") }
    var toStr = function (r) {
      try {
        if (!r || !r.raw) return ""
        return typeof r.raw === "string" ? r.raw : String(r.raw)
      } catch (_) { return "" }
    }
    var maxT = Number(maxTokens) > 0 ? Number(maxTokens) : 4096
    var res = null
    try {
      if (prov === "anthropic") {
        var aSystem = ""
        var aMsgs = []
        for (var ai = 0; ai < messages.length; ai++) {
          var am = messages[ai] || {}
          if (String(am.role || "user") === "system") aSystem = aSystem ? aSystem + "\n\n" + String(am.content || "") : String(am.content || "")
          else aMsgs.push({ role: String(am.role || "user") === "assistant" ? "assistant" : "user", content: String(am.content || "") })
        }
        if (aMsgs.length === 0) aMsgs.push({ role: "user", content: "请继续。" })
        var aBody = { model: modelId, max_tokens: maxT, messages: aMsgs }
        if (aSystem) aBody.system = aSystem
        res = $http.send({ url: base + "/messages", method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify(aBody), timeout: timeoutSec })
      } else if (prov === "gemini") {
        var gInstr = ""
        var gContents = []
        for (var gi = 0; gi < messages.length; gi++) {
          var gm = messages[gi] || {}
          if (String(gm.role || "user") === "system") gInstr = gInstr ? gInstr + "\n\n" + String(gm.content || "") : String(gm.content || "")
          else gContents.push({ role: String(gm.role || "user") === "assistant" ? "model" : "user", parts: [{ text: String(gm.content || "") }] })
        }
        if (gContents.length === 0) gContents.push({ role: "user", parts: [{ text: "请继续。" }] })
        var gBody = { contents: gContents }
        // Gemini requires an explicit generationConfig for the debug output
        // cap; otherwise the stated 512-token budget would not be enforced.
        if (strictDebugBudget) gBody.generationConfig = { maxOutputTokens: maxT }
        if (gInstr) gBody.system_instruction = { parts: [{ text: gInstr }] }
        res = $http.send({ url: base + "/models/" + encodeURIComponent(modelId) + ":generateContent?key=" + encodeURIComponent(key), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gBody), timeout: timeoutSec })
      } else {
        // 推理型模型可能把 max_tokens 全耗在 reasoning 上（finish_reason=length 且 content 空）→ 加大预算重试一次
        var maxTry = maxT
        // Model-node debug is explicitly single-shot. Never multiply its
        // token budget or silently call the provider a second time.
        for (var ati = 0; ati < (strictDebugBudget ? 1 : 2); ati++) {
          res = $http.send({ url: base + "/chat/completions", method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ model: modelId, messages: messages, max_tokens: maxTry, stream: false }), timeout: timeoutSec })
          if (!res || res.statusCode < 200 || res.statusCode >= 300) break
          var pd = null
          try { pd = JSON.parse(toStr(res)) } catch (_) {}
          var pch = ((pd && pd.choices) || [])[0] || {}
          var pc = String((pch.message || {}).content || "")
          var fr = String(pch.finish_reason || "")
          if (pc || fr !== "length" || maxTry >= 16384) break
          maxTry = Math.min(16384, maxTry * 4)
        }
      }
    } catch (err) {
      return { ok: false, error: "llm_request_failed", detail: sanitize(String((err && err.message) || err)).slice(0, 300) }
    }
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      return { ok: false, error: "llm_http_" + (res ? res.statusCode : 0), detail: sanitize(toStr(res)).slice(0, 300) }
    }
    var data = null
    try { data = JSON.parse(toStr(res)) } catch (_) {}
    var content = ""
    if (prov === "anthropic") {
      var blocks = (data && data.content) || []
      for (var bi = 0; bi < blocks.length; bi++) if (String((blocks[bi] || {}).type || "") === "text") content += String((blocks[bi] || {}).text || "")
    } else if (prov === "gemini") {
      var parts = ((((data && data.candidates) || [])[0] || {}).content || {}).parts || []
      for (var pi = 0; pi < parts.length; pi++) if ((parts[pi] || {}).text !== undefined && parts[pi].text !== null) content += String(parts[pi].text)
    } else {
      var choices = (data && data.choices) || []
      content = String(((choices[0] && choices[0].message) || {}).content || "")
    }
    if (!content) return { ok: false, error: "llm_empty_content", detail: "" }
    // Return only bounded token counts, never the raw provider response,
    // request headers, API key or billing account details.
    var rawUsage = prov === "anthropic" ? (data && data.usage) :
      prov === "gemini" ? (data && data.usageMetadata) : (data && data.usage)
    var inUsage = prov === "anthropic" ? rawUsage && rawUsage.input_tokens :
      prov === "gemini" ? rawUsage && rawUsage.promptTokenCount :
      rawUsage && rawUsage.prompt_tokens
    var outUsage = prov === "anthropic" ? rawUsage && rawUsage.output_tokens :
      prov === "gemini" ? rawUsage && rawUsage.candidatesTokenCount :
      rawUsage && rawUsage.completion_tokens
    var safeCount = function (value) {
      if (value === null || value === undefined || value === "") return null
      var parsed = Number(value)
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10000000 ? parsed : null
    }
    return { ok: true, content: content, usage: {
      input_tokens: safeCount(inUsage), output_tokens: safeCount(outUsage),
    } }
  }
  function ensureLlmJobsColl() {
    try { return $app.findCollectionByNameOrId("llm_jobs") } catch (_) {}
    var col = new Collection({
      type: "base", name: "llm_jobs",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "request_id", type: "text", required: true, max: 160 },
        { name: "rh_user_id", type: "text", max: 120 },
        { name: "model_name", type: "text", required: true, max: 80 },
        { name: "page", type: "text", max: 64 },
        { name: "status", type: "text", required: true, max: 32 },
        { name: "result_text", type: "text", max: 80000 },
        { name: "error_message", type: "text", max: 4000 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_llm_jobs_request_id ON llm_jobs (request_id)"],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("llm_jobs")
  }
  function findOrCreateJob(coll, requestId, modelName, page, uid) {
    var rec = null
    try { rec = $app.findFirstRecordByFilter("llm_jobs", "request_id = {:r} && rh_user_id = {:uid}", { r: requestId, uid: uid }) } catch (_) {}
    var existing = !!rec
    if (!rec) {
      rec = new Record(coll)
      rec.set("request_id", requestId)
      rec.set("rh_user_id", uid)
      rec.set("model_name", modelName)
      rec.set("page", page || "")
      rec.set("status", "pending")
      $app.save(rec)
    }
    return { record: rec, existing: existing }
  }

  var requestId = ""
  var jobRec = null

  try {
    var hh = e.requestInfo().headers || {}
    var uid = String(hh["x_rh_user_id"] || hh["X-Rh-User-Id"] || hh["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录账号" })

    var body = e.requestInfo().body || {}
    // A Workflow model-node debug request is cost-bearing. Browsers can be
    // bypassed, so enforce scope and budgets on the server as well.
    // Other Agent/Workflow model calls preserve their existing contracts.
    var isNodeDebug = String(body.page || "") === "workflow_node_debug"
    // Skill A/B text comparison shares the strict, bounded, read-only model
    // contract with V28 blind planning: two explicit messages, no tools.
    var isBlindBenchmark = String(body.page || "") === "agent_v28_blind" ||
      String(body.page || "") === "skill_ab_review"
    if (isBlindBenchmark) {
      var selectedConnection = String(body.connection_id || "").trim()
      var selectedModel = String(body.model || "").trim()
      var maximum = Number(body.max_tokens)
      var blindMessages = body.messages
      if (!selectedConnection || !selectedModel || body.strict_model !== true)
        return e.json(400, { error: "blind_binding_required" })
      if (!Number.isSafeInteger(maximum) || maximum < 256 || maximum > 9500)
        return e.json(400, { error: "blind_output_budget_invalid" })
      if (!Array.isArray(blindMessages) || blindMessages.length !== 2 ||
          !blindMessages[0] || blindMessages[0].role !== "system" ||
          !blindMessages[1] || blindMessages[1].role !== "user" ||
          typeof blindMessages[0].content !== "string" ||
          typeof blindMessages[1].content !== "string" ||
          blindMessages[0].content.length > 8000 ||
          blindMessages[1].content.length > 8000 ||
          !blindMessages[0].content || !blindMessages[1].content ||
          !/^[a-zA-Z0-9-]{12,120}$/.test(String(body.request_id || "")))
        return e.json(400, { error: "blind_request_invalid" })
      // An explicit employee action still initiates each cost-bearing call.
      // This route never accepts tools and never invokes any action endpoint.
    }
    if (isNodeDebug) {
      var selectedConnection = String(body.connection_id || "").trim()
      var selectedModel = String(body.model || "").trim()
      var tokenLimit = Number(body.max_tokens)
      var debugMessages = body.messages
      if (!selectedConnection || !selectedModel || body.strict_model !== true)
        return e.json(400, { error: "debug_binding_required", message: "节点调试必须明确指定当前员工授权的连接和模型" })
      if (!isFinite(tokenLimit) || tokenLimit < 16 || tokenLimit > 512 || Math.floor(tokenLimit) !== tokenLimit)
        return e.json(400, { error: "debug_token_limit", message: "单节点真实调试的输出上限为 512 tokens" })
      if (!Array.isArray(debugMessages) || debugMessages.length !== 1 ||
          !debugMessages[0] || String(debugMessages[0].role || "") !== "user" ||
          typeof debugMessages[0].content !== "string" ||
          !debugMessages[0].content.trim() || debugMessages[0].content.length > 8000)
        return e.json(400, { error: "debug_prompt_limit", message: "调试只接受单条不超过 8000 字符的用户提示词" })
      if (!/^[a-zA-Z0-9-]{12,120}$/.test(String(body.request_id || "")))
        return e.json(400, { error: "debug_request_id_invalid", message: "单节点调试请求编号无效" })
    }
    var conn = resolveConn(uid, String(body.connection_id || "").trim())
    if (!conn) {
      return e.json(400, {
        error: "model_connection_required",
        message: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接（使用你自己的模型服务与密钥）",
      })
    }
    var mList = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(conn)
    if (!Array.isArray(mList)) mList = []
    var wanted = String(body.model || "").trim()
    // Opt-in strict binding for the workflow model-node debugger. The normal
    // chat endpoint retains its legacy fallback contract; debug never runs a
    // different model when a chosen model has been disabled or removed.
    if (body.strict_model === true && (!wanted || mList.indexOf(wanted) < 0)) {
      return e.json(400, {
        error: "model_not_permitted",
        message: "节点调试的模型已不在当前账号授权连接中，请刷新模型列表后重新选择",
      })
    }
    var modelName = ""
    if (wanted && mList.indexOf(wanted) >= 0) modelName = wanted
    else if (mList.length > 0) modelName = String(mList[0])
    else modelName = wanted || "default"

    var messages = body.messages
    if (!messages || !messages.length) return e.json(400, { error: "messages_required", message: "缺少 messages" })

    requestId = String(body.request_id || "").trim()
    if (!requestId) return e.json(400, { error: "request_id_required", message: "缺少 request_id (前端必须生成唯一 ID 传入, 用于超时后查询)" })

    var page = String(body.page || "")
    var coll = ensureLlmJobsColl()
    var jobState = findOrCreateJob(coll, requestId, modelName, page, uid)
    jobRec = jobState.record

    var existingStatus = jobRec.getString("status")
    if (existingStatus === "success" || existingStatus === "failed") {
      return e.json(200, {
        ok: existingStatus === "success",
        cached: true, status: existingStatus,
        text: jobRec.getString("result_text"),
        error: jobRec.getString("error_message"),
        model: jobRec.getString("model_name"),
      })
    }

    // Previously claimed debugs must not trigger duplicate provider charges.
    // The client queries /api/llm/poll using the original request ID.
    if ((isNodeDebug || isBlindBenchmark) && jobState.existing &&
        (existingStatus === "running" || existingStatus === "pending")) {
      return e.json(200, { ok: false, status: existingStatus,
        text: "", error: "", model: jobRec.getString("model_name") })
    }

    jobRec.set("status", "running")
    $app.save(jobRec)

    var maxTokens = Number(body.max_tokens || 8192)
    if (!maxTokens || maxTokens < 16) maxTokens = 8192
    var ret = callConn(conn, modelName, messages, maxTokens, 120, isNodeDebug || isBlindBenchmark)
    if (!ret || ret.ok !== true) {
      var em = String((ret && ret.error) || "llm_failed") + (ret && ret.detail ? ": " + ret.detail : "")
      jobRec.set("status", "failed")
      jobRec.set("error_message", em.substring(0, 4000))
      $app.save(jobRec)
      var code = String((ret && ret.error) || "llm_failed")
      if (code === "model_connection_required" || code === "custom_connection_invalid") {
        return e.json(400, { error: code, message: String((ret && ret.detail) || em), fingerprint: em.substring(0, 80) })
      }
      return e.json(502, { error: "llm_failed", message: em, fingerprint: em.substring(0, 80) })
    }

    var text = String(ret.content || "")
    jobRec.set("status", "success")
    jobRec.set("result_text", text.substring(0, 80000))
    $app.save(jobRec)

    return e.json(200, { ok: true, status: "success", model: modelName, text: text,
      usage: isBlindBenchmark ? (ret.usage || null) : null })
  } catch (err) {
    var msg = String(err && err.message || err)
    if (jobRec) {
      try { jobRec.set("status", "failed"); jobRec.set("error_message", msg.substring(0, 4000)); $app.save(jobRec) } catch (_) {}
    }
    try { $app.logger().error("llm_error: " + msg) } catch (_) {}
    return e.json(500, { error: "llm_error", message: msg, fingerprint: msg.substring(0, 80) })
  }
})

routerAdd("POST", "/api/llm/poll", function (e) {
  try {
    var h = e.requestInfo().headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var body = e.requestInfo().body || {}
    var requestId = String(body.request_id || "").trim()
    if (!requestId) return e.json(400, { error: "request_id_required" })

    var rec = null
    try { rec = $app.findFirstRecordByFilter("llm_jobs", "request_id = {:r} && rh_user_id = {:uid}", { r: requestId, uid: uid }) } catch (_) {}
    if (!rec) return e.json(200, { ok: false, status: "not_found" })

    var status = rec.getString("status")
    return e.json(200, {
      ok: status === "success",
      status: status,
      text: status === "success" ? rec.getString("result_text") : "",
      error: status === "failed" ? rec.getString("error_message") : "",
      model: rec.getString("model_name"),
    })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "poll_error", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
