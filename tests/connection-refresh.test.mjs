import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { toolConnectionStatus } from "../src/pages/Home/presets.ts"
import { getVerifiedMarketTools } from "../src/lib/marketToolSelection.ts"
import { resolveAgentToolRequirements, prepareGeneratedAgentPermissions } from "../src/lib/agentToolMatcher.ts"
import { agentDesignTokenBudget } from "../src/lib/agentDesignProtocol.ts"
import { chooseAgentDesignModel } from "../src/lib/agentDesignModelSelection.ts"
import { preserveRoleSkillBindings, sanitizeAgentRoles } from "../src/lib/agentRoles.ts"
import { normalizeCapabilityRequirements } from "../src/lib/agentCapabilityPlan.ts"
import { evaluateAgentJourney } from "../src/lib/agentCreateJourney.ts"
import {safeAgentSpecId} from "../src/lib/toolSearchPrivacy.ts"
import { agentCapabilityReadiness, toolCatalogForDesign } from "../src/lib/agentCapabilityPlan.ts"

const home = "src/pages/Home/useHome.ts"
const quick = "src/components/site/SavedAgentQuickEditor.tsx"
const DESIGN_MODEL={key:JSON.stringify(["model-owner","fixture"]),connectionId:"model-owner",connectionName:"测试模型连接",modelId:"fixture"}
const designModelScope={designModelOptions:[DESIGN_MODEL],designModelKey:DESIGN_MODEL.key,
  designModelStatus:"ready",chooseAgentDesignModel,setLastDesignModelUsed:()=>{}}

// Exercise the actual asynchronous handlers with controlled transport/state.
// Their code is extracted through the TypeScript parser, never reimplemented.
function callback(file, name, scope) {
  const source = ts.createSourceFile(file, readFileSync(new URL("../" + file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let initializer
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(initializer, `${name} exists in ${file}`)
  const code = ts.transpileModule(`const handler = ${initializer.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  const context = { useCallback: value => value, ...scope }
  return new Function(...Object.keys(context), code + "\nreturn handler")( ...Object.values(context))
}

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const response = items => ({ ok: true, json: async () => ({ items }) })
const httpItem = (name = "browser_read") => ({ name, enabled: true, description: "Read browser page", method: "GET", status: "ok" })
const set = (state, key) => value => { state[key] = typeof value === "function" ? value(state[key]) : value }

function refreshHarness(file) {
  const pending = []
  const request = () => { const next = deferred(); pending.push(next); return next.promise }
  const state = { http: [httpItem("previous_tool")], market: [{ id: "previous_market_tool" }], knowledge: [], notice: "" }
  const scope = {
    connectedLoadSequence: { current: 0 },
    request, fetch: request, getPocketBaseUrl: () => "http://fixture.invalid", vibexAuthHeaders: () => ({}),
    getKnowledgeBases: async () => [], getVerifiedMarketTools, safeAgentSpecId,
    setConnectedTools: set(state, "http"), setConnectedMarketTools: set(state, "market"),
    setMarketTools: set(state, "market"), setKnowledge: set(state, "knowledge"),
    setToolMatchNotice: set(state, "notice"), setToolNotice: set(state, "notice"),
  }
  return { state, pending, load: callback(file, file === home ? "loadConnectedTools" : "refreshConnected", scope) }
}

test("explicit failed or unknown connection status never becomes ready; name-only legacy callers remain compatible", () => {
  const tool = { name: "internal_search", description: "Search records" }
  for (const status of ["unknown", "failed", "error", "untested", "", null])
    assert.equal(toolConnectionStatus(tool.name, [{ ...tool, status }]), "pending")
  for (const status of ["ok", "success", "connected", "OK"])
    assert.equal(toolConnectionStatus(tool.name, [{ ...tool, status }]), "ready")
  assert.equal(toolConnectionStatus(tool.name, [tool]), "ready")
  assert.equal(toolConnectionStatus("web_search", []), "ready")
})

test("the create gate blocks an unknown extra HTTP tool even when structured requirements only mention a builtin", () => {
  const spec = { goal: "整理内容", task_scope: "完成用户交付", deliverables: ["报告"], task_plan: ["汇总"],
    done_criteria: ["内容完整"], tools: ["summarize", "internal_search"],
    capability_requirements: [{ id: "summary", title: "整理文本", kind: "text", access: "read", required: true, suggested_tool_ids: ["summarize"] }] }
  const connections = [{ name: "internal_search", description: "Search records", method: "GET", status: "unknown" }]
  const analysis = resolveAgentToolRequirements("", spec, connections, [], spec.tools)
  const capabilityIssues = agentCapabilityReadiness(spec, analysis, connections, [])
  assert.deepEqual(capabilityIssues, [])
  const result = evaluateAgentJourney({ spec, specName: "整理助手", savedId: "testagent0000001", dirty: false,
    enabledModelCount: 1, modelState: "ready", accessibleKnowledgeBaseIds: [], capabilityIssues,
    toolStatusOf: name => toolConnectionStatus(name, connections) })
  assert.equal(result.canTry, false)
  assert.ok(result.resourceIssues.some(issue => issue.includes("internal_search")))
})

for (const file of [home, quick]) {
  test(`${file}: only valid saved connection IDs survive catalog refresh`,async()=>{
    const h=refreshHarness(file),loading=h.load()
    h.pending[0].resolve(response([
      {...httpItem("ready_tool"),id:"abcdefghijklmno"},
      {...httpItem("unsafe_tool"),id:"../test?access_token=private"},
    ]))
    h.pending[1].resolve(response([]))
    assert.equal((await loading).verified,true)
    assert.equal(h.state.http.find(row=>row.name==="ready_tool").id,"abcdefghijklmno")
    assert.equal(h.state.http.find(row=>row.name==="unsafe_tool").id,undefined)
    assert.equal(JSON.stringify(h.state.http).includes("access_token"),false)
  })

  test(`${file}: an older success cannot overwrite the latest failed refresh`, async () => {
    const h = refreshHarness(file)
    const older = h.load(), newer = h.load()
    h.pending[2].resolve({ ok: false })
    h.pending[3].resolve({ ok: false })
    assert.equal((await newer).verified, false)
    const latestState = structuredClone(h.state)
    assert.equal(latestState.http[0].status, "unknown")
    assert.deepEqual(latestState.market, [])
    h.pending[0].resolve(response([httpItem("obsolete_tool")]))
    h.pending[1].resolve(response([]))
    const result = await older
    assert.equal(result.stale, true)
    assert.equal(result.verified, false)
    assert.deepEqual(h.state, latestState)
  })

  test(`${file}: JSON bodies finishing out of order cannot replace the newest catalog`, async () => {
    const h = refreshHarness(file), slowBody = deferred()
    const older = h.load()
    h.pending[0].resolve({ ok: true, json: () => slowBody.promise })
    h.pending[1].resolve(response([]))
    await new Promise(resolve => setImmediate(resolve))
    const newer = h.load()
    h.pending[2].resolve(response([httpItem("current_tool")]))
    h.pending[3].resolve(response([]))
    assert.equal((await newer).verified, true)
    slowBody.resolve({ items: [httpItem("obsolete_tool")] })
    assert.equal((await older).stale, true)
    assert.equal(h.state.http[0].name, "current_tool")
  })

  test(`${file}: HTTP 200 with invalid JSON or an invalid list envelope cannot authorize rematching`, async () => {
    for (const body of [null, {}, { items: null }, { items: [null] }]) {
      const h = refreshHarness(file)
      const current = h.load()
      h.pending[0].resolve({ ok: true, json: async () => { if (body === null) throw new Error("invalid JSON"); return body } })
      h.pending[1].resolve(response([]))
      const result = await current
      assert.equal(result.verified, false)
      assert.equal(result.stale, false)
      assert.equal(h.state.http[0].status, "unknown")
      assert.ok(h.state.notice)
    }
  })

  test(`${file}: an invalid marketplace envelope clears its old verified tools`, async () => {
    const h = refreshHarness(file)
    const current = h.load()
    h.pending[0].resolve(response([httpItem()]))
    h.pending[1].resolve({ ok: true, json: async () => ({ error: "unavailable" }) })
    const result = await current
    assert.equal(result.verified, false)
    assert.deepEqual(h.state.market, [])
    assert.equal(h.state.http[0].status, "ok")
  })
}

function editorHarness() {
  const state = { spec: null, specDirty: false, proposal: { basis: 0 }, requirement: "原 Agent 的联网搜索要求", notice: "",
    editingId: "", savedId: "", serverUpdated: "", name: "", editorContextKey: 0, saveConflict: false, error: "", revisionError: "", savedMsg: "",
    isSaving: false, isRevising: false, needsRhLogin: false, lastSavedAt: 0, userInput: "", clearedDrafts: 0, listLoads: 0,
    lastDesignModelUsed: "" }
  const scope = {
    specRevisionRef: { current: 0 }, specContextRef: { current: 0 }, returnSpecRef: { current: "oldagent0000001" },
    setRevisionProposal: set(state, "proposal"), setRequirementForTools: set(state, "requirement"),
    setToolMatchNotice: set(state, "notice"), setSpec: set(state, "spec"), setSpecDirty: set(state, "specDirty"),
    setUserInput: set(state, "userInput"), setSpecName: set(state, "name"), setSourceMode: () => {}, setTemplateKey: () => {},
    setEditingRecordId: set(state, "editingId"), setErrorMsg: set(state, "error"), setRevisionError: set(state, "revisionError"), setEditorContextKey: set(state, "editorContextKey"), setSavedSpecId: set(state, "savedId"),
    setLastSavedAt: set(state, "lastSavedAt"), setServerUpdated: set(state, "serverUpdated"), setSaveConflict: set(state, "saveConflict"),
    setSavedMsg: set(state, "savedMsg"), setIsSaving: set(state, "isSaving"), setIsRevising: set(state, "isRevising"), setNeedsRhLogin: set(state, "needsRhLogin"), scrollToSpecEditor: () => {},
    setLastDesignModelUsed: set(state, "lastDesignModelUsed"),
    specDirty: false, userInput: "", window: { confirm: () => true },
  }
  scope.invalidateSpecContext = callback(home, "invalidateSpecContext", scope)
  scope.markSpecEdited = callback(home, "markSpecEdited", scope)
  const open = callback(home, "handleOpenSaved", scope)
  return { state, scope, open }
}

test("opening another saved Agent invalidates a pending rematch without changing the new Agent's tools", async () => {
  const h = editorHarness(), pending = deferred()
  const source = { goal: "搜索公开资料", task_scope: "网页搜索", deliverables: [], tools: ["网页搜索"], task_plan: [], done_criteria: [] }
  const target = { ...source, goal: "计算金额", tools: ["calculate"] }
  const rematch = callback(home, "rematchAgentTools", { ...h.scope, spec: source, requirementForTools: h.state.requirement,
    loadConnectedTools: () => pending.promise, resolveAgentToolRequirements })
  const running = rematch()
  h.open({ id: "newagent0000001", name: "新 Agent", updated: "2026-10-21T00:00:00Z", spec: target })
  pending.resolve({ http: [], market: [], verified: true, stale: false })
  await running
  assert.deepEqual(h.state.spec, target)
  assert.equal(h.state.specDirty, false)
  assert.equal(h.state.proposal, null)
  assert.equal(h.state.requirement, "")
})

test("opening another saved Agent invalidates a pending AI revision before it can become an applicable proposal", async () => {
  const h = editorHarness(), pending = deferred()
  const source = { goal: "旧任务", task_scope: "旧范围", tools: [], task_plan: [], deliverables: [], done_criteria: [] }
  const target = { ...source, goal: "新任务" }
  const revise = callback(home, "runRevise", { ...h.scope,...designModelScope, reviseInput: "完善完成标准", spec: source, specName: "旧 Agent",
    connectedTools: [], connectedMarketTools: [], requirementForTools: "", toolCatalogForDesign,
    MODEL_SHORT: "fixture", REVISE_SYSTEM_PROMPT: "fixture", LLM_ERROR_TEXT: {},
    callLlmWithFallback: () => pending.promise, parseSpecJson: () => ({ displayName: "旧 Agent 改进版", spec: source }) })
  const running = revise()
  assert.equal(h.state.isRevising, true)
  h.open({ id: "newagent0000001", name: "新 Agent", updated: "2026-10-21T00:00:00Z", spec: target })
  assert.equal(h.state.isRevising, false, "Changing Agent must reset the previous revision spinner")
  pending.resolve({ ok: true, status: "success", text: "{}" })
  await running
  assert.equal(h.state.proposal, null)
  assert.equal(h.state.revisionError, "", "The old revision cannot add an error to Agent B")
  assert.equal(h.state.isRevising, false)
  assert.deepEqual(h.state.spec, target)
  assert.equal(h.state.specDirty, false)
})

const agentRecord = (id, goal = id) => ({ id, name: goal, updated: "2026-10-21T00:00:00.000Z", source: "create", template_key: "",
  spec: { goal, task_scope: "范围", tools: ["summarize"], task_plan: ["整理"], deliverables: ["报告"], done_criteria: ["完整"] } })
const savedResponse = record => ({ ok: true, status: 200, json: async () => record })
const agentA = agentRecord("agent000000000a", "旧 Agent"), agentB = agentRecord("agent000000000b", "新 Agent")

function saveHarness() {
  const h = editorHarness(), pending = []
  Object.assign(h.state, { spec: agentA.spec, specDirty: true, editingId: agentA.id, savedId: agentA.id,
    serverUpdated: agentA.updated, name: agentA.name })
  const scope = { ...h.scope, spec: agentA.spec, isSaving: false, rhUserId: "owner0000000001", editingRecordId: agentA.id,
    serverUpdated: agentA.updated, specName: agentA.name, sourceMode: "create", templateKey: "",
    getPocketBaseUrl: () => "http://fixture.invalid", vibexAuthHeaders: () => ({}), draftRef: { current: { userInput: "" } },
    fetch: () => { const next = deferred(); pending.push(next); return next.promise },
    clearAgentDraft: () => { h.state.clearedDrafts++ }, loadSavedList: async () => { h.state.listLoads++ } }
  return { ...h, scope, pending, save: callback(home, "saveCurrentSpec", scope) }
}

test("a late save for Agent A cannot rebind Agent B or finish B's newer save indicator", async () => {
  const h = saveHarness()
  const first = h.save(false)
  h.open(agentB)
  const saveB = callback(home, "saveCurrentSpec", { ...h.scope, spec: agentB.spec, editingRecordId: agentB.id,
    serverUpdated: agentB.updated, specName: agentB.name })
  const second = saveB(false)
  h.pending[0].resolve(savedResponse({ ...agentA, updated: "2026-10-21T01:00:00.000Z" }))
  await first
  assert.equal(h.state.editingId, agentB.id)
  assert.equal(h.state.savedId, agentB.id)
  assert.equal(h.state.serverUpdated, agentB.updated)
  assert.equal(h.state.isSaving, true, "A's finally must not clear B's pending save")
  assert.equal(h.state.clearedDrafts, 0)
  assert.equal(h.state.listLoads, 0)
  h.pending[1].resolve(savedResponse({ ...agentB, updated: "2026-10-21T02:00:00.000Z" }))
  await second
  assert.equal(h.state.isSaving, false)
  assert.equal(h.state.serverUpdated, "2026-10-21T02:00:00.000Z")
})

test("a save whose JSON body finishes after switching Agents cannot change the new identity", async () => {
  const h = saveHarness(), body = deferred()
  const saving = h.save(false)
  h.pending[0].resolve({ ok: true, status: 200, json: () => body.promise })
  await new Promise(resolve => setImmediate(resolve))
  h.open(agentB)
  body.resolve({ ...agentA, updated: "2026-10-21T01:00:00.000Z" })
  await saving
  assert.equal(h.state.editingId, agentB.id)
  assert.equal(h.state.serverUpdated, agentB.updated)
  assert.equal(h.state.specDirty, false)
  assert.equal(h.state.savedMsg, "")
  assert.equal(h.state.clearedDrafts, 0)
})

test("a stale save conflict, expired login or network failure never appears on another Agent", async () => {
  for (const status of [409, 401, 412, 500, "network"]) {
    const h = saveHarness(), saving = h.save(false)
    h.open(agentB)
    if (status === "network") h.pending[0].reject(new Error("offline"))
    else h.pending[0].resolve({ ok: false, status })
    await saving
    assert.equal(h.state.error, "", `stale ${status} error`)
    assert.equal(h.state.saveConflict, false)
    assert.equal(h.state.needsRhLogin, false)
    assert.equal(h.state.editingId, agentB.id)
  }
})

test("editing the same Agent during save still advances its server version and keeps the later draft dirty", async () => {
  const h = saveHarness(), saving = h.save(false)
  const laterDraft = { ...agentA.spec, goal: "保存期间继续修改的目标" }
  h.scope.markSpecEdited()
  h.scope.setSpec(laterDraft)
  h.pending[0].resolve(savedResponse({ ...agentA, updated: "2026-10-21T01:00:00.000Z" }))
  await saving
  assert.equal(h.state.editingId, agentA.id)
  assert.equal(h.state.serverUpdated, "2026-10-21T01:00:00.000Z")
  assert.deepEqual(h.state.spec, laterDraft)
  assert.equal(h.state.specDirty, true)
  assert.equal(h.state.clearedDrafts, 0)
  assert.equal(h.state.listLoads, 1)
})

test("a newly generated Agent is not rebound by the previous Agent's pending save", async () => {
  const h = saveHarness(), saving = h.save(false)
  const generate = callback(home, "runGenerate", { ...h.scope,...designModelScope, userInput: "创建新摘要助手", connectedTools: [], connectedMarketTools: [],
    setIsGenerating: () => {}, MODEL_SHORT: "fixture", SYSTEM_PROMPT: "fixture", LLM_ERROR_TEXT: {}, toolCatalogForDesign,
    callLlmWithFallback: async (model,opts) => {
      assert.equal(model,"fixture")
      assert.equal(opts.connection_id,"model-owner")
      assert.equal(opts.strict_model,true)
      return { ok: true, status: "success", model:"fixture", text: "{}" }
    }, resolveAgentToolRequirements, prepareGeneratedAgentPermissions, agentDesignTokenBudget,
    parseSpecJson: () => ({ displayName: agentB.name, spec: agentB.spec }) })
  await generate()
  h.pending[0].resolve(savedResponse(agentA))
  await saving
  assert.equal(h.state.spec.goal, agentB.spec.goal)
  assert.equal(h.state.editingId, "")
  assert.equal(h.state.savedId, "")
  assert.equal(h.state.specDirty, true)
})

test("deleting the current Agent detaches its draft even if an older save returns afterwards", async () => {
  const h = saveHarness(), saving = h.save(false)
  const remove = callback(home, "handleDeleteSaved", h.scope)
  const deleting = remove(agentA.id)
  h.pending[1].resolve({ ok: true, status: 200 })
  await deleting
  h.pending[0].resolve(savedResponse(agentA))
  await saving
  assert.equal(h.state.editingId, "")
  assert.equal(h.state.savedId, "")
  assert.equal(h.state.specDirty, true)
  assert.equal(h.state.spec.goal, agentA.spec.goal)
})

test("AI full editor revision preserves reviewed Skill bindings only for surviving role IDs",async()=>{
  const h=editorHarness()
  const ref={id:"skillref0000001",version:1,hash:"a".repeat(64)}
  const role=(id)=>({id,name:id,responsibility:"审查信息",tasks:["分析资料"],
    inputs:["输入"],deliverables:["输出"],depends_on:[],tools:[],done_criteria:["能核实"]})
  const current={goal:"旧投资研究任务",task_scope:"公开资料",tools:[],deliverables:["报告"],
    task_plan:["分析"],done_criteria:["附证据"],
    roles:[{...role("researcher"),skill_refs:[ref]},{...role("reviewer"),skill_refs:[]}]}
  const proposed={...current,goal:"更新后的研究目标",roles:[
    {...role("researcher"),skill_refs:[{id:"malicious0000001",version:2,hash:"b".repeat(64)}]},
    role("new_reviewer")
  ]}
  const revise=callback(home,"runRevise",{...h.scope,...designModelScope,
    reviseInput:"完善目标",spec:current,specName:"安全测试",connectedTools:[],connectedMarketTools:[],
    REVISE_SYSTEM_PROMPT:"fixture",LLM_ERROR_TEXT:{},toolCatalogForDesign,
    callLlmWithFallback:async()=>({ok:true,status:"success",model:"fixture",text:"{}"}),
    preserveRoleSkillBindings,parseSpecJson:()=>({displayName:"更新版",spec:proposed})})
  await revise()
  assert.equal(h.state.revisionError,"")
  const revised=h.state.proposal?.spec?.roles||[]
  assert.deepEqual(revised[0].skill_refs,[ref],"same role must retain its original reviewed Skill reference")
  assert.equal(Object.hasOwn(revised[1],"skill_refs"),false,"new role must not inherit or forge a Skill")
  assert.ok(!revised.some(x=>x.id==="reviewer"),"deleted role should not carry its Skill")
  assert.equal(h.state.proposal?.spec?.goal,"更新后的研究目标")
})

function quickSaveHarness() {
  const pending = []
  const state = { record: agentA, draft: agentA.spec, name: agentA.name, dirty: true, saving: false,
    error: "", revisionError: "", revising: false, proposal: null, conflict: false, notice: "", baseUpdated: agentA.updated, list: [agentA], nextTrialUrl: "", editorSessionKey: "",
    closed: 0, clearedDrafts: 0, events: 0, navigations: [] }
  const scope = { revision: { current: 0 }, loadSequence: { current: 0 },
    record: agentA, draft: agentA.spec, name: agentA.name, dirty: true, saving: false,
    pendingQuickDraft: null, baseUpdated: agentA.updated, ownerId: "owner0000000001",
    request: () => { const next = deferred(); pending.push(next); return next.promise },
    setRecord: set(state, "record"), setDraft: set(state, "draft"), setName: set(state, "name"), setDirty: set(state, "dirty"),
    setSaving: set(state, "saving"), setRevising: set(state, "revising"), setError: set(state, "error"), setRevisionError: set(state, "revisionError"), setConflict: set(state, "conflict"), setNotice: set(state, "notice"),
    setBaseUpdated: set(state, "baseUpdated"), setList: set(state, "list"), setNextTrialUrl: set(state, "nextTrialUrl"),
    setEditorSessionKey: set(state, "editorSessionKey"),
    setLoading: () => {}, setPendingQuickDraft: () => {}, setDraftStorageError: () => {}, setReviseInstruction: () => {}, setRevisionProposal: set(state, "proposal"),
    readQuickAgentDraft: () => null, cloneSpec: spec => structuredClone(spec), persistUnsavedDraft: () => true,
    clearQuickAgentDraft: () => { state.clearedDrafts++ }, onClose: () => { state.closed++ },
    window: { confirm: () => true, dispatchEvent: () => { state.events++ } }, CustomEvent: class { constructor(type) { this.type = type } },
    navigate: target => state.navigations.push(target), loc: { pathname: "/agent-run" }, runId: "running00000001" }
  scope.save = callback(quick, "save", scope)
  return { state, scope, pending, save: scope.save, close: callback(quick, "close", scope), load: callback(quick, "loadRecord", scope) }
}
async function reopenQuickOnB(h) {
  h.close()
  const loading = h.load(agentB.id)
  h.pending.at(-1).resolve(savedResponse(agentB))
  await loading
  assert.equal(h.state.editorSessionKey, agentB.id + ":" + h.scope.loadSequence.current,
    "Loading a distinct Agent must assign a fresh editor context from the completed request")
}

test("quick editor AI revision retains Skill references instead of trusting model-supplied replacements",async()=>{
  const h=quickSaveHarness()
  const ref={id:"skillref0000001",version:1,hash:"a".repeat(64)}
  const role={id:"researcher",name:"研究",responsibility:"分析",tasks:["研究"],inputs:["输入"],
    deliverables:["报告"],depends_on:[],tools:[],done_criteria:["可靠"],skill_refs:[ref]}
  const current={...agentA.spec,roles:[role]}
  const proposal={...current,goal:"模型修改后的目标",roles:[{...role,skill_refs:[]}]}
  const revise=callback(quick,"revise",{...h.scope,
    reviseInstruction:"修改研究目标",record:agentA,revising:false,draft:current,
    name:agentA.name,connectedTools:[],marketTools:[],toolCatalogForDesign,
    sanitizeAgentRoles,normalizeCapabilityRequirements,preserveRoleSkillBindings,
    callLlmWithFallback:async()=>({ok:true,status:"success",text:JSON.stringify(proposal)})})
  await revise()
  assert.equal(h.state.revisionError,"")
  assert.equal(h.state.proposal?.spec?.goal,proposal.goal)
  assert.deepEqual(h.state.proposal?.spec?.roles?.[0].skill_refs,[ref],
    "quick edit cannot drop an existing reviewed Skill")
})

test("quick editor: late AI revision cannot change error, spinner or proposal after another Agent opens", async () => {
  for (const outcome of ["success", "failure"]) {
    const h = quickSaveHarness(), pending = deferred()
    const revise = callback(quick, "revise", { ...h.scope,
      reviseInstruction: "补充尽调证据", record: agentA, revising: false,
      draft: agentA.spec, name: agentA.name, connectedTools: [], marketTools: [],
      toolCatalogForDesign, callLlmWithFallback: () => pending.promise })
    const previous = revise()
    assert.equal(h.state.revising, true)
    await reopenQuickOnB(h)
    assert.equal(h.state.revising, false)
    pending.resolve(outcome === "success"
      ? { ok: true, status: "success", text: "{\"goal\":\"stale\"}" }
      : { ok: false, status: "error", error: "offline" })
    await previous
    assert.equal(h.state.record.id, agentB.id)
    assert.equal(h.state.revising, false)
    assert.equal(h.state.revisionError, "", "Old errors belong only to the previous Agent")
    assert.equal(h.state.proposal, null, "An old revision must never become Agent B's proposal")
  }
})

test("quick editor: closing and reopening Agent B isolates Agent A's late save success and errors", async () => {
  for (const status of [200, 409, 500, "network"]) {
    const h = quickSaveHarness(), saving = h.save()
    await reopenQuickOnB(h)
    if (status === 200) h.pending[0].resolve(savedResponse(agentA))
    else if (status === "network") h.pending[0].reject(new Error("offline"))
    else h.pending[0].resolve({ ok: false, status, json: async () => ({ message: "旧 Agent 错误" }) })
    assert.equal(await saving, "")
    assert.equal(h.state.record.id, agentB.id)
    assert.equal(h.state.baseUpdated, agentB.updated)
    assert.equal(h.state.error, "")
    assert.equal(h.state.conflict, false)
    assert.equal(h.state.notice, "")
    assert.equal(h.state.clearedDrafts, 0)
    assert.equal(h.state.events, 0)
  }
})

test("quick editor: a delayed save body cannot overwrite a reopened Agent", async () => {
  const h = quickSaveHarness(), body = deferred(), saving = h.save()
  h.pending[0].resolve({ ok: true, status: 200, json: () => body.promise })
  await new Promise(resolve => setImmediate(resolve))
  await reopenQuickOnB(h)
  body.resolve(agentA)
  assert.equal(await saving, "")
  assert.equal(h.state.record.id, agentB.id)
  assert.equal(h.state.draft.goal, agentB.spec.goal)
})

test("quick editor: later edits in the same Agent survive a successful save with the updated server version", async () => {
  const h = quickSaveHarness(), saving = h.save()
  h.scope.revision.current++
  const laterDraft = { ...agentA.spec, goal: "后续编辑" }
  h.scope.setDraft(laterDraft)
  h.pending[0].resolve(savedResponse({ ...agentA, updated: "2026-10-21T01:00:00.000Z" }))
  assert.equal(await saving, agentA.id)
  assert.equal(h.state.baseUpdated, "2026-10-21T01:00:00.000Z")
  assert.deepEqual(h.state.draft, laterDraft)
  assert.equal(h.state.dirty, true)
  assert.equal(h.state.clearedDrafts, 0)
})

test("quick editor: an older save-and-test cannot navigate after another Agent opens during its run check", async () => {
  const h = quickSaveHarness(), body = deferred()
  const trial = callback(quick, "saveAndTest", { ...h.scope, dirty: false })()
  h.pending[0].resolve({ ok: true, json: () => body.promise })
  await new Promise(resolve => setImmediate(resolve))
  await reopenQuickOnB(h)
  body.resolve({ status: "succeeded" })
  await trial
  assert.deepEqual(h.state.navigations, [])
  assert.equal(h.state.closed, 1)
  assert.equal(h.state.record.id, agentB.id)
  assert.equal(h.state.notice, "")
  assert.equal(h.state.nextTrialUrl, "")
})
