// template_market_api.pb.js — 模板市场（template-market）唯一数据通路
// 表结构由 MCP install_business_collection 装（agent_templates.pb.js，仅 list，前端不用）。
//   GET    /api/templates/market            公开模板列表（built_in 或 public，按 -use_count,-created；首次访问懒播种三条内置模板）
//   GET    /api/templates/mine              本人发布列表（含已下架）
//   POST   /api/templates/publish           把本人 agent_specs 快照发布为公开模板
//   POST   /api/templates/{id}/use          复制模板 spec 到调用者 agent_specs（source=template），use_count+1，返回新 spec id
//   POST   /api/templates/{id}/unpublish    下架（仅 owner，built_in 403）
//   POST   /api/templates/{id}/republish    重新公开（仅 owner，built_in 403）
//   DELETE /api/templates/{id}              删除（仅 owner 且非 built_in）
// 安全：全路由 X-Rh-User-Id 校验；市场列表不回完整 rh_user_id，只回尾 4 位掩码（author_tail）。
// Goja 铁律：全部 var、helper 就地定义、每个回调 self-contained、json 字段 getString 优先、
// 5xx 一律 { error, message, fingerprint }。

routerAdd("GET", "/api/templates/market", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })

    // ---- 懒播种：built_in 记录为 0 时插入三条内置模板（内容与首页 TEMPLATE_PRESETS 一致）----
    var seedRows = []
    try {
      seedRows = $app.findRecordsByFilter("agent_templates", "built_in = true", "-created", 1, 0, {})
    } catch (_) {
      seedRows = []
    }
    if (!seedRows || seedRows.length === 0) {
      var seedPresets = [
        {
          name: "研究助手",
          description: "围绕一个主题自动搜集资料、交叉核对来源，最终产出一份带引用的结构化研究报告。",
          category: "research",
          spec: {
            goal: "帮用户围绕指定主题查资料、整理观点，并输出一份结构化研究报告。",
            task_scope:
              "负责任务：拆解研究主题、检索网络资料、交叉核对来源、撰写研究报告。不负责：需要专业资质的判断，以及代替用户对外发布内容。",
            deliverables: ["研究提纲", "资料清单与来源链接", "带结论与引用的研究报告"],
            tools: ["网络搜索", "网页内容提取", "长文写作", "文档导出"],
            task_plan: [
              "明确研究主题与关键问题",
              "检索并收集相关资料",
              "交叉比对来源，核实关键事实",
              "提炼观点并列出报告提纲",
              "撰写报告正文",
              "标注引用来源并交付",
            ],
            done_criteria: [
              "报告覆盖用户提出的全部关键问题",
              "关键结论至少有两个独立来源支撑",
              "交付物包含完整的引用清单",
            ],
          },
        },
        {
          name: "知识库问答助手",
          description: "解析用户上传的文档建立知识库，回答问题时附带资料来源，资料没覆盖的会如实说明。",
          category: "knowledge",
          spec: {
            goal: "基于用户上传的资料回答问题，每个答案都能追溯到资料来源。",
            task_scope:
              "负责任务：解析文档、建立知识索引、依据资料作答与追问补充。边界：只在资料范围内回答，资料没有依据时明确说明，不编造内容。",
            deliverables: ["带来源出处的问答回复", "未覆盖问题清单", "资料要点摘要"],
            tools: ["文档解析", "知识库检索", "多轮对话"],
            task_plan: [
              "解析上传资料并建立索引",
              "理解用户问题的真实意图",
              "检索相关资料片段",
              "生成附带来源的回答",
              "信息不足时向用户追问补充",
            ],
            done_criteria: [
              "每个回答都标注资料来源",
              "资料未覆盖的问题被明确提示",
              "用户可以就同一话题连续追问",
            ],
          },
        },
        {
          name: "数据分析助手",
          description: "读取业务表格数据，完成清洗与统计分析，产出图表和一份带可行建议的解读报告。",
          category: "data",
          spec: {
            goal: "帮用户读懂业务数据，产出图表分析和可执行结论。",
            task_scope:
              "负责任务：数据清洗、统计分析、图表生成、解读撰写。不负责：修改源数据，以及代替用户做投资或医疗类决策。",
            deliverables: ["数据清洗结果表", "分析图表", "带建议的数据解读报告"],
            tools: ["表格解析", "统计计算", "数据图表", "报告撰写"],
            task_plan: [
              "接收数据并检查完整性",
              "清洗与标准化字段",
              "确认分析目标与指标口径",
              "统计计算并生成图表",
              "解读趋势与异常点",
              "输出结论与可行建议",
            ],
            done_criteria: ["图表与数据口径一致", "结论能追溯到具体指标", "报告包含至少一条可执行建议"],
          },
        },
      ]
      var seedCol = $app.findCollectionByNameOrId("agent_templates")
      for (var si = 0; si < seedPresets.length; si++) {
        var sp = seedPresets[si]
        var seedRec = new Record(seedCol)
        seedRec.set("rh_user_id", "system")
        seedRec.set("name", sp.name)
        seedRec.set("description", sp.description)
        seedRec.set("category", sp.category)
        seedRec.set("spec", JSON.stringify(sp.spec))
        seedRec.set("source_spec_id", "")
        seedRec.set("built_in", true)
        seedRec.set("public", true)
        seedRec.set("use_count", 0)
        $app.save(seedRec)
      }
    }

    var rows = []
    try {
      rows = $app.findRecordsByFilter("agent_templates", "built_in = true || public = true", "-use_count,-created", 200, 0, {})
    } catch (_) {
      rows = []
    }

    // Public templates are descriptive plans, never portable grants or credentials.
    // Keep known builtin capabilities only; recipient must attach their own resources.
    var safeTemplateSpec = function (raw) {
      var input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
      var list = function (field) {
        if (!Array.isArray(input[field])) return []
        var out = []
        for (var ii = 0; ii < input[field].length && out.length < 35; ii++) {
          if (typeof input[field][ii] === "string") {
            var text = input[field][ii].trim().slice(0, 1200)
            if (text) out.push(text)
          }
        }
        return out
      }
      var allowed = {
        calculate: "calculate", summarize: "summarize",
        knowledge_search: "knowledge_search", web_search: "web_search",
        web_fetch: "web_fetch",
        "计算器": "calculate", "数学计算": "calculate", "统计计算": "calculate",
        "文本摘要": "summarize", "内容摘要": "summarize",
        "知识库检索": "knowledge_search",
        "网络搜索": "web_search", "网页搜索": "web_search", "联网搜索": "web_search",
        "网页内容提取": "web_fetch", "网页抓取": "web_fetch",
      }
      var allowedTools = [], seen = {}
      var names = Array.isArray(input.tools) ? input.tools : []
      for (var ti = 0; ti < names.length && ti < 50; ti++) {
        if (typeof names[ti] !== "string") continue
        var name = names[ti].trim()
        if (/^[A-Za-z_]+$/.test(name)) name = name.toLowerCase()
        if (!Object.prototype.hasOwnProperty.call(allowed,name)) continue
        var builtin = allowed[name]
        if (!seen[builtin]) { seen[builtin] = true; allowedTools.push(builtin) }
      }
      return {
        goal: String(input.goal || "").slice(0, 6000),
        task_scope: String(input.task_scope || "").slice(0, 6000),
        deliverables: list("deliverables"),
        task_plan: list("task_plan"),
        done_criteria: list("done_criteria"),
        tools: allowedTools,
        knowledge_base_ids: [],
        quality_checks: [],
        require_approval: true,
        require_plan_review: input.require_plan_review === true,
      }
    }

    var rowOut = function (rec) {
      var specText = ""
      try {
        specText = rec.getString("spec")
      } catch (_) {
        specText = ""
      }
      var specObj = null
      if (specText) {
        try {
          specObj = JSON.parse(specText)
        } catch (_) {
          specObj = null
        }
      }
      var builtIn = false
      try {
        builtIn = rec.getBool("built_in")
      } catch (_) {}
      var isPublic = false
      try {
        isPublic = rec.getBool("public")
      } catch (_) {}
      var ownerId = String(rec.get("rh_user_id") || "")
      var tail = ownerId.length > 4 ? ownerId.slice(-4) : ownerId
      return {
        id: String(rec.id),
        name: String(rec.getString("name") || ""),
        description: String(rec.getString("description") || ""),
        category: String(rec.getString("category") || "other"),
        spec: safeTemplateSpec(specObj),
        source_spec_id: String(rec.getString("source_spec_id") || ""),
        built_in: builtIn,
        public: isPublic,
        use_count: Number(rec.getInt("use_count") || 0),
        author_tail: ownerId === "system" ? "" : tail,
        is_mine: ownerId === uid,
        created: String(rec.getString("created") || ""),
      }
    }

    var items = []
    for (var i = 0; i < rows.length; i++) {
      items.push(rowOut(rows[i]))
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("template market list error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("GET", "/api/templates/mine", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })

    var rows = []
    try {
      rows = $app.findRecordsByFilter("agent_templates", "rh_user_id = {:uid}", "-created", 200, 0, { uid: uid })
    } catch (_) {
      rows = []
    }
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var rec = rows[i]
      var builtIn = false
      try {
        builtIn = rec.getBool("built_in")
      } catch (_) {}
      var isPublic = false
      try {
        isPublic = rec.getBool("public")
      } catch (_) {}
      items.push({
        id: String(rec.id),
        name: String(rec.getString("name") || ""),
        description: String(rec.getString("description") || ""),
        category: String(rec.getString("category") || "other"),
        source_spec_id: String(rec.getString("source_spec_id") || ""),
        built_in: builtIn,
        public: isPublic,
        use_count: Number(rec.getInt("use_count") || 0),
        created: String(rec.getString("created") || ""),
      })
    }
    return e.json(200, { ok: true, items: items })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("template mine list error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/templates/publish", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var body = (e.requestInfo() || {}).body || {}
    var sourceSpecId = String(body.source_spec_id || "").trim()
    if (!sourceSpecId) return e.json(400, { error: "bad_request", message: "请选择要发布的助手方案" })
    var tplName = String(body.name || "").trim().slice(0, 120)
    var description = String(body.description || "").trim().slice(0, 120)
    var category = String(body.category || "").trim()
    var allowedCats = ["research", "knowledge", "data", "other"]
    if (allowedCats.indexOf(category) < 0) category = "other"
    if (!description) return e.json(400, { error: "bad_request", message: "简介必填（不超过 120 字）" })

    // 读本人 agent_specs 快照（归属不符一律 404）
    var specRec = null
    try {
      specRec = $app.findRecordById("agent_specs", sourceSpecId)
    } catch (_) {}
    if (!specRec || String(specRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "方案不存在或无权发布" })
    }
    // Prevent publishing a different plan from the one the employee reviewed.
    // Publication must be guarded by the saved Agent's exact updated revision.
    var expectedUpdated = String(body.expected_updated || "").trim()
    if (!expectedUpdated) return e.json(428, {
      error: "template_review_required",
      message: "请先加载并核对当前 Agent 版本，然后再发布模板",
    })
    if (String(specRec.getString("updated") || "") !== expectedUpdated) {
      return e.json(409, {
        error: "template_source_changed",
        message: "Agent 方案在审核后已被其他页面修改。请重新打开发布窗口并核对当前内容",
      })
    }
    var specText = ""
    try {
      specText = specRec.getString("spec")
    } catch (_) {
      specText = ""
    }
    var specObj = null
    if (specText) {
      try {
        specObj = JSON.parse(specText)
      } catch (_) {
        specObj = null
      }
    }
    if (!specObj || typeof specObj !== "object") {
      return e.json(400, { error: "bad_request", message: "方案配置为空或已损坏，无法发布" })
    }
    // Public templates are descriptive plans, never portable grants or credentials.
    // Keep known builtin capabilities only; recipient must attach their own resources.
    var safeTemplateSpec = function (raw) {
      var input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
      var list = function (field) {
        if (!Array.isArray(input[field])) return []
        var out = []
        for (var ii = 0; ii < input[field].length && out.length < 35; ii++) {
          if (typeof input[field][ii] === "string") {
            var text = input[field][ii].trim().slice(0, 1200)
            if (text) out.push(text)
          }
        }
        return out
      }
      var allowed = {
        calculate: "calculate", summarize: "summarize",
        knowledge_search: "knowledge_search", web_search: "web_search",
        web_fetch: "web_fetch",
        "计算器": "calculate", "数学计算": "calculate", "统计计算": "calculate",
        "文本摘要": "summarize", "内容摘要": "summarize",
        "知识库检索": "knowledge_search",
        "网络搜索": "web_search", "网页搜索": "web_search", "联网搜索": "web_search",
        "网页内容提取": "web_fetch", "网页抓取": "web_fetch",
      }
      var allowedTools = [], seen = {}
      var names = Array.isArray(input.tools) ? input.tools : []
      for (var ti = 0; ti < names.length && ti < 50; ti++) {
        if (typeof names[ti] !== "string") continue
        var name = names[ti].trim()
        if (/^[A-Za-z_]+$/.test(name)) name = name.toLowerCase()
        if (!Object.prototype.hasOwnProperty.call(allowed,name)) continue
        var builtin = allowed[name]
        if (!seen[builtin]) { seen[builtin] = true; allowedTools.push(builtin) }
      }
      return {
        goal: String(input.goal || "").slice(0, 6000),
        task_scope: String(input.task_scope || "").slice(0, 6000),
        deliverables: list("deliverables"),
        task_plan: list("task_plan"),
        done_criteria: list("done_criteria"),
        tools: allowedTools,
        knowledge_base_ids: [],
        quality_checks: [],
        require_approval: true,
        require_plan_review: input.require_plan_review === true,
      }
    }

    specObj = safeTemplateSpec(specObj)
    if (!tplName) tplName = String(specRec.getString("name") || "").trim().slice(0, 120)
    if (!tplName) return e.json(400, { error: "bad_request", message: "模板名称必填" })

    var col = $app.findCollectionByNameOrId("agent_templates")
    var rec = new Record(col)
    rec.set("rh_user_id", uid)
    rec.set("name", tplName)
    rec.set("description", description)
    rec.set("category", category)
    rec.set("spec", JSON.stringify(specObj))
    rec.set("source_spec_id", String(specRec.id))
    rec.set("built_in", false)
    rec.set("public", true)
    rec.set("use_count", 0)
    $app.save(rec)

    return e.json(200, {
      ok: true,
      item: {
        id: String(rec.id),
        name: tplName,
        description: description,
        category: category,
        source_spec_id: String(specRec.id),
        built_in: false,
        public: true,
        use_count: 0,
      },
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("template publish error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/templates/{id}/use", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()
    if (!id) return e.json(404, { error: "not_found", message: "模板不存在" })

    var tplRec = null
    try {
      tplRec = $app.findRecordById("agent_templates", id)
    } catch (_) {}
    if (!tplRec) return e.json(404, { error: "not_found", message: "模板不存在" })
    var builtIn = false
    try {
      builtIn = tplRec.getBool("built_in")
    } catch (_) {}
    var isPublic = false
    try {
      isPublic = tplRec.getBool("public")
    } catch (_) {}
    if (!builtIn && !isPublic) {
      return e.json(404, { error: "not_found", message: "模板不存在或已下架" })
    }

    var specText = ""
    try {
      specText = tplRec.getString("spec")
    } catch (_) {
      specText = ""
    }
    var specObj = null
    if (specText) {
      try {
        specObj = JSON.parse(specText)
      } catch (_) {
        specObj = null
      }
    }
    if (!specObj || typeof specObj !== "object") {
      return e.json(400, { error: "bad_request", message: "模板配置已损坏，无法使用" })
    }

    // Public templates are descriptive plans, never portable grants or credentials.
    // Keep known builtin capabilities only; recipient must attach their own resources.
    var safeTemplateSpec = function (raw) {
      var input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
      var list = function (field) {
        if (!Array.isArray(input[field])) return []
        var out = []
        for (var ii = 0; ii < input[field].length && out.length < 35; ii++) {
          if (typeof input[field][ii] === "string") {
            var text = input[field][ii].trim().slice(0, 1200)
            if (text) out.push(text)
          }
        }
        return out
      }
      var allowed = {
        calculate: "calculate", summarize: "summarize",
        knowledge_search: "knowledge_search", web_search: "web_search",
        web_fetch: "web_fetch",
        "计算器": "calculate", "数学计算": "calculate", "统计计算": "calculate",
        "文本摘要": "summarize", "内容摘要": "summarize",
        "知识库检索": "knowledge_search",
        "网络搜索": "web_search", "网页搜索": "web_search", "联网搜索": "web_search",
        "网页内容提取": "web_fetch", "网页抓取": "web_fetch",
      }
      var allowedTools = [], seen = {}
      var names = Array.isArray(input.tools) ? input.tools : []
      for (var ti = 0; ti < names.length && ti < 50; ti++) {
        if (typeof names[ti] !== "string") continue
        var name = names[ti].trim()
        if (/^[A-Za-z_]+$/.test(name)) name = name.toLowerCase()
        if (!Object.prototype.hasOwnProperty.call(allowed,name)) continue
        var builtin = allowed[name]
        if (!seen[builtin]) { seen[builtin] = true; allowedTools.push(builtin) }
      }
      return {
        goal: String(input.goal || "").slice(0, 6000),
        task_scope: String(input.task_scope || "").slice(0, 6000),
        deliverables: list("deliverables"),
        task_plan: list("task_plan"),
        done_criteria: list("done_criteria"),
        tools: allowedTools,
        knowledge_base_ids: [],
        quality_checks: [],
        require_approval: true,
        require_plan_review: input.require_plan_review === true,
      }
    }

    specObj = safeTemplateSpec(specObj)
    // 复制到调用者名下 agent_specs
    var tplName = String(tplRec.getString("name") || "助手方案").trim().slice(0, 100)
    var specCol = $app.findCollectionByNameOrId("agent_specs")
    var newSpec = new Record(specCol)
    newSpec.set("rh_user_id", uid)
    newSpec.set("name", tplName)
    newSpec.set("spec", JSON.stringify(specObj))
    newSpec.set("source", "template")
    newSpec.set("template_key", String(tplRec.id).slice(0, 40))
    $app.save(newSpec)

    var useCount = 0
    try {
      useCount = Number(tplRec.getInt("use_count") || 0)
    } catch (_) {}
    tplRec.set("use_count", useCount + 1)
    $app.save(tplRec)

    return e.json(200, { ok: true, spec_id: String(newSpec.id), use_count: useCount + 1 })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("template use error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/templates/{id}/unpublish", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()

    var tplRec = null
    try {
      tplRec = $app.findRecordById("agent_templates", id)
    } catch (_) {}
    if (!tplRec) return e.json(404, { error: "not_found", message: "模板不存在或无权操作" })
    var builtIn = false
    try {
      builtIn = tplRec.getBool("built_in")
    } catch (_) {}
    if (builtIn) return e.json(403, { error: "forbidden", message: "内置模板不可操作" })
    if (String(tplRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "模板不存在或无权操作" })
    }

    tplRec.set("public", false)
    $app.save(tplRec)
    return e.json(200, { ok: true, id: String(tplRec.id), public: false })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("template unpublish error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("POST", "/api/templates/{id}/republish", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()

    var tplRec = null
    try {
      tplRec = $app.findRecordById("agent_templates", id)
    } catch (_) {}
    if (!tplRec) return e.json(404, { error: "not_found", message: "模板不存在或无权操作" })
    var builtIn = false
    try {
      builtIn = tplRec.getBool("built_in")
    } catch (_) {}
    if (builtIn) return e.json(403, { error: "forbidden", message: "内置模板不可操作" })
    if (String(tplRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "模板不存在或无权操作" })
    }

    tplRec.set("public", true)
    $app.save(tplRec)
    return e.json(200, { ok: true, id: String(tplRec.id), public: true })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("template republish error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})

routerAdd("DELETE", "/api/templates/{id}", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()

    var tplRec = null
    try {
      tplRec = $app.findRecordById("agent_templates", id)
    } catch (_) {}
    if (!tplRec) return e.json(404, { error: "not_found", message: "模板不存在或无权操作" })
    var builtIn = false
    try {
      builtIn = tplRec.getBool("built_in")
    } catch (_) {}
    if (builtIn) return e.json(403, { error: "forbidden", message: "内置模板不可删除" })
    if (String(tplRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "模板不存在或无权操作" })
    }

    $app.delete(tplRec)
    return e.json(200, { ok: true, id: id })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("template delete error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
