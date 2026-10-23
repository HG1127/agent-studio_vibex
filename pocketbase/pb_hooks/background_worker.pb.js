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
    if (coll) {
      // Existing standalone installations also need the bounded health field.
      // Do not recreate the collection or discard previous heartbeat history.
      var hasComponents = false
      try { hasComponents = !!coll.fields.getByName("components_json") } catch (_) {}
      if (!hasComponents) {
        coll.fields.add(new Field({ name: "components_json", type: "text", max: 1024 }))
        $app.save(coll)
      }
      return
    }
    coll = new Collection({
      type: "base",
      name: "agent_worker_health",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "worker_name", type: "text", required: true, max: 40 },
        { name: "last_seen", type: "text", max: 40 },
        { name: "last_step_at", type: "text", max: 40 },
        { name: "tick_attempts_total", type: "number" },
        { name: "components_json", type: "text", max: 1024 },
      ],
    })
    $app.save(coll)
  } catch (err) {
    try { $app.logger().error("worker health schema", "err", String((err && err.message) || err)) } catch (_) {}
  }
})

// Worker process IDs are random per launch and deliberately contain no host info.
// Keep route callbacks self-contained: PocketBase loads each handler separately.
routerAdd("POST", "/api/internal/worker/heartbeat", function (e) {
  try {
    var expected = String($os.getenv("AGENT_STUDIO_WORKER_TOKEN") || "")
    var headers = (e.requestInfo() || {}).headers || {}
    var supplied = String(headers["x_agent_studio_worker_token"] ||
      headers["X-Agent-Studio-Worker-Token"] || headers["x-agent-studio-worker-token"] || "")
    if ($os.getenv("AGENT_STUDIO_BACKGROUND_WORKER") !== "true" || expected.length < 32)
      return e.json(503, { error: "worker_disabled" })
    var difference = expected.length ^ supplied.length
    for (var i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ (i < supplied.length ? supplied.charCodeAt(i) : 0)
    if (difference !== 0) return e.json(401, { error: "unauthorized_worker" })
    var body = (e.requestInfo() || {}).body || {}
    var name = String(body.worker_instance || "main")
    if (name !== "main" && !/^w-[a-f0-9]{24}$/.test(name))
      return e.json(400, { error: "invalid_worker_instance" })
    var now = new Date().toISOString()
    // Heartbeat intentionally does not know or renew any run's lease. Thus
    // an alive process cannot extend a crashed/stolen execution owner's token.
    $app.runInTransaction(function (tx) {
      var records = tx.findRecordsByFilter("agent_worker_health",
        "worker_name = {:name}", "", 1, 0, { name: name })
      var record = records.length ? records[0] :
        new Record(tx.findCollectionByNameOrId("agent_worker_health"))
      if (!records.length) record.set("worker_name", name)
      record.set("last_seen", now)
      tx.save(record)
    })
    return e.json(200, { ok: true })
  } catch (error) {
    try { $app.logger().error("worker heartbeat error", "err", String(error)) } catch (_) {}
    return e.json(500, { error: "worker_heartbeat_failed" })
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
    var workerBody = (e.requestInfo() || {}).body || {}
    var workerName = String(workerBody.worker_instance || "main")
    if (workerName !== "main" && !/^w-[a-f0-9]{24}$/.test(workerName))
      return e.json(400, { error: "invalid_worker_instance" })
    // Throttled heartbeat: one database update per approximately 12s while idle.
    var health = null
    try {
      health = $app.findFirstRecordByFilter("agent_worker_health",
        "worker_name = {:name}", { name: workerName })
    } catch (_) {}
    if (!health) {
      try {
        var healthCol = $app.findCollectionByNameOrId("agent_worker_health")
        health = new Record(healthCol)
        health.set("worker_name", workerName)
      } catch (_) { health = null }
    }
    if (health) {
      var lastText = String(health.getString("last_seen") || "")
      var lastMs = lastText ? new Date(lastText).getTime() : 0
      var heartbeatDue = !lastMs || now - lastMs >= 12000
      var reported = null
      try { reported = (e.requestInfo() || {}).body.subsystems } catch (_) {}
      var componentChanged = false
      if (reported && typeof reported === "object" && !Array.isArray(reported)) {
        var safeComponents = {}
        var labels = ["schedules", "knowledge"]
        for (var hk = 0; hk < labels.length; hk++) {
          var name = labels[hk]
          var raw = reported[name] || {}
          var state = String(raw.state || "")
          if (state !== "healthy" && state !== "retrying" && state !== "unverified")
            state = "unverified"
          var failures = Number(raw.failures || 0)
          if (!Number.isSafeInteger(failures) || failures < 0) failures = 0
          var retryAt = Number(raw.retry_at_ms || 0)
          if (!Number.isSafeInteger(retryAt) || retryAt < now - 120000 ||
              retryAt > now + 120000) retryAt = 0
          safeComponents[name] = {
            state: state, failures: Math.min(failures, 999),
            retry_at_ms: retryAt,
          }
        }
        // Persist only after sanitizing; never copy caller-provided URLs,
        // exception messages, user details or arbitrary extra properties.
        var encoded = JSON.stringify(safeComponents)
        var prior = ""
        try {
          var priorValue = JSON.parse(String(health.getString("components_json") || "{}"))
          if (priorValue && priorValue.components) prior = JSON.stringify(priorValue.components)
        } catch (_) {}
        if (encoded !== prior || heartbeatDue) {
          health.set("components_json", JSON.stringify({
            components: safeComponents, reported_at_ms: now,
          }))
          componentChanged = true
        }
      }
      if (heartbeatDue || componentChanged) {
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
          "X-Agent-Studio-Worker-Token": expected,
          "X-Agent-Studio-Worker-Instance": workerName },
        body: "{}",
        // The inner model HTTP timeout is capped at 240s. Keep this proxy
        // longer so a slow-but-valid tick can return before the lease expires.
        timeout: 300,
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
      // Reload under the write transaction: an independent heartbeat may
      // have touched this instance while the long model/tool tick was waiting.
      try {
        $app.runInTransaction(function (tx) {
          var fresh = tx.findRecordById("agent_worker_health", health.id)
          if (moved) fresh.set("last_step_at", new Date().toISOString())
          fresh.set("tick_attempts_total",
            Number(fresh.get("tick_attempts_total") || 0) + 1)
          tx.save(fresh)
        })
      } catch (healthError) {
        try { $app.logger().error("worker step health update", "err", String(healthError)) } catch (_) {}
      }
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
    // Bounded inventory of independent Worker processes. An instance name is
    // a random process ID; it is not a hostname, username, access token or a
    // claim that this instance owns a particular task lease.
    var healthRows = $app.findRecordsByFilter(
      "agent_worker_health", "", "-last_seen", 33, 0)
    var instanceSampled = healthRows.length > 12
    var instances = []
    var observedNow = new Date().getTime()
    var lastStepAt = ""
    var tickAttempts = 0
    for (var hi = 0; hi < healthRows.length; hi++) {
      var entry = healthRows[hi]
      var name = String(entry.getString("worker_name") || "")
      var seen = String(entry.getString("last_seen") || "")
      var seenMs = seen ? new Date(seen).getTime() : 0
      var ageMs = Number.isFinite(seenMs) && seenMs > 0 && seenMs <= observedNow
        ? Math.max(0, observedNow - seenMs) : null
      var recent = enabled && ageMs !== null && ageMs < 180000
      var stepAt = String(entry.getString("last_step_at") || "")
      if (stepAt > lastStepAt) lastStepAt = stepAt
      tickAttempts += Math.max(0, Number(entry.get("tick_attempts_total") || 0) || 0)
      if (hi < 12) instances.push({
        label: name === "main" ? "旧版 Worker" :
          (/^w-[a-f0-9]{24}$/.test(name) ? "Worker " + name.slice(-8) : "未知实例"),
        last_seen_age_ms: ageMs, last_step_at: stepAt,
        recent: recent,
        attempts: Math.max(0, Number(entry.get("tick_attempts_total") || 0) || 0),
      })
    }
    var health = healthRows.length ? healthRows[0] : null
    var lastSeen = health ? String(health.getString("last_seen") || "") : ""
    var lastMs = lastSeen ? new Date(lastSeen).getTime() : 0
    // This is heartbeat recency, NOT proof that a live lease belongs to that Worker.
    var alive = enabled && Number.isFinite(lastMs) && lastMs > 0 &&
      lastMs <= observedNow && observedNow - lastMs < 180000
    // A single last reporter cannot prove every Worker process is alive.
    // Component health is an allow-listed last-observed report, not current
    // machine telemetry; omit or mark stale evidence instead of inferring OK.
    var components = {
      schedules: { state: "unverified", failures: 0, retry_at_ms: 0 },
      knowledge: { state: "unverified", failures: 0, retry_at_ms: 0 },
    }
    var componentReportedAt = 0
    try {
      var summary = JSON.parse(String(health && health.getString("components_json") || "{}"))
      var observed = Number(summary.reported_at_ms || 0)
      if (Number.isSafeInteger(observed) && observed <= new Date().getTime() &&
          new Date().getTime() - observed < 180000) {
        componentReportedAt = observed
        for (var cs = 0; cs < 2; cs++) {
          var label = cs === 0 ? "schedules" : "knowledge"
          var report = (summary.components || {})[label] || {}
          var reportedState = String(report.state || "unverified")
          if (reportedState !== "healthy" && reportedState !== "retrying" &&
              reportedState !== "unverified") reportedState = "unverified"
          components[label] = {
            state: reportedState,
            failures: Math.min(999, Math.max(0, Number(report.failures || 0) || 0)),
            retry_at_ms: Number(report.retry_at_ms || 0) || 0,
          }
        }
      }
    } catch (_) {}
    // User-scoped queue summary: bounded recent sample, no other user's IDs or credentials.
    var nowMs = new Date().getTime()
    var queue = {
      agent_running: 0, workflow_running: 0, awaiting_approval: 0,
      needs_review: 0,
      scheduled_active: 0, scheduled_pending: 0, scheduled_overdue: 0,
      oldest_due_age_ms: 0,
      paused: 0, failed_recent: 0, ready_estimate: 0, inflight: 0,
      expired_lease_candidates: 0, unresolved_writes: 0,
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
      } catch (err) { throw err }
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
    } catch (err) { throw err }
    // Lease expiry is a takeover *candidate*, never proof that a write can be
    // replayed. Worker tick still checks the durable write-intent journal.
    try {
      var expired = new DynamicModel({ total: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_run_leases l " +
        "WHERE l.expires_ms > 0 AND l.expires_ms <= {:now} AND " +
        "((l.kind='agent' AND EXISTS (SELECT 1 FROM agent_runs a " +
          "WHERE a.id=l.run_id AND a.rh_user_id={:uid} AND a.status='running')) " +
        "OR (l.kind='workflow' AND EXISTS (SELECT 1 FROM workflow_runs w " +
          "WHERE w.id=l.run_id AND w.rh_user_id={:uid} AND w.status='running')))"
      ).bind({ now: nowMs, uid: uid }).one(expired)
      queue.expired_lease_candidates = Number(expired.total || 0)
    } catch (err) { throw err }
    try {
      var uncertain = new DynamicModel({ total: 0 })
      $app.db().newQuery(
        "SELECT COUNT(*) AS total FROM agent_studio_side_effects " +
        "WHERE status IN ('started','unknown') AND " +
        "((kind='agent' AND run_id IN (SELECT id FROM agent_runs WHERE rh_user_id={:uid})) " +
        "OR (kind='workflow' AND run_id IN (SELECT id FROM workflow_runs WHERE rh_user_id={:uid})))"
      ).bind({ uid: uid }).one(uncertain)
      queue.unresolved_writes = Number(uncertain.total || 0)
    } catch (err) { throw err }
    // Owner-scoped active claims are derived from the authoritative CAS table.
    // Lease token and secrets are NEVER included; an expired lease or a
    // heartbeat alone is not evidence of current execution ownership.
    var activeClaims = []
    var activeClaimsSampled = false
    try {
      var claims = arrayOf(new DynamicModel({
        kind: "", run_id: "", owner_instance: "", expires_ms: 0,
      }))
      $app.db().newQuery(
        "SELECT l.kind,l.run_id,l.owner_instance,l.expires_ms FROM agent_studio_run_leases l " +
        "WHERE l.expires_ms > {:now} AND " +
        "((l.kind='agent' AND EXISTS(SELECT 1 FROM agent_runs a WHERE a.id=l.run_id " +
          "AND a.rh_user_id={:uid} AND a.status='running')) OR " +
        "(l.kind='workflow' AND EXISTS(SELECT 1 FROM workflow_runs w WHERE w.id=l.run_id " +
          "AND w.rh_user_id={:uid} AND w.status='running'))) " +
        "ORDER BY l.expires_ms ASC LIMIT 21"
      ).bind({ uid: uid, now: nowMs }).all(claims)
      activeClaimsSampled = claims.length > 20
      for (var ai = 0; ai < claims.length && ai < 20; ai++) {
        var claim = claims[ai]
        var claimant = String(claim.owner_instance || "")
        activeClaims.push({
          kind: String(claim.kind || ""),
          run_id: String(claim.run_id || ""),
          holder: claimant === "main" ? "旧 Worker" :
            /^w-[a-f0-9]{24}$/.test(claimant) ? "Worker " + claimant.slice(-8) : "未归属 Worker",
          expires_in_ms: Math.max(0, Number(claim.expires_ms || 0) - nowMs),
          worker_attributed: claimant === "main" || /^w-[a-f0-9]{24}$/.test(claimant),
        })
      }
    } catch (err) { throw err }
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
    } catch (err) { throw err }
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
    } catch (err) { throw err }
    queue.ready_estimate = Math.max(0, queue.agent_running + queue.workflow_running - queue.inflight)
    return e.json(200, {
      ok: true,
      enabled: enabled,
      alive: alive,
      last_seen: lastSeen,
      last_step_at: lastStepAt,
      tick_attempts_total: tickAttempts,
      instances: instances,
      instances_sampled: instanceSampled,
      instances_recent: instances.filter(function (v) { return v.recent }).length,
      active_claims: activeClaims,
      active_claims_sampled: activeClaimsSampled,
      observed_at_ms: nowMs,
      last_seen_age_ms: lastMs > 0 ? Math.max(0, nowMs - lastMs) : null,
      components: components,
      components_observed_at_ms: componentReportedAt || null,
      queue: queue,
    })
  } catch (err) {
    return e.json(500, { error: "worker_status_failed" })
  }
})
