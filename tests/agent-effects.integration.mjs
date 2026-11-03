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
let successfulPosts = 0, successfulResponses = 0, ambiguousPosts = 0, approvalPosts = 0, modelRequests = 0, probePosts = 0
let releaseRead=()=>{}
let readProbePending=true
let slowModelStarted = 0, slowModelResponded = 0, interruptedReads = 0
let logs = ""
const pause = ms => new Promise(r => setTimeout(r, ms))
const sideEffect = createServer(async (req,res) => {
  // Close fixture connections so catalog/probe warm-up cannot trigger a
  // transport-level replay; this test targets the application's lease guard.
  res.setHeader('Connection','close')
  let postedBody='';for await(const chunk of req)postedBody+=chunk.toString()
  if(postedBody.includes('"probe_only":true')){probePosts++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({probe:true}));return}
  if (req.url === "/approved" || req.url === "/approved-changed") {
    approvalPosts++
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ receipt: "approval-test-" + approvalPosts }))
    return
  }
  if (req.url === "/read-disconnect") {
    if(readProbePending){readProbePending=false;res.writeHead(200,{'Content-Type':'application/json'});res.end('{"probe":true}');return}
    interruptedReads++
    // The first network attempt is still in progress while its lease is
    // revoked in the temporary database; retries must be fenced.
    await new Promise(resolve=>{const timer=setTimeout(resolve,10000);releaseRead=()=>{clearTimeout(timer);resolve()}})
    req.socket.destroy()

    return
  }
  if (req.url === "/uncertain") {
    ambiguousPosts++
    req.socket.destroy()
    return
  }
  successfulPosts++
  await pause(900)
  successfulResponses++
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ receipt: "created-" + successfulPosts }))
})
const model = createServer(async (req,res) => {
  if(req.method==="GET" && req.url==="/v1/models"){
    // Synthetic provider probe, not a model answer or business write.
    res.writeHead(200,{"Content-Type":"application/json"})
    res.end(JSON.stringify({data:[{id:"mock-model"}]}))
    return
  }
  let text = ""
  for await (const b of req) text += b.toString()
  modelRequests++
  const payload = JSON.parse(text || "{}")
  const user = (payload.messages || []).filter(x => x.role === "user").map(x => String(x.content || "")).join("\n")
  const isFirst = user.includes("（尚无，这是第一步）")
  // Delay the decision that would call a real POST; cancel/pause must beat
  // the decision and prevent any tool dispatch after the accepted stop.
  if (isFirst && (user.includes("CANCEL_WHILE_MODEL_PENDING") || user.includes("PAUSE_WHILE_MODEL_PENDING"))) {
    slowModelStarted++
    await pause(1000)
    slowModelResponded++
  }
  let reply
  if (isFirst) {
    reply = JSON.stringify({
      thought: "Call the authorized external tool exactly once",
      action: "tool",
      tool: user.includes("APPROVAL_BINDING_CASE") ? "AgentApprovalWrite" :
        (user.includes("LEASE_EXPIRE_DURING_READ") ||
          user.includes("CANCEL_DURING_READ_RETRY") ||
          user.includes("PAUSE_DURING_READ_RETRY")) ? "AgentReadFailure" :
        (user.includes("uncertain") ? "AgentAmbiguousWrite" : "AgentWriteOnce"),
      tool_input: { message: user.includes("LONG_APPROVAL_ARGS") ? "L".repeat(4200) : user.includes("MEDIUM_APPROVAL_ARGS") ? "M".repeat(700) : "once", api_key: "fake-test-secret-never-log" },

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
async function start(tool, instruction, connId, expectedStatus = 200, requireApproval = false, selectedModel = "mock-model") {
  if(typeof expectedStatus === "boolean"){requireApproval=expectedStatus;expectedStatus=200}

  const spec = await api("POST", "/api/agent_specs", {
    name: tool, spec: {
      goal: "Execute the tool once", task_scope: "Authorized POST only",
      tools: [tool], task_plan: ["Call the tool once", "Finish"],
      deliverables: ["Result"], done_criteria: ["Observed result"],
    },
  })
  assert.equal(spec.status, 200)
  const run = await api("POST", "/api/agent-runs/start", {
    spec_id: spec.data.id, instruction, model: selectedModel,
    config: { max_steps: 4, require_approval: requireApproval,
      tools: { [tool]: true }, custom_model: { connection_id: connId, model_id: selectedModel } },

  })
  assert.equal(run.status, expectedStatus, JSON.stringify(run))
  if (expectedStatus !== 200) return run
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
async function addTool(name,url,methodOrVerify="POST") {
  const method=typeof methodOrVerify==="string"?methodOrVerify:"POST",verifyNow=typeof methodOrVerify==="boolean"?methodOrVerify:true

  const r = await api("POST", "/api/tool-connections", {
    name, description: "test side-effect", method, url, headers: [], body_template: "{{input}}",
  })
  assert.equal(r.status, 200, JSON.stringify(r))
  if (verifyNow) {
    // Real consented local PocketBase probe, not a forged database status.
    const check = await api("POST", "/api/tool-connections/test", {
      connection_id: r.data.item.id, input: '{"probe_only":true}', confirm_write: true,
    })
    assert.equal(check.status, 200, JSON.stringify(check))
    assert.equal(check.data.ok, true, JSON.stringify(check))
  }
  return r.data.item.id
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
  // Starting a paid Agent with an unverified model must fail BEFORE
  // creating a Run or attempting any model/tool call.
  const deniedModelStart=await start("NeverCallUnverifiedModel",
    "Must not allocate paid run",connId,409)
  assert.equal(deniedModelStart.data.error,"custom_connection_unverified")
  assert.equal(modelRequests,0)
  const modelProbe=await api("POST","/api/model-connections/test",{
    connection_id:connId,
  })
  assert.equal(modelProbe.status,200,JSON.stringify(modelProbe))
  assert.equal(modelProbe.data.ok,true,"synthetic model must pass the real PocketBase probe")
  const deniedUnknownModel = await start("NeverCallUnlistedModel",
    "Must not allocate an unauthorized model run",connId,409,false,"not-listed-model")
  assert.equal(deniedUnknownModel.data.error,"model_not_permitted")
  assert.equal(modelRequests,0)

  const httpId = await addTool("AgentWriteOnce", "http://127.0.0.1:" + httpPort + "/once", false)
  // The same employee may save a connection without testing it. No model
  // instruction can authorize a POST before the required server-side probe.
  const unverifiedStart = await start("AgentWriteOnce", "call write once", connId, 409)
  assert.equal(unverifiedStart.data.error, "tool_connection_reverification_required")
  assert.equal(successfulPosts, 0, "Untested HTTP connector sent a business POST")
  const checked = await api("POST", "/api/tool-connections/test", {
    connection_id: httpId, input: '{"probe_only":true}', confirm_write: true,
  })
  assert.equal(checked.status, 200, JSON.stringify(checked))
  assert.equal(checked.data.ok, true, JSON.stringify(checked))
  await addTool("AgentAmbiguousWrite", "http://127.0.0.1:" + httpPort + "/uncertain")

  // An approved tool call must not contain arguments hidden from the human.
  // Both runs use local synthetic model/HTTP endpoints; neither sends business data.
  const mediumRun = await start("AgentWriteOnce", "MEDIUM_APPROVAL_ARGS", connId)
  assert.equal((await tick(mediumRun.id)).status, 200)
  const mediumPending = await read(mediumRun.id)
  assert.equal(mediumPending.status, "awaiting_approval")
  assert.equal(mediumPending.checkpoint.pending_approval.args_reviewable, true)
  const mediumDetail = await api("GET", "/api/agent-runs/" + mediumRun.id + "/detail")
  assert.equal(mediumDetail.status, 200)
  const mediumApprovalEvent = mediumDetail.data.events.find(event => event.event_type === "approval_pending")
  assert.equal(mediumApprovalEvent.content.args_complete, true)
  assert.ok(mediumApprovalEvent.content.args_summary.length > 300,
    "Human must see complete arguments beyond the old 300-character prefix")
  assert.equal(JSON.parse(mediumApprovalEvent.content.args_summary).message.length, 700)
  assert.equal((await api("POST", "/api/agent-runs/" + mediumRun.id + "/approve",
    { decision: "reject" })).status, 200)
  const longRun = await start("AgentWriteOnce", "LONG_APPROVAL_ARGS", connId)
  assert.equal((await tick(longRun.id)).status, 200)
  const longPending = await read(longRun.id)
  assert.equal(longPending.status, "awaiting_approval")
  assert.equal(longPending.checkpoint.pending_approval.args_reviewable, false)
  const tooLongApproval = await api("POST", "/api/agent-runs/" + longRun.id + "/approve",
    { decision: "approve", expected_tool: "AgentWriteOnce",
      expected_step_index: longPending.checkpoint.pending_approval.step_index })
  assert.equal(tooLongApproval.status, 409, JSON.stringify(tooLongApproval))
  assert.equal(tooLongApproval.data.error, "approval_args_not_reviewable")
  assert.equal((await read(longRun.id)).status, "awaiting_approval",
    "Rejected consent must roll back the atomic reservation")
  assert.equal(successfulPosts, 0, "Hidden arguments must never cause a business write")
  assert.equal((await api("POST", "/api/agent-runs/" + longRun.id + "/approve",
    { decision: "reject" })).status, 200,
    "User must still be able to reject an unreviewable call")

  // Even with require_approval=false in the API request, non-idempotent HTTP
  // writes require explicit single-call consent, including after a replay.
  const good = await start("AgentWriteOnce", "call write once", connId)
  const firstStep = await tick(good.id)
  assert.equal(firstStep.status, 200, JSON.stringify(firstStep))
  assert.equal((await read(good.id)).status, "awaiting_approval")
  assert.equal(successfulPosts, 0, "An unapproved POST must never be sent")
  const goodApproved = await api("POST","/api/agent-runs/"+good.id+"/approve",
    {decision:"approve"})
  assert.equal(goodApproved.status, 200, JSON.stringify(goodApproved))
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
  assert.equal((await read(good.id)).status,'succeeded',
    'a cached successful result must not request a second approval or repeat a write')
  const reused = await complete(good.id)
  assert.equal(reused.status, "succeeded")
  assert.equal(successfulPosts, 1, "Same Agent step must reuse the successful side effect")
  // A human approval does not create a permanent grant: changing the HTTP
  // request while awaiting approval invalidates its last successful probe.
  const waiting = await start("AgentWriteOnce", "call write once", connId, 200, true)
  await tick(waiting.id)
  assert.equal((await read(waiting.id)).status, "awaiting_approval")
  const approved = await api("POST", "/api/agent-runs/" + waiting.id + "/approve",
    { decision:"approve" })
  assert.equal(approved.status, 200, JSON.stringify(approved))
  const changed = await api("PATCH", "/api/tool-connections/" + httpId,
    { body_template:'{"changed":"{{input}}"}' })
  assert.equal(changed.status, 200, JSON.stringify(changed))
  assert.equal(changed.data.item.status, "untested")
  // Re-probing the edited connection can restore status=ok, but the human
  // approved the OLD URL/method/body/header snapshot. It must not authorize
  // a newly verified yet different HTTP request.
  const reprobe = await api("POST", "/api/tool-connections/test", {
    connection_id: httpId, input: '{"probe_only":true}', confirm_write: true,
  })
  assert.equal(reprobe.status, 200, JSON.stringify(reprobe))
  assert.equal(reprobe.data.ok, true, JSON.stringify(reprobe))
  await tick(waiting.id)
  assert.equal(successfulPosts, 1,
    "A re-tested but CHANGED connection cannot inherit prior human approval")
  const stoppedAfterOldApproval = await read(waiting.id)
  assert.equal(stoppedAfterOldApproval.status, "failed")
  assert.match(stoppedAfterOldApproval.error, /tool_approval_snapshot_stale/)
  assert.equal(probePosts, 3, "All three probe requests must be distinct from business writes")



  // Pausing while an external POST is in flight must not invalidate the
  // worker lease or lose the committed tool result. The request completes
  // once, then the next tick applies the pause before another model/tool call.
  const pauseBaseline = successfulPosts
  const responseBaseline = successfulResponses
  const pauseRun = await start("AgentWriteOnce", "PAUSE_DURING_IN_FLIGHT_WRITE", connId)
  await tick(pauseRun.id)
  assert.equal((await read(pauseRun.id)).status,'awaiting_approval')
  assert.equal((await api('POST','/api/agent-runs/'+pauseRun.id+'/approve',{decision:'approve'})).status,200)
  const inFlightTick = tick(pauseRun.id)
  for (let n = 0; n < 250 && successfulPosts === pauseBaseline; n++) await pause(10)
  assert.equal(successfulPosts, pauseBaseline + 1, "the test must pause after the target POST starts")
  assert.equal(successfulResponses, responseBaseline, "the external POST must still be in flight")
  const pauseResponse = await api("POST", "/api/agent-runs/" + pauseRun.id + "/pause", {})
  assert.equal(pauseResponse.status, 200, JSON.stringify(pauseResponse))
  assert.equal(pauseResponse.data.status, "running", "an in-flight tick must finish before the pause is applied")
  assert.equal(pauseResponse.data.pause_requested, true)
  const completedInFlightTick = await inFlightTick
  assert.equal(completedInFlightTick.status, 200, JSON.stringify(completedInFlightTick))
  const checkpointed = await read(pauseRun.id)
  assert.equal(checkpointed.status, "running")
  assert.equal(checkpointed.checkpoint.pause_requested, true)
  assert.equal(successfulPosts, pauseBaseline + 1)
  const modelRequestsAtPauseBoundary = modelRequests
  const pauseBoundaryTick = await tick(pauseRun.id)
  assert.equal(pauseBoundaryTick.status, 200, JSON.stringify(pauseBoundaryTick))
  assert.equal(modelRequests, modelRequestsAtPauseBoundary, "pause must be applied before another model step starts")
  assert.equal(pauseBoundaryTick.data.status, "paused")
  const pausedRun = await read(pauseRun.id)
  assert.equal(pausedRun.status, "paused")
  assert.equal(pausedRun.checkpoint.pause_requested, false)
  assert.ok(pausedRun.checkpoint.steps.some(step => step.action === "tool" && /created-/.test(step.obs || "")),
    "the completed tool result must be in the saved checkpoint before pause")
  const journal = new DatabaseSync(path.join(dataDir, "data.db"), { readOnly: true })
  try {
    assert.equal(journal.prepare("SELECT status FROM agent_studio_side_effects WHERE kind='agent' AND run_id=?")
      .get(pauseRun.id).status, "succeeded")
  } finally { journal.close() }
  const resumedPauseRun = await api("POST", "/api/agent-runs/" + pauseRun.id + "/resume", {})
  assert.equal(resumedPauseRun.status, 200, JSON.stringify(resumedPauseRun))
  const resumedPauseResult = await complete(pauseRun.id)
  assert.equal(resumedPauseResult.status, "succeeded", JSON.stringify(resumedPauseResult))
  assert.equal(successfulPosts, pauseBaseline + 1, "resume must not replay the already completed external write")
  assert.equal(successfulResponses, responseBaseline + 1)




  // Cancellation during an irreversible POST is cooperative: finish and journal
  // the in-flight action, then mark cancelled before any next model/tool step.
  const cancelBaseline = successfulPosts
  const cancelResponseBaseline = successfulResponses
  const cancelRun = await start("AgentWriteOnce", "CANCEL_DURING_IN_FLIGHT_WRITE", connId)
  await tick(cancelRun.id)
  assert.equal((await read(cancelRun.id)).status,'awaiting_approval')
  assert.equal((await api('POST','/api/agent-runs/'+cancelRun.id+'/approve',{decision:'approve'})).status,200)
  const inFlightCancelTick = tick(cancelRun.id)
  for (let n = 0; n < 250 && successfulPosts === cancelBaseline; n++) await pause(10)
  assert.equal(successfulPosts, cancelBaseline + 1, "the cancellation test must begin after POST dispatch")
  assert.equal(successfulResponses, cancelResponseBaseline, "the external write must still be in flight")
  const cancelResponse = await api("POST", "/api/agent-runs/" + cancelRun.id + "/cancel", {})
  assert.equal(cancelResponse.status, 200, JSON.stringify(cancelResponse))
  assert.equal(cancelResponse.data.status, "running", "in-flight cancellation must not tear down the lease")
  assert.equal(cancelResponse.data.cancel_requested, true)
  const cancelTickResult = await inFlightCancelTick
  assert.equal(cancelTickResult.status, 200, JSON.stringify(cancelTickResult))
  assert.equal(cancelTickResult.data.status, "cancelled", "the current step must stop at its safe boundary")
  const cancelledWrite = await read(cancelRun.id)
  assert.equal(cancelledWrite.status, "cancelled")
  assert.equal(cancelledWrite.checkpoint.cancel_requested, false)
  assert.equal(cancelledWrite.checkpoint.pause_requested, false)
  assert.ok(cancelledWrite.checkpoint.steps.some(step => step.action === "tool" && /created-/.test(step.obs || "")),
    "the current tool result must be saved before cancellation")
  assert.equal(successfulPosts, cancelBaseline + 1)
  assert.equal(successfulResponses, cancelResponseBaseline + 1)
  const modelRequestsAfterCancel = modelRequests
  const noFurtherStep = await tick(cancelRun.id)
  assert.equal(noFurtherStep.status, 200)
  assert.equal(noFurtherStep.data.status, "cancelled")
  assert.equal(modelRequests, modelRequestsAfterCancel, "cancelled runs must not resume or request another model step")

  // Simulate a worker disappearing after the cancel flag was persisted but
  // before it applied the stop. A replacement tick must cancel before any LLM call.
  const recoveryCancel = await start("AgentWriteOnce", "CANCEL_REQUEST_RECOVERY", connId)
  const recoveryDb = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    const row = recoveryDb.prepare("SELECT checkpoint FROM agent_runs WHERE id=?").get(recoveryCancel.id)
    const checkpoint = JSON.parse(row.checkpoint)
    checkpoint.cancel_requested = true
    recoveryDb.prepare("UPDATE agent_runs SET checkpoint=? WHERE id=?")
      .run(JSON.stringify(checkpoint), recoveryCancel.id)
  } finally { recoveryDb.close() }
  const modelRequestsBeforeRecovery = modelRequests
  const recoveredCancelTick = await tick(recoveryCancel.id)
  assert.equal(recoveredCancelTick.status, 200, JSON.stringify(recoveredCancelTick))
  assert.equal(recoveredCancelTick.data.status, "cancelled")
  assert.equal(modelRequests, modelRequestsBeforeRecovery, "recovery must apply cancellation before a new model call")
  const recoveredCancelledRun = await read(recoveryCancel.id)
  assert.equal(recoveredCancelledRun.status, "cancelled")
  assert.equal(recoveredCancelledRun.checkpoint.cancel_requested, false)
  assert.equal(successfulPosts, cancelBaseline + 1, "recovery must not replay the external write")



  // The controller may cancel *while the model is still generating the next
  // tool decision*. The resulting decision must not trigger a new POST.
  const modelStartBaseline = slowModelStarted
  const modelResponseBaseline = slowModelResponded
  const beforeModelStopPosts = successfulPosts
  const cancelledModel = await start("AgentWriteOnce", "CANCEL_WHILE_MODEL_PENDING", connId)
  const modelTick = tick(cancelledModel.id)
  for (let n = 0; n < 250 && slowModelStarted === modelStartBaseline; n++) await pause(10)
  assert.equal(slowModelStarted, modelStartBaseline + 1, "must cancel after the model received its request")
  assert.equal(slowModelResponded, modelResponseBaseline, "the model decision must still be pending")
  const stopDuringModel = await api("POST", "/api/agent-runs/" + cancelledModel.id + "/cancel", {})
  assert.equal(stopDuringModel.status, 200, JSON.stringify(stopDuringModel))
  assert.equal(stopDuringModel.data.status, "running")
  assert.equal(stopDuringModel.data.cancel_requested, true)
  const cancelledModelTick = await modelTick
  assert.equal(cancelledModelTick.status, 200, JSON.stringify(cancelledModelTick))
  assert.equal(cancelledModelTick.data.status, "cancelled")
  assert.equal(slowModelResponded, modelResponseBaseline + 1)
  assert.equal(successfulPosts, beforeModelStopPosts, "a cancelled model decision must never dispatch its tool")
  const cancelledModelRecord = await read(cancelledModel.id)
  assert.equal(cancelledModelRecord.status, "cancelled")
  const cancelledModelEvents = await api("GET", "/api/agent-runs/" + cancelledModel.id + "/detail")
  assert.equal(cancelledModelEvents.status, 200)
  assert.ok(!(cancelledModelEvents.data.events || []).some(e => e.event_type === "tool_call"),
    "cancelled model decision must not produce any tool_call event")

  // Pause during model I/O also stops the pending action before it can send
  // a write. Resuming may legitimately re-plan (bill a new model call).
  const pauseModelStart = slowModelStarted
  const pauseModelResponses = slowModelResponded
  const beforePausedModelPosts = successfulPosts
  const pausedModel = await start("AgentWriteOnce", "PAUSE_WHILE_MODEL_PENDING", connId)
  const pauseModelTick = tick(pausedModel.id)
  for (let n = 0; n < 250 && slowModelStarted === pauseModelStart; n++) await pause(10)
  assert.equal(slowModelStarted, pauseModelStart + 1)
  assert.equal(slowModelResponded, pauseModelResponses)
  const modelPauseRequest = await api("POST", "/api/agent-runs/" + pausedModel.id + "/pause", {})
  assert.equal(modelPauseRequest.status, 200, JSON.stringify(modelPauseRequest))
  assert.equal(modelPauseRequest.data.pause_requested, true)
  const pausedModelTick = await pauseModelTick
  assert.equal(pausedModelTick.status, 200, JSON.stringify(pausedModelTick))
  assert.equal(pausedModelTick.data.status, "running")
  assert.equal(slowModelResponded, pauseModelResponses + 1)
  assert.equal(successfulPosts, beforePausedModelPosts, "paused model decision must not dispatch external writes")
  const modelPauseBoundary = await tick(pausedModel.id)
  assert.equal(modelPauseBoundary.data.status, "paused")
  assert.equal(successfulPosts, beforePausedModelPosts)
  const unknownRun = await start("AgentAmbiguousWrite", "call uncertain write", connId)
  await tick(unknownRun.id)
  assert.equal((await read(unknownRun.id)).status, "awaiting_approval")
  assert.equal(ambiguousPosts, 0, "Approval must precede ambiguous write")
  const unknownApproval = await api("POST","/api/agent-runs/"+unknownRun.id+"/approve",
    {decision:"approve"})
  assert.equal(unknownApproval.status, 200, JSON.stringify(unknownApproval))
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
  assert.equal((await read(unknownRun.id)).status, "awaiting_approval")
  const replayApproval = await api("POST","/api/agent-runs/"+unknownRun.id+"/approve",
    {decision:"approve"})
  assert.equal(replayApproval.status, 200, JSON.stringify(replayApproval))
  await tick(unknownRun.id)
  const uncertainAfter = await read(unknownRun.id)
  assert.equal(uncertainAfter.status, "failed")
  assert.equal(ambiguousPosts, 1, "Unknown outcome must be blocked after a simulated restart")


  // A read-only GET can normally retry a transport error once. If the worker
  // loses its lease while the first GET is in flight, its second attempt must
  // be denied before any additional network request goes out.
  await addTool("AgentReadFailure", "http://127.0.0.1:" + httpPort + "/read-disconnect", "GET")
  const expiredRead = await start("AgentReadFailure", "LEASE_EXPIRE_DURING_READ", connId)
  const readStep = tick(expiredRead.id)
  for (let i = 0; i < 200 && interruptedReads === 0; i++) await pause(10)
  assert.equal(interruptedReads, 1, "first read should reach remote HTTP fixture")
  const dbExpiredRead = new DatabaseSync(path.join(dataDir, "data.db"), { timeout: 5000 })
  try {
    dbExpiredRead.prepare("UPDATE agent_studio_run_leases SET expires_ms=? WHERE kind='agent' AND run_id=?")
      .run(Date.now() - 1, expiredRead.id)
  } finally { dbExpiredRead.close() }
  releaseRead()
  const interruptedTick = await readStep
  assert.equal(interruptedTick.status, 200, JSON.stringify(interruptedTick))
  assert.equal(interruptedReads, 1,
    "stale worker must not issue retry GET after lease expiry between attempts")


  // Cancel/pause accepted while the first read-only GET is still in flight
  // must block its otherwise allowed retry, without marking a valid
  // user-requested stop as a generic failed run.
  const beforeCancelledRead = interruptedReads
  const cancelledRead = await start("AgentReadFailure", "CANCEL_DURING_READ_RETRY", connId)
  const tickCancelledRead = tick(cancelledRead.id)
  for (let i = 0; i < 200 && interruptedReads === beforeCancelledRead; i++) await pause(10)
  assert.equal(interruptedReads, beforeCancelledRead + 1)
  const cancelReadResponse = await api("POST", "/api/agent-runs/" + cancelledRead.id + "/cancel", {})
  assert.equal(cancelReadResponse.status, 200, JSON.stringify(cancelReadResponse))
  assert.equal(cancelReadResponse.data.cancel_requested, true)
  releaseRead()
  const finishedCancelledRead = await tickCancelledRead
  assert.equal(finishedCancelledRead.status, 200, JSON.stringify(finishedCancelledRead))
  assert.equal(finishedCancelledRead.data.status, "cancelled")
  assert.equal(finishedCancelledRead.data.stepped, false)
  assert.equal((await read(cancelledRead.id)).status, "cancelled")
  assert.equal(interruptedReads, beforeCancelledRead + 1,
    "accepted cancellation must suppress a second GET")

  const beforePausedRead = interruptedReads
  const pausedRead = await start("AgentReadFailure", "PAUSE_DURING_READ_RETRY", connId)
  const tickPausedRead = tick(pausedRead.id)
  for (let i = 0; i < 200 && interruptedReads === beforePausedRead; i++) await pause(10)
  assert.equal(interruptedReads, beforePausedRead + 1)
  const pauseReadResponse = await api("POST", "/api/agent-runs/" + pausedRead.id + "/pause", {})
  assert.equal(pauseReadResponse.status, 200, JSON.stringify(pauseReadResponse))
  assert.equal(pauseReadResponse.data.pause_requested, true)
  releaseRead()
  const finishedPausedRead = await tickPausedRead
  assert.equal(finishedPausedRead.status, 200, JSON.stringify(finishedPausedRead))
  assert.equal(finishedPausedRead.data.status, "running")
  assert.equal(finishedPausedRead.data.stepped, false)
  assert.equal((await read(pausedRead.id)).checkpoint.pause_requested, true)
  const appliedPause = await tick(pausedRead.id)
  assert.equal(appliedPause.data.status, "paused")
  assert.equal(interruptedReads, beforePausedRead + 1,
    "accepted pause must suppress a second GET")

  // A human approves a POST; if connection target changes before execution,
  // the next tick must invalidate the old approval and obtain a new one.
  const approvalHttpId=await addTool("AgentApprovalWrite", "http://127.0.0.1:" + httpPort + "/approved")
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
  assert.equal(approvalPending2.status,'failed','a changed target invalidates the approved snapshot and must stop')
  assert.match(approvalPending2.error,/tool_approval_snapshot_stale/)
  assert.equal(approvalPosts,0,'stale approval must never dispatch a write')
  const changedProbe=await api('POST','/api/tool-connections/test',{connection_id:approvalHttpId,input:'{"probe_only":true}',confirm_write:true})
  assert.equal(changedProbe.status,200);assert.equal(changedProbe.data.ok,true)
  const replacement=await start('AgentApprovalWrite','APPROVAL_BINDING_CASE',connId,true)
  await tick(replacement.id)
  const replacementPending=await read(replacement.id)
  assert.equal(replacementPending.status,'awaiting_approval')
  assert.notEqual(replacementPending.checkpoint.pending_approval.approval_digest,firstProof)
  assert.equal((await api('POST','/api/agent-runs/'+replacement.id+'/approve',{decision:'approve'})).status,200)
  const authorizedResult=await complete(replacement.id)
  assert.equal(authorizedResult.status,'succeeded',JSON.stringify(authorizedResult))
  assert.equal(approvalPosts, 1, "Newly authorized changed target only called once")

  // Cancellation from an approval gate is immediate and removes the pending
  // approval so a stale approve action cannot resurrect the run.
  const cancelledApproval = await start("AgentApprovalWrite", "APPROVAL_BINDING_CASE", connId, true)
  await tick(cancelledApproval.id)
  assert.equal((await read(cancelledApproval.id)).status, "awaiting_approval")
  const cancelApprovalResponse = await api("POST", "/api/agent-runs/" + cancelledApproval.id + "/cancel", {})
  assert.equal(cancelApprovalResponse.status, 200, JSON.stringify(cancelApprovalResponse))
  assert.equal(cancelApprovalResponse.data.status, "cancelled")
  const cancelledApprovalRun = await read(cancelledApproval.id)
  assert.equal(cancelledApprovalRun.status, "cancelled")
  assert.equal(cancelledApprovalRun.checkpoint.pending_approval, null)
  const staleApproval = await api("POST", "/api/agent-runs/" + cancelledApproval.id + "/approve", { decision: "approve" })
  assert.equal(staleApproval.status, 409, "cancelled approval must not re-open the run")
  assert.equal(approvalPosts, 1, "cancelling an approval gate must not execute its external POST")

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
