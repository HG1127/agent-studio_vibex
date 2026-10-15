// Internal operations overview: current authenticated employee's actionable queue.
// Never treats a client supplied user_id as ownership or exposes prompts, secrets,
// model outputs, HTTP arguments, or other colleagues' private runs.
// Company-wide sharing/roles must be designed and authorized separately.
routerAdd("GET", "/api/internal/overview", function (e) {
  try {
    var headers = (e.requestInfo() || {}).headers || {}
    var uid = String(
      headers["x_rh_user_id"] || headers["X-Rh-User-Id"] ||
      headers["x-rh-user-id"] ||
      ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")
    ).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })

    var now = new Date().getTime()
    var weekAgo = new Date(now - 7 * 86400000).toISOString().replace("T", " ")
    var count = function (sql, params) {
      var row = new DynamicModel({ total: 0 })
      $app.db().newQuery(sql).bind(params || {}).one(row)
      return Number(row.total || 0)
    }
    var counters = {
      running: 0,
      awaiting_approval: 0,
      failed_7d: 0,
      paused: 0,
      schedules_active: 0,
      schedules_overdue: 0,
      knowledge_bases: 0,
      writes_need_review: 0,
    }
    var sources = [
      { name: "agent_runs", kind: "agent", titleKey: "spec_name" },
      { name: "workflow_runs", kind: "workflow", titleKey: "workflow_name" },
    ]
    var cutoffParams = { uid: uid, since: weekAgo }
    var actionItems = []
    var recentRuns = []
    var append = function (category, kind, record, title, timestamp) {
      actionItems.push({
        category: category, kind: kind, id: String(record || ""),
        title: String(title || "未命名任务").slice(0, 110),
        timestamp: String(timestamp || ""),
      })
    }
    for (var si = 0; si < sources.length; si++) {
      var source = sources[si]
      for (var sc = 0; sc < 3; sc++) {
        var targetStatus = ["running", "awaiting_approval", "paused"][sc]
        counters[targetStatus] += count(
          "SELECT COUNT(*) AS total FROM " + source.name +
          " WHERE rh_user_id={:uid} AND status={:status}",
          { uid: uid, status: targetStatus }
        )
      }
      counters.failed_7d += count(
        "SELECT COUNT(*) AS total FROM " + source.name +
        " WHERE rh_user_id={:uid} AND status='failed' AND created >= {:since}",
        cutoffParams
      )
      var recent = $app.findRecordsByFilter(
        source.name, "rh_user_id = {:uid}", "-created", 12, 0, { uid: uid }
      )
      for (var i = 0; i < recent.length; i++) {
        var r = recent[i]
        recentRuns.push({
          id: String(r.id),
          kind: source.kind,
          title: String(r.getString(source.titleKey) || "未命名任务").slice(0, 110),
          status: String(r.getString("status") || ""),
          created: String(r.getString("created") || ""),
          updated: String(r.getString("updated") || ""),
        })
      }
      var approvalRows = $app.findRecordsByFilter(
        source.name,
        "rh_user_id = {:uid} && status = 'awaiting_approval'",
        "-updated", 8, 0, { uid: uid }
      )
      for (var ai = 0; ai < approvalRows.length; ai++) {
        append("approval", source.kind, approvalRows[ai].id,
          approvalRows[ai].getString(source.titleKey),
          approvalRows[ai].getString("updated"))
      }
      var failRows = $app.findRecordsByFilter(
        source.name,
        "rh_user_id = {:uid} && status = 'failed' && created >= {:since}",
        "-updated", 8, 0, cutoffParams
      )
      for (var fi = 0; fi < failRows.length; fi++) {
        append("failed", source.kind, failRows[fi].id,
          failRows[fi].getString(source.titleKey),
          failRows[fi].getString("updated"))
      }
    }
    recentRuns.sort(function(a, b) { return b.created.localeCompare(a.created) })
    recentRuns = recentRuns.slice(0, 16)

    counters.knowledge_bases = count(
      "SELECT COUNT(*) AS total FROM agent_studio_kb_bases WHERE rh_user_id={:uid}",
      { uid: uid }
    )
    counters.schedules_active = count(
      "SELECT COUNT(*) AS total FROM agent_studio_schedules " +
      "WHERE rh_user_id={:uid} AND deleted=0 AND enabled=1",
      { uid: uid }
    )
    counters.schedules_overdue = count(
      "SELECT COUNT(*) AS total FROM agent_studio_schedules " +
      "WHERE rh_user_id={:uid} AND deleted=0 AND enabled=1 " +
      "AND next_at_ms > 0 AND next_at_ms < {:cutoff}",
      { uid: uid, cutoff: now - 60000 }
    )
    var scheduleRows = arrayOf(new DynamicModel({
      id: "", name: "", next_at_ms: 0, target_kind: "",
    }))
    $app.db().newQuery(
      "SELECT id,name,next_at_ms,target_kind FROM agent_studio_schedules " +
      "WHERE rh_user_id={:uid} AND deleted=0 AND enabled=1 " +
      "AND next_at_ms > 0 AND next_at_ms < {:cutoff} " +
      "ORDER BY next_at_ms ASC LIMIT 10"
    ).bind({ uid: uid, cutoff: now - 60000 }).all(scheduleRows)
    for (var sd = 0; sd < scheduleRows.length; sd++) {
      var sched = scheduleRows[sd]
      append("overdue", "schedule", sched.id, sched.name,
        new Date(Number(sched.next_at_ms)).toISOString())
    }

    var reviewSql =
      "FROM agent_studio_side_effects s WHERE " +
      "(s.status='unknown' OR (s.status='started' AND s.updated_ms < {:stale})) AND " +
      "((s.kind='agent' AND s.run_id IN (SELECT id FROM agent_runs WHERE rh_user_id={:uid})) " +
      "OR (s.kind='workflow' AND s.run_id IN (SELECT id FROM workflow_runs WHERE rh_user_id={:uid})))"
    var reviewParams = { uid: uid, stale: now - 600000 }
    counters.writes_need_review = count("SELECT COUNT(*) AS total " + reviewSql, reviewParams)
    var reviews = arrayOf(new DynamicModel({
      kind: "", run_id: "", step_key: "", updated_ms: 0,
    }))
    $app.db().newQuery(
      "SELECT s.kind,s.run_id,s.step_key,s.updated_ms " + reviewSql +
      " ORDER BY s.updated_ms DESC LIMIT 10"
    ).bind(reviewParams).all(reviews)
    for (var rw = 0; rw < reviews.length; rw++) {
      var review = reviews[rw]
      append("review", review.kind, review.run_id,
        "外部写操作待核验 · 步骤 " + String(review.step_key).slice(0, 28),
        new Date(Number(review.updated_ms)).toISOString())
    }
    var priority = { approval: 0, review: 1, overdue: 2, failed: 3 }
    actionItems.sort(function(a, b) {
      return priority[a.category] - priority[b.category] ||
        b.timestamp.localeCompare(a.timestamp)
    })

    var workerEnabled =
      $os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") === "true" &&
      String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "").length >= 32
    var health = null
    try {
      health = $app.findFirstRecordByFilter(
        "agent_worker_health", "worker_name = 'main'"
      )
    } catch (_) {}
    var lastSeen = health ? String(health.getString("last_seen") || "") : ""
    var lastMs = lastSeen ? new Date(lastSeen).getTime() : 0
    var age = lastMs > 0 ? Math.max(0, now - lastMs) : null
    return e.json(200, {
      ok: true,
      scope: "current_user",
      generated_at_ms: now,
      counters: counters,
      action_items: actionItems.slice(0, 32),
      recent_runs: recentRuns,
      worker: {
        configured: workerEnabled,
        alive: workerEnabled && age !== null && age < 180000,
        last_seen_age_ms: age,
      },
      sampling: {
        recent_limit_per_kind: 12, action_limit: 32,
        failed_window_days: 7,
      },
    })
  } catch (err) {
    try { $app.logger().error("internal overview failed", "err", String(err)) } catch (_) {}
    return e.json(500, { error: "internal_overview_failed" })
  }
})
