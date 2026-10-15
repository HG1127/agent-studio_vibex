import { Bot, LogIn, Maximize2, Play, TriangleAlert, X } from "lucide-react"
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
    <div className="relative flex h-screen min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-secondary blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <header className="relative z-30 shrink-0 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
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
        <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-4 py-6">
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <WcLoginGate onLoginClick={p.onLoginClick} />
          </section>
        </main>
      ) : p.isFocusMode ? (
        <main className="relative z-10 min-h-0 flex-1" />
      ) : (
        <main className="relative z-10 mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-3 lg:overflow-hidden">
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

          <section className="grid min-h-0 flex-1 animate-in fade-in slide-in-from-bottom-4 gap-4 duration-500 lg:grid-rows-1 lg:grid-cols-[240px_minmax(0,1fr)_340px]">
            <aside className="min-h-0 lg:overflow-y-auto lg:pb-2 lg:pr-1">
              <WcLeftColumn p={p} />
            </aside>

            <div className="relative h-[560px] min-h-0 min-w-0 lg:h-full">
              <div className="h-full w-full overflow-hidden rounded-2xl border border-border bg-card shadow-md">
                <FlowCanvas
                  flowNodes={p.flowNodes}
                  flowEdges={p.flowEdges}
                  onNodesChange={p.onNodesChange}
                  onEdgesChange={p.onEdgesChange}
                  handleConnect={p.handleConnect}
                  isValidConnection={p.isValidConnection}
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

            <aside className="min-h-0 lg:overflow-y-auto lg:pb-2 lg:pr-1">
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
