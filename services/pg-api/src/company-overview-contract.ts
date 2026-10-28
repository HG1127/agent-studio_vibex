// CT03 metadata contract only. Authorization, SQL and runtime liveness are external preconditions.
// No imports: this module can also be decoded in a browser without backend dependencies.
export const companyOperationalCountKeys = Object.freeze([
  "agent_running", "workflow_running", "pending_approvals", "human_input",
  "failed_7d", "overdue_schedules", "knowledge_bases",
] as const)
export const companyTotalCountKeys = Object.freeze(["employees", "active", ...companyOperationalCountKeys] as const)
export type CompanyOperationalCounts = Record<typeof companyOperationalCountKeys[number], number>
export type CompanyTotals = CompanyOperationalCounts & {employees: number; active: number}
export type CompanyWorkerHealth = {availability: "unavailable"; reason: "telemetry_not_installed"}
export type CompanyEmployeeQuery = {limit: number; after: string | null}
export type CompanyEmployeeItem = CompanyOperationalCounts & {
  employee_id: string; display_name: string; is_admin: boolean; enabled: boolean; status: "active" | "disabled"
}
export type CompanyOverview = {
  protocol: "native_company_overview_v1"; scope: "company_metadata_only"; as_of: string
  window_days: 7; totals: CompanyTotals; worker: CompanyWorkerHealth
}
export type CompanyEmployeePage = {
  protocol: "native_company_employee_stats_v1"; scope: "company_metadata_only"; as_of: string
  limit: number; items: CompanyEmployeeItem[]; has_more: boolean; next_after: string | null
}
export type CompanyOverviewRoute = {route: "overview"} | {route: "employees"; query: CompanyEmployeeQuery}

export class CompanyOverviewContractError extends Error {
  readonly status: 400 | 409
  readonly code: string
  constructor(status: 400 | 409, code: string) {
    super(code)
    this.name = "CompanyOverviewContractError"
    this.status = status
    this.code = code
  }
}
type Failure = () => never
const invalid: Failure = () => {throw new CompanyOverviewContractError(409, "invalid_company_overview_projection")}
const queryError: Failure = () => {throw new CompanyOverviewContractError(400, "invalid_company_employee_query")}
const overviewQueryError: Failure = () => {throw new CompanyOverviewContractError(400, "invalid_company_overview_query")}

function object(raw: unknown, required: readonly string[], optional: readonly string[] = [], fail: Failure = invalid): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return fail()
  const descriptors = Object.getOwnPropertyDescriptors(raw), keys = Reflect.ownKeys(raw)
  if (keys.some(key => typeof key !== "string" || ![...required, ...optional].includes(key) ||
      !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value")) ||
      required.some(key => !Object.hasOwn(descriptors, key))) return fail()
  return raw as Record<string, unknown>
}
function array(raw: unknown, max: number): unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length > max ||
      Reflect.ownKeys(raw).length !== raw.length + 1) return invalid()
  const result: unknown[] = []
  for (let i = 0; i < raw.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(i))
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return invalid()
    result.push(descriptor.value)
  }
  return result
}
function wellFormed(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0)!
    if (point >= 0xd800 && point <= 0xdfff) return false
  }
  return true
}
function employeeId(raw: unknown, fail: Failure = invalid): string {
  if (typeof raw !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw)) return fail()
  return raw
}
function stamp(raw: unknown): string {
  if (typeof raw !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw) || raw.startsWith("0000-")) return invalid()
  const value = Date.parse(raw)
  if (!Number.isFinite(value) || new Date(value).toISOString() !== raw) return invalid()
  return raw
}
export function companyCount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || Object.is(raw, -0)) return invalid()
  return raw
}
export function companyDatabaseCount(raw: unknown): number {
  // The repository must explicitly project PostgreSQL COUNT as canonical text.
  if (typeof raw !== "string" || raw.length > 16 || !/^(?:0|[1-9][0-9]*)$/.test(raw)) return invalid()
  return companyCount(Number(raw))
}
function operationalCounts(raw: Record<string, unknown>): CompanyOperationalCounts {
  return {
    agent_running: companyCount(raw.agent_running), workflow_running: companyCount(raw.workflow_running),
    pending_approvals: companyCount(raw.pending_approvals), human_input: companyCount(raw.human_input),
    failed_7d: companyCount(raw.failed_7d), overdue_schedules: companyCount(raw.overdue_schedules),
    knowledge_bases: companyCount(raw.knowledge_bases),
  }
}
export function parseCompanyTotals(raw: unknown): CompanyTotals {
  const value = object(raw, companyTotalCountKeys)
  const employees = companyCount(value.employees), active = companyCount(value.active)
  if (active > employees) return invalid()
  return {employees, active, ...operationalCounts(value)}
}
export function parseCompanyWorkerHealth(raw: unknown): CompanyWorkerHealth {
  const value = object(raw, ["availability", "reason"])
  if (value.availability !== "unavailable" || value.reason !== "telemetry_not_installed") return invalid()
  return {availability: "unavailable", reason: "telemetry_not_installed"}
}
export function normalizeCompanyDisplayName(raw: unknown): string {
  // Explicit producer-side display policy; DTO decoding below never silently truncates.
  if (typeof raw !== "string" || raw.includes("\0") || !wellFormed(raw)) return invalid()
  let name = raw.trim().slice(0, 200)
  const last = name.charCodeAt(name.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) name = name.slice(0, -1)
  return name.trimEnd() || "员工"
}
export function parseCompanyEmployeeItem(raw: unknown): CompanyEmployeeItem {
  const value = object(raw, ["employee_id", "display_name", "is_admin", "enabled", "status", ...companyOperationalCountKeys])
  if (typeof value.display_name !== "string" || !value.display_name.length || value.display_name.length > 200 ||
      value.display_name.trim() !== value.display_name || value.display_name.includes("\0") || !wellFormed(value.display_name) ||
      typeof value.is_admin !== "boolean" || typeof value.enabled !== "boolean" ||
      value.status !== "active" && value.status !== "disabled") return invalid()
  return {employee_id: employeeId(value.employee_id), display_name: value.display_name,
    is_admin: value.is_admin, enabled: value.enabled, status: value.status, ...operationalCounts(value)}
}
export function companyEmployeeIsActive(raw: unknown): boolean {
  // Presentation only: neither this helper nor an is_admin field authorizes a request.
  const item = parseCompanyEmployeeItem(raw)
  return item.enabled && item.status === "active"
}
export function parseCompanyOverviewQuery(raw: unknown = {}): Record<string, never> {
  object(raw, [], [], overviewQueryError)
  return {}
}
export function parseCompanyEmployeeQuery(raw: unknown = {}): CompanyEmployeeQuery {
  const value = object(raw, [], ["limit", "after"], queryError)
  const limit = Object.hasOwn(value, "limit") ? value.limit : 20
  const after = Object.hasOwn(value, "after") ? value.after : null
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 20) return queryError()
  return {limit, after: after === null ? null : employeeId(after, queryError)}
}
export function parseCompanyOverviewUrl(raw: unknown): CompanyOverviewRoute {
  if (typeof raw !== "string" || raw.length > 256 || /[^\x21-\x7e]/.test(raw) || raw.includes("#")) return overviewQueryError()
  const overview = "/api/v2/company-overview", employees = overview + "/employees"
  if (raw === overview) return {route: "overview"}
  if (raw !== employees && !raw.startsWith(employees + "?")) return overviewQueryError()
  const query: Record<string, unknown> = {}
  if (raw !== employees) {
    const tail = raw.slice(employees.length + 1)
    if (!tail) return queryError()
    for (const pair of tail.split("&")) {
      const at = pair.indexOf("="), key = pair.slice(0, at), value = pair.slice(at + 1)
      if (at < 1 || !["limit", "after"].includes(key) || Object.hasOwn(query, key)) return queryError()
      // These fields have canonical ASCII values; percent/plus aliases are unnecessary and refused.
      if (key === "limit") {
        if (!/^(?:[1-9]|1[0-9]|20)$/.test(value)) return queryError()
        query.limit = Number(value)
      } else query.after = employeeId(value, queryError)
    }
  }
  return {route: "employees", query: parseCompanyEmployeeQuery(query)}
}
export function parseCompanyOverview(raw: unknown): CompanyOverview {
  const value = object(raw, ["protocol", "scope", "as_of", "window_days", "totals", "worker"])
  if (value.protocol !== "native_company_overview_v1" || value.scope !== "company_metadata_only" || value.window_days !== 7) return invalid()
  return {protocol: value.protocol, scope: value.scope, as_of: stamp(value.as_of), window_days: 7,
    totals: parseCompanyTotals(value.totals), worker: parseCompanyWorkerHealth(value.worker)}
}
export function parseCompanyEmployeePage(raw: unknown, query: unknown = {}): CompanyEmployeePage {
  const expected = parseCompanyEmployeeQuery(query)
  const value = object(raw, ["protocol", "scope", "as_of", "limit", "items", "has_more", "next_after"])
  if (value.protocol !== "native_company_employee_stats_v1" || value.scope !== "company_metadata_only" ||
      value.limit !== expected.limit || typeof value.has_more !== "boolean") return invalid()
  const items = array(value.items, expected.limit).map(parseCompanyEmployeeItem)
  let previous = expected.after
  for (const item of items) {
    if (previous !== null && item.employee_id <= previous) return invalid()
    previous = item.employee_id
  }
  let next_after: string | null = null
  if (value.has_more) {
    if (items.length !== expected.limit) return invalid()
    next_after = employeeId(value.next_after)
    if (next_after !== previous) return invalid()
  } else if (value.next_after !== null) return invalid()
  return {protocol: value.protocol, scope: value.scope, as_of: stamp(value.as_of), limit: expected.limit,
    items, has_more: value.has_more, next_after}
}
