import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {CheckCircle2,Clock3,Loader2,RefreshCcw,ShieldCheck,AlertTriangle} from "lucide-react"
import type {PgNativeAgent,PgNativeRun,PgNativeRunDetail} from "@/lib/pgNativePilotApi"
import {PgNativePilotError,createPgNativePilotApi} from "@/lib/pgNativePilotApi"

type NativeApi=ReturnType<typeof createPgNativePilotApi>
const button="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
const secondary="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
const field="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500"
const names:Record<PgNativeRun["status"],string>={
  queued:"等待 Worker",running:"执行中",awaiting_approval:"等待模型审批",
  paused:"暂停",succeeded:"成功",failed:"失败",cancelled:"已取消"
}
function keyForOneRun(){
  // Use a fresh idempotency key only AFTER successful submission. Failed
  // network attempts keep their key so a retry cannot duplicate the run.
  return "uat_"+crypto.randomUUID().replaceAll("-","")
}
function describe(error:unknown):string{
  if(error instanceof PgNativePilotError){
    if(error.status===405||error.status===503)
      return "当前隔离环境没有授权 Run/审批 UAT，不会创建任何任务。"
    if(error.status===401)return "员工会话无效，请重新登录。"
    if(error.status===403)return "请求被权限或 CSRF 校验拒绝。"
    if(error.status===404)return "任务不存在或无权访问。"
    if(error.status===409)return "状态已变化或重复请求冲突，请刷新确认。"
    return "请求失败（"+error.code+"）。"
  }
  return "网络或运行环境出现问题，请刷新后重试。"
}

/** Development-only PG-native UAT surface. Not a production task runner. */
export default function PgNativeRunUatPanel({api,agents}:{
  api:NativeApi
  agents:PgNativeAgent[]
}){
  const [runs,setRuns]=useState<PgNativeRun[]>([])
  const [selection,setSelection]=useState<string|null>(null)
  const [detail,setDetail]=useState<PgNativeRunDetail|null>(null)
  const [specId,setSpecId]=useState("")
  const [instruction,setInstruction]=useState("")
  const [key,setKey]=useState(keyForOneRun)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  // Rapid selection changes and unmount/logout must never rehydrate stale
  // private Run details from an older asynchronous response.
  const readEpoch=useRef(0)
  const load=useCallback(async(target:string|null=null)=>{
    const ticket=++readEpoch.current
    setLoading(true)
    try{
      const [items,selected]=await Promise.all([
        api.listRuns(),
        target?api.getRun(target):Promise.resolve(null)
      ])
      if(ticket!==readEpoch.current)return
      setRuns(items)
      setDetail(selected)
      if(target&&!selected)setSelection(null)
      setError("")
    }catch(e){
      if(ticket!==readEpoch.current)return
      setRuns([]);setDetail(null);setError(describe(e))
    }finally{
      if(ticket===readEpoch.current)setLoading(false)
    }
  },[api])
  useEffect(()=>{
    void load()
    return ()=>{readEpoch.current++}
  },[load])
  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    if(busy||!specId||!instruction.trim())return
    setBusy(true);setError("");setNotice("")
    try{
      const outcome=await api.submitRun(specId,instruction.trim(),key)
      setSelection(outcome.run.id)
      setDetail({run:outcome.run,approval:null,steps:[]})
      setNotice(outcome.replayed
        ?"已确认幂等提交，没有创建重复任务。"
        :"任务已提交，等待后台处理。模型步骤需要你另行审批。")
      setInstruction("");setKey(keyForOneRun())
      await load(outcome.run.id)
    }catch(e){setError(describe(e))}
    finally{setBusy(false)}
  }
  const decide=async(decision:"approved"|"rejected")=>{
    if(busy||!detail||detail.approval?.status!=="pending")return
    setBusy(true);setError("");setNotice("")
    try{
      const result=await api.decideModel(detail.run.id,decision)
      setNotice(result.replayed?"审批状态未重复写入。":
        decision==="approved"?"已批准模型步骤。已获授权的后台 Worker 可调用模型并产生费用。":"已拒绝，本任务不执行模型。")
      await load(detail.run.id)
    }catch(e){setError(describe(e))}
    finally{setBusy(false)}
  }
  return <div className="space-y-4">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <AlertTriangle size={18}/>仅限隔离 Run/审批 UAT
      </div>
      后端默认关闭此功能。批准模型步骤后，已获授权的后台 Worker 可调用所绑定的模型并产生费用。
      此页面不会启动 Worker；未启动 Worker 时任务会保持排队。
    </div>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</div>}
    {notice&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">提交测试任务</h2>
      <p className="mt-1 text-xs text-slate-500">选择已保存的 Agent，提交一个带幂等键的准备任务。重复提交不会重复创建。</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block space-y-1.5 text-sm font-medium">Agent
          <select className={field} required value={specId} onChange={e=>setSpecId(e.target.value)}>
            <option value="">请选择已保存的 Agent</option>
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">测试指令
          <textarea required maxLength={2000} rows={3} value={instruction}
            onChange={e=>setInstruction(e.target.value)} className={field}
            placeholder="例如：准备一份仅含合成内容的尽调计划，不调用外部模型"/>
        </label>
        <button type="submit" disabled={busy||!specId||!instruction.trim()||!agents.length}
          className={button}>{busy?<Loader2 className="animate-spin" size={16}/>:<ShieldCheck size={16}/>}
          提交隔离任务</button>
      </form>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">我的运行记录</h2>
          <p className="mt-1 text-xs text-slate-500">仅显示当前已验证员工拥有的任务</p></div>
        <button className={secondary} type="button" disabled={busy||loading}
          onClick={()=>void load(selection)}><RefreshCcw size={14}/>刷新</button>
      </div>
      {loading&&<div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin"/>读取任务状态中…</div>}
      {!loading&&!runs.length&&<p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">暂无可用运行记录，或 Run UAT 尚未授权。</p>}
      <div className="space-y-2">
        {runs.map(run=><button key={run.id} type="button" onClick={()=>{
          setSelection(run.id);void load(run.id)
        }} className={"w-full rounded-xl border p-3 text-left text-sm hover:bg-slate-50 "+
          (selection===run.id?"border-indigo-300 bg-indigo-50":"border-slate-100")}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <Clock3 className="shrink-0 text-slate-500" size={15}/>
              <span className="truncate">{run.instruction||"无指令任务"}</span></span>
            <span className="shrink-0 text-xs font-semibold text-indigo-700">{names[run.status]||run.status}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{run.id}</p>
        </button>)}
      </div>
      {detail&&<div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 size={16}/>已选任务 · {names[detail.run.status]}</p>
        <p className="mt-2 break-words text-xs text-slate-600">执行阶段：{
          typeof detail.run.checkpoint?.stage==="string"?detail.run.checkpoint.stage:"尚未开始"
        }</p>
        {detail.approval?.status==="pending"&&detail.run.status==="awaiting_approval"&&
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy}
              onClick={()=>void decide("approved")}>批准模型步骤（可能产生费用）</button>
            <button type="button" className={secondary} disabled={busy}
              onClick={()=>void decide("rejected")}>拒绝</button>
          </div>}
        {detail.approval&&detail.approval.status!=="pending"&&
          <p className="mt-3 text-xs text-slate-500">审批：{detail.approval.status}</p>}
      </div>}
    </section>
  </div>
}
