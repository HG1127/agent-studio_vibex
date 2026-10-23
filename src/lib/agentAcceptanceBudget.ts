import type { AgentSpec } from "../pages/Home/presets"

/** A complex staged Agent needs room for both tool calls and role handoffs.
 * This controls only test budgets; it never grants model/tool authorization. */
export function agentAcceptanceBudget(spec: Pick<AgentSpec,"roles"> | null | undefined) {
  const stages = Array.isArray(spec?.roles) ? Math.min(8, spec.roles.length) : 0
  return {
    maxSteps: Math.min(48,Math.max(8,stages*3+6)),
    maxModelCalls: Math.min(64,Math.max(20,stages*4+8)),
  }
}
