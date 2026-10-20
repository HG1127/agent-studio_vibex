import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"

const root = process.cwd()
const pbBin = process.env.POCKETBASE_BIN || path.join(root, "vibex-local", "bin", "windows", "pocketbase.exe")
assert.ok(fs.existsSync(pbBin), "Provide POCKETBASE_BIN to run the concurrency test")
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-cas-sideeffects-"))
const port = Number(process.env.PB_CONCURRENCY_PORT || 7244)
const providerPort = Number(process.env.PB_SIDE_EFFECT_PORT || 7245)
const base = "http://127.0.0.1:" + port
const toolUrl = "http://127.0.0.1:" + providerPort
const uid = "test-owner"
const userHeaders = { "X-Rh-User-Id": uid }
const env = {
  ...process.env,
  AGENT_STUDIO_BACKGROUND_WORKER: "true",
  AGENT_STUDIO_WORKER_TOKEN: "test-only-worker-secret-must-be-long",
  AGENT_STUDIO_WORKER_INTERNAL_URL: base,
  AGENT_STUDIO_ALLOW_ANON: "false",
}
let succeededCalls = 0, ambiguousCalls = 0, fencedCalls = 0, cancelledCalls = 0, providerReady = false, logs = ""
let signalFencedRequest = null
const fencedRequestReceived = new Promise(resolve => { signalFencedRequest = resolve })
let signalCancelledRequest = null
const cancelledRequestReceived = new Promise(resolve => { signalCancelledRequest = resolve })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const provider = createServer(async (req, res) => {
  for await (const _part of req) { /* drain request to simulate accepted write */ }
  if (req.url === "/cancelled") {
    cancelledCalls++
    if (signalCancelledRequest) signalCancelledRequest()
    await delay(1400)
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ receipt: "accepted-before-cancel" }))
    return
  }
  if (req.url === "/fenced") {
    fencedCalls++
    if (signalFencedRequest) signalFencedRequest()
    // The DB lease is intentionally stolen while the old execution is waiting
    // on this accepted remote write. Completion must not commit stale state.
    await delay(1450)
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ receipt: "fenced-write" }))
    return
  }
  if (req.url === "/uncertain") {
    ambiguousCalls++
    req.socket.destroy() // remote side effect may have happened; acknowledgement is lost
    return
  }
  if (req.url === "/once") {
    succeededCalls++
    await delay(900) // overlap incoming tick calls
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "written", call: succeededCalls }))
    return
  }
  res.writeHead(404).end()
})
const pb = spawnHeadlessPocketBase(pbBin, ["serve", "--http=127.0.0.1:" + port,
  "--dir=" + dataDir, "--hooksDir=" + path.join(root, "pocketbase", "pb_hooks"),
], { cwd: path.join(root, "pocketbase"), env, windowsHide: true })
pb.stdout.on("data", chunk => { logs = (logs + chunk).slice(-12000) })
pb.stderr.on("data", chunk => { logs = (logs + chunk).slice(-12000) })

async function api(method, uri, body, headers = userHeaders) {
  const r = await fetch(base + uri, {
    method, headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(22000),
  })
  const result = await r.json().catch(() => ({}))
  return { status: r.status, result }
}
async function tick(runId) {
  return api("POST", "/api/llm/workflow-engine/" + runId + "/tick", {})
}
async function detail(runId) {
  const r = await api("GET", "/api/workflow-runs/" + runId + "/detail")
  assert.equal(r.status, 200, JSON.stringify(r))
  return r.result.run
}
async function workflowFor(toolName) {
  const graph = {
    nodes: [
      { id: "st", type: "start", data: { title: "开始" }, position: { x: 0, y: 0 } },
      { id: "tl", type: "tool", data: { title: "外部写工具", tool: toolName, params_template: '{"message":"once"}' }, position: { x: 230, y: 0 } },
      { id: "en", type: "end", data: { title: "结束", output_template: "{{外部写工具.output}}" }, position: { x: 460, y: 0 } },
    ],
    edges: [{ id: "e1", source: "st", target: "tl" }, { id: "e2", source: "tl", target: "en" }],
  }
  const wf = await api("POST", "/api/workflow-studio/create", { name: toolName, graph })
  assert.equal(wf.status, 200, JSON.stringify(wf))
  const started = await api("POST", "/api/workflow-runs/start", { workflow_id: wf.result.id, instruction: "write once" })
  assert.equal(started.status, 200, JSON.stringify(started))
  const runId = started.result.run_id
  const first = await tick(runId)
  assert.equal(first.status, 200, JSON.stringify(first))
  const before = await detail(runId)
  assert.equal(before.status, "running")
  return { runId, before: before.checkpoint }
}
async function resumeRaw(runId, checkpoint) {
  // Operator-only corruption/restart simulation, never part of the public product API.
  const db = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    db.prepare("UPDATE workflow_runs SET status = 'running', error = '', result = '', checkpoint = ? WHERE id = ?")
      .run(JSON.stringify(checkpoint), runId)
  } finally { db.close() }
}
async function finishAfterTool(runId) {
  for (let i = 0; i < 4; i++) {
    const state = await detail(runId)
    if (state.status === "succeeded" || state.status === "failed") return state
    await tick(runId)
  }
  return detail(runId)
}
async function addTool(name, suffix) {
  const c = await api("POST", "/api/tool-connections", {
    name, description: "side-effect integration test",
    url: toolUrl + suffix, method: "POST", headers: [], body_template: "{{input}}",
  })
  assert.equal(c.status, 200, JSON.stringify(c))
}
try {
  await new Promise(resolve => provider.listen(providerPort, "127.0.0.1", resolve))
  providerReady = true
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/health", { signal: AbortSignal.timeout(500) })).ok) { ready = true; break } } catch {}
    await delay(150)
  }
  assert.ok(ready, "PocketBase did not start")
  await addTool("WriteOnce", "/once")
  const write = await workflowFor("WriteOnce")
  const statusDuring = await api("GET", "/api/worker/status")
  assert.equal(statusDuring.status, 200)
  assert.ok(statusDuring.result.queue.workflow_running >= 1)
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => tick(write.runId)))
  assert.ok(concurrent.every(r => r.status === 200), JSON.stringify(concurrent))
  assert.equal(succeededCalls, 1, "Concurrent HTTP ticks must not send the same POST more than once")
  const terminal = await finishAfterTool(write.runId)
  assert.equal(terminal.status, "succeeded", JSON.stringify(terminal))
  let db = new DatabaseSync(path.join(dataDir, "data.db"), { readOnly: true })
  let persisted
  try {
    persisted = db.prepare("SELECT status, tool_name, result_text FROM agent_studio_side_effects WHERE kind = 'workflow' AND run_id = ?").all(write.runId)
    assert.equal(persisted.length, 1)
    assert.equal(persisted[0].status, "succeeded")
    assert.match(persisted[0].result_text, /written/)
  } finally { db.close() }

  await resumeRaw(write.runId, write.before)
  const replay = await tick(write.runId)
  assert.equal(replay.status, 200)
  const reused = await finishAfterTool(write.runId)
  assert.equal(reused.status, "succeeded")
  assert.equal(succeededCalls, 1, "Persisted successful write must use cached result without another POST")

  await addTool("AmbiguousWrite", "/uncertain")
  const uncertain = await workflowFor("AmbiguousWrite")
  const uncertainTick = await tick(uncertain.runId)
  assert.equal(uncertainTick.status, 200, JSON.stringify(uncertainTick))
  const unknown = await detail(uncertain.runId)
  assert.equal(unknown.status, "failed")
  assert.match(unknown.error, /write_outcome_unknown/)
  assert.equal(ambiguousCalls, 1, "Non-idempotent POST must not be auto-retried after network failure")

  await resumeRaw(uncertain.runId, uncertain.before)
  await tick(uncertain.runId)
  const unknownReplay = await detail(uncertain.runId)
  assert.equal(unknownReplay.status, "failed")
  assert.equal(ambiguousCalls, 1, "Ambiguous side effect must never be replayed after restart")
  db = new DatabaseSync(path.join(dataDir, "data.db"), { readOnly: true })
  try {
    const effect = db.prepare("SELECT status FROM agent_studio_side_effects WHERE kind = 'workflow' AND run_id = ?").get(uncertain.runId)
    assert.equal(effect.status, "unknown")
    const active = db.prepare("SELECT COUNT(*) AS n FROM agent_studio_run_leases WHERE expires_ms > ?").get(Date.now())
    assert.equal(active.n, 0, "All completed ticks must release their CAS leases")
  } finally { db.close() }
  const queue = await api("GET", "/api/worker/status")
  assert.equal(queue.status, 200)
  assert.ok(queue.result.queue.failed_recent >= 1)
  // Simulate an in-flight tool call from a stale worker. Its remote write
  // completes, but it must not overwrite a newer lease owner's checkpoint.
  await addTool("FencedWrite", "/fenced")
  const fenceRun = await workflowFor("FencedWrite")
  const oldTick = tick(fenceRun.runId)
  await Promise.race([
    fencedRequestReceived,
    delay(8000).then(() => { throw new Error("test_fenced_tool_never_started") }),
  ])
  db = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    const updated = db.prepare(
      "UPDATE agent_studio_run_leases SET lease_token=?,expires_ms=? " +
      "WHERE kind='workflow' AND run_id=? AND expires_ms>?"
    ).run("B".repeat(40), Date.now() + 60000, fenceRun.runId, Date.now())
    assert.equal(updated.changes, 1, "The original worker must have held the lease")
  } finally { db.close() }
  const staleCompletion = await oldTick
  assert.equal(staleCompletion.status, 200, JSON.stringify(staleCompletion))
  assert.equal(staleCompletion.result.stepped, false,
    "Old worker must not report a successful tick after losing execution ownership")
  assert.equal(staleCompletion.result.busy, true)
  const staleRun = await detail(fenceRun.runId)
  assert.equal(staleRun.status, "running",
    "A stale worker must never record a completed or failed run over the new owner")
  assert.notEqual((staleRun.checkpoint.statuses || {}).tl, "done",
    "Stale executor must not persist a completed tool checkpoint")
  assert.equal(fencedCalls, 1)
  db = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    const savedEffect = db.prepare(
      "SELECT status FROM agent_studio_side_effects WHERE kind='workflow' AND run_id=?"
    ).get(fenceRun.runId)
    assert.equal(savedEffect.status, "succeeded",
      "Remote write audit survives a stale worker and is available for replay")
    db.prepare(
      "UPDATE agent_studio_run_leases SET expires_ms=? WHERE kind='workflow' AND run_id=?"
    ).run(Date.now() - 5, fenceRun.runId)
  } finally { db.close() }
  const resumedTick = await tick(fenceRun.runId)
  assert.equal(resumedTick.status, 200, JSON.stringify(resumedTick))
  const eventuallyFinished = await finishAfterTool(fenceRun.runId)
  assert.equal(eventuallyFinished.status, "succeeded", JSON.stringify(eventuallyFinished))
  assert.equal(fencedCalls, 1,
    "Taking over the lease must reuse the prior successful write, never issue a second POST")

  // Cancelling a task while the remote service is still responding must be
  // terminal: neither a successful remote response nor the fallback handler
  // can mark the same Workflow as succeeded/failed after cancellation.
  await addTool("CancelledWrite", "/cancelled")
  const cancelledRun = await workflowFor("CancelledWrite")
  const tickBeforeCancel = tick(cancelledRun.runId)
  await Promise.race([
    cancelledRequestReceived,
    delay(8000).then(() => { throw new Error("cancelled_tool_never_started") }),
  ])
  const manualCancel = await api("POST", "/api/workflow-runs/" + cancelledRun.runId + "/cancel", {})
  assert.equal(manualCancel.status, 200, JSON.stringify(manualCancel))
  assert.equal(manualCancel.result.status, "cancelled")
  const cancelledTick = await tickBeforeCancel
  assert.equal(cancelledTick.status, 200)
  const finalCancelled = await detail(cancelledRun.runId)
  assert.equal(finalCancelled.status, "cancelled",
    "Explicit cancellation must win against a delayed HTTP write result")
  assert.equal(cancelledTick.result.stepped, false,
    "A cancelled in-flight Tick cannot report a durable completed step")
  await tick(cancelledRun.runId)
  assert.equal((await detail(cancelledRun.runId)).status, "cancelled")
  assert.equal(cancelledCalls, 1, "Cancelled writes must never auto-replay")

  // Scheduler fairness: another worker already holds a live lease on the older run.
  // This replica must skip it and advance the second run rather than spin on busy.
  const basicGraph = {
    nodes: [
      { id: "s", type: "start", data: { title: "开始" }, position: { x: 0, y: 0 } },
      { id: "e", type: "end", data: { title: "结束", output_template: "{{input}}" }, position: { x: 200, y: 0 } },
    ],
    edges: [{ id: "s-e", source: "s", target: "e" }],
  }
  const minimalWf = await api("POST", "/api/workflow-studio/create", { name: "Lease scheduling check", graph: basicGraph })
  assert.equal(minimalWf.status, 200)
  // Workflow and Agent share one runtime admission deadline contract. An
  // overdue workflow must fail BEFORE executing the first graph node.
  const expiringWf = await api("POST","/api/workflow-runs/start",{
    workflow_id:minimalWf.result.id,instruction:"expired",max_runtime_minutes:1,
  })
  assert.equal(expiringWf.status,200)
  db = new DatabaseSync(path.join(dataDir,"data.db"),{timeout:5000})
  try {
    const original = JSON.parse(db.prepare("SELECT checkpoint FROM workflow_runs WHERE id=?")
      .get(expiringWf.result.run_id).checkpoint)
    assert.ok(original.execution_deadline_ms>Date.now())
    original.execution_deadline_ms=Date.now()-1500
    original.outputs={previous:"retained"}
    db.prepare("UPDATE workflow_runs SET checkpoint=? WHERE id=?")
      .run(JSON.stringify(original),expiringWf.result.run_id)
  } finally {db.close()}
  const expiredTick=await tick(expiringWf.result.run_id)
  assert.equal(expiredTick.status,200)
  assert.equal(expiredTick.result.deadline_exceeded,true)
  const expiredRow=await detail(expiringWf.result.run_id)
  assert.equal(expiredRow.status,"failed")
  assert.equal(expiredRow.error,"run_runtime_deadline_exceeded")
  assert.equal(expiredRow.checkpoint.outputs.previous,"retained")
  assert.equal(expiredRow.done_nodes,0)


  const busyRun = await api("POST", "/api/workflow-runs/start", { workflow_id: minimalWf.result.id, instruction: "occupied" })
  const readyRun = await api("POST", "/api/workflow-runs/start", { workflow_id: minimalWf.result.id, instruction: "ready" })
  assert.equal(busyRun.status, 200)
  assert.equal(readyRun.status, 200)
  db = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    db.prepare(
      "INSERT INTO agent_studio_run_leases(kind,run_id,lease_token,acquired_ms,expires_ms,attempts) VALUES ('workflow',?,?,?,?,1)"
    ).run(busyRun.result.run_id, "other-worker", Date.now(), Date.now() + 120000)
  } finally { db.close() }
  const dispatched = await api("POST", "/api/internal/worker/step", {}, {
    "X-Agent-Studio-Worker-Token": "test-only-worker-secret-must-be-long",
  })
  assert.equal(dispatched.status, 200, JSON.stringify(dispatched))
  assert.equal(dispatched.result.stepped, true, "Bridge must report actual tick stepping")
  assert.equal(dispatched.result.run_id, readyRun.result.run_id, "Worker should skip active leases")
  assert.equal((await detail(busyRun.result.run_id)).status, "running")
  db = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    db.prepare("UPDATE agent_studio_run_leases SET expires_ms=?,lease_token='crashed-worker' WHERE kind='workflow' AND run_id=?")
      .run(Date.now() - 1000, busyRun.result.run_id)
    // Simulate the stale checkpoint timer left behind by a process crash.
    // The worker must trust the expired DB lease instead of blocking for an hour.
    const lastCheckpoint = JSON.parse(db.prepare(
      "SELECT checkpoint FROM workflow_runs WHERE id=?"
    ).get(busyRun.result.run_id).checkpoint)
    lastCheckpoint.claim_until = Date.now() + 3600_000
    db.prepare("UPDATE workflow_runs SET checkpoint=? WHERE id=?")
      .run(JSON.stringify(lastCheckpoint), busyRun.result.run_id)
  } finally { db.close() }
  const afterRelease = await api("POST", "/api/internal/worker/step", {}, {
    "X-Agent-Studio-Worker-Token": "test-only-worker-secret-must-be-long",
  })
  assert.equal(afterRelease.status, 200)
  assert.equal(afterRelease.result.run_id, busyRun.result.run_id)
  db = new DatabaseSync(path.join(dataDir, "data.db"), { readOnly: true })
  try {
    const lease = db.prepare("SELECT attempts FROM agent_studio_run_leases WHERE kind='workflow' AND run_id=?").get(busyRun.result.run_id)
    assert.equal(lease.attempts, 2, "Expired lease should be atomically reclaimed with increased attempts")
  } finally { db.close() }
  const safeQueue = await api("GET", "/api/worker/status")
  assert.equal(safeQueue.status, 200)
  assert.ok(safeQueue.result.queue.workflow_running >= 1)
  console.log(JSON.stringify({
    status: "PASS", concurrency: 6, postWriteCount: succeededCalls,
    successfulReplayUsesCache: true, ambiguousPostCount: ambiguousCalls,
    ambiguousReplayBlocked: true, activeLeases: 0, queueVisible: true,
    schedulerSkipsActiveLeases: true, staleLeaseRecovered: true, staleCheckpointHintIgnored: true,
    inFlightStaleWriteFenced: true, postWriteReplayedFromJournal: true,
    cancellationWinsOverInFlightWrite: true,
  }))
} catch (err) {
  console.error("CONCURRENCY_E2E_FAILED", err.stack || String(err))
  console.error("PB_LOG_TAIL", logs.replace(/\/pbinstall\/[A-Za-z0-9._-]+/g, "/pbinstall/***").slice(-2000))
  process.exitCode = 1
} finally {
  pb.kill()
  if (providerReady) await new Promise(resolve => provider.close(resolve))
  await Promise.race([new Promise(resolve => pb.once("exit", resolve)), delay(1400)])
  try { fs.rmSync(dataDir, { recursive: true, force: true }) } catch {}
}
