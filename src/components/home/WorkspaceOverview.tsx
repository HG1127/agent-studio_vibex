import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle, ArrowRight, Bot, CheckCircle2, Clock3, Loader2, PlayCircle, Plus, ShieldCheck,
} from "lucide-react"
import { readOriginalWorkspace } from "@/lib/originalHomeInboxData"
import { AgentPendingInbox } from "@/components/home/AgentPendingInbox"
import {MonitorInbox} from './MonitorInbox'

type RecentRun = {id:string; spec_id:string; spec_name:string; status:string; created:string; instruction?:string}
const STATUS:Record<string,{label:string;style:string}>={
  queued:{label:"排队中",style:"text-muted-foreground"},
  running:{label:"运行中",style:"text-primary"},
  awaiting_approval:{label:"待审批",style:"text-amber-700 dark:text-amber-400"},
  awaiting_input:{label:"待我回复",style:"text-amber-700 dark:text-amber-400"},
  succeeded:{label:"已完成",style:"text-primary"},
  failed:{label:"运行失败",style:"text-destructive"},
  cancelled:{label:"已取消",style:"text-muted-foreground"},
  paused:{label:"已暂停",style:"text-muted-foreground"},
}

export function WorkspaceOverview({agentCount}:{agentCount:number|null}) {
  const [runs,setRuns]=useState<RecentRun[]>([])
  const [pending,setPending]=useState<RecentRun[]>([])
  const [pendingCount,setPendingCount]=useState(0)
  const [expandedPending,setExpandedPending]=useState(false)
  const [showPendingInbox,setShowPendingInbox]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(false)
  const fetchSequence=useRef(0)
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const sequence=++fetchSequence.current
    setLoading(true)
    try {
      const result=await readOriginalWorkspace(signal) as {items?:RecentRun[];pending_count?:number;pending_items?:RecentRun[]}
      if(sequence===fetchSequence.current && !signal?.aborted){
        if(!Array.isArray(result.items))throw new Error("invalid-recent-runs")
        setRuns(result.items)
        // Deployed older endpoints may not have independent pending fields yet.
        // The documented recent-run fallback remains bounded and labeled.
        const fallback=result.items.filter(run=>["awaiting_input","awaiting_approval"].includes(run.status))
        const hasPending=Array.isArray(result.pending_items) &&
          Number.isFinite(result.pending_count) && Number(result.pending_count)>=0
        const pendingRows=hasPending ? result.pending_items as RecentRun[] : fallback
        setPending(pendingRows)
        setPendingCount(hasPending?Number(result.pending_count):fallback.length)
        setError(false)
      }
    }catch{
      if(sequence===fetchSequence.current && !signal?.aborted)setError(true)
    }finally{
      if(sequence===fetchSequence.current && !signal?.aborted)setLoading(false)
    }
  },[])
  useEffect(()=>{
    const abort=new AbortController()
    void refresh(abort.signal)
    const onFocus=()=>{if(document.visibilityState==="visible")void refresh(abort.signal)}
    window.addEventListener("focus",onFocus)
    return ()=>{abort.abort();fetchSequence.current++;window.removeEventListener("focus",onFocus)}
  },[refresh])

  const others=runs.filter(run=>run.status!=="awaiting_approval" && run.status!=="awaiting_input")
  const waiting=pendingCount
  const active=runs.filter(run=>["queued","running","paused"].includes(run.status)).length
  const linkFor=(run:RecentRun)=>["awaiting_approval","awaiting_input","queued","running","paused"].includes(run.status)
    ? "/agent-run?run="+encodeURIComponent(run.id)+(run.spec_id?"&spec="+encodeURIComponent(run.spec_id):"")
    : "/run-detail?run="+encodeURIComponent(run.id)
  return <section aria-labelledby="studio-dashboard-title" className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 id="studio-dashboard-title" className="text-xl font-bold tracking-tight text-foreground">我的工作台</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          从最近工作继续，或用引导式创建完成第一个 Agent。
        </p>
      </div>
      <Link to="/agent-create"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
        <Plus className="h-4 w-4"/>引导创建 Agent
      </Link>
    </div>
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[
        {name:"我的 Agent",value:agentCount===null?'—':String(agentCount),icon:Bot,to:"/#my-specs",desc:"已保存的方案"},
        {name:"近期运行中",value:loading?"…":error?"—":String(active),icon:PlayCircle,to:"/agent-run",desc:"仅统计最近 12 次运行"},
        {name:"待我处理",value:loading?"…":error?"—":String(waiting),icon:ShieldCheck,to:"/#waiting-runs",desc:"待回复、待审批任务总数"},
      ].map(item=><Link key={item.name} to={item.to}
        onClick={event=>{
          if(item.name==="待我处理"){
            event.preventDefault()
            document.getElementById("waiting-runs")?.scrollIntoView({behavior:"smooth",block:"start"})
          }
        }}
        className="rounded-xl border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-primary">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{item.name}</p>
          <item.icon className="h-4 w-4 text-primary"/>
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{item.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
      </Link>)}
    </div>
    <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
    <section id="waiting-runs" aria-label="需要我继续处理的 Agent" className="min-w-0 scroll-mt-28 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">需要我继续处理</h2>
          <p className="mt-1 text-xs text-muted-foreground">待办数量按当前账号的全部运行统计，优先列出最近需要确认的任务。</p>
        </div>
        <button type="button" disabled={loading} onClick={()=>void refresh()}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-secondary disabled:opacity-40">
          {loading?"刷新中…":"刷新状态"}
        </button>
      </div>
      {error?<p role="alert" className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">
        暂时无法核验运行状态，旧数据不代表当前待办。请刷新重试。
      </p>:loading?<p role="status" className="mt-3 text-xs text-muted-foreground">正在核对待办状态…</p>:
        pending.length===0?<p className="mt-3 rounded-lg bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
          当前没有待回复或待审批的 Agent 任务。
        </p>:<ul className="mt-3 space-y-2">{pending.slice(0,expandedPending?20:5).map(run=>
          <li key={run.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/10">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{run.spec_name||"未命名 Agent"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {run.status==="awaiting_input"?"等待你补充需求或批准方案":"等待你决定是否允许工具调用"}
              </p>
            </div>
            <Link to={linkFor(run)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              {run.status==="awaiting_input"?"去回复":"去审批"} <ArrowRight className="h-3.5 w-3.5"/>
            </Link>
          </li>)}</ul>}
      {!loading&&!error&&pendingCount>5 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          共 {pendingCount} 项待处理，当前展示 {Math.min(expandedPending?20:5,pending.length)} 项。
          {pendingCount>pending.length?" 其余任务可在下方的完整待办管理中分页查看。":""}
        </p>
        {pending.length>5 && <button type="button"
          aria-expanded={expandedPending}
          onClick={()=>setExpandedPending(previous=>!previous)}
          className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-secondary">
          {expandedPending?"收起":"展开更多待办"}
        </button>}
      </div>}
      <button type="button" aria-expanded={showPendingInbox}
        onClick={()=>setShowPendingInbox(v=>!v)}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/25 px-3 text-xs font-semibold text-primary hover:bg-primary/5">
        {showPendingInbox?"收起待办管理":"查看全部待办 · 搜索 / 筛选 / 分页"}
        <ArrowRight className="h-3.5 w-3.5"/>
      </button>
    </section>
    <div className="min-w-0 rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">其他最近运行</h2>
        <Link to="/agent-run" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          查看运行中心 <ArrowRight className="h-3.5 w-3.5"/>
        </Link>
      </div>
      {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin"/>读取最近运行记录…
      </p> : error ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4"/>记录暂时不可用，请到运行中心重试。
      </p> : others.length===0 ? <p className="mt-3 text-xs text-muted-foreground">没有其他最近运行记录，可以创建或启动一个 Agent。</p> :
        <ul className="mt-3 divide-y divide-border">
          {others.slice(0,5).map(run=>{
            const meta=STATUS[run.status]||{label:run.status,style:"text-muted-foreground"}
            return <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{run.spec_name||"未命名 Agent"}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5"/>
                  {run.created ? new Date(run.created).toLocaleString("zh-CN") : "时间未知"}
                  <span className="hidden max-w-52 truncate sm:inline">{run.instruction ? " · "+run.instruction : ""}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${meta.style}`}>
                  {run.status==="succeeded"?<CheckCircle2 className="h-3.5 w-3.5"/>:null}
                  {meta.label}
                </span>
                <Link to={linkFor(run)} className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-primary hover:bg-secondary">
                  {["running","queued","paused"].includes(run.status)?"查看进度":"查看结果"}
                </Link>
              </div>
            </li>
          })}
        </ul>}
    </div>
    </div>
    {showPendingInbox&&<AgentPendingInbox />}
    <MonitorInbox/>
  </section>
}
