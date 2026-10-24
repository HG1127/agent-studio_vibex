import {useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeSchedule,type PgNativeScheduleActivation,type PgNativeScheduleExecution,type PgNativeScheduleOccurrence} from "@/lib/pgNativePilotApi"
import {scheduleActivationLocalStart,scheduleActivationWindow} from "@/lib/pgNativeScheduleTime"
type Api=ReturnType<typeof createPgNativePilotApi>
const inputClass="w-full rounded-lg border border-slate-200 px-3 py-2"
function message(error:unknown){
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "登录已失效，请重新登录。"
    if(error.status===409)return "计划、目标或授权已变化，或本分钟已经排队。请刷新核实后重试。"
    if(error.status===400)return "请检查任务说明、执行时间和授权上限。"
    if(error.status===403)return "当前环境尚未开放后台计划执行。"
  }
  return "未收到操作确认。启用操作可用同一请求重试；请先刷新检查当前状态。"
}
export default function PgNativeScheduleExecutionControls({api,item,targetRevision,occurrences,onChanged,canActivate=true}:{
  api:Api;item:PgNativeSchedule;targetRevision:number|undefined;occurrences:PgNativeScheduleOccurrence[];onChanged:()=>Promise<void>;canActivate?:boolean
}){
  const [state,setState]=useState<PgNativeScheduleExecution|null>(null),[loading,setLoading]=useState(true)
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false)
  const [instruction,setInstruction]=useState(""),[maxSteps,setMaxSteps]=useState(3),[maxAuto,setMaxAuto]=useState(50)
  const [unlimited,setUnlimited]=useState(false),[occurrenceCap,setOccurrenceCap]=useState(10),[days,setDays]=useState(7)
  const [background,setBackground]=useState(false),[knowledge,setKnowledge]=useState(false)
  const [uncertain,setUncertain]=useState(false)
  const [deferred,setDeferred]=useState(false),[startDate,setStartDate]=useState(""),[startTime,setStartTime]=useState("09:00")
  const pending=useRef<PgNativeScheduleActivation|null>(null),generation=useRef(0)
  useEffect(()=>{let live=true;setLoading(true);setState(null);setError("");setBusy(false);pending.current=null;setUncertain(false);setBackground(false);setKnowledge(false)
    setDeferred(false);setStartDate("");setStartTime("09:00")
    const ticket=++generation.current
    void api.getScheduleExecution(item.id).then(value=>{
      if(!live||ticket!==generation.current)return
      setState(value);setInstruction(value.execution.instruction??"");setMaxSteps(value.execution.max_steps??3);setMaxAuto(value.execution.max_auto_effects??50)
      const start=scheduleActivationLocalStart(value.execution.anchor_at,item.time_zone,Date.now())
      if(start){setDeferred(true);setStartDate(start.date);setStartTime(start.time)}
      setUnlimited(Boolean(value.authority_id)&&value.max_occurrences===null&&value.expires_at===null);setOccurrenceCap(value.max_occurrences??10)
      setDays(value.expires_at?Math.max(1,Math.min(365,Math.ceil((Date.parse(value.expires_at)-Date.now())/86400000))):7)
    }).catch(e=>{if(live&&ticket===generation.current)setError(message(e))}).finally(()=>{if(live&&ticket===generation.current)setLoading(false)})
    return ()=>{live=false;generation.current++}
  },[api,item.id,item.revision,item.time_zone,targetRevision,canActivate,occurrences])
  const perform=async(action:()=>Promise<unknown>,text:string)=>{
    if(busy)return;const ticket=generation.current;setBusy(true);setError("");setNotice("")
    try{await action();if(ticket!==generation.current)return;setNotice(text);await onChanged()}
    catch(e){if(ticket===generation.current)setError(message(e))}
    finally{if(ticket===generation.current)setBusy(false)}
  }
  const activate=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!targetRevision||!background||!canActivate)return
    let body=pending.current
    if(!body)try{
      const window=scheduleActivationWindow({start:deferred?{date:startDate,time:startTime}:null,timeZone:item.time_zone,now:Date.now(),unlimited,days})
      body={expected_revision:item.revision,expected_target_revision:targetRevision,instruction,max_steps:item.kind==="agent"?maxSteps:1,
        ...window,max_occurrences:unlimited?null:occurrenceCap,max_auto_effects:maxAuto,background_ack:"AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1",
        knowledge_charge_ack:knowledge?"AUTHORIZE_SCHEDULED_KNOWLEDGE_CHARGES_V1":null,request_id:crypto.randomUUID()}
    }catch(e){
      const code=e instanceof Error?e.message:""
      setError(code==="schedule_start_in_past"?"首次生效时间必须晚于当前时间。":code==="schedule_expiry_before_start"?"首次生效时间超出授权有效期，请延长有效期或选择持续执行。":
        code==="dst_local_time_missing"?"所选时刻因夏令时调整而不存在，请选择其他时间。":"首次生效日期或时间不合法，请核对计划时区及有效期。")
      return
    }
    pending.current=body;const ticket=generation.current;setBusy(true);setError("");setNotice("")
    try{await api.activateSchedule(item.id,body);if(ticket!==generation.current)return;pending.current=null;setUncertain(false);setNotice("后台计划已授权。运行进度和结果可在对应的 Agent / Workflow 运行记录中查看。");await onChanged()}
    catch(e){if(ticket===generation.current){setUncertain(true);setError(message(e))}}
    finally{if(ticket===generation.current)setBusy(false)}
  }
  if(loading)return <p role="status" className="p-3 text-sm text-slate-500">正在读取后台授权…</p>
  return <section aria-label="计划执行授权" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}
    {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {state&&<p className="text-xs text-slate-600">已保留 {state.used_occurrences} 次触发 / {state.max_occurrences??"不限制次数"}；
      {state.authority_id?(state.source_current?"授权来源有效":"授权已失效，请重新核实并启用"):"尚未授予后台运行权限"}</p>}
    <div className="flex flex-wrap gap-2">
      {canActivate&&<button type="button" disabled={busy||!item.enabled||!state?.source_current} onClick={()=>void perform(()=>api.runScheduleNow(item.id,item.revision),"本次任务已排队；同一分钟不会重复排队。")}
        className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50">立即运行</button>}
      <button type="button" disabled={busy||!state?.authority_id} onClick={()=>void perform(()=>api.pauseSchedule(item.id,item.revision),"计划已暂停，待启动触发已取消，未完成运行的持续授权已撤销。")}
        className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-50">暂停并撤销授权</button>
      {canActivate&&occurrences.filter(o=>o.status==="failed_start"&&Number(o.schedule_revision)===item.revision).map(o=><button key={o.id} type="button" disabled={busy}
        onClick={()=>void perform(()=>api.retryScheduleStart(item.id,item.revision,o.id),"已重新排队该次启动；保留原运行编号。")}
        className="rounded-lg border border-amber-300 px-3 py-2 text-xs disabled:opacity-50">重试失败启动（{new Date(o.scheduled_for).toLocaleString("zh-CN")}）</button>)}
    </div>
    {!canActivate&&<p className="text-xs text-amber-800">当前环境已关闭后台执行，仍可暂停并撤销自己的计划授权。</p>}
    {canActivate&&<details open={!item.enabled}><summary className="cursor-pointer text-sm font-semibold">{item.enabled?"重新授予后台权限":"启用后台计划"}</summary>
      <form onSubmit={e=>void activate(e)} className="mt-3 space-y-3">
        <fieldset disabled={busy||uncertain} className="space-y-3 disabled:opacity-60">
          <label className="block text-xs">每次运行的任务说明<textarea required maxLength={1200} rows={3} className={inputClass} value={instruction} onChange={e=>setInstruction(e.target.value)}/></label>
          {(item.recurrence?.rule as {kind?:string}|undefined)?.kind!=="once"&&<>
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={deferred} onChange={e=>setDeferred(e.target.checked)}/>从指定时间生效（按计划时区 {item.time_zone}）</label>
            {deferred&&<div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">首次生效日期<input type="date" required className={inputClass} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
              <label className="text-xs">首次生效时间<input type="time" required className={inputClass} value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
            </div>}
            <p className="text-xs text-slate-600">固定间隔从生效时刻起计算；每日或每周计划取生效后的第一个匹配时刻。秋季夏令时重复时刻采用第一次。</p>
          </>}
          <div className="grid gap-3 sm:grid-cols-2">
            {item.kind==="agent"&&<label className="text-xs">Agent 最大轮数<input type="number" min={1} max={30} required className={inputClass} value={maxSteps} onChange={e=>setMaxSteps(Number(e.target.value))}/></label>}
            <label className="text-xs">每次运行最多自动授权的步骤数<input type="number" min={1} max={10000} required className={inputClass} value={maxAuto} onChange={e=>setMaxAuto(Number(e.target.value))}/></label>
            {!unlimited&&<><label className="text-xs">最多触发次数<input type="number" min={1} max={1000000} required className={inputClass} value={occurrenceCap} onChange={e=>setOccurrenceCap(Number(e.target.value))}/></label>
              <label className="text-xs">授权有效天数（从本次确认起）<input type="number" min={1} max={365} required className={inputClass} value={days} onChange={e=>setDays(Number(e.target.value))}/></label></>}
          </div>
          <label className="flex gap-2 text-xs"><input type="checkbox" checked={unlimited} onChange={e=>setUnlimited(e.target.checked)}/>持续执行直至暂停（不设到期日与总触发次数；每次运行仍受步骤上限约束）</label>
          <label className="flex gap-2 text-xs"><input type="checkbox" checked={knowledge} onChange={e=>setKnowledge(e.target.checked)}/>另行允许此计划的语义知识检索产生嵌入 / 重排费用</label>
          <label className="flex gap-2 text-xs"><input type="checkbox" required checked={background} onChange={e=>setBackground(e.target.checked)}/>我授权当前目标和连接版本在上述范围内自动调用模型及读取工具，可能产生费用。MCP 与外部写操作仍须逐步审批；编辑目标或连接后需重新授权。</label>
        </fieldset>
        {!targetRevision&&<p className="text-xs text-rose-700">目标配置不可用，请刷新目标列表。</p>}
        <button type="submit" disabled={busy||!background||!targetRevision} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy?"处理中…":uncertain?"用原请求重试启用":"确认授权并启用"}</button>
        {uncertain&&<button type="button" disabled={busy} className="ml-2 text-xs underline" onClick={()=>void onChanged()}>刷新确认当前状态</button>}
      </form>
    </details>}
  </section>
}
