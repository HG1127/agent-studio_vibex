import { Activity, RefreshCw, ServerCog } from "lucide-react"
import type { WorkerStatus } from "@/pages/ToolHub/useToolHub"
import { Link } from "react-router-dom"

type Props = {
  status: WorkerStatus | null
  onRefresh: () => void
}

export function WorkerStatusPanel({ status, onRefresh }: Props) {
  const label = !status
    ? "正在检查"
    : !status.enabled
      ? "未启用"
      : status.alive
        ? "后台运行中"
        : "已启用但离线"
  const detail = !status?.enabled
    ? "当前使用浏览器驱动任务；部署独立 Worker 后才能在关闭页面时继续执行。"
    : status.alive
      ? "后台执行器最近有心跳，关闭当前页面也不影响已在运行的任务。"
      : "后台执行器尚无近期心跳。请检查服务端环境变量及 Worker 进程日志。"

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="后台任务运行状态">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <ServerCog className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-card-foreground">后台任务执行器</h2>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={status?.alive ? "inline-flex items-center gap-1.5 text-xs font-medium text-primary" : "inline-flex items-center gap-1.5 text-xs text-muted-foreground"}>
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="刷新后台任务执行器状态"
            title="刷新后台执行器状态"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {status?.enabled && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>心跳：{status.last_seen ? new Date(status.last_seen).toLocaleString("zh-CN") : "尚无记录"}</span>
          <span>最近执行：{status.last_step_at ? new Date(status.last_step_at).toLocaleString("zh-CN") : "尚无记录"}</span>
          <span>累计执行尝试：{status.tick_attempts_total}</span>
          {status.last_seen_age_ms != null && <span>距上次心跳：约 {Math.floor(status.last_seen_age_ms / 1000)} 秒</span>}
        </div>
      )}
      {status?.queue && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-xs font-medium text-card-foreground">我的任务队列</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "运行中的 Agent", value: status.queue.agent_running },
              { label: "运行中的工作流", value: status.queue.workflow_running },
              { label: "等待人工审批", value: status.queue.awaiting_approval },
              { label: "正在执行的步骤", value: status.queue.inflight },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-secondary/60 px-3 py-2">
                <div className="text-lg font-semibold tabular-nums text-card-foreground">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
            <span>已启用定时计划：<strong className="text-card-foreground">{status.queue.scheduled_active}</strong></span>
            <span>待调度时段：<strong className="text-card-foreground">{status.queue.scheduled_pending}</strong></span>
            <Link to="/scheduled-tasks" className="ml-auto text-primary hover:underline">管理定时任务 →</Link>
          </div>
          {(status.queue.scheduled_overdue || 0) > 0 && (
            <p role="status" className="mt-3 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              检测到 {status.queue.scheduled_overdue} 条定时计划已超过预定时间 60 秒仍待触发。
              最早一条已到期约 {Math.round((status.queue.oldest_due_age_ms || 0) / 60000)} 分钟。
              请检查 Worker 心跳、执行队列和计划时区，不代表任务一定执行失败。
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            待领取约 {status.queue.ready_estimate} 项 · 已暂停 {status.queue.paused} 项 · 最近失败 {status.queue.failed_recent} 项
            {status.queue.sampled ? `（仅统计每类最近 ${status.queue.sample_limit_per_kind} 条记录）` : ""}
            {status.queue.needs_review > 0 ? ` · 需要人工核查的外部写操作 ${status.queue.needs_review} 项（请先检查目标系统，再决定是否新建运行）` : ""}
          </p>
        </div>
      )}
    </section>
  )
}
