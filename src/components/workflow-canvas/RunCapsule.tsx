import { Eye, Play, TimerReset, XCircle } from "lucide-react"
import type { RunDetailRow, WfRunState } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

type RunCapsuleProps = {
  activeRun: RunDetailRow | null
  isLiveRunning: boolean
  viewingHistoryRun: boolean
  elapsedText: string
  openRunDialog: () => void
  handleCancelRun: () => void
  cancelBusy: boolean
  exitRunView: () => void
  runStateMeta: Record<WfRunState, { label: string; badge: string }>
}

export function RunCapsule({
  activeRun,
  isLiveRunning,
  viewingHistoryRun,
  elapsedText,
  openRunDialog,
  handleCancelRun,
  cancelBusy,
  exitRunView,
  runStateMeta,
}: RunCapsuleProps) {
  const stateMeta = activeRun ? runStateMeta[activeRun.status] : null
  let dotClass = "bg-border"
  if (activeRun?.status === "running") dotClass = "animate-pulse bg-primary"
  else if (activeRun?.status === "awaiting_approval") dotClass = "animate-pulse bg-primary"
  else if (activeRun?.status === "succeeded") dotClass = "bg-primary"
  else if (activeRun?.status === "failed") dotClass = "bg-destructive"
  else if (activeRun?.status === "cancelled") dotClass = "bg-muted-foreground"

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
      <span
        aria-hidden
        title={stateMeta ? stateMeta.label : "暂无运行"}
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
      />
      <button
        type="button"
        onClick={openRunDialog}
        disabled={isLiveRunning}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play className="h-3.5 w-3.5" />
        运行
      </button>
      {activeRun?.status === "running" && (
        <button
          type="button"
          onClick={handleCancelRun}
          disabled={cancelBusy}
          className="inline-flex items-center gap-1 rounded-full border border-destructive px-3 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <XCircle className="h-3.5 w-3.5" />
          {cancelBusy ? "取消中…" : "取消"}
        </button>
      )}
      {activeRun && stateMeta && (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stateMeta.badge}`}>
          {stateMeta.label}
        </span>
      )}
      {activeRun && (
        <span className="text-xs text-muted-foreground">
          节点 {activeRun.done_nodes}/{activeRun.total_nodes} · 已用 {elapsedText}
        </span>
      )}
      {viewingHistoryRun && !isLiveRunning && (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
            <Eye className="h-3 w-3 text-primary" />
            回看历史
          </span>
          <button
            type="button"
            onClick={exitRunView}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            <TimerReset className="h-3 w-3" />
            返回编辑
          </button>
        </>
      )}
      {!activeRun && (
        <span className="text-xs text-muted-foreground">保存后点「运行」，填写本次任务指令即可真实执行</span>
      )}
    </div>
  )
}
