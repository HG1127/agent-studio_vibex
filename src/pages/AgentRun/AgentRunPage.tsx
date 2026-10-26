import { useState } from "react"
import { AlertCircle, ArrowRight, FileCheck2, LogIn, Rocket, X } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApprovalGateCard } from "@/components/agent-run/ApprovalGateCard"
import { AgentQualityChecklist } from "@/components/agent-run/AgentQualityChecklist"
import { EvidenceLedgerPanel } from "@/components/agent-run/EvidenceLedgerPanel"
import { AgentInputCard } from "@/components/agent-run/AgentInputCard"
import { MemoryPanel } from "@/components/agent-run/MemoryPanel"
import { RunStatusSummary } from "@/components/agent-run/RunStatusSummary"
import { RunHistoryList } from "@/components/agent-run/RunHistoryList"
import { RunLauncher } from "@/components/agent-run/RunLauncher"
import { RunOptimizationRetestBanner } from "@/components/agent-run/RunOptimizationRetestBanner"
import { RunResultPanel } from "@/components/agent-run/RunResultPanel"
import { RunTimeline } from "@/components/agent-run/RunTimeline"
import { RunTopBar } from "@/components/agent-run/RunTopBar"
import { SiteShell } from "@/components/site/SiteShell"
import { SpecConfigPanel } from "@/components/agent-run/SpecConfigPanel"
import type { useAgentRun } from "./useAgentRun"

export function AgentRunPage(p: ReturnType<typeof useAgentRun>) {
  const finished=Boolean(p.activeRun && ["succeeded","failed","cancelled"].includes(p.activeRun.status))
  const [runView, setRunView] = useState({ scope: "", value: "results" })
  const viewScope = p.activeRun?.id || ""
  const selectedView = runView.scope === viewScope ? runView.value : "results"
  const openRunView = (value: string) => setRunView({ scope: viewScope, value })
  const canRun =
    p.isLoggedIn &&
    Boolean(p.selectedSpec) &&
    p.instruction.trim().length > 0 &&
    !p.isStarting &&
    !p.isLive &&
    !p.toolConnectionsLoading &&
    p.runReadiness.ready &&
    p.isCustomModel &&
    (!p.requirePlanReview || p.maxSteps >= 2)

  return (
    <SiteShell>
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <RunTopBar saveVersionSpecId={p.activeRun?.spec_id || p.selectedSpecId}
          acceptanceRunId={p.activeRun?.config?.source==="acceptance_test"?p.activeRun.id:""} />
      </header>

      <main data-studio-fluid-page="run-center" className="w-full min-w-0 px-3 pb-10 sm:px-5 lg:px-7 2xl:px-10">
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">试跑与结果</h1>
            <p className="mt-1 text-xs text-muted-foreground">给助手一项真实任务，查看交付成果；需要确认或补充时，在这里继续处理。</p>
          </div>
        </div>

        {p.specVersionNotice && <div role="status"
          className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
          {p.specVersionNotice}
        </div>}
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
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-4">
            <SpecConfigPanel
              specList={p.specList}
              isLoadingSpecs={p.isLoadingSpecs}
              selectedSpecId={p.selectedSpecId}
              onSelectSpec={p.handleSelectSpec}
              selectedSpec={p.selectedSpec}
              onEditSpec={()=>window.dispatchEvent(new CustomEvent("studio:open-agent-editor",{detail:{specId:p.selectedSpecId}}))}
              customModels={p.customModels}
              isCustomModel={p.isCustomModel}
              model={p.model}
              onModelChange={p.setModel}
              genWfBusy={p.genWfBusy}
              onGenerateWorkflow={p.handleGenerateWorkflow}
              builtinTools={p.builtinTools}
              connectedToolNames={p.connectedToolNames}
              localDevice={p.readyLocalDevice}
              marketToolCount={p.marketToolCount}
              connectedMarketTools={p.connectedMarketTools}
              runReadiness={p.runReadiness}
              toolConnectionsLoading={p.toolConnectionsLoading}
              toolConnectionsError={p.toolConnectionsError}
              onRefreshConnections={p.refreshToolConnections}
              onRefreshSkillPreflight={p.refreshSkillPreflight}
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
              requirePlanReview={p.requirePlanReview}
              onTogglePlanReview={p.handleTogglePlanReview}
              onToggleRequireApproval={p.handleToggleRequireApproval}
              isLoggedIn={p.isLoggedIn}
              isLive={p.isLive}
            />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {!p.activeRun && p.selectedSpec && <RunOptimizationRetestBanner
                candidate={p.recoverableOptimization}
                linked={p.optimizationLinked}
                error={p.recoveryError}
                onRestore={p.handleRestoreOptimization}
                onUnlink={p.handleUnlinkOptimization}
                onRetry={p.retryOptimizationRecovery}
              />}
              <RunLauncher
                localDeviceId={p.localDeviceId}
                onLocalDeviceChange={p.setLocalDeviceId}
                instruction={p.instruction}
                onInstructionChange={p.setInstruction}
                onRun={p.handleRun}
                isStarting={p.isStarting}
                canRun={canRun}
                priceHint={p.priceHint}
                hasSpec={Boolean(p.selectedSpec)}
                disabledReason={!p.selectedSpec ? "先选择并保存一个 Agent 方案" :
                  p.isLive ? p.activeRun?.status==="awaiting_input" ? "当前任务正在等待你的答复，请先完成确认" :
                    p.activeRun?.status==="awaiting_approval" ? "当前任务有待审批工具调用，请先决定" :
                    "已有任务在执行，请等待完成或终止后再试跑" :
                  !p.isCustomModel ? "请先连接并启用一个可用的模型" :
                  p.toolConnectionsLoading ? "正在核验工具连接，请稍候" :
                  !p.runReadiness.ready ? "请先补齐上方「新任务启动检查」中的必需能力与角色配置" :
                  !p.instruction.trim() ? "请输入实际任务指令" :
                  p.requirePlanReview && p.maxSteps<2 ? "人工方案确认至少需要两个执行步骤" : ""}
              />
              <RunStatusSummary
                activeRun={p.activeRun}
                isLive={p.isLive}
                controlBusy={p.controlBusy}
                onControl={p.handleControl}
                stateMeta={p.runStateMeta}
                onOpenTrace={() => openRunView("process")}
                onOpenResults={() => openRunView("results")}
              />
              {(p.activeRun?.status === "awaiting_approval" || p.activeRun?.status === "awaiting_input") && <div id="run-next-action" className="scroll-mt-28">
              {p.activeRun?.status === "awaiting_approval" && (
                <ApprovalGateCard
                  pendingApproval={p.pendingApproval}
                  activeRun={p.activeRun}
                  marketTools={p.connectedMarketTools}
                  approvalBusy={p.approvalBusy}
                  onDecision={p.handleApproval}
                />
              )}
              {p.activeRun?.status === "awaiting_input" && (
                <AgentInputCard question={p.pendingInput} answer={p.replyText} kind={p.pendingInputKind}
                  onChange={p.setReplyText} busy={p.replyBusy} onSubmit={p.handleReply} />
              )}
              </div>}
              <Tabs value={selectedView} onValueChange={openRunView} className="min-w-0">
                <TabsList aria-label="运行工作区" className="h-auto max-w-full justify-start gap-1 overflow-x-auto">
                  <TabsTrigger value="results">成果与反馈</TabsTrigger>
                  <TabsTrigger value="process">执行过程{p.runEvents.length > 0 ? ` · ${p.runEvents.length}` : ""}</TabsTrigger>
                  <TabsTrigger value="quality">验收条件</TabsTrigger>
                  <TabsTrigger value="memory">长期记忆</TabsTrigger>
                </TabsList>
                <TabsContent value="results" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
                  {!p.activeRun && <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border p-5 text-muted-foreground">
                    <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div><h2 className="text-sm font-semibold text-foreground">从一项真实任务开始</h2><p className="mt-1 text-sm leading-relaxed">运行后，交付成果、质量评估和改进建议会出现在这里。可以先在「验收条件」中定义通过标准。</p></div>
                  </div>}
                  {p.activeRun && !finished && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">任务尚未结束，最终成果会在执行完成后显示。</p>
                    <button type="button" onClick={() => openRunView("process")} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">查看执行过程<ArrowRight className="h-3.5 w-3.5" /></button>
                  </div>}
              <RunResultPanel
                activeRun={p.activeRun}
                runHistory={p.runHistory}
                events={p.runEvents}
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
                optimizationSpec={p.optimizationSpec}
                isLoggedIn={p.isLoggedIn}
                optimizeSuggestion={p.optimizeSuggestion}
                optimizeError={p.optimizeError}
                optimizeSuccess={p.optimizeSuccess}
                onOptimize={p.handleOptimizeSpec}
                optimizeBusy={p.optimizeBusy}
                applyBusy={p.applyBusy}
                onApplyOptimize={p.handleApplyOptimize}
                onDiscardOptimize={p.handleDiscardOptimize}
                onDismissOptimizeError={p.dismissOptimizeError}
                onRetestOptimized={p.handlePrepareOptimizedRetest}
              />
                </TabsContent>
                <TabsContent value="process" forceMount className="mt-4 data-[state=inactive]:hidden">
                  <div id="run-execution-trace" className="space-y-4">
                    <RunTimeline events={p.runEvents} isLive={p.isLive} hasRun={Boolean(p.activeRun)} />
                    <EvidenceLedgerPanel checkpoint={p.activeRun?.checkpoint} />
                  </div>
                </TabsContent>
                <TabsContent value="quality" forceMount className="mt-4 data-[state=inactive]:hidden">
                  <div id="run-quality-checks">
                    {p.selectedSpec ? <AgentQualityChecklist key={p.selectedSpecId}
                      selectedSpec={p.selectedSpec} activeRun={p.activeRun}
                      saving={p.qualityBusy} error={p.qualityError}
                      onSave={p.handleSaveQualityChecks} /> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">选择一个助手后，设置可核查的任务通过条件。</p>}
                  </div>
                </TabsContent>
                <TabsContent value="memory" forceMount className="mt-4 data-[state=inactive]:hidden">
                  <MemoryPanel memoryList={p.memoryList}
                    isLoadingMemories={p.isLoadingMemories}
                    memoryDeletingId={p.memoryDeletingId}
                    hasSpec={Boolean(p.selectedSpec)}
                    isLoggedIn={p.isLoggedIn}
                    onDeleteMemory={p.handleDeleteMemory}
                  />
                </TabsContent>
              </Tabs>
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
