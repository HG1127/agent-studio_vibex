// Unmounted local state only. Caller attestations do not prove startup checks,
// closed admission, credentials, real liveness, storage or server anti-replay.
export type WorkerHeartbeatReport = Readonly<{
  protocol: "native_worker_heartbeat_report_v1"; generation: string; sequence: number
} & ({state: "unknown"; reason: "startup_checks_pending" | "loop_unavailable"} |
  {state: "ready"; reason: "startup_checks_complete"} |
  {state: "draining"; reason: "new_claims_closed"})>
export type WorkerHeartbeatReportEvent = Readonly<
  {type: "startup_checks_complete"; completed: true} | {type: "loop_unavailable"} |
  {type: "drain"; new_claims_closed: true}>
export type WorkerHeartbeatReportSequence = Readonly<{
  transition(event: unknown): void
  nextReport(): WorkerHeartbeatReport
}>
type ErrorCode = "invalid_worker_heartbeat_report_sequence_input" |
  "worker_heartbeat_report_sequence_exhausted" | "worker_heartbeat_report_sequence_draining"
export class WorkerHeartbeatReportSequenceError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {super(code); this.name = "WorkerHeartbeatReportSequenceError"; this.code = code}
}
const invalid = (): never => {throw new WorkerHeartbeatReportSequenceError("invalid_worker_heartbeat_report_sequence_input")}
function closed(raw: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(raw), keys = Reflect.ownKeys(raw)
  if (keys.some(key => typeof key !== "string" || ![...required, ...optional].includes(key) ||
      !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value")) ||
      required.some(key => !Object.hasOwn(descriptors, key))) return invalid()
  return Object.fromEntries(keys.map(key => [key, descriptors[key as string]!.value]))
}
function event(raw: unknown): WorkerHeartbeatReportEvent {
  const value = closed(raw, ["type"], ["completed", "new_claims_closed"]), size = Object.keys(value).length
  if (value.type === "startup_checks_complete" && size === 2 && value.completed === true)
    return {type: "startup_checks_complete", completed: true}
  if (value.type === "loop_unavailable" && size === 1) return {type: "loop_unavailable"}
  if (value.type === "drain" && size === 2 && value.new_claims_closed === true) return {type: "drain", new_claims_closed: true}
  return invalid()
}
/** The same pure counter primitive used by nextReport; no factory counter or
 * state injection is provided for tests, recovery or caller-selected readiness. */
export function nextWorkerHeartbeatReportSequence(previous: unknown): number {
  if (typeof previous !== "number" || !Number.isSafeInteger(previous) || previous < 0 || Object.is(previous, -0)) return invalid()
  if (previous === Number.MAX_SAFE_INTEGER) throw new WorkerHeartbeatReportSequenceError("worker_heartbeat_report_sequence_exhausted")
  return previous + 1
}
function bootGeneration(raw: unknown): string {
  // This protocol deliberately accepts only canonical lowercase UUIDv4 syntax.
  // It does not generate, register, authenticate or prove uniqueness of a boot.
  if (typeof raw !== "string" || raw.length !== 36 ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw)) return invalid()
  return raw
}
export function createWorkerHeartbeatReportSequence(raw: unknown): WorkerHeartbeatReportSequence {
  const generation = bootGeneration(closed(raw, ["generation"]).generation)
  let state: WorkerHeartbeatReport["state"] = "unknown", sequence = 0
  let unknownReason: "startup_checks_pending" | "loop_unavailable" = "startup_checks_pending"
  function transition(rawEvent: unknown): void {
    const selected = event(rawEvent)
    if (state === "draining") {
      if (selected.type === "drain") return
      throw new WorkerHeartbeatReportSequenceError("worker_heartbeat_report_sequence_draining")
    }
    if (selected.type === "startup_checks_complete") state = "ready"
    else if (selected.type === "loop_unavailable") {state = "unknown"; unknownReason = "loop_unavailable"}
    else state = "draining"
  }
  function nextReport(): WorkerHeartbeatReport {
    const next = nextWorkerHeartbeatReportSequence(sequence)
    const common = {protocol: "native_worker_heartbeat_report_v1" as const, generation, sequence: next}
    let report: WorkerHeartbeatReport
    if (state === "ready") report = Object.freeze({...common, state: "ready", reason: "startup_checks_complete"})
    else if (state === "draining") report = Object.freeze({...common, state: "draining", reason: "new_claims_closed"})
    else report = Object.freeze({...common, state: "unknown", reason: unknownReason})
    sequence = next
    return report
  }
  return Object.freeze({transition, nextReport})
}
