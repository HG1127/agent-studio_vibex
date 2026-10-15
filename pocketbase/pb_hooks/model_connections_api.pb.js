// model_connections_api.pb.js — 模型连接管理（脱敏读写 + 连通性代理测试）
// 表结构由 MCP install_business_collection 装（model_connections.pb.js，仅 create/update/delete）。
// 本文件是前端唯一数据通路：所有响应脱敏（绝不回显 api_key 明文，只给 api_key_tail 尾4位），
// 所有路由按 X-Rh-User-Id 校验归属，非本人一律 404。
// api_key 落库前做可逆混淆存储（字符码 +3 点分），任何通用路由读到的都不是明文。
// 代理测试：POST /api/model-connections/test → $http.send GET {base_url}/models，15s 超时。
// Goja 铁律：全部 var、new Date().getTime()、helper 就地定义、每个回调 self-contained、
// 5xx 一律 { error, message, fingerprint }。

routerAdd("GET", "/api/model-connections", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })

    var maskRecord = function (rec) {
      var modelsStr = ""
      try {
        modelsStr = rec.getString("models")
      } catch (_) {
        modelsStr = ""
      }
      var modelIds = []
      if (modelsStr) {
        try {
          var mp = JSON.parse(modelsStr)
          if (mp && typeof mp.length === "number") {
            for (var mi = 0; mi < mp.length; mi++) modelIds.push(String(mp[mi]))
          }
        } catch (_) {}
      }
      var checkedStr = ""
      try {
        checkedStr = String(rec.getString("last_checked_at") || "")
      } catch (_) {}
      if (checkedStr.indexOf("0001-01-01") === 0) checkedStr = ""
      var latency = 0
      try {
        latency = Number(rec.getInt("last_latency_ms") || 0)
      } catch (_) {}
      var enabledVal = false
      try {
        enabledVal = rec.getBool("enabled")
      } catch (_) {}
      var providerVal = "openai"
      try {
        providerVal = String(rec.getString("provider") || "")
      } catch (_) {}
      if (providerVal !== "anthropic" && providerVal !== "gemini") providerVal = "openai"
      return {
        id: String(rec.id),
        name: String(rec.getString("name") || ""),
        provider: providerVal,
        base_url: String(rec.getString("base_url") || ""),
        api_key_tail: String(rec.getString("api_key_tail") || ""),
        enabled: enabledVal,
        status: String(rec.getString("status") || "untested"),
        last_latency_ms: latency,
        last_checked_at: checkedStr,
        models: modelIds,
        last_error: String(rec.getString("last_error") || ""),
        created: String(rec.getString("created") || ""),
        updated: String(rec.getString("updated") || ""),
      }
    }

    var rows = []
    try {
      // 连通优先批次：登录权限控制暂不启用，连接清单按单工作区共享（恢复真登录后改回 rh_user_id 过滤）
      rows = $app.findRecordsByFilter("model_connections", "rh_user_id = {:uid}", "-created", 200, 0, { uid: uid })
    } catch (_) {
      rows = []
    }
    var items = []
    for (var i = 0; i < rows.length; i++) items.push(maskRecord(rows[i]))
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("model_connections list error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/model-connections", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}

    var normUrl = function (raw) {
      var u = String(raw || "").trim()
      if (!/^https?:\/\//i.test(u)) return ""
      while (u.length > 1 && u.charAt(u.length - 1) === "/") u = u.slice(0, u.length - 1)
      return u
    }
    var obfKey = function (plain) {
      var _secretKey = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
      if (_secretKey.length === 32) return "gcm1:" + $security.encrypt(String(plain), _secretKey)
      if ($os.getenv("AGENT_STUDIO_STRICT_SECRETS") === "true") throw new Error("secret_encryption_key_required")

      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }

    var normProvider = function (raw) {
      var p = String(raw || "").trim().toLowerCase()
      if (p === "anthropic" || p === "gemini") return p
      return "openai"
    }
    var OFFICIAL_BASE = {
      anthropic: "https://api.anthropic.com/v1",
      gemini: "https://generativelanguage.googleapis.com/v1beta",
    }

    var nameVal = String(body.name || "").trim().slice(0, 100)
    var providerVal = normProvider(body.provider)
    var baseUrl = normUrl(body.base_url)
    if (!baseUrl && OFFICIAL_BASE[providerVal]) baseUrl = OFFICIAL_BASE[providerVal]
    var apiKey = String(body.api_key || "").trim()
    if (!nameVal) return e.json(400, { error: "bad_request", message: "请填写连接名称" })
    if (!baseUrl) return e.json(400, { error: "bad_request", message: "Base URL 必须以 http:// 或 https:// 开头（Anthropic / Gemini 可留空使用官方默认地址）" })
    if (!apiKey) return e.json(400, { error: "bad_request", message: "请填写 API Key" })
    var normManualModels = function (raw) {
      var out = []
      var arr = null
      if (Array.isArray(raw)) arr = raw
      else if (typeof raw === "string") arr = raw.split(/[,，\n;；]+/)
      if (!arr) return out
      for (var mi = 0; mi < arr.length && out.length < 300; mi++) {
        var ms = String(arr[mi] || "").trim()
        if (ms) out.push(ms.slice(0, 200))
      }
      return out
    }
    var manualModels = normManualModels(body.models)

    var col = $app.findCollectionByNameOrId("model_connections")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("name", nameVal)
    rec.set("provider", providerVal)
    rec.set("base_url", baseUrl)
    rec.set("api_key", obfKey(apiKey))
    rec.set("api_key_tail", apiKey.slice(-4))
    rec.set("enabled", true)
    rec.set("status", "untested")
    rec.set("last_latency_ms", 0)
    rec.set("models", manualModels)
    rec.set("last_error", "")
    $app.save(rec)

    return e.json(200, {
      ok: true,
      item: {
        id: String(rec.id),
        name: nameVal,
        provider: providerVal,
        base_url: baseUrl,
        api_key_tail: apiKey.slice(-4),
        enabled: true,
        status: "untested",
        last_latency_ms: 0,
        last_checked_at: "",
        models: manualModels,
        last_error: "",
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("model_connections create error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("PATCH", "/api/model-connections/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try {
      rec = $app.findRecordById("model_connections", id)
    } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "连接不存在或已删除" })
    }
    var body = (e.requestInfo() || {}).body || {}

    var normUrl = function (raw) {
      var u = String(raw || "").trim()
      if (!/^https?:\/\//i.test(u)) return ""
      while (u.length > 1 && u.charAt(u.length - 1) === "/") u = u.slice(0, u.length - 1)
      return u
    }
    var obfKey = function (plain) {
      var _secretKey = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
      if (_secretKey.length === 32) return "gcm1:" + $security.encrypt(String(plain), _secretKey)
      if ($os.getenv("AGENT_STUDIO_STRICT_SECRETS") === "true") throw new Error("secret_encryption_key_required")

      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }

    var normProvider = function (raw) {
      var p = String(raw || "").trim().toLowerCase()
      if (p === "anthropic" || p === "gemini") return p
      return "openai"
    }
    var OFFICIAL_BASE = {
      anthropic: "https://api.anthropic.com/v1",
      gemini: "https://generativelanguage.googleapis.com/v1beta",
    }

    if (body.provider !== undefined && body.provider !== null) {
      var provVal = normProvider(body.provider)
      var curProv = "openai"
      try {
        curProv = String(rec.getString("provider") || "")
      } catch (_) {}
      if (curProv !== "anthropic" && curProv !== "gemini") curProv = "openai"
      if (provVal !== curProv) {
        rec.set("provider", provVal)
        rec.set("status", "untested")
        rec.set("models", [])
        rec.set("last_error", "")
        // 切换类型后旧地址协议不匹配：未显式给新地址时，anthropic/gemini 回落官方默认地址
        var hasNewBase = body.base_url !== undefined && body.base_url !== null && String(body.base_url).trim() !== ""
        if (!hasNewBase && OFFICIAL_BASE[provVal]) rec.set("base_url", OFFICIAL_BASE[provVal])
      }
    }

    if (body.name !== undefined && body.name !== null) {
      var nameVal = String(body.name || "").trim().slice(0, 100)
      if (!nameVal) return e.json(400, { error: "bad_request", message: "连接名称不能为空" })
      rec.set("name", nameVal)
    }
    if (body.base_url !== undefined && body.base_url !== null && String(body.base_url).trim() !== "") {
      var baseUrl = normUrl(body.base_url)
      if (!baseUrl) return e.json(400, { error: "bad_request", message: "Base URL 必须以 http:// 或 https:// 开头" })
      rec.set("base_url", baseUrl)
    }
    if (body.api_key !== undefined && body.api_key !== null && String(body.api_key).trim() !== "") {
      var apiKey = String(body.api_key).trim()
      rec.set("api_key", obfKey(apiKey))
      rec.set("api_key_tail", apiKey.slice(-4))
      rec.set("status", "untested")
      rec.set("models", [])
      rec.set("last_error", "")
    }
    if (body.enabled !== undefined && body.enabled !== null) {
      rec.set("enabled", body.enabled === true)
    }
    if (body.models !== undefined && body.models !== null) {
      var normManualModels2 = function (raw) {
        var out = []
        var arr = null
        if (Array.isArray(raw)) arr = raw
        else if (typeof raw === "string") arr = raw.split(/[,，\n;；]+/)
        if (!arr) return out
        for (var mi = 0; mi < arr.length && out.length < 300; mi++) {
          var ms = String(arr[mi] || "").trim()
          if (ms) out.push(ms.slice(0, 200))
        }
        return out
      }
      rec.set("models", normManualModels2(body.models))
    }
    $app.save(rec)

    var modelsStr = ""
    try {
      modelsStr = rec.getString("models")
    } catch (_) {}
    var modelIds = []
    if (modelsStr) {
      try {
        var mp = JSON.parse(modelsStr)
        if (mp && typeof mp.length === "number") {
          for (var mi = 0; mi < mp.length; mi++) modelIds.push(String(mp[mi]))
        }
      } catch (_) {}
    }
    var checkedStr = ""
    try {
      checkedStr = String(rec.getString("last_checked_at") || "")
    } catch (_) {}
    if (checkedStr.indexOf("0001-01-01") === 0) checkedStr = ""
    var enabledOut = false
    try {
      enabledOut = rec.getBool("enabled")
    } catch (_) {}
    var providerOut = "openai"
    try {
      providerOut = String(rec.getString("provider") || "")
    } catch (_) {}
    if (providerOut !== "anthropic" && providerOut !== "gemini") providerOut = "openai"
    return e.json(200, {
      ok: true,
      item: {
        id: String(rec.id),
        name: String(rec.getString("name") || ""),
        provider: providerOut,
        base_url: String(rec.getString("base_url") || ""),
        api_key_tail: String(rec.getString("api_key_tail") || ""),
        enabled: enabledOut,
        status: String(rec.getString("status") || "untested"),
        last_latency_ms: Number(rec.getInt("last_latency_ms") || 0),
        last_checked_at: checkedStr,
        models: modelIds,
        last_error: String(rec.getString("last_error") || ""),
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("model_connections patch error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/model-connections/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try {
      rec = $app.findRecordById("model_connections", id)
    } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "连接不存在或已删除" })
    }
    $app.delete(rec)
    return e.json(200, { ok: true, id: id })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("model_connections delete error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/model-connections/test", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}

    var normUrl = function (raw) {
      var u = String(raw || "").trim()
      if (!/^https?:\/\//i.test(u)) return ""
      while (u.length > 1 && u.charAt(u.length - 1) === "/") u = u.slice(0, u.length - 1)
      return u
    }
    var deobfKey = function (stored) {
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
      for (var i = 0; i < parts.length; i++) {
        var n = parseInt(parts[i], 10)
        if (isNaN(n)) return s
        out += String.fromCharCode(n - 3)
      }
      return out
    }
    var normProvider = function (raw) {
      var p = String(raw || "").trim().toLowerCase()
      if (p === "openai" || p === "anthropic" || p === "gemini") return p
      return ""
    }
    var OFFICIAL_BASE = {
      anthropic: "https://api.anthropic.com/v1",
      gemini: "https://generativelanguage.googleapis.com/v1beta",
    }
    var PROVIDER_LABEL = { openai: "OpenAI 兼容", anthropic: "Anthropic", gemini: "Gemini" }
    // Gemini 的 key 拼在 URL query 上：任何错误详情/日志先抹掉 key= 值再外发
    var sanitizeDetail = function (s) {
      return String(s || "").replace(/([?&]key=)[^&\s"']+/g, "$1***")
    }
    var extractIds = function (data, prov) {
      var ids = []
      if (!data || typeof data !== "object") return ids
      if (prov === "gemini") {
        var garr = Array.isArray(data.models) ? data.models : []
        for (var gi = 0; gi < garr.length && ids.length < 300; gi++) {
          var git = garr[gi]
          if (git && typeof git === "object" && git.name) {
            var gname = String(git.name)
            if (gname.indexOf("models/") === 0) gname = gname.slice(7)
            if (gname) ids.push(gname.slice(0, 200))
          }
        }
        return ids
      }
      var arr = null
      if (Array.isArray(data)) arr = data
      else if (data.data && Array.isArray(data.data)) arr = data.data
      else if (data.models && Array.isArray(data.models)) arr = data.models
      if (!arr) return ids
      for (var i = 0; i < arr.length && ids.length < 300; i++) {
        var it = arr[i]
        if (typeof it === "string" && it) ids.push(it.slice(0, 200))
        else if (it && typeof it === "object" && it.id) ids.push(String(it.id).slice(0, 200))
      }
      return ids
    }

    var connRec = null
    var baseUrl = ""
    var apiKey = ""
    var providerVal = "openai"
    var connId = String(body.connection_id || "").trim()
    var bodyProvider = normProvider(body.provider)
    if (connId) {
      try {
        connRec = $app.findRecordById("model_connections", connId)
      } catch (_) {}
      if (!connRec || String(connRec.get("rh_user_id") || "") !== uid) {
        return e.json(404, { error: "not_found", message: "连接不存在或已删除" })
      }
      var recProvider = normProvider(connRec.getString("provider")) || "openai"
      if (bodyProvider && bodyProvider !== recProvider) {
        // 表单里切换了类型（未保存先测）：旧地址协议不匹配，只认 body 地址或官方默认地址
        providerVal = bodyProvider
        baseUrl = normUrl(body.base_url)
        if (!baseUrl && OFFICIAL_BASE[providerVal]) baseUrl = OFFICIAL_BASE[providerVal]
        if (!baseUrl) return e.json(400, { error: "bad_request", message: "切换接口类型后需重新填写 Base URL（Anthropic / Gemini 可留空使用官方默认地址）" })
      } else {
        providerVal = recProvider
        baseUrl = normUrl(body.base_url) || normUrl(connRec.getString("base_url"))
        if (!baseUrl && OFFICIAL_BASE[providerVal]) baseUrl = OFFICIAL_BASE[providerVal]
        if (!baseUrl) return e.json(400, { error: "bad_request", message: "Base URL 必须以 http:// 或 https:// 开头" })
      }
      apiKey = deobfKey(connRec.getString("api_key"))
    } else {
      providerVal = bodyProvider || "openai"
      baseUrl = normUrl(body.base_url)
      if (!baseUrl && OFFICIAL_BASE[providerVal]) baseUrl = OFFICIAL_BASE[providerVal]
      apiKey = String(body.api_key || "").trim()
      if (!baseUrl) return e.json(400, { error: "bad_request", message: "Base URL 必须以 http:// 或 https:// 开头（Anthropic / Gemini 可留空使用官方默认地址）" })
      if (!apiKey) return e.json(400, { error: "bad_request", message: "请填写 API Key" })
    }

    var persist = function (statusVal, latencyVal, modelIds, errText) {
      if (!connRec) return
      try {
        connRec.set("status", String(statusVal))
        connRec.set("last_latency_ms", Number(latencyVal) || 0)
        connRec.set("last_checked_at", new Date().toISOString())
        if (modelIds) connRec.set("models", modelIds)
        connRec.set("last_error", String(errText || "").slice(0, 1000))
        $app.save(connRec)
      } catch (perr) {
        try {
          $app.logger().error("model_connections persist error", "err", String((perr && perr.message) || perr))
        } catch (_) {}
      }
    }

    var t0 = new Date().getTime()
    var res = null
    try {
      if (providerVal === "anthropic") {
        res = $http.send({
          url: baseUrl + "/models",
          method: "GET",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          timeout: 8,
        })
      } else if (providerVal === "gemini") {
        res = $http.send({
          url: baseUrl + "/models?key=" + encodeURIComponent(apiKey),
          method: "GET",
          headers: {},
          timeout: 8,
        })
      } else {
        res = $http.send({
          url: baseUrl + "/models",
          method: "GET",
          headers: { Authorization: "Bearer " + apiKey },
          timeout: 8,
        })
      }
    } catch (netErr) {
      var latency0 = new Date().getTime() - t0
      var netRawMsg = String((netErr && netErr.message) || netErr)
      var netMsg = /timeout|deadline/i.test(netRawMsg)
        ? "请求超时（8 秒内无响应）。注意：预览环境可能无法访问 OpenAI / Anthropic / Gemini 等境外服务地址，发布后可重新测试，或先换一个当前网络可达的地址"
        : "地址不通：请检查 Base URL 是否正确、服务是否可访问"
      persist("error", latency0, null, netMsg)
      return e.json(200, {
        ok: false,
        latency_ms: latency0,
        models: [],
        error: netMsg,
        detail: sanitizeDetail(netRawMsg).slice(0, 200),
      })
    }
    var latencyMs = new Date().getTime() - t0
    // Goja $http.send 的 res.body 是字节数组：String() 会得到逗号串，必须按 UTF-8 多字节解码（逐字节 fromCharCode 中文会乱码）；res.json() 不可靠不依赖
    var utf8ToStr = function (bytes) {
      var out = ""
      var i = 0
      var n = bytes.length
      while (i < n) {
        var b = bytes[i] & 255
        if (b < 128) { out += String.fromCharCode(b); i++ }
        else if (b > 191 && b < 224 && i + 1 < n) { out += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63)); i += 2 }
        else if (b > 223 && b < 240 && i + 2 < n) { out += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)); i += 3 }
        else if (b > 239 && i + 3 < n) {
          var cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63)
          cp -= 65536
          out += String.fromCharCode(55296 + (cp >> 10), 56320 + (cp & 1023))
          i += 4
        } else { out += String.fromCharCode(65533); i++ }
      }
      return out
    }
    var bodyStr = ""
    try {
      var rawBody = res ? res.body : null
      if (typeof rawBody === "string") {
        bodyStr = rawBody
      } else if (rawBody && rawBody.length !== undefined) {
        bodyStr = utf8ToStr(rawBody)
      }
    } catch (_) {}
    var code = res ? res.statusCode : 0
    if (code < 200 || code >= 300) {
      var httpMsg = "服务返回错误（HTTP " + code + "）"
      if (code === 401 || code === 403) httpMsg = "密钥无效或无权限（HTTP " + code + "），请检查 API Key"
      var detail2 = sanitizeDetail(bodyStr).slice(0, 200)
      persist("error", latencyMs, null, httpMsg)
      return e.json(200, { ok: false, latency_ms: latencyMs, models: [], error: httpMsg, detail: detail2 })
    }

    var data = null
    try {
      data = JSON.parse(bodyStr)
    } catch (_) {}
    var ids = extractIds(data, providerVal)
    if (ids.length === 0) {
      var rawBodyStr = sanitizeDetail(bodyStr).slice(0, 300)
      var bizErr = ""
      if (data && typeof data === "object") {
        if (data.error && typeof data.error === "object" && data.error.message) bizErr = String(data.error.message)
        else if (typeof data.error === "string" && data.error) bizErr = data.error
        else if (data.base_resp && data.base_resp.status_code !== undefined && Number(data.base_resp.status_code) !== 0) bizErr = String(data.base_resp.status_msg || ("错误码 " + data.base_resp.status_code))
        else if (typeof data.message === "string" && data.message) bizErr = data.message
      }
      var fmtMsg = bizErr
        ? "服务已响应但返回业务错误：" + bizErr.slice(0, 200) + "（该服务可能未对当前密钥开放模型列表接口）"
        : "已连通但未能解析出模型列表：该服务可能未开放 /models 接口。可在表单里手动填写模型 ID 后保存，试跑时直接使用"
      persist("error", latencyMs, null, fmtMsg)
      return e.json(200, { ok: false, latency_ms: latencyMs, models: [], error: fmtMsg, detail: rawBodyStr })
    }
    persist("ok", latencyMs, ids, "")
    return e.json(200, { ok: true, latency_ms: latencyMs, models: ids, count: ids.length })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("model_connections test error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
