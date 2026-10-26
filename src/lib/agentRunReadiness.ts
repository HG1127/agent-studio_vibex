import type { AgentSpec, ConnectedToolOption } from "../pages/Home/presets"
import type { VerifiedMarketTool } from "./marketToolSelection"
import { agentCapabilityReadiness, agentCapabilityRequirements } from "./agentCapabilityPlan.ts"
import { agentRoleReadiness } from "./agentRoles.ts"
import { localDeviceSupports, type ReadyLocalDevice } from "./localDeviceReadiness.ts"

export type AgentRunReadiness = {
  ready: boolean
  roleIssues: string[]
  capabilityIssues: string[]
  issues: string[]
}

/** Preserve real connection metadata; an enabled name alone is not a tested capability. */
export function enabledRunToolConnections(value: unknown): ConnectedToolOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    if (row.enabled !== true || typeof row.name !== "string" || !row.name.trim()) return []
    return [{ name: row.name, description: typeof row.description === "string" ? row.description : "",
      method: typeof row.method === "string" ? row.method.toUpperCase() : "",
      status: typeof row.status === "string" ? row.status : "unknown" }]
  })
}

/** Preflight for a NEW run of the selected saved spec, never for resume or approval. */
export function agentRunReadiness(spec: AgentSpec | null, options: {
  connections?: ConnectedToolOption[]
  marketTools?: VerifiedMarketTool[]
  disabledToolIds?: string[]
  localDevice?: ReadyLocalDevice | null
} = {}): AgentRunReadiness {
  if (!spec) return { ready: false, roleIssues: [], capabilityIssues: [], issues: [] }
  const roleIssues = agentRoleReadiness(spec)
  const disabled = new Set(options.disabledToolIds || [])
  const executionSpec = disabled.size ? { ...spec, tools: spec.tools.filter(id => !disabled.has(id)) } : spec
  // Invalid role shapes must first be repaired, not passed into capability matching.
  const capabilitySpec = options.localDevice && !disabled.has('local_computer') ? { ...executionSpec,
    capability_requirements: agentCapabilityRequirements(executionSpec).filter(need =>
      !localDeviceSupports(executionSpec, need, options.localDevice)) } : executionSpec
  const capabilityIssues = roleIssues.length ? [] : agentCapabilityReadiness(capabilitySpec, null,
    options.connections || [], options.marketTools || [])
  const issues = [...new Set([...roleIssues, ...capabilityIssues])]
  return { ready: issues.length === 0, roleIssues, capabilityIssues, issues }
}
