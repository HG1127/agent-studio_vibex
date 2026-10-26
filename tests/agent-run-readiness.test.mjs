import test from "node:test"
import assert from "node:assert/strict"
import { agentRunReadiness, enabledRunToolConnections } from "../src/lib/agentRunReadiness.ts"
import { getVerifiedMarketTools } from "../src/lib/marketToolSelection.ts"

const need = (patch = {}) => ({ id: "browser_need", title: "读取浏览器页面", purpose: "获取页面内容",
  kind: "browser", access: "read", required: true, role_ids: [], search_terms: ["browser"], suggested_tool_ids: [], ...patch })
const spec = (patch = {}) => ({ goal: "完成任务", task_scope: "指定范围", deliverables: ["报告"],
  tools: [], task_plan: ["整理资料"], done_criteria: ["结论准确"], capability_requirements: [], ...patch })
const role = (id, tools = []) => ({ id, name: id, responsibility: "完成分配任务", tasks: ["处理输入"],
  inputs: [], deliverables: ["成果"], depends_on: [], tools, done_criteria: ["说明不足"] })
const http = (patch = {}) => ({ name: "browser_read", description: "Read current browser page", enabled: true,
  method: "GET", status: "ok", ...patch })
const savedBrowserSpec = (patch = {}) => spec({ tools: ["browser_read"], capability_requirements: [need()], ...patch })
const localDevice = (tools, patch = {}) => ({id: 'local-device', revoked: false, seen_ms: Date.now(),
  catalog: JSON.stringify(tools.map(name => ({name}))), ...patch})
const browserTools = ['browser.browser_navigate', 'browser.browser_snapshot', 'browser.browser_take_screenshot', 'browser.browser_click', 'browser.browser_type']

test('an explicitly selected live device satisfies browser needs without changing the saved contract', () => {
  const value = spec({capability_requirements: [need({access: 'write'})]})
  const before = JSON.stringify(value)
  assert.equal(agentRunReadiness(value).ready, false)
  assert.equal(agentRunReadiness(value, {localDevice: localDevice(browserTools)}).ready, true)
  assert.equal(JSON.stringify(value), before)
  for (const patch of [{revoked:true}, {seen_ms:Date.now()-46000}, {catalog:'{}'}, {catalog:'bad'}])
    assert.equal(agentRunReadiness(value, {localDevice: localDevice(browserTools,patch)}).ready, false)
  assert.equal(agentRunReadiness(value, {localDevice:localDevice(browserTools.slice(0,3))}).ready,false)
  assert.equal(agentRunReadiness(value, {localDevice:localDevice(browserTools),disabledToolIds:['local_computer']}).ready,false)
})

test('local devices do not satisfy missing network capabilities or grant tools to roles', () => {
  assert.equal(agentRunReadiness(spec({capability_requirements:[need({kind:'web_search'})]}),{localDevice:localDevice(browserTools)}).ready,false)
  const value = spec({roles:[role('worker')],capability_requirements:[need({role_ids:['worker']})]})
  assert.equal(agentRunReadiness(value,{localDevice:localDevice(browserTools)}).ready,false)
  const granted = {...value,tools:['local_computer'],roles:[role('worker',['local_computer'])]}
  assert.equal(agentRunReadiness(granted,{localDevice:localDevice(browserTools)}).ready,true)
})

test('file/application and native desktop requirements require their actual device tools', () => {
  const fileSpec = spec({capability_requirements:[need({kind:'desktop',title:'本机文件操作与应用启动',purpose:'新建并回读文件，然后启动固定程序',access:'write'})]})
  const tools = ['files.list','files.read','files.write','apps.launch']
  assert.equal(agentRunReadiness(fileSpec,{localDevice:localDevice(tools)}).ready,true)
  assert.equal(agentRunReadiness(fileSpec,{localDevice:localDevice(tools.slice(0,3))}).ready,false)
  const desktopSpec = spec({capability_requirements:[need({kind:'desktop',title:'桌面截图输入和点击',access:'write'})]})
  assert.equal(agentRunReadiness(desktopSpec,{localDevice:localDevice(tools)}).ready,false)
  assert.equal(agentRunReadiness(desktopSpec,{localDevice:localDevice(['desktop.Screenshot','desktop.Click','desktop.Type'])}).ready,true)
})
const marketConnection = (patch = {}) => ({ id: "browser00000001", title: "Browser", enabled: true,
  last_probe_status: "ok", tool_count: 1, tools: [{ name: "browser_read", description: "Read current browser page", read_only: true }], ...patch })

test("legacy single assistants remain runnable without new mandatory semantic checks", () => {
  assert.equal(agentRunReadiness(spec()).ready, true)
  assert.equal(agentRunReadiness(spec({ done_criteria: ["给出优质、准确、有说服力的内容"] })).ready, true)
  assert.equal(agentRunReadiness(null).ready, false)
})

test("a direct run of a saved spec cannot bypass an explicit required browser gap", () => {
  const result = agentRunReadiness(savedBrowserSpec())
  assert.equal(result.ready, false)
  assert.deepEqual(result.roleIssues, [])
  assert.match(result.capabilityIssues[0], /读取浏览器页面.*请连接工具/)
})

test("optional capabilities do not block a new run", () => {
  const result = agentRunReadiness(spec({ capability_requirements: [need({ required: false })] }))
  assert.equal(result.ready, true)
  assert.deepEqual(result.issues, [])
})

test("HTTP availability preserves enabled state, method and test status without credentials", () => {
  const result = enabledRunToolConnections([http({ headers: [{ key: "Authorization", value: "secret" }], url: "https://private.example" }),
    http({ name: "disabled", enabled: false }), http({ name: "string_flag", enabled: "true" }), null])
  assert.deepEqual(result, [{ name: "browser_read", description: "Read current browser page", method: "GET", status: "ok" }])
  assert.equal(agentRunReadiness(savedBrowserSpec(), { connections: result }).ready, true)
})

test("an enabled but untested or failed HTTP connection cannot satisfy a required capability", () => {
  for (const status of ["untested", "error", undefined]) {
    const connections = enabledRunToolConnections([http({ status })])
    const result = agentRunReadiness(savedBrowserSpec(), { connections })
    assert.equal(result.ready, false)
    assert.match(result.capabilityIssues[0], /请先测试连接/)
  }
  assert.equal(agentRunReadiness(savedBrowserSpec(), { connections: enabledRunToolConnections(null) }).ready, false)
})

test("a tested read-only connection cannot satisfy an external write requirement", () => {
  const value = savedBrowserSpec({ capability_requirements: [need({ title: "点击浏览器按钮", access: "write" })] })
  assert.equal(agentRunReadiness(value, { connections: enabledRunToolConnections([http()]) }).ready, false)
})

test("a global tool grant alone does not satisfy the role that must perform the task", () => {
  const connections = enabledRunToolConnections([http()])
  const value = savedBrowserSpec({ roles: [role("researcher"), role("reviewer", ["browser_read"])],
    capability_requirements: [need({ role_ids: ["researcher"] })] })
  assert.equal(agentRunReadiness(value, { connections }).ready, false)
  const assigned = { ...value, roles: [role("researcher", ["browser_read"]), role("reviewer")] }
  assert.equal(agentRunReadiness(assigned, { connections }).ready, true)
  assert.deepEqual(value.roles[0].tools, [], "preflight must never grant a tool to a role")
})

test("roles outside global authorization and malformed role contracts block safely", () => {
  const result = agentRunReadiness(spec({ roles: [role("writer", ["send_mail"])] }))
  assert.equal(result.ready, false)
  assert.match(result.roleIssues[0], /工具尚未加入方案.*send_mail/)
  const malformed = agentRunReadiness(spec({ roles: [{ id: "broken" }] }))
  assert.equal(malformed.ready, false)
  assert.ok(malformed.roleIssues.length > 0)
})

test("disabling a required builtin for this trial blocks without changing the saved spec", () => {
  const value = spec({ tools: ["calculate"], capability_requirements: [need({ title: "数值计算", kind: "calculate" })] })
  assert.equal(agentRunReadiness(value).ready, true)
  assert.equal(agentRunReadiness(value, { disabledToolIds: ["calculate"] }).ready, false)
  assert.deepEqual(value.tools, ["calculate"])
})

test("only currently verified market connections can satisfy the saved exact tool selection", () => {
  const marketTools = getVerifiedMarketTools([marketConnection()])
  const value = savedBrowserSpec({ tools: [marketTools[0].id] })
  assert.equal(agentRunReadiness(value, { marketTools }).ready, true)
  for (const unavailable of [{ enabled: false }, { last_probe_status: "error" }, { tools: [], tool_count: 0 }]) {
    assert.equal(agentRunReadiness(value, { marketTools: getVerifiedMarketTools([marketConnection(unavailable)]) }).ready, false)
  }
  assert.equal(agentRunReadiness(value, { marketTools: [] }).ready, false, "a failed refresh cannot reuse a prior verified tool")
})
