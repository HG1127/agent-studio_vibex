import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { spawn } from "node:child_process"

const root = process.cwd()
const secret = "worker-loop-resilience-test-secret-32-characters"
const response = (res, status, value) => {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(value))
}

test("Worker continues healthy Agent runs when schedules/indexing fail, backs off each, and fails closed on auth", {
  timeout: 30000,
}, async t => {
  let mode = "both_down"
  const calls = { schedules: 0, worker: 0, knowledge: 0 }
  const componentReports = []
  const reset = nextMode => {
    componentReports.length = 0
    mode = nextMode
    calls.schedules = calls.worker = calls.knowledge = 0
  }
  const server = createServer(async (req, res) => {
    let payload = ""
    for await (const chunk of req) payload += chunk.toString()
    if (req.url === "/api/internal/schedules/next") {
      calls.schedules++
      if (mode === "fatal_schedule") response(res, 401, { error: "not_authorized" })
      else if (mode === "fatal_knowledge") response(res, 200, { ok: true, due: false })
      else response(res, 500, { error: "temporary_schedule_outage" })
      return
    }
    if (req.url === "/api/internal/worker/step") {
      calls.worker++
      componentReports.push(JSON.parse(payload || "{}").subsystems)
      if (mode === "loop_survives" && calls.worker >= 4) {
        response(res, 401, { error: "worker_revoked" })
      } else {
        response(res, 200, {
          ok: true, stepped: true, idle: false,
          kind: "agent", run_id: "example-test-run", status: "running",
        })
      }
      return
    }
    if (req.url === "/api/internal/knowledge/index-next") {
      calls.knowledge++
      if (mode === "fatal_knowledge") response(res, 401, { error: "not_authorized" })
      else response(res, 500, { error: "temporary_embedding_outage" })
      return
    }
    response(res, 404, { error: "unexpected_endpoint" })
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const address = server.address()
  assert.ok(address && typeof address !== "string")

  async function runWorker(extraArgs = []) {
    const child = spawn(process.execPath, ["worker/run.mjs", ...extraArgs], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_STUDIO_WORKER_URL: "http://127.0.0.1:" + address.port,
        AGENT_STUDIO_WORKER_TOKEN: secret,
        AGENT_STUDIO_WORKER_INTERVAL_MS: "500",
        AGENT_STUDIO_WORKER_REQUEST_TIMEOUT_MS: "5000",
      },
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", chunk => { stdout += chunk.toString() })
    child.stderr.on("data", chunk => { stderr += chunk.toString() })
    const done = new Promise(resolve => {
      child.once("error", error => resolve({ code: -1, error }))
      child.once("close", code => resolve({ code }))
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, 12000)
    try {
      const result = await done
      assert.equal(timedOut, false, "Worker did not finish the bounded test")
      return { ...result, stdout, stderr,
        lines: stdout.split("\n").filter(Boolean).map(line => {
          try { return JSON.parse(line) } catch { return { message: "unparseable" } }
        }),
      }
    } finally {
      clearTimeout(timer)
      if (child.exitCode === null) child.kill()
    }
  }

  // The original serial loop would skip the healthy Worker step as soon as
  // schedules returned 500. Knowledge errors would abort it after a good step.
  reset("both_down")
  const once = await runWorker(["--once"])
  assert.equal(once.code, 0, once.stdout + once.stderr)
  assert.deepEqual(calls, { schedules: 1, worker: 1, knowledge: 1 })
  assert.ok(once.lines.some(line => line.message === "run_advanced"))
  assert.ok(once.lines.some(line => line.message === "schedules_temporarily_unavailable"))
  assert.ok(once.lines.some(line => line.message === "knowledge_temporarily_unavailable"))
  assert.equal(componentReports[0].schedules.state, "retrying")
  assert.equal(componentReports[0].knowledge.state, "unverified")
  assert.ok(!JSON.stringify(componentReports).includes(secret), "worker must not send health secrets")

  // Under a prolonged outage, each optional subsystem should be retried on
  // its own bounded window while the healthy Agent queue keeps advancing.
  // Core 401 ends the loop deterministically without background processes.
  reset("loop_survives")
  const multi = await runWorker()
  assert.equal(multi.code, 1, multi.stdout + multi.stderr)
  assert.equal(calls.worker, 4, "Core Worker must keep accepting fresh work")
  assert.equal(calls.schedules, 1, "Schedule outage must have cooldown")
  assert.equal(calls.knowledge, 1, "Indexing outage must have cooldown")
  assert.equal(multi.lines.filter(line => line.message === "run_advanced").length, 3)
  assert.equal(multi.lines.filter(line => line.message === "step_failed").length, 1)
  assert.ok(componentReports.some(r => r.schedules.state === "retrying" && r.knowledge.state === "retrying"),
    "component degradation must be reported before subsequent Agent advances")

  // Authentication/disable signals remain fatal, never interpreted as a
  // transient outage that would allow unauthorized execution.
  reset("fatal_schedule")
  const authSchedule = await runWorker(["--once"])
  assert.equal(authSchedule.code, 1)
  assert.equal(calls.worker, 0, "A fatal schedule auth error must stop all work")
  assert.equal(calls.knowledge, 0)

  reset("fatal_knowledge")
  const authIndex = await runWorker(["--once"])
  assert.equal(authIndex.code, 1)
  assert.equal(calls.worker, 1)
  assert.ok(authIndex.lines.some(line => line.message === "step_failed"))
})

test("independent liveness heartbeat continues during a blocked Worker tick without claiming lease renewal", {
  timeout: 30000,
}, async t => {
  let activeStep = false
  let ticks = 0
  let heartbeatsDuringStep = 0
  const instanceIds = new Set()
  const server = createServer(async (req, res) => {
    let input = ""
    for await (const chunk of req) input += chunk.toString()
    const body = JSON.parse(input || "{}")
    if (req.url === "/api/internal/schedules/next") {
      response(res, 200, { ok: true, due: false })
    } else if (req.url === "/api/internal/worker/step") {
      ticks++
      assert.match(body.worker_instance || "", /^w-[a-f0-9]{24}$/)
      instanceIds.add(body.worker_instance)
      if (ticks === 1) {
        activeStep = true
        await new Promise(resolve => setTimeout(resolve, 2600))
        activeStep = false
        response(res, 200, { ok: true, stepped: false, idle: true })
      } else {
        response(res, 401, { error: "unauthorized_worker" })
      }
    } else if (req.url === "/api/internal/knowledge/index-next") {
      response(res, 200, { ok: true, idle: true })
    } else if (req.url === "/api/internal/worker/heartbeat") {
      assert.match(body.worker_instance || "", /^w-[a-f0-9]{24}$/)
      instanceIds.add(body.worker_instance)
      if (activeStep) heartbeatsDuringStep++
      response(res, 200, { ok: true })
    } else {
      response(res, 404, { error: "unexpected_endpoint" })
    }
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const child = spawn(process.execPath, ["worker/run.mjs"], {
    cwd: root, windowsHide: true,
    env: {
      ...process.env,
      AGENT_STUDIO_WORKER_URL: "http://127.0.0.1:" + address.port,
      AGENT_STUDIO_WORKER_TOKEN: secret,
      AGENT_STUDIO_WORKER_INTERVAL_MS: "500",
      AGENT_STUDIO_WORKER_HEARTBEAT_INTERVAL_MS: "1000",
      AGENT_STUDIO_WORKER_REQUEST_TIMEOUT_MS: "5000",
    },
  })
  let output = ""
  child.stdout.on("data", chunk => { output += chunk.toString() })
  const result = new Promise(resolve => {
    child.once("error", error => resolve({ code: -1, error }))
    child.once("close", code => resolve({ code }))
  })
  const timeout = setTimeout(() => child.kill(), 12000)
  try {
    const completed = await result
    assert.equal(completed.code, 1, output + String(completed.error || ""))
    assert.equal(ticks, 2)
    assert.ok(heartbeatsDuringStep >= 1,
      "a long in-flight model/tool step should not suppress independent process heartbeats")
    assert.equal(instanceIds.size, 1, "heartbeats must use the same per-process ID as steps")
  } finally {
    clearTimeout(timeout)
    if (child.exitCode === null) child.kill()
  }
})
