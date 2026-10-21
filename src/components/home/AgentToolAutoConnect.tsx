import { useEffect, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import { safeMarketplaceQuery, addReturnAgentToUrl } from "@/lib/toolSearchPrivacy"
import { CheckCircle2, CircleAlert, ExternalLink, Link2, RefreshCcw, ShieldAlert, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"
import type { ToolResolution } from "@/lib/agentToolMatcher"

type Props = {
  analysis: ToolResolution | null
  selectedTools: string[]
  notice: string
  onRematch: () => void
  returnSpecId?: string
  onToggleTool: (name:string,checked:boolean)=>void
}
export function AgentToolAutoConnect({analysis,selectedTools,notice,onRematch,onToggleTool,returnSpecId}:Props){
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
              headers:{...vibexAuthHeaders()},signal:controller.signal,
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
  if(!analysis)return null
  const matched = analysis.recommendations.filter(row=>row.kind!=="builtin")
  const allAutoChosen=analysis.safeAutoBindings.every(id=>selectedTools.includes(id))
  return <section aria-label="AI 自动识别工具和连接建议"
    className="min-w-0 rounded-xl border border-primary/30 bg-card px-4 py-4 xl:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary"/>
        <h3 className="text-sm font-semibold">AI 需求识别 · 自动匹配工具</h3>
      </div>
      <button type="button" onClick={onRematch}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/40 px-3 text-xs font-medium text-primary hover:bg-primary/5">
        <RefreshCcw className="h-3.5 w-3.5"/> 重新匹配已连接工具
      </button>
    </div>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
      根据需求、任务范围和交付物识别工具。内置能力与已验证的只读工具可自动绑定；
      外部账号授权、写入工具及调用前审批仍需要你明确同意。
    </p>
    {notice&&<p role="status" className="mt-2 text-xs font-medium text-primary">{notice}</p>}
    <div className="mt-3 flex flex-wrap gap-2" aria-label="可直接调用的工具">
      {analysis.recommendations.filter(row=>row.autoBind).map(row=>
        <span key={row.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary"/>
          <span className="truncate">{row.label}</span>
          <span className="text-muted-foreground">{selectedTools.includes(row.id)?"已匹配":"可匹配"}</span>
        </span>)}
      {analysis.safeAutoBindings.length===0&&
        <p className="text-xs text-muted-foreground">尚未识别到可以自动授权的能力；可以在下方选择已连接工具。</p>}
    </div>
    {!allAutoChosen&&<p className="mt-2 text-xs text-muted-foreground">
      方案已被手动调整。点击「重新匹配」将补充当前可用的安全工具，不会创建第三方账号授权。
    </p>}
    {matched.some(row=>!row.autoBind)&&<div className="mt-3 space-y-2">
      {matched.filter(row=>!row.autoBind).map(row=><div key={row.id}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2.5">
        <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground"/>
        <span className="min-w-0 flex-1 text-xs leading-relaxed">
          <strong>{row.label}</strong> · {row.reason}
        </span>
        <button type="button" onClick={()=>onToggleTool(row.id,!selectedTools.includes(row.id))}
          aria-pressed={selectedTools.includes(row.id)}
          className="min-h-9 rounded-lg border border-primary/30 bg-background px-3 text-xs font-semibold text-primary hover:bg-primary/5">
          {selectedTools.includes(row.id)?"取消此工具":"明确选择此工具"}
        </button>
      </div>)}
    </div>}
    {analysis.gaps.length>0&&<div className="mt-4 border-t border-border pt-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold">
        <CircleAlert className="h-4 w-4 text-muted-foreground"/>
        还需要连接的能力（{analysis.gaps.length}）
      </h4>
      <div className="mt-2 space-y-2">
        {analysis.gaps.slice(0,12).map(item=><div key={item.name}
          className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="break-words text-xs font-semibold">{item.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
          </div>
          <Link to={addReturnAgentToUrl(safeMarketplaceQuery(item.searchTerm) ? `/plugin-market?tool=${encodeURIComponent(safeMarketplaceQuery(item.searchTerm))}` : "/plugin-market",returnSpecId||"")}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-primary/40 px-2.5 text-xs font-semibold text-primary hover:bg-primary/5">
            <Link2 className="h-3.5 w-3.5"/> 插件市场 <ExternalLink className="h-3 w-3"/>
          </Link>
          <Link to={safeMarketplaceQuery(item.searchTerm) ? `/tool-connections?tool=${encodeURIComponent(safeMarketplaceQuery(item.searchTerm))}` : "/tool-connections"}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1 text-xs text-primary hover:underline">
            自定义接口
          </Link>
        </div>)}
      </div>
      <div className="mt-3 rounded-lg border border-border bg-background/70 px-3 py-3">
        <p className="text-xs font-semibold">插件市场自动发现</p>
        {discoveryStatus==="loading" && <p role="status" className="mt-1 text-xs text-muted-foreground">正在按缺失能力查询当前已授权的 Smithery 目录…</p>}
        {discoveryStatus==="idle" && <p className="mt-1 text-xs text-muted-foreground">当前能力没有安全的通用搜索词。请打开插件市场自行选择关键词，避免向第三方发送内部任务描述。</p>}
        {discoveryStatus==="needs_key" && <p className="mt-1 text-xs text-muted-foreground">
          当前账号尚未配置 Smithery Key。前往插件市场完成授权后，可以自动搜索真实插件；不会替你创建第三方授权。
        </p>}
        {discoveryStatus==="unavailable" && <p className="mt-1 text-xs text-muted-foreground">插件目录暂不可用，仍可打开插件市场手动搜索。</p>}
        {discoveryStatus==="ok" && discoveries.length===0 && <p className="mt-1 text-xs text-muted-foreground">本次未检索到已验证的插件候选，可尝试更明确的能力名称。</p>}
        {discoveries.length>0&&<ul className="mt-2 space-y-2">
          {discoveries.map(row=><li key={row.slug} className="flex min-w-0 flex-wrap items-start gap-2 rounded-lg bg-secondary/40 p-2.5 text-xs">
            <div className="min-w-0 flex-1">
              <strong className="block truncate">{row.title}</strong>
              <p className="mt-0.5 text-muted-foreground">{row.desc||"市场已验证的工具服务"}</p>
              <p className="mt-0.5 text-muted-foreground">匹配通用能力：{row.query}</p>
            </div>
            <Link to={addReturnAgentToUrl(`/plugin-market?plugin=${encodeURIComponent(row.slug)}`,returnSpecId||"")}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-primary/40 px-2.5 text-xs font-medium text-primary">
              查看并连接 <ExternalLink className="h-3.5 w-3.5"/>
            </Link>
          </li>)}
        </ul>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        只使用通用能力词查询第三方插件目录，不外发你的任务正文。登录、OAuth 或接口配置由你确认；完成后返回此页重新匹配已验证工具。
      </p>
    </div>}
  </section>
}
