// plugin_market.pb.js — 插件市场（MCP 官方注册表代理 + 远程 MCP 连接/试调/留档）
// 数据源：https://registry.modelcontextprotocol.io/v0/servers（前端禁直连第三方，全部经本代理）。
// MCP 远程调用：streamable-http JSON-RPC（tools/list / tools/call），响应可能是 SSE 文本需解析 data 行；
// 部分服务器要求先 initialize 再 tools/list，做回退链；网络失败重试 1 次；出站一律 ≤25s 钳制。
// 鉴权：全路由 X-Rh-User-Id；归属校验非本人 404、未登录 401；授权头可逆混淆落库、永不回显明文；
// 5xx 一律 { error, message, fingerprint }。
// Goja 铁律：全部 var、new Date().getTime()、helper 就地定义、每个 routerAdd 回调 self-contained、
// 计数/查询一律 findRecordsByFilter、日期带毫秒、路径参数用 e.request.pathValue。

routerAdd("GET", "/api/market/list", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var q = String(qp["q"] || qp["search"] || "").trim().slice(0, 100)
    var cursor = String(qp["cursor"] || "").trim().slice(0, 300)

    // feed 短缓存：同 q+cursor 60 秒内复用上次代理结果，避免并发穿透打爆外部注册表
    var feedKey = "v2|feed|" + q + "|" + cursor
    try {
      var feedRows = $app.findRecordsByFilter("market_cache", "server_name = {:fk}", "-created", 1, 0, { fk: feedKey })
      if (feedRows.length > 0) {
        var feedStr = feedRows[0].getString("payload")
        if (feedStr) {
          var feedObj = JSON.parse(feedStr)
          if (Number(feedObj.t || 0) > 0 && new Date().getTime() - Number(feedObj.t) < 60000 && feedObj.body) {
            return e.json(200, feedObj.body)
          }
        }
      }
    } catch (_) {}

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
    var bytesToStr = function (r) {
      if (!r) return ""
      var raw = r.body
      if (typeof raw === "string") return raw
      if (!raw || raw.length === undefined) return ""
      return utf8ToStr(raw)
    }

    var url = "https://registry.modelcontextprotocol.io/v0/servers?limit=24&cursor=" + encodeURIComponent(cursor) + "&search=" + encodeURIComponent(q)
    var res = null
    try {
      res = $http.send({ url: url, method: "GET", timeout: 25, headers: { Accept: "application/json" } })
    } catch (netErr) {
      var rawMsg = String((netErr && netErr.message) || netErr).slice(0, 200)
      return e.json(502, {
        error: "registry_unreachable",
        message: "插件市场注册表暂不可达：" + rawMsg + "。预览环境可能无法访问该外部地址，发布后重试。",
        fingerprint: ("registry_unreachable " + rawMsg).slice(0, 80),
      })
    }
    var code = Number((res && res.statusCode) || 0)
    if (code < 200 || code >= 300) {
      return e.json(502, {
        error: "registry_http_" + code,
        message: "插件市场注册表返回错误（HTTP " + code + "），请稍后重试",
        fingerprint: ("registry_http " + code).slice(0, 80),
      })
    }
    var data = null
    try {
      data = JSON.parse(bytesToStr(res))
    } catch (parseErr) {
      var pm = String((parseErr && parseErr.message) || parseErr).slice(0, 120)
      return e.json(502, { error: "registry_bad_json", message: "插件市场注册表响应无法解析：" + pm, fingerprint: ("registry_bad_json " + pm).slice(0, 80) })
    }
    var servers = (data && data.servers) || []
    var items = []
    for (var si = 0; si < servers.length; si++) {
      var row = servers[si] || {}
      var sv = row.server && typeof row.server === "object" ? row.server : row
      var remotes = []
      var rm = sv.remotes || []
      if (typeof rm.length === "number") {
        for (var rj = 0; rj < rm.length && remotes.length < 5; rj++) {
          var rItem = rm[rj] || {}
          var rUrl = String(rItem.url || "")
          if (!rUrl) continue
          remotes.push({ type: String(rItem.type || "streamable-http"), url: rUrl.slice(0, 400) })
        }
      }
      var pkgs = []
      var pk = sv.packages || []
      if (typeof pk.length === "number") {
        for (var pj = 0; pj < pk.length && pkgs.length < 6; pj++) {
          var pItem = pk[pj] || {}
          pkgs.push({
            registry: String(pItem.registry || "").slice(0, 40),
            name: String(pItem.name || "").slice(0, 200),
            identifier: String(pItem.identifier || "").slice(0, 200),
            version: String(pItem.version || "").slice(0, 40),
          })
        }
      }
      items.push({
        name: String(sv.name || "").slice(0, 200),
        title: String(sv.title || "").slice(0, 200),
        description: String(sv.description || "").slice(0, 1000),
        version: String(sv.version || "").slice(0, 40),
        remotes: remotes,
        packages: pkgs,
      })
    }
    // join market_i18n 中文简介缓存（命中才带 zh_title/zh_desc）
    var zhMap = {}
    try {
      var i18nRows = $app.findRecordsByFilter("market_i18n", "server_name != ''", "-created", 500, 0, {})
      for (var ii = 0; ii < i18nRows.length; ii++) {
        var iName = String(i18nRows[ii].get("server_name") || "")
        if (!iName) continue
        zhMap[iName] = { zh_title: String(i18nRows[ii].get("zh_title") || ""), zh_desc: String(i18nRows[ii].get("zh_desc") || "") }
      }
    } catch (_) {}
    // 已缓存名单一次读齐，只对缺失条目补写 market_cache（减重复出站）
    var cachedNames = {}
    try {
      var cacheAll = $app.findRecordsByFilter("market_cache", "server_name != ''", "-created", 1000, 0, {})
      for (var ci = 0; ci < cacheAll.length; ci++) cachedNames[String(cacheAll[ci].get("server_name") || "")] = true
    } catch (_) {}
    for (var mi = 0; mi < items.length; mi++) {
      var mItem = items[mi]
      var zhHit = zhMap[mItem.name]
      if (zhHit) {
        if (zhHit.zh_title) mItem.zh_title = zhHit.zh_title
        if (zhHit.zh_desc) mItem.zh_desc = zhHit.zh_desc
      }
      if (mItem.name && !cachedNames[mItem.name]) {
        try {
          var cacheCol = $app.findCollectionByNameOrId("market_cache")
          var cacheRec = new Record(cacheCol)
          cacheRec.set("server_name", mItem.name)
          cacheRec.set("payload", mItem)
          $app.save(cacheRec)
          cachedNames[mItem.name] = true
        } catch (_) {}
      }
    }
    var nextCursor = ""
    try {
      nextCursor = String(((data && data.metadata) || {}).nextCursor || "")
    } catch (_) {}
    var feedBody = { ok: true, items: items, next_cursor: nextCursor.slice(0, 300), search: q }
    try {
      var feedCol = $app.findCollectionByNameOrId("market_cache")
      var feedEx = $app.findRecordsByFilter("market_cache", "server_name = {:fk}", "-created", 1, 0, { fk: feedKey })
      var feedRec = feedEx.length > 0 ? feedEx[0] : new Record(feedCol)
      feedRec.set("server_name", feedKey)
      feedRec.set("payload", { t: new Date().getTime(), body: feedBody })
      $app.save(feedRec)
    } catch (_) {}
    return e.json(200, feedBody)
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market list error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/market/probe", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var targetUrl = String(body.url || "").trim().slice(0, 400)
    if (!/^https?:\/\//i.test(targetUrl)) return e.json(400, { error: "bad_request", message: "插件远程地址必须以 http:// 或 https:// 开头" })

    var PREVIEW_HINT = "预览环境可能无法访问该外部地址，发布后重试。"
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
    var bytesToStr = function (r) {
      if (!r) return ""
      var raw = r.body
      if (typeof raw === "string") return raw
      if (!raw || raw.length === undefined) return ""
      return utf8ToStr(raw)
    }
    // 请求里的授权头行 [{key,value}] → 明文 map（probe 只使用不落库）
    var authHeaders = {}
    var hRows = body.headers || []
    if (typeof hRows.length === "number") {
      for (var hi = 0; hi < hRows.length && hi < 20; hi++) {
        var hItem = hRows[hi] || {}
        var hKey = String(hItem.key || hItem.k || "").trim()
        if (!hKey) continue
        authHeaders[hKey.slice(0, 100)] = String(hItem.value === undefined || hItem.value === null ? "" : hItem.v !== undefined ? hItem.v : hItem.value)
      }
    }
    var sanitizeMsg = function (s) {
      var out = String(s || "")
      for (var sk in authHeaders) {
        var sv = String(authHeaders[sk] || "")
        if (sv.length >= 6) out = out.split(sv).join("***")
      }
      return out
    }
    var pickHeader = function (res, name) {
      try {
        var hs = (res && res.headers) || {}
        var v = hs[name] || hs[String(name).toLowerCase()]
        if (!v) return ""
        if (typeof v === "string") return v
        if (typeof v.length === "number" && v.length > 0) return String(v[0])
      } catch (_) {}
      return ""
    }
    // SSE（event:/data: 行）或纯 JSON 都能解析出 JSON-RPC 响应体
    var parseRpcBody = function (text) {
      var s = String(text || "").trim()
      if (!s) return null
      if (s.indexOf("{") !== 0) {
        var lines = s.split("\n")
        var last = null
        for (var li = 0; li < lines.length; li++) {
          var ln = lines[li].replace(/^\s+/, "")
          if (ln.indexOf("data:") === 0) {
            var payload = ln.substring(5).replace(/^\s+/, "")
            if (payload && payload !== "[DONE]") {
              try {
                var obj = JSON.parse(payload)
                if (obj && typeof obj === "object") last = obj
              } catch (_) {}
            }
          }
        }
        return last
      }
      try { return JSON.parse(s) } catch (_) { return null }
    }
    var rpcSend = function (url2, method, params, rpcId, sessionId) {
      var hdrs = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }
      for (var k in authHeaders) { if (String(authHeaders[k]) !== "") hdrs[k] = authHeaders[k] }
      if (sessionId) hdrs["Mcp-Session-Id"] = sessionId
      var bodyObj = { jsonrpc: "2.0", method: method, params: params || {} }
      if (rpcId !== null && rpcId !== undefined) bodyObj.id = rpcId
      var res = null
      try {
        res = $http.send({ url: url2, method: "POST", headers: hdrs, body: JSON.stringify(bodyObj), timeout: 25 })
      } catch (netErr) {
        return { net: true, message: sanitizeMsg(String((netErr && netErr.message) || netErr)).slice(0, 200), session: "" }
      }
      return {
        net: false,
        status: Number((res && res.statusCode) || 0),
        text: sanitizeMsg(bytesToStr(res)),
        data: parseRpcBody(bytesToStr(res)),
        session: pickHeader(res, "Mcp-Session-Id"),
        message: "",
      }
    }
    var rpcWithRetry = function (url2, method, params, rpcId, sessionId) {
      var r = rpcSend(url2, method, params, rpcId, sessionId)
      if (r.net) r = rpcSend(url2, method, params, rpcId, sessionId)
      return r
    }
    var needsInit = function (r) {
      if (!r || r.net) return false
      var errObj = (r.data && r.data.error) || null
      var emsg = ""
      if (errObj) emsg = String(errObj.message || "") + " " + String(errObj.data || "")
      if (!emsg) emsg = String(r.text || "").slice(0, 400)
      return /initializ|not initialized|session|handshake/i.test(emsg) || Number((errObj && errObj.code) || 0) === -32002 || r.status === 400 || r.status === 404 || r.status === 406
    }
    var doInit = function (url2) {
      var r = rpcWithRetry(url2, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "AgentStudio", version: "1.0" } }, 1, "")
      var sess = r.net ? "" : String(r.session || "")
      if (!r.net && sess) { try { rpcSend(url2, "notifications/initialized", {}, null, sess) } catch (_) {} }
      return sess
    }
    var normalizeTools = function (arr) {
      var out = []
      if (!arr || typeof arr.length !== "number") return out
      for (var ti = 0; ti < arr.length && out.length < 50; ti++) {
        var t = arr[ti] || {}
        var nm = String(t.name || "").slice(0, 120)
        if (!nm) continue
        var schema = t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : null
        var hint = ""
        if (schema && schema.properties && typeof schema.properties === "object") {
          var req = schema.required || []
          var bits = []
          for (var pk in schema.properties) {
            if (bits.length >= 12) break
            var pv = schema.properties[pk] || {}
            var isReq = false
            if (typeof req.length === "number") { for (var qi = 0; qi < req.length; qi++) { if (String(req[qi]) === String(pk)) isReq = true } }
            bits.push(pk + "(" + String(pv.type || "any") + (isReq ? ",必填" : "") + ")")
          }
          hint = bits.join("、")
        }
        out.push({ name: nm, description: String(t.description || "").slice(0, 400), args_hint: hint.slice(0, 300), input_schema: schema })
      }
      return out
    }

    var t0 = new Date().getTime()
    var r1 = rpcWithRetry(targetUrl, "tools/list", {}, 1, "")
    if (r1.net) return e.json(200, { ok: false, error_code: "mcp_unreachable", message: "插件地址不通：" + r1.message + "。" + PREVIEW_HINT, latency_ms: new Date().getTime() - t0 })
    var sess1 = String(r1.session || "")
    var tools1 = r1.data && r1.data.result ? r1.data.result.tools : null
    var rFinal = r1
    if (!tools1 && needsInit(r1)) {
      var sessInit = doInit(targetUrl) || sess1
      var r2 = rpcWithRetry(targetUrl, "tools/list", {}, 2, sessInit)
      if (!r2.net) {
        rFinal = r2
        tools1 = r2.data && r2.data.result ? r2.data.result.tools : null
      }
    }
    if (!tools1) {
      var emsg = ""
      var errObj = (rFinal.data && rFinal.data.error) || null
      if (errObj) emsg = String(errObj.message || "") + (errObj.data ? " | " + String(errObj.data).slice(0, 200) : "")
      if (!emsg) emsg = "HTTP " + rFinal.status + "：" + String(rFinal.text || "").replace(/\s+/g, " ").slice(0, 300)
      var ecode = "mcp_error"
      if (rFinal.status === 401 || rFinal.status === 403 || /unauthor|forbidden|api[_ -]?key|token|credential/i.test(emsg)) ecode = "mcp_auth_required"
      return e.json(200, { ok: false, error_code: ecode, message: emsg.slice(0, 500), latency_ms: new Date().getTime() - t0 })
    }
    var norm = normalizeTools(tools1)
    return e.json(200, { ok: true, tools: norm, tool_count: norm.length, latency_ms: new Date().getTime() - t0 })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market probe error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/market/connect", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var targetUrl = String(body.url || "").trim().slice(0, 400)
    var serverName = String(body.name || "").trim().slice(0, 200)
    var titleVal = String(body.title || "").trim().slice(0, 200) || serverName
    if (!/^https?:\/\//i.test(targetUrl)) return e.json(400, { error: "bad_request", message: "插件远程地址必须以 http:// 或 https:// 开头" })
    if (!serverName) serverName = targetUrl

    var PREVIEW_HINT = "预览环境可能无法访问该外部地址，发布后重试。"
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
    var bytesToStr = function (r) {
      if (!r) return ""
      var raw = r.body
      if (typeof raw === "string") return raw
      if (!raw || raw.length === undefined) return ""
      return utf8ToStr(raw)
    }
    var obfVal = function (plain) {
      var _secretKey = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
      if (_secretKey.length === 32) return "gcm1:" + $security.encrypt(String(plain), _secretKey)
      if ($os.getenv("AGENT_STUDIO_STRICT_SECRETS") === "true") throw new Error("secret_encryption_key_required")

      var parts = []
      for (var oi = 0; oi < plain.length; oi++) parts.push(String(plain.charCodeAt(oi) + 3))
      return parts.join(".")
    }
    var authHeaders = {}
    var secRows = []
    var hRows = body.headers || []
    if (typeof hRows.length === "number") {
      for (var hi = 0; hi < hRows.length && secRows.length < 20; hi++) {
        var hItem = hRows[hi] || {}
        var hKey = String(hItem.key || hItem.k || "").trim()
        if (!hKey) continue
        var hVal = String(hItem.value === undefined || hItem.value === null ? "" : hItem.value)
        authHeaders[hKey.slice(0, 100)] = hVal
        secRows.push({ k: hKey.slice(0, 100), v: obfVal(hVal) })
      }
    }
    var sanitizeMsg = function (s) {
      var out = String(s || "")
      for (var sk in authHeaders) {
        var sv = String(authHeaders[sk] || "")
        if (sv.length >= 6) out = out.split(sv).join("***")
      }
      return out
    }
    var pickHeader = function (res, name) {
      try {
        var hs = (res && res.headers) || {}
        var v = hs[name] || hs[String(name).toLowerCase()]
        if (!v) return ""
        if (typeof v === "string") return v
        if (typeof v.length === "number" && v.length > 0) return String(v[0])
      } catch (_) {}
      return ""
    }
    var parseRpcBody = function (text) {
      var s = String(text || "").trim()
      if (!s) return null
      if (s.indexOf("{") !== 0) {
        var lines = s.split("\n")
        var last = null
        for (var li = 0; li < lines.length; li++) {
          var ln = lines[li].replace(/^\s+/, "")
          if (ln.indexOf("data:") === 0) {
            var payload = ln.substring(5).replace(/^\s+/, "")
            if (payload && payload !== "[DONE]") {
              try {
                var obj = JSON.parse(payload)
                if (obj && typeof obj === "object") last = obj
              } catch (_) {}
            }
          }
        }
        return last
      }
      try { return JSON.parse(s) } catch (_) { return null }
    }
    var rpcSend = function (url2, method, params, rpcId, sessionId) {
      var hdrs = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }
      for (var k in authHeaders) { if (String(authHeaders[k]) !== "") hdrs[k] = authHeaders[k] }
      if (sessionId) hdrs["Mcp-Session-Id"] = sessionId
      var bodyObj = { jsonrpc: "2.0", method: method, params: params || {} }
      if (rpcId !== null && rpcId !== undefined) bodyObj.id = rpcId
      var res = null
      try {
        res = $http.send({ url: url2, method: "POST", headers: hdrs, body: JSON.stringify(bodyObj), timeout: 25 })
      } catch (netErr) {
        return { net: true, message: sanitizeMsg(String((netErr && netErr.message) || netErr)).slice(0, 200), session: "" }
      }
      return {
        net: false,
        status: Number((res && res.statusCode) || 0),
        text: sanitizeMsg(bytesToStr(res)),
        data: parseRpcBody(bytesToStr(res)),
        session: pickHeader(res, "Mcp-Session-Id"),
      }
    }
    var rpcWithRetry = function (url2, method, params, rpcId, sessionId) {
      var r = rpcSend(url2, method, params, rpcId, sessionId)
      if (r.net) r = rpcSend(url2, method, params, rpcId, sessionId)
      return r
    }
    var needsInit = function (r) {
      if (!r || r.net) return false
      var errObj = (r.data && r.data.error) || null
      var emsg = ""
      if (errObj) emsg = String(errObj.message || "") + " " + String(errObj.data || "")
      if (!emsg) emsg = String(r.text || "").slice(0, 400)
      return /initializ|not initialized|session|handshake/i.test(emsg) || Number((errObj && errObj.code) || 0) === -32002 || r.status === 400 || r.status === 404 || r.status === 406
    }
    var doInit = function (url2) {
      var r = rpcWithRetry(url2, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "AgentStudio", version: "1.0" } }, 1, "")
      var sess = r.net ? "" : String(r.session || "")
      if (!r.net && sess) { try { rpcSend(url2, "notifications/initialized", {}, null, sess) } catch (_) {} }
      return sess
    }
    var normalizeTools = function (arr) {
      var out = []
      if (!arr || typeof arr.length !== "number") return out
      for (var ti = 0; ti < arr.length && out.length < 50; ti++) {
        var t = arr[ti] || {}
        var nm = String(t.name || "").slice(0, 120)
        if (!nm) continue
        var schema = t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : null
        var hint = ""
        if (schema && schema.properties && typeof schema.properties === "object") {
          var req = schema.required || []
          var bits = []
          for (var pk in schema.properties) {
            if (bits.length >= 12) break
            var pv = schema.properties[pk] || {}
            var isReq = false
            if (typeof req.length === "number") { for (var qi = 0; qi < req.length; qi++) { if (String(req[qi]) === String(pk)) isReq = true } }
            bits.push(pk + "(" + String(pv.type || "any") + (isReq ? ",必填" : "") + ")")
          }
          hint = bits.join("、")
        }
        out.push({ name: nm, description: String(t.description || "").slice(0, 400), args_hint: hint.slice(0, 300), input_schema: schema })
      }
      return out
    }

    // 真实探测 tools/list（直接 → initialize 回退链），成功才落库
    var t0 = new Date().getTime()
    var r1 = rpcWithRetry(targetUrl, "tools/list", {}, 1, "")
    if (r1.net) return e.json(200, { ok: false, error_code: "mcp_unreachable", message: "插件地址不通：" + r1.message + "。" + PREVIEW_HINT, latency_ms: new Date().getTime() - t0 })
    var toolsArr = r1.data && r1.data.result ? r1.data.result.tools : null
    var rFinal = r1
    if (!toolsArr && needsInit(r1)) {
      var sessInit = doInit(targetUrl) || String(r1.session || "")
      var r2 = rpcWithRetry(targetUrl, "tools/list", {}, 2, sessInit)
      if (!r2.net) {
        rFinal = r2
        toolsArr = r2.data && r2.data.result ? r2.data.result.tools : null
      }
    }
    if (!toolsArr) {
      var emsg = ""
      var errObj = (rFinal.data && rFinal.data.error) || null
      if (errObj) emsg = String(errObj.message || "") + (errObj.data ? " | " + String(errObj.data).slice(0, 200) : "")
      if (!emsg) emsg = "HTTP " + rFinal.status + "：" + String(rFinal.text || "").replace(/\s+/g, " ").slice(0, 300)
      var ecode = "mcp_error"
      if (rFinal.status === 401 || rFinal.status === 403 || /unauthor|forbidden|api[_ -]?key|token|credential/i.test(emsg)) ecode = "mcp_auth_required"
      return e.json(200, { ok: false, error_code: ecode, message: emsg.slice(0, 500), latency_ms: new Date().getTime() - t0, hint: ecode === "mcp_auth_required" ? "该插件可能需要授权，请在下方填写它要求的授权头后重试" : "" })
    }
    var norm = normalizeTools(toolsArr)

    // upsert：同用户同 url 已存在则更新快照
    var secJson = ""
    try { secJson = JSON.stringify(secRows) } catch (_) { secJson = "[]" }
    var existRows = []
    try {
      existRows = $app.findRecordsByFilter("market_connections", "rh_user_id = {:uid} && url = {:url}", "-created", 1, 0, { uid: uid, url: targetUrl })
    } catch (_) {}
    var rec = null
    if (existRows.length > 0) rec = existRows[0]
    else {
      var col = $app.findCollectionByNameOrId("market_connections")
      rec = new Record(col)
      rec.set("rh_user_id", uid)
    }
    rec.set("server_name", serverName)
    rec.set("title", titleVal)
    rec.set("url", targetUrl)
    rec.set("headers_sec", secJson)
    rec.set("headers_count", secRows.length)
    rec.set("tools", norm)
    rec.set("tool_count", norm.length)
    rec.set("enabled", true)
    rec.set("last_probe_status", "ok")
    rec.set("last_probe_msg", "")
    $app.save(rec)
    return e.json(200, {
      ok: true,
      connection: {
        id: String(rec.id),
        server_name: serverName,
        title: titleVal,
        url: targetUrl,
        headers_count: secRows.length,
        tools: norm,
        tool_count: norm.length,
        enabled: true,
        last_probe_status: "ok",
        last_probe_msg: "",
      },
      latency_ms: new Date().getTime() - t0,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market connect error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/market/connections", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var rows = []
    try {
      rows = $app.findRecordsByFilter("market_connections", "rh_user_id = {:uid}", "-created", 100, 0, { uid: uid })
    } catch (_) {}
    var smitheryManaged=require(__hooks+"/modules/smithery_managed.js")
    var items = []
    for (var ri = 0; ri < rows.length; ri++) {
      var rec = rows[ri]
      var toolsVal = []
      try {
        var tStr = rec.getString("tools")
        if (tStr) {
          var parsed = JSON.parse(tStr)
          if (parsed && typeof parsed.length === "number") toolsVal = parsed
        }
      } catch (_) {}
      var enabledVal = true
      try { enabledVal = rec.getBool("enabled") } catch (_) {}
      var rawUrl=String(rec.get("url")||"")
      var isLegacySmithery=rawUrl.indexOf("server.smithery.ai/")>=0 &&
        /[?&]api_key=/i.test(rawUrl)
      if (isLegacySmithery || (enabledVal && (Number(rec.get("tool_count")||0)===0 ||
          String(rec.get("last_probe_status")||"")!=="ok"))) {
        // Quarantine never-verified connections before any Agent can use them.
        enabledVal=false
        try {
          rec.set("enabled",false)
          rec.set("last_probe_status",isLegacySmithery?"legacy_reconnect":"needs_refresh")
          rec.set("last_probe_msg",isLegacySmithery?
            "旧版连接包含敏感查询参数，请重新接入 Smithery Connect":
            "当前没有经过验证的工具清单，需重新检查")
          $app.save(rec)
        }catch(_){}
      }
      // Permanently scrub the retired plaintext key query rather than only
      // masking it in API responses. The row remains disabled for migration.
      if(isLegacySmithery){
        var scrubbed=rawUrl.replace(/([?&](?:api_key|access_token|token|key)=)[^&]+/ig,"$1REDACTED")
        try{rec.set("url",scrubbed);$app.save(rec)}catch(_){}
        rawUrl=scrubbed
      }
      var publicUrl=rawUrl.replace(/([?&](?:api_key|access_token|token|key)=)[^&]+/ig,"$1***")
      items.push({
        id: String(rec.id),
        server_name: String(rec.get("server_name") || ""),
        title: String(rec.get("title") || ""),
        url: publicUrl,
        is_smithery: !!smitheryManaged.decodeProxy(rawUrl),
        headers_count: Number(rec.get("headers_count") || 0),
        tools: toolsVal,
        tool_count: Number(rec.get("tool_count") || 0),
        enabled: enabledVal,
        last_probe_status: String(rec.get("last_probe_status") || ""),
        last_probe_msg: String(rec.get("last_probe_msg") || ""),
        created: String(rec.get("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market connections error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/market/toggle", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var id = String(body.id || "").trim()
    if (!id) return e.json(400, { error: "bad_request", message: "缺少连接 id" })
    var rec = null
    try { rec = $app.findRecordById("market_connections", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "connection_not_found", message: "连接不存在或已断开" })
    if(body.enabled === true){
      var url=String(rec.getString("url")||"")
      if(url.indexOf("server.smithery.ai/")>=0 && /[?&]api_key=/i.test(url))
        return e.json(409,{error:"legacy_reconnect",message:"旧版 Smithery 连接不能重新启用；请使用新版托管连接"})
      if(Number(rec.get("tool_count")||0)<1 || String(rec.get("last_probe_status")||"")!=="ok")
        return e.json(409,{error:"not_verified",message:"未验证通过的连接不能启用；请先完成授权和工具发现"})
    }
    rec.set("enabled", body.enabled === true)
    $app.save(rec)
    return e.json(200, { ok: true, id: id, enabled: body.enabled === true })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market toggle error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/market/reprobe", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var id = String(body.id || "").trim()
    if (!id) return e.json(400, { error: "bad_request", message: "缺少连接 id" })
    var rec = null
    try { rec = $app.findRecordById("market_connections", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "connection_not_found", message: "连接不存在或已断开" })

    var PREVIEW_HINT = "预览环境可能无法访问该外部地址，发布后重试。"
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
    var bytesToStr = function (r) {
      if (!r) return ""
      var raw = r.body
      if (typeof raw === "string") return raw
      if (!raw || raw.length === undefined) return ""
      return utf8ToStr(raw)
    }
    var deobfVal = function (stored) {
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
    // 从落库的 headers_sec 还原授权头明文（只在服务端使用，永不外发）
    var authHeaders = {}
    try {
      var secStr = String(rec.getString("headers_sec") || "")
      if (secStr) {
        var secArr = JSON.parse(secStr)
        if (secArr && typeof secArr.length === "number") {
          for (var si = 0; si < secArr.length; si++) {
            var sItem = secArr[si] || {}
            var sKey = String(sItem.k || "")
            if (sKey) authHeaders[sKey] = deobfVal(String(sItem.v || ""))
          }
        }
      }
    } catch (_) {}
    var sanitizeMsg = function (s) {
      var out = String(s || "")
      for (var sk in authHeaders) {
        var sv = String(authHeaders[sk] || "")
        if (sv.length >= 6) out = out.split(sv).join("***")
      }
      return out
    }
    var pickHeader = function (res, name) {
      try {
        var hs = (res && res.headers) || {}
        var v = hs[name] || hs[String(name).toLowerCase()]
        if (!v) return ""
        if (typeof v === "string") return v
        if (typeof v.length === "number" && v.length > 0) return String(v[0])
      } catch (_) {}
      return ""
    }
    var parseRpcBody = function (text) {
      var s = String(text || "").trim()
      if (!s) return null
      if (s.indexOf("{") !== 0) {
        var lines = s.split("\n")
        var last = null
        for (var li = 0; li < lines.length; li++) {
          var ln = lines[li].replace(/^\s+/, "")
          if (ln.indexOf("data:") === 0) {
            var payload = ln.substring(5).replace(/^\s+/, "")
            if (payload && payload !== "[DONE]") {
              try {
                var obj = JSON.parse(payload)
                if (obj && typeof obj === "object") last = obj
              } catch (_) {}
            }
          }
        }
        return last
      }
      try { return JSON.parse(s) } catch (_) { return null }
    }
    var rpcSend = function (url2, method, params, rpcId, sessionId) {
      var hdrs = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }
      for (var k in authHeaders) { if (String(authHeaders[k]) !== "") hdrs[k] = authHeaders[k] }
      if (sessionId) hdrs["Mcp-Session-Id"] = sessionId
      var bodyObj = { jsonrpc: "2.0", method: method, params: params || {} }
      if (rpcId !== null && rpcId !== undefined) bodyObj.id = rpcId
      var res = null
      try {
        res = $http.send({ url: url2, method: "POST", headers: hdrs, body: JSON.stringify(bodyObj), timeout: 25 })
      } catch (netErr) {
        return { net: true, message: sanitizeMsg(String((netErr && netErr.message) || netErr)).slice(0, 200), session: "" }
      }
      return {
        net: false,
        status: Number((res && res.statusCode) || 0),
        text: sanitizeMsg(bytesToStr(res)),
        data: parseRpcBody(bytesToStr(res)),
        session: pickHeader(res, "Mcp-Session-Id"),
      }
    }
    var rpcWithRetry = function (url2, method, params, rpcId, sessionId) {
      var r = rpcSend(url2, method, params, rpcId, sessionId)
      if (r.net) r = rpcSend(url2, method, params, rpcId, sessionId)
      return r
    }
    var needsInit = function (r) {
      if (!r || r.net) return false
      var errObj = (r.data && r.data.error) || null
      var emsg = ""
      if (errObj) emsg = String(errObj.message || "") + " " + String(errObj.data || "")
      if (!emsg) emsg = String(r.text || "").slice(0, 400)
      return /initializ|not initialized|session|handshake/i.test(emsg) || Number((errObj && errObj.code) || 0) === -32002 || r.status === 400 || r.status === 404 || r.status === 406
    }
    var doInit = function (url2) {
      var r = rpcWithRetry(url2, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "AgentStudio", version: "1.0" } }, 1, "")
      var sess = r.net ? "" : String(r.session || "")
      if (!r.net && sess) { try { rpcSend(url2, "notifications/initialized", {}, null, sess) } catch (_) {} }
      return sess
    }
    var normalizeTools = function (arr) {
      var out = []
      if (!arr || typeof arr.length !== "number") return out
      for (var ti = 0; ti < arr.length && out.length < 50; ti++) {
        var t = arr[ti] || {}
        var nm = String(t.name || "").slice(0, 120)
        if (!nm) continue
        var schema = t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : null
        var hint = ""
        if (schema && schema.properties && typeof schema.properties === "object") {
          var req = schema.required || []
          var bits = []
          for (var pk in schema.properties) {
            if (bits.length >= 12) break
            var pv = schema.properties[pk] || {}
            var isReq = false
            if (typeof req.length === "number") { for (var qi = 0; qi < req.length; qi++) { if (String(req[qi]) === String(pk)) isReq = true } }
            bits.push(pk + "(" + String(pv.type || "any") + (isReq ? ",必填" : "") + ")")
          }
          hint = bits.join("、")
        }
        out.push({ name: nm, description: String(t.description || "").slice(0, 400), args_hint: hint.slice(0, 300), input_schema: schema })
      }
      return out
    }

    var targetUrl = String(rec.get("url") || "")
    var t0 = new Date().getTime()
    var r1 = rpcWithRetry(targetUrl, "tools/list", {}, 1, "")
    var toolsArr = null
    var rFinal = r1
    if (r1.net) {
      rFinal = r1
    } else {
      toolsArr = r1.data && r1.data.result ? r1.data.result.tools : null
      if (!toolsArr && needsInit(r1)) {
        var sessInit = doInit(targetUrl) || String(r1.session || "")
        var r2 = rpcWithRetry(targetUrl, "tools/list", {}, 2, sessInit)
        if (!r2.net) {
          rFinal = r2
          toolsArr = r2.data && r2.data.result ? r2.data.result.tools : null
        } else {
          rFinal = r2
        }
      }
    }
    if (!toolsArr) {
      var failMsg = ""
      if (rFinal.net) failMsg = "插件地址不通：" + rFinal.message + "。" + PREVIEW_HINT
      else {
        var errObj = (rFinal.data && rFinal.data.error) || null
        if (errObj) failMsg = String(errObj.message || "") + (errObj.data ? " | " + String(errObj.data).slice(0, 150) : "")
        if (!failMsg) failMsg = "HTTP " + rFinal.status + "：" + String(rFinal.text || "").replace(/\s+/g, " ").slice(0, 200)
      }
      rec.set("last_probe_status", "error")
      rec.set("last_probe_msg", failMsg.slice(0, 300))
      $app.save(rec)
      return e.json(200, { ok: false, error_code: "mcp_probe_failed", message: failMsg.slice(0, 500), latency_ms: new Date().getTime() - t0 })
    }
    var norm = normalizeTools(toolsArr)
    rec.set("tools", norm)
    rec.set("tool_count", norm.length)
    rec.set("last_probe_status", "ok")
    rec.set("last_probe_msg", "")
    $app.save(rec)
    return e.json(200, { ok: true, id: id, tools: norm, tool_count: norm.length, latency_ms: new Date().getTime() - t0 })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market reprobe error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/market/connections/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()
    if (!id) return e.json(400, { error: "bad_request", message: "缺少连接 id" })
    var rec = null
    try { rec = $app.findRecordById("market_connections", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "connection_not_found", message: "连接不存在或已断开" })
    // Removing a Smithery managed row must also revoke its vendor-side
    // connection. Failing a remote revoke is not a successful disconnect:
    // immediately disable local execution and tell the user to retry.
    var smithery=require(__hooks+"/modules/smithery_managed.js")
    var pair=smithery.decodeProxy(String(rec.getString("url")||""))
    if(pair){
      var vendorKey=smithery.key(uid)
      var revoke=vendorKey ? smithery.send("DELETE","/connect/"+
        encodeURIComponent(pair.namespace)+"/"+encodeURIComponent(pair.connectionId),vendorKey) :
        {ok:false,status:0,error:"smithery_key_required"}
      if(!revoke.ok && revoke.status!==404){
        rec.set("enabled",false)
        rec.set("last_probe_status","needs_revoke")
        rec.set("last_probe_msg","已停用本地执行，但未确认 Smithery 远端已撤销，请修复 Key 后再次断开")
        $app.save(rec)
        return e.json(502,{error:"smithery_remote_revoke_failed",
          message:"本地工具已停用，但尚未确认 Smithery 远端连接已撤销。请检查 Smithery Key 后重试断开"})
      }
    }
    $app.delete(rec)
    return e.json(200, { ok: true, id: id, remote_revoked: !!pair })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market delete error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/market/invoke", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var connId = String(body.connection_id || "").trim()
    var toolName = String(body.tool_name || "").trim().slice(0, 120)
    var argsObj = body.arguments && typeof body.arguments === "object" ? body.arguments : {}
    if (!connId || !toolName) return e.json(400, { error: "bad_request", message: "缺少连接或工具名" })
    var rec = null
    try { rec = $app.findRecordById("market_connections", connId) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "connection_not_found", message: "连接不存在或已断开" })
    var enabledVal = false
    try { enabledVal = rec.getBool("enabled") } catch (_) {}
    if (!enabledVal) return e.json(409, { error: "connection_disabled", message: "该插件连接已停用，请先启用后再试调" })
    var allowedTools=[]
    try{allowedTools=JSON.parse(String(rec.getString("tools")||"[]"))}catch(_){}
    var selectedTool=null
    for(var ti=0;ti<allowedTools.length;ti++){
      if(String((allowedTools[ti]||{}).name||"")===toolName){selectedTool=allowedTools[ti];break}
    }
    if(!selectedTool)return e.json(403,{error:"tool_not_authorized",
      message:"此工具未通过当前连接的能力发现，不能执行"})
    // Only confirmed read-only tools are directly trial-callable; other
    // external tools must go through the Agent/Workflow approval policy.
    var flags=selectedTool.read_only===true && selectedTool.destructive!==true
    if(!flags && body.confirm_external_write!==true)
      return e.json(428,{error:"external_action_confirmation_required",
        message:"此插件可能执行写操作。请确认授权范围和风险后再调用"})

    var PREVIEW_HINT = "预览环境可能无法访问该外部地址，发布后重试。"
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
    var bytesToStr = function (r) {
      if (!r) return ""
      var raw = r.body
      if (typeof raw === "string") return raw
      if (!raw || raw.length === undefined) return ""
      return utf8ToStr(raw)
    }
    var deobfVal = function (stored) {
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
    var authHeaders = {}
    try {
      var secStr = String(rec.getString("headers_sec") || "")
      if (secStr) {
        var secArr = JSON.parse(secStr)
        if (secArr && typeof secArr.length === "number") {
          for (var si = 0; si < secArr.length; si++) {
            var sItem = secArr[si] || {}
            var sKey = String(sItem.k || "")
            if (sKey) authHeaders[sKey] = deobfVal(String(sItem.v || ""))
          }
        }
      }
    } catch (_) {}
    var sanitizeMsg = function (s) {
      var out = String(s || "")
      for (var sk in authHeaders) {
        var sv = String(authHeaders[sk] || "")
        if (sv.length >= 6) out = out.split(sv).join("***")
      }
      return out
    }
    var pickHeader = function (res, name) {
      try {
        var hs = (res && res.headers) || {}
        var v = hs[name] || hs[String(name).toLowerCase()]
        if (!v) return ""
        if (typeof v === "string") return v
        if (typeof v.length === "number" && v.length > 0) return String(v[0])
      } catch (_) {}
      return ""
    }
    var parseRpcBody = function (text) {
      var s = String(text || "").trim()
      if (!s) return null
      if (s.indexOf("{") !== 0) {
        var lines = s.split("\n")
        var last = null
        for (var li = 0; li < lines.length; li++) {
          var ln = lines[li].replace(/^\s+/, "")
          if (ln.indexOf("data:") === 0) {
            var payload = ln.substring(5).replace(/^\s+/, "")
            if (payload && payload !== "[DONE]") {
              try {
                var obj = JSON.parse(payload)
                if (obj && typeof obj === "object") last = obj
              } catch (_) {}
            }
          }
        }
        return last
      }
      try { return JSON.parse(s) } catch (_) { return null }
    }
    var rpcSend = function (url2, method, params, rpcId, sessionId) {
      var hdrs = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }
      for (var k in authHeaders) { if (String(authHeaders[k]) !== "") hdrs[k] = authHeaders[k] }
      if (sessionId) hdrs["Mcp-Session-Id"] = sessionId
      var bodyObj = { jsonrpc: "2.0", method: method, params: params || {} }
      if (rpcId !== null && rpcId !== undefined) bodyObj.id = rpcId
      var res = null
      try {
        res = $http.send({ url: url2, method: "POST", headers: hdrs, body: JSON.stringify(bodyObj), timeout: 25 })
      } catch (netErr) {
        return { net: true, message: sanitizeMsg(String((netErr && netErr.message) || netErr)).slice(0, 200), session: "" }
      }
      return {
        net: false,
        status: Number((res && res.statusCode) || 0),
        text: sanitizeMsg(bytesToStr(res)),
        data: parseRpcBody(bytesToStr(res)),
        session: pickHeader(res, "Mcp-Session-Id"),
      }
    }
    var rpcWithRetry = function (url2, method, params, rpcId, sessionId) {
      var r = rpcSend(url2, method, params, rpcId, sessionId)
      if (r.net) r = rpcSend(url2, method, params, rpcId, sessionId)
      return r
    }
    var needsInit = function (r) {
      if (!r || r.net) return false
      var errObj = (r.data && r.data.error) || null
      var emsg = ""
      if (errObj) emsg = String(errObj.message || "") + " " + String(errObj.data || "")
      if (!emsg) emsg = String(r.text || "").slice(0, 400)
      return /initializ|not initialized|session|handshake/i.test(emsg) || Number((errObj && errObj.code) || 0) === -32002 || r.status === 400 || r.status === 404 || r.status === 406
    }
    var doInit = function (url2) {
      var r = rpcWithRetry(url2, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "AgentStudio", version: "1.0" } }, 1, "")
      var sess = r.net ? "" : String(r.session || "")
      if (!r.net && sess) { try { rpcSend(url2, "notifications/initialized", {}, null, sess) } catch (_) {} }
      return sess
    }
    var extractContent = function (result) {
      if (!result) return ""
      var out = ""
      var content = result.content
      if (content && typeof content.length === "number") {
        for (var ci = 0; ci < content.length && out.length < 6000; ci++) {
          var cItem = content[ci] || {}
          if (String(cItem.type || "") === "text") out += String(cItem.text || "")
          else if (cItem.type) out += "[" + String(cItem.type) + " 内容]"
        }
      }
      if (!out && result.structuredContent !== undefined && result.structuredContent !== null) {
        try { out = JSON.stringify(result.structuredContent) } catch (_) {}
      }
      return out
    }

    var targetUrl = String(rec.get("url") || "")
    var serverName = String(rec.get("server_name") || "")
    var invToolName = ("market:" + serverName + "/" + toolName).slice(0, 100)
    var inputSummary = ""
    try { inputSummary = JSON.stringify(argsObj) } catch (_) { inputSummary = "{}" }
    var writeInvocation = function (statusVal, latencyVal, outputVal, errCodeVal, retriedFlag) {
      try {
        var col = $app.findCollectionByNameOrId("tool_invocations")
        var invRec = new Record(col)
        invRec.set("rh_user_id", uid)
        invRec.set("tool_name", invToolName)
        invRec.set("tool_kind", "external")
        invRec.set("source", "market")
        invRec.set("run_id", "")
        invRec.set("status", String(statusVal))
        invRec.set("latency_ms", Number(latencyVal) || 0)
        invRec.set("input_summary", String(inputSummary).slice(0, 500))
        invRec.set("output_excerpt", String(outputVal || "").slice(0, 1000))
        invRec.set("error_code", String(errCodeVal || "").slice(0, 100))
        invRec.set("retried", retriedFlag === true)
        $app.save(invRec)
      } catch (wErr) {
        try { $app.logger().error("market writeInvocation", "err", String((wErr && wErr.message) || wErr)) } catch (_) {}
      }
    }

    var t0 = new Date().getTime()
    var callOnce = function (sessHint) {
      return rpcSend(targetUrl, "tools/call", { name: toolName, arguments: argsObj }, 10, sessHint)
    }
    var retried = false
    var r = callOnce("")
    if (r.net && flags) {
      // Only explicitly confirmed read-only tools may be repeated after
      // uncertain network outcomes. Never retry a potentially mutating tool.
      retried = true
      r = callOnce("")
    }
    var result = null
    var failMsg = ""
    var failCode = ""
    if (r.net) {
      failCode = "mcp_unreachable"
      failMsg = "插件地址不通：" + r.message + "。" + PREVIEW_HINT
    } else {
      result = r.data && r.data.result !== undefined ? r.data.result : null
      if (!result && needsInit(r)) {
        var sessInit = doInit(targetUrl) || String(r.session || "")
        var r2 = callOnce(sessInit)
        if (r2.net && flags) {
          retried = true
          r2 = callOnce(sessInit)
        }
        r = r2
        result = r.data && r.data.result !== undefined ? r.data.result : null
      }
      if (!result) {
        var errObj = (r.data && r.data.error) || null
        if (errObj) failMsg = String(errObj.message || "") + (errObj.data ? " | " + String(errObj.data).slice(0, 200) : "")
        if (!failMsg) failMsg = "HTTP " + r.status + "：" + String(r.text || "").replace(/\s+/g, " ").slice(0, 300)
        failCode = "mcp_http_" + r.status
        if (r.status === 401 || r.status === 403 || /unauthor|forbidden|api[_ -]?key|token|credential/i.test(failMsg)) failCode = "mcp_auth_required"
      } else if (result.isError === true) {
        failMsg = extractContent(result) || "插件返回了错误（isError）"
        failCode = "mcp_tool_error"
      }
    }
    var latency = new Date().getTime() - t0
    if (failMsg || !result) {
      var finalMsg = String(failMsg || "插件调用失败").slice(0, 500)
      writeInvocation("failed", latency, finalMsg, failCode, retried)
      return e.json(200, { ok: false, error: finalMsg, error_code: failCode || "mcp_error", latency_ms: latency, retried: retried, status_code: r.net ? 0 : r.status })
    }
    var output = extractContent(result)
    if (!output) output = "（插件返回了空内容）"
    output = String(output).slice(0, 4000)
    writeInvocation(retried ? "retried_success" : "success", latency, output, "", retried)
    return e.json(200, { ok: true, output: output, error: "", error_code: "", latency_ms: latency, retried: retried, status_code: r.status })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market invoke error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/market/invocations", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var rows = []
    try {
      rows = $app.findRecordsByFilter("tool_invocations", "rh_user_id = {:uid} && source = {:src}", "-created", 30, 0, { uid: uid, src: "market" })
    } catch (_) {}
    var items = []
    for (var ri = 0; ri < rows.length; ri++) {
      var rec = rows[ri]
      var retriedVal = false
      try { retriedVal = rec.getBool("retried") } catch (_) {}
      items.push({
        id: String(rec.id),
        tool_name: String(rec.get("tool_name") || ""),
        tool_kind: String(rec.get("tool_kind") || "external"),
        source: "market",
        run_id: String(rec.get("run_id") || ""),
        status: String(rec.get("status") || ""),
        latency_ms: Number(rec.get("latency_ms") || 0),
        input_summary: String(rec.get("input_summary") || ""),
        output_excerpt: String(rec.get("output_excerpt") || ""),
        error_code: String(rec.get("error_code") || ""),
        retried: retriedVal,
        created: String(rec.get("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market invocations error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// GET /api/market/lookup?name=<term> — 热门推荐按名取真实注册表条目。
// 先查 market_cache，未命中代理注册表 search 取最佳匹配（name 精确优先，否则首条）
// 归一化返回并写 market_cache；未找到 404 { error: "not_found" }。鉴权口径与 list 一致。
routerAdd("GET", "/api/market/lookup", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var name = String(qp["name"] || "").trim().slice(0, 200)
    if (!name) return e.json(400, { error: "bad_request", message: "缺少查询名 name" })

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
    var bytesToStr = function (r) {
      if (!r) return ""
      var raw = r.body
      if (typeof raw === "string") return raw
      if (!raw || raw.length === undefined) return ""
      return utf8ToStr(raw)
    }
    var normalizeServer = function (sv) {
      var remotes = []
      var rm = sv.remotes || []
      if (typeof rm.length === "number") {
        for (var rj = 0; rj < rm.length && remotes.length < 5; rj++) {
          var rItem = rm[rj] || {}
          var rUrl = String(rItem.url || "")
          if (!rUrl) continue
          remotes.push({ type: String(rItem.type || "streamable-http"), url: rUrl.slice(0, 400) })
        }
      }
      var pkgs = []
      var pk = sv.packages || []
      if (typeof pk.length === "number") {
        for (var pj = 0; pj < pk.length && pkgs.length < 6; pj++) {
          var pItem = pk[pj] || {}
          pkgs.push({
            registry: String(pItem.registry || "").slice(0, 40),
            name: String(pItem.name || "").slice(0, 200),
            identifier: String(pItem.identifier || "").slice(0, 200),
            version: String(pItem.version || "").slice(0, 40),
          })
        }
      }
      return {
        name: String(sv.name || "").slice(0, 200),
        title: String(sv.title || "").slice(0, 200),
        description: String(sv.description || "").slice(0, 1000),
        version: String(sv.version || "").slice(0, 40),
        remotes: remotes,
        packages: pkgs,
      }
    }
    var attachZh = function (item) {
      try {
        var zRows = $app.findRecordsByFilter("market_i18n", "server_name = {:sn}", "-created", 1, 0, { sn: item.name })
        if (zRows.length > 0) {
          var zt = String(zRows[0].get("zh_title") || "")
          var zd = String(zRows[0].get("zh_desc") || "")
          if (zt && !item.zh_title) item.zh_title = zt
          if (zd && !item.zh_desc) item.zh_desc = zd
        }
      } catch (_) {}
      return item
    }

    // 1) market_cache 命中直接返回（term 小写与原文双键；v2| 前缀为打分升级后的缓存版本，旧缓存自动失效）
    var cacheKey = "v2|" + name.toLowerCase()
    try {
      var cacheRows = $app.findRecordsByFilter("market_cache", "server_name = {:ka} || server_name = {:kb}", "-created", 1, 0, { ka: cacheKey, kb: "v2|" + name })
      if (cacheRows.length > 0) {
        var payloadStr = ""
        try { payloadStr = cacheRows[0].getString("payload") } catch (_) {}
        if (payloadStr) {
          var cached = JSON.parse(payloadStr)
          if (cached && String(cached.name || "")) return e.json(200, { ok: true, item: attachZh(cached), cached: true })
        }
      }
    } catch (_) {}

    // 2) 代理注册表 search 取最佳匹配
    var url = "https://registry.modelcontextprotocol.io/v0/servers?limit=10&cursor=&search=" + encodeURIComponent(name)
    var res = null
    try {
      res = $http.send({ url: url, method: "GET", timeout: 25, headers: { Accept: "application/json" } })
    } catch (netErr) {
      var rawMsg = String((netErr && netErr.message) || netErr).slice(0, 200)
      return e.json(502, {
        error: "registry_unreachable",
        message: "插件市场注册表暂不可达：" + rawMsg + "。预览环境可能无法访问该外部地址，发布后重试。",
        fingerprint: ("registry_unreachable " + rawMsg).slice(0, 80),
      })
    }
    var code = Number((res && res.statusCode) || 0)
    if (code < 200 || code >= 300) {
      return e.json(502, {
        error: "registry_http_" + code,
        message: "插件市场注册表返回错误（HTTP " + code + "），请稍后重试",
        fingerprint: ("registry_http " + code).slice(0, 80),
      })
    }
    var data = null
    try {
      data = JSON.parse(bytesToStr(res))
    } catch (parseErr) {
      var pm = String((parseErr && parseErr.message) || parseErr).slice(0, 120)
      return e.json(502, { error: "registry_bad_json", message: "插件市场注册表响应无法解析：" + pm, fingerprint: ("registry_bad_json " + pm).slice(0, 80) })
    }
    var servers = (data && data.servers) || []
    // 最佳匹配打分：name 精确 > title 精确 > 末段精确 > 分词精确命中（短名优先）> 子串包含 > 首条；同级内带远程地址者优先（可连接条目胜过仅本地进程条目）
    var best = null
    var lower = name.toLowerCase()
    var bestScore = -1
    var scoreServer = function (sv) {
      var nm = String(sv.name || "").toLowerCase()
      var tl = String(sv.title || "").toLowerCase()
      if (!nm) return -1
      var remoteBonus = (sv.remotes && sv.remotes.length > 0) ? 500 : 0
      if (nm === lower) return 100000 + remoteBonus
      if (tl && tl === lower) return 50000 + remoteBonus
      var segs = nm.split("/")
      if (segs[segs.length - 1] === lower) return 40000 - nm.length + remoteBonus
      var tokens = nm.split(/[\/.\-_\s]+/)
      var hasToken = false
      for (var tk = 0; tk < tokens.length; tk++) { if (tokens[tk] === lower) hasToken = true }
      if (hasToken) return 20000 - nm.length + remoteBonus
      if (nm.indexOf(lower) >= 0 || (tl && tl.indexOf(lower) >= 0)) return 9000 - nm.length + remoteBonus
      return remoteBonus
    }
    for (var si = 0; si < servers.length; si++) {
      var row = servers[si] || {}
      var sv = row.server && typeof row.server === "object" ? row.server : row
      var sc = scoreServer(sv)
      if (sc > bestScore) { bestScore = sc; best = sv }
      if (bestScore >= 100000) break
    }
    if (!best || !String(best.name || "")) return e.json(404, { error: "not_found", message: "注册表没有找到「" + name + "」相关插件" })
    var item = normalizeServer(best)

    // 3) 写 market_cache（term 小写 + 条目名双键，upsert）
    var writeCache = function (keyName, payloadObj) {
      if (!keyName) return
      try {
        var cacheCol = $app.findCollectionByNameOrId("market_cache")
        var exRows = $app.findRecordsByFilter("market_cache", "server_name = {:sn}", "-created", 1, 0, { sn: keyName })
        var cacheRec = exRows.length > 0 ? exRows[0] : new Record(cacheCol)
        cacheRec.set("server_name", keyName)
        cacheRec.set("payload", payloadObj)
        $app.save(cacheRec)
      } catch (_) {}
    }
    writeCache(cacheKey, item)
    if (item.name && "v2|" + item.name !== cacheKey) writeCache("v2|" + item.name, item)
    return e.json(200, { ok: true, item: attachZh(item), cached: false })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market lookup error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// POST /api/market/i18n { items: [{server_name, zh_title, zh_desc}] } — 批量 upsert 中文简介缓存。
// ≤30 条/次；全局共享读，不绑 uid（翻译缓存对所有登录用户可见）。鉴权口径与 list 一致。
routerAdd("POST", "/api/market/i18n", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var rowsIn = body.items
    if (!rowsIn || typeof rowsIn.length !== "number") return e.json(400, { error: "bad_request", message: "items 必须是数组" })
    var col = $app.findCollectionByNameOrId("market_i18n")
    var saved = 0
    for (var i = 0; i < rowsIn.length && saved < 30; i++) {
      var it = rowsIn[i] || {}
      var sn = String(it.server_name || "").trim().slice(0, 200)
      var zt = String(it.zh_title || "").trim().slice(0, 200)
      var zd = String(it.zh_desc || "").trim().slice(0, 600)
      if (!sn || (!zt && !zd)) continue
      var rec = null
      try {
        var ex = $app.findRecordsByFilter("market_i18n", "server_name = {:sn}", "-created", 1, 0, { sn: sn })
        if (ex.length > 0) rec = ex[0]
      } catch (_) {}
      if (!rec) rec = new Record(col)
      rec.set("server_name", sn)
      if (zt) rec.set("zh_title", zt)
      if (zd) rec.set("zh_desc", zd)
      $app.save(rec)
      saved++
    }
    return e.json(200, { ok: true, saved: saved })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("market i18n error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— Smithery 快连批次：填一次 API Key 即可浏览并一键连接 Smithery 托管插件；密钥仅存服务端 ——
routerAdd("GET", "/api/market/smithery/status", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录账号" })
    var rec = null
    try { rec = $app.findFirstRecordByFilter("smithery_keys", "rh_user_id = {:u}", { u: uid }) } catch (_) {}
    if (!rec) return e.json(200, { ok: true, has_key: false, tail: "" })
    return e.json(200, { ok: true, has_key: true, tail: String(rec.getString("key_tail") || "") })
  } catch (err) {
    var msg = String((err && err.message) || err)
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/market/smithery/key", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录账号" })
    var body = (e.requestInfo() || {}).body || {}
    var apiKey = String(body.api_key || "").trim()
    if (!apiKey) return e.json(400, { error: "bad_request", message: "请填写 Smithery API Key" })
    // 先向 Smithery 注册表验证 Key 有效性
    var smithery=require(__hooks+"/modules/smithery_managed.js")
    var check=smithery.send("GET","/servers?page=1&pageSize=1",apiKey)
    if(!check.ok){
      if(check.error==="invalid_token")
        return e.json(400,{error:"invalid_key",message:"Smithery 拒绝该 API Key。请在 Smithery 后台重新生成，并确认复制的是 API Key 而非登录 Token"})
      return e.json(check.error==="rate_limited"?429:502,{
        error:check.error||"smithery_unreachable",
        message:check.error==="rate_limited"?"Smithery 请求限流，请稍后验证":
          "无法访问 Smithery API 验证服务。Key 尚未保存，请检查网络或服务状态"})
    }
    var obf = function (plain) {
      var _secretKey = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
      if (_secretKey.length === 32) return "gcm1:" + $security.encrypt(String(plain), _secretKey)
      if ($os.getenv("AGENT_STUDIO_STRICT_SECRETS") === "true") throw new Error("secret_encryption_key_required")

      var parts = []
      for (var oi = 0; oi < plain.length; oi++) parts.push(String(plain.charCodeAt(oi) + 3))
      return parts.join(".")
    }
    var coll = null
    try { coll = $app.findCollectionByNameOrId("smithery_keys") } catch (_) {}
    if (!coll) {
      coll = new Collection({
        type: "base", name: "smithery_keys",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: "rh_user_id", type: "text", required: true, max: 100 },
          { name: "api_key", type: "text", required: true, max: 2000 },
          { name: "key_tail", type: "text", max: 8 },
        ],
      })
      $app.save(coll)
      coll = $app.findCollectionByNameOrId("smithery_keys")
    }
    var rec = null
    try { rec = $app.findFirstRecordByFilter("smithery_keys", "rh_user_id = {:u}", { u: uid }) } catch (_) {}
    if (!rec) rec = new Record(coll)
    rec.set("rh_user_id", uid)
    rec.set("api_key", obf(apiKey))
    rec.set("key_tail", apiKey.slice(-4))
    $app.save(rec)
    // A rotated key does not grant already stored gateway connections access
    // using old credentials. User must refresh after changing API credentials.
    try {
      var connRows=$app.findRecordsByFilter("market_connections",
        "rh_user_id = {:u}","-created",200,0,{u:uid})
      for(var ir=0;ir<connRows.length;ir++){
        var cr=connRows[ir]
        if(smithery.decodeProxy(String(cr.getString("url")||""))){
          cr.set("enabled",false)
          cr.set("headers_sec","[]")
          cr.set("headers_count",0)
          cr.set("last_probe_status","needs_refresh")
          cr.set("last_probe_msg","Smithery Key 已更新，请重新完成连接验证")
          $app.save(cr)
        }
      }
    }catch(_){}
    return e.json(200, { ok: true, tail: apiKey.slice(-4) })
  } catch (err) {
    var msg = String((err && err.message) || err)
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/market/smithery/key", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录账号" })
    var rec = null
    try { rec = $app.findFirstRecordByFilter("smithery_keys", "rh_user_id = {:u}", { u: uid }) } catch (_) {}
    if (rec) $app.delete(rec)
    // Credential removal must also revoke all managed MCP connections from
    // local Agent/Workflow execution (not just hide the Key UI).
    try{
      var rows=$app.findRecordsByFilter("market_connections",
        "rh_user_id = {:u}","-created",200,0,{u:uid})
      for(var j=0;j<rows.length;j++){
        var conn=rows[j]
        if(require(__hooks+"/modules/smithery_managed.js").decodeProxy(String(conn.getString("url")||""))){
          conn.set("enabled",false)
          conn.set("headers_sec","[]")
          conn.set("headers_count",0)
          conn.set("last_probe_status","needs_key")
          conn.set("last_probe_msg","已移除 Smithery Key，使用前需重新授权连接")
          $app.save(conn)
        }
      }
    }catch(_){}
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String((err && err.message) || err)
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/market/smithery/servers", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录账号" })
    var qp = (e.requestInfo() || {}).query || {}
    var q = String(qp.q || "").trim().toLowerCase()
    var rec = null
    try { rec = $app.findFirstRecordByFilter("smithery_keys", "rh_user_id = {:u}", { u: uid }) } catch (_) {}
    if (!rec) return e.json(400, { error: "smithery_key_required", message: "请先填写 Smithery API Key" })
    var deobf = function (stored) {
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
    var apiKey = deobf(String(rec.getString("api_key") || ""))
    var res = null
    try {
      res = $http.send({ url: "https://registry.smithery.ai/servers?pageSize=100", method: "GET", headers: { Authorization: "Bearer " + apiKey }, timeout: 20 })
    } catch (netErr) {
      return e.json(502, { error: "smithery_unreachable", message: "无法访问 Smithery 注册表（预览网络可能受限，发布后重试）", fingerprint: "sm_net" })
    }
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      return e.json(502, { error: "smithery_http_" + (res ? res.statusCode : 0), message: "Smithery 注册表返回异常，请检查 Key 是否仍有效", fingerprint: "sm_http" })
    }
    var raw = typeof res.raw === "string" ? res.raw : String(res.raw || "")
    var parsed = null
    try { parsed = JSON.parse(raw) } catch (_) {}
    var arr = (parsed && parsed.servers) || (parsed && parsed.data) || (Array.isArray(parsed) ? parsed : [])
    // 中文缓存合并（market_i18n 按 server_name 存 zh_title/zh_desc）
    var zhMap = {}
    try {
      var zhRows = $app.findRecordsByFilter("market_i18n", "server_name != ''", "-created", 1000, 0)
      for (var zi = 0; zi < zhRows.length; zi++) {
        zhMap[String(zhRows[zi].getString("server_name") || "")] = {
          zh_title: String(zhRows[zi].getString("zh_title") || ""),
          zh_desc: String(zhRows[zi].getString("zh_desc") || ""),
        }
      }
    } catch (_) {}
    var items = []
    for (var i = 0; i < arr.length && items.length < 60; i++) {
      var sv = arr[i] || {}
      var slug = String(sv.qualifiedName || sv.name || sv.slug || "")
      if (!slug) continue
      var title = String(sv.displayName || sv.title || slug)
      var desc = String(sv.description || "")
      if (q && (slug + " " + title + " " + desc).toLowerCase().indexOf(q) < 0) continue
      var zh = zhMap[slug] || null
      items.push({ slug: slug, title: title, desc: desc.slice(0, 400), zh_title: zh ? zh.zh_title : "", zh_desc: zh ? zh.zh_desc : "" })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// Retired: the legacy endpoint put a full API key in a URL and marked untested
// connections as enabled. All new connections must use managed Smithery V2.
routerAdd("POST", "/api/market/smithery/connect", function(e) {
  return e.json(410, {error:"legacy_smithery_connection_disabled",
    message:"旧版连接方式已停用。请在插件市场使用 Smithery 托管连接（需完成授权和工具发现）"})
})