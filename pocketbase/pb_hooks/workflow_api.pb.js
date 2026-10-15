// workflow_api.pb.js — Agent Studio 工作流画布：专属数据通路 + 工作流执行引擎
// 数据通路纪律：前端一律走本文件路由（全路由 X-Rh-User-Id 归属校验，非本人/不存在一律 404），
// 不直读 MCP 装的 /api/workflows|workflow_runs|workflow_events 通用路由。
// 驱动方式：与 agent_engine 相同——前端 3s 轮询 POST /api/llm/workflow-engine/{id}/tick，
// 每调一次按执行队列推进一个节点；tick 挂 /api/llm/ 前缀让网关注入访客 X-Rh-Api-Key（访客自付）。
// cronAdd 被平台禁用；tick 内 claim_until 认领防重叠；checkpoint 落库支持取消后保留已执行结果。
// Goja 铁律：全部 var、new Date().getTime()、helper 就地定义、每个回调 self-contained、
// 5xx 一律 { error, message, fingerprint }；json 字段 getString 优先读回。

routerAdd("GET", "/api/workflow-studio/list", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var loadJson = function (rec, field) {
      var s = ""
      try { s = rec.getString(field) } catch (_) { s = "" }
      if (s) {
        try {
          var parsed = JSON.parse(s)
          if (parsed !== null && typeof parsed === "object") return parsed
        } catch (_) {}
      }
      var v = null
      try { v = rec.get(field) } catch (_) {}
      if (v === null || v === undefined) return {}
      if (typeof v === "string") {
        try { return JSON.parse(v) } catch (_) { return {} }
      }
      if (typeof v === "object") return v
      return {}
    }
    var rows = $app.findRecordsByFilter("workflows", "rh_user_id = {:uid}", "-updated", 100, 0, { uid: uid })
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var g = loadJson(rows[i], "graph")
      var nArr = g && g.nodes && typeof g.nodes.length === "number" ? g.nodes : []
      var raList = false
      try { raList = rows[i].getBool("require_approval") } catch (_) {}
      items.push({
        id: String(rows[i].id),
        name: String(rows[i].getString("name") || ""),
        description: String(rows[i].getString("description") || ""),
        node_count: nArr.length,
        source: String(rows[i].getString("source") || ""),
        spec_id: String(rows[i].getString("spec_id") || ""),
        require_approval: raList,
        created: String(rows[i].getString("created") || ""),
        updated: String(rows[i].getString("updated") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow list error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/workflow-studio/create", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var name = String(body.name || "").trim().slice(0, 100)
    if (!name) return e.json(400, { error: "bad_request", message: "请填写工作流名称" })
    var graphIn = body.graph
    var graph = { nodes: [], edges: [] }
    if (graphIn && typeof graphIn === "object") {
      if (graphIn.nodes && typeof graphIn.nodes.length === "number") graph.nodes = graphIn.nodes
      if (graphIn.edges && typeof graphIn.edges.length === "number") graph.edges = graphIn.edges
    }
    if (graph.nodes.length > 40) return e.json(400, { error: "bad_graph", message: "单个工作流最多 40 个节点" })
    var col = $app.findCollectionByNameOrId("workflows")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("name", name)
    rec.set("description", String(body.description || "").slice(0, 500))
    rec.set("graph", graph)
    rec.set("source", String(body.source || "manual").slice(0, 40))
    $app.save(rec)
    return e.json(200, { ok: true, id: String(rec.id), name: name })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow create error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// 双渠道对应批次：从助手方案（agent_specs）一键生成工作流画布（LLM 出图 + 服务端校验补链）
routerAdd("POST", "/api/workflow-studio/generate-from-spec", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录账号" })
    var body = (e.requestInfo() || {}).body || {}
    var specId = String(body.spec_id || "").trim()
    if (!specId) return e.json(400, { error: "bad_request", message: "缺少助手方案 id" })
    var specRec = null
    try { specRec = $app.findRecordById("agent_specs", specId) } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "助手方案不存在或已删除" })
    }
    var specJson = {}
    try { specJson = JSON.parse(specRec.getString("spec") || "{}") || {} } catch (_) {}

    // 默认模型连接（第一个启用且有可用模型的）
    var gsDeobf = function (stored) {
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
    var gsConn = null
    try {
      var gsRows = $app.findRecordsByFilter("model_connections", "rh_user_id = {:uid}", "-created", 10, 0, { uid: uid })
      var gsRows = (gsRows || []).filter(function (r) { try { return r.getBool("enabled") } catch (_e) { return false } })
      for (var gi0 = 0; gi0 < gsRows.length; gi0++) {
        var gm0 = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(gsRows[gi0])
        if (Array.isArray(gm0) && gm0.length > 0) { gsConn = gsRows[gi0]; break }
      }
    } catch (_) {}
    if (!gsConn) return e.json(400, { error: "model_connection_required", message: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接" })
    var gsBase = String(gsConn.getString("base_url") || "").replace(/\/+$/, "")
    var gsKey = gsDeobf(String(gsConn.getString("api_key") || ""))
    var gsProv = "openai"
    try { gsProv = String(gsConn.getString("provider") || "") } catch (_) {}
    if (gsProv !== "anthropic" && gsProv !== "gemini") gsProv = "openai"
    if (!gsBase && gsProv === "anthropic") gsBase = "https://api.anthropic.com/v1"
    if (!gsBase && gsProv === "gemini") gsBase = "https://generativelanguage.googleapis.com/v1beta"
    if (!gsBase || !gsKey) return e.json(400, { error: "custom_connection_invalid", message: "模型连接配置不完整，请到「模型连接」页检查" })
    var gsModels = (function (r) { try { var s = r.getString("models"); return s ? JSON.parse(s) : [] } catch (_p) { return [] } })(gsConn)
    var gsModel = String((Array.isArray(gsModels) && gsModels.length > 0) ? gsModels[0] : "")

    var sysPrompt = [
      "你是工作流编排设计师。把用户给的助手方案转换成可执行的工作流图 JSON。",
      "节点类型白名单：start（开始，恰好 1 个，data:{title}）；model（模型调用，data:{title,prompt}）；tool（工具，data:{title,tool,params_template}）；condition（条件分支，data:{title,op,value}，两个出口 sourceHandle 取 true 或 false）；loop（循环，data:{title,mode,count,list_source,delimiter}，循环体走默认出口、循环结束后继续走 sourceHandle=done）；end（结束，恰好 1 个，data:{title,output_template}）。",
      "可用工具：calculate、summarize、knowledge_search、web_fetch、web_search；方案 tools 里列出的其它工具名也可用（tool 节点 tool 字段填工具名）。",
      "model 节点 prompt 与 end 节点 output_template 支持变量 {{input}} 与 {{上游节点标题.output}}。",
      "nodes 按数组顺序以 n1、n2、n3… 作为 id；edges 的 source/target 用这些 id；condition/loop 之外的边不要写 sourceHandle。",
      "图必须从 start 连通到 end；节点总数不超过 12；只输出 JSON：{\"name\":\"工作流名称\",\"description\":\"一句话\",\"nodes\":[{\"type\":\"...\",\"title\":\"...\",\"data\":{...}}],\"edges\":[{\"source\":\"n1\",\"target\":\"n2\"}]}；不要任何解释或 markdown 围栏。",
    ].join("\n")
    var userMsg = "助手方案：\n" + JSON.stringify({ name: specRec.getString("name"), spec: specJson })
    var gsMessages = [{ role: "system", content: sysPrompt }, { role: "user", content: userMsg }]

    var gsRes = null
    try {
      if (gsProv === "anthropic") {
        gsRes = $http.send({ url: gsBase + "/messages", method: "POST", headers: { "Content-Type": "application/json", "x-api-key": gsKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: gsModel, max_tokens: 4096, messages: [{ role: "user", content: userMsg }], system: sysPrompt }), timeout: 60 })
      } else if (gsProv === "gemini") {
        gsRes = $http.send({ url: gsBase + "/models/" + encodeURIComponent(gsModel) + ":generateContent?key=" + encodeURIComponent(gsKey), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: sysPrompt + "\n\n" + userMsg }] }] }), timeout: 60 })
      } else {
        var gsMaxTry = 8192
        for (var gati = 0; gati < 2; gati++) {
          gsRes = $http.send({ url: gsBase + "/chat/completions", method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + gsKey }, body: JSON.stringify({ model: gsModel, messages: gsMessages, max_tokens: gsMaxTry, stream: false }), timeout: 120 })
          if (!gsRes || gsRes.statusCode < 200 || gsRes.statusCode >= 300) break
          var gpd = null
          try { gpd = JSON.parse(typeof gsRes.raw === "string" ? gsRes.raw : String(gsRes.raw)) } catch (_) {}
          var gch0 = ((gpd && gpd.choices) || [])[0] || {}
          var gpc = String((gch0.message || {}).content || "")
          var gfr = String(gch0.finish_reason || "")
          if (gpc || gfr !== "length" || gsMaxTry >= 16384) break
          gsMaxTry = 16384
        }
      }
    } catch (gerr) {
      return e.json(502, { error: "llm_request_failed", message: String((gerr && gerr.message) || gerr).slice(0, 200), fingerprint: "gen_spec_llm" })
    }
    if (!gsRes || gsRes.statusCode < 200 || gsRes.statusCode >= 300) {
      return e.json(502, { error: "llm_http_" + (gsRes ? gsRes.statusCode : 0), message: "模型调用失败，请检查模型连接是否可用", fingerprint: "gen_spec_http" })
    }
    var gsRaw = ""
    try { gsRaw = typeof gsRes.raw === "string" ? gsRes.raw : String(gsRes.raw) } catch (_) {}
    var gsData = null
    try { gsData = JSON.parse(gsRaw) } catch (_) {}
    var gsText = ""
    if (gsProv === "anthropic") {
      var ab = (gsData && gsData.content) || []
      for (var abi = 0; abi < ab.length; abi++) if (String((ab[abi] || {}).type) === "text") gsText += String((ab[abi] || {}).text || "")
    } else if (gsProv === "gemini") {
      var gp2 = ((((gsData && gsData.candidates) || [])[0] || {}).content || {}).parts || []
      for (var gpi = 0; gpi < gp2.length; gpi++) if ((gp2[gpi] || {}).text !== undefined && gp2[gpi].text !== null) gsText += String(gp2[gpi].text)
    } else {
      var gch = (gsData && gsData.choices) || []
      gsText = String(((gch[0] && gch[0].message) || {}).content || "")
    }
    var gsStart = gsText.indexOf("{")
    var gsEnd = gsText.lastIndexOf("}")
    var gsPlan = null
    if (gsStart >= 0 && gsEnd > gsStart) {
      try { gsPlan = JSON.parse(gsText.substring(gsStart, gsEnd + 1)) } catch (_) {}
    }
    if (!gsPlan || !gsPlan.nodes || typeof gsPlan.nodes.length !== "number" || gsPlan.nodes.length === 0) {
      return e.json(502, { error: "bad_generation", message: "模型没有返回可用的工作流结构，请重试或手动新建", fingerprint: "gen_spec_bad" })
    }

    // 组装 graph：类型白名单过滤 + 位置 + start/end 补齐 + 边校验与补链
    var TYPES = { start: 1, model: 1, tool: 1, condition: 1, loop: 1, end: 1 }
    var DEF_TITLE = { start: "开始", model: "模型调用", tool: "工具调用", condition: "条件分支", loop: "循环", end: "结束" }
    var nodes = []
    var rawNodes = gsPlan.nodes.slice(0, 38)
    for (var ni = 0; ni < rawNodes.length; ni++) {
      var rn = rawNodes[ni] || {}
      var t = String(rn.type || "")
      if (!TYPES[t]) continue
      var rd = (rn.data && typeof rn.data === "object") ? rn.data : {}
      nodes.push({
        id: "n" + String(nodes.length + 1),
        type: t,
        position: { x: 120, y: 40 + nodes.length * 150 },
        data: {
          title: String(rn.title || rd.title || DEF_TITLE[t]).slice(0, 40),
          model: "",
          prompt: String(rd.prompt || ""),
          tool: String(rd.tool || ""),
          params_template: String(rd.params_template || ""),
          op: String(rd.op || ""),
          value: String(rd.value || ""),
          output_template: String(rd.output_template || ""),
          mode: String(rd.mode || ""),
          count: rd.count !== undefined && rd.count !== null ? String(rd.count) : "",
          list_source: String(rd.list_source || ""),
          delimiter: String(rd.delimiter || "line"),
        },
      })
    }
    if (nodes.length === 0) {
      return e.json(502, { error: "bad_generation", message: "模型返回的节点都不受支持，请重试或手动新建", fingerprint: "gen_spec_empty" })
    }
    var hasStart = false
    var hasEnd = false
    for (var hi = 0; hi < nodes.length; hi++) {
      if (nodes[hi].type === "start") hasStart = true
      if (nodes[hi].type === "end") hasEnd = true
    }
    if (!hasStart) nodes.unshift({ id: "n0s", type: "start", position: { x: 120, y: 0 }, data: { title: "开始" } })
    if (!hasEnd) nodes.push({ id: "n9e", type: "end", position: { x: 120, y: 40 + nodes.length * 150 }, data: { title: "结束", output_template: "{{input}}" } })
    var idOk = {}
    var typeById = {}
    for (var ii = 0; ii < nodes.length; ii++) { idOk[nodes[ii].id] = true; typeById[nodes[ii].id] = nodes[ii].type }
    var edges = []
    var edgeSeen = {}
    var rawEdges = (gsPlan.edges && typeof gsPlan.edges.length === "number") ? gsPlan.edges : []
    for (var ei = 0; ei < rawEdges.length; ei++) {
      var re = rawEdges[ei] || {}
      var src = String(re.source || "")
      var tgt = String(re.target || "")
      if (!idOk[src] || !idOk[tgt] || src === tgt) continue
      var edge = { id: "e" + String(edges.length + 1), source: src, target: tgt }
      var sh = String(re.sourceHandle || "")
      if (typeById[src] === "condition" && (sh === "true" || sh === "false")) edge.sourceHandle = sh
      if (typeById[src] === "loop" && sh === "done") edge.sourceHandle = "done"
      var ek = edge.source + ">" + edge.target + ">" + (edge.sourceHandle || "")
      if (edgeSeen[ek]) continue
      edgeSeen[ek] = true
      edges.push(edge)
    }
    // 补链：除 start 外无入边 → 从 start 连入；除 end 外无出边 → 连到 end
    var startId = ""
    var endId = ""
    for (var si = 0; si < nodes.length; si++) {
      if (!startId && nodes[si].type === "start") startId = nodes[si].id
      if (!endId && nodes[si].type === "end") endId = nodes[si].id
    }
    var inDeg = {}
    var outDeg = {}
    for (var ei2 = 0; ei2 < edges.length; ei2++) {
      outDeg[edges[ei2].source] = (outDeg[edges[ei2].source] || 0) + 1
      inDeg[edges[ei2].target] = (inDeg[edges[ei2].target] || 0) + 1
    }
    for (var ci = 0; ci < nodes.length; ci++) {
      var cid = nodes[ci].id
      if (nodes[ci].type !== "start" && !inDeg[cid] && cid !== startId) {
        edges.push({ id: "e" + String(edges.length + 1), source: startId, target: cid })
        inDeg[cid] = 1
        outDeg[startId] = (outDeg[startId] || 0) + 1
      }
    }
    for (var ci2 = 0; ci2 < nodes.length; ci2++) {
      var cid2 = nodes[ci2].id
      if (nodes[ci2].type !== "end" && !outDeg[cid2] && cid2 !== endId) {
        edges.push({ id: "e" + String(edges.length + 1), source: cid2, target: endId })
        outDeg[cid2] = 1
        inDeg[endId] = (inDeg[endId] || 0) + 1
      }
    }

    var wfName = String(gsPlan.name || "").slice(0, 100) || (String(specRec.getString("name") || "助手方案") + " · 工作流")
    var col = $app.findCollectionByNameOrId("workflows")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("name", wfName)
    rec.set("description", String(gsPlan.description || "").slice(0, 500))
    rec.set("graph", { nodes: nodes, edges: edges })
    rec.set("source", "from_spec")
    rec.set("spec_id", specId)
    $app.save(rec)
    return e.json(200, { ok: true, id: String(rec.id), name: wfName, node_count: nodes.length })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow generate-from-spec error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/workflow-studio/get", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var id = String(qp.id || "").trim()
    if (!id) return e.json(400, { error: "bad_request", message: "缺少工作流 id" })
    var rec = null
    try { rec = $app.findRecordById("workflows", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工作流不存在或已删除" })
    }
    var loadJson = function (r2, field) {
      var s = ""
      try { s = r2.getString(field) } catch (_) { s = "" }
      if (s) {
        try {
          var parsed = JSON.parse(s)
          if (parsed !== null && typeof parsed === "object") return parsed
        } catch (_) {}
      }
      return {}
    }
    var raGet = false
    try { raGet = rec.getBool("require_approval") } catch (_) {}
    return e.json(200, {
      ok: true,
      workflow: {
        id: String(rec.id),
        name: String(rec.getString("name") || ""),
        description: String(rec.getString("description") || ""),
        graph: loadJson(rec, "graph"),
        require_approval: raGet,
        spec_id: String(rec.getString("spec_id") || ""),
        created: String(rec.getString("created") || ""),
        updated: String(rec.getString("updated") || ""),
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow get error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("PATCH", "/api/workflow-studio/update", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var id = String(body.id || "").trim()
    if (!id) return e.json(400, { error: "bad_request", message: "缺少工作流 id" })
    var rec = null
    try { rec = $app.findRecordById("workflows", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工作流不存在或已删除" })
    }
    if (body.name !== undefined) {
      var name = String(body.name || "").trim().slice(0, 100)
      if (!name) return e.json(400, { error: "bad_request", message: "工作流名称不能为空" })
      rec.set("name", name)
    }
    if (body.description !== undefined) rec.set("description", String(body.description || "").slice(0, 500))
    if (body.require_approval !== undefined) rec.set("require_approval", body.require_approval === true)
    if (body.graph !== undefined) {
      var graphIn = body.graph
      if (!graphIn || typeof graphIn !== "object") return e.json(400, { error: "bad_graph", message: "graph 必须是对象" })
      var nodes = graphIn.nodes && typeof graphIn.nodes.length === "number" ? graphIn.nodes : []
      var edges = graphIn.edges && typeof graphIn.edges.length === "number" ? graphIn.edges : []
      if (nodes.length > 40) return e.json(400, { error: "bad_graph", message: "单个工作流最多 40 个节点" })
      rec.set("graph", { nodes: nodes, edges: edges })
    }
    $app.save(rec)
    return e.json(200, { ok: true, id: id, updated: String(rec.getString("updated") || "") })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow update error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/workflow-studio/delete", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var id = String(qp.id || "").trim()
    if (!id) return e.json(400, { error: "bad_request", message: "缺少工作流 id" })
    var rec = null
    try { rec = $app.findRecordById("workflows", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工作流不存在或已删除" })
    }
    $app.delete(rec)
    return e.json(200, { ok: true, id: id })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow delete error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/workflow-studio/duplicate", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var id = String(body.id || "").trim()
    if (!id) return e.json(400, { error: "bad_request", message: "缺少工作流 id" })
    var rec = null
    try { rec = $app.findRecordById("workflows", id) } catch (_) {}
    if (!rec || String(rec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工作流不存在或已删除" })
    }
    var graphStr = ""
    try { graphStr = rec.getString("graph") } catch (_) {}
    var graphObj = { nodes: [], edges: [] }
    if (graphStr) {
      try {
        var gp = JSON.parse(graphStr)
        if (gp && typeof gp === "object") graphObj = gp
      } catch (_) {}
    }
    var col = $app.findCollectionByNameOrId("workflows")
    var nr = new Record(col)
    nr.set("rh_user_id", uid)
    nr.set("name", (String(rec.getString("name") || "未命名工作流") + "（副本）").slice(0, 100))
    nr.set("description", String(rec.getString("description") || ""))
    nr.set("graph", graphObj)
    nr.set("source", "duplicate")
    $app.save(nr)
    return e.json(200, { ok: true, id: String(nr.id) })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow duplicate error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/workflow-runs/start", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub 后再发起运行" })
    var body = (e.requestInfo() || {}).body || {}
    var wfId = String(body.workflow_id || "").trim()
    var instruction = String(body.instruction || "").trim()
    if (!wfId) return e.json(400, { error: "bad_request", message: "缺少工作流" })
    if (!instruction) return e.json(400, { error: "bad_request", message: "请填写本次任务指令" })
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
          kind: "workflow", target: wfId }).one(scheduledLink)
      } catch (_) { return e.json(403, { error: "schedule_link_not_authorized" }) }
      try {
        var alreadyStarted = $app.findRecordById("workflow_runs", scheduledRunId)
        if (alreadyStarted && String(alreadyStarted.get("rh_user_id") || "") === uid &&
            String(alreadyStarted.get("workflow_id") || "") === wfId) {
          return e.json(200, { ok: true, run_id: scheduledRunId, status: String(alreadyStarted.get("status") || "running"), deduplicated: true })
        }
      } catch (_) {}
    }

    var wf = null
    try { wf = $app.findRecordById("workflows", wfId) } catch (_) {}
    if (!wf || String(wf.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "工作流不存在或已删除" })
    }
    var loadJson = function (r2, field) {
      var s = ""
      try { s = r2.getString(field) } catch (_) { s = "" }
      if (s) {
        try {
          var parsed = JSON.parse(s)
          if (parsed !== null && typeof parsed === "object") return parsed
        } catch (_) {}
      }
      return {}
    }
    var graph = loadJson(wf, "graph")
    var nodes = graph && graph.nodes && typeof graph.nodes.length === "number" ? graph.nodes : []
    var edges = graph && graph.edges && typeof graph.edges.length === "number" ? graph.edges : []
    if (nodes.length === 0 || nodes.length > 40) {
      return e.json(400, { error: "bad_graph", message: "工作流至少需要 1 个节点，最多 40 个" })
    }
    // —— graph 合法性校验：唯一开始 / 至少一个结束 / 边端点存在 / 防自环 / 开始无入口 / 结束无出口 / 标题唯一 ——
    var byId = {}
    var titleSeen = {}
    var startId = ""
    var startCount = 0
    var endCount = 0
    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni] || {}
      var nid = String(nd.id || "")
      if (!nid || byId[nid]) return e.json(400, { error: "bad_graph", message: "存在重复或非法的节点 id" })
      byId[nid] = nd
      var ntype = String(nd.type || "")
      if (ntype !== "start" && ntype !== "model" && ntype !== "tool" && ntype !== "agent" && ntype !== "condition" && ntype !== "loop" && ntype !== "end") {
        return e.json(400, { error: "bad_graph", message: "存在未知类型的节点" })
      }
      var data0 = nd.data || {}
      var title0 = String(data0.title || "").trim()
      if (!title0) return e.json(400, { error: "bad_graph", message: "存在没有标题的节点" })
      if (titleSeen[title0]) return e.json(400, { error: "bad_graph", message: "节点标题「" + title0 + "」重复，变量引用需要唯一标题" })
      titleSeen[title0] = nid
      if (ntype === "start") { startCount++; startId = nid }
      if (ntype === "end") endCount++
      if (ntype === "model") {
        var mSel = String(data0.model || "")
        var PLATFORM = { "claude-opus-4.8": 1, "claude-opus-4.7": 1, "qwen3.7-max": 1, "gemini-3.1-flash-lite-preview": 1 }
        if (!mSel) return e.json(400, { error: "bad_graph", message: "模型节点「" + title0 + "」未选择模型" })
        if (!PLATFORM[mSel] && !/^custom:[^:]+:.+$/.test(mSel)) {
          return e.json(400, { error: "bad_graph", message: "模型节点「" + title0 + "」选择了不支持的模型" })
        }
        if (/^custom:/.test(mSel)) {
          var cParts = mSel.split(":")
          var cConn = null
          try { cConn = $app.findRecordById("model_connections", String(cParts[1])) } catch (_) {}
          if (!cConn || String(cConn.get("rh_user_id") || "") !== uid) {
            return e.json(400, { error: "bad_graph", message: "模型节点「" + title0 + "」的自定义连接不存在" })
          }
          var cOn = false
          try { cOn = cConn.getBool("enabled") } catch (_) {}
          if (!cOn) return e.json(400, { error: "bad_graph", message: "模型节点「" + title0 + "」的自定义连接已停用" })
        }
      }
      if (ntype === "agent" && !String(data0.spec_id || "").trim()) {
        return e.json(400, { error: "bad_graph", message: "Agent 节点「" + title0 + "」未关联助手方案" })
      }
      if (ntype === "tool" && !String(data0.tool || "").trim()) {
        return e.json(400, { error: "bad_graph", message: "工具节点「" + title0 + "」未选择工具" })
      }
      if (ntype === "loop") {
        var lMode0 = String(data0.mode || "count")
        if (lMode0 !== "count" && lMode0 !== "list") {
          return e.json(400, { error: "bad_graph", message: "循环节点「" + title0 + "」的循环模式不合法" })
        }
        if (lMode0 === "count") {
          var lCnt0 = parseInt(data0.count, 10)
          if (isNaN(lCnt0) || lCnt0 < 1) {
            return e.json(400, { error: "bad_graph", message: "循环节点「" + title0 + "」的循环次数必须是大于等于 1 的整数" })
          }
        } else {
          if (!String(data0.list_source || "").trim()) {
            return e.json(400, { error: "bad_graph", message: "循环节点「" + title0 + "」未设置列表来源" })
          }
          var lDel0 = String(data0.delimiter || "line")
          if (lDel0 !== "line" && lDel0 !== "comma" && lDel0 !== "json_array") {
            return e.json(400, { error: "bad_graph", message: "循环节点「" + title0 + "」的列表切分方式不合法" })
          }
        }
        if (data0.max_iterations !== undefined && String(data0.max_iterations) !== "") {
          var lMi0 = parseInt(data0.max_iterations, 10)
          if (isNaN(lMi0) || lMi0 < 1 || lMi0 > 20) {
            return e.json(400, { error: "bad_graph", message: "循环节点「" + title0 + "」的最大轮数需为 1-20 的整数" })
          }
        }
      }
    }
    if (startCount !== 1) return e.json(400, { error: "bad_graph", message: "工作流必须有且仅有一个开始节点" })
    if (endCount < 1) return e.json(400, { error: "bad_graph", message: "工作流至少需要一个结束节点" })
    for (var ei = 0; ei < edges.length; ei++) {
      var ed = edges[ei] || {}
      var src = String(ed.source || "")
      var dst = String(ed.target || "")
      if (!byId[src] || !byId[dst]) return e.json(400, { error: "bad_graph", message: "存在悬空连线，请检查" })
      if (src === dst) return e.json(400, { error: "bad_graph", message: "不允许节点连接自己" })
      var srcType = String((byId[src] || {}).type || "")
      var dstType = String((byId[dst] || {}).type || "")
      if (srcType === "end") return e.json(400, { error: "bad_graph", message: "结束节点不能有出口连线" })
      if (dstType === "start") return e.json(400, { error: "bad_graph", message: "开始节点不能有入口连线" })
    }
    // 开始节点必须可达后续（至少一条出口）
    var startHasOut = false
    for (var e2 = 0; e2 < edges.length; e2++) {
      if (String((edges[e2] || {}).source || "") === startId) { startHasOut = true; break }
    }
    if (!startHasOut) return e.json(400, { error: "bad_graph", message: "开始节点还没有连接任何后续节点" })

    // —— 循环节点结构校验：循环体/退出出口有连线、存在回边、循环体不含开始/结束、成环连线目标只允许循环节点 ——
    var outListOf = function (nid) {
      var arr = []
      for (var xi = 0; xi < edges.length; xi++) {
        if (String((edges[xi] || {}).source || "") === nid) arr.push(edges[xi])
      }
      return arr
    }
    var collectFrom = function (seeds, barrierId) {
      var seen = {}
      var stk = []
      for (var sfi = 0; sfi < seeds.length; sfi++) stk.push(String(seeds[sfi] || ""))
      while (stk.length > 0) {
        var cid = String(stk.pop() || "")
        if (!cid || seen[cid]) continue
        seen[cid] = true
        if (cid === barrierId) continue
        var cOuts = outListOf(cid)
        for (var cyi = 0; cyi < cOuts.length; cyi++) stk.push(String((cOuts[cyi] || {}).target || ""))
      }
      return seen
    }
    for (var vli = 0; vli < nodes.length; vli++) {
      if (String((nodes[vli] || {}).type || "") !== "loop") continue
      var vlid = String((nodes[vli] || {}).id || "")
      var vlTitle = String(((nodes[vli] || {}).data || {}).title || "")
      var vlOuts = outListOf(vlid)
      var vlBodySeeds = []
      var vlDoneCount = 0
      for (var vlj = 0; vlj < vlOuts.length; vlj++) {
        if (String((vlOuts[vlj] || {}).sourceHandle || "") === "done") vlDoneCount++
        else vlBodySeeds.push(String((vlOuts[vlj] || {}).target || ""))
      }
      if (vlBodySeeds.length === 0) {
        return e.json(400, { error: "bad_graph", message: "循环节点「" + vlTitle + "」的循环体出口还没有连线" })
      }
      if (vlDoneCount === 0) {
        return e.json(400, { error: "bad_graph", message: "循环节点「" + vlTitle + "」的退出出口还没有连线" })
      }
      var vlSeen = collectFrom(vlBodySeeds, vlid)
      if (!vlSeen[vlid]) {
        return e.json(400, { error: "bad_graph", message: "循环节点「" + vlTitle + "」的循环体缺少回边：请把循环体末端连回该循环节点" })
      }
      for (var vlk in vlSeen) {
        if (vlk === vlid) continue
        var vlkType = String((byId[vlk] || {}).type || "")
        if (vlkType === "start" || vlkType === "end") {
          return e.json(400, { error: "bad_graph", message: "循环节点「" + vlTitle + "」的循环体内不能包含开始 / 结束节点" })
        }
      }
    }
    // 防环校验：移除「目标为循环节点」的边（入口 / 回边豁免）后，剩余图必须无环
    var fwdOutOf = function (nid) {
      var arr = []
      for (var xj = 0; xj < edges.length; xj++) {
        var feDst = String((edges[xj] || {}).target || "")
        if (String((byId[feDst] || {}).type || "") === "loop") continue
        if (String((edges[xj] || {}).source || "") === nid) arr.push(edges[xj])
      }
      return arr
    }
    var collectFwd = function (seeds) {
      var seen = {}
      var stk = []
      for (var sfj = 0; sfj < seeds.length; sfj++) stk.push(String(seeds[sfj] || ""))
      while (stk.length > 0) {
        var cfId = String(stk.pop() || "")
        if (!cfId || seen[cfId]) continue
        seen[cfId] = true
        var cfOuts = fwdOutOf(cfId)
        for (var cfj = 0; cfj < cfOuts.length; cfj++) stk.push(String((cfOuts[cfj] || {}).target || ""))
      }
      return seen
    }
    for (var vci = 0; vci < edges.length; vci++) {
      var vcSrc = String((edges[vci] || {}).source || "")
      var vcDst = String((edges[vci] || {}).target || "")
      if (String((byId[vcDst] || {}).type || "") === "loop") continue
      var vcFwd = collectFwd([vcDst])
      if (vcFwd[vcSrc]) {
        var vcSrcT = String(((byId[vcSrc] || {}).data || {}).title || vcSrc)
        var vcDstT = String(((byId[vcDst] || {}).data || {}).title || vcDst)
        return e.json(400, { error: "bad_graph", message: "连线「" + vcSrcT + " → " + vcDstT + "」会构成环：只有循环节点允许作为回边目标" })
      }
    }

    var col = $app.findCollectionByNameOrId("workflow_runs")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("workflow_id", wfId)
    if (scheduledRunId) rec.set("id", scheduledRunId)
    rec.set("workflow_name", String(wf.getString("name") || "未命名工作流"))
    rec.set("instruction", instruction.slice(0, 2000))
    rec.set("status", "running")
    rec.set("graph_snapshot", { nodes: nodes, edges: edges })
    rec.set("checkpoint", {
      queue: [startId], statuses: {}, outputs: {}, seq: 1, claim_until: 0, done_count: 0,
      harness_stats: { llm_calls: 0, est_prompt_chars: 0, est_out_chars: 0, tool_calls: 0, retries: 0, truncations: 0, approvals: 0 },
      exec_sig: {}, approved_node: "", reject_node: "", pending_approval: null,
      schedule_force_approval: Boolean(scheduledRunId),
    })
    rec.set("result", "")
    rec.set("error", "")
    rec.set("done_nodes", 0)
    rec.set("total_nodes", nodes.length)
    $app.save(rec)

    var evCol = $app.findCollectionByNameOrId("workflow_events")
    var ev = new Record(evCol)
    ev.set("run_id", String(rec.id))
    ev.set("node_id", "")
    ev.set("seq", 1)
    ev.set("event_type", "status")
    ev.set("content", { message: "工作流运行已创建，引擎开始逐节点执行" })
    $app.save(ev)

    return e.json(200, { ok: true, run_id: String(rec.id), status: "running" })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow run start error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/workflow-runs/{id}/cancel", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var run = null
    try { run = $app.findRecordById("workflow_runs", id) } catch (_) {}
    if (!run || String(run.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "运行记录不存在" })
    }
    var st = String(run.get("status"))
    if (st !== "running") return e.json(409, { error: "bad_state", message: "运行已结束（" + st + "），无需取消" })
    var cp = {}
    var cpStr = ""
    try { cpStr = run.getString("checkpoint") } catch (_) { cpStr = "" }
    if (cpStr) {
      try {
        var cpParsed = JSON.parse(cpStr)
        if (cpParsed && typeof cpParsed === "object") cp = cpParsed
      } catch (_) {}
    }
    cp.claim_until = 0
    run.set("status", "cancelled")
    run.set("error", "用户手动取消")
    run.set("checkpoint", cp)
    $app.save(run)
    var evCol = $app.findCollectionByNameOrId("workflow_events")
    var ev = new Record(evCol)
    ev.set("run_id", id)
    ev.set("node_id", "")
    ev.set("seq", Number(cp.seq || 0) + 1)
    ev.set("event_type", "status")
    ev.set("content", { message: "已取消，运行终止；已执行节点的结果保留" })
    $app.save(ev)
    return e.json(200, { ok: true, run_id: id, status: "cancelled" })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow run cancel error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// —— 工作流审批门：awaiting_approval 状态下用户批准/拒绝一次待执行的工具节点调用 ——
// approve：checkpoint 记 approved_node，status 回 running，下次 tick 直接执行该节点；
// reject：checkpoint 记 reject_node，status 回 running，下次 tick 把该节点标 skipped 并按既有出边继续下游。
routerAdd("POST", "/api/workflow-runs/{id}/approve", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var decision = String(body.decision || "")
    if (decision !== "approve" && decision !== "reject") {
      return e.json(400, { error: "bad_request", message: "decision 只支持 approve 或 reject" })
    }
    var id = String(e.request.pathValue("id") || "")
    var run = null
    try { run = $app.findRecordById("workflow_runs", id) } catch (_) {}
    // 归属校验：非本人与不存在一律 404，不泄漏他人运行是否存在
    if (!run || String(run.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "运行记录不存在" })
    }
    var st = String(run.get("status"))
    if (st !== "awaiting_approval") {
      return e.json(409, { error: "bad_state", message: "当前状态（" + st + "）没有等待批准的调用" })
    }
    var cp = {}
    var cpStr = ""
    try { cpStr = run.getString("checkpoint") } catch (_) { cpStr = "" }
    if (cpStr) {
      try {
        var cpParsed = JSON.parse(cpStr)
        if (cpParsed && typeof cpParsed === "object") cp = cpParsed
      } catch (_) {}
    }
    var pending = cp.pending_approval || null
    var pNodeId = pending ? String(pending.node_id || "") : ""
    var pTool = pending ? String(pending.tool || "") : ""
    var pTitle = pending ? String(pending.title || "") : ""
    if (!pNodeId) {
      return e.json(409, { error: "bad_state", message: "待审批信息缺失，无法处理本次决定" })
    }
    var seqN = Number(cp.seq || 0) + 1
    cp.seq = seqN
    cp.claim_until = 0
    cp.pending_approval = null
    var evColA = $app.findCollectionByNameOrId("workflow_events")
    var addApEvent = function (evType, content) {
      try {
        var ev = new Record(evColA)
        ev.set("run_id", id)
        ev.set("node_id", pNodeId)
        ev.set("seq", seqN)
        ev.set("event_type", evType)
        ev.set("content", content)
        $app.save(ev)
      } catch (evErr) {
        try { $app.logger().error("workflow approve addEvent", "err", String((evErr && evErr.message) || evErr)) } catch (_) {}
      }
    }
    if (decision === "approve") {
      cp.approved_node = pNodeId
      cp.reject_node = ""
      run.set("status", "running")
      run.set("checkpoint", cp)
      $app.save(run)
      addApEvent("approval", {
        message: "已批准，引擎将继续执行节点「" + pTitle + "」：" + pTool,
        tool_name: pTool, title: pTitle, node_id: pNodeId, decision: "approve",
      })
    } else {
      cp.approved_node = ""
      cp.reject_node = pNodeId
      run.set("status", "running")
      run.set("checkpoint", cp)
      $app.save(run)
      addApEvent("approval", {
        message: "已拒绝，节点「" + pTitle + "」将被跳过并继续下游",
        tool_name: pTool, title: pTitle, node_id: pNodeId, decision: "reject",
      })
    }
    return e.json(200, { ok: true, run_id: id, status: "running", decision: decision })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow approve error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/workflow-runs/{id}/detail", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "")
    var run = null
    try { run = $app.findRecordById("workflow_runs", id) } catch (_) {}
    if (!run || String(run.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "运行记录不存在" })
    }
    var loadJson = function (r2, field) {
      var s = ""
      try { s = r2.getString(field) } catch (_) { s = "" }
      if (s) {
        try {
          var parsed = JSON.parse(s)
          if (parsed !== null && typeof parsed === "object") return parsed
        } catch (_) {}
      }
      return {}
    }
    var evRows = []
    try {
      evRows = $app.findRecordsByFilter("workflow_events", "run_id = {:rid}", "seq,created", 500, 0, { rid: id })
    } catch (_) {}
    var events = []
    for (var i = 0; i < evRows.length; i++) {
      events.push({
        id: String(evRows[i].id),
        node_id: String(evRows[i].getString("node_id") || ""),
        seq: Number(evRows[i].getInt("seq") || 0),
        event_type: String(evRows[i].getString("event_type") || ""),
        content: loadJson(evRows[i], "content"),
        created: String(evRows[i].getString("created") || ""),
      })
    }
    return e.json(200, {
      ok: true,
      run: {
        id: String(run.id),
        workflow_id: String(run.getString("workflow_id") || ""),
        workflow_name: String(run.getString("workflow_name") || ""),
        instruction: String(run.getString("instruction") || ""),
        status: String(run.getString("status") || ""),
        result: String(run.getString("result") || ""),
        error: String(run.getString("error") || ""),
        done_nodes: Number(run.getInt("done_nodes") || 0),
        total_nodes: Number(run.getInt("total_nodes") || 0),
        checkpoint: loadJson(run, "checkpoint"),
        created: String(run.getString("created") || ""),
        updated: String(run.getString("updated") || ""),
      },
      events: events,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow run detail error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/workflow-runs/recent", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var qp = (e.requestInfo() || {}).query || {}
    var wfId = String(qp.workflow_id || "").trim()
    var limit = parseInt(qp.limit, 10)
    if (isNaN(limit) || limit < 1) limit = 8
    if (limit > 20) limit = 20
    var filter = "rh_user_id = {:uid}"
    var params = { uid: uid }
    if (wfId) {
      filter = "rh_user_id = {:uid} && workflow_id = {:wid}"
      params.wid = wfId
    }
    var rows = $app.findRecordsByFilter("workflow_runs", filter, "-created", limit, 0, params)
    var items = []
    for (var i = 0; i < rows.length; i++) {
      items.push({
        id: String(rows[i].id),
        workflow_id: String(rows[i].getString("workflow_id") || ""),
        workflow_name: String(rows[i].getString("workflow_name") || ""),
        instruction: String(rows[i].getString("instruction") || "").slice(0, 120),
        status: String(rows[i].getString("status") || ""),
        done_nodes: Number(rows[i].getInt("done_nodes") || 0),
        total_nodes: Number(rows[i].getInt("total_nodes") || 0),
        result: String(rows[i].getString("result") || "").slice(0, 200),
        error: String(rows[i].getString("error") || "").slice(0, 200),
        created: String(rows[i].getString("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow runs recent error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

// ————————————————————————————————————————————————
// 执行引擎 tick：每调一次执行一个节点（前端 3s 轮询驱动）
// ————————————————————————————————————————————————
routerAdd("POST", "/api/llm/workflow-engine/{id}/tick", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var keyOverride = String(h["x_rh_api_key"] || h["X-Rh-Api-Key"] || h["x-rh-api-key"] || "")
    // $http.send 响应 body 是字节数组：String() 得逗号串、res.json() 不可靠 → 按 UTF-8 多字节解码
    var logErr = function (where, err) {
      try { $app.logger().error("workflow_engine " + where, "err", String((err && err.message) || err)) } catch (_) {}
    }
    var loadJson = function (rec, field) {
      var s = ""
      try { s = rec.getString(field) } catch (_) { s = "" }
      if (s) {
        try {
          var parsed = JSON.parse(s)
          if (parsed !== null && typeof parsed === "object") return parsed
        } catch (_) {}
      }
      var v = null
      try { v = rec.get(field) } catch (_) {}
      if (v === null || v === undefined) return {}
      if (typeof v === "string") {
        try { return JSON.parse(v) } catch (_) { return {} }
      }
      if (typeof v === "object") return v
      return {}
    }
    var addEvent = function (runId, nodeId, seq, eventType, content) {
      try {
        var col = $app.findCollectionByNameOrId("workflow_events")
        var rec = new Record(col)
        rec.set("run_id", String(runId))
        rec.set("node_id", String(nodeId || ""))
        rec.set("seq", Number(seq) || 0)
        rec.set("event_type", String(eventType))
        rec.set("content", content || {})
        $app.save(rec)
      } catch (err) {
        logErr("addEvent", err)
      }
    }

    var id = String(e.request.pathValue("id") || "")
    var run = null
    try { run = $app.findRecordById("workflow_runs", id) } catch (_) {}
    if (!run || String(run.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "运行记录不存在" })
    }
    var status0 = String(run.get("status"))
    if (status0 !== "running") {
      return e.json(200, { ok: true, run_id: id, status: status0, stepped: false })
    }
    // Provider adapter only loads after owner checks and valid running status.
    var modelWire = require(__hooks + "/modules/model_wire.js")
    var bytesToStr = modelWire.bytesToStr

    // —— 认领防重叠 ——
    var cpRaw = loadJson(run, "checkpoint")
    var tsNow = new Date().getTime()
    var claimUntil = Number(cpRaw.claim_until || 0)
    if (tsNow < claimUntil) {
      return e.json(200, { ok: true, run_id: id, status: "running", stepped: false, busy: true })
    }
    // Authoritative atomic SQLite lease across workers and browser polls.
    var leaseToken = $security.randomString(40)
    var leaseUntil = tsNow + 600000
    var leaseAcquire = null
    try {
      leaseAcquire = $app.db().newQuery(
        "INSERT INTO agent_studio_run_leases(kind, run_id, lease_token, acquired_ms, expires_ms, attempts) " +
        "SELECT 'workflow', {:rid}, {:token}, {:now}, {:until}, 1 " +
        "FROM workflow_runs WHERE id = {:rid} AND rh_user_id = {:uid} AND status = 'running' " +
        "ON CONFLICT(kind, run_id) DO UPDATE SET " +
          "lease_token = excluded.lease_token, acquired_ms = excluded.acquired_ms, " +
          "expires_ms = excluded.expires_ms, attempts = agent_studio_run_leases.attempts + 1 " +
        "WHERE agent_studio_run_leases.expires_ms < {:now}"
      ).bind({ rid: id, uid: uid, token: leaseToken, now: tsNow, until: leaseUntil }).execute()
    } catch (leaseErr) {
      try { $app.logger().error("workflow execution lease unavailable", "err", String(leaseErr)) } catch (_) {}
      return e.json(503, { error: "execution_lease_unavailable", message: "执行租约暂不可用，已禁止非原子回退" })
    }
    if (Number(leaseAcquire.rowsAffected()) !== 1) {
      return e.json(200, { ok: true, run_id: id, status: "running", stepped: false, busy: true })
    }
    try {
    cpRaw.claim_until = leaseUntil
    run.set("checkpoint", cpRaw)
    $app.save(run)

    try {
      // —— 重新加载后执行一个节点 ——
      var wRun = $app.findRecordById("workflow_runs", id)
      if (String(wRun.get("status")) !== "running") throw new Error("run_not_running")
      var cp = loadJson(wRun, "checkpoint")
      var graph = loadJson(wRun, "graph_snapshot")
      var nodes = (graph && graph.nodes) || []
      var edges = (graph && graph.edges) || []
      var instruction = String(wRun.getString("instruction") || "")
      var runId = id
      var queue = cp.queue || []
      var statuses = cp.statuses || {}
      var outputs = cp.outputs || {}
      var seq = Number(cp.seq || 1)
      var loopState = cp.loop_state || {}
      var execCount = Number(cp.exec_count || 0)

      // —— Harness 同步批次：核算 / 卡死防护 / 审批门状态，从 checkpoint 恢复、本 tick 内累积、随 saveCp 持久化 ——
      var hsRawW = cp.harness_stats || {}
      var harnessStats = {
        llm_calls: Number(hsRawW.llm_calls || 0),
        est_prompt_chars: Number(hsRawW.est_prompt_chars || 0),
        est_out_chars: Number(hsRawW.est_out_chars || 0),
        tool_calls: Number(hsRawW.tool_calls || 0),
        retries: Number(hsRawW.retries || 0),
        truncations: Number(hsRawW.truncations || 0),
        approvals: Number(hsRawW.approvals || 0),
      }
      var statsBump = function (field, n) {
        harnessStats[field] = Number(harnessStats[field] || 0) + (Number(n) || 1)
      }
      // 执行签名哈希（djb2 变体）：节点 id + 解析后输入 → 定长字符串，用于同输入卡死循环检测
      var sigHash = function (src0) {
        var h0 = 5381
        var s0 = String(src0 || "")
        for (var sh0 = 0; sh0 < s0.length; sh0++) {
          h0 = (h0 * 33 + s0.charCodeAt(sh0)) | 0
        }
        return String(h0 >>> 0)
      }
      var execSig = cp.exec_sig || {}
      var approvedNode = String(cp.approved_node || "")
      var rejectNode = String(cp.reject_node || "")
      var pendingApproval = cp.pending_approval || null
      var requireApproval = false
      try {
        var wfRecGate = $app.findRecordById("workflows", String(wRun.getString("workflow_id") || ""))
        requireApproval = wfRecGate.getBool("require_approval")
      } catch (_) {}
      // 结果脱敏：节点输出 / 最终成果统一抹疑似钥匙模式
      if (cp.schedule_force_approval === true) requireApproval = true
      var sanitizeSecrets = function (s) {
        return String(s || "")
          .replace(/sk-[A-Za-z0-9_-]{8,}/g, "***")
          .replace(/Bearer\s+\S+/g, "Bearer ***")
          .replace(/token=\S+/g, "token=***")
          .replace(/api_key=\S+/g, "api_key=***")
      }

      var byId = {}
      var byTitle = {}
      for (var ni = 0; ni < nodes.length; ni++) {
        var nd = nodes[ni] || {}
        byId[String(nd.id)] = nd
        var tt = String((nd.data || {}).title || "")
        if (tt) byTitle[tt] = String(nd.id)
      }

      var PLATFORM_MODEL_IDS = {
        "claude-opus-4.8": "anthropic/claude-opus-4.8",
        "claude-opus-4.7": "anthropic/claude-opus-4.7",
        "qwen3.7-max": "qwen/qwen3.7-max",
        "gemini-3.1-flash-lite-preview": "google/gemini-3.1-flash-lite-preview",
      }
      var modelRepo = require(__hooks + "/modules/model_connections.js")
      var callLlm = function (modelId, messages, maxTokens) {
        // 自备密钥批次：内置通道已移除；平台模型名由 callNodeLlm 回落用户默认连接处理，直达此处即无连接
        return { ok: false, error: "model_connection_required", detail: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接" }
      }
      var callCustomLlmBase = function (connId, modelId, messages, maxTokens) {
        var resolved = modelRepo.lookup($app, uid, connId, modelId, {
          secretKey: String($os.getenv("AGENT_STUDIO_SECRET_KEY") || ""),
          decrypt: function (blob, key) { return String($security.decrypt(blob, key)) },
        })
        if (!resolved.ok) return resolved
        var cBase = resolved.baseUrl
        var cKey = resolved.apiKey
        var cProv = resolved.provider
        var cSanitize = function (s) {
          return String(s || "").replace(/([?&]key=)[^&\s"']+/g, "$1***")
        }
        var cModel = String(modelId || "")
        var cRes = null
        try {
          cRes = $http.send(require(__hooks + "/modules/model_request.js").buildRequest(cProv, {
            baseUrl: cBase, apiKey: cKey, model: cModel, messages: messages,
            maxTokens: maxTokens, timeout: 25,
          }))
        } catch (cerr) {
          var cRaw = String((cerr && cerr.message) || cerr)
          if (/timeout/i.test(cRaw)) return { ok: false, error: "custom_" + cProv + "_timeout", detail: "自定义模型调用超时（25 秒）" }
          return { ok: false, error: "custom_" + cProv + "_request_failed", detail: cSanitize(cRaw).slice(0, 300) }
        }
        if (!cRes || cRes.statusCode < 200 || cRes.statusCode >= 300) {
          var cCode = cRes ? cRes.statusCode : 0
          return { ok: false, error: "custom_" + cProv + "_http_" + cCode, detail: cSanitize(bytesToStr(cRes).slice(0, 300)) }
        }
        var cData = null
        try { cData = JSON.parse(bytesToStr(cRes)) } catch (_) {}
        var cContent = modelWire.extractContent(cProv, cData)
        if (!cContent) return { ok: false, error: "custom_" + cProv + "_empty_content", detail: "" }
        return { ok: true, content: cContent }
      }

      // Persist privacy-safe spans for every actual model attempt.
      var callCustomLlm = function (connId, modelId, messages, maxTokens) {
        var startedAt = new Date().getTime()
        var outcome = callCustomLlmBase(connId, modelId, messages, maxTokens)
        try {
          require(__hooks + "/modules/execution_trace.js").record($app, {
            owner: uid, runId: id, kind: "workflow",
            spanId: $security.randomString(15), stepRef: String(seq),
            operation: "model",
            status: outcome && outcome.ok === true ? "succeeded" : "failed",
            errorCode: outcome && outcome.error ? String(outcome.error) : "model_error",
            durationMs: new Date().getTime() - startedAt,
          })
        } catch (_) { /* Observability must not block the workflow runner. */ }
        return outcome
      }
      var callNodeLlm = function (modelSel, messages, maxTokens) {
        // harness_stats：每次模型节点 LLM 调用按发送/返回字符累加
        var pCharsW = 0
        for (var pwi = 0; pwi < messages.length; pwi++) {
          pCharsW += String((messages[pwi] || {}).content || "").length
        }
        statsBump("llm_calls", 1)
        statsBump("est_prompt_chars", pCharsW)
        var llmRet = null
        var sel = String(modelSel || "")
        if (sel.indexOf("custom:") === 0) {
          var ps = sel.split(":")
          llmRet = callCustomLlm(ps[1], ps.slice(2).join(":"), messages, maxTokens)
        } else {
          // 非 custom 选择（含存量平台模型名）：统一回落当前用户默认模型连接
          var selectedDefault = modelRepo.getDefault($app, uid)
          if (!selectedDefault) {
            llmRet = { ok: false, error: "model_connection_required", detail: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接" }
          } else {
            llmRet = callCustomLlm(selectedDefault.connection_id, selectedDefault.model_id, messages, maxTokens)
          }
        }
        if (llmRet && llmRet.ok === true) statsBump("est_out_chars", String(llmRet.content || "").length)
        return llmRet
      }
      // 变量替换：{{input}} → 任务指令；{{节点标题.output}} → 上游节点输出；{{loop.item}}/{{loop.index}} → 当前循环轮上下文；找不到 → 空串并记录
      var curLoopCtx = null
      var renderTemplate = function (tpl, missing) {
        return String(tpl || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (m, key) {
          var k = String(key).trim()
          if (k === "input") return instruction
          if (k === "loop.item") {
            if (curLoopCtx) return String(curLoopCtx.item)
            if (missing) missing.push(k)
            return ""
          }
          if (k === "loop.index") {
            if (curLoopCtx) return String(curLoopCtx.round)
            if (missing) missing.push(k)
            return ""
          }
          var suf = ".output"
          if (k.length > suf.length && k.substring(k.length - suf.length) === suf) {
            var title = k.substring(0, k.length - suf.length)
            var nid = byTitle[title]
            if (nid && outputs[nid] !== undefined) return String(outputs[nid])
            if (missing) missing.push(k)
            return ""
          }
          if (missing) missing.push(k)
          return ""
        })
      }
      // 计算器：递归下降求值（与 agent_engine 相同实现）
      var evalExpr = require(__hooks + "/modules/tool_calculator.js").evaluate
      var knowledgeSearch = function (corpus, query) {
        var kwRaw = String(query || "").toLowerCase().split(/[\s,，。;；、！？!?]+/)
        var keywords = []
        for (var k = 0; k < kwRaw.length; k++) {
          if (kwRaw[k].length >= 1) keywords.push(kwRaw[k])
        }
        if (keywords.length === 0) return "检索词为空"
        if (!corpus) return "暂无可检索的内容"
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
        scored.sort(function (x, y) { return y.score - x.score })
        if (scored.length === 0) return "未找到与「" + String(query || "") + "」相关的片段"
        var out = []
        for (var t = 0; t < scored.length && t < 3; t++) out.push(scored[t].text)
        return out.join("\n---\n")
      }
      // Return source-labelled passages from the owned knowledge bases, not arbitrary workflow text.
      // Every lookup rechecks tenant ownership so forged or deleted base IDs cannot leak data.
      // Same owner-scoped contract is used by REST and Agent execution.
      var searchLinkedKnowledge = function (baseIds, query) {
        var service = require(__hooks + "/modules/knowledge_search.js")
        try {
          return service.formatForAgent(service.search($app, uid, baseIds, query, 4), query)
        } catch (retrievalErr) {
          return service.missingOrErrorMessage(retrievalErr)
        }
      }
      var PREVIEW_NET_HINT = "预览环境可能无法访问该外部地址，发布后重试。"
      // 工具调用日志落库（tool_invocations，source=workflow；uid/runId 来自本 tick 闭包）
      var writeInvocation = function (toolName, toolKind, status, latencyMs, inputSummary, outputExcerpt, errorCode, retriedFlag) {
        try {
          var invCol = $app.findCollectionByNameOrId("tool_invocations")
          var invRec = new Record(invCol)
          invRec.set("rh_user_id", String(uid))
          invRec.set("tool_name", String(toolName || "").slice(0, 100))
          invRec.set("tool_kind", String(toolKind || "builtin"))
          invRec.set("source", "workflow")
          invRec.set("run_id", String(runId || "").slice(0, 60))
          invRec.set("status", String(status || "failed"))
          invRec.set("latency_ms", Number(latencyMs) || 0)
          invRec.set("input_summary", String(inputSummary || "").slice(0, 500))
          invRec.set("output_excerpt", String(outputExcerpt || "").slice(0, 1000))
          invRec.set("error_code", String(errorCode || "").slice(0, 100))
          invRec.set("retried", retriedFlag === true)
          $app.save(invRec)
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
        if (!/^https?:\/\//i.test(u)) return { ok: false, error: "bad_url", message: "仅支持以 http:// 或 https:// 开头的地址" }
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
          if (/timeout/i.test(raw)) return { ok: false, error: "web_fetch_timeout", message: "目标地址 25 秒内无响应（web_fetch_timeout）。" + PREVIEW_NET_HINT }
          return { ok: false, error: "web_fetch_unreachable", message: "目标地址不通（web_fetch_unreachable）：" + raw.slice(0, 160) + "。" + PREVIEW_NET_HINT }
        }
        if (!res || res.statusCode < 200 || res.statusCode >= 300) {
          var code = res ? Number(res.statusCode || 0) : 0
          return { ok: false, error: "web_fetch_http_" + code, message: "目标页面返回错误（HTTP " + code + "）：" + stripTags(bytesToStr(res)).slice(0, 200) }
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
        if (!text) return { ok: true, output: "（该页面没有可提取的正文文本）" }
        return { ok: true, output: text.slice(0, 4000) }
      }
      // 网页搜索：DuckDuckGo HTML 端点，解析 ≤10 条标题/摘要/链接；端点不可达返回结构化错误不硬重试
      var webSearchOnce = function (query, limitN) {
        var q = String(query || "").trim()
        if (!q) return { ok: false, error: "empty_query", message: "搜索关键词为空" }
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
          if (/timeout/i.test(raw)) return { ok: false, error: "web_search_timeout", message: "搜索服务 25 秒内无响应（web_search_timeout）。" + PREVIEW_NET_HINT }
          return { ok: false, error: "web_search_unreachable", message: "搜索服务不可达（web_search_unreachable）：" + raw.slice(0, 160) + "。" + PREVIEW_NET_HINT }
        }
        if (!res || res.statusCode < 200 || res.statusCode >= 300) {
          var code = res ? Number(res.statusCode || 0) : 0
          return { ok: false, error: "web_search_http_" + code, message: "搜索服务返回错误（HTTP " + code + "）。" + PREVIEW_NET_HINT }
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
          return { ok: true, output: "未搜索到与「" + q + "」相关的结果（也可能是搜索服务临时拦截，可稍后再试）" }
        }
        var lines = []
        for (var li = 0; li < results.length; li++) {
          lines.push((li + 1) + ". " + results[li].title + "\n   " + results[li].url + (results[li].snippet ? "\n   " + results[li].snippet : ""))
        }
        return { ok: true, output: lines.join("\n") }
      }

      var saveCp = function (extraStatus) {
        try {
          var r2 = $app.findRecordById("workflow_runs", runId)
          var doneCount = 0
          if (String(r2.get("status") || "") === "cancelled") return
          for (var sk in statuses) {
            if (statuses[sk] === "done") doneCount++
          }
          cp.queue = queue
          cp.statuses = statuses
          cp.outputs = outputs
          cp.seq = seq
          cp.done_count = doneCount
          cp.claim_until = 0
          cp.loop_state = loopState
          cp.exec_count = execCount
          cp.harness_stats = harnessStats
          cp.exec_sig = execSig
          cp.approved_node = approvedNode
          cp.reject_node = rejectNode
          cp.pending_approval = pendingApproval
          r2.set("checkpoint", cp)
          r2.set("done_nodes", doneCount)
          if (extraStatus) {
            r2.set("status", String(extraStatus.status || ""))
            if (extraStatus.result !== undefined) r2.set("result", String(extraStatus.result))
            if (extraStatus.error !== undefined) r2.set("error", String(extraStatus.error))
          }
          $app.save(r2)
        } catch (err) {
          logErr("saveCp", err)
        }
      }

      // 入边/出边
      var inEdgesOf = function (nid) {
        var arr = []
        for (var i = 0; i < edges.length; i++) {
          if (String((edges[i] || {}).target || "") === nid) arr.push(edges[i])
        }
        return arr
      }
      var outEdgesOf = function (nid) {
        var arr = []
        for (var i = 0; i < edges.length; i++) {
          if (String((edges[i] || {}).source || "") === nid) arr.push(edges[i])
        }
        return arr
      }
      // 循环体子图（body 出口可达、不穿越循环自身）——就绪判定里豁免回边用
      var bodySubtreeOf = function (loopId) {
        var bsSeen = {}
        var bsStk = []
        var bsOuts = outEdgesOf(loopId)
        for (var bsi = 0; bsi < bsOuts.length; bsi++) {
          if (String((bsOuts[bsi] || {}).sourceHandle || "") === "done") continue
          bsStk.push(String((bsOuts[bsi] || {}).target || ""))
        }
        while (bsStk.length > 0) {
          var bsId = String(bsStk.pop() || "")
          if (!bsId || bsSeen[bsId] || bsId === loopId) continue
          bsSeen[bsId] = true
          var bsNext = outEdgesOf(bsId)
          for (var bsj = 0; bsj < bsNext.length; bsj++) bsStk.push(String((bsNext[bsj] || {}).target || ""))
        }
        return bsSeen
      }
      // 目标节点所有入边源头均已有终态（done/skipped/failed）时入队；ignoreId 用于循环体内豁免循环节点自身（活跃中无状态）
      var tryReady = function (tid, ignoreId) {
        if (!tid || statuses[tid] || queue.indexOf(tid) >= 0) return
        var ins = inEdgesOf(tid)
        if (ins.length === 0) return
        // loop 目标：源头在其循环体子图内的入边是回边，不参与就绪判定（否则首轮永远等不到）
        var trBody = String((byId[tid] || {}).type || "") === "loop" ? bodySubtreeOf(tid) : null
        for (var i = 0; i < ins.length; i++) {
          var s = String(ins[i].source || "")
          if (ignoreId && s === ignoreId) continue
          if (trBody && trBody[s]) continue
          if (!statuses[s]) return
        }
        queue.push(tid)
      }
      // 条件未走分支：目标的所有入边都「死」了才标记 skipped，并继续向下传播（汇合节点不误杀）
      var skipSubtree = function (tid, condId, deadHandle, depth) {
        if (!tid || statuses[tid] || depth > 60) return
        var ins = inEdgesOf(tid)
        if (ins.length === 0) return
        // loop 目标：回边（源头在其循环体子图内）不参与「全死」判定
        var skBody = String((byId[tid] || {}).type || "") === "loop" ? bodySubtreeOf(tid) : null
        var allDead = true
        for (var i = 0; i < ins.length; i++) {
          var s = String(ins[i].source || "")
          var sh = String(ins[i].sourceHandle || "")
          if (skBody && skBody[s]) continue
          var dead = false
          if (statuses[s] === "skipped") dead = true
          else if (s === condId && sh === deadHandle) dead = true
          if (!dead) { allDead = false; break }
        }
        if (!allDead) return
        statuses[tid] = "skipped"
        seq++
        addEvent(runId, tid, seq, "node_skipped", {
          title: String(((byId[tid] || {}).data || {}).title || ""),
          reason: "所在分支未被条件选中，节点跳过",
        })
        var outs = outEdgesOf(tid)
        for (var j = 0; j < outs.length; j++) {
          skipSubtree(String(outs[j].target || ""), condId, deadHandle, depth + 1)
        }
      }

      // —— 循环引擎 helper ——
      var inBodySet = function (st, nid) {
        if (!st || !st.body || typeof st.body.length !== "number") return false
        for (var ibs = 0; ibs < st.body.length; ibs++) {
          if (String(st.body[ibs]) === String(nid)) return true
        }
        return false
      }
      // 开始新一轮：重置循环体节点状态、清出队列中残留的循环体节点，再把循环体入口入队
      var startLoopRound = function (loopId, st) {
        var bodyArr = (st && st.body) || []
        for (var rbi = 0; rbi < bodyArr.length; rbi++) {
          delete statuses[String(bodyArr[rbi])]
        }
        var nq = []
        for (var rqi = 0; rqi < queue.length; rqi++) {
          if (!inBodySet(st, String(queue[rqi]))) nq.push(queue[rqi])
        }
        queue = nq
        var lOuts = outEdgesOf(loopId)
        for (var loi = 0; loi < lOuts.length; loi++) {
          if (String((lOuts[loi] || {}).sourceHandle || "") === "done") continue
          var bt = String((lOuts[loi] || {}).target || "")
          if (bt && inBodySet(st, bt) && !statuses[bt] && queue.indexOf(bt) < 0) queue.push(bt)
        }
      }
      // 回边到达循环节点：round+1 判终止；终止则 loop node_done 并推进退出出口下游，否则进入下一轮
      var advanceLoopRound = function (loopId, lastOutput) {
        var bst = loopState[loopId]
        if (!bst || !bst.active) return
        var bRound = Number(bst.round || 1)
        bst.last_output = String(lastOutput === undefined || lastOutput === null ? "" : lastOutput)
        var bStopKw = String(bst.stop_keyword || "")
        var bTerm = false
        var bReason = ""
        if (bStopKw && bst.last_output.indexOf(bStopKw) >= 0) {
          bTerm = true
          bReason = "命中提前终止关键词「" + bStopKw + "」"
        } else if (bRound >= Number(bst.total || bRound)) {
          bTerm = true
          bReason = String(bst.mode || "count") === "count" ? "已完成设定次数" : "列表项已遍历完"
        }
        var bTitle = String(((byId[loopId] || {}).data || {}).title || "循环")
        if (bTerm) {
          statuses[loopId] = "done"
          var bSummary = "循环结束，共执行 " + bRound + " 轮" + (bReason ? "（" + bReason + "）" : "")
          var bOutText = bst.last_output ? bst.last_output + "\n\n（" + bSummary + "）" : "（" + bSummary + "）"
          outputs[loopId] = bOutText.slice(0, 4000)
          seq++
          addEvent(runId, loopId, seq, "node_done", {
            title: bTitle, type: "loop", input: "循环体末轮输出",
            output: bOutText.slice(0, 2000),
            elapsed_ms: bst.started_at ? new Date().getTime() - Number(bst.started_at) : 0,
            note: bReason, round: bRound, total: Number(bst.total || bRound),
          })
          bst.active = false
          bst.round = bRound
          var bOuts = outEdgesOf(loopId)
          for (var boi = 0; boi < bOuts.length; boi++) {
            if (String((bOuts[boi] || {}).sourceHandle || "") === "done") tryReady(String((bOuts[boi] || {}).target || ""))
          }
        } else {
          bst.round = bRound + 1
          startLoopRound(loopId, bst)
        }
      }

      // —— 取下一个待执行节点 ——
      var nextId = ""
      while (queue.length > 0) {
        var cand = String(queue.shift())
        if (!statuses[cand]) { nextId = cand; break }
      }
      if (!nextId) {
        seq++
        saveCp(null)
        addEvent(runId, "", seq, "status", { message: "执行队列已空但未到达结束节点，运行终止" })
        saveCp({ status: "failed", error: "流程中断：没有可执行的后继节点，且未到达结束节点" })
        return e.json(200, { ok: true, run_id: id, status: "failed", stepped: true })
      }
      var node = byId[nextId]
      if (!node) {
        statuses[nextId] = "skipped"
        saveCp(null)
        return e.json(200, { ok: true, run_id: id, status: "running", stepped: true })
      }
      var nType = String(node.type || "")
      var nData = node.data || {}
      var nTitle = String(nData.title || nType)
      // 循环上下文：当前节点若属于某个活跃循环的循环体，提供 loop.item / loop.index 与事件 round
      curLoopCtx = null
      for (var clKey in loopState) {
        var clSt = loopState[clKey]
        if (clSt && clSt.active && inBodySet(clSt, nextId)) {
          var clRound = Number(clSt.round || 1)
          var clItem = String(clRound)
          if (String(clSt.mode || "count") === "list") clItem = String((clSt.items || [])[clRound - 1] || "")
          curLoopCtx = { loopId: String(clKey), round: clRound, item: clItem, st: clSt }
          break
        }
      }
      // —— 审批门：require_approval 开启时，目标为写操作（tool_connections method≠GET 或 mkt__ 市场工具）的
      // 工具节点不直接执行，转 awaiting_approval 释放认领，等用户在 approve 路由上决定 ——
      if (nType === "tool" && requireApproval && approvedNode !== nextId && rejectNode !== nextId) {
        var gateTool = String(nData.tool || "").trim()
        var policyService = require(__hooks + "/modules/tool_policy.js")
        var gateMarket = gateTool.indexOf("mkt__") === 0
        var gateNeeded = policyService.classify({
          toolName: gateTool, market: gateMarket, requireApproval: true
        }).requiresApproval
        if (!gateMarket) {
          var gateRows = []
          try {
            gateRows = $app.findRecordsByFilter("tool_connections", "rh_user_id = {:uid} && enabled = true", "-created", 100, 0, { uid: uid })
          } catch (gateQErr) {
            logErr("gate load tool_connections", gateQErr)
          }
          for (var gti = 0; gti < gateRows.length; gti++) {
            var gtName = ""
            try { gtName = String(gateRows[gti].getString("name") || "") } catch (_) {}
            if (gtName !== gateTool) continue
            var gtMethod = "POST"
            try { gtMethod = String(gateRows[gti].getString("method") || "POST").toUpperCase() } catch (_) {}
            gateNeeded = policyService.classify({
              toolName: gateTool, external: true, method: gtMethod, requireApproval: true
            }).requiresApproval
            break
          }
        }
        if (gateNeeded) {
          var gateMissing = []
          var gateParams = renderTemplate(String(nData.params_template || ""), gateMissing)
          if (gateParams.length > 8000) gateParams = gateParams.slice(0, 8000) + "\n…已截断"
          var gateSummary = gateParams.slice(0, 300)
          statsBump("approvals", 1)
          seq++
          var gateContent = {
            message: "等待你的批准：节点「" + nTitle + "」将调用工具 " + gateTool,
            node_id: nextId, title: nTitle, tool_name: gateTool, input_summary: gateSummary,
          }
          if (curLoopCtx) gateContent.round = curLoopCtx.round
          addEvent(runId, nextId, seq, "approval_pending", gateContent)
          pendingApproval = { node_id: nextId, tool: gateTool, title: nTitle, input_summary: gateSummary }
          approvedNode = ""
          // 节点未执行：放回队列头，不消耗 execCount，不写 node_start
          queue.unshift(nextId)
          saveCp({ status: "awaiting_approval" })
          return e.json(200, { ok: true, run_id: id, status: "awaiting_approval", stepped: false, node_id: nextId })
        }
      }
      if (approvedNode === nextId) approvedNode = ""
      // —— 审批拒绝：该节点标 skipped，写拒绝说明事件，按既有出边继续下游（含循环回边推进）——
      if (rejectNode === nextId) {
        rejectNode = ""
        pendingApproval = null
        var rejTool = String(nData.tool || "").trim()
        statuses[nextId] = "skipped"
        seq++
        var rejSkipContent = {
          title: nTitle, type: nType,
          reason: "用户拒绝了这次调用：" + rejTool,
          tool_name: rejTool, decision: "reject",
        }
        if (curLoopCtx) rejSkipContent.round = curLoopCtx.round
        addEvent(runId, nextId, seq, "node_skipped", rejSkipContent)
        seq++
        var rejObsContent = { message: "用户拒绝了这次调用：" + rejTool, tool_name: rejTool, decision: "reject" }
        if (curLoopCtx) rejObsContent.round = curLoopCtx.round
        addEvent(runId, nextId, seq, "observation", rejObsContent)
        var rejOuts = outEdgesOf(nextId)
        var rejBackLoopId = ""
        for (var rji = 0; rji < rejOuts.length; rji++) {
          var rjT = String((rejOuts[rji] || {}).target || "")
          if (String((byId[rjT] || {}).type || "") === "loop" && loopState[rjT] && loopState[rjT].active && inBodySet(loopState[rjT], nextId)) {
            rejBackLoopId = rjT
            continue
          }
          if (curLoopCtx && inBodySet(curLoopCtx.st, rjT)) tryReady(rjT, curLoopCtx.loopId)
          else tryReady(rjT)
        }
        if (rejBackLoopId) advanceLoopRound(rejBackLoopId, "用户拒绝了这次调用：" + rejTool)
        saveCp(null)
        return e.json(200, { ok: true, run_id: id, status: "running", stepped: true, node_id: nextId })
      }

      // —— 输入截断（上下文管理）+ 卡死防护签名：模型/工具节点占位符解析后统一处理 ——
      var harnessInput = null
      if (nType === "model" || nType === "tool" || nType === "agent") {
        var hMissing = []
        var hTpl = nType === "model" ? String(nData.prompt || "") : nType === "agent" ? (String(nData.prompt || "") || "{{input}}") : String(nData.params_template || "")
        var hText = renderTemplate(hTpl, hMissing)
        var hTrunc = false
        if (hText.length > 8000) {
          hText = hText.slice(0, 8000) + "\n…已截断"
          statsBump("truncations", 1)
          hTrunc = true
        }
        harnessInput = { raw: hText, missing: hMissing, truncated: hTrunc }
        var hSig = String(nextId) + "|" + sigHash(hText)
        var hEntry = execSig[hSig]
        if (!hEntry || typeof hEntry !== "object") hEntry = { count: 0, samples: [] }
        hEntry.count = Number(hEntry.count || 0) + 1
        if (!hEntry.samples || typeof hEntry.samples.length !== "number") hEntry.samples = []
        if (hEntry.samples.length < 3) hEntry.samples.push(hText.slice(0, 120))
        execSig[hSig] = hEntry
        if (hEntry.count >= 3) {
          statuses[nextId] = "failed"
          seq++
          var stuckContent = {
            title: nTitle, type: nType,
            error: "stuck_loop_detected：该节点以完全相同的输入已执行 3 次，疑似卡死循环，运行终止",
            detail: "三次输入摘要（各截 120 字符）：① " + String(hEntry.samples[0] || "") + " ② " + String(hEntry.samples[1] || "") + " ③ " + String(hEntry.samples[2] || ""),
          }
          if (curLoopCtx) stuckContent.round = curLoopCtx.round
          addEvent(runId, nextId, seq, "node_failed", stuckContent)
          seq++
          addEvent(runId, "", seq, "status", { message: "运行失败：检测到卡死循环（同一节点相同输入连续执行 3 次）" })
          saveCp({ status: "failed", error: "stuck_loop_detected（同一节点相同输入连续执行 3 次，疑似卡死循环，已终止）" })
          return e.json(200, { ok: true, run_id: id, status: "failed", stepped: true, node_id: nextId })
        }
      }

      // 全 run 节点执行总次数硬顶（防失控循环）
      if (execCount >= 200) {
        statuses[nextId] = "failed"
        seq++
        addEvent(runId, nextId, seq, "node_failed", {
          title: nTitle, type: nType,
          error: "节点执行总次数已达上限（200 次），运行强制终止以防失控循环", detail: "",
        })
        seq++
        addEvent(runId, "", seq, "status", { message: "运行失败：节点执行总次数超过 200 次上限" })
        saveCp({ status: "failed", error: "节点执行总次数超过上限（200 次），已终止以防失控循环" })
        return e.json(200, { ok: true, run_id: id, status: "failed", stepped: true, node_id: nextId })
      }
      execCount++
      seq++
      var startContent = { title: nTitle, type: nType }
      if (curLoopCtx) startContent.round = curLoopCtx.round
      addEvent(runId, nextId, seq, "node_start", startContent)
      var t0 = new Date().getTime()

      var failNode = function (errText, detailText) {
        statuses[nextId] = "failed"
        seq++
        var failContent = { title: nTitle, type: nType, error: String(errText).slice(0, 500), detail: String(detailText || "").slice(0, 400) }
        if (toolRetried === true) failContent.retried = true
        if (curLoopCtx) failContent.round = curLoopCtx.round
        addEvent(runId, nextId, seq, "node_failed", failContent)
        seq++
        addEvent(runId, "", seq, "status", { message: "运行失败：节点「" + nTitle + "」执行出错" })
        saveCp({ status: "failed", error: "节点「" + nTitle + "」失败：" + String(errText).slice(0, 300) })
      }

      var output = ""
      var inputSummary = ""
      var note = ""
      var condMet = false
      var nodeErr = ""
      var nodeErrDetail = ""
      var finished = false
      // 重试对齐批次：工具节点网络类失败重试标记（node_done/node_failed 事件与 tool_invocations 共用）
      var toolRetried = false

      if (nType === "start") {
        output = instruction
        inputSummary = "任务指令"
      } else if (nType === "end") {
        var missingEnd = []
        var tpl = String(nData.output_template || "")
        if (tpl) {
          output = renderTemplate(tpl, missingEnd)
        } else {
          // 默认：取第一条已完成入边的输出
          var ins0 = inEdgesOf(nextId)
          for (var ii = 0; ii < ins0.length; ii++) {
            var sid = String(ins0[ii].source || "")
            if (statuses[sid] === "done" && outputs[sid] !== undefined) { output = String(outputs[sid]); break }
          }
        }
        inputSummary = tpl ? "输出模板渲染" : "默认取上游节点输出"
        if (missingEnd.length > 0) note = "以下变量未找到，已替换为空：" + missingEnd.join("、")
        var endSafe = sanitizeSecrets(String(output))
        statuses[nextId] = "done"
        outputs[nextId] = endSafe.slice(0, 4000)
        seq++
        addEvent(runId, nextId, seq, "node_done", {
          title: nTitle, type: nType, input: inputSummary,
          output: endSafe.slice(0, 2000), elapsed_ms: new Date().getTime() - t0, note: note,
        })
        seq++
        addEvent(runId, "", seq, "status", { message: "到达结束节点，运行完成" })
        saveCp({ status: "succeeded", result: endSafe.slice(0, 20000), error: "" })
        finished = true
      } else if (nType === "model") {
        var missingM = harnessInput ? harnessInput.missing : []
        var prompt = harnessInput ? harnessInput.raw : renderTemplate(String(nData.prompt || ""), missingM)
        inputSummary = prompt.slice(0, 600)
        if (harnessInput && harnessInput.truncated) inputSummary = inputSummary + "\n…已截断"
        if (missingM.length > 0) note = "以下变量未找到，已替换为空：" + missingM.join("、")
        if (!prompt.trim()) {
          nodeErr = "模型节点提示词为空（或变量渲染后为空）"
        } else {
          var llmRes = callNodeLlm(String(nData.model || ""), [{ role: "user", content: prompt.slice(0, 12000) }], 4096)
          if (llmRes.ok) output = sanitizeSecrets(String(llmRes.content))
          else {
            nodeErr = "模型调用失败：" + llmRes.error
            nodeErrDetail = String(llmRes.detail || "")
          }
        }
      } else if (nType === "agent") {
        // —— 多 Agent 调度批次：agent 节点 = 角色卡（助手方案）+ 有界思考-行动循环（内置工具）——
        var agSpecRec = null
        try { agSpecRec = $app.findRecordById("agent_specs", String(nData.spec_id || "")) } catch (_) {}
        if (!agSpecRec || String(agSpecRec.get("rh_user_id") || "") !== uid) {
          nodeErr = "Agent 节点未关联有效助手方案，请在画布配置里重新选择"
        } else {
          var agSpec = {}
          try { agSpec = JSON.parse(agSpecRec.getString("spec") || "{}") || {} } catch (_) {}
          var agInput = harnessInput ? harnessInput.raw : renderTemplate(String(nData.prompt || "") || "{{input}}", [])
          if (harnessInput && harnessInput.missing.length > 0) note = "以下变量未找到，已替换为空：" + harnessInput.missing.join("、")
          if (harnessInput && harnessInput.truncated) inputSummary = agInput.slice(0, 600) + "\n…已截断"
          else inputSummary = agInput.slice(0, 600)
          var agStepsMax = 3
          var agMsP = parseInt(nData.max_steps, 10)
          if (!isNaN(agMsP) && agMsP >= 1) agStepsMax = agMsP
          if (agStepsMax > 5) agStepsMax = 5
          var agRole = [
            "你是多 Agent 流水线中的「" + nTitle + "」角色，职责由以下助手方案定义：",
            "目标：" + String(agSpec.goal || ""),
            "任务范围：" + String(agSpec.task_scope || ""),
            "交付物：" + (Array.isArray(agSpec.deliverables) ? agSpec.deliverables.join("；") : ""),
            "完成标准：" + (Array.isArray(agSpec.done_criteria) ? agSpec.done_criteria.join("；") : ""),
            "工作方式：每轮只输出一个 JSON 对象：{\"think\":\"简短思考\",\"action\":\"tool 或 answer\",\"tool\":\"calculate|summarize|knowledge_search|web_fetch|web_search\",\"params\":{},\"answer\":\"最终交付物\"}。",
            "action=tool 时系统会真实执行工具并把结果回给你；action=answer 时 answer 字段即本节点输出，交给下游 Agent。",
            "params 格式：calculate {expression}；summarize {text,focus}；knowledge_search {query}；web_fetch {url}；web_search {query,limit}。",
            "只输出 JSON 对象，不要解释、不要 markdown 围栏。",
          ].join("\n")
          var agMessages = [
            { role: "system", content: agRole },
            { role: "user", content: "上游输入 / 任务指令：\n" + agInput.slice(0, 12000) },
          ]
          var agAnswer = ""
          var agOk = false
          for (var agStep = 1; agStep <= agStepsMax; agStep++) {
            var agLlm = callNodeLlm(String(nData.model || ""), agMessages, 4096)
            if (!agLlm.ok) {
              nodeErr = "Agent 模型调用失败：" + agLlm.error
              nodeErrDetail = String(agLlm.detail || "")
              break
            }
            var agRaw = String(agLlm.content || "")
            var agS = agRaw.indexOf("{")
            var agE = agRaw.lastIndexOf("}")
            var agDec = null
            if (agS >= 0 && agE > agS) { try { agDec = JSON.parse(agRaw.substring(agS, agE + 1)) } catch (_) {} }
            if (!agDec) { agAnswer = agRaw; agOk = true; break }
            seq++
            addEvent(runId, nextId, seq, "node_step", {
              title: nTitle, type: nType, step: agStep,
              think: String(agDec.think || "").slice(0, 400),
              action: String(agDec.action || ""),
              message: "第 " + agStep + " 轮 · " + String(agDec.action || "") + "：" + String(agDec.think || "").slice(0, 200),
            })
            if (String(agDec.action || "") === "answer") { agAnswer = String(agDec.answer || ""); agOk = true; break }
            var agTool = String(agDec.tool || "")
            var agParams = (agDec.params && typeof agDec.params === "object") ? agDec.params : {}
            var agOut = ""
            var agErrT = ""
            if (agTool === "calculate") {
              try { agOut = String(agParams.expression || "") + " = " + String(evalExpr(agParams.expression)) } catch (ce) { agErrT = String((ce && ce.message) || ce) }
            } else if (agTool === "web_fetch") {
              var agWf = webFetchOnce(String(agParams.url || ""))
              if (agWf && agWf.ok) agOut = String(agWf.text || agWf.content || "").slice(0, 4000)
              else agErrT = String((agWf && (agWf.error || agWf.message)) || "web_fetch 失败")
            } else if (agTool === "web_search") {
              var agWs = webSearchOnce(String(agParams.query || ""), Number(agParams.limit || 5))
              if (agWs && agWs.ok) agOut = String(agWs.text || agWs.content || "").slice(0, 4000)
              else agErrT = String((agWs && (agWs.error || agWs.message)) || "web_search 失败")
            } else if (agTool === "knowledge_search") {
              agOut = Array.isArray(agSpec.knowledge_base_ids) && agSpec.knowledge_base_ids.length
                ? searchLinkedKnowledge(agSpec.knowledge_base_ids, agParams.query)
                : knowledgeSearch(String(agParams.corpus || agInput || ""), String(agParams.query || ""))
            } else if (agTool === "summarize") {
              var agSm = callNodeLlm(String(nData.model || ""), [{ role: "user", content: "请摘要以下内容（关注点：" + String(agParams.focus || "关键信息") + "）：\n" + String(agParams.text || "").slice(0, 8000) }], 2048)
              if (agSm.ok) agOut = String(agSm.content); else agErrT = String(agSm.error || "summarize 失败")
            } else {
              agErrT = "不支持的工具：" + agTool
            }
            seq++
            addEvent(runId, nextId, seq, "observation", {
              title: nTitle, type: nType, step: agStep, tool_name: agTool,
              ok: !agErrT,
              message: "工具 " + agTool + (agErrT ? " 执行失败：" + agErrT.slice(0, 200) : " 返回结果（" + String(agOut.length) + " 字符）"),
              output: (agOut || agErrT).slice(0, 800),
            })
            statsBump("tool_calls", 1)
            agMessages.push({ role: "assistant", content: agRaw.slice(0, 2000) })
            agMessages.push({ role: "user", content: agErrT ? ("工具执行失败：" + agErrT + "。请调整做法，或直接 action=answer 给出当前能给的交付物。") : ("工具结果：\n" + agOut.slice(0, 6000)) })
          }
          if (!agOk && !nodeErr) nodeErr = "Agent 在 " + agStepsMax + " 轮内未给出最终交付物"
          if (agOk) output = sanitizeSecrets(agAnswer).slice(0, 20000)
        }
      } else if (nType === "tool") {
        var toolName = String(nData.tool || "").trim()
        var missingT = harnessInput ? harnessInput.missing : []
        var paramsStr = harnessInput ? harnessInput.raw : renderTemplate(String(nData.params_template || ""), missingT)
        if (missingT.length > 0) note = "以下变量未找到，已替换为空：" + missingT.join("、")
        var inputObj = {}
        if (paramsStr.trim()) {
          try {
            var po = JSON.parse(paramsStr)
            if (po && typeof po === "object") inputObj = po
          } catch (_) {
            nodeErr = "入参模板渲染后不是合法 JSON"
            nodeErrDetail = paramsStr.slice(0, 300)
          }
        }
        inputSummary = paramsStr.slice(0, 600)
        if (harnessInput && harnessInput.truncated) inputSummary = inputSummary + "\n…已截断"
        // —— 重试对齐批次：工具执行包成可重入的单次尝试；网络类失败（$http.send 抛错/超时/5xx）
        //    立即自动重试 1 次；业务错误（4xx/配置错误）与模型调用（summarize）不重试 ——
        // Treat external non-GET calls as potentially non-idempotent. Durable intent is
        // committed BEFORE network I/O. A crashed/ambiguous write is never replayed.
        var toolPolicyServiceWf = require(__hooks + "/modules/tool_policy.js")
        var effectNeededWf = toolPolicyServiceWf.classify({
          toolName: toolName, market: toolName.indexOf("mkt__") === 0
        }).write
        var effectKeyWf = ""
        var effectClaimedWf = false
        var effectCachedWf = false
        var effectCachedOutputWf = ""
        if (!nodeErr && toolName !== "calculate" && toolName !== "summarize" &&
            toolName !== "knowledge_search" && toolName !== "web_fetch" && toolName !== "web_search") {
          try {
            var methodRows = $app.findRecordsByFilter(
              "tool_connections", "rh_user_id = {:uid} && enabled = true && name = {:name}",
              "-created", 1, 0, { uid: uid, name: toolName }
            )
            if (methodRows.length > 0) {
              effectNeededWf = toolPolicyServiceWf.classify({
                toolName: toolName, external: true, market: toolName.indexOf("mkt__") === 0,
                method: String(methodRows[0].getString("method") || "POST")
              }).write
            }
          } catch (_) {}
        }
        var effectStepKeyWf = String(nextId) + ":" + String(execCount)
        if (!nodeErr && effectNeededWf) {
          effectKeyWf = "as-" + $security.sha256("workflow:" + runId + ":" + effectStepKeyWf)
          var effectArgsHashWf = $security.sha256(paramsStr)
          try {
            var effectClaimWf = $app.db().newQuery(
              "INSERT INTO agent_studio_side_effects(" +
                "kind,run_id,step_key,tool_name,args_hash,idempotency_key,status,result_text,created_ms,updated_ms) " +
              "VALUES ('workflow',{:rid},{:step},{:tool},{:hash},{:key},'started','',{:now},{:now}) " +
              "ON CONFLICT(kind,run_id,step_key) DO NOTHING"
            ).bind({
              rid: runId, step: effectStepKeyWf, tool: toolName,
              hash: effectArgsHashWf, key: effectKeyWf, now: new Date().getTime(),
            }).execute()
            if (Number(effectClaimWf.rowsAffected()) === 1) {
              effectClaimedWf = true
            } else {
              var priorEffectWf = new DynamicModel({ status: "", tool_name: "", args_hash: "", result_text: "" })
              $app.db().newQuery(
                "SELECT status, tool_name, args_hash, result_text FROM agent_studio_side_effects " +
                "WHERE kind = 'workflow' AND run_id = {:rid} AND step_key = {:step}"
              ).bind({ rid: runId, step: effectStepKeyWf }).one(priorEffectWf)
              if (priorEffectWf.status === "succeeded" && priorEffectWf.tool_name === toolName && priorEffectWf.args_hash === effectArgsHashWf) {
                effectCachedWf = true
                effectCachedOutputWf = String(priorEffectWf.result_text || "")
              } else {
                nodeErr = "write_outcome_unknown：此前对外部系统的写操作结果未确认，已禁止自动重放"
                nodeErrDetail = "请先检查目标系统是否已执行，再决定是否创建新的任务重试。"
              }
            }
          } catch (effectErrWf) {
            logErr("side effect journal acquire", effectErrWf)
            nodeErr = "write_journal_unavailable：审计服务不可用，本次写入已阻断"
          }
        }
        var isNetRetryCode = function (code) {
          var c = String(code || "")
          if (/timeout|unreachable/i.test(c)) return true
          var netCodeMatch = c.match(/http_(\d+)/)
          if (netCodeMatch && Number(netCodeMatch[1]) >= 500) return true
          return false
        }
        var runToolAttempt = function () {
          var aOut = ""
          var aErr = ""
          var aErrDetail = ""
          var aRetryable = false
          if (toolName === "calculate") {
            try {
              var val = evalExpr(inputObj.expression)
              aOut = String(inputObj.expression) + " = " + String(val)
            } catch (err) {
              aErr = "计算失败：" + String((err && err.message) || err)
            }
          } else if (toolName === "summarize") {
            var focus = String(inputObj.focus || "")
            var sumRes = callNodeLlm(String(nData.model || "claude-opus-4.8"), [
              {
                role: "user",
                content: "请整理并总结以下文本" + (focus ? "（关注重点：" + focus + "）" : "") + "，直接输出整理后的要点，不要寒暄：\n\n" + String(inputObj.text || "").slice(0, 6000),
              },
            ], 2048)
            if (sumRes.ok) aOut = sumRes.content
            else aErr = "摘要调用失败：" + sumRes.error
          } else if (toolName === "knowledge_search") {
            try {
              var corpusParts = []
              var wfDesc = ""
              try {
                var wfRec = $app.findRecordById("workflows", String(wRun.getString("workflow_id") || ""))
                wfDesc = String(wfRec.getString("description") || "")
              } catch (_) {}
              if (wfDesc) corpusParts.push("工作流说明：" + wfDesc)
              corpusParts.push("任务指令：" + instruction)
              for (var ok1 in outputs) {
                var oTitle = String(((byId[ok1] || {}).data || {}).title || ok1)
                corpusParts.push("节点「" + oTitle + "」输出：" + String(outputs[ok1]).slice(0, 1200))
              }
              aOut = Array.isArray(nData.knowledge_base_ids) && nData.knowledge_base_ids.length
                ? searchLinkedKnowledge(nData.knowledge_base_ids, inputObj.query)
                : knowledgeSearch(corpusParts.join("\n"), inputObj.query)
            } catch (err) {
              aErr = "检索失败：" + String((err && err.message) || err)
            }
          } else if (toolName === "web_fetch") {
            var wfRes = webFetchOnce(inputObj.url)
            if (wfRes.ok) aOut = String(wfRes.output || "")
            else {
              aErr = wfRes.error + "（" + wfRes.message + "）"
              aRetryable = isNetRetryCode(wfRes.error)
            }
          } else if (toolName === "web_search") {
            var wsRes = webSearchOnce(inputObj.query, inputObj.limit)
            if (wsRes.ok) aOut = String(wsRes.output || "")
            else {
              aErr = wsRes.error + "（" + wsRes.message + "）"
              aRetryable = isNetRetryCode(wsRes.error)
            }
          } else {
            // —— 外部工具连接代理（与 agent_engine 相同模式）——
            var tcRows = []
            try {
              tcRows = $app.findRecordsByFilter(
                "tool_connections",
                "rh_user_id = {:uid} && enabled = true",
                "-created", 100, 0, { uid: uid }
              )
            } catch (tcqErr) {
              logErr("load tool_connections", tcqErr)
            }
            var tcRec = null
            for (var tci = 0; tci < tcRows.length; tci++) {
              var tcName0 = ""
              try { tcName0 = String(tcRows[tci].getString("name") || "") } catch (_) {}
              if (tcName0 === toolName) { tcRec = tcRows[tci]; break }
            }
            if (!tcRec) {
              aErr = "工具「" + toolName + "」不是内置工具，且未找到同名的已启用工具连接"
            } else {
              var tcUrl = ""
              try { tcUrl = String(tcRec.getString("url") || "") } catch (_) {}
              var tcMethod = "POST"
              try { tcMethod = String(tcRec.getString("method") || "POST").toUpperCase() } catch (_) {}
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
              try { tcInputJson = JSON.stringify(inputObj) } catch (_) { tcInputJson = "{}" }
              var applyToolTemplate = function (tpl2) {
                return String(tpl2 || "").replace(/\{\{\s*([a-zA-Z0-9_一-龥]+)\s*\}\}/g, function (m2, key2) {
                  if (key2 === "input") return tcInputJson
                  var v2 = inputObj && inputObj[key2] !== undefined ? inputObj[key2] : ""
                  if (v2 && typeof v2 === "object") v2 = JSON.stringify(v2)
                  return encodeURIComponent(String(v2))
                })
              }
              tcUrl = applyToolTemplate(tcUrl)
              var tcSendOpts = { url: tcUrl, method: tcMethod, headers: tcHeaders }
              // Never add Idempotency-Key to an unknown endpoint; transports can automatically retry POST.
              var tcTimeout = 15
              try { tcTimeout = Number(tcRec.getInt("timeout_s") || 15) } catch (_) {}
              if (isNaN(tcTimeout) || tcTimeout < 5) tcTimeout = 5
              if (tcTimeout > 25) tcTimeout = 25
              tcSendOpts.timeout = tcTimeout
              if (tcMethod === "POST") {
                var tcTpl = ""
                try { tcTpl = String(tcRec.getString("body_template") || "") } catch (_) {}
                tcSendOpts.body = tcTpl ? applyToolTemplate(tcTpl) : tcInputJson
                var tcHasCt = false
                for (var tcCtKey in tcHeaders) {
                  if (String(tcCtKey).toLowerCase() === "content-type") { tcHasCt = true; break }
                }
                if (!tcHasCt) tcHeaders["Content-Type"] = "application/json"
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
              try {
                tcRes = $http.send(tcSendOpts)
              } catch (tcNetErr) {
                var tcNetRaw = String((tcNetErr && tcNetErr.message) || tcNetErr)
                aRetryable = true // $http.send 抛错（连接不通/超时）→ 网络类失败，可重试
                if (/timeout/i.test(tcNetRaw)) aErr = "工具「" + toolName + "」在 " + tcTimeout + " 秒内无响应（custom_tool_timeout）"
                else aErr = "工具「" + toolName + "」地址不通（custom_tool_unreachable）：" + tcSanitize(tcNetRaw).slice(0, 160)
              }
              if (!aErr && tcRes) {
                var tcCode = Number(tcRes.statusCode || 0)
                if (tcCode < 200 || tcCode >= 300) {
                  aErr = "工具「" + toolName + "」上游返回错误（custom_tool_http_" + tcCode + "）"
                  aErrDetail = tcSanitize(bytesToStr(tcRes).slice(0, 300))
                  aRetryable = tcCode >= 500 // 5xx 属网络类失败重试一次；4xx 业务错误不重试
                } else {
                  aOut = tcSanitize(bytesToStr(tcRes)).slice(0, 2000)
                  if (!aOut) aOut = "（工具返回空响应，HTTP " + tcCode + "）"
                }
              }
            }
          }
          return { out: aOut, err: aErr, errDetail: aErrDetail, retryable: aRetryable }
        }
        if (!nodeErr) {
          var toolAttempt = effectCachedWf ? { out: effectCachedOutputWf, err: "", errDetail: "", retryable: false } : runToolAttempt()
          if (toolAttempt.err && toolAttempt.retryable && !effectNeededWf) {
            // 网络类失败：立即重试 1 次，harness_stats.retries 记账
            toolRetried = true
            statsBump("retries", 1)
            toolAttempt = runToolAttempt()
          }
          if (effectClaimedWf) {
            try {
              var persistEffectWf = $app.db().newQuery(
                "UPDATE agent_studio_side_effects SET status = {:status}, result_text = {:result}, updated_ms = {:now} " +
                "WHERE kind = 'workflow' AND run_id = {:rid} AND step_key = {:step} " +
                "AND idempotency_key = {:key} AND status = 'started'"
              ).bind({
                status: toolAttempt.err ? "unknown" : "succeeded",
                result: toolAttempt.err ? "" : sanitizeSecrets(String(toolAttempt.out || "")).slice(0, 2000),
                now: new Date().getTime(), rid: runId, step: effectStepKeyWf, key: effectKeyWf,
              }).execute()
              if (Number(persistEffectWf.rowsAffected()) !== 1) throw new Error("journal_result_not_persisted")
            } catch (effectDoneErrWf) {
              logErr("side effect journal update", effectDoneErrWf)
              toolAttempt = { out: "", err: "write_outcome_unknown：外部系统可能已写入，但结果尚未可靠入库，需人工核查", errDetail: "", retryable: false }
            }
          }
          if (effectNeededWf && toolAttempt.err) {
            toolAttempt.err = "write_outcome_unknown：外部写操作失败或结果不明，请人工核查后再决定是否新建任务。详情：" + toolAttempt.err
          }
          if (toolAttempt.err) {
            nodeErr = toolAttempt.err
            nodeErrDetail = toolAttempt.errDetail
          } else {
            output = toolAttempt.out
          }
        }
        // —— 工具节点调用日志落库（tool_invocations，source=workflow）+ harness 核算 ——
        statsBump("tool_calls", 1)
        var invBuiltin = { calculate: 1, summarize: 1, knowledge_search: 1, web_fetch: 1, web_search: 1 }
        var invKindWf = invBuiltin[toolName] ? "builtin" : "external"
        var invErrCodeWf = ""
        if (nodeErr) {
          var invCodeMatch = String(nodeErr).match(/^[a-z][a-z0-9_]+/)
          invErrCodeWf = invCodeMatch ? invCodeMatch[0] : "tool_error"
        }
        writeInvocation(toolName, invKindWf, nodeErr ? "failed" : toolRetried ? "retried_success" : "success", new Date().getTime() - t0, inputSummary, nodeErr ? nodeErr : String(output), invErrCodeWf, toolRetried)
        // Metadata-only tool trace. The existing audit continues to own detailed tool logs.
        try {
          require(__hooks + "/modules/execution_trace.js").record($app, {
            owner: uid, runId: runId, kind: "workflow",
            spanId: $security.randomString(15), stepRef: String(nextId),
            operation: "tool", status: nodeErr ? "failed" : "succeeded",
            errorCode: invErrCodeWf || "tool_error",
            durationMs: new Date().getTime() - t0,
          })
        } catch (_) {}

      } else if (nType === "condition") {
        var refText = ""
        var refTitle = String(nData.ref_title || "").trim()
        if (refTitle && byTitle[refTitle] && outputs[byTitle[refTitle]] !== undefined) {
          refText = String(outputs[byTitle[refTitle]])
        } else {
          var ins1 = inEdgesOf(nextId)
          for (var i1 = 0; i1 < ins1.length; i1++) {
            var s1 = String(ins1[i1].source || "")
            if (statuses[s1] === "done" && outputs[s1] !== undefined) { refText = String(outputs[s1]); break }
          }
        }
        var op = String(nData.op || "contains")
        var cmpVal = String(nData.value || "")
        inputSummary = "判定文本（前 200 字）：" + refText.slice(0, 200) + " ｜ 规则：" + op + " " + cmpVal
        if (op === "contains") condMet = cmpVal !== "" && refText.indexOf(cmpVal) >= 0
        else if (op === "not_contains") condMet = cmpVal !== "" && refText.indexOf(cmpVal) < 0
        else {
          var refNumMatch = refText.match(/-?\d+(?:\.\d+)?/)
          var refNum = refNumMatch ? parseFloat(refNumMatch[0]) : NaN
          var cmpNum = parseFloat(cmpVal)
          if (isNaN(refNum) || isNaN(cmpNum)) {
            if (op === "eq") condMet = refText === cmpVal
            note = "判定文本中未找到可比较的数值，按文本处理"
          } else {
            if (op === "gt") condMet = refNum > cmpNum
            else if (op === "lt") condMet = refNum < cmpNum
            else if (op === "eq") condMet = refNum === cmpNum
            else condMet = false
          }
        }
        output = (condMet ? "条件满足" : "条件不满足") + "（规则：" + op + " " + cmpVal + "）"
        // 分支推进：满足走 sourceHandle=true，不满足走 false；无 handle 的出边视为满足侧
        var outs2 = outEdgesOf(nextId)
        statuses[nextId] = "done"
        outputs[nextId] = String(output).slice(0, 4000)
        seq++
        addEvent(runId, nextId, seq, "node_done", {
          title: nTitle, type: nType, input: inputSummary,
          output: String(output), elapsed_ms: new Date().getTime() - t0, note: note,
          branch: condMet ? "true" : "false",
        })
        var deadHandle = condMet ? "false" : "true"
        var condBackLoopId = ""
        for (var j2 = 0; j2 < outs2.length; j2++) {
          var sh2 = String(outs2[j2].sourceHandle || "")
          var tid2 = String(outs2[j2].target || "")
          if (sh2 !== "" && sh2 !== (condMet ? "true" : "false")) continue
          // 条件节点在循环体内且走中的分支是回边 → 交给循环推进
          if (String((byId[tid2] || {}).type || "") === "loop" && loopState[tid2] && loopState[tid2].active && inBodySet(loopState[tid2], nextId)) {
            condBackLoopId = tid2
            continue
          }
          if (curLoopCtx && inBodySet(curLoopCtx.st, tid2)) tryReady(tid2, curLoopCtx.loopId)
          else tryReady(tid2)
        }
        for (var j3 = 0; j3 < outs2.length; j3++) {
          var sh3 = String(outs2[j3].sourceHandle || "")
          if (sh3 === deadHandle) skipSubtree(String(outs2[j3].target || ""), nextId, deadHandle, 0)
        }
        if (condBackLoopId) advanceLoopRound(condBackLoopId, outputs[nextId])
        saveCp(null)
        return e.json(200, { ok: true, run_id: id, status: "running", stepped: true, node_id: nextId })
      } else if (nType === "loop") {
        var lsEntry = loopState[nextId]
        if (lsEntry && lsEntry.active) {
          // 防御性：循环进行中不应再次整体进入（回边都在完成侧拦截），不重复初始化
          saveCp(null)
          return e.json(200, { ok: true, run_id: id, status: "running", stepped: true, node_id: nextId })
        }
        var lMode = String(nData.mode || "count")
        var lMaxIter = 10
        if (nData.max_iterations !== undefined && String(nData.max_iterations) !== "") {
          var lMiP = parseInt(nData.max_iterations, 10)
          if (!isNaN(lMiP) && lMiP >= 1) lMaxIter = lMiP
        }
        if (lMaxIter > 20) lMaxIter = 20
        var lStop = String(nData.stop_keyword || "")
        var lItems = []
        if (lMode === "list") {
          var lSrcMissing = []
          var lSrcText = renderTemplate(String(nData.list_source || ""), lSrcMissing)
          if (lSrcMissing.length > 0) note = "以下变量未找到，已替换为空：" + lSrcMissing.join("、")
          var lDelim = String(nData.delimiter || "line")
          if (lDelim === "json_array") {
            try {
              var lArr = JSON.parse(lSrcText)
              if (lArr && typeof lArr.length === "number") {
                for (var lai = 0; lai < lArr.length; lai++) {
                  var lElem = lArr[lai]
                  if (lElem !== null && typeof lElem === "object") lElem = JSON.stringify(lElem)
                  var lElemS = String(lElem === null || lElem === undefined ? "" : lElem).trim()
                  if (lElemS) lItems.push(lElemS)
                }
              } else {
                nodeErr = "列表来源渲染结果不是 JSON 数组"
                nodeErrDetail = lSrcText.slice(0, 300)
              }
            } catch (lpe) {
              nodeErr = "JSON 数组解析失败：" + String((lpe && lpe.message) || lpe)
              nodeErrDetail = lSrcText.slice(0, 300)
            }
          } else {
            var lParts = lDelim === "comma" ? String(lSrcText).split(/[,，]/) : String(lSrcText).split(/\r?\n/)
            for (var lpi = 0; lpi < lParts.length; lpi++) {
              var lPart = String(lParts[lpi] || "").trim()
              if (lPart) lItems.push(lPart)
            }
          }
          if (lItems.length > 50) lItems = lItems.slice(0, 50)
          inputSummary = "列表来源渲染（前 200 字）：" + String(lSrcText).slice(0, 200) + " ｜ 切分后共 " + lItems.length + " 项"
        } else {
          var lCount = parseInt(nData.count, 10)
          if (isNaN(lCount) || lCount < 1) {
            nodeErr = "循环次数不合法（需为大于等于 1 的整数）"
          } else {
            if (lCount > 1000) lCount = 1000
            for (var lci = 1; lci <= lCount; lci++) lItems.push(String(lci))
            inputSummary = "按次数模式 · 设定 " + lCount + " 轮"
          }
        }
        if (nodeErr) {
          failNode(nodeErr, nodeErrDetail)
          return e.json(200, { ok: true, run_id: id, status: "failed", stepped: true, node_id: nextId })
        }
        // 循环体出口（body / 未标注 handle）与退出出口（done）
        var lOuts0 = outEdgesOf(nextId)
        var lBodySeeds0 = []
        var lDoneTargets0 = []
        for (var llj = 0; llj < lOuts0.length; llj++) {
          var llh = String((lOuts0[llj] || {}).sourceHandle || "")
          var llt = String((lOuts0[llj] || {}).target || "")
          if (!llt) continue
          if (llh === "done") lDoneTargets0.push(llt)
          else lBodySeeds0.push(llt)
        }
        // 循环体子图：body 出口可达的全部节点（不穿越循环节点自身）
        var lBodyIds0 = []
        var lBodySeen0 = {}
        var lStk0 = lBodySeeds0.slice(0)
        while (lStk0.length > 0) {
          var lbId = String(lStk0.pop() || "")
          if (!lbId || lBodySeen0[lbId] || lbId === nextId) continue
          lBodySeen0[lbId] = true
          lBodyIds0.push(lbId)
          var lbOuts = outEdgesOf(lbId)
          for (var lbj = 0; lbj < lbOuts.length; lbj++) lStk0.push(String((lbOuts[lbj] || {}).target || ""))
        }
        var lTotal0 = Math.min(lItems.length, lMaxIter)
        if (lItems.length === 0) {
          // 空列表：0 轮，直接走退出出口
          statuses[nextId] = "done"
          outputs[nextId] = "列表为空，共执行 0 轮"
          loopState[nextId] = {
            active: false, round: 0, total: 0, mode: lMode, items: [], body: lBodyIds0,
            stop_keyword: lStop, max_iterations: lMaxIter, last_output: "", started_at: t0,
          }
          seq++
          addEvent(runId, nextId, seq, "node_done", {
            title: nTitle, type: nType, input: inputSummary,
            output: "列表为空，共执行 0 轮", elapsed_ms: new Date().getTime() - t0, note: note, round: 0, total: 0,
          })
          for (var ldj = 0; ldj < lDoneTargets0.length; ldj++) tryReady(lDoneTargets0[ldj])
          saveCp(null)
          return e.json(200, { ok: true, run_id: id, status: "running", stepped: true, node_id: nextId })
        }
        loopState[nextId] = {
          active: true, round: 1, total: lTotal0, mode: lMode,
          items: lItems, body: lBodyIds0, stop_keyword: lStop, max_iterations: lMaxIter,
          last_output: "", started_at: t0,
        }
        startLoopRound(nextId, loopState[nextId])
        saveCp(null)
        return e.json(200, { ok: true, run_id: id, status: "running", stepped: true, node_id: nextId })
      } else {
        nodeErr = "未知节点类型：" + nType
      }

      if (finished) {
        return e.json(200, { ok: true, run_id: id, status: "succeeded", stepped: true, node_id: nextId })
      }
      if (nodeErr) {
        failNode(nodeErr, nodeErrDetail)
        return e.json(200, { ok: true, run_id: id, status: "failed", stepped: true, node_id: nextId })
      }

      var outSafe = sanitizeSecrets(String(output))
      statuses[nextId] = "done"
      outputs[nextId] = outSafe.slice(0, 4000)
      seq++
      var doneContent = {
        title: nTitle, type: nType, input: inputSummary,
        output: outSafe.slice(0, 2000), elapsed_ms: new Date().getTime() - t0, note: note,
      }
      if (toolRetried === true) doneContent.retried = true
      if (curLoopCtx) doneContent.round = curLoopCtx.round
      addEvent(runId, nextId, seq, "node_done", doneContent)
      var outs3 = outEdgesOf(nextId)
      var backLoopId = ""
      for (var j4 = 0; j4 < outs3.length; j4++) {
        var t3 = String((outs3[j4] || {}).target || "")
        // 回边：目标是活跃循环且当前节点在其循环体内 → 走循环推进，不入队
        if (String((byId[t3] || {}).type || "") === "loop" && loopState[t3] && loopState[t3].active && inBodySet(loopState[t3], nextId)) {
          backLoopId = t3
          continue
        }
        if (curLoopCtx && inBodySet(curLoopCtx.st, t3)) tryReady(t3, curLoopCtx.loopId)
        else tryReady(t3)
      }
      if (backLoopId) advanceLoopRound(backLoopId, outputs[nextId])
      saveCp(null)
      return e.json(200, { ok: true, run_id: id, status: "running", stepped: true, node_id: nextId })
    } catch (stepErr) {
      var stepMsg = String((stepErr && stepErr.message) || stepErr)
      logErr("tick step", stepErr)
      try {
        var r3 = $app.findRecordById("workflow_runs", id)
        if (String(r3.get("status")) === "running" && stepMsg !== "run_not_running") {
          var cp3 = loadJson(r3, "checkpoint")
          cp3.claim_until = 0
          cp3.seq = Number(cp3.seq || 0) + 1
          r3.set("checkpoint", cp3)
          r3.set("status", "failed")
          r3.set("error", "引擎执行异常：" + stepMsg.slice(0, 300))
          $app.save(r3)
          addEvent(id, "", Number(cp3.seq), "status", { message: "引擎执行异常，运行终止" })
        } else {
          var cp4 = loadJson(r3, "checkpoint")
          cp4.claim_until = 0
          r3.set("checkpoint", cp4)
          $app.save(r3)
        }
      } catch (_) {}
      var finalStatus = "failed"
      try {
        var r4 = $app.findRecordById("workflow_runs", id)
        finalStatus = String(r4.get("status"))
      } catch (_) {}
      return e.json(200, { ok: true, run_id: id, status: finalStatus, stepped: true })
    }
    } finally {
      try {
        $app.db().newQuery(
          "UPDATE agent_studio_run_leases SET expires_ms = 0, lease_token = '' " +
          "WHERE kind = 'workflow' AND run_id = {:rid} AND lease_token = {:token}"
        ).bind({ rid: id, token: leaseToken }).execute()
      } catch (leaseReleaseErr) {
        try { $app.logger().error("workflow execution lease release failed", "err", String(leaseReleaseErr)) } catch (_) {}
      }
    }
  } catch (err) {
    var msg = String((err && err.message) || err)
    try { $app.logger().error("workflow tick route error", "err", msg) } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
