import { useCallback, useEffect, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import {usePgModelConnections} from "./usePgModelConnections"
const useNativeModelConnections=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'?usePgModelConnections:null

// 字段名与 model_connections 脱敏路由返回 1:1（snake_case，禁止转换层；api_key 永不下发）
export type ModelConnectionRow = {
  id: string
  name: string
  provider: string
  base_url: string
  api_key_tail: string
  enabled: boolean
  status: string
  last_latency_ms: number
  last_checked_at: string
  models: string[]
  last_error: string
}

export type ConnectionTestResult = {
  discovery?:boolean
  ok: boolean
  latency_ms: number
  models: string[]
  error: string
}

export const CONNECTION_STATUS_META: Record<string, { label: string; badge: string }> = {
  ok: { label: "正常", badge: "bg-primary/10 text-primary" },
  error: { label: "异常", badge: "bg-destructive/10 text-destructive" },
  untested: { label: "未测试", badge: "bg-muted text-muted-foreground" },
}

// 接口类型（provider）：存量连接无该字段一律按 openai 兼容兜底
export type ProviderKey = "openai" | "anthropic" | "gemini"

export const PROVIDER_META: Record<
  ProviderKey,
  { label: string; shortLabel: string; defaultBase: string; hint: string }
> = {
  openai: {
    label: "OpenAI 兼容",
    shortLabel: "OpenAI 兼容",
    defaultBase: "https://api.openai.com/v1",
    hint: "适配 OpenAI / DeepSeek / Kimi / 智谱 / 百炼 / OpenRouter / Ollama 等兼容接口。",
  },
  anthropic: {
    label: "Anthropic Claude",
    shortLabel: "Anthropic",
    defaultBase: "https://api.anthropic.com/v1",
    hint: "适配 Claude 官方接口；Base URL 留空即使用官方默认地址。",
  },
  gemini: {
    label: "Google Gemini",
    shortLabel: "Gemini",
    defaultBase: "https://generativelanguage.googleapis.com/v1beta",
    hint: "适配 Google Gemini 官方接口；Base URL 留空即使用官方默认地址。",
  },
}

export function normalizeProvider(raw: string | undefined | null): ProviderKey {
  return raw === "anthropic" || raw === "gemini" ? raw : "openai"
}

// 卡片上只展示脱敏域名，不展示完整 Base URL 路径
export function maskConnectionDomain(baseUrl: string): string {
  const cleaned = String(baseUrl || "").replace(/^https?:\/\//i, "")
  return cleaned.split("/")[0] || cleaned
}

class AuthRequiredError extends Error {}

function usePbModelConnections() {
  const base = getPocketBaseUrl()

  const [rhUserId, setRhUserId] = useState("")
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  const [connectionList, setConnectionList] = useState<ModelConnectionRow[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"add" | "edit">("add")
  const [editingId, setEditingId] = useState("")
  const [formName, setFormName] = useState("")
  const [formProvider, setFormProvider] = useState<ProviderKey>("openai")
  const [formBaseUrl, setFormBaseUrl] = useState("")
  const [formApiKey, setFormApiKey] = useState("")
  const [formManualModels, setFormManualModels] = useState("")
  const [isTestingForm, setIsTestingForm] = useState(false)
  const [formTestResult, setFormTestResult] = useState<ConnectionTestResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [busyId, setBusyId] = useState("")
  const [expandedId, setExpandedId] = useState("")
  const [pendingDeleteId, setPendingDeleteId] = useState("")

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

  const loadList = useCallback(async () => {
    if (!rhUserId) return
    setIsLoadingList(true)
    try {
      const res = await apiFetch("/api/model-connections")
      if (res.ok) {
        const data = await res.json()
        setConnectionList(Array.isArray(data?.items) ? (data.items as ModelConnectionRow[]) : [])
      } else {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.message || "连接列表加载失败，请稍后重试")
      }
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，连接列表加载失败")
    } finally {
      setIsLoadingList(false)
    }
  }, [apiFetch, rhUserId])

  useEffect(() => {
    if (rhUserId) void loadList()
  }, [rhUserId, loadList])

  const dismissError = useCallback(() => setErrorMsg(""), [])
  const dismissNotice = useCallback(() => setNoticeMsg(""), [])

  const openAddForm = useCallback(() => {
    setFormMode("add")
    setEditingId("")
    setFormName("")
    setFormProvider("openai")
    setFormBaseUrl("")
    setFormApiKey("")
    setFormManualModels("")
    setFormTestResult(null)
    setFormOpen(true)
    setErrorMsg("")
  }, [])

  const startEdit = useCallback((row: ModelConnectionRow) => {
    setFormMode("edit")
    setEditingId(row.id)
    setFormName(row.name)
    setFormProvider(normalizeProvider(row.provider))
    setFormBaseUrl(row.base_url)
    setFormApiKey("")
    setFormManualModels((row.models || []).join(", "))
    setFormTestResult(null)
    setFormOpen(true)
    setPendingDeleteId("")
    setErrorMsg("")
  }, [])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditingId("")
    setFormTestResult(null)
  }, [])

  const handleTestForm = useCallback(async () => {
    setErrorMsg("")
    setFormTestResult(null)
    const canUseStoredKey = formMode === "edit" && editingId && formApiKey.trim() === ""
    if (!canUseStoredKey && formProvider === "openai" && !formBaseUrl.trim()) {
      setErrorMsg("请先填写 Base URL 再测试")
      return
    }
    if (!canUseStoredKey && !formApiKey.trim()) {
      setErrorMsg("请先填写 API Key 再测试")
      return
    }
    setIsTestingForm(true)
    try {
      let payload: Record<string, unknown>
      if (canUseStoredKey) {
        const editingRow = connectionList.find((row) => row.id === editingId) || null
        const providerChanged = Boolean(
          editingRow && normalizeProvider(editingRow.provider) !== formProvider,
        )
        // 切换类型且地址未改：置空让服务端按新类型回落官方默认地址
        const baseForTest =
          providerChanged && formBaseUrl.trim() === String(editingRow?.base_url || "").trim()
            ? ""
            : formBaseUrl.trim()
        payload = { connection_id: editingId, provider: formProvider, base_url: baseForTest }
      } else {
        payload = { base_url: formBaseUrl.trim(), api_key: formApiKey.trim(), provider: formProvider }
      }
      const res = await apiFetch("/api/model-connections/test", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "测试请求失败，请稍后重试")
        return
      }
      setFormTestResult({
        ok: Boolean(data?.ok),
        latency_ms: Number(data?.latency_ms || 0),
        models: Array.isArray(data?.models) ? (data.models as string[]) : [],
        error: String(data?.error || ""),
      })
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，测试失败，请重试")
    } finally {
      setIsTestingForm(false)
    }
  }, [apiFetch, connectionList, editingId, formApiKey, formBaseUrl, formMode, formProvider])

  const handleSave = useCallback(async () => {
    setErrorMsg("")
    if (!formName.trim()) {
      setErrorMsg("请填写连接名称")
      return
    }
    if (formProvider === "openai" && !formBaseUrl.trim()) {
      setErrorMsg("请填写 Base URL")
      return
    }
    if (formMode === "add" && !formApiKey.trim()) {
      setErrorMsg("请填写 API Key")
      return
    }
    setIsSaving(true)
    try {
      let res: Response
      if (formMode === "add") {
        res = await apiFetch("/api/model-connections", {
          method: "POST",
          body: JSON.stringify({
            name: formName.trim(),
            provider: formProvider,
            base_url: formBaseUrl.trim(),
            api_key: formApiKey.trim(),
            models: formManualModels,
          }),
        })
      } else {
        const patchBody: Record<string, unknown> = {
          name: formName.trim(),
          provider: formProvider,
          base_url: formBaseUrl.trim(),
          models: formManualModels,
        }
        if (formApiKey.trim()) patchBody.api_key = formApiKey.trim()
        res = await apiFetch(`/api/model-connections/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        })
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.message || "保存失败，请稍后重试")
        return
      }
      closeForm()
      setNoticeMsg(formMode === "add" ? "连接已保存，默认启用" : "连接已更新")
      void loadList()
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，保存失败，请重试")
    } finally {
      setIsSaving(false)
    }
  }, [apiFetch, closeForm, editingId, formApiKey, formBaseUrl, formManualModels, formMode, formName, formProvider, loadList])

  const handleRetest = useCallback(
    async (row: ModelConnectionRow) => {
      if (busyId) return
      setErrorMsg("")
      setBusyId(row.id)
      try {
        const res = await apiFetch("/api/model-connections/test", {
          method: "POST",
          body: JSON.stringify({ connection_id: row.id }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "重新测试失败，请稍后重试")
        } else if (data?.ok) {
          setNoticeMsg(`「${row.name}」连通正常，延迟 ${Number(data.latency_ms || 0)} ms`)
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
    async (row: ModelConnectionRow, nextEnabled: boolean) => {
      if (busyId) return
      setErrorMsg("")
      setBusyId(row.id)
      try {
        const res = await apiFetch(`/api/model-connections/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: nextEnabled }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setErrorMsg(data?.message || "操作失败，请稍后重试")
          return
        }
        setConnectionList((prev) =>
          prev.map((item) => (item.id === row.id ? { ...item, enabled: nextEnabled } : item)),
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
      const res = await apiFetch(`/api/model-connections/${encodeURIComponent(pendingDeleteId)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.message || "删除失败，请稍后重试")
        return
      }
      setConnectionList((prev) => prev.filter((item) => item.id !== pendingDeleteId))
      setPendingDeleteId("")
      setNoticeMsg("连接已删除")
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，删除失败")
    } finally {
      setBusyId("")
    }
  }, [apiFetch, busyId, pendingDeleteId])

  const toggleExpand = useCallback((rowId: string) => {
    setExpandedId((prev) => (prev === rowId ? "" : rowId))
  }, [])

  const canSubmitForm =
    formName.trim().length > 0 &&
    (formProvider !== "openai" || formBaseUrl.trim().length > 0) &&
    (formMode === "edit" || formApiKey.trim().length > 0) &&
    !isSaving

  return {
    nativeMode:false as const,writeBlocked:false,probeEnabled:true,formProbeEnabled:true,saveActionLabel:'保存',nativePending:false,nativeUnavailable:false,probeNotice:'',
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    noticeMsg,
    dismissNotice,
    connectionList,
    isLoadingList,
    loadList,
    formOpen,
    formMode,
    editingId,
    formName,
    formProvider,
    formBaseUrl,
    formApiKey,
    formManualModels,
    setFormName,
    setFormProvider,
    setFormBaseUrl,
    setFormApiKey,
    setFormManualModels,
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
    handleRetest,
    handleToggleEnabled,
    expandedId,
    toggleExpand,
    pendingDeleteId,
    requestDelete,
    cancelDelete,
    confirmDelete,
    statusMeta: CONNECTION_STATUS_META,
  }
}

// Build-time selection keeps original PocketBase callbacks and layout recoverable.
export function useModelConnections(){return useNativeModelConnections?useNativeModelConnections(CONNECTION_STATUS_META):usePbModelConnections()}
