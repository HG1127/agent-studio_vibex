import { Activity, Check, Copy, PartyPopper, TriangleAlert } from "lucide-react"
import { RunEvaluationCard } from "@/components/agent-run/RunEvaluationCard"
import { RunFeedbackBar, type FeedbackDraft } from "@/components/agent-run/RunFeedbackBar"
import type { AgentRunRow, RunFeedback, RunEvaluation } from "@/pages/AgentRun/useAgentRun"

type RunResultPanelProps = {
  activeRun: AgentRunRow | null
  onCopy: () => void
  copiedFlag: boolean
  harnessLine: string | null
  evaluation: RunEvaluation | null
  evalBusy: boolean
  onGenerateEvaluation: () => void
  feedback: RunFeedback | null
  feedbackDraft: FeedbackDraft
  feedbackEditing: boolean
  feedbackBusy: boolean
  feedbackTagOptions: string[]
  onSelectFeedbackRating: (rating: "up" | "down") => void
  onToggleFeedbackTag: (tag: string) => void
  onFeedbackCommentChange: (comment: string) => void
  onSubmitFeedback: () => void
  onEditFeedback: () => void
  onCancelFeedbackEdit: () => void
}

export function RunResultPanel({
  activeRun,
  onCopy,
  copiedFlag,
  harnessLine,
  evaluation,
  evalBusy,
  onGenerateEvaluation,
  feedback,
  feedbackDraft,
  feedbackEditing,
  feedbackBusy,
  feedbackTagOptions,
  onSelectFeedbackRating,
  onToggleFeedbackTag,
  onFeedbackCommentChange,
  onSubmitFeedback,
  onEditFeedback,
  onCancelFeedbackEdit,
}: RunResultPanelProps) {
  if (!activeRun) return null
  const runState = activeRun.status
  if (runState !== "succeeded" && runState !== "failed" && runState !== "cancelled") {
    return null
  }
  const isSuccess = runState === "succeeded"
  const reasonText = activeRun.error || ""

  return (
    <>
    <div
      className={`animate-in fade-in slide-in-from-bottom-4 rounded-2xl border p-5 shadow-md duration-500 ${
        isSuccess ? "border-primary/40 bg-card" : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-card-foreground">
          {isSuccess ? (
            <>
              <PartyPopper className="h-5 w-5 text-primary" />
              运行成果
            </>
          ) : (
            <>
              <TriangleAlert className="h-5 w-5 text-destructive" />
              运行未正常完成
            </>
          )}
        </h2>
        {activeRun.result && (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
          >
            {copiedFlag ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            {copiedFlag ? "已复制" : "复制成果"}
          </button>
        )}
      </div>
      {!isSuccess && reasonText && (
        <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          终止原因：{reasonText}
        </p>
      )}
      {activeRun.result && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-secondary/50 px-4 py-3 text-sm leading-relaxed text-card-foreground">
          {activeRun.result}
        </p>
      )}
      {!activeRun.result && (
        <p className="mt-3 text-sm text-muted-foreground">本次运行没有产出可展示的成果文本。</p>
      )}
      {harnessLine && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          本次运行核算：{harnessLine}
        </p>
      )}
    </div>

      <RunEvaluationCard
        evaluation={evaluation}
        evalBusy={evalBusy}
        onGenerate={onGenerateEvaluation}
      />

      <RunFeedbackBar
        feedback={feedback}
        draft={feedbackDraft}
        editing={feedbackEditing}
        busy={feedbackBusy}
        tagOptions={feedbackTagOptions}
        onSelectRating={onSelectFeedbackRating}
        onToggleTag={onToggleFeedbackTag}
        onCommentChange={onFeedbackCommentChange}
        onSubmit={onSubmitFeedback}
        onEdit={onEditFeedback}
        onCancelEdit={onCancelFeedbackEdit}
      />
    </>
  )
}
