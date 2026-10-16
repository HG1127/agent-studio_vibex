import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import { tickAgentRun } from "@/lib/agentEngine"
import type { AgentSpec, SavedSpecRow } from "@/pages/Home/useHome"
import { PROVIDER_META, normalizeProvider } from "@/pages/ModelConnections/useModelConnections"
import { normalizeAgentQualityChecks, type AgentQualityCheck } from "@/lib/agentQualityChecks"

export type { AgentSpec, SavedSpecRow }

// 与后端 agent_runs.status 完全一致（引擎只会产出这些值；awaiting_approval = 写操作等待用户批准）
export type RunStateKey = "queued" | "running" | "paused" | "awaiting_approval" | "succeeded" | "failed" | "cancelled"

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

export type RunEventType =
  | "status"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "error"
  | "context_compact"
  | "approval_pending"
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
  { id: "knowledge_search", title: "知识库检索", desc: "在方案附带的知识文本中按关键词检索相关片段" },
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
  succeeded: { label: "已完成", badge: "bg-primary/10 text-primary" },
  failed: { label: "失败", badge: "bg-destructive/10 text-destructive" },
  cancelled: { label: "已取消", badge: "bg-destructive/10 text-destructive" },
}

const LIVE_STATES: RunStateKey[] = ["queued", "running", "paused", "awaiting_approval"]
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
  const [searchParams] = useSearchParams()

  const [rhUserId] = useState(() => decodeRhToken()?.sub || LOCAL_ANON_UID)
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const [specList, setSpecList] = useState<SavedSpecRow[]>([])
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false)
  const [selectedSpecId, setSelectedSpecId] = useState("")

  const [model, setModel] = useState("")
  const [enabledTools, setEnabledTools] = useState<string[]>(BUILTIN_TOOLS.map((t) => t.id))
  const [maxSteps, setMaxSteps] = useState(10)
  const [stopCondition, setStopCondition] = useState("")
  const [stopOnComplete, setStopOnComplete] = useState(true)
  const [instruction, setInstruction] = useState("")

  const [isStarting, setIsStarting] = useState(false)
  const [activeRun, setActiveRun] = useState<AgentRunRow | null>(null)
  const [runEvents, setRunEvents] = useState<RunEventRow[]>([])
  const [controlBusy, setControlBusy] = useState<"" | "pause" | "resume" | "cancel">("")
  const [runHistory, setRunHistory] = useState<AgentRunRow[]>([])
  const [copiedFlag, setCopiedFlag] = useState(false)
  const [customModels, setCustomModels] = useState<CustomModelOption[]>([])

  // 审批门 + 方案记忆（harness 增强批次）
  const [requireApproval, setRequireApproval] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState<"" | "approve" | "reject">("")
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
  const [applyBusy, setApplyBusy] = useState(false)

  const tickInFlightRef = useRef(false)
  const pollBusyRef = useRef(false)
  const specParamAppliedRef = useRef(false)

  const selectedSpec = specList.find((row) => row.id === selectedSpecId) || null

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
      specParamAppliedRef.current = true
    })
    return () => { cancelled = true }
  }, [specList, searchParams])

  const loadSpecList = useCallback(async (uid: string) => {
    if (!uid) return
    setIsLoadingSpecs(true)
    try {
      const res = await fetch(`${base}/api/agent_specs?rh_user_id=${encodeURIComponent(uid)}`, {
        headers: { ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data?.items) ? (data.items as SavedSpecRow[]) : []
        setSpecList(items)
      }
    } catch {
      // 列表加载失败不阻塞页面
    } finally {
      setIsLoadingSpecs(false)
    }
  }, [base])

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

  const handleSelectSpec = useCallback(
    (specId: string) => {
      setSelectedSpecId(specId)
      const row = specList.find((item) => item.id === specId)
      if (row?.spec?.done_criteria?.length) {
        setStopCondition(row.spec.done_criteria.join("；"))
      }
      setRequireApproval(Boolean(row?.spec?.require_approval))
    },
    [specList],
  )

  // 「写操作需我确认」开关：本地即时生效 + 写回方案 spec（随保存落库）
  const handleToggleRequireApproval = useCallback(() => {
    const nextValue = !requireApproval
    setRequireApproval(nextValue)
    const row = specList.find((item) => item.id === selectedSpecId) || null
    if (!row) return
    const mergedSpec = { ...row.spec, require_approval: nextValue }
    setSpecList((prev) => prev.map((item) => (item.id === row.id ? { ...item, spec: mergedSpec } : item)))
    void fetch(`${base}/api/agent_specs/${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
      body: JSON.stringify({ spec: mergedSpec }),
    }).catch(() => {
      // 落库失败不阻塞本次运行（启动时 config 仍携带当前开关值）
    })
  }, [requireApproval, specList, selectedSpecId, base])

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
    if (!selectedSpec || !instruction.trim()) return
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
          max_steps: maxSteps,
          stop_condition: stopCondition.trim(),
          stop_on_complete: stopOnComplete,
          require_approval: requireApproval,
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
        setErrorMsg(data?.message || "创建运行失败，请稍后重试")
        return
      }
      const data = await res.json()
      const runId = String(data?.run_id || "")
      setRunEvents([])
      if (runId) {
        const full = await fetchRunRecord(runId)
        if (full) setActiveRun(full)
      }
      void loadRunHistory(rhUserId)
    } catch {
      setErrorMsg("网络异常，创建运行失败，请重试")
    } finally {
      setIsStarting(false)
    }
  }, [
    selectedSpec,
    instruction,
    base,
    model,
    enabledTools,
    maxSteps,
    stopCondition,
    stopOnComplete,
    requireApproval,
    fetchRunRecord,
    loadRunHistory,
    rhUserId,
  ])

  const handleRun = useCallback(() => {
    if (!rhUserId) {
      setNeedsRhLogin(true)
      return
    }
    if (!selectedSpec) {
      setErrorMsg("请先在左侧选择一个助手方案")
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
    if (isStarting || (activeRun && LIVE_STATES.includes(activeRun.status))) return
    // 自备密钥批次：模型调用走用户自己的模型连接，无平台计费，直接启动
    void doStartRun()
  }, [rhUserId, selectedSpec, instruction, isStarting, activeRun, model, doStartRun])

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
        body:JSON.stringify({spec:{...selected.spec,quality_checks}}),
      })
      if (response.status===401 || response.status===412) {
        setNeedsRhLogin(true)
        setQualityError("员工登录态过期，请重新登录后保存检查条件")
        return false
      }
      if (!response.ok) {
        setQualityError("检查条件保存失败，请检查权限或刷新方案后重试")
        return false
      }
      const current=await response.json() as SavedSpecRow
      setSpecList(rows=>rows.map(row=>row.id===selected.id?{
        ...row,...current,spec:{...selected.spec,quality_checks},
      }:row))
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

  // 切换回看的运行时重置反馈草稿；切换方案时收起优化建议卡
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
    })
    return () => { cancelled = true }
  }, [selectedSpecId])

  // 反馈驱动方案优化：聚合该方案全部反馈与最近评估建议 → 一次 LLM 生成改进稿（只生成不写回）
  const doOptimizeSpec = useCallback(async () => {
    if (!selectedSpec) return
    setOptimizeBusy(true)
    setOptimizeError("")
    try {
      const res = await fetch(
        `${base}/api/agent-specs/${encodeURIComponent(selectedSpec.id)}/optimize`,
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
  }, [selectedSpec, base])

  const handleOptimizeSpec = useCallback(() => {
    if (!selectedSpec || optimizeBusy) return
    setOptimizeError("")
    void doOptimizeSpec()
  }, [selectedSpec, optimizeBusy, doOptimizeSpec])

  // 确认写回：建议稿合并进方案（目标 ← suggested_prompt，完成标准 ← suggested_criteria 分条）
  const handleApplyOptimize = useCallback(async () => {
    if (!optimizeSuggestion || !selectedSpec || applyBusy) return
    setApplyBusy(true)
    setErrorMsg("")
    try {
      const criteriaList = optimizeSuggestion.suggested_criteria
        .split(/\n|；|;/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
      const mergedSpec = {
        ...selectedSpec.spec,
        goal: optimizeSuggestion.suggested_prompt,
        ...(criteriaList.length ? { done_criteria: criteriaList } : {}),
      }
      const res = await fetch(`${base}/api/agent_specs/${encodeURIComponent(selectedSpec.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({ spec: mergedSpec }),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再写回方案")
        return
      }
      if (!res.ok) {
        setErrorMsg("写回方案失败，请稍后重试")
        return
      }
      setSpecList((prev) =>
        prev.map((item) => (item.id === selectedSpec.id ? { ...item, spec: mergedSpec } : item)),
      )
      if (criteriaList.length) setStopCondition(criteriaList.join("；"))
      setOptimizeSuggestion(null)
    } catch {
      setErrorMsg("网络异常，写回方案失败，请重试")
    } finally {
      setApplyBusy(false)
    }
  }, [optimizeSuggestion, selectedSpec, applyBusy, base])

  const handleDiscardOptimize = useCallback(() => {
    setOptimizeSuggestion(null)
  }, [])

  const dismissOptimizeError = useCallback(() => setOptimizeError(""), [])

  const handleViewHistoryRun = useCallback(
    async (row: AgentRunRow) => {
      setErrorMsg("")
      setRunEvents([])
      setActiveRun(row)
      try {
        const full = await fetchRunRecord(row.id)
        if (full) setActiveRun(full)
        const items = await fetchRunEvents(row.id)
        setRunEvents(items)
      } catch {
        // 回看失败时保留列表行数据展示状态
      }
    },
    [fetchRunRecord, fetchRunEvents],
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
    ? `使用你自己的密钥，费用由你的服务商计 · 最多 ${maxSteps} 步`
    : `按实际 token 用量扣费 · 最多 ${maxSteps} 步`

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    specList,
    isLoadingSpecs,
    selectedSpecId,
    selectedSpec,
    handleSelectSpec,
    customModels,
    genWfBusy,
    handleGenerateWorkflow,
    isCustomModel,
    model,
    setModel,
    builtinTools: BUILTIN_TOOLS,
    enabledTools,
    handleToggleTool,
    maxSteps,
    setMaxSteps,
    stopCondition,
    setStopCondition,
    stopOnComplete,
    setStopOnComplete,
    instruction,
    setInstruction,
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
    requireApproval,
    handleToggleRequireApproval,
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
    optimizeBusy,
    optimizeSuggestion,
    optimizeError,
    applyBusy,
    handleOptimizeSpec,
    handleApplyOptimize,
    handleDiscardOptimize,
    dismissOptimizeError,
  }
}
