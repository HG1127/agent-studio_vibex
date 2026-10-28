// Optional CT03 transport. The repository rechecks current Native admin authority
// in the same statement snapshot as its metadata projection on every read.
import type {IncomingMessage, ServerResponse} from "node:http"
import {HttpError, type Identity} from "./contracts.ts"
import {nativeSessionToken, verifyNativeOrigin} from "./native-auth-http.mjs"
import {CompanyOverviewContractError, parseCompanyOverviewUrl, parseCompanyOverview, parseCompanyEmployeePage,
  type CompanyEmployeeQuery} from "./company-overview-contract.ts"

export type CompanyOverviewReads = {
  overview(identity: Identity): Promise<unknown>
  employees(identity: Identity, query: CompanyEmployeeQuery): Promise<unknown>
}
export type CompanyOverviewHttpDependencies = {
  repository: CompanyOverviewReads
  authenticateRequest(req: IncomingMessage): Promise<Identity>
  allowedOrigin: string
}
const base = "/api/v2/company-overview"
const headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin", "X-Frame-Options": "DENY"}
const inputCodes = ["invalid_company_overview_query", "invalid_company_employee_query"]
const unavailable = (): never => {throw new HttpError(503, "company_overview_unavailable")}
function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {...headers, ...(status === 405 ? {Allow: "GET"} : {})})
  res.end(JSON.stringify(body))
}
function claimed(raw: string): boolean {return raw === base || raw.startsWith(base + "/")}
function owns(raw: string): boolean {
  const first = raw.split(/[?#]/, 1)[0] ?? ""
  if (claimed(first)) return true
  try {
    const path = new URL(raw, "http://127.0.0.1").pathname
    // Encoded/normalized aliases are claimed for rejection, never dispatched.
    return claimed(path) || claimed(decodeURIComponent(path))
  } catch {return false}
}
async function emptyBody(req: IncomingMessage) {
  if (req.headers["transfer-encoding"] !== undefined ||
      req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0")
    throw new HttpError(400, "invalid_company_overview_query")
  for await (const chunk of req) if (Buffer.byteLength(chunk) > 0) throw new HttpError(400, "invalid_company_overview_query")
}
function projection<T>(decode: () => T): T {
  try {
    const value = decode()
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 131072) return unavailable()
    return value
  } catch {return unavailable()}
}
export function createCompanyOverviewHttpHandler({repository, authenticateRequest, allowedOrigin}: CompanyOverviewHttpDependencies) {
  if (!repository || typeof repository.overview !== "function" || typeof repository.employees !== "function" ||
      typeof authenticateRequest !== "function") throw Error("invalid_company_overview_dependencies")
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (!owns(req.url ?? "")) return false
    try {
      try {verifyNativeOrigin(req, allowedOrigin, false)} catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 403)
          throw new HttpError(403, "native_request_origin_denied")
        return unavailable()
      }
      if (req.headers.authorization !== undefined || !nativeSessionToken(req) ||
          ["x-rh-user-id", "x-agentstudio-user-id", "x-forwarded-user", "x-forwarded-email"].some(key => req.headers[key] !== undefined))
        throw new HttpError(401, "session_required")
      if (req.method !== "GET") throw new HttpError(405, "method_not_allowed")
      let identity: Identity
      try {identity = await authenticateRequest(req)} catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 401) throw new HttpError(401, "session_required")
        return unavailable()
      }
      if (identity?.issuer !== "urn:agentstudio:local:v1" || typeof identity.subject !== "string" || !identity.subject)
        throw new HttpError(403, "native_employee_identity_required")
      await emptyBody(req)
      const route = parseCompanyOverviewUrl(req.url)
      if (route.route === "overview") {
        const value = await repository.overview(identity)
        reply(res, 200, projection(() => parseCompanyOverview(value)))
      } else {
        const value = await repository.employees(identity, route.query)
        reply(res, 200, projection(() => parseCompanyEmployeePage(value, route.query)))
      }
    } catch (error) {
      const trustedInput = error instanceof CompanyOverviewContractError && error.status === 400 && inputCodes.includes(error.code)
      const trustedHttp = error instanceof HttpError && ({400: inputCodes, 401: ["session_required"],
        403: ["native_employee_identity_required", "native_request_origin_denied", "admin_required"],
        405: ["method_not_allowed"], 503: ["company_overview_unavailable"]} as Record<number, readonly string[]>)[error.status]?.includes(error.code)
      reply(res, trustedInput || trustedHttp ? error.status : 503,
        {error: trustedInput || trustedHttp ? error.code : "company_overview_unavailable"})
    }
    return true
  }
}

export type NativeCompanyOverviewBusinessDependencies = Omit<CompanyOverviewHttpDependencies, "repository"> & {
  available: boolean
  repository?: CompanyOverviewReads
  businessHandler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
}
/** Mount inside the existing Native global policy, which still owns all routes. */
export function createNativeCompanyOverviewBusinessHandler({available, repository, businessHandler,
  authenticateRequest, allowedOrigin}: NativeCompanyOverviewBusinessDependencies) {
  if (typeof available !== "boolean" || typeof businessHandler !== "function" || available && !repository)
    throw Error("invalid_native_company_overview_dependencies")
  const handler = createCompanyOverviewHttpHandler({allowedOrigin, authenticateRequest,
    repository: available ? repository! : {overview: async () => unavailable(), employees: async () => unavailable()}})
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (await handler(req, res)) return
    await businessHandler(req, res)
  }
}
