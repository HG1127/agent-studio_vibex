import {useEffect,useRef,useState,type FormEvent} from "react"
import {Loader2,Play,RefreshCcw} from "lucide-react"
import type {createPgNativePilotApi,PgNativeAgent,PgNativeModelConnection,PgNativeToolConnection} from "@/lib/pgNativePilotApi"
import {readyAgentHttpTools} from "@/lib/pgNativeAgentHttpTools"
import {readyAgentMcpTools} from "@/lib/pgNativeMcpConnection"
import {useMcpConnections} from "./useMcpConnections"
import {createPgNativeAutonomousAgentSession,emptyAutonomousView,readyAutonomousModel} from "@/lib/pgNativeAutonomousAgentSession"
import PgNativeAutonomousAgentDetail,{autonomousStates,autonomousButton,autonomousSecondary} from "./PgNativeAutonomousAgentDetail"
import PgNativeAgentHumanInputPanel from "./PgNativeAgentHumanInputPanel"
const field="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
type Controller=ReturnType<typeof createPgNativeAutonomousAgentSession>
export default function PgNativeAutonomousAgentPanel({api,agents,connections,tools=[],mcpEnabled=false,humanAvailable=false,humanEnabled=false,active,enabled,onExpired,target}:{
  api:ReturnType<typeof createPgNativePilotApi>;agents:PgNativeAgent[];connections:PgNativeModelConnection[];
  tools?:PgNativeToolConnection[];mcpEnabled?:boolean;humanAvailable?:boolean;humanEnabled?:boolean;active:boolean;enabled:boolean;onExpired:()=>void;target?:{id:string;selection:number}|null
}){
  const mcps=useMcpConnections(api,active,onExpired)
  const [view,setView]=useState(emptyAutonomousView)
  const [agentId,setAgentId]=useState("")
  const [instruction,setInstruction]=useState("")
  const [maxSteps,setMaxSteps]=useState(3)
  const [planReview,setPlanReview]=useState("inherit")
  const model=useRef<Controller|null>(null)
  const openedTarget=useRef("")
  useEffect(()=>{
    // Recreate on effect setup, including StrictMode's cleanup/setup replay.
    const controller=createPgNativeAutonomousAgentSession(api,{onExpired})
    openedTarget.current=""
    model.current=controller;setView(controller.snapshot())
    const unsubscribe=controller.subscribe(()=>setView(controller.snapshot()))
    return ()=>{unsubscribe();controller.dispose();if(model.current===controller)model.current=null}
  },[api,onExpired])
  useEffect(()=>{model.current?.setActive(active)},[active,api,onExpired])
  useEffect(()=>{
    if(!active||!target||view.busy||view.loading||view.pendingSubmit||view.pendingMutation||view.pendingHumanResponse)return
    const key=target.id+":"+target.selection
    if(openedTarget.current===key)return
    openedTarget.current=key
    void model.current?.select(target.id)
  },[active,target?.id,target?.selection,view.busy,view.loading,view.pendingSubmit,view.pendingMutation,view.pendingHumanResponse,api,onExpired])
  useEffect(()=>{
    if(!active||view.busy||view.loading||view.pendingSubmit||view.pendingMutation||view.pendingHumanResponse||view.error||
       !["queued","running"].includes(view.detail?.run.status??""))return
    const timer=setTimeout(()=>{void model.current?.poll()},2000)
    return ()=>clearTimeout(timer)
  },[active,view.busy,view.loading,view.pendingSubmit,view.pendingMutation,view.pendingHumanResponse,view.detail,view.error])
  const eligible=agents.filter(agent=>readyAutonomousModel(agent,connections)&&readyAgentHttpTools(agent,tools)&&
    (!agent.spec.mcp_tools?.length||mcpEnabled)&&readyAgentMcpTools(agent,mcps.connections)),chosen=eligible.find(agent=>agent.id===agentId)
  const locked=view.busy||view.loading||Boolean(view.pendingSubmit)||Boolean(view.pendingMutation)||Boolean(view.pendingHumanResponse)
  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    if(!active||!enabled||view.busy||view.pendingMutation||view.pendingHumanResponse||!view.pendingSubmit&&!chosen)return
    const controller=model.current
    if(!controller)return
    await controller.submit({agentId,revision:chosen?.revision??0,instruction,maxSteps,...(humanAvailable&&planReview!=="inherit"?{requirePlanReview:planReview==="required"}:{})})
    if(model.current===controller&&!controller.snapshot().pendingSubmit&&controller.snapshot().notice)setInstruction("")
  }
  return <section aria-label="多轮 Agent" className="space-y-5">
    {view.error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{view.error}</p>}
    {view.notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{view.notice}</p>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Play size={18} aria-hidden="true"/>新建多轮任务</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Agent 可根据工具结果继续规划，最多进行 30 轮模型调用。每个步骤都需要你核对并批准。</p>
      <button type="button" className={autonomousSecondary} disabled={!active||locked||mcps.loading} onClick={()=>void mcps.load()}>读取本人 MCP 连接核对运行权限</button>
      {mcps.error&&<p role="alert" className="text-sm text-rose-800">{mcps.error}</p>}
      {!mcpEnabled&&agents.some(agent=>agent.spec.mcp_tools?.length)&&<p className="mt-2 text-sm text-amber-900">当前环境未开放 MCP 调用；已绑定 MCP 的角色暂不能提交或批准新步骤。</p>}
      {!enabled&&<p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">当前环境未开放多轮任务提交和审批。已有记录仍可查看，允许取消的任务可取消。</p>}
      {enabled&&!eligible.length&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">请先为 Agent 绑定已测试、已启用的本人模型连接，并核对 HTTP 工具连接及其版本。</p>}
      <form onSubmit={submit} className="mt-4 space-y-3">
        <fieldset disabled={!enabled||locked} className="space-y-3">
          <legend className="sr-only">新建多轮任务字段</legend>
          <label className="block text-sm font-medium">多轮 Agent 角色
            <select required aria-label="多轮 Agent 角色" className={field} value={view.pendingSubmit?.agentId??agentId} onChange={event=>setAgentId(event.target.value)}>
              <option value="">请选择</option>{eligible.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.spec.model_binding?.model_id}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">多轮任务要求
            <textarea required aria-label="多轮任务要求" rows={4} maxLength={2000} className={field} value={view.pendingSubmit?.instruction??instruction}
              onChange={event=>setInstruction(event.target.value)} placeholder="描述任务、期望结果及需要遵守的边界"/>
          </label>
          <label className="block text-sm font-medium">最多规划轮数
            <select aria-label="最多规划轮数" className={field} value={view.pendingSubmit?.maxSteps??maxSteps} onChange={event=>setMaxSteps(Number(event.target.value))}>
              {Array.from({length:30},(_,index)=>index+1).map(round=><option key={round} value={round}>{round} 轮</option>)}
            </select>
          </label>
          {humanAvailable&&<label className="block text-sm font-medium">本次方案审核
            <select aria-label="本次方案审核" className={field} value={view.pendingSubmit?(view.pendingSubmit.requirePlanReview===undefined?"inherit":view.pendingSubmit.requirePlanReview?"required":"off"):planReview} onChange={event=>setPlanReview(event.target.value)}>
              <option value="inherit">沿用角色设置{chosen?(chosen.spec.require_plan_review?"（需审核）":"（无需审核）"):""}</option>
              <option value="required">需要我审核方案</option><option value="off">本次无需方案审核</option>
            </select>
          </label>}
        </fieldset>
        {view.pendingSubmit&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">上次提交结果尚未确认。角色、任务和轮数已保留，确认时会使用原请求。</p>}
        <button type="submit" className={autonomousButton} disabled={!active||!enabled||view.busy||view.loading||Boolean(view.pendingMutation)||Boolean(view.pendingHumanResponse)||!view.pendingSubmit&&(!chosen||!instruction.trim())}>
          {view.busy?<Loader2 size={16} className="animate-spin" aria-hidden="true"/>:<Play size={16} aria-hidden="true"/>}
          {view.pendingSubmit?"确认上次多轮提交":"提交多轮任务"}
        </button>
      </form>
    </div>
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">我的多轮任务</h2>
        <button type="button" className={autonomousSecondary} disabled={!active||view.busy||view.loading} onClick={()=>void model.current?.refresh()}>
          <RefreshCcw size={15} aria-hidden="true"/>刷新多轮任务
        </button>
      </div>
      {view.loading&&<p role="status" className="text-sm text-slate-500">读取任务中…</p>}
      {!view.loading&&!view.runs.length&&<p className="py-3 text-sm text-slate-500">暂无多轮任务</p>}
      {view.runs.map(run=><button type="button" key={run.id} disabled={view.busy||view.loading||Boolean(view.pendingMutation)||Boolean(view.pendingHumanResponse)} aria-pressed={view.detail?.run.id===run.id}
        className={"flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm disabled:opacity-50 "+(view.detail?.run.id===run.id?"border-indigo-300 bg-indigo-50":"border-slate-100 hover:bg-slate-50")}
        onClick={()=>void model.current?.select(run.id)}><span className="min-w-0 truncate">{run.instruction_preview||"多轮任务"}</span>
        <span className="shrink-0 text-xs">{autonomousStates[run.status]??"状态未知"}</span>
      </button>)}
    </div>
    <PgNativeAgentHumanInputPanel detail={view.detail} pendingResponse={view.pendingHumanResponse} active={active} enabled={enabled&&humanEnabled} locked={view.busy||view.loading||Boolean(view.pendingSubmit)||Boolean(view.pendingMutation)}
      onRespond={(decision,answer,confirmed)=>{if(active&&enabled&&humanEnabled)void model.current?.respond(decision,answer,confirmed)}}
      onConfirm={()=>{if(active)void model.current?.retryHumanResponse()}}/>
    <PgNativeAutonomousAgentDetail key={view.detail?.run.id??"none"} view={view} agents={agents} connections={connections} toolConnections={tools} mcpConnections={mcps.connections} mcpEnabled={mcpEnabled} enabled={active&&enabled}
      onDecision={(value,consent,fee)=>{if(active&&enabled)void model.current?.decide(value,consent,fee)}}
      onRetry={()=>{if(active&&(enabled||view.pendingMutation?.kind==="cancel"))void model.current?.retryMutation()}}
      onCancel={()=>{if(active)void model.current?.cancel()}}/>
  </section>
}
