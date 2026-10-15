import { useCallback, useEffect, useRef, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"

// —— 类型：字段名与后端 integrate_api.pb.js 返回 1:1（snake_case，禁止转换层）——
export type AgentItem = {
  agent_id: string
  name: string
  version_no: number
  version_id: string
  published_at: string
}

export type KeyItem = {
  id: string
  name: string
  token_tail: string
  enabled: boolean
  created: string
}

export type RevealedKey = {
  id: string
  name: string
  token: string
} | null

export type InvocationItem = {
  id: string
  agent_id: string
  token_id: string
  token_name: string
  source: string
  run_id: string
  input_summary: string
  status: string
  latency_ms: number
  error_code: string
  created: string
}

export type StatsData = {
  total: number
  success: number
  failed: number
  running: number
  today: number
  source_embed: number
  source_api: number
  success_rate: number
}

export type TestEvent = {
  step_index: number
  seq: number
  event_type: string
  content: Record<string, unknown>
  created: string
}

export const ACCENT_PRESETS = [
  { id: "coral", label: "珊瑚红" },
  { id: "sunset", label: "落日橙" },
  { id: "ocean", label: "海洋蓝" },
  { id: "forest", label: "森林绿" },
] as const

export const POSITION_OPTIONS = [
  { id: "bottom_right", label: "右下角" },
  { id: "bottom_left", label: "左下角" },
] as const

export const INV_SOURCE_META: Record<string, { label: string; badge: string }> = {
  embed: { label: "网页嵌入", badge: "bg-primary/10 text-primary" },
  api: { label: "API 钥匙", badge: "bg-secondary text-secondary-foreground" },
}

export const INV_STATUS_META: Record<string, { label: string; badge: string }> = {
  running: { label: "运行中", badge: "bg-secondary text-secondary-foreground" },
  success: { label: "成功", badge: "bg-primary/10 text-primary" },
  failed: { label: "失败", badge: "bg-destructive/10 text-destructive" },
}

export const TEST_EVENT_META: Record<string, { label: string; badge: string }> = {
  status: { label: "状态", badge: "bg-secondary text-secondary-foreground" },
  thinking: { label: "思考", badge: "bg-primary/10 text-primary" },
  tool_call: { label: "调用工具", badge: "bg-secondary text-secondary-foreground" },
  tool_result: { label: "工具结果", badge: "bg-muted text-muted-foreground" },
  context_compact: { label: "上下文整理", badge: "bg-muted text-muted-foreground" },
  error: { label: "错误", badge: "bg-destructive/10 text-destructive" },
}

export function formatInvocationTime(raw: string): string {
  const s = String(raw || "").replace(" ", "T")
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(raw || "").slice(0, 19)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatLatency(ms: number): string {
  const n = Number(ms || 0)
  if (n <= 0) return "—"
  if (n < 1000) return `${n} ms`
  return `${(n / 1000).toFixed(1)} s`
}

class AuthRequiredError extends Error {}

export function useIntegrate() {
  const base = getPocketBaseUrl()

  const [rhUserId, setRhUserId] = useState("")
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  // 已发布助手
  const [agentList, setAgentList] = useState<AgentItem[]>([])
  const [isLoadingAgents, setIsLoadingAgents] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState("")

  // 嵌入配置
  const [embedToken, setEmbedToken] = useState("")
  const [embedExists, setEmbedExists] = useState(false)
  const [embedEnabled, setEmbedEnabled] = useState(true)
  const [embedTitle, setEmbedTitle] = useState("")
  const [embedPosition, setEmbedPosition] = useState<string>("bottom_right")
  const [embedAccent, setEmbedAccent] = useState<string>("coral")
  const [isSavingEmbed, setIsSavingEmbed] = useState(false)
  const [isLoadingEmbed, setIsLoadingEmbed] = useState(false)

  // API 钥匙
  const [keyList, setKeyList] = useState<KeyItem[]>([])
  const [isLoadingKeys, setIsLoadingKeys] = useState(false)
  const [keyName, setKeyName] = useState("")
  const [isCreatingKey, setIsCreatingKey] = useState(false)
  const [revealedKey, setRevealedKey] = useState<RevealedKey>(null)

  // 调用留档与统计
  const [invocationList, setInvocationList] = useState<InvocationItem[]>([])
  const [isLoadingInvocations, setIsLoadingInvocations] = useState(false)
  const [sourceFilter, setSourceFilter] = useState("")
  const [expandedInvocationId, setExpandedInvocationId] = useState("")
  const [statsRow, setStatsRow] = useState<StatsData | null>(null)

  // 在线试调（真实链路：与外部 API 完全相同的创建 + 轮询）
  const [testKeyId, setTestKeyId] = useState("")
  const [testInput, setTestInput] = useState("")
  const [isTesting, setIsTesting] = useState(false)
  const [testRunId, setTestRunId] = useState("")
  const [testRunStatus, setTestRunStatus] = useState("")
  const [testEvents, setTestEvents] = useState<TestEvent[]>([])
  const [testResult, setTestResult] = useState("")
  const [testError, setTestError] = useState("")
  const [testLatency, setTestLatency] = useState(0)
  const testTimerRef = useRef<number | null>(null)
  const listTimerRef = useRef<number | null>(null)

  const [copiedField, setCopiedField] = useState("")

  useEffect(() => {
    const payload = decodeRhToken()
    setRhUserId(payload?.sub ? String(payload.sub) : LOCAL_ANON_UID)
  }, [])

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

  const loadAgents = useCallback(async () => {
    if (!rhUserId) return
    setIsLoadingAgents(true)
    try {
      const res = await apiFetch("/api/integrate/agents")
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "已发布助手列表加载失败，请稍后重试")
        return
      }
      const items = Array.isArray(data?.items) ? (data.items as AgentItem[]) : []
      setAgentList(items)
      if (items.length > 0) {
        setSelectedAgentId((prev) => (prev && items.some((it) => it.agent_id === prev) ? prev : items[0].agent_id))
      }
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("已发布助手列表加载失败，请检查网络后重试")
    } finally {
      setIsLoadingAgents(false)
    }
  }, [apiFetch, rhUserId])

  const loadEmbedConfig = useCallback(
    async (agentId: string) => {
      if (!agentId) return
      setIsLoadingEmbed(true)
      try {
        const res = await apiFetch(`/api/integrate/embed-config?agent_id=${encodeURIComponent(agentId)}`)
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "嵌入配置加载失败，请稍后重试")
          return
        }
        if (!data?.exists) {
          setEmbedExists(false)
          setEmbedToken("")
          setEmbedEnabled(true)
          setEmbedTitle("")
          setEmbedPosition("bottom_right")
          setEmbedAccent("coral")
          return
        }
        setEmbedExists(true)
        setEmbedToken(String(data?.token || ""))
        setEmbedEnabled(Boolean(data?.enabled))
        setEmbedTitle(String(data?.theme?.title || ""))
        setEmbedPosition(String(data?.theme?.position || "bottom_right"))
        setEmbedAccent(String(data?.theme?.accent || "coral"))
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("嵌入配置加载失败，请检查网络后重试")
      } finally {
        setIsLoadingEmbed(false)
      }
    },
    [apiFetch],
  )

  const loadKeys = useCallback(
    async (agentId: string) => {
      if (!agentId) return
      setIsLoadingKeys(true)
      try {
        const res = await apiFetch(`/api/integrate/keys?agent_id=${encodeURIComponent(agentId)}`)
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "调用钥匙列表加载失败，请稍后重试")
          return
        }
        const items = Array.isArray(data?.items) ? (data.items as KeyItem[]) : []
        setKeyList(items)
        setTestKeyId((prev) => {
          const firstEnabled = items.find((it) => it.enabled)
          if (prev && items.some((it) => it.id === prev && it.enabled)) return prev
          return firstEnabled ? firstEnabled.id : ""
        })
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("调用钥匙列表加载失败，请检查网络后重试")
      } finally {
        setIsLoadingKeys(false)
      }
    },
    [apiFetch],
  )

  const loadInvocations = useCallback(
    async (silent = false) => {
      if (!rhUserId) return
      if (!silent) setIsLoadingInvocations(true)
      try {
        let qs = "limit=50"
        if (selectedAgentId) qs += `&agent_id=${encodeURIComponent(selectedAgentId)}`
        if (sourceFilter === "embed" || sourceFilter === "api") qs += `&source=${sourceFilter}`
        const res = await apiFetch(`/api/integrate/invocations?${qs}`)
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        setInvocationList(Array.isArray(data?.items) ? (data.items as InvocationItem[]) : [])
      } catch {
        // 静默失败，不打断操作
      } finally {
        if (!silent) setIsLoadingInvocations(false)
      }
    },
    [apiFetch, rhUserId, selectedAgentId, sourceFilter],
  )

  const loadStats = useCallback(async () => {
    if (!rhUserId) return
    try {
      let qs = ""
      if (selectedAgentId) qs = `?agent_id=${encodeURIComponent(selectedAgentId)}`
      const res = await apiFetch(`/api/integrate/stats${qs}`)
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      setStatsRow({
        total: Number(data?.total || 0),
        success: Number(data?.success || 0),
        failed: Number(data?.failed || 0),
        running: Number(data?.running || 0),
        today: Number(data?.today || 0),
        source_embed: Number(data?.source_embed || 0),
        source_api: Number(data?.source_api || 0),
        success_rate: Number(data?.success_rate || 0),
      })
    } catch {
      // 统计失败静默
    }
  }, [apiFetch, rhUserId, selectedAgentId])

  // 选中助手变化 → 拉该助手的嵌入配置 / 钥匙 / 留档 / 统计
  useEffect(() => {
    if (!rhUserId) return
    void loadEmbedConfig(selectedAgentId)
    void loadKeys(selectedAgentId)
  }, [rhUserId, selectedAgentId, loadEmbedConfig, loadKeys])

  useEffect(() => {
    if (!rhUserId) return
    void loadAgents()
  }, [rhUserId, loadAgents])

  useEffect(() => {
    if (!rhUserId) return
    void loadInvocations()
    void loadStats()
  }, [rhUserId, loadInvocations, loadStats])

  // 留档 5s 可见轮询
  useEffect(() => {
    if (!rhUserId) return
    if (listTimerRef.current !== null) window.clearInterval(listTimerRef.current)
    listTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadInvocations(true)
        void loadStats()
      }
    }, 5000)
    return () => {
      if (listTimerRef.current !== null) window.clearInterval(listTimerRef.current)
      listTimerRef.current = null
    }
  }, [rhUserId, loadInvocations, loadStats])

  useEffect(() => {
    return () => {
      if (testTimerRef.current !== null) window.clearTimeout(testTimerRef.current)
      testTimerRef.current = null
    }
  }, [])

  const dismissError = useCallback(() => setErrorMsg(""), [])
  const dismissNotice = useCallback(() => setNoticeMsg(""), [])

  const selectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    setTestRunId("")
    setTestRunStatus("")
    setTestEvents([])
    setTestResult("")
    setTestError("")
    setTestLatency(0)
    setIsTesting(false)
    if (testTimerRef.current !== null) window.clearTimeout(testTimerRef.current)
    testTimerRef.current = null
  }, [])

  const saveEmbedConfig = useCallback(async () => {
    if (!selectedAgentId) {
      setErrorMsg("请先选择要发布的助手")
      return
    }
    setIsSavingEmbed(true)
    setErrorMsg("")
    try {
      const res = await apiFetch("/api/integrate/embed-config", {
        method: "POST",
        body: JSON.stringify({
          agent_id: selectedAgentId,
          enabled: embedEnabled,
          theme: { position: embedPosition, accent: embedAccent, title: embedTitle.trim() },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "嵌入配置保存失败，请稍后重试")
        return
      }
      setEmbedExists(true)
      setEmbedToken(String(data?.token || ""))
      setEmbedEnabled(Boolean(data?.enabled))
      setEmbedTitle(String(data?.theme?.title || ""))
      setNoticeMsg("嵌入配置已保存，右侧预览与嵌入代码已同步更新")
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，嵌入配置保存失败，请重试")
    } finally {
      setIsSavingEmbed(false)
    }
  }, [apiFetch, embedAccent, embedEnabled, embedPosition, embedTitle, selectedAgentId])

  const toggleEmbedEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!selectedAgentId) return
      setEmbedEnabled(nextEnabled)
      try {
        const res = await apiFetch("/api/integrate/embed-config", {
          method: "POST",
          body: JSON.stringify({ agent_id: selectedAgentId, enabled: nextEnabled }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setEmbedEnabled(!nextEnabled)
          setErrorMsg(data?.message || "嵌入开关更新失败，请稍后重试")
          return
        }
        setEmbedToken(String(data?.token || ""))
        setNoticeMsg(nextEnabled ? "网页嵌入已开启，嵌入代码立即可用" : "网页嵌入已停用，外部页面将无法继续对话")
      } catch (err) {
        setEmbedEnabled(!nextEnabled)
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，嵌入开关更新失败，请重试")
      }
    },
    [apiFetch, selectedAgentId],
  )

  const createKey = useCallback(async () => {
    const trimmedName = keyName.trim()
    if (!selectedAgentId) {
      setErrorMsg("请先选择要发布的助手")
      return
    }
    if (!trimmedName) {
      setErrorMsg("请先给钥匙起个名字（例如：官网客服位）")
      return
    }
    setIsCreatingKey(true)
    setErrorMsg("")
    try {
      const res = await apiFetch("/api/integrate/keys", {
        method: "POST",
        body: JSON.stringify({ agent_id: selectedAgentId, name: trimmedName }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "钥匙创建失败，请稍后重试")
        return
      }
      setRevealedKey({ id: String(data?.id || ""), name: String(data?.name || trimmedName), token: String(data?.token || "") })
      setKeyName("")
      void loadKeys(selectedAgentId)
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，钥匙创建失败，请重试")
    } finally {
      setIsCreatingKey(false)
    }
  }, [apiFetch, keyName, loadKeys, selectedAgentId])

  const reissueKey = useCallback(
    async (id: string) => {
      setErrorMsg("")
      try {
        const res = await apiFetch(`/api/integrate/keys/${encodeURIComponent(id)}/reissue`, { method: "POST" })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "钥匙重发失败，请稍后重试")
          return
        }
        setRevealedKey({ id: String(data?.id || id), name: String(data?.name || ""), token: String(data?.token || "") })
        void loadKeys(selectedAgentId)
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，钥匙重发失败，请重试")
      }
    },
    [apiFetch, loadKeys, selectedAgentId],
  )

  const revokeKey = useCallback(
    async (id: string) => {
      setErrorMsg("")
      try {
        const res = await apiFetch(`/api/integrate/keys/${encodeURIComponent(id)}`, { method: "DELETE" })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "钥匙吊销失败，请稍后重试")
          return
        }
        setNoticeMsg("钥匙已吊销，持旧钥匙的外部调用会立即被拒绝")
        void loadKeys(selectedAgentId)
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，钥匙吊销失败，请重试")
      }
    },
    [apiFetch, loadKeys, selectedAgentId],
  )

  const closeRevealed = useCallback(() => setRevealedKey(null), [])

  const stopTestPolling = useCallback(() => {
    if (testTimerRef.current !== null) window.clearTimeout(testTimerRef.current)
    testTimerRef.current = null
  }, [])

  const pollTestRun = useCallback(
    async (keyId: string, runId: string) => {
      try {
        const res = await apiFetch(`/api/integrate/test-run/poll?key_id=${encodeURIComponent(keyId)}&run_id=${encodeURIComponent(runId)}`)
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setIsTesting(false)
          setTestRunStatus("failed")
          setTestError(data?.message || "试调查询失败，请稍后重试")
          return
        }
        setTestRunStatus(String(data?.status || ""))
        setTestEvents(Array.isArray(data?.events) ? (data.events as TestEvent[]) : [])
        setTestResult(String(data?.result || ""))
        setTestError(String(data?.error || ""))
        setTestLatency(Number(data?.latency_ms || 0))
        const st = String(data?.status || "")
        if (st === "succeeded" || st === "failed" || st === "cancelled") {
          setIsTesting(false)
          stopTestPolling()
          void loadInvocations(true)
          void loadStats()
          return
        }
        testTimerRef.current = window.setTimeout(() => void pollTestRun(keyId, runId), 2500)
      } catch (err) {
        if (err instanceof AuthRequiredError) {
          setIsTesting(false)
          stopTestPolling()
          return
        }
        // 网络抖动：稍后继续轮询，不中断试调
        testTimerRef.current = window.setTimeout(() => void pollTestRun(keyId, runId), 4000)
      }
    },
    [apiFetch, loadInvocations, loadStats, stopTestPolling],
  )

  const runTest = useCallback(async () => {
    if (isTesting) return
    if (!testKeyId) {
      setErrorMsg("请先在上方创建一把调用钥匙，再选择它进行试调")
      return
    }
    const input = testInput.trim()
    if (!input) {
      setErrorMsg("请填写要试调的任务指令")
      return
    }
    setErrorMsg("")
    setIsTesting(true)
    setTestRunId("")
    setTestRunStatus("running")
    setTestEvents([])
    setTestResult("")
    setTestError("")
    setTestLatency(0)
    try {
      const res = await apiFetch("/api/integrate/test-run", {
        method: "POST",
        body: JSON.stringify({ key_id: testKeyId, input }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setIsTesting(false)
        setTestRunStatus("")
        setErrorMsg(data?.message || "试调启动失败，请稍后重试")
        return
      }
      const runId = String(data?.run_id || "")
      setTestRunId(runId)
      testTimerRef.current = window.setTimeout(() => void pollTestRun(testKeyId, runId), 1200)
    } catch (err) {
      setIsTesting(false)
      setTestRunStatus("")
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，试调启动失败，请重试")
    }
  }, [apiFetch, isTesting, pollTestRun, testInput, testKeyId])

  const resetTest = useCallback(() => {
    stopTestPolling()
    setIsTesting(false)
    setTestRunId("")
    setTestRunStatus("")
    setTestEvents([])
    setTestResult("")
    setTestError("")
    setTestLatency(0)
  }, [stopTestPolling])

  const applySourceFilter = useCallback((source: string) => {
    setSourceFilter((prev) => (prev === source ? "" : source))
    setExpandedInvocationId("")
  }, [])

  const toggleInvocationRow = useCallback((rowId: string) => {
    setExpandedInvocationId((prev) => (prev === rowId ? "" : rowId))
  }, [])

  const copyText = useCallback(async (field: string, text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      window.setTimeout(() => setCopiedField(""), 1600)
    } catch {
      setNoticeMsg("当前浏览器不允许复制，请手动选中文本")
    }
  }, [])

  const refreshNow = useCallback(() => {
    void loadInvocations()
    void loadStats()
    void loadKeys(selectedAgentId)
    setNoticeMsg("已刷新调用记录、统计与钥匙列表")
  }, [loadInvocations, loadKeys, loadStats, selectedAgentId])

  // 嵌入预览与代码片段（预览带实时主题参数，与保存后的嵌入页一致）
  const selectedAgent = agentList.find((it) => it.agent_id === selectedAgentId) || null
  const previewTitle = embedTitle.trim() || selectedAgent?.name || "AI 助手"
  const embedPageUrl = embedToken ? `${base}/embed/${embedToken}` : ""
  const embedPreviewUrl = embedToken
    ? `${base}/embed/${embedToken}?accent=${encodeURIComponent(embedAccent)}&title=${encodeURIComponent(previewTitle)}`
    : ""
  const embedSnippet = embedToken ? `<script src="${base}/embed.js?token=${embedToken}"></script>` : ""
  const apiBaseForDocs = `${base}/api/public/agent`

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    noticeMsg,
    dismissNotice,
    agentList,
    isLoadingAgents,
    selectedAgentId,
    selectedAgent,
    selectAgent,
    embedToken,
    embedExists,
    embedEnabled,
    embedTitle,
    setEmbedTitle,
    embedPosition,
    setEmbedPosition,
    embedAccent,
    setEmbedAccent,
    isSavingEmbed,
    isLoadingEmbed,
    saveEmbedConfig,
    toggleEmbedEnabled,
    embedPageUrl,
    embedPreviewUrl,
    embedSnippet,
    keyList,
    isLoadingKeys,
    keyName,
    setKeyName,
    isCreatingKey,
    createKey,
    reissueKey,
    revokeKey,
    revealedKey,
    closeRevealed,
    invocationList,
    isLoadingInvocations,
    sourceFilter,
    applySourceFilter,
    expandedInvocationId,
    toggleInvocationRow,
    statsRow,
    testKeyId,
    setTestKeyId,
    testInput,
    setTestInput,
    isTesting,
    testRunId,
    testRunStatus,
    testEvents,
    testResult,
    testError,
    testLatency,
    runTest,
    resetTest,
    copiedField,
    copyText,
    refreshNow,
    apiBaseForDocs,
    accentPresets: ACCENT_PRESETS,
    positionOptions: POSITION_OPTIONS,
    invSourceMeta: INV_SOURCE_META,
    invStatusMeta: INV_STATUS_META,
    testEventMeta: TEST_EVENT_META,
  }
}
