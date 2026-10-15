import { Link } from "react-router-dom"
import {
  Activity, AlertCircle, CalendarClock, CheckCircle2, ChevronRight,
  Clock3, History, Pause, Pencil, Play, RefreshCw, ShieldCheck,
  Trash2, X, Zap,
} from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { RunTraceCard } from "@/components/run-detail/RunTraceCard"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { redirectToRhLogin } from "@/lib/studioAuth"
import { scheduleDescription } from "@/lib/scheduleTime.js"
import { formatScheduledDate, scheduleHistoryLabel } from "./types"
import { ScheduleEditor } from "./ScheduleEditor"
import { useScheduledTasks } from "./useScheduledTasks"

export function ScheduledTasksPage(p: ReturnType<typeof useScheduledTasks>) {
  const shown = p.items.filter(x=>p.filter==="all"||(p.filter==="active"?x.enabled:!x.enabled))
  const entries = p.history.filter(x=>!p.historyFilter||x.schedule_id===p.historyFilter)
  const activeCount = p.items.filter(x=>x.enabled).length
  return <SiteShell>
    <div className="min-h-screen flex-1 bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><CalendarClock className="h-5 w-5"/></span>
            <div><h1 className="text-lg font-semibold">定时任务</h1>
              <p className="text-xs text-muted-foreground">Agent / 工作流自动运行 · 可编辑的周期计划</p>
            </div>
          </div>
          <button type="button" onClick={()=>void p.refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs hover:bg-secondary">
            <RefreshCw className="h-4 w-4"/>刷新
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {label:"全部计划",value:p.items.length,icon:CalendarClock},
            {label:"已启用",value:activeCount,icon:Activity},
            {label:"最近执行记录",value:p.history.length,icon:History},
          ].map(m=><div key={m.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{m.label}</span><m.icon className="h-4 w-4"/>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{m.value}</p>
          </div>)}
        </div>
        {p.workerAlive===false && <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <strong>后台执行器未在线。</strong> 可以保存计划，但自动触发需要在服务器上运行独立 Worker；
          请前往 <Link to="/tool-hub" className="underline">调试监控</Link> 检查。
        </div>}
        {p.error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0"/>{p.error}</span>
          {p.error.includes("登录")?
            <button type="button" onClick={redirectToRhLogin} className="shrink-0 underline">去登录</button>:
            <button type="button" onClick={()=>p.setError("")} aria-label="关闭错误提示"><X className="h-4 w-4"/></button>}
        </div>}
        {p.notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary"/>{p.notice}
        </div>}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,0.95fr)_minmax(360px,1.4fr)]">
          <ScheduleEditor {...p}/>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-base font-semibold">我的计划</h2>
                <p className="mt-1 text-xs text-muted-foreground">即时触发、启停、编辑和删除</p>
              </div>
              <div className="flex rounded-lg bg-secondary p-1">
                {(["all","active","disabled"] as const).map(v=><button key={v} type="button"
                  onClick={()=>p.setFilter(v)}
                  className={p.filter===v?"rounded-md bg-background px-2.5 py-1.5 text-xs font-semibold shadow-sm":"rounded-md px-2.5 py-1.5 text-xs text-muted-foreground"}>
                  {v==="all"?"全部":v==="active"?"启用中":"已停用"}
                </button>)}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {p.initialLoading?<p className="py-12 text-center text-sm text-muted-foreground">正在加载计划…</p>:
              !shown.length?<div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
                <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/>
                <p className="text-sm font-medium">暂无符合条件的任务</p>
                <p className="mt-2 text-xs text-muted-foreground">先在左侧创建一个定时计划。</p>
              </div>:
              shown.map(task=><article key={task.id} className="rounded-xl border border-border bg-background p-4 hover:border-primary/30">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{task.name}</span>
                      <span className={task.enabled?"rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary":"rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"}>
                        {task.enabled?"已启用":task.recurrence_kind==="once"&&task.next_at_ms===0?"已执行":"已暂停"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {task.target_kind==="agent"?"Agent":"工作流"} · {scheduleDescription(task)}
                    </p>
                  </div>
                  <button type="button" onClick={()=>{
                    p.setHistoryFilter(task.id)
                    document.getElementById("scheduled-history")?.scrollIntoView({behavior:"smooth"})
                  }} className="shrink-0 text-xs text-primary hover:underline">
                    执行记录 <ChevronRight className="inline h-3 w-3"/>
                  </button>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{task.instruction}</p>
                <div className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5"/>
                    下次：<strong className="font-medium text-card-foreground">{task.enabled?formatScheduledDate(task.next_at_ms):"—"}</strong>
                  </span>
                  {task.last_due_ms>0&&<span className="ml-3">上次触发：{formatScheduledDate(task.last_due_ms)}</span>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" disabled={Boolean(p.busyId)||!task.enabled} onClick={()=>void p.action(task,"run_now")}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-40">
                    <Play className="h-3.5 w-3.5"/>立即运行
                  </button>
                  <button type="button"
                    disabled={Boolean(p.busyId)||(!task.enabled&&task.recurrence_kind==="once"&&task.next_at_ms===0)}
                    onClick={()=>void p.action(task,"toggle")}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-40">
                    {task.enabled?<Pause className="h-3.5 w-3.5"/>:<Zap className="h-3.5 w-3.5"/>}
                    {task.enabled?"暂停":"启用"}
                  </button>
                  <button type="button" onClick={()=>p.edit(task)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary">
                    <Pencil className="h-3.5 w-3.5"/>编辑
                  </button>
                  <button type="button" disabled={Boolean(p.busyId)} onClick={()=>void p.action(task,"delete")}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-destructive/20 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5"/>删除
                  </button>
                </div>
              </article>)}
            </div>
          </section>
        </div>
        <section id="scheduled-history" className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="flex items-center gap-2 text-base font-semibold"><History className="h-4 w-4 text-primary"/>执行历史</h2>
              <p className="mt-1 text-xs text-muted-foreground">记录定时触发、成功、失败、跳过和人工审批状态</p>
            </div>
            <div className="flex items-center gap-2">
              <select aria-label="筛选执行历史" className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
                value={p.historyFilter} onChange={e=>p.setHistoryFilter(e.target.value)}>
                <option value="">全部计划</option>{p.items.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {p.historyFilter&&<button type="button" onClick={()=>p.setHistoryFilter("")} className="text-xs text-primary hover:underline">清除</button>}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {!entries.length?<p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">暂无执行记录</p>:
              entries.map(row=><div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-xs">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.items.find(t=>t.id===row.schedule_id)?.name||"已删除的计划"}</span>
                    <span className={["failed","failed_start","invalid_schedule"].includes(row.status)?"rounded-full bg-destructive/10 px-2 py-0.5 text-destructive":"rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"}>
                      {scheduleHistoryLabel(row.status)}
                    </span>
                  </p>
                  <p className="text-muted-foreground">计划触发：{formatScheduledDate(row.scheduled_for_ms)} · 发起尝试 {row.attempts} 次</p>
                  {row.error&&<p className="break-words text-destructive">{row.error}</p>}
                </div>
                {row.status==="failed_start" && p.items.some(t=>t.id===row.schedule_id) &&
                  <button type="button" disabled={Boolean(p.busyId)} onClick={()=>void p.retryFailedLaunch(row)}
                    className="shrink-0 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-40">
                    重试启动
                  </button>}
                {row.run_id && (
                  <button type="button" onClick={() => void p.viewRun(row)}
                    className="shrink-0 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10">
                    查看执行结果
                  </button>
                )}
                {row.run_id&&<button type="button" title={row.run_id}
                  onClick={()=>void navigator.clipboard.writeText(row.run_id)
                    .then(()=>p.setNotice("已复制运行 ID："+row.run_id)).catch(()=>p.setError("复制失败"))}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary">
                  复制运行 ID
                </button>}
              </div>)}
          </div>
        </section>
        <Dialog open={Boolean(p.runPreview)} onOpenChange={open => { if (!open) p.setRunPreview(null) }}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>定时任务执行结果 · {p.runPreview?.name || "历史计划"}</DialogTitle>
              <DialogDescription>运行 ID：{p.runPreview?.id || "—"}</DialogDescription>
            </DialogHeader>
            {p.runPreview?.loading ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">正在读取执行详情…</p>
            ) : p.runPreview ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{p.runPreview.kind === "workflow" ? "工作流" : "Agent"}</span>
                  <span>状态：{scheduleHistoryLabel(p.runPreview.status)}</span>
                  <span>事件：{p.runPreview.events} 条</span>
                  {p.runPreview.kind === "agent" && <Link to={"/run-detail?run=" + encodeURIComponent(p.runPreview.id)}
                    className="ml-auto text-primary underline">打开完整 Agent 记录</Link>}
                </div>
                {p.runPreview.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{p.runPreview.error}</p>}
                <section>
                  <h3 className="mb-2 text-sm font-semibold">最终输出</h3>
                  <pre className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-secondary/40 p-4 font-sans text-sm leading-relaxed">
                    {p.runPreview.result || "尚无最终输出。任务可能仍在执行或等待审批。"}
                  </pre>
                </section>
                {(p.runPreview.kind === "agent" || p.runPreview.kind === "workflow") &&
                  <RunTraceCard kind={p.runPreview.kind} runId={p.runPreview.id} />}
                {!!p.runPreview.result && <button type="button"
                  onClick={() => { if (p.runPreview) void navigator.clipboard.writeText(p.runPreview.result).then(() => p.setNotice("结果已复制")).catch(() => p.setError("复制失败")) }}
                  className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary">复制最终输出</button>}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary"/>
          <span>任务按当前用户隔离；同一触发时段自动去重。第三方写操作请先进行人工验证。</span>
          <Link to="/tool-hub" className="ml-auto text-primary hover:underline">查看后台状态 →</Link>
        </div>
      </main>
    </div>
  </SiteShell>
}
