import type { AgentSpec } from "../pages/Home/presets"

/** Sequential role stages in one Agent run, not separate parallel agents. */
export type AgentRole = {
  id: string
  name: string
  responsibility: string
  tasks: string[]
  inputs: string[]
  deliverables: string[]
  depends_on: string[]
  tools: string[]
  done_criteria: string[]
  /** Immutable, reviewed text Skills; separate from tool permissions. */
  skill_refs?: {id:string;version:number;hash:string}[]
}
export const MAX_AGENT_ROLES = 8

export function validateAgentRoles(roles: AgentRole[] = [], availableTools: string[] = []) {
  const errors: string[] = [], orderedRoles: AgentRole[] = []
  if (!Array.isArray(roles)) return { valid: false, errors: ["角色分工必须是列表"], orderedRoles }
  if (roles.length > MAX_AGENT_ROLES) return { valid: false, errors: ["每个助手最多配置 8 个角色阶段"], orderedRoles }
  const ids = new Set<string>()
  for (const [index, role] of roles.entries()) {
    if (!role || typeof role !== "object") { errors.push(`第 ${index + 1} 个角色配置格式不正确`); continue }
    const title = String(role.name || "").trim() || `第 ${index + 1} 个角色`
    if (typeof role.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(role.id || "")) errors.push(`${title}的标识格式不正确`)
    if (ids.has(role.id)) errors.push(`角色标识重复：${role.id}`)
    ids.add(role.id)
    if (typeof role.name !== "string" || !role.name.trim()) errors.push(`${title}需要填写名称`)
    if (typeof role.responsibility !== "string" || !role.responsibility.trim()) errors.push(`${title}需要说明职责`)
    for (const [key, label] of [["tasks", "任务"], ["deliverables", "交付物"], ["done_criteria", "完成标准"]] as const) {
      if (!Array.isArray(role[key]) || !role[key].some(value => typeof value === "string" && value.trim())) errors.push(`${title}至少需要一项${label}`)
    }
    for (const key of ["tasks", "inputs", "deliverables", "depends_on", "tools", "done_criteria"] as const) {
      if (!Array.isArray(role[key]) || role[key].length > 32 || role[key].some(value => typeof value !== "string" || value.length > (key === "tools" ? 220 : 1600))) errors.push(`${title}的${key}格式不正确或内容过长`)
    }
    if ((role.name || "").length > 100 || (role.responsibility || "").length > 2000) errors.push(`${title}的名称或职责过长`)
    const refs = role.skill_refs || []
    if (!Array.isArray(refs) || refs.length > 2 || refs.some(ref => !ref ||
      !/^[A-Za-z0-9]{15}$/.test(ref.id) || !Number.isSafeInteger(ref.version) ||
      ref.version < 1 || ref.version > 100 || !/^[a-f0-9]{64}$/.test(ref.hash)) ||
      new Set(refs.map(ref => ref.id)).size !== refs.length)
      errors.push(`${title}的 Skill 绑定无效；请从已审核的 Skills 中重新选择`)
    for (const tool of Array.isArray(role.tools) ? role.tools : []) if (!availableTools.includes(tool)) errors.push(`${title}的工具尚未加入方案：${tool}`)
  }
  if (errors.length) return { valid: false, errors, orderedRoles }
  for (const role of roles) for (const dep of role.depends_on) {
    if (dep === role.id) errors.push(`${role.name}不能依赖自己`)
    else if (!ids.has(dep)) errors.push(`${role.name}依赖的角色不存在：${dep}`)
  }
  if (errors.length) return { valid: false, errors, orderedRoles }
  const completed = new Set<string>()
  while (orderedRoles.length < roles.length) {
    let advanced = false
    for (const role of roles) {
      if (completed.has(role.id) || !role.depends_on.every(id => completed.has(id))) continue
      orderedRoles.push(role); completed.add(role.id); advanced = true
    }
    if (!advanced) return { valid: false, errors: ["角色依赖形成循环，请调整交接顺序"], orderedRoles: [] }
  }
  return { valid: true, errors, orderedRoles }
}

export function agentRoleReadiness(spec: AgentSpec): string[] {
  return validateAgentRoles(spec.roles || [], spec.tools || []).errors
}

/** Organizational edits remove only deleted role bindings, never transfer tool grants. */
export function replaceAgentRoles(spec: AgentSpec, roles: AgentRole[], options: { singleAssistant?: boolean } = {}): AgentSpec {
  const retained = new Set(roles.map(role => role.id))
  const removed = new Set((spec.roles || []).filter(role => !retained.has(role.id)).map(role => role.id))
  return { ...spec, roles,
    ...(spec.capability_requirements ? { capability_requirements: spec.capability_requirements.map(need => ({
      ...need, role_ids: options.singleAssistant && !roles.length ? [] : need.role_ids.filter(id => !removed.has(id)),
    })) } : {}),
  }
}

export function orphanedCapabilityRoles(spec: AgentSpec): { id: string; title: string; roleIds: string[] }[] {
  const known = new Set((spec.roles || []).map(role => role.id))
  return (spec.capability_requirements || []).flatMap(need => {
    const roleIds = need.role_ids.filter(id => !known.has(id))
    return roleIds.length ? [{ id: need.id, title: need.title, roleIds }] : []
  })
}

/** A visible user-invoked repair for old drafts; existing role permissions stay intact. */
export function clearOrphanedCapabilityRoles(spec: AgentSpec): AgentSpec {
  const known = new Set((spec.roles || []).map(role => role.id))
  return { ...spec,
    ...(spec.capability_requirements ? { capability_requirements: spec.capability_requirements.map(need => ({
      ...need, role_ids: need.role_ids.filter(id => known.has(id)),
    })) } : {}),
  }
}

/** Explicitly restore a previous organization within the CURRENT global tool allowance. */
export function restoreAgentRoles(spec: AgentSpec, previous: AgentSpec): AgentSpec {
  const allowed = new Set(spec.tools)
  const roles = (previous.roles || []).map(role => ({ ...role, tools: role.tools.filter(id => allowed.has(id)) }))
  const known = new Set(roles.map(role => role.id))
  const oldNeeds = new Map((previous.capability_requirements || []).map(need => [need.id, need]))
  return { ...spec, roles,
    ...(spec.capability_requirements ? { capability_requirements: spec.capability_requirements.map(need => {
      const old = oldNeeds.get(need.id)
      // Reusing an ID for a different capability must not revive its old assignment.
      const unchanged = old && old.title === need.title && old.purpose === need.purpose &&
        old.kind === need.kind && old.access === need.access
      const source = need.role_ids.length || !unchanged ? need.role_ids : old.role_ids
      return { ...need, role_ids: source.filter(id => known.has(id)) }
    }) } : {}),
  }
}

/** AI may revise a role, but only the employee may add or revoke Skill versions.
 * Preserve shape for legacy roles with no skill_refs; never trust model-supplied refs.
 */
export function preserveRoleSkillBindings(proposed: AgentRole[], previous: AgentRole[]): AgentRole[] {
  const old = new Map(previous.map(role => [role.id, role]))
  return proposed.map(role => {
    const next = { ...role }
    delete next.skill_refs
    const refs = old.get(role.id)?.skill_refs
    if (Array.isArray(refs)) next.skill_refs = refs.map(ref => ({ ...ref }))
    return next
  })
}

/** Bounded allowlist for local draft recovery; incomplete edits stay editable. */
export function sanitizeAgentRoles(value: unknown): AgentRole[] {
  if (!Array.isArray(value)) return []
  const text = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : ""
  const list = (v: unknown, max: number) => Array.isArray(v) ? v.slice(0, 32).filter(x => typeof x === "string").map(x => text(x, max)) : []
  return value.slice(0, MAX_AGENT_ROLES).flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const r = item as Record<string, unknown>
    const refs = Array.isArray(r.skill_refs) ? r.skill_refs.slice(0, 2).flatMap(ref => {
      if (!ref || typeof ref !== "object" || Array.isArray(ref)) return []
      const value = ref as Record<string, unknown>
      if (typeof value.id !== "string" || !/^[A-Za-z0-9]{15}$/.test(value.id) ||
          !Number.isSafeInteger(value.version) || Number(value.version) < 1 || Number(value.version) > 100 ||
          typeof value.hash !== "string" || !/^[0-9a-f]{64}$/.test(value.hash)) return []
      return [{id:value.id,version:value.version as number,hash:value.hash}]
    }) : []
    return [{ id: text(r.id, 64), name: text(r.name, 100), responsibility: text(r.responsibility, 2000),
      tasks: list(r.tasks, 1600), inputs: list(r.inputs, 1600), deliverables: list(r.deliverables, 1600),
      depends_on: list(r.depends_on, 64), tools: list(r.tools, 220), done_criteria: list(r.done_criteria, 1600),
      ...(Array.isArray(r.skill_refs) ? {skill_refs: refs} : {}) }]
  })
}

/** An editable starter based on the current task, never claimed as an AI result. */
export function createRoleStages(spec: AgentSpec): AgentRole[] {
  const tasks = (spec.task_plan || []).filter(Boolean)
  const split = Math.max(1, Math.ceil(tasks.length / 2))
  return [
    { id: "researcher", name: "资料研究", responsibility: "整理输入与资料，形成可追溯的事实和问题清单。",
      tasks: tasks.slice(0, split).length ? tasks.slice(0, split) : ["理解任务并收集所需信息"],
      inputs: ["用户任务与已授权资料"], deliverables: ["资料与依据清单"], depends_on: [],
      tools: [], done_criteria: ["说明资料来源、事实与待确认问题"] },
    { id: "executor", name: "方案执行", responsibility: "依据前序资料完成任务，保留关键依据与执行结果。",
      tasks: tasks.slice(split).length ? tasks.slice(split) : ["完成任务并形成交付草稿"],
      inputs: ["资料研究阶段的交付成果"], deliverables: [...(spec.deliverables || [])].length ? [...spec.deliverables] : ["交付草稿"],
      depends_on: ["researcher"], tools: [], done_criteria: ["交付草稿覆盖任务要求，并列出未完成事项"] },
    { id: "reviewer", name: "审核交付", responsibility: "核对任务与证据，明确不足并产出最终交付。",
      tasks: ["逐项核对交付与完成标准", "汇总最终成果及尚未解决的问题"],
      inputs: ["研究与执行阶段保存的成果"], deliverables: [...(spec.deliverables || [])].length ? [...spec.deliverables] : ["最终成果"],
      depends_on: ["executor"], tools: [],
      done_criteria: (spec.done_criteria || []).length ? [...spec.done_criteria] : ["成果满足任务要求，无法完成的部分如实说明"] },
  ]
}
