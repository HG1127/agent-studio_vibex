// CT03 browser reads only. This shared contract has zero imports or server/runtime side effects.
import {parseCompanyOverview, parseCompanyEmployeePage, parseCompanyEmployeeQuery,
  companyEmployeeIsActive, type CompanyOverview, type CompanyEmployeePage,
  type CompanyEmployeeQuery, type CompanyEmployeeItem} from "../../services/pg-api/src/company-overview-contract.ts"

export type {CompanyOverview, CompanyEmployeePage, CompanyEmployeeQuery, CompanyEmployeeItem}
export {companyEmployeeIsActive}
export type CompanyOverviewReadOptions = {signal?: AbortSignal}
export type PgNativeCompanyOverviewApi = {
  getCompanyOverview(options?: CompanyOverviewReadOptions): Promise<unknown>
  listCompanyEmployees(query?: CompanyEmployeeQuery, options?: CompanyOverviewReadOptions): Promise<unknown>
}
export class PgNativeCompanyOverviewError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {super(code); this.name = "PgNativeCompanyOverviewError"; this.status = status; this.code = code}
}
const invalid = (): never => {throw new PgNativeCompanyOverviewError(503, "invalid_company_overview_response")}
const requestError = (): never => {throw new PgNativeCompanyOverviewError(400, "invalid_company_overview_request")}
function options(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return requestError()
  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (typeof key !== "string" || !keys.includes(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return requestError()
  }
  return raw as Record<string, unknown>
}
export function companyOverviewEmployeeId(raw: unknown): string {
  if (typeof raw !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw)) return requestError()
  return raw
}
export function companyOverviewEmployeeQuery(raw: unknown = {}): CompanyEmployeeQuery {
  try {return parseCompanyEmployeeQuery(raw)} catch {return requestError()}
}
export function parsePgNativeCompanyOverview(raw: unknown): CompanyOverview {
  try {return parseCompanyOverview(raw)} catch {return invalid()}
}
export function parsePgNativeCompanyEmployeePage(raw: unknown, query: unknown = {}): CompanyEmployeePage {
  const expected = companyOverviewEmployeeQuery(query)
  try {return parseCompanyEmployeePage(raw, expected)} catch {return invalid()}
}
/** Reject duplicate keys (including escaped aliases) before any DTO projection. */
export function parseCompanyOverviewJson(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length > 131072 || new TextEncoder().encode(raw).length > 131072 || raw.charCodeAt(0) === 0xfeff) return invalid()
  const source = raw
  let at = 0, nodes = 0
  const space = () => {while (/[\x20\t\r\n]/.test(source[at] ?? "!")) at++}
  const string = (): string => {
    const start = at++
    while (at < source.length) {
      const character = source[at++]
      if (character === "\\") {at++; continue}
      if (character === '"') {try {return JSON.parse(source.slice(start, at)) as string} catch {return invalid()}}
    }
    return invalid()
  }
  const value = (depth: number): unknown => {
    space(); if (depth > 12 || ++nodes > 5000) return invalid()
    if (source[at] === '"') return string()
    if (source[at] === "{") {
      at++; space(); const result: Record<string, unknown> = Object.create(null)
      if (source[at] === "}") {at++; return result}
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
      if (source[at] === "]") {at++; return result}
      for (;;) {result.push(value(depth + 1)); space(); const end = source[at++]; if (end === "]") return result; if (end !== ",") return invalid()}
    }
    for (const [token, literal] of [["true", true], ["false", false], ["null", null]] as const)
      if (source.startsWith(token, at)) {at += token.length; return literal}
    const number = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!number) return invalid()
    at += number[0].length
    const parsed = Number(number[0]); return Number.isFinite(parsed) ? parsed : invalid()
  }
  const result = value(0); space(); if (at !== source.length) return invalid(); return result
}

export function createPgNativeCompanyOverviewApi(raw: {transport?: typeof fetch; rootPath?: "" | "/__pg_native"; timeoutMs?: number} = {}): PgNativeCompanyOverviewApi {
  const config = options(raw, ["transport", "rootPath", "timeoutMs"])
  const transport = config.transport === undefined ? fetch : config.transport
  const rootPath = config.rootPath === undefined ? "/__pg_native" : config.rootPath
  const timeoutMs = config.timeoutMs === undefined ? 12000 : config.timeoutMs
  if (typeof transport !== "function" || rootPath !== "" && rootPath !== "/__pg_native" ||
      typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) return requestError()
  const send = transport as typeof fetch
  const requestTimeoutMs = timeoutMs
  async function get(path: string, rawOptions: CompanyOverviewReadOptions = {}): Promise<unknown> {
    const input = options(rawOptions, ["signal"]), signal = input.signal
    if (signal !== undefined && !(signal instanceof AbortSignal)) return requestError()
    let response: Response
    try {
      response = await send(rootPath + path, {method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store",
        referrerPolicy: "no-referrer", headers: {Accept: "application/json"},
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]) : AbortSignal.timeout(requestTimeoutMs)})
    } catch {throw new PgNativeCompanyOverviewError(0, "company_overview_connection_unavailable")}
    // Identity and demotion must clear the session even when the error body is not JSON.
    if (response.status === 401) throw new PgNativeCompanyOverviewError(401, "session_required")
    if (response.status === 403) throw new PgNativeCompanyOverviewError(403, "admin_required")
    if (!response.ok) throw new PgNativeCompanyOverviewError(response.status, "company_overview_read_failed")
    try {return parseCompanyOverviewJson(await response.text())} catch {return invalid()}
  }
  return Object.freeze({
    async getCompanyOverview(readOptions?: CompanyOverviewReadOptions) {return parsePgNativeCompanyOverview(await get("/api/v2/company-overview", readOptions))},
    async listCompanyEmployees(rawQuery: CompanyEmployeeQuery = {limit: 20, after: null}, readOptions?: CompanyOverviewReadOptions) {
      const query = companyOverviewEmployeeQuery(rawQuery)
      const tail = "?limit=" + query.limit + (query.after === null ? "" : "&after=" + query.after)
      return parsePgNativeCompanyEmployeePage(await get("/api/v2/company-overview/employees" + tail, readOptions), query)
    },
  })
}
