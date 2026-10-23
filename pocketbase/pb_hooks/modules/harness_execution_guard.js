"use strict"

// Common PocketBase/SQLite execution lease protocol. Agent and Workflow use the
// same CAS claim, lease-owner fence and conditional release. No public routes.
var TABLES = { agent: "agent_runs", workflow: "workflow_runs" }
var DEFAULT_TTL_MS = 600000

function problem(code) {
  var e = new Error(code)
  e.code = code
  return e
}
function checked(kind, runId, owner, token) {
  if (!Object.prototype.hasOwnProperty.call(TABLES, kind) ||
      !/^[a-zA-Z0-9]{15,40}$/.test(String(runId || "")) ||
      !String(owner || "").trim() || String(owner).length > 64 ||
      !/^[a-zA-Z0-9]{32,80}$/.test(String(token || ""))) {
    throw problem("execution_lease_invalid_identity")
  }
  return TABLES[kind]
}
function claim(app, kind, runId, owner, token, atMs, ttlMs, instanceId) {
  var table = checked(kind, runId, owner, token)
  var now = Number(atMs)
  var ttl = ttlMs === undefined ? DEFAULT_TTL_MS : Number(ttlMs)
  if (!Number.isSafeInteger(now) || now <= 0 || !Number.isSafeInteger(ttl) ||
      ttl < 1000 || ttl > DEFAULT_TTL_MS) throw problem("execution_lease_invalid_time")
  var instance = String(instanceId || "")
  if (instance && instance !== "main" && !/^w-[a-f0-9]{24}$/.test(instance))
    throw problem("execution_lease_invalid_instance")
  var response = app.db().newQuery(
    "INSERT INTO agent_studio_run_leases(kind,run_id,lease_token,acquired_ms,expires_ms,attempts,owner_instance) " +
    "SELECT {:kind},{:rid},{:token},{:now},{:until},1,{:instance} FROM " + table +
    " WHERE id={:rid} AND rh_user_id={:owner} AND status='running' " +
    "ON CONFLICT(kind,run_id) DO UPDATE SET " +
    "lease_token=excluded.lease_token,acquired_ms=excluded.acquired_ms," +
    "expires_ms=excluded.expires_ms,owner_instance=excluded.owner_instance," +
    "attempts=agent_studio_run_leases.attempts+1 " +
    "WHERE agent_studio_run_leases.expires_ms < {:now}"
  ).bind({
    kind: kind, rid: runId, token: token, now: now, until: now + ttl, owner: owner,
    instance: instance,
  }).execute()
  return Number(response.rowsAffected()) === 1
}

// Locks the lease row for the entire transaction via conditional UPDATE.
// Any mutation callback MUST use tx.save, never app.save, for atomicity.
// Status exceptions are explicit and narrowly allow-listed for safe stop handling.
function mutateStatuses(app, kind, runId, owner, token, allowedStatuses, modify) {
  var table = checked(kind, runId, owner, token)
  if (typeof modify !== "function" || !Array.isArray(allowedStatuses) ||
      !allowedStatuses.length || allowedStatuses.length > 8)
    throw problem("execution_mutation_invalid")
  var allowed = Object.create(null)
  for (var i = 0; i < allowedStatuses.length; i++) {
    var status = String(allowedStatuses[i] || "")
    if (!/^[a-z_]{1,32}$/.test(status)) throw problem("execution_mutation_invalid")
    allowed[status] = true
  }
  var result
  app.runInTransaction(function (tx) {
    var now = new Date().getTime()
    var fence = tx.db().newQuery(
      "UPDATE agent_studio_run_leases SET expires_ms=expires_ms " +
      "WHERE kind={:kind} AND run_id={:rid} AND lease_token={:token} " +
      "AND expires_ms > {:now}"
    ).bind({ kind: kind, rid: runId, token: token, now: now }).execute()
    if (Number(fence.rowsAffected()) !== 1) throw problem("execution_lease_lost")
    var record = tx.findRecordById(table, runId)
    if (String(record.get("rh_user_id") || "") !== owner)
      throw problem("execution_run_not_running")
    var currentStatus = String(record.get("status") || "")
    if (allowed[currentStatus] !== true) {
      throw problem(allowedStatuses.length === 1 && allowedStatuses[0] === "running"
        ? "execution_run_not_running" : "execution_run_state_changed")
    }
    result = modify(tx, record)
  })
  return result
}
function mutate(app, kind, runId, owner, token, modify) {
  return mutateStatuses(app, kind, runId, owner, token, ["running"], modify)
}

// A lease holder can extend its own unexpired lease only; a stale holder
// cannot resurrect a stolen lease. This is NOT a background heartbeat.
function renew(app, kind, runId, owner, token, ttlMs) {
  var table = checked(kind, runId, owner, token)
  var ttl = ttlMs === undefined ? DEFAULT_TTL_MS : Number(ttlMs)
  if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > DEFAULT_TTL_MS)
    throw problem("execution_lease_invalid_time")
  var now = new Date().getTime()
  var response = app.db().newQuery(
    "UPDATE agent_studio_run_leases SET expires_ms = MAX(expires_ms, {:until}) " +
    "WHERE kind={:kind} AND run_id={:rid} AND lease_token={:token} AND expires_ms > {:now} " +
    "AND EXISTS (SELECT 1 FROM " + table + " WHERE id={:rid} " +
      "AND rh_user_id={:owner} AND status='running')"
  ).bind({ kind: kind, rid: runId, token: token, owner: owner,
    now: now, until: now + ttl }).execute()
  return Number(response.rowsAffected()) === 1
}
// An outbound model/tool attempt must extend ONLY its own still-live lease.
// The renewal and run-state/deadline check share one SQLite write transaction,
// so cancellation, takeover, and terminal completion cannot race the check.
// This is a bounded operation-boundary renewal, not a background heartbeat
// and not a guarantee that a single uninterruptible call can outlive the TTL.
function renewForDispatch(app, kind, runId, owner, token, options) {
  var table = checked(kind, runId, owner, token)
  var p = options || {}
  var ttl = p.ttlMs === undefined ? DEFAULT_TTL_MS : Number(p.ttlMs)
  var callWindow = p.maxCallMs === undefined ? 150000 : Number(p.maxCallMs)
  if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > DEFAULT_TTL_MS ||
      !Number.isSafeInteger(callWindow) || callWindow < 0 ||
      callWindow + 30000 > ttl)
    throw problem("execution_dispatch_invalid_window")
  app.runInTransaction(function (tx) {
    var now = new Date().getTime()
    var updated = tx.db().newQuery(
      "UPDATE agent_studio_run_leases SET expires_ms=MAX(expires_ms,{:until}) " +
      "WHERE kind={:kind} AND run_id={:rid} AND lease_token={:token} " +
      "AND expires_ms > {:now} AND EXISTS (SELECT 1 FROM " + table +
        " WHERE id={:rid} AND rh_user_id={:owner} AND status='running')"
    ).bind({
      kind: kind, rid: runId, owner: owner, token: token, now: now, until: now + ttl,
    }).execute()
    if (Number(updated.rowsAffected()) !== 1) throw problem("execution_lease_lost")
    var record = tx.findRecordById(table, runId)
    if (String(record.get("rh_user_id") || "") !== owner ||
        String(record.get("status") || "") !== "running")
      throw problem("execution_run_not_running")
    // PocketBase JSON fields can be JsonRaw byte wrappers when read via
    // record.get(). Always prefer the canonical serialized JSON getString().
    var checkpoint = null
    try {
      var raw = ""
      if (typeof record.getString === "function") raw = String(record.getString("checkpoint") || "")
      if (raw) checkpoint = JSON.parse(raw)
      else {
        checkpoint = record.get("checkpoint") || {}
        if (typeof checkpoint === "string") checkpoint = JSON.parse(checkpoint)
      }
    } catch (_) { throw problem("execution_dispatch_invalid_checkpoint") }
    if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint))
      throw problem("execution_dispatch_invalid_checkpoint")
    // A stop accepted while the previous read-only network attempt was
    // in flight must block a subsequent retry. The predicate shares the
    // same transaction as lease renewal; the caller cannot race a new
    // external dispatch past an already-committed stop request.
    if (checkpoint.cancel_requested === true ||
        (kind === "agent" && checkpoint.pause_requested === true))
      throw problem("execution_stop_requested")
    var deadline = Number(checkpoint.execution_deadline_ms || 0)
    if (!Number.isSafeInteger(deadline) || deadline < 0)
      throw problem("execution_dispatch_invalid_checkpoint")
    if (deadline > 0 && now >= deadline)
      throw problem("run_runtime_deadline_exceeded")
  })
  return true
}

function release(app, kind, runId, owner, token) {
  checked(kind, runId, owner, token)
  var result = app.db().newQuery(
    "UPDATE agent_studio_run_leases SET expires_ms=0,lease_token='' " +
    "WHERE kind={:kind} AND run_id={:rid} AND lease_token={:token}"
  ).bind({ kind: kind, rid: runId, token: token }).execute()
  return Number(result.rowsAffected()) === 1
}

module.exports = {
  claim: claim, mutate: mutate, mutateStatuses: mutateStatuses,
  renew: renew, renewForDispatch: renewForDispatch, release: release,
}
