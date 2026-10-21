import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { projectAgentRoleProgress } from "../src/lib/agentRoleProgress.ts"

// Use the real persisted stage contract, not a second implementation of it.
const context = { module: { exports: {} } }
vm.runInNewContext(fs.readFileSync("pocketbase/pb_hooks/modules/agent_roles.js", "utf8"), context)
const backend = context.module.exports
const persisted = value => JSON.parse(JSON.stringify(value))
const role = (id, name, deps = []) => ({ id, name, responsibility: "完成负责阶段",
  tasks: ["处理输入"], inputs: ["任务"], deliverables: ["阶段成果"],
  depends_on: deps, tools: [], done_criteria: ["说明成果与不足"] })
const snapshot = { tools: [], roles: [
  role("review", "交付审核", ["execute"]),
  role("execute", "方案执行", ["research"]),
  role("research", "资料研究"),
] }
const order = backend.validatePlan(snapshot.roles, snapshot.tools).orderedRoles
const initial = () => persisted(backend.stateFor(order, null))
const project = state => projectAgentRoleProgress({ spec_snapshot: snapshot, checkpoint: { role_state: persisted(state) } })

test("legacy and single-assistant runs do not invent a staged workflow", () => {
  assert.equal(projectAgentRoleProgress({}), null)
  assert.equal(projectAgentRoleProgress({ spec_snapshot: { tools: [], roles: [] } }), null)
  assert.equal(projectAgentRoleProgress({ checkpoint: { role_state: initial() } }), null)
})

test("a frozen role plan alone shows planned order, never current or completed stages", () => {
  const result = projectAgentRoleProgress({ spec_snapshot: snapshot, status: "succeeded", current_step: 99 })
  assert.deepEqual(result.stages.map(stage => stage.name), ["资料研究", "方案执行", "交付审核"])
  assert.ok(result.stages.every(stage => stage.state === "pending" && stage.output === ""))
  assert.equal(result.current, null)
  assert.equal(result.next, null)
  assert.equal(result.allSubmitted, false)
  assert.equal(result.checkpointAvailable, false)
  assert.match(result.warning, /尚未收到角色执行记录/)
})

test("an initial persisted checkpoint distinguishes assigned stage from actual start", () => {
  const state = initial()
  const waiting = project(state)
  assert.deepEqual(waiting.current, { id: "research", name: "资料研究", started: false })
  assert.deepEqual(waiting.next, { id: "execute", name: "方案执行" })
  assert.equal(waiting.submittedCount, 0)
  assert.equal(waiting.warning, "")
  state.started_role_id = "research"
  assert.equal(project(state).current.started, true)
})

test("a real saved handoff exposes exactly that delivery and the next assigned role", () => {
  const output = "来源 A 的记录\n尚待确认：范围 B。<script>ordinary text</script>"
  const handoff = backend.completeStage(order, initial(), "research", output)
  assert.equal(handoff.ok, true)
  const result = project(handoff.state)
  assert.equal(result.submittedCount, 1)
  assert.deepEqual(result.stages.map(stage => stage.state), ["submitted", "current", "pending"])
  assert.equal(result.stages[0].output, output)
  assert.equal(result.stages[1].output, "")
  assert.deepEqual(result.current, { id: "execute", name: "方案执行", started: false })
  assert.deepEqual(result.next, { id: "review", name: "交付审核" })
  assert.equal(result.allSubmitted, false)
})

test("all saved stage outputs produce a submitted state with no active or next role", () => {
  let state = initial()
  for (const stage of order) state = backend.completeStage(order, state, stage.id, `${stage.name}成果`).state
  const result = project(state)
  assert.equal(result.submittedCount, 3)
  assert.equal(result.allSubmitted, true)
  assert.equal(result.current, null)
  assert.equal(result.next, null)
  assert.equal(result.warning, "")
  assert.deepEqual(result.stages.map(stage => stage.output), ["资料研究成果", "方案执行成果", "交付审核成果"])
})

test("gaps, reordered IDs, and invalid entries cannot manufacture submitted stages", () => {
  for (const completed of [["execute"], ["execute", "research"], [null, "research"], ["unknown", "research"]]) {
    const result = project({ version: 1, completed, outputs: { research: "saved", execute: "saved" }, active_role_id: "review" })
    assert.equal(result.submittedCount, 0, JSON.stringify(completed))
    assert.equal(result.allSubmitted, false)
    assert.equal(result.current, null)
    assert.match(result.warning, /角色记录不完整/)
  }
})

test("only a contiguous prefix with actual nonempty output is displayed as submitted", () => {
  for (const output of [undefined, "", "  ", { claimed: "done" }]) {
    const result = project({ version: 1, completed: ["research", "execute"],
      outputs: { research: "保存的研究成果", execute: output }, active_role_id: "review" })
    assert.equal(result.submittedCount, 1)
    assert.equal(result.stages[0].output, "保存的研究成果")
    assert.equal(result.stages[1].output, "")
    assert.equal(result.current, null, "an inconsistent active ID cannot skip the missing delivery")
    assert.equal(result.next, null)
    assert.equal(result.allSubmitted, false)
    assert.match(result.warning, /角色记录不完整/)
  }
})

test("unknown checkpoint versions do not claim progress from unrecognized data", () => {
  const result = project({ version: 2, completed: ["research"], outputs: { research: "saved" }, active_role_id: "execute" })
  assert.equal(result.checkpointAvailable, false)
  assert.equal(result.submittedCount, 0)
  assert.equal(result.current, null)
  assert.equal(result.allSubmitted, false)
})

test("invalid snapshots are not repaired into a fictional execution plan", () => {
  const invalid = { ...snapshot, roles: [{ ...snapshot.roles[0], depends_on: ["unknown"] }] }
  assert.equal(projectAgentRoleProgress({ spec_snapshot: invalid, checkpoint: { role_state: initial() } }), null)
})
