import { AlertCircle, LogIn, Rocket, X } from "lucide-react"
import { ApprovalGateCard } from "@/components/agent-run/ApprovalGateCard"
import { AgentQualityChecklist } from "@/components/agent-run/AgentQualityChecklist"
import { EvidenceLedgerPanel } from "@/components/agent-run/EvidenceLedgerPanel"
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

      <main data-studio-fluid-page="run-center" className="w-full min-w-0 px-3 pb-10 sm:px-5 lg:px-7 2xl:px-10">
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">运行 Agent</h1>
            <p className="mt-1 text-xs text-muted-foreground">选择 Agent 和模型，填写任务；实时查看执行结果与需要审批的操作。</p>
          </div>
        </div>

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

        <section id="workbench" className="scroll-mt-20 py-5">
          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(290px,350px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
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
              maxModelCalls={p.maxModelCalls}
              onMaxModelCallsChange={p.setMaxModelCalls}
              maxRuntimeMinutes={p.maxRuntimeMinutes}
              onMaxRuntimeMinutesChange={p.setMaxRuntimeMinutes}
              stopCondition={p.stopCondition}
              onStopConditionChange={p.setStopCondition}
              stopOnComplete={p.stopOnComplete}
              onStopOnCompleteChange={p.setStopOnComplete}
              requireApproval={p.requireApproval}
              onToggleRequireApproval={p.handleToggleRequireApproval}
              isLoggedIn={p.isLoggedIn}
              isLive={p.isLive}
            />
            <details className="rounded-xl border border-border bg-card p-3">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                高级 · 优化 Agent 方案
              </summary>
              <div className="mt-3">
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
            </details>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
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
              <EvidenceLedgerPanel checkpoint={p.activeRun?.checkpoint} />
              {p.selectedSpec && (
                <AgentQualityChecklist key={p.selectedSpecId}
                  selectedSpec={p.selectedSpec}
                  activeRun={p.activeRun}
                  saving={p.qualityBusy}
                  error={p.qualityError}
                  onSave={p.handleSaveQualityChecks}
                />
              )}
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
              <details className="rounded-xl border border-border bg-card p-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                  更多 · Agent 长期记忆
                </summary>
                <div className="mt-3">
                  <MemoryPanel
                    memoryList={p.memoryList}
                    isLoadingMemories={p.isLoadingMemories}
                    memoryDeletingId={p.memoryDeletingId}
                    hasSpec={Boolean(p.selectedSpec)}
                    isLoggedIn={p.isLoggedIn}
                    onDeleteMemory={p.handleDeleteMemory}
                  />
                </div>
              </details>
            </div>
          </div>
        </section>

        <section id="run-history" className="scroll-mt-20 pb-8">
          <RunHistoryList
            runHistory={p.runHistory}
            onViewRun={p.handleViewHistoryRun}
            activeRunId={p.activeRun?.id || ""}
            isLoggedIn={p.isLoggedIn}
            stateMeta={p.runStateMeta}
          />
        </section>
      </main>



    </SiteShell>
  )
}
