import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {confirmInStudio} from "@/lib/studioDialogs"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import { getKnowledgeBases, type KnowledgeBase } from "@/lib/knowledgeBases"
import { tickWorkflowRun } from "@/lib/workflowEngine"
import {
  PROVIDER_META,
  normalizeProvider,
} from "@/pages/ModelConnections/useModelConnections"
import {
  alignNodes, exportWorkflowJson, parseWorkflowJson, pasteFragment, selectedFragment,
  insertConnectedNode, renameNodeReferences, findAvailableNodePosition, MAX_WORKFLOW_NODES,
  type GraphFragment, type AlignMode,
} from "@/lib/workflowGraphTransfer"
import { inspectWorkflowGraph } from "@/lib/workflowDiagnostics"
import { workflowConnectionIssue } from "@/lib/workflowConnectionRules"
import { registerUnsavedWorkCheck } from "@/lib/unsavedNavigation"
import { suggestedVariablesForNode } from "@/lib/workflowNodePreview"

// ————— 类型（字段名与后端 workflow_api.pb.js 返回 1:1，snake_case，禁止转换层） —————

export type WfNodeType = "start" | "model" | "tool" | "agent" | "condition" | "loop" | "end"

export type WfNodeData = {
  title: string
  input_hint?: string
  model?: string
  prompt?: string
  spec_id?: string
  max_steps?: string | number
  tool?: string
  params_template?: string
  ref_title?: string
  op?: string
  value?: string
  output_template?: string
  mode?: string
  count?: string | number
  list_source?: string
  delimiter?: string
  stop_keyword?: string
  max_iterations?: string | number
  [key: string]: unknown
}

export type WfNode = Node<WfNodeData>
export type WfEdge = Edge

export type WorkflowRow = {
  id: string
  name: string
  description: string
  node_count: number
  source: string
  spec_id?: string
  require_approval?: boolean
  created: string
  updated: string
}

export type WfRunState = "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled"

export type LoopRunState = {
  round?: number
  total?: number
  active?: boolean
  mode?: string
}

export type HarnessStats = {
  llm_calls?: number
  est_prompt_chars?: number
  est_out_chars?: number
  tool_calls?: number
  retries?: number
  truncations?: number
  approvals?: number
}

export type PendingApproval = {
  node_id?: string
  tool?: string
  title?: string
  input_summary?: string
}

export type RunCheckpoint = {
  queue?: string[]
  statuses?: Record<string, string>
  outputs?: Record<string, string>
  seq?: number
  done_count?: number
  claim_until?: number
  cancel_requested?: boolean
  loop_state?: Record<string, LoopRunState>
  exec_count?: number
  harness_stats?: HarnessStats
  exec_sig?: Record<string, { count?: number; samples?: string[] }>
  approved_node?: string
  reject_node?: string
  pending_approval?: PendingApproval | null
}

export type RunDetailRow = {
  id: string
  workflow_id: string
  workflow_name: string
  instruction: string
  status: WfRunState
  result: string
  error: string
  done_nodes: number
  total_nodes: number
  checkpoint: RunCheckpoint
  created: string
  updated: string
}

export type RecentRunRow = {
  id: string
  workflow_id: string
  workflow_name: string
  instruction: string
  status: WfRunState
  done_nodes: number
  total_nodes: number
  result: string
  error: string
  created: string
}

export type WfEventRow = {
  id: string
  node_id: string
  seq: number
  event_type: string
  content: Record<string, unknown>
  created: string
}

export type ModelOption = { value: string; label: string; hint: string }
export type ToolOption = { value: string; label: string; hint: string }

export const NODE_TYPE_META: Record<WfNodeType, { label: string; blurb: string }> = {
  start: { label: "开始", blurb: "运行指令注入 {{input}}" },
  model: { label: "模型", blurb: "选模型写提示词，真实调用" },
  tool: { label: "工具", blurb: "内置三件套或已连接工具" },
  agent: { label: "Agent 角色", blurb: "关联助手方案，按角色做思考-行动循环" },
  condition: { label: "条件分支", blurb: "满足 / 不满足双出口" },
  loop: { label: "循环", blurb: "按次数重复 / 按列表逐项" },
  end: { label: "结束", blurb: "输出模板汇总最终结果" },
}

export const LOOP_DELIMITERS: { value: string; label: string }[] = [
  { value: "line", label: "按换行切分" },
  { value: "comma", label: "按逗号切分" },
  { value: "json_array", label: "JSON 数组解析" },
]

export const BUILTIN_TOOL_OPTIONS: ToolOption[] = [
  { value: "calculate", label: "计算器", hint: '入参 {"expression":"算术表达式"}' },
  { value: "summarize", label: "文本整理摘要", hint: '入参 {"text":"文本","focus":"重点"}' },
  { value: "knowledge_search", label: "知识库检索", hint: '入参 {"query":"关键词"}' },
  { value: "web_fetch", label: "网页抓取", hint: '入参 {"url":"http(s) 网页地址"}' },
  { value: "web_search", label: "网页搜索", hint: '入参 {"query":"关键词","limit":条数}' },
]

export const CONDITION_OPS: { value: string; label: string }[] = [
  { value: "contains", label: "包含关键词" },
  { value: "not_contains", label: "不包含关键词" },
  { value: "gt", label: "数值大于" },
  { value: "lt", label: "数值小于" },
  { value: "eq", label: "数值等于" },
]

export const WF_RUN_STATE_META: Record<WfRunState, { label: string; badge: string }> = {
  running: { label: "运行中", badge: "bg-primary/10 text-primary" },
  awaiting_approval: { label: "等待批准", badge: "bg-secondary text-secondary-foreground" },
  succeeded: { label: "已完成", badge: "bg-primary/10 text-primary" },
  failed: { label: "失败", badge: "bg-destructive/10 text-destructive" },
  cancelled: { label: "已取消", badge: "bg-muted text-muted-foreground" },
}

const TERMINAL_STATES: WfRunState[] = ["succeeded", "failed", "cancelled"]
const POLL_INTERVAL_MS = 3000
const CUSTOM_MODEL_PREFIX = "custom:"
const HISTORY_LIMIT = 50
const COALESCE_WINDOW_MS = 800

type GraphSnapshot = { nodes: WfNode[]; edges: WfEdge[] }

function cloneGraph(nodes: WfNode[], edges: WfEdge[]): GraphSnapshot {
  return {
    nodes: nodes.map((item) => ({
      ...item,
      position: { ...item.position },
      data: { ...item.data },
      selected: false,
      dragging: false,
    })),
    edges: edges.map((item) => ({ ...item, selected: false })),
  }
}

function makeNodeId(type: WfNodeType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function defaultNodeData(type: WfNodeType, title: string): WfNodeData {
  if (type === "model") {
    return { title, model: "", prompt: "" }
  }
  if (type === "tool") {
    return { title, tool: "calculate", params_template: "" }
  }
  if (type === "agent") {
    return { title, spec_id: "", max_steps: 3, prompt: "{{input}}" }
  }
  if (type === "condition") {
    return { title, op: "contains", value: "", ref_title: "" }
  }
  if (type === "loop") {
    return {
      title,
      mode: "count",
      count: "3",
      list_source: "{{input}}",
      delimiter: "line",
      stop_keyword: "",
      max_iterations: "10",
    }
  }
  if (type === "end") {
    return { title, output_template: "" }
  }
  return { title, input_hint: "" }
}

// 每个循环节点的循环体子图（body 出口可达、不穿越循环自身）；回边与配置校验共用
function computeLoopBodies(nodes: WfNode[], edges: WfEdge[]): Record<string, Set<string>> {
  const result: Record<string, Set<string>> = {}
  for (const nodeItem of nodes) {
    if (nodeItem.type !== "loop") continue
    const seeds = edges
      .filter((ed) => ed.source === nodeItem.id && String(ed.sourceHandle || "") !== "done")
      .map((ed) => ed.target)
    const seen = new Set<string>()
    const stack = [...seeds]
    while (stack.length > 0) {
      const cid = String(stack.pop() || "")
      if (!cid || seen.has(cid) || cid === nodeItem.id) continue
      seen.add(cid)
      for (const ed of edges) {
        if (ed.source === cid) stack.push(ed.target)
      }
    }
    result[nodeItem.id] = seen
  }
  return result
}

// 从 seeds 出发沿连线能否到达 targetId（可穿越任意节点，含回边）
function reachesTarget(edges: WfEdge[], seeds: string[], targetId: string): boolean {
  const seen = new Set<string>()
  const stack = [...seeds]
  while (stack.length > 0) {
    const cid = String(stack.pop() || "")
    if (!cid || seen.has(cid)) continue
    if (cid === targetId) return true
    seen.add(cid)
    for (const ed of edges) {
      if (ed.source === cid) stack.push(ed.target)
    }
  }
  return false
}

function freshGraph(): { nodes: WfNode[]; edges: WfEdge[] } {
  return {
    nodes: [
      {
        id: makeNodeId("start"),
        type: "start",
        position: { x: 60, y: 180 },
        data: { title: "开始" },
      },
    ],
    edges: [],
  }
}

function serializeGraph(nodes: WfNode[], edges: WfEdge[]) {
  return {
    nodes: nodes.map((item) => ({
      id: item.id,
      type: item.type,
      position: item.position,
      data: item.data,
    })),
    edges: edges.map((item) => ({
      id: item.id,
      source: item.source,
      target: item.target,
      sourceHandle: item.sourceHandle || undefined,
    })),
  }
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min} 分 ${sec} 秒` : `${sec} 秒`
}

function parseRunTime(raw: string): number {
  if (!raw) return 0
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T")
  const parsed = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

export function useWorkflowCanvas() {
  const base = getPocketBaseUrl()

  // AuthGate has verified the employee JWT before this route mounts.
  const [rhUserId] = useState(() => decodeRhToken()?.sub || LOCAL_ANON_UID)
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  // 工作流列表与当前编辑态
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [activeWorkflowId, setActiveWorkflowId] = useState("")
  const [activeSpecId, setActiveSpecId] = useState("")
  const [flowName, setFlowName] = useState("")
  const [flowDesc, setFlowDesc] = useState("")
  const [requireApproval, setRequireApproval] = useState(false)
  const [dirtyFlag, setDirtyFlag] = useState(false)
  const [savingFlow, setSavingFlow] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState("")
  // Prevent accidentally discarding a draft through reload/tab close.
  // The browser owns the confirmation wording; do not claim an autosave.
  useEffect(() => {
    if (!dirtyFlag) return
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnUnsaved)
    return () => window.removeEventListener("beforeunload", warnUnsaved)
  }, [dirtyFlag])
  useEffect(() => registerUnsavedWorkCheck(
    () => dirtyFlag,
  ), [dirtyFlag])
  // Metadata is read synchronously when saving, even before React re-renders.
  const latestFieldsRef = useRef({ name: "", desc: "", requireApproval: false })
  useLayoutEffect(() => {
    latestFieldsRef.current = { name: flowName, desc: flowDesc, requireApproval }
  }, [flowName, flowDesc, requireApproval])

  // 画布
  const [flowNodes, setFlowNodes] = useState<WfNode[]>([])
  const [flowEdges, setFlowEdges] = useState<WfEdge[]>([])

  // 全屏专注模式与运行跟随
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [focusLeftOpen, setFocusLeftOpen] = useState(false)
  const [focusRightOpen, setFocusRightOpen] = useState(false)
  const [followRun, setFollowRun] = useState(true)

  // 运行
  const [activeRun, setActiveRun] = useState<RunDetailRow | null>(null)
  const [runEvents, setRunEvents] = useState<WfEventRow[]>([])
  const [activeRunId, setActiveRunId] = useState("")
  const [liveRunId, setLiveRunId] = useState("")
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [runInstruction, setRunInstruction] = useState("")
  const [isStarting, setIsStarting] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [wfApprovalBusy, setWfApprovalBusy] = useState(false)
  const [recentRuns, setRecentRuns] = useState<RecentRunRow[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [copiedFlag, setCopiedFlag] = useState(false)

  // 删除二次确认
  const [deleteTargetId, setDeleteTargetId] = useState("")

  // 模型与工具选项
  const [customModels, setCustomModels] = useState<ModelOption[]>([])
  const [specOptions, setSpecOptions] = useState<{ id: string; name: string }[]>([])
  const [connectedTools, setConnectedTools] = useState<ToolOption[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])

  const pollBusyRef = useRef(false)
  const tickInFlightRef = useRef(false)
  const savingRef = useRef(false)
  const saveRef = useRef<(silent?: boolean) => Promise<boolean>>(async () => false)

  // ————— 撤销 / 重做（快照式历史栈） —————
  const nodesRef = useRef(flowNodes)
  const edgesRef = useRef(flowEdges)
  useLayoutEffect(() => {
    nodesRef.current = flowNodes
    edgesRef.current = flowEdges
  }, [flowNodes, flowEdges])
  const pastRef = useRef<GraphSnapshot[]>([])
  const futureRef = useRef<GraphSnapshot[]>([])
  const dragSnapRef = useRef<GraphSnapshot | null>(null)
  const lastCoalesceRef = useRef({ key: "", time: 0 })
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false })

  const pushHistory = useCallback((coalesceKey = "") => {
    const now = Date.now()
    if (
      coalesceKey &&
      lastCoalesceRef.current.key === coalesceKey &&
      now - lastCoalesceRef.current.time < COALESCE_WINDOW_MS
    ) {
      lastCoalesceRef.current.time = now
      return
    }
    lastCoalesceRef.current = { key: coalesceKey, time: now }
    pastRef.current.push(cloneGraph(nodesRef.current, edgesRef.current))
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
    futureRef.current = []
    setHistoryAvailability({ canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 })
  }, [])

  const commitSnapshot = useCallback((snap: GraphSnapshot) => {
    lastCoalesceRef.current = { key: "", time: 0 }
    pastRef.current.push(snap)
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
    futureRef.current = []
    setHistoryAvailability({ canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 })
  }, [])

  const applySnapshot = useCallback((snap: GraphSnapshot) => {
    dragSnapRef.current = null
    lastCoalesceRef.current = { key: "", time: 0 }
    // Keep refs and React state in sync for rapid consecutive undo/redo.
    nodesRef.current = snap.nodes
    edgesRef.current = snap.edges
    setFlowNodes(snap.nodes)
    setFlowEdges(snap.edges)
    setDirtyFlag(true)
    setErrorMsg("")
  }, [])

  const undo = useCallback(() => {
    const snap = pastRef.current.pop()
    if (!snap) return
    futureRef.current.push(cloneGraph(nodesRef.current, edgesRef.current))
    applySnapshot(snap)
    setHistoryAvailability({ canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 })
  }, [applySnapshot])

  const redo = useCallback(() => {
    const snap = futureRef.current.pop()
    if (!snap) return
    pastRef.current.push(cloneGraph(nodesRef.current, edgesRef.current))
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
    applySnapshot(snap)
    setHistoryAvailability({ canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 })
  }, [applySnapshot])

  const resetHistory = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    dragSnapRef.current = null
    lastCoalesceRef.current = { key: "", time: 0 }
    setHistoryAvailability({ canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 })
  }, [])

  // 快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做（输入框内不劫持）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === "z" && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [undo, redo])

  // 快捷键：Ctrl/Cmd+S 保存（输入框内同样生效，拦截浏览器默认保存）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() !== "s") return
      event.preventDefault()
      void saveRef.current(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // 全屏专注模式：Esc 退出（弹窗打开时让弹窗优先处理）
  useEffect(() => {
    if (!isFocusMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (runDialogOpen || deleteTargetId) return
      setIsFocusMode(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isFocusMode, runDialogOpen, deleteTargetId])

  // ————— 数据加载 —————

  const loadWorkflows = useCallback(async (): Promise<WorkflowRow[]> => {
    try {
      const res = await fetch(`${base}/api/workflow-studio/list`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return []
      }
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data?.items) ? (data.items as WorkflowRow[]) : []
      setWorkflows(items)
      return items
    } catch {
      return []
    } finally {
      setListLoading(false)
    }
  }, [base])

  const createWorkflow = useCallback(
    async (nameText: string) => {
      try {
        const graph = freshGraph()
        const res = await fetch(`${base}/api/workflow-studio/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: JSON.stringify({ name: nameText, description: "", graph: serializeGraph(graph.nodes, graph.edges) }),
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return ""
        }
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.id) {
          setErrorMsg(data?.message || "新建工作流失败，请稍后重试")
          return ""
        }
        return String(data.id)
      } catch {
        setErrorMsg("网络异常，新建工作流失败")
        return ""
      }
    },
    [base],
  )

  const applyWorkflowToCanvas = useCallback((row: { id: string; name: string; description?: string; require_approval?: boolean; spec_id?: string; graph?: { nodes?: WfNode[]; edges?: WfEdge[] } }) => {
    setActiveWorkflowId(row.id)
    setActiveSpecId(String(row.spec_id || ""))
    const nextName = row.name || "未命名工作流"
    const nextDesc = String(row.description || "")
    const nextApproval = row.require_approval === true
    latestFieldsRef.current = { name: nextName, desc: nextDesc, requireApproval: nextApproval }
    setFlowName(nextName)
    setFlowDesc(nextDesc)
    setRequireApproval(nextApproval)
    const graph = row.graph || {}
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
    const edges = Array.isArray(graph.edges) ? graph.edges : []
    const cleanNodes = nodes.map((item) => ({ ...item, selected: false }))
    const cleanEdges = edges.map((item) => ({ ...item, selected: false }))
    nodesRef.current = cleanNodes
    edgesRef.current = cleanEdges
    setFlowNodes(cleanNodes)
    setFlowEdges(cleanEdges)
    setDirtyFlag(false)
    setActiveRun(null)
    setRunEvents([])
    setActiveRunId("")
    setLiveRunId("")
    resetHistory()
  }, [resetHistory])

  const loadWorkflowById = useCallback(
    async (wfId: string) => {
      try {
        const res = await fetch(`${base}/api/workflow-studio/get?id=${encodeURIComponent(wfId)}`, {
          headers: { ...vibexAuthHeaders() },
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return
        }
        if (!res.ok) {
          setErrorMsg("加载工作流失败，请稍后重试")
          return
        }
        const data = await res.json()
        if (data?.workflow?.id) applyWorkflowToCanvas(data.workflow)
      } catch {
        setErrorMsg("网络异常，加载工作流失败")
      }
    },
    [base, applyWorkflowToCanvas],
  )

  // 首次进入：加载列表 → 选中最近一条；一条都没有则自动建一个带开始节点的空白工作流
  const bootRef = useRef(false)
  useEffect(() => {
    if (!rhUserId || bootRef.current) return
    bootRef.current = true
    void (async () => {
      let items = await loadWorkflows()
      if (items.length === 0) {
        const newId = await createWorkflow("我的工作流")
        if (newId) {
          items = await loadWorkflows()
          const row = items.find((item) => item.id === newId)
          if (row) {
            await loadWorkflowById(row.id)
            return
          }
        }
      }
      // 双渠道对应批次：?wf=<id> 深链优先（从助手方案生成工作流后直接跳进来）
      const wfParam = new URLSearchParams(window.location.search).get("wf") || ""
      const wfTarget = wfParam ? items.find((item) => item.id === wfParam) : null
      if (wfTarget) {
        await loadWorkflowById(wfTarget.id)
        return
      }
      if (items.length > 0) await loadWorkflowById(items[0].id)
    })()
    void (async () => {
      try {
        const res = await fetch(`${base}/api/model-connections`, { headers: { ...vibexAuthHeaders() } })
        if (!res.ok) return
        const data = await res.json()
        const items = Array.isArray(data?.items)
          ? (data.items as { id: string; name: string; enabled: boolean; provider: string; models: string[] }[])
          : []
        const options: ModelOption[] = []
        for (const conn of items) {
          if (!conn.enabled) continue
          const providerLabel = PROVIDER_META[normalizeProvider(conn.provider)].shortLabel
          for (const modelId of conn.models || []) {
            options.push({
              value: `${CUSTOM_MODEL_PREFIX}${conn.id}:${modelId}`,
              label: modelId,
              hint: `${providerLabel} · 自定义 · ${conn.name}`,
            })
          }
        }
        setCustomModels(options)
      } catch {
        // 自定义模型加载失败不阻塞平台模型
      }
      try {
        const res = await fetch(`${base}/api/tool-connections`, { headers: { ...vibexAuthHeaders() } })
        if (!res.ok) return
        const data = await res.json()
        const items = Array.isArray(data?.items)
          ? (data.items as { name: string; description: string; enabled: boolean }[])
          : []
        setConnectedTools(
          items
            .filter((item) => item.enabled)
            .map((item) => ({
              value: item.name,
              label: item.name,
              hint: item.description || "外部工具连接",
            })),
        )
      } catch {
        // 工具连接加载失败不阻塞内置工具
      }
      try { setKnowledgeBases(await getKnowledgeBases()) } catch { setKnowledgeBases([]) }
      try {
        const res = await fetch(`${base}/api/agent_specs?rh_user_id=${encodeURIComponent(rhUserId)}`, {
          headers: { ...vibexAuthHeaders() },
        })
        if (res.ok) {
          const data = await res.json()
          const items = Array.isArray(data?.items) ? (data.items as { id: string; name: string }[]) : []
          setSpecOptions(items.map((item) => ({ id: item.id, name: item.name || "未命名方案" })))
        }
      } catch {
        // 方案列表加载失败不阻塞画布
      }
    })()
  }, [rhUserId, base, loadWorkflows, createWorkflow, loadWorkflowById])

  // 双渠道对应批次：从助手方案一键生成画布
  const [genFromSpecBusy, setGenFromSpecBusy] = useState(false)

  const handleGenerateFromSpec = useCallback(
    async (specId: string) => {
      if (!specId || genFromSpecBusy) return
      setGenFromSpecBusy(true)
      setErrorMsg("")
      try {
        // This workflow will be replaced by the generated one. Persist
        // existing edits first; if another edit arrives during save,
        // saveRef resolves false and prevents an unsafe switch.
        if (dirtyFlag && !(await saveRef.current(true))) {
          setErrorMsg("当前工作流仍有未保存修改。请先保存成功，再从 Agent 方案生成新工作流。")
          return
        }
        const res = await fetch(`${base}/api/workflow-studio/generate-from-spec`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: JSON.stringify({ spec_id: specId }),
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return
        }
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.id) {
          setErrorMsg(data?.message || "生成工作流失败，请稍后重试")
          return
        }
        await loadWorkflows()
        await loadWorkflowById(String(data.id))
      } catch {
        setErrorMsg("网络异常，生成工作流失败")
      } finally {
        setGenFromSpecBusy(false)
      }
    },
    [base, dirtyFlag, genFromSpecBusy, loadWorkflows, loadWorkflowById],
  )

  const loadRecentRuns = useCallback(
    async (wfId: string) => {
      if (!wfId) {
        setRecentRuns([])
        return
      }
      try {
        const res = await fetch(
          `${base}/api/workflow-runs/recent?workflow_id=${encodeURIComponent(wfId)}&limit=8`,
          { headers: { ...vibexAuthHeaders() } },
        )
        if (!res.ok) return
        const data = await res.json()
        setRecentRuns(Array.isArray(data?.items) ? (data.items as RecentRunRow[]) : [])
      } catch {
        // 历史加载失败不阻塞画布
      }
    },
    [base],
  )

  useEffect(() => {
    if (!rhUserId || !activeWorkflowId) return
    const controller = new AbortController()
    void fetch(
      `${base}/api/workflow-runs/recent?workflow_id=${encodeURIComponent(activeWorkflowId)}&limit=8`,
      {headers: {...vibexAuthHeaders()}, signal: controller.signal},
    )
      .then(async response => response.ok ? await response.json() : null)
      .then(data => {
        if (!controller.signal.aborted && data)
          setRecentRuns(Array.isArray(data.items) ? data.items as RecentRunRow[] : [])
      })
      .catch(() => { /* aborted or temporarily offline; preserve current view */ })
    return () => controller.abort()
  }, [rhUserId, activeWorkflowId, base])

  // ————— 画布操作 —————

  const selectedNode = useMemo(
    () => flowNodes.find((item) => item.selected) || null,
    [flowNodes],
  )
  const selectedEdge = useMemo(
    () => flowEdges.find((item) => item.selected) || null,
    [flowEdges],
  )

  const onNodesChange = useCallback((changes: NodeChange<WfNode>[]) => {
    const dragStarted = changes.some(item => item.type === "position" && item.dragging === true)
    const dragEnded = changes.some(item => item.type === "position" && item.dragging === false)
    const removing = changes.some(item => item.type === "remove")
    if (dragStarted && !dragSnapRef.current)
      dragSnapRef.current = cloneGraph(nodesRef.current, edgesRef.current)
    if (removing) pushHistory()
    const next = applyNodeChanges(changes, nodesRef.current)
    nodesRef.current = next
    setFlowNodes(next)
    if (removing) {
      const ids = new Set(next.map(n => n.id))
      const remaining = edgesRef.current.filter(e => ids.has(e.source) && ids.has(e.target))
      edgesRef.current = remaining
      setFlowEdges(remaining)
      setDirtyFlag(true)
    }
    if (dragEnded && dragSnapRef.current) {
      const snap = dragSnapRef.current
      dragSnapRef.current = null
      // Dragging larger graphs should not do a nested node lookup for every
      // previous node on the last pointer event.
      const currentPositions = new Map(next.map(n => [n.id, n.position]))
      const moved = snap.nodes.some(item => {
        const pos = currentPositions.get(item.id)
        return !pos || pos.x !== item.position.x || pos.y !== item.position.y
      })
      if (moved) {
        commitSnapshot(snap)
        setDirtyFlag(true)
      }
    }
  }, [commitSnapshot, pushHistory])

  const onEdgesChange = useCallback((changes: EdgeChange<WfEdge>[]) => {
    if (changes.some(item => item.type === "remove")) pushHistory()
    const next = applyEdgeChanges(changes, edgesRef.current)
    edgesRef.current = next
    setFlowEdges(next)
    if (changes.some(item => item.type === "remove")) setDirtyFlag(true)
  }, [pushHistory])

  const loopBodies = useMemo(() => computeLoopBodies(flowNodes, flowEdges), [flowNodes, flowEdges])
  const workflowDiagnostics = useMemo(
    () => inspectWorkflowGraph(flowNodes, flowEdges),
    [flowNodes, flowEdges],
  )

  const connectionIssue = useCallback(
    (conn: Connection): string | null =>
      workflowConnectionIssue({ nodes: nodesRef.current, edges: edgesRef.current }, conn),
    [],
  )
  const isValidConnection = useCallback((conn: Connection) => !connectionIssue(conn), [connectionIssue])
  const explainInvalidConnection = useCallback((conn: Connection) => {
    const reason = connectionIssue(conn)
    if (reason) setErrorMsg(reason)
  }, [connectionIssue])

  const handleConnect = useCallback(
    (conn: Connection) => {
      const reason = connectionIssue(conn)
      if (reason) {
        setErrorMsg(reason)
        return
      }
      pushHistory()
      const edges = addEdge({
        ...conn,
        id: `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        style: {
          stroke: conn.sourceHandle === "false" || conn.sourceHandle === "done"
            ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))",
          strokeWidth: 2.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: conn.sourceHandle === "false" || conn.sourceHandle === "done"
            ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))",
        },
      }, edgesRef.current)
      edgesRef.current = edges
      setFlowEdges(edges)
      setDirtyFlag(true)
      setErrorMsg("")
    },
    [connectionIssue, pushHistory],
  )

  const uniqueTitle = useCallback(
    (type: WfNodeType, nodes: WfNode[]) => {
      const baseLabel = NODE_TYPE_META[type].label
      const used = new Set(nodes.map((item) => String(item.data?.title || "")))
      if (!used.has(baseLabel)) return baseLabel
      let idx = 2
      while (used.has(`${baseLabel} ${idx}`)) idx++
      return `${baseLabel} ${idx}`
    },
    [],
  )

  const addNodeByType = useCallback(
    (type: WfNodeType, position?: XYPosition) => {
      const nds = nodesRef.current
      if (!(type in NODE_TYPE_META)) {
        setErrorMsg("不支持的节点类型")
        return null
      }
      if (nds.length >= MAX_WORKFLOW_NODES) {
        setErrorMsg("单个工作流最多40个节点")
        return null
      }
      if (type === "start" && nds.some((item) => item.type === "start")) {
        setErrorMsg("一个工作流只能有一个开始节点")
        return null
      }
      const title = uniqueTitle(type, nds)
      const pos = findAvailableNodePosition(nds, position || {
        x: 120 + (nds.length % 6) * 60,
        y: 100 + (nds.length % 5) * 80,
      })
      const next: WfNode = {
        id: makeNodeId(type),
        type,
        position: pos,
        data: defaultNodeData(type, title),
        selected: true,
      }
      pushHistory()
      const nodes = [...nds.map((item) => ({ ...item, selected: false })), next]
      nodesRef.current = nodes
      setFlowNodes(nodes)
      setDirtyFlag(true)
      return next.id
    },
    [uniqueTitle, pushHistory],
  )

  const updateNodeData = useCallback(
    (patch: Partial<WfNodeData>) => {
      if (!selectedNode) return
      if (patch.title !== undefined) {
        const trimmed = String(patch.title || "").trim().slice(0, 30)
        if (!trimmed) {
          setErrorMsg("节点标题不能为空")
          return
        }
        const clash = flowNodes.some(
          (item) => item.id !== selectedNode.id && String(item.data?.title || "") === trimmed,
        )
        if (clash) {
          setErrorMsg(`已有节点叫「${trimmed}」，标题需要唯一（变量引用靠它定位）`)
          return
        }
        patch = { ...patch, title: trimmed }
      }
      // 原子更新本节点及引用它的其他节点，避免改名后 {{旧标题.output}} 失效。
      pushHistory(`node:${selectedNode.id}`)
      const titleBefore = String(selectedNode.data.title || "")
      const nodes = patch.title !== undefined
        ? renameNodeReferences(nodesRef.current, titleBefore, String(patch.title))
        : nodesRef.current
      const updated = nodes.map(item => item.id === selectedNode.id
        ? { ...item, data: { ...item.data, ...patch } } : item)
      nodesRef.current = updated
      setFlowNodes(updated)
      setDirtyFlag(true)
      setErrorMsg("")
    },
    [selectedNode, flowNodes, pushHistory],
  )

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return
    if (selectedNode.type === "start") {
      setErrorMsg("开始节点不能删除（可以删掉整个工作流）")
      return
    }
    const removeId = selectedNode.id
    pushHistory()
    const nodes = nodesRef.current.filter(item => item.id !== removeId)
    const edges = edgesRef.current.filter(item => item.source !== removeId && item.target !== removeId)
    nodesRef.current = nodes
    edgesRef.current = edges
    setFlowNodes(nodes)
    setFlowEdges(edges)
    setDirtyFlag(true)
  }, [selectedNode, pushHistory])

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) return
    const removeId = selectedEdge.id
    pushHistory()
    const edges = edgesRef.current.filter(item => item.id !== removeId)
    edgesRef.current = edges
    setFlowEdges(edges)
    setDirtyFlag(true)
  }, [selectedEdge, pushHistory])

  const clearSelection = useCallback(() => {
    const nodes = nodesRef.current.map(item => item.selected ? { ...item, selected: false } : item)
    const edges = edgesRef.current.map(item => item.selected ? { ...item, selected: false } : item)
    nodesRef.current = nodes
    edgesRef.current = edges
    setFlowNodes(nodes)
    setFlowEdges(edges)
  }, [])

  // 双击节点 = 打开配置：选中该节点，并在全屏模式自动展开右侧抽屉
  const openNodeConfig = useCallback((nodeId: string) => {
    const nodes = nodesRef.current.map(item => ({...item, selected:item.id === nodeId}))
    const edges = edgesRef.current.map(item => item.selected ? {...item, selected:false} : item)
    nodesRef.current = nodes
    edgesRef.current = edges
    setFlowNodes(nodes)
    setFlowEdges(edges)
    setFocusLeftOpen(false)
    setFocusRightOpen(true)
  }, [])

  // 连线 hover 删除按钮：按 id 删除并入撤销栈
  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      if (!edgeId) return
      if (!edgesRef.current.some((item) => item.id === edgeId)) return
      pushHistory()
      setFlowEdges((eds) => eds.filter((item) => item.id !== edgeId))
      setDirtyFlag(true)
    },
    [pushHistory],
  )


  // ————— 高效率编辑：原子添加连线、内部复制、多选布局、示例与安全导入导出 —————

  /** One mutation and one undo entry: never connect against stale React-rendered nodes. */
  const addNodeAndConnect = useCallback((
    type: WfNodeType, position: XYPosition,
    from: { source: string; sourceHandle: string | null },
  ): string | null => {
    const oldNodes = nodesRef.current
    const oldEdges = edgesRef.current
    if (!(type in NODE_TYPE_META)) {
      setErrorMsg("不支持的节点类型")
      return null
    }
    const src = oldNodes.find(n => n.id === from.source)
    if (!src) {
      setErrorMsg("源节点不存在，请重新连接")
      return null
    }
    const id = makeNodeId(type)
    const next: WfNode = {
      id, type, position,
      data: defaultNodeData(type, uniqueTitle(type, oldNodes)),
      selected: true,
    }
    const color = from.sourceHandle === "false" || from.sourceHandle === "done"
      ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"
    const edge: WfEdge = {
      id: makeNodeId("model") + "-edge", source: src.id, target: id,
      sourceHandle: from.sourceHandle,
      style: { stroke: color, strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
    try {
      const { nodes, edges } = insertConnectedNode({nodes: oldNodes, edges: oldEdges}, next, edge)
      pushHistory()
      nodesRef.current = nodes
      edgesRef.current = edges
      setFlowNodes(nodes)
      setFlowEdges(edges)
      setDirtyFlag(true)
      setErrorMsg("")
      return id
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "创建节点失败")
      return null
    }
  }, [pushHistory, uniqueTitle])

  const clipboardRef = useRef<GraphFragment | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)
  const copySelection = useCallback((onlyNodeId?: string) => {
    const picked = selectedFragment(nodesRef.current, edgesRef.current, onlyNodeId)
    if (!picked.nodes.length) {
      setErrorMsg("请选择要复制的普通节点；开始节点不能复制")
      return
    }
    clipboardRef.current = picked
    setHasClipboard(true)
    setErrorMsg("")
  }, [])
  const pasteIntoGraph = useCallback((fragment: GraphFragment, position?: XYPosition) => {
    try {
      const items = pasteFragment(fragment, nodesRef.current, makeNodeId, position)
      if (!items.nodes.length) return
      if (nodesRef.current.length + items.nodes.length > MAX_WORKFLOW_NODES ||
          edgesRef.current.length + items.edges.length > 240) {
        setErrorMsg("当前工作流上限为40节点、240连线")
        return
      }
      pushHistory()
      const nodes = [...nodesRef.current.map(n => ({ ...n, selected: false })), ...items.nodes]
      const edges = [...edgesRef.current, ...items.edges.map(e => {
        const color = e.sourceHandle === "false" || e.sourceHandle === "done"
          ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"
        return { ...e, style: { stroke: color, strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color } }
      })]
      nodesRef.current = nodes
      edgesRef.current = edges
      setFlowNodes(nodes)
      setFlowEdges(edges)
      setDirtyFlag(true)
      setErrorMsg("")
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "粘贴失败")
    }
  }, [pushHistory])
  const pasteClipboard = useCallback((position?: XYPosition) => {
    if (clipboardRef.current) pasteIntoGraph(clipboardRef.current, position)
  }, [pasteIntoGraph])
  const selectAll = useCallback(() => {
    const nodes = nodesRef.current.map(n => ({ ...n, selected: true }))
    const edges = edgesRef.current.map(e => ({ ...e, selected: false }))
    nodesRef.current = nodes
    edgesRef.current = edges
    setFlowNodes(nodes)
    setFlowEdges(edges)
  }, [])
  const deleteSelection = useCallback((nodeId?: string) => {
    const toDelete = new Set(
      nodesRef.current.filter(n => n.type !== "start" && (nodeId ? n.id === nodeId : n.selected))
        .map(n => n.id),
    )
    const selectedEdges = new Set(edgesRef.current.filter(e => !nodeId && e.selected).map(e => e.id))
    if (!toDelete.size && !selectedEdges.size) return
    pushHistory()
    const nodes = nodesRef.current.filter(n => !toDelete.has(n.id))
    const edges = edgesRef.current.filter(e =>
      !toDelete.has(e.source) && !toDelete.has(e.target) && !selectedEdges.has(e.id),
    )
    nodesRef.current = nodes
    edgesRef.current = edges
    setFlowNodes(nodes)
    setFlowEdges(edges)
    setDirtyFlag(true)
    if (nodesRef.current.some(n => n.selected && n.type === "start"))
      setErrorMsg("开始节点已保留，不能删除")
    else setErrorMsg("")
  }, [pushHistory])
  const duplicateNodeById = useCallback((nodeId: string) => {
    const fragment = selectedFragment(nodesRef.current, edgesRef.current, nodeId)
    if (!fragment.nodes.length) { setErrorMsg("开始节点不能创建副本"); return }
    pasteIntoGraph(fragment)
  }, [pasteIntoGraph])
  const duplicateSelection = useCallback(() => {
    const fragment = selectedFragment(nodesRef.current, edgesRef.current)
    if (!fragment.nodes.length) { setErrorMsg("请选择需要创建副本的节点"); return }
    pasteIntoGraph(fragment)
  }, [pasteIntoGraph])
  const alignSelected = useCallback((mode: AlignMode) => {
    const nodes = nodesRef.current
    const aligned = alignNodes(nodes, mode)
    if (aligned === nodes) {
      setErrorMsg(mode.startsWith("distribute") ? "等距分布需要选中至少3个节点" : "请选择至少2个节点")
      return
    }
    pushHistory()
    nodesRef.current = aligned
    setFlowNodes(aligned)
    setDirtyFlag(true)
    setErrorMsg("")
  }, [pushHistory])
  const loadSampleGraph = useCallback((kind: "basic" | "branch") => {
    const originals = nodesRef.current
    if (originals.some(n => n.type !== "start") || originals.length > 1 || edgesRef.current.length) {
      setErrorMsg("示例只可放入仅包含开始节点的空白工作流；请新建工作流后重试")
      return
    }
    const start = { ...(originals[0] || freshGraph().nodes[0]), position: { x: 60, y: 200 }, selected: false }
    const make = (type: WfNodeType, title: string, x: number, y: number, data: Partial<WfNodeData> = {}): WfNode =>
      ({ id: makeNodeId(type), type, position: { x, y }, data: { ...defaultNodeData(type, title), ...data } })
    const model = make("model", "生成回答", 340, 200, { prompt: "{{input}}" })
    const end = make("end", "结束", kind === "basic" ? 650 : 1170, 200)
    const nodes: WfNode[] = kind === "basic"
      ? [start, model, end]
      : [start, model,
          make("condition", "内容判断", 610, 200, { ref_title: model.data.title, op: "contains", value: "合格" }),
          make("model", "符合条件", 875, 90, { prompt: "{{生成回答.output}}" }),
          make("model", "需要修改", 875, 330, { prompt: "{{生成回答.output}}" }),
          end]
    const link = (a: WfNode, b: WfNode, handle: string | null = null): WfEdge => {
      const color = handle === "false" ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"
      return { id: makeNodeId("model") + "-edge", source: a.id, target: b.id,
        sourceHandle: handle, style: { stroke: color, strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color } }
    }
    const edges: WfEdge[] = kind === "basic"
      ? [link(start, model), link(model, end)]
      : [link(nodes[0], nodes[1]), link(nodes[1], nodes[2]),
          link(nodes[2], nodes[3], "true"), link(nodes[2], nodes[4], "false"),
          link(nodes[3], end), link(nodes[4], end)]
    pushHistory()
    nodesRef.current = nodes
    edgesRef.current = edges
    setFlowNodes(nodes)
    setFlowEdges(edges)
    setDirtyFlag(true)
    setErrorMsg("")
  }, [pushHistory])

  const exportActiveFlow = useCallback(async () => {
    if (!activeWorkflowId) { setErrorMsg("请先保存工作流"); return }
    try {
      const payload = exportWorkflowJson(flowName || "未命名工作流", flowDesc,
        { nodes: nodesRef.current, edges: edgesRef.current })
      if (!await confirmInStudio("导出包含工作流提示词与参数内容（不含模型密钥或绑定 ID）。请先确认文本中未手写凭据或敏感资料；是否导出？")) return
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }))
      const a = document.createElement("a")
      a.href = url
      a.download = (flowName || "workflow").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 50) + ".json"
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "导出失败")
    }
  }, [activeWorkflowId, flowName, flowDesc])

  const importFlowFile = useCallback(async (file: File) => {
    if (file.size > 512 * 1024) { setErrorMsg("导入文件最大512KB"); return }
    if (dirtyFlag && !await confirmInStudio("当前工作流还有未保存修改。导入将切换至新工作流，确定继续？")) return
    try {
      const parsed = parseWorkflowJson(await file.text())
      // New graph IDs, never accept IDs or access bindings from the exporting user's system.
      const map = new Map(parsed.graph.nodes.map(n => [n.id, makeNodeId(n.type as WfNodeType)]))
      const nodes = parsed.graph.nodes.map(n => ({ ...n, id: map.get(n.id)!, selected: false }))
      const edges = parsed.graph.edges.map(e => {
        const color = e.sourceHandle === "false" || e.sourceHandle === "done"
          ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"
        return { ...e, id: makeNodeId("model") + "-edge",
          source: map.get(e.source)!, target: map.get(e.target)!,
          style: { stroke: color, strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color } }
      })
      const response = await fetch(`${base}/api/workflow-studio/create`, {
        method: "POST", headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({ name: parsed.name + "（导入）",
          description: parsed.description, graph: serializeGraph(nodes, edges) }),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(String(detail.message || "服务器拒绝导入"))
      }
      const result = await response.json() as { id?: string }
      if (!result.id) throw new Error("服务器没有返回新工作流 ID")
      await loadWorkflows()
      await loadWorkflowById(result.id)
      setErrorMsg("")
      setNoticeMsg("导入成功：已创建独立工作流。模型、Agent 和工具连接未继承；请重新配置、试跑后再发布。")
    } catch (error) {
      setErrorMsg("导入失败：" + (error instanceof Error ? error.message : "文件错误"))
    }
  }, [base, dirtyFlag, loadWorkflows, loadWorkflowById])

  // Clipboard shortcuts affect the canvas only. They must not hijack Ctrl+A
  // elsewhere in the employee app or delete selected nodes from another panel.
  const canvasShortcutFocusRef = useRef(false)
  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      canvasShortcutFocusRef.current = event.target instanceof Element &&
        Boolean(event.target.closest(".react-flow, [data-workflow-editor-popup]"))
    }
    document.addEventListener("pointerdown", trackPointer, true)
    return () => document.removeEventListener("pointerdown", trackPointer, true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (runDialogOpen || deleteTargetId) return
      const target = e.target as HTMLElement | null
      if (!canvasShortcutFocusRef.current &&
          !document.activeElement?.closest(".react-flow, [data-workflow-editor-popup]")) return
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return
      if (window.getSelection()?.toString()) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === "c") { e.preventDefault(); copySelection() }
      else if (key === "v" && clipboardRef.current) { e.preventDefault(); pasteClipboard() }
      else if (key === "d") { e.preventDefault(); duplicateSelection() }
      else if (key === "a") { e.preventDefault(); selectAll() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [copySelection, pasteClipboard, duplicateSelection, selectAll, runDialogOpen, deleteTargetId])

  // Delete / Backspace supports multi-select in one undoable graph transaction.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return
      if (runDialogOpen || deleteTargetId) return
      if (!canvasShortcutFocusRef.current &&
          !document.activeElement?.closest(".react-flow, [data-workflow-editor-popup]")) return
      if (!nodesRef.current.some(n => n.selected && n.type !== "start") &&
          !edgesRef.current.some(e => e.selected)) return
      event.preventDefault()
      deleteSelection()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [deleteSelection, runDialogOpen, deleteTargetId])

  // 自动整理：拓扑 BFS 分层布局（同层纵向等距、层间横向等距），压一步撤销栈
  const autoArrange = useCallback(() => {
    const nds = nodesRef.current
    const eds = edgesRef.current
    if (nds.length === 0) return
    const adj: Record<string, string[]> = {}
    const inDeg: Record<string, number> = {}
    for (const nd of nds) {
      adj[nd.id] = []
      inDeg[nd.id] = 0
    }
    for (const ed of eds) {
      if (!adj[ed.source] || inDeg[ed.target] === undefined) continue
      adj[ed.source].push(ed.target)
      inDeg[ed.target] += 1
    }
    const layerOf: Record<string, number> = {}
    const queue: string[] = nds.filter((nd) => inDeg[nd.id] === 0).map((nd) => nd.id)
    if (queue.length === 0) {
      const startNode = nds.find((nd) => nd.type === "start")
      if (startNode) queue.push(startNode.id)
    }
    for (const id of queue) layerOf[id] = 0
    while (queue.length > 0) {
      const cur = String(queue.shift())
      for (const next of adj[cur] || []) {
        if (layerOf[next] === undefined) {
          layerOf[next] = (layerOf[cur] || 0) + 1
          queue.push(next)
        }
      }
    }
    let maxLayer = 0
    for (const key of Object.keys(layerOf)) maxLayer = Math.max(maxLayer, layerOf[key])
    const layers: Record<number, string[]> = {}
    for (const nd of nds) {
      const layerIdx = layerOf[nd.id] !== undefined ? layerOf[nd.id] : maxLayer + 1
      if (!layers[layerIdx]) layers[layerIdx] = []
      layers[layerIdx].push(nd.id)
    }
    pushHistory()
    const arranged = nds.map(nd => {
      const layerIdx = layerOf[nd.id] !== undefined ? layerOf[nd.id] : maxLayer + 1
      const rowIdx = Math.max(0, (layers[layerIdx] || []).indexOf(nd.id))
      return { ...nd, position: { x: 60 + layerIdx * 300, y: 60 + rowIdx * 150 } }
    })
    nodesRef.current = arranged
    setFlowNodes(arranged)
    setDirtyFlag(true)
    setErrorMsg("")
  }, [pushHistory])

  // 全屏专注模式与运行跟随
  const enterFocusMode = useCallback(() => {
    setFocusLeftOpen(false)
    setFocusRightOpen(false)
    setIsFocusMode(true)
  }, [])
  const exitFocusMode = useCallback(() => setIsFocusMode(false), [])
  const toggleFocusLeft = useCallback(() => {
    setFocusLeftOpen(v => !v)
    setFocusRightOpen(false)
  }, [])
  const toggleFocusRight = useCallback(() => {
    setFocusRightOpen(v => !v)
    setFocusLeftOpen(false)
  }, [])
  const closeFocusPanels = useCallback(() => {
    setFocusLeftOpen(false)
    setFocusRightOpen(false)
  }, [])
  const toggleFollowRun = useCallback(() => setFollowRun((v) => !v), [])
  const noteUserPan = useCallback(() => setFollowRun(false), [])

  const availableVariables = useMemo(() => {
    const titles = flowNodes
      .filter((item) => item.type !== "start" && item.type !== "end")
      .map((item) => `${String(item.data?.title || "")}.output`)
    return ["input", ...titles.filter((item) => item !== ".output")]
  }, [flowNodes])

  // Click-to-insert chips only show reachable predecessors; explicit references
  // to other nodes remain visible in diagnostics rather than silently accepted.
  const selectedNodeVariables = useMemo(() => {
    if (!selectedNode) return availableVariables
    return suggestedVariablesForNode({nodes:flowNodes, edges:flowEdges}, selectedNode.id)
  }, [availableVariables, selectedNode, flowNodes, flowEdges])

  // ————— 保存 / 列表操作 —————

  const saveWorkflow = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!activeWorkflowId || savingRef.current) return false
      savingRef.current = true
      setSavingFlow(true)
      const fields = { ...latestFieldsRef.current }
      const graph = serializeGraph(nodesRef.current, edgesRef.current)
      const graphSignature = JSON.stringify(graph)
      const requestedName = fields.name.trim() || "未命名工作流"
      try {
        const res = await fetch(`${base}/api/workflow-studio/update`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: JSON.stringify({
            id: activeWorkflowId,
            name: requestedName,
            description: fields.desc,
            require_approval: fields.requireApproval,
            graph,
          }),
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return false
        }
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          if (!silent) setErrorMsg(data?.message || "保存失败，请稍后重试")
          return false
        }
        const current = latestFieldsRef.current
        const unchanged = current.name.trim() === requestedName &&
          current.desc === fields.desc && current.requireApproval === fields.requireApproval &&
          JSON.stringify(serializeGraph(nodesRef.current, edgesRef.current)) === graphSignature
        setDirtyFlag(!unchanged)
        setLastSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }))
        if (!unchanged && !silent) setNoticeMsg("保存期间又进行了修改，新改动尚未保存，请再次保存")
        void loadWorkflows()
        return unchanged
      } catch {
        if (!silent) setErrorMsg("网络异常，保存失败")
        return false
      } finally {
        setSavingFlow(false)
        savingRef.current = false
      }
    },
    [activeWorkflowId, base, loadWorkflows],
  )
  useLayoutEffect(() => {
    saveRef.current = saveWorkflow
  }, [saveWorkflow])

  // 「写操作需我确认」开关：立即 PATCH 落库（不依赖画布保存），失败回滚
  const toggleRequireApproval = useCallback(async () => {
    if (!activeWorkflowId) return
    const prevVal = requireApproval
    const nextVal = !prevVal
    latestFieldsRef.current.requireApproval = nextVal
    setRequireApproval(nextVal)
    try {
      const res = await fetch(`${base}/api/workflow-studio/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({ id: activeWorkflowId, require_approval: nextVal }),
      })
      if (res.status === 401 || res.status === 412) {
        latestFieldsRef.current.requireApproval = prevVal
        setRequireApproval(prevVal)
        setNeedsRhLogin(true)
        return
      }
      if (!res.ok) {
        latestFieldsRef.current.requireApproval = prevVal
        setRequireApproval(prevVal)
        setErrorMsg("更新审批开关失败，请稍后重试")
        return
      }
      void loadWorkflows()
    } catch {
      latestFieldsRef.current.requireApproval = prevVal
      setRequireApproval(prevVal)
      setErrorMsg("网络异常，更新审批开关失败")
    }
  }, [activeWorkflowId, requireApproval, base, loadWorkflows])

  const handleSelectWorkflow = useCallback(
    async (wfId: string) => {
      if (wfId === activeWorkflowId) return
      if (dirtyFlag) {
        const okSaved = await saveWorkflow(true)
        if (!okSaved) {
          setErrorMsg("当前工作流尚未保存成功，请先保存再切换")
          return
        }
      }
      await loadWorkflowById(wfId)
    },
    [activeWorkflowId, dirtyFlag, saveWorkflow, loadWorkflowById],
  )

  const handleCreateWorkflow = useCallback(async () => {
    if (dirtyFlag && !(await saveWorkflow(true))) {
      setErrorMsg("当前工作流尚未保存成功，请先保存再新建")
      return
    }
    const newId = await createWorkflow(`工作流 ${workflows.length + 1}`)
    if (!newId) return
    await loadWorkflows()
    await loadWorkflowById(newId)
  }, [dirtyFlag, saveWorkflow, createWorkflow, workflows.length, loadWorkflows, loadWorkflowById])

  const handleDuplicateWorkflow = useCallback(
    async (wfId: string) => {
      if (dirtyFlag && !(await saveWorkflow(true))) {
        setErrorMsg("当前工作流尚未保存成功，请先保存再复制")
        return
      }
      try {
        const res = await fetch(`${base}/api/workflow-studio/duplicate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: JSON.stringify({ id: wfId }),
        })
        if (!res.ok) {
          setErrorMsg("复制失败，请稍后重试")
          return
        }
        const data = await res.json().catch(() => null)
        await loadWorkflows()
        if (data?.id) await loadWorkflowById(String(data.id))
      } catch {
        setErrorMsg("网络异常，复制失败")
      }
    },
    [base, dirtyFlag, saveWorkflow, loadWorkflows, loadWorkflowById],
  )

  const requestDeleteWorkflow = useCallback((wfId: string) => setDeleteTargetId(wfId), [])
  const cancelDelete = useCallback(() => setDeleteTargetId(""), [])

  const confirmDelete = useCallback(async () => {
    const wfId = deleteTargetId
    if (!wfId) return
    try {
      const res = await fetch(`${base}/api/workflow-studio/delete?id=${encodeURIComponent(wfId)}`, {
        method: "DELETE",
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (!res.ok) {
        setErrorMsg("删除失败，请稍后重试")
        return
      }
      setDeleteTargetId("")
      const items = await loadWorkflows()
      if (wfId === activeWorkflowId) {
        if (items.length > 0) {
          const nextRow = items.find((item) => item.id !== wfId)
          if (nextRow) await loadWorkflowById(nextRow.id)
        } else {
          const newId = await createWorkflow("我的工作流")
          await loadWorkflows()
          if (newId) await loadWorkflowById(newId)
        }
      }
    } catch {
      setErrorMsg("网络异常，删除失败")
    }
  }, [deleteTargetId, base, loadWorkflows, activeWorkflowId, loadWorkflowById, createWorkflow])

  // ————— 运行 —————

  const fetchRunDetail = useCallback(
    async (runId: string, signal?: AbortSignal): Promise<RunDetailRow | null> => {
      try {
        const res = await fetch(`${base}/api/workflow-runs/${encodeURIComponent(runId)}/detail`, {
          headers: { ...vibexAuthHeaders() },
          signal,
        })
        if (signal?.aborted) return null
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return null
        }
        if (!res.ok) return null
        const data = await res.json()
        if (signal?.aborted) return null
        const run = data?.run as RunDetailRow | undefined
        if (!run?.id) return null
        setActiveRun(run)
        setRunEvents(Array.isArray(data?.events) ? (data.events as WfEventRow[]) : [])
        return run
      } catch {
        return null
      }
    },
    [base],
  )

  const validateGraphForRun = useCallback((): string => {
    if (flowNodes.length === 0) return "画布还是空的，先从左侧加一个开始节点"
    const startNodes = flowNodes.filter((item) => item.type === "start")
    if (startNodes.length !== 1) return "工作流必须有且仅有一个开始节点"
    if (!flowNodes.some((item) => item.type === "end")) return "至少需要一个结束节点"
    const titles = flowNodes.map((item) => String(item.data?.title || "").trim())
    if (titles.some((item) => !item)) return "有节点还没填标题"
    if (new Set(titles).size !== titles.length) return "节点标题需要唯一（变量引用靠它定位）"
    for (const item of flowNodes) {
      if (item.type === "model" && !String(item.data?.model || "")) return `模型节点「${item.data?.title}」还没选模型`
      if (item.type === "tool" && !String(item.data?.tool || "")) return `工具节点「${item.data?.title}」还没选工具`
    }
    if (startNodes[0] && !flowEdges.some((ed) => ed.source === startNodes[0].id)) {
      return "开始节点还没有连接任何后续节点"
    }
    for (const item of flowNodes) {
      if (item.type !== "loop") continue
      const loopTitle = String(item.data?.title || "循环")
      const bodyEdges = flowEdges.filter(
        (ed) => ed.source === item.id && String(ed.sourceHandle || "") !== "done",
      )
      const doneEdges = flowEdges.filter((ed) => ed.source === item.id && ed.sourceHandle === "done")
      if (bodyEdges.length === 0) return `循环节点「${loopTitle}」的循环体出口还没有连线`
      if (doneEdges.length === 0) return `循环节点「${loopTitle}」的退出出口还没有连线`
      if (!reachesTarget(flowEdges, bodyEdges.map((ed) => ed.target), item.id)) {
        return `循环节点「${loopTitle}」的循环体缺少回边：请把循环体末端连回该循环节点`
      }
      for (const bodyId of loopBodies[item.id] || new Set<string>()) {
        const bodyNode = flowNodes.find((nd) => nd.id === bodyId)
        if (bodyNode && (bodyNode.type === "start" || bodyNode.type === "end")) {
          return `循环节点「${loopTitle}」的循环体内不能包含开始 / 结束节点`
        }
      }
      const loopMode = String(item.data?.mode || "count")
      if (loopMode === "count") {
        const countVal = parseInt(String(item.data?.count ?? ""), 10)
        if (!Number.isFinite(countVal) || countVal < 1) return `循环节点「${loopTitle}」的循环次数需为大于等于 1 的整数`
      } else if (!String(item.data?.list_source || "").trim()) {
        return `循环节点「${loopTitle}」还没有选择列表来源`
      }
      const maxIterRaw = String(item.data?.max_iterations ?? "")
      if (maxIterRaw !== "") {
        const maxIter = parseInt(maxIterRaw, 10)
        if (!Number.isFinite(maxIter) || maxIter < 1 || maxIter > 20) {
          return `循环节点「${loopTitle}」的最大轮数需为 1-20 的整数`
        }
      }
    }
    return workflowDiagnostics.find(issue => issue.severity === "error")?.message || ""
  }, [flowNodes, flowEdges, loopBodies, workflowDiagnostics])

  const doStartRun = useCallback(async () => {
    if (!activeWorkflowId || isStarting) return
    setIsStarting(true)
    setFollowRun(true)
    setErrorMsg("")
    try {
      const res = await fetch(`${base}/api/workflow-runs/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({ workflow_id: activeWorkflowId, instruction: runInstruction.trim().slice(0, 2000) }),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再运行")
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.run_id) {
        setErrorMsg(data?.message || "启动运行失败，请稍后重试")
        return
      }
      const runId = String(data.run_id)
      setActiveRunId(runId)
      setLiveRunId(runId)
      setRunDialogOpen(false)
      await fetchRunDetail(runId)
    } catch {
      setErrorMsg("网络异常，启动运行失败")
    } finally {
      setIsStarting(false)
    }
  }, [activeWorkflowId, base, isStarting, runInstruction, fetchRunDetail])

  const openRunDialog = useCallback(async () => {
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    if (liveRunId && (activeRun?.status === "running" || activeRun?.status === "awaiting_approval")) {
      setErrorMsg("当前还有运行中的任务，先取消或等它结束")
      return
    }
    const invalidMsg = validateGraphForRun()
    if (invalidMsg) {
      setErrorMsg(invalidMsg)
      return
    }
    setErrorMsg("")
    if (dirtyFlag) {
      const okSaved = await saveWorkflow(true)
      if (!okSaved) {
        setErrorMsg("保存失败，请先修复问题再运行")
        return
      }
    }
    setRunInstruction("")
    setRunDialogOpen(true)
  }, [rhUserId, liveRunId, activeRun, validateGraphForRun, dirtyFlag, saveWorkflow])

  const closeRunDialog = useCallback(() => setRunDialogOpen(false), [])

  const handleRunSubmit = useCallback(() => {
    if (!runInstruction.trim()) {
      setErrorMsg("请填写本次任务指令（会注入 {{input}} 变量）")
      return
    }
    // 自备密钥批次：模型调用全部走用户的模型连接，无平台计费，直接启动
    void doStartRun()
  }, [runInstruction, doStartRun])

  const handleCancelRun = useCallback(async () => {
    if (!activeRunId || cancelBusy || activeRun?.checkpoint?.cancel_requested === true) return
    setCancelBusy(true)
    try {
      const res = await fetch(`${base}/api/workflow-runs/${encodeURIComponent(activeRunId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: "{}",
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.message || "取消失败，请稍后重试")
        return
      }
      await fetchRunDetail(activeRunId)
      void loadRecentRuns(activeWorkflowId)
    } catch {
      setErrorMsg("网络异常，取消失败")
    } finally {
      setCancelBusy(false)
    }
  }, [activeRunId, activeRun, cancelBusy, base, fetchRunDetail, loadRecentRuns, activeWorkflowId])

  const handleViewRun = useCallback(
    async (runId: string) => {
      setActiveRunId(runId)
      await fetchRunDetail(runId)
    },
    [fetchRunDetail],
  )

  // 审批门：批准 / 拒绝当前 awaiting_approval 运行里待执行的工具节点调用
  const decideApproval = useCallback(
    async (decision: "approve" | "reject") => {
      const runId = activeRunId
      if (!runId || wfApprovalBusy) return
      setWfApprovalBusy(true)
      try {
        const res = await fetch(`${base}/api/workflow-runs/${encodeURIComponent(runId)}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: JSON.stringify({ decision }),
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          setErrorMsg("登录态已过期，请重新登录后再处理审批")
          return
        }
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setErrorMsg(data?.message || "审批处理失败，请稍后重试")
          return
        }
        await fetchRunDetail(runId)
      } catch {
        setErrorMsg("网络异常，审批处理失败")
      } finally {
        setWfApprovalBusy(false)
      }
    },
    [activeRunId, wfApprovalBusy, base, fetchRunDetail],
  )

  const exitRunView = useCallback(() => {
    setActiveRunId("")
    setActiveRun(null)
    setRunEvents([])
  }, [])

  // 轮询：running / awaiting_approval 态每 3s 拉详情；仅 running 态驱动一步 tick（等待批准时只拉不推）；终态自停
  const runStatus = activeRun?.status || ""
  const pollOnce = useCallback(
    async (runId: string) => {
      if (pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        const fresh = await fetchRunDetail(runId)
        if (fresh && TERMINAL_STATES.includes(fresh.status)) {
          setLiveRunId("")
          void loadRecentRuns(activeWorkflowId)
        } else if (fresh && fresh.status === "running" && !tickInFlightRef.current) {
          tickInFlightRef.current = true
          void tickWorkflowRun(runId).finally(() => {
            tickInFlightRef.current = false
          })
        }
      } finally {
        pollBusyRef.current = false
      }
    },
    [fetchRunDetail, loadRecentRuns, activeWorkflowId],
  )

  useEffect(() => {
    if (!activeRunId || !activeRun || activeRun.id !== activeRunId) return
    if (activeRun.status !== "running" && activeRun.status !== "awaiting_approval") return
    void pollOnce(activeRunId)
    const timer = window.setInterval(() => {
      void pollOnce(activeRunId)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId, activeRun?.status, pollOnce])

  // 首次加载运行详情，切换工作流时取消过时请求，防止旧响应覆盖新运行。
  useEffect(() => {
    if (!activeRunId || activeRun?.id === activeRunId) return
    const controller = new AbortController()
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return fetchRunDetail(activeRunId, controller.signal)
    })
    return () => controller.abort()
  }, [activeRunId, activeRun?.id, fetchRunDetail])

  // 运行时秒表：通过异步事件更新时间，避免在 effect 内同步级联更新。
  useEffect(() => {
    if (runStatus !== "running" && runStatus !== "awaiting_approval") return
    const initial = window.setTimeout(() => setNowMs(Date.now()), 0)
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [runStatus])

  // ————— 运行态派生 —————

  const nodeStatuses: Record<string, string> = useMemo(() => {
    if (!activeRun || activeRun.workflow_id !== activeWorkflowId) return {}
    return activeRun.checkpoint?.statuses || {}
  }, [activeRun, activeWorkflowId])

  // 循环节点轮次进度（来自 checkpoint.loop_state，卡片显示「第 N 轮 / 共 M 轮」）
  const loopProgress: Record<string, { round: number; total: number; active: boolean }> = useMemo(() => {
    if (!activeRun || activeRun.workflow_id !== activeWorkflowId) return {}
    const ls = activeRun.checkpoint?.loop_state || {}
    const result: Record<string, { round: number; total: number; active: boolean }> = {}
    for (const key of Object.keys(ls)) {
      const st = ls[key] || {}
      result[key] = {
        round: Number(st.round || 0),
        total: Number(st.total || 0),
        active: Boolean(st.active),
      }
    }
    return result
  }, [activeRun, activeWorkflowId])

  const runningNodeId = useMemo(() => {
    if (!activeRun || activeRun.status !== "running") return ""
    const startedIds: string[] = []
    const finishedIds = new Set<string>()
    for (const evItem of runEvents) {
      if (!evItem.node_id) continue
      if (evItem.event_type === "node_start") startedIds.push(evItem.node_id)
      if (["node_done", "node_failed", "node_skipped"].includes(evItem.event_type)) {
        finishedIds.add(evItem.node_id)
      }
    }
    for (let i = startedIds.length - 1; i >= 0; i--) {
      if (!finishedIds.has(startedIds[i])) return startedIds[i]
    }
    return ""
  }, [activeRun, runEvents])

  const elapsedText = useMemo(() => {
    if (!activeRun) return "—"
    const startMs = parseRunTime(activeRun.created)
    if (!startMs) return "—"
    const endMs = TERMINAL_STATES.includes(activeRun.status)
      ? parseRunTime(activeRun.updated) || startMs
      : nowMs
    return formatElapsed(endMs - startMs)
  }, [activeRun, nowMs])

  const nodeRunInfo = useMemo(() => {
    if (!selectedNode || !activeRun) return null
    const relatedEvents = runEvents.filter((item) => item.node_id === selectedNode.id)
    if (relatedEvents.length === 0) return null
    return {
      nodeStatus: nodeStatuses[selectedNode.id] || (runningNodeId === selectedNode.id ? "running" : ""),
      events: relatedEvents,
      outputText: String(activeRun.checkpoint?.outputs?.[selectedNode.id] || ""),
    }
  }, [selectedNode, activeRun, runEvents, nodeStatuses, runningNodeId])

  const handleCopyResult = useCallback(() => {
    const text = activeRun?.result || ""
    if (!text) return
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedFlag(true)
        window.setTimeout(() => setCopiedFlag(false), 2000)
      })
      .catch(() => setErrorMsg("复制失败，请手动选择文本复制"))
  }, [activeRun])

  const dismissError = useCallback(() => setErrorMsg(""), [])
  const dismissNotice = useCallback(() => setNoticeMsg(""), [])

  const isLiveRunning = Boolean(
    liveRunId && (activeRun?.status === "running" || activeRun?.status === "awaiting_approval"),
  )
  const viewingHistoryRun = Boolean(activeRunId && activeRunId !== liveRunId)
  const deleteTarget = workflows.find((item) => item.id === deleteTargetId) || null

  // 当前等待批准的工具调用（仅 awaiting_approval 态非空）
  const pendingApproval = useMemo<PendingApproval | null>(() => {
    if (!activeRun || activeRun.status !== "awaiting_approval") return null
    return activeRun.checkpoint?.pending_approval || null
  }, [activeRun])

  const modelLabelOf = useCallback((value: string) => {
    if (!value) return ""
    const all = customModels
    return all.find((item) => item.value === value)?.label || value
  }, [customModels])

  return {
    // 登录与错误
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    noticeMsg,
    dismissNotice,
    // 工作流
    workflows,
    listLoading,
    activeWorkflowId,
    flowName,
    setFlowName: (value: string) => {
      setFlowName(value)
      latestFieldsRef.current.name = value
      setDirtyFlag(true)
    },
    flowDesc,
    setFlowDesc: (value: string) => {
      setFlowDesc(value)
      latestFieldsRef.current.desc = value
      setDirtyFlag(true)
    },
    dirtyFlag,
    savingFlow,
    lastSavedAt,
    handleSelectWorkflow,
    handleCreateWorkflow,
    handleSaveWorkflow: () => void saveWorkflow(false),
    handleDuplicateWorkflow,
    requestDeleteWorkflow,
    cancelDelete,
    confirmDelete,
    deleteTarget,
    // 画布
    flowNodes,
    flowEdges,
    onNodesChange,
    onEdgesChange,
    handleConnect,
    isValidConnection,
    explainInvalidConnection,
    addNodeByType,
    updateNodeData,
    deleteSelectedNode,
    deleteSelectedEdge,
    clearSelection,
    selectedNode,
    selectedEdge,
    availableVariables,
    selectedNodeVariables,
    workflowDiagnostics,
    nodeTypeMeta: NODE_TYPE_META,
    // 撤销 / 重做
    canUndo: historyAvailability.canUndo,
    canRedo: historyAvailability.canRedo,
    undo,
    redo,
    // 全屏专注 / 运行跟随 / 画布增强
    isFocusMode,
    enterFocusMode,
    exitFocusMode,
    focusLeftOpen,
    focusRightOpen,
    toggleFocusLeft,
    toggleFocusRight,
    closeFocusPanels,
    followRun,
    toggleFollowRun,
    noteUserPan,
    autoArrange,
    deleteEdgeById,
    openNodeConfig,
    addNodeAndConnect,
    copySelection,
    pasteClipboard,
    hasClipboard,
    selectAll,
    deleteSelection,
    duplicateNodeById,
    duplicateSelection,
    alignSelected,
    loadSampleGraph,
    exportActiveFlow,
    importFlowFile,
    // 运行态
    nodeStatuses,
    loopProgress,
    runningNodeId,
    activeRun,
    activeRunId,
    runEvents,
    runStatus,
    isLiveRunning,
    viewingHistoryRun,
    elapsedText,
    nodeRunInfo,
    recentRuns,
    handleViewRun,
    exitRunView,
    copiedFlag,
    handleCopyResult,
    // 运行控制
    runDialogOpen,
    openRunDialog,
    closeRunDialog,
    runInstruction,
    setRunInstruction,
    isStarting,
    handleRunSubmit,
    cancelBusy,
    handleCancelRun,
    // 审批门
    requireApproval,
    toggleRequireApproval,
    pendingApproval,
    decideApproval,
    wfApprovalBusy,
    // 配置选项
    customModels,
    specOptions,
    genFromSpecBusy,
    handleGenerateFromSpec,
    activeSpecId,
    builtinTools: BUILTIN_TOOL_OPTIONS,
    connectedTools,
    conditionOps: CONDITION_OPS,
    knowledgeBases,
    loopDelimiters: LOOP_DELIMITERS,
    modelLabelOf,
    runStateMeta: WF_RUN_STATE_META,
  }
}
