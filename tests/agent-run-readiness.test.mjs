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
const marketConnection = (patch = {}) => ({ id: "browser00000001", title: "Browser", enabled: true,
  last_probe_status: "ok", tool_count: 1, tools: [{ name: "browser_read", description: "Read current browser page", read_only: true }], ...patch })

test("legacy single assistants remain runnable without new mandatory semantic checks", () => {
  assert.equal(agentRunReadiness(spec()).ready, true)
  assert.equal(agentRunReadiness(spec({ done_criteria: ["给出优质、准确、有说服力的内容"] })).ready, true)
  assert.equal(agentRunReadiness(null).ready, false)
})

test("invalid or unchecked role Skills block a NEW run, but do not mutate its spec",()=>{
  const configuration=spec({roles:[{...role("researcher"),skill_refs:[
    {id:"skillabc1234567",version:1,hash:"a".repeat(64)}]}]})
  assert.equal(agentRunReadiness(configuration,{skillIssues:["正在核验角色 Skill 版本"]}).ready,false)
  const failed=agentRunReadiness(configuration,{skillIssues:["Skill 已被停用或未审核"]})
  assert.equal(failed.ready,false)
  assert.match(failed.issues[0],/停用/)
  assert.equal(agentRunReadiness(configuration,{skillIssues:[]}).ready,true)
  assert.equal(configuration.roles[0].skill_refs.length,1)
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
