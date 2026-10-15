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
let succeededCalls = 0, ambiguousCalls = 0, providerReady = false, logs = ""
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const provider = createServer(async (req, res) => {
  for await (const _part of req) { /* drain request to simulate accepted write */ }
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
    schedulerSkipsActiveLeases: true, staleLeaseRecovered: true,
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
