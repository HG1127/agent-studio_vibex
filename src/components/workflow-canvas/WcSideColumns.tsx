import { X } from "lucide-react"
import type { useWorkflowCanvas } from "@/pages/WorkflowCanvas/useWorkflowCanvas"
import { ApprovalCard } from "./ApprovalCard"
import { NodeConfigPanel } from "./NodeConfigPanel"
import { NodePalette } from "./NodePalette"
import { RecentRunsList, RunSummaryPanel } from "./RunSummaryPanel"
import { WorkflowInfoPanel } from "./WorkflowInfoPanel"
import { WorkflowListPanel } from "./WorkflowListPanel"
import { WorkflowDiagnosticsPanel } from "./WorkflowDiagnosticsPanel"
import { WorkflowNodePreviewPanel } from "./WorkflowNodePreviewPanel"
import { RunTraceCard } from "@/components/run-detail/RunTraceCard"

type WcColumnProps = { p: ReturnType<typeof useWorkflowCanvas> }

export function WcLeftColumn({ p }: WcColumnProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <NodePalette addNodeByType={p.addNodeByType} />
      <WorkflowListPanel
        workflows={p.workflows}
        activeWorkflowId={p.activeWorkflowId}
        listLoading={p.listLoading}
        handleSelectWorkflow={p.handleSelectWorkflow}
        handleCreateWorkflow={p.handleCreateWorkflow}
        handleDuplicateWorkflow={p.handleDuplicateWorkflow}
        requestDeleteWorkflow={p.requestDeleteWorkflow}
        specOptions={p.specOptions}
        genFromSpecBusy={p.genFromSpecBusy}
        handleGenerateFromSpec={p.handleGenerateFromSpec}
        exportActiveFlow={p.exportActiveFlow}
        importFlowFile={p.importFlowFile}
      />
      <footer className="mt-auto rounded-2xl border border-border bg-card p-4 shadow-md">
        <h2 className="text-sm font-semibold tracking-tight text-card-foreground">变量引用速查</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          提示词、工具入参模板与结束输出模板里都可以写变量：{"{{input}}"} 是运行时填写的任务指令；{"{{节点标题.output}}"}
          取该节点已完成的输出（标题需唯一）；循环体内的节点还可以写 {"{{loop.item}}"}（当前列表项，按次数模式为轮次序号）与
          {"{{loop.index}}"}（当前轮次，从 1 起）。找不到的变量会替换为空串，并在节点运行详情里注明。条件节点在上游输出文本上做包含
          / 不包含 / 数值比较，未走分支及其独占下游会标记为跳过。循环节点从「循环体」出口连出子图并拉一条回边连回自身，「退出」出口在循环结束后继续下游；任一轮输出命中提前终止关键词即提前退出。
        </p>
      </footer>
    </div>
  )
}

export function WcRightColumn({ p, nodeTitles }: WcColumnProps & { nodeTitles: string[] }) {
  return (
    <div className="flex h-full flex-col gap-4">
      {p.pendingApproval && (
        <ApprovalCard
          pendingApproval={p.pendingApproval}
          decideApproval={p.decideApproval}
          wfApprovalBusy={p.wfApprovalBusy}
        />
      )}
      <WorkflowDiagnosticsPanel issues={p.workflowDiagnostics} onSelectNode={p.openNodeConfig}/>
      {p.selectedNode && (
        <div id="wc-node-config-anchor" className="scroll-mt-2">
          <NodeConfigPanel
            selectedNode={p.selectedNode}
            selectedEdge={p.selectedEdge}
            updateNodeData={p.updateNodeData}
            deleteSelectedNode={p.deleteSelectedNode}
            deleteSelectedEdge={p.deleteSelectedEdge}
            customModels={p.customModels}
            specOptions={p.specOptions}
            builtinTools={p.builtinTools}
            connectedTools={p.connectedTools}
            knowledgeBases={p.knowledgeBases}
            conditionOps={p.conditionOps}
            loopDelimiters={p.loopDelimiters}
            availableVariables={p.selectedNodeVariables}
            nodeTitles={nodeTitles}
            nodeRunInfo={p.nodeRunInfo}
          />
        </div>
      )}
      {p.selectedNode && (
        <WorkflowNodePreviewPanel key={p.selectedNode.id} node={p.selectedNode}
          nodes={p.flowNodes} edges={p.flowEdges}
          allowedModelSelections={p.customModels.map(item => item.value)}
          lastRun={p.activeRun?.workflow_id === p.activeWorkflowId
            ? {instruction: p.activeRun.instruction,
               outputs: p.activeRun.checkpoint?.outputs || {}}
            : undefined}
        />
      )}
      {!p.selectedNode && p.selectedEdge && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
          <p className="text-sm font-medium text-card-foreground">已选中一条连线</p>
          <p className="mt-1 text-xs text-muted-foreground">
            连线代表执行顺序；条件节点的两个出口分别对应「满足 / 不满足」。也可以直接按 Delete 键删除。
          </p>
          <button
            type="button"
            onClick={p.deleteSelectedEdge}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3 w-3" />
            删除这条连线
          </button>
        </div>
      )}
      {!p.selectedNode && !p.selectedEdge && (
        <WorkflowInfoPanel
          flowName={p.flowName}
          setFlowName={p.setFlowName}
          flowDesc={p.flowDesc}
          setFlowDesc={p.setFlowDesc}
          dirtyFlag={p.dirtyFlag}
          savingFlow={p.savingFlow}
          lastSavedAt={p.lastSavedAt}
          handleSaveWorkflow={p.handleSaveWorkflow}
          nodeCount={p.flowNodes.length}
          edgeCount={p.flowEdges.length}
          requireApproval={p.requireApproval}
          toggleRequireApproval={p.toggleRequireApproval}
        />
      )}
      {p.activeRun && (
        <RunSummaryPanel
          activeRun={p.activeRun}
          elapsedText={p.elapsedText}
          handleCopyResult={p.handleCopyResult}
          copiedFlag={p.copiedFlag}
          viewingHistoryRun={p.viewingHistoryRun}
        />
      )}
      {p.activeRun && <RunTraceCard runId={p.activeRun.id} kind="workflow" />}
      <div className="mt-auto">
        <RecentRunsList
          recentRuns={p.recentRuns}
          activeRunId={p.activeRunId}
          handleViewRun={p.handleViewRun}
        />
      </div>
    </div>
  )
}
