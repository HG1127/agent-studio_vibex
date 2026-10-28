// Local bookkeeping only. Closed+zero counts do not prove system drain unless
// every real claim path is wired. No task/DB/timeout/exit or report-sequence API.
const permitBrand = Symbol("worker_claim_permit")
export type WorkerClaimPermit = Readonly<{[permitBrand]: true}>
export type WorkerClaimDispatch<T> = Readonly<{started: false} | {started: true; value: T}>
// pending includes reserved, submitted and uncertain intents; uncertain is a subset.
export type WorkerClaimAdmissionView = Readonly<{
  closed: boolean; pending: number; uncertain: number
  lanes: readonly Readonly<{lane: string; pending: number; uncertain: number}>[]
}>
export type WorkerClaimAdmission = Readonly<{
  tryEnter(lane: unknown): WorkerClaimPermit | null
  dispatch<T>(permit: unknown, query: () => T): WorkerClaimDispatch<T>
  discardUndispatched(permit: unknown): void
  markUncertain(permit: unknown): void
  confirm(permit: unknown, evidence: unknown): void
  close(): void
  snapshot(): WorkerClaimAdmissionView
}>
type ErrorCode = "invalid_worker_claim_admission_input" | "invalid_worker_claim_permit" |
  "worker_claim_intent_not_reserved" | "worker_claim_intent_not_dispatched" |
  "worker_claim_intent_settled" | "worker_claim_admission_capacity_exhausted"
export class WorkerClaimAdmissionError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {super(code); this.name = "WorkerClaimAdmissionError"; this.code = code}
}
const fail = (code: ErrorCode): never => {throw new WorkerClaimAdmissionError(code)}
const invalid = (): never => fail("invalid_worker_claim_admission_input")
function closedRecord(raw: unknown, required: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(raw), keys = Reflect.ownKeys(raw)
  if (keys.length !== required.length || keys.some(key => typeof key !== "string" || !required.includes(key) ||
      !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value")) ||
      required.some(key => !Object.hasOwn(descriptors, key))) return invalid()
  return Object.fromEntries(required.map(key => [key, descriptors[key]!.value]))
}
function declarations(raw: unknown): readonly string[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length < 1 || raw.length > 32 ||
      Reflect.ownKeys(raw).length !== raw.length + 1) return invalid()
  const result: string[] = []
  for (let index = 0; index < raw.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index)), lane = descriptor?.value
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof lane !== "string" ||
        lane.trim() !== lane || !/^[a-z][a-z0-9_]{0,47}$/.test(lane) || result.includes(lane)) return invalid()
    result.push(lane)
  }
  return Object.freeze(result)
}
type Phase = "reserved" | "submitted" | "uncertain" | "settled" | "discarded"
type Intent = {lane: string; phase: Phase}
export function createWorkerClaimAdmission(raw: unknown): WorkerClaimAdmission {
  const laneNames = declarations(closedRecord(raw, ["lanes"]).lanes)
  const lanes = new Map(laneNames.map(lane => [lane, {pending: 0, uncertain: 0}]))
  const intents = new WeakMap<object, Intent>()
  let closed = false, pending = 0, uncertain = 0
  function intent(rawPermit: unknown): Intent {
    if (!rawPermit || typeof rawPermit !== "object") return fail("invalid_worker_claim_permit")
    const found = intents.get(rawPermit)
    if (!found) return fail("invalid_worker_claim_permit")
    return found
  }
  function submitted(rawPermit: unknown): Intent {
    const found = intent(rawPermit)
    if (found.phase === "settled" || found.phase === "discarded") return fail("worker_claim_intent_settled")
    if (found.phase === "reserved") return fail("worker_claim_intent_not_dispatched")
    return found
  }
  function finish(found: Intent, phase: "settled" | "discarded"): void {
    const lane = lanes.get(found.lane)!
    if (found.phase === "uncertain") {lane.uncertain--; uncertain--}
    lane.pending--; pending--; found.phase = phase
  }
  return Object.freeze({
    tryEnter(rawLane: unknown): WorkerClaimPermit | null {
      if (typeof rawLane !== "string" || !lanes.has(rawLane)) return invalid()
      if (closed) return null
      const lane = lanes.get(rawLane)!
      if (pending === Number.MAX_SAFE_INTEGER || lane.pending === Number.MAX_SAFE_INTEGER)
        return fail("worker_claim_admission_capacity_exhausted")
      const permit = Object.freeze({[permitBrand]: true as const})
      intents.set(permit, {lane: rawLane, phase: "reserved"}); pending++; lane.pending++
      return permit
    },
    // Run after all pool/role/audit awaits. No await exists between this final
    // check and callback invocation. The callback must directly send the query;
    // this module cannot inspect an async callback or prove it sent real SQL.
    dispatch<T>(rawPermit: unknown, query: () => T): WorkerClaimDispatch<T> {
      const found = intent(rawPermit)
      if (found.phase !== "reserved") return fail("worker_claim_intent_not_reserved")
      if (typeof query !== "function") return invalid()
      if (closed) {finish(found, "discarded"); return Object.freeze({started: false})}
      found.phase = "submitted"
      try {return Object.freeze({started: true, value: query()})}
      catch (error) {
        // A synchronous throw is not proof that no query was sent.
        if (found.phase === "submitted") {
          found.phase = "uncertain"; uncertain++; lanes.get(found.lane)!.uncertain++
        }
        throw error
      }
    },
    discardUndispatched(rawPermit: unknown): void {
      const found = intent(rawPermit)
      if (found.phase !== "reserved") return fail("worker_claim_intent_not_reserved")
      finish(found, "discarded")
    },
    markUncertain(rawPermit: unknown): void {
      const found = submitted(rawPermit)
      if (found.phase === "uncertain") return
      found.phase = "uncertain"; uncertain++; lanes.get(found.lane)!.uncertain++
    },
    // Explicit caller attestation, not database evidence checked by this module.
    // A claim row, timeout, AbortSignal or finally callback is not confirmation.
    confirm(rawPermit: unknown, rawEvidence: unknown): void {
      const found = submitted(rawPermit), evidence = closedRecord(rawEvidence, ["outcome"])
      if (evidence.outcome !== "commit_confirmed" && evidence.outcome !== "rollback_confirmed") return invalid()
      finish(found, "settled")
    },
    close(): void {closed = true},
    snapshot(): WorkerClaimAdmissionView {
      return Object.freeze({closed, pending, uncertain, lanes: Object.freeze(laneNames.map(name => {
        const lane = lanes.get(name)!
        return Object.freeze({lane: name, pending: lane.pending, uncertain: lane.uncertain})
      }))})
    },
  })
}
