import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { clearOrphanedCapabilityRoles, createRoleStages, orphanedCapabilityRoles, replaceAgentRoles,
  restoreAgentRoles, sanitizeAgentRoles, validateAgentRoles } from "../src/lib/agentRoles.ts"
import { agentCapabilityReadiness } from "../src/lib/agentCapabilityPlan.ts"

const context = { module: { exports: {} } }
vm.runInNewContext(fs.readFileSync("pocketbase/pb_hooks/modules/agent_roles.js", "utf8"), context)
const backend = context.module.exports
const plain = value => JSON.parse(JSON.stringify(value))
const spec = { goal: "研究并交付", task_scope: "公开资料", tools: ["web_search", "calculate"],
  task_plan: ["收集资料", "整理事实", "分析证据", "形成报告"], deliverables: ["有来源的报告"], done_criteria: ["列出不确定事项"] }
const role = (id, deps = [], tools = []) => ({ id, name: id, responsibility: "完成负责的阶段",
  tasks: ["处理输入"], inputs: ["任务"], deliverables: ["阶段成果"], done_criteria: ["涵盖范围"], depends_on: deps, tools })
const calculationNeed = (role_ids = []) => ({ id: "calculation", title: "数值计算", purpose: "核算数据",
  kind: "calculate", access: "read", required: true, role_ids, search_terms: [], suggested_tool_ids: ["calculate"] })

test("a single assistant remains backward compatible", () => {
  assert.equal(backend.validatePlan(undefined, []).valid, true)
  assert.deepEqual(validateAgentRoles([], []), { valid: true, errors: [], orderedRoles: [] })
})
test("editable three-stage scaffold derives from actual saved plan", () => {
  const stages = createRoleStages(spec)
  assert.equal(stages.length, 3)
  assert.deepEqual(stages[0].tasks.concat(stages[1].tasks), spec.task_plan)
  assert.ok(stages.every(stage => stage.tools.length === 0), "a role scaffold never inherits executable tools silently")
  assert.equal(validateAgentRoles(stages, spec.tools).valid, true)
  assert.equal(backend.validatePlan(stages, spec.tools).valid, true)
})
test("stable dependency sorting resolves future references without fake parallelism", () => {
  const roles = [role("review", ["work"]), role("work", ["research"]), role("research")]
  const expected = ["research", "work", "review"]
  assert.deepEqual(validateAgentRoles(roles, []).orderedRoles.map(r => r.id), expected)
  assert.deepEqual(plain(backend.validatePlan(roles, []).orderedRoles.map(r => r.id)), expected)
})
test("self-dependency, missing dependency, duplicate IDs, and cycles all block trial", () => {
  const invalid = [[role("a", ["a"])], [role("a", ["missing"])], [role("a"), role("a")],
    [role("a", ["b"]), role("b", ["a"])]]
  for (const roles of invalid) {
    assert.equal(validateAgentRoles(roles, []).valid, false)
    assert.equal(backend.validatePlan(roles, []).valid, false)
  }
})
test("role-specific tools narrow the spec and never grant an unselected connector", () => {
  const roles = [role("writer", [], ["send_mail"])]
  assert.equal(validateAgentRoles(roles, ["web_search"]).valid, false)
  assert.equal(backend.validatePlan(roles, ["web_search"]).valid, false)
  assert.equal(backend.mayUseTool(roles[0], "web_search"), false)
  assert.equal(backend.mayUseTool(roles[0], "send_mail"), true)
  assert.equal(backend.mayUseTool(role("review"), "send_mail"), false)
})
test("missing task, outcome, and acceptance criteria are visible preflight failures", () => {
  for (const field of ["tasks", "deliverables", "done_criteria"]) {
    const value = { ...role("draft"), [field]: ["   "] }
    assert.equal(validateAgentRoles([value], []).valid, false)
    assert.equal(backend.validatePlan([value], []).valid, false)
  }
})
test("bounded shape guard rejects malformed or excessive roles", () => {
  assert.ok(backend.shapeErrors({ id: "x" }).length)
  assert.ok(backend.shapeErrors(Array.from({ length: 9 }, (_, i) => role("r" + i))).length)
  assert.ok(backend.shapeErrors([{ ...role("x"), tools: [false] }]).length)
  assert.ok(backend.shapeErrors([{ ...role("x"), id: "__proto__" }]).length)
  assert.equal(validateAgentRoles([{ ...role("x"), name: 42 }], []).valid, false)
  assert.equal(validateAgentRoles([{ ...role("x"), responsibility: {} }], []).valid, false)
})
test("only the current stage can submit a nonempty, bounded handoff", () => {
  const roles = [role("research"), role("review", ["research"])]
  const state = backend.stateFor(roles, null)
  assert.equal(backend.completeStage(roles, state, "review", "skip research").ok, false)
  assert.equal(backend.completeStage(roles, state, "research", " ").ok, false)
  assert.equal(backend.completeStage(roles, state, "research", "x".repeat(12001)).ok, false)
  assert.equal(state.completed.length, 0)
})
test("handoffs survive JSON persistence, move exactly one stage, and cannot replay", () => {
  const roles = [role("research"), role("review", ["research"])]
  const first = backend.completeStage(roles, backend.stateFor(roles, null), "research", "source A and source B")
  assert.equal(first.ok, true)
  assert.equal(first.nextRole.id, "review")
  const restored = backend.stateFor(roles, plain(first.state))
  assert.equal(restored.outputs.research, "source A and source B")
  assert.equal(backend.currentRole(roles, restored).id, "review")
  assert.equal(backend.completeStage(roles, restored, "research", "overwrite").ok, false)
  const final = backend.completeStage(roles, restored, "review", "validated final report")
  assert.equal(final.nextRole, null)
  assert.deepEqual(plain(final.state.completed), ["research", "review"])
})
test("invalid checkpoint gaps cannot skip unfinished roles", () => {
  const roles = [role("first"), role("second", ["first"])]
  const outOfOrder = backend.stateFor(roles, { completed: ["second"], outputs: { second: "fake" } })
  assert.equal(outOfOrder.active_role_id, "first")
  assert.equal(outOfOrder.completed.length, 0)
  const empty = backend.stateFor(roles, { completed: ["first"], outputs: {} })
  assert.equal(empty.completed.length, 0)
})
test("next role receives persisted handoff and cannot claim parallel execution", () => {
  const roles = [role("first"), role("second", ["first"])]
  const saved = backend.completeStage(roles, backend.stateFor(roles, null), "first", "EVIDENCE_FROM_STAGE_ONE")
  const prompt = backend.rolePrompt(roles[1], roles, saved.state)
  assert.match(prompt, /EVIDENCE_FROM_STAGE_ONE/)
  assert.match(prompt, /非并行团队/)
  assert.match(prompt, /action=final/)
})
test("draft recovery preserves incomplete role edits but drops unrecognized fields", () => {
  const draft = { ...role("research"), name: "", tasks: ["first", ""], api_key: "not-a-secret-but-not-allowed" }
  const restored = sanitizeAgentRoles([draft])
  assert.deepEqual(restored[0].tasks, ["first", ""])
  assert.equal(restored[0].name, "")
  assert.equal("api_key" in restored[0], false)
})

test("switching a ready role organization to one assistant clears bindings and remains ready", () => {
  const original = { ...spec, roles: [role("analyst", [], ["calculate"])], capability_requirements: [calculationNeed(["analyst"])] }
  assert.deepEqual(agentCapabilityReadiness(original, null), [])
  const single = replaceAgentRoles(original, [], { singleAssistant: true })
  assert.deepEqual(single.roles, [])
  assert.deepEqual(single.capability_requirements[0].role_ids, [])
  assert.deepEqual(agentCapabilityReadiness(single, null), [])
  assert.deepEqual(single.tools, original.tools)
  assert.deepEqual(original.capability_requirements[0].role_ids, ["analyst"], "the previous organization remains an immutable recovery snapshot")
})

test("deleting a role removes its capability references without giving its tools to another role", () => {
  const original = { ...spec, roles: [role("analyst", [], ["calculate"]), role("review", [], ["web_search"])],
    capability_requirements: [calculationNeed(["analyst"])] }
  const next = replaceAgentRoles(original, original.roles.filter(item => item.id !== "analyst"))
  assert.deepEqual(next.capability_requirements[0].role_ids, [])
  assert.deepEqual(orphanedCapabilityRoles(next), [])
  assert.deepEqual(next.roles[0].tools, ["web_search"])
  assert.deepEqual(next.tools, original.tools)
  assert.ok(agentCapabilityReadiness(next, null).length > 0, "removing a binding does not assign a missing tool to the remaining role")
})

test("deletion only removes the deleted ID and keeps pre-existing orphan references visible for repair", () => {
  const original = { ...spec, roles: [role("analyst", [], ["calculate"]), role("review", ["analyst"], ["calculate"])],
    capability_requirements: [calculationNeed(["analyst", "review", "old_missing"])] }
  const next = replaceAgentRoles(original, [original.roles[1]])
  assert.deepEqual(next.capability_requirements[0].role_ids, ["review", "old_missing"])
  assert.deepEqual(next.roles[0].depends_on, ["analyst"], "dependency boundaries are not silently rewired")
  assert.deepEqual(orphanedCapabilityRoles(next), [{ id: "calculation", title: "数值计算", roleIds: ["old_missing"] }])
  const noRoles = replaceAgentRoles(next, [])
  assert.deepEqual(noRoles.capability_requirements[0].role_ids, ["old_missing"], "even deleting the last role only removes that role's binding")
  assert.deepEqual(replaceAgentRoles(noRoles, [], { singleAssistant: true }).capability_requirements[0].role_ids, [],
    "explicitly choosing single-assistant mode clears all role bindings")
})

test("explicit orphan repair preserves valid assignments, requirements and all tool permissions", () => {
  const original = { ...spec, roles: [role("analyst", [], ["calculate"]), role("review")],
    capability_requirements: [calculationNeed(["analyst", "old_missing"])] }
  assert.ok(agentCapabilityReadiness(original, null).length > 0)
  const repaired = clearOrphanedCapabilityRoles(original)
  assert.deepEqual(repaired.capability_requirements[0], calculationNeed(["analyst"]))
  assert.deepEqual(repaired.roles, original.roles)
  assert.deepEqual(repaired.tools, original.tools)
  assert.deepEqual(agentCapabilityReadiness(repaired, null), [])
  assert.deepEqual(original.capability_requirements[0].role_ids, ["analyst", "old_missing"])
  const oldSingle = { ...original, roles: [] }
  assert.deepEqual(clearOrphanedCapabilityRoles(oldSingle).capability_requirements[0].role_ids, [])
})

test("explicit restore recovers same-capability assignments and role-specific tools", () => {
  const previous = { ...spec, roles: [role("analyst", [], ["calculate"]), role("review", [], ["web_search"])],
    capability_requirements: [calculationNeed(["analyst"])] }
  const single = replaceAgentRoles(previous, [])
  const restored = restoreAgentRoles(single, previous)
  assert.deepEqual(restored.roles, previous.roles)
  assert.deepEqual(restored.capability_requirements[0].role_ids, ["analyst"])
  assert.deepEqual(agentCapabilityReadiness(restored, null), [])
  assert.deepEqual(restored.roles[1].tools, ["web_search"])
})

test("restoring cannot bring back tools removed from the current global allowance", () => {
  const previous = { ...spec, roles: [role("analyst", [], ["calculate"]), role("review", [], ["web_search"])],
    capability_requirements: [calculationNeed(["analyst"])] }
  const single = { ...replaceAgentRoles(previous, []), tools: ["web_search"] }
  const restored = restoreAgentRoles(single, previous)
  assert.deepEqual(restored.tools, ["web_search"])
  assert.deepEqual(restored.roles[0].tools, [])
  assert.deepEqual(restored.roles[1].tools, ["web_search"])
  assert.equal(validateAgentRoles(restored.roles, restored.tools).valid, true)
  assert.ok(agentCapabilityReadiness(restored, null).length > 0)
})

test("reused capability IDs with changed meaning do not inherit a former role assignment", () => {
  const previous = { ...spec, roles: [role("analyst", [], ["calculate"])], capability_requirements: [calculationNeed(["analyst"])] }
  const single = replaceAgentRoles(previous, [])
  single.capability_requirements = [{ ...single.capability_requirements[0], title: "网页资料", kind: "web_search", suggested_tool_ids: ["web_search"] }]
  const restored = restoreAgentRoles(single, previous)
  assert.deepEqual(restored.capability_requirements[0].role_ids, [])
  assert.equal(restored.capability_requirements[0].kind, "web_search")
  assert.deepEqual(restored.roles[0].tools, ["calculate"], "changed needs never grant new permissions")
})
