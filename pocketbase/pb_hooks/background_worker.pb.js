// Optional standalone worker bridge for VibeX PocketBase.
// Never enable this without restricting PocketBase to a trusted network.
// The endpoint requires a high entropy server-only token and never accepts a user id from its caller.
// Each request advances at most ONE eligible run; the original tick retains its checkpoint and approval logic.
// Worker liveness is stored separately from task checkpoints so observability still works while idle.
onBootstrap(function (e) {
  e.next()
  try {
    var coll = null
    try { coll = $app.findCollectionByNameOrId("agent_worker_health") } catch (_) {}
    if (coll) return
    coll = new Collection({
      type: "base",
      name: "agent_worker_health",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "worker_name", type: "text", required: true, max: 40 },
        { name: "last_seen", type: "text", max: 40 },
        { name: "last_step_at", type: "text", max: 40 },
        { name: "tick_attempts_total", type: "number" },
      ],
    })
    $app.save(coll)
  } catch (err) {
    try { $app.logger().error("worker health schema", "err", String((err && err.message) || err)) } catch (_) {}
  }
})

routerAdd("POST", "/api/internal/worker/step", function (e) {
  try {
    var expected = String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "")
    var headers = (e.requestInfo() || {}).headers || {}
    var supplied = String(headers["x_agent_studio_worker_token"] || headers["X-Agent-Studio-Worker-Token"] || headers["x-agent-studio-worker-token"] || "")
    if ($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") !== "true" || expected.length < 32) {
      return e.json(503, { error: "worker_disabled" })
    }
    // Length-independent constant-time comparison for this small ASCII secret.
    var diff = expected.length ^ supplied.length
    for (var ci = 0; ci < expected.length; ci++) {
      diff |= expected.charCodeAt(ci) ^ (ci < supplied.length ? supplied.charCodeAt(ci) : 0)
    }
    if (diff !== 0) return e.json(401, { error: "unauthorized_worker" })

    var base = String($os.getenv("AGENT_STUDIO_WORKER_INTERNAL_URL") || "http://127.0.0.1:7000").replace(/\/+$/, "")
    if (!/^http:\/\/127\.0\.0\.1:[0-9]{2,5}$/.test(base)) {
      return e.json(503, { error: "worker_internal_url_invalid" })
    }
    var now = new Date().getTime()
    // Throttled heartbeat: one database update per approximately 12s while idle.
    var health = null
    try {
      health = $app.findFirstRecordByFilter("agent_worker_health", "worker_name = 'main'")
    } catch (_) {}
    if (!health) {
      try {
        var healthCol = $app.findCollectionByNameOrId("agent_worker_health")
        health = new Record(healthCol)
        health.set("worker_name", "main")
      } catch (_) { health = null }
    }
    if (health) {
      var lastText = String(health.getString("last_seen") || "")
      var lastMs = lastText ? new Date(lastText).getTime() : 0
      if (!lastMs || now - lastMs >= 12000) {
        health.set("last_seen", new Date(now).toISOString())
        try { $app.save(health) } catch (_) {}
      }
    }

    // Skip already executing tasks before scheduling. This is an optimization;
    // the tick endpoint's atomic CAS remains the authoritative concurrency gate.
    var leasedRuns = {}
    try {
      var liveLeases = arrayOf(new DynamicModel({ kind: "", run_id: "" }))
      $app.db().newQuery(
        "SELECT kind, run_id FROM agent_studio_run_leases WHERE expires_ms > {:now} LIMIT 1000"
      ).bind({ now: now }).all(liveLeases)
      for (var li = 0; li < liveLeases.length; li++) {
        leasedRuns[String(liveLeases[li].kind) + ":" + String(liveLeases[li].run_id)] = true
      }
    } catch (leaseReadErr) {
      try { $app.logger().error("worker active lease scan", "err", String(leaseReadErr)) } catch (_) {}
    }
    var sources = [
      { collection: "agent_runs", kind: "agent", endpoint: "/api/llm/agent-engine/" },
      { collection: "workflow_runs", kind: "workflow", endpoint: "/api/llm/workflow-engine/" },
    ]
    // Shared bounded scanner paginates beyond leased tasks. The atomic
    // lease claim in the tick remains the concurrency authority.
    var discovery = require(__hooks + "/modules/harness_worker_scheduler.js")
      .discover($app, sources, leasedRuns)
    var candidates = discovery.candidates
    if (!candidates.length) return e.json(200, {
      ok: true, stepped: false, idle: true, scanned: discovery.examined,
      scan_capped: discovery.scan_capped,
    })
    var selected = candidates[0]
    var tickUrl = base + selected.source.endpoint + encodeURIComponent(selected.id) + "/tick"
    var response = null
    try {
      response = $http.send({
        url: tickUrl,
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Rh-User-Id": selected.owner,
          "X-Agent-Studio-Worker-Token": expected },
        body: "{}",
        timeout: 120,
      })
    } catch (err) {
      var message = String((err && err.message) || err)
      try { $app.logger().error("worker step outbound failed", "err", message) } catch (_) {}
      return e.json(502, { error: "worker_tick_unreachable", kind: selected.source.kind, run_id: selected.id })
    }
    if (!response || Number(response.statusCode || 0) < 200 || Number(response.statusCode || 0) >= 300) {
      return e.json(502, { error: "worker_tick_failed", kind: selected.source.kind, run_id: selected.id, upstream_status: response ? Number(response.statusCode) : 0 })
    }
    var tickResult = null
    try {
      var bodyRaw = response.body
      var bodyString = ""
      if (typeof bodyRaw === "string") bodyString = bodyRaw
      else if (bodyRaw && bodyRaw.length !== undefined) {
        for (var ti = 0; ti < bodyRaw.length && ti < 10000; ti++) bodyString += String.fromCharCode(bodyRaw[ti] & 255)
      }
      if (bodyString) tickResult = JSON.parse(bodyString)
    } catch (_) {}
    var moved = tickResult && tickResult.stepped === true
    var busy = tickResult && tickResult.busy === true
    if (health) {
      if (moved) health.set("last_step_at", new Date().toISOString())
      health.set("tick_attempts_total", Number(health.get("tick_attempts_total") || 0) + 1)
      try { $app.save(health) } catch (_) {}
    }
    var latest = null
    try { latest = $app.findRecordById(selected.source.collection, selected.id) } catch (_) {}
    var status = latest ? String(latest.get("status") || "") : "unknown"
    return e.json(200, { ok: true, stepped: Boolean(moved), idle: !moved, busy: Boolean(busy), kind: selected.source.kind, run_id: selected.id, status: status, scanned: discovery.examined, scan_capped: discovery.scan_capped })
  } catch (err) {
    var message = String((err && err.message) || err)
    try { $app.logger().error("worker step unexpected", "err", message) } catch (_) {}
    return e.json(500, { error: "worker_error", fingerprint: message.slice(0, 80) })
  }
})
// Deliberately exposes only aggregate service health to an authenticated studio user.
routerAdd("GET", "/api/worker/status", function (e) {
  try {
    var headers = (e.requestInfo() || {}).headers || {}
    var uid = String(headers["x_rh_user_id"] || headers["X-Rh-User-Id"] || headers["x-rh-user-id"] || ($os.getenv("AGENT_STUDIO_ALLOW_ANON") === "true" ? "local-anon" : "")).trim()
    if (!uid) return e.json(401, { error: "rh_login_required" })
    var enabled = $os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") === "true" && String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "").length >= 32
    var health = null
    try { health = $app.findFirstRecordByFilter("agent_worker_health", "worker_name = 'main'") } catch (_) {}
    var lastSeen = health ? String(health.getString("last_seen") || "") : ""
    var lastStepAt = health ? String(health.getString("last_step_at") || "") : ""
    var lastMs = lastSeen ? new Date(lastSeen).getTime() : 0
    // A single model step may run for up to 120s; avoid false offline alarms during a long Tick.
    var alive = enabled && lastMs > 0 && new Date().getTime() - lastMs < 180000
    // User-scoped queue summary: bounded recent sample, no other user's IDs or credentials.
    var nowMs = new Date().getTime()
    var queue = {
      agent_running: 0, workflow_running: 0, awaiting_approval: 0,
      needs_review: 0,
      scheduled_active: 0, scheduled_pending: 0, scheduled_overdue: 0,
      oldest_due_age_ms: 0,
      paused: 0, failed_recent: 0, ready_estimate: 0, inflight: 0,
      sampled: false, sample_limit_per_kind: 100,
    }
    var collections = [
      { name: "agent_runs", kind: "agent" },
      { name: "workflow_runs", kind: "workflow" },
    ]
    for (var qi = 0; qi < collections.length; qi++) {
      var qRows = []
      try {
        qRows = $app.findRecordsByFilter(
          collections[qi].name, "rh_user_id = {:uid}", "-updated", 101, 0, { uid: uid }
        )
      } catch (_) {}
      if (qRows.length > 100) queue.sampled = true
      for (var qr = 0; qr < qRows.length && qr < 100; qr++) {
        var qRun = qRows[qr]
        var qStatus = String(qRun.get("status") || "")
        if (qStatus === "running") {
          if (collections[qi].kind === "agent") queue.agent_running++
          else queue.workflow_running++
        } else if (qStatus === "awaiting_approval") queue.awaiting_approval++
        else if (qStatus === "paused") queue.paused++
        else if (qStatus === "failed") queue.failed_recent++
      }
    }
    // Authoritative count from the CAS table, not checkpoint.claim_until (which can be reset earlier).
    try {
      var inflightRow = new DynamicModel({ total: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_run_leases WHERE expires_ms > {:now} AND " +
        "((kind = 'agent' AND run_id IN (SELECT id FROM agent_runs WHERE rh_user_id = {:uid})) " +
        "OR (kind = 'workflow' AND run_id IN (SELECT id FROM workflow_runs WHERE rh_user_id = {:uid})))"
      ).bind({ now: nowMs, uid: uid }).one(inflightRow)
      queue.inflight = Number(inflightRow.total || 0)
    } catch (_) {}
    // Count owner-scoped writes that need manual confirmation, including stale intent
    // records from a crashed process. No arguments, secrets, or other tenants leak.
    try {
      var reviewRow = new DynamicModel({ total: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_side_effects " +
        "WHERE (status = 'unknown' OR (status = 'started' AND updated_ms < {:stale})) AND " +
        "((kind = 'agent' AND run_id IN (SELECT id FROM agent_runs WHERE rh_user_id = {:uid})) " +
        "OR (kind = 'workflow' AND run_id IN (SELECT id FROM workflow_runs WHERE rh_user_id = {:uid})))"
      ).bind({ stale: nowMs - 600000, uid: uid }).one(reviewRow)
      queue.needs_review = Number(reviewRow.total || 0)
    } catch (_) {}
    try {
      var activeSchedules = new DynamicModel({ total: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_schedules WHERE rh_user_id={:uid} AND deleted=0 AND enabled=1"
      ).bind({ uid: uid }).one(activeSchedules)
      queue.scheduled_active = Number(activeSchedules.total || 0)
      var pendingSchedules = new DynamicModel({ total: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_schedule_occurrences WHERE rh_user_id={:uid} " +
        "AND status IN ('pending','retryable','launching')"
      ).bind({ uid: uid }).one(pendingSchedules)
      queue.scheduled_pending = Number(pendingSchedules.total || 0)
      // 60-second grace: avoid calling a near-due job "overdue" during normal dispatch jitter.
      var overdue = new DynamicModel({ total: 0, oldest: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total, COALESCE(MIN(next_at_ms),0) AS oldest " +
        "FROM agent_studio_schedules WHERE rh_user_id={:uid} AND enabled=1 AND deleted=0 " +
        "AND next_at_ms > 0 AND next_at_ms < {:cutoff}"
      ).bind({ uid: uid, cutoff: nowMs - 60000 }).one(overdue)
      queue.scheduled_overdue = Number(overdue.total || 0)
      queue.oldest_due_age_ms = queue.scheduled_overdue > 0
        ? Math.max(0, nowMs - Number(overdue.oldest || 0)) : 0
    } catch (_) {}
    queue.ready_estimate = Math.max(0, queue.agent_running + queue.workflow_running - queue.inflight)
    return e.json(200, {
      ok: true,
      enabled: enabled,
      alive: alive,
      last_seen: lastSeen,
      last_step_at: lastStepAt,
      tick_attempts_total: health ? Number(health.get("tick_attempts_total") || 0) : 0,
      observed_at_ms: nowMs,
      last_seen_age_ms: lastMs > 0 ? Math.max(0, nowMs - lastMs) : null,
      queue: queue,
    })
  } catch (err) {
    return e.json(500, { error: "worker_status_failed" })
  }
})
