// tool_connections_api.pb.js — 外部工具连接管理（脱敏读写 + 后端代理真实调用测试）
// 表结构由 MCP install_business_collection 装（tool_connections.pb.js，仅 create/update/delete，前端不用）。
// 本文件是前端唯一数据通路：所有响应脱敏（headers 值绝不回显明文，只给 key 名 + ••••尾4位），
// 所有路由按 X-Rh-User-Id 校验归属，非本人一律 404。
// headers 值落库前做可逆混淆存储（字符码 +3 点分，与 model_connections_api.pb.js 同模式，
// 但按 Goja 铁律每个回调内 self-contained 重新实现，禁止跨文件引用）。
// 代理测试：POST /api/tool-connections/test → $http.send 真实调用用户工具 URL，
// 支持「表单直传参数」与「connection_id + input」两种模式；返回 200 结构化结果，失败不抛 500。
// Goja 铁律：全部 var、new Date().getTime()、helper 就地定义、每个回调 self-contained、
// 5xx 一律 { error, message, fingerprint }。

routerAdd("GET", "/api/tool-connections", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })

    var maskRecord = function (rec) {
      var deobfLocal = function (stored) {
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
      var headersOut = []
      var headersStr = ""
      try {
        headersStr = rec.getString("headers")
      } catch (_) {
        headersStr = ""
      }
      if (headersStr) {
        try {
          var hp = JSON.parse(headersStr)
          if (hp && typeof hp.length === "number") {
            for (var hi = 0; hi < hp.length; hi++) {
              var hItem = hp[hi] || {}
              var hKey = String(hItem.k || "")
              if (!hKey) continue
              var hPlain = deobfLocal(String(hItem.v || ""))
              headersOut.push({ key: hKey, value: "••••" + hPlain.slice(-4) })
            }
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
      var timeoutVal = 15
      try {
        timeoutVal = Number(rec.getInt("timeout_s") || 15)
      } catch (_) {}
      if (isNaN(timeoutVal) || timeoutVal < 5) timeoutVal = 15
      var methodVal = "POST"
      try {
        methodVal = String(rec.getString("method") || "POST").toUpperCase()
      } catch (_) {}
      if (methodVal !== "GET") methodVal = "POST"
      return {
        id: String(rec.id),
        name: String(rec.getString("name") || ""),
        description: String(rec.getString("description") || ""),
        url: String(rec.getString("url") || ""),
        method: methodVal,
        headers: headersOut,
        body_template: String(rec.getString("body_template") || ""),
        timeout_s: timeoutVal,
        enabled: enabledVal,
        status: String(rec.getString("status") || "untested"),
        last_latency_ms: latency,
        last_checked_at: checkedStr,
        last_error: String(rec.getString("last_error") || ""),
        created: String(rec.getString("created") || ""),
        updated: String(rec.getString("updated") || ""),
      }
    }

    var rows = []
    try {
      rows = $app.findRecordsByFilter("tool_connections", "rh_user_id = {:uid}", "-created", 200, 0, { uid: uid })
    } catch (_) {
      rows = []
    }
    var items = []
    for (var i = 0; i < rows.length; i++) items.push(maskRecord(rows[i]))
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("tool_connections list error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/tool-connections/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try {
      rec = $app.findRecordById("tool_connections", id)
    } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工具连接不存在或已删除" })
    }

    var deobfLocal = function (stored) {
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
    var headersOut = []
    var headersStr = ""
    try {
      headersStr = rec.getString("headers")
    } catch (_) {}
    if (headersStr) {
      try {
        var hp = JSON.parse(headersStr)
        if (hp && typeof hp.length === "number") {
          for (var hi = 0; hi < hp.length; hi++) {
            var hItem = hp[hi] || {}
            var hKey = String(hItem.k || "")
            if (!hKey) continue
            headersOut.push({ key: hKey, value: "••••" + deobfLocal(String(hItem.v || "")).slice(-4) })
          }
        }
      } catch (_) {}
    }
    var checkedStr = ""
    try {
      checkedStr = String(rec.getString("last_checked_at") || "")
    } catch (_) {}
    if (checkedStr.indexOf("0001-01-01") === 0) checkedStr = ""
    var enabledVal = false
    try {
      enabledVal = rec.getBool("enabled")
    } catch (_) {}
    return e.json(200, {
      ok: true,
      item: {
        id: String(rec.id),
        name: String(rec.getString("name") || ""),
        description: String(rec.getString("description") || ""),
        url: String(rec.getString("url") || ""),
        method: String(rec.getString("method") || "POST"),
        headers: headersOut,
        body_template: String(rec.getString("body_template") || ""),
        timeout_s: Number(rec.getInt("timeout_s") || 15),
        enabled: enabledVal,
        status: String(rec.getString("status") || "untested"),
        last_latency_ms: Number(rec.getInt("last_latency_ms") || 0),
        last_checked_at: checkedStr,
        last_error: String(rec.getString("last_error") || ""),
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("tool_connections view error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/tool-connections", function (e) {
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
    var obfVal = function (plain) {
      var _secretKey = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
      if (_secretKey.length === 32) return "gcm1:" + $security.encrypt(String(plain), _secretKey)
      if ($os.getenv("AGENT_STUDIO_STRICT_SECRETS") === "true") throw new Error("secret_encryption_key_required")

      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }
    var normHeaders = function (raw) {
      var out = []
      if (!raw || typeof raw.length !== "number") return out
      for (var i = 0; i < raw.length && out.length < 20; i++) {
        var it = raw[i] || {}
        var k = String(it.key || "").trim().slice(0, 100)
        var v = String(it.value === undefined || it.value === null ? "" : it.value)
        if (!k) continue
        out.push({ k: k, v: obfVal(v) })
      }
      return out
    }

    var nameVal = String(body.name || "").trim().slice(0, 100)
    var descVal = String(body.description || "").trim().slice(0, 500)
    var urlVal = normUrl(body.url)
    var methodVal = String(body.method || "POST").trim().toUpperCase() === "GET" ? "GET" : "POST"
    var timeoutVal = parseInt(body.timeout_s, 10)
    if (isNaN(timeoutVal)) timeoutVal = 15
    if (timeoutVal < 5) timeoutVal = 5
    if (timeoutVal > 60) timeoutVal = 60
    if (!nameVal) return e.json(400, { error: "bad_request", message: "请填写工具名称" })
    if (!descVal) return e.json(400, { error: "bad_request", message: "请填写用途描述（助手靠它判断何时调用这个工具）" })
    if (!urlVal) return e.json(400, { error: "bad_request", message: "请求 URL 必须以 http:// 或 https:// 开头" })

    var dupRows = []
    try {
      dupRows = $app.findRecordsByFilter("tool_connections", "rh_user_id = {:uid} && id != '' && name = {:name}", "-created", 1, 0, {
        uid: uid,
        name: nameVal,
      })
    } catch (_) {
      dupRows = []
    }
    if (dupRows.length > 0) {
      return e.json(409, { error: "name_taken", message: "你已经有一个叫「" + nameVal + "」的工具，换个名称再保存" })
    }

    var headersStored = normHeaders(body.headers)

    var col = $app.findCollectionByNameOrId("tool_connections")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("name", nameVal)
    rec.set("description", descVal)
    rec.set("url", urlVal)
    rec.set("method", methodVal)
    rec.set("headers", headersStored)
    rec.set("body_template", String(body.body_template || "").slice(0, 20000))
    rec.set("timeout_s", timeoutVal)
    rec.set("enabled", true)
    rec.set("status", "untested")
    rec.set("last_latency_ms", 0)
    rec.set("last_error", "")
    $app.save(rec)

    var headersMasked = []
    for (var mi = 0; mi < headersStored.length; mi++) {
      var mk = headersStored[mi]
      headersMasked.push({ key: mk.k, value: "••••" + String(mk.v || "").length })
    }
    // 掩码尾4位按明文算：直接从入参重取（不落日志）
    var rawHeadersIn = body.headers && typeof body.headers.length === "number" ? body.headers : []
    headersMasked = []
    for (var mj = 0; mj < rawHeadersIn.length && headersMasked.length < 20; mj++) {
      var rj = rawHeadersIn[mj] || {}
      var rk = String(rj.key || "").trim()
      if (!rk) continue
      headersMasked.push({ key: rk, value: "••••" + String(rj.value || "").slice(-4) })
    }

    return e.json(200, {
      ok: true,
      item: {
        id: String(rec.id),
        name: nameVal,
        description: descVal,
        url: urlVal,
        method: methodVal,
        headers: headersMasked,
        body_template: String(body.body_template || "").slice(0, 20000),
        timeout_s: timeoutVal,
        enabled: true,
        status: "untested",
        last_latency_ms: 0,
        last_checked_at: "",
        last_error: "",
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("tool_connections create error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("PATCH", "/api/tool-connections/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try {
      rec = $app.findRecordById("tool_connections", id)
    } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工具连接不存在或已删除" })
    }
    var body = (e.requestInfo() || {}).body || {}

    var normUrl = function (raw) {
      var u = String(raw || "").trim()
      if (!/^https?:\/\//i.test(u)) return ""
      while (u.length > 1 && u.charAt(u.length - 1) === "/") u = u.slice(0, u.length - 1)
      return u
    }
    var obfVal = function (plain) {
      var _secretKey = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
      if (_secretKey.length === 32) return "gcm1:" + $security.encrypt(String(plain), _secretKey)
      if ($os.getenv("AGENT_STUDIO_STRICT_SECRETS") === "true") throw new Error("secret_encryption_key_required")

      var parts = []
      for (var i = 0; i < plain.length; i++) parts.push(String(plain.charCodeAt(i) + 3))
      return parts.join(".")
    }

    if (body.name !== undefined && body.name !== null) {
      var nameVal = String(body.name || "").trim().slice(0, 100)
      if (!nameVal) return e.json(400, { error: "bad_request", message: "工具名称不能为空" })
      var curName = ""
      try {
        curName = String(rec.getString("name") || "")
      } catch (_) {}
      if (nameVal !== curName) {
        var dupRows = []
        try {
          dupRows = $app.findRecordsByFilter("tool_connections", "rh_user_id = {:uid} && id != '' && name = {:name}", "-created", 2, 0, {
            uid: uid,
            name: nameVal,
          })
        } catch (_) {
          dupRows = []
        }
        var dupOther = false
        for (var di = 0; di < dupRows.length; di++) {
          if (String(dupRows[di].id) !== String(rec.id)) dupOther = true
        }
        if (dupOther) {
          return e.json(409, { error: "name_taken", message: "你已经有一个叫「" + nameVal + "」的工具，换个名称再保存" })
        }
      }
      rec.set("name", nameVal)
    }
    if (body.description !== undefined && body.description !== null) {
      var descVal = String(body.description || "").trim().slice(0, 500)
      if (!descVal) return e.json(400, { error: "bad_request", message: "用途描述不能为空" })
      rec.set("description", descVal)
    }
    if (body.url !== undefined && body.url !== null) {
      var urlVal = normUrl(body.url)
      if (!urlVal) return e.json(400, { error: "bad_request", message: "请求 URL 必须以 http:// 或 https:// 开头" })
      rec.set("url", urlVal)
    }
    if (body.method !== undefined && body.method !== null) {
      rec.set("method", String(body.method || "POST").trim().toUpperCase() === "GET" ? "GET" : "POST")
    }
    if (body.body_template !== undefined && body.body_template !== null) {
      rec.set("body_template", String(body.body_template || "").slice(0, 20000))
    }
    if (body.timeout_s !== undefined && body.timeout_s !== null && body.timeout_s !== "") {
      var timeoutVal = parseInt(body.timeout_s, 10)
      if (isNaN(timeoutVal)) timeoutVal = 15
      if (timeoutVal < 5) timeoutVal = 5
      if (timeoutVal > 60) timeoutVal = 60
      rec.set("timeout_s", timeoutVal)
    }
    if (body.headers !== undefined && body.headers !== null && typeof body.headers.length === "number") {
      // 编辑合并规则：值为空 = 保留该 key 已存的混淆值；未出现的 key 视为删除
      var oldStored = []
      var oldStr = ""
      try {
        oldStr = rec.getString("headers")
      } catch (_) {}
      if (oldStr) {
        try {
          var op = JSON.parse(oldStr)
          if (op && typeof op.length === "number") oldStored = op
        } catch (_) {}
      }
      var merged = []
      for (var ni = 0; ni < body.headers.length && merged.length < 20; ni++) {
        var nItem = body.headers[ni] || {}
        var nKey = String(nItem.key || "").trim().slice(0, 100)
        if (!nKey) continue
        var nVal = String(nItem.value === undefined || nItem.value === null ? "" : nItem.value)
        if (nVal === "") {
          for (var oi = 0; oi < oldStored.length; oi++) {
            var oItem = oldStored[oi] || {}
            if (String(oItem.k || "") === nKey) {
              merged.push({ k: nKey, v: String(oItem.v || "") })
              break
            }
          }
          continue
        }
        merged.push({ k: nKey, v: obfVal(nVal) })
      }
      rec.set("headers", merged)
    }
    if (body.enabled !== undefined && body.enabled !== null) {
      rec.set("enabled", body.enabled === true)
    }
    $app.save(rec)

    // 重新读回并输出脱敏视图
    var fresh = $app.findRecordById("tool_connections", String(rec.id))
    var deobfLocal = function (stored) {
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
      for (var pi = 0; pi < parts.length; pi++) {
        var pn = parseInt(parts[pi], 10)
        if (isNaN(pn)) return s
        out += String.fromCharCode(pn - 3)
      }
      return out
    }
    var headersOut = []
    var freshStr = ""
    try {
      freshStr = fresh.getString("headers")
    } catch (_) {}
    if (freshStr) {
      try {
        var fp = JSON.parse(freshStr)
        if (fp && typeof fp.length === "number") {
          for (var fi = 0; fi < fp.length; fi++) {
            var fItem = fp[fi] || {}
            var fKey = String(fItem.k || "")
            if (!fKey) continue
            headersOut.push({ key: fKey, value: "••••" + deobfLocal(String(fItem.v || "")).slice(-4) })
          }
        }
      } catch (_) {}
    }
    var enabledOut = false
    try {
      enabledOut = fresh.getBool("enabled")
    } catch (_) {}
    return e.json(200, {
      ok: true,
      item: {
        id: String(fresh.id),
        name: String(fresh.getString("name") || ""),
        description: String(fresh.getString("description") || ""),
        url: String(fresh.getString("url") || ""),
        method: String(fresh.getString("method") || "POST"),
        headers: headersOut,
        body_template: String(fresh.getString("body_template") || ""),
        timeout_s: Number(fresh.getInt("timeout_s") || 15),
        enabled: enabledOut,
        status: String(fresh.getString("status") || "untested"),
        last_latency_ms: Number(fresh.getInt("last_latency_ms") || 0),
        last_checked_at: "",
        last_error: String(fresh.getString("last_error") || ""),
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("tool_connections patch error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/tool-connections/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try {
      rec = $app.findRecordById("tool_connections", id)
    } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工具连接不存在或已删除" })
    }
    $app.delete(rec)
    return e.json(200, { ok: true, id: id })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("tool_connections delete error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/tool-connections/test", function (e) {
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
      for (var i = 0; i < parts.length; i++) {
        var n = parseInt(parts[i], 10)
        if (isNaN(n)) return s
        out += String.fromCharCode(n - 3)
      }
      return out
    }
    // 错误详情/响应摘要外发前抹掉 URL query 里疑似密钥的参数值
    var sanitizeDetail = function (s) {
      return String(s || "").replace(/([?&](?:api[_-]?key|key|token|secret|password|access[_-]?key)=)[^&\s"']+/gi, "$1***")
    }

    var connRec = null
    var urlVal = ""
    var methodVal = "POST"
    var reqHeaders = {}
    var bodyTemplate = ""
    var timeoutVal = 15
    var connId = String(body.connection_id || "").trim()
    if (connId) {
      try {
        connRec = $app.findRecordById("tool_connections", connId)
      } catch (_) {}
      if (!connRec || String(connRec.get("rh_user_id") || "") !== uid) {
        return e.json(404, { error: "not_found", message: "工具连接不存在或已删除" })
      }
      urlVal = normUrl(connRec.getString("url"))
      methodVal = String(connRec.getString("method") || "POST").toUpperCase() === "GET" ? "GET" : "POST"
      bodyTemplate = String(connRec.getString("body_template") || "")
      timeoutVal = Number(connRec.getInt("timeout_s") || 15)
      var storedStr = ""
      try {
        storedStr = connRec.getString("headers")
      } catch (_) {}
      if (storedStr) {
        try {
          var sp = JSON.parse(storedStr)
          if (sp && typeof sp.length === "number") {
            for (var si = 0; si < sp.length; si++) {
              var sItem = sp[si] || {}
              var sKey = String(sItem.k || "")
              if (sKey) reqHeaders[sKey] = deobfVal(String(sItem.v || ""))
            }
          }
        } catch (_) {}
      }
    } else {
      urlVal = normUrl(body.url)
      methodVal = String(body.method || "POST").trim().toUpperCase() === "GET" ? "GET" : "POST"
      bodyTemplate = String(body.body_template || "").slice(0, 20000)
      timeoutVal = parseInt(body.timeout_s, 10)
      if (isNaN(timeoutVal)) timeoutVal = 15
      var rawHeaders = body.headers && typeof body.headers.length === "number" ? body.headers : []
      for (var ri = 0; ri < rawHeaders.length && ri < 20; ri++) {
        var rItem = rawHeaders[ri] || {}
        var rKey = String(rItem.key || "").trim()
        if (!rKey) continue
        reqHeaders[rKey] = String(rItem.value === undefined || rItem.value === null ? "" : rItem.value)
      }
    }
    if (isNaN(timeoutVal) || timeoutVal < 5) timeoutVal = 5
    if (timeoutVal > 60) timeoutVal = 60
    if (!urlVal) {
      return e.json(400, { error: "bad_request", message: "请求 URL 必须以 http:// 或 https:// 开头" })
    }

    // This is a real external call, not a simulation. Require explicit consent
    // even in the unsaved form test path, once for EACH non-GET invocation.
    var testPolicy = require(__hooks + "/modules/tool_policy.js").classify({
      toolName: connRec ? String(connRec.getString("name") || "") : "unsaved_external_tool",
      external: true, method: methodVal,
    })
    if (testPolicy.write && body.confirm_write !== true) {
      return e.json(409, {
        error: "write_confirmation_required",
        message: "POST 测试会真实向外部服务发送写请求，可能修改数据或产生费用。请确认本次操作后再调用。",
      })
    }

    var inputStr = String(body.input === undefined || body.input === null ? "" : body.input)

    // 纵深防御：上游若把我方送出的 header 值反射进响应体，摘要外发前先抹掉
    var sentSecrets = []
    for (var secKey in reqHeaders) {
      var secVal = String(reqHeaders[secKey] || "")
      if (secVal.length >= 8) sentSecrets.push(secVal)
    }
    var redactSecrets = function (s) {
      var out = String(s || "")
      for (var rsi = 0; rsi < sentSecrets.length; rsi++) {
        out = out.split(sentSecrets[rsi]).join("***")
      }
      return out
    }

    var persist = function (statusVal, latencyVal, errText) {
      if (!connRec) return
      try {
        connRec.set("status", String(statusVal))
        connRec.set("last_latency_ms", Number(latencyVal) || 0)
        connRec.set("last_checked_at", new Date().toISOString())
        connRec.set("last_error", String(errText || "").slice(0, 1000))
        $app.save(connRec)
      } catch (perr) {
        try {
          $app.logger().error("tool_connections persist error", "err", String((perr && perr.message) || perr))
        } catch (_) {}
      }
    }

    // 模板占位符：{{字段名}} 按测试入参字段取值并 URL 编码，{{input}} 替换为入参原文
    var inputObj = null
    try {
      inputObj = JSON.parse(inputStr)
    } catch (_) {}
    if (!inputObj || typeof inputObj !== "object") inputObj = {}
    var applyToolTemplate2 = function (tpl, inputJson) {
      return String(tpl || "").replace(/\{\{\s*([a-zA-Z0-9_一-龥]+)\s*\}\}/g, function (m, key) {
        if (key === "input") return inputJson
        var v = inputObj[key] !== undefined ? inputObj[key] : ""
        if (v && typeof v === "object") v = JSON.stringify(v)
        return encodeURIComponent(String(v))
      })
    }
    urlVal = applyToolTemplate2(urlVal, inputStr)
    // 测试路由经预览网关转发，发送超时钳制到 25s 以内防止网关先断开（用户配置 timeout_s 语义不变，仅此处保护）
    var testTimeout = timeoutVal > 25 ? 25 : timeoutVal
    var sendOpts = { url: urlVal, method: methodVal, headers: reqHeaders, timeout: testTimeout }
    if (methodVal === "POST") {
      var reqBody = ""
      if (bodyTemplate) {
        reqBody = applyToolTemplate2(bodyTemplate, inputStr)
      } else {
        reqBody = inputStr !== "" ? inputStr : "{}"
      }
      sendOpts.body = reqBody
      var hasCt = false
      for (var ctKey in reqHeaders) {
        if (String(ctKey).toLowerCase() === "content-type") {
          hasCt = true
          break
        }
      }
      if (!hasCt) reqHeaders["Content-Type"] = "application/json"
    }

    var t0 = new Date().getTime()
    var res = null
    try {
      res = $http.send(sendOpts)
    } catch (netErr) {
      var latency0 = new Date().getTime() - t0
      var netRaw = String((netErr && netErr.message) || netErr)
      var netMsg = /timeout|deadline/i.test(netRaw)
        ? "请求超时（" + testTimeout + " 秒内无响应）。注意：预览环境可能无法访问部分外部地址，发布后可重新测试，或先换一个当前网络可达的地址"
        : "地址不通：请求未能发出或未收到响应"
      persist("error", latency0, netMsg)
      return e.json(200, {
        ok: false,
        status_code: 0,
        latency_ms: latency0,
        response_excerpt: "",
        error: netMsg,
        detail: redactSecrets(sanitizeDetail(netRaw)).slice(0, 200),
      })
    }
    var latencyMs = new Date().getTime() - t0
    var code = res ? res.statusCode : 0
    // res.body 是字节数组：按 UTF-8 多字节解码（逐字节 fromCharCode 中文会乱码）
    var utf8ToStr2 = function (bytes) {
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
    var rawBody = ""
    try {
      var tbRaw = res ? res.body : null
      if (typeof tbRaw === "string") {
        rawBody = tbRaw
      } else if (tbRaw && tbRaw.length !== undefined) {
        rawBody = utf8ToStr2(tbRaw)
      }
    } catch (_) {}
    var excerpt = redactSecrets(sanitizeDetail(rawBody)).slice(0, 500)
    if (code < 200 || code >= 300) {
      var httpMsg = "服务返回错误（HTTP " + code + "）"
      if (code === 401 || code === 403) httpMsg = "鉴权失败（HTTP " + code + "），请检查请求头里的密钥是否有效"
      persist("error", latencyMs, httpMsg)
      return e.json(200, { ok: false, status_code: code, latency_ms: latencyMs, response_excerpt: excerpt, error: httpMsg })
    }
    persist("ok", latencyMs, "")
    return e.json(200, { ok: true, status_code: code, latency_ms: latencyMs, response_excerpt: excerpt, error: "" })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("tool_connections test error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
