import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Search } from "lucide-react"
import { readOriginalAgentPending } from "@/lib/originalHomeInboxData"

type Pending={id:string;spec_id:string;spec_name:string;status:string;created:string;updated:string}
const LIMIT=10
export function AgentPendingInbox(){
  const [status,setStatus]=useState("all")
  const [search,setSearch]=useState("")
  const [q,setQ]=useState("")
  const [page,setPage]=useState(1)
  const [rows,setRows]=useState<Pending[]>([])
  const [total,setTotal]=useState(0)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")
  const [revision,setRevision]=useState(0)
  const serial=useRef(0)
  const lastFetchAt=useRef(0)
  useEffect(()=>{
    const timer=window.setTimeout(()=>setQ(search.trim().slice(0,100)),250)
    return()=>window.clearTimeout(timer)
  },[search])
  useEffect(()=>{setPage(1)},[q,status])
  useEffect(()=>{
    const controller=new AbortController()
    const seq=++serial.current
    lastFetchAt.current=Date.now()
    setLoading(true);setError("")
    void(async()=>{
      try{
        const data=await readOriginalAgentPending({page,perPage:LIMIT,status,q},controller.signal)
        if(!Array.isArray(data?.items)||!Number.isFinite(data?.totalItems))
          throw new Error("invalid_response")
        if(controller.signal.aborted||seq!==serial.current)return
        const lastPage=Math.max(1,Math.ceil(data.totalItems/LIMIT))
        setTotal(data.totalItems)
        // An approval handled in another tab can shrink the queue.
        // Keep the UI on a valid page rather than showing a false empty state.
        if(page>lastPage){setPage(lastPage);return}
        setRows(data.items)
      }catch{
        if(!controller.signal.aborted&&seq===serial.current)
          setError("待办列表暂不可用，请重试；旧数据不代表当前审批状态。")
      }finally{
        if(!controller.signal.aborted&&seq===serial.current)setLoading(false)
      }
    })()
    return()=>{controller.abort();serial.current++}
  },[page,status,q,revision])
  useEffect(()=>{
    // Returning after approving a task refreshes pending rows automatically.
    // Throttle focus/visibility duplicates to avoid request bursts.
    const onFocus=()=>{
      if(document.visibilityState==="hidden" ||
        Date.now()-lastFetchAt.current<1200)return
      setRevision(n=>n+1)
    }
    window.addEventListener("focus",onFocus)
    document.addEventListener("visibilitychange",onFocus)
    return()=>{
      window.removeEventListener("focus",onFocus)
      document.removeEventListener("visibilitychange",onFocus)
    }
  },[])
  const pages=Math.max(1,Math.ceil(total/LIMIT))
  return <div id="all-pending-tasks" aria-label="全部 Agent 待办管理" className="mt-4 rounded-xl border border-border bg-background p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">我的全部待办</h3>
        <p className="mt-1 text-xs text-muted-foreground">服务器按当前员工统计，逐页查看、搜索及筛选，不会漏掉较早的待确认任务。</p>
      </div>
      <button type="button" onClick={()=>setRevision(r=>r+1)} disabled={loading}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs text-primary hover:bg-secondary disabled:opacity-40">
        <RefreshCw className="h-3.5 w-3.5"/>刷新待办
      </button>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} type="search"
          aria-label="按 Agent 名称搜索待办" placeholder="按 Agent 名称搜索…"
          className="min-h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-xs"/>
      </label>
      <select aria-label="待办类型筛选" value={status} onChange={e=>setStatus(e.target.value)}
        className="min-h-10 rounded-lg border border-border bg-card px-3 text-xs">
        <option value="all">全部待办</option>
        <option value="awaiting_input">待我回复</option>
        <option value="awaiting_approval">待我审批</option>
      </select>
      <span role="status" className="text-xs text-muted-foreground">
        {loading?"加载中…":error?"不可用":"共 "+total+" 项"}
      </span>
    </div>
    {error&&<div role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      {error}<button type="button" onClick={()=>setRevision(n=>n+1)} className="ml-2 font-semibold underline">重试</button>
    </div>}
    {!error&&loading&&<p role="status" className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin"/>正在读取当前员工的待办…
    </p>}
    {!error&&!loading&&rows.length===0&&<p className="mt-4 rounded-lg bg-secondary/50 p-4 text-xs text-muted-foreground">
      当前筛选下没有待办任务。
    </p>}
    {!error&&!loading&&rows.length>0&&<ul className="mt-3 divide-y divide-border">
      {rows.map(run=><li key={run.id}
        className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{run.spec_name||"未命名 Agent"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {run.status==="awaiting_input"?"待回复需求或批准方案":"待确认工具调用"}
            {run.updated?" · "+new Date(run.updated).toLocaleString("zh-CN"):""}
          </p>
        </div>
        <Link to={"/agent-run?run="+encodeURIComponent(run.id)+(run.spec_id?"&spec="+encodeURIComponent(run.spec_id):"")}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
          {run.status==="awaiting_input"?"去回复":"去审批"} <ArrowRight className="h-3.5 w-3.5"/>
        </Link>
      </li>)}
    </ul>}
    {!error&&!loading&&pages>1&&<nav aria-label="待办分页" className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <span className="text-xs text-muted-foreground">第 {page}/{pages} 页 · 共 {total} 项</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page===1} onClick={()=>setPage(n=>Math.max(1,n-1))}
          aria-label="待办上一页" className="grid h-9 w-9 place-items-center rounded-lg border border-border disabled:opacity-35">
          <ArrowLeft className="h-4 w-4"/>
        </button>
        <button type="button" disabled={page>=pages} onClick={()=>setPage(n=>Math.min(pages,n+1))}
          aria-label="待办下一页" className="grid h-9 w-9 place-items-center rounded-lg border border-border disabled:opacity-35">
          <ArrowRight className="h-4 w-4"/>
        </button>
      </div>
    </nav>}
  </div>
}
