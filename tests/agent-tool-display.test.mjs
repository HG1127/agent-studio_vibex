import test from "node:test"
import assert from "node:assert/strict"
import { agentToolDisplay } from "../src/lib/agentToolDisplay.ts"

const market = (connection, patch = {}) => ({ id: `mkt__${connection}__browser_read`, name: "browser_read",
  label: `${connection} · 读取浏览器`, description: "读取当前页面", connectionTitle: connection,
  readOnly: true, destructive: false, ...patch })

test("builtin tools use the same human label and description as the global catalog", () => {
  const result = agentToolDisplay("calculate", { builtinTools: [{ id: "calculate", title: "计算器", desc: "计算表达式" }] })
  assert.equal(result.label, "计算器")
  assert.equal(result.description, "计算表达式")
  assert.equal(result.id, "calculate")
  assert.equal(result.sourceLabel, "内置工具")
})

test("same-name market tools retain the exact connection's label and permissions", () => {
  const first = market("browser00000001")
  const second = market("browser00000002", { label: "工作浏览器 · 页面操作", readOnly: false })
  const catalog = { connectedMarketTools: [first, second] }
  assert.equal(agentToolDisplay(first.id, catalog).accessLabel, "只读")
  assert.equal(agentToolDisplay(second.id, catalog).label, "工作浏览器 · 页面操作")
  assert.equal(agentToolDisplay(second.id, catalog).accessLabel, "可能写入")
})

test("destructive or unannotated market tools are never presented as read-only", () => {
  const destructive = market("browser00000001", { readOnly: true, destructive: true })
  assert.equal(agentToolDisplay(destructive.id, { connectedMarketTools: [destructive] }).accessLabel, "含破坏性操作")
  const unannotated = market("browser00000002", { readOnly: false })
  assert.equal(agentToolDisplay(unannotated.id, { connectedMarketTools: [unannotated] }).accessLabel, "可能写入")
})

test("HTTP access follows actual method metadata and does not guess from a tool name", () => {
  const connection = { name: "read_report", description: "报告服务", method: "POST", status: "ok" }
  assert.equal(agentToolDisplay(connection.name, { connectedTools: [connection] }).accessLabel, "操作 / 写入")
  assert.equal(agentToolDisplay(connection.name, { connectedTools: [{ ...connection, method: "get" }] }).accessLabel, "只读")
  assert.equal(agentToolDisplay(connection.name, { connectedTools: [{ ...connection, method: undefined }] }).accessLabel, "读写类型未确认")
})

test("missing market connections never borrow a same-name tool's identity or access", () => {
  const savedId = "mkt__browser00000001__browser_read"
  const result = agentToolDisplay(savedId, { connectedMarketTools: [market("browser00000002")] })
  assert.equal(result.id, savedId)
  assert.equal(result.label, "browser_read")
  assert.equal(result.sourceLabel, "连接待核验")
  assert.equal(result.accessLabel, "读写类型未确认")
})

test("display projection excludes connection URLs and authentication headers", () => {
  const result = agentToolDisplay("report", { connectedTools: [{ name: "report", description: "报告服务",
    method: "GET", url: "https://private.example", headers: [{ key: "Authorization", value: "secret" }] }] })
  assert.ok(!JSON.stringify(result).includes("private.example"))
  assert.ok(!JSON.stringify(result).includes("Authorization"))
  assert.ok(!JSON.stringify(result).includes("secret"))
})
