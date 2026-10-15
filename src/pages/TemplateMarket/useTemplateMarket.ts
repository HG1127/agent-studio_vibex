import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import type { AgentSpec, SavedSpecRow } from "@/pages/Home/useHome"

export type { AgentSpec, SavedSpecRow }

// 字段名与 template_market_api.pb.js 返回 1:1（snake_case，禁止转换层）
export type TemplateCategory = "research" | "knowledge" | "data" | "other"

export type TemplateRow = {
  id: string
  name: string
  description: string
  category: TemplateCategory
  spec: AgentSpec | null
  source_spec_id: string
  built_in: boolean
  public: boolean
  use_count: number
  author_tail: string
  is_mine: boolean
  created: string
}

export type MyPublishRow = {
  id: string
  name: string
  description: string
  category: TemplateCategory
  source_spec_id: string
  built_in: boolean
  public: boolean
  use_count: number
  created: string
}

export type CategoryFilter = "all" | TemplateCategory

export const CATEGORY_META: Record<TemplateCategory, { label: string; badge: string }> = {
  research: { label: "研究", badge: "bg-primary/10 text-primary" },
  knowledge: { label: "问答", badge: "bg-secondary text-secondary-foreground" },
  data: { label: "分析", badge: "bg-primary/10 text-primary" },
  other: { label: "其他", badge: "bg-muted text-muted-foreground" },
}

export const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "research", label: "研究" },
  { key: "knowledge", label: "问答" },
  { key: "data", label: "分析" },
  { key: "other", label: "其他" },
]

export type MarketTab = "market" | "mine"

export function formatTemplateTime(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
}

export function useTemplateMarket() {
  const base = getPocketBaseUrl()
  const navigate = useNavigate()

  const [rhUserId, setRhUserId] = useState("")
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  const [activeTab, setActiveTab] = useState<MarketTab>("market")
  const [searchText, setSearchText] = useState("")
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all")

  const [marketList, setMarketList] = useState<TemplateRow[]>([])
  const [isLoadingMarket, setIsLoadingMarket] = useState(false)
  const [expandedId, setExpandedId] = useState("")

  const [myList, setMyList] = useState<MyPublishRow[]>([])
  const [isLoadingMine, setIsLoadingMine] = useState(false)
  const [busyMineId, setBusyMineId] = useState("")

  const [useTarget, setUseTarget] = useState<TemplateRow | null>(null)
  const [isUseBusy, setIsUseBusy] = useState(false)

  const [publishOpen, setPublishOpen] = useState(false)
  const [specList, setSpecList] = useState<SavedSpecRow[]>([])
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false)
  const [publishSpecId, setPublishSpecId] = useState("")
  const [publishName, setPublishName] = useState("")
  const [publishDescription, setPublishDescription] = useState("")
  const [publishCategory, setPublishCategory] = useState<TemplateCategory>("other")
  const [publishError, setPublishError] = useState("")
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    const payload = decodeRhToken()
    setRhUserId(payload?.sub ? String(payload.sub) : LOCAL_ANON_UID)
  }, [])

  const isLoggedIn = Boolean(rhUserId)

  const loadMarket = useCallback(async () => {
    setIsLoadingMarket(true)
    setErrorMsg("")
    try {
      const res = await fetch(`${base}/api/templates/market`, { headers: { ...vibexAuthHeaders() } })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setMarketList(Array.isArray(data?.items) ? (data.items as TemplateRow[]) : [])
      } else {
        setErrorMsg("模板列表加载失败，请稍后重试")
      }
    } catch {
      setErrorMsg("网络异常，模板列表加载失败")
    } finally {
      setIsLoadingMarket(false)
    }
  }, [base])

  const loadMine = useCallback(async () => {
    setIsLoadingMine(true)
    try {
      const res = await fetch(`${base}/api/templates/mine`, { headers: { ...vibexAuthHeaders() } })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setMyList(Array.isArray(data?.items) ? (data.items as MyPublishRow[]) : [])
      }
    } catch {
      // 我的发布加载失败不阻塞市场浏览
    } finally {
      setIsLoadingMine(false)
    }
  }, [base])

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
        setSpecList(Array.isArray(data?.items) ? (data.items as SavedSpecRow[]) : [])
      }
    } catch {
      // 方案列表加载失败不阻塞浏览
    } finally {
      setIsLoadingSpecs(false)
    }
  }, [base])

  useEffect(() => {
    if (!rhUserId) return
    void loadMarket()
    void loadMine()
  }, [rhUserId, loadMarket, loadMine])

  const filteredMarket = useMemo(() => {
    const kw = searchText.trim().toLowerCase()
    return marketList.filter((row) => {
      if (activeCategory !== "all" && row.category !== activeCategory) return false
      if (!kw) return true
      return (
        row.name.toLowerCase().includes(kw) ||
        row.description.toLowerCase().includes(kw) ||
        CATEGORY_META[row.category]?.label.includes(kw)
      )
    })
  }, [marketList, searchText, activeCategory])

  const handleLogin = useCallback(() => {
    redirectToRhLogin()
  }, [])

  const handleToggleExpand = useCallback((templateId: string) => {
    setExpandedId((prev) => (prev === templateId ? "" : templateId))
  }, [])

  const handleRequestUse = useCallback((row: TemplateRow) => {
    setUseTarget(row)
  }, [])

  const handleConfirmUse = useCallback(async () => {
    if (!useTarget) return
    setIsUseBusy(true)
    setErrorMsg("")
    try {
      const res = await fetch(`${base}/api/templates/${encodeURIComponent(useTarget.id)}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setUseTarget(null)
        return
      }
      const data = await res.json().catch(() => null)
      if (res.ok && data?.spec_id) {
        setUseTarget(null)
        void loadMarket()
        navigate(`/agent-run?spec=${encodeURIComponent(String(data.spec_id))}`)
        return
      }
      setErrorMsg(String(data?.message || "使用失败，请稍后重试"))
    } catch {
      setErrorMsg("网络异常，使用失败，请稍后重试")
    } finally {
      setIsUseBusy(false)
    }
  }, [useTarget, base, loadMarket, navigate])

  const handleCancelUse = useCallback(() => {
    setUseTarget(null)
  }, [])

  const handleOpenPublish = useCallback(() => {
    setPublishError("")
    setPublishSpecId("")
    setPublishName("")
    setPublishDescription("")
    setPublishCategory("other")
    setPublishOpen(true)
    if (rhUserId) void loadSpecList(rhUserId)
  }, [rhUserId, loadSpecList])

  const handleClosePublish = useCallback(() => {
    setPublishOpen(false)
  }, [])

  const handleSelectPublishSpec = useCallback(
    (specId: string) => {
      setPublishSpecId(specId)
      const picked = specList.find((row) => row.id === specId)
      if (picked && !publishName.trim()) setPublishName(picked.name)
    },
    [specList, publishName],
  )

  const handleSubmitPublish = useCallback(async () => {
    setPublishError("")
    if (!publishSpecId) {
      setPublishError("请选择要发布的助手方案")
      return
    }
    if (!publishDescription.trim()) {
      setPublishError("简介必填，让别人知道这个模板能做什么")
      return
    }
    if (publishDescription.trim().length > 120) {
      setPublishError("简介不能超过 120 字")
      return
    }
    setIsPublishing(true)
    try {
      const res = await fetch(`${base}/api/templates/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: JSON.stringify({
          source_spec_id: publishSpecId,
          name: publishName.trim(),
          description: publishDescription.trim(),
          category: publishCategory,
        }),
      })
      if (res.status === 401 || res.status === 412) {
        setNeedsRhLogin(true)
        setPublishOpen(false)
        return
      }
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        setPublishOpen(false)
        setNoticeMsg("发布成功，模板已上架市场")
        setActiveTab("market")
        setExpandedId("")
        void loadMarket()
        void loadMine()
        return
      }
      setPublishError(String(data?.message || "发布失败，请稍后重试"))
    } catch {
      setPublishError("网络异常，发布失败，请稍后重试")
    } finally {
      setIsPublishing(false)
    }
  }, [publishSpecId, publishName, publishDescription, publishCategory, base, loadMarket, loadMine])

  const runMineAction = useCallback(
    async (row: MyPublishRow, action: "unpublish" | "republish" | "delete") => {
      setBusyMineId(row.id)
      setErrorMsg("")
      try {
        const url =
          action === "delete"
            ? `${base}/api/templates/${encodeURIComponent(row.id)}`
            : `${base}/api/templates/${encodeURIComponent(row.id)}/${action}`
        const res = await fetch(url, {
          method: action === "delete" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        })
        if (res.status === 401 || res.status === 412) {
          setNeedsRhLogin(true)
          return
        }
        if (res.ok) {
          setNoticeMsg(
            action === "unpublish" ? "已下架，市场不再展示" : action === "republish" ? "已重新公开" : "已删除",
          )
          void loadMine()
          void loadMarket()
        } else {
          const data = await res.json().catch(() => null)
          setErrorMsg(String(data?.message || "操作失败，请稍后重试"))
        }
      } catch {
        setErrorMsg("网络异常，操作失败，请稍后重试")
      } finally {
        setBusyMineId("")
      }
    },
    [base, loadMine, loadMarket],
  )

  const handleUnpublish = useCallback((row: MyPublishRow) => void runMineAction(row, "unpublish"), [runMineAction])
  const handleRepublish = useCallback((row: MyPublishRow) => void runMineAction(row, "republish"), [runMineAction])
  const handleDeleteMine = useCallback((row: MyPublishRow) => void runMineAction(row, "delete"), [runMineAction])

  const handleDismissNotice = useCallback(() => setNoticeMsg(""), [])
  const handleDismissError = useCallback(() => setErrorMsg(""), [])

  return {
    isLoggedIn,
    needsRhLogin,
    handleLogin,
    errorMsg,
    noticeMsg,
    handleDismissError,
    handleDismissNotice,
    activeTab,
    setActiveTab,
    searchText,
    setSearchText,
    activeCategory,
    setActiveCategory,
    marketList,
    filteredMarket,
    isLoadingMarket,
    expandedId,
    handleToggleExpand,
    myList,
    isLoadingMine,
    busyMineId,
    useTarget,
    isUseBusy,
    handleRequestUse,
    handleConfirmUse,
    handleCancelUse,
    publishOpen,
    specList,
    isLoadingSpecs,
    publishSpecId,
    publishName,
    publishDescription,
    publishCategory,
    publishError,
    isPublishing,
    handleOpenPublish,
    handleClosePublish,
    handleSelectPublishSpec,
    setPublishName,
    setPublishDescription,
    setPublishCategory,
    handleSubmitPublish,
    handleUnpublish,
    handleRepublish,
    handleDeleteMine,
    handleReloadMarket: loadMarket,
  }
}
