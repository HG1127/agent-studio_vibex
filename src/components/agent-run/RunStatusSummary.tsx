import { ArrowRight, Check, CirclePause, CirclePlay, CircleStop, Gauge, UsersRound } from "lucide-react"
import type { AgentRunRow, RunEventRow, RunStateKey } from "@/pages/AgentRun/useAgentRun"
import {latestRunActivity} from "@/lib/runActivitySummary"
import { projectAgentRoleProgress } from "@/lib/agentRoleProgress"

type Props = {
  activeRun: AgentRunRow | null
  events: RunEventRow[]
  isLive: boolean
  controlBusy: "" | "pause" | "resume" | "cancel"
  onControl: (action: "pause" | "resume" | "cancel") => void
  stateMeta: Record<RunStateKey, { label: string; badge: string }>
  onOpenTrace: () => void
  onOpenResults: () => void
}

const NEXT_ACTION: Record<RunStateKey, string> = {
  queued: "任务已进入队列，执行开始后会在这里更新状态。",
  running: "助手正在执行任务，你可以查看调用过程；需要你确认时会显示具体操作。",
  paused: "任务已暂停。恢复后从已保存的步骤继续。",
  awaiting_approval: "请先处理下方工具调用审批，决定是否允许这次操作。",
  awaiting_input: "请回答下方问题或确认阶段方案，助手会据此继续。",
  succeeded: "执行已结束。请检查交付内容，再按验收条件判断是否达到要求。",
  failed: "本次运行未完成。先查看停止原因和执行过程，再调整方案或重新试跑。",
  cancelled: "任务已取消，已有记录仍可查看。需要重试时重新提交任务。",
}

export function RunStatusSummary({ activeRun, events, isLive, controlBusy, onControl, stateMeta, onOpenTrace, onOpenResults }: Props) {
  if (!activeRun) return null
  const meta = stateMeta[activeRun.status]
  const pauseRequested = activeRun.checkpoint?.pause_requested === true
  const cancelRequested = activeRun.checkpoint?.cancel_requested === true
  const pauseApplying = activeRun.status === "running" && pauseRequested && !cancelRequested
  const canPause = activeRun.status === "running" && !pauseRequested && !cancelRequested
  const canResume = activeRun.status === "paused" || activeRun.status === "queued"
  const waitingForUser = activeRun.status === "awaiting_approval" || activeRun.status === "awaiting_input"
  const budgetStopped = activeRun.status === "failed" && /budget.*exhaust|预算.*(?:耗尽|用尽|不足)|最大步数上限/i.test(activeRun.error || "")
  const usedSteps = Math.max(activeRun.current_step, 0)
  const stepLimit = Math.max(activeRun.max_steps, 1)
  const roleProgress = activeRun.checkpoint?.execution_plan ? null : projectAgentRoleProgress(activeRun)
  const recentActivity=latestRunActivity(events)
  const stopped = activeRun.status === "failed" || activeRun.status === "cancelled"
  const actionClass = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"

  return <section aria-label="当前运行状态与下一步" className={`rounded-2xl border bg-card p-4 sm:p-5 ${waitingForUser ? "border-primary/40" : "border-border"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
            {activeRun.status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
            {cancelRequested ? "取消请求中" : pauseApplying ? "暂停请求中" : budgetStopped ? "预算用尽 · 未完成" : meta.label}
          </span>
          <span className="truncate text-xs text-muted-foreground">{activeRun.spec_name}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{cancelRequested ? "已收到取消请求。当前步骤会先安全收尾并保存检查点，随后取消；不会启动后续步骤。" : pauseApplying ? "已收到暂停请求。当前步骤会先完成并保存检查点，随后暂停；无需重复点击。" : NEXT_ACTION[activeRun.status]}</p>
        {recentActivity && <p aria-label="最近保存的运行事件" className="mt-2 text-xs leading-relaxed text-muted-foreground">
          最近记录：{recentActivity.stepLabel} · {recentActivity.label}
          {recentActivity.roleName ? " · " + recentActivity.roleName : ""}
          <span className="ml-1 text-muted-foreground/75">（来自已保存的事件，不代表执行已完成）</span>
        </p>}
        {waitingForUser && pauseRequested && !cancelRequested && <p role="status" className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-foreground">已记录暂停请求；当前任务正在等待输入或审批。完成当前交互后将先暂停，不会直接执行下一步。</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {activeRun.status === "running" && <button type="button" disabled={!canPause || controlBusy !== ""} onClick={() => onControl("pause")} className={`${actionClass} border-border hover:bg-secondary`}><CirclePause className="h-4 w-4" />{pauseApplying ? "等待步骤收尾…" : controlBusy === "pause" ? "暂停中…" : "暂停"}</button>}
        {canResume && <button type="button" disabled={controlBusy !== ""} onClick={() => onControl("resume")} className={`${actionClass} border-primary/30 text-primary hover:bg-primary/5`}><CirclePlay className="h-4 w-4" />{controlBusy === "resume" ? "恢复中…" : "恢复运行"}</button>}
        {isLive && <button type="button" disabled={controlBusy !== "" || cancelRequested} onClick={() => onControl("cancel")} className={`${actionClass} border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive`}><CircleStop className="h-4 w-4" />{cancelRequested ? "等待步骤收尾…" : controlBusy === "cancel" ? "取消中…" : "取消任务"}</button>}
      </div>
    </div>
    {roleProgress && <div aria-label="角色阶段进度" className="mt-3 rounded-xl border border-border bg-secondary/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold"><UsersRound className="h-3.5 w-3.5 text-primary" />
          {roleProgress.current ? `${stopped ? "停止于" : "当前阶段"}：${roleProgress.current.name}` :
            roleProgress.allSubmitted ? "全部角色阶段已提交成果" : "本次角色安排"}
          {roleProgress.current && !roleProgress.current.started && !stopped && <span className="font-normal text-muted-foreground">· 等待调度</span>}
        </span>
        {roleProgress.next && <span className="text-muted-foreground">下一阶段：{roleProgress.next.name}</span>}
      </div>
      <ol className="mt-2 flex flex-wrap gap-2" aria-label="本次运行的角色顺序">
        {roleProgress.stages.map((stage, index) => <li key={stage.id}
          aria-current={stage.state === "current" ? "step" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${stage.state === "current" ? "border-primary/30 bg-primary/5 font-semibold text-primary" : "border-border bg-background text-muted-foreground"}`}>
          {stage.state === "submitted" ? <Check aria-label="已提交成果" className="h-3 w-3" /> : <span>{index + 1}</span>}
          {stage.name}<span className="font-normal">· {stage.state === "submitted" ? "已提交" : stage.state === "current" ? stopped ? "已停止" : roleProgress.current?.started ? "当前阶段" : "待接手" : "尚未开始"}</span>
        </li>)}
      </ol>
      {roleProgress.warning && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{roleProgress.warning}</p>}
      {roleProgress.submittedCount > 0 && <details className="mt-3 border-t border-border pt-3">
        <summary className="cursor-pointer text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">查看已提交阶段成果（{roleProgress.submittedCount}）<span className="ml-2 font-normal text-muted-foreground">已交付内容仍需验收</span></summary>
        <div className="mt-3 space-y-3">{roleProgress.stages.filter(stage => stage.state === "submitted").map(stage => <section key={stage.id} aria-label={`${stage.name}阶段交付`} className="rounded-lg border border-border bg-background p-3">
          <h3 className="text-xs font-semibold">{stage.name} · 已保存的交付</h3>
          <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{stage.output}</div>
        </section>)}</div>
      </details>}
    </div>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />已用 {usedSteps} / {stepLimit} 步<span className="text-muted-foreground/80">· 资源使用，不代表完成比例</span></span>
      {waitingForUser ? <a href="#run-next-action" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">处理待办<ArrowRight className="h-3.5 w-3.5" /></a> : <button type="button" onClick={activeRun.status === "succeeded" ? onOpenResults : onOpenTrace} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{activeRun.status === "succeeded" ? "查看运行成果" : "查看执行过程"}<ArrowRight className="h-3.5 w-3.5" /></button>}
    </div>
  </section>
}
