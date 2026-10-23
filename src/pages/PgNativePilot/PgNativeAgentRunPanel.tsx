import {useEffect,useRef,useState,type FormEvent} from "react"
import {Clock3,Loader2,Play,RefreshCcw,ShieldCheck} from "lucide-react"
import {type PgNativeAgent,type PgNativeModelConnection,createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {createPgNativeAgentRunSession,emptyAgentRunView} from "@/lib/pgNativeAgentRunSession"

type Api=ReturnType<typeof createPgNativePilotApi>
type Controller=ReturnType<typeof createPgNativeAgentRunSession>
const field="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
const button="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
const secondary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
const states:Record<string,string>={queued:"排队中",running:"处理中",awaiting_approval:"等待审批",
  paused:"已暂停",succeeded:"已完成",failed:"失败",cancelled:"已取消"}
const providerBases={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",
  gemini:"https://generativelanguage.googleapis.com/v1beta"}
/** Kept mounted across workspace tabs; logout/account change destroys its key. */
export default function PgNativeAgentRunPanel({api,agents,connections,active,enabled}:{
  api:Api;agents:PgNativeAgent[];connections:PgNativeModelConnection[];active:boolean;enabled:boolean
}){
  const [snapshot,setSnapshot]=useState<{api:Api;view:ReturnType<Controller["snapshot"]>}>({api,view:emptyAgentRunView()})
  // A changed API/session cannot render the previous employee's snapshot,
  // including the render before the effect recreates its controller.
  const view=snapshot.api===api?snapshot.view:emptyAgentRunView()
  const {runs,detail,pending,decision,loading,busy,error,notice}=view
  const [agentId,setAgentId]=useState("")
  const [instruction,setInstruction]=useState("")
  const [costAccepted,setCostAccepted]=useState(false)
  const model=useRef<Controller|null>(null)
  useEffect(()=>{
    // StrictMode cleanup/setup must recreate the disposed lifetime.
    const controller=createPgNativeAgentRunSession(api)
    model.current=controller;setSnapshot({api,view:controller.snapshot()})
    setAgentId("");setInstruction("");setCostAccepted(false)
    const unsubscribe=controller.subscribe(()=>setSnapshot({api,view:controller.snapshot()}))
    return ()=>{unsubscribe();controller.dispose();if(model.current===controller)model.current=null}
  },[api])
  useEffect(()=>{setCostAccepted(false);void model.current?.setActive(active)},[active,api])
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
  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    if(!active||!enabled||busy||decision||!pending&&!chosen)return
    const controller=model.current
    if(!controller)return
    await controller.submit({agentId,instruction})
    if(model.current===controller&&!controller.snapshot().pending&&controller.snapshot().notice){
      setInstruction("");setCostAccepted(false)
    }
  }
  const decide=async(value:"approved"|"rejected")=>{
    if(!active||!enabled||busy||pending||value==="approved"&&(!canApprove||!costAccepted))return
    const controller=model.current
    if(!controller)return
    await controller.decide(value,costAccepted)
    if(model.current===controller&&!controller.snapshot().decision)setCostAccepted(false)
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
          onClick={()=>{setCostAccepted(false);void model.current?.refresh()}}><RefreshCcw size={15}/>刷新任务</button>
      </div>
      {loading&&<p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>读取任务中…</p>}
      {!loading&&!runs.length&&<p className="py-5 text-sm text-slate-500">暂无任务</p>}
      <div className="space-y-2">{(active?runs:[]).map(run=><button key={run.id} type="button"
        disabled={!active||busy||loading||Boolean(decision)} aria-pressed={detail?.run.id===run.id}
        onClick={()=>{setCostAccepted(false);void model.current?.select(run.id)}}
        className={"flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm disabled:opacity-50 "+
          (detail?.run.id===run.id?"border-indigo-300 bg-indigo-50":"border-slate-100 hover:bg-slate-50")}>
        <span className="flex min-w-0 items-center gap-2"><Clock3 size={15} className="shrink-0"/><span className="truncate">{run.instruction||"任务"}</span></span>
        <span className="shrink-0 text-xs font-medium">{states[run.status]??"状态未知"}</span>
      </button>)}</div>
      {active&&detail&&<article className="mt-5 space-y-4 rounded-xl border border-indigo-100 p-4" aria-label="任务详情">
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
