import {useEffect,useState} from "react"
import {usesPaidKnowledge} from "@/lib/pgNativeKnowledgeTool"
import PgNativeKnowledgeToolCharge from "./PgNativeKnowledgeToolCharge"
import {ShieldCheck} from "lucide-react"
import type {PgNativeAgent,PgNativeModelConnection,PgNativeToolConnection,PgNativeMcpConnection} from "@/lib/pgNativePilotApi"
import {autonomousApprovalReady,autonomousReview,readyAutonomousModel,type AutonomousView} from "@/lib/pgNativeAutonomousAgentSession"
export const autonomousStates:Record<string,string>={queued:"排队中",running:"处理中",awaiting_approval:"等待审批",paused:"已暂停",succeeded:"已完成",failed:"失败",cancelled:"已取消",skipped:"已跳过"}
export const autonomousButton="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
export const autonomousSecondary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
const tools:Record<string,string>={calculate:"计算",summarize:"摘要",knowledge_search:"知识库检索",web_fetch:"读取网页",web_search:"网页搜索"}
export default function PgNativeAutonomousAgentDetail({view,agents,connections,toolConnections=[],mcpConnections=[],mcpEnabled=false,enabled,onDecision,onRetry,onCancel}:{
  view:AutonomousView;agents:PgNativeAgent[];connections:PgNativeModelConnection[];toolConnections?:PgNativeToolConnection[];mcpConnections?:PgNativeMcpConnection[];mcpEnabled?:boolean;enabled:boolean;
  onDecision:(value:"approved"|"rejected",consent:boolean,knowledgeConsent?:boolean)=>void;onRetry:()=>void;onCancel:()=>void
}){
  const [consent,setConsent]=useState("")
  const [feeConsent,setFeeConsent]=useState("")
  const [cancelFor,setCancelFor]=useState("")
  const detail=view.detail,pending=detail?.pending_effect,mutation=view.pendingMutation
  const feeScope=detail?.run.id+":"+pending?.step_key+":"+pending?.input_sha256+":"+JSON.stringify(detail?.knowledge??null)
  useEffect(()=>{setFeeConsent("");setConsent("")},[feeScope,enabled])
  if(!detail)return null
  const current=pending?detail.run.id+":"+pending.step_key+":"+pending.input_sha256:""
  const approvedReady=autonomousApprovalReady(detail,agents,connections,toolConnections,mcpConnections,mcpEnabled)
  const role=agents.find(a=>a.id===detail.run.agent_spec_id),model=readyAutonomousModel(role,connections)
  const review=pending?autonomousReview(pending,detail.knowledge):null
  const paid=usesPaidKnowledge(pending)
  const http=pending?.configuration.tool_binding as {connection_id?:string}|undefined
  const connection=http?toolConnections.find(tool=>tool.id===http.connection_id):undefined
  const mcp=pending?.configuration.mcp_binding as {connection_id?:string}|undefined
  const mcpConnection=mcp?mcpConnections.find(row=>row.id===mcp.connection_id):undefined
  const locked=view.busy||view.loading||Boolean(view.pendingSubmit)||Boolean(mutation)
  return <article aria-label="多轮任务详情" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <h3 className="font-semibold">多轮任务 · {autonomousStates[detail.run.status]??"状态未知"}</h3>
    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{detail.run.instruction}</p>
    <p className="text-xs text-slate-500">最多 {Number(detail.run.checkpoint.max_steps)||"—"} 轮模型规划，每轮工具操作单独审批。</p>
    {detail.run.status==="queued"&&<p role="status" className="text-sm text-slate-500">任务已排队，等待后台处理。可刷新查看进度。</p>}
    {detail.run.status==="paused"&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">执行结果需要管理员核对，任务已暂停。请勿重复提交或重放操作。</p>}
    {detail.run.status==="failed"&&<p role="status" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
      {detail.run.last_error_code==="workflow_agent_max_steps"?"已达到本次任务的轮数上限，请核对已有结果后调整任务。":"本次任务未能完成，请核对配置和执行记录。"}
    </p>}
    {mutation&&<div role="status" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <p>上次{mutation.kind==="cancel"?"取消":mutation.decision==="approved"?"批准":"拒绝"}结果尚未确认。请刷新状态，或确认原来的同一步操作。</p>
      {mutation.kind==="decision"&&mutation.knowledge_query_charge&&<p>原请求已包含本次语义查询的费用确认；再次确认会核对原步骤，不会扩大授权范围。</p>}
      <button type="button" className={autonomousSecondary} disabled={view.busy||view.loading||mutation.kind==="decision"&&!enabled} onClick={onRetry}>
        确认上次{mutation.kind==="cancel"?"取消":mutation.decision==="approved"?"批准":"拒绝"}
      </button>
    </div>}
    {detail.run.status==="awaiting_approval"&&pending&&review&&!mutation&&<section aria-label="当前步骤审批" className="space-y-3 rounded-xl bg-amber-50 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} aria-hidden="true"/>
        {pending.agent_context?`第 ${pending.agent_context.round} 轮 · `:""}{review.title}
        {pending.kind==="tool"?` · ${tools[String(pending.configuration.tool)]??"工具"}`:""}
      </h4>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-sans text-sm leading-6">{review.text}</pre>
      {model&&<p className="break-words text-sm">绑定模型：{model.name} · {role?.spec.model_binding?.model_id}</p>}
      {pending.kind==="agent"&&<p className="text-sm leading-6">启动后，每次模型调用和工具操作都会再次请求审批。未批准的步骤不会执行。</p>}
      {pending.kind==="agent"&&approvedReady&&role&&<div className="space-y-1 text-sm leading-6">
        <p className="whitespace-pre-wrap break-words">角色目标：{role.spec.goal}</p>
        <p className="whitespace-pre-wrap break-words">任务边界：{role.spec.task_scope||"按当前角色配置执行"}</p>
        <p>授权工具：{role.spec.tools?.length?role.spec.tools.map(tool=>tools[tool]??role.spec.http_tools?.find(item=>item.name===tool)?.description??role.spec.mcp_tools?.find(item=>item.name===tool)?.tool_name??tool).join("、"):"无"}；已绑定 {role.spec.knowledge_base_ids?.length??0} 个知识库。</p>
      </div>}
      {connection&&<p className="break-words text-sm leading-6">HTTP 连接：{connection.name} · {connection.method} {connection.url} · 版本 {connection.revision}</p>}
      {mcpConnection&&<p className="break-words text-sm leading-6">MCP 连接：{mcpConnection.name} · {mcpConnection.url} · 版本 {mcpConnection.revision}</p>}
      {!approvedReady&&<p className="text-sm leading-6 text-amber-900">角色或模型配置已变化，请先刷新并核对配置。仍可拒绝当前步骤。</p>}
      {!enabled&&<p className="text-sm">当前环境未开放任务审批，可继续查看记录。</p>}
      <label className="flex items-start gap-2 text-sm leading-6">
        <input type="checkbox" className="mt-1.5" disabled={locked||!enabled||!approvedReady} checked={consent===current}
          onChange={event=>setConsent(event.target.checked?current:"")}/>
        {review.charged&&!paid?"我已核对本次模型调用，确认可能产生费用。":"我已核对当前步骤及其数据范围，允许本次操作。"}
      </label>
      {paid&&<PgNativeKnowledgeToolCharge checked={feeConsent===feeScope} disabled={locked||!enabled||!approvedReady} onChange={value=>setFeeConsent(value?feeScope:"")}/>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={autonomousButton} disabled={locked||!enabled||!approvedReady||consent!==current||paid&&feeConsent!==feeScope} onClick={()=>onDecision("approved",consent===current,paid&&feeConsent===feeScope)}>批准当前步骤</button>
        <button type="button" className={autonomousSecondary} disabled={locked||!enabled} onClick={()=>onDecision("rejected",false)}>拒绝当前步骤</button>
      </div>
    </section>}
    <section aria-label="多轮执行进度" className="space-y-2">
      <h4 className="text-sm font-semibold">执行进度</h4>
      {!detail.steps.length&&<p className="text-sm text-slate-500">等待准备任务</p>}
      <ol className="space-y-2">{detail.steps.map(step=>{
        const phase=step.metadata.agent_phase,type=step.metadata.node_type
        const title=phase==="model"?"模型调用":phase==="tool"?"工具操作":type==="start"?"开始":type==="end"?"汇总结果":"Agent 任务"
        return <li key={step.step_key} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <span>{phase?`第 ${Number(step.metadata.agent_round)} 轮 · `:""}{title}</span><span>{autonomousStates[step.status]??"等待中"}</span>
        </li>
      })}</ol>
    </section>
    {detail.run.result_text&&<section aria-label="多轮执行结果"><h4 className="mb-2 text-sm font-semibold">执行结果</h4>
      <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6">{detail.run.result_text}</pre>
    </section>}
    {!["succeeded","failed","cancelled"].includes(detail.run.status)&&<div className="space-y-2">
      <button type="button" className={autonomousSecondary} disabled={locked} onClick={()=>setCancelFor(detail.run.id)}>取消任务</button>
      {cancelFor===detail.run.id&&<div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm" role="group" aria-label="确认取消任务">
        <p>确认取消此任务？已发生或结果待核对的操作不能撤回，系统会核验是否可以取消。</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={autonomousSecondary} disabled={locked} onClick={()=>{setCancelFor("");onCancel()}}>确认取消此任务</button>
          <button type="button" className={autonomousSecondary} disabled={locked} onClick={()=>setCancelFor("")}>保留任务</button></div>
      </div>}
    </div>}
    <p className="break-all text-xs text-slate-400">任务编号：{detail.run.id}</p>
  </article>
}
