import {useEffect, useRef, useState} from "react"
import {workerHeartbeatKinds, type WorkerHeartbeatKind} from "../../../services/pg-api/src/worker-heartbeat-contract.ts"
import type {PgNativeCompanyWorkerHeartbeatsApi} from "@/lib/pgNativeCompanyWorkerHeartbeats"
import {createPgNativeCompanyWorkerHeartbeatsSession, emptyCompanyWorkerHeartbeatsView,
  type CompanyWorkerHeartbeatsView, type PgNativeCompanyWorkerHeartbeatsSession} from "@/lib/pgNativeCompanyWorkerHeartbeatsSession"

type Props = {api?: PgNativeCompanyWorkerHeartbeatsApi; employeeId: string; currentAdmin: boolean; available: boolean; active: boolean; onExpired: () => void}
type Binding = {api: PgNativeCompanyWorkerHeartbeatsApi; employeeId: string; model: PgNativeCompanyWorkerHeartbeatsSession}
type PresentationProps = Pick<Props, "employeeId" | "currentAdmin" | "available" | "active"> & {view: CompanyWorkerHeartbeatsView; bound: boolean; onRefresh: () => void}
const labels: Record<WorkerHeartbeatKind, string> = {prepare: "任务准备", model: "模型调用", workflow_safe: "基础工作流", workflow_v2: "工作流",
  agent_autonomous: "多轮 Agent", knowledge_index: "知识索引", knowledge_query: "知识查询", assessment: "评价与优化"}
const states = {ready: "就绪（快照时点）", draining: "停止接收新任务（报告状态）", stale: "心跳已过期", unknown: "未知"} as const
const reasons = {fresh_ready_report: "已收到就绪报告", fresh_draining_report: "已收到停止接收报告", heartbeat_expired: "报告已超过有效期",
  not_observed: "尚无本代报告", not_instrumented: "尚未接入报告", component_disabled: "组件未开放", loop_unavailable: "执行循环暂不可用"} as const

export function CompanyWorkerHeartbeatsPresentation({employeeId, view, bound, currentAdmin, available, active, onRefresh}: PresentationProps) {
  if (!active) return null
  const readable = bound && view.employeeId === employeeId && currentAdmin && available && view.active && view.currentAdmin && view.available && !view.forbidden
  const data = readable && view.status === "snapshot" ? view.data : null, loading = readable && view.status === "loading"
  return <section aria-label="公司 Worker 心跳快照" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Worker 心跳</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">只显示实际读取的服务端报告。配置已开放、服务可访问或有待执行任务，都不能证明 Worker 就绪。</p></div>
      <button type="button" className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!readable || loading} onClick={onRefresh}>重新读取心跳快照</button></div>
    {view.forbidden ? <p role="alert" className="text-sm text-amber-900">管理员权限已变化，心跳快照已清空。可继续使用个人工作台。</p> :
      !currentAdmin || !available ? <p role="status" className="text-sm text-slate-600">当前未开放心跳读取，Worker 状态未知。</p> :
      loading ? <p role="status" className="text-sm">正在读取心跳快照，当前状态未知。</p> :
      !data ? <p role="status" className="text-sm">心跳快照暂不可核对，当前状态未知。</p> : null}
    {readable && view.error ? <p role="alert" className="text-sm text-rose-800">{view.error}</p> : null}
    {data ? <p className="text-xs text-slate-600">服务端快照时间（UTC）：<time dateTime={data.as_of}>{data.as_of}</time> · 报告有效窗口：{data.stale_after_ms / 1000} 秒</p> : null}
    <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><caption className="sr-only">八类 Worker 的服务端报告状态</caption>
      <thead><tr>{["组件", "报告状态", "最后报告时间（UTC）", "说明"].map(label => <th key={label} scope="col" className="px-2 py-2 font-medium text-slate-600">{label}</th>)}</tr></thead>
      <tbody>{workerHeartbeatKinds.map((kind, index) => {
        const row = data?.workers[index]
        return <tr key={kind} className="border-t border-slate-100"><th scope="row" className="px-2 py-3 font-medium">{labels[kind]}</th>
          <td className="px-2 py-3">{row ? states[row.state] : "未知"}</td><td className="px-2 py-3">{row?.last_seen_at ? <time dateTime={row.last_seen_at}>{row.last_seen_at}</time> : "未观测到"}</td>
          <td className="px-2 py-3">{row ? reasons[row.reason] : "尚无可核对快照"}</td></tr>
      })}</tbody></table></div>
    <p className="text-xs leading-6 text-slate-600">就绪仅表示快照时点收到有效就绪报告；停止接收报告不代表任务已全部结束。未知或过期不能当作离线，也不能当作就绪。</p>
  </section>
}

export default function CompanyWorkerHeartbeatsPanel({api, employeeId, currentAdmin, available, active, onExpired}: Props) {
  const callbacks = useRef({api, employeeId, onExpired}); callbacks.current = {api, employeeId, onExpired}
  const [binding, setBinding] = useState<Binding | null>(null)
  const current = api && binding?.api === api && binding.employeeId === employeeId && binding.model.matchesScope(api, employeeId) ? binding : null
  // Re-read local retention at render time too, even if a background-tab timer was delayed.
  const model = current?.model, view = active && current ? current.model.snapshot() : emptyCompanyWorkerHeartbeatsView(employeeId)
  useEffect(() => {
    if (!api) {setBinding(null); return}
    let session: PgNativeCompanyWorkerHeartbeatsSession
    try {session = createPgNativeCompanyWorkerHeartbeatsSession(api, {employeeId, onExpired: () => {
      const latest = callbacks.current
      if (latest.api === api && latest.employeeId === employeeId) latest.onExpired()
    }})} catch {setBinding(null); return}
    const publish = () => setBinding({api, employeeId, model: session})
    const unsubscribe = session.subscribe(publish); publish()
    return () => {unsubscribe(); session.dispose()}
  }, [api, employeeId])
  useEffect(() => {
    if (!model) return
    model.setActive(active); model.setAvailability({currentAdmin, company_worker_heartbeats_available: available})
    if (active && currentAdmin && available) void model.refresh()
  }, [model, active, currentAdmin, available])
  return <CompanyWorkerHeartbeatsPresentation employeeId={employeeId} view={view} bound={Boolean(model)} currentAdmin={currentAdmin} available={available} active={active}
    onRefresh={() => {if (api && active && currentAdmin && available && model?.matchesScope(api, employeeId)) void model.refresh()}}/>
}
