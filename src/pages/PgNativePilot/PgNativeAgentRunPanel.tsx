import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {Clock3,Loader2,Play,RefreshCcw,ShieldCheck} from "lucide-react"
import {PgNativePilotError,type PgNativeAgent,type PgNativeModelConnection,
  type PgNativeRun,type PgNativeRunDetail,createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {createPgNativeRunSubmission,type PendingRun} from "@/lib/pgNativeRunSubmission"

type Api=ReturnType<typeof createPgNativePilotApi>
type Decision={id:string;value:"approved"|"rejected"}
const field="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
const button="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
const secondary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
const states:Record<string,string>={queued:"排队中",running:"处理中",awaiting_approval:"等待审批",
  paused:"已暂停",succeeded:"已完成",failed:"失败",cancelled:"已取消"}
const providerBases={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",
  gemini:"https://generativelanguage.googleapis.com/v1beta"}
function describe(error:unknown){
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "登录已失效，请重新登录。"
    if(error.status===403||error.status===405)return "当前账号或环境未授权此操作。"
    if(error.status===404)return "此记录不存在，或不属于当前员工。"
    if(error.status===409)return "任务状态或模型配置已经变化，请刷新核对。"
    if(error.status===429)return "操作过于频繁，请稍后再试。"
  }
  return "请求结果暂未确认，请刷新状态或确认上次操作。"
}

/** Kept mounted across workspace tabs; logout/account change destroys its key. */
export default function PgNativeAgentRunPanel({api,agents,connections,active,enabled}:{
  api:Api;agents:PgNativeAgent[];connections:PgNativeModelConnection[];active:boolean;enabled:boolean
}){
  const [runs,setRuns]=useState<PgNativeRun[]>([])
  const [detail,setDetail]=useState<PgNativeRunDetail|null>(null)
  const [agentId,setAgentId]=useState("")
  const [instruction,setInstruction]=useState("")
  const [pending,setPending]=useState<PendingRun|null>(null)
  const [decision,setDecision]=useState<Decision|null>(null)
  const [costAccepted,setCostAccepted]=useState(false)
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const alive=useRef(false),visible=useRef(active),mutation=useRef(false),reads=useRef(0),view=useRef(0)
  const selected=useRef<string|null>(null)
  const submission=useRef<ReturnType<typeof createPgNativeRunSubmission>|null>(null)
  const deciding=useRef<Decision|null>(null)
  visible.current=active
  const readyConnection=(agent:PgNativeAgent|undefined)=>{
    const binding=agent?.spec.model_binding
    return binding?connections.find(c=>c.id===binding.connection_id&&c.enabled&&c.status==="ok"&&
      c.base_url===providerBases[c.provider]&&c.revision===binding.connection_revision&&
      Array.isArray(c.models)&&c.models.includes(binding.model_id)):undefined
  }
  const eligible=agents.filter(agent=>readyConnection(agent))
  const chosen=eligible.find(agent=>agent.id===agentId)
  const approvalAgent=agents.find(agent=>agent.id===detail?.run.agent_spec_id)
  const approvalConnection=readyConnection(approvalAgent)
  const canApprove=Boolean(approvalConnection&&approvalAgent&&
    detail?.run.checkpoint.spec_revision===approvalAgent.revision)
  const load=useCallback(async(id:string|null)=>{
    const ticket=++reads.current
    setLoading(true);setError("")
    try{
      const [items,item]=await Promise.all([api.listRuns(),id?api.getRun(id):Promise.resolve(null)])
      if(!alive.current||!visible.current||ticket!==reads.current)return
      setRuns(items.slice(0,50));setDetail(item)
      if(item&&deciding.current?.id===item.run.id&&
         item.approval?.status===deciding.current.value){
        deciding.current=null;setDecision(null)
      }
    }catch(err){
      if(alive.current&&visible.current&&ticket===reads.current){
        setRuns([]);setDetail(null);setError(describe(err))
      }
    }finally{if(alive.current&&ticket===reads.current)setLoading(false)}
  },[api])
  useEffect(()=>{
    alive.current=true
    mutation.current=false;deciding.current=null;setBusy(false);setPending(null);setDecision(null)
    return ()=>{alive.current=false;++view.current;++reads.current;submission.current?.dispose();submission.current=null}
  },[api])
  useEffect(()=>{
    if(active)void load(selected.current)
    else{++reads.current;setLoading(false)}
  },[active,load])
  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    if(!active||!enabled||mutation.current||deciding.current||(!pending&&!chosen))return
    mutation.current=true;setBusy(true);setError("");setNotice("")
    const epoch=view.current
    const guard=submission.current??=createPgNativeRunSubmission()
    const operation=guard.submit(api,{agentId,instruction})
    setPending(guard.pending())
    try{
      const outcome=await operation
      if(!alive.current||epoch!==view.current)return
      selected.current=outcome.run.id
      setPending(null);setInstruction("");setCostAccepted(false)
      setDetail({run:outcome.run,steps:[],approval:null})
      setNotice(outcome.replayed?"已确认上次提交，未创建重复任务。":"任务已提交，模型步骤需要另行审批。")
      if(visible.current)await load(outcome.run.id)
    }catch(err){if(alive.current&&epoch===view.current){setPending(guard.pending());setError(describe(err))}}
    finally{if(epoch===view.current){mutation.current=false;if(alive.current)setBusy(false)}}
  }
  const decide=async(value:"approved"|"rejected")=>{
    if(!active||!enabled||mutation.current||!detail||pending||
       detail.approval?.status!=="pending"||detail.run.status!=="awaiting_approval"||
       (value==="approved"&&(!canApprove||!costAccepted)))return
    const previous=deciding.current
    if(previous&&(previous.id!==detail.run.id||previous.value!==value))return
    const request=previous??{id:detail.run.id,value}
    deciding.current=request;setDecision(request)
    mutation.current=true;setBusy(true);setError("");setNotice("")
    const epoch=view.current
    try{
      await api.decideModel(request.id,request.value)
      if(!alive.current||epoch!==view.current)return
      deciding.current=null;setDecision(null);setCostAccepted(false)
      setNotice(value==="approved"?"已批准模型步骤，后台处理可能产生费用。":"已拒绝模型步骤。")
      if(visible.current)await load(request.id)
    }catch(err){if(alive.current&&epoch===view.current)setError(describe(err))}
    finally{if(epoch===view.current){mutation.current=false;if(alive.current)setBusy(false)}}
  }
  return <section aria-label="运行 Agent" className="space-y-5">
    {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Play size={18}/>新建任务</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">选择已绑定可用模型的 Agent。提交后先准备任务，批准模型步骤后才允许调用模型。</p>
      {!eligible.length&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">暂无可运行的 Agent。请先在 Agent 配置中绑定已测试、已启用的本人模型连接。</p>}
      <form onSubmit={submit} className="mt-4 space-y-3">
        <fieldset className="space-y-3" disabled={!enabled||busy||Boolean(pending)||Boolean(decision)}>
          <label className="block text-sm font-medium">选择 Agent
            <select required aria-label="选择 Agent" className={field+" mt-2"} value={agentId} onChange={e=>setAgentId(e.target.value)}>
              <option value="">请选择</option>
              {eligible.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.spec.model_binding?.model_id}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">任务要求
            <textarea required aria-label="任务要求" rows={4} maxLength={1200} className={field+" mt-2"}
              value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="描述本次任务需要完成的内容"/>
          </label>
        </fieldset>
        {pending&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">上次提交结果尚未确认，输入已保留。再次确认会使用原请求，不创建重复任务。</p>}
        <button type="submit" className={button} disabled={!active||!enabled||busy||Boolean(decision)||
          (!pending&&(!chosen||!instruction.trim()))}>
          {busy?<Loader2 size={16} className="animate-spin"/>:<Play size={16}/>}
          {pending?"确认上次提交":"提交任务"}
        </button>
      </form>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">我的任务</h2>
        <button type="button" className={secondary} disabled={!active||busy||loading}
          onClick={()=>void load(selected.current)}><RefreshCcw size={15}/>刷新任务</button>
      </div>
      {loading&&<p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>读取任务中…</p>}
      {!loading&&!runs.length&&<p className="py-5 text-sm text-slate-500">暂无任务</p>}
      <div className="space-y-2">{runs.map(run=><button key={run.id} type="button"
        disabled={busy||Boolean(decision)} aria-pressed={detail?.run.id===run.id}
        onClick={()=>{selected.current=run.id;setCostAccepted(false);void load(run.id)}}
        className={"flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm disabled:opacity-50 "+
          (detail?.run.id===run.id?"border-indigo-300 bg-indigo-50":"border-slate-100 hover:bg-slate-50")}>
        <span className="flex min-w-0 items-center gap-2"><Clock3 size={15} className="shrink-0"/><span className="truncate">{run.instruction||"任务"}</span></span>
        <span className="shrink-0 text-xs font-medium">{states[run.status]??"状态未知"}</span>
      </button>)}</div>
      {detail&&<article className="mt-5 space-y-4 rounded-xl border border-indigo-100 p-4" aria-label="任务详情">
        <h3 className="font-semibold">任务详情 · {states[detail.run.status]??"状态未知"}</h3>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{detail.run.instruction}</p>
        {detail.run.status==="queued"&&<p className="text-sm text-slate-500">已进入队列，等待后台处理。可刷新查看最新状态。</p>}
        {detail.run.status==="paused"&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">任务已暂停。请联系管理员核对执行记录，避免重复提交产生费用。</p>}
        {detail.approval?.status==="pending"&&detail.run.status==="awaiting_approval"&&<div className="space-y-3 rounded-xl bg-amber-50 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16}/>模型调用审批</h4>
          {canApprove?<p className="break-words text-sm">模型：{approvalConnection?.name} · {approvalAgent?.spec.model_binding?.model_id}</p>:
            <p className="text-sm text-amber-900">Agent 或模型配置已经变化，请返回配置页面核对后再处理。</p>}
          <label className="flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" className="mt-1.5" checked={costAccepted} disabled={busy||!enabled||!canApprove||Boolean(pending)}
              onChange={e=>setCostAccepted(e.target.checked)}/>
            我已核对任务与模型，确认调用可能产生费用。
          </label>
          {decision&&<p className="text-sm text-amber-900">上次审批结果尚未确认，请刷新状态或确认同一操作。</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={()=>void decide("approved")}
              disabled={!enabled||busy||!costAccepted||!canApprove||Boolean(pending)||decision?.value==="rejected"}>
              {decision?.value==="approved"?"确认上次批准":"批准模型调用"}</button>
            <button type="button" className={secondary} onClick={()=>void decide("rejected")}
              disabled={!enabled||busy||Boolean(pending)||decision?.value==="approved"}>
              {decision?.value==="rejected"?"确认上次拒绝":"拒绝模型调用"}</button>
          </div>
        </div>}
        {detail.run.result_text&&<div><h4 className="mb-2 text-sm font-semibold">执行结果</h4>
          <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6">{detail.run.result_text}</pre></div>}
        <p className="break-all text-xs text-slate-400">任务编号：{detail.run.id}</p>
      </article>}
    </div>
  </section>
}
