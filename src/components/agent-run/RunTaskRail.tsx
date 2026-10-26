import {useMemo,useState} from "react"
import {CirclePlus,History,Search,ScrollText,ArrowUpRight} from "lucide-react"
import {Link} from "react-router-dom"
import type {AgentRunRow,RunStateKey} from "@/pages/AgentRun/useAgentRun"

type Filter="all"|"attention"|"active"|"finished"
const ACTIVE=["queued","running","paused"]
const ATTENTION=["awaiting_approval","awaiting_input"]
const FINISHED=["succeeded","failed","cancelled"]
export type RunTaskRailProps={
  runHistory:AgentRunRow[]
  activeRun:AgentRunRow|null
  onViewRun:(run:AgentRunRow)=>void
  onNewTask:()=>void
  isLoggedIn:boolean
  isLive:boolean
  isStarting:boolean
  stateMeta:Record<RunStateKey,{label:string;badge:string}>
}
function localTime(raw:string){
  const date=new Date(String(raw||"").replace(" ","T"))
  return Number.isNaN(date.getTime())?"时间未知":
    date.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})
}
export function RunTaskRail({runHistory,activeRun,onViewRun,onNewTask,isLoggedIn,isLive,isStarting,stateMeta}:RunTaskRailProps){
  const [filter,setFilter]=useState<Filter>("all")
  const [query,setQuery]=useState("")
  const items=useMemo(()=>{
    const byId=new Map<string,AgentRunRow>()
    for(const item of runHistory)if(item?.id)byId.set(item.id,item)
    if(activeRun?.id)byId.set(activeRun.id,activeRun)
    return [...byId.values()].sort((a,b)=>Date.parse(String(b.created||"").replace(" ","T"))-
      Date.parse(String(a.created||"").replace(" ","T")))
  },[runHistory,activeRun])
  const view=useMemo(()=>items.filter(item=>{
    if(filter==="attention"&&!ATTENTION.includes(item.status))return false
    if(filter==="active"&&!ACTIVE.includes(item.status))return false
    if(filter==="finished"&&!FINISHED.includes(item.status))return false
    const q=query.trim().toLocaleLowerCase()
    return !q||(item.spec_name+" "+item.instruction).toLocaleLowerCase().includes(q)
  }),[items,filter,query])
  const needsAction=items.filter(item=>ATTENTION.includes(item.status)).length
  return <section aria-label="任务快速切换" className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card">
    <header className="border-b border-border px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4 text-primary"/>任务列表</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{items.length} 条近期记录</span>
      </div>
      <button type="button" disabled={isLive||isStarting||!isLoggedIn} onClick={onNewTask}
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40">
        <CirclePlus className="h-4 w-4"/>发起新任务
      </button>
      <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-input px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground"/>
        <input aria-label="搜索任务" type="search" value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="搜索 Agent 或任务…" className="w-full min-w-0 bg-transparent text-xs outline-none"/>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-1" role="group" aria-label="任务状态筛选">
        {([
          ["all","全部"],["attention","待我处理"],["active","进行中"],["finished","已结束"],
        ] as const).map(([id,label])=><button type="button" key={id}
          aria-pressed={filter===id}
          onClick={()=>setFilter(id)}
          className={"min-h-8 rounded-md px-2 text-xs font-medium "+
            (filter===id?"bg-primary/10 text-primary":"text-muted-foreground hover:bg-secondary")}>
          {label}{id==="attention"&&needsAction>0?" · "+needsAction:""}
        </button>)}
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-2 lg:max-h-[calc(100dvh-19rem)]" aria-label="近期任务列表">
      {!isLoggedIn?<p className="p-3 text-xs text-muted-foreground">登录后查看属于自己的任务。</p>:
        view.length===0?<p className="p-3 text-xs text-muted-foreground">
          {items.length?"没有符合筛选条件的任务。":"还没有运行记录。选择 Agent 并发起新任务。"}
        </p>:
        <ul className="space-y-1.5">{view.map(item=>{
          const selected=activeRun?.id===item.id
          const status=stateMeta[item.status]
          return <li key={item.id}>
            <button type="button" aria-current={selected?"true":undefined}
              disabled={isStarting} onClick={()=>onViewRun(item)}
              className={"w-full min-w-0 rounded-lg border px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-primary "+
                (selected?"border-primary/50 bg-primary/5":"border-transparent hover:border-border hover:bg-secondary/40")}>
              <span className="block truncate text-xs font-semibold">{item.spec_name||"未命名 Agent"}</span>
              <span className="mt-1 block max-h-10 overflow-hidden text-xs leading-5 text-muted-foreground">
                {item.instruction||"未填写任务描述"}
              </span>
              <span className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                <span className={status?.badge?.includes("red")?"text-destructive":"text-muted-foreground"}>
                  {status?.label||item.status}
                </span>
                <time>{localTime(item.created)}</time>
              </span>
            </button>
            {selected&&<Link to={"/run-detail?run="+encodeURIComponent(item.id)}
              className="flex items-center gap-1 px-3 py-1 text-[11px] text-primary hover:underline">
              <ScrollText className="h-3 w-3"/>查看该任务完整记录 <ArrowUpRight className="h-3 w-3"/>
            </Link>}
          </li>
        })}</ul>}
    </div>
    <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
      {isLive?"切换任务不会停止后台执行；需要人工审批时请返回该任务。":"切换历史只读取记录，不会重新执行或重复计费。"}
    </p>
  </section>
}
