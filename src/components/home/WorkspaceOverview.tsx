import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle, ArrowRight, Bot, CheckCircle2, Clock3, Loader2, PlayCircle, Plus, ShieldCheck,
} from "lucide-react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"

type RecentRun = {id:string; spec_id:string; spec_name:string; status:string; created:string; instruction:string}
const STATUS:Record<string,{label:string;style:string}>={
  queued:{label:"排队中",style:"text-muted-foreground"},
  running:{label:"运行中",style:"text-primary"},
  awaiting_approval:{label:"待审批",style:"text-destructive"},
  succeeded:{label:"已完成",style:"text-primary"},
  failed:{label:"运行失败",style:"text-destructive"},
  cancelled:{label:"已取消",style:"text-muted-foreground"},
  paused:{label:"已暂停",style:"text-muted-foreground"},
}

export function WorkspaceOverview({agentCount}:{agentCount:number}) {
  const [runs,setRuns]=useState<RecentRun[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(false)
  useEffect(()=>{
    const abort=new AbortController()
    void fetch(getPocketBaseUrl()+"/api/agent-runs/recent?limit=12",{
      headers:{...vibexAuthHeaders()},signal:abort.signal,
    }).then(async response=>{
      if(!response.ok)throw new Error("run-list-unavailable")
      const result=await response.json() as {items?:RecentRun[]}
      if(!abort.signal.aborted){
        setRuns(Array.isArray(result.items)?result.items:[])
        setError(false)
      }
    }).catch(()=>{
      if(!abort.signal.aborted)setError(true)
    }).finally(()=>{if(!abort.signal.aborted)setLoading(false)})
    return ()=>abort.abort()
  },[])

  const waiting=runs.filter(run=>run.status==="awaiting_approval").length
  const active=runs.filter(run=>["queued","running","paused"].includes(run.status)).length
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
        {name:"我的 Agent",value:String(agentCount),icon:Bot,to:"/#my-specs",desc:"已保存的方案"},
        {name:"近期运行中",value:loading?"…":error?"—":String(active),icon:PlayCircle,to:"/agent-run",desc:"仅统计最近 12 次运行"},
        {name:"近期待处理审批",value:loading?"…":error?"—":String(waiting),icon:ShieldCheck,to:"/agent-run",desc:"需要审核的写操作"},
      ].map(item=><Link key={item.name} to={item.to}
        className="rounded-xl border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-primary">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{item.name}</p>
          <item.icon className="h-4 w-4 text-primary"/>
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{item.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
      </Link>)}
    </div>
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">最近运行</h2>
        <Link to="/agent-run" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          查看运行中心 <ArrowRight className="h-3.5 w-3.5"/>
        </Link>
      </div>
      {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin"/>读取最近运行记录…
      </p> : error ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4"/>记录暂时不可用，请到运行中心重试。
      </p> : runs.length===0 ? <p className="mt-3 text-xs text-muted-foreground">还没有运行记录，可以从创建 Agent 开始。</p> :
        <ul className="mt-3 divide-y divide-border">
          {runs.slice(0,5).map(run=>{
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
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${meta.style}`}>
                {run.status==="succeeded"?<CheckCircle2 className="h-3.5 w-3.5"/>:null}
                {meta.label}
              </span>
            </li>
          })}
        </ul>}
    </div>
  </section>
}
