import type { AgentSpec } from "../pages/Home/presets"
import { validateAgentRoles } from "./agentRoles.ts"

export type RoleStageProgress = {
  id: string
  name: string
  state: "submitted" | "current" | "pending"
  output: string
}
export type AgentRoleProgress = {
  stages: RoleStageProgress[]
  submittedCount: number
  current: { id: string; name: string; started: boolean } | null
  next: { id: string; name: string } | null
  allSubmitted: boolean
  checkpointAvailable: boolean
  warning: string
}

/**
 * Display only a saved run snapshot and its checkpoint. Do not infer role
 * completion from run success, step count, a model's prose, or the editor.
 */
export function projectAgentRoleProgress(run: {
  spec_snapshot?: AgentSpec | null
  checkpoint?: Record<string, unknown> | null
}): AgentRoleProgress | null {
  const snapshot = run.spec_snapshot
  if (!snapshot || !Array.isArray(snapshot.roles) || !snapshot.roles.length) return null
  const plan = validateAgentRoles(snapshot.roles, snapshot.tools || [])
  if (!plan.valid) return null
  const order = plan.orderedRoles
  const raw = run.checkpoint?.role_state
  const state = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null
  const available = state?.version === 1 && Array.isArray(state.completed)
  const completed: unknown[] = available ? state.completed as unknown[] : []
  const rawOutputs = state?.outputs
  const outputs = rawOutputs && typeof rawOutputs === "object" && !Array.isArray(rawOutputs) ? rawOutputs as Record<string, unknown> : {}
  let submittedCount = 0
  for (const role of order) {
    const output = outputs[role.id]
    if (completed[submittedCount] !== role.id || typeof output !== "string" || !output.trim()) break
    submittedCount++
  }
  const expectedCurrent = order[submittedCount]
  const savedActiveId = typeof state?.active_role_id === "string" ? state.active_role_id : ""
  const current = available && expectedCurrent && savedActiveId === expectedCurrent.id ? {
    id: expectedCurrent.id, name: expectedCurrent.name,
    started: state.started_role_id === expectedCurrent.id,
  } : null
  const next = current && order[submittedCount + 1] ? {
    id: order[submittedCount + 1].id, name: order[submittedCount + 1].name,
  } : null
  const consistent = available && completed.length === submittedCount &&
    completed.every((id, index) => order[index]?.id === id) &&
    (submittedCount === order.length ? savedActiveId === "" : Boolean(current))
  return {
    stages: order.map((role, index) => ({ id: role.id, name: role.name,
      state: index < submittedCount ? "submitted" : role.id === current?.id ? "current" : "pending",
      output: index < submittedCount && typeof outputs[role.id] === "string" ? outputs[role.id] as string : "",
    })),
    submittedCount, current, next,
    allSubmitted: consistent && submittedCount === order.length,
    checkpointAvailable: available,
    warning: !available ? "尚未收到角色执行记录；以下仅为本次运行保存的角色安排。" :
      !consistent ? "角色记录不完整，当前仅展示能对应到已保存成果的阶段。" : "",
  }
}
