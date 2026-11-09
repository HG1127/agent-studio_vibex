// Candidate/value derivation only. Nothing here publishes a result, grants a
// resource, starts a task, proves a DB source, or writes an Agent/save receipt.
import {safeAgentSpec, safeName, type AgentSpecInput} from "./contracts.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentDesignHash, agentDesignId, agentDesignSha, type AgentDesignPurpose} from "./agent-design-contract.ts"
import {agentDesignCanonicalSpec, agentDesignProtectedFields} from "./agent-design-input.ts"
import {agentDesignObject as object, agentDesignText, parseAgentDesignEditableFields, parseAgentDesignModelOutput,
  parseAgentDesignModelJson, invalidAgentDesignValue as invalid, type AgentDesignEditableFields} from "./agent-design-value-contract.ts"

export function deriveAgentDesignCandidate(before: {name: string; spec: AgentSpecInput} | null, rawResult: unknown, rawEdits?: unknown) {
  const output = parseAgentDesignModelOutput(rawResult)
  const fields: AgentDesignEditableFields = rawEdits === undefined ? parseAgentDesignEditableFields({name: output.name, goal: output.goal,
    task_scope: output.task_scope, deliverables: output.deliverables, task_plan: output.task_plan, done_criteria: output.done_criteria}) : parseAgentDesignEditableFields(rawEdits)
  let original: AgentSpecInput | null = null
  if (before !== null) {
    const prior = object(before, ["name", "spec"])
    if (safeName(prior.name) !== prior.name) return invalid()
    original = agentDesignCanonicalSpec(prior.spec)
  }
  const protectedFields = original ? agentDesignProtectedFields(original) : {tools: [], knowledge_base_ids: [], require_approval: true}
  const {require_approval: _approval, ...input} = protectedFields, {name, ...descriptions} = fields
  const spec = safeAgentSpec({...input, ...descriptions})
  if (canonicalMcpJson(agentDesignProtectedFields(spec)) !== canonicalMcpJson(protectedFields)) return invalid()
  return {name, spec, tool_suggestions: [...output.tools], candidate_sha256: agentDesignHash({protocol: "agent_design_candidate_v1", name, spec}),
    edited: canonicalMcpJson(fields) !== canonicalMcpJson(parseAgentDesignEditableFields({name: output.name, goal: output.goal,
      task_scope: output.task_scope, deliverables: output.deliverables, task_plan: output.task_plan, done_criteria: output.done_criteria})), authority: false as const}
}
export function normalizeAgentDesignCompletion(raw: unknown) {
  const v = object(raw)
  if (v.status === "succeeded") {
    const value = object(v, ["status", "model_json"])
    return {status: "succeeded" as const, result: parseAgentDesignModelJson(value.model_json)}
  }
  const value = object(v, ["status", "failure_code"])
  if (value.status !== "failed" && value.status !== "unknown" || typeof value.failure_code !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value.failure_code)) return invalid()
  return {status: value.status, failure_code: agentDesignText(value.failure_code, 64, true)}
}
export function agentDesignResultHash(requestId: string, purpose: AgentDesignPurpose, inputHash: string, sourceHash: string, rawResult: unknown): string {
  if (purpose !== "generate" && purpose !== "revise") return invalid()
  return agentDesignHash({protocol: "agent_design_result_v1", request_id: agentDesignId(requestId), purpose,
    input_sha256: agentDesignSha(inputHash), source_sha256: agentDesignSha(sourceHash), result: parseAgentDesignModelOutput(rawResult)})
}
