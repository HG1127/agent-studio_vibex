import {useEffect,useRef,useState} from "react"
import type {createPgNativePilotApi,WorkflowLatestOutputs,WorkflowHistoricalNodeOutput} from "@/lib/pgNativePilotApi"
import {createPgNativeWorkflowOutputSession,emptyWorkflowOutputView} from "@/lib/pgNativeWorkflowOutputSession"
import {workflowNodeNames} from "@/lib/pgNativeWorkflowGraph"
import {workflowSecondary} from "./PgNativeWorkflowNodeForm"
const states:Record<string,string>={pending:"未开始",active:"进行中",waiting:"等待结果或确认",done:"已完成",skipped:"未执行",failed:"失败"}
export function WorkflowOutputSnapshot({latest,history,historyLoaded,total,nextAfter,historyBusy,active,onHistory}:{latest:WorkflowLatestOutputs;history:WorkflowHistoricalNodeOutput[];historyLoaded:boolean;total:number;nextAfter:string|null;historyBusy:boolean;active:boolean;onHistory:()=>void}){
  const path=(loops:{node_id:string;round:number;total:number}[]|undefined)=>loops?.map(loop=>(latest.nodes.find(node=>node.node_id===loop.node_id)?.title??"循环")+"：第 "+loop.round+" / "+loop.total+" 轮").join(" → ")
  return <div className="space-y-3 text-sm">
    <p className="break-words text-slate-500">保存修订 {latest.run.workflow_revision} · 读取到的运行状态：{latest.run.status==="succeeded"?"已完成":latest.run.status==="cancelled"?"已取消":latest.run.status==="failed"?"失败":"尚未完成"}</p>
    {latest.run.node_debug_id&&<p className="text-amber-800">这是一条单模型测试记录，仅有目标模型的结果可复用。</p>}
    <details className="rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer font-medium">历史任务指令</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{latest.run.instruction||"（空任务样本）"}</p></details>
    <p className="text-xs leading-5 text-slate-500">显示已保存的业务输出，每步最多 {latest.run.max_output_chars} 字符。Agent 仅展示最终答复。循环当前状态与各轮记录分别列出。</p>
    <ol className="space-y-3" aria-label="最近节点输出">{latest.nodes.map(node=><li key={node.node_id} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words font-medium">{node.title} · {workflowNodeNames[node.node_type]}</span><span className="text-xs text-slate-500">{states[node.node_status]}</span></div>
      {node.loop_path&&<p className="break-words text-xs text-slate-500">{path(node.loop_path)}</p>}
      {node.output_text!==undefined?<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans leading-6">{node.output_text||"（已保存空输出）"}</pre>:<p className="text-xs text-slate-400">此状态下没有已保存输出。</p>}
    </li>)}</ol>
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <h5 className="font-medium">逐步输出历史{historyLoaded?` · 已加载 ${history.length} / ${total}`:""}</h5>
      <p className="text-xs leading-5 text-slate-500">按步骤编号排列，保留循环各轮的独立结果。记录变化时需要重新读取，避免混用不同执行进度。</p>
      {!!history.length&&<ol className="space-y-3" aria-label="逐步输出历史">{history.map(step=><li key={step.step_key} className="space-y-2 rounded-xl bg-slate-50 p-3">
        <p className="break-words font-medium">{step.title} · {step.status==="skipped"?"未执行":"已完成"}{step.branch?" · "+(step.branch==="true"?"满足":"不满足"):""}</p>
        {step.loop_path&&<p className="break-words text-xs text-slate-500">{path(step.loop_path)}</p>}
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans leading-6">{step.output_text||"（已保存空输出）"}</pre>
        <p className="break-all text-xs text-slate-400">步骤 {step.step_key}</p>
      </li>)}</ol>}
      {historyLoaded&&!history.length&&<p className="text-slate-500">暂无已保存的步骤输出。</p>}
      {(!historyLoaded||nextAfter)&&<button type="button" className={workflowSecondary} disabled={!active||historyBusy} onClick={onHistory}>{historyBusy?"读取中…":historyLoaded?"加载后续输出":"查看逐步输出历史"}</button>}
    </div>
  </div>
}
export default function PgNativeWorkflowRunOutputs({api,runId,workflowId,active,onExpired,onSnapshot}:{api:ReturnType<typeof createPgNativePilotApi>;runId:string;workflowId:string;active:boolean;onExpired:()=>void;onSnapshot?:(source:WorkflowLatestOutputs|null)=>void}){
  const [view,setView]=useState(emptyWorkflowOutputView),model=useRef<ReturnType<typeof createPgNativeWorkflowOutputSession>|null>(null),snapshot=useRef(onSnapshot)
  snapshot.current=onSnapshot
  useEffect(()=>{
    const session=createPgNativeWorkflowOutputSession(api,runId,workflowId,onExpired);model.current=session
    const emit=()=>{const next=session.snapshot();setView(next);snapshot.current?.(!next.busy&&!next.error?next.latest:null)}
    const unsubscribe=session.subscribe(emit);emit()
    return ()=>{unsubscribe();session.dispose();snapshot.current?.(null);if(model.current===session)model.current=null}
  },[api,runId,workflowId,onExpired])
  useEffect(()=>{model.current?.setActive(active)},[api,runId,workflowId,onExpired,active])
  return <section aria-label="已保存节点输出" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">已保存节点输出</h4>
      <button type="button" className={workflowSecondary} disabled={!active||view.busy||view.historyBusy} onClick={()=>void model.current?.latest()}>{view.busy?"读取中…":view.latest?"刷新节点输出":"读取节点输出"}</button></div>
    {view.error&&<p role="alert" className="text-sm text-rose-700">{view.error}</p>}
    {view.latest&&<WorkflowOutputSnapshot latest={view.latest} history={view.history} historyLoaded={view.historyLoaded} total={view.total} nextAfter={view.nextAfter}
      historyBusy={view.historyBusy} active={active&&!view.busy} onHistory={()=>void model.current?.history()}/>}
  </section>
}
