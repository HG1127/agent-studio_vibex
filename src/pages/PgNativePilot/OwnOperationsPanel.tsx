import {useEffect, useRef, useState} from "react"
import {ownCountKeys, ownTodoCategories, ownTodoKinds, ownTodoItemKey,
  type PgNativeOwnOperationsApi, type OwnOriginalTask, type OwnTodoCategory, type OwnTodoKind} from "../../lib/pgNativeOwnOperations.ts"
import {createPgNativeOwnOperationsSession, emptyOwnOperationsView,
  type PgNativeOwnOperationsSession, type OwnOperationsSessionView} from "../../lib/pgNativeOwnOperationsSession.ts"

type Props = {api: PgNativeOwnOperationsApi; employeeId: string; active?: boolean; availability?: {own_overview_available?: boolean; own_todos_available?: boolean}; destinationBusy: boolean; onOpenOriginal?: (task: OwnOriginalTask) => void | Promise<void>; onExpired?: () => void}
type Binding = {api: PgNativeOwnOperationsApi; employeeId: string; model: PgNativeOwnOperationsSession; view: OwnOperationsSessionView}
type Filters = {api: PgNativeOwnOperationsApi; employeeId: string; category: OwnTodoCategory; kind: OwnTodoKind; q: string}
const categories: Record<OwnTodoCategory, string> = {all: "全部待办", approval: "待我审批", human_input: "待回复或审核方案", paused: "暂停待核验", effect_review: "外部操作待核验", schedule_overdue: "超期计划", failed: "近 7 天失败"}
const kinds: Record<OwnTodoKind, string> = {all: "全部类型", agent_single: "单次 Agent", agent_autonomous: "自主 Agent", workflow_v2: "Workflow", workflow_safe: "基础 Workflow", schedule: "计划"}
const statuses: Record<string, string> = {queued: "排队中", running: "运行中", awaiting_approval: "待审批", awaiting_input: "待回复或审核方案", paused: "已暂停", succeeded: "已完成", failed: "失败", cancelled: "已取消", overdue: "已超期", unknown: "结果未知", started: "开始后待核验"}
const counts = {owned_agents: "我的 Agent", knowledge_bases: "我拥有的知识库", queued: "排队中", running: "运行中", awaiting_approval: "待我审批", awaiting_input: "待回复或审核方案", paused: "暂停待核验", failed_7d: "近 7 天创建且失败", schedules_active: "启用的计划", schedules_overdue: "超期计划", effects_need_review: "待核验外部操作", unsupported_runs: "暂不支持的历史运行"}
const button = "min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"

/** Owner metadata only; the Native page supplies read flags and task navigation. */
export default function OwnOperationsPanel({api, employeeId, active = false, availability, destinationBusy, onOpenOriginal, onExpired}: Props) {
  const [binding, setBinding] = useState<Binding | null>(null)
  const [filters, setFilters] = useState<Filters | null>(null)
  const callbacks = useRef({api, employeeId, destinationBusy, onExpired, onOpenOriginal})
  callbacks.current = {api, employeeId, destinationBusy, onExpired, onOpenOriginal}
  const overviewAvailable = availability?.own_overview_available === true, todosAvailable = availability?.own_todos_available === true
  const current = binding?.api === api && binding.employeeId === employeeId ? binding : null
  const model = current?.model ?? null
  const baseView = active && current ? current.view : emptyOwnOperationsView(employeeId)
  // Render-time closure prevents one stale actionable render before effects run.
  const view = {...baseView,
    overview: overviewAvailable ? baseView.overview : {status: "unavailable" as const, data: null, error: ""},
    todos: todosAvailable ? baseView.todos : {status: "unavailable" as const, data: null, error: ""},
    canOpenRecent: overviewAvailable && baseView.canOpenRecent,
    canOpenTodo: todosAvailable && baseView.canOpenTodo,
  }
  const selected = filters?.api === api && filters.employeeId === employeeId ? filters : {api, employeeId, category: "all" as const, kind: "all" as const, q: ""}
  useEffect(() => {
    let session: PgNativeOwnOperationsSession
    try { session = createPgNativeOwnOperationsSession(api, {employeeId, onExpired: () => {
      const latest = callbacks.current
      if (latest.api === api && latest.employeeId === employeeId) latest.onExpired?.()
    }}) }
    catch { setBinding(null); return }
    const publish = () => setBinding({api, employeeId, model: session, view: session.snapshot()})
    const unsubscribe = session.subscribe(publish)
    setFilters(null); publish()
    return () => { unsubscribe(); session.dispose() }
  }, [api, employeeId])
  useEffect(() => {
    if (!model) return
    model.setActive(active)
    model.setAvailability({own_overview_available: overviewAvailable, own_todos_available: todosAvailable})
    if (active) void model.refresh()
  }, [model, active, overviewAvailable, todosAvailable])
  useEffect(() => {
    model?.setNavigation({destinationBusy, onOpenOriginal: onOpenOriginal ? task => {
      const latest = callbacks.current
      if (latest.api === api && latest.employeeId === employeeId && latest.destinationBusy === false) return latest.onOpenOriginal?.(task)
    } : undefined})
  }, [model, api, employeeId, destinationBusy, onOpenOriginal])
  function change(patch: Partial<Pick<Filters, "category" | "kind" | "q">>) {
    const next = {...selected, ...patch}
    setFilters(next)
    if (model?.matchesScope(api, employeeId)) model.setFilters({category: next.category, kind: next.kind, q: next.q, limit: 20})
  }
  const overview = view.overview.data, page = view.todos.data
  const pending = overview ? overview.counts.awaiting_approval + overview.counts.awaiting_input : null
  const busy = destinationBusy !== false || view.opening
  return <section aria-label="我的运行概览与待办" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">我的运行概览与待办</h2><p className="mt-1 text-sm text-slate-600">仅当前员工的资源与任务。打开原任务后，再核对详情并处理。</p></div>
      <button type="button" className={button} disabled={!active || !model || !view.active || view.overview.status === "loading" || view.todos.status === "loading"} onClick={() => void model?.refresh()}>刷新概览与首页</button>
    </div>
    {!active && <p role="status">当前未启用个人概览读取，数据暂不可用。</p>}
    {busy && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">原任务正在处理，或仍有未确认的原请求。请先回原任务核对；暂不能切换任务。</p>}
    {view.navigationError && <p role="alert">{view.navigationError}</p>}
    <div aria-label="个人概览">
      <p className="text-xs text-slate-600">统计覆盖本人全部支持模式的运行；最近运行列表仅为预览。失败窗口按创建时间计算，为服务端统计时点之前 7 天。</p>
      {overview && <p className="mt-2 text-xs">统计时点：<time dateTime={overview.as_of}>{overview.as_of}</time>；窗口：{overview.window_days} 天。</p>}
      {view.overview.error && <p role="alert" className="mt-2 text-sm text-rose-700">{view.overview.error}</p>}
      {!overview && <p role="status" className="mt-2 text-sm">{view.overview.status === "loading" ? "正在读取概览，计数未知。" : view.overview.status === "unavailable" ? "个人概览暂不可用，计数未知。" : "个人概览暂不可核对，计数未知。"}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {ownCountKeys.map(key => <div key={key} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-600">{counts[key]}</dt><dd className="mt-1 text-xl font-semibold">{overview ? overview.counts[key] : "未知"}</dd></div>)}
      </dl>
      <p className="mt-2 text-sm">待审批与待回复合计：{pending !== null && Number.isSafeInteger(pending) ? pending : "未知"}。此合计不包含已完成运行、暂停、计划或外部操作待核验条目。</p>
      {!!overview?.counts.unsupported_runs && <p role="status" className="mt-2 text-sm text-amber-900">存在 {overview.counts.unsupported_runs} 条暂不支持的历史运行；以上运行状态计数和可打开列表未包括它们。</p>}
      <p className="mt-2 text-sm text-slate-600">受托审批：暂不可用。Worker 心跳：尚未接入，状态未知。</p>
    </div>
    <div className="space-y-3" aria-label="待办筛选与当前页">
      <h3 className="font-semibold">我的待办</h3>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">待办类别<select className="ml-2 min-h-10 rounded-lg border px-2" value={selected.category} disabled={!active || !model || !view.active || !todosAvailable} onChange={event => change({category: event.target.value as OwnTodoCategory})}>{ownTodoCategories.map(value => <option key={value} value={value}>{categories[value]}</option>)}</select></label>
        <label className="text-sm">任务类型<select className="ml-2 min-h-10 rounded-lg border px-2" value={selected.kind} disabled={!active || !model || !view.active || !todosAvailable} onChange={event => change({kind: event.target.value as OwnTodoKind})}>{ownTodoKinds.map(value => <option key={value} value={value}>{kinds[value]}</option>)}</select></label>
        <label className="text-sm">资源名称<input className="ml-2 min-h-10 rounded-lg border px-2" value={selected.q} disabled={!active || !model || !view.active || !todosAvailable} aria-invalid={!view.filtersValid} aria-describedby="own-operations-search-help" onChange={event => change({q: event.target.value})}/></label>
      </div>
      <p id="own-operations-search-help" className="text-xs text-slate-600">仅搜索当前资源名称，最多 100 个字符；输入后稍候更新。筛选变更从首页重新读取。</p>
      {view.todos.error && <p role="alert" className="text-sm text-rose-700">{view.todos.error}</p>}
      {(view.searchPending || view.todos.status === "loading") && <p role="status">{view.searchPending ? "等待搜索更新…" : "正在读取当前页…"}</p>}
      {!page && !view.searchPending && view.todos.status !== "loading" && <p role="status">{view.todos.status === "unavailable" ? "待办读取暂不可用；数量未知。" : "待办暂不可核对；数量未知。"}</p>}
      {page && <>
        <p className="text-xs text-slate-600">读取时点：<time dateTime={page.as_of}>{page.as_of}</time>。名称筛选：{page.q || "不限"}。本页 {page.items.length} 条，每页最多 {page.limit} 条；不据此推算待办总数。</p>
        {!page.items.length && <p>当前筛选下没有待办条目。</p>}
        <ul className="space-y-2">{page.items.map(row => <li key={ownTodoItemKey(row)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
          <div className="min-w-0"><p className="break-words font-medium">{row.resource_name || kinds[row.kind]}</p><p className="text-sm text-slate-600">{categories[row.category]} · {kinds[row.kind]} · {statuses[row.status]}</p><p className="break-all text-xs text-slate-500">任务 {row.id} · <time dateTime={row.observed_at}>{row.observed_at}</time></p>{row.step_key && <p className="break-all text-xs text-slate-500">步骤：{row.step_key}</p>}</div>
          <button type="button" className={button} disabled={busy || !view.canOpenTodo} onClick={() => void model?.openTodo(ownTodoItemKey(row), destinationBusy !== false)}>打开原任务</button>
        </li>)}</ul>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.searchPending || view.todos.status === "loading"} onClick={() => void model?.refreshTodos()}>刷新待办首页</button><button type="button" className={button} disabled={!page.has_more || !page.next_cursor || view.searchPending || view.todos.status !== "ready"} onClick={() => void model?.nextPage()}>下一页</button></div>
        <p className="text-xs text-slate-600">翻页替换当前页。游标固定统计窗口，期间状态仍可能变化；刷新可读取最新首页。</p>
      </>}
    </div>
    <div className="space-y-2" aria-label="最近运行与结果">
      <h3 className="font-semibold">最近运行与结果（含已完成）</h3>
      <p className="text-xs text-slate-600">最多最近 12 条，不作为全部待办的计数依据。审批与回复均需在原任务中核对。</p>
      {overview?.recent.length === 0 && <p className="text-sm">暂无最近运行。</p>}
      <ul className="space-y-2">{overview?.recent.map(row => <li key={row.run_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="break-words font-medium">{row.resource_name || kinds[row.kind]}</p><p className="text-sm text-slate-600">{kinds[row.kind]} · {statuses[row.status]}</p><p className="break-all text-xs text-slate-500">任务 {row.run_id} · <time dateTime={row.created_at}>{row.created_at}</time></p></div><button type="button" className={button} disabled={busy || !view.canOpenRecent} onClick={() => void model?.openRecent(row.run_id, destinationBusy !== false)}>打开原任务</button></li>)}</ul>
    </div>
  </section>
}
