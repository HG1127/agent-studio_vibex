// Real isolated PocketBase, temporary SQLite, and a deterministic local model.
// This validates stage orchestration/persistence/authorization, not LLM quality.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createServer } from "node:http"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root = process.cwd()
const binary = process.env.POCKETBASE_BIN || path.join(root, "vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(binary), "Set POCKETBASE_BIN to an installed PocketBase executable")
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-role-stages-"))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const ownerHeaders = { "X-Rh-User-Id": "role-stage-owner" }
const counts = { researcher: 0, executor: 0, reviewer: 0 }
const complexCounts = { dd_researcher: 0, dd_documenter: 0, dd_analyst: 0, dd_reviewer: 0, dd_sender: 0 }
const complexToolCalls = { browser_read: 0, pdf_read: 0, sheet_analyze: 0 }
let writes = 0, modelCalls = 0, logs = "", pb = null
let handoffWasReceived = false, complexHandoff = false
const local = createServer(async (request, response) => {
  let raw = ""
  for await (const chunk of request) raw += chunk.toString()
  response.setHeader("Content-Type", "application/json")
  if (request.url === "/write") {
    writes++
    response.end(JSON.stringify({ saved: true, count: writes, fixture_only: true }))
    return
  }
  if (["/read", "/pdf", "/sheet"].includes(request.url)) {
    const key = request.url === "/read" ? "browser_read" : request.url === "/pdf" ? "pdf_read" : "sheet_analyze"
    complexToolCalls[key]++
    const evidence = key === "browser_read" ? { source_url: "https://fixture.invalid/issuer", revenue: 120, risk: "R1" } :
      key === "pdf_read" ? { document: "fixture.pdf", page: 4, liabilities: 30, note: 7 } :
      { workbook: "fixture.xlsx", rows: [2, 4], revenue: 120, liabilities: 30, metric: 90 }
    response.end(JSON.stringify(evidence))
    return
  }
  modelCalls++
  const payload = JSON.parse(raw || "{}")
  const system = (payload.messages || []).find(message => message.role === "system")?.content || ""
  let content = "Test only: stage orchestration was executed."
  if (system.includes("助手执行引擎")) {
    if (system.includes("当前角色：资料研究（researcher）")) {
      const n = ++counts.researcher
      if (n === 1) content = JSON.stringify({ action: "final", final_answer: "MUST_NOT_SKIP_LATER_ROLES" })
      else if (n === 2) content = JSON.stringify({ action: "tool", tool: "calculate", tool_input: { expression: "7*6" } })
      else content = JSON.stringify({ action: "role_complete", role_id: "researcher", role_output: "PERSISTED_RESEARCH_EVIDENCE: 7*6 = 42" })
    } else if (system.includes("当前角色：方案执行（executor）")) {
      handoffWasReceived ||= system.includes("PERSISTED_RESEARCH_EVIDENCE")
      const n = ++counts.executor
      content = JSON.stringify(n === 1 ? { action: "tool", tool: "role_write", tool_input: { result: "42" } } :
        { action: "role_complete", role_id: "executor", role_output: "WRITE_CONFIRMED_ONCE: local test endpoint saved 42" })
    } else if (system.includes("当前角色：审核交付（reviewer）")) {
      assert.match(system, /WRITE_CONFIRMED_ONCE/)
      const n = ++counts.reviewer
      content = JSON.stringify(n === 1 ? { action: "tool", tool: "role_write", tool_input: { result: "FORBIDDEN_REVIEW_WRITE" } } :
        { action: "final", final_answer: "FINAL_REVIEWED_DELIVERY: Research computed 42; execution saved it once; reviewer has no write tools." })
    } else if (system.includes("当前角色：网页研究（dd_researcher）")) {
      const n = ++complexCounts.dd_researcher
      content = JSON.stringify(n === 1 ? { action: "tool", tool: "browser_read", tool_input: {} } : { action: "role_complete", role_id: "dd_researcher", role_output: "SOURCE_EVIDENCE: https://fixture.invalid/issuer; revenue 120; risk R1" })
    } else if (system.includes("当前角色：文档分析（dd_documenter）")) {
      const n = ++complexCounts.dd_documenter
      complexHandoff ||= system.includes("SOURCE_EVIDENCE")
      content = JSON.stringify(n === 1 ? { action: "tool", tool: "pdf_read", tool_input: {} } : { action: "role_complete", role_id: "dd_documenter", role_output: "PDF_EVIDENCE: fixture.pdf page 4; liabilities 30; note 7" })
    } else if (system.includes("当前角色：财务分析（dd_analyst）")) {
      const n = ++complexCounts.dd_analyst
      complexHandoff ||= system.includes("PDF_EVIDENCE")
      content = JSON.stringify(n === 1 ? { action: "tool", tool: "sheet_analyze", tool_input: {} } : { action: "role_complete", role_id: "dd_analyst", role_output: "SHEET_EVIDENCE: rows 2,4; revenue 120 - liabilities 30 = metric 90" })
    } else if (system.includes("当前角色：交叉审核（dd_reviewer）")) {
      complexCounts.dd_reviewer++
      assert.match(system, /SOURCE_EVIDENCE/)
      assert.match(system, /PDF_EVIDENCE/)
      assert.match(system, /SHEET_EVIDENCE/)
      content = JSON.stringify({ action: "role_complete", role_id: "dd_reviewer", role_output: "REVIEW_PASS: sources agree; revenue 120; PDF p.4; metric 90; no UNVERIFIED_CLAIM" })
    } else if (system.includes("当前角色：邮件交付（dd_sender）")) {
      const n = ++complexCounts.dd_sender
      assert.match(system, /REVIEW_PASS/)
      content = JSON.stringify(n === 1 ? { action: "tool", tool: "role_write", tool_input: { result: "FINAL_DUE_DILIGENCE_REPORT revenue 120; PDF p.4; metric 90" } } : { action: "final", final_answer: "FINAL_DUE_DILIGENCE_REPORT: revenue 120; PDF p.4; metric 90; source https://fixture.invalid/issuer; rows 2,4; local email fixture accepted; no real email sent." })
    } else content = JSON.stringify({ action: "final", final_answer: "single assistant result" })
  }
  response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }))
})

const portReservation = createServer()
await new Promise(resolve => portReservation.listen(0, "127.0.0.1", resolve))
const port = portReservation.address().port
await new Promise(resolve => portReservation.close(resolve))
const origin = "http://127.0.0.1:" + port
async function startPocketBase() {
  pb = spawnHeadlessPocketBase(binary, ["serve", "--http=127.0.0.1:" + port,
    "--dir=" + dataDir, "--hooksDir=" + path.join(root, "pocketbase/pb_hooks")], {
    cwd: path.join(root, "pocketbase"), env: { ...process.env, AGENT_STUDIO_ALLOW_ANON: "false" },
  })
  pb.stdout.on("data", chunk => { logs = (logs + chunk).slice(-9000) })
  pb.stderr.on("data", chunk => { logs = (logs + chunk).slice(-9000) })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (pb.exitCode !== null) break
    try { if ((await fetch(origin + "/api/health", { signal: AbortSignal.timeout(500) })).ok) return } catch {}
    await pause(100)
  }
  throw new Error("Temporary PocketBase did not start: " + logs.slice(-2000))
}
async function api(method, route, body, headers = ownerHeaders) {
  const response = await fetch(origin + route, { method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) })
  return { status: response.status, data: await response.json().catch(() => ({})) }
}
async function ok(method, route, body, headers) {
  const result = await api(method, route, body, headers)
  assert.equal(result.status, 200, method + " " + route + ": " + JSON.stringify(result.data))
  return result.data
}
const role = (id, name, deps, tools) => ({ id, name, responsibility: name + "负责明确的阶段",
  tasks: ["执行本阶段任务"], inputs: ["任务与前序交付"], deliverables: ["阶段成果"],
  done_criteria: ["有明确结果并说明未解决事项"], depends_on: deps, tools })
try {
  await new Promise(resolve => local.listen(0, "127.0.0.1", resolve))
  const localOrigin = "http://127.0.0.1:" + local.address().port
  await startPocketBase()
  const model = await ok("POST", "/api/model-connections", { name: "Role stage fixture", provider: "openai",
    api_key: "isolated-test-only", base_url: localOrigin + "/v1", models: ["roles-fixture"] })
  await ok("POST", "/api/tool-connections", { name: "role_write", description: "Write to isolated local test endpoint",
    method: "POST", url: localOrigin + "/write", headers: [], body_template: "{{input}}" })
  const roles = [role("researcher", "资料研究", [], ["calculate"]),
    role("executor", "方案执行", ["researcher"], ["role_write"]), role("reviewer", "审核交付", ["executor"], [])]
  const capabilities = [{id:"save",title:"保存计算结果",kind:"integration",access:"write",required:true,
    role_ids:["executor"],purpose:"保存经过核对的结果",search_terms:[],suggested_tool_ids:["role_write"]}]
  let saved = await ok("POST", "/api/agent_specs", { name: "Role stage test",
    spec: { goal: "Calculate, write, and review", task_scope: "Isolated test", tools: ["calculate", "role_write"],
      task_plan: ["Calculate", "Save", "Review"], deliverables: ["Report"], done_criteria: ["No skipped role"], roles,
      capability_requirements:capabilities } })
  assert.deepEqual((await ok("GET", "/api/agent_specs/" + saved.id)).spec.roles, roles)

  // An old editor omitting new fields cannot silently remove a role boundary.
  const { roles: omittedRoles, capability_requirements:omittedCapabilities, ...legacySpec } = saved.spec
  saved = await ok("PATCH", "/api/agent_specs/" + saved.id, { expected_updated: saved.updated, spec: { ...legacySpec, goal: "Calculate, write, and review carefully" } })
  assert.deepEqual(saved.spec.roles, omittedRoles)
  assert.deepEqual(saved.spec.capability_requirements, omittedCapabilities)
  const startBody = (id = saved.id, max_steps = 10) => ({ spec_id: id, instruction: "ROLE_STAGE_FIXTURE", model: "roles-fixture",
    config: { max_steps, max_model_calls: 20, tools: { calculate: true }, require_approval: true,
      custom_model: { connection_id: model.item.id, model_id: "roles-fixture" } } })
  const tooSmall = await api("POST", "/api/agent-runs/start", startBody(saved.id, 2))
  assert.equal(tooSmall.status, 400)
  assert.equal(tooSmall.data.error, "role_budget_too_small")
  const invalid = await ok("POST", "/api/agent_specs", { name: "Cyclic draft", spec: { ...saved.spec,
    roles: [role("a", "A", ["b"], []), role("b", "B", ["a"], [])] } })
  const cyclic = await api("POST", "/api/agent-runs/start", startBody(invalid.id))
  assert.equal(cyclic.status, 400)
  assert.equal(cyclic.data.error, "invalid_agent_roles")

  const runId = (await ok("POST", "/api/agent-runs/start", startBody())).run_id
  const state = () => ok("GET", "/api/agent_runs/" + runId)
  const tick = () => ok("POST", "/api/llm/agent-engine/" + runId + "/tick", {})
  await tick()
  assert.equal((await state()).status, "running", "An early final must not skip future roles")
  assert.equal((await state()).result, "")
  await tick()
  await tick()
  const beforeRestart = await state()
  assert.deepEqual(beforeRestart.checkpoint.role_state.completed, ["researcher"])
  assert.equal(beforeRestart.checkpoint.role_state.active_role_id, "executor")
  assert.match(beforeRestart.checkpoint.role_state.outputs.researcher, /PERSISTED_RESEARCH_EVIDENCE/)

  await stopHeadlessPocketBase(pb)
  await startPocketBase()
  assert.deepEqual((await state()).checkpoint.role_state, beforeRestart.checkpoint.role_state,
    "An actual server restart must preserve stage handoff and current role")
  assert.equal((await api("GET", "/api/agent_runs/" + runId, undefined, { "X-Rh-User-Id": "other-user" })).status, 404)

  // Owner edits do not change the frozen role plan of an already running task.
  const updated = await ok("PATCH", "/api/agent_specs/" + saved.id, { expected_updated: saved.updated, spec: { ...saved.spec, roles: [], capability_requirements:[] } })
  assert.deepEqual(updated.spec.roles, [])
  assert.deepEqual(updated.spec.capability_requirements, [])
  assert.equal((await state()).spec_snapshot.roles.length, 3)
  assert.deepEqual((await state()).spec_snapshot.capability_requirements,capabilities)
  await tick()
  const waiting = await state()
  assert.equal(waiting.status, "awaiting_approval")
  assert.equal(waiting.checkpoint.role_state.active_role_id, "executor")
  assert.equal(writes, 0, "A role handoff never authorizes an external write")
  assert.equal(handoffWasReceived, true)
  const callsBeforeApproval = modelCalls
  assert.equal((await api("POST", "/api/agent-runs/" + runId + "/approve", { decision: "approve" }, { "X-Rh-User-Id": "other-user" })).status, 404)
  await ok("POST", "/api/agent-runs/" + runId + "/approve", { decision: "approve" })
  await tick()
  assert.equal(writes, 1)
  assert.equal(modelCalls, callsBeforeApproval, "Approval resumes the stored exact call without replanning")
  await tick()
  assert.deepEqual((await state()).checkpoint.role_state.completed, ["researcher", "executor"])
  await tick()
  assert.equal(writes, 1, "Review role cannot call a globally granted writer tool")
  assert.equal((await state()).status, "running")
  await tick()
  const final = await state()
  assert.equal(final.status, "succeeded", JSON.stringify(final))
  assert.match(final.result, /FINAL_REVIEWED_DELIVERY/)
  assert.deepEqual(final.checkpoint.role_state.completed, ["researcher", "executor", "reviewer"])
  assert.equal(final.checkpoint.role_state.active_role_id, "")
  assert.equal(writes, 1)
  const detail = await ok("GET", "/api/agent-runs/" + runId + "/detail")
  assert.equal(detail.events.filter(event => event.content?.role_phase === "started").length, 3)
  assert.equal(detail.events.filter(event => event.content?.role_phase === "completed").length, 3)
  assert.equal(detail.events.filter(event => event.event_type === "tool_call" && event.content?.role_id === "reviewer").length, 0)
  // Run a more complex five-stage due-diligence Agent against real PocketBase/SQLite
  // and deterministic local browser/PDF/sheet/email fixtures. No external writes occur.
  for (const [name, route, method] of [["browser_read", "/read", "GET"], ["pdf_read", "/pdf", "GET"], ["sheet_analyze", "/sheet", "GET"]])
    await ok("POST", "/api/tool-connections", { name, description: "Local fixture " + name, method, url: localOrigin + route, headers: [], body_template: "" })
  const complexRoles = [
    role("dd_researcher", "网页研究", [], ["browser_read"]),
    role("dd_documenter", "文档分析", ["dd_researcher"], ["pdf_read"]),
    role("dd_analyst", "财务分析", ["dd_documenter"], ["sheet_analyze", "calculate"]),
    role("dd_reviewer", "交叉审核", ["dd_analyst"], []),
    role("dd_sender", "邮件交付", ["dd_reviewer"], ["role_write"]),
  ]
  const complexCapabilities = [
    { id: "source", title: "读取网页", purpose: "读取本地公开资料 fixture", kind: "browser", access: "read", required: true, role_ids: ["dd_researcher"], search_terms: ["browser"], suggested_tool_ids: ["browser_read"] },
    { id: "pdf", title: "提取 PDF 证据", purpose: "保留 PDF 页码与附注", kind: "document", access: "read", required: true, role_ids: ["dd_documenter"], search_terms: ["pdf"], suggested_tool_ids: ["pdf_read"] },
    { id: "sheet", title: "分析财务表格", purpose: "核对表格数字和公式", kind: "document", access: "read", required: true, role_ids: ["dd_analyst"], search_terms: ["spreadsheet"], suggested_tool_ids: ["sheet_analyze"] },
    { id: "email", title: "批准后交付邮件", purpose: "仅向本地 fixture 提交审核后的报告", kind: "integration", access: "write", required: true, role_ids: ["dd_sender"], search_terms: ["email"], suggested_tool_ids: ["role_write"] },
  ]
  const complexSpec = await ok("POST", "/api/agent_specs", { name: "Complex Due Diligence Acceptance", spec: {
    goal: "Cross-check issuer source, PDF note and spreadsheet, then deliver a reviewed report",
    task_scope: "Isolated local fixtures only; no real issuer access or email delivery",
    tools: ["browser_read", "pdf_read", "sheet_analyze", "calculate", "role_write"],
    task_plan: ["Read source", "Extract PDF evidence", "Analyze spreadsheet", "Review cross-source consistency", "Send approved report"],
    deliverables: ["Source index", "PDF page evidence", "Spreadsheet calculation", "Risk review", "Delivery receipt"],
    done_criteria: ["Source URL retained", "PDF page retained", "Sheet rows and calculation retained", "Write has an approval event"],
    roles: complexRoles, capability_requirements: complexCapabilities, require_approval: true,
    quality_checks: [{type:"contains",expected:"revenue 120"},{type:"contains",expected:"PDF p.4"},{type:"contains",expected:"metric 90"},{type:"not_contains",expected:"UNVERIFIED_CLAIM"}],
  } })
  const complexRunId = (await ok("POST", "/api/agent-runs/start", { spec_id: complexSpec.id,
    instruction: "COMPLEX_DUE_DILIGENCE_FIXTURE", model: "roles-fixture",
    config: { max_steps: 20, max_model_calls: 30, tools: { calculate: true }, require_approval: true,
      custom_model: { connection_id: model.item.id, model_id: "roles-fixture" } } })).run_id
  const complexState = () => ok("GET", "/api/agent_runs/" + complexRunId)
  const complexTick = () => ok("POST", "/api/llm/agent-engine/" + complexRunId + "/tick", {})
  await complexTick(); assert.equal((await complexState()).checkpoint.role_state.active_role_id, "dd_researcher")
  await complexTick(); await complexTick(); assert.equal((await complexState()).checkpoint.role_state.active_role_id, "dd_documenter")
  await complexTick(); await complexTick()
  const complexBeforeRestart = await complexState()
  assert.equal(complexBeforeRestart.checkpoint.role_state.active_role_id, "dd_analyst")
  assert.deepEqual(complexBeforeRestart.checkpoint.role_state.completed, ["dd_researcher", "dd_documenter"])
  assert.match(complexBeforeRestart.checkpoint.role_state.outputs.dd_researcher, /SOURCE_EVIDENCE/)
  assert.match(complexBeforeRestart.checkpoint.role_state.outputs.dd_documenter, /PDF_EVIDENCE/)
  const priorToolCalls = { ...complexToolCalls }
  await stopHeadlessPocketBase(pb)
  await startPocketBase()
  const restoredComplex = await complexState()
  assert.deepEqual(restoredComplex.checkpoint.role_state, complexBeforeRestart.checkpoint.role_state,
    "Actual backend restart between document and analysis must preserve the complete multi-role checkpoint")
  assert.deepEqual(complexToolCalls, priorToolCalls, "Recovering a run must not replay prior read tools")
  await complexTick(); assert.equal((await complexState()).checkpoint.role_state.active_role_id, "dd_reviewer")
  await complexTick(); assert.equal((await complexState()).checkpoint.role_state.active_role_id, "dd_sender")
  const complexWaiting = await complexTick()
  assert.equal(complexWaiting.status, "awaiting_approval")
  assert.equal(writes, 1, "Complex report must not be written before approval")
  assert.equal((await api("POST", "/api/agent-runs/" + complexRunId + "/approve", { decision: "approve" })).status, 200)
  await complexTick()
  await complexTick()
  const complexFinal = await complexState()
  assert.equal(complexFinal.status, "succeeded", JSON.stringify(complexFinal))
  assert.deepEqual(complexFinal.checkpoint.role_state.completed, ["dd_researcher", "dd_documenter", "dd_analyst", "dd_reviewer", "dd_sender"])
  assert.equal(writes, 2, "Only the final approved local fixture write executes once")
  assert.deepEqual(complexToolCalls, { browser_read: 1, pdf_read: 1, sheet_analyze: 1 })
  assert.deepEqual(complexCounts, { dd_researcher: 2, dd_documenter: 2, dd_analyst: 2, dd_reviewer: 1, dd_sender: 2 })
  assert.equal(complexHandoff, true, "Source and PDF evidence must be carried into later stages")
  assert.match(complexFinal.result, /revenue 120/); assert.match(complexFinal.result, /PDF p\.4/); assert.match(complexFinal.result, /metric 90/)
  const complexDetail = await ok("GET", "/api/agent-runs/" + complexRunId + "/detail")
  assert.equal(complexDetail.events.filter(event => event.content?.role_phase === "completed").length, 5)
  assert.equal(complexDetail.events.filter(event => event.event_type === "tool_call" && event.content?.role_id === "dd_reviewer").length, 0)

  // V27 release gate: an ordinary successful test run is not automatically a
  // formal acceptance run. Complex Agents require a fresh acceptance-mode
  // execution whose actual checkpoint, tool results and approval are complete.
  const informalVersion=await ok("POST","/api/spec-versions",{
    spec_id:complexSpec.id,test_run_id:complexRunId,note:"Success but not acceptance_test",
  })
  assert.equal(informalVersion.item.test_passed,false)
  const refusedInformal=await api("POST",
    "/api/spec-versions/"+informalVersion.item.id+"/publish",{})
  assert.equal(refusedInformal.status,409)
  assert.equal(refusedInformal.data.error,"complex_agent_acceptance_required")
  for(const roleId of Object.keys(complexCounts))complexCounts[roleId]=0
  const formalRunId=(await ok("POST","/api/agent-runs/start",{
    spec_id:complexSpec.id,instruction:"COMPLEX_DUE_DILIGENCE_FIXTURE",model:"roles-fixture",
    config:{source:"acceptance_test",max_steps:21,max_model_calls:30,tools:{calculate:true},
      require_approval:true,custom_model:{connection_id:model.item.id,model_id:"roles-fixture"}},
  })).run_id
  let formalStatus=""
  for(let i=0;i<22;i++){
    const current=await ok("GET","/api/agent_runs/"+formalRunId)
    formalStatus=current.status
    if(formalStatus==="succeeded"||formalStatus==="failed")break
    if(formalStatus==="awaiting_approval"){
      await ok("POST","/api/agent-runs/"+formalRunId+"/approve",{decision:"approve"})
    } else if(formalStatus==="running"){
      await ok("POST","/api/llm/agent-engine/"+formalRunId+"/tick",{})
    } else throw Error("Unexpected formal acceptance run status: "+formalStatus)
  }
  assert.equal(formalStatus,"succeeded",
    "formal acceptance must reach a verified five-stage terminal result")
  const formalVersion=await ok("POST","/api/spec-versions",{
    spec_id:complexSpec.id,test_run_id:formalRunId,note:"Complete role/tool/approval acceptance",
  })
  assert.equal(formalVersion.item.test_passed,true,
    "server must prove all role, tool and approval evidence before marking test_passed")
  const formalPublish=await ok("POST","/api/spec-versions/"+formalVersion.item.id+"/publish",{})
  assert.equal(formalPublish.status,"published")
  assert.equal(formalPublish.id,formalVersion.item.id)
  console.log("Role stages integration: baseline authorization/restart tests + five-role due diligence Agent, source/PDF/sheet evidence handoff, restarted mid-run, review gate, quality output and approved local-only delivery: PASS")
} catch (error) {
  console.error(logs.slice(-4000))
  throw error
} finally {
  await stopHeadlessPocketBase(pb)
  local.closeAllConnections?.()
  await new Promise(resolve => local.close(resolve))
  fs.rmSync(dataDir, { recursive: true, force: true })
}
