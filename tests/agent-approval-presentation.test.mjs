import test from "node:test"
import assert from "node:assert/strict"
import { projectAgentApprovalPresentation } from "../src/lib/agentApprovalPresentation.ts"

const role = (id, name, tools, depends_on = []) => ({
  id, name, tools, depends_on, responsibility: "本阶段职责", tasks: ["完成本阶段工作"],
  inputs: [], deliverables: ["阶段交付"], done_criteria: ["交付需要核验"],
})
const marketTool = (id, overrides = {}) => ({
  id, name: "browser_page_inspect", label: "本地验证浏览器 · 页面读取",
  connectionTitle: "本地验证浏览器", description: "只读取用户许可的网页",
  readOnly: true, destructive: false, ...overrides,
})
const browserTool = "mkt__browser00000001__browser_page_inspect"
const writeTool = "mkt__mail00000000001__send_email"
const makeRun = (active = "researcher", tools = [browserTool]) => ({
  spec_snapshot: { goal: "测试", task_scope: "隔离", tools: [browserTool, writeTool],
    task_plan: ["研究", "发出"], deliverables: ["报告"], done_criteria: ["审核"],
    roles: [role("researcher", "网页研究", tools), role("sender", "邮件交付", [writeTool], ["researcher"])] },
  checkpoint: { role_state: { version: 1, completed: [],
    outputs: {}, active_role_id: active, started_role_id: active } },
})

test("approval shows the persisted role, stage and exact connected read-only tool", () => {
  const view = projectAgentApprovalPresentation(browserTool, makeRun(), [marketTool(browserTool)])
  assert.equal(view.approvalTitle, "将调用市场插件，需要你确认")
  assert.equal(view.roleLabel, "网页研究 · 第 1 / 2 阶段")
  assert.equal(view.nextRoleName, "邮件交付")
  assert.equal(view.toolLabel, "本地验证浏览器 · 页面读取")
  assert.match(view.toolAccess, /声明只读.*逐次审批/)
  assert.equal(view.warning, "")
})

test("an ordinary external tool is not mislabeled as a write operation without evidence", () => {
  const id = "browser_page_inspect"
  const view = projectAgentApprovalPresentation(id, makeRun("researcher", [id]), [])
  assert.equal(view.approvalTitle, "将调用外部工具，需要你确认")
  assert.doesNotMatch(view.approvalTitle, /写操作/)
  assert.match(view.toolAccess, /读写权限以服务端策略为准/)
})

test("an exact write-capable connection is not presented as read-only", () => {
  const run = makeRun("sender")
  run.checkpoint.role_state.completed = ["researcher"]
  run.checkpoint.role_state.outputs = { researcher: "已核验的研究证据" }
  const view = projectAgentApprovalPresentation(writeTool, run, [
    marketTool(writeTool, { label: "测试邮件 · 发送", connectionTitle: "邮件服务",
      readOnly: false, destructive: false }),
  ])
  assert.equal(view.roleLabel, "邮件交付 · 第 2 / 2 阶段")
  assert.match(view.toolAccess, /可能操作或写入/)
  assert.equal(view.nextRoleName, "")
})

test("a missing catalog cannot silently borrow the rights or friendly name of a similarly named tool", () => {
  const absent = projectAgentApprovalPresentation(browserTool, makeRun(), [
    marketTool("mkt__other000000001__browser_page_inspect"),
  ])
  assert.equal(absent.toolLabel, browserTool)
  assert.match(absent.toolAccess, /未能核验/)
  assert.match(absent.toolSource, /待核验/)
})

test("corrupt or absent checkpoint does not invent a role or progress stage", () => {
  const run = makeRun()
  run.checkpoint.role_state.version = 91
  const view = projectAgentApprovalPresentation(browserTool, run, [marketTool(browserTool)])
  assert.equal(view.roleLabel, "")
  assert.equal(view.nextRoleName, "")
  assert.equal(projectAgentApprovalPresentation(browserTool, null, []).roleLabel, "")
})

test("a role/tool mismatch is explained but does not silently grant permission", () => {
  const run = makeRun("researcher", [])
  const before = JSON.stringify(run)
  const view = projectAgentApprovalPresentation(browserTool, run, [marketTool(browserTool)])
  assert.match(view.warning, /不包含此工具/)
  assert.equal(JSON.stringify(run), before)
})

test("destructive declaration stays visible and never mislabels the connection safe", () => {
  const tool = marketTool(browserTool, { readOnly: true, destructive: true })
  assert.match(projectAgentApprovalPresentation(browserTool, makeRun(), [tool]).toolAccess, /破坏性操作/)
})
