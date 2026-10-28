// Closed value DTOs shared by browser/API/private RPC. No receipt or lease is
// authorized by parsing one; SQL062 must enforce real identity/source/one-use.
import {safeAgentSpec, type AgentSpecInput} from "./contracts.ts"
import {agentDesignObject as O, agentDesignText, parseAgentDesignEditableFields, parseAgentDesignModelOutput,
  agentDesignJsonValue, agentDesignSameValue, agentDesignOutputTokenLimits, type AgentDesignModelOutput, type AgentDesignEditableFields} from "./agent-design-value-contract.ts"
import type {AgentDesignChoice, AgentDesignModelBinding, AgentDesignRoleReference, AgentDesignPurpose} from "./agent-design-value-contract.ts"

export class AgentDesignProjectionError extends Error {
  readonly status = 503; readonly code = "invalid_agent_design_projection"
  constructor() {super("invalid_agent_design_projection"); this.name = "AgentDesignProjectionError"}
}
const bad = (): never => {throw new AgentDesignProjectionError()}
export const designId = (v: unknown): string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v) ? v : bad()
export const designSha = (v: unknown): string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v) ? v : bad()
export const designVersion = (v: unknown): number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= Number.MAX_SAFE_INTEGER - 2 ? v : bad()
export function designDate(v: unknown): string {
  if (typeof v !== "string" || !/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) return bad()
  return v
}
export function designObject(v: unknown, keys: readonly string[]): Record<string, unknown> {try {return O(v, keys)} catch {return bad()}}
export function designBinding(raw: unknown): AgentDesignModelBinding {
  const v = designObject(raw, ["connection_id", "connection_revision", "model_id"])
  if (typeof v.model_id !== "string" || !/^[A-Za-z0-9._:/-]{1,120}$/.test(v.model_id)) return bad()
  return {connection_id: designId(v.connection_id), connection_revision: designVersion(v.connection_revision), model_id: v.model_id}
}
export function designSource(raw: unknown): AgentDesignRoleReference | null {
  if (raw === null) return null
  const v = designObject(raw, ["spec_id", "revision", "source_sha256"])
  return {spec_id: designId(v.spec_id), revision: designVersion(v.revision), source_sha256: designSha(v.source_sha256)}
}
export function designPurpose(raw: unknown): AgentDesignPurpose {if (raw !== "generate" && raw !== "revise") return bad(); return raw}
export function designCap(raw: unknown): 4096 | 8192 | 16384 {if (typeof raw !== "number" || !agentDesignOutputTokenLimits.some(v => v === raw)) return bad(); return raw as 4096 | 8192 | 16384}
export function designChoice(raw: unknown): AgentDesignChoice {
  const v = designObject(raw, ["action", "purpose", "instruction", "model_binding", "output_token_limit", "source"]), purpose = designPurpose(v.purpose), source = designSource(v.source)
  if (v.action !== "preview" || (purpose === "generate") !== (source === null)) return bad()
  return {action: "preview", purpose, instruction: agentDesignText(v.instruction, 2000, true), model_binding: designBinding(v.model_binding), output_token_limit: designCap(v.output_token_limit), source}
}
export const agentDesignStates = ["queued", "claimed", "reserved", "paused", "succeeded", "failed", "unknown", "cancelled", "erased"] as const
export type AgentDesignReceipt = {
  protocol: "agent_design_receipt_v1"; request_id: string; purpose: AgentDesignPurpose; model_binding: AgentDesignModelBinding; output_token_limit: 4096 | 8192 | 16384
  source: AgentDesignRoleReference | null; request_sha256: string; input_sha256: string; content_sha256: string; source_sha256: string; resources_sha256: string
  owner_governance_revision: number; owner_epoch: number; created_at: string; state: typeof agentDesignStates[number]; body_erased: boolean; recorded: true; replayed: boolean
}
export function parseAgentDesignReceipt(raw: unknown): AgentDesignReceipt {
  const v = designObject(raw, ["protocol", "request_id", "purpose", "model_binding", "output_token_limit", "source", "request_sha256", "input_sha256", "content_sha256", "source_sha256", "resources_sha256", "owner_governance_revision", "owner_epoch", "created_at", "state", "body_erased", "recorded", "replayed"])
  const purpose = designPurpose(v.purpose), source = designSource(v.source)
  if (v.protocol !== "agent_design_receipt_v1" || (purpose === "generate") !== (source === null) || !agentDesignStates.some(s => s === v.state) || v.recorded !== true || typeof v.replayed !== "boolean" || typeof v.body_erased !== "boolean" || v.body_erased !== (v.state === "erased")) return bad()
  return {protocol: "agent_design_receipt_v1", request_id: designId(v.request_id), purpose, model_binding: designBinding(v.model_binding), output_token_limit: designCap(v.output_token_limit), source,
    request_sha256: designSha(v.request_sha256), input_sha256: designSha(v.input_sha256), content_sha256: designSha(v.content_sha256), source_sha256: designSha(v.source_sha256), resources_sha256: designSha(v.resources_sha256),
    owner_governance_revision: designVersion(v.owner_governance_revision), owner_epoch: designVersion(v.owner_epoch), created_at: designDate(v.created_at), state: v.state as AgentDesignReceipt["state"], body_erased: v.body_erased, recorded: true, replayed: v.replayed}
}
export type AgentDesignPreview = {protocol: "agent_design_preview_v1"; choice: AgentDesignChoice; input_sha256: string; content_sha256: string; source_sha256: string; resources_sha256: string; byte_length: number; output_token_limit: 4096 | 8192 | 16384; fields_sent: unknown; recorded: false}
export type AgentDesignSource = {protocol: "agent_design_source_v1"; source: AgentDesignRoleReference; fields: AgentDesignEditableFields; recorded: false}
export function parseAgentDesignSource(raw: unknown): AgentDesignSource {
  const v = designObject(raw, ["protocol", "source", "fields", "recorded"]), source = designSource(v.source)
  if (v.protocol !== "agent_design_source_v1" || v.recorded !== false || !source) return bad()
  return {protocol: "agent_design_source_v1", source, fields: parseAgentDesignEditableFields(v.fields), recorded: false}
}
export function parseAgentDesignPreview(raw: unknown): AgentDesignPreview {
  const v = designObject(raw, ["protocol", "choice", "input_sha256", "content_sha256", "source_sha256", "resources_sha256", "byte_length", "output_token_limit", "fields_sent", "recorded"]), choice = designChoice(v.choice)
  if (v.protocol !== "agent_design_preview_v1" || v.recorded !== false || !Number.isSafeInteger(v.byte_length) || Number(v.byte_length) < 1 || Number(v.byte_length) > 524288 || designCap(v.output_token_limit) !== choice.output_token_limit) return bad()
  const fields = designObject(v.fields_sent, ["purpose", "instruction", "before", "current_tool_names", "tool_suggestions_are_not_grants"])
  if (fields.purpose !== choice.purpose || fields.instruction !== choice.instruction || fields.tool_suggestions_are_not_grants !== true || !Array.isArray(fields.current_tool_names) || fields.current_tool_names.length > 20 || fields.current_tool_names.some(t => typeof t !== "string" || t.length > 300)) return bad()
  if (choice.purpose === "generate" ? fields.before !== null : fields.before === null) return bad()
  if (fields.before !== null) parseAgentDesignEditableFields(fields.before)
  return {protocol: "agent_design_preview_v1", choice, input_sha256: designSha(v.input_sha256), content_sha256: designSha(v.content_sha256), source_sha256: designSha(v.source_sha256), resources_sha256: designSha(v.resources_sha256), byte_length: Number(v.byte_length), output_token_limit: choice.output_token_limit, fields_sent: agentDesignJsonValue(fields), recorded: false}
}
export type AgentDesignResultData = {protocol: "agent_design_result_data_v1"; request_id: string; result_sha256: string; result: AgentDesignModelOutput}
export function parseAgentDesignResultData(raw: unknown): AgentDesignResultData {
  const v = designObject(raw, ["protocol", "request_id", "result_sha256", "result"])
  if (v.protocol !== "agent_design_result_data_v1") return bad()
  return {protocol: "agent_design_result_data_v1", request_id: designId(v.request_id), result_sha256: designSha(v.result_sha256), result: parseAgentDesignModelOutput(v.result)}
}
export type AgentDesignView = {protocol: "agent_design_view_v1"; receipt: AgentDesignReceipt; result_status: "pending" | "unknown" | "unavailable" | "stale" | "erased" | "available"; result: AgentDesignResultData | null}
export function parseAgentDesignView(raw: unknown): AgentDesignView {
  const v = designObject(raw, ["protocol", "receipt", "result_status", "result"]), receipt = parseAgentDesignReceipt(v.receipt)
  if (v.protocol !== "agent_design_view_v1" || !["pending", "unknown", "unavailable", "stale", "erased", "available"].includes(String(v.result_status))) return bad()
  const result = v.result === null ? null : parseAgentDesignResultData(v.result)
  if (v.result_status === "available" ? !result || receipt.state !== "succeeded" || receipt.body_erased || result.request_id !== receipt.request_id : result !== null) return bad()
  if (receipt.body_erased && v.result_status !== "erased") return bad()
  const expected = ["queued", "claimed", "reserved"].includes(receipt.state) ? ["pending"] : ["unknown", "paused"].includes(receipt.state) ? ["unknown"] : receipt.state === "succeeded" ? ["available", "stale", "unavailable"] : receipt.state === "erased" ? ["erased"] : ["unavailable"]
  if (!expected.includes(String(v.result_status))) return bad()
  return {protocol: "agent_design_view_v1", receipt, result_status: v.result_status as AgentDesignView["result_status"], result}
}
export type AgentDesignControlReceipt = {protocol: "agent_design_control_receipt_v1"; request_id: string; design_request_id: string; action: "cancel" | "erase"; request_sha256: string; created_at: string; recorded: true; replayed: boolean}
export function parseAgentDesignControlReceipt(raw: unknown): AgentDesignControlReceipt {
  const v = designObject(raw, ["protocol", "request_id", "design_request_id", "action", "request_sha256", "created_at", "recorded", "replayed"])
  if (v.protocol !== "agent_design_control_receipt_v1" || v.action !== "cancel" && v.action !== "erase" || v.recorded !== true || typeof v.replayed !== "boolean" || v.request_id === v.design_request_id) return bad()
  return {protocol: "agent_design_control_receipt_v1", request_id: designId(v.request_id), design_request_id: designId(v.design_request_id), action: v.action, request_sha256: designSha(v.request_sha256), created_at: designDate(v.created_at), recorded: true, replayed: v.replayed}
}
export type AgentDesignCandidate = {name: string; spec: AgentSpecInput; tool_suggestions: string[]; candidate_sha256: string; edited: boolean; authority: false}
export function parseAgentDesignCandidate(raw: unknown): AgentDesignCandidate {
  const v = designObject(raw, ["name", "spec", "tool_suggestions", "candidate_sha256", "edited", "authority"]), specValue = O(agentDesignJsonValue(v.spec))
  if (specValue.require_approval !== true || v.authority !== false || typeof v.edited !== "boolean") return bad()
  const {require_approval: _approval, ...input} = specValue, spec = safeAgentSpec(input)
  // Normalized output must not contain unknown/private or silently dropped fields.
  if (!agentDesignSameValue(specValue, spec)) return bad()
  const fields = parseAgentDesignModelOutput({name: v.name, ...Object.fromEntries(["goal", "task_scope", "deliverables", "task_plan", "done_criteria"].map(k => [k, specValue[k]])), tools: v.tool_suggestions})
  return {name: fields.name, spec, tool_suggestions: fields.tools, candidate_sha256: designSha(v.candidate_sha256), edited: v.edited, authority: false}
}
export type AgentDesignSavePreview = {protocol: "agent_design_save_preview_v1"; design_request_id: string; purpose: AgentDesignPurpose; result_sha256: string; input_sha256: string; source_sha256: string; resources_sha256: string; fields: AgentDesignEditableFields; candidate: AgentDesignCandidate; preview_sha256: string; recorded: false}
export function parseAgentDesignSavePreview(raw: unknown): AgentDesignSavePreview {
  const v = designObject(raw, ["protocol", "design_request_id", "purpose", "result_sha256", "input_sha256", "source_sha256", "resources_sha256", "fields", "candidate", "preview_sha256", "recorded"]), fields = parseAgentDesignEditableFields(v.fields), candidate = parseAgentDesignCandidate(v.candidate)
  if (v.protocol !== "agent_design_save_preview_v1" || v.recorded !== false || candidate.name !== fields.name || ["goal", "task_scope", "deliverables", "task_plan", "done_criteria"].some(k => JSON.stringify(candidate.spec[k as keyof AgentSpecInput]) !== JSON.stringify(fields[k as keyof AgentDesignEditableFields]))) return bad()
  return {protocol: "agent_design_save_preview_v1", design_request_id: designId(v.design_request_id), purpose: designPurpose(v.purpose), result_sha256: designSha(v.result_sha256), input_sha256: designSha(v.input_sha256), source_sha256: designSha(v.source_sha256), resources_sha256: designSha(v.resources_sha256), fields, candidate, preview_sha256: designSha(v.preview_sha256), recorded: false}
}
export type AgentDesignSaveReceipt = {protocol: "agent_design_save_receipt_v1"; request_id: string; design_request_id: string; request_sha256: string; preview_sha256: string; result_sha256: string; source_sha256: string; candidate_sha256: string; purpose: AgentDesignPurpose; spec_id: string; before_revision: number | null; after_revision: number; created_at: string; recorded: true; replayed: boolean}
export function parseAgentDesignSaveReceipt(raw: unknown): AgentDesignSaveReceipt {
  const v = designObject(raw, ["protocol", "request_id", "design_request_id", "request_sha256", "preview_sha256", "result_sha256", "source_sha256", "candidate_sha256", "purpose", "spec_id", "before_revision", "after_revision", "created_at", "recorded", "replayed"]), purpose = designPurpose(v.purpose)
  const before = v.before_revision === null ? null : designVersion(v.before_revision), after = designVersion(v.after_revision)
  if (v.protocol !== "agent_design_save_receipt_v1" || v.recorded !== true || typeof v.replayed !== "boolean" || v.request_id === v.design_request_id ||
      (purpose === "generate" ? before !== null || after !== 1 : before === null || after !== before + 1)) return bad()
  return {protocol: "agent_design_save_receipt_v1", request_id: designId(v.request_id), design_request_id: designId(v.design_request_id), request_sha256: designSha(v.request_sha256), preview_sha256: designSha(v.preview_sha256), result_sha256: designSha(v.result_sha256), source_sha256: designSha(v.source_sha256), candidate_sha256: designSha(v.candidate_sha256), purpose, spec_id: designId(v.spec_id), before_revision: before, after_revision: after, created_at: designDate(v.created_at), recorded: true, replayed: v.replayed}
}
export type AgentDesignProof = {protocol: "agent_design_dispatch_v1"; request_id: string; lease_token: string; lease_version: number; worker_id: string}
export type AgentDesignClaim = AgentDesignProof & {lease_expires_at: string}
export function parseAgentDesignProof(raw: unknown): AgentDesignProof {
  const v = designObject(raw, ["protocol", "request_id", "lease_token", "lease_version", "worker_id"])
  if (v.protocol !== "agent_design_dispatch_v1") return bad()
  return {protocol: "agent_design_dispatch_v1", request_id: designId(v.request_id), lease_token: designId(v.lease_token), lease_version: designVersion(v.lease_version), worker_id: designId(v.worker_id)}
}
export function parseAgentDesignClaim(raw: unknown): AgentDesignClaim {
  const v = designObject(raw, ["protocol", "request_id", "lease_token", "lease_version", "worker_id", "lease_expires_at"]), {lease_expires_at, ...proof} = v
  return {...parseAgentDesignProof(proof), lease_expires_at: designDate(lease_expires_at)}
}
export type AgentDesignReply = {protocol: "agent_design_dispatch_reply_v1"; request_id: string; state: "succeeded" | "failed" | "unknown" | "paused"; result_sha256?: string; completion_sha256?: string}
export function parseAgentDesignReply(raw: unknown): AgentDesignReply {
  const v = O(raw), keys = ["protocol", "request_id", "state", ...(v.state === "succeeded" ? ["result_sha256"] : []), ...(Object.hasOwn(v, "completion_sha256") ? ["completion_sha256"] : [])]
  designObject(v, keys)
  if (v.protocol !== "agent_design_dispatch_reply_v1" || !["succeeded", "failed", "unknown", "paused"].includes(String(v.state)) || v.state === "paused" && Object.hasOwn(v, "completion_sha256")) return bad()
  return {protocol: "agent_design_dispatch_reply_v1", request_id: designId(v.request_id), state: v.state as AgentDesignReply["state"], ...(v.state === "succeeded" ? {result_sha256: designSha(v.result_sha256)} : {}), ...(Object.hasOwn(v, "completion_sha256") ? {completion_sha256: designSha(v.completion_sha256)} : {})}
}
