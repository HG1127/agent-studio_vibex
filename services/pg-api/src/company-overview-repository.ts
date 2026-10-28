// Optional CT03 metadata reads only. Fixed definer projections recheck current
// Native active/admin authority in their own statement snapshot; no Node grant.
import {HttpError, type Identity, type SqlClient, type SqlPool} from "./contracts.ts"
import {withActorClient} from "./repository.ts"
import {verifyCompanyOverviewSchema} from "./company-overview-audit.ts"
import {companyDatabaseCount, companyOperationalCountKeys, companyTotalCountKeys,
  normalizeCompanyDisplayName, parseCompanyEmployeeQuery, parseCompanyOverview, parseCompanyEmployeePage,
  type CompanyOverview, type CompanyEmployeePage, type CompanyEmployeeQuery} from "./company-overview-contract.ts"

export const companyOverviewSql = "SELECT agentstudio.company_overview() AS value"
export const companyEmployeeStatsSql = "SELECT agentstudio.company_employee_stats($1::integer,$2::uuid) AS value"
const unavailable = () => new HttpError(503, "company_overview_unavailable")
const sessionRequired = () => new HttpError(401, "session_required")
function exact(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) ||
      Reflect.ownKeys(raw).length !== keys.length) throw unavailable()
  const descriptors = Object.getOwnPropertyDescriptors(raw)
  if (keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value"))) throw unavailable()
  return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))
}
function nativeIdentity(raw: Identity): Identity {
  try {
    const value = exact(raw, ["issuer", "subject"])
    if (value.issuer !== "urn:agentstudio:local:v1" || typeof value.subject !== "string" ||
        !value.subject || value.subject.length > 255 || value.subject.includes("\0")) throw sessionRequired()
    return Object.freeze({issuer: value.issuer, subject: value.subject})
  } catch {throw sessionRequired()}
}
function databaseValue(rows: unknown[]): unknown {
  if (rows.length !== 1) throw unavailable()
  return exact(rows[0], ["value"]).value
}
function databaseCounts(raw: unknown, keys: readonly string[]) {
  const value = exact(raw, keys)
  return Object.fromEntries(keys.map(key => [key, companyDatabaseCount(value[key])]))
}
function overviewProjection(raw: unknown): CompanyOverview {
  const value = exact(raw, ["protocol", "scope", "as_of", "window_days", "totals", "worker"])
  return parseCompanyOverview({...value, totals: databaseCounts(value.totals, companyTotalCountKeys)})
}
function employeesProjection(raw: unknown, query: CompanyEmployeeQuery): CompanyEmployeePage {
  const value = exact(raw, ["protocol", "scope", "as_of", "limit", "items", "has_more", "next_after"])
  const items = value.items
  if (!Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype || items.length > query.limit ||
      Reflect.ownKeys(items).length !== items.length + 1) throw unavailable()
  const converted = []
  for (let i = 0; i < items.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(items, String(i))
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw unavailable()
    const item = exact(descriptor.value, ["employee_id", "display_name", "is_admin", "enabled", "status", ...companyOperationalCountKeys])
    const counts = Object.fromEntries(companyOperationalCountKeys.map(key => [key, companyDatabaseCount(item[key])]))
    converted.push({...item, ...counts, display_name: normalizeCompanyDisplayName(item.display_name)})
  }
  return parseCompanyEmployeePage({...value, items: converted}, query)
}
function publicFailure(error: unknown): HttpError {
  try {
    if (!error || typeof error !== "object") return unavailable()
    const code = Object.getOwnPropertyDescriptor(error, "code")?.value
    const message = Object.getOwnPropertyDescriptor(error, "message")?.value
    const status = Object.getOwnPropertyDescriptor(error, "status")?.value
    if (error instanceof HttpError) {
      if (status === 401 && code === "session_required" || status === 403 && code === "admin_required") return error
      if (status === 403 && code === "employee_not_provisioned") return sessionRequired()
    }
    if (code === "P0001") {
      if (message === "company_native_session_required") return sessionRequired()
      if (message === "company_admin_required") return new HttpError(403, "admin_required")
    }
  } catch {}
  return unavailable()
}
export class CompanyOverviewRepository {
  readonly pool: SqlPool
  constructor(pool: SqlPool) {this.pool = pool}
  private async read<T>(identity: Identity, projection: (db: SqlClient) => Promise<T>): Promise<T> {
    const actor = nativeIdentity(identity)
    let db: SqlClient | undefined, attempted = false, result: T | undefined, failure: HttpError | undefined
    try {
      db = await this.pool.connect()
      attempted = true
      await db.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY")
      await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'")
      result = await withActorClient(db, this.pool, actor, async client => {
        // Mandatory per-read auditor; no cache, optional success or substitute.
        await verifyCompanyOverviewSchema(client)
        return projection(client)
      })
      await db.query("COMMIT")
    } catch (error) {
      failure = publicFailure(error)
      if (db && attempted) await db.query("ROLLBACK").catch(() => {})
    }
    if (db) {
      try {await db.release()} catch {failure ??= unavailable()}
    }
    if (failure) throw failure
    return result as T
  }
  async overview(identity: Identity): Promise<CompanyOverview> {
    return this.read(identity, async db => overviewProjection(databaseValue((await db.query(companyOverviewSql)).rows)))
  }
  async employees(identity: Identity, raw: unknown = {}): Promise<CompanyEmployeePage> {
    // Detach the closed cursor/page size before the first pool/client await.
    const query = Object.freeze(parseCompanyEmployeeQuery(raw))
    return this.read(identity, async db => employeesProjection(databaseValue((await db.query(companyEmployeeStatsSql, [query.limit, query.after])).rows), query))
  }
}
