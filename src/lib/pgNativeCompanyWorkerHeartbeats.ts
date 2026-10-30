// Browser read only. The shared value contract imports no backend/runtime IO.
import {parseWorkerHeartbeatSnapshot, type WorkerHeartbeatSnapshot} from "../../services/pg-api/src/worker-heartbeat-contract.ts"
import {parseCompanyOverviewJson} from "./pgNativeCompanyOverview.ts"

export type {WorkerHeartbeatSnapshot}
export type CompanyWorkerHeartbeatsReadOptions = {signal?: AbortSignal}
export type PgNativeCompanyWorkerHeartbeatsApi = {
  getCompanyWorkerHeartbeats(options?: CompanyWorkerHeartbeatsReadOptions): Promise<unknown>
}
export class PgNativeCompanyWorkerHeartbeatsError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {super(code); this.name = "PgNativeCompanyWorkerHeartbeatsError"; this.status = status; this.code = code}
}
const invalid = (): never => {throw new PgNativeCompanyWorkerHeartbeatsError(503, "invalid_company_worker_heartbeats_response")}
const badRequest = (): never => {throw new PgNativeCompanyWorkerHeartbeatsError(400, "invalid_company_worker_heartbeats_request")}
const disconnected = () => new PgNativeCompanyWorkerHeartbeatsError(0, "company_worker_heartbeats_connection_unavailable")
const maximumBytes = 16384
function options(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return badRequest()
  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (typeof key !== "string" || !keys.includes(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return badRequest()
  }
  return raw as Record<string, unknown>
}
export function parsePgNativeCompanyWorkerHeartbeats(raw: unknown): WorkerHeartbeatSnapshot {
  try {return parseWorkerHeartbeatSnapshot(raw)} catch {return invalid()}
}
export function parseCompanyWorkerHeartbeatsJson(raw: unknown): WorkerHeartbeatSnapshot {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > maximumBytes) return invalid()
  try {return parsePgNativeCompanyWorkerHeartbeats(parseCompanyOverviewJson(raw))} catch {return invalid()}
}
export function createPgNativeCompanyWorkerHeartbeatsApi(raw: {
  transport?: typeof fetch; rootPath?: "" | "/__pg_native"; timeoutMs?: number
} = {}): PgNativeCompanyWorkerHeartbeatsApi {
  const config = options(raw, ["transport", "rootPath", "timeoutMs"])
  const transport = config.transport === undefined ? fetch : config.transport
  const rootPath = config.rootPath === undefined ? "/__pg_native" : config.rootPath
  const timeoutMs = config.timeoutMs === undefined ? 8000 : config.timeoutMs
  if (typeof transport !== "function" || rootPath !== "" && rootPath !== "/__pg_native" ||
      typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) return badRequest()
  const send = transport as typeof fetch, budget = timeoutMs
  return Object.freeze({
    async getCompanyWorkerHeartbeats(rawOptions: CompanyWorkerHeartbeatsReadOptions = {}): Promise<WorkerHeartbeatSnapshot> {
      const value = options(rawOptions, ["signal"]), external = value.signal
      if (external !== undefined && !(external instanceof AbortSignal)) return badRequest()
      const timeout = new AbortController(), signal = external ? AbortSignal.any([external as AbortSignal, timeout.signal]) : timeout.signal
      let rejectAbort: (reason: unknown) => void = () => {}, reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      let body: ReadableStream<Uint8Array> | null = null
      const aborted = new Promise<never>((_, reject) => {rejectAbort = reject})
      const onAbort = () => rejectAbort(disconnected())
      signal.addEventListener("abort", onAbort, {once: true})
      const deadline = performance.now() + budget, timer = setTimeout(() => timeout.abort(), budget)
      const assertActive = () => {if (signal.aborted || performance.now() >= deadline) throw disconnected()}
      try {
        assertActive()
        const response = await Promise.race([send(rootPath + "/api/v2/company-worker-heartbeats", {
          method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
          headers: {Accept: "application/json"}, signal,
        }), aborted])
        assertActive()
        if (!(response instanceof Response)) return invalid()
        body = response.body
        // Identity/demotion must close the view even when an error body is corrupt.
        if (response.status === 401) throw new PgNativeCompanyWorkerHeartbeatsError(401, "session_required")
        if (response.status === 403) throw new PgNativeCompanyWorkerHeartbeatsError(403, "admin_required")
        if (response.status !== 200) throw new PgNativeCompanyWorkerHeartbeatsError(503, "company_worker_heartbeats_unavailable")
        if (response.redirected || !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(response.headers.get("content-type") ?? "")) return invalid()
        const length = response.headers.get("content-length")
        if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > maximumBytes)) return invalid()
        if (!response.body) return invalid()
        const selected = response.body.getReader(); reader = selected
        const read = async () => {
          const chunks: Uint8Array[] = []; let size = 0
          for (;;) {
            assertActive()
            const chunk = await selected.read(); assertActive()
            if (chunk.done) break
            if (!(chunk.value instanceof Uint8Array) || size + chunk.value.byteLength > maximumBytes) return invalid()
            size += chunk.value.byteLength; chunks.push(new Uint8Array(chunk.value))
          }
          const bytes = new Uint8Array(size); let offset = 0
          for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength}
          if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return invalid()
          let text: string
          try {text = new TextDecoder("utf-8", {fatal: true}).decode(bytes)} catch {return invalid()}
          const result = parseCompanyWorkerHeartbeatsJson(text); assertActive(); return result
        }
        return await Promise.race([read(), aborted])
      } catch (error) {
        if (error instanceof PgNativeCompanyWorkerHeartbeatsError) throw error
        throw disconnected()
      } finally {
        clearTimeout(timer); signal.removeEventListener("abort", onAbort)
        // Cancellation is best effort, never a backend drain/lease-release proof.
        if (reader) {void reader.cancel().catch(() => {}); try {reader.releaseLock()} catch {/* Pending read owns its lock until cancellation settles. */}}
        else if (body) void body.cancel().catch(() => {})
      }
    },
  })
}
