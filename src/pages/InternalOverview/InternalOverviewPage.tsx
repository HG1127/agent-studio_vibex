import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  Activity, AlertCircle, ArrowRight, BookOpen, CalendarClock,
  CheckCircle2, ClipboardCheck, Clock3, Database, GitBranch,
  Loader2, Play, RefreshCw, ShieldAlert,
} from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { getPocketBaseUrl } from "@/lib/pb"
import { redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"

type StatusKind = "agent" | "workflow" | "schedule"
type ActionCategory = "input" | "approval" | "review" | "overdue" | "failed"
type ActionItem = {
  category: ActionCategory
  kind: StatusKind
  id: string
  title: string
  timestamp: string
}
type RecentRun = {
  id: string
  kind: "agent" | "workflow"
  title: string
  status: string
  created: string
  updated: string
}
type Overview = {
  ok: boolean
  scope: "current_user"
  generated_at_ms: number
  counters: {
    running: number
    awaiting_approval: number
    awaiting_input: number
    failed_7d: number
    paused: number
    schedules_active: number
    schedules_overdue: number
    knowledge_bases: number
    writes_need_review: number
  }
  action_items: ActionItem[]
  recent_runs: RecentRun[]
  worker: {
    configured: boolean
    alive: boolean
    last_seen_age_ms: number | null
  }
  sampling: {
    recent_limit_per_kind: number
    action_limit: number
    failed_window_days: number
  }
}

const categories: { value: "all" | ActionCategory; label: string }[] = [
  { value: "all", label: "全部待办" },
  { value: "input", label: "待我确认" },
  { value: "approval", label: "待审批" },
  { value: "review", label: "待核验" },
  { value: "overdue", label: "超期计划" },
  { value: "failed", label: "失败记录" },
]

const categoryMeta: Record<ActionCategory, { label: string; className: string }> = {
  input: { label: "等待我回复", className: "border-primary/30 bg-primary/5 text-primary" },
  approval: { label: "需要审批", className: "border-amber-300/40 bg-amber-50 text-amber-900" },
  review: { label: "需要人工核验", className: "border-amber-300/40 bg-amber-50 text-amber-900" },
  overdue: { label: "计划超期", className: "border-amber-300/40 bg-amber-50 text-amber-900" },
  failed: { label: "运行失败", className: "border-destructive/20 bg-destructive/5 text-destructive" },
}

const statusNames: Record<string, string> = {
  succeeded: "已完成", failed: "失败", cancelled: "已取消",
  running: "运行中", awaiting_input: "待回复", awaiting_approval: "待审批",
  paused: "已暂停", pending: "待运行",
}

function displayTime(value: string | number): string {
  if (!value) return "—"
  const date = typeof value === "number" ? new Date(value) :
    new Date(String(value).replace(" ", "T"))
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 19)
  return date.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

function actionHref(item: ActionItem): string {
  if (item.kind === "schedule") return "/scheduled-tasks"
  if (item.kind === "agent") return (item.category==="input" || item.category==="approval")
    ? "/agent-run?run=" + encodeURIComponent(item.id)
    : "/run-detail?run=" + encodeURIComponent(item.id)
  return "/workflow-canvas"
}

function runHref(run: RecentRun): string {
  return run.kind === "agent"
    ? "/run-detail?run=" + encodeURIComponent(run.id)
    : "/workflow-canvas"
}

export default function InternalOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [filter, setFilter] = useState<"all" | ActionCategory>("all")
  const [authRequired, setAuthRequired] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch(getPocketBaseUrl() + "/api/internal/overview", {
      headers: vibexAuthHeaders(),
      signal: controller.signal,
    }).then(async response => {
      const json = await response.json().catch(() => ({})) as Partial<Overview> & { error?: string }
      if (!response.ok) {
        if (response.status === 401 || response.status === 412) {
          setAuthRequired(true)
          throw new Error("登录状态已过期，请重新登录后查看内部任务总览")
        }
        throw new Error(json.error || "内部任务总览暂时不可用")
      }
      if (!json.counters || !Array.isArray(json.action_items) || !Array.isArray(json.recent_runs)) {
        throw new Error("服务器返回的任务数据不完整")
      }
      setOverview(json as Overview)
      setError("")
      setAuthRequired(false)
    }).catch(err => {
      if (!controller.signal.aborted) setError(String((err as Error).message || err))
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false)
    })
    return () => controller.abort()
  }, [revision])

  const filteredActions = useMemo(() =>
    (overview?.action_items || []).filter(item => filter === "all" || item.category === filter),
  [overview?.action_items, filter])

  const refresh = () => { setPending(true); setRevision(current => current + 1) }
  const c = overview?.counters
  const stats = [
    { title: "待我回复", value: c?.awaiting_input ?? 0, icon: ClipboardCheck, href: "/agent-run" },
    { title: "待审批", value: c?.awaiting_approval ?? 0, icon: ClipboardCheck, href: "/agent-run" },
    { title: "外部写入待核验", value: c?.writes_need_review ?? 0, icon: ShieldAlert, href: "/tool-hub" },
    { title: "已超期计划", value: c?.schedules_overdue ?? 0, icon: CalendarClock, href: "/scheduled-tasks" },
    { title: "近 7 天失败", value: c?.failed_7d ?? 0, icon: AlertCircle, href: "/agent-run" },
    { title: "正在运行", value: c?.running ?? 0, icon: Activity, href: "/agent-run" },
    { title: "个人知识库", value: c?.knowledge_bases ?? 0, icon: Database, href: "/knowledge-bases" },
  ]

  return (
    <SiteShell>
      <div className="min-h-screen flex-1 bg-background text-foreground">
        <header className="border-b border-border bg-card px-4 py-5 sm:px-6">
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/10 p-3 text-primary">
                <ClipboardCheck className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-xl font-semibold">内部任务总览</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  当天工作从这里开始 · 当前账号视角 · 不包含其他员工的私人运行记录
                </p>
              </div>
            </div>
            <button type="button" onClick={refresh} disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">
              <RefreshCw className={"h-4 w-4 " + (pending ? "animate-spin" : "")}/>
              刷新概览
            </button>
          </div>
        </header>
        <main className="w-full min-w-0 space-y-5 px-3 py-5 sm:px-5 lg:px-7 2xl:px-10">
          {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0"/>{error}</span>
            {authRequired
              ? <button type="button" className="underline" onClick={redirectToRhLogin}>去登录</button>
              : <button type="button" className="underline" onClick={refresh}>重试</button>}
          </div>}

          {!overview && pending ? (
            <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-24 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />正在获取我的任务情况…
            </div>
          ) : overview ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>数据更新于 {displayTime(overview.generated_at_ms)} · 失败任务统计周期：最近 {overview.sampling.failed_window_days} 天</span>
                <span>{overview.worker.alive
                  ? "后台 Worker 正常响应"
                  : overview.worker.configured ? "后台 Worker 暂未响应" : "尚未配置自动执行 Worker"}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map(item => <Link to={item.href} key={item.title}
                  className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/35 hover:shadow-md">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.title}</span><item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <strong className="text-3xl font-semibold tabular-nums">{item.value}</strong>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
                  </div>
                </Link>)}
              </div>

              {!overview.worker.alive && <div className="flex items-start gap-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>
                <p>
                  后台执行器{overview.worker.configured ? "目前未响应" : "尚未配置"}。
                  Agent 可以保存配置，但自动执行任务需要长期运行的 Worker。
                  <Link to="/tool-hub" className="ml-1 underline">查看运行监控</Link>
                </p>
              </div>}

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">需要我处理</h2>
                      <p className="mt-1 text-xs text-muted-foreground">待回复的 Agent、工具审批、人工核验、计划超期及近期运行失败</p>
                    </div>
                    <span className="text-xs text-muted-foreground">最多展示 {overview.sampling.action_limit} 条</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {categories.map(option =>
                      <button type="button" key={option.value} onClick={() => setFilter(option.value)}
                        aria-pressed={filter === option.value}
                        className={filter === option.value
                          ? "rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                          : "rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"}>
                        {option.label}
                      </button>,
                    )}
                  </div>
                  <div className="mt-4 space-y-2">
                    {filteredActions.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-9 text-center">
                        <CheckCircle2 className="h-6 w-6 text-primary"/>
                        <p className="text-sm font-medium">此筛选下没有待处理记录</p>
                        <p className="text-xs text-muted-foreground">可继续创建 Agent、工作流或知识库。</p>
                      </div>
                    ) : filteredActions.map((item, index) =>
                      <Link to={actionHref(item)} key={item.kind + item.id + item.category + index}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary/30 hover:bg-secondary/35">
                        <div className="min-w-0 flex-1">
                          <span className={"inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium " + categoryMeta[item.category].className}>
                            {categoryMeta[item.category].label}
                          </span>
                          <p className="mt-1.5 truncate text-sm font-medium">{item.title}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {item.kind === "schedule" ? "定时计划" : item.kind === "agent" ? "Agent" : "工作流"}
                            {" · "}{displayTime(item.timestamp)}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>,
                    )}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    待办列表有展示上限；点击记录进入原有运行页面核验，系统不会在本页自动批准或重试。
                  </p>
                </section>

                <div className="space-y-5">
                  <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="text-base font-semibold">常用入口</h2>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        {label:"创建 Agent",href:"/agent-create",icon:Play},
                        {label:"运行工作流",href:"/workflow-canvas",icon:GitBranch},
                        {label:"管理定时任务",href:"/scheduled-tasks",icon:Clock3},
                        {label:"管理知识库",href:"/knowledge-bases",icon:BookOpen},
                        {label:"内部共享 Agent",href:"/internal-templates",icon:ClipboardCheck},
                      ].map(item => <Link to={item.href} key={item.label}
                        className="flex min-h-20 flex-col items-start justify-center gap-2 rounded-xl border border-border bg-background p-3 text-xs font-medium hover:bg-secondary">
                        <item.icon className="h-4 w-4 text-primary"/>{item.label}
                      </Link>)}
                    </div>
                  </section>
                  <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold">最近运行</h2>
                      <Link to="/agent-run" className="text-xs text-primary hover:underline">运行中心</Link>
                    </div>
                    <div className="mt-3 space-y-2">
                      {overview.recent_runs.length === 0 ?
                        <p className="py-8 text-center text-xs text-muted-foreground">暂无运行历史，创建并试跑一个任务。</p> :
                        overview.recent_runs.slice(0, 8).map(run => <Link to={runHref(run)} key={run.kind + run.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 hover:bg-secondary">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{run.title}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {run.kind === "agent" ? "Agent" : "工作流"} · {displayTime(run.created)}
                            </p>
                          </div>
                          <span className={"shrink-0 text-xs " + (run.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                            {statusNames[run.status] || run.status || "未知"}
                          </span>
                        </Link>)
                      }
                    </div>
                  </section>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                此页按当前登录账号汇总。跨员工共享知识库、统一审批和团队级统计将在完成权限设计后另行实现。
              </p>
            </>
          ) : null}
        </main>
      </div>
    </SiteShell>
  )
}
