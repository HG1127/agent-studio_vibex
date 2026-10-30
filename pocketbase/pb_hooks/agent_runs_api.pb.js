// agent_runs_api.pb.js — 运行详情页（run-detail）归属校验数据通路
// 表结构由 MCP 装的 agent_runs.pb.js / run_events.pb.js 提供；本文件是运行详情页唯一数据通路：
//   GET /api/agent-runs/{id}/detail   单次运行完整档案（归属校验，非本人/不存在一律 404）
//   GET /api/agent-runs/recent?limit=N[&spec_id=ID] 最近运行（可限本人指定 Agent）+ 本人全部待办统计（limit 1..20）
// 安全约束：运行详情与事件必须通过身份归属校验，历史方案必须读取 run.spec_snapshot。
// 禁止从当前 agent_specs 替代已删除或缺失的历史快照；旧记录缺失应明确返回 null。
// Goja 铁律：全部 var、helper 就地定义、每个回调 self-contained、json 字段 getString 优先、
// 5xx 一律 { error, message, fingerprint }。

routerAdd("GET", "/api/agent-runs/{id}/detail", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var id = String(e.request.pathValue("id") || "").trim()
    if (!id) return e.json(404, { error: "not_found", message: "运行不存在或无权查看" })

    var runRec = null
    try {
      runRec = $app.findRecordById("agent_runs", id)
    } catch (_) {}
    if (!runRec || String(runRec.get("rh_user_id") || "") !== uid) {
      return e.json(404, { error: "not_found", message: "运行不存在或无权查看" })
    }

    var parseJsonField = function (rec, field) {
      var text = ""
      try {
        text = rec.getString(field)
      } catch (_) {
        text = ""
      }
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch (_) {
        return null
      }
    }

    var configObj = parseJsonField(runRec, "config")
    var checkpointObj = parseJsonField(runRec, "checkpoint")

    // Exact immutable AgentSpec at the time THIS run started. NEVER substitute
    // the current AgentSpec: it may have changed since an earlier execution.
    // Legacy runs without a stored snapshot return null and are explicitly
    // labelled unavailable in the UI and exported audit report.
    var specSnapshot = parseJsonField(runRec, "spec_snapshot")
    if (!specSnapshot || typeof specSnapshot !== "object" || Array.isArray(specSnapshot)) {
      specSnapshot = null
    }
    var specId = String(runRec.get("spec_id") || "")

    var runOut = {
      id: String(runRec.id),
      rh_user_id: String(runRec.get("rh_user_id") || ""),
      spec_id: specId,
      spec_name: String(runRec.getString("spec_name") || ""),
      instruction: String(runRec.getString("instruction") || ""),
      status: String(runRec.getString("status") || ""),
      current_step: Number(runRec.getInt("current_step") || 0),
      max_steps: Number(runRec.getInt("max_steps") || 0),
      model: String(runRec.getString("model") || ""),
      config: configObj,
      checkpoint: checkpointObj,
      result: String(runRec.getString("result") || ""),
      error: String(runRec.getString("error") || ""),
      evaluation: parseJsonField(runRec, "evaluation"),
      feedback: parseJsonField(runRec, "feedback"),
      created: String(runRec.getString("created") || ""),
      updated: String(runRec.getString("updated") || ""),
    }

    var evRows = []
    try {
      evRows = $app.findRecordsByFilter(
        "run_events",
        "run_id = {:rid}",
        "step_index,seq,created",
        500,
        0,
        { rid: String(runRec.id) },
      )
    } catch (_) {
      evRows = []
    }
    var events = []
    for (var i = 0; i < evRows.length; i++) {
      var ev = evRows[i]
      events.push({
        id: String(ev.id),
        run_id: String(ev.get("run_id") || ""),
        step_index: Number(ev.getInt("step_index") || 0),
        seq: Number(ev.getInt("seq") || 0),
        event_type: String(ev.getString("event_type") || "status"),
        content: parseJsonField(ev, "content") || {},
        created: String(ev.getString("created") || ""),
      })
    }

    return e.json(200, { ok: true, run: runOut, spec_snapshot: specSnapshot, events: events })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent_runs detail error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
/**
 * Desktop inbox: all current employee's pending Agent actions, with real
 * owner-scoped paging instead of the 20-item recent-task shortcut.
 * No instruction, checkpoint, answer, tool arguments or credentials returned.
 */
routerAdd("GET","/api/agent-runs/pending",function(e){
  try{
    var h=(e.requestInfo()||{}).headers||{}
    var uid=String(h["x_rh_user_id"]||h["X-Rh-User-Id"]||h["x-rh-user-id"]||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON")==="true"?"local-anon":"")).trim()
    if(!uid)return e.json(401,{error:"auth_required"})
    var query=(e.requestInfo()||{}).query||{}
    var page=Math.min(10000,Math.max(1,parseInt(String(query.page||"1"),10)||1))
    var perPage=Math.min(30,Math.max(1,parseInt(String(query.perPage||"10"),10)||10))
    var kind=String(query.status||"all")
    if(["all","awaiting_input","awaiting_approval"].indexOf(kind)<0)
      return e.json(400,{error:"invalid_status"})
    var name=String(query.q||"").trim().slice(0,100)
    var where=" WHERE rh_user_id={:uid} "+
      "AND status IN ('awaiting_input','awaiting_approval')"
    var params={uid:uid}
    if(kind!=="all"){where+=" AND status={:status}";params.status=kind}
    if(name){
      where+=" AND LOWER(spec_name) LIKE {:q} ESCAPE '!'"
      params.q="%"+name.replace(/[!%_]/g,function(ch){return "!"+ch}).toLowerCase()+"%"
    }
    var total=new DynamicModel({total:0})
    $app.db().newQuery("SELECT COUNT(*) AS total FROM agent_runs"+where).bind(params).one(total)
    var dataParams={}
    for(var key in params)dataParams[key]=params[key]
    dataParams.limit=perPage
    dataParams.offset=(page-1)*perPage
    var rows=arrayOf(new DynamicModel({
      id:"",spec_id:"",spec_name:"",status:"",created:"",updated:""
    }))
    $app.db().newQuery(
      "SELECT id,spec_id,spec_name,status,created,updated FROM agent_runs"+
      where+" ORDER BY updated DESC,id DESC LIMIT {:limit} OFFSET {:offset}"
    ).bind(dataParams).all(rows)
    var items=[]
    for(var i=0;i<rows.length;i++)items.push({
      id:String(rows[i].id),spec_id:String(rows[i].spec_id),
      spec_name:String(rows[i].spec_name),status:String(rows[i].status),
      created:String(rows[i].created),updated:String(rows[i].updated),
    })
    return e.json(200,{
      ok:true,items:items,page:page,perPage:perPage,
      totalItems:Number(total.total||0),
      totalPages:Math.max(1,Math.ceil(Number(total.total||0)/perPage))
    })
  }catch(err){
    try{$app.logger().error("pending inbox error","err",String(err))}catch(_){}
    return e.json(500,{error:"pending_unavailable"})
  }
})


routerAdd("GET", "/api/agent-runs/recent", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required", message: "请先登录 RunningHub" })
    var query = (e.requestInfo() || {}).query || {}
    // Opt-in full archive. Existing recent/pending callers keep their contract.
    // Standalone middleware has already stripped spoofed identity headers and
    // injected the verified studio_users owner. Every query remains owner-scoped.
    if (String(query.archive || "") === "1") {
      var page = Number(query.page || 1)
      var status = String(query.status || "all")
      var days = String(query.days || "all")
      var search = String(query.q || "").trim()
      if (!Number.isInteger(page) || page < 1 || page > 10000 ||
          ["all", "active", "attention", "succeeded", "failed", "cancelled"].indexOf(status) < 0 ||
          ["all", "7", "30", "90"].indexOf(days) < 0 || search.length > 120 || /[\x00-\x1f]/.test(search)) {
        return e.json(400, { error: "invalid_archive_filter", message: "运行记录筛选条件无效" })
      }
      var archiveSpec = String(query.spec_id || "").trim()
      if (archiveSpec && !/^[A-Za-z0-9]{15}$/.test(archiveSpec))
        return e.json(400, { error: "invalid_spec_id", message: "Agent 标识格式无效" })
      var where = " WHERE rh_user_id={:uid}"
      var params = { uid: uid }
      if (archiveSpec) { where += " AND spec_id={:sid}"; params.sid = archiveSpec }
      if (status === "active") where += " AND status IN ('queued','running','paused')"
      else if (status === "attention") where += " AND status IN ('awaiting_input','awaiting_approval')"
      else if (status !== "all") { where += " AND status={:state}"; params.state = status }
      if (search) {
        // Literal substring search: '%' and '_' are not wildcard operators.
        where += " AND instr(lower(COALESCE(spec_name,'') || ' ' || COALESCE(instruction,'') || ' ' || id),lower({:search}))>0"
        params.search = search
      }
      if (days !== "all") {
        where += " AND datetime(created)>=datetime({:after})"
        params.after = new Date(Date.now() - Number(days) * 86400000).toISOString()
      }
      var total = new DynamicModel({ total: 0 })
      $app.db().newQuery("SELECT COUNT(*) AS total FROM agent_runs" + where).bind(params).one(total)
      var totalItems = Number(total.total || 0), perPage = 20
      var totalPages = Math.max(1, Math.ceil(totalItems / perPage))
      page = Math.min(page, totalPages)
      params.limit = perPage; params.offset = (page - 1) * perPage
      var archiveRows = arrayOf(new DynamicModel({ id: "", spec_id: "", spec_name: "", instruction: "", status: "", current_step: 0, max_steps: 0, model: "", config: "", created: "" }))
      $app.db().newQuery("SELECT id,spec_id,spec_name,instruction,status,current_step,max_steps,model,config,created FROM agent_runs" +
        where + " ORDER BY created DESC,id DESC LIMIT {:limit} OFFSET {:offset}").bind(params).all(archiveRows)
      var archiveItems = []
      for (var ai = 0; ai < archiveRows.length; ai++) {
        var row = archiveRows[ai], source = ""
        try { source = String((JSON.parse(String(row.config || "{}")) || {}).source || "") } catch (_) {}
        archiveItems.push({ id: String(row.id), spec_id: String(row.spec_id), spec_name: String(row.spec_name),
          instruction: String(row.instruction).slice(0, 600), status: String(row.status), current_step: Number(row.current_step),
          max_steps: Number(row.max_steps), model: String(row.model), source: source, created: String(row.created) })
      }
      return e.json(200, { ok: true, archive_version: 1, items: archiveItems, page: page, perPage: perPage,
        totalItems: totalItems, totalPages: totalPages })
    }
    var limit = Number(query.limit || 5)
    if (!limit || limit < 1) limit = 5
    if (limit > 20) limit = 20
    // Scope before LIMIT: filtering a global recent page would hide an Agent's
    // valid run after other Agents have produced more than 20 newer runs.
    var specId = String(query.spec_id || "").trim()
    if (specId && !/^[A-Za-z0-9]{15}$/.test(specId)) {
      return e.json(400, { error: "invalid_spec_id", message: "Agent 标识格式无效" })
    }
    var rows = specId
      ? $app.findRecordsByFilter("agent_runs", "rh_user_id = {:uid} && spec_id = {:sid}", "-created", limit, 0, { uid: uid, sid: specId })
      : $app.findRecordsByFilter("agent_runs", "rh_user_id = {:uid}", "-created", limit, 0, { uid: uid })
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var rec = rows[i]
      var cfgObj = null
      try {
        var cfgText = rec.getString("config")
        if (cfgText) cfgObj = JSON.parse(cfgText)
      } catch (_) {
        cfgObj = null
      }
      items.push({
        id: String(rec.id),
        spec_id: String(rec.get("spec_id") || ""),
        spec_name: String(rec.getString("spec_name") || ""),
        instruction: String(rec.getString("instruction") || ""),
        status: String(rec.getString("status") || ""),
        current_step: Number(rec.getInt("current_step") || 0),
        max_steps: Number(rec.getInt("max_steps") || 0),
        model: String(rec.getString("model") || ""),
        source: cfgObj && typeof cfgObj === "object" ? String(cfgObj.source || "") : "",
        created: String(rec.getString("created") || ""),
      })
    }
    // Pending approvals must not vanish when later runs push them outside
    // the recent-run window. Keep the full owner-scoped COUNT separate from
    // the bounded list and omit sensitive instruction/checkpoint contents.
    var pendingCountRow = new DynamicModel({ total: 0 })
    $app.db().newQuery(
      "SELECT COUNT(*) AS total FROM agent_runs " +
      "WHERE rh_user_id={:uid} AND status IN ('awaiting_input','awaiting_approval')"
    ).bind({ uid: uid }).one(pendingCountRow)
    var pendingRows = $app.findRecordsByFilter(
      "agent_runs",
      "rh_user_id = {:uid} && (status = 'awaiting_input' || status = 'awaiting_approval')",
      "-updated", 20, 0, { uid: uid }
    )
    var pendingItems = []
    for (var pi = 0; pi < pendingRows.length; pi++) {
      var pending = pendingRows[pi]
      pendingItems.push({
        id: String(pending.id),
        spec_id: String(pending.get("spec_id") || ""),
        spec_name: String(pending.getString("spec_name") || ""),
        status: String(pending.getString("status") || ""),
        created: String(pending.getString("created") || ""),
      })
    }
    return e.json(200, {
      ok: true, items: items,
      pending_count: Number(pendingCountRow.total || 0),
      pending_items: pendingItems,
    })
  } catch (err) {
    var msg = String((err && err.message) || err)
    try {
      $app.logger().error("agent_runs recent error", "err", msg)
    } catch (_) {}
    return e.json(500, { error: "internal", message: msg, fingerprint: msg.slice(0, 80) })
  }
})
