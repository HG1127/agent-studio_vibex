// Pure intents and hashes only. No request receipt, DB grant or effect proof is minted.
import {createHash} from "node:crypto"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentDesignObject as object, agentDesignJsonValue, agentDesignText, invalidAgentDesignValue as invalid,
  agentDesignInstructionLimit, agentDesignOutputTokenLimits, parseAgentDesignEditableFields, type AgentDesignEditableFields,
  type AgentDesignPurpose, type AgentDesignModelBinding, type AgentDesignRoleReference, type AgentDesignChoice} from "./agent-design-value-contract.ts"

export type {AgentDesignPurpose, AgentDesignModelBinding, AgentDesignRoleReference, AgentDesignChoice} from "./agent-design-value-contract.ts"
export const agentDesignFees = Object.freeze({generate: "APPROVE_EXPLICIT_PAID_AGENT_DESIGN_GENERATE_V1", revise: "APPROVE_EXPLICIT_PAID_AGENT_DESIGN_REVISE_V1"} as const)
export const agentDesignSaveAcknowledgement = "APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1" as const
export const agentDesignHash = (raw: unknown): string => createHash("sha256").update(canonicalMcpJson(agentDesignJsonValue(raw))).digest("hex")
export const agentDesignId = (raw: unknown): string => typeof raw === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw) ? raw : invalid()
export const agentDesignSha = (raw: unknown): string => typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw) ? raw : invalid()
export function agentDesignVersion(raw: unknown): number {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1 && raw <= Number.MAX_SAFE_INTEGER - 2 ? raw : invalid()
}
export function parseAgentDesignModelBinding(raw: unknown): AgentDesignModelBinding {
  const v = object(raw, ["connection_id", "connection_revision", "model_id"])
  if (typeof v.model_id !== "string" || !/^[A-Za-z0-9._:/-]{1,120}$/.test(v.model_id)) return invalid()
  return {connection_id: agentDesignId(v.connection_id), connection_revision: agentDesignVersion(v.connection_revision), model_id: v.model_id}
}
const fields = ["purpose", "instruction", "model_binding", "output_token_limit", "source"] as const
export function parseAgentDesignChoice(raw: unknown): AgentDesignChoice {
  const v = object(raw, ["action", ...fields])
  if (v.action !== "preview" || v.purpose !== "generate" && v.purpose !== "revise" || typeof v.output_token_limit !== "number" || !agentDesignOutputTokenLimits.some(cap => cap === v.output_token_limit)) return invalid()
  let source: AgentDesignRoleReference | null = null
  if (v.purpose === "generate") {if (v.source !== null) return invalid()}
  else {const s = object(v.source, ["spec_id", "revision", "source_sha256"]); source = {spec_id: agentDesignId(s.spec_id), revision: agentDesignVersion(s.revision), source_sha256: agentDesignSha(s.source_sha256)}}
  return {action: "preview", purpose: v.purpose, instruction: agentDesignText(v.instruction, agentDesignInstructionLimit, true),
    model_binding: parseAgentDesignModelBinding(v.model_binding), output_token_limit: v.output_token_limit as AgentDesignChoice["output_token_limit"], source}
}
export type AgentDesignSubmission = Omit<AgentDesignChoice, "action"> & {action: "submit"; request_id: string; expected_input_sha256: string;
  confirm: true; fee_acknowledgement: typeof agentDesignFees[AgentDesignPurpose]; request_sha256: string}
export function parseAgentDesignSubmission(raw: unknown): AgentDesignSubmission {
  const v = object(raw, ["action", ...fields, "request_id", "expected_input_sha256", "confirm", "fee_acknowledgement"])
  if (v.action !== "submit" || v.confirm !== true) return invalid()
  const {request_id, expected_input_sha256, confirm: _confirm, fee_acknowledgement, action: _action, ...selected} = v
  const {action: _preview, ...choice} = parseAgentDesignChoice({action: "preview", ...selected})
  if (fee_acknowledgement !== agentDesignFees[choice.purpose]) return invalid()
  const intent = {...choice, action: "submit" as const, request_id: agentDesignId(request_id), expected_input_sha256: agentDesignSha(expected_input_sha256),
    confirm: true as const, fee_acknowledgement: agentDesignFees[choice.purpose]}
  return {...intent, request_sha256: agentDesignHash({protocol: "agent_design_paid_intent_v1", ...intent})}
}
export type AgentDesignControl = {action: "cancel" | "erase"; request_id: string; design_request_id: string; confirm: true; request_sha256: string}
export function parseAgentDesignControl(raw: unknown): AgentDesignControl {
  const v = object(raw, ["action", "request_id", "design_request_id", "confirm"])
  if (v.action !== "cancel" && v.action !== "erase" || v.confirm !== true) return invalid()
  const intent = {action: v.action as "cancel" | "erase", request_id: agentDesignId(v.request_id), design_request_id: agentDesignId(v.design_request_id), confirm: true as const}
  if (intent.request_id === intent.design_request_id) return invalid()
  return {...intent, request_sha256: agentDesignHash({protocol: "agent_design_control_intent_v1", ...intent})}
}
export type AgentDesignSavePreviewInput = {action: "preview_save"; design_request_id: string; expected_result_sha256: string; fields: AgentDesignEditableFields}
export function parseAgentDesignSavePreviewInput(raw: unknown): AgentDesignSavePreviewInput {
  const v = object(raw, ["action", "design_request_id", "expected_result_sha256", "fields"])
  if (v.action !== "preview_save") return invalid()
  return {action: "preview_save", design_request_id: agentDesignId(v.design_request_id), expected_result_sha256: agentDesignSha(v.expected_result_sha256), fields: parseAgentDesignEditableFields(v.fields)}
}
export function parseAgentDesignSaveIntent(raw: unknown) {
  const keys = ["action", "request_id", "design_request_id", "expected_preview_sha256", "expected_result_sha256", "expected_source_sha256", "expected_candidate_sha256", "confirm", "save_acknowledgement"]
  const v = object(raw, keys)
  if (v.action !== "save" || v.confirm !== true || v.save_acknowledgement !== agentDesignSaveAcknowledgement) return invalid()
  const intent = {action: "save" as const, request_id: agentDesignId(v.request_id), design_request_id: agentDesignId(v.design_request_id),
    expected_preview_sha256: agentDesignSha(v.expected_preview_sha256), expected_result_sha256: agentDesignSha(v.expected_result_sha256),
    expected_source_sha256: agentDesignSha(v.expected_source_sha256), expected_candidate_sha256: agentDesignSha(v.expected_candidate_sha256),
    confirm: true as const, save_acknowledgement: agentDesignSaveAcknowledgement}
  if (intent.request_id === intent.design_request_id) return invalid()
  return {...intent, request_sha256: agentDesignHash({protocol: "agent_design_save_intent_v1", ...intent})}
}
