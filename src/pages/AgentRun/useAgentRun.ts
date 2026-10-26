import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { localApi, type LocalDevice } from "@/lib/localDevices"
import { useNavigate, useSearchParams } from "react-router-dom"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import { tickAgentRun } from "@/lib/agentEngine"
import type { AgentSpec, ConnectedToolOption, SavedSpecRow } from "@/pages/Home/useHome"
import { PROVIDER_META, normalizeProvider } from "@/pages/ModelConnections/useModelConnections"
import { normalizeAgentQualityChecks, type AgentQualityCheck } from "@/lib/agentQualityChecks"
import { getVerifiedMarketTools, type VerifiedMarketTool } from "@/lib/marketToolSelection"
import { agentRunReadiness, enabledRunToolConnections } from "@/lib/agentRunReadiness"

export type { AgentSpec, SavedSpecRow }

// 与后端 agent_runs.status 完全一致（引擎只会产出这些值；awaiting_approval = 写操作等待用户批准）
export type RunStateKey = "queued" | "running" | "paused" | "awaiting_approval" | "awaiting_input" | "succeeded" | "failed" | "cancelled"

// 字段名与 agent_runs collection 1:1（snake_case，禁止转换层）
export type AgentRunRow = {
  id: string
  rh_user_id: string
  spec_id: string
  spec_name: string
  instruction: string
  status: RunStateKey
  current_step: number
  max_steps: number
  model: string
  config: Record<string, unknown> | null
  spec_snapshot?: AgentSpec | null
  result: string
  error: string
  checkpoint: Record<string, unknown> | null
  evaluation: RunEvaluation | null
  feedback: RunFeedback | null
  created: string
  updated: string
}

// 运行评估（agent_runs.evaluation，与后端 evaluate 路由产物 1:1）
export type EvalDimension = { name: string; score: number; comment: string }
export type RunEvaluation = {
  score: number
  dimensions: EvalDimension[]
  suggestions: string[]
  mode: "llm" | "rule"
  degraded?: boolean
  evaluated_at: string
}

// 结果反馈（agent_runs.feedback，与后端 feedback 路由产物 1:1）
export type RunFeedback = {
  rating: "up" | "down"
  tags: string[]
  comment: string
  submitted_at: string
}

export const FEEDBACK_TAGS = ["结果不准", "太慢", "理解偏差", "格式差", "其他"]

// 反馈驱动方案优化（POST /api/agent-specs/{id}/optimize 产物，只生成不自动写回）
export type SpecOptimizeSuggestion = {
  suggested_prompt: string
  suggested_criteria: string
  suggested_tools_note: string
  rationale: string
}
export type RecoverableOptimization = {
  id:string
  source_run_id:string
  changed_keys:string[]
  accepted_revision_id:string
  feedback_unchanged:boolean
  is_current_spec:boolean
}

export type RunEventType =
  | "status"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "error"
  | "context_compact"
  | "approval_pending"
  | "input_pending"
  | "input_received"
  | "approval"
  | "observation"
  | "memory_injected"
  | "memory_saved"

// 字段名与 run_events collection 1:1
export type RunEventRow = {
  id: string
  run_id: string
  step_index: number
  seq: number
  event_type: RunEventType
  content: Record<string, unknown>
  created: string
}

export type BuiltinTool = { id: string; title: string; desc: string }

// 与后端执行引擎真实实现的三个内置工具一一对应（calculate / summarize / knowledge_search）
export const BUILTIN_TOOLS: BuiltinTool[] = [
  { id: "calculate", title: "计算器", desc: "对算术表达式真实求值，支持 + - * / % 与括号" },
  { id: "summarize", title: "文本整理摘要", desc: "调用模型对给定文本做整理、摘要与提炼" },
  { id: "knowledge_search", title: "知识库检索", desc: "在关联知识库中检索片段" },
  { id: "web_search", title: "网页搜索", desc: "联网查询网页标题与摘要" },
  { id: "web_fetch", title: "网页抓取", desc: "读取公开网页正文" },
]

// 自定义模型选项：value 形如 custom:<connection_id>:<model_id>，启动时解析进 run config
export type CustomModelOption = { value: string; label: string; hint: string }

const CUSTOM_MODEL_PREFIX = "custom:"

function parseCustomModelValue(value: string): { connectionId: string; modelId: string } | null {
  if (!value.startsWith(CUSTOM_MODEL_PREFIX)) return null
  const rest = value.slice(CUSTOM_MODEL_PREFIX.length)
  const sepIndex = rest.indexOf(":")
  if (sepIndex <= 0) return null
  return { connectionId: rest.slice(0, sepIndex), modelId: rest.slice(sepIndex + 1) }
}

export const RUN_STATE_META: Record<RunStateKey, { label: string; badge: string }> = {
  queued: { label: "排队中", badge: "bg-muted text-muted-foreground" },
  running: { label: "运行中", badge: "bg-primary/10 text-primary" },
  paused: { label: "已暂停", badge: "bg-muted text-muted-foreground" },
  awaiting_approval: { label: "待批准", badge: "bg-primary/10 text-primary" },
  awaiting_input: { label: "等待你的回复", badge: "bg-primary/10 text-primary" },
  succeeded: { label: "已完成", badge: "bg-primary/10 text-primary" },
  failed: { label: "失败", badge: "bg-destructive/10 text-destructive" },
  cancelled: { label: "已取消", badge: "bg-destructive/10 text-destructive" },
}

const LIVE_STATES: RunStateKey[] = ["queued", "running", "paused", "awaiting_approval", "awaiting_input"]
const TERMINAL_STATES: RunStateKey[] = ["succeeded", "failed", "cancelled"]

// harness 运行级核算：checkpoint.harness_stats 的展示格式化（run-detail 也复用）
export type HarnessStats = {
  llm_calls: number
  est_prompt_chars: number
  est_out_chars: number
  tool_calls: number
  retries: number
  compressions: number
  approvals: number
}

export function parseHarnessStats(
  checkpoint: Record<string, unknown> | null | undefined,
): HarnessStats | null {
  const raw = (checkpoint?.harness_stats || null) as Partial<HarnessStats> | null
  if (!raw || typeof raw !== "object") return null
  const stats: HarnessStats = {
    llm_calls: Number(raw.llm_calls || 0),
    est_prompt_chars: Number(raw.est_prompt_chars || 0),
    est_out_chars: Number(raw.est_out_chars || 0),
    tool_calls: Number(raw.tool_calls || 0),
    retries: Number(raw.retries || 0),
    compressions: Number(raw.compressions || 0),
    approvals: Number(raw.approvals || 0),
  }
  if (stats.llm_calls === 0 && stats.tool_calls === 0) return null
  return stats
}

export function formatHarnessStats(
  checkpoint: Record<string, unknown> | null | undefined,
): string | null {
  const stats = parseHarnessStats(checkpoint)
  if (!stats) return null
  const estTokens = Math.round((stats.est_prompt_chars + stats.est_out_chars) / 4)
  const parts = [
    `模型调用 ${stats.llm_calls} 次`,
    `估算 token ${estTokens}`,
    `工具 ${stats.tool_calls} 次`,
    `重试 ${stats.retries}`,
    `压缩 ${stats.compressions}`,
  ]
  if (stats.approvals > 0) parts.push(`审批 ${stats.approvals}`)
  return parts.join(" · ")
}

// 审批门：awaiting_approval 时从最新 approval_pending 事件还原待批调用
export type PendingApproval = {
  toolName: string
  argsSummary: string
  stepIndex: number
} | null

// agent_memories 行（字段与 collection 1:1）
export type AgentMemoryRow = {
  id: string
  spec_id: string
  fact: string
  tools_used: string
  run_id: string
  kind: string
  created: string
}

// 记忆类型徽标元数据：user=显式「记住」指令 / fact=成功运行提炼的经验 / lesson=失败沉淀的教训
// （存量记录 kind 为空一律按 fact 处理）
export const MEMORY_KIND_META: Record<string, { label: string; badgeClass: string }> = {
  user: { label: "用户指令", badgeClass: "bg-primary/10 text-primary" },
  fact: { label: "经验", badgeClass: "bg-muted text-muted-foreground" },
  lesson: { label: "教训", badgeClass: "bg-destructive/10 text-destructive/80" },
}

export function memoryKindMetaOf(kind: string): { label: string; badgeClass: string } {
  return MEMORY_KIND_META[kind] || MEMORY_KIND_META.fact
}

export function useAgentRun() {
  const base = getPocketBaseUrl()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedRunId = searchParams.get("run") || ""
  const requestedSpecId = searchParams.get("spec") || ""

  const [rhUserId] = useState(() => decodeRhToken()?.sub || LOCAL_ANON_UID)
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [specVersionNotice,setSpecVersionNotice] = useState("")

  const [specList, setSpecList] = useState<SavedSpecRow[]>([])
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false)
  const [selectedSpecId, setSelectedSpecId] = useState("")

  const [model, setModel] = useState("")
  const [enabledTools, setEnabledTools] = useState<string[]>(BUILTIN_TOOLS.map((t) => t.id))
  const [maxSteps, setMaxSteps] = useState(10)
  const [maxModelCalls, setMaxModelCalls] = useState(30)
  const [maxRuntimeMinutes, setMaxRuntimeMinutes] = useState(0)
  const [stopCondition, setStopCondition] = useState("")
  const [stopOnComplete, setStopOnComplete] = useState(true)
  const [instruction, setInstruction] = useState("")
  const [localDeviceId, setLocalDeviceId] = useState("")
  const [readyLocalDevice, setReadyLocalDevice] = useState<LocalDevice | null>(null)
  useEffect(() => {
    setReadyLocalDevice(null)
    if (!localDeviceId) return
    const controller = new AbortController()
    let busy = false
    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const data = await localApi<{items: LocalDevice[]}>('/api/local-devices', undefined, controller.signal)
        if (!controller.signal.aborted) setReadyLocalDevice(data.items.find(device => device.id === localDeviceId) || null)
      } catch { if (!controller.signal.aborted) setReadyLocalDevice(null) }
      finally { busy = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [localDeviceId])

  const [isStarting, setIsStarting] = useState(false)
  const [activeRun, setActiveRun] = useState<AgentRunRow | null>(null)
  const [runEvents, setRunEvents] = useState<RunEventRow[]>([])
  const [controlBusy, setControlBusy] = useState<"" | "pause" | "resume" | "cancel">("")
  const [runHistory, setRunHistory] = useState<AgentRunRow[]>([])
  const [copiedFlag, setCopiedFlag] = useState(false)
  const [customModels, setCustomModels] = useState<CustomModelOption[]>([])
  const [connectedTools, setConnectedTools] = useState<ConnectedToolOption[]>([])
  const [connectedMarketTools, setConnectedMarketTools] = useState<VerifiedMarketTool[]>([])
  const [toolConnectionsLoading, setToolConnectionsLoading] = useState(true)
  const [toolConnectionsError, setToolConnectionsError] = useState("")

  // 审批门 + 方案记忆（harness 增强批次）
  const [requireApproval, setRequireApproval] = useState(false)
  const [requirePlanReview, setRequirePlanReview] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState<"" | "approve" | "reject">("")
  const [replyText, setReplyText] = useState("")
  const [replyBusy, setReplyBusy] = useState(false)
  const [memoryList, setMemoryList] = useState<AgentMemoryRow[]>([])
  const [isLoadingMemories, setIsLoadingMemories] = useState(false)
  const [memoryDeletingId, setMemoryDeletingId] = useState("")

  // 评估与反馈批次
  const [evalBusy, setEvalBusy] = useState(false)
  const [qualityBusy, setQualityBusy] = useState(false)
  const [qualityError, setQualityError] = useState("")
  const [feedbackDraft, setFeedbackDraft] = useState<{
    rating: "" | "up" | "down"
    tags: string[]
    comment: string
  }>({ rating: "", tags: [], comment: "" })
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackEditing, setFeedbackEditing] = useState(false)
  const [optimizeBusy, setOptimizeBusy] = useState(false)
  const [optimizeSuggestion, setOptimizeSuggestion] = useState<SpecOptimizeSuggestion | null>(null)
  const [optimizeError, setOptimizeError] = useState("")
  const [optimizeSuccess, setOptimizeSuccess] = useState("")
  const [acceptedOptimizationLineage,setAcceptedOptimizationLineage] = useState<{id:string;specId:string}|null>(null)
  const [recoverableOptimization,setRecoverableOptimization]=useState<RecoverableOptimization|null>(null)
  const [recoveryError,setRecoveryError]=useState("")
  const [recoveryRevision,setRecoveryRevision]=useState(0)
  const [applyBusy, setApplyBusy] = useState(false)

  const tickInFlightRef = useRef(false)
  const startInFlightRef = useRef(false)
  const pollBusyRef = useRef(false)
  const specParamAppliedRef = useRef(false)
  const optimizeRunIdRef = useRef("")
  const toolConnectionRequestRef = useRef(0)

  const selectedSpec = specList.find((row) => row.id === selectedSpecId) || null
  const connectedToolNames = connectedTools.map(tool => tool.name)
  const marketToolCount = connectedMarketTools.length
  const runReadiness = useMemo(() => agentRunReadiness(selectedSpec?.spec || null, {
    connections: connectedTools,
    marketTools: connectedMarketTools,
    disabledToolIds: BUILTIN_TOOLS.filter(tool => !enabledTools.includes(tool.id)).map(tool => tool.id),
    localDevice: readyLocalDevice?.id === localDeviceId ? readyLocalDevice : null,
  }), [selectedSpec?.spec, connectedTools, connectedMarketTools, enabledTools, readyLocalDevice, localDeviceId])
  // History review must optimize its own Agent, never whichever Agent is selected in the left sidebar.
  const optimizationSpec = activeRun ? specList.find(row => row.id === activeRun.spec_id) || null : null
  // Only the server can confirm a saved optimization audit still matches
  // the CURRENT full AgentSpec. Refresh/relogin do not erase audit provenance,
  // but the employee must explicitly opt in before associating the next run.
  useEffect(()=>{
    if(!rhUserId||!selectedSpecId){
      setRecoverableOptimization(null)
      setRecoveryError("")
      return
    }
    const abort=new AbortController()
    setRecoverableOptimization(null)
    setRecoveryError("")
    void(async()=>{
      try{
        const response=await fetch(base+"/api/agent-specs/"+
          encodeURIComponent(selectedSpecId)+"/optimization-lineage",{
          headers:{...vibexAuthHeaders()},signal:abort.signal,
        })
        if(!response.ok)throw new Error("lineage_unavailable")
        const payload=await response.json()
        if(!Array.isArray(payload?.items))throw new Error("invalid_lineage")
        const current=payload.items.find((row:RecoverableOptimization)=>
          row?.is_current_spec===true&&/^[A-Za-z0-9]{15}$/.test(row.id))
        if(!abort.signal.aborted){
          setRecoverableOptimization(current||null)
          if(!current){
            // Proactively clear a stale selection after an edited Agent is
            // verified by the server. Never let an older audit slip silently.
            setAcceptedOptimizationLineage(previous=>
              previous?.specId===selectedSpecId?null:previous)
          }
        }
      }catch{
        if(!abort.signal.aborted)
          setRecoveryError("暂时无法核验此 Agent 是否有可恢复的反馈优化版本。")
      }
    })()
    return()=>abort.abort()
  },[rhUserId,selectedSpecId,selectedSpec?.updated,base,recoveryRevision])
  const handleRestoreOptimization=useCallback(()=>{
    if(!recoverableOptimization?.is_current_spec||!selectedSpecId)return
    setAcceptedOptimizationLineage({id:recoverableOptimization.id,specId:selectedSpecId})
  },[recoverableOptimization,selectedSpecId])
  const handleUnlinkOptimization=useCallback(()=>{
    setAcceptedOptimizationLineage(null)
  },[])

  optimizeRunIdRef.current = activeRun?.id || ""

  // 首页「去配置和试跑」跳转带 ?spec=<id>，方案列表加载后自动选中
  useEffect(() => {
    if (specParamAppliedRef.current || specList.length === 0) return
    const wanted = searchParams.get("spec")
    if (!wanted) return
    const row = specList.find(item => item.id === wanted)
    if (!row) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled || specParamAppliedRef.current) return
      setSelectedSpecId(wanted)
      if (row.spec?.done_criteria?.length) setStopCondition(row.spec.done_criteria.join("；"))
      setRequireApproval(Boolean(row.spec?.require_approval))
      setRequirePlanReview(Boolean(row.spec?.require_plan_review))
      specParamAppliedRef.current = true
    })
    return () => { cancelled = true }
  }, [specList, searchParams])

  const loadSpecList = useCallback(async (uid: string) => {
    if (!uid) return
    setIsLoadingSpecs(true)
    try {
      const res = await fetch(`${base}/api/agent_specs?perPage=200&sort=-updated`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data?.items) ? (data.items as SavedSpecRow[]) : []
        // A shared deep link or catalog page can reference an older Agent
        // outside the 200 most recently edited entries. Resolve it by its
        // exact owner-scoped ID instead of silently changing to another Agent.
        if(requestedSpecId && /^[A-Za-z0-9]{15}$/.test(requestedSpecId) &&
          !items.some(row=>row.id===requestedSpecId)){
          try{
            const detail=await fetch(base+"/api/agent_specs/"+encodeURIComponent(requestedSpecId),{
              headers:{...vibexAuthHeaders()},
            })
            if(detail.ok){
              const row=await detail.json() as SavedSpecRow
              if(row?.id===requestedSpecId)items.push(row)
            }
          }catch{ /* leave missing; never substitute a different Agent */ }
        }
        setSpecList(items)
      }
    } catch {
      // 列表加载失败不阻塞页面
    } finally {
      setIsLoadingSpecs(false)
    }
  }, [base,requestedSpecId])

  const loadRunHistory = useCallback(async (uid: string) => {
    if (!uid) return
    try {
      const res = await fetch(`${base}/api/agent_runs?rh_user_id=${encodeURIComponent(uid)}&perPage=50`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data?.items) ? (data.items as AgentRunRow[]) : []
        setRunHistory(items)
      }
    } catch {
      // 历史加载失败不阻塞主流程
    }
  }, [base])

  const loadCustomModels = useCallback(async (uid: string) => {
    if (!uid) return
    try {
      const res = await fetch(`${base}/api/model-connections`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items) ? (data.items as {
        id: string
        name: string
        enabled: boolean
        provider: string
        models: string[]
      }[]) : []
      const options: CustomModelOption[] = []
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
      setModel((prev) => {
        if (prev && options.some((opt) => opt.value === prev)) return prev
        return options.length > 0 ? options[0].value : ""
      })
    } catch {
      // 模型连接加载失败不阻塞其余配置
    }
  }, [base])

  useEffect(() => {
    if (!rhUserId) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      void loadSpecList(rhUserId)
      void loadRunHistory(rhUserId)
      void loadCustomModels(rhUserId)
    })
    return () => { cancelled = true }
  }, [rhUserId, loadSpecList, loadRunHistory, loadCustomModels])

  useEffect(()=>{
    if(!rhUserId)return
    const onSaved=(event:Event)=>{
      const specId=String((event as CustomEvent<{specId?:string}>).detail?.specId||"")
      if(!specId)return
      void loadSpecList(rhUserId)
      if(specId===selectedSpecId || specId===activeRun?.spec_id)
        setSpecVersionNotice("Agent 方案已保存为新版本。下一次试跑将读取新方案；当前进行中的任务仍使用启动时的原始配置。")
    }
    window.addEventListener("studio:agent-spec-saved",onSaved)
    return()=>window.removeEventListener("studio:agent-spec-saved",onSaved)
  },[rhUserId,loadSpecList,selectedSpecId,activeRun?.spec_id])

  const refreshToolConnections = useCallback(async () => {
    const requestId = ++toolConnectionRequestRef.current
    setToolConnectionsLoading(true)
    setToolConnectionsError("")
    const readItems = async (path: string) => {
      const response = await fetch(`${base}${path}`, { headers: { ...vibexAuthHeaders() }, signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error("connection_list_unavailable")
      const json = await response.json()
      if (!Array.isArray(json?.items)) throw new Error("invalid_connection_list")
      return json.items as unknown[]
    }
    const [http, market] = await Promise.allSettled([
      readItems("/api/tool-connections"), readItems("/api/market/connections"),
    ])
    if (requestId !== toolConnectionRequestRef.current) return
    // Failed or stale reads never retain a prior verified capability for a new run.
    setConnectedTools(http.status === "fulfilled" ? enabledRunToolConnections(http.value) : [])
    setConnectedMarketTools(market.status === "fulfilled" ? getVerifiedMarketTools(market.value) : [])
    if (http.status === "rejected" || market.status === "rejected")
      setToolConnectionsError("部分工具连接暂时无法核验，请刷新连接状态后检查所需能力。")
    setToolConnectionsLoading(false)
  }, [base])

  useEffect(() => {
    if (!rhUserId) return
    void refreshToolConnections()
    const onFocus = () => { void refreshToolConnections() }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [rhUserId, refreshToolConnections])

  const handleSelectSpec = useCallback(
    (specId: string) => {
      setSelectedSpecId(specId)
      const row = specList.find((item) => item.id === specId)
      if (row?.spec?.done_criteria?.length) {
        setStopCondition(row.spec.done_criteria.join("；"))
      }
      setRequireApproval(Boolean(row?.spec?.require_approval))
      setRequirePlanReview(Boolean(row?.spec?.require_plan_review))
    },
    [specList],
  )

  const handleTogglePlanReview = useCallback(() => {
    const enabled = !requirePlanReview
    setRequirePlanReview(enabled)
    if (enabled) setMaxSteps(previous => Math.max(2, previous))
  }, [requirePlanReview])

  // 运行页是试跑配置，不是正式 Agent 编辑器。明确保存新版本只能在方案编辑窗口完成。
  // 防止用户切换一次试跑开关就暗中覆盖其它标签已经保存的 Agent 版本。
  const handleToggleRequireApproval = useCallback(() => {
    setRequireApproval(previous => !previous)
  }, [])

  // 方案记忆：当前选中方案的沉淀经验（后端启动时会注入规划，这里只做展示与管理）
  const loadMemories = useCallback(
    async (uid: string, specId: string) => {
      if (!uid || !specId) {
        setMemoryList([])
        return
      }
      setIsLoadingMemories(true)
      try {
        const res = await fetch(
          `${base}/api/agent-memories?spec_id=${encodeURIComponent(specId)}`,
          { headers: { ...vibexAuthHeaders() } },
        )
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return
        }
        if (!res.ok) return
        const data = await res.json()
        setMemoryList(Array.isArray(data?.items) ? (data.items as AgentMemoryRow[]) : [])
      } catch {
        // 记忆加载失败不阻塞主流程
      } finally {
        setIsLoadingMemories(false)
      }
    },
    [base],
  )

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadMemories(rhUserId, selectedSpecId)
    })
    return () => { cancelled = true }
  }, [rhUserId, selectedSpecId, loadMemories])

  const handleDeleteMemory = useCallback(
    async (memoryId: string) => {
      if (!memoryId || memoryDeletingId) return
      setMemoryDeletingId(memoryId)
      try {
        const res = await fetch(`${base}/api/agent-memories/${encodeURIComponent(memoryId)}`, {
          method: "DELETE",
          headers: { ...vibexAuthHeaders() },
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return
        }
        if (res.ok) {
          setMemoryList((prev) => prev.filter((item) => item.id !== memoryId))
        } else {
          setErrorMsg("删除记忆失败，请稍后重试")
        }
      } catch {
        setErrorMsg("网络异常，删除记忆失败，请重试")
      } finally {
        setMemoryDeletingId("")
      }
    },
    [base, memoryDeletingId],
  )

  const fetchRunRecord = useCallback(
    async (runId: string): Promise<AgentRunRow | null> => {
      const res = await fetch(`${base}/api/agent_runs/${encodeURIComponent(runId)}`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return null
      }
      if (!res.ok) return null
      return (await res.json()) as AgentRunRow
    },
    [base],
  )

  const fetchRunEvents = useCallback(
    async (runId: string): Promise<RunEventRow[]> => {
      const res = await fetch(
        `${base}/api/run_events?run_id=${encodeURIComponent(runId)}&perPage=200&sort=created`,
        { headers: { ...vibexAuthHeaders() } },
      )
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return []
      }
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data?.items) ? (data.items as RunEventRow[]) : []
    },
    [base],
  )

  // 将运行 ID 放入当前 URL：刷新/复制链接后可恢复同一次运行，包括尚未回答的审批。
  // 所有运行详情与事件仍通过服务端按员工身份校验，不依赖本地缓存做授权。
  const rememberRunUrl = useCallback((runId: string, specId: string) => {
    if (!runId) return
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      next.set("run", runId)
      if (specId) next.set("spec", specId)
      return next
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    if (!requestedRunId || !rhUserId) return
    let cancelled = false
    void Promise.all([fetchRunRecord(requestedRunId), fetchRunEvents(requestedRunId)])
      .then(([run, events]) => {
        if (cancelled) return
        if (!run) {
          setErrorMsg("无法恢复运行记录：任务不存在或当前账号无权查看。")
          return
        }
        setActiveRun(run)
        setRunEvents(events)
        setSelectedSpecId(run.spec_id)
      }).catch(() => {
        if (!cancelled) setErrorMsg("恢复任务失败，请检查网络并刷新重试。")
      })
    return () => { cancelled = true }
  }, [requestedRunId, rhUserId, fetchRunRecord, fetchRunEvents])

  const pollOnce = useCallback(
    async (runId: string) => {
      if (pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        const fresh = await fetchRunRecord(runId)
        if (fresh?.id) {
          setActiveRun(fresh)
          if (TERMINAL_STATES.includes(fresh.status)) {
            void loadRunHistory(rhUserId)
            if (fresh.status === "succeeded") void loadMemories(rhUserId, fresh.spec_id)
          } else if (fresh.status === "running" && !tickInFlightRef.current) {
            // 前端驱动引擎：running 态每轮触发一步（服务端有 claim_until 防重叠）
            tickInFlightRef.current = true
            void tickAgentRun(runId).finally(() => {
              tickInFlightRef.current = false
            })
          }
        }
        const items = await fetchRunEvents(runId)
        if (items.length) setRunEvents(items)
      } catch {
        // 单次轮询失败静默，下一轮重试
      } finally {
        pollBusyRef.current = false
      }
    },
    [fetchRunRecord, fetchRunEvents, loadRunHistory, loadMemories, rhUserId],
  )

  const livePollingRunId=activeRun && LIVE_STATES.includes(activeRun.status)
    ? activeRun.id : ""
  useEffect(() => {
    if (!livePollingRunId) return
    const firstPoll = window.setTimeout(() => { void pollOnce(livePollingRunId) }, 0)
    const timer = window.setInterval(() => {
      void pollOnce(livePollingRunId)
    }, 3000)
    return () => {
      window.clearTimeout(firstPoll)
      window.clearInterval(timer)
    }
  }, [livePollingRunId, pollOnce])

  const doStartRun = useCallback(async () => {
    if (!selectedSpec || !instruction.trim() || startInFlightRef.current) return
    // Synchronous guard: keyboard shortcut + mouse click before React rerender
    // must not create two paid Agent runs from the same user intent.
    startInFlightRef.current = true
    setIsStarting(true)
    setErrorMsg("")
    try {
      const toolsConfig: Record<string, boolean> = {}
      for (const tool of BUILTIN_TOOLS) toolsConfig[tool.id] = enabledTools.includes(tool.id)
      const parsedCustom = parseCustomModelValue(model)
      const startBody: Record<string, unknown> = {
        spec_id: selectedSpec.id,
        instruction: instruction.trim(),
        model: parsedCustom ? parsedCustom.modelId : model,
        config: {
          local_device_id: localDeviceId,
          max_steps: maxSteps,
          max_model_calls: maxModelCalls,
          ...(maxRuntimeMinutes ? { max_runtime_minutes: maxRuntimeMinutes } : {}),
          stop_condition: stopCondition.trim(),
          stop_on_complete: stopOnComplete,
          require_approval: requireApproval,
          require_plan_review: requirePlanReview,
          ...(acceptedOptimizationLineage?.specId===selectedSpec.id
            ? {optimization_lineage_id:acceptedOptimizationLineage.id}:{}),
          tools: toolsConfig,
          ...(parsedCustom
            ? {
                custom_model: {
                  connection_id: parsedCustom.connectionId,
                  model_id: parsedCustom.modelId,
                },
              }
            : {}),
        },
      }
      const res = await fetch(`${base}/api/agent-runs/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify(startBody),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("请先登录账号后再试跑")
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        if(res.status===409&&data?.error==="optimization_spec_changed"){
          setAcceptedOptimizationLineage(null)
          setRecoveryRevision(n=>n+1)
          setErrorMsg("当前方案已经变化，旧的反馈版本关联已取消。请核对正式方案后再试跑。")
          return
        }
        setErrorMsg(data?.message || "创建运行失败，请稍后重试")
        return
      }
      const data = await res.json()
      const runId = String(data?.run_id || "")
      if(runId) setAcceptedOptimizationLineage(null)
      setRunEvents([])
      if (runId) {
        const full = await fetchRunRecord(runId)
        if (full) setActiveRun(full)
        rememberRunUrl(runId, selectedSpec.id)
      }
      void loadRunHistory(rhUserId)
    } catch {
      setErrorMsg("网络异常，创建运行失败，请重试")
    } finally {
      startInFlightRef.current = false
      setIsStarting(false)
    }
  }, [
    selectedSpec,
    instruction,
    localDeviceId,
    base,
    model,
    enabledTools,
    maxSteps,
    maxModelCalls,
    maxRuntimeMinutes,
    stopCondition,
    stopOnComplete,
    requireApproval,
    fetchRunRecord,    requirePlanReview,

    loadRunHistory,
    rhUserId,
    rememberRunUrl,
    acceptedOptimizationLineage,
  ])

  const handleRun = useCallback(() => {
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    if (!selectedSpec) {
      setErrorMsg("请先在「本次任务与运行设置」中选择一个已保存的助手方案")
      return
    }
    if (!instruction.trim()) {
      setErrorMsg("请输入任务指令后再运行")
      return
    }
    if (!parseCustomModelValue(model)) {
      setErrorMsg("请先选择你自己的模型连接里的模型（没有的话先到「模型连接」页添加一个模型连接）")
      return
    }
    if (isStarting || startInFlightRef.current || (activeRun && LIVE_STATES.includes(activeRun.status))) return
    if (toolConnectionsLoading) {
      setErrorMsg("正在核验工具连接，请稍候再试跑")
      return
    }
    if (!runReadiness.ready) {
      setErrorMsg("请先补齐运行配置：" + runReadiness.issues.join("；"))
      return
    }
    // 自备密钥批次：模型调用走用户自己的模型连接，无平台计费，直接启动
    void doStartRun()
  }, [rhUserId, selectedSpec, instruction, isStarting, activeRun, model, doStartRun, toolConnectionsLoading, runReadiness])

  // 双渠道对应批次：把当前方案一键生成工作流画布并跳过去继续微调
  const navigate = useNavigate()
  const [genWfBusy, setGenWfBusy] = useState(false)
  const handleGenerateWorkflow = useCallback(async () => {
    if (!selectedSpecId || genWfBusy) return
    setGenWfBusy(true)
    setErrorMsg("")
    try {
      const res = await fetch(`${base}/api/workflow-studio/generate-from-spec`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({ spec_id: selectedSpecId }),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.id) {
        setErrorMsg(data?.message || "生成工作流编排失败，请稍后重试")
        return
      }
      navigate(`/workflow-canvas?wf=${encodeURIComponent(String(data.id))}`)
    } catch {
      setErrorMsg("网络异常，生成工作流编排失败")
    } finally {
      setGenWfBusy(false)
    }
  }, [selectedSpecId, genWfBusy, base, navigate])

  const handleControl = useCallback(
    async (action: "pause" | "resume" | "cancel") => {
      if (!activeRun || controlBusy) return
      setControlBusy(action)
      setErrorMsg("")
      try {
        const res = await fetch(
          `${base}/api/agent-runs/${encodeURIComponent(activeRun.id)}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
            body: "{}",
          },
        )
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          setErrorMsg("登录态已过期，请重新登录后再操作")
          return
        }
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "操作失败，请稍后重试")
          return
        }
        const fresh = await fetchRunRecord(activeRun.id)
        if (fresh) setActiveRun(fresh)
        if (action === "cancel") void loadRunHistory(rhUserId)
      } catch {
        setErrorMsg("网络异常，操作失败，请重试")
      } finally {
        setControlBusy("")
      }
    },
    [activeRun, controlBusy, base, fetchRunRecord, loadRunHistory, rhUserId],
  )

  // 审批门：批准 → 引擎下次 tick 继续执行该调用；拒绝 → 写拒绝观察转回规划
  const handleApproval = useCallback(
    async (approvalDecision: "approve" | "reject") => {
      if (!activeRun || approvalBusy) return
      setApprovalBusy(approvalDecision)
      setErrorMsg("")
      try {
        const res = await fetch(
          `${base}/api/agent-runs/${encodeURIComponent(activeRun.id)}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
            body: JSON.stringify({ decision: approvalDecision }),
          },
        )
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          setErrorMsg("登录态已过期，请重新登录后再操作")
          return
        }
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "审批提交失败，请稍后重试")
          return
        }
        const fresh = await fetchRunRecord(activeRun.id)
        if (fresh) setActiveRun(fresh)
        const items = await fetchRunEvents(activeRun.id)
        if (items.length) setRunEvents(items)
      } catch {
        setErrorMsg("网络异常，审批提交失败，请重试")
      } finally {
        setApprovalBusy("")
      }
    },
    [activeRun, approvalBusy, base, fetchRunRecord, fetchRunEvents],
  )

  // 同一运行内回复 Agent 的澄清问题，checkpoint 持久化并续跑。
  const handleReply = useCallback(async (decision: "reply" | "approve" | "revise") => {
    if (!activeRun || activeRun.status !== "awaiting_input" || replyBusy ||
      (decision !== "approve" && !replyText.trim())) return
    setReplyBusy(true)
    setErrorMsg("")
    try {
      const res = await fetch(`${base}/api/agent-runs/${encodeURIComponent(activeRun.id)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({ answer: replyText.trim(), decision }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "回复失败，请刷新确认任务状态后重试")
        if (res.status === 401 || res.status === 412) setNeedsRhLogin(true)
        return
      }
      setReplyText("")
      const fresh = await fetchRunRecord(activeRun.id)
      if (fresh) setActiveRun(fresh)
      setRunEvents(await fetchRunEvents(activeRun.id))
    } catch {
      setErrorMsg("网络异常，回复未确认，请刷新后重试")
    } finally {
      setReplyBusy(false)
    }
  }, [activeRun, replyBusy, replyText, base, fetchRunRecord, fetchRunEvents])

  const pendingInputData = activeRun?.checkpoint?.pending_input as {question?: string;kind?: string} | undefined
  const pendingInput = activeRun?.status === "awaiting_input" ? String(pendingInputData?.question || "") : ""
  const pendingInputKind: "plan_review" | "clarification" = pendingInputData?.kind === "plan_review" ? "plan_review" : "clarification"

  // 切换运行或进入下一次澄清时清空旧草稿；同一次待审关卡刷新不会擦除输入。
  useEffect(() => { setReplyText("") }, [activeRun?.id, pendingInput])

  // Human-defined binary assertions are part of the owned AgentSpec JSON.
  // Existing backend PATCH checks owner, audits revisions and invalidates
  // incompatible collaboration proposals. Never write to a foreign spec.
  const handleSaveQualityChecks = useCallback(async (checks: AgentQualityCheck[]): Promise<boolean> => {
    const selected = specList.find(row => row.id === selectedSpecId)
    if (!selected || qualityBusy) return false
    const quality_checks = normalizeAgentQualityChecks(checks)
    if (quality_checks.some(item => item.type !== "json_object" && !item.expected)) {
      setQualityError("断言不能为空，请填写要检查的文本")
      return false
    }
    setQualityBusy(true)
    setQualityError("")
    try {
      const response=await fetch(`${base}/api/agent_specs/${encodeURIComponent(selected.id)}`,{
        method:"PATCH",
        headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
        body:JSON.stringify({spec:{...selected.spec,quality_checks},expected_updated:selected.updated}),
      })
      if (response.status===401 || response.status===412) {
        setNeedsRhLogin(true)
        setQualityError("员工登录态过期，请重新登录后保存检查条件")
        return false
      }
      if (response.status===409) {
        setQualityError("其他页面已更新该 Agent。为保护最新版本，未覆盖原方案。请核对修改后重新提交检查条件。")
        return false
      }
      if (!response.ok) {
        setQualityError("检查条件保存失败，请检查权限或刷新方案后重试")
        return false
      }
      const current=await response.json() as SavedSpecRow
      if (!current?.id || !current.updated) {
        setQualityError("服务器未返回可验证的保存版本，请刷新核对检查条件。")
        return false
      }
      setSpecList(rows=>rows.map(row=>row.id===selected.id?current:row))
      return true
    } catch {
      setQualityError("网络错误，检查条件未保存，请稍后重试")
      return false
    } finally {
      setQualityBusy(false)
    }
  },[selectedSpecId,specList,qualityBusy,base])

  // —— 评估与反馈批次 ——
  // 运行评估：终态后生成评估报告（后端规则分+LLM 评审融合；LLM 不可用降级纯规则）
  const doEvaluate = useCallback(async () => {
    if (!activeRun) return
    setEvalBusy(true)
    setErrorMsg("")
    try {
      const res = await fetch(
        `${base}/api/agent-runs/${encodeURIComponent(activeRun.id)}/evaluate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: "{}",
        },
      )
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再评估")
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "生成评估失败，请稍后重试")
        return
      }
      const fresh = await fetchRunRecord(activeRun.id)
      if (fresh) setActiveRun(fresh)
    } catch {
      setErrorMsg("网络异常，生成评估失败，请重试")
    } finally {
      setEvalBusy(false)
    }
  }, [activeRun, base, fetchRunRecord])

  const handleEvaluate = useCallback(() => {
    if (!activeRun || evalBusy) return
    if (!TERMINAL_STATES.includes(activeRun.status)) return
    if (activeRun.evaluation) {
      void doEvaluate()
      return
    }
    void doEvaluate()
  }, [activeRun, evalBusy, doEvaluate])

  // 结果反馈：👍/👎 + 标签多选 + 可选一句话；已提交可修改（覆盖写）
  const handleSelectFeedbackRating = useCallback((rating: "up" | "down") => {
    setFeedbackDraft((prev) => ({ ...prev, rating }))
  }, [])

  const handleToggleFeedbackTag = useCallback((tag: string) => {
    setFeedbackDraft((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
    }))
  }, [])

  const handleFeedbackCommentChange = useCallback((comment: string) => {
    setFeedbackDraft((prev) => ({ ...prev, comment }))
  }, [])

  const handleEditFeedback = useCallback(() => {
    const existingFb = activeRun?.feedback
    setFeedbackDraft({
      rating: existingFb?.rating || "",
      tags: existingFb?.tags ? [...existingFb.tags] : [],
      comment: existingFb?.comment || "",
    })
    setFeedbackEditing(true)
  }, [activeRun])

  const handleCancelFeedbackEdit = useCallback(() => {
    setFeedbackEditing(false)
    setFeedbackDraft({ rating: "", tags: [], comment: "" })
  }, [])

  const handleSubmitFeedback = useCallback(async () => {
    if (!activeRun || feedbackBusy || !feedbackDraft.rating) return
    setFeedbackBusy(true)
    setErrorMsg("")
    try {
      const res = await fetch(
        `${base}/api/agent-runs/${encodeURIComponent(activeRun.id)}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: JSON.stringify({
            rating: feedbackDraft.rating,
            tags: feedbackDraft.tags,
            comment: feedbackDraft.comment.trim(),
          }),
        },
      )
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再提交反馈")
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "提交反馈失败，请稍后重试")
        return
      }
      const fresh = await fetchRunRecord(activeRun.id)
      if (fresh) setActiveRun(fresh)
      setFeedbackEditing(false)
      // 负反馈会沉淀一条教训记忆，刷新记忆面板
      if (feedbackDraft.rating === "down") {
        void loadMemories(rhUserId, fresh?.spec_id || activeRun.spec_id)
      }
    } catch {
      setErrorMsg("网络异常，提交反馈失败，请重试")
    } finally {
      setFeedbackBusy(false)
    }
  }, [activeRun, feedbackBusy, feedbackDraft, base, fetchRunRecord, loadMemories, rhUserId])

  // 切换回看的运行时重置反馈草稿，并清除上一次运行的优化建议。
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setFeedbackEditing(false)
      setFeedbackDraft({ rating: "", tags: [], comment: "" })
    })
    return () => { cancelled = true }
  }, [activeRun?.id])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setOptimizeSuggestion(null)
      setOptimizeError("")
      setOptimizeSuccess("")
    })
    return () => { cancelled = true }
  }, [activeRun?.id,selectedSpecId])

  // 反馈驱动方案优化：聚合该方案全部反馈与最近评估建议 → 一次 LLM 生成改进稿（只生成不写回）
  const doOptimizeSpec = useCallback(async () => {
    if (!optimizationSpec || !activeRun) return
    const runIdAtStart = activeRun.id
    setOptimizeBusy(true)
    setOptimizeError("")
    setOptimizeSuccess("")
    try {
      const res = await fetch(
        `${base}/api/agent-specs/${encodeURIComponent(optimizationSpec.id)}/optimize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
          body: "{}",
        },
      )
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setOptimizeError("登录态已过期，请重新登录后再优化方案")
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setOptimizeError(data?.message || "生成优化建议失败，请稍后重试")
        return
      }
      // An older run's async response must never populate the newly selected run.
      if (optimizeRunIdRef.current !== runIdAtStart) return
      const suggestion = data?.suggestion as SpecOptimizeSuggestion | undefined
      if (suggestion && suggestion.suggested_prompt) {
        setOptimizeSuggestion(suggestion)
      } else {
        setOptimizeError("没有返回可用的优化建议，请稍后重试")
      }
    } catch {
      setOptimizeError("网络异常，生成优化建议失败，请重试")
    } finally {
      setOptimizeBusy(false)
    }
  }, [optimizationSpec, activeRun, base])

  const handleOptimizeSpec = useCallback(() => {
    if (!optimizationSpec || optimizeBusy) return
    setOptimizeError("")
    void doOptimizeSpec()
  }, [optimizationSpec, optimizeBusy, doOptimizeSpec])

  // 确认写回：建议稿合并进方案（目标 ← suggested_prompt，完成标准 ← suggested_criteria 分条）
  const handleApplyOptimize = useCallback(async () => {
    if (!optimizeSuggestion || !optimizationSpec || applyBusy) return
    setApplyBusy(true)
    setOptimizeError("")
    setOptimizeSuccess("")
    try {
      const criteriaList = optimizeSuggestion.suggested_criteria
        .split(/\n|；|;/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
      const mergedSpec = {
        ...optimizationSpec.spec,
        goal: optimizeSuggestion.suggested_prompt,
        ...(criteriaList.length ? { done_criteria: criteriaList } : {}),
      }
      const res = await fetch(`${base}/api/agent_specs/${encodeURIComponent(optimizationSpec.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({spec:mergedSpec,expected_updated:optimizationSpec.updated,
          ...(activeRun?.feedback?.rating ? {optimization_context:{source_run_id:activeRun.id}} : {}),
        }),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再写回方案")
        return
      }
      if (res.status === 409) {
        // Optimistic-lock fence: reload the actual server version rather than
        // leaving a stale local revision that would conflict forever.
        try {
          const latest = await fetch(`${base}/api/agent_specs/${encodeURIComponent(optimizationSpec.id)}`, {
            headers: { ...vibexAuthHeaders() },
          })
          if (latest.ok) {
            const current = await latest.json() as SavedSpecRow
            if (current?.id === optimizationSpec.id) {
              setSpecList(prev => prev.map(row => row.id === current.id ? current : row))
              setOptimizeSuggestion(null)
              setOptimizeError("其他页面已更新此 Agent。已读取最新方案，旧优化稿已作废；请重新生成建议后再应用。")
              return
            }
          }
        } catch { /* retain the draft if refreshing the latest version failed */ }
        setOptimizeError("其他页面已更新此 Agent，当前优化稿未覆盖任何内容。请刷新页面后重新生成建议。")
        return
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        setOptimizeError(detail?.message || "写回方案失败，请稍后重试")
        return
      }
      const updated = await res.json().catch(() => null)
      if (!updated || updated.id !== optimizationSpec.id) {
        setOptimizeError("服务器未返回可核验的方案版本，请重新读取方案后确认是否已保存。")
        return
      }
      setSpecList((prev) => prev.map(item =>
        item.id === optimizationSpec.id
          ? { ...item, spec: mergedSpec, updated: String(updated.updated || item.updated) }
          : item))
      if (criteriaList.length && selectedSpecId === optimizationSpec.id) setStopCondition(criteriaList.join("；"))
      if(typeof updated.optimization_lineage_id==="string" &&
        /^[A-Za-z0-9]{15}$/.test(updated.optimization_lineage_id))
        setAcceptedOptimizationLineage({id:updated.optimization_lineage_id,specId:optimizationSpec.id})
      else setAcceptedOptimizationLineage(null)
      setOptimizeSuggestion(null)
      setOptimizeSuccess(typeof updated.optimization_lineage_id==="string"
        ? "方案优化已保存为当前 Agent 的新版本。本次用户反馈已关联到方案变更；再次试跑可核验改进来源。"
        : "方案优化已保存为当前 Agent 的新版本。但当前运行未提交反馈，不会标记为反馈驱动；旧快照不变。")
    } catch {
      setOptimizeError("网络异常，无法确认是否保存成功。请刷新方案记录后核验。")
    } finally {
      setApplyBusy(false)
    }
  }, [optimizeSuggestion, optimizationSpec, applyBusy, base, selectedSpecId, activeRun])

  // After an employee explicitly accepts a new AgentSpec version, prepare
  // another run of the same request. This does NOT launch a model call or
  // change the previous run; the user reviews the instruction and clicks Run.
  const handlePrepareOptimizedRetest = useCallback(()=>{
    if(!activeRun || !optimizationSpec || !optimizeSuccess ||
      !TERMINAL_STATES.includes(activeRun.status))return
    const target=specList.find(item=>item.id===optimizationSpec.id)
    if(!target)return
    setSelectedSpecId(target.id)
    setRequirePlanReview(Boolean(target.spec.require_plan_review))
    setRequireApproval(Boolean(target.spec.require_approval))
    if(target.spec.done_criteria?.length)
      setStopCondition(target.spec.done_criteria.join("；"))
    setInstruction(activeRun.instruction || "")
    setActiveRun(null)
    setRunEvents([])
    setErrorMsg("")
    setSearchParams(previous=>{
      const next=new URLSearchParams(previous)
      next.delete("run")
      next.set("spec",target.id)
      return next
    },{replace:true})
    window.requestAnimationFrame(()=>{
      document.getElementById("agent-task-instruction")?.focus({preventScroll:true})
      document.getElementById("workbench")?.scrollIntoView({behavior:"smooth",block:"start"})
    })
  },[activeRun,optimizationSpec,optimizeSuccess,specList,setSearchParams])

  const handleDiscardOptimize = useCallback(() => {
    setOptimizeSuggestion(null)
  }, [])

  const dismissOptimizeError = useCallback(() => setOptimizeError(""), [])

  const handleViewHistoryRun = useCallback(
    async (row: AgentRunRow) => {
      setErrorMsg("")
      setRunEvents([])
      setActiveRun(row)
      setSelectedSpecId(row.spec_id)
      rememberRunUrl(row.id, row.spec_id)
      try {
        const full = await fetchRunRecord(row.id)
        if (full) setActiveRun(full)
        const items = await fetchRunEvents(row.id)
        setRunEvents(items)
      } catch {
        // 回看失败时保留列表行数据展示状态
      }
    },
    [fetchRunRecord, fetchRunEvents, rememberRunUrl],
  )

  const handleToggleTool = useCallback((toolId: string) => {
    setEnabledTools((prev) =>
      prev.includes(toolId) ? prev.filter((item) => item !== toolId) : [...prev, toolId],
    )
  }, [])

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

  // 待批调用：从事件流里取最新一条 approval_pending（仅 awaiting_approval 态展示）
  const pendingApproval: PendingApproval = (() => {
    if (!activeRun || activeRun.status !== "awaiting_approval") return null
    for (let i = runEvents.length - 1; i >= 0; i--) {
      const evItem = runEvents[i]
      if (evItem.event_type === "approval_pending") {
        return {
          toolName: String(evItem.content?.tool_name || ""),
          argsSummary: String(evItem.content?.args_summary || ""),
          stepIndex: Number(evItem.content?.step_index || evItem.step_index || 0),
        }
      }
    }
    return null
  })()

  // harness 核算摘要行（终态与进行中都可看，checkpoint 缺 stats 时为 null）
  const harnessLine = formatHarnessStats(activeRun?.checkpoint)

  const isLive = Boolean(activeRun && LIVE_STATES.includes(activeRun.status))
  const isCustomModel = parseCustomModelValue(model) !== null
  const priceHint = isCustomModel
    ? `自备模型密钥 · ${maxSteps} 步 / ${maxModelCalls} 次调用${maxRuntimeMinutes ? ` / ${maxRuntimeMinutes} 分钟` : ""}（非费用上限）`
    : `按服务商实际用量计费 · ${maxSteps} 步 / ${maxModelCalls} 次调用${maxRuntimeMinutes ? ` / ${maxRuntimeMinutes} 分钟` : ""}`

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    specVersionNotice,
    errorMsg,
    dismissError,
    specList,
    isLoadingSpecs,
    selectedSpecId,
    selectedSpec,
    handleSelectSpec,    recoverableOptimization,
    recoveryError,
    optimizationLinked:Boolean(acceptedOptimizationLineage&&acceptedOptimizationLineage.specId===selectedSpecId),
    handleRestoreOptimization,
    handleUnlinkOptimization,
    retryOptimizationRecovery:()=>setRecoveryRevision(n=>n+1),

    customModels,
    genWfBusy,
    handleGenerateWorkflow,
    isCustomModel,
    model,
    setModel,
    connectedToolNames,
    runReadiness,
    marketToolCount,
    toolConnectionsLoading,
    toolConnectionsError,
    connectedMarketTools,
    refreshToolConnections,
    builtinTools: BUILTIN_TOOLS,
    enabledTools,
    handleToggleTool,
    maxSteps,
    setMaxSteps,
    maxModelCalls,
    setMaxModelCalls,
    maxRuntimeMinutes,
    setMaxRuntimeMinutes,
    stopCondition,
    setStopCondition,
    stopOnComplete,
    setStopOnComplete,
    instruction,
    setInstruction,
    localDeviceId,
    setLocalDeviceId,
    isStarting,
    handleRun,
    activeRun,
    runEvents,
    isLive,
    controlBusy,
    handleControl,
    runStateMeta: RUN_STATE_META,
    handleCopyResult,
    copiedFlag,
    runHistory,
    handleViewHistoryRun,
    priceHint,
    requirePlanReview,
    handleTogglePlanReview,
    requireApproval,
    handleToggleRequireApproval,
    pendingInput,
    replyText,    pendingInputKind,

    setReplyText,
    replyBusy,
    handleReply,
    pendingApproval,
    approvalBusy,
    handleApproval,
    harnessLine,
    memoryList,
    isLoadingMemories,
    memoryDeletingId,
    handleDeleteMemory,
    evalBusy,
    handleEvaluate,
    qualityBusy,
    qualityError,
    handleSaveQualityChecks,
    feedbackDraft,
    feedbackBusy,
    feedbackEditing,
    feedbackTagOptions: FEEDBACK_TAGS,
    handleSelectFeedbackRating,
    handleToggleFeedbackTag,
    handleFeedbackCommentChange,
    handleSubmitFeedback,
    handleEditFeedback,
    handleCancelFeedbackEdit,
    optimizationSpec,
    optimizeSuccess,
    optimizeBusy,
    optimizeSuggestion,
    optimizeError,
    applyBusy,
    handleOptimizeSpec,
    handlePrepareOptimizedRetest,
    handleApplyOptimize,
    handleDiscardOptimize,
    dismissOptimizeError,
  }
}
