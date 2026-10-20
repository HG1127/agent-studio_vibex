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
function claim(app, kind, runId, owner, token, atMs, ttlMs) {
  var table = checked(kind, runId, owner, token)
  var now = Number(atMs)
  var ttl = ttlMs === undefined ? DEFAULT_TTL_MS : Number(ttlMs)
  if (!Number.isSafeInteger(now) || now <= 0 || !Number.isSafeInteger(ttl) ||
      ttl < 1000 || ttl > DEFAULT_TTL_MS) throw problem("execution_lease_invalid_time")
  var response = app.db().newQuery(
    "INSERT INTO agent_studio_run_leases(kind,run_id,lease_token,acquired_ms,expires_ms,attempts) " +
    "SELECT {:kind},{:rid},{:token},{:now},{:until},1 FROM " + table +
    " WHERE id={:rid} AND rh_user_id={:owner} AND status='running' " +
    "ON CONFLICT(kind,run_id) DO UPDATE SET " +
    "lease_token=excluded.lease_token,acquired_ms=excluded.acquired_ms," +
    "expires_ms=excluded.expires_ms,attempts=agent_studio_run_leases.attempts+1 " +
    "WHERE agent_studio_run_leases.expires_ms < {:now}"
  ).bind({
    kind: kind, rid: runId, token: token, now: now, until: now + ttl, owner: owner,
  }).execute()
  return Number(response.rowsAffected()) === 1
}

// Locks the lease row for the entire transaction via conditional UPDATE.
// A takeover or manual cancellation is checked again BEFORE writing state.
// Any mutation callback MUST use tx.save, never app.save, for atomicity.
function mutate(app, kind, runId, owner, token, modify) {
  var table = checked(kind, runId, owner, token)
  if (typeof modify !== "function") throw problem("execution_mutation_invalid")
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
    if (String(record.get("rh_user_id") || "") !== owner ||
        String(record.get("status") || "") !== "running")
      throw problem("execution_run_not_running")
    result = modify(tx, record)
  })
  return result
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
function release(app, kind, runId, owner, token) {
  checked(kind, runId, owner, token)
  var result = app.db().newQuery(
    "UPDATE agent_studio_run_leases SET expires_ms=0,lease_token='' " +
    "WHERE kind={:kind} AND run_id={:rid} AND lease_token={:token}"
  ).bind({ kind: kind, rid: runId, token: token }).execute()
  return Number(result.rowsAffected()) === 1
}

module.exports = {
  claim: claim, mutate: mutate, renew: renew, release: release,
}
