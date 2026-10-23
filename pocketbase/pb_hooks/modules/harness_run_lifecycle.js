"use strict"

// Shared run admission, durable start checkpoint, optional run deadline and
// response classification for PocketBase Agent/Workflow. The decision loop and
// graph-node executor remain separate adapters; this is the common lifecycle.
var DEFAULT_TTL_MS = 600000
var OWNERSHIP_ERRORS = {
  execution_lease_lost: true,
  execution_run_not_running: true,
  run_not_running: true,
}

function normalizeRuntimeMinutes(value) {
  if (value === undefined || value === null || value === "")
    return { ok: true, minutes: 0 }
  var n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 1440)
    return { ok: false, error: "invalid_max_runtime_minutes" }
  return { ok: true, minutes: n }
}
function deadlineFromMinutes(value, nowMs) {
  var parsed = normalizeRuntimeMinutes(value)
  if (!parsed.ok) return parsed
  var now = Number(nowMs)
  if (!Number.isSafeInteger(now) || now <= 0)
    return { ok: false, error: "invalid_runtime_clock" }
  return { ok: true, minutes: parsed.minutes,
    deadline_ms: parsed.minutes ? now + parsed.minutes * 60000 : 0 }
}
// Rechecked at each model/tool boundary as well as initial admission.
// Does not forcibly interrupt an in-flight third-party HTTP request.
function withinDeadline(checkpoint, nowMs) {
  var value = Number((checkpoint || {}).execution_deadline_ms || 0)
  var now = nowMs === undefined ? Date.now() : Number(nowMs)
  return Number.isSafeInteger(now) && now > 0 &&
    Number.isSafeInteger(value) && value >= 0 &&
    (value === 0 || now < value)
}
function readSnapshot(loadCheckpoint, record) {
  var value = loadCheckpoint(record)
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_run_checkpoint")
  return value
}
function enter(app, guard, options) {
  var p = options || {}
  if (!guard || typeof guard.claim !== "function" ||
      typeof guard.mutate !== "function" ||
      typeof guard.release !== "function" ||
      typeof p.loadCheckpoint !== "function")
    throw new Error("invalid_run_lifecycle_adapter")
  var kind = String(p.kind || "")
  var id = String(p.runId || "")
  var owner = String(p.owner || "")
  var token = String(p.token || "")
  var now = p.nowMs === undefined ? Date.now() : Number(p.nowMs)
  var ttl = p.ttlMs === undefined ? DEFAULT_TTL_MS : Number(p.ttlMs)
  if (!Number.isSafeInteger(now) || now <= 0 ||
      !Number.isSafeInteger(ttl) || ttl < 1000 || ttl > DEFAULT_TTL_MS)
    throw new Error("invalid_run_lifecycle_clock")
  var acquired = guard.claim(app, kind, id, owner, token, now, ttl, String(p.workerInstance || ""))
  if (!acquired) return { acquired: false, busy: true }
  try {
    var snapshot = null
    var deadlineExceeded = false
    // The snapshot MUST be fetched inside the same fenced transaction as
    // claim_until: a pre-claim snapshot may belong to a previous worker.
    guard.mutate(app, kind, id, owner, token, function (tx, record) {
      snapshot = readSnapshot(p.loadCheckpoint, record)
      var deadline = Number(snapshot.execution_deadline_ms || 0)
      if (deadline && (!Number.isSafeInteger(deadline) || deadline < 0))
        throw new Error("invalid_run_deadline_checkpoint")
      deadlineExceeded = deadline > 0 && now >= deadline
      snapshot.claim_until = deadlineExceeded ? 0 : now + ttl
      if (deadlineExceeded) {
        snapshot.pause_requested = false
        snapshot.cancel_requested = false
      }
      record.set("checkpoint", snapshot)
      if (deadlineExceeded) {
        // Preserve prior steps/evidence, stop new model or tool operations.
        // The optional structured failure classifier is pure and cannot
        // override the lease owner's transactional status decision.
        if (typeof p.classifyFailure === "function")
          snapshot.failure_diagnostic = p.classifyFailure("run_runtime_deadline_exceeded")
        record.set("checkpoint", snapshot)
        record.set("status", "failed")
        record.set("error", "run_runtime_deadline_exceeded")
      }
      tx.save(record)
    })
    return {
      acquired: true, busy: false, checkpoint: snapshot,
      leaseUntil: now + ttl, deadlineExceeded: deadlineExceeded,
    }
  } catch (err) {
    // No usable step was admitted. Release only the token we acquired.
    try { guard.release(app, kind, id, owner, token) } catch (_) {}
    throw err
  }
}
function leave(app, guard, options) {
  var p = options || {}
  return guard.release(app, p.kind, p.runId, p.owner, p.token)
}
function ownershipLost(err) {
  var code = String(err && (err.code || err.message || err) || "")
  return OWNERSHIP_ERRORS[code] === true
}
function response(runId, status, action) {
  var a = action || {}
  var result = {
    ok: true, run_id: String(runId || ""), status: String(status || "running"),
    stepped: Boolean(a.stepped), busy: Boolean(a.busy),
  }
  if (a.deadlineExceeded) result.deadline_exceeded = true
  return result
}

module.exports = {
  normalizeRuntimeMinutes: normalizeRuntimeMinutes,
  deadlineFromMinutes: deadlineFromMinutes,
  enter: enter, leave: leave, ownershipLost: ownershipLost,
  withinDeadline: withinDeadline, response: response,
}
