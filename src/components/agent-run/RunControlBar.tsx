import { CirclePause, CirclePlay, CircleStop, Gauge } from "lucide-react"
import type { AgentRunRow, RunStateKey } from "@/pages/AgentRun/useAgentRun"

type RunControlBarProps = {
  activeRun: AgentRunRow | null
  isLive: boolean
  controlBusy: "" | "pause" | "resume" | "cancel"
  onControl: (action: "pause" | "resume" | "cancel") => void
  stateMeta: Record<RunStateKey, { label: string; badge: string }>
}

export function RunControlBar({ activeRun, isLive, controlBusy, onControl, stateMeta }: RunControlBarProps) {
  if (!activeRun) return null
  const meta = stateMeta[activeRun.status]
  const totalSteps = Math.max(activeRun.max_steps, 1)
  const doneSteps = Math.min(Math.max(activeRun.current_step, 0), totalSteps)
  const percent = Math.round((doneSteps / totalSteps) * 100)
  const canPause = activeRun.status === "running"
  const canResume = activeRun.status === "paused" || activeRun.status === "queued"
  const canCancel = isLive

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}>
          {isLive && activeRun.status === "running" && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          )}
          {meta.label}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Gauge className="h-4 w-4 text-primary" />
          第 {doneSteps} / {totalSteps} 步 · 预算消耗 {percent}%
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onControl("pause")}
            disabled={!canPause || controlBusy !== ""}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-card-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CirclePause className="h-4 w-4" />
            {controlBusy === "pause" ? "暂停中…" : "暂停"}
          </button>
          <button
            type="button"
            onClick={() => onControl("resume")}
            disabled={!canResume || controlBusy !== ""}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-background px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CirclePlay className="h-4 w-4" />
            {controlBusy === "resume" ? "恢复中…" : "恢复"}
          </button>
          <button
            type="button"
            onClick={() => onControl("cancel")}
            disabled={!canCancel || controlBusy !== ""}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CircleStop className="h-4 w-4" />
            {controlBusy === "cancel" ? "取消中…" : "取消"}
          </button>
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
