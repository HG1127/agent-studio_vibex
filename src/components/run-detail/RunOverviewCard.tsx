import { Activity, Clock, FlaskConical, Gauge, Layers, ScrollText } from "lucide-react"
import {
  formatRunDetailTime,
  type RunDetailRow,
} from "@/pages/RunDetail/useRunDetail"
import type { RunStateKey } from "@/pages/AgentRun/useAgentRun"

type RunOverviewCardProps = {
  run: RunDetailRow
  modelLabel: string
  isAcceptanceTest: boolean
  isCustomModel: boolean
  harnessLine: string | null
  stateMeta: Record<RunStateKey, { label: string; badge: string }>
}

const TERMINAL_STATES: readonly string[] = ["succeeded", "failed", "cancelled"]

export function RunOverviewCard({
  run,
  modelLabel,
  isAcceptanceTest,
  isCustomModel,
  harnessLine,
  stateMeta,
}: RunOverviewCardProps) {
  const meta = run.status === "awaiting_input" ? {label:"待我回复",badge:"bg-primary/10 text-primary"} : stateMeta[run.status] || stateMeta.failed
  const totalSteps = Math.max(run.max_steps, 1)
  const doneSteps = Math.min(Math.max(run.current_step, 0), totalSteps)
  const percent = Math.round((doneSteps / totalSteps) * 100)
  const isTerminal = TERMINAL_STATES.includes(run.status)

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 shrink-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ScrollText className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">运行概览</h2>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
          {run.status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
          {meta.label}
        </span>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-background p-3.5">
        <p className="text-xs font-medium text-muted-foreground">任务指令</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
          {run.instruction || "(未记录)"}
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
          <dt className="shrink-0 text-xs text-muted-foreground">方案</dt>
          <dd className="min-w-0 flex-1 truncate text-xs font-medium text-card-foreground">
            {run.spec_name || "(方案已删除)"}
          </dd>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <Gauge className="h-3.5 w-3.5 shrink-0 text-primary" />
          <dt className="shrink-0 text-xs text-muted-foreground">模型</dt>
          <dd className="min-w-0 flex-1 truncate text-xs font-medium text-card-foreground">
            {modelLabel}
            {isCustomModel && (
              <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                自有密钥
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
          <dt className="shrink-0 text-xs text-muted-foreground">开始</dt>
          <dd className="min-w-0 flex-1 truncate text-xs font-medium text-card-foreground">
            {formatRunDetailTime(run.created)}
          </dd>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
          <dt className="shrink-0 text-xs text-muted-foreground">{run.native ? (run.native.finishedAt?"结束":"更新") : isTerminal ? "结束" : "更新"}</dt>
          <dd className="min-w-0 flex-1 truncate text-xs font-medium text-card-foreground">
            {run.native ? formatRunDetailTime(run.native.finishedAt??run.updated) : isTerminal ? formatRunDetailTime(run.updated) : formatRunDetailTime(run.updated) || "—"}
          </dd>
        </div>
      </dl>

      {harnessLine && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2.5">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-card-foreground">本次消耗</span> · {harnessLine}
          </p>
        </div>
      )}

      {isAcceptanceTest && (
        <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <FlaskConical className="h-3.5 w-3.5" />
          来自版本验收测试
        </p>
      )}

      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{run.native?"已记录步骤":"执行进度"}</span>
          <span>
            {run.native ? "已登记 "+run.current_step+" 个执行步骤（非模型轮次）" : <>第 {doneSteps} / {totalSteps} 步</>}
          </span>
        </div>
        {run.native ? <p className="mt-1.5 text-xs text-muted-foreground">后台未提供总进度估算。</p> : (
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{width:String(percent)+"%"}} />
          </div>
        )}
      </div>
    </div>
  )
}
