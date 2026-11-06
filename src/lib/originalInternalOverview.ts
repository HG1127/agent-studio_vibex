import {parseOriginalInternalOverview,originalInternalEmployeeId} from '../../shared/original-internal-overview-contract.ts'
import {parseOwnOperationsJson} from './pgNativeOwnOperations.ts'
/** Original personal-overview boundary. Company metadata counts cannot satisfy
 * this page's owner-only actions, historical run titles or legacy Worker health. */
export class OriginalInternalOverviewReadError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message); this.name = "OriginalInternalOverviewReadError"; this.status = status; this.code = code
  }
}
type ReadOptions = {
  backend: "pocketbase" | "native_pg"
  legacyUrl(): string
  legacyHeaders(): Record<string, string>
  signal: AbortSignal
  employeeId?: string
  transport?: typeof fetch
}
export async function loadOriginalInternalOverview({backend, legacyUrl, legacyHeaders, signal, employeeId, transport = fetch}: ReadOptions): Promise<unknown> {
  if (backend === 'native_pg') {
    let expected: string
    try {expected = originalInternalEmployeeId(employeeId)} catch {throw new OriginalInternalOverviewReadError(503,'original_internal_overview_contract_unavailable','个人任务总览暂不可用，请先重新核对登录账号。')}
    let response: Response
    try {response = await transport('/__pg_native/api/v2/original-ui/internal-overview', {method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/json','X-AgentStudio-Expected-Employee':expected},signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])})}
    catch {throw new OriginalInternalOverviewReadError(0,'original_internal_overview_connection_unavailable','个人任务总览暂时无法读取，请稍后重试。')}
    if (response.status === 401) throw new OriginalInternalOverviewReadError(401,'internal_overview_session_required','登录状态已过期，请重新登录后查看内部任务总览')
    if (response.status === 403) throw new OriginalInternalOverviewReadError(403,'original_internal_overview_denied','当前账号暂时无权读取个人任务总览。')
    if (response.status === 409) throw new OriginalInternalOverviewReadError(409,'original_internal_overview_employee_changed','登录账号已变化，请刷新后重新读取个人任务总览。')
    if (!response.ok) throw new OriginalInternalOverviewReadError(response.status,'original_internal_overview_unavailable','个人任务总览暂时不可用，数据未知。')
    try {
      const v = parseOriginalInternalOverview(parseOwnOperationsJson(await response.text()), expected)
      return {ok:true,scope:'current_user',generated_at_ms:Date.parse(v.as_of),counters:v.counters,
        action_items:v.action_items.map(r=>({...r,title:r.title===null?'历史标题未记录':r.title})),
        recent_runs:v.recent_runs.map(r=>({...r,title:'历史标题未记录',status:r.status==='queued'?'pending':r.status})),
        worker:{configured:null,alive:null,last_seen_age_ms:null},sampling:v.sampling,
        notice:'运行记录未保存历史标题，列表已明确标识；后台 Worker 状态暂不可核对。'}
    } catch {throw new OriginalInternalOverviewReadError(503,'invalid_original_internal_overview_response','个人任务总览数据不完整，当前计数未知。')}
  }
  return loadLegacyOriginalInternalOverview({backend, legacyUrl, legacyHeaders, signal, transport})
}

export async function loadLegacyOriginalInternalOverview({backend, legacyUrl, legacyHeaders, signal, transport = fetch}: ReadOptions): Promise<unknown> {
  if (backend !== 'pocketbase') throw new OriginalInternalOverviewReadError(503,'original_internal_overview_contract_unavailable','个人任务总览暂时不可用。')
  const response = await transport(legacyUrl() + "/api/internal/overview", {headers: legacyHeaders(), signal})
  const raw: unknown = await response.json().catch(() => ({}))
  const json = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as
    {counters?: unknown; action_items?: unknown; recent_runs?: unknown; error?: string} : {}
  if (!response.ok) {
    if (response.status === 401 || response.status === 412) throw new OriginalInternalOverviewReadError(response.status,
      "internal_overview_session_required", "登录状态已过期，请重新登录后查看内部任务总览")
    throw new OriginalInternalOverviewReadError(response.status, "internal_overview_read_failed", json.error || "内部任务总览暂时不可用")
  }
  // Preserve the existing valid PB wire contract and historical title values.
  if (!json.counters || !Array.isArray(json.action_items) || !Array.isArray(json.recent_runs))
    throw new OriginalInternalOverviewReadError(503, "internal_overview_incomplete", "服务器返回的任务数据不完整")
  return json
}

export type OriginalInternalOverviewReadState<T> = {scope: string; overview: T | null; pending: boolean; error: string; authRequired: boolean}
export function originalInternalOverviewFailureState<T>(previous: OriginalInternalOverviewReadState<T>, scope: string,
  backend: "pocketbase" | "native_pg", error: unknown): OriginalInternalOverviewReadState<T> {
  const status = error instanceof OriginalInternalOverviewReadError ? error.status : 0
  const authRequired = status === 401 || status === 412
  return {scope, overview: backend === "pocketbase" && previous.scope === scope && !authRequired && status !== 403 ? previous.overview : null,
    pending: false, error: error instanceof Error ? error.message : "内部任务总览暂时不可用", authRequired}
}

/** UI request ordering only; neither a scope string nor this token authorizes a
 * request. The existing server remains responsible for current verified users. */
export function createOriginalInternalOverviewReadGate() {
  let sequence = 0
  return {
    begin(scope: string, signal: AbortSignal) {
      const ticket = ++sequence
      let cancelled = false
      return Object.freeze({
        current(latestScope: string) {return !cancelled && !signal.aborted && ticket === sequence && latestScope === scope},
        cancel() {cancelled = true},
      })
    },
  }
}
