import test from "node:test"
import assert from "node:assert/strict"
import {
  classifyExecutionCapability, collectExecutionCapabilities, executionConnectionPreset,
  EXECUTION_CONNECTION_PRESETS, formatExecutionCheckTime,
} from "../src/lib/executionCapabilities.ts"
import { inspectToolRequest } from "../src/lib/toolConnectionUx.ts"

const http = (patch = {}) => ({ id: "browser00000001", name: "browser_read_page", description: "Read page via browser executor", enabled: true, status: "ok", method: "POST", last_checked_at: "2026-10-21T10:00:00Z", ...patch })
const mcp = (patch = {}) => ({ id: "market000000001", title: "Browser service", enabled: true, last_probe_status: "ok", tool_count: 1, tools: [{ name: "browser_navigate", description: "Open a page" }], ...patch })

test("HTTP successful test and MCP discovery remain different evidence", () => {
  const [api, plugin] = collectExecutionCapabilities([http()], [mcp()])
  assert.equal(api.state, "tested")
  assert.equal(api.stateLabel, "最近测试通过")
  assert.equal(plugin.state, "discovered")
  assert.equal(plugin.stateLabel, "工具发现通过")
  assert.equal(plugin.checkedAt, "")
  assert.ok(plugin.detail.includes("不能据此判断电脑在线"))
  assert.equal(api.kind, "browser")
})

test("disabled, failed, untested and unknown connections cannot become usable", () => {
  assert.equal(collectExecutionCapabilities([http({ enabled: false })], [])[0].state, "disabled")
  assert.equal(collectExecutionCapabilities([http({ status: "error" })], [])[0].state, "failed")
  assert.equal(collectExecutionCapabilities([http({ status: "untested" })], [])[0].state, "untested")
  assert.equal(collectExecutionCapabilities([http({ enabled: undefined })], [])[0].state, "untested")
  assert.equal(collectExecutionCapabilities([], [mcp({ tools: [] })])[0].state, "untested")
  assert.equal(collectExecutionCapabilities([], [mcp({ tool_count: 0 })])[0].state, "untested")
})

test("capability classification does not mistake ordinary cloud spreadsheets for desktop access", () => {
  assert.equal(classifyExecutionCapability("spreadsheet_search", "Read cloud spreadsheet cells"), "api")
  assert.equal(classifyExecutionCapability("desktop_document_export", "本地软件处理文件"), "desktop")
  assert.equal(classifyExecutionCapability("playwright_click", "点击网页元素"), "browser")
  assert.equal(classifyExecutionCapability("weather", "City weather"), "api")
})

test("inventory handles malformed providers, duplicates and never projects endpoints or credentials", () => {
  assert.deepEqual(collectExecutionCapabilities(null, {}), [])
  const rows = collectExecutionCapabilities([null, false, {}, http({ url: "https://secret.example/credentials", headers: [{ key: "Authorization", value: "private-key" }] }), http()], [mcp(), mcp(), [mcp()]])
  assert.equal(rows.length, 2)
  assert.ok(!JSON.stringify(rows).includes("secret.example"))
  assert.ok(!JSON.stringify(rows).includes("private-key"))
  assert.equal(collectExecutionCapabilities([], [mcp({ tools: [null, false, {}, { name: "browser_read", description: "Read" }] })])[0].toolNames.length, 1)
})

test("only explicit preset identifiers can initialize a connection form", () => {
  assert.equal(executionConnectionPreset("browser-read")?.name, "browser_read_page")
  assert.equal(executionConnectionPreset("https://attacker.example/?token=secret"), undefined)
  assert.equal(executionConnectionPreset("__proto__"), undefined)
  assert.equal(executionConnectionPreset({ id: "browser-read" }), undefined)
})

test("adapter templates have parseable examples and no fabricated endpoint or authorization", () => {
  for (const preset of EXECUTION_CONNECTION_PRESETS) {
    assert.equal(preset.method, "POST")
    assert.equal(preset.bodyTemplate, "{{input}}")
    assert.ok(JSON.parse(preset.exampleInput))
    assert.equal("url" in preset, false)
    assert.equal("headers" in preset, false)
    const preview = inspectToolRequest({ url: "https://operator.example/action", method: preset.method, input: preset.exampleInput, bodyTemplate: preset.bodyTemplate, timeout: "15" })
    assert.deepEqual(preview.errors, [])
    assert.ok(inspectToolRequest({ url: "", method: preset.method, input: preset.exampleInput, bodyTemplate: preset.bodyTemplate }).errors.length > 0)
  }
})

test("absent or invalid timestamps do not invent a last-seen time", () => {
  assert.equal(formatExecutionCheckTime(""), "检测时间未提供")
  assert.equal(formatExecutionCheckTime("nonsense"), "检测时间无法识别")
})
