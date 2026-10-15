import { AlertCircle, LogIn, Rocket, X } from "lucide-react"
import { ApprovalGateCard } from "@/components/agent-run/ApprovalGateCard"
import { MemoryPanel } from "@/components/agent-run/MemoryPanel"
import { RunControlBar } from "@/components/agent-run/RunControlBar"
import { RunHistoryList } from "@/components/agent-run/RunHistoryList"
import { RunLauncher } from "@/components/agent-run/RunLauncher"
import { RunResultPanel } from "@/components/agent-run/RunResultPanel"
import { RunTimeline } from "@/components/agent-run/RunTimeline"
import { RunTopBar } from "@/components/agent-run/RunTopBar"
import { SiteShell } from "@/components/site/SiteShell"
import { SpecConfigPanel } from "@/components/agent-run/SpecConfigPanel"
import { SpecOptimizeCard } from "@/components/agent-run/SpecOptimizeCard"
import type { useAgentRun } from "./useAgentRun"

export function AgentRunPage(p: ReturnType<typeof useAgentRun>) {
  const canRun =
    p.isLoggedIn &&
    Boolean(p.selectedSpec) &&
    p.instruction.trim().length > 0 &&
    !p.isStarting &&
    !p.isLive

  return (
    <SiteShell>
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <RunTopBar saveVersionSpecId={p.selectedSpecId} />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4">
        <section className="mt-4 rounded-2xl bg-gradient-to-br from-background via-secondary to-card px-5 py-3.5 shadow-md">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              给助手下达任务，<span className="text-primary">看它一步一步真实跑完</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              左侧配好模型、工具授权、预算上限与停止条件，右侧输入任务指令发起运行；时间线实时滚动，可暂停、恢复或取消。
            </p>
          </div>
        </section>

        {p.needsRhLogin && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <Rocket className="h-4 w-4 text-primary" />
              试跑助手需要先登录你的账号，运行记录与用量都归属你的账号。
            </span>
            <button
              type="button"
              onClick={p.onLoginClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogIn className="h-4 w-4" />
              立即登录
            </button>
          </div>
        )}

        {p.errorMsg && (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-destructive/10 p-4">
            <span className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {p.errorMsg}
            </span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={p.dismissError}
              className="shrink-0 rounded-md p-1 text-destructive transition hover:bg-destructive/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section id="workbench" className="scroll-mt-20 py-10">
          <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
            <div className="flex flex-col gap-6">
            <SpecConfigPanel
              specList={p.specList}
              isLoadingSpecs={p.isLoadingSpecs}
              selectedSpecId={p.selectedSpecId}
              onSelectSpec={p.handleSelectSpec}
              selectedSpec={p.selectedSpec}
              customModels={p.customModels}
              isCustomModel={p.isCustomModel}
              model={p.model}
              onModelChange={p.setModel}
              genWfBusy={p.genWfBusy}
              onGenerateWorkflow={p.handleGenerateWorkflow}
              builtinTools={p.builtinTools}
              enabledTools={p.enabledTools}
              onToggleTool={p.handleToggleTool}
              maxSteps={p.maxSteps}
              onMaxStepsChange={p.setMaxSteps}
              stopCondition={p.stopCondition}
              onStopConditionChange={p.setStopCondition}
              stopOnComplete={p.stopOnComplete}
              onStopOnCompleteChange={p.setStopOnComplete}
              requireApproval={p.requireApproval}
              onToggleRequireApproval={p.handleToggleRequireApproval}
              isLoggedIn={p.isLoggedIn}
              isLive={p.isLive}
            />
            <SpecOptimizeCard
              selectedSpec={p.selectedSpec}
              isLoggedIn={p.isLoggedIn}
              optimizeBusy={p.optimizeBusy}
              suggestion={p.optimizeSuggestion}
              optimizeError={p.optimizeError}
              applyBusy={p.applyBusy}
              onOptimize={p.handleOptimizeSpec}
              onApply={p.handleApplyOptimize}
              onDiscard={p.handleDiscardOptimize}
              onDismissError={p.dismissOptimizeError}
            />
            </div>
            <div className="flex flex-col gap-5">
              <RunLauncher
                instruction={p.instruction}
                onInstructionChange={p.setInstruction}
                onRun={p.handleRun}
                isStarting={p.isStarting}
                canRun={canRun}
                priceHint={p.priceHint}
                hasSpec={Boolean(p.selectedSpec)}
              />
              <RunControlBar
                activeRun={p.activeRun}
                isLive={p.isLive}
                controlBusy={p.controlBusy}
                onControl={p.handleControl}
                stateMeta={p.runStateMeta}
              />
              {p.activeRun?.status === "awaiting_approval" && (
                <ApprovalGateCard
                  pendingApproval={p.pendingApproval}
                  approvalBusy={p.approvalBusy}
                  onDecision={p.handleApproval}
                />
              )}
              <RunTimeline events={p.runEvents} isLive={p.isLive} hasRun={Boolean(p.activeRun)} />
              <RunResultPanel
                activeRun={p.activeRun}
                onCopy={p.handleCopyResult}
                copiedFlag={p.copiedFlag}
                harnessLine={p.harnessLine}
                evaluation={p.activeRun?.evaluation || null}
                evalBusy={p.evalBusy}
                onGenerateEvaluation={p.handleEvaluate}
                feedback={p.activeRun?.feedback || null}
                feedbackDraft={p.feedbackDraft}
                feedbackEditing={p.feedbackEditing}
                feedbackBusy={p.feedbackBusy}
                feedbackTagOptions={p.feedbackTagOptions}
                onSelectFeedbackRating={p.handleSelectFeedbackRating}
                onToggleFeedbackTag={p.handleToggleFeedbackTag}
                onFeedbackCommentChange={p.handleFeedbackCommentChange}
                onSubmitFeedback={p.handleSubmitFeedback}
                onEditFeedback={p.handleEditFeedback}
                onCancelFeedbackEdit={p.handleCancelFeedbackEdit}
              />
              <MemoryPanel
                memoryList={p.memoryList}
                isLoadingMemories={p.isLoadingMemories}
                memoryDeletingId={p.memoryDeletingId}
                hasSpec={Boolean(p.selectedSpec)}
                isLoggedIn={p.isLoggedIn}
                onDeleteMemory={p.handleDeleteMemory}
              />
            </div>
          </div>
        </section>

        <section id="run-history" className="scroll-mt-20 pb-16">
          <RunHistoryList
            runHistory={p.runHistory}
            onViewRun={p.handleViewHistoryRun}
            activeRunId={p.activeRun?.id || ""}
            isLoggedIn={p.isLoggedIn}
            stateMeta={p.runStateMeta}
          />
        </section>
      </main>

      <footer className="mt-4 border-t border-border py-10 text-center">
        <p className="text-sm font-medium text-card-foreground">Agent Studio</p>
        <p className="mt-1 text-xs text-muted-foreground">从一句需求，到一个可运行、可回看的助手。</p>
      </footer>

    </SiteShell>
  )
}
