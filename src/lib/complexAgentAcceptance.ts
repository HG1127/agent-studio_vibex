import type { AgentSpec } from "../pages/Home/presets"
import { validateAgentRoles } from "./agentRoles.ts"

/**
 * Evidence-backed readiness for multi-stage Agents, not a factual correctness
 * score. Only owner-scoped server run details may feed this checker.
 * A generated final answer or a success flag is not evidence of tool execution.
 */
export type ComplexAgentEvent = {
  event_type: string
  step_index: number
  content?: Record<string, unknown> | null
}
export type ComplexAgentProof = {
  status?: string
  result?: string
  checkpoint?: {
    role_state?: { completed?: unknown; outputs?: unknown } | null
  } | null
  events?: ComplexAgentEvent[] | null
}
export type ComplexAgentAcceptance = {
  applicable: boolean
  verified: boolean
  stageTotal: number
  stagesVerified: number
  requiredTotal: number
  requiredVerified: number
  issues: string[]
}

const validText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0
const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

/** A read-only model text instruction is not itself a missing external tool. */
const requiresToolProof = (need: { kind: string; access: string; suggested_tool_ids: string[] }) =>
  need.access === "write" || need.kind !== "text" || need.suggested_tool_ids.length > 0

export function evaluateComplexAgentAcceptance(
  spec: AgentSpec | null,
  proof: ComplexAgentProof | null | undefined,
): ComplexAgentAcceptance {
  const stages = spec?.roles || []
  // Preserve legacy single-Agent behavior. This gate is exclusively for
  // actual multi-role projects whose claimed success can hide skipped stages.
  if (!spec || stages.length < 2)
    return { applicable: false, verified: true, stageTotal: 0, stagesVerified: 0,
      requiredTotal: 0, requiredVerified: 0, issues: [] }
  const issues: string[] = []
  const ordered = validateAgentRoles(stages, spec.tools || [])
  if (!ordered.valid) issues.push(...ordered.errors)
  const orderedStages = ordered.valid ? ordered.orderedRoles : stages
  const checkpoint = proof?.checkpoint
  const state = checkpoint?.role_state
  const completed = Array.isArray(state?.completed) && state.completed.every(validText)
    ? state.completed as string[] : []
  const outputs = isPlainRecord(state?.outputs) ? state.outputs : {}
  const events = Array.isArray(proof?.events) ? proof.events : []
  const completedEvents = new Set(events.filter(event =>
    event?.event_type === "status" && event.content?.role_phase === "completed" &&
    validText(event.content?.role_id)).map(event => String(event.content!.role_id)))
  let stagesVerified = 0
  const expectedOrder = orderedStages.map(role => role.id)
  if (completed.length !== expectedOrder.length ||
    completed.some((id, i) => id !== expectedOrder[i]))
    issues.push("角色完成顺序与已保存的任务依赖不一致，不能仅凭最终回答判定全部角色完成")
  for (const role of orderedStages) {
    if (!validText(outputs[role.id])) {
      issues.push(`角色「${role.name}」缺少持久化交接成果`)
      continue
    }
    if (!completed.includes(role.id) || !completedEvents.has(role.id)) {
      issues.push(`角色「${role.name}」缺少可核验的完成事件或检查点`)
      continue
    }
    stagesVerified++
  }
  if (!proof || proof.status !== "succeeded" || !validText(proof.result))
    issues.push("缺少当前运行的成功状态和非空最终交付内容")

  const successfulCalls = events.filter(event => event?.event_type === "tool_call" &&
    validText(event.content?.tool) && Number.isSafeInteger(event.step_index))
    .filter(call => events.some(result =>
      result?.event_type === "tool_result" && result.step_index === call.step_index &&
      result.content?.tool === call.content?.tool))
  const approvals = events.filter(event => event?.event_type === "approval" &&
    event.content?.decision === "approve")
  let requiredTotal = 0
  let requiredVerified = 0
  for (const need of spec.capability_requirements || []) {
    if (!need.required || !requiresToolProof(need)) continue
    requiredTotal++
    const eligible = need.suggested_tool_ids.filter(id =>
      (spec.tools || []).includes(id))
    if (!eligible.length) {
      issues.push(`必需能力「${need.title}」没有可核对的真实工具绑定`)
      continue
    }
    const responsible = need.role_ids.length ? need.role_ids :
      stages.filter(role => role.tools.some(id => eligible.includes(id))).map(role => role.id)
    if (!responsible.length || responsible.some(id => !stages.some(role => role.id === id &&
      role.tools.some(tool => eligible.includes(tool))))) {
      issues.push(`必需能力「${need.title}」缺少明确且已授权的执行角色`)
      continue
    }
    const allExecuted = responsible.every(roleId => successfulCalls.some(call =>
      call.content?.role_id === roleId && eligible.includes(String(call.content?.tool))))
    if (!allExecuted) {
      issues.push(`必需能力「${need.title}」未留下负责角色执行成功的工具证据`)
      continue
    }
    if (need.access === "write" && !responsible.every(roleId => successfulCalls.some(call =>
      call.content?.role_id === roleId && eligible.includes(String(call.content?.tool)) &&
      approvals.some(approval => approval.step_index === call.step_index &&
        approval.content?.tool === call.content?.tool)))) {
      issues.push(`写入能力「${need.title}」缺少与实际工具调用匹配的人工批准记录`)
      continue
    }
    requiredVerified++
  }
  // A truncated run event window cannot be interpreted as full proof. Missing
  // role/tool events above will fail closed; do not infer from final text.
  return { applicable: true, verified: issues.length === 0,
    stageTotal: stages.length, stagesVerified, requiredTotal, requiredVerified, issues }
}
