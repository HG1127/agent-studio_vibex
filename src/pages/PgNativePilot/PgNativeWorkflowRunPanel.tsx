import {useEffect,useRef,useState,type FormEvent} from "react"
import type {createPgNativePilotApi,PgNativeWorkflow} from "@/lib/pgNativePilotApi"
import {createPgNativeWorkflowRunSession,emptyWorkflowRunView} from "@/lib/pgNativeWorkflowRunSession"
import {editablePgWorkflowGraph,workflowExecutionIssues} from "@/lib/pgNativeWorkflowGraph"
import {workflowButton,workflowSecondary} from "./PgNativeWorkflowNodeForm"
import {autonomousStates} from "./PgNativeAutonomousAgentDetail"
import PgNativeWorkflowRunDetail from "./PgNativeWorkflowRunDetail"
import PgNativeAgentHumanInputPanel from "./PgNativeAgentHumanInputPanel"
import PgNativeAgentHumanHistoryPanel from "./PgNativeAgentHumanHistoryPanel"
import {watchPgNativeOriginalTaskController,createOwnTaskTargetDelivery,type OwnTaskRunTarget} from "@/lib/pgNativeOwnTaskNavigation"
type Controller=ReturnType<typeof createPgNativeWorkflowRunSession>
export default function PgNativeWorkflowRunPanel({api,workflows,active,enabled,humanEnabled=false,humanAvailable=false,target,onExpired,runTarget,onTargetSettled}:{
  api:ReturnType<typeof createPgNativePilotApi>;workflows:PgNativeWorkflow[];active:boolean;enabled:boolean;humanEnabled?:boolean;humanAvailable?:boolean;
  target:{id:string;revision:number;selection?:number}|null;onExpired:()=>void;runTarget?:OwnTaskRunTarget|null;onTargetSettled?:(selection:number,opened:boolean)=>void
}){
  const [view,setView]=useState(emptyWorkflowRunView),[selection,setSelection]=useState<{token:string;id:string}|null>(null),[instruction,setInstruction]=useState("")
  const model=useRef<Controller|null>(null)
  useEffect(()=>{
    const controller=createPgNativeWorkflowRunSession(api,{onExpired});model.current=controller;setView(controller.snapshot())
    const unsubscribe=controller.subscribe(()=>setView(controller.snapshot()))
    const unwatch=watchPgNativeOriginalTaskController(api,controller)
    return ()=>{unwatch();unsubscribe();controller.dispose();if(model.current===controller)model.current=null}
  },[api,onExpired])
  useEffect(()=>{model.current?.setActive(active)},[active,api,onExpired])
  const targetDelivery=useRef(createOwnTaskTargetDelivery())
  useEffect(()=>{
    const controller=model.current
    if(!active||!runTarget||!controller)return
    return targetDelivery.current.attach(controller,runTarget,()=>controller.selectOriginal(runTarget),opened=>{if(model.current===controller)onTargetSettled?.(runTarget.selection,opened)})
  },[active,runTarget,api,onExpired,onTargetSettled])
  useEffect(()=>{
    if(!active||view.busy||view.loading||view.pendingSubmit||view.pendingMutation||view.pendingHumanResponse||view.error||!["queued","running"].includes(view.detail?.run.status??""))return
    const timer=setTimeout(()=>{void model.current?.poll()},2000);return ()=>clearTimeout(timer)
  },[active,view.busy,view.loading,view.pendingSubmit,view.pendingMutation,view.pendingHumanResponse,view.detail,view.error])
  const token=target?target.id+":"+target.revision+":"+(target.selection??0):""
  const selectedId=selection?.token===token?selection.id:target?.id??"",selected=workflows.find(flow=>flow.id===selectedId)
  const ready=workflows.filter(flow=>{try{return flow.graph?.version===2&&!workflowExecutionIssues(editablePgWorkflowGraph(flow.graph)).length}catch{return false}})
  const eligible=ready.find(flow=>flow.id===selectedId)
  const targetChanged=Boolean(target&&selectedId===target.id&&selected?.revision!==target.revision)
  const locked=view.busy||view.loading||Boolean(view.pendingSubmit)||Boolean(view.pendingMutation)||Boolean(view.pendingHumanResponse)
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!active||!enabled||view.busy||view.pendingMutation||view.pendingHumanResponse||!view.pendingSubmit&&(!eligible||targetChanged))return
    const controller=model.current;if(!controller)return
    await controller.submit({workflowId:selectedId,revision:eligible?.revision??0,instruction})
    if(model.current===controller&&!controller.snapshot().pendingSubmit&&controller.snapshot().notice)setInstruction("")
  }
  return <section aria-label="Workflow 运行与审批" className="space-y-4">
    {view.error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{view.error}</p>}
    {view.notice&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{view.notice}</p>}
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">运行已保存的工作流</h2>
      <p className="text-sm leading-6 text-slate-500">提交任务后由后台处理，模型、工具和 Agent 节点会逐步请求审批。每次模型调用都可能产生费用。</p>
      {!enabled&&<p role="status" className="text-sm text-amber-800">当前环境未开放完整工作流运行与审批。已有记录仍可查看和安全取消。</p>}
      {targetChanged&&<p role="status" className="text-sm text-amber-800">刚才选择的工作流版本已变化，请返回画布重新核对保存版本。</p>}
      <form onSubmit={submit} className="space-y-3"><fieldset disabled={!enabled||locked} className="space-y-3"><legend className="sr-only">工作流任务要求</legend>
        <label className="block text-sm font-medium">运行工作流<select aria-label="运行工作流" className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" required value={selectedId} onChange={event=>setSelection({token,id:event.target.value})}>
          <option value="">请选择已保存并配置完整的本人工作流</option>{ready.map(flow=><option key={flow.id} value={flow.id}>{flow.name} · 修订 {flow.revision}</option>)}</select></label>
        <label className="block text-sm font-medium">工作流运行要求<textarea aria-label="工作流运行要求" className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" rows={4} required maxLength={2000} value={instruction} onChange={event=>setInstruction(event.target.value)}/></label>
      </fieldset>
        {view.pendingSubmit&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">上次任务提交尚未确认，工作流、版本和任务要求已保留。</p>}
        <button type="submit" className={workflowButton} disabled={!active||!enabled||view.busy||view.loading||Boolean(view.pendingMutation)||Boolean(view.pendingHumanResponse)||!view.pendingSubmit&&(!eligible||!instruction.trim()||targetChanged)}>
          {view.pendingSubmit?"确认上次工作流提交":"提交工作流任务"}</button>
      </form>
    </div>
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">我的工作流任务</h2>
      <button type="button" className={workflowSecondary} disabled={!active||view.busy||view.loading} onClick={()=>void model.current?.refresh()}>刷新工作流任务</button></div>
      {!view.loading&&!view.runs.length&&<p className="text-sm text-slate-500">暂无完整工作流任务</p>}
      {view.loading&&<p role="status" className="text-sm text-slate-500">读取任务中…</p>}
      {view.runs.map(run=><button type="button" className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left text-sm disabled:opacity-50" key={run.id}
        disabled={view.busy||view.loading||Boolean(view.pendingMutation)||Boolean(view.pendingHumanResponse)} aria-pressed={view.detail?.run.id===run.id} onClick={()=>void model.current?.select(run.id)}>
        <span className="min-w-0 truncate">{run.debug_node_id?"[单模型测试] ":""}{run.instruction_preview||"工作流任务"}</span><span className="shrink-0 text-xs">{autonomousStates[run.status]??"状态未知"}</span>
      </button>)}
    </div>
    <PgNativeAgentHumanInputPanel detail={view.detail} pendingResponse={view.pendingHumanResponse} active={active} enabled={enabled&&humanEnabled} locked={view.busy||view.loading||Boolean(view.pendingSubmit)||Boolean(view.pendingMutation)}
      onRespond={(decision,answer,confirmed)=>{if(active&&enabled&&humanEnabled)void model.current?.respond(decision,answer,confirmed)}}
      onConfirm={()=>{if(active)void model.current?.retryHumanResponse()}}/>
    {humanAvailable&&<PgNativeAgentHumanHistoryPanel api={api} runId={view.detail?.run.id??null} mode="workflow" active={active} onExpired={onExpired}/>}
    <PgNativeWorkflowRunDetail key={view.detail?.run.id??"none"} view={view} active={active} enabled={active&&enabled} api={api} onExpired={onExpired}
      onDecision={(value,consent,fee)=>{if(active&&enabled)void model.current?.decide(value,consent,fee)}}
      onRetry={()=>{if(active&&(enabled||view.pendingMutation?.kind==="cancel"))void model.current?.retryMutation()}}
      onCancel={()=>{if(active)void model.current?.cancel()}}/>
  </section>
}
