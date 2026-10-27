import {ownOperationId, ownTodoQuery, ownTodoItemKey, parseOwnOverview, parseOwnTodoPage, ownOriginalRun, ownOriginalTodo,
  type PgNativeOwnOperationsApi, type OwnOverview, type OwnTodoPage, type OwnTodoQuery, type OwnOriginalTask} from "./pgNativeOwnOperations.ts"

export type OwnReadState<T> = {status: "unavailable" | "unknown" | "loading" | "ready"; data: T | null; error: string}
export type OwnOperationsSessionView = {employeeId: string; active: boolean; query: OwnTodoQuery; filtersValid: boolean; searchPending: boolean; overview: OwnReadState<OwnOverview>; todos: OwnReadState<OwnTodoPage>; destinationBusy: boolean; opening: boolean; navigationError: string; canOpenRecent: boolean; canOpenTodo: boolean}
const region = <T>(status: OwnReadState<T>["status"] = "unavailable", error = ""): OwnReadState<T> => ({status, data: null, error})
export const emptyOwnOperationsView = (employeeId = ""): OwnOperationsSessionView => ({employeeId, active: false, query: ownTodoQuery(), filtersValid: true, searchPending: false, overview: region(), todos: region(), destinationBusy: true, opening: false, navigationError: "", canOpenRecent: false, canOpenTodo: false})
function status(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const value = Object.getOwnPropertyDescriptor(error, "status")?.value
  return typeof value === "number" && Number.isInteger(value) ? value : null
}
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value) }; return value }

/** Every lifetime is keyed by BOTH verified employee ID and API object identity. */
export function createPgNativeOwnOperationsSession(initialApi: PgNativeOwnOperationsApi, options: {employeeId: string; onExpired?: () => void; onOpenOriginal?: (task: OwnOriginalTask) => void | Promise<void>; debounceMs?: number}) {
  let api = initialApi, employeeId = ownOperationId(options.employeeId)
  const debounceMs = options.debounceMs ?? 300
  if (!Number.isSafeInteger(debounceMs) || debounceMs < 0 || debounceMs > 2000) throw Error("invalid_own_operations_debounce")
  let active = false, disposed = false, expiredSession = false, life = 0, overviewTicket = 0, todosTicket = 0
  let overviewAvailable = false, todosAvailable = false, destinationBusy = true, opening = false, navigationError = ""
  let overview = region<OwnOverview>(), todos = region<OwnTodoPage>(), query = freeze(ownTodoQuery()), searchPending = false, filtersValid = true
  let timer: ReturnType<typeof setTimeout> | null = null, overviewAbort: AbortController | null = null, todosAbort: AbortController | null = null
  let onOpenOriginal = options.onOpenOriginal
  const listeners = new Set<() => void>()
  const visible = () => active && !disposed
  const canOpenRecent = () => visible() && overviewAvailable && overview.status === "ready" && !destinationBusy && !opening && Boolean(onOpenOriginal)
  const canOpenTodo = () => visible() && todosAvailable && todos.status === "ready" && !searchPending && !destinationBusy && !opening && Boolean(onOpenOriginal)
  const snapshot = (): OwnOperationsSessionView => {
    if (visible()) return structuredClone({employeeId, active: true, query, filtersValid, searchPending, overview, todos, destinationBusy, opening, navigationError, canOpenRecent: canOpenRecent(), canOpenTodo: canOpenTodo()})
    const empty = emptyOwnOperationsView(employeeId)
    if (expiredSession) { empty.overview.error = "员工登录已失效，请重新登录。"; empty.todos.error = empty.overview.error }
    return empty
  }
  const emit = () => { if (!disposed) listeners.forEach(fn => fn()) }
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; searchPending = false }
  const cancelOverview = () => { overviewTicket++; overviewAbort?.abort(); overviewAbort = null }
  const cancelTodos = () => { todosTicket++; todosAbort?.abort(); todosAbort = null; clearTimer() }
  const resetReads = () => { cancelOverview(); cancelTodos(); overview = region(overviewAvailable ? "unknown" : "unavailable"); todos = region(todosAvailable ? "unknown" : "unavailable"); query = freeze(ownTodoQuery({...query, before: undefined})); navigationError = "" }
  function dispose() {
    if (disposed) return
    disposed = true; active = false; life++; cancelOverview(); cancelTodos(); overview = region(); todos = region(); opening = false; navigationError = ""; onOpenOriginal = undefined
    listeners.forEach(fn => fn()); listeners.clear()
  }
  function expired(ticket: number) {
    if (disposed || life !== ticket) return
    expiredSession = true; dispose()
    try { options.onExpired?.() } catch { /* Expiry has already cleared every projection. */ }
  }
  async function readOverview() {
    if (!visible() || !overviewAvailable) return
    cancelOverview(); const ticket = overviewTicket, lifetime = life, selectedApi = api, abort = new AbortController()
    overviewAbort = abort; overview = region("loading"); navigationError = ""; emit()
    const current = () => visible() && overviewAvailable && lifetime === life && ticket === overviewTicket && api === selectedApi
    try {
      const raw = await selectedApi.getOwnOverview({signal: abort.signal})
      if (!current()) return
      overview = {status: "ready", data: freeze(parseOwnOverview(raw)), error: ""}
    } catch (error) {
      if (disposed || life !== lifetime) return
      if (status(error) === 401) { expired(lifetime); return }
      if (!current()) return
      overview = region(status(error) === 403 || status(error) === 409 ? "unavailable" : "unknown", "个人概览暂不可核对，计数未知。")
    } finally { if (current()) { overviewAbort = null; emit() } }
  }
  async function readTodos(request: OwnTodoQuery) {
    if (!visible() || !todosAvailable || !filtersValid) return
    cancelTodos(); const selected = freeze(ownTodoQuery(request)), ticket = todosTicket, lifetime = life, selectedApi = api, abort = new AbortController()
    query = selected; todosAbort = abort; todos = region("loading"); navigationError = ""; emit()
    const current = () => visible() && todosAvailable && lifetime === life && ticket === todosTicket && api === selectedApi
    try {
      const raw = await selectedApi.listOwnTodos(selected, {signal: abort.signal})
      if (!current()) return
      const value = await parseOwnTodoPage(raw, selected)
      if (!current()) return
      todos = {status: "ready", data: freeze(value), error: ""}
    } catch (error) {
      if (disposed || life !== lifetime) return
      if (status(error) === 401) { expired(lifetime); return }
      if (!current()) return
      todos = region(status(error) === 403 || status(error) === 409 ? "unavailable" : "unknown", "待办暂不可核对，请重新读取；当前结果数量未知。")
    } finally { if (current()) { todosAbort = null; emit() } }
  }
  async function open(task: OwnOriginalTask, allowed: boolean) {
    if (!allowed || destinationBusy || opening || !onOpenOriginal) return
    const lifetime = life, selectedApi = api, callback = onOpenOriginal
    opening = true; navigationError = ""; emit()
    try { await callback(freeze(structuredClone(task))) }
    catch { if (!disposed && life === lifetime && api === selectedApi) navigationError = "暂未打开原任务，请保留并先核对原请求。" }
    finally { if (!disposed && life === lifetime && api === selectedApi) { opening = false; emit() } }
  }
  return {
    snapshot, dispose,
    subscribe(fn: () => void) { if (!disposed) listeners.add(fn); return () => { listeners.delete(fn) } },
    matchesScope(candidateApi: PgNativeOwnOperationsApi, candidateEmployeeId: string) { return !disposed && api === candidateApi && employeeId === candidateEmployeeId },
    setIdentity(value: {api: PgNativeOwnOperationsApi; employeeId: string}) {
      if (disposed || api === value.api && employeeId === value.employeeId) return
      const next = ownOperationId(value.employeeId)
      life++; resetReads(); api = value.api; employeeId = next; active = false; overviewAvailable = false; todosAvailable = false; destinationBusy = true; opening = false
      overview = region(); todos = region(); query = freeze(ownTodoQuery()); filtersValid = true; onOpenOriginal = undefined; emit()
    },
    setActive(value: boolean) { if (disposed || active === (value === true)) return; active = value === true; resetReads(); emit() },
    setAvailability(value: {own_overview_available?: boolean; own_todos_available?: boolean}) {
      if (disposed) return
      const nextOverview = value.own_overview_available === true, nextTodos = value.own_todos_available === true
      if (overviewAvailable !== nextOverview) { overviewAvailable = nextOverview; cancelOverview(); overview = region(nextOverview ? "unknown" : "unavailable") }
      if (todosAvailable !== nextTodos) { todosAvailable = nextTodos; cancelTodos(); query = freeze(ownTodoQuery({...query, before: undefined})); todos = region(nextTodos ? "unknown" : "unavailable") }
      emit()
    },
    setNavigation(value: {destinationBusy: boolean; onOpenOriginal?: (task: OwnOriginalTask) => void | Promise<void>}) { if (disposed) return; destinationBusy = value.destinationBusy !== false; onOpenOriginal = value.onOpenOriginal; emit() },
    async refresh() { if (!visible()) return; clearTimer(); await Promise.all([readOverview(), readTodos(ownTodoQuery({...query, before: undefined}))]) },
    refreshOverview: readOverview,
    async refreshTodos() { if (!visible()) return; await readTodos(ownTodoQuery({...query, before: undefined})) },
    setFilters(raw: unknown) {
      if (disposed) return
      let selected: OwnTodoQuery
      try { selected = ownTodoQuery(raw); if (selected.before !== undefined) throw Error("filter_cannot_supply_cursor") }
      catch { cancelTodos(); filtersValid = false; todos = region("unknown", "筛选无效：资源名称最多 100 个字符，页大小为 1 至 20。"); emit(); return }
      const changedSearch = selected.q !== query.q
      cancelTodos(); filtersValid = true; query = freeze(selected); todos = region(todosAvailable ? "unknown" : "unavailable"); navigationError = ""
      if (visible() && todosAvailable && changedSearch) {
        searchPending = true
        timer = setTimeout(() => { timer = null; searchPending = false; void readTodos(selected) }, debounceMs)
      } else if (visible() && todosAvailable) { void readTodos(selected) }
      emit()
    },
    async nextPage() {
      if (!visible() || !todosAvailable || searchPending || todos.status !== "ready" || !todos.data?.has_more || !todos.data.next_cursor) return
      const next = ownTodoQuery({...query, before: todos.data.next_cursor}); await readTodos(next)
    },
    openTodo(key: string, destinationBlocked = false) { const row = todos.data?.items.find(item => ownTodoItemKey(item) === key); return row ? open(ownOriginalTodo(row), canOpenTodo() && destinationBlocked === false) : Promise.resolve() },
    openRecent(runId: string, destinationBlocked = false) { const row = overview.data?.recent.find(item => item.run_id === runId); return row ? open(ownOriginalRun(row), canOpenRecent() && destinationBlocked === false) : Promise.resolve() },
  }
}
export type PgNativeOwnOperationsSession = ReturnType<typeof createPgNativeOwnOperationsSession>
