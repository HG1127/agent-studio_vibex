import {agentDescriptivePatchTarget, agentDescriptivePatchPreview, agentDescriptivePatchReceipt,
  agentDescriptivePatchOriginal, agentDescriptivePatchCanonical,
  type PgNativeDescriptivePatchApi, type PgNativeDescriptivePatchTarget,
  type PgNativeDescriptivePatchPreview, type PgNativeDescriptivePatchReceipt,
  type PgNativeDescriptivePatchAcceptance} from "./pgNativeAgentDescriptivePatch.ts"

export type PgNativeAgentDescriptivePatchSessionView = {
  target: PgNativeDescriptivePatchTarget | null; preview: PgNativeDescriptivePatchPreview | null
  receipt: PgNativeDescriptivePatchReceipt | null
  pending: {original: PgNativeDescriptivePatchAcceptance; unknown: boolean} | null
  loading: boolean; busy: boolean; canAccept: boolean; error: string; notice: string
}
export const emptyAgentDescriptivePatchView = (): PgNativeAgentDescriptivePatchSessionView => ({
  target: null, preview: null, receipt: null, pending: null, loading: false, busy: false,
  canAccept: false, error: "", notice: "",
})
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {Object.values(value).forEach(freeze); Object.freeze(value)}
  return value
}
const equal = (a: unknown, b: unknown) => agentDescriptivePatchCanonical(a) === agentDescriptivePatchCanonical(b)
function status(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const value = Object.getOwnPropertyDescriptor(error, "status")?.value
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

/** One instance belongs to one employee/API lifetime. Hide/scope changes retain its original request. */
export function createPgNativeAgentDescriptivePatchSession(api: PgNativeDescriptivePatchApi,
  {key = () => crypto.randomUUID(), onExpired = () => {}, onAccepted = () => {}}: {
    key?: () => string; onExpired?: () => void; onAccepted?: (receipt: PgNativeDescriptivePatchReceipt) => void
  } = {}) {
  let active = false, available = false, acceptance = false, disposed = false, life = 0, reads = 0
  let loading = false, busy = false, error = "", notice = ""
  let target: PgNativeDescriptivePatchTarget | null = null, preview: PgNativeDescriptivePatchPreview | null = null
  let receipt: PgNativeDescriptivePatchReceipt | null = null
  let pending: {original: PgNativeDescriptivePatchAcceptance; unknown: boolean; proof: PgNativeDescriptivePatchPreview} | null = null
  let flight: Promise<void> | null = null
  const listeners = new Set<() => void>(), notified = new Set<string>()
  const visible = () => active && !disposed
  const live = (ticket: number) => !disposed && ticket === life
  const snapshot = (): PgNativeAgentDescriptivePatchSessionView => !visible() ? emptyAgentDescriptivePatchView() : structuredClone({
    target, preview, receipt, pending: pending ? {original: pending.original, unknown: pending.unknown} : null,
    loading, busy, canAccept: available && acceptance && Boolean(preview) && !receipt && !pending && !loading && !busy,
    error, notice,
  })
  const emit = () => {if (!disposed) listeners.forEach(fn => fn())}
  const invalidate = () => {reads++; loading = false; preview = null}
  const dispose = () => {
    disposed = true; life++; reads++; target = null; preview = null; receipt = null; pending = null
    flight = null; loading = false; busy = false; error = ""; notice = ""; notified.clear()
    listeners.forEach(fn => fn()); listeners.clear()
  }
  const expire = (ticket: number) => {if (live(ticket)) {dispose(); onExpired()}}
  async function read(kind: "preview" | "receipt") {
    if (!visible() || !target || pending || flight || loading || kind === "preview" && (!available || receipt)) return
    const selected = structuredClone(target), ticket = ++reads, lifetime = life
    loading = true; error = ""; notice = ""; if (kind === "preview") preview = null; emit()
    const accepts = () => visible() && live(lifetime) && ticket === reads && target !== null && equal(target, selected)
    try {
      const raw = await (kind === "preview" ? api.previewAgentDescriptivePatch({action: "preview", ...selected}) : api.getAgentDescriptivePatch(selected.review_id))
      if (!accepts()) return
      if (kind === "preview") {
        const value = await agentDescriptivePatchPreview(raw, selected)
        if (!accepts()) return
        preview = freeze(value)
      } else {
        const value = await agentDescriptivePatchReceipt(raw, {target: selected, replayed: true})
        if (!accepts()) return
        if (receipt && receipt.receipt_sha256 !== value.receipt_sha256) throw Error("descriptive_patch_receipt_changed")
        receipt = freeze(value); preview = null; notice = "已核对真实的描述补丁配置回执。"
      }
    } catch (caught) {
      if (!live(lifetime)) return
      if (status(caught) === 401) {expire(lifetime); return}
      if (!accepts()) return
      if (kind === "receipt" && status(caught) === 404 && !receipt) notice = "尚未找到已接受的描述补丁回执。"
      else error = kind === "preview" ? "描述补丁或来源暂无法核对，请重新预览。" : "描述补丁配置回执暂无法核对，请重试读取。"
    } finally {if (accepts()) {loading = false; emit()}}
  }
  function mutate(mode: "fresh" | "confirm" | "retry"): Promise<void> {
    if (flight) return flight
    if (!visible() || !pending) return Promise.resolve()
    const original = pending.original, proof = pending.proof, lifetime = life
    reads++; loading = false; preview = null; busy = true; error = ""; notice = ""
    const work = (async () => {
      let accepted: PgNativeDescriptivePatchReceipt | null = null
      try {
        const raw = await (mode === "confirm" ? api.confirmAgentDescriptivePatch(original) : api.acceptAgentDescriptivePatch(original))
        if (!live(lifetime)) return
        const value = await agentDescriptivePatchReceipt(raw, {
          target: {review_id: original.review_id, spec_id: original.spec_id, target_run_id: original.target_run_id},
          original, ...(mode === "confirm" ? {replayed: true} : {}),
        })
        if (!live(lifetime)) return
        for (const field of ["source_kind", "mode", "source", "feedback_sources", "feedback_sources_sha256", "anchor", "changed_keys"] as const)
          if (!equal(value[field], proof[field])) throw Error("descriptive_patch_receipt_binding_changed")
        if (!equal(value.provided_keys, proof.model_patch.provided_keys) || value.patch_sha256 !== proof.model_patch.patch_sha256 ||
            value.candidate_sha256 !== proof.candidate.candidate_sha256) throw Error("descriptive_patch_attribution_changed")
        receipt = freeze(value); pending = null
        notice = "已应用模型提供的描述补丁，角色配置已更新。"; accepted = value
      } catch (caught) {
        if (!live(lifetime)) return
        const code = status(caught)
        if (code === 401) {expire(lifetime); return}
        if (mode === "fresh" && pending && !pending.unknown && code !== null && [400, 403, 404, 405, 409, 413, 415].includes(code)) {
          pending = null; error = "本次描述补丁未获确认，请重新核对来源后预览。"
        } else {
          if (pending) pending.unknown = true
          error = "配置修改结果尚未确认。请核对原请求，或明确重交完全相同的原请求。"
        }
      }
      if (accepted && live(lifetime)) {
        const notification = accepted.request_id + ":" + accepted.receipt_sha256
        if (!notified.has(notification)) {
          notified.add(notification)
          try {void Promise.resolve(onAccepted(structuredClone(accepted))).catch(() => {})} catch {/* Verified settlement remains recorded. */}
        }
      }
    })()
    const finished = work.finally(() => {if (live(lifetime) && flight === finished) {flight = null; busy = false; emit()}})
    flight = finished; emit(); return finished
  }
  return {
    navigationBlocked: () => !disposed && Boolean(busy || loading || pending || flight), snapshot, dispose,
    subscribe(fn: () => void) {if (!disposed) listeners.add(fn); return () => listeners.delete(fn)},
    setActive(value: boolean) {if (disposed || active === Boolean(value)) return; active = Boolean(value); invalidate(); emit()},
    setScopes(value: {available: boolean; acceptance: boolean}) {
      if (disposed) return
      const next = value.available === true, enabled = next && value.acceptance === true
      if (next !== available || enabled !== acceptance) {available = next; acceptance = enabled; invalidate(); emit()}
    },
    async select(raw: PgNativeDescriptivePatchTarget | null) {
      if (disposed || pending || flight) return
      let selected: PgNativeDescriptivePatchTarget | null
      try {selected = raw === null ? null : agentDescriptivePatchTarget(raw)} catch {error = "描述补丁目标无效。"; emit(); return}
      if (equal(target, selected)) return
      invalidate(); target = selected ? freeze(selected) : null; receipt = null; error = ""; notice = ""; emit()
      if (selected) await read("receipt")
    },
    prepare: () => read("preview"), refreshReceipt: () => read("receipt"),
    accept(confirmed: boolean): Promise<void> {
      if (flight) return flight
      if (!visible() || !available || !acceptance || !preview || receipt || pending || loading || confirmed !== true) return Promise.resolve()
      try {pending = {original: freeze(agentDescriptivePatchOriginal(preview, key())), proof: preview, unknown: false}}
      catch {error = "无法准备这次描述补丁修改，请重新预览。"; emit(); return Promise.resolve()}
      return mutate("fresh")
    },
    confirm: () => mutate("confirm"), retrySameRequest: () => mutate("retry"),
  }
}
