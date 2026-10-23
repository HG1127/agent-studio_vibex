import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { createServer } from "node:http"

const root = process.cwd()
const pbBin = process.env.POCKETBASE_BIN || path.join(root, "vibex-local", "bin", "windows", "pocketbase.exe")
if (!fs.existsSync(pbBin)) throw new Error("PocketBase binary not found; set POCKETBASE_BIN")
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-worker-test-"))
const port = Number(process.env.POCKETBASE_WORKER_TEST_PORT || "7138")
const origin = "http://127.0.0.1:" + port
const secret = "smoke-test-worker-secret-32-characters-long"
const env = {
  ...process.env,
  AGENT_STUDIO_BACKGROUND_WORKER: "true",
  AGENT_STUDIO_WORKER_TOKEN: secret,
  AGENT_STUDIO_WORKER_INTERNAL_URL: origin,
  AGENT_STUDIO_WORKER_URL: origin,
  AGENT_STUDIO_ALLOW_ANON: "false",
}
const server = spawnHeadlessPocketBase(pbBin, [
  "serve", "--http=127.0.0.1:" + port,
  "--dir=" + temp,
  "--hooksDir=" + path.join(root, "pocketbase", "pb_hooks"),
], { cwd: path.join(root, "pocketbase"), env, windowsHide: true })
let serverLogs = ""
server.stdout.on("data", b => { serverLogs = (serverLogs + b).slice(-8000) })
server.stderr.on("data", b => { serverLogs = (serverLogs + b).slice(-8000) })
const pause = t => new Promise(r => setTimeout(r, t))
async function req(method, route, body, headers = {}) {
  const response = await fetch(origin + route, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  })
  const data = await response.json()
  return { status: response.status, data }
}
async function once() {
  const child = spawn(process.execPath, ["worker/run.mjs", "--once"], { cwd: root, env, windowsHide: true })
  let out = "", err = ""
  child.stdout.on("data", b => { out += b })
  child.stderr.on("data", b => { err += b })
  const exit = await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    pause(20000).then(() => { child.kill(); return -1 }),
  ])
  assert.equal(exit, 0, "Worker exited " + exit + "\nstdout=" + out + "\nstderr=" + err)
  return out
}
let completed = 0
let fakeProvider = null
try {
  let healthy = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode != null) throw new Error("PocketBase exited")
    try {
      const health = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(500) })
      if (health.ok) { healthy = true; break }
    } catch {}
    await pause(180)
  }
  assert.ok(healthy, "PocketBase failed to become healthy")
  const statusUnauthorized = await req("GET", "/api/worker/status")
  assert.equal(statusUnauthorized.status, 401)
  const initialStatus = await req("GET", "/api/worker/status", undefined, { "X-Rh-User-Id": "worker-test-user" })
  assert.equal(initialStatus.status, 200)
  assert.equal(initialStatus.data.enabled, true)
  assert.equal(initialStatus.data.alive, false)
  const unauthorized = await req("POST", "/api/internal/worker/step", {}, {})
  assert.equal(unauthorized.status, 401, "Unauthenticated worker call was permitted")
  const wrong = await req("POST", "/api/internal/worker/step", {}, { "X-Agent-Studio-Worker-Token": "wrong-key" })
  assert.equal(wrong.status, 401)
  const workerIdentityProbe = await req("POST", "/api/internal/worker/step", {
    worker_instance: "w-" + "a".repeat(24),
  }, { "X-Agent-Studio-Worker-Token": secret })
  assert.equal(workerIdentityProbe.status, 200, JSON.stringify(workerIdentityProbe))


  const graph = {
    nodes: [
      { id: "start", type: "start", data: { title: "开始" }, position: { x: 0, y: 0 } },
      { id: "end", type: "end", data: { title: "结束", output_template: "{{input}}" }, position: { x: 250, y: 0 } },
    ],
    edges: [{ id: "edge", source: "start", target: "end" }],
  }
  const wf = await req("POST", "/api/workflow-studio/create", { name: "Background execution smoke", graph }, { "X-Rh-User-Id": "worker-test-user" })
  assert.equal(wf.status, 200, JSON.stringify(wf))
  const run = await req("POST", "/api/workflow-runs/start", { workflow_id: wf.data.id, instruction: "The worker ran without a browser" }, { "X-Rh-User-Id": "worker-test-user" })
  assert.equal(run.status, 200, JSON.stringify(run))
  const runId = run.data.run_id
  let done
  for (let attempt = 0; attempt < 5; attempt++) {
    await once()
    const detail = await req("GET", "/api/workflow-runs/" + encodeURIComponent(runId) + "/detail", undefined, { "X-Rh-User-Id": "worker-test-user" })
    assert.equal(detail.status, 200)
    done = detail.data.run
    if (["succeeded", "failed", "cancelled"].includes(done.status)) break
  }
  assert.equal(done.status, "succeeded", JSON.stringify(done))
  assert.match(done.result, /without a browser/)
  completed++
  const idle = await req("POST", "/api/internal/worker/step", {}, { "X-Agent-Studio-Worker-Token": secret })
  assert.equal(idle.status, 200)
  assert.equal(idle.data.idle, true)
  // A verified Worker can report bounded subsystem health. Untrusted extra
  // fields (including arbitrary credentials or errors) must never leak into
  // the authenticated employee status response.
  const report = await req("POST", "/api/internal/worker/step", {
    subsystems: {
      schedules: { state: "retrying", failures: 2, retry_at_ms: Date.now() + 9000,
        secret: "PRIVATE-NOT-FOR-UI" },
      knowledge: { state: "healthy", failures: 0, retry_at_ms: 0 },
      metadata: "PRIVATE-NOT-FOR-UI",
    },
  }, { "X-Agent-Studio-Worker-Token": secret })
  assert.equal(report.status, 200)
  const healthDetail = await req("GET", "/api/worker/status", undefined,
    { "X-Rh-User-Id": "worker-test-user" })
  assert.equal(healthDetail.status, 200)
  assert.equal(healthDetail.data.components.schedules.state, "retrying")
  assert.equal(healthDetail.data.components.schedules.failures, 2)
  assert.equal(healthDetail.data.components.knowledge.state, "healthy")
  assert.ok(healthDetail.data.components_observed_at_ms > 0)
  assert.doesNotMatch(JSON.stringify(healthDetail.data), /PRIVATE-NOT-FOR-UI/)
  const malformedBeat = await req("POST", "/api/internal/worker/heartbeat",
    { worker_instance: "not-a-valid-instance", credentials: "PRIVATE-NOT-FOR-UI" },
    { "X-Agent-Studio-Worker-Token": secret })
  assert.equal(malformedBeat.status, 400)
  const unauthorizedBeat = await req("POST", "/api/internal/worker/heartbeat",
    { worker_instance: "w-" + "b".repeat(24) })
  assert.equal(unauthorizedBeat.status, 401)
  const instances = ["w-" + "b".repeat(24), "w-" + "c".repeat(24)]
  for (const instance of instances) {
    const beat = await req("POST", "/api/internal/worker/heartbeat",
      { worker_instance: instance, injected_url: "PRIVATE-NOT-FOR-UI" },
      { "X-Agent-Studio-Worker-Token": secret })
    assert.equal(beat.status, 200, JSON.stringify(beat))
  }
  const multi = await req("GET", "/api/worker/status", undefined,
    { "X-Rh-User-Id": "worker-test-user" })
  assert.equal(multi.status, 200)
  assert.ok(multi.data.instances.length >= 2)
  assert.ok(multi.data.instances_recent >= 2)
  assert.ok(multi.data.instances.some(row => row.label === "Worker " + "b".repeat(8)))
  assert.ok(multi.data.instances.some(row => row.label === "Worker " + "c".repeat(8)))
  assert.doesNotMatch(JSON.stringify(multi.data), /PRIVATE-NOT-FOR-UI/)


  // Agent path: a local deterministic OpenAI-compatible service verifies real BYOK + model-driven completion.
  let modelCalls = 0
  fakeProvider = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request) body += chunk.toString()
    modelCalls++
    const payload = JSON.parse(body || "{}")
    const system = (payload.messages || []).find(item => item.role === "system")?.content || ""
    const content = system.includes("助手执行引擎")
      ? JSON.stringify({ thought: "Task can be completed directly", action: "final", final_answer: "Agent completed independently with no browser polling" })
      : "本次任务由后台执行器完成"
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }))
  })
  const providerPort = Number(process.env.MOCK_MODEL_TEST_PORT || "7139")
  await new Promise(resolve => fakeProvider.listen(providerPort, "127.0.0.1", resolve))
  const userHeaders = { "X-Rh-User-Id": "worker-test-user" }
  const connection = await req("POST", "/api/model-connections", {
    name: "Worker mock provider", provider: "openai",
    base_url: "http://127.0.0.1:" + providerPort + "/v1",
    api_key: "test-only", models: ["mock-model"],
  }, userHeaders)
  assert.equal(connection.status, 200, JSON.stringify(connection))
  const spec = await req("POST", "/api/agent_specs", {
    name: "Background Agent smoke",
    spec: { goal: "Complete a small task", task_scope: "No browsing", deliverables: ["Answer"], tools: [], task_plan: ["Answer"], done_criteria: ["Clear final result"] },
  }, userHeaders)
  assert.equal(spec.status, 200, JSON.stringify(spec))
  const agentRun = await req("POST", "/api/agent-runs/start", {
    spec_id: spec.data.id,
    model: "mock-model", instruction: "Complete the task without a browser",
    config: { max_steps: 4, tools: {}, custom_model: { connection_id: connection.data.item.id, model_id: "mock-model" } },
  }, userHeaders)
  assert.equal(agentRun.status, 200, JSON.stringify(agentRun))
  const paused = await req("POST", "/api/agent-runs/" + agentRun.data.run_id + "/pause", {}, userHeaders)
  assert.equal(paused.status, 200)
  await once() // Paused run is not eligible for background execution.
  const beforeResume = await req("GET", "/api/agent_runs/" + agentRun.data.run_id, undefined, userHeaders)
  assert.equal(beforeResume.data.status, "paused")
  assert.equal(modelCalls, 0)
  const resumed = await req("POST", "/api/agent-runs/" + agentRun.data.run_id + "/resume", {}, userHeaders)
  assert.equal(resumed.status, 200)
  let agentFinished
  for (let n = 0; n < 5; n++) {
    await once()
    const detail = await req("GET", "/api/agent_runs/" + encodeURIComponent(agentRun.data.run_id), undefined, userHeaders)
    assert.equal(detail.status, 200)
    agentFinished = detail.data
    if (["succeeded", "failed"].includes(agentFinished.status)) break
  }
  assert.equal(agentFinished.status, "succeeded", JSON.stringify(agentFinished))
  assert.match(agentFinished.result, /Agent completed independently/)
  assert.ok(modelCalls >= 1, "Worker did not invoke the model")
  completed++
  const cancelledRun = await req("POST", "/api/workflow-runs/start", {
    workflow_id: wf.data.id, instruction: "A cancelled task must never restart",
  }, userHeaders)
  assert.equal(cancelledRun.status, 200)
  const cancelled = await req("POST", "/api/workflow-runs/" + cancelledRun.data.run_id + "/cancel", {}, userHeaders)
  assert.equal(cancelled.status, 200)
  await once()
  const afterCancel = await req("GET", "/api/workflow-runs/" + cancelledRun.data.run_id + "/detail", undefined, userHeaders)
  assert.equal(afterCancel.data.run.status, "cancelled")
  const liveStatus = await req("GET", "/api/worker/status", undefined, userHeaders)
  assert.equal(liveStatus.status, 200)
  assert.equal(liveStatus.data.alive, true)
  assert.ok(liveStatus.data.tick_attempts_total >= 3)
  assert.ok(liveStatus.data.last_step_at)
  console.log(JSON.stringify({ result: "PASS", stepsWithoutBrowser: completed, runId, finalStatus: done.status, idle: true }))
} catch (error) {
  console.error("WORKER_E2E_FAILED", error.stack || error)
  console.error("PB_LOG_TAIL", serverLogs.replace(/\/pbinstall\/[A-Za-z0-9._-]+/g, "/pbinstall/***").slice(-2200))
  process.exitCode = 1
} finally {
  server.kill()
  if (fakeProvider) await new Promise(resolve => fakeProvider.close(resolve))
  await Promise.race([new Promise(resolve => server.once("exit", resolve)), pause(1200)])
  try { fs.rmSync(temp, { recursive: true, force: true }) } catch {}
}
