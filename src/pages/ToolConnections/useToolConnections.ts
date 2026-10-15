import { useCallback, useEffect, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"

// 字段名与 tool_connections 脱敏路由返回 1:1（snake_case，禁止转换层；header 值永不下发明文）
export type ToolHeaderMasked = { key: string; value: string }

export type ToolConnectionRow = {
  id: string
  name: string
  description: string
  url: string
  method: string
  headers: ToolHeaderMasked[]
  body_template: string
  timeout_s: number
  enabled: boolean
  status: string
  last_latency_ms: number
  last_checked_at: string
  last_error: string
}

export type ToolTestResult = {
  ok: boolean
  status_code: number
  latency_ms: number
  response_excerpt: string
  error: string
}

// 表单里的请求头草稿：value 为空 = 编辑时保留服务端已存值
export type HeaderDraft = { key: string; value: string }

export const TOOL_STATUS_META: Record<string, { label: string; badge: string }> = {
  ok: { label: "正常", badge: "bg-primary/10 text-primary" },
  error: { label: "异常", badge: "bg-destructive/10 text-destructive" },
  untested: { label: "未测试", badge: "bg-muted text-muted-foreground" },
}

// 卡片上只展示脱敏域名，不展示完整 URL 路径
export function maskToolDomain(rawUrl: string): string {
  const cleaned = String(rawUrl || "").replace(/^https?:\/\//i, "")
  return cleaned.split("/")[0] || cleaned
}

function normalizeTestResult(data: Record<string, unknown> | null): ToolTestResult {
  return {
    ok: Boolean(data?.ok),
    status_code: Number(data?.status_code || 0),
    latency_ms: Number(data?.latency_ms || 0),
    response_excerpt: String(data?.response_excerpt || ""),
    error: String(data?.error || ""),
  }
}

class AuthRequiredError extends Error {}

export function useToolConnections() {
  const base = getPocketBaseUrl()

  const [rhUserId] = useState(() => {
    const payload = decodeRhToken()
    return payload?.sub ? String(payload.sub) : LOCAL_ANON_UID
  })
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  const [toolList, setToolList] = useState<ToolConnectionRow[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)

  // 添加/编辑表单
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"add" | "edit">("add")
  const [editingId, setEditingId] = useState("")
  const [formName, setFormName] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formUrl, setFormUrl] = useState("")
  const [formMethod, setFormMethod] = useState<"GET" | "POST">("POST")
  const [formHeaders, setFormHeaders] = useState<HeaderDraft[]>([])
  const [formBody, setFormBody] = useState("")
  const [formTimeout, setFormTimeout] = useState("15")
  const [testInput, setTestInput] = useState("")
  const [confirmFormWrite, setConfirmFormWrite] = useState(false)
  const [isTestingForm, setIsTestingForm] = useState(false)
  const [formTestResult, setFormTestResult] = useState<ToolTestResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 卡片操作
  const [busyId, setBusyId] = useState("")
  const [expandedId, setExpandedId] = useState("")
  const [cardTestInput, setCardTestInput] = useState("")
  const [confirmCardWrite, setConfirmCardWrite] = useState(false)
  const [cardTestResult, setCardTestResult] = useState<ToolTestResult | null>(null)
  const [isTestingCard, setIsTestingCard] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState("")

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

  const loadList = useCallback(async () => {
    if (!rhUserId) return
    setIsLoadingList(true)
    try {
      const res = await apiFetch("/api/tool-connections")
      if (res.ok) {
        const data = await res.json()
        setToolList(Array.isArray(data?.items) ? (data.items as ToolConnectionRow[]) : [])
      } else {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.message || "工具列表加载失败，请稍后重试")
      }
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，工具列表加载失败")
    } finally {
      setIsLoadingList(false)
    }
  }, [apiFetch, rhUserId])

  useEffect(() => {
    if (!rhUserId) return
    let current = true
    void Promise.resolve().then(() => { if (current) void loadList() })
    return () => { current = false }
  }, [rhUserId, loadList])

  const dismissError = useCallback(() => setErrorMsg(""), [])
  const dismissNotice = useCallback(() => setNoticeMsg(""), [])

  const resetFormState = useCallback(() => {
    setConfirmFormWrite(false)
    setFormName("")
    setFormDesc("")
    setFormUrl("")
    setFormMethod("POST")
    setFormHeaders([])
    setFormBody("")
    setFormTimeout("15")
    setTestInput("")
    setFormTestResult(null)
  }, [])

  const openAddForm = useCallback(() => {
    setFormMode("add")
    setEditingId("")
    resetFormState()
    setFormOpen(true)
    setErrorMsg("")
  }, [resetFormState])

  const startEdit = useCallback(
    (row: ToolConnectionRow) => {
      setConfirmFormWrite(false)
      setFormMode("edit")
      setEditingId(row.id)
      setFormName(row.name)
      setFormDesc(row.description)
      setFormUrl(row.url)
      setFormMethod(row.method === "GET" ? "GET" : "POST")
      // 密钥类 header 值留空表示不改（服务端保留已存值），placeholder 展示掩码
      setFormHeaders((row.headers || []).map((item) => ({ key: item.key, value: "" })))
      setFormBody(row.body_template || "")
      setFormTimeout(String(row.timeout_s || 15))
      setTestInput("")
      setFormTestResult(null)
      setFormOpen(true)
      setPendingDeleteId("")
      setErrorMsg("")
    },
    [],
  )

  const closeForm = useCallback(() => {    setConfirmFormWrite(false)
    setFormOpen(false)
    setEditingId("")
    setFormTestResult(null)
  }, [])

  const addHeaderRow = useCallback(() => {
    setFormHeaders((prev) => (prev.length >= 20 ? prev : [...prev, { key: "", value: "" }]))
  }, [])

  const updateHeaderRow = useCallback((index: number, patch: Partial<HeaderDraft>) => {
    setFormHeaders((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }, [])

  const removeHeaderRow = useCallback((index: number) => {
    setFormHeaders((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleTestForm = useCallback(async () => {
    if (formMethod === "POST" && !confirmFormWrite) {
      setErrorMsg("POST 测试会向外部服务真实写入，请先确认本次请求")
      return
    }
    setErrorMsg("")
    setFormTestResult(null)
    if (!/^https?:\/\//i.test(formUrl.trim())) {
      setErrorMsg("请先填写以 http:// 或 https:// 开头的请求 URL 再测试")
      return
    }
    setIsTestingForm(true)
    try {
      const payload = {
        url: formUrl.trim(),
        method: formMethod,
        confirm_write: formMethod === "POST" ? confirmFormWrite : undefined,
        headers: formHeaders
          .filter((item) => item.key.trim() !== "" && item.value.trim() !== "")
          .map((item) => ({ key: item.key.trim(), value: item.value })),
        body_template: formMethod === "POST" ? formBody : "",
        timeout_s: Number(formTimeout) || 15,
        input: testInput.trim() || "{}",
      }
      const res = await apiFetch("/api/tool-connections/test", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "测试请求失败，请稍后重试")
        return
      }
      setFormTestResult(normalizeTestResult(data))
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，测试失败，请重试")
    } finally {
      setIsTestingForm(false)
      setConfirmFormWrite(false)
    }
  }, [apiFetch, confirmFormWrite, formBody, formHeaders, formMethod, formTimeout, formUrl, testInput])

  const handleSave = useCallback(async () => {
    setErrorMsg("")
    if (!formName.trim()) {
      setErrorMsg("请填写工具名称")
      return
    }
    if (!formDesc.trim()) {
      setErrorMsg("请填写用途描述（助手靠它判断何时调用这个工具）")
      return
    }
    if (!/^https?:\/\//i.test(formUrl.trim())) {
      setErrorMsg("请求 URL 必须以 http:// 或 https:// 开头")
      return
    }
    setIsSaving(true)
    try {
      const headersPayload = formHeaders
        .filter((item) => item.key.trim() !== "")
        .map((item) => ({ key: item.key.trim(), value: item.value }))
      let res: Response
      if (formMode === "add") {
        res = await apiFetch("/api/tool-connections", {
          method: "POST",
          body: JSON.stringify({
            name: formName.trim(),
            description: formDesc.trim(),
            url: formUrl.trim(),
            method: formMethod,
            headers: headersPayload.filter((item) => item.value !== ""),
            body_template: formMethod === "POST" ? formBody : "",
            timeout_s: Number(formTimeout) || 15,
          }),
        })
      } else {
        res = await apiFetch(`/api/tool-connections/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: formName.trim(),
            description: formDesc.trim(),
            url: formUrl.trim(),
            method: formMethod,
            headers: headersPayload,
            body_template: formMethod === "POST" ? formBody : "",
            timeout_s: Number(formTimeout) || 15,
          }),
        })
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "保存失败，请稍后重试")
        return
      }
      closeForm()
      setNoticeMsg(formMode === "add" ? "工具已保存并默认启用，可在首页方案里勾选使用" : "工具已更新")
      void loadList()
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，保存失败，请重试")
    } finally {
      setIsSaving(false)
    }
  }, [apiFetch, closeForm, editingId, formBody, formDesc, formHeaders, formMethod, formMode, formName, formTimeout, formUrl, loadList])

  // 卡片「测试调用」：展开参数输入面板，用已存配置真实调用一次
  const toggleExpand = useCallback((rowId: string) => {
    setConfirmCardWrite(false)
    setExpandedId((prev) => (prev === rowId ? "" : rowId))
    setCardTestInput("")
    setCardTestResult(null)
    setPendingDeleteId("")
  }, [])

  const handleCardTest = useCallback(
    async (row: ToolConnectionRow) => {
      if (busyId || isTestingCard) return
      if (String(row.method || "POST").toUpperCase() !== "GET" && !confirmCardWrite) {
        setErrorMsg("此工具将真实发送 POST 写请求，请先勾选本次执行确认")
        return
      }
      setErrorMsg("")
      setCardTestResult(null)
      setIsTestingCard(true)
      try {
        const res = await apiFetch("/api/tool-connections/test", {
          method: "POST",
          body: JSON.stringify({
            connection_id: row.id,
            input: cardTestInput.trim() || "{}",
            confirm_write: String(row.method || "POST").toUpperCase() !== "GET" ? confirmCardWrite : undefined,
          }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "测试请求失败，请稍后重试")
          return
        }
        setCardTestResult(normalizeTestResult(data))
        void loadList()
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，测试失败，请重试")
      } finally {
        setIsTestingCard(false)
        setConfirmCardWrite(false)
      }
    },
    [apiFetch, busyId, cardTestInput, confirmCardWrite, isTestingCard, loadList],
  )

  // 卡片「重新测试」：固定入参快速复检连通性与延迟
  const handleRetest = useCallback(
    async (row: ToolConnectionRow) => {
      if (busyId) return
      if (String(row.method || "POST").toUpperCase() !== "GET") {
        setExpandedId(row.id)
        setConfirmCardWrite(false)
        setNoticeMsg("POST 工具不执行一键重试，请展开参数并确认本次真实写入")
        return
      }
      setErrorMsg("")
      setBusyId(row.id)
      try {
        const res = await apiFetch("/api/tool-connections/test", {
          method: "POST",
          body: JSON.stringify({ connection_id: row.id, input: "{}" }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "重新测试失败，请稍后重试")
        } else if (data?.ok) {
          setNoticeMsg(`「${row.name}」连通正常，延迟 ${Number(data.latency_ms || 0)} ms`)
        } else {
          setNoticeMsg(`「${row.name}」本次测试未通过：${String(data?.error || "见卡片状态")}`)
        }
        void loadList()
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，重新测试失败")
      } finally {
        setBusyId("")
      }
    },
    [apiFetch, busyId, loadList],
  )

  const handleToggleEnabled = useCallback(
    async (row: ToolConnectionRow, nextEnabled: boolean) => {
      if (busyId) return
      setErrorMsg("")
      setBusyId(row.id)
      try {
        const res = await apiFetch(`/api/tool-connections/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: nextEnabled }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setErrorMsg(data?.message || "操作失败，请稍后重试")
          return
        }
        setToolList((prev) =>
          prev.map((item) => (item.id === row.id ? { ...item, enabled: nextEnabled } : item)),
        )
        setNoticeMsg(
          nextEnabled
            ? `「${row.name}」已启用，助手试跑时即可调用`
            : `「${row.name}」已停用，助手将不再调用它`,
        )
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，操作失败")
      } finally {
        setBusyId("")
      }
    },
    [apiFetch, busyId],
  )

  const requestDelete = useCallback((rowId: string) => {
    setPendingDeleteId((prev) => (prev === rowId ? "" : rowId))
  }, [])

  const cancelDelete = useCallback(() => setPendingDeleteId(""), [])

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId || busyId) return
    setErrorMsg("")
    setBusyId(pendingDeleteId)
    try {
      const res = await apiFetch(`/api/tool-connections/${encodeURIComponent(pendingDeleteId)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.message || "删除失败，请稍后重试")
        return
      }
      setToolList((prev) => prev.filter((item) => item.id !== pendingDeleteId))
      setPendingDeleteId("")
      if (expandedId === pendingDeleteId) setExpandedId("")
      setNoticeMsg("工具连接已删除")
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，删除失败")
    } finally {
      setBusyId("")
    }
  }, [apiFetch, busyId, expandedId, pendingDeleteId])

  const canSubmitForm =
    formName.trim().length > 0 &&
    formDesc.trim().length > 0 &&
    /^https?:\/\//i.test(formUrl.trim()) &&
    !isSaving

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    noticeMsg,
    dismissNotice,
    toolList,
    isLoadingList,
    loadList,
    formOpen,
    formMode,
    editingId,
    formName,
    formDesc,
    formUrl,
    formMethod,
    formHeaders,
    formBody,
    formTimeout,
    testInput,
    setFormName,
    confirmFormWrite,
    setConfirmFormWrite,
    setFormDesc,
    setFormUrl,
    setFormMethod,
    setFormBody,
    setFormTimeout,
    setTestInput,
    addHeaderRow,
    updateHeaderRow,
    removeHeaderRow,
    openAddForm,
    startEdit,
    closeForm,
    isTestingForm,
    formTestResult,
    handleTestForm,
    isSaving,
    canSubmitForm,
    handleSave,
    busyId,
    expandedId,
    toggleExpand,
    cardTestInput,
    setCardTestInput,
    confirmCardWrite,
    setConfirmCardWrite,
    cardTestResult,
    isTestingCard,
    handleCardTest,
    handleRetest,
    handleToggleEnabled,
    pendingDeleteId,
    requestDelete,
    cancelDelete,
    confirmDelete,
    statusMeta: TOOL_STATUS_META,
  }
}
