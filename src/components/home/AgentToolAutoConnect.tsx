import { useEffect, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import { safeMarketplaceQuery, agentResourceSetupUrl } from "@/lib/toolSearchPrivacy"
import { ExternalLink, Search } from "lucide-react"
import { Link } from "react-router-dom"
import type { ToolResolution } from "@/lib/agentToolMatcher"

type Props = {
  analysis: ToolResolution | null
  returnSpecId?: string
}
/** One marketplace discovery panel; the capability planner owns needs and bindings. */
export function AgentToolAutoConnect({analysis,returnSpecId}:Props){
  const [discoveries,setDiscoveries]=useState<{slug:string;title:string;desc:string;query:string}[]>([])
  const [discoveryStatus,setDiscoveryStatus]=useState<"idle"|"loading"|"needs_key"|"ok"|"unavailable">("idle")
  const discoveryQuery=[...new Set((analysis?.gaps||[]).slice(0,8)
    .map(item=>safeMarketplaceQuery(item.searchTerm)).filter(Boolean))].slice(0,3).join("|")
  useEffect(()=>{
    if(!discoveryQuery){
      setDiscoveries([])
      setDiscoveryStatus("idle")
      return
    }
    let cancelled=false
    const controller=new AbortController()
    const timer=window.setTimeout(()=>{
      if(cancelled)return
      setDiscoveryStatus("loading")
      void (async()=>{
        const terms=discoveryQuery.split("|").filter(Boolean).slice(0,3)
        const results=await Promise.all(terms.map(async query=>{
          try {
            const response=await fetch(getPocketBaseUrl()+
              "/api/market/smithery/v2/catalog?q="+encodeURIComponent(query.slice(0,90)),{
              headers:{...vibexAuthHeaders()},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),
            })
            if(response.status===400)return {state:"needs_key" as const,items:[]}
            if(!response.ok)return {state:"unavailable" as const,items:[]}
            const data=await response.json()
            const rows=Array.isArray(data?.items)?data.items:[]
            return {state:"ok" as const,items:rows.filter((item:{
              slug?:string;verified?:boolean
            })=>item.verified===true && /^[a-zA-Z0-9@_/-]{1,120}$/.test(item.slug||""))
              .slice(0,3).map((row:{slug:string;title?:string;desc?:string})=>({
                slug:row.slug,title:String(row.title||row.slug).slice(0,100),
                desc:String(row.desc||"").slice(0,180),query,
              }))}
          }catch{return {state:"unavailable" as const,items:[]}}
        }))
        if(cancelled)return
        if(results.some(row=>row.state==="needs_key"))setDiscoveryStatus("needs_key")
        else if(results.some(row=>row.state==="ok"))setDiscoveryStatus("ok")
        else setDiscoveryStatus("unavailable")
        const unique=new Set<string>()
        setDiscoveries(results.flatMap(row=>row.items).filter(row=>{
          if(unique.has(row.slug))return false
          unique.add(row.slug);return true
        }).slice(0,6))
      })()
    },350)
    return()=>{cancelled=true;controller.abort();window.clearTimeout(timer)}
  },[discoveryQuery])
  if(!analysis?.gaps.length)return null
  return <section aria-label="插件市场自动发现" className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4 text-primary"/>插件市场候选</h4>
      <Link to={agentResourceSetupUrl("/plugin-market",returnSpecId||"")} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline">
        打开插件市场<ExternalLink className="h-3.5 w-3.5"/>
      </Link>
    </div>
    {(discoveryStatus==="loading" || discoveryStatus==="idle" && Boolean(discoveryQuery)) && <p role="status" className="mt-2 text-xs text-muted-foreground">正在按待连接能力查询当前已授权的 Smithery 目录…</p>}
    {discoveryStatus==="idle" && !discoveryQuery && <p className="mt-2 text-xs text-muted-foreground">这些需求暂无通用搜索词，请到插件市场选择能力关键词。</p>}
    {discoveryStatus==="needs_key" && <p className="mt-2 text-xs text-muted-foreground">连接 Smithery 后，可自动发现真实插件候选。在插件市场完成账号授权，再返回此方案。</p>}
    {discoveryStatus==="unavailable" && <p className="mt-2 text-xs text-muted-foreground">插件目录暂不可用，可以打开插件市场手动搜索。</p>}
    {discoveryStatus==="ok" && discoveries.length===0 && <p className="mt-2 text-xs text-muted-foreground">本次没有找到已验证的候选，可以调整关键词或接入自定义工具。</p>}
    {discoveries.length>0&&<ul className="mt-3 space-y-2">
      {discoveries.map(row=><li key={row.slug} className="flex min-w-0 flex-wrap items-start gap-2 rounded-lg bg-secondary/40 p-3 text-xs">
        <div className="min-w-0 flex-1">
          <strong className="block break-words">{row.title}</strong>
          <p className="mt-1 text-muted-foreground">{row.desc||"市场已验证的工具服务"}</p>
          <p className="mt-1 text-muted-foreground">匹配能力：{row.query}</p>
        </div>
        <Link to={agentResourceSetupUrl(`/plugin-market?plugin=${encodeURIComponent(row.slug)}`,returnSpecId||"")}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-primary/40 px-2.5 text-xs font-medium text-primary">
          查看并连接<ExternalLink className="h-3.5 w-3.5"/>
        </Link>
      </li>)}
    </ul>}
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">仅用通用能力词搜索市场。候选需由你授权连接、测试后再选用。</p>
  </section>
}
