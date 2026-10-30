// tool_hub_api.pb.js — per-employee tool diagnostics and execution summary.
// GET /api/tool-hub/invocations — owner-scoped, bounded server-side paging/filtering.
// GET /api/tool-hub/stats — cumulative owner-scoped metrics.
// GET /api/harness/monitor — bounded owner-scoped execution monitor.
// POST /api/tool-hub/debug — approval-gated tool probe.
// Goja runtime: var bindings, self-contained route handlers.
routerAdd("GET", "/api/tool-hub/invocations", function(e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] ||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录员工账号" })
    var qp = (e.requestInfo() || {}).query || {}
    var rawLimit = String(qp.limit || "20")
    var rawPage = String(qp.page || "1")
    if (!/^[0-9]{1,5}$/.test(rawLimit) || !/^[0-9]{1,5}$/.test(rawPage))
      return e.json(400, {error:"invalid_pagination"})
    var limit = Math.max(1, Math.min(50, parseInt(rawLimit,10)))
    var page = Math.max(1, Math.min(10000, parseInt(rawPage,10)))
    var offset = (page - 1) * limit
    var toolName = String(qp.tool_name || "").trim().slice(0,100)
    var query = String(qp.q || "").trim().slice(0,100)
    var status = String(qp.status || "").trim()
    var source = String(qp.source || "").trim()
    var runId = String(qp.run_id || "").trim()
    if (status && status !== "success" && status !== "retried_success" && status !== "failed")
      return e.json(400,{error:"invalid_invocation_status"})
    if (source && source !== "debug" && source !== "agent_run" && source !== "workflow")
      return e.json(400,{error:"invalid_invocation_source"})
    if (runId && !/^[A-Za-z0-9]{15}$/.test(runId))
      return e.json(400,{error:"invalid_run_id"})
    // Use ONE parameterized SQL predicate for total and ordered IDs.
    // PocketBase's "~" syntax translates '%' and '_' into SQL wildcards;
    // combining it with a literal COUNT predicate produces contradictory pages.
    var countWhere = "rh_user_id = {:uid}"
    var params = {uid:uid}
    if (toolName) {
      countWhere += " AND tool_name = {:tname}"
      params.tname = toolName
    }
    if (query) {
      countWhere += " AND INSTR(LOWER(tool_name), LOWER({:query})) > 0"
      params.query = query
    }
    if (status) {
      countWhere += " AND status = {:status}"
      params.status = status
    }
    if (source) {
      countWhere += " AND source = {:source}"
      params.source = source
    }
    if(runId){
      countWhere += " AND run_id = {:runId}"
      params.runId=runId
    }
    var count = new DynamicModel({total:-1})
    $app.db().newQuery("SELECT COUNT(*) AS total FROM tool_invocations WHERE "+countWhere)
      .bind(params).one(count)
    var totalItems = Number(count.total)
    if (!isFinite(totalItems) || totalItems < 0 || Math.floor(totalItems) !== totalItems)
      throw new Error("invalid_invocation_count")
    var pageParams={}
    for(var key in params)pageParams[key]=params[key]
    pageParams.limit=limit
    pageParams.offset=offset
    var ids=arrayOf(new DynamicModel({id:""}))
    $app.db().newQuery(
      "SELECT id FROM tool_invocations WHERE "+countWhere+
      " ORDER BY created DESC,id DESC LIMIT {:limit} OFFSET {:offset}"
    ).bind(pageParams).all(ids)
    var rows=[]
    for(var ix=0;ix<ids.length;ix++){
      try {
        var record=$app.findRecordById("tool_invocations",String(ids[ix].id))
        // Defense in depth: verify ownership after resolving the record.
        if(record && String(record.getString("rh_user_id")||"")===uid)rows.push(record)
      }catch(_){}
    }    var items = []
    for (var i=0;i<rows.length;i++) {
      var r=rows[i]
      var retried=false,latency=0
      try{retried=r.getBool("retried")}catch(_){}
      try{latency=Number(r.get("latency_ms")||0)}catch(_){}
      items.push({
        id:String(r.id),tool_name:String(r.getString("tool_name")||""),
        tool_kind:String(r.getString("tool_kind")||""),
        source:String(r.getString("source")||""),
        run_id:String(r.getString("run_id")||""),
        status:String(r.getString("status")||""),
        latency_ms:latency,input_summary:String(r.getString("input_summary")||""),
        output_excerpt:String(r.getString("output_excerpt")||""),
        error_code:String(r.getString("error_code")||""),
        retried:retried,created:String(r.get("created")||""),
      })
    }
    return e.json(200,{ok:true,items:items,page:page,perPage:limit,totalItems:totalItems,
      totalPages:Math.max(1,Math.ceil(totalItems/limit))})
  }catch(err){
    var msg=String((err&&err.message)||err)
    try{$app.logger().error("tool_hub invocations error","err",msg)}catch(_){}
    return e.json(500,{error:"internal",message:"工具记录读取失败，请重试",fingerprint:msg.slice(0,80)})
  }
})

routerAdd("GET", "/api/tool-hub/stats", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    // PocketBase 0.40.5 countRecords() cannot accept a filter string
    // in place of a dbx.Expression. Fixed owner-bound SQL avoids a
    // misleading 500-row fallback or a fabricated zero on DB errors.
    var countOf = function (col, filter, params) {
      var query = ""
      if (col === "agent_runs" && filter === "rh_user_id = {:uid}")
        query = "SELECT COUNT(*) AS total FROM agent_runs WHERE rh_user_id = {:uid}"
      else if (col === "workflow_runs" && filter === "rh_user_id = {:uid}")
        query = "SELECT COUNT(*) AS total FROM workflow_runs WHERE rh_user_id = {:uid}"
      else if (col === "tool_invocations" && filter === "rh_user_id = {:uid}")
        query = "SELECT COUNT(*) AS total FROM tool_invocations WHERE rh_user_id = {:uid}"
      else if (col === "tool_invocations" && filter === "rh_user_id = {:uid} && (status = 'success' || status = 'retried_success')")
        query = "SELECT COUNT(*) AS total FROM tool_invocations WHERE rh_user_id = {:uid} AND status IN ('success','retried_success')"
      else if (col === "tool_invocations" && filter === "rh_user_id = {:uid} && status = 'failed'")
        query = "SELECT COUNT(*) AS total FROM tool_invocations WHERE rh_user_id = {:uid} AND status = 'failed'"
      else if (col === "tool_invocations" && filter === "rh_user_id = {:uid} && retried = true")
        query = "SELECT COUNT(*) AS total FROM tool_invocations WHERE rh_user_id = {:uid} AND retried = 1"
      else if (col === "tool_invocations" && filter === "rh_user_id = {:uid} && tool_kind = 'external'")
        query = "SELECT COUNT(*) AS total FROM tool_invocations WHERE rh_user_id = {:uid} AND tool_kind = 'external'"
      else throw new Error("unsupported_stats_count")
      var row = new DynamicModel({ total: -1 })
      $app.db().newQuery(query).bind({ uid: params.uid }).one(row)
      var n = Number(row.total)
      if (!isFinite(n) || n < 0 || Math.floor(n) !== n) throw new Error("invalid_stats_count")
      return n
    }
    var agentRuns = countOf("agent_runs", "rh_user_id = {:uid}", { uid: uid })
    var wfRuns = countOf("workflow_runs", "rh_user_id = {:uid}", { uid: uid })
    var invTotal = countOf("tool_invocations", "rh_user_id = {:uid}", { uid: uid })
    var invSuccess = countOf("tool_invocations", "rh_user_id = {:uid} && (status = 'success' || status = 'retried_success')", { uid: uid })
    var invFailed = countOf("tool_invocations", "rh_user_id = {:uid} && status = 'failed'", { uid: uid })
    var invRetried = countOf("tool_invocations", "rh_user_id = {:uid} && retried = true", { uid: uid })
    var invExternal = countOf("tool_invocations", "rh_user_id = {:uid} && tool_kind = 'external'", { uid: uid })
    return e.json(200, {
      ok: true,
      run_count: agentRuns + wfRuns,
      agent_run_count: agentRuns,
      workflow_run_count: wfRuns,
      invocation_count: invTotal,
      success_count: invSuccess,
      failed_count: invFailed,
      retried_count: invRetried,
      external_invocation_count: invExternal,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("tool_hub stats error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— Harness 监控批次：GET /api/harness/monitor ——
// 聚合本人最近 100 条 agent_runs + 100 条 workflow_runs + 500 条 tool_invocations。
// totals: runs / succeeded / failed / cancelled / success_rate(0-100 一位小数) / avg_steps /
//   avg_duration_ms(created→updated 差均值) / est_tokens_total((est_prompt_chars+est_out_chars)/4 求和) /
//   approvals / stuck_loops(error 含 stuck_loop_detected 计数) / compressions / truncations。
// harness 计数读 checkpoint.harness_stats（getString 优先，缺失跳过不编）；tools 按 calls 降序 ≤12。
routerAdd("GET", "/api/harness/monitor", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })

    var safeRows = function (col, limitN) {
      return $app.findRecordsByFilter(col, "rh_user_id = {:uid}", "-created", limitN, 0, { uid: uid })
    }
    // checkpoint json 读取：getString 优先（与 workflow_api.loadJson 同款），解析失败回 get()，全缺返回 {}
    var loadCpJson = function (rec) {
      var s = ""
      try {
        s = rec.getString("checkpoint")
      } catch (_) {
        s = ""
      }
      if (s) {
        try {
          var parsed = JSON.parse(s)
          if (parsed !== null && typeof parsed === "object") return parsed
        } catch (_) {}
      }
      var v = null
      try {
        v = rec.get("checkpoint")
      } catch (_) {}
      if (v === null || v === undefined) return {}
      if (typeof v === "string") {
        try {
          return JSON.parse(v)
        } catch (_) {
          return {}
        }
      }
      if (typeof v === "object") return v
      return {}
    }
    var numOf = function (v) {
      var n = Number(v)
      return isNaN(n) ? 0 : n
    }
    // autodate 字段转毫秒：字符串形态 "YYYY-MM-DD HH:mm:ss.sssZ" → 空格换 T 后按 ISO 解析
    var msOf = function (rec, field) {
      try {
        var s2 = String(rec.get(field) || "").replace(" ", "T")
        if (!s2) return 0
        var t2 = new Date(s2).getTime()
        if (!isNaN(t2) && t2 > 0) return t2
      } catch (_) {}
      return 0
    }

    var agentRuns = safeRows("agent_runs", 100)
    var wfRuns = safeRows("workflow_runs", 100)
    var invRows = safeRows("tool_invocations", 500)

    var succeeded = 0
    var failed = 0
    var cancelled = 0
    var stuckLoops = 0
    var approvals = 0
    var compressions = 0
    var truncations = 0
    var estChars = 0
    var stepSum = 0
    var stepN = 0
    var durSum = 0
    var durN = 0

    var scanRun = function (rec, stepField) {
      var st = ""
      try {
        st = String(rec.getString("status") || "")
      } catch (_) {}
      if (st === "succeeded") succeeded++
      else if (st === "failed") failed++
      else if (st === "cancelled") cancelled++
      var errText = ""
      try {
        errText = String(rec.getString("error") || "")
      } catch (_) {}
      if (errText.indexOf("stuck_loop_detected") >= 0) stuckLoops++
      var cpObj = loadCpJson(rec)
      var hs = (cpObj && cpObj.harness_stats) || {}
      approvals += numOf(hs.approvals)
      compressions += numOf(hs.compressions)
      truncations += numOf(hs.truncations)
      estChars += numOf(hs.est_prompt_chars) + numOf(hs.est_out_chars)
      var steps = 0
      try {
        steps = numOf(rec.getInt(stepField))
      } catch (_) {}
      stepSum += steps
      stepN++
      var cMs = msOf(rec, "created")
      var uMs = msOf(rec, "updated")
      if (cMs > 0 && uMs >= cMs) {
        durSum += uMs - cMs
        durN++
      }
    }
    for (var ai = 0; ai < agentRuns.length; ai++) scanRun(agentRuns[ai], "current_step")
    for (var wi = 0; wi < wfRuns.length; wi++) scanRun(wfRuns[wi], "done_nodes")

    var runs = agentRuns.length + wfRuns.length
    var round1 = function (n) {
      return Math.round(n * 10) / 10
    }
    var totals = {
      runs: runs,
      succeeded: succeeded,
      failed: failed,
      cancelled: cancelled,
      success_rate: runs > 0 ? round1((succeeded / runs) * 100) : 0,
      avg_steps: stepN > 0 ? round1(stepSum / stepN) : 0,
      avg_duration_ms: durN > 0 ? Math.round(durSum / durN) : 0,
      est_tokens_total: Math.floor(estChars / 4),
      approvals: approvals,
      stuck_loops: stuckLoops,
      compressions: compressions,
      truncations: truncations,
    }

    // 工具明细：按 tool_name 聚合 500 条调用（含 market: 前缀市场工具条目）
    var toolMap = {}
    var toolOrder = []
    for (var ii = 0; ii < invRows.length; ii++) {
      var r = invRows[ii]
      var tName = ""
      try {
        tName = String(r.getString("tool_name") || "")
      } catch (_) {}
      if (!tName) tName = "(未知工具)"
      if (!toolMap[tName]) {
        toolMap[tName] = { tool_name: tName, calls: 0, success: 0, failed: 0, retried: 0, latencySum: 0, latencyN: 0 }
        toolOrder.push(tName)
      }
      var agg = toolMap[tName]
      agg.calls++
      var iSt = ""
      try {
        iSt = String(r.getString("status") || "")
      } catch (_) {}
      if (iSt === "success" || iSt === "retried_success") agg.success++
      else if (iSt === "failed") agg.failed++
      var iRetried = false
      try {
        iRetried = r.getBool("retried")
      } catch (_) {}
      if (iRetried) agg.retried++
      var iLat = 0
      try {
        iLat = numOf(r.get("latency_ms"))
      } catch (_) {}
      if (iLat > 0) {
        agg.latencySum += iLat
        agg.latencyN++
      }
    }
    var tools = []
    for (var ti = 0; ti < toolOrder.length; ti++) {
      var a = toolMap[toolOrder[ti]]
      tools.push({
        tool_name: a.tool_name,
        calls: a.calls,
        success: a.success,
        failed: a.failed,
        retried: a.retried,
        avg_latency_ms: a.latencyN > 0 ? Math.round(a.latencySum / a.latencyN) : 0,
      })
    }
    tools.sort(function (x, y) {
      return y.calls - x.calls
    })
    if (tools.length > 12) tools = tools.slice(0, 12)

    return e.json(200, { ok: true, totals: totals, tools: tools })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("harness monitor error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— debug 路由：同一 self-contained handler 挂两个路径（普通 + /api/llm/ 网关注入 key）——
;(function () {
  var debugHandler = function (e) {
    try {
      var h = (e.requestInfo() || {}).headers || {}
      var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
      if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
      var keyOverride = String(h["x_rh_api_key"] || h["X-Rh-Api-Key"] || h["x-rh-api-key"] || "")
      var body = (e.requestInfo() || {}).body || {}

      // $http.send 响应 body 是字节数组：必须 UTF-8 多字节解码（String() 得逗号串、res.json() 不可靠）
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
      var logErr = function (where, err) {
        try {
          $app.logger().error("tool_hub_debug " + where, "err", String((err && err.message) || err))
        } catch (_) {}
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
        for (var di = 0; di < parts.length; di++) {
          var dn = parseInt(parts[di], 10)
          if (isNaN(dn)) return s
          out += String.fromCharCode(dn - 3)
        }
        return out
      }
      var writeInvocation = function (toolName, toolKind, status, latencyMs, inputSummary, outputExcerpt, errorCode, retried) {
        try {
          var col = $app.findCollectionByNameOrId("tool_invocations")
          var rec = new Record(col)
          rec.set("rh_user_id", String(uid))
          rec.set("tool_name", String(toolName || "").slice(0, 100))
          rec.set("tool_kind", String(toolKind || "builtin"))
          rec.set("source", "debug")
          rec.set("run_id", "")
          rec.set("status", String(status || "failed"))
          rec.set("latency_ms", Number(latencyMs) || 0)
          rec.set("input_summary", String(inputSummary || "").slice(0, 500))
          rec.set("output_excerpt", String(outputExcerpt || "").slice(0, 1000))
          rec.set("error_code", String(errorCode || "").slice(0, 100))
          rec.set("retried", retried === true)
          $app.save(rec)
        } catch (wErr) {
          logErr("writeInvocation", wErr)
        }
      }
      var PREVIEW_NET_HINT = "预览环境可能无法访问该外部地址，发布后重试。"

      var t0 = new Date().getTime()

      // —— 外部工具分支：connection_id → 归属/启用校验 → 代理真实调用（占位符替换、headers 脱敏、≤25s 钳制）——
      var connId = String(body.connection_id || "").trim()
      if (connId) {
        var conn = null
        try {
          conn = $app.findRecordById("tool_connections", connId)
        } catch (_) {}
        if (!conn || String(conn.get("rh_user_id") || "") !== uid) {
          // Do not expose disabled state, name, URL or credentials of another tenant.
          return e.json(404, { error: "connection_not_found", message: "工具连接不存在或无权使用" })
        }
        var connEnabled = false
        try {
          connEnabled = conn.getBool("enabled")
        } catch (_) {}
        if (!connEnabled) return e.json(400, { error: "connection_disabled", message: "该工具连接已停用，请先在「工具连接」页启用" })
        var connName = String(conn.getString("name") || "外部工具")
        var inputRaw = body.input
        var inputJson = "{}"
        if (inputRaw !== undefined && inputRaw !== null) {
          if (typeof inputRaw === "string") inputJson = inputRaw
          else {
            try {
              inputJson = JSON.stringify(inputRaw)
            } catch (_) {
              inputJson = "{}"
            }
          }
        }
        var tcUrl = ""
        try {
          tcUrl = String(conn.getString("url") || "")
        } catch (_) {}
        var tcMethod = "POST"
        try {
          tcMethod = String(conn.getString("method") || "POST").toUpperCase()
        } catch (_) {}
        if (tcMethod !== "GET") tcMethod = "POST"
        // ToolHub is an immediate, real-world debug invocation. Unlike a simulated
        // check, non-GET calls can create orders, send messages or incur charges.
        // Owner-only explicit acknowledgement is required for EVERY invocation.
        var toolPolicy = require(__hooks + "/modules/tool_policy.js").classify({
          toolName: connName, external: true, method: tcMethod,
        })
        if (toolPolicy.write && body.confirm_write !== true) {
          return e.json(409, {
            error: "write_confirmation_required",
            message: "此工具会向外部服务真实发送 POST 请求，可能产生数据修改或费用。请勾选本次写操作确认后再执行。",
          })
        }
        var tcHeaders = {}
        try {
          var tcHStr = String(conn.getString("headers") || "")
          if (tcHStr) {
            var tcHArr = JSON.parse(tcHStr)
            if (tcHArr && typeof tcHArr.length === "number") {
              for (var hci = 0; hci < tcHArr.length; hci++) {
                var hcItem = tcHArr[hci] || {}
                var hcKey = String(hcItem.k || "")
                if (hcKey) tcHeaders[hcKey] = deobfKey(String(hcItem.v || ""))
              }
            }
          }
        } catch (_) {}
        var applyTpl = function (tpl) {
          return String(tpl || "").replace(/\{\{\s*([a-zA-Z0-9_一-龥]+)\s*\}\}/g, function (m, key) {
            if (key === "input") return inputJson
            return ""
          })
        }
        tcUrl = applyTpl(tcUrl)
        var sendOpts = { url: tcUrl, method: tcMethod, headers: tcHeaders }
        var tcTimeout = 15
        try {
          tcTimeout = Number(conn.getInt("timeout_s") || 15)
        } catch (_) {}
        if (isNaN(tcTimeout) || tcTimeout < 5) tcTimeout = 5
        if (tcTimeout > 25) tcTimeout = 25
        sendOpts.timeout = tcTimeout
        if (tcMethod === "POST") {
          var tcTpl = ""
          try {
            tcTpl = String(conn.getString("body_template") || "")
          } catch (_) {}
          sendOpts.body = tcTpl ? applyTpl(tcTpl) : inputJson
          var hasCt = false
          for (var ctKey in tcHeaders) {
            if (String(ctKey).toLowerCase() === "content-type") {
              hasCt = true
              break
            }
          }
          if (!hasCt) tcHeaders["Content-Type"] = "application/json"
        }
        var tcSanitize = function (s) {
          var out2 = String(s || "").replace(/([?&](?:api[_-]?key|key|token|secret|password|access[_-]?key)=)[^&\s"']+/gi, "$1***")
          for (var rsKey in tcHeaders) {
            var rsVal = String(tcHeaders[rsKey] || "")
            if (rsVal.length >= 8) out2 = out2.split(rsVal).join("***")
          }
          return out2
        }
        var tcRes = null
        var tcErr = ""
        var tcErrCode = ""
        try {
          tcRes = $http.send(sendOpts)
        } catch (netErr) {
          var netRaw = String((netErr && netErr.message) || netErr)
          if (/timeout/i.test(netRaw)) {
            tcErrCode = "custom_tool_timeout"
            tcErr = "工具在 " + tcTimeout + " 秒内无响应（custom_tool_timeout）。" + PREVIEW_NET_HINT
          } else {
            tcErrCode = "custom_tool_unreachable"
            tcErr = "工具地址不通（custom_tool_unreachable）：" + tcSanitize(netRaw).slice(0, 160) + "。" + PREVIEW_NET_HINT
          }
        }
        var tcOut = ""
        var tcCode = 0
        if (!tcErr && tcRes) {
          tcCode = Number(tcRes.statusCode || 0)
          if (tcCode < 200 || tcCode >= 300) {
            tcErrCode = "custom_tool_http_" + tcCode
            tcErr = "上游返回错误（HTTP " + tcCode + "）：" + tcSanitize(bytesToStr(tcRes).slice(0, 300))
          } else {
            tcOut = tcSanitize(bytesToStr(tcRes)).slice(0, 4000)
            if (!tcOut) tcOut = "（工具返回空响应，HTTP " + tcCode + "）"
          }
        }
        var tcLatency = new Date().getTime() - t0
        writeInvocation(connName, "external", tcErr ? "failed" : "success", tcLatency, inputJson, tcOut || tcErr, tcErrCode, false)
        return e.json(200, {
          ok: !tcErr,
          tool_name: connName,
          tool_kind: "external",
          output: tcOut,
          error: tcErr,
          error_code: tcErrCode,
          status_code: tcCode,
          latency_ms: tcLatency,
          retried: false,
        })
      }

      // —— 内置工具分支 ——
      var toolName = String(body.tool_name || "").trim()
      var BUILTIN = { calculate: 1, summarize: 1, knowledge_search: 1, web_fetch: 1, web_search: 1 }
      if (!BUILTIN[toolName]) {
        return e.json(400, { error: "unknown_tool", message: "不支持试跑该工具：" + (toolName || "未指定") })
      }
      var params = body.params
      if (!params || typeof params !== "object") params = {}
      var inputSummaryStr = ""
      try {
        inputSummaryStr = JSON.stringify(params)
      } catch (_) {
        inputSummaryStr = "{}"
      }

      // 计算器：递归下降求值（与 agent_engine 相同实现）
      var evalExpr = function (src) {
        var s = String(src || "").replace(/\s+/g, "")
        if (!s) throw new Error("表达式为空")
        if (!/^[0-9+\-*/%().]+$/.test(s)) throw new Error("仅支持数字与 + - * / % 括号的算术表达式")
        var pos = 0
        var peek = function () {
          return s.charAt(pos)
        }
        var parseNumber = function () {
          var start = pos
          while (pos < s.length && "0123456789.".indexOf(s.charAt(pos)) >= 0) pos++
          if (start === pos) throw new Error("位置 " + (pos + 1) + " 处缺少数字")
          var n = parseFloat(s.substring(start, pos))
          if (isNaN(n)) throw new Error("非法数字")
          return n
        }
        var parseFactor = function () {
          var c = peek()
          if (c === "(") {
            pos++
            var v = parseExpr()
            if (peek() !== ")") throw new Error("缺少右括号")
            pos++
            return v
          }
          if (c === "-") {
            pos++
            return -parseFactor()
          }
          if (c === "+") {
            pos++
            return parseFactor()
          }
          return parseNumber()
        }
        var parseTerm = function () {
          var v = parseFactor()
          while (peek() === "*" || peek() === "/" || peek() === "%") {
            var op = peek()
            pos++
            var r = parseFactor()
            if ((op === "/" || op === "%") && r === 0) throw new Error("除数为零")
            if (op === "*") v = v * r
            else if (op === "/") v = v / r
            else v = v % r
          }
          return v
        }
        var parseExpr = function () {
          var v = parseTerm()
          while (peek() === "+" || peek() === "-") {
            var op = peek()
            pos++
            var r = parseTerm()
            v = op === "+" ? v + r : v - r
          }
          return v
        }
        var result = parseExpr()
        if (pos < s.length) throw new Error("表达式存在多余内容")
        return result
      }
      // 知识检索：对方案文本做关键词匹配（与 agent_engine 相同实现）
      var knowledgeSearch = function (specObj, query) {
        var corpus = String((specObj && (specObj.knowledge || specObj.context)) || "")
        if (!corpus) {
          var parts = []
          if (specObj) {
            if (specObj.goal) parts.push("目标：" + String(specObj.goal))
            if (specObj.task_scope) parts.push("任务范围：" + String(specObj.task_scope))
            var arrFields = ["deliverables", "task_plan", "done_criteria"]
            for (var a = 0; a < arrFields.length; a++) {
              var arr = specObj[arrFields[a]] || []
              for (var b = 0; b < arr.length; b++) parts.push(String(arr[b]))
            }
          }
          corpus = parts.join("\n")
        }
        if (!corpus) return "暂无可检索的知识库内容（该方案未附带资料）"
        var kwRaw = String(query || "")
          .toLowerCase()
          .split(/[\s,，。;；、！？!?]+/)
        var keywords = []
        for (var k = 0; k < kwRaw.length; k++) {
          if (kwRaw[k].length >= 1) keywords.push(kwRaw[k])
        }
        if (keywords.length === 0) return "检索词为空"
        var paras = String(corpus).split(/\n+/)
        var scored = []
        for (var p = 0; p < paras.length; p++) {
          var text = paras[p]
          if (!text) continue
          var lower = text.toLowerCase()
          var score = 0
          for (var q = 0; q < keywords.length; q++) {
            var idx = lower.indexOf(keywords[q])
            while (idx >= 0) {
              score++
              idx = lower.indexOf(keywords[q], idx + keywords[q].length)
            }
          }
          if (score > 0) scored.push({ score: score, text: text.slice(0, 400) })
        }
        scored.sort(function (x, y) {
          return y.score - x.score
        })
        if (scored.length === 0) return "未在知识库内容里找到与「" + String(query || "") + "」相关的片段"
        var out = []
        for (var t = 0; t < scored.length && t < 3; t++) out.push(scored[t].text)
        return out.join("\n---\n")
      }
      // 自备密钥批次：调试台统一走当前用户默认模型连接（第一个启用且有可用模型的），内置通道已移除
      var callLlm = function (messages, maxTokens) {
        var dDeobf = function (stored) {
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
        var dConn = null
        var dModel = ""
        try {
          var dRows = $app.findRecordsByFilter("model_connections", "id != ''", "-created", 10, 0)
          var dRows = (dRows || []).filter(function (r) { try { return r.getBool("enabled") } catch (_e) { return false } })
          for (var dci = 0; dci < dRows.length; dci++) {
            var dList = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(dRows[dci])
            if (Array.isArray(dList) && dList.length > 0) { dConn = dRows[dci]; dModel = String(dList[0]); break }
          }
        } catch (_) {}
        if (!dConn) return { ok: false, error: "model_connection_required", detail: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接" }
        var dBase = String(dConn.getString("base_url") || "").replace(/\/+$/, "")
        var dKey = dDeobf(String(dConn.getString("api_key") || ""))
        var dProv = "openai"
        try { dProv = String(dConn.getString("provider") || "") } catch (_) {}
        if (dProv !== "anthropic" && dProv !== "gemini") dProv = "openai"
        if (!dBase && dProv === "anthropic") dBase = "https://api.anthropic.com/v1"
        if (!dBase && dProv === "gemini") dBase = "https://generativelanguage.googleapis.com/v1beta"
        if (!dBase || !dKey) return { ok: false, error: "custom_connection_invalid", detail: "模型连接配置不完整，请到「模型连接」页检查" }
        var dSanitize = function (s) { return String(s || "").replace(/([?&]key=)[^&\s"']+/g, "$1***") }
        var dMax = Number(maxTokens) > 0 ? Number(maxTokens) : 2048
        var dRes = null
        try {
          if (dProv === "anthropic") {
            var dSystem = ""
            var dMsgs = []
            for (var ai = 0; ai < messages.length; ai++) {
              var am = messages[ai] || {}
              if (String(am.role || "user") === "system") dSystem = dSystem ? dSystem + "\n\n" + String(am.content || "") : String(am.content || "")
              else dMsgs.push({ role: String(am.role || "user") === "assistant" ? "assistant" : "user", content: String(am.content || "") })
            }
            if (dMsgs.length === 0) dMsgs.push({ role: "user", content: "请继续。" })
            var dABody = { model: dModel, max_tokens: dMax, messages: dMsgs }
            if (dSystem) dABody.system = dSystem
            dRes = $http.send({ url: dBase + "/messages", method: "POST", headers: { "Content-Type": "application/json", "x-api-key": dKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(dABody), timeout: 25 })
          } else if (dProv === "gemini") {
            var dInstr = ""
            var dContents = []
            for (var gi = 0; gi < messages.length; gi++) {
              var gm = messages[gi] || {}
              if (String(gm.role || "user") === "system") dInstr = dInstr ? dInstr + "\n\n" + String(gm.content || "") : String(gm.content || "")
              else dContents.push({ role: String(gm.role || "user") === "assistant" ? "model" : "user", parts: [{ text: String(gm.content || "") }] })
            }
            if (dContents.length === 0) dContents.push({ role: "user", parts: [{ text: "请继续。" }] })
            var dGBody = { contents: dContents }
            if (dInstr) dGBody.system_instruction = { parts: [{ text: dInstr }] }
            dRes = $http.send({ url: dBase + "/models/" + encodeURIComponent(dModel) + ":generateContent?key=" + encodeURIComponent(dKey), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dGBody), timeout: 25 })
          } else {
            dRes = $http.send({ url: dBase + "/chat/completions", method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + dKey }, body: JSON.stringify({ model: dModel, messages: messages, max_tokens: dMax, stream: false }), timeout: 25 })
          }
        } catch (err) {
          return { ok: false, error: "llm_request_failed", detail: dSanitize(String((err && err.message) || err)).slice(0, 200) }
        }
        if (!dRes || dRes.statusCode < 200 || dRes.statusCode >= 300) {
          return { ok: false, error: "llm_http_" + (dRes ? dRes.statusCode : 0), detail: dSanitize(bytesToStr(dRes)).slice(0, 200) }
        }
        var dData = null
        try { dData = JSON.parse(bytesToStr(dRes)) } catch (_) {}
        var dContent = ""
        if (dProv === "anthropic") {
          var dBlocks = (dData && dData.content) || []
          for (var bi = 0; bi < dBlocks.length; bi++) if (String((dBlocks[bi] || {}).type || "") === "text") dContent += String((dBlocks[bi] || {}).text || "")
        } else if (dProv === "gemini") {
          var dParts = ((((dData && dData.candidates) || [])[0] || {}).content || {}).parts || []
          for (var pi = 0; pi < dParts.length; pi++) if ((dParts[pi] || {}).text !== undefined && dParts[pi].text !== null) dContent += String(dParts[pi].text)
        } else {
          var dChoices = (dData && dData.choices) || []
          dContent = String(((dChoices[0] && dChoices[0].message) || {}).content || "")
        }
        if (!dContent) return { ok: false, error: "llm_empty_content", detail: "" }
        return { ok: true, content: dContent }
      }
      var stripTags = function (s) {
        return String(s || "")
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;|&#39;/g, "'")
          .replace(/\s+/g, " ")
          .trim()
      }
      // 网页抓取：仅 http/https、≤25s、utf8ToStr 解码、剥 script/style/标签提取正文、截断 4000
      var webFetchOnce = function (urlStr) {
        var u = String(urlStr || "").trim()
        if (!/^https?:\/\//i.test(u)) return { ok: false, retryable: false, error: "bad_url", message: "仅支持以 http:// 或 https:// 开头的地址" }
          // Defense in depth: reject obvious private and loopback destinations.
        // A production egress proxy must also prevent DNS rebinding and unsafe redirects.
        var _authority = u.match(/^https?:\/\/([^\/?#]+)/i)
        var _hostPort = _authority ? String(_authority[1] || "").toLowerCase() : ""
        if (!_hostPort || /[@\\%\s]/.test(_hostPort) || _hostPort.charAt(0) === "[") return { ok: false, retryable: false, error: "unsafe_url", message: "不允许访问内网、IP 或含用户信息的地址" }
        var _host = _hostPort.replace(/:\d+$/, "")
        if (!/^[a-z0-9.-]+$/.test(_host) || _host.indexOf(".") < 0 || _host.charAt(_host.length - 1) === "." || /^[0-9.]+$/.test(_host) || /^0x[0-9a-f]+$/.test(_host) || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|arpa|svc)$/.test(_host)) return { ok: false, retryable: false, error: "unsafe_url", message: "不允许访问内网、IP 或无效地址" }
        if (/:[^0-9]/.test(_hostPort) || /:\d{6,}/.test(_hostPort)) return { ok: false, retryable: false, error: "unsafe_url", message: "非法端口" }
        var res = null
        try {
          res = $http.send({
            url: u,
            method: "GET",
            timeout: 25,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentStudioBot/1.0; +https://runninghub.cn)" },
          })
        } catch (netErr) {
          var raw = String((netErr && netErr.message) || netErr)
          if (/timeout/i.test(raw)) return { ok: false, retryable: true, error: "web_fetch_timeout", message: "目标地址 25 秒内无响应（web_fetch_timeout）。" + PREVIEW_NET_HINT }
          return { ok: false, retryable: true, error: "web_fetch_unreachable", message: "目标地址不通（web_fetch_unreachable）：" + raw.slice(0, 160) + "。" + PREVIEW_NET_HINT }
        }
        if (!res || res.statusCode < 200 || res.statusCode >= 300) {
          var code = res ? Number(res.statusCode || 0) : 0
          return { ok: false, retryable: false, error: "web_fetch_http_" + code, message: "目标页面返回错误（HTTP " + code + "）：" + stripTags(bytesToStr(res)).slice(0, 200) }
        }
        var text = bytesToStr(res)
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<!--[\s\S]*?-->/g, " ")
          .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
        text = text
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;|&#39;/g, "'")
          .replace(/[ \t\r]+/g, " ")
          .replace(/\n\s*\n+/g, "\n")
          .trim()
        if (!text) return { ok: true, retryable: false, output: "（该页面没有可提取的正文文本）" }
        return { ok: true, retryable: false, output: text.slice(0, 4000) }
      }
      // 网页搜索：DuckDuckGo HTML 端点，解析 ≤10 条标题/摘要/链接
      var webSearchOnce = function (query, limitN) {
        var q = String(query || "").trim()
        if (!q) return { ok: false, retryable: false, error: "empty_query", message: "搜索关键词为空" }
        var n = Number(limitN) || 5
        if (isNaN(n) || n < 1) n = 1
        if (n > 10) n = 10
        var res = null
        try {
          res = $http.send({
            url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q),
            method: "POST",
            timeout: 25,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            },
            body: "q=" + encodeURIComponent(q),
          })
        } catch (netErr) {
          var raw = String((netErr && netErr.message) || netErr)
          if (/timeout/i.test(raw)) return { ok: false, retryable: false, error: "web_search_timeout", message: "搜索服务 25 秒内无响应（web_search_timeout）。" + PREVIEW_NET_HINT }
          return { ok: false, retryable: false, error: "web_search_unreachable", message: "搜索服务不可达（web_search_unreachable）：" + raw.slice(0, 160) + "。" + PREVIEW_NET_HINT }
        }
        if (!res || res.statusCode < 200 || res.statusCode >= 300) {
          var code = res ? Number(res.statusCode || 0) : 0
          return { ok: false, retryable: false, error: "web_search_http_" + code, message: "搜索服务返回错误（HTTP " + code + "）。" + PREVIEW_NET_HINT }
        }
        var html = bytesToStr(res)
        var decodeRealUrl = function (href) {
          var hh = String(href || "")
          if (hh.indexOf("//duckduckgo.com/l/") === 0) hh = "https:" + hh
          var m = hh.match(/[?&]uddg=([^&]+)/)
          if (m) {
            try {
              return decodeURIComponent(m[1])
            } catch (_) {}
          }
          if (hh.indexOf("//") === 0) hh = "https:" + hh
          return hh
        }
        var titles = []
        var tRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
        var tMatch = tRe.exec(html)
        while (tMatch !== null) {
          titles.push({ url: decodeRealUrl(tMatch[1]), title: stripTags(tMatch[2]) })
          tMatch = tRe.exec(html)
        }
        var snippets = []
        var sRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
        var sMatch = sRe.exec(html)
        while (sMatch !== null) {
          snippets.push(stripTags(sMatch[1]))
          sMatch = sRe.exec(html)
        }
        var results = []
        for (var ri = 0; ri < titles.length && results.length < n; ri++) {
          if (!titles[ri].title && !titles[ri].url) continue
          results.push({ title: titles[ri].title, url: titles[ri].url, snippet: snippets[ri] || "" })
        }
        if (results.length === 0) {
          return { ok: true, retryable: false, output: "未搜索到与「" + q + "」相关的结果（也可能是搜索服务临时拦截，可稍后再试）" }
        }
        var lines = []
        for (var li = 0; li < results.length; li++) {
          lines.push((li + 1) + ". " + results[li].title + "\n   " + results[li].url + (results[li].snippet ? "\n   " + results[li].snippet : ""))
        }
        return { ok: true, retryable: false, output: lines.join("\n"), results: results }
      }

      var output = ""
      var extraResults = null
      var toolErr = ""
      var errCode = ""
      var retried = false

      var runOnce = function () {
        if (toolName === "calculate") {
          try {
            var val = evalExpr(params.expression)
            return { ok: true, retryable: false, output: String(params.expression) + " = " + String(val) }
          } catch (err) {
            return { ok: false, retryable: false, error: "calculate_failed", message: "计算失败：" + String((err && err.message) || err) }
          }
        }
        if (toolName === "summarize") {
          var focus = String(params.focus || "")
          var sumText = String(params.text || "").slice(0, 6000)
          if (!sumText.trim()) return { ok: false, retryable: false, error: "empty_text", message: "要整理的文本为空" }
          var sumRes = callLlm(
            [
              {
                role: "user",
                content:
                  "请整理并总结以下文本" + (focus ? "（关注重点：" + focus + "）" : "") + "，直接输出整理后的要点，不要寒暄：\n\n" + sumText,
              },
            ],
            2048
          )
          if (sumRes.ok) return { ok: true, retryable: false, output: sumRes.content }
          return { ok: false, retryable: false, error: sumRes.error, message: "摘要调用失败：" + sumRes.error + (sumRes.detail ? "（" + String(sumRes.detail).slice(0, 120) + "）" : "") }
        }
        if (toolName === "knowledge_search") {
          var specId = String(params.spec_id || "").trim()
          if (!specId) return { ok: false, retryable: false, error: "spec_required", message: "请先选择一个助手方案再检索其知识库" }
          var specRec = null
          try {
            specRec = $app.findRecordById("agent_specs", specId)
          } catch (_) {}
          if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
            return { ok: false, retryable: false, error: "spec_not_found", message: "方案不存在或无权访问", notFound: true }
          }
          var specObj = null
          var specStr = ""
          try {
            specStr = specRec.getString("spec")
          } catch (_) {}
          if (specStr) {
            try {
              specObj = JSON.parse(specStr)
            } catch (_) {}
          }
          if (!specObj || typeof specObj !== "object") specObj = {}
          try {
            return { ok: true, retryable: false, output: knowledgeSearch(specObj, params.query) }
          } catch (err2) {
            return { ok: false, retryable: false, error: "knowledge_search_failed", message: "检索失败：" + String((err2 && err2.message) || err2) }
          }
        }
        if (toolName === "web_fetch") return webFetchOnce(params.url)
        return webSearchOnce(params.query, params.limit)
      }

      var first = runOnce()
      if (first && first.notFound) {
        return e.json(404, { error: first.error || "not_found", message: first.message || "资源不存在" })
      }
      var attempt = first
      if (attempt && !attempt.ok && attempt.retryable === true) {
        retried = true
        attempt = runOnce()
      }
      var latency = new Date().getTime() - t0
      if (attempt && attempt.ok) {
        output = String(attempt.output || "")
        if (attempt.results) extraResults = attempt.results
      } else {
        errCode = String((attempt && attempt.error) || "tool_failed")
        toolErr = String((attempt && attempt.message) || "工具执行失败")
      }
      writeInvocation(
        toolName,
        "builtin",
        toolErr ? "failed" : retried ? "retried_success" : "success",
        latency,
        inputSummaryStr,
        toolErr ? toolErr : output,
        errCode,
        retried
      )
      var respBody = {
        ok: !toolErr,
        tool_name: toolName,
        tool_kind: "builtin",
        output: output,
        error: toolErr,
        error_code: errCode,
        latency_ms: latency,
        retried: retried,
      }
      if (extraResults) respBody.results = extraResults
      return e.json(200, respBody)
    } catch (err) {
      var msg = String((err && err.message) || err)
      try {
        $app.logger().error("tool_hub debug error", "err", msg)
      } catch (_) {}
      return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
    }
  }
  routerAdd("POST", "/api/tool-hub/debug", debugHandler)
  routerAdd("POST", "/api/llm/tool-hub/debug", debugHandler)
})()
