import {useEffect, useRef, useState} from "react"
import {companyEmployeeIsActive, type PgNativeCompanyOverviewApi, type CompanyOverview} from "@/lib/pgNativeCompanyOverview"
import {createPgNativeCompanyOverviewSession, emptyCompanyOverviewView,
  type PgNativeCompanyOverviewSession, type PgNativeCompanyOverviewSessionView} from "@/lib/pgNativeCompanyOverviewSession"

type Props = {api: PgNativeCompanyOverviewApi; employeeId: string; currentAdmin: boolean; available: boolean; active: boolean; onExpired: () => void}
type Binding = {api: PgNativeCompanyOverviewApi; employeeId: string; model: PgNativeCompanyOverviewSession; view: PgNativeCompanyOverviewSessionView}
type PresentationProps = Pick<Props, "currentAdmin" | "available" | "active"> & {
  view: PgNativeCompanyOverviewSessionView; bound: boolean; onRefresh: () => void; onFirstPage: () => void
  onNextPage: () => void; onPageSize: (limit: number) => void
}
const button = "min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
const totalLabels = {employees: "员工账号总数", active: "可用员工账号", agent_running: "Agent 执行中", workflow_running: "工作流执行中",
  pending_approvals: "待审批", human_input: "待回复", failed_7d: "近7天失败", overdue_schedules: "超期计划", knowledge_bases: "知识库数量"} as const
const totalKeys = Object.keys(totalLabels) as (keyof CompanyOverview["totals"])[]

/** Validated read-state presentation; these UI flags confer no backend authorization. */
export function CompanyOverviewPresentation({view, currentAdmin, available, active, bound,
  onRefresh, onFirstPage, onNextPage, onPageSize}: PresentationProps) {
  if (!active) return null
  // Close at render time, before effect cleanup, when profile/capability props change.
  const readable = bound && currentAdmin && available && view.active && view.available && !view.forbidden
  const overview = readable && view.overview.status === "ready" ? view.overview.data : null
  const page = readable && view.employees.status === "ready" ? view.employees.data : null
  const overviewBusy = readable && view.overview.status === "loading", pageBusy = readable && view.employees.status === "loading"
  return <section aria-label="公司运行统计与员工当前页" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">公司运行统计</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">仅展示员工状态与运行计数。任务内容及处理请回本人工作台核对。</p></div>
      <button type="button" className={button} disabled={!readable || overviewBusy || pageBusy} onClick={onRefresh}>刷新公司总数与员工首页</button>
    </div>
    {view.forbidden ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">公司统计已清空。请重新核对公司访问权限；可继续使用个人工作台。</p> :
      !currentAdmin || !available ? <p role="status" className="text-sm text-slate-600">当前未开放公司统计，计数未知。</p> : null}
    <section aria-label="公司全局统计" className="space-y-3">
      <h3 className="font-semibold">公司全局统计</h3>
      <p className="text-xs leading-6 text-slate-600">涵盖工作台内全部员工账号，包含停用员工的实际计数；运行计数覆盖所有已保存的模式。全局总数与员工页分别读取，统计时点可能不同。</p>
      {overview ? <p className="text-xs">公司统计时点：<time dateTime={overview.as_of}>{overview.as_of}</time> · 失败窗口：{overview.window_days} 天</p> :
        <p role="status" className="text-sm">{overviewBusy ? "正在读取公司全局统计，计数未知。" : "公司全局统计暂不可核对，计数未知。"}</p>}
      {view.overview.error ? <p role="alert" className="text-sm text-rose-800">{view.overview.error}</p> : null}
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">{totalKeys.map(key => <div key={key} className="rounded-xl bg-slate-50 p-3">
        <dt className="text-xs text-slate-600">{totalLabels[key]}</dt><dd className="mt-1 text-xl font-semibold">{overview ? overview.totals[key] : "未知"}</dd>
      </div>)}</dl>
      <p role="status" className="text-sm text-slate-600">Worker 心跳暂不可用（尚未接入真实遥测）。</p>
    </section>
    <section aria-label="员工运营统计当前页" className="space-y-3">
      <h3 className="font-semibold">员工运营统计当前页</h3>
      <div className="flex flex-wrap items-center gap-3"><label className="text-sm">每页员工数<select aria-label="每页员工数" className="ml-2 min-h-10 rounded-lg border px-2"
        value={view.query.limit} disabled={!readable || pageBusy} onChange={event => onPageSize(Number(event.target.value))}>
        {Array.from({length: 20}, (_, i) => i + 1).map(limit => <option key={limit} value={limit}>{limit}</option>)}
      </select></label><button type="button" className={button} disabled={!readable || pageBusy} onClick={onFirstPage}>刷新员工首页</button>
        <button type="button" className={button} disabled={!readable || pageBusy || !view.canNextPage} onClick={onNextPage}>下一页员工</button>
      </div>
      {page ? <p className="text-xs">员工页统计时点：<time dateTime={page.as_of}>{page.as_of}</time> · 当前页 {page.items.length} 人，每页最多 {page.limit} 人。{page.has_more ? "还有后续员工页。" : "当前已到末页。"}</p> :
        <p role="status" className="text-sm">{pageBusy ? "正在读取员工当前页，数量未知。" : "员工当前页暂不可核对，数量未知。"}</p>}
      {view.employees.error ? <p role="alert" className="text-sm text-rose-800">{view.employees.error}</p> : null}
      {!view.queryValid ? <p role="status" className="text-sm text-amber-900">请选择1至20的每页员工数，再读取员工首页。</p> : null}
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">当前员工页的状态与运营计数</caption>
        <thead><tr>{["员工", "状态", "Agent执行中", "工作流执行中", "待审批", "待回复", "近7天失败", "超期计划", "知识库"].map(label => <th key={label} scope="col" className="px-2 py-2 font-medium text-slate-600">{label}</th>)}</tr></thead>
        <tbody>{page ? page.items.length ? page.items.map(employee => <tr key={employee.employee_id} className="border-t border-slate-100">
          <th scope="row" className="max-w-48 break-words px-2 py-3 font-medium">{employee.display_name}{employee.is_admin ? <span className="ml-2 text-xs text-slate-500">管理员</span> : null}</th>
          <td className="px-2 py-3">{companyEmployeeIsActive(employee) ? "可用" : "已停用"}</td>
          <td className="px-2 py-3">{employee.agent_running}</td><td className="px-2 py-3">{employee.workflow_running}</td>
          <td className="px-2 py-3">{employee.pending_approvals}</td><td className="px-2 py-3">{employee.human_input}</td>
          <td className="px-2 py-3">{employee.failed_7d}</td><td className="px-2 py-3">{employee.overdue_schedules}</td><td className="px-2 py-3">{employee.knowledge_bases}</td>
        </tr>) : <tr><td colSpan={9} className="px-2 py-4 text-slate-600">当前页没有员工记录。</td></tr> :
          <tr><td colSpan={9} className="px-2 py-4 text-slate-600">当前页数据未知。</td></tr>}</tbody>
      </table></div>
      <p className="text-xs text-slate-600">员工当前页用于分页查看，不能将本页人数或计数当作公司总数。</p>
    </section>
  </section>
}

export default function CompanyOverviewPanel({api, employeeId, currentAdmin, available, active, onExpired}: Props) {
  const callbacks = useRef({api, employeeId, onExpired})
  callbacks.current = {api, employeeId, onExpired}
  const [binding, setBinding] = useState<Binding | null>(null)
  const current = binding?.api === api && binding.employeeId === employeeId && binding.model.matchesScope(api, employeeId) ? binding : null
  const model = current?.model, view = active && current ? current.view : emptyCompanyOverviewView(employeeId)
  useEffect(() => {
    let session: PgNativeCompanyOverviewSession
    try {session = createPgNativeCompanyOverviewSession(api, {employeeId, onExpired: () => {
      const latest = callbacks.current
      if (latest.api === api && latest.employeeId === employeeId) latest.onExpired()
    }})} catch {setBinding(null); return}
    const publish = () => setBinding({api, employeeId, model: session, view: session.snapshot()})
    const unsubscribe = session.subscribe(publish); publish()
    return () => {unsubscribe(); session.dispose()}
  }, [api, employeeId])
  useEffect(() => {
    if (!model) return
    model.setActive(active); model.setAvailability({currentAdmin, company_overview_available: available})
    if (active && currentAdmin && available) void model.refresh()
  }, [model, active, currentAdmin, available])
  const run = (action: (session: PgNativeCompanyOverviewSession) => void) => {
    if (active && currentAdmin && available && view.available && !view.forbidden && model?.matchesScope(api, employeeId)) action(model)
  }
  return <CompanyOverviewPresentation view={view} active={active} currentAdmin={currentAdmin} available={available} bound={Boolean(model)}
    onRefresh={() => run(session => {void session.refresh()})} onFirstPage={() => run(session => {void session.refreshEmployees()})}
    onNextPage={() => run(session => {void session.nextPage()})} onPageSize={limit => run(session => {session.setPageSize(limit); void session.refreshEmployees()})}/>
}
