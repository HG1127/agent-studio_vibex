import {agentDesignJsonValue, parseAgentDesignEditableFields, type AgentDesignEditableFields} from "../../services/pg-api/src/agent-design-value-contract.ts"
import {agentDesignSubmitBody, agentDesignSaveBody, designId, parseAgentDesignPreview, parseAgentDesignReceipt, parseAgentDesignView, parseAgentDesignSavePreview, parseAgentDesignSaveReceipt,
  type PgNativeAgentDesignApi, type AgentDesignPreview, type AgentDesignReceipt, type AgentDesignView, type AgentDesignSavePreview, type AgentDesignSaveReceipt} from "./pgNativeAgentDesign.ts"
type Pending = {kind: "submit" | "control" | "save"; body: unknown}
export type AgentDesignSessionView = {employeeId: string; active: boolean; available: boolean; submissions: boolean; saves: boolean; busy: boolean; error: string;
  preview: AgentDesignPreview | null; receipt: AgentDesignReceipt | null; result: AgentDesignView | null; fields: AgentDesignEditableFields | null; savePreview: AgentDesignSavePreview | null; saveReceipt: AgentDesignSaveReceipt | null; pending: Pending | null}
export const emptyAgentDesignView = (employeeId = ""): AgentDesignSessionView => ({employeeId, active: false, available: false, submissions: false, saves: false, busy: false, error: "", preview: null, receipt: null, result: null, fields: null, savePreview: null, saveReceipt: null, pending: null})
function freeze<T>(v: T): T {if (v && typeof v === "object") {Object.values(v).forEach(freeze); Object.freeze(v)}; return v}
const status = (e: unknown): unknown => e && typeof e === "object" ? Object.getOwnPropertyDescriptor(e, "status")?.value : undefined
/** All capabilities are hints; Native/Owner/source checks remain server-side. */
export function createPgNativeAgentDesignSession(api: PgNativeAgentDesignApi, options: {employeeId: string; onExpired?: () => void; requestId?: () => string}) {
  const employeeId = designId(options.employeeId), listeners = new Set<() => void>(), newId = options.requestId ?? (() => crypto.randomUUID())
  let state = emptyAgentDesignView(employeeId), disposed = false, ticket = 0, abort: AbortController | null = null
  const visible = () => !disposed && state.active && state.available
  const emit = () => {if (!disposed) listeners.forEach(fn => fn())}
  const clear = () => {ticket++; abort?.abort(); abort = null; state = {...emptyAgentDesignView(employeeId), active: state.active, available: state.available, submissions: state.submissions, saves: state.saves}}
  const hide = () => {const pending = state.pending, receipt = state.receipt; clear(); state.pending = pending; state.receipt = receipt}
  const original = (v: unknown) => freeze(agentDesignJsonValue(v))
  async function action(work: (signal: AbortSignal) => Promise<void>) {
    if (!visible() || state.busy) return
    const turn = ++ticket, c = new AbortController(); abort = c; state.busy = true; state.error = ""; emit()
    // API callbacks mutate only while this scope is still current.
    const guard = async (signal: AbortSignal) => {await work(signal)}
    try {await guard(c.signal)} catch (e) {
      if (disposed || turn !== ticket) return
      if (status(e) === 401) {clear(); state.active = false; state.available = false; state.error = "员工登录已失效，请重新登录。"; try {void Promise.resolve(options.onExpired?.()).catch(() => {})} catch {}}
      else if (status(e) === 403) {clear(); state.available = false; state.submissions = false; state.saves = false; state.error = "访问权限或功能开放状态已变化，内容已清空。"}
      else state.error = state.pending ? "操作结果尚未核对。请查询原始回执；不要重复发起模型请求或保存。" : "当前内容无法核对，请重新读取来源或预览。"
    } finally {if (!disposed && turn === ticket) {state.busy = false; abort = null; emit()} else emit()}
  }
  // API promises can outlive abort. Every awaited result must pass this fence.
  const current = (signal: AbortSignal) => visible() && !signal.aborted && abort?.signal === signal
  return {
    snapshot(): AgentDesignSessionView {return freeze(structuredClone(visible() ? state : {...emptyAgentDesignView(employeeId), error: state.error}))},
    subscribe(fn: () => void) {listeners.add(fn); return () => {listeners.delete(fn)}},
    matchesScope(candidate: PgNativeAgentDesignApi, id: string) {return !disposed && candidate === api && id === employeeId},
    setActive(active: boolean) {if (disposed || state.active === (active === true)) return; state.active = active === true; if (!state.active) hide(); emit()},
    setAvailability(hints: {available?: boolean; submissions?: boolean; saves?: boolean}) {
      if (disposed) return
      const available = hints.available === true, submissions = hints.submissions === true, saves = hints.saves === true
      if (available === state.available && submissions === state.submissions && saves === state.saves) return
      if (available !== state.available) hide()
      state.available = available; state.submissions = submissions; state.saves = saves; emit()
    },
    invalidatePreview() {if (!visible() || state.busy) return; state.preview = null; state.savePreview = null; emit()},
    async preview(choice: unknown) {if (state.pending) return; await action(async signal => {const p = parseAgentDesignPreview(await api.preview(choice, signal)); if (!current(signal)) return; state.preview = p; state.receipt = null; state.result = null; state.fields = null; state.savePreview = null; state.saveReceipt = null})},
    async previewRevision(choice: {instruction: string; model_binding: unknown; output_token_limit: number}, specId: string) {
      if (state.pending) return
      await action(async signal => {
        const s = await api.source(designId(specId), signal); if (!current(signal)) return
        const p = parseAgentDesignPreview(await api.preview({action: "preview", purpose: "revise", ...choice, source: s.source}, signal))
        if (!current(signal)) return; state.preview = p; state.receipt = null; state.result = null; state.fields = null; state.savePreview = null; state.saveReceipt = null
      })
    },
    async submit() {
      if (!state.submissions || !state.preview || state.pending) return
      const body = original(agentDesignSubmitBody(state.preview, newId()))
      await action(async signal => {state.pending = {kind: "submit", body}; emit(); const r = parseAgentDesignReceipt(await api.submit(body, signal)); if (!current(signal)) return; state.receipt = r; state.pending = null; state.preview = null})
    },
    async readResult() {
      if (!state.receipt) return
      const id = state.receipt.request_id
      await action(async signal => {const v = parseAgentDesignView(await api.view(id, signal)); if (!current(signal) || v.receipt.request_id !== id) return; state.result = v; state.receipt = v.receipt; state.savePreview = null; state.fields = v.result_status === "available" && v.result ? parseAgentDesignEditableFields(Object.fromEntries(["name", "goal", "task_scope", "deliverables", "task_plan", "done_criteria"].map(k => [k, v.result!.result[k as keyof typeof v.result.result]]))) : null})
    },
    editFields(raw: unknown) {if (!visible() || state.busy || state.pending || !state.fields) return; state.fields = parseAgentDesignEditableFields(raw); state.savePreview = null; state.saveReceipt = null; emit()},
    async previewSave() {
      if (!state.fields || state.result?.result_status !== "available" || !state.result.result || state.pending) return
      const input = {action: "preview_save", design_request_id: state.result.receipt.request_id, expected_result_sha256: state.result.result.result_sha256, fields: state.fields}
      await action(async signal => {const p = parseAgentDesignSavePreview(await api.previewSave(input, signal)); if (current(signal)) state.savePreview = p})
    },
    async save() {
      if (!state.saves || !state.savePreview || state.pending) return
      const body = original(agentDesignSaveBody(state.savePreview, newId()))
      await action(async signal => {state.pending = {kind: "save", body}; emit(); const r = parseAgentDesignSaveReceipt(await api.save(body, signal)); if (!current(signal)) return; state.saveReceipt = r; state.pending = null; state.savePreview = null})
    },
    async control(kind: "cancel" | "erase") {
      if (!state.receipt || state.pending) return
      const body = original({action: kind, request_id: newId(), design_request_id: state.receipt.request_id, confirm: true})
      await action(async signal => {state.pending = {kind: "control", body}; emit(); await api.control(body, signal); if (!current(signal)) return; state.pending = null; state.result = null; state.fields = null; state.savePreview = null; state.saveReceipt = null})
    },
    async confirmOriginal() {
      const p = state.pending; if (!p) return
      await action(async signal => {
        if (p.kind === "submit") {const r = parseAgentDesignReceipt(await api.submit(p.body, signal, true)); if (!current(signal)) return; state.receipt = r; state.preview = null}
        else if (p.kind === "save") {const body = p.body as {intent: unknown}; const r = parseAgentDesignSaveReceipt(await api.save(body.intent, signal, true)); if (!current(signal)) return; state.saveReceipt = r; state.savePreview = null}
        else {await api.control(p.body, signal, true); if (!current(signal)) return; state.result = null; state.fields = null; state.savePreview = null}
        state.pending = null
      })
    },
    dispose() {if (disposed) return; clear(); disposed = true; listeners.forEach(fn => fn()); listeners.clear()},
  }
}
export type PgNativeAgentDesignSession = ReturnType<typeof createPgNativeAgentDesignSession>
