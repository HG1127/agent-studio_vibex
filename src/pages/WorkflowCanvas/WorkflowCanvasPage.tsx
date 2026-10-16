import { Bot, LogIn, Maximize2, Play, Save, TriangleAlert, X } from "lucide-react"
import { Link } from "react-router-dom"
import { FlowCanvas } from "@/components/workflow-canvas/FlowCanvas"
import { FocusOverlay } from "@/components/workflow-canvas/FocusOverlay"
import { RunCapsule } from "@/components/workflow-canvas/RunCapsule"
import {
  DeleteConfirmDialog,
  RunInstructionDialog,
} from "@/components/workflow-canvas/RunInstructionDialog"
import { WcLeftColumn, WcRightColumn } from "@/components/workflow-canvas/WcSideColumns"
import { WcLoginGate } from "@/components/workflow-canvas/WcLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
import type { useWorkflowCanvas } from "./useWorkflowCanvas"

export function WorkflowCanvasPage(p: ReturnType<typeof useWorkflowCanvas>) {
  const nodeTitles = p.flowNodes
    .map((item) => String(item.data?.title || ""))
    .filter((item) => Boolean(item))

  const handleNodeOpen = (nodeId: string) => {
    p.openNodeConfig(nodeId)
    window.requestAnimationFrame(() => {
      document.getElementById("wc-node-config-anchor")?.scrollIntoView({ block: "start" })
    })
  }

  return (
    <SiteShell>
    <div data-studio-fluid-page="workflow" className="relative flex h-[calc(100svh-7.5rem-env(safe-area-inset-bottom))] min-h-[420px] min-w-0 flex-col overflow-hidden bg-background text-foreground lg:h-[calc(100svh-2.5rem)] lg:min-h-0">


      <header className="relative z-30 shrink-0 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-5 lg:px-7 2xl:px-10">
          <h1 className="shrink-0 text-lg font-semibold tracking-tight">工作流画布</h1>
          {p.isLoggedIn && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="max-w-52 truncate text-sm font-medium text-muted-foreground" title={p.flowName}>
                {p.flowName || "未命名工作流"}
              </span>
              {p.dirtyFlag ? (
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                  未保存更改
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                  {p.lastSavedAt ? `已保存 ${p.lastSavedAt}` : "已保存"}
                </span>
              )}
            </span>
          )}
          {p.isLoggedIn && p.activeSpecId ? (
            <Link
              to={`/agent-run?spec=${encodeURIComponent(p.activeSpecId)}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary px-2.5 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Bot className="h-3 w-3" />
              对应助手
            </Link>
          ) : null}
          {p.isLoggedIn && (
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <button type="button"
                onClick={p.handleSaveWorkflow}
                disabled={!p.dirtyFlag || p.savingFlow}
                title="保存工作流（Ctrl+S）"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:opacity-50">
                <Save className="h-4 w-4" />
                {p.savingFlow ? "保存中…" : "保存工作流"}
              </button>
              <button
                type="button"
                onClick={p.enterFocusMode}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Maximize2 className="h-4 w-4" />
                全屏
              </button>
              <button
                type="button"
                onClick={p.openRunDialog}
                disabled={p.isLiveRunning}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                运行
              </button>
            </span>
          )}
        </div>
      </header>

      {!p.isLoggedIn ? (
        <main className="relative z-10 w-full min-w-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5 lg:px-7 2xl:px-10">
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <WcLoginGate onLoginClick={p.onLoginClick} />
          </section>
        </main>
      ) : (p.listLoading || !p.activeWorkflowId) ? (
        <main role="status" aria-live="polite"
          className="flex min-h-0 flex-1 items-center justify-center p-5">
          <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h2 className="text-base font-semibold text-foreground">
              {p.errorMsg ? "工作流暂时无法打开" : "正在准备工作流编辑器…"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {p.errorMsg || "正在加载已保存的节点和连线。为避免覆盖编辑，加载完成前暂不开放画布操作。"}
            </p>
            <button type="button" onClick={() => window.location.reload()}
              className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
              重新加载
            </button>
          </section>
        </main>
      ) : p.isFocusMode ? (
        <main className="relative z-10 min-h-0 flex-1" />
      ) : (
        <main className="relative z-10 flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-3 sm:px-5 lg:px-6 2xl:px-8 xl:overflow-hidden">
          {p.noticeMsg && (
            <div role="status" className="mb-3 flex shrink-0 items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
              <p className="text-sm text-card-foreground">{p.noticeMsg}</p>
              <button type="button" onClick={p.dismissNotice} aria-label="关闭成功提示"
                className="shrink-0 rounded-lg p-1 hover:bg-secondary"><X className="h-4 w-4"/></button>
            </div>
          )}
          {p.needsRhLogin && (
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-primary bg-primary/5 px-4 py-2.5 shadow-md">
              <p className="text-sm text-card-foreground">登录态已过期，请重新登录后继续编排与运行。</p>
              <button
                type="button"
                onClick={p.onLoginClick}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <LogIn className="h-3.5 w-3.5" />
                重新登录
              </button>
            </div>
          )}
          {p.errorMsg && (
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5">
              <p className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {p.errorMsg}
              </p>
              <button
                type="button"
                onClick={p.dismissError}
                aria-label="关闭提示"
                className="shrink-0 rounded-full p-1 text-destructive transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <section className="grid min-h-0 flex-1 gap-3 xl:grid-rows-1 xl:grid-cols-[220px_minmax(0,1fr)_300px] 2xl:grid-cols-[240px_minmax(0,1fr)_330px]">
            <aside className="order-2 min-h-0 xl:order-1 xl:overflow-y-auto xl:pb-2 xl:pr-1">
              <WcLeftColumn p={p} />
            </aside>

            <div className="relative order-1 h-[60vh] min-h-[350px] min-w-0 xl:order-2 xl:h-full xl:min-h-0">
              <div className="h-full w-full overflow-hidden rounded-xl border border-border bg-card">
                <FlowCanvas
                  flowNodes={p.flowNodes}
                  flowEdges={p.flowEdges}
                  onNodesChange={p.onNodesChange}
                  onEdgesChange={p.onEdgesChange}
                  handleConnect={p.handleConnect}
                  isValidConnection={p.isValidConnection}
                  explainInvalidConnection={p.explainInvalidConnection}
                  addNodeByType={p.addNodeByType}
                  nodeStatuses={p.nodeStatuses}
                  loopProgress={p.loopProgress}
                  runningNodeId={p.runningNodeId}
                  onPaneClick={p.clearSelection}
                  canUndo={p.canUndo}
                  canRedo={p.canRedo}
                  onUndo={p.undo}
                  onRedo={p.redo}
                  isFocusMode={p.isFocusMode}
                  onToggleFocusMode={p.enterFocusMode}
                  onAutoArrange={p.autoArrange}
                  followRun={p.followRun}
                  onToggleFollow={p.toggleFollowRun}
                  onUserPan={p.noteUserPan}
                  deleteEdgeById={p.deleteEdgeById}
                  onNodeDoubleClick={handleNodeOpen}
                  addNodeAndConnect={p.addNodeAndConnect}
                  copySelection={p.copySelection}
                  pasteClipboard={p.pasteClipboard}
                  duplicateNodeById={p.duplicateNodeById}
                  deleteSelection={p.deleteSelection}
                  selectAll={p.selectAll}
                  hasClipboard={p.hasClipboard}
                  alignSelected={p.alignSelected}
                  loadSampleGraph={p.loadSampleGraph}
                />
              </div>
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 w-max max-w-[92%] -translate-x-1/2">
                <div className="pointer-events-auto">
                  <RunCapsule
                    activeRun={p.activeRun}
                    isLiveRunning={p.isLiveRunning}
                    viewingHistoryRun={p.viewingHistoryRun}
                    elapsedText={p.elapsedText}
                    openRunDialog={p.openRunDialog}
                    handleCancelRun={p.handleCancelRun}
                    cancelBusy={p.cancelBusy}
                    exitRunView={p.exitRunView}
                    runStateMeta={p.runStateMeta}
                  />
                </div>
              </div>
            </div>

            <aside className="order-3 min-h-0 xl:overflow-y-auto xl:pb-2 xl:pr-1">
              <WcRightColumn p={p} nodeTitles={nodeTitles} />
            </aside>
          </section>
        </main>
      )}

      {p.isLoggedIn && p.isFocusMode && <FocusOverlay p={p} />}

      <RunInstructionDialog
        runDialogOpen={p.runDialogOpen}
        closeRunDialog={p.closeRunDialog}
        runInstruction={p.runInstruction}
        setRunInstruction={p.setRunInstruction}
        handleRunSubmit={p.handleRunSubmit}
        isStarting={p.isStarting}
      />
      <DeleteConfirmDialog
        deleteTarget={p.deleteTarget}
        cancelDelete={p.cancelDelete}
        confirmDelete={p.confirmDelete}
      />
    </div>
    </SiteShell>
  )
}
