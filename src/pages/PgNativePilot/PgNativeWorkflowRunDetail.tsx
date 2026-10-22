import {useEffect,useRef,useState} from "react"
import {PgNativePilotError,type createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {workflowApprovalReady,workflowStepReview,type WorkflowRunView} from "@/lib/pgNativeWorkflowRunSession"
import {workflowButton,workflowSecondary} from "./PgNativeWorkflowNodeForm"
import {autonomousStates} from "./PgNativeAutonomousAgentDetail"
import PgNativeWorkflowRunOutputs from "./PgNativeWorkflowRunOutputs"
type Api=ReturnType<typeof createPgNativePilotApi>
export default function PgNativeWorkflowRunDetail({view,enabled,active,onDecision,onRetry,onCancel,api,onExpired}:{
  view:Pick<WorkflowRunView,"detail"|"busy"|"loading"|"pendingMutation">&{pendingSubmit:object|null};enabled:boolean;active:boolean;api:Api;onDecision:(value:"approved"|"rejected",consent:boolean)=>void;onRetry:()=>void;onCancel:()=>void;onExpired:()=>void
}){
  const [consent,setConsent]=useState(""),[cancelFor,setCancelFor]=useState("")
  const detail=view.detail,pending=detail?.pending_effect,mutation=view.pendingMutation
  if(!detail)return null
  const step=pending?detail.run.id+":"+pending.step_key+":"+pending.input_sha256:"",review=pending?workflowStepReview(pending):null
  const ready=workflowApprovalReady(detail),locked=view.busy||view.loading||Boolean(view.pendingSubmit)||Boolean(mutation)
  const loops=Array.isArray(detail.run.checkpoint.loop_progress)?detail.run.checkpoint.loop_progress as Array<{id:string;round:number;total:number}>:[]
  return <article aria-label="Workflow 运行详情" className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5">
    <h3 className="font-semibold">{detail.run.checkpoint.node_debug?"单模型节点测试":"工作流任务"} · {autonomousStates[detail.run.status]??"状态未知"}</h3>
    {Boolean(detail.run.checkpoint.node_debug)&&<p className="text-sm leading-6 text-slate-600">仅测试已保存的选定模型节点，最多请求 512 个输出 token；上游结果来自手工样本，其他模型、工具和 Agent 节点不会执行。</p>}
    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{detail.run.instruction}</p>
    {detail.run.status==="queued"&&<p role="status" className="text-sm text-slate-500">工作流已排队，等待后台处理。</p>}
    {detail.run.status==="paused"&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">执行结果需要管理员核对，任务已暂停。请勿重新提交或重放已有操作。</p>}
    {detail.run.status==="failed"&&<p role="status" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">工作流未能完成，请核对配置和步骤记录。</p>}
    {mutation&&<div role="status" className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm">
      <p>上次{mutation.kind==="cancel"?"取消":mutation.decision==="approved"?"批准":"拒绝"}结果尚未确认。可以刷新状态，或确认原来的同一步操作。</p>
      <button type="button" className={workflowSecondary} disabled={!active||view.busy||view.loading||mutation.kind==="decision"&&!enabled} onClick={onRetry}>
        确认上次{mutation.kind==="cancel"?"取消":mutation.decision==="approved"?"批准":"拒绝"}
      </button>
    </div>}
    {detail.run.status==="awaiting_approval"&&pending&&review&&!mutation&&<section aria-label="Workflow 当前步骤审批" className="space-y-3 rounded-xl bg-amber-50 p-4">
      <h4 className="text-sm font-semibold">{String(pending.configuration.title??"当前节点")} · {pending.agent_context?`第 ${pending.agent_context.round} 轮 · `:""}{review.title}</h4>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-sans text-sm leading-6">{review.text}</pre>
      {detail.review?.model&&<p className="break-words text-sm">模型连接：{detail.review.model.name}</p>}
      {detail.review?.agent&&<p className="break-words text-sm">Agent 方案：{detail.review.agent.name} · 当前修订 {detail.review.agent.revision}</p>}
      {detail.review?.tool&&<p className="break-words text-sm leading-6">HTTP 连接：{detail.review.tool.name} · {detail.review.tool.method} {detail.review.tool.url}</p>}
      {pending.kind==="agent"&&<p className="text-sm leading-6">此步骤启动已绑定的 Agent，后续模型调用和工具操作仍会逐一请求审批。</p>}
      {!ready&&<p className="text-sm leading-6 text-amber-900">工作流或绑定资源的版本暂时不可用，请刷新核对；仍可拒绝当前步骤。</p>}
      {!enabled&&<p className="text-sm text-amber-900">当前环境未开放工作流审批，可继续查看记录。</p>}
      <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={consent===step} disabled={!enabled||!ready||locked}
        onChange={event=>setConsent(event.target.checked?step:"")}/>{review.charged?"我已核对本次模型调用，确认可能产生费用。":"我已核对本次操作及其数据发送范围，允许执行。"}</label>
      <div className="flex flex-wrap gap-2"><button type="button" className={workflowButton} disabled={!enabled||!ready||locked||consent!==step} onClick={()=>onDecision("approved",consent===step)}>批准工作流当前步骤</button>
        <button type="button" className={workflowSecondary} disabled={!enabled||locked} onClick={()=>onDecision("rejected",false)}>拒绝工作流当前步骤</button></div>
    </section>}
    {!!loops.length&&<div className="space-y-1 text-sm text-slate-600" aria-label="循环进度">{loops.map((loop,index)=><p key={loop.id}>循环 {index+1}：第 {Number(loop.round)||0} / {Number(loop.total)||0} 轮</p>)}</div>}
    <WorkflowSteps key={detail.run.id+":"+detail.run.updated_at} api={api} runId={detail.run.id} initial={detail.steps} total={detail.run.step_count} active={active} onExpired={onExpired}/>
    {detail.run.result_text&&<section aria-label="Workflow 执行结果"><h4 className="mb-2 text-sm font-semibold">执行结果</h4>
      <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6">{detail.run.result_text}</pre></section>}
    <PgNativeWorkflowRunOutputs key={detail.run.id+":"+detail.run.updated_at} api={api} runId={detail.run.id} workflowId={detail.run.workflow_id} active={active} onExpired={onExpired}/>
    {!["succeeded","failed","cancelled"].includes(detail.run.status)&&<div className="space-y-2">
      <button type="button" className={workflowSecondary} disabled={!active||locked} onClick={()=>setCancelFor(detail.run.id)}>取消工作流任务</button>
      {cancelFor===detail.run.id&&<div role="group" aria-label="确认取消工作流" className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
        <p>确认取消？已开始或结果待核对的外部操作不能撤回，系统会先检查是否可以取消。</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={workflowSecondary} disabled={!active||locked} onClick={()=>{setCancelFor("");onCancel()}}>确认取消此工作流任务</button>
          <button type="button" className={workflowSecondary} onClick={()=>setCancelFor("")}>保留工作流任务</button></div>
      </div>}
    </div>}
    <p className="break-all text-xs text-slate-400">任务编号：{detail.run.id}</p>
  </article>
}
function WorkflowSteps({api,runId,initial,total,active,onExpired}:{api:Api;runId:string;initial:Array<{step_key:string;status:string;metadata:Record<string,unknown>}>;total:number;active:boolean;onExpired:()=>void}){
  const [items,setItems]=useState(initial),[after,setAfter]=useState(initial.at(-1)?.step_key??""),[busy,setBusy]=useState(false),[error,setError]=useState("")
  const mounted=useRef(false),visible=useRef(active),flight=useRef(false)
  visible.current=active
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false}},[])
  return <section aria-label="Workflow 步骤进度" className="space-y-2">
    <h4 className="text-sm font-semibold">步骤进度 · 已加载 {items.length} / {total}</h4>
    <ol className="max-h-96 space-y-2 overflow-auto">{items.map(step=><li key={step.step_key} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
      <span>{step.metadata.agent_phase?`Agent 第 ${Number(step.metadata.agent_round)} 轮 · `:""}{step.metadata.node_type==="model"?"模型":step.metadata.node_type==="tool"?"工具":step.metadata.node_type==="condition"?"条件":step.metadata.node_type==="loop"?"循环":step.metadata.node_type==="agent"?"Agent":step.metadata.node_type==="end"?"结束":"开始"}</span>
      <span>{autonomousStates[step.status]??"等待中"}{step.metadata.branch?` · ${step.metadata.branch==="true"?"满足":"不满足"}`:""}</span>
    </li>)}</ol>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    {items.length<total&&<button type="button" disabled={!active||busy} className={workflowSecondary} onClick={()=>{void(async()=>{
      if(flight.current||!active)return;flight.current=true;setBusy(true);setError("")
      try{const page=await api.getWorkflowV2Steps(runId,after,100);if(!mounted.current||!visible.current)return
        setItems(current=>[...new Map([...current,...page.items].map(step=>[step.step_key,step])).values()]);setAfter(page.next_after??page.items.at(-1)?.step_key??after)
      }catch(error){if(mounted.current&&visible.current){if(error instanceof PgNativePilotError&&error.status===401)onExpired();else setError("暂时无法读取后续步骤，请重试。")}}
      finally{flight.current=false;if(mounted.current)setBusy(false)}
    })()}}>加载后续步骤</button>}
  </section>
}
