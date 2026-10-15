import { LogIn, Minimize2, PanelLeft, PanelRight, Save, TriangleAlert, X } from "lucide-react"
import type { useWorkflowCanvas } from "@/pages/WorkflowCanvas/useWorkflowCanvas"
import { ApprovalCard } from "./ApprovalCard"
import { FlowCanvas } from "./FlowCanvas"
import { RunCapsule } from "./RunCapsule"
import { WcLeftColumn, WcRightColumn } from "./WcSideColumns"

export function FocusOverlay({ p }: { p: ReturnType<typeof useWorkflowCanvas> }) {
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
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground" title={p.flowName}>
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={p.handleSaveWorkflow}
            disabled={p.savingFlow}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {p.savingFlow ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={p.exitFocusMode}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground shadow transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            退出全屏
          </button>
        </div>
      </div>

      {p.needsRhLogin && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-primary bg-primary/5 px-4 py-2">
          <p className="text-xs text-card-foreground">登录态已过期，请重新登录后继续编排与运行。</p>
          <button
            type="button"
            onClick={p.onLoginClick}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogIn className="h-3 w-3" />
            重新登录
          </button>
        </div>
      )}
      {p.errorMsg && (
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2">
          <p className="flex items-start gap-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {p.errorMsg}
          </p>
          <button
            type="button"
            onClick={p.dismissError}
            aria-label="关闭提示"
            className="shrink-0 rounded-full p-1 text-destructive transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
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
          isFocusMode
          onToggleFocusMode={p.exitFocusMode}
          onAutoArrange={p.autoArrange}
          followRun={p.followRun}
          onToggleFollow={p.toggleFollowRun}
          onUserPan={p.noteUserPan}
          deleteEdgeById={p.deleteEdgeById}
          onNodeDoubleClick={handleNodeOpen}
        />

        {p.pendingApproval && (
          <div className="absolute left-1/2 top-3 z-30 w-full max-w-sm -translate-x-1/2 px-2">
            <ApprovalCard
              pendingApproval={p.pendingApproval}
              decideApproval={p.decideApproval}
              wfApprovalBusy={p.wfApprovalBusy}
            />
          </div>
        )}

        <button
          type="button"
          onClick={p.toggleFocusLeft}
          title={p.focusLeftOpen ? "收起节点面板" : "展开节点面板"}
          className={`absolute left-2 top-1/2 z-30 flex h-12 w-8 -translate-y-1/2 items-center justify-center rounded-r-xl border border-border bg-card shadow-md transition hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary ${
            p.focusLeftOpen ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={p.toggleFocusRight}
          title={p.focusRightOpen ? "收起配置面板" : "展开配置面板"}
          className={`absolute right-2 top-1/2 z-30 flex h-12 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl border border-border bg-card shadow-md transition hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary ${
            p.focusRightOpen ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <PanelRight className="h-4 w-4" />
        </button>

        {p.focusLeftOpen && (
          <aside className="absolute bottom-0 left-0 top-0 z-20 w-64 animate-in fade-in slide-in-from-left-4 overflow-y-auto border-r border-border bg-card p-3 shadow-xl duration-300">
            <WcLeftColumn p={p} />
          </aside>
        )}
        {p.focusRightOpen && (
          <aside className="absolute bottom-0 right-0 top-0 z-20 w-80 animate-in fade-in slide-in-from-right-4 overflow-y-auto border-l border-border bg-card p-3 shadow-xl duration-300">
            <WcRightColumn p={p} nodeTitles={nodeTitles} />
          </aside>
        )}

        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 w-max max-w-[92%] -translate-x-1/2">
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
    </div>
  )
}
