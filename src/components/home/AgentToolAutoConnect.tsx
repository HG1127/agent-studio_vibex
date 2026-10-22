import { useEffect, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import { safeMarketplaceQuery, agentResourceSetupUrl } from "@/lib/toolSearchPrivacy"
import { discoverSmitheryCandidates, type SmitheryCandidate, type SmitheryDiscoveryState } from "@/lib/smitheryAutoDiscovery"
import { ExternalLink, RefreshCcw, Search } from "lucide-react"
import { Link } from "react-router-dom"
import type { ToolResolution } from "@/lib/agentToolMatcher"

type Props = {
  analysis: ToolResolution | null
  returnSpecId?: string
}

/** One marketplace discovery panel; the capability planner owns needs and bindings. */
export function AgentToolAutoConnect({ analysis, returnSpecId }: Props) {
  const [discovery, setDiscovery] = useState<{key:string; state:SmitheryDiscoveryState; items:SmitheryCandidate[]}>({
    key:"",state:"idle",items:[],
  })
  const [refreshCounter, setRefreshCounter] = useState(0)
  const discoveryQuery = [...new Set((analysis?.gaps || []).slice(0, 8)
    .map(item => safeMarketplaceQuery(item.searchTerm)).filter(Boolean))].slice(0, 3).join("|")
  const requestKey = discoveryQuery + "#" + refreshCounter
  const currentDiscovery = discovery.key === requestKey && discoveryQuery
  const discoveryStatus: SmitheryDiscoveryState | "loading" = !discoveryQuery ? "idle" :
    currentDiscovery ? discovery.state : "loading"
  const discoveries = currentDiscovery ? discovery.items : []

  useEffect(() => {
    if (!discoveryQuery) return
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void discoverSmitheryCandidates({
        baseUrl: getPocketBaseUrl(),
        searchTerms: discoveryQuery.split("|"),
        headers: { ...vibexAuthHeaders() },
        signal: controller.signal,
      }).then(result => {
        if (cancelled) return
        setDiscovery({key:requestKey,state:result.state,items:result.items})
      }).catch(() => {
        if (cancelled) return
        setDiscovery({key:requestKey,state:"unavailable",items:[]})
      })
    }, 350)
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer) }
  }, [discoveryQuery, requestKey])

  // After the user connects Smithery in a separate tab, re-check on return.
  // No timer-based polling or repeated catalog requests without a valid key.
  useEffect(() => {
    if (discoveryStatus !== "needs_key") return
    const refreshOnFocus = () => setRefreshCounter(count => count + 1)
    window.addEventListener("focus", refreshOnFocus)
    return () => window.removeEventListener("focus", refreshOnFocus)
  }, [discoveryStatus])

  if (!analysis?.gaps.length) return null
  return <section aria-label="插件市场自动发现" className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4 text-primary"/>插件市场候选</h4>
      <Link to={agentResourceSetupUrl("/plugin-market", returnSpecId || "")} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline">
        打开插件市场<ExternalLink className="h-3.5 w-3.5"/>
      </Link>
    </div>
    {(discoveryStatus === "loading" || discoveryStatus === "idle" && Boolean(discoveryQuery)) &&
      <p role="status" className="mt-2 text-xs text-muted-foreground">正在核验 Smithery 授权并搜索与缺失能力相符的插件…</p>}
    {discoveryStatus === "idle" && !discoveryQuery &&
      <p className="mt-2 text-xs text-muted-foreground">这些需求暂无通用搜索词，请到插件市场选择能力关键词。</p>}
    {discoveryStatus === "needs_key" &&
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        此账号尚未配置 Smithery 授权。连接后即可发现真实插件候选；未授权时不会反复请求插件目录。
      </p>}
    {discoveryStatus === "unavailable" &&
      <p role="status" className="mt-2 text-xs text-muted-foreground">暂时无法核验插件市场授权或目录，请检查连接，也可以前往插件市场手动操作。</p>}
    {(discoveryStatus === "needs_key" || discoveryStatus === "unavailable") &&
      <button type="button" onClick={() => setRefreshCounter(count => count + 1)}
        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-secondary">
        <RefreshCcw className="h-3.5 w-3.5"/>重新检查连接
      </button>}
    {discoveryStatus === "ok" && discoveries.length === 0 &&
      <p className="mt-2 text-xs text-muted-foreground">未找到已验证的候选，可以调整关键词或接入自定义工具。</p>}
    {discoveries.length > 0 && <ul className="mt-3 space-y-2">
      {discoveries.map(row => <li key={row.slug} className="flex min-w-0 flex-wrap items-start gap-2 rounded-lg bg-secondary/40 p-3 text-xs">
        <div className="min-w-0 flex-1">
          <strong className="block break-words">{row.title}</strong>
          <p className="mt-1 text-muted-foreground">{row.desc || "市场已验证的工具服务"}</p>
          <p className="mt-1 text-muted-foreground">匹配能力：{row.query}</p>
        </div>
        <Link to={agentResourceSetupUrl("/plugin-market?plugin=" + encodeURIComponent(row.slug), returnSpecId || "")}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-primary/40 px-2.5 text-xs font-medium text-primary">
          查看并连接<ExternalLink className="h-3.5 w-3.5"/>
        </Link>
      </li>)}
    </ul>}
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">仅用通用能力词搜索市场。候选需由你授权连接、测试后再选用。</p>
  </section>
}