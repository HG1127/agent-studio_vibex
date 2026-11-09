// Value validation only, safe for browser use. No identity, source, fee, lease,
// provider or save authority is created by decoding a design result.
import {agentDescriptiveLimits} from "../../../shared/agent-role-limits.mjs"

export const agentDesignInstructionLimit = 2000
export const agentDesignOutputTokenLimits = Object.freeze([4096, 8192, 16384] as const)
export type AgentDesignPurpose = "generate" | "revise"
export type AgentDesignModelBinding = {connection_id: string; connection_revision: number; model_id: string}
export type AgentDesignRoleReference = {spec_id: string; revision: number; source_sha256: string}
export type AgentDesignChoice = {action: "preview"; purpose: AgentDesignPurpose; instruction: string; model_binding: AgentDesignModelBinding;
  output_token_limit: typeof agentDesignOutputTokenLimits[number]; source: AgentDesignRoleReference | null}
export const agentDesignMaxModelJsonBytes = 393216
export const agentDesignMaxPrivateInputBytes = 524288
export const agentDesignDescriptionKeys = Object.freeze(["goal", "task_scope", "deliverables", "task_plan", "done_criteria"] as const)
export type AgentDesignDescriptions = {goal: string; task_scope: string; deliverables: string[]; task_plan: string[]; done_criteria: string[]}
export type AgentDesignEditableFields = AgentDesignDescriptions & {name: string}
export type AgentDesignModelOutput = AgentDesignEditableFields & {tools: string[]}
export class AgentDesignValueError extends Error {
  readonly status = 400
  readonly code = "invalid_agent_design_value"
  constructor() {super("invalid_agent_design_value"); this.name = "AgentDesignValueError"}
}
export const invalidAgentDesignValue = (): never => {throw new AgentDesignValueError()}
export function agentDesignSameValue(a: unknown, b: unknown): boolean {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0).map(([k, x]) => [k, stable(x)])) : v
  return JSON.stringify(stable(agentDesignJsonValue(a))) === JSON.stringify(stable(agentDesignJsonValue(b)))
}
export function agentDesignObject(raw: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalidAgentDesignValue()
  const names = Reflect.ownKeys(raw), descriptors = Object.getOwnPropertyDescriptors(raw)
  if (keys && (names.length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key)))) return invalidAgentDesignValue()
  if (names.some(key => typeof key !== "string" || keys && !keys.includes(key) || !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value"))) return invalidAgentDesignValue()
  return Object.fromEntries(names.map(key => [key, Object.getOwnPropertyDescriptor(raw, key)!.value]))
}
export function agentDesignArray(raw: unknown, max: number): unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length > max || Reflect.ownKeys(raw).length !== raw.length + 1) return invalidAgentDesignValue()
  return Array.from({length: raw.length}, (_, index) => {
    const d = Object.getOwnPropertyDescriptor(raw, String(index))
    if (!d?.enumerable || !Object.hasOwn(d, "value")) return invalidAgentDesignValue()
    return d.value
  })
}
export function agentDesignText(raw: unknown, max: number, required = false): string {
  if (typeof raw !== "string" || raw.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(raw)) return invalidAgentDesignValue()
  for (const c of raw) if (c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff) return invalidAgentDesignValue()
  const value = raw.trim()
  if (required && !value) return invalidAgentDesignValue()
  return value
}
const list = (raw: unknown) => agentDesignArray(raw, agentDescriptiveLimits.list_items).map(item => agentDesignText(item, agentDescriptiveLimits.list_item))
export function parseAgentDesignEditableFields(raw: unknown): AgentDesignEditableFields {
  const v = agentDesignObject(raw, ["name", ...agentDesignDescriptionKeys])
  return {name: agentDesignText(v.name, 120, true), goal: agentDesignText(v.goal, agentDescriptiveLimits.goal, true),
    task_scope: agentDesignText(v.task_scope, agentDescriptiveLimits.task_scope), deliverables: list(v.deliverables),
    task_plan: list(v.task_plan), done_criteria: list(v.done_criteria)}
}
export function parseAgentDesignModelOutput(raw: unknown): AgentDesignModelOutput {
  const v = agentDesignObject(raw, ["name", ...agentDesignDescriptionKeys, "tools"])
  const {tools, ...fields} = v
  return {...parseAgentDesignEditableFields(fields), tools: agentDesignArray(tools, 20).map(item => agentDesignText(item, 300))}
}
/** Closed JSON tree copy before any canonicalization/hash; accessors never run. */
export function agentDesignJsonValue(raw: unknown, depth = 0, budget = {nodes: 10000}): unknown {
  if (depth > 24 || --budget.nodes < 0) return invalidAgentDesignValue()
  if (raw === null || typeof raw === "boolean") return raw
  if (typeof raw === "number") {if (!Number.isFinite(raw) || Object.is(raw, -0)) return invalidAgentDesignValue(); return raw}
  if (typeof raw === "string") {agentDesignText(raw, agentDesignMaxPrivateInputBytes); return raw}
  if (Array.isArray(raw)) return agentDesignArray(raw, 1000).map(item => agentDesignJsonValue(item, depth + 1, budget))
  const v = agentDesignObject(raw), out = Object.create(null) as Record<string, unknown>
  for (const key of Object.keys(v)) {agentDesignText(key, 1000); out[key] = agentDesignJsonValue(v[key], depth + 1, budget)}
  return out
}
/** Duplicate-key detection includes escaped aliases at every nesting level. */
function decodeAgentDesignJson(raw: unknown, maxBytes: number, allowFence: boolean): unknown {
  if (typeof raw !== "string" || raw.length > maxBytes || new TextEncoder().encode(raw).length > maxBytes || raw.charCodeAt(0) === 0xfeff) return invalidAgentDesignValue()
  let source = raw.trim()
  if (source.startsWith("```")) {
    if (!allowFence) return invalidAgentDesignValue()
    const fence = /^```(?:json)?[\t ]*\r?\n([\s\S]*)\r?\n```$/i.exec(source)
    if (!fence) return invalidAgentDesignValue()
    source = fence[1]!
  }
  let at = 0, nodes = 0
  const space = () => {while (/[\x20\t\r\n]/.test(source[at] ?? "!")) at++}
  const string = (): string => {
    const start = at++
    while (at < source.length) {
      const c = source[at++]
      if (c === "\\") {at++; continue}
      if (c === '"') {try {return JSON.parse(source.slice(start, at)) as string} catch {return invalidAgentDesignValue()}}
    }
    return invalidAgentDesignValue()
  }
  const value = (depth: number): unknown => {
    space(); if (depth > 24 || ++nodes > 10000) return invalidAgentDesignValue()
    if (source[at] === '"') return string()
    if (source[at] === "{") {
      at++; space(); const out: Record<string, unknown> = Object.create(null)
      if (source[at] === "}") {at++; return out}
      for (;;) {
        space(); if (source[at] !== '"') return invalidAgentDesignValue()
        const key = string(); if (Object.hasOwn(out, key)) return invalidAgentDesignValue()
        space(); if (source[at++] !== ":") return invalidAgentDesignValue()
        out[key] = value(depth + 1); space()
        const end = source[at++]; if (end === "}") return out; if (end !== ",") return invalidAgentDesignValue()
      }
    }
    if (source[at] === "[") {
      at++; space(); const out: unknown[] = []
      if (source[at] === "]") {at++; return out}
      for (;;) {out.push(value(depth + 1)); space(); const end = source[at++]; if (end === "]") return out; if (end !== ",") return invalidAgentDesignValue()}
    }
    for (const [token, literal] of [["true", true], ["false", false], ["null", null]] as const) if (source.startsWith(token, at)) {at += token.length; return literal}
    const n = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!n) return invalidAgentDesignValue()
    at += n[0].length; const number = Number(n[0]); if (!Number.isFinite(number)) return invalidAgentDesignValue(); return number
  }
  const out = value(0); space(); if (at !== source.length) return invalidAgentDesignValue()
  return out
}
export function parseAgentDesignTransportJson(raw: unknown): unknown {
  return decodeAgentDesignJson(raw, 524288, false)
}
export function parseAgentDesignModelJson(raw: unknown): AgentDesignModelOutput {
  return parseAgentDesignModelOutput(decodeAgentDesignJson(raw, agentDesignMaxModelJsonBytes, true))
}
