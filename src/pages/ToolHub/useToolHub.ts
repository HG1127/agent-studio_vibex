import { useCallback, useEffect, useRef, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"

// —— 类型：字段名与后端 tool_invocations / 脱敏路由返回 1:1（snake_case，禁止转换层）——
export type InvocationRow = {
  id: string
  tool_name: string
  tool_kind: string
  source: string
  run_id: string
  status: string
  latency_ms: number
  input_summary: string
  output_excerpt: string
  error_code: string
  retried: boolean
  created: string
}

export type DebugResult = {
  ok: boolean
  tool_name: string
  tool_kind: string
  output: string
  error: string
  error_code: string
  latency_ms: number
  retried: boolean
  status_code: number
}

export type HubStats = {
  run_count: number
  agent_run_count: number
  workflow_run_count: number
  invocation_count: number
  success_count: number
  failed_count: number
  retried_count: number
  external_invocation_count: number
}

// —— Harness 监控批次：GET /api/harness/monitor 返回结构（字段名与后端 1:1，snake_case）——
export type MonitorTotals = {
  runs: number
  succeeded: number
  failed: number
  cancelled: number
  success_rate: number
  avg_steps: number
  avg_duration_ms: number
  est_tokens_total: number
  approvals: number
  stuck_loops: number
  compressions: number
  truncations: number
}

export type MonitorToolRow = {
  tool_name: string
  calls: number
  success: number
  failed: number
  retried: number
  avg_latency_ms: number
}

export type MonitorData = {
  totals: MonitorTotals
  tools: MonitorToolRow[]
}

export type WorkerComponent = {
  state: "healthy" | "retrying" | "unverified"
  failures: number
  retry_at_ms: number
}

export type WorkerStatus = {
  enabled: boolean
  alive: boolean
  last_seen: string
  last_step_at: string
  tick_attempts_total: number
  active_claims?: {
    kind: "agent" | "workflow"
    run_id: string
    holder: string
    expires_in_ms: number
    worker_attributed: boolean
  }[]
  active_claims_sampled?: boolean
  instances?: { label: string; last_seen_age_ms: number | null; last_step_at: string; recent: boolean; attempts: number }[]
  instances_recent?: number
  instances_sampled?: boolean
  observed_at_ms?: number
  last_seen_age_ms?: number | null
  components?: { schedules: WorkerComponent; knowledge: WorkerComponent }
  components_observed_at_ms?: number | null
  queue?: {
    agent_running: number
    workflow_running: number
    awaiting_approval: number
    paused: number
    failed_recent: number
    needs_review: number
    scheduled_active: number
    scheduled_pending: number
    scheduled_overdue?: number
    oldest_due_age_ms?: number
    ready_estimate: number
    inflight: number
    expired_lease_candidates?: number
    unresolved_writes?: number
    sampled: boolean
    sample_limit_per_kind: number
  }
}

export type ExternalToolRow = {
  id: string
  name: string
  description: string
  method: string
  status: string
  last_latency_ms: number
  enabled: boolean
}

export type SpecOption = { id: string; name: string }

export type ActiveDebugTarget = {
  kind: "builtin" | "external"
  id: string
  title: string
} | null

// 内置 5 工具静态清单（与后端注册表一致）
export type BuiltinToolMeta = {
  id: string
  title: string
  desc: string
  iconKey: "calculator" | "summarize" | "knowledge" | "fetch" | "search"
  schemaHint: string
}

export const BUILTIN_TOOLS: BuiltinToolMeta[] = [
  { id: "calculate", title: "计算器", desc: "对算术表达式真实求值", iconKey: "calculator", schemaHint: '入参 {"expression":"算术表达式"}，支持 + - * / % 与括号' },
  { id: "summarize", title: "内容摘要", desc: "调用平台模型整理与提炼文本", iconKey: "summarize", schemaHint: '入参 {"text":"要整理的文本","focus":"可选关注重点"}' },
  { id: "knowledge_search", title: "知识检索", desc: "在助手方案的知识文本中按关键词检索", iconKey: "knowledge", schemaHint: '入参 {"query":"关键词","spec_id":"方案"}' },
  { id: "web_fetch", title: "网页抓取", desc: "抓取网页并提取正文文本（截断 4000 字符）", iconKey: "fetch", schemaHint: '入参 {"url":"http(s) 网页地址"}' },
  { id: "web_search", title: "网页搜索", desc: "按关键词搜索网页，返回标题/链接/摘要", iconKey: "search", schemaHint: '入参 {"query":"关键词","limit":条数(≤10)}' },
]

export const SOURCE_META: Record<string, { label: string; badge: string }> = {
  debug: { label: "调试台", badge: "bg-muted text-muted-foreground" },
  agent_run: { label: "助手试跑", badge: "bg-primary/10 text-primary" },
  workflow: { label: "工作流", badge: "bg-secondary text-secondary-foreground" },
}

export const INV_STATUS_META: Record<string, { label: string; badge: string }> = {
  success: { label: "成功", badge: "bg-primary/10 text-primary" },
  retried_success: { label: "重试后成功", badge: "bg-secondary text-secondary-foreground" },
  failed: { label: "失败", badge: "bg-destructive/10 text-destructive" },
}

export function formatInvocationTime(raw: string): string {
  const s = String(raw || "").replace(" ", "T")
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(raw || "").slice(0, 19)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

class AuthRequiredError extends Error {}

export function useToolHub() {
  const base = getPocketBaseUrl()

  const [rhUserId] = useState(() => {
    const payload = decodeRhToken()
    return payload?.sub ? String(payload.sub) : LOCAL_ANON_UID
  })
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  const [externalTools, setExternalTools] = useState<ExternalToolRow[]>([])
  const [isLoadingExternal, setIsLoadingExternal] = useState(false)
  const [specOptions, setSpecOptions] = useState<SpecOption[]>([])

  const [invocationList, setInvocationList] = useState<InvocationRow[]>([])
  const [isLoadingInvocations, setIsLoadingInvocations] = useState(false)
  const [invocationFilter, setInvocationFilter] = useState("")
  const [expandedInvocationId, setExpandedInvocationId] = useState("")

  const [hubStats, setHubStats] = useState<HubStats | null>(null)

  // Harness 监控（手动刷新，不做轮询）
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null)
  const [monitorLoading, setMonitorLoading] = useState(false)
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null)

  // 调试台
  const [activeTarget, setActiveTarget] = useState<ActiveDebugTarget>(null)
  const [debugExpression, setDebugExpression] = useState("")
  const [debugText, setDebugText] = useState("")
  const [debugFocus, setDebugFocus] = useState("")
  const [debugKeyword, setDebugKeyword] = useState("")
  const [debugSpecId, setDebugSpecId] = useState("")
  const [debugUrl, setDebugUrl] = useState("")
  const [debugQuery, setDebugQuery] = useState("")
  const [debugLimit, setDebugLimit] = useState("5")
  const [debugExternalInput, setDebugExternalInput] = useState("")
  const [confirmExternalWrite, setConfirmExternalWrite] = useState(false)
  const selectedExternal = activeTarget?.kind === "external"
    ? externalTools.find(item => item.id === activeTarget.id) : undefined
  const requiresWriteConfirmation = Boolean(selectedExternal && String(selectedExternal.method || "POST").toUpperCase() !== "GET")
  const [isDebugging, setIsDebugging] = useState(false)
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null)
  const [copiedFlag, setCopiedFlag] = useState(false)
  const pollTimerRef = useRef<number | null>(null)

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...vibexAuthHeaders(),
          ...(init?.headers || {}),
        },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        throw new AuthRequiredError("登录态已过期，请重新登录")
      }
      return res
    },
    [base],
  )

  const loadExternalTools = useCallback(async () => {
    if (!rhUserId) return
    setIsLoadingExternal(true)
    try {
      const res = await apiFetch("/api/tool-connections")
      if (res.ok) {
        const data = await res.json()
        const rows = Array.isArray(data?.items) ? (data.items as ExternalToolRow[]) : []
        setExternalTools(rows.filter((row) => row.enabled))
      }
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("外部工具列表加载失败，请稍后重试")
    } finally {
      setIsLoadingExternal(false)
    }
  }, [apiFetch, rhUserId])

  const loadSpecOptions = useCallback(async () => {
    if (!rhUserId) return
    try {
      const res = await apiFetch(`/api/agent_specs?rh_user_id=${encodeURIComponent(rhUserId)}`)
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items) ? (data.items as { id: string; name: string }[]) : []
      setSpecOptions(items.map((item) => ({ id: String(item.id), name: String(item.name || "未命名方案") })))
    } catch {
      // 方案列表失败不阻塞主流程，知识检索时再提示
    }
  }, [apiFetch, rhUserId])

  const loadInvocations = useCallback(
    async (silent = false) => {
      if (!rhUserId) return
      if (!silent) setIsLoadingInvocations(true)
      try {
        const qs = invocationFilter ? `&tool_name=${encodeURIComponent(invocationFilter)}` : ""
        const res = await apiFetch(`/api/tool-hub/invocations?limit=50${qs}`)
        if (res.ok) {
          const data = await res.json()
          setInvocationList(Array.isArray(data?.items) ? (data.items as InvocationRow[]) : [])
        }
      } catch (err) {
        if (!(err instanceof AuthRequiredError) && !silent) setErrorMsg("调用记录加载失败，请稍后重试")
      } finally {
        if (!silent) setIsLoadingInvocations(false)
      }
    },
    [apiFetch, invocationFilter, rhUserId],
  )

  const loadStats = useCallback(async () => {
    if (!rhUserId) return
    try {
      const res = await apiFetch("/api/tool-hub/stats")
      if (!res.ok) return
      const data = await res.json()
      setHubStats({
        run_count: Number(data?.run_count || 0),
        agent_run_count: Number(data?.agent_run_count || 0),
        workflow_run_count: Number(data?.workflow_run_count || 0),
        invocation_count: Number(data?.invocation_count || 0),
        success_count: Number(data?.success_count || 0),
        failed_count: Number(data?.failed_count || 0),
        retried_count: Number(data?.retried_count || 0),
        external_invocation_count: Number(data?.external_invocation_count || 0),
      })
    } catch {
      // 统计失败静默，不阻塞主流程
    }
  }, [apiFetch, rhUserId])

  const loadMonitor = useCallback(async () => {
    if (!rhUserId) return
    setMonitorLoading(true)
    try {
      const res = await apiFetch("/api/harness/monitor")
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.message || "监控数据加载失败，请稍后重试")
        return
      }
      const t = data.totals || {}
      const rows = Array.isArray(data.tools) ? (data.tools as MonitorToolRow[]) : []
      setMonitorData({
        totals: {
          runs: Number(t.runs || 0),
          succeeded: Number(t.succeeded || 0),
          failed: Number(t.failed || 0),
          cancelled: Number(t.cancelled || 0),
          success_rate: Number(t.success_rate || 0),
          avg_steps: Number(t.avg_steps || 0),
          avg_duration_ms: Number(t.avg_duration_ms || 0),
          est_tokens_total: Number(t.est_tokens_total || 0),
          approvals: Number(t.approvals || 0),
          stuck_loops: Number(t.stuck_loops || 0),
          compressions: Number(t.compressions || 0),
          truncations: Number(t.truncations || 0),
        },
        tools: rows.map((r) => ({
          tool_name: String(r.tool_name || ""),
          calls: Number(r.calls || 0),
          success: Number(r.success || 0),
          failed: Number(r.failed || 0),
          retried: Number(r.retried || 0),
          avg_latency_ms: Number(r.avg_latency_ms || 0),
        })),
      })
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("监控数据加载失败，请稍后重试")
    } finally {
      setMonitorLoading(false)
    }
  }, [apiFetch, rhUserId])

  const loadWorkerStatus = useCallback(async () => {
    if (!rhUserId) return
    try {
      const response = await apiFetch("/api/worker/status")
      if (!response.ok) return
      const data = await response.json()
      setWorkerStatus({
        enabled: Boolean(data.enabled),
        alive: Boolean(data.alive),
        last_seen: String(data.last_seen || ""),
        last_step_at: String(data.last_step_at || ""),
        tick_attempts_total: Number(data.tick_attempts_total || 0),
        queue: data.queue && typeof data.queue === "object" ? {
          agent_running: Number(data.queue.agent_running || 0),
          workflow_running: Number(data.queue.workflow_running || 0),
          awaiting_approval: Number(data.queue.awaiting_approval || 0),
          paused: Number(data.queue.paused || 0),
          failed_recent: Number(data.queue.failed_recent || 0),
          needs_review: Number(data.queue.needs_review || 0),
          scheduled_active: Number(data.queue.scheduled_active || 0),
          scheduled_pending: Number(data.queue.scheduled_pending || 0),
          ready_estimate: Number(data.queue.ready_estimate || 0),
          inflight: Number(data.queue.inflight || 0),
          sampled: Boolean(data.queue.sampled),
          sample_limit_per_kind: Number(data.queue.sample_limit_per_kind || 100),
        } : undefined,
      })
    } catch {
      // Worker status is supplementary and must not block tool debugging.
    }
  }, [apiFetch, rhUserId])

  useEffect(() => {
    if (!rhUserId) return
    let current = true
    void Promise.resolve().then(() => {
      if (!current) return
      void loadExternalTools()
      void loadSpecOptions()
      void loadInvocations()
      void loadStats()
      void loadMonitor()
    })
    return () => { current = false }
  }, [rhUserId, loadExternalTools, loadSpecOptions, loadInvocations, loadStats, loadMonitor])

  useEffect(() => {
    if (!rhUserId) return
    let current = true
    void Promise.resolve().then(() => { if (current) void loadWorkerStatus() })
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadWorkerStatus()
    }, 15000)
    return () => { current = false; window.clearInterval(timer) }
  }, [rhUserId, loadWorkerStatus])

  // 调用记录 5s 可见轮询（页面隐藏时暂停）
  useEffect(() => {
    if (!rhUserId) return
    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current)
    pollTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadInvocations(true)
    }, 5000)
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [rhUserId, loadInvocations])

  const dismissError = useCallback(() => setErrorMsg(""), [])
  const dismissNotice = useCallback(() => setNoticeMsg(""), [])

  const openBuiltinDebug = useCallback((toolId: string) => {
    setConfirmExternalWrite(false)
    const meta = BUILTIN_TOOLS.find((item) => item.id === toolId)
    if (!meta) return
    setActiveTarget((prev) => (prev && prev.kind === "builtin" && prev.id === toolId ? null : { kind: "builtin", id: toolId, title: meta.title }))
    setDebugResult(null)
    setCopiedFlag(false)
    setErrorMsg("")
  }, [])

  const openExternalDebug = useCallback((row: ExternalToolRow) => {
    setConfirmExternalWrite(false)
    setActiveTarget((prev) => (prev && prev.kind === "external" && prev.id === row.id ? null : { kind: "external", id: row.id, title: row.name }))
    setDebugResult(null)
    setCopiedFlag(false)
    setErrorMsg("")
  }, [])

  const closeDebug = useCallback(() => {
    setConfirmExternalWrite(false)
    setActiveTarget(null)
    setDebugResult(null)
    setCopiedFlag(false)
  }, [])

  const buildDebugBody = useCallback((): Record<string, unknown> | null => {
    if (!activeTarget) return null
    if (activeTarget.kind === "external") {
      return { connection_id: activeTarget.id, input: debugExternalInput.trim() || "{}",
        ...(requiresWriteConfirmation ? {confirm_write: confirmExternalWrite} : {}) }
    }
    const toolId = activeTarget.id
    if (toolId === "calculate") {
      if (!debugExpression.trim()) {
        setErrorMsg("请先填写要计算的表达式")
        return null
      }
      return { tool_name: toolId, params: { expression: debugExpression.trim() } }
    }
    if (toolId === "summarize") {
      if (!debugText.trim()) {
        setErrorMsg("请先填写要整理的文本")
        return null
      }
      return { tool_name: toolId, params: { text: debugText.trim(), focus: debugFocus.trim() } }
    }
    if (toolId === "knowledge_search") {
      if (!debugKeyword.trim()) {
        setErrorMsg("请先填写检索关键词")
        return null
      }
      if (!debugSpecId) {
        setErrorMsg("请选择要检索的助手方案")
        return null
      }
      return { tool_name: toolId, params: { query: debugKeyword.trim(), spec_id: debugSpecId } }
    }
    if (toolId === "web_fetch") {
      if (!/^https?:\/\//i.test(debugUrl.trim())) {
        setErrorMsg("请填写以 http:// 或 https:// 开头的网页地址")
        return null
      }
      return { tool_name: toolId, params: { url: debugUrl.trim() } }
    }
    if (!debugQuery.trim()) {
      setErrorMsg("请先填写搜索关键词")
      return null
    }
    return { tool_name: toolId, params: { query: debugQuery.trim(), limit: Number(debugLimit) || 5 } }
  }, [activeTarget, confirmExternalWrite, requiresWriteConfirmation, debugExpression, debugExternalInput, debugFocus, debugKeyword, debugLimit, debugQuery, debugSpecId, debugText, debugUrl])

  const runDebug = useCallback(async () => {
    if (!activeTarget || isDebugging) return
    setErrorMsg("")
    const body = buildDebugBody()
    if (!body) return
    if (requiresWriteConfirmation && !confirmExternalWrite) {
      setErrorMsg("外部 POST 调试会真实修改数据或产生费用，请先勾选本次执行确认")
      return
    }
    setIsDebugging(true)
    setDebugResult(null)
    setCopiedFlag(false)
    try {
      // 走 /api/llm/ 前缀路径：网关按登录态注入访客 key（summarize 用平台模型时访客自付）
      const res = await apiFetch("/api/llm/tool-hub/debug", {
        method: "POST",
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "试跑请求失败，请稍后重试")
        return
      }
      setDebugResult({
        ok: Boolean(data?.ok),
        tool_name: String(data?.tool_name || ""),
        tool_kind: String(data?.tool_kind || ""),
        output: String(data?.output || ""),
        error: String(data?.error || ""),
        error_code: String(data?.error_code || ""),
        latency_ms: Number(data?.latency_ms || 0),
        retried: Boolean(data?.retried),
        status_code: Number(data?.status_code || 0),
      })
      void loadInvocations(true)
      void loadStats()
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，试跑失败，请重试")
    } finally {
      setIsDebugging(false)
      setConfirmExternalWrite(false)
    }
  }, [activeTarget, apiFetch, buildDebugBody, confirmExternalWrite, requiresWriteConfirmation, isDebugging, loadInvocations, loadStats])

  const copyDebugOutput = useCallback(async () => {
    if (!debugResult || !debugResult.output) return
    try {
      await navigator.clipboard.writeText(debugResult.output)
      setCopiedFlag(true)
      window.setTimeout(() => setCopiedFlag(false), 1600)
    } catch {
      setNoticeMsg("当前浏览器不允许复制，请手动选中输出文本")
    }
  }, [debugResult])

  const applyInvocationFilter = useCallback((toolName: string) => {
    setInvocationFilter((prev) => (prev === toolName ? "" : toolName))
    setExpandedInvocationId("")
  }, [])

  const toggleInvocationRow = useCallback((rowId: string) => {
    setExpandedInvocationId((prev) => (prev === rowId ? "" : rowId))
  }, [])

  const refreshNow = useCallback(() => {
    void loadInvocations()
    void loadStats()
    void loadExternalTools()
    void loadMonitor()
    setNoticeMsg("已刷新调用记录与统计")
    void loadWorkerStatus()
  }, [loadExternalTools, loadInvocations, loadMonitor, loadStats, loadWorkerStatus])

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    noticeMsg,
    dismissNotice,
    builtinTools: BUILTIN_TOOLS,
    externalTools,
    isLoadingExternal,
    specOptions,
    invocationList,
    isLoadingInvocations,
    invocationFilter,
    applyInvocationFilter,
    expandedInvocationId,
    toggleInvocationRow,
    hubStats,
    monitorData,
    monitorLoading,
    refreshMonitor: loadMonitor,
    workerStatus,
    refreshWorkerStatus: loadWorkerStatus,
    activeTarget,
    openBuiltinDebug,
    openExternalDebug,
    closeDebug,
    debugExpression,
    setDebugExpression,
    debugText,
    setDebugText,
    debugFocus,
    setDebugFocus,
    debugKeyword,
    setDebugKeyword,
    debugSpecId,
    setDebugSpecId,
    debugUrl,
    setDebugUrl,
    debugQuery,
    setDebugQuery,
    debugLimit,
    setDebugLimit,
    debugExternalInput,
    setDebugExternalInput,
    confirmExternalWrite,
    setConfirmExternalWrite,
    requiresWriteConfirmation,
    isDebugging,
    debugResult,
    copiedFlag,
    runDebug,
    copyDebugOutput,
    refreshNow,
    sourceMeta: SOURCE_META,
    invStatusMeta: INV_STATUS_META,
  }
}
