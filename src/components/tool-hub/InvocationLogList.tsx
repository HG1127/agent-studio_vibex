import {useEffect,useState} from "react"
import {Link} from "react-router-dom"
import {ChevronDown,ChevronLeft,ChevronRight,History,Loader2,RefreshCw,Search,X} from "lucide-react"
import type {InvocationRow} from "@/pages/ToolHub/useToolHub"
import {formatInvocationTime} from "@/pages/ToolHub/useToolHub"

type Props={
  invocationList:InvocationRow[]
  isLoading:boolean
  invocationFilter:string
  applyInvocationFilter:(name:string)=>void
  invocationPage:number
  invocationTotal:number
  invocationPages:number
  invocationError:string
  invocationSearch:string
  invocationStatus:string
  invocationSource:string
  invocationRunId:string
  clearInvocationRunId:()=>void
  changeInvocationPage:(page:number)=>void
  changeInvocationSearch:(text:string)=>void
  changeInvocationStatus:(status:string)=>void
  changeInvocationSource:(source:string)=>void
  expandedInvocationId:string
  toggleInvocationRow:(id:string)=>void
  sourceMeta:Record<string,{label:string;badge:string}>
  invStatusMeta:Record<string,{label:string;badge:string}>
  onRefresh:()=>void
}

export function InvocationLogList(p:Props){
  const [draft,setDraft]=useState(p.invocationSearch)
  useEffect(()=>setDraft(p.invocationSearch),[p.invocationSearch])
  const start=p.invocationTotal? (p.invocationPage-1)*20+1 : 0
  const end=p.invocationTotal?Math.min(p.invocationTotal,(p.invocationPage-1)*20+p.invocationList.length):0
  const anyFilter=Boolean(p.invocationFilter||p.invocationSearch||p.invocationStatus||p.invocationSource||p.invocationRunId)
  return <section aria-label="工具调用记录" className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <History className="h-5 w-5 text-primary"/>工具调用记录
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          每页 20 条 · 服务端分页 · 仅查询本账号的真实调用；首页每 5 秒刷新，历史页保持稳定
        </p>
      </div>
      <button type="button" onClick={p.onRefresh} aria-label="刷新调用记录" disabled={p.isLoading}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-50">
        <RefreshCw className={"h-4 w-4 "+(p.isLoading?"animate-spin":"")}/>刷新
      </button>
    </header>
    <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(160px,1fr)_minmax(145px,0.45fr)_minmax(145px,0.45fr)_auto]">
      <form className="flex min-w-0 items-center gap-2 rounded-xl border border-input bg-background px-3"
        onSubmit={event=>{event.preventDefault();p.changeInvocationSearch(draft)}}>
        <Search className="h-4 w-4 shrink-0 text-muted-foreground"/>
        <input aria-label="搜索工具名称" value={draft} maxLength={100}
          onChange={event=>setDraft(event.target.value)} placeholder="搜索工具名称（模糊匹配）"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"/>
        <button type="submit" className="shrink-0 text-xs font-semibold text-primary">搜索</button>
      </form>
      <select aria-label="筛选调用状态" value={p.invocationStatus}
        onChange={event=>p.changeInvocationStatus(event.target.value)}
        className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm">
        <option value="">全部状态</option><option value="success">成功</option>
        <option value="retried_success">重试后成功</option><option value="failed">失败</option>
      </select>
      <select aria-label="筛选调用来源" value={p.invocationSource}
        onChange={event=>p.changeInvocationSource(event.target.value)}
        className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm">
        <option value="">全部来源</option><option value="agent_run">Agent 试跑</option>
        <option value="workflow">工作流</option><option value="debug">工具调试</option>
      </select>
      {anyFilter && <button type="button" onClick={()=>{
        p.invocationFilter&&p.applyInvocationFilter(p.invocationFilter)
        p.changeInvocationSearch("")
        p.changeInvocationStatus("")
        p.changeInvocationSource("")
        p.invocationRunId&&p.clearInvocationRunId()
        setDraft("")
      }} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-secondary">
        <X className="h-3.5 w-3.5"/>清除筛选
      </button>}
    </div>
    {p.invocationRunId&&<div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
      <span className="min-w-0 break-all font-semibold text-primary">当前运行：{p.invocationRunId}</span>
      <button type="button" onClick={p.clearInvocationRunId}
        className="shrink-0 underline underline-offset-2">查看所有运行</button>
    </div>}
    {p.invocationFilter&&<div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-primary/10 px-3 py-1.5 font-semibold text-primary">指定工具：{p.invocationFilter}</span>
      <button type="button" onClick={()=>p.applyInvocationFilter(p.invocationFilter)} className="text-primary underline">清除指定工具</button>
    </div>}
    {p.invocationError&&<p role="alert" className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">{p.invocationError}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-border py-2 text-xs text-muted-foreground">
      <p role="status">{p.isLoading?"正在更新…":p.invocationTotal? "显示 "+start+"–"+end+" 条 · 共 "+p.invocationTotal+" 条":p.invocationError?"查询失败":"当前筛选结果 0 条"}</p>
      <p className="tabular-nums">第 {p.invocationPage} / {p.invocationPages} 页</p>
    </div>
    {p.isLoading&&p.invocationList.length===0?<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-primary"/>正在读取调用记录…
    </div>:p.invocationList.length===0?<div className="py-16 text-center text-sm text-muted-foreground">
      <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60"/>
      {p.invocationError?"当前无法核实查询结果，请刷新重试。":anyFilter?"此筛选下没有调用记录。可清除筛选或更改条件。":"还没有调用记录。请先在工具测试页试调，或启动一次 Agent 任务。"}
    </div>:<ul className="divide-y divide-border">
      {p.invocationList.map(row=>{
        const status=p.invStatusMeta[row.status]||{label:row.status,badge:"bg-secondary text-muted-foreground"}
        const source=p.sourceMeta[row.source]||{label:row.source,badge:"bg-secondary text-muted-foreground"}
        const expanded=p.expandedInvocationId===row.id
        return <li key={row.id} className="min-w-0 py-1">
          <div className="min-w-0 overflow-hidden rounded-xl transition hover:bg-secondary/30">
            <button type="button" onClick={()=>p.toggleInvocationRow(row.id)}
              aria-expanded={expanded} aria-controls={"invocation-detail-"+row.id}
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid-cols-[minmax(190px,1.25fr)_minmax(90px,0.5fr)_minmax(100px,0.5fr)_minmax(140px,0.6fr)_auto]">
              <span className="min-w-0"><strong className="block break-all text-sm text-foreground">{row.tool_name||"未命名工具"}</strong>
                <small className="mt-0.5 block text-[11px] text-muted-foreground">{row.tool_kind==="external"?"外部连接":"内置工具"}</small>
              </span>
              <span className={"hidden w-fit rounded-full px-2 py-1 text-xs font-medium sm:inline-flex "+status.badge}>{status.label}</span>
              <span className={"hidden w-fit rounded-full px-2 py-1 text-xs sm:inline-flex "+source.badge}>{source.label}</span>
              <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{row.latency_ms} ms · {formatInvocationTime(row.created)}</span>
              <ChevronDown className={"h-4 w-4 text-muted-foreground transition "+(expanded?"rotate-180":"")}/>
            </button>
            {expanded&&<div id={"invocation-detail-"+row.id} className="space-y-3 border-t border-border px-3 py-4">
              <div className="flex flex-wrap gap-2 text-xs sm:hidden"><span className={"rounded-full px-2 py-1 "+status.badge}>{status.label}</span><span className={"rounded-full px-2 py-1 "+source.badge}>{source.label}</span><span>{row.latency_ms}ms · {formatInvocationTime(row.created)}</span></div>
              {row.retried&&<p className="text-xs font-medium text-muted-foreground">此次只读操作发生过自动重试</p>}
              <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                <div className="min-w-0"><p className="mb-1 text-xs font-semibold text-muted-foreground">入参摘要</p>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary/50 p-3 font-mono text-xs leading-5">{row.input_summary||"（无）"}</pre></div>
                <div className="min-w-0"><p className="mb-1 text-xs font-semibold text-muted-foreground">{row.status==="failed"?"错误详情":"输出摘录"}</p>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary/50 p-3 font-mono text-xs leading-5">{row.status==="failed"?row.error_code||row.output_excerpt||"（无）":row.output_excerpt||"（无）"}</pre></div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button type="button" onClick={()=>p.applyInvocationFilter(row.tool_name)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 font-semibold text-primary hover:bg-secondary">只看此工具</button>
                {row.run_id&&<span className="min-w-0 break-all font-mono text-muted-foreground">运行 ID：{row.run_id}</span>}
                {row.source==="agent_run"&&/^[A-Za-z0-9]{15}$/.test(row.run_id)&&
                  <Link to={"/agent-run?run="+encodeURIComponent(row.run_id)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-primary/30 px-3 font-semibold text-primary hover:bg-primary/10">查看所属 Agent 运行</Link>}
              </div>
            </div>}
          </div>
        </li>
      })}
    </ul>}
    <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">服务器端筛选与分页，单次最多返回 20 条，不在浏览器加载全部历史。</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={()=>p.changeInvocationPage(p.invocationPage-1)} disabled={p.isLoading||p.invocationPage<=1}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-40">
          <ChevronLeft className="h-4 w-4"/>上一页</button>
        <span className="px-2 text-xs tabular-nums">{p.invocationPage} / {p.invocationPages}</span>
        <button type="button" onClick={()=>p.changeInvocationPage(p.invocationPage+1)}
          disabled={p.isLoading||p.invocationPage>=p.invocationPages}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-40">
          下一页<ChevronRight className="h-4 w-4"/></button>
      </div>
    </footer>
  </section>
}
