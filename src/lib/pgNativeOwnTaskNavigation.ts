import {ownOperationId, type OwnOriginalTask, type OwnRunKind} from "./pgNativeOwnOperations.ts"

type RunTarget = {kind: OwnRunKind; ownerId: string; runId: string; resourceId: string; resourceRevision: number; runRevision: number | null; selection: number}
type ScheduleTarget = {kind: "schedule"; ownerId: string; scheduleId: string; scheduleRevision: number; resourceKind: "agent" | "workflow"; resourceId: string; resourceRevision: number; selection: number}
export type OwnTaskTarget = Readonly<RunTarget | ScheduleTarget>
export type OwnTaskRunTarget = Readonly<RunTarget>
export type OwnTaskScheduleTarget = Readonly<ScheduleTarget>
type ReadApi = {getRun(id: string): Promise<unknown>; getAutonomousAgentRun(id: string): Promise<unknown>; getWorkflowV2Run(id: string): Promise<unknown>; getWorkflowRun(id: string): Promise<unknown>; getAgent(id: string): Promise<unknown>; getWorkflow(id: string): Promise<unknown>; getSchedule(id: string): Promise<unknown>}
const verified = new WeakSet<object>()
const targetApis = new WeakMap<object, object>()
const targetResources = new WeakMap<object, unknown>()
const invalid = (): never => { throw Error("original_task_source_unconfirmed") }
function object(raw: unknown): Record<string, unknown> { if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid(); return raw as Record<string, unknown> }
function revision(raw: unknown): number { return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1 && raw <= Number.MAX_SAFE_INTEGER - 2 ? raw : invalid() }
const recordedRevision = (raw: unknown): number | null => raw === undefined ? null : revision(raw)
function owner(row: Record<string, unknown>, employeeId: string) { if (row.owner_user_id !== undefined && row.owner_user_id !== employeeId) return invalid() }
export function isOwnTaskTarget(raw: unknown, api?: object): raw is OwnTaskTarget { return Boolean(raw && typeof raw === "object" && verified.has(raw) && (api === undefined || targetApis.get(raw) === api)) }

/** A navigation target is produced only after actual current-owner source reads. */
export async function readOwnTaskTarget(api: ReadApi, employee: string, requested: OwnOriginalTask, selection: number, current: () => boolean = () => true): Promise<OwnTaskTarget> {
  const employeeId = ownOperationId(employee)
  if (!Number.isSafeInteger(selection) || selection < 1 || !current()) return invalid()
  const input = object(requested)
  if (requested.kind === "schedule") {
    if (Object.keys(input).sort().join(",") !== "kind,scheduleId") return invalid()
    const id = ownOperationId(requested.scheduleId), schedule = object(await api.getSchedule(id))
    if (!current() || schedule.id !== id || !["agent", "workflow"].includes(String(schedule.kind))) return invalid()
    owner(schedule, employeeId)
    const kind = schedule.kind as "agent" | "workflow", resourceId = ownOperationId(kind === "agent" ? schedule.agent_spec_id : schedule.workflow_id)
    const resource = object(await (kind === "agent" ? api.getAgent(resourceId) : api.getWorkflow(resourceId)))
    if (!current() || resource.id !== resourceId) return invalid()
    owner(resource, employeeId)
    const target: OwnTaskTarget = Object.freeze({kind: "schedule", ownerId: employeeId, scheduleId: id, scheduleRevision: revision(schedule.revision), resourceKind: kind, resourceId, resourceRevision: revision(resource.revision), selection})
    verified.add(target); targetApis.set(target, api); targetResources.set(target, structuredClone(resource)); return target
  }
  if (Object.keys(input).sort().join(",") !== "kind,resourceId,runId" || !["agent_single", "agent_autonomous", "workflow_v2", "workflow_safe"].includes(requested.kind)) return invalid()
  const runId = ownOperationId(requested.runId), resourceId = ownOperationId(requested.resourceId), agent = requested.kind.startsWith("agent_")
  const get = requested.kind === "agent_single" ? () => api.getRun(runId) : requested.kind === "agent_autonomous" ? () => api.getAutonomousAgentRun(runId) : requested.kind === "workflow_v2" ? () => api.getWorkflowV2Run(runId) : () => api.getWorkflowRun(runId)
  const [detail, resource] = await Promise.all([get(), agent ? api.getAgent(resourceId) : api.getWorkflow(resourceId)])
  if (!current()) return invalid()
  const row = object(object(detail).run), config = object(resource), checkpoint = object(row.checkpoint)
  const target: OwnTaskTarget = Object.freeze({kind: requested.kind, ownerId: employeeId, runId, resourceId, resourceRevision: revision(config.revision), runRevision: recordedRevision(checkpoint[agent ? "spec_revision" : "workflow_revision"]), selection})
  verifyRun(target, detail); verifyResource(target, resource)
  verified.add(target); targetApis.set(target, api); targetResources.set(target, structuredClone(resource)); return target
}
export function ownTaskTargetResource(api: object, target: OwnTaskTarget): unknown {
  if (!isOwnTaskTarget(target, api)) return invalid()
  return structuredClone(targetResources.get(target))
}
function verifyResource(target: OwnTaskTarget, raw: unknown): void {
  const value = object(raw)
  if (value.id !== target.resourceId || revision(value.revision) !== target.resourceRevision) return invalid()
  owner(value, target.ownerId)
}
function verifyRun(target: OwnTaskRunTarget, raw: unknown): void {
  const detail = object(raw), run = object(detail.run), checkpoint = object(run.checkpoint), agent = target.kind.startsWith("agent_")
  if (run.id !== target.runId || run.kind !== (agent ? "agent" : "workflow") || run[agent ? "agent_spec_id" : "workflow_id"] !== target.resourceId || recordedRevision(checkpoint[agent ? "spec_revision" : "workflow_revision"]) !== target.runRevision) return invalid()
  owner(run, target.ownerId)
  if (target.kind === "agent_single" ? checkpoint.execution_mode === "agent_native_v2" : detail.execution_mode !== ({agent_autonomous: "agent_native_v2", workflow_v2: "workflow_native_v2", workflow_safe: "start_end_only"} as const)[target.kind]) return invalid()
}
export async function verifyOwnTaskRun(api: {getAgent?: (id: string) => Promise<unknown>; getWorkflow?: (id: string) => Promise<unknown>}, target: OwnTaskRunTarget, detail: unknown): Promise<void> {
  if (!isOwnTaskTarget(target, api) || !["agent_single", "agent_autonomous", "workflow_v2", "workflow_safe"].includes(target.kind)) return invalid()
  verifyRun(target, detail)
  const read = target.kind.startsWith("agent_") ? api.getAgent : api.getWorkflow
  if (!read) return invalid()
  verifyResource(target, await read(target.resourceId))
}
export function verifyOwnTaskSchedule(api: object, target: OwnTaskScheduleTarget, raw: unknown, resource: unknown): void {
  if (!isOwnTaskTarget(target, api) || target.kind !== "schedule") return invalid()
  const row = object(raw)
  if (row.id !== target.scheduleId || row.kind !== target.resourceKind || revision(row.revision) !== target.scheduleRevision || row[target.resourceKind === "agent" ? "agent_spec_id" : "workflow_id"] !== target.resourceId) return invalid()
  owner(row, target.ownerId); verifyResource(target, resource)
}

type Controller = {snapshot(): unknown; subscribe(fn: () => void): () => void; navigationBlocked?(): boolean}
type Registry = {guards: Set<() => boolean>; listeners: Set<() => void>; scopeKey: string}
const registries = new WeakMap<object, Registry>()
let nextScopeKey = 0
function registry(api: object): Registry { let value = registries.get(api); if (!value) { value = {guards: new Set(), listeners: new Set(), scopeKey: String(++nextScopeKey)}; registries.set(api, value) }; return value }
export const pgNativeOriginalTaskScopeKey = (api: object): string => registry(api).scopeKey
export function originalTaskViewBlocked(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true
  const view = raw as Record<string, unknown>
  return ["busy", "loading", "pending", "pendingSubmit", "pendingMutation", "pendingHumanResponse", "decision", "uncertain", "saving"].some(key => Boolean(view[key]))
}
export function pgNativeOriginalTasksBlocked(api: object): boolean { return [...registry(api).guards].some(read => { try { return read() !== false } catch { return true } }) }
export function subscribePgNativeOriginalTasks(api: object, listener: () => void): () => void { const value = registry(api); value.listeners.add(listener); return () => { value.listeners.delete(listener) } }
export function registerPgNativeOriginalTaskGuard(api: object, read: () => boolean): {changed(): void; dispose(): void} {
  const value = registry(api), changed = () => value.listeners.forEach(fn => fn())
  value.guards.add(read); changed()
  return {changed, dispose() { value.guards.delete(read); changed() }}
}
export function watchPgNativeOriginalTaskController(api: object, controller: Controller): () => void {
  const guard = registerPgNativeOriginalTaskGuard(api, () => controller.navigationBlocked ? controller.navigationBlocked() : originalTaskViewBlocked(controller.snapshot()))
  const unsubscribe = controller.subscribe(guard.changed)
  return () => { unsubscribe(); guard.dispose() }
}

/** Effect subscriptions may replay; the actual controller/read scope owns work. */
export function createOwnTaskTargetDelivery() {
  type Entry = {scope: object; target: OwnTaskTarget; listeners: Set<(opened: boolean) => void>; result?: boolean}
  let current: Entry | null = null
  return {
    attach(scope: object, target: OwnTaskTarget, read: () => Promise<boolean>, settled: (opened: boolean) => void): () => void {
      if (!current || current.scope !== scope || current.target !== target) {
        const entry: Entry = {scope, target, listeners: new Set()}
        current = entry
        void Promise.resolve().then(read).then(value => value === true, () => false).then(opened => {
          entry.result = opened
          if (current === entry) entry.listeners.forEach(fn => fn(opened))
        })
      }
      const entry = current
      entry.listeners.add(settled)
      if (entry.result !== undefined) queueMicrotask(() => { if (current === entry && entry.listeners.has(settled)) settled(entry.result!) })
      return () => { entry.listeners.delete(settled) }
    },
  }
}
