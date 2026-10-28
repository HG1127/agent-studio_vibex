import {companyOverviewEmployeeId, companyOverviewEmployeeQuery, parsePgNativeCompanyOverview, parsePgNativeCompanyEmployeePage,
  type PgNativeCompanyOverviewApi, type CompanyOverview, type CompanyEmployeePage, type CompanyEmployeeQuery} from "./pgNativeCompanyOverview.ts"

export type CompanyOverviewReadState<T> = {status: "unavailable" | "unknown" | "loading" | "ready"; data: T | null; error: string}
export type PgNativeCompanyOverviewSessionView = {
  employeeId: string; active: boolean; currentAdmin: boolean; available: boolean; forbidden: boolean
  query: CompanyEmployeeQuery; queryValid: boolean; overview: CompanyOverviewReadState<CompanyOverview>
  employees: CompanyOverviewReadState<CompanyEmployeePage>; canNextPage: boolean
}
const region = <T>(status: CompanyOverviewReadState<T>["status"] = "unavailable", error = ""): CompanyOverviewReadState<T> => ({status, data: null, error})
export const emptyCompanyOverviewView = (employeeId = ""): PgNativeCompanyOverviewSessionView => ({employeeId, active: false,
  currentAdmin: false, available: false, forbidden: false, query: companyOverviewEmployeeQuery(), queryValid: true,
  overview: region(), employees: region(), canNextPage: false})
function freeze<T>(value: T): T {if (value && typeof value === "object") {Object.values(value).forEach(freeze); Object.freeze(value)}; return value}
function status(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const value = Object.getOwnPropertyDescriptor(error, "status")?.value
  return typeof value === "number" && Number.isInteger(value) ? value : null
}
/** All flags here are UI hints. Only the actual backend authorizes every company read. */
export function createPgNativeCompanyOverviewSession(initialApi: PgNativeCompanyOverviewApi,
  options: {employeeId: string; onExpired?: () => void}) {
  let api = initialApi, employeeId = companyOverviewEmployeeId(options.employeeId)
  let active = false, disposed = false, expiredSession = false, life = 0, accessEpoch = 0
  let currentAdmin = false, capability = false, forbidden = false, queryValid = true
  let overviewTicket = 0, employeeTicket = 0
  let overviewAbort: AbortController | null = null, employeeAbort: AbortController | null = null
  let query = freeze(companyOverviewEmployeeQuery()), overview = region<CompanyOverview>(), employees = region<CompanyEmployeePage>()
  const listeners = new Set<() => void>(), allowed = () => currentAdmin && capability && !forbidden
  const visible = () => active && !disposed
  const live = (ticket: number, selectedApi: PgNativeCompanyOverviewApi) => !disposed && life === ticket && api === selectedApi
  const cancelOverview = () => {overviewTicket++; overviewAbort?.abort(); overviewAbort = null}
  const cancelEmployees = () => {employeeTicket++; employeeAbort?.abort(); employeeAbort = null}
  const emit = () => {if (!disposed) listeners.forEach(fn => fn())}
  const reset = (error = "") => {
    accessEpoch++
    cancelOverview(); cancelEmployees(); query = freeze(companyOverviewEmployeeQuery({limit: query.limit})); queryValid = true
    overview = region(allowed() ? "unknown" : "unavailable", error); employees = region(allowed() ? "unknown" : "unavailable", error)
  }
  const snapshot = (): PgNativeCompanyOverviewSessionView => {
    if (visible()) return structuredClone({employeeId, active: true, currentAdmin, available: allowed(), forbidden, query, queryValid,
      overview, employees, canNextPage: allowed() && queryValid && employees.status === "ready" && Boolean(employees.data?.has_more && employees.data.next_after)})
    const empty = emptyCompanyOverviewView(employeeId)
    if (expiredSession) {empty.overview.error = "员工登录已失效，请重新登录。"; empty.employees.error = empty.overview.error}
    return empty
  }
  function dispose() {
    if (disposed) return
    disposed = true; active = false; life++; currentAdmin = false; capability = false; forbidden = false
    cancelOverview(); cancelEmployees(); overview = region(); employees = region(); query = freeze(companyOverviewEmployeeQuery()); queryValid = true
    listeners.forEach(fn => fn()); listeners.clear()
  }
  function expire(lifetime: number, selectedApi: PgNativeCompanyOverviewApi) {
    if (!live(lifetime, selectedApi)) return
    expiredSession = true; dispose()
    try {void Promise.resolve(options.onExpired?.()).catch(() => {})} catch {/* Session data has already been cleared. */}
  }
  function deny() {
    forbidden = true; reset("管理员权限已变化，公司概览暂不可读。")
    // Repeating identical stale hints cannot immediately undo a real403.
    emit()
  }
  async function readOverview() {
    if (!visible() || !allowed()) return
    cancelOverview(); const ticket = overviewTicket, lifetime = life, access = accessEpoch, selectedApi = api, abort = new AbortController()
    overviewAbort = abort; overview = region("loading"); emit()
    const current = () => visible() && allowed() && live(lifetime, selectedApi) && ticket === overviewTicket
    try {
      const raw = await selectedApi.getCompanyOverview({signal: abort.signal})
      if (!current()) return
      overview = {status: "ready", data: freeze(parsePgNativeCompanyOverview(raw)), error: ""}
    } catch (error) {
      if (!live(lifetime, selectedApi)) return
      if (status(error) === 401) {expire(lifetime, selectedApi); return}
      if (status(error) === 403 && access === accessEpoch && visible() && allowed()) {deny(); return}
      if (!current()) return
      overview = region("unknown", "公司全局统计暂无法核对，计数未知。")
    } finally {if (current()) {overviewAbort = null; emit()}}
  }
  async function readEmployees(rawQuery: CompanyEmployeeQuery) {
    if (!visible() || !allowed() || !queryValid) return
    const selected = freeze(companyOverviewEmployeeQuery(rawQuery))
    cancelEmployees(); const ticket = employeeTicket, lifetime = life, access = accessEpoch, selectedApi = api, abort = new AbortController()
    employeeAbort = abort; query = selected; employees = region("loading"); emit()
    const current = () => visible() && allowed() && live(lifetime, selectedApi) && ticket === employeeTicket
    try {
      const raw = await selectedApi.listCompanyEmployees(selected, {signal: abort.signal})
      if (!current()) return
      employees = {status: "ready", data: freeze(parsePgNativeCompanyEmployeePage(raw, selected)), error: ""}
    } catch (error) {
      if (!live(lifetime, selectedApi)) return
      if (status(error) === 401) {expire(lifetime, selectedApi); return}
      if (status(error) === 403 && access === accessEpoch && visible() && allowed()) {deny(); return}
      if (!current()) return
      employees = region("unknown", "员工统计暂无法核对，当前页未知。")
    } finally {if (current()) {employeeAbort = null; emit()}}
  }
  return {
    snapshot, dispose,
    subscribe(fn: () => void) {if (!disposed) listeners.add(fn); return () => {listeners.delete(fn)}},
    matchesScope(candidateApi: PgNativeCompanyOverviewApi, candidateEmployeeId: string) {return !disposed && api === candidateApi && employeeId === candidateEmployeeId},
    setIdentity(value: {api: PgNativeCompanyOverviewApi; employeeId: string}) {
      if (disposed || api === value.api && employeeId === value.employeeId) return
      const next = companyOverviewEmployeeId(value.employeeId)
      life++; reset(); api = value.api; employeeId = next; active = false; currentAdmin = false; capability = false; forbidden = false
      overview = region(); employees = region(); query = freeze(companyOverviewEmployeeQuery()); queryValid = true; emit()
    },
    setActive(value: boolean) {if (disposed || active === (value === true)) return; active = value === true; reset(); emit()},
    setAvailability(value: {currentAdmin?: boolean; company_overview_available?: boolean}) {
      if (disposed) return
      const admin = value.currentAdmin === true, available = value.company_overview_available === true
      if (admin === currentAdmin && available === capability) return
      currentAdmin = admin; capability = available; forbidden = false; reset(); emit()
    },
    refreshOverview: readOverview,
    async refreshEmployees() {await readEmployees(companyOverviewEmployeeQuery({limit: query.limit}))},
    async refresh() {if (visible() && allowed()) await Promise.all([readOverview(), readEmployees(companyOverviewEmployeeQuery({limit: query.limit}))])},
    setPageSize(raw: unknown) {
      if (disposed) return
      cancelEmployees()
      try {query = freeze(companyOverviewEmployeeQuery({limit: raw})); queryValid = true; employees = region(allowed() ? "unknown" : "unavailable")}
      catch {queryValid = false; employees = region("unknown", "员工页大小须为1至20的整数。")}
      emit()
    },
    async nextPage() {
      if (!visible() || !allowed() || !queryValid || employees.status !== "ready" || !employees.data?.has_more || !employees.data.next_after) return
      await readEmployees(companyOverviewEmployeeQuery({limit: query.limit, after: employees.data.next_after}))
    },
  }
}
export type PgNativeCompanyOverviewSession = ReturnType<typeof createPgNativeCompanyOverviewSession>
