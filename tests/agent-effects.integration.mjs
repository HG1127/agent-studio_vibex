import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"

const root = process.cwd()
const pbBin = process.env.POCKETBASE_BIN || path.join(root, "vibex-local", "bin", "windows", "pocketbase.exe")
assert.ok(fs.existsSync(pbBin), "Set POCKETBASE_BIN to a PocketBase executable")
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-agent-write-test-"))
const port = Number(process.env.PB_AGENT_EFFECT_PORT || 7246)
const httpPort = Number(process.env.PB_AGENT_WRITE_PORT || 7247)
const modelPort = Number(process.env.PB_AGENT_MODEL_PORT || 7248)
const origin = "http://127.0.0.1:" + port
const authHeaders = { "X-Rh-User-Id": "agent-write-user" }
const env = { ...process.env, AGENT_STUDIO_ALLOW_ANON: "false" }
let successfulPosts = 0, ambiguousPosts = 0, approvalPosts = 0, modelRequests = 0
let logs = ""
const pause = ms => new Promise(r => setTimeout(r, ms))
const sideEffect = createServer(async (req,res) => {
  for await (const _chunk of req) { /* drain */ }
  if (req.url === "/approved" || req.url === "/approved-changed") {
    approvalPosts++
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ receipt: "approval-test-" + approvalPosts }))
    return
  }
  if (req.url === "/uncertain") {
    ambiguousPosts++
    req.socket.destroy()
    return
  }
  successfulPosts++
  await pause(650)
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ receipt: "created-" + successfulPosts }))
})
const model = createServer(async (req,res) => {
  let text = ""
  for await (const b of req) text += b.toString()
  modelRequests++
  const payload = JSON.parse(text || "{}")
  const user = (payload.messages || []).filter(x => x.role === "user").map(x => String(x.content || "")).join("\n")
  const isFirst = user.includes("（尚无，这是第一步）")
  let reply
  if (isFirst) {
    reply = JSON.stringify({
      thought: "Call the authorized external tool exactly once",
      action: "tool",
      tool: user.includes("APPROVAL_BINDING_CASE") ? "AgentApprovalWrite" :
        (user.includes("uncertain") ? "AgentAmbiguousWrite" : "AgentWriteOnce"),
      tool_input: { message: "once", api_key: "fake-test-secret-never-log" },
    })
  } else {
    reply = JSON.stringify({
      thought: "A finished tool call may be summarized",
      action: "final",
      final_answer: "The Agent completed its work",
    })
  }
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: reply } }] }))
})
const server = spawnHeadlessPocketBase(pbBin, [
  "serve", "--http=127.0.0.1:" + port,
  "--dir=" + dataDir, "--hooksDir=" + path.join(root, "pocketbase", "pb_hooks"),
], { cwd: path.join(root, "pocketbase"), env, windowsHide: true })
server.stdout.on("data", chunk => { logs = (logs + chunk).slice(-9000) })
server.stderr.on("data", chunk => { logs = (logs + chunk).slice(-9000) })
async function api(method, uri, body) {
  const res = await fetch(origin + uri, {
    method, headers: { "Content-Type": "application/json", ...authHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(22000),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
async function tick(id) { return api("POST", "/api/llm/agent-engine/" + id + "/tick", {}) }
async function read(id) {
  const r = await api("GET", "/api/agent_runs/" + id)
  assert.equal(r.status, 200, JSON.stringify(r))
  return r.data
}
async function start(tool, instruction, connId, requireApproval = false) {
  const spec = await api("POST", "/api/agent_specs", {
    name: tool, spec: {
      goal: "Execute the tool once", task_scope: "Authorized POST only",
      tools: [tool], task_plan: ["Call the tool once", "Finish"],
      deliverables: ["Result"], done_criteria: ["Observed result"],
    },
  })
  assert.equal(spec.status, 200)
  const run = await api("POST", "/api/agent-runs/start", {
    spec_id: spec.data.id, instruction, model: "mock-model",
    config: { max_steps: 4, tools: { [tool]: true }, require_approval: requireApproval,
      custom_model: { connection_id: connId, model_id: "mock-model" } },
  })
  assert.equal(run.status, 200, JSON.stringify(run))
  return { id: run.data.run_id, before: (await read(run.data.run_id)).checkpoint }
}
async function restart(id, checkpoint) {
  const db = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    db.prepare("UPDATE agent_runs SET status='running',current_step=0,error='',result='',checkpoint=? WHERE id=?")
      .run(JSON.stringify(checkpoint), id)
  } finally { db.close() }
}
async function complete(id) {
  for (let n = 0; n < 5; n++) {
    const current = await read(id)
    if (current.status === "succeeded" || current.status === "failed") return current
    await tick(id)
  }
  return read(id)
}
async function addTool(name, url) {
  const r = await api("POST", "/api/tool-connections", {
    name, description: "test side-effect", method: "POST", url, headers: [], body_template: "{{input}}",
  })
  assert.equal(r.status, 200, JSON.stringify(r))
}
try {
  await Promise.all([
    new Promise(r => sideEffect.listen(httpPort, "127.0.0.1", r)),
    new Promise(r => model.listen(modelPort, "127.0.0.1", r)),
  ])
  let ready = false
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(origin + "/api/health", { signal: AbortSignal.timeout(400) })).ok) { ready = true; break } } catch {}
    await pause(150)
  }
  assert.ok(ready)
  const conn = await api("POST", "/api/model-connections", {
    name: "Mock Agent Model", provider: "openai", api_key: "test-only",
    base_url: "http://127.0.0.1:" + modelPort + "/v1", models: ["mock-model"],
  })
  assert.equal(conn.status, 200, JSON.stringify(conn))
  const connId = conn.data.item.id
  await addTool("AgentWriteOnce", "http://127.0.0.1:" + httpPort + "/once")
  await addTool("AgentAmbiguousWrite", "http://127.0.0.1:" + httpPort + "/uncertain")

  const good = await start("AgentWriteOnce", "call write once", connId)
  const firstStep = await tick(good.id)
  assert.equal(firstStep.status, 200, JSON.stringify(firstStep))
  const finished = await complete(good.id)
  assert.equal(finished.status, "succeeded", JSON.stringify(finished))
  assert.equal(successfulPosts, 1)
  const safeEvents = await api("GET", "/api/agent-runs/" + good.id + "/detail")
  assert.equal(safeEvents.status, 200)
  assert.doesNotMatch(JSON.stringify(safeEvents.data.events || []), /fake-test-secret-never-log/,
    "Tool credentials in model-generated parameters must not be stored in run events")
  await restart(good.id, good.before)
  const replay = await tick(good.id)
  assert.equal(replay.status, 200)
  const reused = await complete(good.id)
  assert.equal(reused.status, "succeeded")
  assert.equal(successfulPosts, 1, "Same Agent step must reuse the successful side effect")

  const unknownRun = await start("AgentAmbiguousWrite", "call uncertain write", connId)
  await tick(unknownRun.id)
  const uncertain = await read(unknownRun.id)
  assert.equal(uncertain.status, "failed")
  assert.match(uncertain.error, /write_outcome_unknown/)
  assert.equal(uncertain.checkpoint.failure_diagnostic?.category, "external_write")
  assert.equal(uncertain.checkpoint.failure_diagnostic?.requires_external_reconciliation, true)
  assert.equal(uncertain.checkpoint.failure_diagnostic?.auto_retry_allowed, false)
  assert.doesNotMatch(JSON.stringify(uncertain.checkpoint.failure_diagnostic), /fake-test-secret-never-log/)
  assert.equal(ambiguousPosts, 1)
  await restart(unknownRun.id, unknownRun.before)
  await tick(unknownRun.id)
  const uncertainAfter = await read(unknownRun.id)
  assert.equal(uncertainAfter.status, "failed")
  assert.equal(ambiguousPosts, 1, "Unknown outcome must be blocked after a simulated restart")

  // A human approves a POST; if connection target changes before execution,
  // the next tick must invalidate the old approval and obtain a new one.
  await addTool("AgentApprovalWrite", "http://127.0.0.1:" + httpPort + "/approved")
  const approvalRun = await start("AgentApprovalWrite", "APPROVAL_BINDING_CASE", connId, true)
  await tick(approvalRun.id)
  const approvalPending1 = await read(approvalRun.id)
  assert.equal(approvalPending1.status, "awaiting_approval")
  const firstProof = approvalPending1.checkpoint.pending_approval.approval_digest
  assert.match(firstProof, /^[0-9a-f]{64}$/)
  const firstApproval = await api("POST", "/api/agent-runs/" + approvalRun.id + "/approve",
    { decision: "approve" })
  assert.equal(firstApproval.status, 200)
  const mutationDb = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    const result = mutationDb.prepare("UPDATE tool_connections SET url=? WHERE name=?")
      .run("http://127.0.0.1:" + httpPort + "/approved-changed", "AgentApprovalWrite")
    assert.equal(result.changes, 1)
  } finally { mutationDb.close() }
  await tick(approvalRun.id)
  const approvalPending2 = await read(approvalRun.id)
  assert.equal(approvalPending2.status, "awaiting_approval",
    "Changed connection target must invalidate original approval")
  assert.equal(approvalPosts, 0, "No external write before new approval")
  assert.notEqual(approvalPending2.checkpoint.pending_approval.approval_digest, firstProof)
  const secondApproval = await api("POST", "/api/agent-runs/" + approvalRun.id + "/approve",
    { decision: "approve" })
  assert.equal(secondApproval.status, 200)
  const authorizedResult = await complete(approvalRun.id)
  assert.equal(authorizedResult.status, "succeeded", JSON.stringify(authorizedResult))
  assert.equal(approvalPosts, 1, "Newly authorized changed target only called once")

  const db = new DatabaseSync(path.join(dataDir, "data.db"), { readOnly: true })
  try {
    assert.equal(db.prepare("SELECT status FROM agent_studio_side_effects WHERE kind='agent' AND run_id=?").get(good.id).status, "succeeded")
    assert.equal(db.prepare("SELECT status FROM agent_studio_side_effects WHERE kind='agent' AND run_id=?").get(unknownRun.id).status, "unknown")
  } finally { db.close() }
  assert.ok(modelRequests >= 4)
  console.log(JSON.stringify({
    status: "PASS", agentSuccessfulPost: successfulPosts, agentAmbiguousPost: ambiguousPosts,
    journalCached: true, journalBlocksUnknown: true, approvalHashRejectsChangedTarget: true,
    modelRequests,
  }))
} catch (err) {
  console.error("AGENT_EFFECTS_FAILED", err.stack || String(err))
  console.error("POCKETBASE_LOGS", logs.replace(/\/pbinstall\/[A-Za-z0-9._-]+/g, "/pbinstall/***").slice(-1500))
  process.exitCode = 1
} finally {
  server.kill()
  await Promise.all([
    new Promise(resolve => sideEffect.close(resolve)),
    new Promise(resolve => model.close(resolve)),
  ])
  await Promise.race([new Promise(resolve => server.once("exit", resolve)), pause(1500)])
  try { fs.rmSync(dataDir, { recursive: true, force: true }) } catch {}
}
