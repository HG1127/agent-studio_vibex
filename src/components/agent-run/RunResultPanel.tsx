import { Activity, Check, Copy, PartyPopper, TriangleAlert, RefreshCw, Loader2 } from "lucide-react"
import { RunEvaluationCard } from "@/components/agent-run/RunEvaluationCard"
import { SpecOptimizeCard } from "@/components/agent-run/SpecOptimizeCard"
import { ResultDocument } from "@/components/agent-run/ResultDocument"
import {BusinessQualityStatus} from './BusinessQualityStatus'
import { RunVersionComparisonCard } from "@/components/agent-run/RunVersionComparisonCard"
import { RunFeedbackBar, type FeedbackDraft } from "@/components/agent-run/RunFeedbackBar"
import type { AgentRunRow, RunAttemptRow, RunEventRow, RunFeedback, RunEvaluation, SpecOptimizeSuggestion, SavedSpecRow } from "@/pages/AgentRun/useAgentRun"

type RunResultPanelProps = {
  activeRun: AgentRunRow | null
  runHistory: AgentRunRow[]
  attempts: RunAttemptRow[]
  events: RunEventRow[]
  onRetry: () => void
  retryBusy: boolean
  canRetry: boolean
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
  optimizationSpec: SavedSpecRow | null
  isLoggedIn: boolean
  optimizeSuggestion: SpecOptimizeSuggestion | null
  optimizeError: string
  optimizeSuccess: string
  onOptimize: () => void
  optimizeBusy: boolean
  applyBusy: boolean
  onApplyOptimize: () => void
  onDiscardOptimize: () => void
  onDismissOptimizeError: () => void
  onRetestOptimized: () => void
}

export function RunResultPanel({
  activeRun,
  onCopy,  runHistory,
  attempts,
  events,
  onRetry,
  retryBusy,
  canRetry,

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
  optimizationSpec,
  isLoggedIn,
  optimizeSuggestion,
  optimizeError,
  optimizeSuccess,
  onOptimize,
  optimizeBusy,
  applyBusy,
  onApplyOptimize,
  onDiscardOptimize,
  onDismissOptimizeError,
  onRetestOptimized,
}: RunResultPanelProps) {
  if (!activeRun) return null
  if(activeRun.source_access_revoked)return <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">来源权限当前不可用，已隐藏这次运行的成果、记忆及配置内容。历史执行状态保留；请恢复授权后重新读取与验收。</section>
  const runState = activeRun.status
  if (runState !== "succeeded" && runState !== "failed" && runState !== "cancelled") {
    return null
  }
  const isSuccess = runState === "succeeded"
  const reasonText = activeRun.error || ""

  return (
    <>
    {typeof activeRun.config?.case_id === 'string' && <BusinessQualityStatus key={activeRun.id} caseId={activeRun.config.case_id} executionState={runState} />}
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
        <div className="flex flex-wrap items-center gap-2">
          {activeRun.status==="failed"&&!activeRun.agent_deleted&&<button type="button"
            onClick={()=>onRetry()} disabled={retryBusy||!canRetry}
            title={!canRetry?"请先在上方快速选择一个可用模型":"沿用当前任务编号重新运行"}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
            {retryBusy?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}
            {retryBusy?"正在启动…":"重新运行"}
          </button>}
          {activeRun.result && (
            <button type="button" onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
              {copiedFlag ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              {copiedFlag ? "已复制" : "复制成果"}
            </button>
          )}
        </div>
      </div>
      {!isSuccess && reasonText && (
        <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          终止原因：{reasonText}
        </p>
      )}
      {activeRun.agent_deleted&&<p className="mt-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        所属 Agent 已删除：此任务及全部尝试记录已归档为只读历史，不能继续执行或重新运行。
      </p>}
      {activeRun.result && (
        <ResultDocument text={activeRun.result} className="mt-3 rounded-xl bg-secondary/50 px-4 py-3" />
      )}
      {typeof activeRun.checkpoint?.closing_draft==='string'&&<details className="mt-3 rounded border p-3"><summary className="cursor-pointer text-sm">预留额度生成的收尾草稿（未验收）</summary><p className="mt-2 text-xs text-muted-foreground">此文本尚未通过业务核验，正式事实和已生成报告仍按原版本保留。</p><ResultDocument text={activeRun.checkpoint.closing_draft} className="mt-2"/></details>}
      {!activeRun.result && (
        <p className="mt-3 text-sm text-muted-foreground">本次运行没有产出可展示的成果文本。</p>
      )}
      {harnessLine && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          本次运行核算：{harnessLine}
        </p>
      )}
      {attempts.length>0&&<details className="mt-3 rounded-xl border border-border bg-background p-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          历史尝试 · {attempts.length} 次（保留原失败原因与执行事件）
        </summary>
        <div className="mt-3 space-y-3">
          {attempts.map(attempt=><article key={attempt.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">第 {attempt.attempt_no} 次尝试 · {attempt.status==="failed"?"失败":attempt.status}</span>
              <span className="text-[11px] text-muted-foreground">{attempt.archived_ms?new Date(attempt.archived_ms).toLocaleString("zh-CN"):"时间未知"}</span>
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">模型：{attempt.model||"未知"} · 已记录 {attempt.events.length} 条执行事件</p>
            {attempt.error&&<p className="mt-2 rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">终止原因：{attempt.error}</p>}
            {attempt.result&&<details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">查看该次成果</summary><ResultDocument text={attempt.result} className="mt-2 rounded-lg bg-secondary/50 p-3"/></details>}
            {attempt.events.length>0&&<details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">查看该次执行事件</summary>
              <ol className="mt-2 space-y-1 border-l border-border pl-3">
                {attempt.events.slice(-20).map(event=><li key={event.id} className="break-words text-muted-foreground">
                  <span className="font-medium text-foreground">{event.event_type}</span>
                  {" · "}{String(event.content?.message||event.content?.detail||event.event_type)}
                </li>)}
              </ol>
            </details>}
          </article>)}
        </div>
      </details>}
    </div>

      <RunEvaluationCard
        evaluation={evaluation}
        evalBusy={evalBusy}
        onGenerate={onGenerateEvaluation}
        readOnly={Boolean(activeRun.agent_deleted)}
      />

      <RunFeedbackBar
        readOnly={Boolean(activeRun.agent_deleted)}
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
      {!activeRun.agent_deleted && <SpecOptimizeCard
        selectedSpec={optimizationSpec}
        isLoggedIn={isLoggedIn}
        optimizeBusy={optimizeBusy}
        suggestion={optimizeSuggestion}
        optimizeError={optimizeError}
        optimizeSuccess={optimizeSuccess}
        applyBusy={applyBusy}
        onOptimize={onOptimize}
        onApply={onApplyOptimize}
        onDiscard={onDiscardOptimize}
        onDismissError={onDismissOptimizeError}
        onRetestOptimized={onRetestOptimized}
      />}
      <RunVersionComparisonCard run={activeRun} history={runHistory} events={events}/>
    </>
  )
}
