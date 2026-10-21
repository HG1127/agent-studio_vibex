import {useCallback,useEffect,useRef,useState} from "react"
import {CalendarClock,Clock3,Loader2,RefreshCw,ShieldCheck} from "lucide-react"
import {createPgNativePilotApi,PgNativePilotError,
  type PgNativeSchedule,type PgNativeScheduleOccurrence} from "@/lib/pgNativePilotApi"

type NativeApi=ReturnType<typeof createPgNativePilotApi>
function formatDate(value:string|null):string{
  if(!value)return "尚未设定"
  const time=new Date(value)
  return Number.isFinite(time.getTime())?time.toLocaleString("zh-CN"):"时间未知"
}
function safeError(error:unknown):string{
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "员工登录已失效，请重新登录。"
    if(error.status===403)return "访问计划记录的权限被拒绝。"
    if(error.status===404)return "计划不存在或当前员工无权查看。"
  }
  return "读取计划清单失败，请刷新重试。"
}

/** Read-only PG18 schedule metadata and recent occurrences; NO scheduler. */
export default function PgNativeSchedulesReadonlyPanel({api}:{api:NativeApi}){
  const [items,setItems]=useState<PgNativeSchedule[]>([])
  const [selected,setSelected]=useState<string|null>(null)
  const [occurrences,setOccurrences]=useState<PgNativeScheduleOccurrence[]>([])
  const [loading,setLoading]=useState(true)
  const [historyLoading,setHistoryLoading]=useState(false)
  const [error,setError]=useState("")
  const revision=useRef(0)
  const getItems=useCallback(async()=>{
    const ticket=++revision.current
    setLoading(true)
    setError("")
    try{
      const rows=await api.listSchedules()
      if(ticket===revision.current)setItems(rows)
    }catch(e){
      if(ticket===revision.current){setItems([]);setError(safeError(e))}
    }finally{
      if(ticket===revision.current)setLoading(false)
    }
  },[api])
  useEffect(()=>{
    void getItems()
    return ()=>{revision.current++}
  },[getItems])
  const inspect=async(id:string)=>{
    const ticket=++revision.current
    setSelected(id);setOccurrences([]);setError("")
    setHistoryLoading(true)
    try{
      const rows=await api.listScheduleOccurrences(id)
      if(ticket===revision.current)setOccurrences(rows)
    }catch(e){
      if(ticket===revision.current){setSelected(null);setError(safeError(e))}
    }finally{
      if(ticket===revision.current)setHistoryLoading(false)
    }
  }
  return <div className="space-y-4">
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <ShieldCheck size={18}/>只读计划清单 · 调度器未启动
      </h2>
      <p className="mt-2 text-xs leading-6 text-indigo-800">
        仅查看 PostgreSQL 已登记的本人任务计划及历史执行状态，不创建计划、不运行任务、
        不修改启用状态，也不执行外部工具或模型。
      </p>
    </section>
    {error&&<div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div><h2 className="font-semibold">我的定时计划</h2>
          <p className="mt-1 text-xs text-slate-500">按最近修改时间排列，仅显示最多 30 条</p></div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          onClick={()=>void getItems()} disabled={loading||historyLoading} type="button">
          <RefreshCw size={15}/>刷新
        </button>
      </header>
      {loading&&<p role="status" className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={16}/>正在读取计划…
      </p>}
      {!loading&&!items.length&&<p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
        当前员工尚无 PostgreSQL 计划记录。旧 PocketBase 中的计划不会自动出现。
      </p>}
      <div className="space-y-2">
        {items.map(item=><button key={item.id} type="button"
          onClick={()=>void inspect(item.id)}
          className={"w-full rounded-xl border p-4 text-left hover:bg-slate-50 "+
            (item.id===selected?"border-indigo-300 bg-indigo-50":"border-slate-100")}>
          <div className="flex items-start justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
              <CalendarClock size={17} className="shrink-0 text-indigo-600"/>
              <span className="break-words">{item.name}</span>
            </p>
            <span className={"shrink-0 rounded-full px-2 py-1 text-xs "+
              (item.enabled?"bg-emerald-50 text-emerald-800":"bg-slate-100 text-slate-600")}>
              {item.enabled?"数据库标记启用":"数据库标记停用"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {item.kind==="agent"?"Agent":"Workflow"} · 时区 {item.time_zone}
            {" · "}修订 {item.revision}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            下次计划时间：{formatDate(item.next_at)}
          </p>
        </button>)}
      </div>
      {selected&&<div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Clock3 size={17} className="text-indigo-600"/>计划历史
        </h3>
        <p className="mt-1 text-xs text-slate-500">仅最近 30 次执行元数据，不显示任务提示词或模型结果</p>
        {historyLoading&&<p role="status" className="mt-3 text-sm text-slate-500">正在读取历史…</p>}
        {!historyLoading&&!occurrences.length&&
          <p className="mt-3 text-sm text-slate-400">暂无执行记录</p>}
        <ol className="mt-3 space-y-2">
          {occurrences.map(o=><li key={o.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">{formatDate(o.scheduled_for)}</span>
            <span className="text-xs font-medium text-slate-700">{o.status}</span>
          </li>)}
        </ol>
      </div>}
    </section>
  </div>
}
