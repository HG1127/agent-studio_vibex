// Owner-scoped PostgreSQL Agent Run history. Pure GET; never submits,
// approves, retries, calls a model or consults PocketBase credentials.
import {useCallback,useEffect,useRef,useState} from "react"
import {Clock3,Loader2,RefreshCcw,ShieldCheck} from "lucide-react"
import {PgNativePilotError,type PgNativeRun,type PgNativeRunDetail,
  type PgNativeWorkflowSafeRunResult,createPgNativePilotApi} from "@/lib/pgNativePilotApi"

type Api=ReturnType<typeof createPgNativePilotApi>
type HistoryDetail=
  |{kind:"agent";value:PgNativeRunDetail}
  |{kind:"workflow";value:PgNativeWorkflowSafeRunResult}
const stateNames:Record<string,string>={
  queued:"排队中",running:"运行中",awaiting_approval:"待审批",
  paused:"已暂停",succeeded:"已完成",failed:"失败",cancelled:"已取消",
}
const stepNames:Record<string,string>={
  prepare:"准备阶段",model:"模型阶段",start:"开始节点",end:"结束节点",
}
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
  return "任务历史暂时无法读取，请稍后重试。"
}
export default function PgNativeRunHistoryReadonlyPanel({api}:{api:Api}){
  const [runs,setRuns]=useState<PgNativeRun[]>([])
  const [workflowRuns,setWorkflowRuns]=useState<PgNativeWorkflowSafeRunResult[]>([])
  const [detail,setDetail]=useState<HistoryDetail|null>(null)
  const [loading,setLoading]=useState(false)
  const [opening,setOpening]=useState<string|null>(null)
  const [error,setError]=useState("")
  const active=useRef(false)
  const generation=useRef(0)
  const refresh=useCallback(async()=>{
    const seq=++generation.current
    setLoading(true);setError("");setDetail(null)
    try{
      const [records,workflowRecords]=await Promise.all([
        api.listRuns(),api.listWorkflowRuns(),
      ])
      if(active.current&&seq===generation.current){
        setRuns(Array.isArray(records)?records.slice(0,50):[])
        setWorkflowRuns(Array.isArray(workflowRecords)?workflowRecords.slice(0,50):[])
      }
    }catch(err){
      if(active.current&&seq===generation.current){
        setRuns([]);setWorkflowRuns([]);setError(describe(err))
      }
    }finally{
      if(active.current&&seq===generation.current)setLoading(false)
    }
  },[api])
  useEffect(()=>{
    active.current=true
    void refresh()
    return ()=>{active.current=false;++generation.current}
  },[refresh])
  const inspect=async(id:string,kind:"agent"|"workflow")=>{
    const seq=++generation.current
    setOpening(id);setError("")
    try{
      const item:HistoryDetail=kind==="agent"
        ?{kind,value:await api.getRun(id)}
        :{kind,value:await api.getWorkflowRun(id)}
      if(active.current&&seq===generation.current&&item.value.run?.id===id)
        setDetail(item)
    }catch(err){
      if(active.current&&seq===generation.current){
        setDetail(null);setError(describe(err))
      }
    }finally{
      if(active.current&&seq===generation.current)setOpening(null)
    }
  }
  return <section className="space-y-4" aria-label="本人 Agent 与 Workflow 运行历史，只读">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><Clock3 size={18}/>运行历史</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          查看当前员工在 PostgreSQL 中的 Agent 与 Workflow 历史及结果；仅只读，最多各展示最近 30 条。
        </p>
      </div>
      <button type="button" onClick={()=>void refresh()} disabled={loading||opening!==null}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
        <RefreshCcw size={15} className={loading?"animate-spin":""}/>刷新历史
      </button>
    </div>
    <p className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">
      <ShieldCheck className="mt-0.5 shrink-0" size={15}/>
      只读模式：不能提交、审批、重试或运行任务；访问权限由原生员工会话与 PostgreSQL RLS 验证。
    </p>
    {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading&&<p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>正在读取历史…</p>}
    {!loading&&!runs.length&&!workflowRuns.length&&!error&&<p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">当前账号还没有 Agent 或 Workflow 运行历史。</p>}
    {!!runs.length&&<div className="space-y-2">
      <h3 className="px-1 text-sm font-semibold text-slate-700">Agent 运行</h3>
      {runs.map(run=><article key={run.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{stateNames[run.status]??"状态未知"}</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{run.id}</p>
            <p className="mt-1 text-xs text-slate-500">创建于 {safeDate(run.created_at)}</p>
          </div>
          <button type="button" disabled={opening!==null||loading}
            className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            onClick={()=>void inspect(run.id,"agent")}>
            {opening===run.id?"读取中…":"查看结果"}
          </button>
        </div>
      </article>)}
    </div>}
    {!!workflowRuns.length&&<div className="space-y-2">
      <h3 className="px-1 text-sm font-semibold text-slate-700">Workflow 运行</h3>
      {workflowRuns.map(item=><article key={item.run.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{stateNames[item.run.status]??item.run.status}</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{item.run.id}</p>
            <p className="mt-1 text-xs text-slate-500">Workflow · {item.run.workflow_id}</p>
            <p className="mt-1 text-xs text-slate-500">创建于 {safeDate(item.run.created_at)} · Worker {item.job_status}</p>
          </div>
          <button type="button" disabled={opening!==null||loading}
            className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            onClick={()=>void inspect(item.run.id,"workflow")}>
            {opening===item.run.id?"读取中…":"查看结果"}
          </button>
        </div>
      </article>)}
    </div>}
    {detail&&<article className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="当前任务详情">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{detail.kind==="agent"?"Agent":"Workflow"} 任务详情 · {stateNames[detail.value.run.status]??detail.value.run.status}</h3>
        <button type="button" className="text-xs text-slate-600 underline" onClick={()=>setDetail(null)}>关闭详情</button>
      </div>
      <p className="mt-3 break-all font-mono text-xs text-slate-500">{detail.value.run.id}</p>
      {detail.kind==="agent"&&<>
        <p className="mt-3 text-sm font-medium">任务要求</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{detail.value.run.instruction||"未填写"}</p>
      </>}
      {detail.kind==="workflow"&&<div className="mt-3 space-y-1 text-xs text-slate-500">
        <p>Workflow ID：<span className="break-all font-mono">{detail.value.run.workflow_id}</span></p>
        <p>Worker 状态：{detail.value.job_status} · 执行范围：{detail.value.execution_mode}</p>
      </div>}
      <p className="mt-4 text-sm font-medium">执行结果</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{detail.value.run.result_text||"暂无结果"}</p>
      {!!detail.value.run.last_error_code&&
        <p className="mt-3 text-xs text-amber-800">状态代码：{detail.value.run.last_error_code}</p>}
      {detail.kind==="agent"&&detail.value.approval&&<p className="mt-3 text-xs text-slate-500">
        模型审批状态：{detail.value.approval.status}</p>}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold">执行步骤（只读）</h4>
        {!detail.value.steps?.length&&<p className="mt-2 text-xs text-slate-500">暂无可展示的步骤记录。</p>}
        {!!detail.value.steps?.length&&<ol className="mt-3 space-y-2">
          {detail.value.steps.map((step,index)=><li key={step.step_key}
            className="rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{index+1}. {stepNames[step.step_key.replace(/^workflow:/,"")]??step.step_key.replace(/^workflow:/,"")}</span>
              <span className="text-xs text-slate-500">{stepStates[step.status]??"状态未知"}</span>
            </div>
            {!!Object.keys(step.metadata).length&&<dl className="mt-2 grid gap-1 sm:grid-cols-2">
              {Object.entries(step.metadata).map(([key,value])=><div key={key} className="min-w-0 text-xs">
                <dt className="inline text-slate-500">{key}：</dt>
                <dd className="inline break-words text-slate-700">
                  {Array.isArray(value)?value.join("、"):String(value)}</dd>
              </div>)}
            </dl>}
            <p className="mt-2 text-[11px] text-slate-400">更新于 {safeDate(step.updated_at)}</p>
          </li>)}
        </ol>}
      </div>
    </article>}
  </section>
}
