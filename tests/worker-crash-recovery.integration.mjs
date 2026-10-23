import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root = process.cwd()
const binary = process.env.POCKETBASE_BIN || path.join(root, "vibex-local", "bin", "windows", "pocketbase.exe")
assert.ok(fs.existsSync(binary), "POCKETBASE_BIN must point to a local PocketBase binary")
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-worker-crash-"))
const originPort = Number(process.env.PB_CRASH_TEST_PORT || 7384)
const modelPort = Number(process.env.PB_CRASH_MODEL_PORT || 7385)
const writePort = Number(process.env.PB_CRASH_WRITE_PORT || 7386)
const origin = "http://127.0.0.1:" + originPort
const owner = "crash-recovery-test-owner"
const token = "crash-worker-isolated-secret-32-characters"
const auth = { "X-Rh-User-Id": owner }
const env = {
  ...process.env,
  AGENT_STUDIO_ALLOW_ANON: "false",
  AGENT_STUDIO_BACKGROUND_WORKER: "true",
  AGENT_STUDIO_WORKER_TOKEN: token,
  AGENT_STUDIO_WORKER_INTERNAL_URL: origin,
  AGENT_STUDIO_WORKER_URL: origin,
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let pb = null
let acceptedWrites = 0
let modelCalls = 0
let resolveWriteReceived
const writeReceived = new Promise(resolve => { resolveWriteReceived = resolve })
const writeServer = createServer(async (req, res) => {
  for await (const _ of req) { /* drain */ }
  acceptedWrites++
  if (resolveWriteReceived) resolveWriteReceived()
  // First request is held open long enough to kill PocketBase mid-flight.
  // A later request answers normally, so the double-dispatch test is fast.
  if (acceptedWrites === 1) await sleep(6000)
  if (!res.destroyed) {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ receipt: "created-" + acceptedWrites }))
  }
})
const modelServer = createServer(async (req, res) => {
  let raw = ""
  for await (const part of req) raw += part.toString()
  modelCalls++
  const request = JSON.parse(raw || "{}")
  const user = (request.messages || []).filter(m => m.role === "user")
    .map(m => String(m.content || "")).join("\n")
  const initial = user.includes("（尚无，这是第一步）")
  const answer = initial
    ? { thought: "Only send the authorized POST once", action: "tool",
        tool: "CrashWrite", tool_input: { message: "only-once" } }
    : { thought: "Summarize the saved output", action: "final",
        final_answer: "The journaled write completed safely" }
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(answer) } }] }))
})

function startPocketBase() {
  const child = spawnHeadlessPocketBase(binary, [
    "serve", "--http=127.0.0.1:" + originPort,
    "--dir=" + directory, "--hooksDir=" + path.join(root, "pocketbase", "pb_hooks"),
  ], { cwd: path.join(root, "pocketbase"), env, windowsHide: true })
  let logs = ""
  child.stdout.on("data", b => { logs = (logs + b).slice(-4000) })
  child.stderr.on("data", b => { logs = (logs + b).slice(-4000) })
  return { child, logs: () => logs }
}
async function health(service) {
  for (let i = 0; i < 100; i++) {
    if (service.child.exitCode != null) throw new Error("PocketBase exited during startup: " + service.logs())
    try {
      if ((await fetch(origin + "/api/health", { signal: AbortSignal.timeout(400) })).ok) return
    } catch {}
    await sleep(120)
  }
  throw new Error("PocketBase failed readiness: " + service.logs())
}
async function api(method, route, body, extraHeaders = {}) {
  const res = await fetch(origin + route, {
    method, headers: { "Content-Type": "application/json", ...auth, ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
async function requireOk(method, route, body) {
  const response = await api(method, route, body)
  assert.equal(response.status, 200, JSON.stringify(response))
  return response.data
}
async function spawnOnce() {
  const child = spawn(process.execPath, ["worker/run.mjs", "--once"], {
    cwd: root, env, windowsHide: true,
  })
  let output = ""
  let error = ""
  child.stdout.on("data", b => { output += b })
  child.stderr.on("data", b => { error += b })
  const completed = new Promise(resolve => {
    child.once("error", err => resolve({ exit: -1, detail: err.message }))
    child.once("close", code => resolve({ exit: code }))
  })
  const timeout = setTimeout(() => { child.kill() }, 20000)
  try {
    const outcome = await completed
    assert.equal(outcome.exit, 0, output + "\n" + error + "\n" + outcome.detail)
    return output
  } finally {
    clearTimeout(timeout)
  }
}
async function newRun(connectionId, instruction) {
  const spec = await requireOk("POST", "/api/agent_specs", {
    name: "Crash safe writer", spec: {
      goal: "Issue the authorized write exactly once",
      task_scope: "Only approved test host",
      tools: ["CrashWrite"], task_plan: ["Write once", "Summarize"],
      deliverables: ["Receipt"], done_criteria: ["Persisted receipt"],
    },
  })
  const run = await requireOk("POST", "/api/agent-runs/start", {
    spec_id: spec.id, model: "mock-model", instruction,
    config: { max_steps: 4, tools: { CrashWrite: true },
      custom_model: { connection_id: connectionId, model_id: "mock-model" } },
  })
  return run.run_id
}
try {
  await Promise.all([
    new Promise(resolve => writeServer.listen(writePort, "127.0.0.1", resolve)),
    new Promise(resolve => modelServer.listen(modelPort, "127.0.0.1", resolve)),
  ])
  pb = startPocketBase()
  await health(pb)
  const connection = await requireOk("POST", "/api/model-connections", {
    name: "Crash recovery mock provider", provider: "openai",
    api_key: "test-only", base_url: "http://127.0.0.1:" + modelPort + "/v1",
    models: ["mock-model"],
  })
  await requireOk("POST", "/api/tool-connections", {
    name: "CrashWrite", description: "Test-only external POST",
    url: "http://127.0.0.1:" + writePort + "/receipt", method: "POST",
    headers: [], body_template: "{{input}}",
  })

  const crashedId = await newRun(connection.item.id, "write with crash")
  // The real PocketBase server performs the execution, not a fake mock of
  // the execution function. Force-kill that server during the remote POST.
  const forgedInstance = "w-" + "e".repeat(24)
  const inFlightTick = api("POST", "/api/llm/agent-engine/" + crashedId + "/tick", {},
    { "X-Agent-Studio-Worker-Instance": forgedInstance })
    .catch(() => ({ networkInterrupted: true }))
  let writeTimedOut = false
  const writeTimeout = setTimeout(() => { writeTimedOut = true }, 12000)
  try {
    // Poll the acknowledged remote request; the delay is intentionally bounded.
    for (let i = 0; i < 240 && acceptedWrites === 0 && !writeTimedOut; i++) await sleep(50)
    assert.equal(writeTimedOut, false, "crash_test_external_write_not_started")
    await writeReceived
  } finally {
    clearTimeout(writeTimeout)
  }
  assert.equal(acceptedWrites, 1)
  // Unverified callers cannot forge a lease-to-Worker binding simply by
  // supplying the Worker instance header: the worker token is server-only.
  const ownerClaims = await requireOk("GET", "/api/worker/status")
  const directClaim = ownerClaims.active_claims.find(x => x.run_id === crashedId)
  assert.ok(directClaim && directClaim.kind === "agent",
    "an in-flight direct Tick must be visible to its own employee")
  assert.equal(directClaim.worker_attributed, false)
  assert.equal(directClaim.holder, "未归属 Worker")
  assert.ok(directClaim.expires_in_ms > 0)
  const foreignStatus = await api("GET", "/api/worker/status", undefined,
    { "X-Rh-User-Id": "foreign-employee" })
  assert.equal(foreignStatus.status, 200)
  assert.ok(!foreignStatus.data.active_claims.some(x => x.run_id === crashedId),
    "another employee must never receive this lease, even without its token")

  // Independent process heartbeats remain available while PocketBase is
  // waiting on the external HTTP call, but must not extend the run lease.
  const leaseBeforeHeartbeatDb = new DatabaseSync(path.join(directory, "data.db"), { readOnly: true })
  let leaseBeforeHeartbeat = 0
  try {
    leaseBeforeHeartbeat = leaseBeforeHeartbeatDb.prepare(
      "SELECT expires_ms FROM agent_studio_run_leases WHERE kind='agent' AND run_id=?"
    ).get(crashedId).expires_ms
  } finally { leaseBeforeHeartbeatDb.close() }
  const heartbeatDuringTool = await fetch(origin + "/api/internal/worker/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Studio-Worker-Token": token },
    body: JSON.stringify({ worker_instance: "w-" + "d".repeat(24) }),
    signal: AbortSignal.timeout(4500),
  })
  assert.equal(heartbeatDuringTool.status, 200,
    "Heartbeat must be accepted independently during the blocked external POST")
  const leaseAfterHeartbeatDb = new DatabaseSync(path.join(directory, "data.db"), { readOnly: true })
  try {
    assert.equal(leaseAfterHeartbeatDb.prepare(
      "SELECT expires_ms FROM agent_studio_run_leases WHERE kind='agent' AND run_id=?"
    ).get(crashedId).expires_ms, leaseBeforeHeartbeat,
    "Process liveness heartbeat must never renew an execution lease")
  } finally { leaseAfterHeartbeatDb.close() }
  await stopHeadlessPocketBase(pb.child, 8000)
  await inFlightTick
  const dbPath = path.join(directory, "data.db")
  const db = new DatabaseSync(dbPath, { timeout: 5000 })
  try {
    const effect = db.prepare(
      "SELECT status FROM agent_studio_side_effects WHERE kind='agent' AND run_id=?"
    ).get(crashedId)
    assert.ok(effect, "The durable intent must exist before sending HTTP POST")
    assert.equal(effect.status, "started", "A crashed Worker must not forge a successful receipt")
    const stillRunning = db.prepare("SELECT status FROM agent_runs WHERE id=?").get(crashedId)
    assert.equal(stillRunning.status, "running")
    const originalLease = db.prepare(
      "SELECT expires_ms FROM agent_studio_run_leases WHERE kind='agent' AND run_id=?"
    ).get(crashedId)
    assert.ok(originalLease.expires_ms > Date.now(), "Crash left a valid future lease")
    // Simulate the clock after the 10-minute lease duration. Never operate
    // against a real DB; this directory is created inside os.tmpdir().
    db.prepare(
      "UPDATE agent_studio_run_leases SET expires_ms=? WHERE kind='agent' AND run_id=?"
    ).run(Date.now() - 1, crashedId)
    // Age the unresolved write for accurate owner-scoped monitoring.
    db.prepare(
      "UPDATE agent_studio_side_effects SET updated_ms=? WHERE kind='agent' AND run_id=?"
    ).run(Date.now() - 660000, crashedId)
  } finally { db.close() }

  pb = startPocketBase()
  await health(pb)
  const recoveryMetrics = await requireOk("GET", "/api/worker/status")
  assert.ok(recoveryMetrics.queue.expired_lease_candidates >= 1,
    "An owner-scoped expired lease must be visible as takeover diagnosis")
  assert.ok(recoveryMetrics.queue.unresolved_writes >= 1,
    "A started but unresolved external write must be shown before any Worker takeover")
  // New worker process must claim a resumed lease but refuse to replay
  // the prior external POST with unknown completion.
  await spawnOnce()
  const afterCrash = await requireOk("GET", "/api/agent_runs/" + crashedId)
  assert.equal(afterCrash.status, "failed", JSON.stringify(afterCrash))
  assert.match(afterCrash.error, /write_outcome_unknown/)
  assert.equal(afterCrash.checkpoint.failure_diagnostic?.category, "external_write")
  assert.equal(afterCrash.checkpoint.failure_diagnostic?.auto_retry_allowed, false)
  assert.equal(acceptedWrites, 1, "No external POST replay after PocketBase crash")
  const workerHealth = await requireOk("GET", "/api/worker/status")
  assert.equal(workerHealth.queue.needs_review, 1,
    "The unresolved externally accepted write must be visible for manual review")
  const modelBefore = modelCalls

  // Two independent Worker processes race for another ready run; CAS leasing
  // must ensure exactly one new external HTTP write. A later tick completes.
  const secondId = await newRun(connection.item.id, "simultaneous worker race")
  const competed = await Promise.all([spawnOnce(), spawnOnce()])
  assert.equal(acceptedWrites, 2, "Concurrent Workers must not double-post the same step")
  const claimDb = new DatabaseSync(path.join(directory, "data.db"), { readOnly: true })
  try {
    const holder = claimDb.prepare(
      "SELECT owner_instance FROM agent_studio_run_leases WHERE kind='agent' AND run_id=?"
    ).get(secondId)
    assert.match(holder.owner_instance, /^w-[a-f0-9]{24}$/,
      "real background Worker claim must be attributed to a verified instance")
    const reportedHolders = competed.map(out =>
      JSON.parse(out.split("\n").find(line => line.includes('"message":"worker_started"'))).worker)
    assert.ok(reportedHolders.includes(holder.owner_instance.slice(-8)),
      "lease owner must be exactly one of the competing background Worker processes")
  } finally { claimDb.close() }
  for (let i = 0; i < 4; i++) {
    const current = await requireOk("GET", "/api/agent_runs/" + secondId)
    if (current.status === "succeeded" || current.status === "failed") break
    await spawnOnce()
  }
  const concurrent = await requireOk("GET", "/api/agent_runs/" + secondId)
  assert.equal(concurrent.status, "succeeded", JSON.stringify(concurrent))
  assert.equal(acceptedWrites, 2)
  assert.ok(modelCalls > modelBefore)
  const workerInstances = await requireOk("GET", "/api/worker/status")
  assert.ok(workerInstances.instances_recent >= 2,
    "Independent Worker processes must have separate recent heartbeat records")
  assert.ok(workerInstances.instances.filter(row => row.label.startsWith("Worker ")).length >= 2)

  console.log(JSON.stringify({
    status: "PASS", realPocketBaseRestart: true, expiredLeaseTakenOver: true,
    crashedWriteReplayed: false, manualReviewVisible: true,
    workerProcessesCompeting: 2, acceptedWrites,
  }))
} finally {
  try { await stopHeadlessPocketBase(pb?.child, 8000) } catch {}
  await Promise.all([
    new Promise(resolve => writeServer.close(resolve)),
    new Promise(resolve => modelServer.close(resolve)),
  ])
  try { fs.rmSync(directory, { recursive: true, force: true }) } catch {}
}
