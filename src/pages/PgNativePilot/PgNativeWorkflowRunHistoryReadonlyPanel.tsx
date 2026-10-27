// Owner-scoped Workflow run history. This panel is GET-only and never
// submits, starts a Worker, approves a model or executes Workflow nodes.
import {useCallback,useEffect,useRef,useState} from "react"
import {Clock3,Loader2,RefreshCcw,ShieldCheck} from "lucide-react"
import {PgNativePilotError,type PgNativeWorkflowSafeRunResult,
  createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {verifyOwnTaskRun,createOwnTaskTargetDelivery,type OwnTaskRunTarget} from "@/lib/pgNativeOwnTaskNavigation"

type Api=ReturnType<typeof createPgNativePilotApi>
const stateNames:Record<string,string>={
  queued:"排队中",running:"运行中",awaiting_approval:"待审批",
  paused:"已暂停",succeeded:"已完成",failed:"失败",cancelled:"已取消",
}
const stepNames:Record<string,string>={start:"开始节点",end:"结束节点"}
const stepStates:Record<string,string>={
  pending:"等待中",running:"进行中",awaiting_approval:"待审批",
  succeeded:"成功",failed:"失败",skipped:"已跳过",
}
const safeDate=(raw:string)=>{
  const date=new Date(raw)
  return Number.isFinite(date.getTime())?
    date.toLocaleString("zh-CN",{hour12:false}):"时间未知"
}
function describe(error:unknown):string{
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "员工登录已失效，请重新登录。"
    if(error.status===404)return "此记录不存在，或不属于当前员工。"
    if(error.status===0)return "原生 PostgreSQL 服务暂时不可达。"
  }
  return "Workflow 历史暂时无法读取，请稍后重试。"
}
export default function PgNativeWorkflowRunHistoryReadonlyPanel({api,runTarget,onTargetSettled,onExpired}:{api:Api;runTarget?:OwnTaskRunTarget|null;onTargetSettled?:(selection:number,opened:boolean)=>void;onExpired?:()=>void}){
  const [runs,setRuns]=useState<PgNativeWorkflowSafeRunResult[]>([])
  const [detail,setDetail]=useState<PgNativeWorkflowSafeRunResult|null>(null)
  const [loading,setLoading]=useState(false)
  const [opening,setOpening]=useState<string|null>(null)
  const [error,setError]=useState("")
  const active=useRef(false)
  const readScope=useRef<object>({})
  const generation=useRef(0)
  const refresh=useCallback(async()=>{
    const seq=++generation.current
    setLoading(true);setError("");setDetail(null)
    try{
      const records=await api.listWorkflowRuns()
      if(active.current&&seq===generation.current)
        setRuns(Array.isArray(records)?records.slice(0,50):[])
    }catch(err){
      if(active.current&&seq===generation.current){
        if(err instanceof PgNativePilotError&&err.status===401)onExpired?.()
        setRuns([]);setError(describe(err))
      }
    }finally{
      if(active.current&&seq===generation.current)setLoading(false)
    }
  },[api,onExpired])
  useEffect(()=>{
    readScope.current={}
    active.current=true
    void refresh()
    return ()=>{active.current=false;++generation.current}
  },[refresh])
  const inspect=useCallback(async(id:string,target?:OwnTaskRunTarget)=>{
    const seq=++generation.current
    setOpening(id);setLoading(false);setDetail(null);setError("")
    try{
      const item=await api.getWorkflowRun(id)
      if(!active.current||seq!==generation.current)return false
      if(target){if(target.kind!=="workflow_safe")throw Error("original_task_kind_changed");await verifyOwnTaskRun(api,target,item)}
      if(active.current&&seq===generation.current&&item.run?.id===id){setDetail(item);return true}
      return false
    }catch(err){
      if(active.current&&seq===generation.current){
        if(err instanceof PgNativePilotError&&err.status===401)onExpired?.()
        setDetail(null);setError(describe(err))
      }
      return false
    }finally{
      if(active.current&&seq===generation.current)setOpening(null)
    }
  },[api,onExpired])
  const targetDelivery=useRef(createOwnTaskTargetDelivery())
  useEffect(()=>{
    if(!runTarget)return
    return targetDelivery.current.attach(readScope.current,runTarget,()=>inspect(runTarget.runId,runTarget),opened=>onTargetSettled?.(runTarget.selection,opened))
  },[runTarget,inspect,onTargetSettled])
  return <section className="space-y-4" aria-label="本人 Workflow 运行历史，只读">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><Clock3 size={18}/>Workflow 运行历史</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">只显示已持久化的 Start/End 安全 Workflow 运行；最多展示最近 30 条。</p>
      </div>
      <button type="button" onClick={()=>void refresh()} disabled={loading||opening!==null}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
        <RefreshCcw size={15} className={loading?"animate-spin":""}/>刷新历史
      </button>
    </div>
    <p className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">
      <ShieldCheck className="mt-0.5 shrink-0" size={15}/>
      只读模式：不会提交 Workflow、启动 Worker 或调用模型/工具。只有通过员工 Cookie 与 PostgreSQL owner RLS 验证的本人记录可见。
    </p>
    {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading&&<p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>正在读取 Workflow 历史…</p>}
    {!loading&&!runs.length&&!error&&<p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">当前账号还没有 Workflow 运行历史。</p>}
    {!!runs.length&&<div className="space-y-2">
      {runs.map(item=><article key={item.run.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{stateNames[item.run.status]??"状态未知"} · {item.run.step_count} 步</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{item.run.id}</p>
            <p className="mt-1 text-xs text-slate-500">Workflow：{item.run.workflow_id}</p>
            <p className="mt-1 text-xs text-slate-500">创建于 {safeDate(item.run.created_at)} · 队列：{item.job_status}</p>
          </div>
          <button type="button" disabled={opening!==null||loading}
            className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            onClick={()=>void inspect(item.run.id)}>
            {opening===item.run.id?"读取中…":"查看步骤"}
          </button>
        </div>
      </article>)}
    </div>}
    {detail&&<article className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Workflow 运行详情">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Workflow 详情 · {stateNames[detail.run.status]??"状态未知"}</h3>
        <button type="button" className="text-xs text-slate-600 underline" onClick={()=>setDetail(null)}>关闭详情</button>
      </div>
      <p className="mt-3 break-all font-mono text-xs text-slate-500">{detail.run.id}</p>
      <p className="mt-3 text-sm font-medium">执行结果</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{detail.run.result_text||"暂无结果"}</p>
      <p className="mt-2 text-xs text-slate-500">执行模式：Start/End only · 外部副作用：{detail.external_effects_executed?"需核查":"未执行"}</p>
      {!!detail.run.last_error_code&&<p className="mt-2 text-xs text-amber-800">状态代码：{detail.run.last_error_code}</p>}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold">执行步骤（只读）</h4>
        {!detail.steps.length&&<p className="mt-2 text-xs text-slate-500">暂无可展示的步骤记录。</p>}
        {!!detail.steps.length&&<ol className="mt-3 space-y-2">
          {detail.steps.map((step,index)=><li key={step.step_key} className="rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{index+1}. {stepNames[step.metadata.node_type]??step.metadata.node_type}</span>
              <span className="text-xs text-slate-500">{stepStates[step.status]??"状态未知"}</span>
            </div>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              {Object.entries(step.metadata).map(([key,value])=><div key={key} className="min-w-0 text-xs">
                <dt className="inline text-slate-500">{key}：</dt>
                <dd className="inline break-words text-slate-700">{Array.isArray(value)?value.join("、"):String(value)}</dd>
              </div>)}
            </dl>
            <p className="mt-2 text-[11px] text-slate-400">更新于 {safeDate(step.updated_at)}</p>
          </li>)}
        </ol>}
      </div>
    </article>}
  </section>
}
