import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeCapabilityRequirements, buildAgentCapabilityPlan, toolCatalogForDesign, bindAgentCapability,
} from "../src/lib/agentCapabilityPlan.ts"
import { resolveAgentToolRequirements } from "../src/lib/agentToolMatcher.ts"
import { sanitizeAgentDraftSpec } from "../src/lib/agentEditorDraft.ts"
import { safeMarketplaceQuery } from "../src/lib/toolSearchPrivacy.ts"

const need = (patch = {}) => ({ id: "need_1", title: "读取网页", purpose: "取得任务所需的信息", kind: "browser", access: "read", required: true, role_ids: [], search_terms: ["browser"], suggested_tool_ids: [], ...patch })
const spec = (patch = {}) => ({ goal: "完成指定任务", task_scope: "按当前任务范围工作", deliverables: ["可核验的结果"], tools: [], task_plan: [], done_criteria: ["交付满足任务要求"], capability_requirements: [], ...patch })
const market = (patch = {}) => ({ id: "mkt__browser00000001__browser_read", name: "browser_read", label: "浏览器 · 读取页面", description: "Read the current browser page", connectionTitle: "Browser", readOnly: true, destructive: false, ...patch })
const role = (id, tools = []) => ({ id, name: id, responsibility: "负责所分配任务", tasks: ["完成任务"], inputs: [], deliverables: ["输出"], depends_on: [], tools, done_criteria: ["核验输出"] })

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
