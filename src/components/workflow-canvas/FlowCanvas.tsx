import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeMarker,
  type EdgeProps,
  type NodeChange,
  type NodeProps,
  type XYPosition,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Bot,
  Crosshair,
  Flag,
  GitBranch,
  Maximize,
  Maximize2,
  Minimize2,
  Play,
  Redo2,
  Repeat,
  Sparkles,
  Undo2,
  Waypoints,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type { WfEdge, WfNode, WfNodeData, WfNodeType } from "@/pages/WorkflowCanvas/useWorkflowCanvas"
import { CONDITION_OPS, LOOP_DELIMITERS, NODE_TYPE_META } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

export type LoopProgressEntry = { round: number; total: number; active: boolean }

type CanvasRunState = {
  statuses: Record<string, string>
  runningId: string
  loopProgress: Record<string, LoopProgressEntry>
}

const CanvasRunCtx = createContext<CanvasRunState>({ statuses: {}, runningId: "", loopProgress: {} })

const EdgeActionCtx = createContext<{ deleteEdge: (edgeId: string) => void }>({
  deleteEdge: () => {},
})

const TYPE_ICONS: Record<WfNodeType, typeof Play> = {
  start: Play,
  model: Sparkles,
  tool: Wrench,
  agent: Bot,
  condition: GitBranch,
  loop: Repeat,
  end: Flag,
}

function shortModelLabel(value: string): string {
  if (!value) return "未选择模型"
  if (value.startsWith("custom:")) {
    const parts = value.split(":")
    return `自定义 · ${parts[parts.length - 1]}`
  }
  return value
}

function nodeSummary(type: string, data: WfNodeData): string {
  if (type === "start") return String(data.input_hint || "运行指令注入 {{input}}")
  if (type === "model") return shortModelLabel(String(data.model || ""))
  if (type === "tool") return String(data.tool || "未选择工具")
  if (type === "agent") {
    return String(data.spec_id || "")
      ? `已关联助手方案 · 上限 ${String(data.max_steps ?? 3)} 轮`
      : "未关联助手方案"
  }
  if (type === "condition") {
    const opLabel = CONDITION_OPS.find((item) => item.value === String(data.op || "contains"))?.label || "条件"
    return `${opLabel}：${String(data.value || "（未填比较值）")}`
  }
  if (type === "loop") {
    const stopText = String(data.stop_keyword || "").trim()
    const stopSuffix = stopText ? ` · 命中「${stopText}」提前停` : ""
    if (String(data.mode || "count") === "list") {
      const delimLabel =
        LOOP_DELIMITERS.find((item) => item.value === String(data.delimiter || "line"))?.label || "按换行切分"
      return `按列表逐项 · ${delimLabel}${stopSuffix}`
    }
    return `按次数重复 · ${String(data.count || "?")} 轮${stopSuffix}`
  }
  if (type === "end") return String(data.output_template || "默认取上游节点输出")
  return ""
}

const HANDLE_CLASS = "!h-2.5 !w-2.5 !border-2 !border-card !bg-primary"

function WfNodeCard(props: NodeProps) {
  const data = (props.data || {}) as WfNodeData
  const nodeType = String(props.type || "model") as WfNodeType
  const { statuses, runningId, loopProgress } = useContext(CanvasRunCtx)
  const runState = statuses[props.id] || ""
  const isRunning = runningId === props.id
  const Icon = TYPE_ICONS[nodeType] || Sparkles
  const meta = NODE_TYPE_META[nodeType] || NODE_TYPE_META.model
  const selected = Boolean(props.selected)
  const loopProg = nodeType === "loop" ? loopProgress[props.id] : undefined
  const loopProgText = loopProg
    ? loopProg.active
      ? `第 ${Math.max(1, Math.min(loopProg.round, Math.max(loopProg.total, loopProg.round)))} 轮 / 共 ${loopProg.total} 轮`
      : loopProg.round > 0
        ? `共执行 ${loopProg.round} 轮`
        : "空列表 · 0 轮"
    : ""

  let shellClass = "border-border"
  if (isRunning) shellClass = "border-primary shadow-lg"
  else if (runState === "done") shellClass = "border-primary"
  else if (runState === "failed") shellClass = "border-destructive"
  else if (runState === "skipped") shellClass = "border-dashed border-border opacity-60"
  else if (selected) shellClass = "border-primary"

  return (
    <div
      className={`relative w-52 rounded-2xl border bg-card p-3 shadow-md transition ${shellClass} ${
        selected ? "ring-2 ring-primary" : ""
      } ${isRunning ? "animate-pulse" : ""}`}
    >
      {nodeType !== "start" && (
        <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      )}
      {nodeType !== "end" && nodeType !== "condition" && nodeType !== "loop" && (
        <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
      )}
      {nodeType === "condition" && (
        <>
          <Handle id="true" type="source" position={Position.Right} style={{ top: "38%" }} className={HANDLE_CLASS} />
          <Handle id="false" type="source" position={Position.Right} style={{ top: "74%" }} className={HANDLE_CLASS} />
        </>
      )}
      {nodeType === "loop" && (
        <>
          <Handle id="body" type="source" position={Position.Right} style={{ top: "38%" }} className={HANDLE_CLASS} />
          <Handle id="done" type="source" position={Position.Right} style={{ top: "74%" }} className={HANDLE_CLASS} />
        </>
      )}
      {(isRunning || runState) && (
        <span
          className={`absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border-2 border-card ${
            isRunning
              ? "animate-ping bg-primary"
              : runState === "done"
                ? "bg-primary"
                : runState === "failed"
                  ? "bg-destructive"
                  : "bg-muted-foreground"
          }`}
        />
      )}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-card-foreground">
            {String(data.title || meta.label)}
          </span>
          <span className="block text-xs text-muted-foreground">{meta.label}</span>
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground" title={nodeSummary(nodeType, data)}>
        {nodeSummary(nodeType, data)}
      </p>
      {nodeType === "condition" && (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">满足 →</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">不满足 →</span>
        </div>
      )}
      {nodeType === "loop" && (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">循环体 →</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">退出 →</span>
        </div>
      )}
      {loopProgText && (
        <p className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {loopProgText}
        </p>
      )}
    </div>
  )
}

const NODE_TYPES = {
  start: WfNodeCard,
  model: WfNodeCard,
  tool: WfNodeCard,
  agent: WfNodeCard,
  condition: WfNodeCard,
  loop: WfNodeCard,
  end: WfNodeCard,
}

// 自定义连线：hover / 选中时在中点浮出删除小按钮（普通与全屏模式共用）
function WfEdgeCard(props: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  })
  const [edgeHover, setEdgeHover] = useState(false)
  const { deleteEdge } = useContext(EdgeActionCtx)
  const { runningId } = useContext(CanvasRunCtx)
  const showDelete = edgeHover || Boolean(props.selected)
  // 指向当前运行中节点的边加流动虚线动画，指示执行流向
  const isFlowing = Boolean(runningId) && props.target === runningId

  return (
    <>
      <g onMouseEnter={() => setEdgeHover(true)} onMouseLeave={() => setEdgeHover(false)}>
        <BaseEdge id={props.id} path={edgePath} style={props.style} markerEnd={props.markerEnd} />
        {isFlowing && (
          <path
            d={edgePath}
            className="react-flow__edge-path animated"
            style={{ stroke: "hsl(var(--primary))", strokeWidth: 2.5, fill: "none" }}
            pointerEvents="none"
          />
        )}
      </g>
      {showDelete && (
        <EdgeLabelRenderer>
          <button
            type="button"
            title="删除这条连线"
            onClick={(event) => {
              event.stopPropagation()
              deleteEdge(props.id)
            }}
            className="nodrag nopan absolute flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const EDGE_TYPES = { wf: WfEdgeCard }

export type FlowCanvasProps = {
  flowNodes: WfNode[]
  flowEdges: WfEdge[]
  onNodesChange: (changes: NodeChange<WfNode>[]) => void
  onEdgesChange: (changes: EdgeChange<WfEdge>[]) => void
  handleConnect: (conn: Connection) => void
  isValidConnection: (conn: Connection) => boolean
  addNodeByType: (type: WfNodeType, position?: XYPosition) => void
  nodeStatuses: Record<string, string>
  loopProgress: Record<string, LoopProgressEntry>
  runningNodeId: string
  onPaneClick: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  isFocusMode: boolean
  onToggleFocusMode: () => void
  onAutoArrange: () => void
  followRun: boolean
  onToggleFollow: () => void
  onUserPan: () => void
  deleteEdgeById: (edgeId: string) => void
  onNodeDoubleClick: (nodeId: string) => void
}

function CanvasBody(props: FlowCanvasProps) {
  const { screenToFlowPosition, zoomIn, zoomOut, fitView, setCenter } = useReactFlow()

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const { addNodeByType, onUserPan, deleteEdgeById, onNodeDoubleClick } = props
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const raw = event.dataTransfer.getData("application/wf-node")
      if (!raw) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNodeByType(raw as WfNodeType, position)
    },
    [screenToFlowPosition, addNodeByType],
  )

  // 用户手动拖拽画布 → 本次运行内关闭跟随
  const handleMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      if (event && (event.type === "mousedown" || event.type === "touchstart")) onUserPan()
    },
    [onUserPan],
  )

  // 运行中新 node_start：跟随开启时把视口居中到正在执行的节点
  const prevRunningIdRef = useRef("")
  const { runningNodeId, followRun, flowNodes } = props
  useEffect(() => {
    if (!runningNodeId || runningNodeId === prevRunningIdRef.current) return
    prevRunningIdRef.current = runningNodeId
    if (!followRun) return
    const node = flowNodes.find((item) => item.id === runningNodeId)
    if (!node) return
    const nodeWidth = node.measured?.width ?? 208
    const nodeHeight = node.measured?.height ?? 96
    void setCenter(node.position.x + nodeWidth / 2, node.position.y + nodeHeight / 2, { duration: 400 })
  }, [runningNodeId, followRun, flowNodes, setCenter])

  const ctxValue = useMemo(
    () => ({ statuses: props.nodeStatuses, runningId: props.runningNodeId, loopProgress: props.loopProgress }),
    [props.nodeStatuses, props.runningNodeId, props.loopProgress],
  )

  const edgeCtxValue = useMemo(() => ({ deleteEdge: deleteEdgeById }), [deleteEdgeById])

  // 存量边可能落库了裸 var(--x) 描边（HSL 通道值不带 hsl() 包裹=无效色=线不可见），渲染期统一修正；箭头补同色
  const displayEdges = useMemo(
    () =>
      props.flowEdges.map((item) => {
        const rawStyle = (item.style || {}) as Record<string, unknown>
        const rawStroke = String(rawStyle.stroke || "")
        const fixedStroke = rawStroke.indexOf("var(--") >= 0 && rawStroke.indexOf("hsl(") < 0 ? rawStroke.replace(/var\((--[\w-]+)\)/g, "hsl(var($1))") : rawStroke
        const stroke = fixedStroke || "hsl(var(--primary))"
        const strokeWidth = Number(rawStyle.strokeWidth || 2.5)
        const rawMarker = item.markerEnd as { type?: string; color?: string } | string | undefined
        const markerEnd: WfEdge["markerEnd"] =
          rawMarker && typeof rawMarker === "object" && rawMarker.type
            ? ({ type: rawMarker.type as EdgeMarker["type"], color: rawMarker.color || stroke } as EdgeMarker)
            : item.markerEnd
        return { ...item, type: "wf", style: { ...rawStyle, stroke, strokeWidth }, markerEnd }
      }),
    [props.flowEdges],
  )

  const toolButtonClass =
    "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition hover:text-card-foreground hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"

  return (
    <CanvasRunCtx.Provider value={ctxValue}>
      <EdgeActionCtx.Provider value={edgeCtxValue}>
        <ReactFlow
          nodes={props.flowNodes}
          edges={displayEdges}
          edgeTypes={EDGE_TYPES}
          onNodesChange={props.onNodesChange}
          onEdgesChange={props.onEdgesChange}
          onConnect={props.handleConnect}
          isValidConnection={(conn) => props.isValidConnection(conn as Connection)}
          nodeTypes={NODE_TYPES}
          deleteKeyCode={null}
          fitView
          minZoom={0.4}
          maxZoom={2}
          snapToGrid
          snapGrid={[18, 18]}
          onPaneClick={props.onPaneClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onMoveStart={handleMoveStart}
          onNodeDoubleClick={(_event, node) => onNodeDoubleClick(node.id)}
        >
          <MiniMap
            pannable
            zoomable
            className="!bg-card overflow-hidden rounded-xl border border-border shadow-md"
            nodeStrokeWidth={3}
            nodeColor={(node) => (node.selected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))")}
          />
          <Panel position="top-right" className="flex max-w-full flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={props.onUndo}
              disabled={!props.canUndo}
              title="撤销 (Ctrl+Z)"
              className={`${toolButtonClass} disabled:pointer-events-none disabled:opacity-40`}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={props.onRedo}
              disabled={!props.canRedo}
              title="重做 (Ctrl+Shift+Z)"
              className={`${toolButtonClass} disabled:pointer-events-none disabled:opacity-40`}
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => zoomIn()} title="放大" className={toolButtonClass}>
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => zoomOut()} title="缩小" className={toolButtonClass}>
              <ZoomOut className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => fitView()} title="适应画布" className={toolButtonClass}>
              <Maximize className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={props.onAutoArrange}
              title="自动整理（按连线顺序分层排布，可撤销）"
              className={toolButtonClass}
            >
              <Waypoints className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={props.onToggleFollow}
              title="运行跟随：执行时视口自动居中当前节点（拖拽画布后本次运行自动关闭）"
              className={`${toolButtonClass} ${props.followRun ? "border-primary text-primary" : ""}`}
            >
              <Crosshair className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={props.onToggleFocusMode}
              title={props.isFocusMode ? "退出全屏 (Esc)" : "全屏专注模式"}
              className={`${toolButtonClass} ${props.isFocusMode ? "border-primary text-primary" : ""}`}
            >
              {props.isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </Panel>
          {props.flowNodes.length === 0 && (
            <Panel position="top-center" className="pointer-events-none mt-20">
              <div className="rounded-2xl border border-dashed border-border bg-card/80 px-6 py-4 text-center shadow-md backdrop-blur">
                <p className="text-sm font-medium text-card-foreground">画布还是空的</p>
                <p className="mt-1 text-xs text-muted-foreground">从左侧拖入一个「开始」节点，开始编排</p>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </EdgeActionCtx.Provider>
    </CanvasRunCtx.Provider>
  )
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasBody {...props} />
    </ReactFlowProvider>
  )
}
