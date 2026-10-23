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
        ? "近期有心跳"
        : "未收到近期心跳"
  const detail = !status?.enabled
    ? "当前使用浏览器驱动任务；部署独立 Worker 后才能在关闭页面时继续执行。"
    : status.alive
      ? "过去 180 秒内收到过 Worker 心跳。这仅证明近期活动，不代表此刻进程在线；后台任务仍依赖服务端进程持续运行。"
      : "没有近期 Worker 心跳，不能确认后台任务正在执行。请检查进程管理服务、Worker 日志和任务队列。"

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
      {status?.enabled && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2" aria-label="Worker 子系统最近状态">
          {([
            { label: "定时任务派发", item: status.components?.schedules },
            { label: "知识库语义索引", item: status.components?.knowledge },
          ] as const).map(({ label, item }) => {
            const stale = !status.alive || !status.components_observed_at_ms
            const state = stale || !item || item.state === "unverified"
              ? "未核验" : item.state === "retrying" ? "暂时不可用" : "最近检查正常"
            return (
              <div key={label} className="rounded-lg border border-border p-3">
                <div className="font-medium text-card-foreground">{label}</div>
                <p className="mt-1 text-muted-foreground">{state}</p>
                {!stale && item?.state === "retrying" && (
                  <p className="mt-1 text-muted-foreground">
                    连续失败 {item.failures} 次
                    {item.retry_at_ms > (status.observed_at_ms || 0)
                      ? " · 约 " + Math.ceil((item.retry_at_ms - (status.observed_at_ms || 0)) / 1000) + " 秒后重试"
                      : " · 等待下一次重试"}
                  </p>
                )}
              </div>
            )
          })}
          <p className="col-span-full text-muted-foreground">
            仅展示最近一台 Worker 汇报的状态；不提供第三方错误详情或连接密钥，也不代表所有 Worker 均健康。
          </p>
        </div>
      )}
      {status?.enabled && status.instances && (
        <details className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-card-foreground">
            Worker 实例 · 最近上报 {status.instances_recent ?? 0} 个
            {status.instances_sampled ? "（仅展示最近 12 个）" : ""}
          </summary>
          <div className="mt-2 space-y-1 text-muted-foreground">
            {status.instances.length === 0 && <p>暂无已登记实例</p>}
            {status.instances.map((item, index) => (
              <div key={item.label + "-" + index} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-secondary/40 px-2 py-1">
                <span className="font-medium text-card-foreground">{item.label}</span>
                <span>{item.recent ? "近期有心跳" : "心跳已过期"}</span>
                <span>{item.last_seen_age_ms === null
                  ? "无有效时间" : "约 " + Math.floor(item.last_seen_age_ms / 1000) + " 秒前上报"}</span>
                <span>执行尝试 {item.attempts}</span>
              </div>
            ))}
            <p>实例名为随机标识，不包含主机或员工信息。心跳只代表近期上报，执行权由独立租约决定。</p>
          </div>
        </details>
      )}
      {status?.enabled && status.active_claims && (
        <details className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-card-foreground">
            当前有效租约 · {status.active_claims.length} 项
            {status.active_claims_sampled ? "（仅展示最早到期的 20 项）" : ""}
          </summary>
          <div className="mt-2 space-y-1 text-muted-foreground">
            {status.active_claims.length === 0 && <p>当前没有已领取且未过期的任务租约</p>}
            {status.active_claims.map((claim, i) => (
              <div key={claim.kind + claim.run_id + i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-secondary/40 px-2 py-1">
                <span>{claim.kind === "agent" ? "Agent" : "Workflow"}</span>
                <span className="font-mono">…{claim.run_id.slice(-6)}</span>
                <span>{claim.holder}</span>
                <span>租约约 {Math.ceil(claim.expires_in_ms / 1000)} 秒后到期</span>
                {claim.kind === "agent" && <Link className="text-primary underline"
                  to={"/run-detail?run=" + encodeURIComponent(claim.run_id)}>运行详情</Link>}
              </div>
            ))}
            <p>归属来自服务端原子租约领取记录，不显示租约 Token。
              到期时间不证明持有者在线；普通 Worker 心跳不能续租。</p>
          </div>
        </details>
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
          {(status.queue.expired_lease_candidates || 0) > 0 && (
            <p role="status" className="mt-3 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              {status.queue.expired_lease_candidates} 个运行中任务的租约已过期，属于待接管诊断候选。
              新 Worker 必须按数据库租约重新领取；外部写入结果未确认的任务禁止自动重放。
            </p>
          )}
          {(status.queue.unresolved_writes || 0) > 0 && (
            <p role="status" className="mt-3 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              {status.queue.unresolved_writes} 条外部写操作的结果尚未确认（包含未超时写入意图）。
              在目标服务核实前，不要重复调用。
            </p>
          )}
          {status.enabled && !status.alive && status.queue.ready_estimate > 0 && (
            <p role="status" className="mt-3 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              约有 {status.queue.ready_estimate} 项任务等待领取，但没有近期 Worker 心跳。
              请检查服务是否重启或执行进程是否异常退出。<Link to="/harness" className="ml-1 text-primary underline">检查运行记录</Link>
            </p>
          )}
          {status.queue.needs_review > 0 && (
            <p role="status" className="mt-3 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              有 {status.queue.needs_review} 项外部写操作结果不确定，需要人工核对目标系统；禁止直接重复执行相同操作。
              <Link to="/harness" className="ml-1 text-primary underline">查看运行监控</Link>
            </p>
          )}
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
