import {companyOverviewEmployeeId} from "./pgNativeCompanyOverview.ts"
import {parsePgNativeCompanyWorkerHeartbeats, type PgNativeCompanyWorkerHeartbeatsApi, type WorkerHeartbeatSnapshot} from "./pgNativeCompanyWorkerHeartbeats.ts"

export type CompanyWorkerHeartbeatsView = {
  employeeId: string; active: boolean; currentAdmin: boolean; available: boolean; forbidden: boolean
  status: "unavailable" | "unknown" | "loading" | "snapshot"; data: WorkerHeartbeatSnapshot | null; error: string
}
export const emptyCompanyWorkerHeartbeatsView = (employeeId = ""): CompanyWorkerHeartbeatsView => ({employeeId,
  active: false, currentAdmin: false, available: false, forbidden: false, status: "unavailable", data: null, error: ""})
function freeze<T>(value: T): T {if (value && typeof value === "object") {Object.values(value).forEach(freeze); Object.freeze(value)}; return value}
function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const value = Object.getOwnPropertyDescriptor(error, "status")?.value
  return typeof value === "number" && Number.isInteger(value) ? value : null
}
/** Capabilities are UI hints. Every actual read is authorized again by the server. */
export function createPgNativeCompanyWorkerHeartbeatsSession(api: PgNativeCompanyWorkerHeartbeatsApi,
  options: {employeeId: string; onExpired?: () => void}) {
  const employeeId = companyOverviewEmployeeId(options.employeeId), listeners = new Set<() => void>()
  let active = false, currentAdmin = false, capability = false, forbidden = false, disposed = false, expired = false
  let ticket = 0, accessEpoch = 0, status: CompanyWorkerHeartbeatsView["status"] = "unavailable"
  let data: WorkerHeartbeatSnapshot | null = null, error = "", expiresAt = 0
  let abort: AbortController | null = null, expiry: ReturnType<typeof setTimeout> | null = null
  const allowed = () => currentAdmin && capability && !forbidden && !disposed
  const visible = () => active && !disposed
  const emit = () => {if (!disposed) listeners.forEach(fn => fn())}
  function clearExpiry() {if (expiry !== null) clearTimeout(expiry); expiry = null; expiresAt = 0}
  function reset(message = "") {
    ticket++; accessEpoch++; abort?.abort(); abort = null; clearExpiry()
    data = null; status = allowed() ? "unknown" : "unavailable"; error = message
  }
  function dispose() {
    if (disposed) return
    disposed = true; active = false; currentAdmin = false; capability = false; reset()
    listeners.forEach(fn => fn()); listeners.clear()
  }
  const snapshot = (): CompanyWorkerHeartbeatsView => {
    if (!visible()) {
      const empty = emptyCompanyWorkerHeartbeatsView(employeeId)
      if (expired) empty.error = "员工登录已失效，请重新登录。"
      return freeze(empty)
    }
    const retained = status === "snapshot" && expiresAt > performance.now()
    return freeze(structuredClone({employeeId, active: true, currentAdmin, available: allowed(), forbidden,
      status: status === "snapshot" && !retained ? "unknown" : status, data: retained && allowed() ? data : null,
      error: status === "snapshot" && !retained ? "上次心跳快照已过有效期，请重新读取；当前状态未知。" : error}))
  }
  async function refresh() {
    if (!visible() || !allowed() || status === "loading") return
    reset(); const sequence = ticket, access = accessEpoch, selected = new AbortController(), started = performance.now()
    abort = selected; status = "loading"; emit()
    const current = () => visible() && allowed() && ticket === sequence
    try {
      const raw = await api.getCompanyWorkerHeartbeats({signal: selected.signal})
      if (!current()) return
      const parsed = parsePgNativeCompanyWorkerHeartbeats(raw), elapsed = Math.max(0, performance.now() - started)
      // Local retention can only shorten a server snapshot. Never fabricate a new server state/time.
      const asOf = Date.parse(parsed.as_of), remaining = Math.floor(Math.min(parsed.stale_after_ms,
        ...parsed.workers.filter(row => row.state === "ready" || row.state === "draining")
          .map(row => parsed.stale_after_ms - (asOf - Date.parse(row.last_seen_at!)))) - elapsed)
      if (remaining < 1) {status = "unknown"; data = null; error = "读取期间快照已过有效期，请重新读取；当前状态未知。"; return}
      data = parsed; status = "snapshot"; error = ""; expiresAt = performance.now() + remaining
      expiry = setTimeout(() => {
        if (!current() || status !== "snapshot") return
        data = null; status = "unknown"; clearExpiry(); error = "上次心跳快照已过有效期，请重新读取；当前状态未知。"; emit()
      }, remaining)
    } catch (failure) {
      if (disposed) return
      if (errorStatus(failure) === 401) {
        expired = true; dispose()
        try {void Promise.resolve(options.onExpired?.()).catch(() => {})} catch {/* View was cleared before notification. */}
        return
      }
      if (errorStatus(failure) === 403 && access === accessEpoch && visible() && allowed()) {
        forbidden = true; reset("管理员权限已变化，心跳快照已清空。可继续使用个人工作台。"); emit(); return
      }
      if (!current()) return
      data = null; status = errorStatus(failure) === 503 ? "unavailable" : "unknown"
      error = "心跳暂无法核对，当前状态未知。请手动重试。"
    } finally {if (current()) {abort = null; emit()}}
  }
  return {
    snapshot, dispose, refresh,
    subscribe(listener: () => void) {if (!disposed) listeners.add(listener); return () => {listeners.delete(listener)}},
    matchesScope(candidate: PgNativeCompanyWorkerHeartbeatsApi, id: string) {return !disposed && api === candidate && employeeId === id},
    setActive(value: boolean) {if (disposed || active === (value === true)) return; active = value === true; reset(); emit()},
    setAvailability(value: {currentAdmin?: boolean; company_worker_heartbeats_available?: boolean}) {
      if (disposed) return
      const admin = value.currentAdmin === true, available = value.company_worker_heartbeats_available === true
      if (admin === currentAdmin && available === capability) return
      currentAdmin = admin; capability = available; forbidden = false; reset(); emit()
    },
  }
}
export type PgNativeCompanyWorkerHeartbeatsSession = ReturnType<typeof createPgNativeCompanyWorkerHeartbeatsSession>
