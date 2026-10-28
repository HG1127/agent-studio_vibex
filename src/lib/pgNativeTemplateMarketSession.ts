// In-memory UI scope. No browser storage, owner grants or automatic mutation replay.
import {agentTemplateMarketId as ID, agentTemplateMarketText as T, agentTemplateMarketObject as O, agentTemplateMarketArray as A,
  agentTemplateMarketCategory, parseAgentTemplateMarketQuery, parseAgentTemplateMarketLifecycleIntent,
  agentTemplateMarketCanonicalJson, type AgentTemplateMarketCategory} from "../../services/pg-api/src/agent-template-market-contract.ts"
import {parseAgentTemplateMarketPage, parseAgentTemplateMarketMinePage, type AgentTemplateMarketRow,
  type AgentTemplateMarketMineRow, type AgentTemplateMarketReceipt} from "../../services/pg-api/src/agent-template-market-result.ts"
import {parseTemplateMarketSource, parseTemplateMarketSourceOption, parseTemplateMarketDetail, parseTemplateMarketPublishPreview, parseTemplateMarketUsePreview,
  templateMarketPin, templateMarketPublishBody, templateMarketUseBody, templateMarketReceipt,
  type PgNativeTemplateMarketApi, type TemplateMarketIntent, type TemplateMarketSourceOption, type TemplateMarketDetail,
  type TemplateMarketPublishPreview, type TemplateMarketUsePreview} from "./pgNativeTemplateMarket.ts"

type LoadState = "idle" | "loading" | "ready" | "error"
type PublishDraft = {sourceId: string; name: string; description: string; category: AgentTemplateMarketCategory; reviewed: boolean}
type Lifecycle = {action: "unpublish" | "republish" | "delete"; detail: TemplateMarketDetail; confirmed: boolean}
export type TemplateMarketView = {employeeId: string; scopeKey: string; active: boolean; available: boolean; writes: boolean; busy: boolean;
  error: string; notice: string; tab: "market" | "mine"; query: {category: "all" | AgentTemplateMarketCategory; search: string};
  marketStatus: LoadState; market: AgentTemplateMarketRow[]; mineStatus: LoadState; mine: AgentTemplateMarketMineRow[];
  sourcesStatus: LoadState; sources: TemplateMarketSourceOption[]; publishOpen: boolean; publishDraft: PublishDraft;
  publishPreview: TemplateMarketPublishPreview | null; detail: TemplateMarketDetail | null; copyName: string; usePreview: TemplateMarketUsePreview | null;
  lifecycle: Lifecycle | null; pending: {operation: TemplateMarketIntent["action"]; request_id: string} | null; receipt: AgentTemplateMarketReceipt | null}
const draft = (): PublishDraft => ({sourceId: "", name: "", description: "", category: "other", reviewed: false})
export const emptyTemplateMarketView = (employeeId = "", scopeKey = ""): TemplateMarketView => ({employeeId, scopeKey, active: false, available: false, writes: false,
  busy: false, error: "", notice: "", tab: "market", query: {category: "all", search: ""}, marketStatus: "idle", market: [], mineStatus: "idle", mine: [],
  sourcesStatus: "idle", sources: [], publishOpen: false, publishDraft: draft(), publishPreview: null, detail: null, copyName: "", usePreview: null, lifecycle: null, pending: null, receipt: null})
function freeze<TValue>(value: TValue): TValue {if (value && typeof value === "object") {Object.values(value).forEach(freeze); Object.freeze(value)}; return value}
const field = (error: unknown, key: string): unknown => error && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined
const same = (a: unknown, b: unknown) => agentTemplateMarketCanonicalJson(a) === agentTemplateMarketCanonicalJson(b)
const text = (value: unknown, max: number) => {T(value, max); return value as string}

/** The caller must change scopeKey after logout/relogin, even for the same
 * employee. This is a generation tag, never a Cookie/session credential. */
export function createPgNativeTemplateMarketSession(api: PgNativeTemplateMarketApi, options: {employeeId: string; scopeKey: string;
  requestId?: () => string; onExpired?: () => void; onChanged?: () => void}) {
  const employeeId = ID(options.employeeId), scopeKey = T(options.scopeKey, 200, true), listeners = new Set<() => void>()
  const newId = options.requestId ?? (() => crypto.randomUUID())
  let state = emptyTemplateMarketView(employeeId, scopeKey), pending: TemplateMarketIntent | null = null
  let disposed = false, ticket = 0, abort: AbortController | null = null
  const visible = () => !disposed && state.active && state.available
  const writable = () => visible() && state.writes && !state.busy && !pending
  const emit = () => {if (!disposed) listeners.forEach(listener => listener())}
  const syncPending = () => {state.pending = pending ? {operation: pending.action, request_id: pending.request_id} : null}
  const clear = (keepPending = false) => {
    ticket++; abort?.abort(); abort = null
    const {active, available, writes} = state
    state = {...emptyTemplateMarketView(employeeId, scopeKey), active, available, writes}
    if (!keepPending) pending = null
    syncPending()
  }
  const current = (signal: AbortSignal) => visible() && !signal.aborted && abort?.signal === signal
  const notify = (callback?: () => void) => {try {void Promise.resolve(callback?.()).catch(() => {})} catch {}}
  const invalidateDrafts = () => {state.publishPreview = null; state.publishDraft.reviewed = false; state.usePreview = null; state.lifecycle = null}
  async function run(work: (signal: AbortSignal) => Promise<void>, mutation = false) {
    if (!visible() || state.busy) return
    const turn = ++ticket, controller = new AbortController(); abort = controller; state.busy = true; state.error = ""; state.notice = ""; emit()
    try {await work(controller.signal)} catch (error) {
      if (disposed || turn !== ticket) return
      const status = field(error, "status")
      if (status === 401) {clear(); state.active = false; state.available = false; state.writes = false; state.error = "登录已失效，请重新登录。"; notify(options.onExpired)}
      else if (status === 403) {clear(); state.available = false; state.writes = false; state.error = "访问状态已变化，内容已清空。"}
      else {
        if (mutation && field(error, "definitive") === true && typeof status === "number" && status >= 400 && status < 500) {pending = null; syncPending(); invalidateDrafts()}
        for (const key of ["marketStatus", "mineStatus", "sourcesStatus"] as const) if (state[key] === "loading") state[key] = "error"
        state.error = pending ? "还不能确认本次操作结果。请查询原操作结果，不要重复提交。" : status === 409 || status === 412 || status === 428 ? "模板或原方案已变化，请重新加载并预览。" : status === 404 ? "模板或原方案不存在，或当前无法访问。请重新加载。" : "加载或核对失败，请稍后重试。"
        if (!pending) invalidateDrafts()
        if (status === 409 || status === 412 || status === 428) {state.detail = null; state.copyName = ""}
      }
    } finally {if (!disposed) {if (turn === ticket) {state.busy = false; abort = null}; emit()}}
  }
  const acceptReceipt = (raw: unknown, intent: TemplateMarketIntent, signal: AbortSignal) => {
    const receipt = templateMarketReceipt(raw, intent)
    if (!current(signal)) return
    pending = null; syncPending(); state.receipt = receipt; invalidateDrafts(); state.publishOpen = false; state.publishDraft = draft(); state.sources = []; state.sourcesStatus = "idle"
    state.detail = null; state.copyName = ""; state.market = []; state.mine = []; state.marketStatus = "idle"; state.mineStatus = "idle"
    state.notice = receipt.operation === "publish" ? "模板已发布。" : receipt.operation === "use" ? "已复制为你的助手，请继续配置自己的模型与资源。" : receipt.operation === "unpublish" ? "模板已下架，已有副本不受影响。" : receipt.operation === "republish" ? "模板已重新上架。" : "模板已永久删除，已有副本不受影响。"
    notify(options.onChanged)
  }
  async function mutate(intent: TemplateMarketIntent) {
    if (!writable()) return
    await run(async signal => {pending = freeze(structuredClone(intent)); syncPending(); state.receipt = null; emit(); const receipt = await api.mutate(pending, signal); if (current(signal)) acceptReceipt(receipt, intent, signal)}, true)
  }
  async function refresh() {
    await run(async signal => {
      if (state.tab === "market") {
        state.marketStatus = "loading"; state.market = []; emit()
        const page = parseAgentTemplateMarketPage(await api.market(state.query, signal)); if (!current(signal)) return
        state.market = page.items; state.marketStatus = "ready"
      } else {
        state.mineStatus = "loading"; state.mine = []; emit()
        const page = parseAgentTemplateMarketMinePage(await api.mine(signal)); if (!current(signal)) return
        state.mine = page.items; state.mineStatus = "ready"
      }
    })
  }
  async function loadSources() {
    if (!writable() || !state.publishOpen) return
    await run(async signal => {
      state.sourcesStatus = "loading"; state.sources = []; state.publishPreview = null; state.publishDraft.reviewed = false; emit()
      const raw = O(await api.sources(signal), ["ok", "items"])
      if (raw.ok !== true) throw Error("invalid_sources")
      const sources = A(raw.items, 200).map(parseTemplateMarketSourceOption)
      if (new Set(sources.map(item => item.spec_id)).size !== sources.length) throw Error("invalid_sources")
      if (!current(signal)) return
      state.sources = sources; state.sourcesStatus = "ready"
      if (!sources.some(item => item.spec_id === state.publishDraft.sourceId)) state.publishDraft.sourceId = ""
    })
  }
  return {
    snapshot(): TemplateMarketView {return freeze(structuredClone(visible() ? state : {...emptyTemplateMarketView(employeeId, scopeKey), error: state.error}))},
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    matchesScope(candidate: PgNativeTemplateMarketApi, id: string, key: string) {return !disposed && candidate === api && id === employeeId && key === scopeKey},
    setActive(active: boolean) {if (disposed || state.active === (active === true)) return; state.active = active === true; if (!state.active) clear(true); emit()},
    setAvailability(hints: {available?: boolean; writes?: boolean}) {
      if (disposed) return
      const available = hints.available === true, writes = hints.writes === true
      if (available === state.available && writes === state.writes) return
      if (available !== state.available) clear(true)
      if (!writes) {invalidateDrafts(); state.publishOpen = false; state.publishDraft = draft(); state.sources = []; state.sourcesStatus = "idle"}
      state.available = available; state.writes = writes; syncPending(); emit()
    },
    async refresh() {await refresh()},
    async selectTab(tab: "market" | "mine") {if (!visible() || state.busy || tab !== "market" && tab !== "mine") return; state.tab = tab; state.detail = null; state.usePreview = null; state.lifecycle = null; emit(); await refresh()},
    setQuery(raw: unknown) {if (!visible() || state.busy) return; state.query = parseAgentTemplateMarketQuery(raw); state.market = []; state.marketStatus = "idle"; emit()},
    async openPublish() {if (!writable()) return; state.publishOpen = true; state.publishDraft = draft(); state.publishPreview = null; state.lifecycle = null; emit(); await loadSources()},
    async reloadSources() {await loadSources()},
    closePublish() {if (!visible() || state.busy) return; state.publishOpen = false; state.publishDraft = draft(); state.publishPreview = null; state.sources = []; state.sourcesStatus = "idle"; emit()},
    setPublishDraft(raw: unknown) {
      if (!writable() || !state.publishOpen) return
      const patch = O(raw, [], ["sourceId", "name", "description", "category"])
      const next = {...state.publishDraft, reviewed: false}
      if (Object.hasOwn(patch, "sourceId")) {next.sourceId = patch.sourceId === "" ? "" : ID(patch.sourceId); const picked = state.sources.find(item => item.spec_id === next.sourceId); if (picked && !next.name.trim()) next.name = picked.name}
      if (Object.hasOwn(patch, "name")) next.name = text(patch.name, 120)
      if (Object.hasOwn(patch, "description")) next.description = text(patch.description, 120)
      if (Object.hasOwn(patch, "category")) next.category = agentTemplateMarketCategory(patch.category)
      state.publishDraft = next; state.publishPreview = null; state.error = ""; emit()
    },
    setReviewed(checked: boolean) {if (!writable() || !state.publishPreview || typeof checked !== "boolean") return; state.publishDraft.reviewed = checked; emit()},
    async previewPublish() {
      if (!writable() || !state.publishOpen || state.sourcesStatus !== "ready" || !state.publishDraft.sourceId || !state.publishDraft.description.trim()) return
      const d = structuredClone(state.publishDraft)
      await run(async signal => {
        state.publishPreview = null; state.publishDraft.reviewed = false
        const source = parseTemplateMarketSource(await api.source(d.sourceId, signal)); if (!current(signal)) return
        if (source.source.spec_id !== d.sourceId) throw Error("source_scope_changed")
        const choice = {action: "preview_publish", source: source.source, name: d.name, description: d.description, category: d.category}
        const preview = await parseTemplateMarketPublishPreview(await api.previewPublish(choice, signal)); if (!current(signal)) return
        if (!same(preview.source, source.source) || preview.name !== (d.name.trim() || source.name) || preview.description !== d.description.trim() || preview.category !== d.category) throw Error("preview_scope_changed")
        state.publishPreview = preview
      })
    },
    async publish() {if (!writable() || !state.publishDraft.reviewed || !state.publishPreview) return; await mutate(templateMarketPublishBody(state.publishPreview, newId()))},
    async openDetail(key: string) {
      if (!visible() || state.busy) return
      const templateId = ID(key)
      await run(async signal => {state.detail = null; state.usePreview = null; state.copyName = ""; state.lifecycle = null; const detail = await parseTemplateMarketDetail(await api.detail(templateId, signal)); if (!current(signal)) return; if (detail.item.id !== templateId) throw Error("detail_scope_changed"); state.detail = detail; state.copyName = detail.item.name})
    },
    closeDetail() {if (!visible() || state.busy) return; state.detail = null; state.copyName = ""; state.usePreview = null; state.lifecycle = null; emit()},
    setCopyName(raw: unknown) {if (!writable() || !state.detail) return; state.copyName = text(raw, 120); state.usePreview = null; emit()},
    async previewUse() {
      if (!writable() || !state.detail || !state.detail.item.public) return
      const detail = state.detail, copyName = state.copyName.trim() || detail.item.name
      await run(async signal => {state.usePreview = null; const preview = await parseTemplateMarketUsePreview(await api.previewUse({action: "preview_use", template: templateMarketPin(detail.item), copy_name: copyName}, signal)); if (!current(signal)) return; if (!same(preview.template, templateMarketPin(detail.item)) || preview.name !== copyName) throw Error("copy_scope_changed"); state.usePreview = preview})
    },
    async copy() {if (!writable() || !state.usePreview) return; await mutate(templateMarketUseBody(state.usePreview, newId()))},
    async openLifecycle(key: string, action: "unpublish" | "republish" | "delete") {
      if (!writable() || !["unpublish", "republish", "delete"].includes(action)) return
      const templateId = ID(key)
      await run(async signal => {state.lifecycle = null; state.detail = null; state.usePreview = null; const detail = await parseTemplateMarketDetail(await api.detail(templateId, signal)); if (!current(signal)) return; if (detail.item.id !== templateId || !detail.is_mine || detail.item.built_in || action === "unpublish" && !detail.item.public || action === "republish" && detail.item.public) throw Error("lifecycle_scope_changed"); state.lifecycle = {action, detail, confirmed: false}})
    },
    setLifecycleConfirmed(checked: boolean) {if (!writable() || !state.lifecycle || typeof checked !== "boolean") return; state.lifecycle.confirmed = checked; emit()},
    closeLifecycle() {if (!visible() || state.busy) return; state.lifecycle = null; emit()},
    async commitLifecycle() {if (!writable() || !state.lifecycle?.confirmed) return; const choice = state.lifecycle; await mutate(parseAgentTemplateMarketLifecycleIntent({action: choice.action, request_id: newId(), template: templateMarketPin(choice.detail.item), confirm: true}))},
    async recover() {
      if (!visible() || !pending) return
      const original = pending
      await run(async signal => {
        const result = await api.recover(original, signal); if (!current(signal) || pending !== original) return
        if (result.status === "recorded") acceptReceipt(result.receipt, original, signal)
        else {if (result.status !== "not_recorded" || result.request_id !== original.request_id) throw Error("recovery_scope_changed"); state.notice = "尚未查到原操作结果。请稍后再次查询；不会自动重新提交。"}
      })
    },
    dispose() {if (disposed) return; clear(); disposed = true; listeners.forEach(listener => listener()); listeners.clear()},
  }
}
export type PgNativeTemplateMarketSession = ReturnType<typeof createPgNativeTemplateMarketSession>
