// Shared, zero-import value contract. No reporter, clock sampling or telemetry
// installation is implied. The candidate90s window still needs long-running UAT.
export const workerHeartbeatKinds = Object.freeze([
  "prepare", "model", "workflow_safe", "workflow_v2", "agent_autonomous",
  "knowledge_index", "knowledge_query", "assessment",
] as const)
export const workerHeartbeatUnknownReasons = Object.freeze([
  "not_observed", "not_instrumented", "component_disabled", "loop_unavailable",
] as const)
export const workerHeartbeatStaleAfterMs = 90000 as const
export type WorkerHeartbeatKind = typeof workerHeartbeatKinds[number]
export type WorkerHeartbeatUnknownReason = typeof workerHeartbeatUnknownReasons[number]
export type WorkerHeartbeatRow = Readonly<{kind: WorkerHeartbeatKind; last_seen_at: string} & (
  {state: "ready"; reason: "fresh_ready_report"} |
  {state: "draining"; reason: "fresh_draining_report"} |
  {state: "stale"; reason: "heartbeat_expired"}
)> | Readonly<{kind: WorkerHeartbeatKind; state: "unknown"; last_seen_at: null; reason: WorkerHeartbeatUnknownReason}>
export type WorkerHeartbeatSnapshot = Readonly<{
  protocol: "native_company_worker_heartbeats_v1"
  scope: "company_worker_metadata_only"
  as_of: string
  stale_after_ms: typeof workerHeartbeatStaleAfterMs
  workers: readonly WorkerHeartbeatRow[]
}>

export class WorkerHeartbeatContractError extends Error {
  readonly status = 503
  readonly code = "invalid_worker_heartbeat_projection"
  constructor() {super("invalid_worker_heartbeat_projection"); this.name = "WorkerHeartbeatContractError"}
}
const invalid = (): never => {throw new WorkerHeartbeatContractError()}
function closed(raw: unknown, required: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(raw), keys = Reflect.ownKeys(raw)
  if (keys.length !== required.length || keys.some(key => typeof key !== "string" || !required.includes(key) ||
      !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value")) ||
      required.some(key => !Object.hasOwn(descriptors, key))) return invalid()
  return Object.fromEntries(required.map(key => [key, descriptors[key]!.value]))
}
function stamp(raw: unknown): {text: string; milliseconds: number} {
  if (typeof raw !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw) || raw.startsWith("0000-")) return invalid()
  const milliseconds = Date.parse(raw)
  if (!Number.isSafeInteger(milliseconds) || new Date(milliseconds).toISOString() !== raw) return invalid()
  return {text: raw, milliseconds}
}
function rows(raw: unknown): unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length !== workerHeartbeatKinds.length ||
      Reflect.ownKeys(raw).length !== raw.length + 1) return invalid()
  return workerHeartbeatKinds.map((_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index))
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return invalid()
    return descriptor.value
  })
}
function row(raw: unknown, expectedKind: WorkerHeartbeatKind, asOf: number): WorkerHeartbeatRow {
  const value = closed(raw, ["kind", "state", "last_seen_at", "reason"])
  if (value.kind !== expectedKind) return invalid()
  if (value.state === "unknown") {
    if (value.last_seen_at !== null || !workerHeartbeatUnknownReasons.some(reason => reason === value.reason)) return invalid()
    return Object.freeze({kind: expectedKind, state: "unknown", last_seen_at: null, reason: value.reason as WorkerHeartbeatUnknownReason})
  }
  const seen = stamp(value.last_seen_at), age = asOf - seen.milliseconds
  if (!Number.isSafeInteger(age) || age < 0) return invalid()
  if (value.state === "ready" && value.reason === "fresh_ready_report" && age < workerHeartbeatStaleAfterMs)
    return Object.freeze({kind: expectedKind, state: "ready", last_seen_at: seen.text, reason: "fresh_ready_report"})
  if (value.state === "draining" && value.reason === "fresh_draining_report" && age < workerHeartbeatStaleAfterMs)
    return Object.freeze({kind: expectedKind, state: "draining", last_seen_at: seen.text, reason: "fresh_draining_report"})
  if (value.state === "stale" && value.reason === "heartbeat_expired" && age >= workerHeartbeatStaleAfterMs)
    return Object.freeze({kind: expectedKind, state: "stale", last_seen_at: seen.text, reason: "heartbeat_expired"})
  return invalid()
}
/** Accepts an already decoded value. Raw JSON duplicate-key detection belongs
 * to a future transport; this module does not install one or read network data. */
export function parseWorkerHeartbeatSnapshot(raw: unknown): WorkerHeartbeatSnapshot {
  const value = closed(raw, ["protocol", "scope", "as_of", "stale_after_ms", "workers"])
  if (value.protocol !== "native_company_worker_heartbeats_v1" || value.scope !== "company_worker_metadata_only" ||
      value.stale_after_ms !== workerHeartbeatStaleAfterMs) return invalid()
  const at = stamp(value.as_of)
  const workers = Object.freeze(rows(value.workers).map((item, index) => row(item, workerHeartbeatKinds[index]!, at.milliseconds)))
  return Object.freeze({protocol: "native_company_worker_heartbeats_v1", scope: "company_worker_metadata_only",
    as_of: at.text, stale_after_ms: workerHeartbeatStaleAfterMs, workers})
}
/** Caller supplies an observation time; initialization never samples a clock
 * or treats configuration, tasks, health endpoints or capabilities as liveness. */
export function createUnknownWorkerHeartbeatSnapshot(asOf: unknown, reason: unknown = "not_instrumented"): WorkerHeartbeatSnapshot {
  return parseWorkerHeartbeatSnapshot({protocol: "native_company_worker_heartbeats_v1", scope: "company_worker_metadata_only",
    as_of: asOf, stale_after_ms: workerHeartbeatStaleAfterMs,
    workers: workerHeartbeatKinds.map(kind => ({kind, state: "unknown", last_seen_at: null, reason}))})
}
