/** Closed owner metadata reads. This module grants no task execution authority. */
export const ownTodoCategories = ["all", "approval", "human_input", "paused", "effect_review", "schedule_overdue", "failed"] as const
export const ownTodoKinds = ["all", "agent_single", "agent_autonomous", "workflow_v2", "workflow_safe", "schedule"] as const
export const ownRunStatuses = ["queued", "running", "awaiting_approval", "awaiting_input", "paused", "succeeded", "failed", "cancelled"] as const
export type OwnTodoCategory = typeof ownTodoCategories[number]
export type OwnTodoKind = typeof ownTodoKinds[number]
export type OwnRunKind = Exclude<OwnTodoKind, "all" | "schedule">
export type OwnRunStatus = typeof ownRunStatuses[number]
export type OwnTodoQuery = {category: OwnTodoCategory; kind: OwnTodoKind; q: string; limit: number; before?: string}
export const ownCountKeys = ["owned_agents", "knowledge_bases", "queued", "running", "awaiting_approval", "awaiting_input", "paused", "failed_7d", "schedules_active", "schedules_overdue", "effects_need_review", "unsupported_runs"] as const
export type OwnCounts = Record<typeof ownCountKeys[number], number>
export type OwnRunMeta = {run_id: string; kind: OwnRunKind; resource_id: string; resource_name: string; status: OwnRunStatus; created_at: string; updated_at: string; finished_at: string | null}
export type OwnOverview = {protocol: "native_own_overview_v1"; scope: "current_user"; as_of: string; window_days: 7; counts: OwnCounts; recent: OwnRunMeta[]; delegated_approvals: "unavailable"}
export type OwnTodoItem = {category: Exclude<OwnTodoCategory, "all">; kind: Exclude<OwnTodoKind, "all">; id: string; resource_id: string; resource_name: string; step_key: string | null; status: OwnRunStatus | "overdue" | "unknown" | "started"; observed_at: string}
export type OwnTodoPage = {protocol: "native_own_todos_v1"; scope: "current_user"; as_of: string; category: OwnTodoCategory; kind: OwnTodoKind; q: string; limit: number; items: OwnTodoItem[]; has_more: boolean; next_cursor: string | null}
export type OwnTodoCursor = {category: OwnTodoCategory; kind: OwnTodoKind; query_sha256: string; as_of: string; observed_at: string; id: string; category_rank: number; step_key: string | null}
export type OwnOriginalTask = {kind: OwnRunKind; runId: string; resourceId: string} | {kind: "schedule"; scheduleId: string}
export type OwnOperationsReadOptions = {signal?: AbortSignal}
export type PgNativeOwnOperationsApi = {getOwnOverview(options?: OwnOperationsReadOptions): Promise<unknown>; listOwnTodos(query: OwnTodoQuery, options?: OwnOperationsReadOptions): Promise<unknown>}

export class OwnOperationsError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.name = "OwnOperationsError"; this.status = status; this.code = code }
}
const invalid = (): never => { throw new OwnOperationsError(0, "invalid_own_operations_projection") }
function object(raw: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalid()
  const own = Reflect.ownKeys(raw)
  if (own.some(k => typeof k !== "string" || !Object.getOwnPropertyDescriptor(raw, k)?.enumerable || !Object.hasOwn(Object.getOwnPropertyDescriptor(raw, k) ?? {}, "value")) || keys && (own.length !== keys.length || keys.some(k => !Object.hasOwn(raw, k)))) return invalid()
  return raw as Record<string, unknown>
}
function array(raw: unknown, max: number): unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length > max || Reflect.ownKeys(raw).length !== raw.length + 1) return invalid()
  for (let i = 0; i < raw.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(raw, String(i)) ?? {}, "value")) return invalid()
  return raw
}
function wellFormed(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0)!
    if (point >= 0xd800 && point <= 0xdfff) return false
  }
  return true
}
function text(raw: unknown, max: number, min = 0): string {
  if (typeof raw !== "string" || raw.length < min || raw.length > max || raw.includes("\0") || !wellFormed(raw)) return invalid()
  return raw
}
export function ownOperationId(raw: unknown): string { return typeof raw === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw) ? raw : invalid() }
function count(raw: unknown): number { return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 && !Object.is(raw, -0) ? raw : invalid() }
function member<T extends string>(raw: unknown, values: readonly T[]): T { return typeof raw === "string" && values.includes(raw as T) ? raw as T : invalid() }
function time(raw: unknown, microseconds = false): string {
  const pattern = microseconds ? /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/ : /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/
  if (typeof raw !== "string" || !pattern.test(raw) || raw.startsWith("0000-")) return invalid()
  const millis = microseconds ? raw.slice(0, 23) + "Z" : raw
  const parsed = Date.parse(millis)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === millis ? raw : invalid()
}
function publicTime(microseconds: string): string { return microseconds.slice(0, 23) + "Z" }
export function ownOperationsCanonical(value: unknown): string {
  const order = (v: unknown): unknown => Array.isArray(v) ? array(v, 200).map(order) : v && typeof v === "object" ? Object.fromEntries(Object.entries(object(v)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, item]) => [k, order(item)])) : v
  return JSON.stringify(order(value))
}
async function sha(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ownOperationsCanonical(value)))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")
}

/** JSON.parse alone silently accepts duplicate keys, including escaped aliases. */
export function parseOwnOperationsJson(source: string): unknown {
  if (typeof source !== "string" || source.length > 1_048_576 || source.charCodeAt(0) === 0xfeff) return invalid()
  let at = 0, nodes = 0
  const space = () => { while (/[\x20\t\r\n]/.test(source[at] ?? "!") ) at++ }
  const string = (): string => {
    const start = at++
    while (at < source.length) {
      const c = source[at++]
      if (c === "\\") { at++; continue }
      if (c === '"') { try { return JSON.parse(source.slice(start, at)) as string } catch { return invalid() } }
    }
    return invalid()
  }
  const value = (depth: number): unknown => {
    space(); if (depth > 16 || ++nodes > 10_000) return invalid()
    if (source[at] === '"') return string()
    if (source[at] === "{") {
      at++; space(); const result: Record<string, unknown> = Object.create(null)
      if (source[at] === "}") { at++; return result }
      for (;;) {
        space(); if (source[at] !== '"') return invalid()
        const key = string(); if (Object.hasOwn(result, key)) return invalid()
        space(); if (source[at++] !== ":") return invalid()
        result[key] = value(depth + 1); space()
        const end = source[at++]; if (end === "}") return result
        if (end !== ",") return invalid()
      }
    }
    if (source[at] === "[") {
      at++; space(); const result: unknown[] = []
      if (source[at] === "]") { at++; return result }
      for (;;) { result.push(value(depth + 1)); space(); const end = source[at++]; if (end === "]") return result; if (end !== ",") return invalid() }
    }
    for (const [token, literal] of [["true", true], ["false", false], ["null", null]] as const) if (source.startsWith(token, at)) { at += token.length; return literal }
    const number = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!number) return invalid()
    at += number[0].length; const result = Number(number[0]); return Number.isFinite(result) ? result : invalid()
  }
  const result = value(0); space(); if (at !== source.length) return invalid(); return result
}

export function ownTodoQuery(raw: unknown = {}): OwnTodoQuery {
  const v = object(raw)
  if (Object.keys(v).some(k => !["category", "kind", "q", "limit", "before"].includes(k))) return invalid()
  const category = member(v.category === undefined ? "all" : v.category, ownTodoCategories), kind = member(v.kind === undefined ? "all" : v.kind, ownTodoKinds)
  const rawQuery = v.q === undefined ? "" : v.q
  if (typeof rawQuery !== "string") return invalid()
  const q = text(rawQuery.trim(), 100), limit = count(v.limit === undefined ? 20 : v.limit)
  if (limit < 1 || limit > 20) return invalid()
  const before = v.before === undefined ? undefined : text(v.before, 2048, 4)
  if (before !== undefined && !/^v1\.[A-Za-z0-9_-]+$/.test(before)) return invalid()
  return {category, kind, q, limit, ...(before === undefined ? {} : {before})}
}
export const ownTodoCategoryRanks = Object.freeze({approval: 1, human_input: 2, paused: 3, effect_review: 4, schedule_overdue: 5, failed: 6})
export async function parseOwnTodoCursor(raw: unknown, query: OwnTodoQuery): Promise<OwnTodoCursor> {
  const token = text(raw, 2048, 4)
  if (!/^v1\.[A-Za-z0-9_-]+$/.test(token)) return invalid()
  let decoded: string
  try {
    const base64 = token.slice(3).replace(/-/g, "+").replace(/_/g, "/")
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    if ("v1." + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== token) return invalid()
    decoded = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes)
  } catch { return invalid() }
  const v = object(parseOwnOperationsJson(decoded), ["category", "kind", "query_sha256", "as_of", "observed_at", "id", "category_rank", "step_key"])
  if (ownOperationsCanonical(v) !== decoded) return invalid()
  const selected = ownTodoQuery(query)
  if (v.category !== selected.category || v.kind !== selected.kind || v.query_sha256 !== await sha({category: selected.category, kind: selected.kind, q: selected.q})) return invalid()
  const rank = count(v.category_rank)
  if (rank < 1 || rank > 6 || selected.category !== "all" && rank !== ownTodoCategoryRanks[selected.category]) return invalid()
  const step_key = v.step_key === null ? null : text(v.step_key, 160, 1)
  if ((rank === ownTodoCategoryRanks.effect_review) !== (step_key !== null)) return invalid()
  return {category: selected.category, kind: selected.kind, query_sha256: v.query_sha256 as string, as_of: time(v.as_of, true), observed_at: time(v.observed_at, true), id: ownOperationId(v.id), category_rank: rank, step_key}
}
export function parseOwnRunMeta(raw: unknown): OwnRunMeta {
  const v = object(raw, ["run_id", "kind", "resource_id", "resource_name", "status", "created_at", "updated_at", "finished_at"])
  const kind = member(v.kind, ownTodoKinds.slice(1, 5) as OwnRunKind[]), status = member(v.status, ownRunStatuses)
  return {run_id: ownOperationId(v.run_id), kind, resource_id: ownOperationId(v.resource_id), resource_name: text(v.resource_name, 120), status, created_at: time(v.created_at), updated_at: time(v.updated_at), finished_at: v.finished_at === null ? null : time(v.finished_at)}
}
export function parseOwnOverview(raw: unknown): OwnOverview {
  const v = object(raw, ["protocol", "scope", "as_of", "window_days", "counts", "recent", "delegated_approvals"])
  if (v.protocol !== "native_own_overview_v1" || v.scope !== "current_user" || v.window_days !== 7 || v.delegated_approvals !== "unavailable") return invalid()
  const c = object(v.counts, ownCountKeys), counts = Object.fromEntries(ownCountKeys.map(k => [k, count(c[k])])) as OwnCounts
  const recent = array(v.recent, 12).map(parseOwnRunMeta)
  if (new Set(recent.map(r => r.run_id)).size !== recent.length) return invalid()
  return {protocol: "native_own_overview_v1", scope: "current_user", as_of: time(v.as_of), window_days: 7, counts, recent, delegated_approvals: "unavailable"}
}
export function parseOwnTodoItem(raw: unknown): OwnTodoItem {
  const v = object(raw, ["category", "kind", "id", "resource_id", "resource_name", "step_key", "status", "observed_at"])
  const category = member(v.category, ownTodoCategories.slice(1) as Exclude<OwnTodoCategory, "all">[]), kind = member(v.kind, ownTodoKinds.slice(1) as Exclude<OwnTodoKind, "all">[])
  const status = member(v.status, [...ownRunStatuses, "overdue", "unknown", "started"] as const)
  const step_key = v.step_key === null ? null : text(v.step_key, 160, 1)
  const statuses = {approval: ["awaiting_approval"], human_input: ["awaiting_input"], paused: ["paused"], effect_review: ["unknown", "started"], schedule_overdue: ["overdue"], failed: ["failed"]}
  if (!statuses[category].includes(status) || (category === "schedule_overdue") !== (kind === "schedule") || (category === "effect_review") !== (step_key !== null)) return invalid()
  return {category, kind, id: ownOperationId(v.id), resource_id: ownOperationId(v.resource_id), resource_name: text(v.resource_name, 120), step_key, status, observed_at: time(v.observed_at)}
}
export function ownTodoItemKey(row: OwnTodoItem): string { return JSON.stringify([row.category, row.kind, row.id, row.step_key]) }
function compareCursorPositions(a: OwnTodoCursor, b: OwnTodoCursor): number {
  for (const key of ["observed_at", "id", "category_rank"] as const) {
    if (a[key] < b[key]) return -1
    if (a[key] > b[key]) return 1
  }
  // SQL explicitly uses COLLATE C: UTF8 bytes, not UTF16 code units.
  const encoder = new TextEncoder(), left = encoder.encode(a.step_key ?? ""), right = encoder.encode(b.step_key ?? "")
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0
}
export async function parseOwnTodoPage(raw: unknown, requested: OwnTodoQuery): Promise<OwnTodoPage> {
  const query = ownTodoQuery(requested), v = object(raw, ["protocol", "scope", "as_of", "category", "kind", "q", "limit", "items", "has_more", "next_cursor"])
  if (v.protocol !== "native_own_todos_v1" || v.scope !== "current_user" || v.category !== query.category || v.kind !== query.kind || v.q !== query.q || v.limit !== query.limit || typeof v.has_more !== "boolean") return invalid()
  const as_of = time(v.as_of), items = array(v.items, query.limit).map(parseOwnTodoItem)
  if (items.some(r => query.category !== "all" && r.category !== query.category || query.kind !== "all" && r.kind !== query.kind) || new Set(items.map(ownTodoItemKey)).size !== items.length) return invalid()
  const previous = query.before ? await parseOwnTodoCursor(query.before, query) : null
  if (previous && publicTime(previous.as_of) !== as_of) return invalid()
  let next_cursor: string | null = null
  if (v.has_more) {
    if (items.length !== query.limit) return invalid()
    const cursor = await parseOwnTodoCursor(v.next_cursor, query), last = items.at(-1)!
    if (publicTime(cursor.as_of) !== as_of || previous && cursor.as_of !== previous.as_of || cursor.id !== last.id || cursor.category_rank !== ownTodoCategoryRanks[last.category] || cursor.step_key !== last.step_key || publicTime(cursor.observed_at) !== last.observed_at || v.next_cursor === query.before) return invalid()
    // Compare cursor microseconds only. Public dates cannot establish tuple order.
    if (previous && compareCursorPositions(cursor, previous) >= 0) return invalid()
    next_cursor = v.next_cursor as string
  } else if (v.next_cursor !== null) return invalid()
  return {protocol: "native_own_todos_v1", scope: "current_user", as_of, category: query.category, kind: query.kind, q: query.q, limit: query.limit, items, has_more: v.has_more, next_cursor}
}
export function ownOriginalTodo(raw: unknown): OwnOriginalTask {
  const row = parseOwnTodoItem(raw)
  return row.kind === "schedule" ? {kind: "schedule", scheduleId: row.id} : {kind: row.kind, runId: row.id, resourceId: row.resource_id}
}
export function ownOriginalRun(raw: unknown): OwnOriginalTask { const row = parseOwnRunMeta(raw); return {kind: row.kind, runId: row.run_id, resourceId: row.resource_id} }

export function createPgNativeOwnOperationsApi({transport = fetch, rootPath = "/__pg_native", timeoutMs = 12_000}: {transport?: typeof fetch; rootPath?: "" | "/__pg_native"; timeoutMs?: number} = {}): PgNativeOwnOperationsApi {
  if (!["", "/__pg_native"].includes(rootPath) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) return invalid()
  async function get(path: string, options?: OwnOperationsReadOptions): Promise<unknown> {
    let response: Response
    try { response = await transport(rootPath + path, {method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", headers: {Accept: "application/json"}, signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)}) }
    catch { throw new OwnOperationsError(0, "own_operations_connection_unavailable") }
    // A same-owner expired read must invalidate the session even with a bad body.
    if (response.status === 401) throw new OwnOperationsError(401, "session_required")
    let result: unknown
    try { result = parseOwnOperationsJson(await response.text()) } catch { throw new OwnOperationsError(response.status, "invalid_own_operations_response") }
    if (!response.ok) {
      const v = object(result), code = v.error
      const errors: Record<number, string[]> = {400: ["invalid_own_todo_query", "invalid_own_todo_cursor"], 403: ["native_employee_identity_required", "admin_required"], 405: ["method_not_allowed"], 409: ["own_overview_unavailable"]}
      if ((Object.keys(v).join(",") !== "error" && !(Object.keys(v).length === 2 && Object.hasOwn(v, "message") && v.message === code)) || typeof code !== "string" || !errors[response.status]?.includes(code)) throw new OwnOperationsError(response.status, "own_operations_request_failed")
      throw new OwnOperationsError(response.status, code)
    }
    return result
  }
  return {
    async getOwnOverview(options) { return parseOwnOverview(await get("/api/v2/own-overview", options)) },
    async listOwnTodos(raw, options) {
      const query = ownTodoQuery(raw)
      if (query.before) await parseOwnTodoCursor(query.before, query)
      const params = new URLSearchParams({category: query.category, kind: query.kind, q: query.q, limit: String(query.limit)})
      if (query.before) params.set("before", query.before)
      return parseOwnTodoPage(await get("/api/v2/own-todos?" + params, options), query)
    },
  }
}
