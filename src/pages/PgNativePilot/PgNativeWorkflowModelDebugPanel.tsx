import {useEffect,useRef,useState} from "react"
import type {createPgNativePilotApi,WorkflowLatestOutputs} from "@/lib/pgNativePilotApi"
import {createPgNativeWorkflowDebugSession,emptyWorkflowDebugView,type WorkflowDebugDraft} from "@/lib/pgNativeWorkflowDebugSession"
import {workflowButton,workflowSecondary} from "./PgNativeWorkflowNodeForm"
import PgNativeWorkflowRunDetail from "./PgNativeWorkflowRunDetail"
type Controller=ReturnType<typeof createPgNativeWorkflowDebugSession>
export default function PgNativeWorkflowModelDebugPanel({api,draft,active,enabled,onExpired,source=null}:{api:ReturnType<typeof createPgNativePilotApi>;draft:WorkflowDebugDraft|null;active:boolean;enabled:boolean;onExpired:()=>void;source?:WorkflowLatestOutputs|null}){
  const [view,setView]=useState(emptyWorkflowDebugView),controller=useRef<Controller|null>(null)
  useEffect(()=>{
    const session=createPgNativeWorkflowDebugSession(api,{onExpired});controller.current=session;setView(session.snapshot())
    const unsubscribe=session.subscribe(()=>setView(session.snapshot()))
    return ()=>{unsubscribe();session.dispose();if(controller.current===session)controller.current=null}
  },[api,onExpired])
  useEffect(()=>{controller.current?.setActive(active)},[api,onExpired,active])
  useEffect(()=>{
    if(!active||view.busy||view.loading||view.pendingSubmit||view.pendingMutation||view.error||!["queued","running"].includes(view.detail?.run.status??""))return
    const timer=setTimeout(()=>{void controller.current?.poll()},2000);return ()=>clearTimeout(timer)
  },[active,view.busy,view.loading,view.pendingSubmit,view.pendingMutation,view.error,view.detail])
  const locked=view.busy||view.loading||Boolean(view.pendingMutation),target=active?(view.pendingSubmit??draft):null
  const origin=target?.samples.provenance,sourceCurrent=origin?.kind!=="history"||Boolean(source&&source.run.run_id===origin.run_id&&source.run.output_version===origin.output_version)
  return <section aria-label="单模型节点测试" className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-4 sm:p-5">
    <h3 className="font-semibold">单模型节点测试</h3>
    <p className="text-sm leading-6 text-slate-500">从已保存节点的本地预览准备样本，再提交测试。任务会保留记录；模型调用仍需逐步确认费用。切换节点或工作台不会改变未确认请求。</p>
    {view.error&&<p role="alert" className="break-words text-sm text-rose-700">{view.error}</p>}
    {view.notice&&<p role="status" className="text-sm text-emerald-800">{view.notice}</p>}
    {target?<div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
      <p className="break-words">{target.workflowName?target.workflowName+" · ":""}节点 {target.nodeTitle??target.nodeId} · 已保存修订 {target.revision}</p>
      {sourceCurrent?<p className="whitespace-pre-wrap break-words">模拟任务：{target.samples.input||"（空任务样本）"}</p>:<p className="text-amber-800">历史样本需重新读取来源。内容已隐藏；未确认的提交可用原请求核对，服务器会重新校验来源。</p>}
      {view.pendingSubmit&&<p className="text-amber-800">上次提交结果尚未确认，节点、修订和样本已冻结。</p>}
      <button type="button" className={workflowButton} disabled={!active||!enabled||locked||!sourceCurrent&&!view.pendingSubmit} onClick={()=>{if(target&&active&&enabled)void controller.current?.submit(target)}}>
        {view.pendingSubmit?"确认上次单模型测试":"提交单模型节点测试"}</button>
    </div>:<p className="text-sm text-slate-500">请在模型节点的本地预览中准备测试样本。</p>}
    {!enabled&&<p className="text-sm text-amber-800">当前环境未开放单模型节点测试及审批，已有记录仍可查看和安全取消。</p>}
    <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">本人单模型测试记录</h4>
      <button type="button" className={workflowSecondary} disabled={!active||view.busy||view.loading} onClick={()=>void controller.current?.refresh()}>刷新单模型测试</button></div>
      {view.runs.map(run=><button key={run.id} type="button" className="flex min-h-10 w-full flex-wrap justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left text-sm" aria-pressed={view.detail?.run.id===run.id}
        disabled={!active||locked||Boolean(view.pendingSubmit)} onClick={()=>void controller.current?.select(run.id)}><span className="min-w-0 break-words">{run.instruction_preview||"单模型节点测试"}</span><span className="text-xs text-slate-500">节点 {run.debug_node_id}</span></button>)}
    </div>
    <PgNativeWorkflowRunDetail key={view.detail?.run.id??"empty"} view={view} api={api} active={active} enabled={active&&enabled} onExpired={onExpired}
      onDecision={(decision,consent)=>{if(active&&enabled)void controller.current?.decide(decision,consent)}}
      onRetry={()=>{if(active&&(enabled||view.pendingMutation?.kind==="cancel"))void controller.current?.retryMutation()}}
      onCancel={()=>{if(active)void controller.current?.cancel()}}/>
  </section>
}
