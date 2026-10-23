// agent_engine.pb.js — Agent Studio 助手执行引擎
// 驱动方式：前端轮询 POST /api/llm/agent-engine/{id}/tick 逐步驱动（每调一次执行一步）。
// 挂 /api/llm/ 前缀让 VibeX 网关按登录态注入访客 X-Rh-Api-Key（访客自付计费）。
// 按 pb-hook-lint 硬约束，本文件不使用 cronAdd（热重载叠加注册会与前端 poll 抢 Goja VM
// 造成不可复现 500）；tick 路由内有 claim_until 认领机制防止重叠执行同一步。
// 计费：优先用网关注入的 X-Rh-Api-Key（访客自付），缺失时回退服务端 env key。
// 控制路由：/api/agent-runs/start | pause | resume | cancel；tick 在 /api/llm/agent-engine/{id}/tick
// Goja 铁律：全部 var、new Date().getTime()、helper 就地定义、每个回调 self-contained、
// 5xx 一律 { error, message, fingerprint }。

routerAdd("POST", "/api/llm/agent-engine/{id}/tick", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    // $http.send 响应 body 是字节数组：String() 得逗号串、res.json() 不可靠 → 按 UTF-8 多字节解码（逐字节 fromCharCode 会把中文变乱码）
    // 规划输出容错解析：剥 markdown 围栏 → 平衡花括号扫描（识别字符串/转义态，不被说明文字花括号误导）→ 尾逗号修复 → 字符串内裸换行/制表符转义修复
    var parseDecisionJson = function (text) {
      var s = String(text || "").trim()
      if (!s) return null
      var fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
      if (fence) s = fence[1].trim()
      var repairControl = function (t) {
        var out = ""
        var inStr = false
        var esc = false
        for (var ri = 0; ri < t.length; ri++) {
          var rc = t.charAt(ri)
          if (inStr) {
            if (esc) { out += rc; esc = false; continue }
            if (rc === "\\") { out += rc; esc = true; continue }
            if (rc === '"') { inStr = false; out += rc; continue }
            if (rc === "\n") { out += "\\n"; continue }
            if (rc === "\r") { out += "\\r"; continue }
            if (rc === "\t") { out += "\\t"; continue }
            out += rc
          } else {
            if (rc === '"') inStr = true
            out += rc
          }
        }
        return out
      }
      var tryParse = function (t) {
        var cands = [t, t.replace(/,\s*([}\]])/g, "$1"), repairControl(t), repairControl(t).replace(/,\s*([}\]])/g, "$1")]
        for (var ci = 0; ci < cands.length; ci++) {
          try {
            var v = JSON.parse(cands[ci])
            if (v && typeof v === "object") return v
          } catch (_) {}
        }
        return null
      }
      var whole = tryParse(s)
      if (whole) return whole
      var start = s.indexOf("{")
      while (start >= 0) {
        var depth = 0
        var inStr = false
        var esc = false
        for (var i = start; i < s.length; i++) {
          var ch = s.charAt(i)
          if (inStr) {
            if (esc) esc = false
            else if (ch === "\\") esc = true
            else if (ch === '"') inStr = false
          } else if (ch === '"') inStr = true
          else if (ch === "{") depth++
          else if (ch === "}") {
            depth--
            if (depth === 0) {
              var cand = tryParse(s.substring(start, i + 1))
              if (cand) return cand
              break
            }
          }
        }
        start = s.indexOf("{", start + 1)
      }
      return null
    }

    var id = String(e.request.pathValue("id") || "")
    var run = null
    try {
      run = $app.findRecordById("agent_runs", id)
    } catch (_) {}
    if (!run) return e.json(404, { error: "run_not_found", message: "运行记录不存在" })
    if (String(run.get("rh_user_id") || "") !== uid) return e.json(404, { error: "run_not_found" })
    // Load provider response helpers only after validating run ownership.
    var modelWire = require(__hooks + "/modules/model_wire.js")
    var bytesToStr = modelWire.bytesToStr
    var executionGuard = require(__hooks + "/modules/harness_execution_guard.js")
    var runLifecycle = require(__hooks + "/modules/harness_run_lifecycle.js")
    // Decode server-only tool authorization headers. Market/HTTP connectors use
    // gcm1: encrypted values; older local-only fixtures can carry legacy obfuscation.
    // Never return ciphertext on decrypt failure or send it to the model/event log.
    var deobfKey = function (stored) {
      var value = String(stored || "")
      if (!value) return ""
      if (value.indexOf("gcm1:") === 0) {
        var secret = String($os.getenv("AGENT_STUDIO_SECRET_KEY") || "")
        if (secret.length !== 32) return ""
        try { return String($security.decrypt(value.substring(5), secret)) }
        catch (_) { return "" }
      }
      if (/^[0-9]+(?:\.[0-9]+)*$/.test(value)) {
        var parts = value.split(".")
        var decoded = ""
        for (var i = 0; i < parts.length; i++) {
          var point = Number(parts[i]) - 3
          if (isNaN(point) || point < 0 || point > 65535) return ""
          decoded += String.fromCharCode(point)
        }
        return decoded
      }
      return value
    }


    var logErr = function (where, err) {
      try {
        $app.logger().error("agent_engine " + where, "err", String((err && err.message) || err))
      } catch (_) {}
    }
    var loadJson = function (rec, field) {
      // json 字段经 record.get 读回可能是 JsonRaw 字节包装（属性访问全 undefined），
      // 优先用 getString 拿 JSON 文本再 parse，保证 checkpoint/config/spec_snapshot 可读。
      var s = ""
      try {
        s = rec.getString(field)
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
        v = rec.get(field)
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
    var addEvent = function (runId, stepIndex, seq, eventType, content) {
      try {
        var col = $app.findCollectionByNameOrId("run_events")
        var rec = new Record(col)
        rec.set("run_id", String(runId))
        rec.set("step_index", Number(stepIndex) || 0)
        rec.set("seq", Number(seq) || 0)
        rec.set("event_type", String(eventType))
        rec.set("content", content || {})
        $app.save(rec)
      } catch (err) {
        logErr("addEvent", err)
      }
    }
    // 计算器：递归下降求值，仅支持数字与 + - * / % ( )
    var evalExpr = require(__hooks + "/modules/tool_calculator.js").evaluate
    // 知识检索：对方案附带知识/方案文本做关键词匹配，返回得分最高片段
    var knowledgeSearch = function (specObj, query) {
      // Shared tenant-scoped retrieval service; legacy inline scheme text is retained below.
      var linked = specObj && specObj.knowledge_base_ids
      if (Array.isArray(linked) && linked.length) {
        var service = require(__hooks + "/modules/knowledge_search.js")
        try {
          return service.formatForAgent(service.search($app, uid, linked, query, 4), query)
        } catch (retrievalErr) {
          return service.missingOrErrorMessage(retrievalErr)
        }
      }
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
    var PREVIEW_NET_HINT = "预览环境可能无法访问该外部地址，发布后重试。"
    // 工具调用日志落库（tool_invocations）：内置与外部工具统一写入
    var writeInvocation = function (uidVal, toolName, toolKind, source, runIdVal, status, latencyMs, inputSummary, outputExcerpt, errorCode, retriedFlag) {
      try {
        var col = $app.findCollectionByNameOrId("tool_invocations")
        var rec = new Record(col)
        rec.set("rh_user_id", String(uidVal))
        rec.set("tool_name", String(toolName || "").slice(0, 100))
        rec.set("tool_kind", String(toolKind || "builtin"))
        rec.set("source", String(source || "agent_run"))
        rec.set("run_id", String(runIdVal || "").slice(0, 60))
        rec.set("status", String(status || "failed"))
        rec.set("latency_ms", Number(latencyMs) || 0)
        rec.set("input_summary", String(inputSummary || "").slice(0, 500))
        rec.set("output_excerpt", String(outputExcerpt || "").slice(0, 1000))
        rec.set("error_code", String(errorCode || "").slice(0, 100))
        rec.set("retried", retriedFlag === true)
        $app.save(rec)
      } catch (wErr) {
        logErr("writeInvocation", wErr)
      }
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
    // 网页抓取：仅 http/https、≤25s 钳制、utf8ToStr 解码、剥 script/style/标签提取正文、截断 4000
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
    // 网页搜索：DuckDuckGo HTML 端点，解析 ≤10 条标题/摘要/链接；端点不可达返回结构化错误不硬重试
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
      return { ok: true, retryable: false, output: lines.join("\n") }
    }
    var saveCheckpoint = function (runId, newCp, doneSteps) {
      try {
        executionGuard.mutate($app, "agent", runId, uid, leaseToken, function (tx, r) {
          // Checkpoints are incremental: never drop deadline/provenance
          // metadata when the legacy step writer supplies a partial snapshot.
          var persistedCp = loadJson(r, "checkpoint")
          for (var cpKey in newCp) {
            if (Object.prototype.hasOwnProperty.call(newCp, cpKey))
              persistedCp[cpKey] = newCp[cpKey]
          }
          r.set("checkpoint", persistedCp)
          r.set("current_step", Number(doneSteps) || 0)
          tx.save(r)
        })
      } catch (err) {
        logErr("saveCheckpoint", err)
        throw err // Never silently lose a checkpoint after an irreversible tool call.
      }
    }
    // 结果脱敏：最终成果落库前统一抹疑似钥匙模式（与 workflow 引擎同规则）
    var sanitizeFinalSecrets = function (s) {
      return String(s || "")
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, "***")
        .replace(/Bearer\s+\S+/g, "Bearer ***")
        .replace(/token=\S+/g, "token=***")
        .replace(/api_key=\S+/g, "api_key=***")
    }
    var finishRun = function (runId, newStatus, resultText, errText, stepIndex, seq, message) {
      try {
        var r = null
        executionGuard.mutate($app, "agent", runId, uid, leaseToken, function (tx, ownedRun) {
          r = ownedRun
          ownedRun.set("status", newStatus)
          if (resultText) ownedRun.set("result", sanitizeFinalSecrets(String(resultText)))
          if (errText) ownedRun.set("error", require(__hooks + "/modules/harness_audit.js").excerpt(errText, 300))
          var cp = loadJson(ownedRun, "checkpoint")
          if (String(newStatus) === "failed") {
            cp.failure_diagnostic = require(__hooks + "/modules/harness_failure_triage.js")
              .diagnose(errText || message, { kind: "agent", stage: "runtime",
                stepRef: String(stepIndex), seq: seq })
          } else if (String(newStatus) === "succeeded") {
            cp.failure_diagnostic = null
          }
          cp.claim_until = 0
          // Terminal results take precedence over queued cooperative stop requests.
          cp.pause_requested = false
          cp.cancel_requested = false
          cp.seq = Number(seq) || 0
          ownedRun.set("checkpoint", cp)
          ownedRun.set("current_step", Number(stepIndex) || 0)
          tx.save(ownedRun)
        })
        addEvent(runId, stepIndex, Number(seq) + 1, "status", { message: message })
        // —— 失败沉淀教训：failed 终态（含卡死/预算耗尽/致命错误）写一条 kind=lesson 记忆，
        // cancelled 不经本函数（cancel 路由直接改状态）天然不写；写失败不影响 run 终态 ——
        if (String(newStatus) === "failed") {
          try {
            var lessonInstr = ""
            try {
              lessonInstr = String(r.getString("instruction") || "")
            } catch (_) {}
            var lessonFact = sanitizeFinalSecrets(
              "教训：" + lessonInstr.slice(0, 120) + " → " + String(errText || message || "").slice(0, 300)
            ).slice(0, 500)
            var lessonCol = $app.findCollectionByNameOrId("agent_memories")
            var lessonRec = new Record(lessonCol)
            lessonRec.set("rh_user_id", String(r.get("rh_user_id")))
            lessonRec.set("spec_id", String(r.get("spec_id")))
            lessonRec.set("fact", lessonFact)
            lessonRec.set("tools_used", "")
            lessonRec.set("run_id", String(runId))
            lessonRec.set("kind", "lesson")
            $app.save(lessonRec)
            addEvent(runId, stepIndex, Number(seq) + 2, "memory_saved", {
              message: "已存入长期记忆（教训）",
              kind: "lesson",
              fact_preview: lessonFact.slice(0, 120),
            })
          } catch (lessonErr) {
            logErr("write lesson memory", lessonErr)
          }
        }
      } catch (err) {
        logErr("finishRun", err)
        throw err
      }
    }

    // 执行一步：LLM 规划决策 → 工具执行 → 事件与检查点落库
    var executeStep = function (runId) {
      var stepRun = $app.findRecordById("agent_runs", runId)
      if (String(stepRun.get("status")) !== "running") return

      var MODEL_IDS = {
        "claude-opus-4.8": "anthropic/claude-opus-4.8",
        "claude-opus-4.7": "anthropic/claude-opus-4.7",
        "qwen3.7-max": "qwen/qwen3.7-max",
      }
      var cfg = loadJson(stepRun, "config")
      var cp = loadJson(stepRun, "checkpoint")
      var spec = loadJson(stepRun, "spec_snapshot")
      // Historical runs may lack a snapshot; only access the current user's spec.
      if(!spec || !Object.keys(spec).length){
        try{
          var oldSpec=$app.findRecordById("agent_specs",String(stepRun.get("spec_id")||""))
          if(String(oldSpec.get("rh_user_id")||"")===uid) spec=loadJson(oldSpec,"spec")
        }catch(_){}
      }
      var instruction = String(stepRun.get("instruction") || "")
      var maxSteps = Number(stepRun.get("max_steps") || 10)
      var modelShort = String(stepRun.get("model") || "claude-opus-4.8")
      var modelId = MODEL_IDS[modelShort] || "anthropic/claude-opus-4.8"

      // —— Harness 核算与卡死防护状态：从 checkpoint 恢复，本步内累积，随每次落盘持久化 ——
      var hsRaw = cp.harness_stats || {}
      var harnessStats = {
        llm_calls: Number(hsRaw.llm_calls || 0),
        est_prompt_chars: Number(hsRaw.est_prompt_chars || 0),
        est_out_chars: Number(hsRaw.est_out_chars || 0),
        tool_calls: Number(hsRaw.tool_calls || 0),
        retries: Number(hsRaw.retries || 0),
        compressions: Number(hsRaw.compressions || 0),
        approvals: Number(hsRaw.approvals || 0),
      }
      var budgetService = require(__hooks + "/modules/harness_budget.js")
      var modelCallLimit = budgetService.normalize(maxSteps, cfg.max_model_calls)
      if (!modelCallLimit.ok) throw new Error("invalid_model_call_budget")
      var statsBump = function (field, n) {
        harnessStats[field] = Number(harnessStats[field] || 0) + (Number(n) || 1)
      }
      // 调用签名哈希（djb2 变体）：工具名 + 入参 JSON → 定长字符串，用于卡死循环检测
      var sigHash = function (src0) {
        var h0 = 5381
        var s0 = String(src0 || "")
        for (var sh0 = 0; sh0 < s0.length; sh0++) {
          h0 = (h0 * 33 + s0.charCodeAt(sh0)) | 0
        }
        return String(h0 >>> 0)
      }
      var sigRecent = []
      var srRaw = cp.call_sig_recent || []
      if (srRaw && srRaw.length !== undefined) {
        for (var sri = 0; sri < srRaw.length && sri < 5; sri++) sigRecent.push(String(srRaw[sri]))
      }

      // —— 自定义模型分支：config.custom_model 带 connection_id + model_id 时，
      // LLM 调用改走用户自己的 OpenAI 兼容连接（key 只从服务端记录取，绝不经前端，不走平台计费）——
      var modelRepo = require(__hooks + "/modules/model_connections.js")
      var customCfg = cfg.custom_model || null
      if (!customCfg || !customCfg.connection_id) {
        customCfg = modelRepo.getDefault($app, String(stepRun.get("rh_user_id") || ""))
      }
      var callCustomLlmBase = function (messages, maxTokens, timeoutSec) {
        var modelRequest = require(__hooks + "/modules/model_request.js")
        var cTimeout = modelRequest.normalizeTimeoutSeconds(timeoutSec, 120)
        var resolved = modelRepo.lookup(
          $app, String(stepRun.get("rh_user_id") || ""),
          String((customCfg && customCfg.connection_id) || ""),
          String((customCfg && customCfg.model_id) || ""),
          {
            secretKey: String($os.getenv("AGENT_STUDIO_SECRET_KEY") || ""),
            decrypt: function (blob, key) { return String($security.decrypt(blob, key)) },
          }
        )
        if (!resolved.ok) return resolved
        var cBase = resolved.baseUrl
        var cKey = resolved.apiKey
        var cProv = resolved.provider
        // Gemini 的 key 拼在 URL query 上：错误详情外发前抹掉 key= 值
        var cSanitize = function (s) {
          return String(s || "").replace(/([?&]key=)[^&\s"']+/g, "$1***")
        }
        var cModel = String(customCfg.model_id || "")
        var cRes = null
        try {
          cRes = $http.send(modelRequest.buildRequest(cProv, {
            baseUrl: cBase, apiKey: cKey, model: cModel, messages: messages,
            maxTokens: maxTokens, timeout: cTimeout,
          }))
        } catch (cerr) {
          return { ok: false, error: "custom_" + cProv + "_request_failed", detail: cSanitize(String((cerr && cerr.message) || cerr)).slice(0, 300) }
        }
        if (!cRes || cRes.statusCode < 200 || cRes.statusCode >= 300) {
          var cCode = cRes ? cRes.statusCode : 0
          var cDetail = bytesToStr(cRes).slice(0, 300)
          return { ok: false, error: "custom_" + cProv + "_http_" + cCode, detail: cSanitize(cDetail) }
        }
        var cData = null
        try {
          cData = JSON.parse(bytesToStr(cRes))
        } catch (_) {}
        var cContent = modelWire.extractContent(cProv, cData)
        if (!cContent) return { ok: false, error: "custom_" + cProv + "_empty_content", detail: "" }
        return { ok: true, content: cContent }
      }

      // Persist metadata-only trace spans, never prompts, responses or API keys.
      var callCustomLlm = function (messages, maxTokens, timeoutSec) {
        var startedAt = new Date().getTime()
        var outcome = callCustomLlmBase(messages, maxTokens, timeoutSec)
        try {
          require(__hooks + "/modules/execution_trace.js").record($app, {
            owner: uid, runId: id, kind: "agent",
            spanId: $security.randomString(15),
            stepRef: String(Number(cp.done_steps || 0) + 1),
            operation: "model",
            status: outcome && outcome.ok === true ? "succeeded" : "failed",
            errorCode: outcome && outcome.error ? String(outcome.error) : "model_error",
            durationMs: new Date().getTime() - startedAt,
          })
        } catch (_) { /* Observability must not block the task runner. */ }
        return outcome
      }
      var callEngineLlmBase = function (messages, maxTokens, timeoutSec) {
        if (customCfg && customCfg.connection_id) return callCustomLlm(messages, maxTokens, timeoutSec)
        return { ok: false, error: "model_connection_required", detail: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接，再发起运行" }
      }
      // Harness 核算：每次引擎模型调用估算输入/输出字符数，累进 checkpoint.harness_stats
      var callEngineLlm = function (messages, maxTokens, timeoutSec) {
        var modelGate = require(__hooks + "/modules/harness_step_executor.js")
          .prepareModelStep(cp, runLifecycle.withinDeadline, new Date().getTime())
        if (!modelGate.ok) return modelGate
        var pChars0 = 0
        for (var mci0 = 0; mci0 < messages.length; mci0++) {
          pChars0 += String((messages[mci0] || {}).content || "").length
        }
        var admitted = budgetService.allowModelCall(harnessStats, modelCallLimit.max_model_calls)
        if (!admitted.ok) return { ok: false, error: admitted.error, detail: "本次运行的模型调用预算已用尽" }

        // Bound the outbound provider call to the CURRENT owned token and
        // active run status, in the same transaction as this renewal.
        // Never use the Worker process heartbeat as execution authorization.
        try {
          executionGuard.renewForDispatch($app, "agent", runId, uid, leaseToken,
            { maxCallMs: require(__hooks + "/modules/model_request.js").MAX_TIMEOUT_SECONDS * 1000 })
        } catch (dispatchErr) {
          return { ok: false,
            error: String((dispatchErr && dispatchErr.code) || "execution_lease_lost") }
        }
        // Reserve the next LLM attempt DURABLY before outbound billing.
        // The atomic per-run lease prevents ordinary competing ticks, but
        // strict fencing/expired-lease races still require a future upgrade.
        var previousCalls = harnessStats.llm_calls
        var previousChars = harnessStats.est_prompt_chars
        try {
          executionGuard.mutate($app, "agent", runId, uid, leaseToken, function (tx, budgetRecord) {
            var budgetCheckpoint = loadJson(budgetRecord, "checkpoint")
            var budgetStored = budgetCheckpoint.harness_stats || {}
            var storedCalls = Number(budgetStored.llm_calls || 0)
            if (!Number.isInteger(storedCalls) || storedCalls !== previousCalls ||
                storedCalls >= modelCallLimit.max_model_calls)
              throw new Error("model_budget_checkpoint_conflict")
            statsBump("llm_calls", 1)
            statsBump("est_prompt_chars", pChars0)
            budgetCheckpoint.harness_stats = harnessStats
            budgetRecord.set("checkpoint", budgetCheckpoint)
            tx.save(budgetRecord)
          })
        } catch (budgetError) {
          // Fail closed. A failed reservation MUST NOT send a paid request.
          harnessStats.llm_calls = previousCalls
          harnessStats.est_prompt_chars = previousChars
          return { ok: false, error: "model_budget_persist_failed" }
        }
        var engineRes = callEngineLlmBase(messages, maxTokens, timeoutSec)
        if (engineRes && engineRes.ok === true) statsBump("est_out_chars", String(engineRes.content || "").length)
        return engineRes
      }

      var rawSteps = cp.steps || []
      // A stop may arrive while the paid model request is outstanding. The
      // original checkpoint snapshot is stale by then; validate the current
      // checkpoint while holding the same fenced worker lease before acting
      // on a model decision or dispatching any tool.
      var stopAtActionBoundary = function () {
        var pending = false
        executionGuard.mutate($app, "agent", runId, uid, leaseToken, function (_tx, currentRun) {
          var fresh = loadJson(currentRun, "checkpoint")
          pending = fresh.cancel_requested === true || fresh.pause_requested === true
        })
        if (pending) {
          seq++
          addEvent(runId, stepIndex, seq, "status", {
            message: "运行控制请求已收到；忽略尚未执行的模型决策，禁止开始新的工具调用",
          })
        }
        return pending
      }

      var steps = []
      for (var s = 0; s < rawSteps.length; s++) steps.push(rawSteps[s])
      var evidenceService = require(__hooks + "/modules/harness_evidence.js")
      var evidenceRefs = Array.isArray(cp.evidence_refs) ? cp.evidence_refs.slice(-64) : []
      var doneSteps = Number(cp.done_steps || 0)
      var seq = Number(cp.seq || 0)
      var stepIndex = doneSteps + 1

      var roleService = require(__hooks + "/modules/agent_roles.js")
      var rolePlan = roleService.validatePlan(spec.roles, spec.tools)
      if (!rolePlan.valid) throw new Error("invalid_agent_roles")
      var roleOrder = rolePlan.orderedRoles
      cp.role_state = roleService.stateFor(roleOrder, cp.role_state)
      var activeRole = roleService.currentRole(roleOrder, cp.role_state)
      if (activeRole && cp.role_state.started_role_id !== activeRole.id) {
        cp.role_state.started_role_id = activeRole.id
        seq++
        addEvent(runId, stepIndex, seq, "status", {
          message: "进入角色阶段「" + activeRole.name + "」：" + activeRole.responsibility,
          role_id: activeRole.id, role_name: activeRole.name, role_phase: "started",
        })
        saveCheckpoint(runId, { role_state: cp.role_state, seq: seq }, doneSteps)
      }
      // Intersect with existing authorization; a role can narrow, never expand,
      // the tools granted to the immutable run snapshot.
      var configuredTools = cfg.tools || {}
      var toolsOn = {}
      for (var roleToolName in configuredTools) {
        if (Object.prototype.hasOwnProperty.call(configuredTools, roleToolName) &&
            configuredTools[roleToolName] === true && roleService.mayUseTool(activeRole, roleToolName))
          toolsOn[roleToolName] = true
      }
      var enabledTools = []
      if (toolsOn.calculate === true)
        enabledTools.push('calculate —— 计算器：入参 {"expression":"算术表达式"}，支持 + - * / % 与括号')
      if (toolsOn.summarize === true)
        enabledTools.push('summarize —— 文本整理/摘要：入参 {"text":"要整理的文本","focus":"可选的关注重点"}')
      if (toolsOn.knowledge_search === true)
        enabledTools.push('knowledge_search —— 知识库检索：入参 {"query":"检索关键词"}，优先从绑定的知识库中查找原文并返回引用')
      if (toolsOn.web_fetch === true)
        enabledTools.push('web_fetch —— 网页抓取：入参 {"url":"http(s) 网页地址"}，抓取页面并提取正文文本（最多 4000 字符）')
      if (toolsOn.web_search === true)
        enabledTools.push('web_search —— 网页搜索：入参 {"query":"搜索关键词","limit":条数(可选，≤10)}，返回标题/链接/摘要列表')

      // —— 外部工具连接：config.tools 里非内置的授权工具名，按 rh_user_id + 名称 + enabled
      // 精确匹配 tool_connections；命中的连接把用途描述给到规划提示词，调用时后端代理真实请求 ——
      var BUILTIN_TOOL_IDS = { calculate: 1, summarize: 1, knowledge_search: 1, web_fetch: 1, web_search: 1 }
      var customToolNames = []
      for (var tKey in toolsOn) {
        if (toolsOn[tKey] === true && !BUILTIN_TOOL_IDS[String(tKey)]) customToolNames.push(String(tKey))
      }
      var customConns = {}
      if (customToolNames.length > 0) {
        try {
          var tcRows = $app.findRecordsByFilter(
            "tool_connections",
            "rh_user_id = {:uid} && enabled = true",
            "-created",
            100,
            0,
            { uid: String(stepRun.get("rh_user_id")) }
          )
          for (var tci = 0; tci < tcRows.length; tci++) {
            var tcName = ""
            try {
              tcName = String(tcRows[tci].getString("name") || "")
            } catch (_) {}
            if (!tcName) continue
            for (var tnj = 0; tnj < customToolNames.length; tnj++) {
              if (customToolNames[tnj] === tcName) {
                customConns[tcName] = tcRows[tci]
                break
              }
            }
          }
        } catch (tcqErr) {
          logErr("load tool_connections", tcqErr)
        }
        for (var cti = 0; cti < customToolNames.length; cti++) {
          var ctRec = customConns[customToolNames[cti]]
          if (!ctRec) continue
          var ctDesc = ""
          try {
            ctDesc = String(ctRec.getString("description") || "")
          } catch (_) {}
          enabledTools.push(
            customToolNames[cti] +
              " —— 外部工具：" + ctDesc.slice(0, 300) +
              "；入参是一个 JSON 对象（字段按用途描述自行决定），会整体序列化后传给该工具"
          )
        }
      }

      // —— 市场插件工具（plugin-market）：本人全部已启用的 market_connections 连接，
      // 其工具快照以 mkt__<connectionId>__<toolName> 名进入工具集；严格同一员工 owner，
      // 必须具有已验证的工具清单，不能从其它员工连接表借出凭据或工具。
      // dispatch 命中前缀时按 MCP streamable-http tools/call 真实调用并写 tool_invocations ——
      var marketToolMap = {}
      // Explicitly selected MCP tools are captured at start, owned and verified again
      // at invocation. Old already-running records without this field keep their
      // historical behavior; every newly-created run is least-privilege by default.
      var selectedMarketIds = cfg.market_tool_ids
      var restrictMarket = Array.isArray(selectedMarketIds)

      try {
        var mkRows = $app.findRecordsByFilter(
          "market_connections",
          "rh_user_id = {:uid} && enabled = true && last_probe_status = 'ok' && tool_count > 0",
          "-created",
          50,
          0,
          { uid: String(stepRun.get("rh_user_id")) }
        )
        var mkToolTotal = 0
        for (var mki = 0; mki < mkRows.length && mkToolTotal < 60; mki++) {
          var mkRec = mkRows[mki]
          var mkTools = []
          try {
            var mkTStr = mkRec.getString("tools")
            if (mkTStr) {
              var mkTParsed = JSON.parse(mkTStr)
              if (mkTParsed && typeof mkTParsed.length === "number") mkTools = mkTParsed
            }
          } catch (_) {}
          if (mkTools.length === 0) continue
          var mkTitle = ""
          try {
            mkTitle = String(mkRec.getString("title") || mkRec.getString("server_name") || "市场插件")
          } catch (_) {}
          for (var mkj = 0; mkj < mkTools.length && mkToolTotal < 60; mkj++) {
            var mkT = mkTools[mkj] || {}
            var mkTName = String(mkT.name || "")
            if (!mkTName) continue
            var mkFull = "mkt__" + String(mkRec.id) + "__" + mkTName
            if (restrictMarket && selectedMarketIds.indexOf(mkFull) < 0) continue
            if (!roleService.mayUseTool(activeRole, mkFull)) continue
            marketToolMap[mkFull] = { conn: mkRec, tool: mkTName, title: mkTitle }
            var mkHint = String(mkT.args_hint || "")
            enabledTools.push(
              mkFull +
                " —— 市场插件「" + mkTitle.slice(0, 40) + "」的工具：" + String(mkT.description || "").slice(0, 200) +
                (mkHint ? "；入参字段：" + mkHint.slice(0, 200) : "") +
                "；入参是一个 JSON 对象，按该工具字段结构填写"
            )
            mkToolTotal++
          }
        }
      } catch (mkqErr) {
        logErr("load market_connections", mkqErr)
      }

      // —— 上下文压缩：历史观察累计 >8000 字符时，把最旧一半观察用引擎 LLM 摘要替换，
      // checkpoint 存压缩标记与摘要，压缩动作写 context_compact 事件 ——
      var compactFrom = Number(cp.compact_done || 0)
      if (compactFrom > steps.length) compactFrom = 0
      var obsTotal = 0
      for (var coi = compactFrom; coi < steps.length; coi++) obsTotal += String((steps[coi] || {}).obs || "").length
      if (obsTotal > 8000 && steps.length - compactFrom >= 4) {
        var halfN = Math.floor((steps.length - compactFrom) / 2)
        var oldObsLines = []
        for (var coj = compactFrom; coj < compactFrom + halfN; coj++) {
          var coStep = steps[coj] || {}
          oldObsLines.push("第" + (coj + 1) + "步（" + String(coStep.action || "") + (coStep.tool ? " " + String(coStep.tool) : "") + "）观察：" + String(coStep.obs || ""))
        }
        var compactRes = callEngineLlm(
          [
            {
              role: "user",
              content:
                "请把以下助手执行历史观察压缩成一段不超过 300 字的中文摘要，只保留对后续任务有用的事实与结论，不要评论：\n\n" +
                oldObsLines.join("\n").slice(0, 6000),
            },
          ],
          512
        )
        if (compactRes.ok) {
          statsBump("compressions", 1)
          var prevSummary = String(cp.compact_summary || "")
          var mergedSummary = (prevSummary ? prevSummary + "\n" : "") + String(compactRes.content).slice(0, 600)
          for (var cok = compactFrom; cok < compactFrom + halfN; cok++) {
            if (steps[cok]) steps[cok].obs = "（观察已压缩）"
          }
          cp.compact_summary = mergedSummary.slice(0, 2000)
          cp.compact_done = compactFrom + halfN
          seq++
          addEvent(runId, stepIndex, seq, "context_compact", {
            message: "历史观察累计超过阈值，已把最旧 " + halfN + " 步观察压缩为摘要",
            compacted_steps: halfN,
            thought: "上下文过长，压缩历史观察以保留推理预算",
            action: "context_compact",
            observation: String(compactRes.content).slice(0, 200),
          })
          saveCheckpoint(
            runId,
            {
              steps: steps,
              seq: seq,
              claim_until: new Date().getTime() + 240000,
              done_steps: doneSteps,
              parse_failures: Number(cp.parse_failures || 0),
              compact_summary: cp.compact_summary,
              compact_done: cp.compact_done,
              harness_stats: harnessStats,
              evidence_refs: evidenceRefs,
              call_sig_recent: sigRecent,
              pending_approval: cp.pending_approval || null,
              pending_input: cp.pending_input || null,
              plan_review_confirmed: cp.plan_review_confirmed === true,
              approval_decision: String(cp.approval_decision || ""),
              approved_step: Number(cp.approved_step || 0),
            },
            doneSteps
          )
        }
      }

      var pushStepAndSave = function (stepObj, parseFailures) {
        if (activeRole) { stepObj.role_id = activeRole.id; stepObj.role_name = activeRole.name }
        steps.push(stepObj)
        var trimmed = steps.length > 12 ? steps.slice(steps.length - 12) : steps
        var shiftN = steps.length - trimmed.length
        var newCompactDone = Number(cp.compact_done || 0) - shiftN
        if (newCompactDone < 0) newCompactDone = 0
        saveCheckpoint(
          runId,
          {
            steps: trimmed,
            seq: seq,
            claim_until: 0,
            done_steps: doneSteps + 1,
            parse_failures: parseFailures || 0,
            compact_summary: String(cp.compact_summary || ""),
            compact_done: newCompactDone,
            harness_stats: harnessStats,
            evidence_refs: evidenceRefs,
            call_sig_recent: sigRecent,
            pending_approval: cp.pending_approval || null,
            pending_input: cp.pending_input || null,
            plan_review_confirmed: cp.plan_review_confirmed === true,
            approval_decision: String(cp.approval_decision || ""),
            approved_step: Number(cp.approved_step || 0),
            role_state: cp.role_state,
          },
          doneSteps + 1
        )
      }
      // 直达终态（成功/失败）前把本次累积的 harness 核算先落库，避免最后一次调用漏计
      var persistStats = function () {
        try {
          executionGuard.mutate($app, "agent", runId, uid, leaseToken, function (tx, psRec) {
          var psCp = loadJson(psRec, "checkpoint")
          psCp.harness_stats = harnessStats
          psCp.call_sig_recent = sigRecent
          psCp.role_state = cp.role_state
          psRec.set("checkpoint", psCp)
          tx.save(psRec)
        })
        } catch (psErr) {
          logErr("persistStats", psErr)
          throw psErr
        }
      }

      // —— 审批门续跑：上一步停在待批准时，本步按用户决定直接续跑，不再重新规划 ——
      var pendingAp = cp.pending_approval || null
      var apMark = String(cp.approval_decision || "")
      var thought = ""
      var toolName = ""
      var toolInput = {}
      var resumeApprovedCall = false
      if (pendingAp && apMark === "reject") {
        // 拒绝的 observation 事件已由 approve 路由写入；这里把拒绝原因注入规划上下文并进入下一步
        cp.pending_approval = null
        cp.approval_decision = ""
        var rejToolName = String(pendingAp.tool || "")
        pushStepAndSave(
          { thought: "", action: "approval_rejected", tool: rejToolName, obs: "用户拒绝了这次调用：" + rejToolName + "。请换一种方式继续，或直接给出最终结论" },
          0
        )
        return
      }
      if (pendingAp && apMark === "approve") {
        resumeApprovedCall = true
        thought = String(pendingAp.thought || "")
        toolName = String(pendingAp.tool || "")
        toolInput = pendingAp.input || {}
        cp.pending_approval = null
        cp.approval_decision = ""
      }

      // Approval is not a permanent capability grant. Verify the live MCP
      // connection and this run's selected tool set again on the actual tick.
      // A revoked plugin must never be invoked, even from an approved checkpoint.
      if (resumeApprovedCall && toolName.indexOf("mkt__") === 0 && !marketToolMap[toolName]) {
        seq++
        addEvent(runId, stepIndex, seq, "error", {
          message: "市场插件已断开、停用或当前方案不再拥有此工具权限；原审批失效，本次调用未执行",
          tool: toolName,
        })
        pushStepAndSave({
          thought: thought.slice(0, 200), action: "tool_denied", tool: toolName,
          obs: "工具权限已撤销或连接未验证，本次调用被阻止；请使用其他已授权工具，或报告无法完成的部分",
        }, 0)
        if (doneSteps + 1 >= maxSteps) {
          finishRun(runId, "failed", "", "工具权限已撤销且任务步数预算耗尽", stepIndex, seq, "授权已失效")
        }
        return
      }
      if (resumeApprovedCall && !roleService.mayUseTool(activeRole, toolName)) {
        seq++
        addEvent(runId, stepIndex, seq, "error", { message: "当前角色无权调用这个工具，原审批不扩展角色权限", tool: toolName })
        pushStepAndSave({ thought: "", action: "tool_denied", tool: toolName, obs: "工具超出当前角色范围，未执行" }, 0)
        if (stepIndex >= maxSteps) finishRun(runId, "failed", "", "角色权限不匹配且步数预算耗尽", stepIndex, seq, "预算耗尽")
        return
      }

      if (!resumeApprovedCall) {
      var histLines = []
      var histFrom = steps.length > 8 ? steps.length - 8 : 0
      // 上下文选择性注入：最近 3 步观察全文，更早的观察只保留首 120 字符一行摘要
      var recentFullFrom = steps.length > 3 ? steps.length - 3 : 0
      for (var hi = histFrom; hi < steps.length; hi++) {
        var st = steps[hi] || {}
        var obsFull0 = String(st.obs || "")
        var obsShown0 = hi >= recentFullFrom ? obsFull0 : obsFull0.length > 120 ? obsFull0.slice(0, 120) + "（摘要）" : obsFull0
        histLines.push(
          "第" + (hi + 1) + "步：" + String(st.thought || "").slice(0, 160) +
            " ｜ 动作：" + String(st.action || "") + (st.tool ? "(" + String(st.tool) + ")" : "") +
            " ｜ 结果概要：" + obsShown0
        )
      }

      var specLines = []
      specLines.push("目标：" + String(spec.goal || ""))
      specLines.push("任务范围：" + String(spec.task_scope || ""))
      specLines.push("交付物：" + (spec.deliverables || []).join("、"))
      specLines.push("任务规划：" + (spec.task_plan || []).join(" → "))
      specLines.push("完成标准：" + (spec.done_criteria || []).join("；"))
      var knowledge = String(spec.knowledge || spec.context || "")
      if (knowledge) specLines.push("知识库内容（节选）：" + knowledge.slice(0, 1800))
      if (Array.isArray(spec.knowledge_base_ids) && spec.knowledge_base_ids.length) specLines.push("已绑定 "+spec.knowledge_base_ids.length+" 个专属知识库；涉及资料事实时先调用 knowledge_search，并在答案中保留返回的文件名与片段出处，不得虚构来源。")

      var stopCondition = String(cfg.stop_condition || "")
      var budgetLeft = maxSteps - doneSteps

      var sysPrompt =
        "你是「Agent Studio」里的助手执行引擎。你要基于助手方案与任务指令，逐步完成任务。" +
        "每次只输出下一步动作，必须是且仅是一个单行 JSON 对象（不要 markdown 代码块、不要多余文字；字符串内的换行与双引号必须转义为 \\n 与 \\\"），格式：" +
        '{"thought":"这一步的思考","action":"tool 或 ask_user 或 final","tool":"工具名(action=tool 时必填)","tool_input":{...},"question":"需要用户补充/确认的具体问题(action=ask_user 时必填)","final_answer":"完整成果(action=final 时必填)"}。' +
        "规则：只能调用已授权工具清单里的工具；工具不可用或失败时换思路继续，不要重复同一失败调用；" +
        "缺少决定性交付条件、或任务要求先提交方案供用户确认时，用 action=ask_user 说明当前方案与具体待确认事项（最多3个关键问题），必须等待用户回复再继续；不要将澄清问题作为 final 成果。仅在真正交付完成标准要求的最终内容时 action=final；每次 ask_user 消耗一步预算，预算不足时尽快收敛。"
      if (enabledTools.length === 0) sysPrompt += activeRole ?
        "当前角色没有已授权工具，请依据已提供信息完成本阶段，缺少决定性资料时如实说明或询问用户。" :
        "当前没有任何已授权工具，只能靠自身推理推进并尽早给出 final。"
      else sysPrompt += "已授权工具清单：\n" + enabledTools.join("\n")
      if (activeRole) sysPrompt += "\n\n" + roleService.rolePrompt(activeRole, roleOrder, cp.role_state)
      if (cfg.require_plan_review === true) {
        if (cp.plan_review_confirmed === true) {
          sysPrompt += "\n【方案确认关卡已通过】用户已确认需求草案。现在必须依据已完成步骤中的用户确认或修改意见，继续产出真正的后续落地计划和验收方案；若未遇到新重大障碍，不要重复要求确认。"
        } else {
          sysPrompt += "\n【必须经过人工确认的阶段关卡】本次任务在需求方案草案被用户批准前，不允许直接结束。请先生成结构化需求草案（目标、范围、交付物、限制、验收标准），用 action=ask_user 把草案展示给用户，等待用户明确批准或提出修改。仅用户批准后才能编制后续落地计划；不得冒充已获批准。"
        }
      }
      // —— 跨运行记忆注入：start 时按指令与 fact 重叠度检索的 top3 同方案过往经验 ——
      var memHints = cfg.memory_hints || []
      if (memHints && memHints.length > 0) {
        var memLines = []
        for (var mhi = 0; mhi < memHints.length && mhi < 3; mhi++) {
          memLines.push("- " + String(memHints[mhi]).slice(0, 320))
        }
        sysPrompt += "\n\n【同方案长期记忆（「用户指令」类必须遵守，经验与教训仅供参考，不要照搬）】\n" + memLines.join("\n")
      }

      var userPrompt =
        "【助手方案】\n" + specLines.join("\n") +
        "\n\n【本次任务指令】\n" + instruction +
        (stopCondition ? "\n\n【用户停止条件】\n" + stopCondition : "") +
        (cp.compact_summary ? "\n\n【已压缩的早期观察摘要】\n" + String(cp.compact_summary) : "") +
        (evidenceRefs.length ? "\n\n【已保存的来源线索（尚未独立核验）】\n" + evidenceService.formatPrompt(evidenceRefs) : "") +
        "\n\n【已完成步骤】\n" + (histLines.length ? histLines.join("\n") : "（尚无，这是第一步）") +
        "\n\n【预算】当前第 " + stepIndex + " 步，最多 " + maxSteps + " 步，剩余 " + budgetLeft + " 步。" +
        "\n请输出下一步动作的 JSON。"

      var llm = callEngineLlm(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        4096
      )

      // A cancellation/pause accepted during model I/O must win over the
      // returned tool decision. Never dispatch that tool after the stop.
      if (stopAtActionBoundary()) return
      if (!llm.ok) {
        seq++
        if (llm.error === "model_call_budget_exhausted") {
          addEvent(runId, stepIndex, seq, "error", { message: "model_call_budget_exhausted：已达到模型调用上限" })
          persistStats()
          finishRun(runId, "failed", "", "model_call_budget_exhausted", stepIndex, seq, "模型调用预算耗尽，已停止运行")
          return
        }
        if (llm.error === "run_runtime_deadline_exceeded") {
          addEvent(runId, stepIndex, seq, "error", { message: "run_runtime_deadline_exceeded：任务最长运行时间已达到" })
          persistStats()
          finishRun(runId, "failed", "", "run_runtime_deadline_exceeded", stepIndex, seq, "任务总时限已达到，已停止运行")
          return
        }
        addEvent(runId, stepIndex, seq, "error", { message: "规划调用失败：" + llm.error, detail: llm.detail || "" })
        var pf1 = Number(cp.parse_failures || 0) + 1
        if (pf1 >= 3) {
          persistStats()
          finishRun(runId, "failed", "", "规划调用连续失败（" + llm.error + "），运行终止", stepIndex, seq, "运行失败：规划调用连续失败")
          return
        }
        pushStepAndSave({ thought: "", action: "error", obs: "规划调用失败（" + llm.error + "），下一步重试" }, pf1)
        return
      }

      var decision = parseDecisionJson(llm.content)
      if (!decision || typeof decision !== "object") {
        seq++
        addEvent(runId, stepIndex, seq, "error", { message: "模型输出不是合法 JSON，本步作废并重试", detail: String(llm.content || "").slice(0, 400) })
        var pf2 = Number(cp.parse_failures || 0) + 1
        if (pf2 >= 3) {
          persistStats()
          finishRun(runId, "failed", "", "模型连续输出无法解析的内容，运行终止", stepIndex, seq, "运行失败：输出连续无法解析")
          return
        }
        pushStepAndSave({ thought: "", action: "error", obs: "上一步输出不是合法 JSON。请只输出一个单行 JSON 对象：不要代码块、不要说明文字、字符串内换行用 \\n 转义" }, pf2)
        return
      }

      thought = String(decision.thought || "")
      seq++
      addEvent(runId, stepIndex, seq, "thinking", { thought: thought,
        role_id: activeRole ? activeRole.id : "", role_name: activeRole ? activeRole.name : "" })

      // "需要补充信息" 与 "需要批准阶段草案" 使用同一持久化等待状态，
      // 但明确区分审批性质。后端关卡不能仅依赖模型自觉遵守提示词。
      var pauseForUser = function (rawQuestion, kind, draft) {
        var askQuestion = String(rawQuestion || "").trim().slice(0, 12000)
        if (!askQuestion || stepIndex >= maxSteps) {
          seq++
          addEvent(runId, stepIndex, seq, "error", {
            message: !askQuestion ? "模型请求用户确认却没有具体问题，下一步重新规划" :
              "剩余步数不足以在人工确认之后继续执行",
          })
          if (stepIndex >= maxSteps) {
            persistStats()
            finishRun(runId, "failed", "", "本次预算不足，人工确认后无法继续；请提高最大步数重试", stepIndex, seq, "预算耗尽")
          } else pushStepAndSave({
            thought: thought.slice(0, 200), action: "invalid_user_question",
            obs: "缺少需确认的具体内容，请补全需求方案草案或者直接交付成果",
          }, 0)
          return
        }
        seq++
        addEvent(runId, stepIndex, seq, "input_pending", {
          message: kind === "plan_review" ? "已生成阶段草案，等待人工批准或提出修改意见" : "等待用户补充信息",
          question: askQuestion, kind: kind, step_index: stepIndex,
        })
        // Fence the waiting-state transition too: a concurrent cancel request
        // must merge into this checkpoint instead of being overwritten by a stale read.
        executionGuard.mutate($app, "agent", runId, uid, leaseToken, function (tx, inputRun) {
          var inputCp = loadJson(inputRun, "checkpoint")
          inputCp.pending_input = {
            step_index: stepIndex, question: askQuestion, kind: kind,
            draft: String(draft || "").slice(0, 12000),
          }
          inputCp.claim_until = 0
          inputCp.seq = seq
          inputCp.harness_stats = harnessStats
          inputCp.call_sig_recent = sigRecent
          inputRun.set("checkpoint", inputCp)
          inputRun.set("current_step", stepIndex)
          inputRun.set("status", "awaiting_input")
          tx.save(inputRun)
        })
      }

      if (String(decision.action) === "ask_user") {
        pauseForUser(decision.question,
          cfg.require_plan_review === true && cp.plan_review_confirmed !== true ?
            "plan_review" : "clarification", "")
        return
      }

      if (activeRole && String(decision.action) === "role_complete") {
        if (cfg.require_plan_review === true && cp.plan_review_confirmed !== true) {
          pauseForUser("【待确认阶段方案】\n" + String(decision.role_output || "") +
            "\n\n请确认方案后继续后续角色阶段。", "plan_review", String(decision.role_output || ""))
          return
        }
        var handoff = roleService.completeStage(roleOrder, cp.role_state,
          String(decision.role_id || ""), sanitizeFinalSecrets(String(decision.role_output || "")))
        if (!handoff.ok || !handoff.nextRole) {
          seq++
          var handoffError = handoff.ok ? "最后一个角色应核对全部成果后使用 action=final 完成交付" : handoff.error
          addEvent(runId, stepIndex, seq, "error", { message: handoffError, role_id: activeRole.id })
          pushStepAndSave({ thought: thought.slice(0, 200), action: "role_handoff_rejected", obs: handoffError }, 0)
          if (stepIndex >= maxSteps) finishRun(runId, "failed", "", "角色交接无效且预算耗尽", stepIndex, seq, "预算耗尽")
          return
        }
        cp.role_state = handoff.state
        seq++
        addEvent(runId, stepIndex, seq, "status", {
          message: "角色「" + activeRole.name + "」已交付，下一阶段由「" + handoff.nextRole.name + "」接手。阶段内容仍需核验。",
          role_id: activeRole.id, role_name: activeRole.name, role_phase: "completed",
          next_role_id: handoff.nextRole.id, output: handoff.state.outputs[activeRole.id],
        })
        pushStepAndSave({ thought: thought.slice(0, 200), action: "role_complete",
          obs: "已保存角色「" + activeRole.name + "」的交接成果：" + handoff.state.outputs[activeRole.id] }, 0)
        if (stepIndex >= maxSteps) finishRun(runId, "failed", "", "角色成果已保存，但后续阶段未完成且预算耗尽", stepIndex, seq, "后续角色尚未执行，预算耗尽")
        return
      }

      if (String(decision.action) === "final") {
        var finalAnswer = String(decision.final_answer || decision.finalAnswer || "")
        if (cfg.require_plan_review === true && cp.plan_review_confirmed !== true) {
          // 即使模型擅自 final，也不能绕过显式配置的人工方案审核。
          pauseForUser("【待确认需求方案草案】\n" + finalAnswer +
            "\n\n请先核对上述内容：批准后才会制定后续落地计划；如需调整请选择提出修改意见。",
            "plan_review", finalAnswer)
          return
        }
        if (activeRole && cp.role_state.completed.length < roleOrder.length - 1) {
          seq++
          addEvent(runId, stepIndex, seq, "error", { message: "还有后续角色未执行，不能提前报告任务完成", role_id: activeRole.id })
          pushStepAndSave({ thought: thought.slice(0, 200), action: "role_final_rejected",
            obs: "当前角色「" + activeRole.name + "」需通过 action=role_complete、role_id 和 role_output 提交交接成果，之后才由后续角色继续。" }, 0)
          if (stepIndex >= maxSteps) finishRun(runId, "failed", "", "后续角色未完成且步数预算耗尽", stepIndex, seq, "预算耗尽")
          return
        }
        if (activeRole) {
          var finalRole = roleService.completeStage(roleOrder, cp.role_state, activeRole.id,
            sanitizeFinalSecrets(finalAnswer).slice(0, 12000))
          if (!finalRole.ok) {
            seq++
            addEvent(runId, stepIndex, seq, "error", { message: finalRole.error, role_id: activeRole.id })
            pushStepAndSave({ thought: thought.slice(0, 200), action: "role_final_rejected", obs: finalRole.error }, 0)
            if (stepIndex >= maxSteps) finishRun(runId, "failed", "", "最终角色没有有效交付且预算耗尽", stepIndex, seq, "预算耗尽")
            return
          }
          cp.role_state = finalRole.state
          seq++
          addEvent(runId, stepIndex, seq, "status", { message: "最终角色「" + activeRole.name + "」已提交成果", role_id: activeRole.id, role_name: activeRole.name, role_phase: "completed" })
        }
        // —— 跨运行记忆写入：成功结束先尝试一次轻量 LLM 提炼（≤200 字可复用经验，出站 ≤25s），
        // 提炼失败/超时/为空回退成果前 500 字符截选；写入失败不影响 run 终态 ——
        if (finalAnswer) {
          try {
            var memToolSet = {}
            var memToolNames = []
            for (var mti = 0; mti < steps.length; mti++) {
              var mtName = String((steps[mti] || {}).tool || "")
              if (mtName && !memToolSet[mtName]) {
                memToolSet[mtName] = true
                memToolNames.push(mtName)
              }
            }
            var memFactText = finalAnswer.slice(0, 500)
            try {
              var refineRes = callEngineLlm(
                [
                  {
                    role: "system",
                    content:
                      "把本次任务与最终成果提炼成一条不超过 200 字、值得跨任务复用的经验：用户偏好、有效做法或关键结论。只输出经验本身，不要任何解释、前缀、标题或引号。",
                  },
                  {
                    role: "user",
                    content:
                      "【任务指令】\n" + instruction.slice(0, 600) +
                      "\n\n【最终成果】\n" + finalAnswer.slice(0, 1500) +
                      "\n\n【本次用过的工具】\n" + (memToolNames.join("、") || "（无）"),
                  },
                ],
                512,
                25
              )
              if (refineRes && refineRes.ok === true) {
                var refinedText = String(refineRes.content || "").trim()
                if (refinedText) memFactText = refinedText.slice(0, 500)
              }
            } catch (_) {}
            var memFactFinal = sanitizeFinalSecrets(memFactText).slice(0, 500)
            var memCol = $app.findCollectionByNameOrId("agent_memories")
            var memRec = new Record(memCol)
            memRec.set("rh_user_id", String(stepRun.get("rh_user_id")))
            memRec.set("spec_id", String(stepRun.get("spec_id")))
            memRec.set("fact", memFactFinal)
            memRec.set("tools_used", memToolNames.join(",").slice(0, 300))
            memRec.set("run_id", String(runId))
            memRec.set("kind", "fact")
            $app.save(memRec)
            seq++
            addEvent(runId, stepIndex, seq, "memory_saved", {
              message: "已存入长期记忆（经验）",
              kind: "fact",
              fact_preview: memFactFinal.slice(0, 120),
            })
          } catch (memErr) {
            logErr("write agent_memories", memErr)
          }
        }
        persistStats()
        finishRun(runId, "succeeded", finalAnswer, "", stepIndex, seq, "运行完成，已产出最终成果")
        return
      }

      toolName = String(decision.tool || "")
      toolInput = decision.tool_input || decision.toolInput || {}
      if (toolName === "" || (toolsOn[toolName] !== true && !marketToolMap[toolName])) {
        seq++
        addEvent(runId, stepIndex, seq, "error", {
          message: "工具「" + (toolName || "未指定") + "」未授权或不存在，本次调用被拒绝",
          tool: toolName,
        })
        pushStepAndSave(
          { thought: thought.slice(0, 200), action: "tool_denied", tool: toolName, obs: "工具未授权或不存在，请改用已授权工具、直接推理，或宣告完成" },
          0
        )
        if (doneSteps + 1 >= maxSteps) {
          finishRun(runId, "failed", "", "已达最大步数上限（" + maxSteps + " 步），未产出最终结果", stepIndex, seq, "预算耗尽，运行终止")
        }
        return
      }
      }

      // Shared preflight contract: identical Goja validation, deadline and
      // risk classification for Agent + Workflow. Auth/ACL remains server-side.
      var stepExecutor = require(__hooks + "/modules/harness_step_executor.js")
      var toolContract = require(__hooks + "/modules/harness_tool_contracts.js")
      var toolPolicyService = require(__hooks + "/modules/tool_policy.js")
      var configuredToolMethod = "POST"
      var configuredConnectionId = ""
      var configuredDestinationHash = ""
      if (customConns[toolName]) {
        try {
          var targetConn = customConns[toolName]
          configuredToolMethod = String(targetConn.getString("method") || "POST")
          configuredConnectionId = String(targetConn.id || "")
          configuredDestinationHash = $security.sha256(
            String(targetConn.getString("url") || "") + "\n" +
            String(targetConn.getString("headers") || "") + "\n" +
            String(targetConn.getString("body_template") || ""))
        } catch (_) {}
      } else if (marketToolMap[toolName] && marketToolMap[toolName].conn) {
        try {
          var marketConn = marketToolMap[toolName].conn
          configuredConnectionId = String(marketConn.id || "")
          configuredDestinationHash = $security.sha256(
            String(marketConn.getString("url") || "") + "\n" +
            String(marketConn.getString("headers_sec") || ""))
        } catch (_) {}
      }
      var plan = stepExecutor.prepareToolStep({
        toolName: toolName, input: toolInput, checkpoint: cp,
        market: Boolean(marketToolMap[toolName]),
        external: Boolean(customConns[toolName]),
        method: configuredToolMethod,
        requireApproval: cfg.require_approval === true || resumeApprovedCall,
        mandatoryApproval: $os.getenv("AGENT_STUDIO_HARNESS_V2_STRICT_WRITES") === "true",
        nowMs: new Date().getTime(),
      }, toolContract, toolPolicyService, runLifecycle.withinDeadline)
      if (!plan.ok) {
        seq++
        addEvent(runId, stepIndex, seq, "error", { message: "tool_step_denied：" + plan.error, tool: toolName })
        if (plan.error === "run_runtime_deadline_exceeded") {
          persistStats()
          finishRun(runId, "failed", "", plan.error, stepIndex, seq, "任务总时限已达到")
        } else {
          pushStepAndSave({ thought: thought.slice(0, 200), action: "tool_input_invalid",
            tool: toolName, obs: "工具输入未通过安全校验：" + plan.error }, 0)
          if (doneSteps + 1 >= maxSteps) {
            persistStats()
            finishRun(runId, "failed", "", "工具参数无效且已达到步数上限", stepIndex, seq, "运行预算已耗尽")
          }
        }
        return
      }
      toolInput = plan.value
      var currentApprovalDigest = stepExecutor.approvalDigest(function (src) { return $security.sha256(src) }, {
        toolName: toolName, method: configuredToolMethod,
        connectionId: configuredConnectionId, destination: configuredDestinationHash,
        value: toolInput,
      })
      var approvedCallMatches = resumeApprovedCall &&
        stepExecutor.approvalMatches(pendingAp && pendingAp.approval_digest, currentApprovalDigest)
      var toolPolicy = approvedCallMatches ? toolPolicyService.classify({
        toolName: toolName, market: Boolean(marketToolMap[toolName]),
        external: Boolean(customConns[toolName]), method: configuredToolMethod,
        requireApproval: cfg.require_approval === true,
        mandatoryApproval: $os.getenv("AGENT_STUDIO_HARNESS_V2_STRICT_WRITES") === "true",
        alreadyApproved: true,
      }) : plan.policy
      var audit = require(__hooks + "/modules/harness_audit.js")

      var invInputStr = ""
      try {
        invInputStr = JSON.stringify(toolInput)
      } catch (_) {
        invInputStr = "{}"
      }

      // —— 卡死循环防护：同「工具名+参数哈希」连续 3 次判定卡死，直接终止（与 max_steps 独立生效）——
      var callSig0 = toolName + "|" + sigHash(invInputStr)
      sigRecent.push(callSig0)
      if (sigRecent.length > 5) sigRecent = sigRecent.slice(sigRecent.length - 5)
      cp.call_sig_recent = sigRecent
      var srLen = sigRecent.length
      if (srLen >= 3 && sigRecent[srLen - 1] === sigRecent[srLen - 2] && sigRecent[srLen - 2] === sigRecent[srLen - 3]) {
        seq++
        addEvent(runId, stepIndex, seq, "error", {
          message: "stuck_loop_detected：连续 3 次出现相同的工具调用（" + toolName + "），疑似卡死循环，运行终止",
          tool: toolName,
          detail: "三次调用摘要一致：" + toolName + " 入参 " + invInputStr.slice(0, 150),
        })
        persistStats()
        finishRun(runId, "failed", "", "stuck_loop_detected（连续 3 次相同工具调用，疑似卡死循环终止）", stepIndex, seq, "运行失败：检测到卡死循环")
        return
      }

      // —— 写操作审批门：运行配置开启 require_approval 时，外部写工具（method != GET）与
      // 市场插件工具不直接执行，转 awaiting_approval 等用户在 approve 路由上决定 ——
      var needApproval = toolPolicy.requiresApproval
      if (needApproval) {
        statsBump("approvals", 1)
        seq++
        addEvent(runId, stepIndex, seq, "approval_pending", {
          message: "等待你的批准：" + toolName,
          tool_name: toolName,
          args_summary: audit.excerpt(toolInput, 300),
          step_index: stepIndex,
          thought: thought.slice(0, 200),
        })
        executionGuard.mutate($app, "agent", runId, uid, leaseToken, function (tx, apRunRec) {
          var apCp = loadJson(apRunRec, "checkpoint")
          apCp.pending_approval = { step_index: stepIndex, tool: toolName, input: toolInput, thought: thought.slice(0, 200), approval_digest: currentApprovalDigest }
          apCp.approval_decision = ""
          apCp.claim_until = 0
          apCp.seq = seq
          apCp.harness_stats = harnessStats
          apCp.call_sig_recent = sigRecent
          apRunRec.set("checkpoint", apCp)
          apRunRec.set("status", "awaiting_approval")
          tx.save(apRunRec)
        })
        return
      }

      seq++
      addEvent(runId, stepIndex, seq, "tool_call", {
        tool: toolName,
        role_id: activeRole ? activeRole.id : "", role_name: activeRole ? activeRole.name : "",
        input: audit.redact(toolInput),
        thought: thought.slice(0, 200),
        action: "tool:" + toolName + " " + audit.excerpt(toolInput, 200),
        observation: "",
      })

      // 统一分派器：单次真实调用；超时/网络级失败可标记 retryable 由外层自动重试 1 次（模型调用不重试）
      var execToolOnce = function () {
      // Revalidate *every* tool attempt, including a read-only retry. A
      // stolen/expired lease cannot initiate another external request.
      // Even long chained steps remain safe at each individual boundary.
      executionGuard.renewForDispatch($app, "agent", runId, uid, leaseToken,
        { maxCallMs: require(__hooks + "/modules/model_request.js").MAX_TIMEOUT_SECONDS * 1000 })
      var output = ""
      var toolErr = ""
      var retryable = false
      if (toolName === "calculate") {
        try {
          var val = evalExpr(toolInput.expression)
          output = String(toolInput.expression) + " = " + String(val)
        } catch (err) {
          toolErr = String((err && err.message) || err)
        }
      } else if (toolName === "summarize") {
        var focus = String(toolInput.focus || "")
        var sumRes = callEngineLlm(
          [
            {
              role: "user",
              content:
                "请整理并总结以下文本" + (focus ? "（关注重点：" + focus + "）" : "") + "，直接输出整理后的要点，不要寒暄：\n\n" +
                String(toolInput.text || "").slice(0, 6000),
            },
          ],
          2048
        )
        if (sumRes.ok) output = sumRes.content
        else toolErr = "摘要调用失败：" + sumRes.error
      } else if (toolName === "knowledge_search") {
        try {
          output = knowledgeSearch(spec, toolInput.query)
        } catch (err) {
          toolErr = String((err && err.message) || err)
        }
      } else if (toolName === "web_fetch") {
        var wfRes = webFetchOnce(toolInput.url)
        if (wfRes.ok) output = String(wfRes.output || "")
        else {
          toolErr = wfRes.error + "（" + wfRes.message + "）"
          if (wfRes.retryable === true) retryable = true
        }
      } else if (toolName === "web_search") {
        var wsRes = webSearchOnce(toolInput.query, toolInput.limit)
        if (wsRes.ok) output = String(wsRes.output || "")
        else toolErr = wsRes.error + "（" + wsRes.message + "）"
      } else if (marketToolMap[toolName]) {
        // —— 市场插件工具真实调用：MCP streamable-http JSON-RPC tools/call（直接 → initialize 回退链），
        // 授权头服务端解混淆并抹除输出中的授权头；网络错误用于诊断，但市场 MCP 的 POST 结果不明时禁止自动重放。
        var mk = marketToolMap[toolName]
        var mkUrl = ""
        try {
          mkUrl = String(mk.conn.getString("url") || "")
        } catch (_) {}
        var mkHeaders = {}
        try {
          var mkSecStr = String(mk.conn.getString("headers_sec") || "")
          if (mkSecStr) {
            var mkSecArr = JSON.parse(mkSecStr)
            if (mkSecArr && typeof mkSecArr.length === "number") {
              for (var mhi = 0; mhi < mkSecArr.length; mhi++) {
                var mhItem = mkSecArr[mhi] || {}
                var mhKey = String(mhItem.k || "")
                if (mhKey) mkHeaders[mhKey] = deobfKey(String(mhItem.v || ""))
              }
            }
          }
        } catch (_) {}
        var mkSanitize = function (s3) {
          var o3 = String(s3 || "")
          for (var sk3 in mkHeaders) {
            var sv3 = String(mkHeaders[sk3] || "")
            if (sv3.length >= 6) o3 = o3.split(sv3).join("***")
          }
          return o3
        }
        var mkRpc = function (method3, params3, rpcId3, sess3) {
          var hdrs3 = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }
          for (var hk3 in mkHeaders) {
            if (String(mkHeaders[hk3]) !== "") hdrs3[hk3] = mkHeaders[hk3]
          }
          if (sess3) hdrs3["Mcp-Session-Id"] = sess3
          // Do not add Idempotency-Key blindly: the Go HTTP transport can retry POST on network errors.
          var bObj3 = { jsonrpc: "2.0", method: method3, params: params3 || {} }
          if (rpcId3 !== null && rpcId3 !== undefined) bObj3.id = rpcId3
          var res3 = null
          try {
            res3 = $http.send({ url: mkUrl, method: "POST", headers: hdrs3, body: JSON.stringify(bObj3), timeout: 25 })
          } catch (netErr3) {
            return { net: true, message: mkSanitize(String((netErr3 && netErr3.message) || netErr3)).slice(0, 160), status: 0, text: "", data: null, session: "" }
          }
          var txt3 = bytesToStr(res3)
          var parsed3 = null
          var trimmed3 = txt3.replace(/^\s+/, "")
          if (trimmed3.indexOf("{") === 0) {
            try { parsed3 = JSON.parse(txt3.trim()) } catch (_) {}
          } else {
            // SSE 文本响应：解析 data: 行里的 JSON
            var lns3 = txt3.split("\n")
            for (var lxi3 = 0; lxi3 < lns3.length; lxi3++) {
              var lnn3 = lns3[lxi3].replace(/^\s+/, "")
              if (lnn3.indexOf("data:") === 0) {
                var pl3 = lnn3.substring(5).replace(/^\s+/, "")
                if (pl3 && pl3 !== "[DONE]") {
                  try {
                    var po3 = JSON.parse(pl3)
                    if (po3 && typeof po3 === "object") parsed3 = po3
                  } catch (_) {}
                }
              }
            }
          }
          var sessOut3 = ""
          try {
            var hs3 = res3.headers || {}
            var svH3 = hs3["Mcp-Session-Id"] || hs3["mcp-session-id"]
            if (svH3) sessOut3 = typeof svH3 === "string" ? svH3 : String(svH3[0])
          } catch (_) {}
          return { net: false, status: Number(res3.statusCode || 0), text: mkSanitize(txt3), data: parsed3, session: sessOut3 }
        }
        var mkExtract = function (result4) {
          if (!result4) return ""
          var out4 = ""
          var content4 = result4.content
          if (content4 && typeof content4.length === "number") {
            for (var ci4 = 0; ci4 < content4.length && out4.length < 4000; ci4++) {
              var cIt4 = content4[ci4] || {}
              if (String(cIt4.type || "") === "text") out4 += String(cIt4.text || "")
              else if (cIt4.type) out4 += "[" + String(cIt4.type) + " 内容]"
            }
          }
          if (!out4 && result4.structuredContent !== undefined && result4.structuredContent !== null) {
            try { out4 = JSON.stringify(result4.structuredContent) } catch (_) {}
          }
          return out4
        }
        var mkCall = function (sess5) {
          return mkRpc("tools/call", { name: mk.tool, arguments: toolInput }, 10, sess5)
        }
        var mkr = mkCall("")
        var mkResult = mkr.data && mkr.data.result !== undefined && mkr.data.result !== null ? mkr.data.result : null
        if (!mkResult && !mkr.net) {
          var mkErrObj = (mkr.data && mkr.data.error) || null
          var mkErrTxt = mkErrObj ? String(mkErrObj.message || "") + " " + String(mkErrObj.data || "") : String(mkr.text || "").slice(0, 300)
          var mkNeedInit = /initializ|not initialized|session required|handshake/i.test(mkErrTxt) || Number((mkErrObj && mkErrObj.code) || 0) === -32002
          if (mkNeedInit) {
            var mkInitR = mkRpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "AgentStudio", version: "1.0" } }, 1, "")
            var mkSess = mkInitR.net ? "" : String(mkInitR.session || "")
            if (!mkInitR.net && mkSess) {
              try { mkRpc("notifications/initialized", {}, null, mkSess) } catch (_) {}
            }
            mkr = mkCall(mkSess)
            mkResult = mkr.data && mkr.data.result !== undefined && mkr.data.result !== null ? mkr.data.result : null
          }
        }
        if (mkResult && mkResult.isError !== true) {
          output = mkSanitize(mkExtract(mkResult)).slice(0, 2000)
          if (!output) output = "（插件返回空内容）"
        } else {
          if (mkr.net) retryable = true
          var mkFailMsg = ""
          if (mkr.net) mkFailMsg = mkr.message
          else if (mkResult && mkResult.isError === true) mkFailMsg = mkExtract(mkResult) || "插件返回了错误（isError）"
          else {
            var mkEo2 = (mkr.data && mkr.data.error) || null
            mkFailMsg = mkEo2 ? String(mkEo2.message || "") : "HTTP " + mkr.status + "：" + String(mkr.text || "").replace(/\s+/g, " ").slice(0, 160)
          }
          toolErr = "market_tool_failed（市场插件「" + String(mk.title || "") + "」的 " + String(mk.tool || "") + " 调用失败）：" + mkSanitize(mkFailMsg).slice(0, 200)
        }
      } else if (customConns[toolName]) {
        // —— 外部工具连接真实调用：headers 服务端解混淆、{{input}} 替换为规划参数 JSON、
        // 超时保护；成功 output 截断 2000 字符，失败写 error 事件不重试 ——
        var tcRec = customConns[toolName]
        var tcUrl = ""
        try {
          tcUrl = String(tcRec.getString("url") || "")
        } catch (_) {}
        var tcMethod = "POST"
        try {
          tcMethod = String(tcRec.getString("method") || "POST").toUpperCase()
        } catch (_) {}
        if (tcMethod !== "GET") tcMethod = "POST"
        var tcHeaders = {}
        try {
          var tcHStr = String(tcRec.getString("headers") || "")
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
        var tcInputJson = ""
        try {
          tcInputJson = JSON.stringify(toolInput)
        } catch (_) {
          tcInputJson = "{}"
        }
        // 模板占位符：{{字段名}} 按调用入参字段取值并 URL 编码，{{input}} 保持原语义替换为入参 JSON 原文
        var applyToolTemplate = function (tpl, inputObj, inputJson) {
          return String(tpl || "").replace(/\{\{\s*([a-zA-Z0-9_一-龥]+)\s*\}\}/g, function (m, key) {
            if (key === "input") return inputJson
            var v = inputObj && inputObj[key] !== undefined ? inputObj[key] : ""
            if (v && typeof v === "object") v = JSON.stringify(v)
            return encodeURIComponent(String(v))
          })
        }
        tcUrl = applyToolTemplate(tcUrl, toolInput, tcInputJson)
        var tcSendOpts = { url: tcUrl, method: tcMethod, headers: tcHeaders }
        // Non-idempotent POST: no retry-enabling headers unless the adapter explicitly guarantees dedupe.
        var tcTimeout = 15
        try {
          tcTimeout = Number(tcRec.getInt("timeout_s") || 15)
        } catch (_) {}
        if (isNaN(tcTimeout) || tcTimeout < 5) tcTimeout = 5
        // tick 请求经预览网关转发，外部工具调用超时钳制 25s 以内防止网关先断开
        if (tcTimeout > 25) tcTimeout = 25
        tcSendOpts.timeout = tcTimeout
        if (tcMethod === "POST") {
          var tcTpl = ""
          try {
            tcTpl = String(tcRec.getString("body_template") || "")
          } catch (_) {}
          tcSendOpts.body = tcTpl ? applyToolTemplate(tcTpl, toolInput, tcInputJson) : tcInputJson
          var tcHasCt = false
          for (var tcCtKey in tcHeaders) {
            if (String(tcCtKey).toLowerCase() === "content-type") {
              tcHasCt = true
              break
            }
          }
          if (!tcHasCt) tcHeaders["Content-Type"] = "application/json"
        }
        var tcSanitize = function (s) {
          var out = String(s || "").replace(/([?&](?:api[_-]?key|key|token|secret|password|access[_-]?key)=)[^&\s"']+/gi, "$1***")
          // 上游若把我方送出的 header 值反射进响应/错误详情，外发前先抹掉
          for (var rsKey in tcHeaders) {
            var rsVal = String(tcHeaders[rsKey] || "")
            if (rsVal.length >= 8) out = out.split(rsVal).join("***")
          }
          return out
        }
        var tcRes = null
        try {
          tcRes = $http.send(tcSendOpts)
        } catch (tcNetErr) {
          var tcNetRaw = String((tcNetErr && tcNetErr.message) || tcNetErr)
          retryable = true
          if (/timeout/i.test(tcNetRaw)) {
            toolErr = "custom_tool_timeout（工具「" + toolName + "」在 " + tcTimeout + " 秒内无响应）"
          } else {
            toolErr = "custom_tool_unreachable（工具「" + toolName + "」地址不通）：" + tcSanitize(tcNetRaw).slice(0, 160)
          }
        }
        if (!toolErr && tcRes) {
          var tcCode = Number(tcRes.statusCode || 0)
          if (tcCode < 200 || tcCode >= 300) {
            toolErr = "custom_tool_http_" + tcCode + "（工具「" + toolName + "」上游返回错误）"
          } else {
            var tcRawBody = bytesToStr(tcRes)
            output = tcSanitize(tcRawBody).slice(0, 2000)
            if (!output) output = "（工具返回空响应，HTTP " + tcCode + "）"
          }
        }
      } else if (customToolNames.indexOf(toolName) >= 0) {
        toolErr = "外部工具「" + toolName + "」的连接已停用或已删除，本次调用不执行"
      } else {
        toolErr = "未知工具：" + toolName
      }
      return { output: output, toolErr: toolErr, retryable: retryable }
      }

      // Close the model→tool planning window, including a resumed approved
      // call. The user's stop request must be checked against the live DB
      // immediately before the side-effect journal or tool dispatch.
      if (stopAtActionBoundary()) return
      // Durable write-intent journal. Never automatically replay an unknown POST/MCP outcome.
      // A single Agent step may perform at most one external write.
      var effectNeeded = toolPolicy.write
      var effectKey = ""
      var effectClaimed = false
      var effectCached = false
      var effectCachedOutput = ""
      var effectUnknown = ""
      if (effectNeeded) {
        executionGuard.renewForDispatch($app, "agent", runId, uid, leaseToken,
          { maxCallMs: require(__hooks + "/modules/model_request.js").MAX_TIMEOUT_SECONDS * 1000 })
        effectKey = "as-" + $security.sha256("agent:" + runId + ":" + stepIndex)
        var effectArgsHash = $security.sha256(invInputStr)
        try {
          var effectClaim = $app.db().newQuery(
            "INSERT INTO agent_studio_side_effects(" +
              "kind,run_id,step_key,tool_name,args_hash,idempotency_key,status,result_text,created_ms,updated_ms) " +
            "VALUES ('agent',{:rid},{:step},{:tool},{:hash},{:key},'started','',{:now},{:now}) " +
            "ON CONFLICT(kind,run_id,step_key) DO NOTHING"
          ).bind({
            rid: runId, step: String(stepIndex), tool: toolName,
            hash: effectArgsHash, key: effectKey, now: new Date().getTime(),
          }).execute()
          if (Number(effectClaim.rowsAffected()) === 1) {
            effectClaimed = true
          } else {
            var priorEffect = new DynamicModel({ status: "", tool_name: "", args_hash: "", result_text: "" })
            $app.db().newQuery(
              "SELECT status, tool_name, args_hash, result_text FROM agent_studio_side_effects " +
              "WHERE kind = 'agent' AND run_id = {:rid} AND step_key = {:step}"
            ).bind({ rid: runId, step: String(stepIndex) }).one(priorEffect)
            if (priorEffect.status === "succeeded" && priorEffect.tool_name === toolName && priorEffect.args_hash === effectArgsHash) {
              effectCached = true
              effectCachedOutput = String(priorEffect.result_text || "")
            } else {
              effectUnknown = "write_outcome_unknown：此步外部写操作已尝试，但结果未确认或输入发生变化；为防止重复写入，请人工核查外部系统"
            }
          }
        } catch (effectErr) {
          effectUnknown = "write_journal_unavailable：写操作审计暂不可用，已拒绝向外部系统发送写请求"
          logErr("side effect journal acquire", effectErr)
        }
      }
      if (effectUnknown) {
        seq++
        addEvent(runId, stepIndex, seq, "error", { message: effectUnknown, tool: toolName })
        persistStats()
        finishRun(runId, "failed", "", effectUnknown, stepIndex, seq, "写操作结果不明确，已停止自动重放")
        return
      }

      var toolT0 = new Date().getTime()
      var attempts = stepExecutor.executeWithRetry(toolPolicy, execToolOnce,
        effectCached ? { output: effectCachedOutput, toolErr: "", retryable: false } : null)
      var toolRetried = attempts.retried
      var attemptFinal = attempts.result
      var output = String(attemptFinal.output || "")
      var toolErr = String(attemptFinal.toolErr || "")
      if (effectClaimed) {
        try {
          $app.db().newQuery(
            "UPDATE agent_studio_side_effects SET status = {:status}, result_text = {:output}, " +
              "updated_ms = {:now} WHERE kind = 'agent' AND run_id = {:rid} AND step_key = {:step} " +
              "AND idempotency_key = {:key} AND status = 'started'"
          ).bind({
            status: toolErr ? "unknown" : "succeeded",
            output: toolErr ? "" : sanitizeFinalSecrets(output).slice(0, 2000),
            now: new Date().getTime(), rid: runId, step: String(stepIndex), key: effectKey,
          }).execute()
        } catch (effectDoneErr) {
          logErr("side effect journal update", effectDoneErr)
          // A successful remote write without a durable result is deliberately not replayed.
        }
      }
      if (effectNeeded && toolErr) {
        var uncertainWriteError = "write_outcome_unknown：外部工具调用结果不明（可能涉及写入或其他副作用），为避免重复操作已禁止自动重试。请核查连接与目标系统后再决定是否新建任务。详情：" + toolErr
        seq++
        addEvent(runId, stepIndex, seq, "error", { message: uncertainWriteError.slice(0, 450), tool: toolName })
        persistStats()
        finishRun(runId, "failed", "", uncertainWriteError.slice(0, 500), stepIndex, seq, "外部工具调用结果不明，已停止自动重试")
        return
      }

      if (!toolErr) evidenceRefs = evidenceService.collect(
        evidenceRefs, toolName, toolInput, output, stepIndex)

      var toolLatency = new Date().getTime() - toolT0
      var invKind = marketToolMap[toolName] || customConns[toolName] || customToolNames.indexOf(toolName) >= 0 ? "external" : "builtin"
      var invStatus = toolErr ? "failed" : toolRetried ? "retried_success" : "success"
      var invErrCode = ""
      if (toolErr) {
        var codeMatch = toolErr.match(/^[a-z][a-z0-9_]+/)
        invErrCode = codeMatch ? codeMatch[0] : "tool_error"
      }
      statsBump("tool_calls", 1)
      if (toolRetried) statsBump("retries", 1)
      writeInvocation(uid, toolName, invKind, "agent_run", runId, invStatus, toolLatency,
        audit.excerpt(toolInput, 500), audit.excerpt(toolErr ? toolErr : output, 1000), invErrCode, toolRetried)
      // One metadata-only span per logical tool call (including a retry if performed).
      // Never store the tool input, output, credentials or arbitrary error text in traces.
      try {
        require(__hooks + "/modules/execution_trace.js").record($app, {
          owner: uid, runId: runId, kind: "agent",
          spanId: $security.randomString(15), stepRef: String(stepIndex),
          operation: "tool", status: toolErr ? "failed" : "succeeded",
          errorCode: invErrCode || "tool_error", durationMs: toolLatency,
        })
      } catch (_) {}


      if (toolErr) {
        seq++
        addEvent(runId, stepIndex, seq, "error", {
          tool: toolName,
          message: "工具执行失败：" + audit.excerpt(toolErr, 300) + (toolRetried ? "（已自动重试 1 次仍失败）" : ""),
          retried: toolRetried,
          thought: thought.slice(0, 200),
          action: "tool:" + toolName + " " + audit.excerpt(toolInput, 200),
          observation: ("工具执行失败：" + audit.excerpt(toolErr, 200)).slice(0, 240),
        })
        pushStepAndSave({ thought: thought.slice(0, 200), action: "tool_error", tool: toolName, obs: ("工具执行失败：" + audit.excerpt(toolErr, 180) + (toolRetried ? "（已重试 1 次）" : "")).slice(0, 240) }, 0)
      } else {
        seq++
        addEvent(runId, stepIndex, seq, "tool_result", {
          tool: toolName,
          output: audit.excerpt(output, 2000),
          retried: toolRetried,
          thought: thought.slice(0, 200),
          action: "tool:" + toolName + " " + audit.excerpt(toolInput, 200),
          observation: audit.excerpt(output, 240),
        })
        pushStepAndSave({ thought: thought.slice(0, 200), action: "tool", tool: toolName, obs: audit.excerpt(output, 280) }, 0)
      }

      if (doneSteps + 1 >= maxSteps) {
        finishRun(runId, "failed", "", "已达最大步数上限（" + maxSteps + " 步），未产出最终结果", stepIndex, seq, "预算耗尽，运行终止")
      }
    }

    // —— tick 入口：认领（防重叠）→ 执行一步 ——
    var status0 = String(run.get("status"))
    if (status0 !== "running") {
      return e.json(200, { ok: true, run_id: id, status: status0, stepped: false })
    }
    var leaseToken = $security.randomString(40)
    var admission = null
    try {
      admission = runLifecycle.enter($app, executionGuard, {
        kind: "agent", runId: id, owner: uid, token: leaseToken,
        workerInstance: require(__hooks + "/modules/harness_worker_identity.js").resolve(
          h, String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || ""),
          $os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") === "true"),
        loadCheckpoint: function (r) { return loadJson(r, "checkpoint") },
        classifyFailure: function (reason) {
          return require(__hooks + "/modules/harness_failure_triage.js")
            .diagnose(reason, { kind: "agent", stage: "runtime" })
        },
      })
    } catch (leaseErr) {
      try { $app.logger().error("agent execution admission failed", "err", String(leaseErr)) } catch (_) {}
      return e.json(503, { error: "execution_lease_unavailable", message: "执行租约暂不可用，已禁止非原子回退" })
    }
    if (!admission.acquired) {
      return e.json(200, runLifecycle.response(id, "running", { busy: true }))
    }
    try {
    if (admission.deadlineExceeded) {
      addEvent(id, 0, Number(admission.checkpoint.seq || 0) + 1, "status",
        { message: "run_runtime_deadline_exceeded：本次任务运行总时限已达到" })
      return e.json(200, runLifecycle.response(id, "failed", { deadlineExceeded: true }))
    }
    // Recover a cancellation request persisted by a prior worker before starting
    // any new model/tool step. Re-read the checkpoint under the active lease fence.
    if (admission.checkpoint && admission.checkpoint.cancel_requested === true) {
      var cancelAppliedBeforeStep = false
      executionGuard.mutate($app, "agent", id, uid, leaseToken, function (tx, cancelRun) {
        var cancelCp = loadJson(cancelRun, "checkpoint")
        if (cancelCp.cancel_requested === true) {
          cancelCp.cancel_requested = false
          cancelCp.pause_requested = false
          cancelCp.pending_input = null
          cancelCp.pending_approval = null
          cancelCp.approval_decision = ""
          cancelCp.claim_until = 0
          cancelRun.set("checkpoint", cancelCp)
          cancelRun.set("status", "cancelled")
          cancelRun.set("error", "用户手动取消")
          tx.save(cancelRun)
          cancelAppliedBeforeStep = true
        }
      })
      if (cancelAppliedBeforeStep) {
        addEvent(id, Number(admission.checkpoint.done_steps || 0), 0, "status",
          { message: "取消请求已生效，任务已停止；未启动新的执行步骤" })
        return e.json(200, { ok: true, run_id: id, status: "cancelled", stepped: false, cancel_requested: false })
      }
    }
    // Apply a pause requested during the previous tick only after that tick
    // released its execution lease and committed the completed step.
    if (admission.checkpoint && admission.checkpoint.pause_requested === true) {
      var pauseApplied = false
      try {
        executionGuard.mutate($app, "agent", id, uid, leaseToken, function (tx, pauseRun) {
          var pauseCp = loadJson(pauseRun, "checkpoint")
          if (pauseCp.pause_requested === true) {
            pauseCp.pause_requested = false
            pauseCp.claim_until = 0
            pauseRun.set("checkpoint", pauseCp)
            pauseRun.set("status", "paused")
            tx.save(pauseRun)
            pauseApplied = true
          }
        })
      } catch (pauseErr) {
        var latestPauseRun = null
        try { latestPauseRun = $app.findRecordById("agent_runs", id) } catch (_) {}
        if (latestPauseRun && String(latestPauseRun.get("status") || "") !== "running") {
          return e.json(200, { ok: true, run_id: id, status: String(latestPauseRun.get("status")), stepped: false })
        }
        throw pauseErr
      }
      if (pauseApplied) {
        addEvent(id, Number(admission.checkpoint.done_steps || 0), 0, "status",
          { message: "当前步骤已完成并保存检查点，暂停请求已生效；恢复后从下一步继续" })
        return e.json(200, { ok: true, run_id: id, status: "paused", stepped: false, pause_requested: false })
      }
    }
    var stepFailed = false
    var stepStoppedBeforeRetry = false
    try {
      executeStep(id)
    } catch (err) {
      var diagnostic = String((err && (err.code || err.message)) || "execution_step_failed")
      if (diagnostic === "execution_stop_requested") {
        // A previously accepted cancel/pause interrupts the NEXT attempt,
        // not an external HTTP request already in flight. Preserve the
        // checkpoint stop flag so cooperative cancellation (below) or the
        // next tick's pause boundary can apply it without falsely failing.
        stepStoppedBeforeRetry = true
        try {
          addEvent(id, 0, 0, "status", {
            message: "执行期间收到停止请求，已阻止新的模型/工具重试",
          })
        } catch (_) {}
      } else {
        stepFailed = true
        try {
          $app.logger().error("agent tick step error", "err", diagnostic.slice(0, 140))
        } catch (_) {}
        // Do not silently return a successful Tick after an uncommitted step.
        // A stolen lease / cancelled run must not be overwritten by this worker.
        try {
          executionGuard.mutate($app, "agent", id, uid, leaseToken, function (tx, r2) {
            var cp2 = loadJson(r2, "checkpoint")
            cp2.claim_until = 0
            cp2.pause_requested = false
            cp2.cancel_requested = false
            cp2.seq = Number(cp2.seq || 0) + 1
            cp2.failure_diagnostic = require(__hooks + "/modules/harness_failure_triage.js")
              .diagnose(diagnostic, { kind: "agent", stage: "worker",
                stepRef: String(r2.get("current_step") || 0), seq: cp2.seq })
            r2.set("checkpoint", cp2)
            r2.set("status", "failed")
            r2.set("error", "execution_step_failed: see sanitized worker diagnostics")
            tx.save(r2)
          })
        } catch (_) { /* stale worker cannot replace the current owner */ }
      }
    }
    // A cancellation requested while a step was in flight is applied only after
    // that step has persisted its result. Waiting states are safe stop boundaries:
    // ask_user/approval have already returned without executing another tool.
    var cancelAppliedAfterStep = false
    if (!stepFailed) {
      try {
        executionGuard.mutateStatuses($app, "agent", id, uid, leaseToken,
          ["running", "awaiting_input", "awaiting_approval"], function (tx, cancelRun) {
            var cancelCp = loadJson(cancelRun, "checkpoint")
            if (cancelCp.cancel_requested === true) {
              cancelCp.cancel_requested = false
              cancelCp.pause_requested = false
              cancelCp.pending_input = null
              cancelCp.pending_approval = null
              cancelCp.approval_decision = ""
              cancelCp.claim_until = 0
              cancelRun.set("checkpoint", cancelCp)
              cancelRun.set("status", "cancelled")
              cancelRun.set("error", "用户手动取消")
              tx.save(cancelRun)
              cancelAppliedAfterStep = true
            }
          })
      } catch (cancelBoundaryErr) {
        var latestCancelRun = null
        try { latestCancelRun = $app.findRecordById("agent_runs", id) } catch (_) {}
        var latestCancelStatus = String(latestCancelRun && latestCancelRun.get("status") || "")
        // Terminal results or a route-committed cancellation win over stale work.
        if (["succeeded", "failed", "cancelled", "paused", "queued"].indexOf(latestCancelStatus) < 0 &&
            latestCancelStatus !== "awaiting_input" && latestCancelStatus !== "awaiting_approval") {
          throw cancelBoundaryErr
        }
      }
      if (cancelAppliedAfterStep) {
        addEvent(id, Number(admission.checkpoint.done_steps || 0), 0, "status",
          { message: "当前步骤已安全收尾并保存检查点，取消请求已生效；后续步骤未执行" })
      }
    }
    var after = null
    try {
      after = $app.findRecordById("agent_runs", id)
    } catch (_) {}
    var afterCheckpoint = after ? loadJson(after, "checkpoint") : {}
    return e.json(200, {
      ok: true,
      run_id: id,
      status: after ? String(after.get("status")) : "running",
      stepped: !stepFailed && !stepStoppedBeforeRetry,
      cancel_requested: afterCheckpoint.cancel_requested === true,
      error: stepFailed ? "execution_step_failed" : undefined,
    })
    } finally {
      try {
        runLifecycle.leave($app, executionGuard, { kind: "agent", runId: id, owner: uid, token: leaseToken })
      } catch (leaseReleaseErr) {
        try { $app.logger().error("agent execution lease release failed", "err", String(leaseReleaseErr)) } catch (_) {}
      }
    }
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent tick route error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/agent-runs/start", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub 后再发起运行" })
    var body = (e.requestInfo() || {}).body || {}
    var specId = String(body.spec_id || "").trim()
    var instruction = String(body.instruction || "").trim()
    if (!specId || !instruction) return e.json(400, { error: "bad_request", message: "缺少助手方案或任务指令" })
    var scheduledRunId = String(body.scheduled_run_id || "")
    var scheduleOccurrenceId = String(body.schedule_occurrence_id || "")
    var workerSupplied = String(h["x_agent_studio_worker_token"] || h["X-Agent-Studio-Worker-Token"] || h["x-agent-studio-worker-token"] || "")
    if(workerSupplied && (!scheduledRunId || !scheduleOccurrenceId))
      return e.json(403, {error:"schedule_internal_only"})
    if (scheduledRunId || scheduleOccurrenceId) {
      var expectedWorkerToken = String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "")
      var receivedWorkerToken = String(h["x_agent_studio_worker_token"] || h["X-Agent-Studio-Worker-Token"] || h["x-agent-studio-worker-token"] || "")
      var workerDiff = expectedWorkerToken.length ^ receivedWorkerToken.length
      for (var wi = 0; wi < expectedWorkerToken.length; wi++) {
        workerDiff |= expectedWorkerToken.charCodeAt(wi) ^ (wi < receivedWorkerToken.length ? receivedWorkerToken.charCodeAt(wi) : 0)
      }
      if ($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") !== "true" || expectedWorkerToken.length < 32 || workerDiff !== 0) {
        return e.json(403, { error: "schedule_internal_only" })
      }
      if (!/^[a-f0-9]{15}$/.test(scheduledRunId) || !/^[a-f0-9]{20}$/.test(scheduleOccurrenceId)) {
        return e.json(400, { error: "invalid_schedule_run_id" })
      }
      var scheduledLink = new DynamicModel({ id: "", run_id: "" })
      try {
        $app.db().newQuery(
          "SELECT o.id,o.run_id FROM agent_studio_schedule_occurrences o " +
          "JOIN agent_studio_schedules s ON s.id=o.schedule_id WHERE o.id={:oid} AND o.run_id={:rid} " +
          "AND o.rh_user_id={:uid} AND o.status='launching' AND o.schedule_revision=s.revision " +
          "AND s.target_kind={:kind} AND s.target_id={:target} AND s.deleted=0"
        ).bind({ oid: scheduleOccurrenceId, rid: scheduledRunId, uid: uid,
          kind: "agent", target: specId }).one(scheduledLink)
      } catch (_) { return e.json(403, { error: "schedule_link_not_authorized" }) }
      try {
        var alreadyStarted = $app.findRecordById("agent_runs", scheduledRunId)
        if (alreadyStarted && String(alreadyStarted.get("rh_user_id") || "") === uid &&
            String(alreadyStarted.get("spec_id") || "") === specId) {
          return e.json(200, { ok: true, run_id: scheduledRunId, status: String(alreadyStarted.get("status") || "running"), deduplicated: true })
        }
      } catch (_) {}
    }

    var MODEL_IDS = {
      "claude-opus-4.8": "anthropic/claude-opus-4.8",
      "claude-opus-4.7": "anthropic/claude-opus-4.7",
      "qwen3.7-max": "qwen/qwen3.7-max",
    }
    var cfgIn0 = body.config || {}
    var customIn = cfgIn0.custom_model || null
    var isCustomModel = Boolean(customIn && customIn.connection_id && customIn.model_id)
    var modelShort = String(body.model || "claude-opus-4.8")
    var customConnRec = null
    if (isCustomModel) {
      try {
        customConnRec = $app.findRecordById("model_connections", String(customIn.connection_id))
      } catch (_) {}
      if (!customConnRec || String(customConnRec.get("rh_user_id") || "") !== uid) {
        return e.json(404, { error: "connection_not_found", message: "自定义模型连接不存在或无权使用" })
      }
      var connEnabled0 = false
      try {
        connEnabled0 = customConnRec.getBool("enabled")
      } catch (_) {}
      if (!connEnabled0) return e.json(400, { error: "connection_disabled", message: "该模型连接已停用，请先在「模型连接」页启用" })
      modelShort = "custom:" + String(customIn.model_id).slice(0, 80)
    } else if (!MODEL_IDS[modelShort]) {
      return e.json(400, { error: "bad_model", message: "暂不支持该模型，请从列表中选择" })
    }
    var specRec = null
    try {
      specRec = $app.findRecordById("agent_specs", specId)
    } catch (_) {}
    if (!specRec) return e.json(404, { error: "spec_not_found", message: "助手方案不存在或已删除" })
    if (String(specRec.get("rh_user_id") || "") !== uid) return e.json(404, { error: "spec_not_found" })
    var specVal = specRec.get("spec")
    var specObj = specVal
    if (typeof specVal === "string") {
      try {
        specObj = JSON.parse(specVal)
      } catch (_) {
        specObj = {}
      }
    }
    if (!specObj || typeof specObj !== "object") specObj = {}
    // PocketBase JSON fields can return opaque JsonRaw wrappers from get().
    try {
      var snapText=String(specRec.getString("spec")||"")
      var snapParsed=JSON.parse(snapText)
      if(snapParsed&&typeof snapParsed==="object"&&!Array.isArray(snapParsed))
        specObj=snapParsed
    }catch(_) {}

    var startRoleService = require(__hooks + "/modules/agent_roles.js")
    var startRolePlan = startRoleService.validatePlan(specObj.roles, specObj.tools)
    if (!startRolePlan.valid) return e.json(400, {
      error: "invalid_agent_roles", message: "请先完善角色分工：" + startRolePlan.errors.join("；"),
    })

    // 结果脱敏（与 tick 端同规则，回调内 self-contained）：记忆内容落库前抹疑似钥匙
    // Explicitly link a retest to one accepted feedback-driven version.
    // Reject forged IDs and any later Agent edit that invalidates the version.
    // No lineage is inferred merely from timestamps or matching feedback text.
    var optimizationLineageId=String((body.config||{}).optimization_lineage_id||"").trim()
    if(optimizationLineageId){
      if(!/^[A-Za-z0-9]{15}$/.test(optimizationLineageId))
        return e.json(400,{error:"invalid_optimization_lineage"})
      var trace=new DynamicModel({id:"",after_hash:""})
      try{
        $app.db().newQuery(
          "SELECT id,after_hash FROM agent_optimization_lineage "+
          "WHERE id={:audit} AND spec_id={:spec} AND owner_uid={:owner}"
        ).bind({audit:optimizationLineageId,spec:specId,owner:uid}).one(trace)
      }catch(_){return e.json(404,{error:"optimization_lineage_not_found"})}
      var currentHash=String($security.sha256(JSON.stringify(specObj)))
      if(String(trace.after_hash)!==currentHash)
        return e.json(409,{error:"optimization_spec_changed",
          message:"优化后方案已再次修改，请重新核对版本后试跑"})
    }

    var sanitizeSecretsLocal = function (s) {
      return String(s || "")
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, "***")
        .replace(/Bearer\s+\S+/g, "Bearer ***")
        .replace(/token=\S+/g, "token=***")
        .replace(/api_key=\S+/g, "api_key=***")
    }

    // —— 显式「记住」指令：命中「记住：X / 记住: X / 请记住 X / 帮我记住 X」（指令开头或独立行）
    // 时提取 X（≤500 字符，脱敏）立即写一条 kind=user 长期记忆（run_id 空），run 创建后写
    // memory_saved 事件；X 之外的剩余文本作为任务照常执行，整条只有记住内容时按该内容规划 ——
    var rememberSavedFact = ""
    try {
      // 内容取到行尾或句读为止（「记住：X。剩余任务」按独立句拆出 X，剩余照常执行）
      var rememberMatch = instruction.match(/(?:^|\n)[ \t]*(?:请|麻烦)?(?:帮我)?记住[ \t]*[:：]?[ \t]*([^。；;\n！!？?]+)/)
      if (!scheduledRunId && rememberMatch && rememberMatch[1]) {
        var rememberText = sanitizeSecretsLocal(String(rememberMatch[1]).trim()).slice(0, 500)
        if (rememberText) {
          var rememberCol = $app.findCollectionByNameOrId("agent_memories")
          var rememberRec = new Record(rememberCol)
          rememberRec.set("rh_user_id", uid)
          rememberRec.set("spec_id", specId)
          rememberRec.set("fact", rememberText)
          rememberRec.set("tools_used", "")
          rememberRec.set("run_id", "")
          rememberRec.set("kind", "user")
          $app.save(rememberRec)
          rememberSavedFact = rememberText
          var restInstruction = instruction
            .replace(String(rememberMatch[0] || ""), "")
            .replace(/^[。；;\s，,]+/, "")
            .trim()
          instruction = restInstruction ? restInstruction : rememberText
        }
      }
    } catch (rememberErr) {
      try {
        $app.logger().error("agent start remember parse error", "err", String((rememberErr && rememberErr.message) || rememberErr))
      } catch (_) {}
    }

    var cfgIn = body.config || {}
    var toolsIn = cfgIn.tools || {}
    var maxSteps = parseInt(cfgIn.max_steps, 10)
    if (isNaN(maxSteps) || maxSteps < 1) maxSteps = 10
    if (maxSteps > 30) maxSteps = 30
    if (startRolePlan.orderedRoles.length > maxSteps) return e.json(400, {
      error: "role_budget_too_small", message: "当前有 " + startRolePlan.orderedRoles.length + " 个角色阶段，最大步数至少需要相同数量，并为工具调用预留额外步数。",
    })
    var normalizedBudget = require(__hooks + "/modules/harness_budget.js").normalize(maxSteps, cfgIn.max_model_calls)
    if (!normalizedBudget.ok) return e.json(400, { error: normalizedBudget.error, message: "模型调用预算必须是 1 至 100 的整数" })
    var runtimeDeadline = require(__hooks + "/modules/harness_run_lifecycle.js")
      .deadlineFromMinutes(cfgIn.max_runtime_minutes, new Date().getTime())
    if (!runtimeDeadline.ok)
      return e.json(400, { error: runtimeDeadline.error, message: "任务最长运行时间需为 1-1440 分钟，或留空禁用" })
    // MCP tool selection is authored in the owned AgentSpec, not in an
    // untrusted run-start body. Empty list means no marketplace tool is granted.
    var marketSelections = []
    var selectedIds = {}
    var specToolNames = Array.isArray(specObj.tools) ? specObj.tools : []
    for (var smi = 0; smi < specToolNames.length && marketSelections.length < 60; smi++) {
      var smt = String(specToolNames[smi] || "").trim()
      if (!/^mkt__[A-Za-z0-9]{15}__[A-Za-z0-9_./:-]{1,120}$/.test(smt) || selectedIds[smt]) continue
      selectedIds[smt] = true
      marketSelections.push(smt)
    }
    var config = {
      tools: {
        calculate: toolsIn.calculate === true,
        summarize: toolsIn.summarize === true,
        knowledge_search: toolsIn.knowledge_search === true,
        web_fetch: toolsIn.web_fetch === true,
        web_search: toolsIn.web_search === true,
      },
      max_steps: maxSteps,
      max_model_calls: normalizedBudget.max_model_calls,
      max_runtime_minutes: runtimeDeadline.minutes,
      stop_condition: String(cfgIn.stop_condition || "").slice(0, 500),
      stop_on_complete: cfgIn.stop_on_complete !== false,
      require_approval: cfgIn.require_approval === true,
      require_plan_review: cfgIn.require_plan_review === true ||
        (cfgIn.require_plan_review === undefined && specObj.require_plan_review === true),
      market_tool_ids: marketSelections,
      source: String(cfgIn.source || "").slice(0, 40) || null,
      optimization_lineage_id: optimizationLineageId || null,
      custom_model: isCustomModel
        ? {
            connection_id: String(customIn.connection_id),
            model_id: String(customIn.model_id).slice(0, 200),
            connection_name: String(customConnRec.getString("name") || "").slice(0, 100),
          }
        : null,
    }

    // —— 外部工具连接：方案 spec.tools 里的工具名与当前用户已启用的连接精确匹配时自动授权，
    // 写进 config.tools（tick 端据此放行并代理真实调用）；内置三件套仍以前端勾选为准 ——
    try {
      // json 字段 record.get() 读回可能是 JsonRaw（属性访问全 undefined），getString 优先
      var specScanObj = null
      var specScanStr = ""
      try {
        specScanStr = specRec.getString("spec")
      } catch (_) {}
      if (specScanStr) {
        try {
          specScanObj = JSON.parse(specScanStr)
        } catch (_) {}
      }
      if (!specScanObj || typeof specScanObj !== "object") specScanObj = specObj
      var specToolArr = (specScanObj && specScanObj.tools) || []
      if (specToolArr && typeof specToolArr.length === "number" && specToolArr.length > 0) {
        var BUILTIN_NAMES = { calculate: 1, summarize: 1, knowledge_search: 1, web_fetch: 1, web_search: 1 }
        var enabledConnRows = $app.findRecordsByFilter(
          "tool_connections",
          "rh_user_id = {:uid} && enabled = true",
          "-created",
          100,
          0,
          { uid: uid }
        )
        var enabledConnNames = {}
        for (var eci = 0; eci < enabledConnRows.length; eci++) {
          var ecName = ""
          try {
            ecName = String(enabledConnRows[eci].getString("name") || "")
          } catch (_) {}
          if (ecName) enabledConnNames[ecName] = true
        }
        var customAdded = 0
        for (var sti = 0; sti < specToolArr.length && customAdded < 10; sti++) {
          var stName = String(specToolArr[sti] || "").trim().slice(0, 100)
          if (!stName || BUILTIN_NAMES[stName]) continue
          if (enabledConnNames[stName] && config.tools[stName] === undefined) {
            config.tools[stName] = true
            customAdded++
          }
        }
      }
    } catch (stErr) {
      try {
        $app.logger().error("agent start tool_connections scan error", "err", String((stErr && stErr.message) || stErr))
      } catch (_) {}
    }

    // —— 跨运行记忆检索：按指令与 fact 的分词重叠度取 top3 过往成功经验（重叠 0 不注入），
    // 存进 config.memory_hints，tick 端拼入规划 system prompt「同方案过往经验」段 ——
    var memoryHints = []
    var memoryInjected = []
    try {
      var tokenize0 = function (text0) {
        var lower0 = String(text0 || "").toLowerCase()
        var toks0 = {}
        var words0 = lower0.split(/[^0-9a-z一-鿿]+/)
        for (var wi0 = 0; wi0 < words0.length; wi0++) {
          var w0 = words0[wi0]
          if (!w0) continue
          if (/^[0-9a-z]+$/.test(w0)) {
            if (w0.length >= 2) toks0[w0] = true
          } else {
            // 中文按相邻双字切分，短词才有可比对的重叠信号
            if (w0.length === 1) toks0[w0] = true
            for (var bi0 = 0; bi0 + 1 < w0.length; bi0++) toks0[w0.substring(bi0, bi0 + 2)] = true
          }
        }
        return toks0
      }
      var instrToks0 = tokenize0(instruction)
      var memRows0 = $app.findRecordsByFilter(
        "agent_memories",
        "rh_user_id = {:uid} && spec_id = {:sid}",
        "-created",
        50,
        0,
        { uid: uid, sid: specId }
      )
      var memScored0 = []
      for (var mi0 = 0; mi0 < memRows0.length; mi0++) {
        var mFact0 = ""
        try {
          mFact0 = String(memRows0[mi0].getString("fact") || "")
        } catch (_) {}
        if (!mFact0) continue
        var mToks0 = tokenize0(mFact0)
        var mScore0 = 0
        for (var tk0 in mToks0) {
          if (instrToks0[tk0]) mScore0++
        }
        if (mScore0 > 0) {
          var mTools0 = ""
          try {
            mTools0 = String(memRows0[mi0].getString("tools_used") || "")
          } catch (_) {}
          // 三类记忆同池排序：kind 空（存量）视为 fact；hint 前缀带类型标签供规划区分对待
          var mKind0 = ""
          try {
            mKind0 = String(memRows0[mi0].getString("kind") || "")
          } catch (_) {}
          if (mKind0 !== "user" && mKind0 !== "lesson") mKind0 = "fact"
          var mKindLabel0 = mKind0 === "user" ? "用户指令" : mKind0 === "lesson" ? "教训" : "经验"
          memScored0.push({
            score: mScore0,
            id: String(memRows0[mi0].id),
            kind: mKind0,
            fact_preview: mFact0.slice(0, 120),
            hint: "【" + mKindLabel0 + "】" + mFact0.slice(0, 300) + (mTools0 ? "（当时用过工具：" + mTools0.slice(0, 100) + "）" : ""),
          })
        }
      }
      memScored0.sort(function (x1, y1) {
        return y1.score - x1.score
      })
      for (var mj0 = 0; mj0 < memScored0.length && mj0 < 3; mj0++) {
        memoryHints.push(memScored0[mj0].hint)
        memoryInjected.push({ id: memScored0[mj0].id, fact: memScored0[mj0].fact_preview, kind: memScored0[mj0].kind })
      }
    } catch (memQErr) {
      try {
        $app.logger().error("agent start memory lookup error", "err", String((memQErr && memQErr.message) || memQErr))
      } catch (_) {}
    }
    config.memory_hints = memoryHints
    config.memory_injected = memoryInjected

    var col = $app.findCollectionByNameOrId("agent_runs")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("spec_id", specId)
    if (scheduledRunId) rec.set("id", scheduledRunId)
    rec.set("spec_name", String(specRec.get("name") || "未命名助手"))
    rec.set("instruction", instruction.slice(0, 2000))
    rec.set("status", "running")
    rec.set("current_step", 0)
    rec.set("max_steps", maxSteps)
    rec.set("model", modelShort)
    rec.set("config", config)
    rec.set("spec_snapshot", specObj)
    rec.set("result", "")
    rec.set("error", "")
    rec.set("checkpoint", {
      steps: [],
      seq: 1,
      claim_until: 0,
      done_steps: 0,
      execution_deadline_ms: runtimeDeadline.deadline_ms,
      parse_failures: 0,
      harness_stats: { llm_calls: 0, est_prompt_chars: 0, est_out_chars: 0, tool_calls: 0, retries: 0, compressions: 0, approvals: 0 },
      evidence_refs: [],
      call_sig_recent: [],
      pending_approval: null,
      pending_input: null,
      plan_review_confirmed: false,
      approval_decision: "",
      approved_step: 0,
      role_state: startRoleService.stateFor(startRolePlan.orderedRoles, null),
    })
    $app.save(rec)

    var evCol = $app.findCollectionByNameOrId("run_events")
    var ev = new Record(evCol)
    ev.set("run_id", String(rec.id))
    ev.set("step_index", 0)
    ev.set("seq", 1)
    ev.set("event_type", "status")
    ev.set("content", { message: "任务已创建，执行引擎开始逐步运行" })
    $app.save(ev)

    // —— 记忆透明化：本次实际注入的长期记忆与显式「记住」的内容都落成事件，供时间线展示；
    // 事件挂在 step_index=0（tick 端事件从 step 1 起，seq 不冲突），无注入则不写 ——
    var memEvSeq = 2
    if (memoryInjected.length > 0) {
      var injEv = new Record(evCol)
      injEv.set("run_id", String(rec.id))
      injEv.set("step_index", 0)
      injEv.set("seq", memEvSeq)
      injEv.set("event_type", "memory_injected")
      injEv.set("content", {
        message: "本次参考了 " + memoryInjected.length + " 条长期记忆",
        count: memoryInjected.length,
        items: memoryInjected,
      })
      $app.save(injEv)
      memEvSeq++
    }
    if (rememberSavedFact) {
      var savEv = new Record(evCol)
      savEv.set("run_id", String(rec.id))
      savEv.set("step_index", 0)
      savEv.set("seq", memEvSeq)
      savEv.set("event_type", "memory_saved")
      savEv.set("content", {
        message: "已存入长期记忆（用户指令）",
        kind: "user",
        fact_preview: rememberSavedFact.slice(0, 120),
      })
      $app.save(savEv)
    }

    return e.json(200, { ok: true, run_id: String(rec.id), status: "running" })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent start error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/agent-runs/{id}/pause", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var outcome = { httpStatus: 200, runStatus: "", pauseRequested: false, step: 0, message: "" }
    // Serialize pause against execution-lease admission. If a tick is already
    // in flight, request a cooperative pause instead of invalidating its lease.
    $app.runInTransaction(function (tx) {
      var run = null
      try { run = tx.findRecordById("agent_runs", id) } catch (_) {}
      if (!run) {
        outcome.httpStatus = 404
        outcome.error = "run_not_found"
        outcome.message = "运行记录不存在"
        return
      }
      if (String(run.get("rh_user_id") || "") !== uid) {
        outcome.httpStatus = 404
        outcome.error = "run_not_found"
        outcome.message = "运行记录不存在"
        return
      }
      var st = String(run.get("status") || "")
      if (st !== "running") {
        outcome.httpStatus = 409
        outcome.error = "bad_state"
        outcome.message = "当前状态（" + st + "）不能暂停"
        return
      }
      var cp = {}
      var cpStr = ""
      try { cpStr = run.getString("checkpoint") } catch (_) {}
      if (cpStr) {
        try {
          var parsed = JSON.parse(cpStr)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cp = parsed
        } catch (_) {}
      }
      if (cp.cancel_requested === true) {
        outcome.httpStatus = 409
        outcome.error = "cancel_pending"
        outcome.message = "任务正在取消，不能再请求暂停"
        return
      }
      var activeLease = new DynamicModel({ total: 0 })
      tx.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_run_leases " +
        "WHERE kind='agent' AND run_id={:rid} AND expires_ms > {:now}"
      ).bind({ rid: id, now: new Date().getTime() }).one(activeLease)
      outcome.step = Number(run.get("current_step")) || 0
      if (Number(activeLease.total || 0) > 0) {
        cp.pause_requested = true
        run.set("checkpoint", cp)
        outcome.runStatus = "running"
        outcome.pauseRequested = true
        outcome.message = "已收到暂停请求，当前步骤正在收尾；完成后将暂停"
      } else {
        cp.pause_requested = false
        cp.claim_until = 0
        run.set("checkpoint", cp)
        run.set("status", "paused")
        outcome.runStatus = "paused"
        outcome.pauseRequested = false
        outcome.message = "已暂停，当前没有正在执行的步骤"
      }
      tx.save(run)
    })
    if (outcome.httpStatus !== 200) {
      return e.json(outcome.httpStatus, { error: outcome.error, message: outcome.message })
    }
    var evCol = $app.findCollectionByNameOrId("run_events")
    var ev = new Record(evCol)
    ev.set("run_id", id)
    ev.set("step_index", outcome.step)
    ev.set("seq", 0)
    ev.set("event_type", "status")
    ev.set("content", { message: outcome.message })
    $app.save(ev)
    return e.json(200, {
      ok: true, run_id: id, status: outcome.runStatus, pause_requested: outcome.pauseRequested,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent pause error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/agent-runs/{id}/resume", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var run = null
    try {
      run = $app.findRecordById("agent_runs", id)
    } catch (_) {}
    if (!run) return e.json(404, { error: "run_not_found", message: "运行记录不存在" })
    if (String(run.get("rh_user_id") || "") !== uid) return e.json(404, { error: "run_not_found" })
    var st = String(run.get("status"))
    if (st !== "paused") return e.json(409, { error: "bad_state", message: "当前状态（" + st + "）不能恢复" })
    var cp = {}
    var cpStr = ""
    try {
      cpStr = run.getString("checkpoint")
    } catch (_) {
      cpStr = ""
    }
    if (cpStr) {
      try {
        var cpParsed = JSON.parse(cpStr)
        if (cpParsed && typeof cpParsed === "object" && !Array.isArray(cpParsed)) cp = cpParsed
      } catch (_) {}
    }
    cp.claim_until = 0
    if (cp.done_steps === undefined || cp.done_steps === null) cp.done_steps = Number(run.get("current_step")) || 0
    run.set("status", "running")
    run.set("checkpoint", cp)
    $app.save(run)
    var evCol = $app.findCollectionByNameOrId("run_events")
    var ev = new Record(evCol)
    ev.set("run_id", id)
    ev.set("step_index", Number(run.get("current_step")) || 0)
    ev.set("seq", 0)
    ev.set("event_type", "status")
    ev.set("content", { message: "已恢复，引擎从检查点继续执行" })
    $app.save(ev)
    return e.json(200, { ok: true, run_id: id, status: "running" })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent resume error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/agent-runs/{id}/cancel", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var outcome = { httpStatus: 200, runStatus: "", cancelRequested: false, step: 0, message: "" }
    $app.runInTransaction(function (tx) {
      var run = null
      try { run = tx.findRecordById("agent_runs", id) } catch (_) {}
      if (!run) {
        outcome.httpStatus = 404
        outcome.error = "run_not_found"
        outcome.message = "运行记录不存在"
        return
      }
      if (String(run.get("rh_user_id") || "") !== uid) {
        outcome.httpStatus = 404
        outcome.error = "run_not_found"
        outcome.message = "运行记录不存在"
        return
      }
      var st = String(run.get("status") || "")
      if (st === "succeeded" || st === "failed" || st === "cancelled") {
        outcome.httpStatus = 409
        outcome.error = "bad_state"
        outcome.message = "运行已结束（" + st + "），无需取消"
        return
      }
      var cp = {}
      var cpStr = ""
      try { cpStr = run.getString("checkpoint") } catch (_) {}
      if (cpStr) {
        try {
          var parsed = JSON.parse(cpStr)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cp = parsed
        } catch (_) {}
      }
      var activeLease = new DynamicModel({ total: 0 })
      tx.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_run_leases " +
        "WHERE kind='agent' AND run_id={:rid} AND expires_ms > {:now}"
      ).bind({ rid: id, now: new Date().getTime() }).one(activeLease)
      outcome.step = Number(run.get("current_step")) || 0
      // A running step owns the right to finish and persist its current result.
      // Waiting/paused/queued states have no in-flight side effect to protect.
      if (st === "running" && Number(activeLease.total || 0) > 0) {
        cp.cancel_requested = true
        run.set("checkpoint", cp)
        outcome.runStatus = "running"
        outcome.cancelRequested = true
        outcome.message = "已收到取消请求，当前步骤将先安全收尾；完成后停止后续执行"
      } else {
        cp.cancel_requested = false
        cp.pause_requested = false
        cp.pending_input = null
        cp.pending_approval = null
        cp.approval_decision = ""
        cp.claim_until = 0
        run.set("checkpoint", cp)
        run.set("status", "cancelled")
        run.set("error", "用户手动取消")
        outcome.runStatus = "cancelled"
        outcome.cancelRequested = false
        outcome.message = "已取消，后续步骤不会执行"
      }
      tx.save(run)
    })
    if (outcome.httpStatus !== 200) {
      return e.json(outcome.httpStatus, { error: outcome.error, message: outcome.message })
    }
    var evCol = $app.findCollectionByNameOrId("run_events")
    var ev = new Record(evCol)
    ev.set("run_id", id)
    ev.set("step_index", outcome.step)
    ev.set("seq", 0)
    ev.set("event_type", "status")
    ev.set("content", { message: outcome.message })
    $app.save(ev)
    return e.json(200, {
      ok: true, run_id: id, status: outcome.runStatus, cancel_requested: outcome.cancelRequested,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent cancel error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— 写操作审批门：awaiting_approval 状态下用户批准/拒绝一次待执行的工具调用 ——
// approve：checkpoint 记 approved_step，status 回 running，下次 tick 直接执行该调用；
// reject：写「用户拒绝了这次调用」observation 事件并标记跳过，下次 tick 把拒绝原因注入规划。
routerAdd("POST", "/api/agent-runs/{id}/approve", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] ||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录员工账号" })
    var body = (e.requestInfo() || {}).body || {}
    var decision = String(body.decision || "")
    if (decision !== "approve" && decision !== "reject")
      return e.json(400, { error: "bad_request", message: "decision 只支持 approve 或 reject" })
    var id = String(e.request.pathValue("id") || "")
    var status = 200
    var result = { ok: true, run_id: id, status: "running", decision: decision }
    try {
      $app.runInTransaction(function (tx) {
        // Atomic owner-bound reservation BEFORE checkpoint reads. Two tabs
        // cannot approve the same tool, even with concurrent HTTP requests.
        var claimed = tx.db().newQuery(
          "UPDATE agent_runs SET status='running' WHERE id={:id} "+
          "AND rh_user_id={:uid} AND status='awaiting_approval'"
        ).bind({ id: id, uid: uid }).execute()
        if (Number(claimed.rowsAffected()) !== 1) {
          var previous = null
          try { previous = tx.findRecordById("agent_runs", id) } catch (_) {}
          status = (!previous || String(previous.get("rh_user_id") || "") !== uid) ? 404 : 409
          result = status === 404
            ? { error: "run_not_found", message: "运行记录不存在" }
            : { error: "bad_state", message: "这次工具调用已被处理，请刷新任务状态" }
          return
        }
        var run = tx.findRecordById("agent_runs", id)
        var cp = {}
        try { cp = JSON.parse(run.getString("checkpoint") || "{}") || {} } catch (_) {}
        var pending = cp.pending_approval || null
        if (!pending || !pending.tool) throw new Error("missing_pending_approval")
        var pTool = String(pending.tool || "")
        var pStep = Number(pending.step_index || 0)
        var seq = Number(cp.seq || 0) + 1
        cp.seq = seq
        cp.claim_until = 0
        cp.approval_decision = decision
        if (decision === "approve") cp.approved_step = pStep
        run.set("status", "running")
        run.set("checkpoint", cp)
        tx.save(run)

        var ev = new Record(tx.findCollectionByNameOrId("run_events"))
        ev.set("run_id", id)
        ev.set("step_index", pStep)
        ev.set("seq", seq)
        ev.set("event_type", decision === "approve" ? "approval" : "observation")
        var content = decision === "approve"
          ? { message: "已批准，引擎将继续执行该调用：" + pTool,
              tool: pTool, decision: "approve", step_index: pStep }
          : { message: "用户拒绝了这次调用：" + pTool,
              tool: pTool, decision: "reject", step_index: pStep,
              observation: "用户拒绝了这次调用：" + pTool }
        ev.set("content", content)
        tx.save(ev)
      })
    } catch (transactionError) {
      if (String((transactionError && transactionError.message) || transactionError) === "missing_pending_approval")
        return e.json(409, { error: "missing_pending_approval", message: "未找到可审批的工具调用，请刷新任务" })
      throw transactionError
    }
    return e.json(status, result)
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("agent approve error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: "审批未确认，请刷新后重试", fingerprint: msg.slice(0, 80) })
  }
})

// —— 人工澄清续跑：只有处于 awaiting_input 且属于当前用户的任务允许回复 ——
// 用户回复进入持久化 checkpoint.steps，模型下一步可以引用澄清内容；重复提交返回 409。
routerAdd("POST", "/api/agent-runs/{id}/respond", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] ||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "auth_required", message: "请先登录员工账号" })
    var id = String(e.request.pathValue("id") || "")
    var body = (e.requestInfo() || {}).body || {}
    var answer = String(body.answer || "").trim()
    var decision = String(body.decision || "reply").trim()
    if (answer.length > 1600) return e.json(400, {
      error: "invalid_answer", message: "补充或修改说明最多 1600 字",
    })

    // IMPORTANT: reading status followed by save is NOT a concurrency guard.
    // Different browser tabs could accept the same pending checkpoint twice.
    // Acquire SQLite's write lock FIRST using an owner-scoped conditional UPDATE,
    // then read the checkpoint and persist both run and event in one transaction.
    // If the checkpoint/decision is invalid, throw to roll back the reservation.
    var state = 200
    var payload = { ok: true, run_id: id, status: "running" }
    try {
      $app.runInTransaction(function (tx) {
        var claim = tx.db().newQuery(
          "UPDATE agent_runs SET status='running' WHERE id={:id} "+
          "AND rh_user_id={:uid} AND status='awaiting_input'"
        ).bind({ id: id, uid: uid }).execute()
        if (Number(claim.rowsAffected()) !== 1) {
          var stale = null
          try { stale = tx.findRecordById("agent_runs", id) } catch (_) {}
          state = (!stale || String(stale.get("rh_user_id") || "") !== uid) ? 404 : 409
          payload = state === 404
            ? { error: "run_not_found" }
            : { error: "not_awaiting_input", message: "这一步已经被确认，请刷新查看当前任务" }
          return
        }
        var run = tx.findRecordById("agent_runs", id)
        var cp = {}
        try { cp = JSON.parse(run.getString("checkpoint") || "{}") || {} } catch (_) {}
        var pending = cp.pending_input || null
        if (!pending || !pending.question) throw new Error("missing_pending_input")
        var isReview = String(pending.kind || "") === "plan_review"
        if (isReview) {
          if (decision !== "approve" && decision !== "revise") throw new Error("invalid_review_decision")
          if (decision === "revise" && !answer) throw new Error("revision_required")
        } else if (decision !== "reply" || !answer) {
          throw new Error("invalid_answer")
        }
        var step = Number(pending.step_index || 0)
        var items = Array.isArray(cp.steps) ? cp.steps : []
        items.push({
          thought: isReview ? "用户已审阅阶段方案" : "用户已回复澄清问题",
          action: isReview ? (decision === "approve" ? "review_approved" : "review_revision") : "user_reply",
          obs: "【Agent 提问／提交的草案】" + String(pending.question).slice(0, 8000) +
            "\n【用户回复／确认】" + (isReview ?
              (decision === "approve" ? "草案已批准。补充意见：" + (answer || "无") :
                "草案不予批准，请按以下意见修改并再次提交审核：" + answer) : answer),
        })
        cp.steps = items.slice(-12)
        cp.done_steps = Math.max(Number(cp.done_steps || 0), step)
        if (isReview) cp.plan_review_confirmed = decision === "approve"
        cp.pending_input = null
        cp.claim_until = 0
        cp.parse_failures = 0
        cp.seq = Number(cp.seq || 0) + 1
        run.set("checkpoint", cp)
        run.set("current_step", cp.done_steps)
        run.set("status", "running")
        tx.save(run)

        var ev = new Record(tx.findCollectionByNameOrId("run_events"))
        ev.set("run_id", id)
        ev.set("step_index", step)
        ev.set("seq", cp.seq)
        ev.set("event_type", "input_received")
        ev.set("content", {
          message: isReview ?
            (decision === "approve" ? "方案草案已批准，继续制定落地计划" :
              "已收到修改意见，重新拟定草案") : "已收到补充信息，继续执行",
          answer: answer.slice(0, 1600),
          decision: decision,
          kind: isReview ? "plan_review" : "clarification",
          step_index: step,
        })
        tx.save(ev)
      })
    } catch (transactionError) {
      var reason = String((transactionError && transactionError.message) || transactionError)
      var known = {
        missing_pending_input: [409, "没有可回复的待确认问题，请刷新任务"],
        invalid_review_decision: [400, "请明确选择批准草案或提出修改意见"],
        revision_required: [400, "请填写需要修改的具体内容"],
        invalid_answer: [400, "请填写要回复的问题内容"],
      }
      var response = known[reason]
      if (response) return e.json(response[0], { error: reason, message: response[1] })
      throw transactionError
    }
    return e.json(state, payload)
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("agent input respond error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: "提交失败，请稍后重试", fingerprint: msg.slice(0, 80) })
  }
})

// —— 方案记忆（agent_memories）读取与删除：表由 MCP 装（仅 list 通用路由），
// 前端只走这两条带归属校验的手写路由 ——
routerAdd("GET", "/api/agent-memories", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var query = (e.requestInfo() || {}).query || {}
    var specId = String(query.spec_id || "").trim()
    var rows = []
    try {
      if (specId) {
        rows = $app.findRecordsByFilter("agent_memories", "rh_user_id = {:uid} && spec_id = {:sid}", "-created", 50, 0, { uid: uid, sid: specId })
      } else {
        rows = $app.findRecordsByFilter("agent_memories", "rh_user_id = {:uid}", "-created", 50, 0, { uid: uid })
      }
    } catch (_) {
      rows = []
    }
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var factTxt = ""
      var toolsTxt = ""
      var kindTxt = ""
      try {
        factTxt = String(rows[i].getString("fact") || "")
      } catch (_) {}
      try {
        toolsTxt = String(rows[i].getString("tools_used") || "")
      } catch (_) {}
      try {
        kindTxt = String(rows[i].getString("kind") || "")
      } catch (_) {}
      items.push({
        id: String(rows[i].id),
        spec_id: String(rows[i].get("spec_id") || ""),
        fact: factTxt,
        tools_used: toolsTxt,
        run_id: String(rows[i].get("run_id") || ""),
        kind: kindTxt,
        created: String(rows[i].getString("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent memories list error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/agent-memories/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var rec = null
    try {
      rec = $app.findRecordById("agent_memories", id)
    } catch (_) {}
    // 归属校验：非本人与不存在一律 404
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "memory_not_found", message: "记忆不存在或已删除" })
    }
    $app.delete(rec)
    return e.json(200, { ok: true, id: id })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent memories delete error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— 评估与反馈批次（2026-10）：运行评估 / 结果反馈 / 反馈驱动方案优化 ——
// 三条路由各自 self-contained（Goja 跨回调引用顶层 var 会抛 ReferenceError）。
// 评审/优化 LLM 调用复用平台引擎管线（llm.runninghub.cn + env RH_API_KEY，出站 ≤25s）；
// 这些路由不挂 /api/llm/ 前缀，预览容器 env key 402 时评估走纯规则降级、优化如实 5xx。

// 运行评估：规则客观分 + LLM 主观评审融合；LLM 失败/超时 → 纯规则降级（degraded:true）
routerAdd("POST", "/api/agent-runs/{id}/evaluate", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()
    var run = null
    try {
      run = $app.findRecordById("agent_runs", id)
    } catch (_) {}
    if (!run || String(run.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "run_not_found", message: "运行记录不存在" })
    }
    // 幂等：已有 evaluation 直接返回
    var evalStr = ""
    try {
      evalStr = run.getString("evaluation")
    } catch (_) {
      evalStr = ""
    }
    if (evalStr) {
      try {
        var evalOld = JSON.parse(evalStr)
        if (evalOld && typeof evalOld === "object" && !Array.isArray(evalOld)) {
          return e.json(200, { ok: true, run_id: id, evaluation: evalOld, cached: true })
        }
      } catch (_) {}
    }
    var st = String(run.get("status") || "")
    if (st !== "succeeded" && st !== "failed" && st !== "cancelled") {
      return e.json(409, { error: "bad_state", message: "运行尚未结束（当前 " + st + "），结束后才能评估" })
    }

    // ---- self-contained helpers ----
    var bytesToStr = require(__hooks + "/modules/model_wire.js").bytesToStr
    var loadJson = function (rec, field) {
      var text = ""
      try {
        text = rec.getString(field)
      } catch (_) {
        text = ""
      }
      if (!text) return {}
      try {
        var p = JSON.parse(text)
        if (p && typeof p === "object") return p
      } catch (_) {}
      return {}
    }
    var clampScore = function (n) {
      var v = Number(n)
      if (isNaN(v)) return 60
      if (v < 0) return 0
      if (v > 100) return 100
      return Math.round(v)
    }
    var parseJsonLoose = function (text) {
      var s = String(text || "").trim()
      s = s.replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim()
      var start = s.indexOf("{")
      if (start < 0) return null
      var depth = 0
      var inStr = false
      var esc = false
      var end = -1
      for (var ci = start; ci < s.length; ci++) {
        var ch = s.charAt(ci)
        if (inStr) {
          if (esc) esc = false
          else if (ch === "\\") esc = true
          else if (ch === '"') inStr = false
          continue
        }
        if (ch === '"') inStr = true
        else if (ch === "{") depth++
        else if (ch === "}") { depth--; if (depth === 0) { end = ci; break } }
      }
      if (end < 0) return null
      var cand = s.substring(start, end + 1).replace(/,(\s*[}\]])/g, "$1")
      try {
        return JSON.parse(cand)
      } catch (_) {}
      return null
    }
    var callReviewLlm = function (messages, maxTokens) {
      // 自备密钥批次：评审/优化统一走当前用户默认模型连接（第一个启用且有可用模型的），内置通道已移除
      var rvDeobf = function (stored) {
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
      var rvConn = null
      var rvModel = ""
      try {
        var rvRows = $app.findRecordsByFilter("model_connections", "rh_user_id = {:uid}", "-created", 10, 0, { uid: uid })
        var rvRows = (rvRows || []).filter(function (r) { try { return r.getBool("enabled") } catch (_e) { return false } })
        for (var rvi = 0; rvi < rvRows.length; rvi++) {
          var rvList = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(rvRows[rvi])
          if (Array.isArray(rvList) && rvList.length > 0) { rvConn = rvRows[rvi]; rvModel = String(rvList[0]); break }
        }
      } catch (_) {}
      if (!rvConn) return { ok: false, error: "model_connection_required", detail: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接" }
      var rvBase = String(rvConn.getString("base_url") || "").replace(/\/+$/, "")
      var rvKey = rvDeobf(String(rvConn.getString("api_key") || ""))
      var rvProv = "openai"
      try { rvProv = String(rvConn.getString("provider") || "") } catch (_) {}
      if (rvProv !== "anthropic" && rvProv !== "gemini") rvProv = "openai"
      if (!rvBase && rvProv === "anthropic") rvBase = "https://api.anthropic.com/v1"
      if (!rvBase && rvProv === "gemini") rvBase = "https://generativelanguage.googleapis.com/v1beta"
      if (!rvBase || !rvKey) return { ok: false, error: "custom_connection_invalid", detail: "模型连接配置不完整，请到「模型连接」页检查" }
      var rvSanitize = function (s) { return String(s || "").replace(/([?&]key=)[^&\s"']+/g, "$1***") }
      var rvMax = Number(maxTokens) > 0 ? Number(maxTokens) : 2048
      var rvRes = null
      try {
        if (rvProv === "anthropic") {
          var rvSystem = ""
          var rvMsgs = []
          for (var ri = 0; ri < messages.length; ri++) {
            var rm = messages[ri] || {}
            if (String(rm.role || "user") === "system") rvSystem = rvSystem ? rvSystem + "\n\n" + String(rm.content || "") : String(rm.content || "")
            else rvMsgs.push({ role: String(rm.role || "user") === "assistant" ? "assistant" : "user", content: String(rm.content || "") })
          }
          if (rvMsgs.length === 0) rvMsgs.push({ role: "user", content: "请继续。" })
          var rvABody = { model: rvModel, max_tokens: rvMax, messages: rvMsgs }
          if (rvSystem) rvABody.system = rvSystem
          rvRes = $http.send({ url: rvBase + "/messages", method: "POST", headers: { "Content-Type": "application/json", "x-api-key": rvKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(rvABody), timeout: 25 })
        } else if (rvProv === "gemini") {
          var rvInstr = ""
          var rvContents = []
          for (var gi = 0; gi < messages.length; gi++) {
            var gm = messages[gi] || {}
            if (String(gm.role || "user") === "system") rvInstr = rvInstr ? rvInstr + "\n\n" + String(gm.content || "") : String(gm.content || "")
            else rvContents.push({ role: String(gm.role || "user") === "assistant" ? "model" : "user", parts: [{ text: String(gm.content || "") }] })
          }
          if (rvContents.length === 0) rvContents.push({ role: "user", parts: [{ text: "请继续。" }] })
          var rvGBody = { contents: rvContents }
          if (rvInstr) rvGBody.system_instruction = { parts: [{ text: rvInstr }] }
          rvRes = $http.send({ url: rvBase + "/models/" + encodeURIComponent(rvModel) + ":generateContent?key=" + encodeURIComponent(rvKey), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rvGBody), timeout: 25 })
        } else {
          rvRes = $http.send({ url: rvBase + "/chat/completions", method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + rvKey }, body: JSON.stringify({ model: rvModel, messages: messages, max_tokens: rvMax, stream: false }), timeout: 25 })
        }
      } catch (err) {
        return { ok: false, error: "llm_request_failed", detail: rvSanitize(String((err && err.message) || err)).slice(0, 200) }
      }
      if (!rvRes || rvRes.statusCode < 200 || rvRes.statusCode >= 300) {
        return { ok: false, error: "llm_http_" + (rvRes ? rvRes.statusCode : 0), detail: rvSanitize(bytesToStr(rvRes)).slice(0, 200) }
      }
      var rvData = null
      try { rvData = JSON.parse(bytesToStr(rvRes)) } catch (_) {}
      var rvContent = ""
      if (rvProv === "anthropic") {
        var rvBlocks = (rvData && rvData.content) || []
        for (var bi = 0; bi < rvBlocks.length; bi++) if (String((rvBlocks[bi] || {}).type || "") === "text") rvContent += String((rvBlocks[bi] || {}).text || "")
      } else if (rvProv === "gemini") {
        var rvParts = ((((rvData && rvData.candidates) || [])[0] || {}).content || {}).parts || []
        for (var pi = 0; pi < rvParts.length; pi++) if ((rvParts[pi] || {}).text !== undefined && rvParts[pi].text !== null) rvContent += String(rvParts[pi].text)
      } else {
        var rvChoices = (rvData && rvData.choices) || []
        rvContent = String(((rvChoices[0] && rvChoices[0].message) || {}).content || "")
      }
      if (!rvContent) return { ok: false, error: "llm_empty_content" }
      return { ok: true, content: rvContent }
    }

    // ---- 规则客观分 ----
    var cpObj = loadJson(run, "checkpoint")
    var hs = cpObj.harness_stats || {}
    var curStep = Number(run.get("current_step") || 0)
    var maxSteps = Number(run.get("max_steps") || 10)
    if (!maxSteps || maxSteps < 1) maxSteps = 10
    var toolCalls = Number(hs.tool_calls || 0)
    var retries = Number(hs.retries || 0)
    var compressions = Number(hs.compressions || 0)
    var resultText = ""
    try {
      resultText = String(run.getString("result") || "")
    } catch (_) {}
    var errorText = ""
    try {
      errorText = String(run.getString("error") || "")
    } catch (_) {}
    var stuck = errorText.indexOf("stuck_loop_detected") >= 0
    var usage = curStep / maxSteps
    var okRun = st === "succeeded"

    var goalScore = okRun ? (resultText.length > 0 ? 88 : 70) : st === "cancelled" ? 42 : 30
    var effScore = Math.round(100 - usage * 45 - retries * 6 - compressions * 4)
    if (effScore < 20) effScore = 20
    if (effScore > 98) effScore = 98
    var toolScore = toolCalls === 0 ? 62 : Math.round(84 - retries * 8)
    if (toolScore < 25) toolScore = 25
    if (toolScore > 96) toolScore = 96
    var outScore = okRun ? (resultText.length >= 40 ? 86 : 68) : 34
    var instrScore = stuck ? 24 : okRun ? 82 : 58

    var ruleDims = [
      { name: "目标达成", score: clampScore(goalScore), comment: okRun ? "运行成功结束并产出成果" : st === "cancelled" ? "运行被用户取消，未完成目标" : "运行失败，未达成目标" },
      { name: "过程效率", score: clampScore(effScore), comment: "用 " + curStep + "/" + maxSteps + " 步，重试 " + retries + " 次、压缩 " + compressions + " 次" },
      { name: "工具使用", score: clampScore(toolScore), comment: toolCalls === 0 ? "本次未调用外部工具" : "调用工具 " + toolCalls + " 次，其中重试 " + retries + " 次" },
      { name: "输出质量", score: clampScore(outScore), comment: okRun ? "成果文本长度 " + resultText.length + " 字符" : "无有效成果输出" },
      { name: "指令遵循", score: clampScore(instrScore), comment: stuck ? "检测到疑似卡死循环" : okRun ? "按完成标准正常收敛" : "运行中断，未完全遵循指令" },
    ]
    var ruleSum = 0
    for (var rdi = 0; rdi < ruleDims.length; rdi++) ruleSum += ruleDims[rdi].score
    var ruleScore = Math.round(ruleSum / ruleDims.length)

    var ruleSugg = []
    if (st === "failed" && errorText) ruleSugg.push("分析失败原因并针对性修正：" + errorText.slice(0, 80))
    if (st === "cancelled") ruleSugg.push("运行被手动取消，若因方向偏差可先完善方案目标与完成标准再试跑")
    if (stuck) ruleSugg.push("出现疑似卡死循环，建议拆分任务或降低单步工具依赖")
    if (retries > 0) ruleSugg.push("工具调用重试 " + retries + " 次，检查外部工具稳定性与超时配置")
    if (!okRun && curStep >= maxSteps) ruleSugg.push("步数预算已用尽，考虑提高最大步数或缩小任务范围")
    if (compressions > 0) ruleSugg.push("上下文被压缩 " + compressions + " 次，建议精简指令或减少冗余观察")
    if (okRun && toolCalls === 0) ruleSugg.push("未调用工具即完成，若任务需外部数据可考虑开启相应工具")
    if (ruleSugg.length === 0) ruleSugg.push("本次运行平稳结束，保持当前配置并观察后续任务表现")
    if (ruleSugg.length > 5) ruleSugg = ruleSugg.slice(0, 5)

    var evaluatedAt = new Date().toISOString()

    // ---- LLM 主观评审 ----
    var evRows = []
    try {
      evRows = $app.findRecordsByFilter("run_events", "run_id = {:rid}", "step_index,seq,created", 300, 0, { rid: id })
    } catch (_) {
      evRows = []
    }
    var stepLines = []
    var stepChars = 0
    for (var evi = 0; evi < evRows.length && stepChars < 2600; evi++) {
      var ec = loadJson(evRows[evi], "content")
      var et = String(evRows[evi].getString("event_type") || "")
      var line = ""
      if (et === "thinking") line = "思：" + String(ec.thought || "").slice(0, 110)
      else if (et === "tool_call") line = "调用工具：" + String(ec.tool || "")
      else if (et === "tool_result") line = "工具结果：" + String(ec.output || "").slice(0, 110)
      else if (et === "error") line = "错误：" + String(ec.message || "").slice(0, 110)
      else if (et === "status") line = "状态：" + String(ec.message || "").slice(0, 80)
      if (line) { stepLines.push(line); stepChars += line.length }
    }
    var instruction = ""
    try {
      instruction = String(run.getString("instruction") || "")
    } catch (_) {}

    var DIM_NAMES = ["目标达成", "过程效率", "工具使用", "输出质量", "指令遵循"]
    var reviewSys = "你是 Agent 运行质量评审员。基于给定的运行材料，输出严格的单行 JSON（字符串内换行用 \\n 转义），结构：" +
      '{"score":0到100整数,"dimensions":[{"name":"目标达成","score":整数,"comment":"简评"},{"name":"过程效率",...},{"name":"工具使用",...},{"name":"输出质量",...},{"name":"指令遵循",...}],"suggestions":["最多5条具体可执行的优化建议"]}。' +
      "dimensions 必须恰好包含这 5 个 name 且顺序一致：目标达成、过程效率、工具使用、输出质量、指令遵循。只输出 JSON，不要解释。"
    var reviewUser = "【任务指令】" + instruction.slice(0, 600) +
      "\n【最终状态】" + st + (errorText ? "（失败原因：" + errorText.slice(0, 200) + "）" : "") +
      "\n【规则客观分】总分 " + ruleScore + "；步数 " + curStep + "/" + maxSteps + "；工具 " + toolCalls + " 次；重试 " + retries + "；压缩 " + compressions + (stuck ? "；检测到卡死循环" : "") +
      "\n【步骤摘要】\n" + (stepLines.length ? stepLines.join("\n").slice(0, 2600) : "（无步骤事件）") +
      "\n【最终成果】" + (resultText ? resultText.slice(0, 1200) : "（无成果文本）")

    var llmRes = callReviewLlm([
      { role: "system", content: reviewSys },
      { role: "user", content: reviewUser },
    ], 2048)

    var evaluation = null
    if (llmRes && llmRes.ok) {
      var parsed = parseJsonLoose(llmRes.content)
      if (parsed && parsed.dimensions && parsed.dimensions.length) {
        var byName = {}
        for (var pdi = 0; pdi < parsed.dimensions.length; pdi++) {
          var d = parsed.dimensions[pdi] || {}
          byName[String(d.name || "")] = d
        }
        var fusedDims = []
        for (var fni = 0; fni < DIM_NAMES.length; fni++) {
          var nm = DIM_NAMES[fni]
          var ld = byName[nm]
          var rd = ruleDims[fni]
          if (ld && typeof ld.score !== "undefined") {
            fusedDims.push({ name: nm, score: clampScore(ld.score), comment: String(ld.comment || rd.comment).slice(0, 120) })
          } else {
            fusedDims.push({ name: nm, score: rd.score, comment: rd.comment })
          }
        }
        var llmScoreRaw = Number(parsed.score)
        var llmTotal = isNaN(llmScoreRaw) ? 0 : clampScore(llmScoreRaw)
        var dimSum = 0
        for (var dsi = 0; dsi < fusedDims.length; dsi++) dimSum += fusedDims[dsi].score
        var dimAvg = Math.round(dimSum / fusedDims.length)
        // 融合：规则客观分 40% + LLM 主观分 60%（LLM 总分缺失时用其维度均值）
        var llmPart = llmTotal > 0 ? llmTotal : dimAvg
        var fusedScore = Math.round(ruleScore * 0.4 + llmPart * 0.6)
        var llmSugg = []
        if (parsed.suggestions && parsed.suggestions.length) {
          for (var sgi = 0; sgi < parsed.suggestions.length && llmSugg.length < 5; sgi++) {
            var sg = String(parsed.suggestions[sgi] || "").trim()
            if (sg) llmSugg.push(sg.slice(0, 200))
          }
        }
        if (llmSugg.length === 0) llmSugg = ruleSugg
        evaluation = { score: clampScore(fusedScore), dimensions: fusedDims, suggestions: llmSugg, mode: "llm", degraded: false, evaluated_at: evaluatedAt }
      }
    }
    if (!evaluation) {
      evaluation = { score: ruleScore, dimensions: ruleDims, suggestions: ruleSugg, mode: "rule", degraded: true, evaluated_at: evaluatedAt }
    }

    run.set("evaluation", evaluation)
    $app.save(run)
    return e.json(200, { ok: true, run_id: id, evaluation: evaluation })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent evaluate error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// 结果反馈：覆盖写 feedback；rating=down 时同步沉淀一条 kind=lesson 记忆（脱敏）
routerAdd("POST", "/api/agent-runs/{id}/feedback", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()
    var run = null
    try {
      run = $app.findRecordById("agent_runs", id)
    } catch (_) {}
    if (!run || String(run.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "run_not_found", message: "运行记录不存在" })
    }
    var sanitize = function (s) {
      return String(s || "")
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, "***")
        .replace(/Bearer\s+\S+/g, "Bearer ***")
        .replace(/token=\S+/g, "token=***")
        .replace(/api_key=\S+/g, "api_key=***")
    }
    var body = (e.requestInfo() || {}).body || {}
    var rating = String(body.rating || "")
    if (rating !== "up" && rating !== "down") {
      return e.json(400, { error: "bad_request", message: "rating 只支持 up 或 down" })
    }
    var tags = []
    if (body.tags && typeof body.tags.length === "number") {
      for (var ti = 0; ti < body.tags.length && tags.length < 8; ti++) {
        var tg = String(body.tags[ti] || "").trim()
        if (tg) tags.push(tg.slice(0, 20))
      }
    }
    var comment = String(body.comment || "").slice(0, 500)
    var feedback = { rating: rating, tags: tags, comment: comment, submitted_at: new Date().toISOString() }
    run.set("feedback", feedback)
    $app.save(run)

    var lessonWritten = false
    if (rating === "down") {
      try {
        var instrTxt = ""
        try {
          instrTxt = String(run.getString("instruction") || "")
        } catch (_) {}
        var tailTxt = (tags.length ? tags.join("、") : "") + (comment ? (tags.length ? " " : "") + comment : "")
        var factTxt = sanitize("用户反馈：" + instrTxt.slice(0, 100) + " → " + tailTxt.slice(0, 300)).slice(0, 500)
        var memCol = $app.findCollectionByNameOrId("agent_memories")
        var memRec = new Record(memCol)
        memRec.set("rh_user_id", uid)
        memRec.set("spec_id", String(run.get("spec_id") || ""))
        memRec.set("fact", factTxt)
        memRec.set("tools_used", "")
        memRec.set("run_id", id)
        memRec.set("kind", "lesson")
        $app.save(memRec)
        lessonWritten = true
      } catch (memErr) {
        try {
          $app.logger().error("feedback lesson write", "err", String((memErr && memErr.message) || memErr))
        } catch (_) {}
      }
    }
    return e.json(200, { ok: true, run_id: id, feedback: feedback, lesson_written: lessonWritten })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent feedback error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// 反馈驱动方案优化：聚合全部 run 反馈 + 最近 evaluation 建议 → 一次 LLM 生成改进稿（只生成不写回）
routerAdd("POST", "/api/agent-specs/{id}/optimize", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()
    var spec = null
    try {
      spec = $app.findRecordById("agent_specs", id)
    } catch (_) {}
    if (!spec || String(spec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "spec_not_found", message: "助手方案不存在" })
    }

    var bytesToStr = require(__hooks + "/modules/model_wire.js").bytesToStr
    var loadJson = function (rec, field) {
      var text = ""
      try {
        text = rec.getString(field)
      } catch (_) {
        text = ""
      }
      if (!text) return {}
      try {
        var p = JSON.parse(text)
        if (p && typeof p === "object") return p
      } catch (_) {}
      return {}
    }
    var parseJsonLoose = function (text) {
      var s = String(text || "").trim()
      s = s.replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim()
      var start = s.indexOf("{")
      if (start < 0) return null
      var depth = 0
      var inStr = false
      var esc = false
      var end = -1
      for (var ci = start; ci < s.length; ci++) {
        var ch = s.charAt(ci)
        if (inStr) {
          if (esc) esc = false
          else if (ch === "\\") esc = true
          else if (ch === '"') inStr = false
          continue
        }
        if (ch === '"') inStr = true
        else if (ch === "{") depth++
        else if (ch === "}") { depth--; if (depth === 0) { end = ci; break } }
      }
      if (end < 0) return null
      var cand = s.substring(start, end + 1).replace(/,(\s*[}\]])/g, "$1")
      try {
        return JSON.parse(cand)
      } catch (_) {}
      return null
    }
    var callReviewLlm = function (messages, maxTokens) {
      // 自备密钥批次：评审/优化统一走当前用户默认模型连接（第一个启用且有可用模型的），内置通道已移除
      var rvDeobf = function (stored) {
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
      var rvConn = null
      var rvModel = ""
      try {
        var rvRows = $app.findRecordsByFilter("model_connections", "rh_user_id = {:uid}", "-created", 10, 0, { uid: uid })
        var rvRows = (rvRows || []).filter(function (r) { try { return r.getBool("enabled") } catch (_e) { return false } })
        for (var rvi = 0; rvi < rvRows.length; rvi++) {
          var rvList = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(rvRows[rvi])
          if (Array.isArray(rvList) && rvList.length > 0) { rvConn = rvRows[rvi]; rvModel = String(rvList[0]); break }
        }
      } catch (_) {}
      if (!rvConn) return { ok: false, error: "model_connection_required", detail: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接" }
      var rvBase = String(rvConn.getString("base_url") || "").replace(/\/+$/, "")
      var rvKey = rvDeobf(String(rvConn.getString("api_key") || ""))
      var rvProv = "openai"
      try { rvProv = String(rvConn.getString("provider") || "") } catch (_) {}
      if (rvProv !== "anthropic" && rvProv !== "gemini") rvProv = "openai"
      if (!rvBase && rvProv === "anthropic") rvBase = "https://api.anthropic.com/v1"
      if (!rvBase && rvProv === "gemini") rvBase = "https://generativelanguage.googleapis.com/v1beta"
      if (!rvBase || !rvKey) return { ok: false, error: "custom_connection_invalid", detail: "模型连接配置不完整，请到「模型连接」页检查" }
      var rvSanitize = function (s) { return String(s || "").replace(/([?&]key=)[^&\s"']+/g, "$1***") }
      var rvMax = Number(maxTokens) > 0 ? Number(maxTokens) : 2048
      var rvRes = null
      try {
        if (rvProv === "anthropic") {
          var rvSystem = ""
          var rvMsgs = []
          for (var ri = 0; ri < messages.length; ri++) {
            var rm = messages[ri] || {}
            if (String(rm.role || "user") === "system") rvSystem = rvSystem ? rvSystem + "\n\n" + String(rm.content || "") : String(rm.content || "")
            else rvMsgs.push({ role: String(rm.role || "user") === "assistant" ? "assistant" : "user", content: String(rm.content || "") })
          }
          if (rvMsgs.length === 0) rvMsgs.push({ role: "user", content: "请继续。" })
          var rvABody = { model: rvModel, max_tokens: rvMax, messages: rvMsgs }
          if (rvSystem) rvABody.system = rvSystem
          rvRes = $http.send({ url: rvBase + "/messages", method: "POST", headers: { "Content-Type": "application/json", "x-api-key": rvKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(rvABody), timeout: 25 })
        } else if (rvProv === "gemini") {
          var rvInstr = ""
          var rvContents = []
          for (var gi = 0; gi < messages.length; gi++) {
            var gm = messages[gi] || {}
            if (String(gm.role || "user") === "system") rvInstr = rvInstr ? rvInstr + "\n\n" + String(gm.content || "") : String(gm.content || "")
            else rvContents.push({ role: String(gm.role || "user") === "assistant" ? "model" : "user", parts: [{ text: String(gm.content || "") }] })
          }
          if (rvContents.length === 0) rvContents.push({ role: "user", parts: [{ text: "请继续。" }] })
          var rvGBody = { contents: rvContents }
          if (rvInstr) rvGBody.system_instruction = { parts: [{ text: rvInstr }] }
          rvRes = $http.send({ url: rvBase + "/models/" + encodeURIComponent(rvModel) + ":generateContent?key=" + encodeURIComponent(rvKey), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rvGBody), timeout: 25 })
        } else {
          rvRes = $http.send({ url: rvBase + "/chat/completions", method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + rvKey }, body: JSON.stringify({ model: rvModel, messages: messages, max_tokens: rvMax, stream: false }), timeout: 25 })
        }
      } catch (err) {
        return { ok: false, error: "llm_request_failed", detail: rvSanitize(String((err && err.message) || err)).slice(0, 200) }
      }
      if (!rvRes || rvRes.statusCode < 200 || rvRes.statusCode >= 300) {
        return { ok: false, error: "llm_http_" + (rvRes ? rvRes.statusCode : 0), detail: rvSanitize(bytesToStr(rvRes)).slice(0, 200) }
      }
      var rvData = null
      try { rvData = JSON.parse(bytesToStr(rvRes)) } catch (_) {}
      var rvContent = ""
      if (rvProv === "anthropic") {
        var rvBlocks = (rvData && rvData.content) || []
        for (var bi = 0; bi < rvBlocks.length; bi++) if (String((rvBlocks[bi] || {}).type || "") === "text") rvContent += String((rvBlocks[bi] || {}).text || "")
      } else if (rvProv === "gemini") {
        var rvParts = ((((rvData && rvData.candidates) || [])[0] || {}).content || {}).parts || []
        for (var pi = 0; pi < rvParts.length; pi++) if ((rvParts[pi] || {}).text !== undefined && rvParts[pi].text !== null) rvContent += String(rvParts[pi].text)
      } else {
        var rvChoices = (rvData && rvData.choices) || []
        rvContent = String(((rvChoices[0] && rvChoices[0].message) || {}).content || "")
      }
      if (!rvContent) return { ok: false, error: "llm_empty_content" }
      return { ok: true, content: rvContent }
    }

    var specObj = loadJson(spec, "spec")
    var specName = ""
    try {
      specName = String(spec.getString("name") || "")
    } catch (_) {}

    var runRows = []
    try {
      runRows = $app.findRecordsByFilter("agent_runs", "rh_user_id = {:uid} && spec_id = {:sid}", "-created", 200, 0, { uid: uid, sid: id })
    } catch (_) {
      runRows = []
    }
    var fbDigest = []
    var suggPool = []
    var latestEvalSugg = []
    for (var rri = 0; rri < runRows.length; rri++) {
      var fb = loadJson(runRows[rri], "feedback")
      if (fb && (fb.rating === "up" || fb.rating === "down")) {
        var fbTags = (fb.tags && typeof fb.tags.length === "number") ? fb.tags.join("、") : ""
        fbDigest.push((fb.rating === "down" ? "👎" : "👍") + (fbTags ? " [" + fbTags + "]" : "") + (fb.comment ? " " + String(fb.comment).slice(0, 120) : ""))
      }
    }
    // 最近一条带 evaluation 的 run 的建议
    for (var rsi = 0; rsi < runRows.length; rsi++) {
      var ev = loadJson(runRows[rsi], "evaluation")
      if (ev && ev.suggestions && ev.suggestions.length) {
        for (var sgi = 0; sgi < ev.suggestions.length; sgi++) latestEvalSugg.push(String(ev.suggestions[sgi] || ""))
        break
      }
    }
    if (latestEvalSugg.length) suggPool = latestEvalSugg

    if (fbDigest.length === 0 && suggPool.length === 0) {
      return e.json(400, { error: "no_material", message: "这个方案还没有运行反馈或评估数据，请先运行并提交反馈或生成评估后再优化" })
    }

    var optSys = "你是 Agent 方案优化顾问。基于当前方案配置、用户反馈与运行评估建议，产出改进稿。输出严格的单行 JSON（字符串内换行用 \\n 转义），结构：" +
      '{"suggested_prompt":"改进后的方案目标/系统提示","suggested_criteria":"改进后的完成标准（多条用；分隔）","suggested_tools_note":"对工具配置的建议（一句话）","rationale":"为什么这样改（结合反馈，120字内）"}。只输出 JSON，不要解释。'
    var optUser = "【方案名称】" + specName +
      "\n【当前目标】" + String(specObj.goal || "").slice(0, 500) +
      "\n【任务范围】" + String(specObj.task_scope || "").slice(0, 400) +
      "\n【当前完成标准】" + ((specObj.done_criteria && specObj.done_criteria.join) ? specObj.done_criteria.join("；") : "").slice(0, 400) +
      "\n【当前工具】" + ((specObj.tools && specObj.tools.join) ? specObj.tools.join("、") : "") +
      "\n【用户反馈摘要】\n" + (fbDigest.length ? fbDigest.slice(0, 20).join("\n") : "（无反馈）") +
      "\n【最近评估建议】\n" + (suggPool.length ? suggPool.slice(0, 8).join("\n") : "（无评估建议）")

    var llmRes = callReviewLlm([
      { role: "system", content: optSys },
      { role: "user", content: optUser },
    ], 2048)

    if (!llmRes || !llmRes.ok) {
      var eCode = llmRes ? String(llmRes.error || "llm_unavailable") : "llm_unavailable"
      var eDetail = llmRes ? String(llmRes.detail || "") : ""
      var fp = (eCode + " " + eDetail).slice(0, 80)
      return e.json(502, { error: "optimize_llm_unavailable", message: "优化建议生成失败（模型服务不可用或余额受限），请稍后重试", fingerprint: fp })
    }
    var parsedOpt = parseJsonLoose(llmRes.content)
    if (!parsedOpt || !parsedOpt.suggested_prompt) {
      return e.json(502, { error: "optimize_bad_output", message: "优化建议解析失败，请重试", fingerprint: String(llmRes.content || "").slice(0, 80) })
    }
    var suggestion = {
      suggested_prompt: String(parsedOpt.suggested_prompt || "").slice(0, 2000),
      suggested_criteria: String(parsedOpt.suggested_criteria || "").slice(0, 800),
      suggested_tools_note: String(parsedOpt.suggested_tools_note || "").slice(0, 400),
      rationale: String(parsedOpt.rationale || "").slice(0, 400),
    }
    return e.json(200, { ok: true, spec_id: id, suggestion: suggestion })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent optimize error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
