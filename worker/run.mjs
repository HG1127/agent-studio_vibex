#!/usr/bin/env node
// Standalone worker for Agent Studio VibeX. No third-party dependencies.
// Designed to run under systemd, Docker restart policies or Windows Task Scheduler.
import { setTimeout as sleep } from "node:timers/promises"
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
const timeout = ms("AGENT_STUDIO_WORKER_REQUEST_TIMEOUT_MS", 145000, 5000, 240000)
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

async function advance() {
  const response = await fetch(endpoint + "/api/internal/worker/step", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Studio-Worker-Token": token,
    },
    body: "{}",
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

log("info", "worker_started", { endpoint, interval_ms: interval, once })
while (active) {
  try {
    // Prioritize overdue schedules and interactive Agent/Workflow advancement
    // before spending time on background Embedding requests.
    const scheduleResult = await dispatchScheduledTask()
    const result = await advance()
    const indexResult = await advanceKnowledgeIndex()
    if(indexResult.indexed_batch>0) log("info","knowledge_index_advanced",{
      indexed_batch:indexResult.indexed_batch,pending_chunks:indexResult.pending_chunks,
    })
    if(indexResult.failed) log("error","knowledge_index_retry_scheduled",{error:indexResult.error})
    failures = 0
    if (result.stepped) {
      executed++
      log("info", "run_advanced", { kind: result.kind, run_id: result.run_id, status: result.status })
    } else if (once) log("info", "idle")
    if (once) break
    // Steps run serially; only poll again after the previous request returns.
    await sleep(result.idle && !scheduleResult.scheduled && indexResult.idle ? interval : Math.max(100, Math.min(500, interval)))
  } catch (error) {
    failures++
    log("error", "step_failed", { detail: String(error.message || error).slice(0, 300), failures })
    if (once || error.fatal) { process.exitCode = 1; break }
    // Exponential backoff limits CPU and request storms during outages.
    const backoff = Math.min(60000, interval * 2 ** Math.min(5, failures))
    await sleep(backoff)
  }
}
log("info", "worker_stopped", { executed, failures })
