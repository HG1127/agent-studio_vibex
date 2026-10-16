import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { LOCAL_ANON_UID } from "@/lib/anonUid"
import { callLlmWithFallback, type LlmMessage } from "@/lib/llm"
import { CURATED_PLUGINS, curatedZhFor } from "./curated"
import {safeSmitherySetupUrl} from "@/lib/smitheryMarketplace"

// —— 类型：字段名与后端 /api/market/* 路由返回 1:1（snake_case，禁止转换层）——
export type MarketRemote = { type: string; url: string }
export type MarketPackage = { registry: string; name: string; identifier: string; version: string }

export type MarketPlugin = {
  name: string
  title: string
  description: string
  version: string
  remotes: MarketRemote[]
  packages: MarketPackage[]
  // 中文简介（后端 market_i18n 缓存 join 命中才带；热门推荐行由前端 CURATED 补齐）
  zh_title?: string
  zh_desc?: string
}

export type MarketTool = {
  name: string
  description: string
  args_hint: string
  input_schema?: Record<string, unknown> | null
  read_only?: boolean
  destructive?: boolean
}

export type ConnectionRow = {
  id: string
  server_name: string
  title: string
  url: string
  is_smithery?: boolean
  headers_count: number
  tools: MarketTool[]
  tool_count: number
  enabled: boolean
  last_probe_status: string
  last_probe_msg: string
  created: string
}

export type ProbeOutcome = {
  ok: boolean
  tools: MarketTool[]
  tool_count: number
  message: string
  error_code: string
  latency_ms: number
} | null

export type InvokeOutcome = {
  ok: boolean
  output: string
  error: string
  error_code: string
  latency_ms: number
  retried: boolean
} | null

export type MarketInvocationRow = {
  id: string
  tool_name: string
  status: string
  latency_ms: number
  input_summary: string
  output_excerpt: string
  error_code: string
  retried: boolean
  created: string
}

export type HeaderRow = { key: string; value: string }

export const INVOKE_STATUS_META: Record<string, { label: string; badge: string }> = {
  success: { label: "成功", badge: "bg-primary/10 text-primary" },
  retried_success: { label: "重试后成功", badge: "bg-secondary text-secondary-foreground" },
  failed: { label: "失败", badge: "bg-destructive/10 text-destructive" },
}

export function formatMarketTime(raw: string): string {
  const s = String(raw || "").replace(" ", "T")
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(raw || "").slice(0, 19)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 按工具 input_schema 生成参数示例 JSON（试调面板预填）
export function buildExampleArgs(tool: MarketTool | null): string {
  if (!tool) return "{}"
  const schema = tool.input_schema as { properties?: Record<string, { type?: string }>; required?: string[] } | null | undefined
  const props = schema?.properties
  if (!props || typeof props !== "object") return "{}"
  const example: Record<string, unknown> = {}
  for (const key of Object.keys(props).slice(0, 12)) {
    const t = String(props[key]?.type || "")
    if (t === "number" || t === "integer") example[key] = 0
    else if (t === "boolean") example[key] = false
    else if (t === "array") example[key] = []
    else if (t === "object") example[key] = {}
    else example[key] = ""
  }
  try {
    return JSON.stringify(example, null, 2)
  } catch {
    return "{}"
  }
}

// 仅本地进程类插件的安装命令文本（按包注册表类型给最常见命令）
export function buildInstallHint(pkg: MarketPackage): string {
  const target = pkg.identifier || pkg.name
  if (!target) return ""
  if (pkg.registry === "npm") return `npx -y ${target}`
  if (pkg.registry === "pypi") return `uvx ${target}`
  return `${pkg.registry || "包管理器"}: ${target}`
}

class AuthRequiredError extends Error {}

// —— 「翻译简介」批量 LLM 翻译（长尾插件中文化，结果缓存进 market_i18n）——
const TRANSLATE_MODEL = "gemini-3.1-flash-lite-preview"
const TRANSLATE_SYSTEM_PROMPT =
  '你是插件市场的中文翻译助手。用户给你一批 MCP 插件（name/title/description 的 JSON 数组）。为每个插件输出中文标题（品牌名保留原文，如 GitHub、Slack）和一句话中文简介（不超过 40 字，白话，说清这个插件能干什么）。严格只输出 JSON 数组，格式：[{"name":"...","zh_title":"...","zh_desc":"..."}]，name 必须与输入完全一致，逐条对应不许遗漏；不要输出任何解释文字或 markdown 围栏。'

type TranslationRow = { name: string; zh_title: string; zh_desc: string }

export type SmitheryItem = {
  slug: string
  title: string
  desc: string
  zh_title?: string
  zh_desc?: string
  verified?: boolean
  deployed?: boolean
  homepage?: string
}
export type SmitheryConnectOutcome = {
  id:string
  state:string
  tool_count:number
  setup_url:string
  missing:string[]
  message:string
} | null
// 容错解析：剥 markdown 围栏 → 平衡方括号扫描（识别字符串/转义态）→ JSON.parse → 逐条校验
export function parseTranslationJson(text: string): TranslationRow[] {
  const raw = String(text || "").trim()
  if (!raw) return []
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
  const start = stripped.indexOf("[")
  if (start < 0) return []
  let depth = 0
  let inStr = false
  let escaped = false
  let end = -1
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "[") depth++
    else if (ch === "]") {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const rows: TranslationRow[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue
    const rec = entry as Record<string, unknown>
    const nameVal = String(rec.name || "").trim()
    const zhTitle = String(rec.zh_title || "").trim()
    const zhDesc = String(rec.zh_desc || "").trim()
    if (nameVal && (zhTitle || zhDesc)) {
      rows.push({ name: nameVal.slice(0, 200), zh_title: zhTitle.slice(0, 200), zh_desc: zhDesc.slice(0, 600) })
    }
  }
  return rows.slice(0, 30)
}

// 列表/搜索结果里命中精选同名条目时补内置中文简介（后端 i18n 缓存已有的优先）
function applyCuratedZh(items: MarketPlugin[]): MarketPlugin[] {
  return items.map((item) => {
    if (item.zh_desc) return item
    const hit = curatedZhFor(item.name, item.title)
    if (!hit) return item
    return { ...item, zh_title: item.zh_title || hit.zh_title, zh_desc: hit.zh_desc }
  })
}

export function usePluginMarket() {
  const base = getPocketBaseUrl()

  const [rhUserId] = useState(() => decodeRhToken()?.sub || LOCAL_ANON_UID)
  const [needsRhLogin, setNeedsRhLogin] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")

  // 市场浏览
  const [marketItems, setMarketItems] = useState<MarketPlugin[]>([])
  const [marketNextCursor, setMarketNextCursor] = useState("")
  const [marketSearchText, setMarketSearchText] = useState("")
  const [marketActiveQuery, setMarketActiveQuery] = useState("")
  const [isMarketLoading, setIsMarketLoading] = useState(false)
  const [isMarketLoadingMore, setIsMarketLoadingMore] = useState(false)
  const [marketError, setMarketError] = useState("")

  // 热门推荐（精选 term 并行 lookup 真实条目；未命中静默隐藏，不编数据）
  const [featuredItems, setFeaturedItems] = useState<MarketPlugin[]>([])
  const [isFeaturedLoading, setIsFeaturedLoading] = useState(false)

  // 翻译简介
  const [isTranslating, setIsTranslating] = useState(false)

  // 我的连接
  const [connectionRows, setConnectionRows] = useState<ConnectionRow[]>([])
  const [isConnectionsLoading, setIsConnectionsLoading] = useState(false)
  const [busyConnectionId, setBusyConnectionId] = useState("")

  // 详情抽屉
  const [drawerPlugin, setDrawerPlugin] = useState<MarketPlugin | null>(null)
  const [isProbing, setIsProbing] = useState(false)
  const [probeOutcome, setProbeOutcome] = useState<ProbeOutcome>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectError, setConnectError] = useState("")
  const [connectNotice, setConnectNotice] = useState("")
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([])

  // 在线试调
  const [invokeConnId, setInvokeConnId] = useState("")
  const [invokeToolName, setInvokeToolName] = useState("")
  const [invokeArgsText, setInvokeArgsText] = useState("{}")
  const [isInvoking, setIsInvoking] = useState(false)
  const [invokeOutcome, setInvokeOutcome] = useState<InvokeOutcome>(null)

  // 调用留档（5s 可见轮询）
  const [invokeLog, setInvokeLog] = useState<MarketInvocationRow[]>([])
  const [isLoadingLog, setIsLoadingLog] = useState(false)
  const [expandedLogId, setExpandedLogId] = useState("")
  const pollTimerRef = useRef<number | null>(null)
  const [advancedOpen,setAdvancedOpen] = useState(false)
  const advancedInitialized = useRef(false)

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

  const loadMarket = useCallback(
    async (mode: "reset" | "more", query: string) => {
      if (mode === "reset") {
        setIsMarketLoading(true)
        setMarketError("")
      } else {
        setIsMarketLoadingMore(true)
      }
      try {
        const params = new URLSearchParams()
        if (query) params.set("q", query)
        if (mode === "more" && marketNextCursor) params.set("cursor", marketNextCursor)
        const res = await apiFetch(`/api/market/list?${params.toString()}`)
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setMarketError(data?.message || "市场数据加载失败，请稍后重试")
          return
        }
        const items = Array.isArray(data?.items) ? (data.items as MarketPlugin[]) : []
        setMarketItems((prev) => (mode === "more" ? [...prev, ...applyCuratedZh(items)] : applyCuratedZh(items)))
        setMarketNextCursor(String(data?.next_cursor || ""))
      } catch (err) {
        if (err instanceof AuthRequiredError) return
        setMarketError(err instanceof Error && err.message ? err.message : "网络异常，市场数据加载失败，请重试")
      } finally {
        setIsMarketLoading(false)
        setIsMarketLoadingMore(false)
      }
    },
    [apiFetch, marketNextCursor],
  )

  // 热门推荐：精选 term 并行 GET /api/market/lookup 取真实注册表条目（allSettled，全灭也不崩）
  const loadFeatured = useCallback(async () => {
    setIsFeaturedLoading(true)
    try {
      const results = await Promise.allSettled(
        CURATED_PLUGINS.map(async (entry) => {
          // 固定通道条目（注册表条目走 OAuth 死胡同时的官方直连）直接用 pin，不查注册表
          if (entry.pin) {
            return {
              name: entry.pin.name,
              title: entry.pin.title,
              description: entry.pin.desc || "",
              version: "",
              remotes: [{ type: "streamable-http", url: entry.pin.url }],
              packages: [],
              zh_title: entry.zh_title,
              zh_desc: entry.zh_desc,
            } as MarketPlugin
          }
          const res = await apiFetch(`/api/market/lookup?name=${encodeURIComponent(entry.term)}`)
          if (!res.ok) return null
          const data = await res.json().catch(() => null)
          const item = data?.item as MarketPlugin | null | undefined
          if (!item || !item.name) return null
          return {
            ...item,
            zh_title: entry.zh_title || item.zh_title,
            zh_desc: entry.zh_desc || item.zh_desc,
          }
        }),
      )
      const resolved: MarketPlugin[] = []
      for (const outcome of results) {
        if (outcome.status === "fulfilled" && outcome.value) resolved.push(outcome.value)
      }
      setFeaturedItems(resolved)
    } finally {
      setIsFeaturedLoading(false)
    }
  }, [apiFetch])

  const loadConnections = useCallback(async () => {
    if (!rhUserId) return
    setIsConnectionsLoading(true)
    try {
      const res = await apiFetch("/api/market/connections")
      if (res.ok) {
        const data = await res.json()
        setConnectionRows(Array.isArray(data?.items) ? (data.items as ConnectionRow[]) : [])
      }
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("连接列表加载失败，请稍后重试")
    } finally {
      setIsConnectionsLoading(false)
    }
  }, [apiFetch, rhUserId])

  const loadInvokeLog = useCallback(
    async (silent = false) => {
      if (!rhUserId) return
      if (!silent) setIsLoadingLog(true)
      try {
        const res = await apiFetch("/api/market/invocations")
        if (res.ok) {
          const data = await res.json()
          setInvokeLog(Array.isArray(data?.items) ? (data.items as MarketInvocationRow[]) : [])
        }
      } catch (err) {
        if (!(err instanceof AuthRequiredError) && !silent) setErrorMsg("调用留档加载失败，请稍后重试")
      } finally {
        if (!silent) setIsLoadingLog(false)
      }
    },
    [apiFetch, rhUserId],
  )

  // 留档 5s 可见轮询（页面隐藏时暂停）
  useEffect(() => {
    if (!rhUserId || !advancedOpen) return
    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current)
    pollTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadInvokeLog(true)
    }, 5000)
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [rhUserId, loadInvokeLog, advancedOpen])

  const submitMarketSearch = useCallback(() => {
    const q = marketSearchText.trim()
    setMarketActiveQuery(q)
    setMarketNextCursor("")
    void (async () => {
      setIsMarketLoading(true)
      setMarketError("")
      try {
        const params = new URLSearchParams()
        if (q) params.set("q", q)
        const res = await apiFetch(`/api/market/list?${params.toString()}`)
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setMarketError(data?.message || "搜索失败，请稍后重试")
          return
        }
        setMarketItems(applyCuratedZh(Array.isArray(data?.items) ? (data.items as MarketPlugin[]) : []))
        setMarketNextCursor(String(data?.next_cursor || ""))
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setMarketError("网络异常，搜索失败，请重试")
      } finally {
        setIsMarketLoading(false)
      }
    })()
  }, [apiFetch, marketSearchText])

  const loadMoreMarket = useCallback(() => {
    if (!marketNextCursor || isMarketLoadingMore) return
    void loadMarket("more", marketActiveQuery)
  }, [loadMarket, marketActiveQuery, marketNextCursor, isMarketLoadingMore])

  const retryMarket = useCallback(() => {
    setMarketNextCursor("")
    void loadMarket("reset", marketActiveQuery)
  }, [loadMarket, marketActiveQuery])

  // 「翻译简介」：批量翻译当前列表里还没有中文的条目（≤24 条），缓存落库并即时替换显示；
  // 失败/未翻译静默回落英文原文，不编中文。
  const runTranslate = useCallback(async () => {
    const pendingItems = marketItems.filter((item) => !item.zh_desc).slice(0, 24)
    if (pendingItems.length === 0) {
      setNoticeMsg("当前列表里的插件简介都已经有中文了")
      return
    }
    setIsTranslating(true)
    setErrorMsg("")
    try {
      const messages: LlmMessage[] = [
        { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify(
            pendingItems.map((item) => ({
              name: item.name,
              title: item.title || "",
              description: String(item.description || "").slice(0, 300),
            })),
          ),
        },
      ]
      const result = await callLlmWithFallback(TRANSLATE_MODEL, { messages, page: "plugin-market", max_tokens: 4096 })
      if (result.needsLogin) {
        setNeedsRhLogin(true)
        setErrorMsg("登录态已过期，请重新登录后再翻译")
        return
      }
      if (!result.ok || result.status !== "success") {
        const code = String(result.error || "")
        setErrorMsg(
          code === "model_connection_required"
            ? "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接"
            : "翻译失败，请稍后重试",
        )
        return
      }
      const rows = parseTranslationJson(result.text || "")
      if (rows.length === 0) {
        setErrorMsg("翻译结果格式异常，请重试")
        return
      }
      const rowByName: Record<string, TranslationRow> = {}
      for (const row of rows) rowByName[row.name] = row
      // 批量缓存进 market_i18n（失败不阻断本次即时替换显示）
      try {
        await apiFetch("/api/market/i18n", {
          method: "POST",
          body: JSON.stringify({
            items: rows.map((row) => ({ server_name: row.name, zh_title: row.zh_title, zh_desc: row.zh_desc })),
          }),
        })
      } catch (cacheErr) {
        if (cacheErr instanceof AuthRequiredError) return
      }
      const patchList = (list: MarketPlugin[]) =>
        list.map((item) => {
          const hit = rowByName[item.name]
          if (!hit || item.zh_desc) return item
          return { ...item, zh_title: item.zh_title || hit.zh_title, zh_desc: hit.zh_desc }
        })
      setMarketItems((prev) => patchList(prev))
      setFeaturedItems((prev) => patchList(prev))
      setNoticeMsg(`已翻译 ${rows.length} 条插件简介并缓存，之后会直接显示中文`)
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，翻译失败，请重试")
    } finally {
      setIsTranslating(false)
    }
  }, [apiFetch, marketItems])

  const translateMarket = useCallback(() => {
    void runTranslate()
  }, [runTranslate])

  // 已连接 url → 连接行 映射（卡片「已连接」徽标）
  const connectionByUrl = useMemo(() => {
    const map: Record<string, ConnectionRow> = {}
    for (const row of connectionRows) map[row.url] = row
    return map
  }, [connectionRows])

  const connectedCount = useMemo(() => connectionRows.filter(row =>
    row.enabled && row.tool_count > 0 && row.last_probe_status === "ok").length, [connectionRows])

  const openDrawer = useCallback(
    (plugin: MarketPlugin) => {
      setDrawerPlugin(plugin)
      setProbeOutcome(null)
      setConnectError("")
      setConnectNotice("")
      const existing = connectionByUrl[plugin.remotes?.[0]?.url || ""]
      setHeaderRows(existing ? [] : [{ key: "", value: "" }])
    },
    [connectionByUrl],
  )

  const closeDrawer = useCallback(() => {
    setDrawerPlugin(null)
    setProbeOutcome(null)
    setConnectError("")
    setConnectNotice("")
  }, [])

  const addHeaderRow = useCallback(() => {
    setHeaderRows((prev) => (prev.length >= 10 ? prev : [...prev, { key: "", value: "" }]))
  }, [])

  const updateHeaderRow = useCallback((idx: number, patch: Partial<HeaderRow>) => {
    setHeaderRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }, [])

  const removeHeaderRow = useCallback((idx: number) => {
    setHeaderRows((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const cleanHeaders = useCallback((): HeaderRow[] => {
    return headerRows.filter((row) => row.key.trim())
  }, [headerRows])

  const drawerConnection = useMemo(() => {
    if (!drawerPlugin) return null
    const url = drawerPlugin.remotes?.[0]?.url || ""
    return url ? connectionByUrl[url] || null : null
  }, [connectionByUrl, drawerPlugin])

  const runProbe = useCallback(async () => {
    if (!drawerPlugin || isProbing) return
    const url = drawerPlugin.remotes?.[0]?.url || ""
    if (!url) return
    setIsProbing(true)
    setProbeOutcome(null)
    try {
      const res = await apiFetch("/api/market/probe", {
        method: "POST",
        body: JSON.stringify({ url, headers: cleanHeaders() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setProbeOutcome({ ok: false, tools: [], tool_count: 0, message: data?.message || "探测请求失败", error_code: data?.error || "", latency_ms: 0 })
        return
      }
      setProbeOutcome({
        ok: Boolean(data?.ok),
        tools: Array.isArray(data?.tools) ? (data.tools as MarketTool[]) : [],
        tool_count: Number(data?.tool_count || 0),
        message: String(data?.message || ""),
        error_code: String(data?.error_code || ""),
        latency_ms: Number(data?.latency_ms || 0),
      })
    } catch (err) {
      if (!(err instanceof AuthRequiredError))
        setProbeOutcome({ ok: false, tools: [], tool_count: 0, message: "网络异常，探测失败，请重试", error_code: "network", latency_ms: 0 })
    } finally {
      setIsProbing(false)
    }
  }, [apiFetch, cleanHeaders, drawerPlugin, isProbing])

  const runConnect = useCallback(async () => {
    if (!drawerPlugin || isConnecting) return
    const remote = drawerPlugin.remotes?.[0]
    if (!remote) return
    setIsConnecting(true)
    setConnectError("")
    setConnectNotice("")
    try {
      const res = await apiFetch("/api/market/connect", {
        method: "POST",
        body: JSON.stringify({
          name: drawerPlugin.name,
          title: drawerPlugin.title || drawerPlugin.name,
          url: remote.url,
          headers: cleanHeaders(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setConnectError(data?.message || "连接失败，请稍后重试")
        return
      }
      if (!data?.ok) {
        setConnectError(String(data?.message || "连接失败") + (data?.hint ? `（${data.hint}）` : ""))
        return
      }
      setConnectNotice(`已连接，工具快照收录 ${Number(data?.connection?.tool_count || 0)} 个工具，已自动进入你的助手工具集`)
      setProbeOutcome(null)
      setHeaderRows([])
      await loadConnections()
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) setConnectError("网络异常，连接失败，请重试")
    } finally {
      setIsConnecting(false)
    }
  }, [apiFetch, cleanHeaders, drawerPlugin, isConnecting, loadConnections])

  const toggleConnection = useCallback(
    async (row: ConnectionRow) => {
      setBusyConnectionId(row.id)
      try {
        const res = await apiFetch("/api/market/toggle", {
          method: "POST",
          body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setErrorMsg(data?.message || "启停失败，请稍后重试")
          return
        }
        setNoticeMsg(!row.enabled ? `已启用「${row.title || row.server_name}」，助手运行将包含其工具` : `已停用「${row.title || row.server_name}」，助手运行不再包含其工具`)
        await loadConnections()
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，启停失败，请重试")
      } finally {
        setBusyConnectionId("")
      }
    },
    [apiFetch, loadConnections],
  )

  const reprobeConnection = useCallback(
    async (row: ConnectionRow) => {
      setBusyConnectionId(row.id)
      try {
        const res = await apiFetch("/api/market/reprobe", { method: "POST", body: JSON.stringify({ id: row.id }) })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorMsg(data?.message || "重探失败，请稍后重试")
          return
        }
        if (data?.ok) setNoticeMsg(`「${row.title || row.server_name}」重探成功，工具快照已刷新（${Number(data?.tool_count || 0)} 个工具）`)
        else setNoticeMsg(`「${row.title || row.server_name}」重探未通过：${String(data?.message || "")}`)
        await loadConnections()
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，重探失败，请重试")
      } finally {
        setBusyConnectionId("")
      }
    },
    [apiFetch, loadConnections],
  )

  const deleteConnection = useCallback(
    async (row: ConnectionRow) => {
      setBusyConnectionId(row.id)
      try {
        const res = await apiFetch(`/api/market/connections/${encodeURIComponent(row.id)}`, { method: "DELETE" })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setErrorMsg(data?.message || "断开失败，请稍后重试")
          return
        }
        setNoticeMsg(`已断开「${row.title || row.server_name}」，其工具已从助手工具集移除`)
        if (invokeConnId === row.id) {
          setInvokeConnId("")
          setInvokeToolName("")
          setInvokeOutcome(null)
        }
        await loadConnections()
      } catch (err) {
        if (!(err instanceof AuthRequiredError)) setErrorMsg("网络异常，断开失败，请重试")
      } finally {
        setBusyConnectionId("")
      }
    },
    [apiFetch, invokeConnId, loadConnections],
  )

  const enabledConnections = useMemo(() => connectionRows.filter(row =>
    row.enabled && row.tool_count > 0 && row.last_probe_status === "ok"), [connectionRows])

  const invokeConn = useMemo(() => connectionRows.find((row) => row.id === invokeConnId) || null, [connectionRows, invokeConnId])

  const invokeTool = useMemo(() => invokeConn?.tools.find((t) => t.name === invokeToolName) || null, [invokeConn, invokeToolName])

  const selectInvokeConn = useCallback(
    (connId: string) => {
      setInvokeConnId(connId)
      setInvokeToolName("")
      setInvokeOutcome(null)
      const row = connectionRows.find((item) => item.id === connId)
      if (row && row.tools.length > 0) {
        setInvokeToolName(row.tools[0].name)
        setInvokeArgsText(buildExampleArgs(row.tools[0]))
      } else {
        setInvokeArgsText("{}")
      }
    },
    [connectionRows],
  )

  const selectInvokeTool = useCallback(
    (toolName: string) => {
      setInvokeToolName(toolName)
      const row = connectionRows.find((item) => item.id === invokeConnId)
      const tool = row?.tools.find((t) => t.name === toolName) || null
      setInvokeArgsText(buildExampleArgs(tool))
      setInvokeOutcome(null)
    },
    [connectionRows, invokeConnId],
  )

  const startInvokeFromDrawer = useCallback(
    (row: ConnectionRow, toolName?: string) => {
      setDrawerPlugin(null)
      setInvokeConnId(row.id)
      const firstTool = toolName || row.tools[0]?.name || ""
      setInvokeToolName(firstTool)
      const tool = row.tools.find((t) => t.name === firstTool) || null
      setInvokeArgsText(buildExampleArgs(tool))
      setInvokeOutcome(null)
    },
    [],
  )

  const runInvoke = useCallback(async () => {
    if (!invokeConnId || !invokeToolName || isInvoking) return
    let parsedArgs: Record<string, unknown>
    try {
      parsedArgs = JSON.parse(invokeArgsText || "{}")
      if (!parsedArgs || typeof parsedArgs !== "object" || Array.isArray(parsedArgs)) {
        setErrorMsg("参数需要是一个 JSON 对象，例如 {}")
        return
      }
    } catch {
      setErrorMsg("参数不是合法 JSON，请检查后再调用")
      return
    }
    const needsWriteConfirmation = invokeTool?.read_only!==true || invokeTool?.destructive===true
    if (needsWriteConfirmation && !window.confirm(
      "此 MCP 工具未被发布者明确标记为只读，可能访问账户数据或执行写操作。\n请核对授权范围和参数，确认仍要立即试调？"
    )) return
    setErrorMsg("")
    setIsInvoking(true)
    setInvokeOutcome(null)
    try {
      const res = await apiFetch("/api/market/invoke", {
        method: "POST",
        body: JSON.stringify({ connection_id: invokeConnId, tool_name: invokeToolName,
          arguments: parsedArgs, confirm_external_write: needsWriteConfirmation }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setInvokeOutcome({ ok: false, output: "", error: data?.message || "调用请求失败", error_code: data?.error || "", latency_ms: 0, retried: false })
        return
      }
      setInvokeOutcome({
        ok: Boolean(data?.ok),
        output: String(data?.output || ""),
        error: String(data?.error || ""),
        error_code: String(data?.error_code || ""),
        latency_ms: Number(data?.latency_ms || 0),
        retried: Boolean(data?.retried),
      })
      void loadInvokeLog(true)
    } catch (err) {
      if (!(err instanceof AuthRequiredError))
        setInvokeOutcome({ ok: false, output: "", error: "网络异常，调用失败，请重试", error_code: "network", latency_ms: 0, retried: false })
    } finally {
      setIsInvoking(false)
    }
  }, [apiFetch, invokeArgsText, invokeConnId, invokeToolName, invokeTool, isInvoking, loadInvokeLog])

  const toggleLogRow = useCallback((rowId: string) => {
    setExpandedLogId((prev) => (prev === rowId ? "" : rowId))
  }, [])

  // Smithery Connect v2: discover via vendor-side search and use real managed
  // connection states. Browsing never triggers hidden translation/model fees.
  const [hasSmitheryKey, setHasSmitheryKey] = useState(false)
  const [smitheryKeyTail, setSmitheryKeyTail] = useState("")
  const [smitheryKeyInput, setSmitheryKeyInput] = useState("")
  const [smitheryKeyBusy, setSmitheryKeyBusy] = useState(false)
  const [smitheryItems, setSmitheryItems] = useState<SmitheryItem[]>([])
  const [smitheryQuery, setSmitheryQuery] = useState("")
  const [smitheryActiveQuery, setSmitheryActiveQuery] = useState("")
  const [smitheryPage, setSmitheryPage] = useState(1)
  const [smitheryNextPage, setSmitheryNextPage] = useState(0)
  const [smitheryLoading, setSmitheryLoading] = useState(false)
  const [smitheryLoadingMore, setSmitheryLoadingMore] = useState(false)
  const [smitheryError, setSmitheryError] = useState("")
  const [smitheryConnectBusy, setSmitheryConnectBusy] = useState("")
  const [smitheryNamespaces, setSmitheryNamespaces] = useState<string[]>([])
  const [smitheryNamespace, setSmitheryNamespace] = useState("")
  const [smitheryNamespacesBusy, setSmitheryNamespacesBusy] = useState(false)
  const [smitherySelected, setSmitherySelected] = useState<SmitheryItem | null>(null)
  const [smitheryConnectionResult, setSmitheryConnectionResult] = useState<SmitheryConnectOutcome>(null)
  const smitheryFetchSequence = useRef(0)
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState("")
  const [customUrl, setCustomUrl] = useState("")
  const [customToken, setCustomToken] = useState("")
  const [customBusy, setCustomBusy] = useState(false)

  const loadSmitheryNamespaces = useCallback(async () => {
    setSmitheryNamespacesBusy(true)
    try {
      const res = await apiFetch("/api/market/smithery/v2/namespaces")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSmitheryError(String(data.message || "无法读取工作空间，请到 Smithery 后台创建 Namespace"))
        return
      }
      const names = (Array.isArray(data.namespaces) ? data.namespaces : [])
        .filter((name: unknown): name is string => typeof name === "string")
      setSmitheryNamespaces(names)
      setSmitheryNamespace(old => names.includes(old) ? old : names[0] || "")
    } catch (error) {
      if (!(error instanceof AuthRequiredError))
        setSmitheryError("无法获取 Smithery 工作空间，请检查 Key 或网络")
    } finally {
      setSmitheryNamespacesBusy(false)
    }
  }, [apiFetch])

  const loadSmitheryServers = useCallback(async (query: string, page = 1) => {
    const seq = ++smitheryFetchSequence.current
    const first = page === 1
    if (first) {
      setSmitheryLoading(true)
      setSmitheryError("")
      setSmitheryActiveQuery(query.trim())
    } else setSmitheryLoadingMore(true)
    try {
      const params = new URLSearchParams({q:query.trim(),page:String(page)})
      const res = await apiFetch("/api/market/smithery/v2/catalog?" + params.toString())
      const data = await res.json().catch(() => ({}))
      if(seq!==smitheryFetchSequence.current) return
      if(!res.ok){
        setSmitheryError(String(data.message || "Smithery 注册表搜索失败，请检查 Key 后重试"))
        if(first)setSmitheryItems([])
        return
      }
      const items = Array.isArray(data.items) ? data.items as SmitheryItem[] : []
      setSmitheryItems(current=>first?items:[
        ...current,...items.filter(item=>!current.some(existing=>existing.slug===item.slug)),
      ])
      setSmitheryPage(page)
      setSmitheryNextPage(Math.max(0,Number(data.next_page)||0))
    } catch (err) {
      if(seq===smitheryFetchSequence.current && !(err instanceof AuthRequiredError))
        setSmitheryError("Smithery 搜索网络失败，检查连接后重试")
    } finally {
      if(seq===smitheryFetchSequence.current){
        setSmitheryLoading(false)
        setSmitheryLoadingMore(false)
      }
    }
  },[apiFetch])

  const loadSmitheryStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/market/smithery/status")
      if (!res.ok) return
      const data = await res.json()
      const saved=Boolean(data.has_key)
      setHasSmitheryKey(saved)
      setSmitheryKeyTail(String(data.tail || ""))
      if (saved) {
        void loadSmitheryNamespaces()
        void loadSmitheryServers("")
      }
    } catch {
      // Business page remains usable if vendor key status is temporarily down.
    }
  }, [apiFetch,loadSmitheryServers,loadSmitheryNamespaces])

  const saveSmitheryKey = useCallback(async () => {
    const keyText = smitheryKeyInput.trim()
    if (!keyText || smitheryKeyBusy) return
    setSmitheryKeyBusy(true)
    setSmitheryError("")
    try {
      const res = await apiFetch("/api/market/smithery/key", {
        method: "POST",body:JSON.stringify({api_key:keyText}),
      })
      const data = await res.json().catch(() => ({}))
      if(!res.ok){
        setSmitheryError(String(data.message || "Smithery Key 校验失败，请检查是否复制了 API Key"))
        return
      }
      setSmitheryKeyInput("")
      setHasSmitheryKey(true)
      setSmitheryKeyTail(String(data.tail || ""))
      setSmitheryConnectionResult(null)
      void loadSmitheryNamespaces()
      void loadSmitheryServers("")
      await loadConnections()
    } catch(error){
      if (!(error instanceof AuthRequiredError))
        setSmitheryError("Key 保存失败，请检查网络后重试")
    } finally {setSmitheryKeyBusy(false)}
  },[apiFetch,smitheryKeyInput,smitheryKeyBusy,loadConnections,loadSmitheryServers,loadSmitheryNamespaces])

  const removeSmitheryKey = useCallback(async () => {
    if(!window.confirm("确定移除 Smithery Key？此账号的托管插件会立即停用，并需重新授权后才能使用。"))return
    try{
      const res=await apiFetch("/api/market/smithery/key",{method:"DELETE"})
      if(!res.ok)throw new Error("key_remove_failed")
      setHasSmitheryKey(false)
      setSmitheryKeyTail("")
      setSmitheryItems([])
      setSmitheryNamespaces([])
      setSmitheryNamespace("")
      setSmitheryConnectionResult(null)
      setSmitherySelected(null)
      await loadConnections()
      setNoticeMsg("已移除 Smithery Key，原有托管插件已停用")
    }catch(error){
      if(!(error instanceof AuthRequiredError))
        setSmitheryError("移除 Key 失败，请稍后重试")
    }
  },[apiFetch,loadConnections])

  const connectSmithery = useCallback(async (item: SmitheryItem) => {
    if (smitheryConnectBusy || !smitheryNamespace) {
      setSmitheryError(!smitheryNamespace?"请先选择 Smithery Namespace":"连接正在处理中")
      return
    }
    setSmitheryConnectBusy(item.slug)
    setSmitherySelected(item)
    setSmitheryConnectionResult(null)
    setSmitheryError("")
    try {
      const res=await apiFetch("/api/market/smithery/v2/connect",{
        method:"POST",body:JSON.stringify({
          slug:item.slug,title:item.zh_title||item.title,
          namespace:smitheryNamespace,
        }),
      })
      const data=await res.json().catch(()=>({}))
      if(!res.ok || !data.ok){
        setSmitheryError(String(data.message||"Smithery 托管连接失败，请检查 Key、插件和工作空间"))
        return
      }
      setSmitheryConnectionResult({
        id:String(data.id||""),state:String(data.state||"error"),
        tool_count:Number(data.tool_count||0),
        setup_url:safeSmitherySetupUrl(String(data.setup_url||"")),
        missing:Array.isArray(data.missing)?data.missing:[],
        message:String(data.message||""),
      })
      await loadConnections()
      if(data.state==="connected" && Number(data.tool_count)>0)
        setNoticeMsg(item.title+" 已连接，工具已通过授权验证并可供 Agent 使用")
    } catch(error){
      if(!(error instanceof AuthRequiredError))
        setSmitheryError("连接失败，检查网络和 Smithery 服务状态")
    } finally {setSmitheryConnectBusy("")}
  },[apiFetch,smitheryConnectBusy,smitheryNamespace,loadConnections])

  const refreshSmitheryConnection = useCallback(async (row:ConnectionRow) => {
    if (smitheryConnectBusy) return
    setSmitheryConnectBusy(row.id)
    setSmitheryError("")
    try{
      const res=await apiFetch("/api/market/smithery/v2/refresh",{
        method:"POST",body:JSON.stringify({id:row.id}),
      })
      const data=await res.json().catch(()=>({}))
      if(!res.ok){
        setSmitheryError(String(data.message||"Smithery 连接复核失败"))
        await loadConnections()
        return
      }
      setSmitheryConnectionResult({
        id:String(data.id||row.id),state:String(data.state||"error"),
        tool_count:Number(data.tool_count||0),
        setup_url:safeSmitherySetupUrl(String(data.setup_url||"")),
        missing:Array.isArray(data.missing)?data.missing:[],
        message:String(data.message||""),
      })
      await loadConnections()
      if(data.state==="connected" && data.tool_count>0)
        setNoticeMsg(row.title+" 已完成授权，发现 "+data.tool_count+" 个工具")
    }catch(error){
      if(!(error instanceof AuthRequiredError))setSmitheryError("无法核查授权，请稍后重试")
    }finally{setSmitheryConnectBusy("")}
  },[apiFetch,smitheryConnectBusy,loadConnections])
  const connectCustomPlugin = useCallback(async () => {
    const urlText = customUrl.trim()
    if (!urlText || customBusy) return
    setCustomBusy(true)
    setSmitheryError("")
    try {
      const headers = customToken.trim() ? [{ key: "Authorization", value: `Bearer ${customToken.trim()}` }] : []
      const nameText = customName.trim() || urlText
      const res = await apiFetch("/api/market/connect", {
        method: "POST",
        body: JSON.stringify({ name: nameText, title: nameText, url: urlText, headers }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setSmitheryError(String(data?.message || "连接失败，请稍后重试"))
        return
      }
      const connId = String(data?.connection?.id || "")
      if (connId) {
        await apiFetch("/api/market/reprobe", { method: "POST", body: JSON.stringify({ id: connId }) }).catch(() => null)
      }
      setCustomName("")
      setCustomUrl("")
      setCustomToken("")
      setCustomOpen(false)
      await loadConnections()
    } catch {
      setSmitheryError("网络异常，连接失败")
    } finally {
      setCustomBusy(false)
    }
  }, [apiFetch, customUrl, customName, customToken, customBusy, loadConnections])

  // The public MCP registry and invocation logs are advanced diagnostics.
  // Their dozens of third-party lookups must not delay Smithery discovery.
  const changeAdvancedOpen=useCallback((next:boolean)=>{
    setAdvancedOpen(next)
    if(!next || advancedInitialized.current)return
    advancedInitialized.current=true
    void loadMarket("reset","")
    void loadFeatured()
    void loadInvokeLog()
  },[loadMarket,loadFeatured,loadInvokeLog])

  // Initial page data belongs to the authenticated employee. Defer the
  // first state change, and don't invoke a hook callback before declaration.
  useEffect(() => {
    if (!rhUserId) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      void loadConnections()
      void loadSmitheryStatus()
    })
    return () => { cancelled = true }
  }, [rhUserId, loadConnections, loadSmitheryStatus])

  const dismissError = useCallback(() => setErrorMsg(""), [])
  const dismissNotice = useCallback(() => setNoticeMsg(""), [])

  return {
    isLoggedIn: Boolean(rhUserId),
    needsRhLogin,
    onLoginClick: redirectToRhLogin,
    errorMsg,
    dismissError,
    noticeMsg,
    dismissNotice,
    changeAdvancedOpen,
    // 市场浏览
    marketItems,
    marketNextCursor,
    marketSearchText,
    setMarketSearchText,
    marketActiveQuery,
    isMarketLoading,
    isMarketLoadingMore,
    marketError,
    submitMarketSearch,
    loadMoreMarket,
    retryMarket,
    // 热门推荐 + 翻译简介
    featuredItems,
    isFeaturedLoading,
    isTranslating,
    translateMarket,
    // Smithery 快连与自建插件
    hasSmitheryKey,
    smitheryKeyTail,
    smitheryKeyInput,
    setSmitheryKeyInput,
    smitheryKeyBusy,
    saveSmitheryKey,
    removeSmitheryKey,
    smitheryItems,
    smitheryQuery,
    setSmitheryQuery,
    smitheryLoading,
    smitheryLoadingMore,
    smitheryActiveQuery,
    smitheryPage,
    smitheryNextPage,
    smitheryNamespaces,
    smitheryNamespace,
    setSmitheryNamespace,
    smitheryNamespacesBusy,
    loadSmitheryNamespaces,
    smitherySelected,
    setSmitherySelected,
    smitheryConnectionResult,
    setSmitheryConnectionResult,
    refreshSmitheryConnection,
    smitheryError,
    loadSmitheryServers,
    smitheryConnectBusy,
    connectSmithery,
    customOpen,
    setCustomOpen,
    customName,
    setCustomName,
    customUrl,
    setCustomUrl,
    customToken,
    setCustomToken,
    customBusy,
    connectCustomPlugin,
    // 我的连接
    connectionRows,
    connectionByUrl,
    enabledConnections,
    connectedCount,
    isConnectionsLoading,
    busyConnectionId,
    toggleConnection,
    reprobeConnection,
    deleteConnection,
    // 详情抽屉
    drawerPlugin,
    drawerConnection,
    openDrawer,
    closeDrawer,
    isProbing,
    probeOutcome,
    runProbe,
    isConnecting,
    connectError,
    connectNotice,
    headerRows,
    addHeaderRow,
    updateHeaderRow,
    removeHeaderRow,
    runConnect,
    // 在线试调
    invokeConnId,
    invokeConn,
    invokeToolName,
    invokeTool,
    invokeArgsText,
    setInvokeArgsText,
    isInvoking,
    invokeOutcome,
    selectInvokeConn,
    selectInvokeTool,
    startInvokeFromDrawer,
    runInvoke,
    // 调用留档
    invokeLog,
    isLoadingLog,
    expandedLogId,
    toggleLogRow,
    invokeStatusMeta: INVOKE_STATUS_META,
  }
}
