#!/usr/bin/env node
// Standalone worker for Agent Studio VibeX. No third-party dependencies.
// Designed to run under systemd, Docker restart policies or Windows Task Scheduler.
import { setTimeout as sleep } from "node:timers/promises"
import { randomBytes } from "node:crypto"
import { resolveWorkerRequestTimeout } from "./config.mjs"
import { nextScheduleTime } from "../src/lib/scheduleTime.js"

const args = new Set(process.argv.slice(2))
const once = args.has("--once")
const quiet = args.has("--quiet")
const endpoint = String(process.env.AGENT_STUDIO_WORKER_URL || "http://127.0.0.1:7000").replace(/\/+$/, "")
const token = String(process.env.AGENT_STUDIO_WORKER_TOKEN || "")
const ms = (name, fallback, minimum, maximum) => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= minimum && n <= maximum ? Math.floor(n) : fallback
}
const interval = ms("AGENT_STUDIO_WORKER_INTERVAL_MS", 3000, 500, 120000)
const timeout = resolveWorkerRequestTimeout(process.env.AGENT_STUDIO_WORKER_REQUEST_TIMEOUT_MS)
const heartbeatEvery = ms("AGENT_STUDIO_WORKER_HEARTBEAT_INTERVAL_MS", 30000, 1000, 60000)
// Ephemeral per-process identity; never contains hostname, username or secrets.
const instanceId = "w-" + randomBytes(12).toString("hex")
if (!/^https?:\/\//.test(endpoint)) throw new Error("AGENT_STUDIO_WORKER_URL must be an http(s) URL")
const parsedEndpoint = new URL(endpoint)
if (parsedEndpoint.username || parsedEndpoint.password || parsedEndpoint.search || parsedEndpoint.hash) {
  throw new Error("AGENT_STUDIO_WORKER_URL must not contain credentials, query or fragment")
}
if (parsedEndpoint.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(parsedEndpoint.hostname)) {
  if (process.env.AGENT_STUDIO_WORKER_ALLOW_INSECURE_HTTP !== "true") {
    throw new Error("Remote worker API must use HTTPS; plaintext remote URLs expose the worker token")
  }
}
if (token.length < 32) throw new Error("AGENT_STUDIO_WORKER_TOKEN must contain at least 32 characters")
let active = true
let failures = 0
let executed = 0
function log(level, message, context = {}) {
  if (quiet && level === "info") return
  const line = { time: new Date().toISOString(), level, message, ...context }
  process.stdout.write(JSON.stringify(line) + "\n")
}
process.on("SIGINT", () => { active = false })
process.on("SIGTERM", () => { active = false })

async function advance(componentSnapshot) {
  const response = await fetch(endpoint + "/api/internal/worker/step", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Studio-Worker-Token": token,
    },
    // Only bounded health enum/count values are transmitted. Do not send raw
    // endpoint URLs, exception details, user IDs, or credentials in health data.
    body: JSON.stringify({ worker_instance: instanceId, subsystems: componentSnapshot }),
    signal: AbortSignal.timeout(timeout),
  })
  let payload = {}
  try { payload = await response.json() } catch {}
  if (response.status === 401 || response.status === 403) {
    const err = new Error("Worker authorization rejected; verify server and worker secrets")
    err.fatal = true
    throw err
  }
  if (response.status === 503 && payload.error === "worker_disabled") {
    const err = new Error("Background worker is disabled on the PocketBase server")
    err.fatal = true
    throw err
  }
  if (!response.ok || payload.ok !== true) {
    const err = new Error("Worker API returned " + response.status + ": " + String(payload.error || "unknown"))
    err.status = response.status
    throw err
  }
  return payload
}


async function dispatchScheduledTask() {
  const peekRes = await fetch(endpoint + "/api/internal/schedules/next", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Studio-Worker-Token": token },
    body: "{}",
    signal: AbortSignal.timeout(Math.min(timeout, 30000)),
  })
  const peek = await peekRes.json().catch(() => ({}))
  if (!peekRes.ok || peek.ok !== true) {
    if (peekRes.status === 401 || peekRes.status === 503) {
      const error = new Error("Schedule dispatcher is unauthorized or disabled")
      error.fatal = true
      throw error
    }
    throw new Error("Failed to inspect scheduled tasks: " + peekRes.status)
  }
  if (!peek.due) return { scheduled: false }
  const rule = peek.schedule
  const dueAt = Number(peek.scheduled_for_ms)
  const now = Math.max(Date.now(), Number(peek.now_ms || 0))
  let nextAt = 0
  try {
    if (rule.recurrence_kind !== "once") {
      nextAt = nextScheduleTime(rule, Math.max(now, dueAt), dueAt)
      if (!Number.isSafeInteger(nextAt) || nextAt <= now) throw new Error("next_occurrence_invalid")
    }
  } catch (error) {
    const report = await fetch(endpoint + "/api/internal/schedules/reject-invalid", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agent-Studio-Worker-Token": token },
      body: JSON.stringify({
        schedule_id: rule.id, scheduled_for_ms: dueAt,
        reason: String(error.message || "invalid_recurrence").slice(0, 80),
      }),
      signal: AbortSignal.timeout(Math.min(timeout, 30000)),
    })
    if (!report.ok) throw new Error("Unable to quarantine invalid schedule")
    log("error", "scheduled_task_invalid", { schedule_id: rule.id })
    return { scheduled: true, invalid: true }
  }
  const response = await fetch(endpoint + "/api/internal/schedules/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Studio-Worker-Token": token },
    body: JSON.stringify({
      schedule_id: rule.id, scheduled_for_ms: dueAt,
      next_at_ms: nextAt,
    }),
    signal: AbortSignal.timeout(timeout),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.ok !== true) {
    throw new Error("Schedule launch request failed: " + response.status + " " + String(result.error || "unknown"))
  }
  if (result.started) {
    log("info", "scheduled_run_created", {
      schedule_id: rule.id, run_id: result.run_id, kind: result.kind,
    })
  } else if (result.skipped) {
    log("info", "scheduled_occurrence_skipped", {
      schedule_id: rule.id, reason: result.reason,
    })
  }
  return { scheduled: Boolean(result.scheduled && (result.started || result.skipped || result.retryable)) }
}
// Incremental semantic indexing is deliberately bounded to one batch per
// Worker loop; failures are retried with per-knowledge-base backoff server-side.
async function advanceKnowledgeIndex() {
  const response=await fetch(endpoint+"/api/internal/knowledge/index-next",{
    method:"POST",
    headers:{"Content-Type":"application/json","X-Agent-Studio-Worker-Token":token},
    body:"{}",
    signal:AbortSignal.timeout(Math.min(timeout,40000)),
  })
  if(response.status===404)return {idle:true} // old server during staged rollout
  if(response.status===401||response.status===403){
    const error=new Error("Knowledge index worker authentication rejected")
    error.fatal=true
    throw error
  }
  if(!response.ok)throw new Error("Knowledge index dispatcher failed: "+response.status)
  const payload=await response.json().catch(()=>({}))
  if(payload.ok!==true)throw new Error("Knowledge index response invalid")
  return payload
}

// Schedules and semantic indexing are independent queues. A transient failure
// in either must not prevent ready Agent/Workflow tasks from advancing.
// Retry windows are per-subsystem so one broken endpoint does not flood logs
// or impose its backoff on otherwise healthy queues.
const subservices = {
  schedules: { failures: 0, nextAttemptAt: 0, seenSuccess: false },
  knowledge: { failures: 0, nextAttemptAt: 0, seenSuccess: false },
}
function componentSnapshot() {
  const snapshot = {}
  for (const name of ["schedules", "knowledge"]) {
    const state = subservices[name]
    snapshot[name] = {
      state: state.failures > 0 ? "retrying" : state.seenSuccess ? "healthy" : "unverified",
      failures: Math.min(state.failures, 999),
      retry_at_ms: state.nextAttemptAt > 0 ? state.nextAttemptAt : 0,
    }
  }
  return snapshot
}
async function optionalService(name, operation, fallback) {
  const state = subservices[name]
  if (Date.now() < state.nextAttemptAt) return { ...fallback, deferred: true }
  try {
    const result = await operation()
    if (result.failed) {
      // A successful HTTP request may explicitly signal a retryable indexing
      // failure; apply the same bounded cooldown as an HTTP/network error.
      const error = new Error(String(result.error || name + "_retryable_failure"))
      throw error
    }
    state.failures = 0
    state.nextAttemptAt = 0
    state.seenSuccess = true
    return result
  } catch (error) {
    // Credentials and disabled execution are not ordinary transient faults.
    // Preserve the existing fail-closed behavior for these conditions.
    if (error.fatal) throw error
    state.failures++
    const retryInMs = Math.min(60000,
      Math.max(5000, interval) * 2 ** Math.min(4, state.failures - 1))
    state.nextAttemptAt = Date.now() + retryInMs
    log("error", name + "_temporarily_unavailable", {
      detail: String(error.message || error).slice(0, 220),
      failures: state.failures, retry_in_ms: retryInMs,
    })
    return { ...fallback, deferred: true }
  }
}

// A Worker may be awaiting a slow HTTP tick. A separate bounded heartbeat
// reports process liveness during that wait; it never extends a task lease.
// Only the fenced executor may renew the execution lease.
let heartbeatBusy = false
async function heartbeat() {
  if (!active || heartbeatBusy) return
  heartbeatBusy = true
  try {
    const response = await fetch(endpoint + "/api/internal/worker/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agent-Studio-Worker-Token": token },
      body: JSON.stringify({ worker_instance: instanceId }),
      signal: AbortSignal.timeout(5000),
    })
    if (response.status === 401 || response.status === 403 ||
        (response.status === 503 && (await response.json().catch(() => ({}))).error === "worker_disabled")) {
      active = false
      process.exitCode = 1
      log("error", "worker_heartbeat_authorization_failed")
    } else if (!response.ok && response.status !== 404) {
      log("error", "worker_heartbeat_unreachable", { status: response.status })
    }
  } catch {
    log("error", "worker_heartbeat_network_unavailable")
  } finally {
    heartbeatBusy = false
  }
}
const heartbeatTimer = once ? null : setInterval(() => { void heartbeat() }, heartbeatEvery)
log("info", "worker_started", { endpoint, interval_ms: interval, once, worker: instanceId.slice(-8) })
while (active) {
  try {
    // Schedule failures are isolated; an unavailable scheduler must not
    // leave unrelated user-triggered Agents stuck in the pending queue.
    const scheduleResult = await optionalService(
      "schedules", dispatchScheduledTask, { scheduled: false })
    const result = await advance(componentSnapshot())
    const indexResult = await optionalService(
      "knowledge", advanceKnowledgeIndex, { idle: true })
    if (indexResult.indexed_batch > 0) log("info", "knowledge_index_advanced", {
      indexed_batch: indexResult.indexed_batch, pending_chunks: indexResult.pending_chunks,
    })
    failures = 0
    if (result.stepped) {
      executed++
      log("info", "run_advanced", { kind: result.kind, run_id: result.run_id, status: result.status, worker: instanceId.slice(-8) })
    } else if (once) log("info", "idle")
    if (once) break
    // Work is still serialized, but each optional subsystem has an independent
    // retry window; no extra delay is imposed on successful Agent steps.
    await sleep(result.idle && !scheduleResult.scheduled && indexResult.idle
      ? interval : Math.max(100, Math.min(500, interval)))
  } catch (error) {
    failures++
    log("error", "step_failed", { detail: String(error.message || error).slice(0, 300), failures })
    if (once || error.fatal) { process.exitCode = 1; break }
    // This global backoff applies only to an unavailable core Worker or
    // an intentional fatal condition, never to optional subsystem failures.
    const backoff = Math.min(60000, interval * 2 ** Math.min(5, failures))
    await sleep(backoff)
  }
}
if (heartbeatTimer) clearInterval(heartbeatTimer)
log("info", "worker_stopped", { executed, failures, worker: instanceId.slice(-8) })
