import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeCapabilityRequirements, buildAgentCapabilityPlan, toolCatalogForDesign, bindAgentCapability,
  agentCapabilityRequirements, agentCapabilityReadiness, addAgentCapability, updateAgentCapability,
  removeAgentCapability, restoreAgentCapability, MAX_AGENT_CAPABILITIES,
} from "../src/lib/agentCapabilityPlan.ts"
import { resolveAgentToolRequirements, generatedAgentToolSelections, prepareGeneratedAgentPermissions } from "../src/lib/agentToolMatcher.ts"
import { sanitizeAgentDraftSpec } from "../src/lib/agentEditorDraft.ts"
import { safeMarketplaceQuery } from "../src/lib/toolSearchPrivacy.ts"

const need = (patch = {}) => ({ id: "need_1", title: "读取网页", purpose: "取得任务所需的信息", kind: "browser", access: "read", required: true, role_ids: [], search_terms: ["browser"], suggested_tool_ids: [], ...patch })
const spec = (patch = {}) => ({ goal: "完成指定任务", task_scope: "按当前任务范围工作", deliverables: ["可核验的结果"], tools: [], task_plan: [], done_criteria: ["交付满足任务要求"], capability_requirements: [], ...patch })
const market = (patch = {}) => ({ id: "mkt__browser00000001__browser_read", name: "browser_read", label: "浏览器 · 读取页面", description: "Read the current browser page", connectionTitle: "Browser", readOnly: true, destructive: false, ...patch })
const role = (id, tools = []) => ({ id, name: id, responsibility: "负责所分配任务", tasks: ["完成任务"], inputs: [], deliverables: ["输出"], depends_on: [], tools, done_criteria: ["核验输出"] })

test("complex generated capability gaps are planning needs, never fake executable global grants", () => {
  const proposed = spec({ tools: ["PDF提取", "邮件发送"],
    roles: [role("researcher"), role("sender")],
    capability_requirements: [
      need({ title: "PDF提取", kind: "document", role_ids: ["researcher"] }),
      need({ id: "send", title: "发送邮件", kind: "integration", access: "write", role_ids: ["sender"] }),
    ],
  })
  const resolved = resolveAgentToolRequirements("读取PDF并在人工批准后发送邮件", proposed)
  assert.ok(resolved.gaps.some(gap => gap.name === "邮件发送"))
  const selections = generatedAgentToolSelections(proposed,resolved)
  assert.ok(!selections.includes("邮件发送"), "textual write placeholder must never enter executable tools")
  assert.ok(!selections.includes("PDF提取"), "unresolved parsing placeholder must remain in capability plan")
  const roleGrant = proposed.roles.map(role => role.tools)
  assert.deepEqual(roleGrant, [[], []], "generation cannot implicitly grant tools")
  const legacy = { ...proposed, capability_requirements: undefined }
  assert.ok(generatedAgentToolSelections(legacy, resolved).includes("邮件发送"),
    "legacy unstructured drafts preserve their visible unmatched tool gap")
})

test("model-authored role tools never grant permissions, including when a connection already exists", () => {
  const browser = market()
  const sender = market({ id: "mkt__mail000000000001__send_email",
    name:"send_email", description:"Send an email", readOnly:false, destructive:true })
  const proposed = spec({
    tools:[browser.id,sender.id],
    roles:[role("researcher",[browser.id]),role("sender",[sender.id])],
    capability_requirements:[
      need({id:"browser",title:"浏览器读取",kind:"browser",role_ids:["researcher"],suggested_tool_ids:[browser.id]}),
      need({id:"send",title:"发送邮件",kind:"integration",access:"write",role_ids:["sender"],suggested_tool_ids:[sender.id]}),
    ],
  })
  const matched = resolveAgentToolRequirements("读取网页并在审批后发送邮件", proposed, [], [browser,sender])
  const ready = prepareGeneratedAgentPermissions(proposed,matched)
  assert.ok(ready.tools.includes(browser.id),"verified read-only tool may be recommended globally")
  assert.ok(!ready.tools.includes(sender.id),"model cannot grant a write tool globally")
  assert.deepEqual(ready.roles.map(r=>r.tools),[[],[]],
    "model role.tools must be discarded until an employee explicitly binds the tool")
  assert.equal(ready.require_approval,true,"new write-capable Agent must require approval")
  assert.deepEqual(proposed.roles.map(r=>r.tools),[[browser.id],[sender.id]],
    "sanitization must not mutate the original generated proposal")
})
test("different generated Agent complexities all start with least-privilege role tools", () => {
  for (const roleCount of [2,3,5,8]) {
    const roles=Array.from({length:roleCount},(_,i)=>
      role("stage_"+(i+1),["web_search","invented_write_permission"]))
    const proposed=spec({
      tools:["web_search","invented_write_permission"],roles,
      capability_requirements:[need({title:"外部系统更新",kind:"integration",access:"write",role_ids:[roles.at(-1).id]})],
    })
    const result=prepareGeneratedAgentPermissions(proposed,
      resolveAgentToolRequirements("分阶段调研并经批准后更新外部系统",proposed))
    assert.ok(result.tools.includes("web_search"))
    assert.ok(!result.tools.includes("invented_write_permission"))
    assert.ok(result.roles.every(r=>r.tools.length===0))
    assert.equal(result.require_approval,true)
    assert.equal(result.roles.length,roleCount)
  }
})

test("structured capability requirements remain bounded, typed and free of raw search terms", () => {
  const rows = normalizeCapabilityRequirements([
    null, { title: "" }, need({ id: "invalid id", access: "administrator", search_terms: ["私有收购项目 白名单客户", "Excel导出", "token=secretvalue browser"], hidden_token: "private" }),
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].access, "read")
  assert.deepEqual(rows[0].search_terms, ["spreadsheet"])
  assert.equal("hidden_token" in rows[0], false)
  assert.match(rows[0].id, /^[A-Za-z0-9_-]+$/)
  assert.equal(normalizeCapabilityRequirements(Array.from({ length: 25 }, (_, i) => need({ id: `need_${i}` }))).length, 20)
})

test("a model suggestion alone does not select or authorize a real tool", () => {
  const tool = market()
  const plan = buildAgentCapabilityPlan(spec({ capability_requirements: [need({ suggested_tool_ids: [tool.id] })] }), null, [], [tool])
  assert.equal(plan[0].state, "available")
  assert.equal(plan[0].candidates[0].selected, false)
})

test("a fabricated exact tool ID never becomes an executable candidate", () => {
  const fake = "mkt__invented0000000__fabricated_action"
  const plan = buildAgentCapabilityPlan(spec({ tools: [fake], capability_requirements: [need({ kind: "custom", title: "未知业务动作", suggested_tool_ids: [fake] })] }), null, [], [])
  assert.equal(plan[0].state, "missing")
  assert.deepEqual(plan[0].candidates, [])
})

test("a read-only browser tool cannot fulfil a click or submission requirement", () => {
  const tool = market()
  const plan = buildAgentCapabilityPlan(spec({ tools: [tool.id], capability_requirements: [need({ title: "点击按钮并提交表单", access: "write", suggested_tool_ids: [tool.id] })] }), null, [], [tool])
  assert.equal(plan[0].state, "missing")
  assert.deepEqual(plan[0].candidates, [])
})

test("an element-click tool alone cannot fulfil browser file upload", () => {
  const tool = market({ id: "mkt__browser00000001__browser_click", name: "browser_click", description: "Click an element in the browser page", readOnly: false })
  const plan = buildAgentCapabilityPlan(spec({ tools: [tool.id], capability_requirements: [need({ title: "在浏览器上传附件文件", access: "write", suggested_tool_ids: [tool.id] })] }), null, [], [tool])
  assert.notEqual(plan[0].state, "selected", "a click action provides no file-upload input capability")
})

test("suggested IDs cannot relabel plain web fetch as a logged-in browser capability", () => {
  const plan = buildAgentCapabilityPlan(spec({ tools: ["web_fetch"], capability_requirements: [need({ title: "读取已登录浏览器中的页面", suggested_tool_ids: ["web_fetch"] })] }), null)
  assert.equal(plan[0].candidates.some(candidate => candidate.id === "web_fetch"), false)
  assert.notEqual(plan[0].state, "selected")
})

test("PDF reading cannot satisfy an Excel workbook reading requirement", () => {
  const tool = market({ id: "mkt__pdf000000000001__pdf_read", name: "pdf_read", label: "PDF读取", description: "Read PDF document text" })
  const plan = buildAgentCapabilityPlan(spec({ tools: [tool.id], capability_requirements: [need({ kind: "document", title: "读取Excel工作簿", search_terms: ["spreadsheet"] })] }), null, [], [tool])
  assert.equal(plan[0].candidates.some(candidate => candidate.id === tool.id), false)
  assert.notEqual(plan[0].state, "selected")
})

test("a PDF writer cannot satisfy exporting an Excel file", () => {
  const tool = market({ id: "mkt__pdf000000000001__pdf_create", name: "pdf_create", label: "创建PDF", description: "Create PDF document", readOnly: false })
  const plan = buildAgentCapabilityPlan(spec({ tools: [tool.id], capability_requirements: [need({ kind: "document", title: "导出Excel报表", access: "write", search_terms: ["spreadsheet"] })] }), null, [], [tool])
  assert.equal(plan[0].candidates.some(candidate => candidate.id === tool.id), false)
  assert.notEqual(plan[0].state, "selected")
})

test("an untested HTTP binding remains needs-test instead of ready", () => {
  const tool = { name: "browser_read", description: "Read current browser page", method: "GET", status: "untested" }
  const plan = buildAgentCapabilityPlan(spec({ tools: [tool.name], capability_requirements: [need({ suggested_tool_ids: [tool.name] })] }), null, [tool], [])
  assert.equal(plan[0].state, "needs_test")
  assert.equal(plan[0].candidates[0].tested, false)
})

test("exact connection IDs stay separate when two MCP connections expose the same tool name", () => {
  const first = market(), second = market({ id: "mkt__browser00000002__browser_read", label: "另一浏览器 · 读取页面" })
  const plan = buildAgentCapabilityPlan(spec({ tools: [first.id], capability_requirements: [need({ suggested_tool_ids: [first.id] })] }), null, [], [first, second])
  assert.equal(plan[0].candidates.find(candidate => candidate.id === first.id).selected, true)
  assert.equal(plan[0].candidates.find(candidate => candidate.id === second.id)?.selected || false, false)
})

test("a global selection does not fulfill a role-scoped requirement until that role has the tool", () => {
  const tool = market()
  const base = spec({ tools: [tool.id], roles: [role("researcher"), role("reviewer", [tool.id])], capability_requirements: [need({ role_ids: ["researcher"], suggested_tool_ids: [tool.id] })] })
  assert.notEqual(buildAgentCapabilityPlan(base, null, [], [tool])[0].state, "selected")
  const granted = { ...base, roles: [role("researcher", [tool.id]), role("reviewer")] }
  assert.equal(buildAgentCapabilityPlan(granted, null, [], [tool])[0].state, "selected")
})

test("unknown or partly unbound roles cannot make a required capability complete", () => {
  const tool = market()
  const base = spec({ tools: [tool.id], roles: [role("researcher", [tool.id]), role("reviewer")], capability_requirements: [need({ role_ids: ["unknown_role"], suggested_tool_ids: [tool.id] })] })
  assert.notEqual(buildAgentCapabilityPlan(base, null, [], [tool])[0].state, "selected")
  const partial = { ...base, capability_requirements: [need({ role_ids: ["researcher", "reviewer"], suggested_tool_ids: [tool.id] })] }
  assert.notEqual(buildAgentCapabilityPlan(partial, null, [], [tool])[0].state, "selected")
})

test("legacy auto matching must not clear a send-email gap using only a read mailbox connection", () => {
  const connection = { name: "gmail_search", description: "Search and read mailbox messages", method: "GET", status: "ok" }
  const result = resolveAgentToolRequirements("发送邮件给已经确认的收件人", spec({ tools: ["邮件发送"] }), [connection])
  assert.ok(result.gaps.some(gap => gap.name === "邮件发送"), "reading a mailbox does not provide message sending")
})

test("draft save/restore retains structured requirements, exact IDs and role associations", () => {
  const tool = market()
  const original = spec({ tools: [tool.id], roles: [role("researcher", [tool.id])], capability_requirements: [need({ role_ids: ["researcher"], suggested_tool_ids: [tool.id] })] })
  const restored = sanitizeAgentDraftSpec(JSON.parse(JSON.stringify(original)))
  assert.deepEqual(restored.capability_requirements, original.capability_requirements)
  assert.deepEqual(restored.roles, original.roles)
  assert.deepEqual(restored.tools, original.tools)
})

test("binding an exact tool grants it only to the requirement's named roles", () => {
  const tool = market()
  const original = spec({ tools: ["summarize", "读取网页"], roles: [role("researcher", ["读取网页"]), role("reviewer", ["summarize"])], capability_requirements: [need({ role_ids: ["researcher"] })] })
  const bound = bindAgentCapability(original, "need_1", tool.id, null, [], [tool])
  assert.deepEqual(bound.roles[0].tools, [tool.id])
  assert.deepEqual(bound.roles[1].tools, ["summarize"])
  assert.ok(bound.tools.includes(tool.id))
  assert.ok(bound.tools.includes("summarize"))
  assert.ok(!bound.tools.includes("读取网页"))
  assert.deepEqual(original.roles[0].tools, ["读取网页"], "binding must not mutate the prior spec snapshot")
})

test("a fabricated binding request cannot mutate global or role permissions", () => {
  const original = spec({ roles: [role("researcher")], capability_requirements: [need({ role_ids: ["researcher"] })] })
  const after = bindAgentCapability(original, "need_1", "invented_tool", null, [], [market()])
  assert.deepEqual(after, original)
})

test("replacing a capability alias preserves an unrelated role's existing permission", () => {
  const tool = market()
  const original = spec({ tools: ["读取网页"], roles: [role("researcher", ["读取网页"]), role("reviewer", ["读取网页"])], capability_requirements: [need({ role_ids: ["researcher"] })] })
  const bound = bindAgentCapability(original, "need_1", tool.id, null, [], [tool])
  assert.deepEqual(bound.roles[1].tools, ["读取网页"])
  assert.ok(bound.tools.includes("读取网页"))
})

test("marketplace search uses generic capability words and catalog prompt excludes connection secrets", () => {
  assert.equal(safeMarketplaceQuery("给未公开的甲方客户准备Excel投资方案"), "spreadsheet")
  assert.equal(safeMarketplaceQuery("browser token=company-secret"), "")
  assert.equal(safeMarketplaceQuery("内部收购项目名单"), "")
  assert.equal(safeMarketplaceQuery("浏览器填写表单"), "browser")
  assert.equal(safeMarketplaceQuery("本地软件操作"), "desktop")
  const catalog = toolCatalogForDesign([{ name: "browser_read", description: "Read browser", method: "GET", status: "ok", url: "https://private.example", headers: [{ key: "Authorization", value: "secret" }] }], [])
  assert.ok(!JSON.stringify(catalog).includes("private.example"))
  assert.ok(!JSON.stringify(catalog).includes("Authorization"))
  assert.ok(!JSON.stringify(catalog).includes("secret"))
})


test("an operation named in the purpose cannot be satisfied by an unrelated browser action", () => {
  const click = market({ id: "mkt__browser00000001__browser_click", name: "browser_click", label: "浏览器点击", description: "Click a browser element", readOnly: false })
  const base = spec({ tools: [click.id], capability_requirements: [need({ title: "浏览器操作", purpose: "在已登录的页面上传本次报告附件", access: "write", suggested_tool_ids: [click.id] })] })
  assert.equal(buildAgentCapabilityPlan(base, null, [], [click])[0].state, "missing")
  const upload = market({ id: "mkt__browser00000001__browser_upload", name: "browser_upload", label: "浏览器上传", description: "Upload files through browser", readOnly: false })
  assert.equal(buildAgentCapabilityPlan({ ...base, tools: [upload.id] }, null, [], [upload])[0].state, "selected")
})

test("a newly connected integration can be explicitly mapped without regenerating its requirement", () => {
  const requirement = need({ kind: "integration", title: "发送邮件", purpose: "将已确认的结果发送至指定邮箱", access: "write", role_ids: ["sender"] })
  const original = spec({ tools: ["summarize"], roles: [role("sender"), role("reviewer", ["summarize"])], capability_requirements: [requirement] })
  assert.equal(buildAgentCapabilityPlan(original, null)[0].state, "missing")
  const connection = { name: "send_email", description: "Send email to explicitly supplied recipients", method: "POST", status: "ok" }
  const row = buildAgentCapabilityPlan(original, null, [connection])[0]
  assert.equal(row.state, "available")
  assert.equal(row.candidates[0].needsMapping, true)
  assert.equal(row.candidates[0].selected, false)
  const bound = bindAgentCapability(original, requirement.id, connection.name, null, [connection])
  assert.equal(buildAgentCapabilityPlan(bound, null, [connection])[0].state, "selected")
  assert.deepEqual(bound.capability_requirements[0].suggested_tool_ids, [connection.name])
  assert.deepEqual(bound.roles[0].tools, [connection.name])
  assert.deepEqual(bound.roles[1].tools, ["summarize"])
  assert.deepEqual(original.roles[0].tools, [], "binding must preserve the prior snapshot")
})

test("an unrelated global or role selection is not an explicit custom capability mapping", () => {
  const connection = { name: "send_email", description: "Send email messages", method: "POST", status: "ok" }
  const original = spec({ tools: [connection.name], roles: [role("sender", [connection.name])], capability_requirements: [need({ kind: "custom", title: "发送邮件", access: "write", role_ids: ["sender"] })] })
  const row = buildAgentCapabilityPlan(original, null, [connection])[0]
  assert.equal(row.state, "available", "a catalog refresh cannot silently infer a new capability binding")
  assert.equal(row.candidates[0].selected, false)
  assert.equal(buildAgentCapabilityPlan(bindAgentCapability(original, "need_1", connection.name, null, [connection]), null, [connection])[0].state, "selected")
})

test("integration mapping rejects wrong access, operation and known service domain", () => {
  const original = spec({ capability_requirements: [need({ kind: "integration", title: "发送邮件", access: "write" })] })
  const invalid = [
    { name: "read_email", description: "Read mailbox messages", method: "GET", status: "ok" },
    { name: "delete_email", description: "Delete email messages", method: "POST", status: "ok" },
    { name: "send_slack", description: "Send a Slack channel message", method: "POST", status: "ok" },
  ]
  assert.deepEqual(buildAgentCapabilityPlan(original, null, invalid)[0].candidates, [])
  for (const connection of invalid) assert.equal(bindAgentCapability(original, "need_1", connection.name, null, invalid), original)
})

test("untested and failed connections remain unready after a manual integration binding", () => {
  const original = spec({ capability_requirements: [need({ kind: "integration", title: "发送邮件", access: "write" })] })
  for (const status of ["untested", "failed", "unknown"]) {
    const connection = { name: "send_email", description: "Send email messages", method: "POST", status }
    const bound = bindAgentCapability(original, "need_1", connection.name, null, [connection])
    assert.equal(buildAgentCapabilityPlan(bound, null, [connection])[0].state, "needs_test")
  }
})

test("new MCP tools also need an exact explicit integration mapping", () => {
  const connection = market({ id: "mkt__mail00000000001__send_email", name: "send_email", label: "邮件 · 发送", description: "Send email messages", readOnly: false })
  const original = spec({ tools: [connection.id], capability_requirements: [need({ kind: "integration", title: "发送邮件", access: "write" })] })
  assert.equal(buildAgentCapabilityPlan(original, null, [], [connection])[0].state, "available")
  const bound = bindAgentCapability(original, "need_1", connection.id, null, [], [connection])
  assert.equal(buildAgentCapabilityPlan(bound, null, [], [connection])[0].state, "selected")
  assert.deepEqual(bound.capability_requirements[0].suggested_tool_ids, [connection.id])
})

const legacyResolution = {
  resolvedTools: [], safeAutoBindings: [],
  recommendations: [{ id: "web_search", label: "网络搜索" }],
  gaps: [{ name: "浏览器操作", searchTerm: "browser", reason: "读取指定页面" }],
}

test("an explicit empty or edited requirement list is authoritative over old suggestions and task text", () => {
  const empty = spec({ goal: "在浏览器里读取资料，再使用电脑软件处理", tools: ["web_search"] })
  assert.deepEqual(agentCapabilityRequirements(empty, legacyResolution), [])
  assert.deepEqual(buildAgentCapabilityPlan(empty, legacyResolution), [])
  const explicit = { ...empty, capability_requirements: [need({ required: false })] }
  assert.deepEqual(agentCapabilityRequirements(explicit, legacyResolution), explicit.capability_requirements)
  const { capability_requirements, ...legacy } = empty
  assert.ok(agentCapabilityRequirements(legacy, legacyResolution).length >= 2,
    "old saved Agents without the field still receive an inferred plan")
})

test("draft recovery preserves missing versus explicitly cleared capability requirements", () => {
  const { capability_requirements, ...legacy } = spec({ goal: "浏览器读取网页" })
  const oldRestored = sanitizeAgentDraftSpec(JSON.parse(JSON.stringify(legacy)))
  assert.equal(Object.hasOwn(oldRestored, "capability_requirements"), false)
  assert.ok(agentCapabilityRequirements(oldRestored, legacyResolution).length)
  const cleared = sanitizeAgentDraftSpec(JSON.parse(JSON.stringify({ ...legacy, capability_requirements: [] })))
  assert.equal(Object.hasOwn(cleared, "capability_requirements"), true)
  assert.deepEqual(agentCapabilityRequirements(cleared, legacyResolution), [])
})

test("deleting an inferred requirement materializes the remaining list and refresh cannot resurrect it", () => {
  const { capability_requirements, ...legacy } = spec({ goal: "用浏览器完成任务", tools: ["web_search"] })
  const originalNeeds = agentCapabilityRequirements(legacy, legacyResolution)
  const deleted = removeAgentCapability(legacy, originalNeeds[0].id, legacyResolution)
  assert.ok(deleted.removed)
  assert.deepEqual(agentCapabilityRequirements(deleted.spec, legacyResolution), originalNeeds.slice(1))
  let current = deleted.spec
  for (const requirement of current.capability_requirements) current = removeAgentCapability(current, requirement.id, legacyResolution).spec
  assert.deepEqual(agentCapabilityRequirements(current, legacyResolution), [])
  assert.deepEqual(current.tools, legacy.tools, "removing needs does not revoke tools used elsewhere")
})

test("editing fields rechecks a previous PDF binding against the new Excel export operation", () => {
  const pdf = market({ id: "mkt__pdf000000000001__pdf_read", name: "pdf_read", label: "读取 PDF", description: "Read PDF document text" })
  const original = spec({ tools: [pdf.id, "summarize"], roles: [role("writer", [pdf.id]), role("reviewer", ["summarize"])],
    capability_requirements: [need({ kind: "document", title: "读取 PDF", purpose: "提取 PDF 正文", search_terms: ["pdf"], suggested_tool_ids: [pdf.id], role_ids: ["writer"] })] })
  assert.equal(buildAgentCapabilityPlan(original, null, [], [pdf])[0].state, "selected")
  const changed = updateAgentCapability(original, "need_1", {title: "导出 Excel 报表", purpose: "生成含汇总结果的工作簿", kind: "document", access: "write", required: false})
  assert.equal(changed.capability_requirements[0].title, "导出 Excel 报表")
  assert.equal(changed.capability_requirements[0].purpose, "生成含汇总结果的工作簿")
  assert.equal(changed.capability_requirements[0].access, "write")
  assert.equal(changed.capability_requirements[0].required, false)
  assert.deepEqual(changed.capability_requirements[0].suggested_tool_ids, [])
  assert.deepEqual(changed.capability_requirements[0].search_terms, ["spreadsheet"])
  assert.deepEqual(changed.capability_requirements[0].role_ids, ["writer"])
  assert.equal(buildAgentCapabilityPlan(changed, null, [], [pdf])[0].state, "missing")
  assert.deepEqual(changed.roles, original.roles)
  assert.deepEqual(changed.tools, original.tools)
  assert.equal(original.capability_requirements[0].title, "读取 PDF", "editing keeps the prior draft snapshot immutable")
})

test("changing a mapped integration's purpose requires a fresh explicit mapping without revoking existing grants", () => {
  const connection = {name: "send_email", description: "Send email messages", method: "POST", status: "ok"}
  const original = spec({tools: [connection.name], roles: [role("sender", [connection.name])],
    capability_requirements: [need({kind: "integration", title: "发送邮件", purpose: "发送汇总", access: "write", role_ids: ["sender"], suggested_tool_ids: [connection.name]})]})
  const changed = updateAgentCapability(original, "need_1", {purpose: "发送经人工确认的完整报告"})
  assert.equal(buildAgentCapabilityPlan(changed, null, [connection])[0].state, "available")
  assert.deepEqual(changed.tools, original.tools)
  assert.deepEqual(changed.roles, original.roles)
  const remapped = bindAgentCapability(changed, "need_1", connection.name, null, [connection])
  assert.equal(buildAgentCapabilityPlan(remapped, null, [connection])[0].state, "selected")
})

test("required versus optional edits change the readiness gate without altering a tool mapping", () => {
  const original = spec({capability_requirements: [need({suggested_tool_ids: [market().id]})]})
  assert.equal(agentCapabilityReadiness(original, null).length, 1)
  const optional = updateAgentCapability(original, "need_1", {required: false})
  assert.deepEqual(agentCapabilityReadiness(optional, null), [])
  assert.deepEqual(optional.capability_requirements[0].suggested_tool_ids, original.capability_requirements[0].suggested_tool_ids)
  assert.equal(agentCapabilityReadiness(updateAgentCapability(optional, "need_1", {required: true}), null).length, 1)
  assert.equal(updateAgentCapability(original, "need_1", {title: "  "}), original, "blank input must not silently delete a requirement")
})

test("adding capabilities is bounded, rejects duplicates, and grants no suggested permissions", () => {
  const original = spec({tools: ["summarize"], roles: [role("researcher"), role("reviewer", ["summarize"])]})
  const added = addAgentCapability(original, need({role_ids: ["researcher", "invented_role"], suggested_tool_ids: [market().id]}))
  assert.deepEqual(added.capability_requirements[0].role_ids, ["researcher"])
  assert.deepEqual(added.capability_requirements[0].suggested_tool_ids, [])
  assert.deepEqual(added.tools, original.tools)
  assert.deepEqual(added.roles, original.roles)
  assert.equal(addAgentCapability(added, need()), added)
  let current = original
  for (let i = 0; i < MAX_AGENT_CAPABILITIES; i++) current = addAgentCapability(current, need({id: `capability_${i}`}))
  assert.equal(current.capability_requirements.length, MAX_AGENT_CAPABILITIES)
  assert.equal(addAgentCapability(current, need({id: "one_too_many"})), current)
})

test("delete and undo retain shared permissions, later edits and requirement order", () => {
  const tool = market()
  const original = spec({tools: [tool.id, "summarize"], roles: [role("researcher", [tool.id]), role("reviewer", ["summarize"])],
    capability_requirements: [need({id: "first"}), need({id: "second", title: "第二项", role_ids: ["researcher"], suggested_tool_ids: [tool.id]}), need({id: "third", title: "第三项"})]})
  const deleted = removeAgentCapability(original, "second")
  assert.deepEqual(deleted.spec.tools, original.tools)
  assert.deepEqual(deleted.spec.roles, original.roles)
  const later = {...updateAgentCapability(deleted.spec, "third", {required: false}), goal: "新的任务目标", tools: [...deleted.spec.tools, "calculate"]}
  const restored = restoreAgentCapability(later, deleted.removed)
  assert.deepEqual(restored.capability_requirements.map(row => row.id), ["first", "second", "third"])
  assert.deepEqual(restored.capability_requirements[1], original.capability_requirements[1])
  assert.equal(restored.capability_requirements[2].required, false)
  assert.equal(restored.goal, "新的任务目标")
  assert.deepEqual(restored.tools, later.tools)
  assert.deepEqual(restored.roles, later.roles)
  assert.equal(restoreAgentCapability(restored, deleted.removed), restored, "repeated undo cannot duplicate or overwrite a current requirement")
})

test("undo does not restore deleted roles or grant their former permissions", () => {
  const original = spec({tools: [market().id], roles: [role("researcher", [market().id]), role("reviewer")], capability_requirements: [need({role_ids: ["researcher"]})]})
  const deleted = removeAgentCapability(original, "need_1")
  const later = {...deleted.spec, roles: [role("reviewer")], tools: []}
  const restored = restoreAgentCapability(later, deleted.removed)
  assert.deepEqual(restored.capability_requirements[0].role_ids, [])
  assert.deepEqual(restored.roles, later.roles)
  assert.deepEqual(restored.tools, [])
  const full = {...later, capability_requirements: Array.from({length: MAX_AGENT_CAPABILITIES}, (_, i) => need({id: `existing_${i}`}))}
  assert.equal(restoreAgentCapability(full, deleted.removed), full)
})

test("a role-less requirement guides role selection before exact tool assignment", () => {
  const tool = market()
  const original = spec({roles: [role("researcher"), role("reviewer")], capability_requirements: [need()]})
  const initial = buildAgentCapabilityPlan(original, null, [], [tool])[0]
  assert.equal(initial.state, "needs_role")
  assert.equal(initial.candidates.length, 1, "existing tools remain visible instead of sending the employee to the market")
  assert.match(agentCapabilityReadiness(original, null, [], [tool])[0], /负责角色/)
  assert.equal(bindAgentCapability(original, "need_1", tool.id, null, [], [tool]), original,
    "a blocked role-less choice cannot silently broaden global permission")
  const assigned = updateAgentCapability(original, "need_1", {role_ids: ["researcher"]})
  assert.deepEqual(assigned.tools, [])
  assert.deepEqual(assigned.roles.map(row => row.tools), [[], []], "choosing a responsible role is not tool authorization")
  assert.equal(buildAgentCapabilityPlan(assigned, null, [], [tool])[0].state, "available")
  const bound = bindAgentCapability(assigned, "need_1", tool.id, null, [], [tool])
  assert.equal(buildAgentCapabilityPlan(bound, null, [], [tool])[0].state, "selected")
  assert.deepEqual(bound.roles.map(row => row.tools), [[tool.id], []])
})

test("an already authorized role can fulfill an unscoped legacy requirement without granting other roles", () => {
  const tool = market()
  const original = spec({tools: [tool.id], roles: [role("researcher", [tool.id]), role("reviewer")], capability_requirements: [need()]})
  const row = buildAgentCapabilityPlan(original, null, [], [tool])[0]
  assert.equal(row.state, "selected")
  assert.equal(row.candidates[0].roleAssigned, true)
  assert.deepEqual(original.roles[1].tools, [])
})

test("moving responsibility does not transfer authorization until the employee assigns the tool", () => {
  const tool = market()
  const original = spec({tools: [tool.id], roles: [role("researcher", [tool.id]), role("reviewer")], capability_requirements: [need({role_ids: ["researcher"], suggested_tool_ids: [tool.id]})]})
  const moved = updateAgentCapability(original, "need_1", {role_ids: ["reviewer"]})
  assert.deepEqual(moved.roles, original.roles)
  assert.equal(buildAgentCapabilityPlan(moved, null, [], [tool])[0].state, "needs_role")
  const bound = bindAgentCapability(moved, "need_1", tool.id, null, [], [tool])
  assert.equal(buildAgentCapabilityPlan(bound, null, [], [tool])[0].state, "selected")
  assert.deepEqual(bound.roles[0].tools, [tool.id], "the earlier role may still need the tool for another task")
  assert.deepEqual(bound.roles[1].tools, [tool.id])
})

test("role assignment cannot turn an unknown or untested connection into a ready capability", () => {
  const tool = {name: "browser_read", description: "Read browser page", method: "GET", status: "unknown"}
  const original = spec({roles: [role("researcher")], capability_requirements: [need()]})
  assert.equal(buildAgentCapabilityPlan(original, null, [tool])[0].state, "needs_role")
  const assigned = updateAgentCapability(original, "need_1", {role_ids: ["researcher"]})
  const bound = bindAgentCapability(assigned, "need_1", tool.name, null, [tool])
  assert.equal(buildAgentCapabilityPlan(bound, null, [tool])[0].state, "needs_test")
  assert.equal(buildAgentCapabilityPlan(bound, null, [{...tool, status: "ok"}])[0].state, "selected")
  const stale = {...bound, capability_requirements: [need({role_ids: ["missing_role"], suggested_tool_ids: [tool.name]})]}
  assert.equal(buildAgentCapabilityPlan(stale, null, [{...tool, status: "ok"}])[0].state, "needs_role")
  assert.equal(bindAgentCapability(stale, "need_1", tool.name, null, [tool]), stale)
})

test("editing a private task publishes only generic marketplace category words", () => {
  const original = spec({capability_requirements: [need({search_terms: ["pdf"], suggested_tool_ids: ["old_tool"]})]})
  const changed = updateAgentCapability(original, "need_1", {kind: "document", title: "为未公开收购项目导出Excel", purpose: "整理客户私有投资数据", access: "write"})
  assert.deepEqual(changed.capability_requirements[0].search_terms, ["spreadsheet"])
  assert.equal(buildAgentCapabilityPlan(changed, null)[0].searchTerm, "spreadsheet")
  assert.deepEqual(changed.capability_requirements[0].suggested_tool_ids, [])
  const secret = updateAgentCapability(changed, "need_1", {kind: "custom", title: "内部专项报告 token=do-not-send", purpose: "公司私有信息"})
  assert.deepEqual(secret.capability_requirements[0].search_terms, [])
  assert.equal(buildAgentCapabilityPlan(secret, null)[0].searchTerm, "")
})
