// Browser-safe values only. No identity, DB state, owner, grant or fee authority.
import {agentDescriptiveLimits} from "../../../shared/agent-role-limits.mjs"

export const agentTemplateMarketProtocol = "agent_template_market_snapshot_v1" as const
export const agentTemplateMarketCategories = Object.freeze(["research", "knowledge", "data", "other"] as const)
export type AgentTemplateMarketCategory = typeof agentTemplateMarketCategories[number]
export const agentTemplateMarketCategoryLabels = Object.freeze({research: "研究", knowledge: "问答", data: "分析", other: "其他"})
export const agentTemplateMarketBuiltinTools = Object.freeze(["calculate", "summarize", "knowledge_search", "web_search", "web_fetch"] as const)
export type AgentTemplateMarketBuiltinTool = typeof agentTemplateMarketBuiltinTools[number]
export type AgentTemplateMarketOperation = "publish" | "use" | "unpublish" | "republish" | "delete"
export const agentTemplateMarketPublishAcknowledgement = "PUBLISH_REVIEWED_AGENT_TEMPLATE" as const
export const agentTemplateMarketMaxValueBytes = 524288

export class AgentTemplateMarketValueError extends Error {
  readonly status = 400
  readonly code = "invalid_agent_template_market_value"
  constructor() {super("invalid_agent_template_market_value"); this.name = "AgentTemplateMarketValueError"}
}
export const invalidAgentTemplateMarketValue = (): never => {throw new AgentTemplateMarketValueError()}

/** Accessors, symbols, hidden properties and nonplain input are not JSON values. */
export function agentTemplateMarketObject(raw: unknown, required: readonly string[] = [], optional: readonly string[] = []): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalidAgentTemplateMarketValue()
  const descriptors = Object.getOwnPropertyDescriptors(raw), names = Reflect.ownKeys(raw)
  if (required.some(key => !Object.hasOwn(descriptors, key)) || names.some(key => typeof key !== "string" ||
    !required.includes(key) && !optional.includes(key) || !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value"))) return invalidAgentTemplateMarketValue()
  return Object.fromEntries(names.map(key => [key, Object.getOwnPropertyDescriptor(raw, key)!.value]))
}
export function agentTemplateMarketArray(raw: unknown, max: number): unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length > max || Reflect.ownKeys(raw).length !== raw.length + 1) return invalidAgentTemplateMarketValue()
  return Array.from({length: raw.length}, (_, index) => {
    const d = Object.getOwnPropertyDescriptor(raw, String(index))
    if (!d?.enumerable || !Object.hasOwn(d, "value")) return invalidAgentTemplateMarketValue()
    return d.value
  })
}
export function agentTemplateMarketText(raw: unknown, max: number, required = false): string {
  if (typeof raw !== "string" || raw.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(raw)) return invalidAgentTemplateMarketValue()
  for (const c of raw) if (c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff) return invalidAgentTemplateMarketValue()
  const value = raw.trim()
  if (required && !value) return invalidAgentTemplateMarketValue()
  return value
}
export function agentTemplateMarketInteger(raw: unknown, min = 0): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < min || Object.is(raw, -0)) return invalidAgentTemplateMarketValue()
  return raw
}
export function agentTemplateMarketBoolean(raw: unknown): boolean {
  if (typeof raw !== "boolean") return invalidAgentTemplateMarketValue()
  return raw
}
export function agentTemplateMarketId(raw: unknown): string {
  if (typeof raw !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw)) return invalidAgentTemplateMarketValue()
  return raw.toLowerCase()
}
export function agentTemplateMarketSha(raw: unknown): string {
  if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw)) return invalidAgentTemplateMarketValue()
  return raw
}
export function agentTemplateMarketCategory(raw: unknown): AgentTemplateMarketCategory {
  if (typeof raw !== "string" || !agentTemplateMarketCategories.some(value => value === raw)) return invalidAgentTemplateMarketValue()
  return raw as AgentTemplateMarketCategory
}

export type AgentTemplateMarketDescriptions = {goal: string; task_scope: string; deliverables: string[]; task_plan: string[]; done_criteria: string[]}
export const agentTemplateMarketDescriptionKeys = Object.freeze(["goal", "task_scope", "deliverables", "task_plan", "done_criteria"] as const)
export function parseAgentTemplateMarketDescriptions(raw: unknown): AgentTemplateMarketDescriptions {
  const v = agentTemplateMarketObject(raw, agentTemplateMarketDescriptionKeys)
  const list = (items: unknown) => agentTemplateMarketArray(items, agentDescriptiveLimits.list_items).map(item => agentTemplateMarketText(item, agentDescriptiveLimits.list_item))
  return {goal: agentTemplateMarketText(v.goal, agentDescriptiveLimits.goal, true), task_scope: agentTemplateMarketText(v.task_scope, agentDescriptiveLimits.task_scope),
    deliverables: list(v.deliverables), task_plan: list(v.task_plan), done_criteria: list(v.done_criteria)}
}
export type AgentTemplateMarketSpec = AgentTemplateMarketDescriptions & {tools: AgentTemplateMarketBuiltinTool[]; knowledge_base_ids: []; quality_checks: []; require_approval: true; require_plan_review: boolean}
export type AgentTemplateMarketSnapshot = {protocol: typeof agentTemplateMarketProtocol; spec: AgentTemplateMarketSpec}
export function parseAgentTemplateMarketSnapshot(raw: unknown): AgentTemplateMarketSnapshot {
  const v = agentTemplateMarketObject(raw, ["protocol", "spec"])
  if (v.protocol !== agentTemplateMarketProtocol) return invalidAgentTemplateMarketValue()
  const spec = agentTemplateMarketObject(v.spec, [...agentTemplateMarketDescriptionKeys, "tools", "knowledge_base_ids", "quality_checks", "require_approval", "require_plan_review"])
  if (spec.require_approval !== true || agentTemplateMarketArray(spec.knowledge_base_ids, 0).length || agentTemplateMarketArray(spec.quality_checks, 0).length) return invalidAgentTemplateMarketValue()
  const tools = agentTemplateMarketArray(spec.tools, agentTemplateMarketBuiltinTools.length).map(tool => {
    if (!agentTemplateMarketBuiltinTools.some(value => value === tool)) return invalidAgentTemplateMarketValue()
    return tool as AgentTemplateMarketBuiltinTool
  })
  if (new Set(tools).size !== tools.length) return invalidAgentTemplateMarketValue()
  const descriptions = Object.fromEntries(agentTemplateMarketDescriptionKeys.map(key => [key, spec[key]]))
  return {protocol: agentTemplateMarketProtocol, spec: {...parseAgentTemplateMarketDescriptions(descriptions), tools,
    knowledge_base_ids: [], quality_checks: [], require_approval: true, require_plan_review: agentTemplateMarketBoolean(spec.require_plan_review)}}
}

export type AgentTemplateMarketSourcePin = {spec_id: string; revision: number; source_sha256: string}
export type AgentTemplateMarketPin = {template_id: string; revision: number; snapshot_sha256: string}
export function parseAgentTemplateMarketSourcePin(raw: unknown): AgentTemplateMarketSourcePin {
  const v = agentTemplateMarketObject(raw, ["spec_id", "revision", "source_sha256"])
  return {spec_id: agentTemplateMarketId(v.spec_id), revision: agentTemplateMarketInteger(v.revision, 1), source_sha256: agentTemplateMarketSha(v.source_sha256)}
}
export function parseAgentTemplateMarketPin(raw: unknown): AgentTemplateMarketPin {
  const v = agentTemplateMarketObject(raw, ["template_id", "revision", "snapshot_sha256"])
  return {template_id: agentTemplateMarketId(v.template_id), revision: agentTemplateMarketInteger(v.revision, 1), snapshot_sha256: agentTemplateMarketSha(v.snapshot_sha256)}
}
export function parseAgentTemplateMarketQuery(raw: unknown) {
  const v = agentTemplateMarketObject(raw, [], ["category", "search"])
  return {category: v.category === undefined || v.category === "all" ? "all" as const : agentTemplateMarketCategory(v.category),
    search: v.search === undefined ? "" : agentTemplateMarketText(v.search, 200)}
}

export type AgentTemplateMarketPublishChoice = {action: "preview_publish"; source: AgentTemplateMarketSourcePin; name: string; description: string; category: AgentTemplateMarketCategory}
export type AgentTemplateMarketUseChoice = {action: "preview_use"; template: AgentTemplateMarketPin; copy_name: string}
export function parseAgentTemplateMarketPublishChoice(raw: unknown): AgentTemplateMarketPublishChoice {
  const v = agentTemplateMarketObject(raw, ["action", "source", "name", "description", "category"])
  if (v.action !== "preview_publish") return invalidAgentTemplateMarketValue()
  return {action: "preview_publish", source: parseAgentTemplateMarketSourcePin(v.source), name: agentTemplateMarketText(v.name, 120),
    description: agentTemplateMarketText(v.description, 120, true), category: agentTemplateMarketCategory(v.category)}
}
export function parseAgentTemplateMarketUseChoice(raw: unknown): AgentTemplateMarketUseChoice {
  const v = agentTemplateMarketObject(raw, ["action", "template", "copy_name"])
  if (v.action !== "preview_use") return invalidAgentTemplateMarketValue()
  return {action: "preview_use", template: parseAgentTemplateMarketPin(v.template), copy_name: agentTemplateMarketText(v.copy_name, 120)}
}
export type AgentTemplateMarketPublishIntent = Omit<AgentTemplateMarketPublishChoice, "action"> & {action: "publish"; request_id: string; expected_snapshot_sha256: string; confirm: true; acknowledgement: typeof agentTemplateMarketPublishAcknowledgement}
export function parseAgentTemplateMarketPublishIntent(raw: unknown): AgentTemplateMarketPublishIntent {
  const v = agentTemplateMarketObject(raw, ["action", "request_id", "source", "name", "description", "category", "expected_snapshot_sha256", "confirm", "acknowledgement"])
  if (v.action !== "publish" || v.confirm !== true || v.acknowledgement !== agentTemplateMarketPublishAcknowledgement) return invalidAgentTemplateMarketValue()
  const {action: _action, ...choice} = parseAgentTemplateMarketPublishChoice({action: "preview_publish", source: v.source, name: v.name, description: v.description, category: v.category})
  return {...choice, action: "publish", request_id: agentTemplateMarketId(v.request_id), expected_snapshot_sha256: agentTemplateMarketSha(v.expected_snapshot_sha256), confirm: true, acknowledgement: agentTemplateMarketPublishAcknowledgement}
}
export type AgentTemplateMarketUseIntent = {action: "use"; request_id: string; template: AgentTemplateMarketPin; copy_name: string; expected_copy_sha256: string; confirm: true}
export function parseAgentTemplateMarketUseIntent(raw: unknown): AgentTemplateMarketUseIntent {
  const v = agentTemplateMarketObject(raw, ["action", "request_id", "template", "copy_name", "expected_copy_sha256", "confirm"])
  if (v.action !== "use" || v.confirm !== true) return invalidAgentTemplateMarketValue()
  const choice = parseAgentTemplateMarketUseChoice({action: "preview_use", template: v.template, copy_name: v.copy_name})
  return {action: "use", request_id: agentTemplateMarketId(v.request_id), template: choice.template, copy_name: choice.copy_name,
    expected_copy_sha256: agentTemplateMarketSha(v.expected_copy_sha256), confirm: true}
}
export type AgentTemplateMarketLifecycleIntent = {action: "unpublish" | "republish" | "delete"; request_id: string; template: AgentTemplateMarketPin; confirm: true}
export function parseAgentTemplateMarketLifecycleIntent(raw: unknown): AgentTemplateMarketLifecycleIntent {
  const v = agentTemplateMarketObject(raw, ["action", "request_id", "template", "confirm"])
  if ((v.action !== "unpublish" && v.action !== "republish" && v.action !== "delete") || v.confirm !== true) return invalidAgentTemplateMarketValue()
  return {action: v.action, request_id: agentTemplateMarketId(v.request_id), template: parseAgentTemplateMarketPin(v.template), confirm: true}
}
export function parseAgentTemplateMarketRecovery(raw: unknown) {
  const v = agentTemplateMarketObject(raw, ["action", "request_id"])
  if (v.action !== "recover") return invalidAgentTemplateMarketValue()
  return {action: "recover" as const, request_id: agentTemplateMarketId(v.request_id)}
}

/** Canonical bytes bind displayed values only. They never establish DB facts. */
export function agentTemplateMarketCanonicalJson(raw: unknown): string {
  let nodes = 0
  const walk = (value: unknown, depth: number): unknown => {
    if (++nodes > 10000 || depth > 24) return invalidAgentTemplateMarketValue()
    if (value === null || typeof value === "boolean") return value
    if (typeof value === "number") {if (!Number.isFinite(value) || Object.is(value, -0)) return invalidAgentTemplateMarketValue(); return value}
    if (typeof value === "string") {agentTemplateMarketText(value, agentTemplateMarketMaxValueBytes); return value}
    if (Array.isArray(value)) return agentTemplateMarketArray(value, 1000).map(item => walk(item, depth + 1))
    if (!value || typeof value !== "object") return invalidAgentTemplateMarketValue()
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== "string")) return invalidAgentTemplateMarketValue()
    const v = agentTemplateMarketObject(value, keys as string[]), out = Object.create(null) as Record<string, unknown>
    for (const key of Object.keys(v).sort()) {agentTemplateMarketText(key, 1000); out[key] = walk(v[key], depth + 1)}
    return out
  }
  const text = JSON.stringify(walk(raw, 0))
  if (new TextEncoder().encode(text).byteLength > agentTemplateMarketMaxValueBytes) return invalidAgentTemplateMarketValue()
  return text
}
export async function agentTemplateMarketDigest(raw: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(agentTemplateMarketCanonicalJson(raw))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}
