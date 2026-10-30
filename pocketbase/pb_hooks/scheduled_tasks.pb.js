// Scheduled Agent/Workflow tasks. Worker-driven, audited and tenant isolated.
// No cronAdd / timers in Goja: the standalone worker calculates IANA time zones.
onBootstrap(function (e) {
  e.next()
  try {
    require(__hooks + "/modules/runtime_schema.js").applyScheduleMigrations($app)
  } catch (err) {
    try { $app.logger().error("schedule schema migration failed", "err", String((err && err.message) || err)) } catch (_) {}
    // No fallback to an unversioned partial schema; API/Worker must fail closed on missing tables.
  }
})

// Owner-scoped schedule list with recent execution history.
routerAdd("GET", "/api/schedules", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var scheduleModel = {
      id: "", rh_user_id: "", name: "", target_kind: "", target_id: "", instruction: "",
      recurrence_kind: "", interval_minutes: 0, time_zone: "", local_time: "", weekday: 0,
      start_at_ms: 0, next_at_ms: 0, model_connection_id: "", model_id: "", max_steps: 0,
      enabled: 0, revision: 0, created_ms: 0, updated_ms: 0, last_due_ms: 0,
    }
    var rows = arrayOf(new DynamicModel(scheduleModel))
    $app.db().newQuery(
      "SELECT id,rh_user_id,name,target_kind,target_id,instruction,recurrence_kind," +
      "interval_minutes,time_zone,local_time,weekday,start_at_ms,next_at_ms," +
      "model_connection_id,model_id,max_steps,enabled,revision,created_ms,updated_ms,last_due_ms " +
      "FROM agent_studio_schedules WHERE rh_user_id={:uid} AND deleted=0 ORDER BY updated_ms DESC LIMIT 100"
    ).bind({ uid: uid }).all(rows)
    var items = []
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]
      items.push({
        id: String(r.id), name: String(r.name), target_kind: String(r.target_kind),
        target_id: String(r.target_id), instruction: String(r.instruction),
        recurrence_kind: String(r.recurrence_kind), interval_minutes: Number(r.interval_minutes),
        time_zone: String(r.time_zone), local_time: String(r.local_time),
        weekday: Number(r.weekday), start_at_ms: Number(r.start_at_ms),
        next_at_ms: Number(r.next_at_ms), model_connection_id: String(r.model_connection_id),
        model_id: String(r.model_id), max_steps: Number(r.max_steps),
        enabled: Number(r.enabled) === 1, revision: Number(r.revision),
        created_ms: Number(r.created_ms), updated_ms: Number(r.updated_ms),
        last_due_ms: Number(r.last_due_ms),
      })
    }
    var qp = (e.requestInfo() || {}).query || {}
    var requestedId = String(qp.id || "").trim()
    if (requestedId && !/^[A-Za-z0-9]{15}$/.test(requestedId)) return e.json(400, {error:"invalid_schedule_filter"})
    var pageText=String(qp.history_page||"1"),limitText=String(qp.history_limit||"60")
    if(!/^[1-9][0-9]{0,5}$/.test(pageText)||!/^[1-9][0-9]{0,2}$/.test(limitText))
      return e.json(400,{error:"invalid_history_pagination"})
    var historyPage=Number(pageText),historyLimit=Math.min(60,Number(limitText))
    // The plan-list view does not need occurrence counts or detail lookups.
    if(String(qp.include_history||'1')==='0')return e.json(200,{ok:true,items:items,history:[],
      history_loaded:false,history_page:1,history_limit:historyLimit,history_total:0,history_pages:1,server_now_ms:new Date().getTime()})
    var occurrenceModel = {
      id: "", schedule_id: "", rh_user_id: "", scheduled_for_ms: 0,
      run_id: "", status: "", attempts: 0, error: "", created_ms: 0, updated_ms: 0,
    }
    var occurrences = arrayOf(new DynamicModel(occurrenceModel))
    var historySql =
      "SELECT id,schedule_id,rh_user_id,scheduled_for_ms,run_id,status,attempts,error,created_ms,updated_ms " +
      "FROM agent_studio_schedule_occurrences WHERE rh_user_id={:uid} "
    var params = { uid: uid }
    if (requestedId) { historySql += "AND schedule_id={:sid} "; params.sid = requestedId }
    var count=new DynamicModel({total:0})
    $app.db().newQuery("SELECT COUNT(*) AS total FROM agent_studio_schedule_occurrences WHERE rh_user_id={:uid} "+
      (requestedId?"AND schedule_id={:sid}":"")).bind(params).one(count)
    var historyTotal=Number(count.total)
    params.limit=historyLimit;params.offset=(historyPage-1)*historyLimit
    historySql += "ORDER BY created_ms DESC,id DESC LIMIT {:limit} OFFSET {:offset}"
    $app.db().newQuery(historySql).bind(params).all(occurrences)
    var history = []
    for (var j = 0; j < occurrences.length; j++) {
      var occ = occurrences[j]
      var actualStatus = String(occ.status)
      var message = String(occ.error)
      if (actualStatus === "started") {
        var taskKind = ""
        var sid = String(occ.schedule_id)
        for (var si = 0; si < rows.length; si++) {
          if (String(rows[si].id) === sid) { taskKind = String(rows[si].target_kind); break }
        }
        if (taskKind) {
          try {
            var run = $app.findRecordById(taskKind === "agent" ? "agent_runs" : "workflow_runs", String(occ.run_id))
            if (String(run.get("rh_user_id") || "") === uid) {
              actualStatus = String(run.get("status") || "running")
              message = String(run.getString("error") || "").slice(0, 300)
            }
          } catch (_) {}
        }
      }
      history.push({
        id: String(occ.id), schedule_id: String(occ.schedule_id),
        scheduled_for_ms: Number(occ.scheduled_for_ms), run_id: String(occ.run_id),
        status: actualStatus, attempts: Number(occ.attempts),
        error: message, created_ms: Number(occ.created_ms),
      })
    }
    return e.json(200, { ok: true, items: items, history: history,
      history_page:historyPage,history_limit:historyLimit,history_total:historyTotal,
      history_pages:Math.max(1,Math.ceil(historyTotal/historyLimit)),server_now_ms: new Date().getTime() })
  } catch (err) {
    try { $app.logger().error("schedules listing", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "schedule_list_failed" })
  }
})

// Create, edit, enable/disable, run-now, and soft-delete a user's schedules.
routerAdd("POST", "/api/schedules/manage", function (e) {
  try {
    var h = (e.requestInfo() || {}).headers || {}
    var uid = String(h["x_rh_user_id"] || h["X-Rh-User-Id"] || h["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var body = (e.requestInfo() || {}).body || {}
    var action = String(body.action || "")
    var now = new Date().getTime()
    var id = String(body.id || "").trim()
    var existing = null
    if (action !== "create") {
      if (!/^[A-Za-z0-9]{15}$/.test(id)) return e.json(400, { error: "schedule_id_required" })
      existing = new DynamicModel({ id: "", rh_user_id: "", deleted: 0, revision: 0, enabled: 0,
        next_at_ms: 0,start_at_ms:0,recurrence_kind:"",interval_minutes:0,time_zone:"",local_time:"",weekday:0 })
      try {
        $app.db().newQuery(
          "SELECT id,rh_user_id,deleted,revision,enabled,next_at_ms,start_at_ms,recurrence_kind,interval_minutes,time_zone,local_time,weekday FROM agent_studio_schedules " +
          "WHERE id={:id} AND rh_user_id={:uid} AND deleted=0"
        ).bind({ id: id, uid: uid }).one(existing)
      } catch (_) { existing = null }
      if (!existing) return e.json(404, { error: "schedule_not_found" })
      if(body.expected_revision!==undefined &&
         (!Number.isSafeInteger(body.expected_revision)||body.expected_revision!==Number(existing.revision)))
        return e.json(409,{error:"schedule_changed",message:"此计划已被其他页面修改，请重新读取后再操作；本次未覆盖。"})
    }
    if (action === "delete") {
      var removed=$app.db().newQuery(
        "UPDATE agent_studio_schedules SET deleted=1,enabled=0,revision=revision+1,updated_ms={:now} WHERE id={:id} AND rh_user_id={:uid} AND revision={:rev}"
      ).bind({ id: id, uid: uid, now: now,rev:Number(existing.revision) }).execute()
      if(Number(removed.rowsAffected())!==1)return e.json(409,{error:"schedule_changed"})
      $app.db().newQuery(
        "UPDATE agent_studio_schedule_occurrences SET status='cancelled_schedule',updated_ms={:now} " +
        "WHERE schedule_id={:id} AND rh_user_id={:uid} AND status IN ('pending','retryable')"
      ).bind({ id: id, uid: uid, now: now }).execute()
      return e.json(200, { ok: true, id: id, deleted: true })
    }
    if (action === "toggle") {
      var enabled = body.enabled === true
      var nextAt = Number(body.next_at_ms || 0)
      if (enabled && (!Number.isSafeInteger(nextAt) || nextAt < now - 90000 || nextAt > now + 367 * 86400000)) {
        return e.json(400, { error: "invalid_next_run_time" })
      }
      var upd = $app.db().newQuery(
        "UPDATE agent_studio_schedules SET enabled={:enabled}," +
        "next_at_ms=CASE WHEN {:enabled}=1 THEN {:next} ELSE next_at_ms END," +
        "revision=revision+1,updated_ms={:now} WHERE id={:id} AND rh_user_id={:uid} AND revision={:rev}"
      ).bind({ enabled: enabled ? 1 : 0, next: nextAt, now: now,
        id: id, uid: uid, rev: Number(existing.revision) }).execute()
      if (Number(upd.rowsAffected()) !== 1) return e.json(409, { error: "schedule_changed" })
      if (!enabled) $app.db().newQuery(
        "UPDATE agent_studio_schedule_occurrences SET status='cancelled_schedule',updated_ms={:now} " +
        "WHERE schedule_id={:id} AND status IN ('pending','retryable')"
      ).bind({ id: id, now: now }).execute()
      return e.json(200, { ok: true, id: id, enabled: enabled })
    }
    if (action === "run_now") {
      if (!Number(existing.enabled)) return e.json(409, { error: "schedule_disabled" })
      var bucket = Math.floor(now / 60000)
      var due = bucket * 60000
      var occId = $security.sha256("schedule_occ:" + id + ":" + due).slice(0, 20)
      var runId = $security.sha256("schedule_run:" + id + ":" + due).slice(0, 15)
      var inserted = $app.db().newQuery(
        "INSERT OR IGNORE INTO agent_studio_schedule_occurrences" +
        "(id,schedule_id,rh_user_id,scheduled_for_ms,schedule_revision,run_id,status,attempts," +
        "locked_until_ms,next_retry_ms,error,created_ms,updated_ms) VALUES " +
        "({:oid},{:id},{:uid},{:due},{:rev},{:rid},'pending',0,0,0,'',{:now},{:now})"
      ).bind({ oid: occId, id: id, uid: uid, due: due, rev: Number(existing.revision),
        rid: runId, now: now }).execute()
      if (Number(inserted.rowsAffected()) === 0) return e.json(409, { error: "already_queued", message: "这一分钟已经发起过立即运行" })
      return e.json(200, { ok: true, id: id, queued: true, run_id: runId })
    }
    if (action === "retry_failed_start") {
      var occurrenceId = String(body.occurrence_id || "").trim()
      if (!/^[a-f0-9]{20}$/.test(occurrenceId)) return e.json(400, { error: "invalid_occurrence_id" })
      var oldAttempt = new DynamicModel({ id: "", run_id: "", status: "", schedule_revision: 0 })
      try {
        $app.db().newQuery(
          "SELECT id,run_id,status,schedule_revision FROM agent_studio_schedule_occurrences " +
          "WHERE id={:oid} AND schedule_id={:id} AND rh_user_id={:uid} AND status='failed_start'"
        ).bind({ oid: occurrenceId, id: id, uid: uid }).one(oldAttempt)
      } catch (_) { return e.json(404, { error: "failed_occurrence_not_found" }) }
      if (Number(oldAttempt.schedule_revision) !== Number(existing.revision)) {
        return e.json(409, { error: "schedule_changed", message: "计划已更新，请重新执行当前配置" })
      }
      var collision = null
      try { collision = $app.findRecordById("agent_runs", String(oldAttempt.run_id)) } catch (_) {}
      if (!collision) { try { collision = $app.findRecordById("workflow_runs", String(oldAttempt.run_id)) } catch (_) {} }
      if (collision) return e.json(409, { error: "run_already_exists", message: "运行实例已存在，请先查看运行状态" })
      var retry = $app.db().newQuery(
        "UPDATE agent_studio_schedule_occurrences SET status='pending',attempts=0,next_retry_ms=0," +
        "locked_until_ms=0,error='',updated_ms={:now} " +
        "WHERE id={:oid} AND schedule_id={:id} AND rh_user_id={:uid} AND status='failed_start'"
      ).bind({ oid: occurrenceId, id: id, uid: uid, now: now }).execute()
      if (Number(retry.rowsAffected()) !== 1) return e.json(409, { error: "occurrence_state_changed" })
      return e.json(200, { ok: true, id: id, queued: true, run_id: String(oldAttempt.run_id) })
    }
    if (action !== "create" && action !== "update") return e.json(400, { error: "unknown_action" })
    var name = String(body.name || "").trim().slice(0, 120)
    var targetKind = String(body.target_kind || "")
    var targetId = String(body.target_id || "").trim()
    var instruction = String(body.instruction || "").trim()
    var kind = String(body.recurrence_kind || "")
    var zone = String(body.time_zone || "UTC").trim()
    var time = String(body.local_time || "09:00")
    var weekday = Number(body.weekday === undefined ? 1 : body.weekday)
    var interval = Number(body.interval_minutes === undefined ? 60 : body.interval_minutes)
    var start = Number(body.start_at_ms)
    var next = Number(body.next_at_ms)
    var preserveTiming=action==="update"&&body.preserve_timing===true
    if(preserveTiming){
      if(body.expected_revision===undefined)return e.json(400,{error:"schedule_revision_required"})
      kind=String(existing.recurrence_kind);zone=String(existing.time_zone);time=String(existing.local_time)
      weekday=Number(existing.weekday);interval=Number(existing.interval_minutes)
      start=Number(existing.start_at_ms);next=Number(existing.next_at_ms)
    }
    if(body.enabled!==undefined&&typeof body.enabled!=="boolean")return e.json(400,{error:"invalid_enabled"})
    // Editing never silently resumes a paused plan. Activation is a separate
    // explicit toggle; create can opt into a paused draft without queuing work.
    var savedEnabled=action==="create"?(body.enabled===false?0:1):Number(existing.enabled)
    var modelConn = String(body.model_connection_id || "").trim()
    var modelId = String(body.model_id || "").trim()
    var maxSteps = Number(body.max_steps === undefined ? 10 : body.max_steps)
    if (!name || instruction.length < 1 || instruction.length > 2000 || !targetId) return e.json(400, { error: "invalid_task_fields" })
    if (targetKind !== "agent" && targetKind !== "workflow") return e.json(400, { error: "invalid_target_kind" })
    if (["once", "interval", "daily", "weekly"].indexOf(kind) < 0) return e.json(400, { error: "invalid_recurrence_kind" })
    if (!/^[A-Za-z0-9_+\/-]{1,64}$/.test(zone)) return e.json(400, { error: "invalid_time_zone" })
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return e.json(400, { error: "invalid_local_time" })
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return e.json(400, { error: "invalid_weekday" })
    if (!Number.isInteger(interval) || interval < 15 || interval > 10080) return e.json(400, { error: "invalid_interval" })
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 30) return e.json(400, { error: "invalid_max_steps" })
    if (!preserveTiming && (!Number.isSafeInteger(start) || !Number.isSafeInteger(next) ||
        start < now - 90000 || start > now + 367 * 86400000 ||
        next < now - 90000 || next > now + 367 * 86400000 || next < start)) {
      return e.json(400, { error: "invalid_schedule_time" })
    }
    var targetRecord = null
    try { targetRecord = $app.findRecordById(targetKind === "agent" ? "agent_specs" : "workflows", targetId) } catch (_) {}
    if (!targetRecord || String(targetRecord.get("rh_user_id") || "") !== uid) return e.json(404, { error: "target_not_found" })
    if (targetKind === "agent") {
      var conn = null
      try { conn = $app.findRecordById("model_connections", modelConn) } catch (_) {}
      if (!conn || String(conn.get("rh_user_id") || "") !== uid || !conn.getBool("enabled") || !modelId) {
        return e.json(400, { error: "model_connection_required", message: "定时 Agent 必须选择本人已启用的模型连接与模型" })
      }
      var modelIds = []
      try { modelIds = JSON.parse(conn.getString("models") || "[]") } catch (_) {}
      if (!Array.isArray(modelIds) || modelIds.indexOf(modelId) < 0) return e.json(400, { error: "model_not_enabled" })
    } else { modelConn = ""; modelId = "" }
    if (action === "create") {
      var total = new DynamicModel({ total: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_schedules WHERE rh_user_id={:uid} AND deleted=0"
      ).bind({ uid: uid }).one(total)
      if (Number(total.total) >= 100) return e.json(429, { error: "schedule_limit", message: "每个账号最多保留100个计划" })
      id = $security.randomString(15)
      $app.db().newQuery(
        "INSERT INTO agent_studio_schedules " +
        "(id,rh_user_id,name,target_kind,target_id,instruction,recurrence_kind,interval_minutes,time_zone," +
        "local_time,weekday,start_at_ms,next_at_ms,model_connection_id,model_id,max_steps,enabled,deleted,revision,created_ms,updated_ms,last_due_ms) " +
        "VALUES ({:id},{:uid},{:name},{:tk},{:tid},{:inst},{:rk},{:interval},{:zone},{:time},{:weekday}," +
        "{:start},{:next},{:conn},{:model},{:steps},{:enabled},0,1,{:now},{:now},0)"
      ).bind({ id: id, uid: uid, name: name, tk: targetKind, tid: targetId, inst: instruction,
        rk: kind, interval: interval, zone: zone, time: time, weekday: weekday,
        start: start, next: next, conn: modelConn, model: modelId, steps: maxSteps, now: now,enabled:savedEnabled }).execute()
      return e.json(200, { ok: true, id: id, revision: 1,enabled:savedEnabled===1 })
    }
    var updated = $app.db().newQuery(
      "UPDATE agent_studio_schedules SET name={:name},target_kind={:tk},target_id={:tid},instruction={:inst}," +
      "recurrence_kind={:rk},interval_minutes={:interval},time_zone={:zone},local_time={:time},weekday={:weekday}," +
      "start_at_ms=CASE WHEN {:keepTiming}=1 THEN start_at_ms ELSE {:start} END," +
      "next_at_ms=CASE WHEN {:keepTiming}=1 THEN next_at_ms ELSE {:next} END," +
      "model_connection_id={:conn},model_id={:model},max_steps={:steps}," +
      "revision=revision+1,updated_ms={:now} WHERE id={:id} AND rh_user_id={:uid} AND revision={:rev}"
    ).bind({ id: id, uid: uid, name: name, tk: targetKind, tid: targetId, inst: instruction,
      rk: kind, interval: interval, zone: zone, time: time, weekday: weekday,
      start: start, next: next, conn: modelConn, model: modelId, steps: maxSteps,
      now: now, rev: Number(existing.revision),keepTiming:preserveTiming?1:0 }).execute()
    if (Number(updated.rowsAffected()) !== 1) return e.json(409, { error: "schedule_changed" })
    // Historical pending occurrences are never silently executed with edited parameters.
    return e.json(200, { ok: true, id: id, revision: Number(existing.revision) + 1,enabled:savedEnabled===1 })
  } catch (err) {
    try { $app.logger().error("schedule manage error", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "schedule_manage_failed" })
  }
})

// Authorized worker: get the oldest recoverable launch attempt or next due schedule.
// Never accept user-controlled identity or execute arbitrary HTTP paths.
routerAdd("POST", "/api/internal/schedules/next", function (e) {
  try {
    var secret = String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "")
    var h = (e.requestInfo() || {}).headers || {}
    var provided = String(h["x_agent_studio_worker_token"] || h["X-Agent-Studio-Worker-Token"] || h["x-agent-studio-worker-token"] || "")
    if ($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") !== "true" || secret.length < 32) return e.json(503, { error: "worker_disabled" })
    var diff = secret.length ^ provided.length
    for (var i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ (i < provided.length ? provided.charCodeAt(i) : 0)
    if (diff) return e.json(401, { error: "unauthorized_worker" })
    var now = new Date().getTime()
    var occ = new DynamicModel({ schedule_id: "", scheduled_for_ms: 0 })
    var pending = false
    try {
      $app.db().newQuery(
        "SELECT o.schedule_id,o.scheduled_for_ms FROM agent_studio_schedule_occurrences o " +
        "JOIN agent_studio_schedules s ON s.id=o.schedule_id WHERE s.deleted=0 " +
        "AND o.attempts<4 AND ((o.status IN ('pending','retryable') AND o.next_retry_ms<={:now}) " +
        "OR (o.status='launching' AND o.locked_until_ms<={:now})) " +
        "ORDER BY o.created_ms ASC LIMIT 1"
      ).bind({ now: now }).one(occ)
      pending = true
    } catch (_) {}
    var task = new DynamicModel({
      id: "", rh_user_id: "", target_kind: "", target_id: "", instruction: "", recurrence_kind: "",
      interval_minutes: 0, time_zone: "", local_time: "", weekday: 0, start_at_ms: 0,
      next_at_ms: 0, model_connection_id: "", model_id: "", max_steps: 0, revision: 0, enabled: 0,
    })
    try {
      if (pending) {
        $app.db().newQuery(
          "SELECT id,rh_user_id,target_kind,target_id,instruction,recurrence_kind,interval_minutes,time_zone," +
          "local_time,weekday,start_at_ms,next_at_ms,model_connection_id,model_id,max_steps,revision,enabled " +
          "FROM agent_studio_schedules WHERE id={:id} AND deleted=0"
        ).bind({ id: String(occ.schedule_id) }).one(task)
      } else {
        $app.db().newQuery(
          "SELECT id,rh_user_id,target_kind,target_id,instruction,recurrence_kind,interval_minutes,time_zone," +
          "local_time,weekday,start_at_ms,next_at_ms,model_connection_id,model_id,max_steps,revision,enabled " +
          "FROM agent_studio_schedules WHERE enabled=1 AND deleted=0 AND next_at_ms>0 AND next_at_ms<={:now} " +
          "ORDER BY next_at_ms ASC LIMIT 1"
        ).bind({ now: now }).one(task)
      }
    } catch (_) { return e.json(200, { ok: true, due: false }) }
    if (!task.id) return e.json(200, { ok: true, due: false })
    var dueMs = pending ? Number(occ.scheduled_for_ms) : Number(task.next_at_ms)
    return e.json(200, { ok: true, due: true, pending: pending,
      schedule: { id: String(task.id), recurrence_kind: String(task.recurrence_kind),
        interval_minutes: Number(task.interval_minutes), time_zone: String(task.time_zone),
        local_time: String(task.local_time), weekday: Number(task.weekday),
        start_at_ms: Number(task.start_at_ms), next_at_ms: Number(task.next_at_ms) },
      scheduled_for_ms: dueMs, now_ms: now })
  } catch (err) {
    try { $app.logger().error("scheduler next", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "scheduler_next_failed" })
  }
})

// Worker dispatch: unique occurrence + atomic launch lease + deterministic run id.
routerAdd("POST", "/api/internal/schedules/dispatch", function (e) {
  try {
    var secret = String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "")
    var h = (e.requestInfo() || {}).headers || {}
    var provided = String(h["x_agent_studio_worker_token"] || h["X-Agent-Studio-Worker-Token"] || h["x-agent-studio-worker-token"] || "")
    if ($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") !== "true" || secret.length < 32) return e.json(503, { error: "worker_disabled" })
    var diff = secret.length ^ provided.length
    for (var i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ (i < provided.length ? provided.charCodeAt(i) : 0)
    if (diff) return e.json(401, { error: "unauthorized_worker" })
    var body = (e.requestInfo() || {}).body || {}
    var id = String(body.schedule_id || "")
    var due = Number(body.scheduled_for_ms)
    var nextAt = Number(body.next_at_ms || 0)
    var now = new Date().getTime()
    if (!/^[A-Za-z0-9]{15}$/.test(id) || !Number.isSafeInteger(due) || due <= 0 || due > now + 60000) {
      return e.json(400, { error: "invalid_schedule_dispatch" })
    }
    var task = new DynamicModel({
      id: "", rh_user_id: "", target_kind: "", target_id: "", instruction: "", recurrence_kind: "",
      interval_minutes: 0, time_zone: "", local_time: "", weekday: 0, start_at_ms: 0,
      next_at_ms: 0, model_connection_id: "", model_id: "", max_steps: 0, revision: 0, enabled: 0,
    })
    try {
      $app.db().newQuery(
        "SELECT id,rh_user_id,target_kind,target_id,instruction,recurrence_kind,interval_minutes,time_zone,local_time," +
        "weekday,start_at_ms,next_at_ms,model_connection_id,model_id,max_steps,revision,enabled " +
        "FROM agent_studio_schedules WHERE id={:id} AND deleted=0"
      ).bind({ id: id }).one(task)
    } catch (_) { return e.json(404, { error: "schedule_not_found" }) }
    var dueNow = Number(task.next_at_ms) === due && Number(task.enabled) === 1
    if (!Number(task.enabled) && !(String(task.recurrence_kind) === "once" && Number(task.next_at_ms) === 0)) {
      $app.db().newQuery(
        "UPDATE agent_studio_schedule_occurrences SET status='cancelled_schedule',updated_ms={:now} " +
        "WHERE schedule_id={:id} AND scheduled_for_ms={:due} AND status IN ('pending','retryable')"
      ).bind({ id: id, due: due, now: now }).execute()
      return e.json(200, { ok: true, scheduled: false, skipped: true, reason: "schedule_disabled" })
    }
    if (dueNow) {
      if (String(task.recurrence_kind) === "once") {
        if (nextAt !== 0) return e.json(400, { error: "invalid_next_occurrence" })
      } else if (!Number.isSafeInteger(nextAt) || nextAt <= now ||
          nextAt <= due || nextAt > now + 10 * 86400000) {
        return e.json(400, { error: "invalid_next_occurrence" })
      }
    }
    var occId = $security.sha256("schedule_occ:" + id + ":" + due).slice(0, 20)
    var runId = $security.sha256("schedule_run:" + id + ":" + due).slice(0, 15)
    if (dueNow) {
      $app.db().newQuery(
        "INSERT OR IGNORE INTO agent_studio_schedule_occurrences" +
        "(id,schedule_id,rh_user_id,scheduled_for_ms,schedule_revision,run_id,status,attempts," +
        "locked_until_ms,next_retry_ms,error,created_ms,updated_ms) " +
        "VALUES ({:oid},{:id},{:uid},{:due},{:rev},{:rid},'pending',0,0,0,'',{:now},{:now})"
      ).bind({ oid: occId, id: id, uid: String(task.rh_user_id),
        due: due, rev: Number(task.revision), rid: runId, now: now }).execute()
      $app.db().newQuery(
        "UPDATE agent_studio_schedules SET next_at_ms={:next},last_due_ms={:due}," +
        "enabled=CASE WHEN recurrence_kind='once' THEN 0 ELSE enabled END,updated_ms={:now} " +
        "WHERE id={:id} AND enabled=1 AND deleted=0 AND next_at_ms={:due}"
      ).bind({ next: nextAt, due: due, now: now, id: id }).execute()
    }
    var occurrence = new DynamicModel({
      id: "", schedule_id: "", rh_user_id: "", scheduled_for_ms: 0, schedule_revision: 0,
      run_id: "", status: "", attempts: 0, locked_until_ms: 0, next_retry_ms: 0,
    })
    try {
      $app.db().newQuery(
        "SELECT id,schedule_id,rh_user_id,scheduled_for_ms,schedule_revision,run_id,status,attempts," +
        "locked_until_ms,next_retry_ms FROM agent_studio_schedule_occurrences WHERE id={:oid} AND schedule_id={:id}"
      ).bind({ oid: occId, id: id }).one(occurrence)
    } catch (_) { return e.json(409, { error: "schedule_slot_no_longer_due" }) }
    if (Number(occurrence.schedule_revision) !== Number(task.revision)) {
      $app.db().newQuery(
        "UPDATE agent_studio_schedule_occurrences SET status='skipped_changed',updated_ms={:now} " +
        "WHERE id={:oid} AND status IN ('pending','retryable')"
      ).bind({ oid: occId, now: now }).execute()
      return e.json(200, { ok: true, scheduled: true, skipped: true, reason: "schedule_changed" })
    }
    // Cancelled/deleted schedules do not start new runs, except a single once occurrence
    // disabled by its own successful dispatch. A manual run-now has a distinct slot.
    if (String(occurrence.status) === "started") return e.json(200, { ok: true, scheduled: false, already_started: true, run_id: runId })
    var won = $app.db().newQuery(
      "UPDATE agent_studio_schedule_occurrences SET status='launching',attempts=attempts+1," +
      "locked_until_ms={:lock},next_retry_ms=0,updated_ms={:now} " +
      "WHERE id={:oid} AND attempts<4 AND " +
      "((status IN ('pending','retryable') AND next_retry_ms<={:now} AND locked_until_ms<={:now}) " +
      "OR (status='launching' AND locked_until_ms<={:now}))"
    ).bind({ oid: occId, lock: now + 180000, now: now }).execute()
    if (Number(won.rowsAffected()) !== 1) return e.json(200, { ok: true, scheduled: false, busy: true })

    var owner = String(task.rh_user_id)
    // Avoid piling up recurring jobs when the previous occurrence is still active.
    var prevRows = arrayOf(new DynamicModel({ run_id: "", status: "" }))
    try {
      $app.db().newQuery(
        "SELECT run_id,status FROM agent_studio_schedule_occurrences " +
        "WHERE schedule_id={:id} AND id!={:oid} AND status='started' ORDER BY created_ms DESC LIMIT 3"
      ).bind({ id: id, oid: occId }).all(prevRows)
    } catch (_) {}
    for (var pi = 0; pi < prevRows.length; pi++) {
      try {
        var prevRun = $app.findRecordById(
          String(task.target_kind) === "agent" ? "agent_runs" : "workflow_runs", String(prevRows[pi].run_id)
        )
        var prevStatus = String(prevRun.get("status") || "")
        if (prevStatus === "running" || prevStatus === "awaiting_approval" || prevStatus === "paused") {
          $app.db().newQuery(
            "UPDATE agent_studio_schedule_occurrences SET status='skipped_overlap',locked_until_ms=0," +
            "error='Previous scheduled run has not finished',updated_ms={:now} WHERE id={:oid}"
          ).bind({ oid: occId, now: now }).execute()
          return e.json(200, { ok: true, scheduled: true, skipped: true, reason: "previous_run_incomplete" })
        }
      } catch (_) {}
    }
    var path = String(task.target_kind) === "agent" ? "/api/agent-runs/start" : "/api/workflow-runs/start"
    var requestBody = { instruction: String(task.instruction),
      schedule_occurrence_id: occId, scheduled_run_id: runId }
    if (String(task.target_kind) === "agent") {
      requestBody.spec_id = String(task.target_id)
      requestBody.model = String(task.model_id)
      requestBody.config = {
        max_steps: Number(task.max_steps), require_approval: true,
        custom_model: { connection_id: String(task.model_connection_id), model_id: String(task.model_id) },
      }
      var scheduledBuiltinTools = {}
      try {
        var scheduledSpec = $app.findRecordById("agent_specs", String(task.target_id))
        var scheduledSpecObj = JSON.parse(scheduledSpec.getString("spec") || "{}")
        var requestedTools = (scheduledSpecObj && scheduledSpecObj.tools) || []
        var validBuiltins = { calculate: 1, summarize: 1, knowledge_search: 1, web_fetch: 1, web_search: 1 }
        if (Array.isArray(requestedTools)) {
          for (var sti = 0; sti < requestedTools.length; sti++) {
            var toolId = String(requestedTools[sti] || "")
            if (validBuiltins[toolId]) scheduledBuiltinTools[toolId] = true
          }
        }
      } catch (_) {}
      requestBody.config.tools = scheduledBuiltinTools

    } else { requestBody.workflow_id = String(task.target_id) }
    var base = String($os.getenv("AGENT_STUDIO_WORKER_INTERNAL_URL") || "http://127.0.0.1:7000").replace(/\/+$/, "")
    if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(base)) return e.json(503, { error: "worker_internal_url_invalid" })
    var response = null
    var startError = ""
    try {
      response = $http.send({
        url: base + path, method: "POST", body: JSON.stringify(requestBody),
        headers: { "Content-Type": "application/json", "X-Rh-User-Id": owner, "X-Agent-Studio-Worker-Token": secret },
        timeout: 30,
      })
    } catch (err) { startError = String(err) }
    var created = false
    // Deterministic run id: even if the HTTP response was lost, do not launch again.
    try {
      var createdRun = $app.findRecordById(
        String(task.target_kind) === "agent" ? "agent_runs" : "workflow_runs", runId
      )
      created = String(createdRun.get("rh_user_id") || "") === owner
    } catch (_) {}
    if (created) {
      $app.db().newQuery(
        "UPDATE agent_studio_schedule_occurrences SET status='started',locked_until_ms=0," +
        "error='',updated_ms={:now} WHERE id={:oid}"
      ).bind({ oid: occId, now: new Date().getTime() }).execute()
      return e.json(200, { ok: true, scheduled: true, started: true,
        run_id: runId, kind: String(task.target_kind), schedule_id: id })
    }
    var attempts = Number(occurrence.attempts) + 1
    var retryable = attempts < 4
    var nextRetry = retryable ? now + Math.min(240000, 15000 * Math.pow(2, attempts - 1)) : 0
    var failCode = response ? "launch_http_" + Number(response.statusCode || 0) : "launch_unreachable"
    $app.db().newQuery(
      "UPDATE agent_studio_schedule_occurrences SET status={:status},locked_until_ms=0," +
      "next_retry_ms={:next},error={:err},updated_ms={:now} WHERE id={:oid}"
    ).bind({ oid: occId, status: retryable ? "retryable" : "failed_start",
      next: nextRetry, err: failCode + (startError ? ": " + startError.slice(0, 100) : ""),
      now: new Date().getTime() }).execute()
    return e.json(200, { ok: true, scheduled: true, started: false,
      retryable: retryable, reason: failCode })
  } catch (err) {
    try { $app.logger().error("scheduler dispatch", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "scheduler_dispatch_failed" })
  }
})


routerAdd("POST", "/api/internal/schedules/reject-invalid", function (e) {
  try {
    var expected = String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "")
    var h = (e.requestInfo() || {}).headers || {}
    var supplied = String(h["x_agent_studio_worker_token"] || h["X-Agent-Studio-Worker-Token"] || h["x-agent-studio-worker-token"] || "")
    if ($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") !== "true" || expected.length < 32) return e.json(503, { error: "worker_disabled" })
    var diff = expected.length ^ supplied.length
    for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (i < supplied.length ? supplied.charCodeAt(i) : 0)
    if (diff !== 0) return e.json(401, { error: "unauthorized_worker" })
    var body = (e.requestInfo() || {}).body || {}
    var id = String(body.schedule_id || "")
    var due = Number(body.scheduled_for_ms)
    var reason = String(body.reason || "invalid_rule").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80)
    if (!/^[A-Za-z0-9]{15}$/.test(id) || !Number.isSafeInteger(due) || due < 1) return e.json(400, { error: "invalid_dispatch" })
    var now = new Date().getTime()
    var task = new DynamicModel({ id: "", rh_user_id: "", revision: 0, next_at_ms: 0, enabled: 0 })
    try {
      $app.db().newQuery("SELECT id,rh_user_id,revision,next_at_ms,enabled FROM agent_studio_schedules WHERE id={:id} AND deleted=0").bind({ id: id }).one(task)
    } catch (_) { return e.json(404, { error: "schedule_not_found" }) }
    if (Number(task.next_at_ms) === due && Number(task.enabled) === 1) {
      var oid = $security.sha256("schedule_occ:" + id + ":" + due).slice(0, 20)
      var rid = $security.sha256("schedule_run:" + id + ":" + due).slice(0, 15)
      $app.db().newQuery(
        "INSERT OR IGNORE INTO agent_studio_schedule_occurrences(" +
        "id,schedule_id,rh_user_id,scheduled_for_ms,schedule_revision,run_id,status,attempts,locked_until_ms,next_retry_ms,error,created_ms,updated_ms) " +
        "VALUES ({:oid},{:id},{:uid},{:due},{:rev},{:rid},'invalid_schedule',0,0,0,{:reason},{:now},{:now})"
      ).bind({ oid: oid, id: id, uid: String(task.rh_user_id), due: due, rev: Number(task.revision),
        rid: rid, reason: reason, now: now }).execute()
      $app.db().newQuery(
        "UPDATE agent_studio_schedules SET enabled=0,next_at_ms=0,updated_ms={:now} " +
        "WHERE id={:id} AND enabled=1 AND next_at_ms={:due}"
      ).bind({ id: id, due: due, now: now }).execute()
    } else {
      $app.db().newQuery(
        "UPDATE agent_studio_schedule_occurrences SET status='invalid_schedule',error={:reason},locked_until_ms=0,next_retry_ms=0,updated_ms={:now} " +
        "WHERE schedule_id={:id} AND scheduled_for_ms={:due} AND status IN ('pending','retryable')"
      ).bind({ id: id, due: due, reason: reason, now: now }).execute()
    }
    return e.json(200, { ok: true, rejected: true })
  } catch (err) {
    try { $app.logger().error("reject invalid schedule", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "schedule_quarantine_failed" })
  }
})
