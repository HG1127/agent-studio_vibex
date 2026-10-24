import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {CalendarClock,Clock3,Loader2,RefreshCw,ShieldCheck,Plus,Trash2} from "lucide-react"
import PgNativeScheduleExecutionControls from "./PgNativeScheduleExecutionControls"
import {createPgNativePilotApi,PgNativePilotError,
  type PgNativeSchedule,type PgNativeScheduleOccurrence,
  type PgNativeAgent,type PgNativeWorkflow,
  type PgNativeScheduleDraftRule,type PgNativeScheduleDraftInput} from "@/lib/pgNativePilotApi"

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

/** Inert schedule-draft config and read-only occurrence inventory; NO scheduler. */
export default function PgNativeSchedulesReadonlyPanel({api,agents,workflows,canEdit,canExecute=false}:{
  api:NativeApi;agents:PgNativeAgent[];workflows:PgNativeWorkflow[];canEdit:boolean;canExecute?:boolean
}){
  const [items,setItems]=useState<PgNativeSchedule[]>([])
  const [selected,setSelected]=useState<string|null>(null)
  const [occurrences,setOccurrences]=useState<PgNativeScheduleOccurrence[]>([])
  const [loading,setLoading]=useState(true)
  const [historyLoading,setHistoryLoading]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [editing,setEditing]=useState<PgNativeSchedule|null>(null)
  const [name,setName]=useState("")
  const [kind,setKind]=useState<"agent"|"workflow">("agent")
  const [targetId,setTargetId]=useState("")
  const [timeZone,setTimeZone]=useState("Asia/Shanghai")
  const [ruleKind,setRuleKind]=useState<PgNativeScheduleDraftRule["kind"]>("daily")
  const [localTime,setLocalTime]=useState("09:00")
  const [startDate,setStartDate]=useState("2026-10-22")
  const [weekday,setWeekday]=useState(1)
  const [intervalMinutes,setIntervalMinutes]=useState(60)
  const [saving,setSaving]=useState(false)
  const [formOpen,setFormOpen]=useState(false)
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
  const resetForm=()=>{
    setEditing(null);setName("");setKind("agent")
    setTargetId(agents[0]?.id||"");setTimeZone("Asia/Shanghai")
    setRuleKind("daily");setLocalTime("09:00")
    setStartDate(new Date().toISOString().slice(0,10))
    setWeekday(1);setIntervalMinutes(60);setFormOpen(false)
  }
  const editDraft=(item:PgNativeSchedule)=>{
    if(!canEdit||!(item.recurrence?.config_format==="pg_schedule_draft_v1"||canExecute&&item.recurrence?.config_format==="pg_schedule_execution_v2"))
      return
    const rule=item.recurrence.rule as PgNativeScheduleDraftRule|undefined
    if(!rule)return
    setEditing(item);setFormOpen(true);setName(item.name)
    setKind(item.kind);setTargetId(item.agent_spec_id||item.workflow_id||"")
    setTimeZone(item.time_zone)
    setRuleKind(rule.kind)
    setLocalTime("local_time" in rule?rule.local_time:"09:00")
    setStartDate("start_date" in rule?rule.start_date:new Date().toISOString().slice(0,10))
    setWeekday("weekday" in rule?rule.weekday:1)
    setIntervalMinutes("interval_minutes" in rule?rule.interval_minutes:60)
    setNotice("");setError("")
  }
  const saveDraft=async(event:FormEvent)=>{
    event.preventDefault()
    if(!canEdit||saving)return
    const rule:PgNativeScheduleDraftRule=ruleKind==="once"?
      {kind:"once",start_date:startDate,local_time:localTime}:
      ruleKind==="daily"?{kind:"daily",local_time:localTime}:
      ruleKind==="weekly"?{kind:"weekly",local_time:localTime,weekday}:
      {kind:"interval",interval_minutes:intervalMinutes}
    const input:PgNativeScheduleDraftInput={
      name:name.trim(),kind,target_id:targetId,time_zone:timeZone,rule
    }
    setSaving(true);setError("");setNotice("")
    try{
      if(editing)await api.updateScheduleDraft(editing.id,editing.revision,input)
      else await api.createScheduleDraft(input)
      resetForm()
      await getItems()
      setNotice("计划已保存为停用草稿。原后台授权已撤销，需要重新启用才会继续调度。")
    }catch(err){
      if(err instanceof PgNativePilotError&&err.status===409)
        setError("草稿版本已变化，或该记录是不可修改的旧版隔离计划；请刷新后重试。")
      else if(err instanceof PgNativePilotError&&err.status===404)
        setError("目标 Agent/Workflow 不属于当前员工，或计划已不存在。")
      else if(err instanceof PgNativePilotError&&err.status===400)
        setError("计划参数不合法，请检查目标、时区、日期及重复规则。")
      else setError("计划草稿保存失败，请检查独立 PG18 配置权限。")
    }finally{setSaving(false)}
  }
  const deleteDraft=async(item:PgNativeSchedule)=>{
    if(!canEdit||saving||
       !(item.recurrence?.config_format==="pg_schedule_draft_v1"||canExecute&&item.recurrence?.config_format==="pg_schedule_execution_v2"))return
    if(typeof window!=="undefined"&&
       !window.confirm("删除计划“"+item.name+"”并撤销后台授权？历史运行记录将保留。"))return
    setSaving(true);setError("");setNotice("")
    try{
      await api.deleteScheduleDraft(item.id,item.revision)
      if(item.id===selected){setSelected(null);setOccurrences([])}
      if(item.id===editing?.id)resetForm()
      await getItems()
      setNotice("计划草稿已删除。")
    }catch(err){
      setError(err instanceof PgNativePilotError&&err.status===409?
        "删除被版本冲突或历史记录保护机制阻止。":"删除失败，请重新加载最新状态。")
    }finally{setSaving(false)}
  }
  return <div className="space-y-4">
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <ShieldCheck size={18}/>{canExecute?"我的后台计划与运行历史":"计划草稿与历史清单 · 执行未开放"}
      </h2>
      <p className="mt-2 text-xs leading-6 text-indigo-800">
        可保存和编辑本人拥有的计划草稿，亦可查看历史执行元数据。
        {canExecute?"新计划先保存为停用草稿。选中计划后，可核实任务说明及费用范围，明确授权后启用；后台进程需由管理员单独配置。":"所有新草稿均停用且无下次执行时间，当前环境尚未开放后台执行。"}
      </p>
    </section>
    {error&&<div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {notice&&<div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {canEdit&&<section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">定时计划配置草稿</h3>
          <p className="mt-1 text-xs text-slate-500">保存或编辑后均停用并撤销旧授权。旧版导入的隔离计划仅供查看。</p>
        </div>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving||(!agents.length&&!workflows.length)}
          onClick={()=>{resetForm();setFormOpen(true)}}>
          <Plus size={16}/>新建草稿
        </button>
      </div>
      {!agents.length&&!workflows.length&&
        <p className="mt-3 text-xs text-amber-700">请先创建本人 Agent 或 Workflow 配置。</p>}
      {formOpen&&<form className="mt-4 space-y-4 border-t border-slate-100 pt-4"
        onSubmit={e=>void saveDraft(e)}>
        <p className="text-sm font-semibold text-slate-800">{editing?"编辑草稿（修订 "+editing.revision+"）":"创建草稿"}</p>
        <label className="block space-y-1 text-xs font-medium">计划名称
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2" required
            maxLength={120} value={name} onChange={e=>setName(e.target.value)}/>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">关联类型
            <select value={kind} className="w-full rounded-lg border border-slate-200 px-3 py-2"
              onChange={e=>{const k=e.target.value as "agent"|"workflow";setKind(k);
                setTargetId(k==="agent"?agents[0]?.id||"":workflows[0]?.id||"")}}>
              <option value="agent">Agent</option>
              <option value="workflow">Workflow</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">本人目标配置
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2" required
              value={targetId} onChange={e=>setTargetId(e.target.value)}>
              <option value="">请选择</option>
              {(kind==="agent"?agents:workflows).map(x=>
                <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">IANA 时区
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2"
              required value={timeZone} maxLength={80}
              onChange={e=>setTimeZone(e.target.value)} placeholder="Asia/Shanghai"/>
          </label>
          <label className="space-y-1 text-xs font-medium">重复类型
            <select value={ruleKind} className="w-full rounded-lg border border-slate-200 px-3 py-2"
              onChange={e=>setRuleKind(e.target.value as PgNativeScheduleDraftRule["kind"])}>
              <option value="once">单次</option><option value="daily">每天</option>
              <option value="weekly">每周</option><option value="interval">固定间隔</option>
            </select>
          </label>
          {ruleKind!=="interval"&&<label className="space-y-1 text-xs font-medium">
            本地时间（HH:MM）
            <input type="time" required className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={localTime} onChange={e=>setLocalTime(e.target.value)}/>
          </label>}
          {ruleKind==="once"&&<label className="space-y-1 text-xs font-medium">
            日期
            <input type="date" required className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={startDate} onChange={e=>setStartDate(e.target.value)}/>
          </label>}
          {ruleKind==="weekly"&&<label className="space-y-1 text-xs font-medium">
            星期
            <select value={weekday} className="w-full rounded-lg border border-slate-200 px-3 py-2"
              onChange={e=>setWeekday(Number(e.target.value))}>
              {["周日","周一","周二","周三","周四","周五","周六"].map((d,i)=>
                <option key={i} value={i}>{d}</option>)}
            </select>
          </label>}
          {ruleKind==="interval"&&<label className="space-y-1 text-xs font-medium">
            间隔分钟（15～10080）
            <input type="number" min={15} max={10080} required
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={intervalMinutes} onChange={e=>setIntervalMinutes(Number(e.target.value))}/>
          </label>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={saving||!targetId} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving?"保存中…":"保存停用草稿"}
          </button>
          <button type="button" disabled={saving} onClick={resetForm}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm">取消</button>
          <span className="text-xs text-amber-700">仅配置，不启动调度器</span>
        </div>
      </form>}
    </section>}
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
        {items.map(item=><div key={item.id} className="space-y-2">
          <button type="button"
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
          </button>
          {canEdit&&(item.recurrence?.config_format==="pg_schedule_draft_v1"||canExecute&&item.recurrence?.config_format==="pg_schedule_execution_v2")&&
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={()=>editDraft(item)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700">
              编辑并停用
            </button>
            <button type="button" disabled={saving} onClick={()=>void deleteDraft(item)}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700">
              <Trash2 size={13}/>删除计划
            </button>
          </div>}
          {(canExecute||item.recurrence?.config_format==="pg_schedule_execution_v2")&&selected===item.id&&item.recurrence&&["pg_schedule_draft_v1","pg_schedule_execution_v2"].includes(String(item.recurrence.config_format))&&
            <PgNativeScheduleExecutionControls api={api} item={item} occurrences={occurrences} canActivate={canExecute}
              targetRevision={item.kind==="agent"?agents.find(a=>a.id===item.agent_spec_id)?.revision:workflows.find(w=>w.id===item.workflow_id)?.revision}
              onChanged={async()=>{await getItems();await inspect(item.id)}}/>}
        </div>)}
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
            <span className="text-xs font-medium text-slate-700">{({pending:"待启动",launching:"正在启动",retryable:"等待重试启动",failed_start:"启动失败",started:"已启动",succeeded:"已完成",failed:"执行失败",skipped:"已跳过",skipped_overlap:"上一轮未结束，已跳过",cancelled_run:"运行已取消",cancelled_schedule:"计划已取消",invalid_schedule:"计划参数异常"} as Record<string,string>)[o.status]??o.status}{o.run_status?" · "+({queued:"排队中",running:"运行中",awaiting_approval:"等待逐步审批",paused:"运行已暂停",succeeded:"运行完成",failed:"运行失败",cancelled:"运行已取消"} as Record<string,string>)[o.run_status]:""}</span>
          </li>)}
        </ol>
      </div>}
    </section>
  </div>
}
