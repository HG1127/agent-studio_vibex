import {useRef,useState} from "react"
import {ClipboardCheck,RefreshCw,SearchCheck,ShieldAlert} from "lucide-react"
import {PgNativePilotError,
  type PgNativeWorkflow,type PgNativeWorkflowValidationResult,
  type PgNativeWorkflowSafeRunResult,
  createPgNativePilotApi} from "@/lib/pgNativePilotApi"
type Api=ReturnType<typeof createPgNativePilotApi>
const field="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
const button="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export default function PgNativeWorkflowValidationPanel({
  api,workflows,validationEnabled,executionEnabled,
}:{api:Api;workflows:PgNativeWorkflow[];validationEnabled:boolean;executionEnabled:boolean}){
  const [selected,setSelected]=useState("")
  const [lookup,setLookup]=useState("")
  const [result,setResult]=useState<PgNativeWorkflowValidationResult|null>(null)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState("")
  const pending=useRef<{workflow_id:string;revision:number;key:string}|null>(null)
  const [runLookup,setRunLookup]=useState("")
  const [runResult,setRunResult]=useState<PgNativeWorkflowSafeRunResult|null>(null)
  const [runBusy,setRunBusy]=useState(false)
  const [runMessage,setRunMessage]=useState("")
  const pendingRun=useRef<{workflow_id:string;revision:number;key:string}|null>(null)
  const workflow=workflows.find(w=>w.id===selected)
  const eligible=!!workflow&&workflow.graph?.version===undefined&&Array.isArray(workflow.graph?.nodes)&&
    workflow.graph.nodes.length>=2&&workflow.graph.nodes.every(node=>
      !!node&&typeof node==="object"&&"type" in node&&
      (node.type==="start"||node.type==="end"))
  const changeWorkflow=(id:string)=>{
    setSelected(id);setResult(null);setMessage("");pending.current=null
    setRunResult(null);setRunMessage("");pendingRun.current=null
  }
  const validate=async()=>{
    if(!workflow||!eligible||busy)return
    setBusy(true);setMessage("")
    const key=(pending.current?.workflow_id===workflow.id&&
      pending.current.revision===workflow.revision)
      ?pending.current.key:crypto.randomUUID().replaceAll("-","")
    pending.current={workflow_id:workflow.id,revision:workflow.revision,key}
    try{
      const next=await api.validateWorkflow(workflow.id,workflow.revision,key)
      setResult(next);setLookup(next.run.id)
      setMessage(next.replayed
        ?"已恢复之前的图验证记录；未重复创建运行。"
        :"已完成 Start/End 结构验证，节点步骤已保存。没有运行任何模型、工具或外部任务。")
      pending.current=null
    }catch(error){
      setMessage(error instanceof PgNativePilotError&&error.status===409
        ?"Workflow 版本已变化或包含未实现的执行节点。验证未写入任何运行结果。"
        :error instanceof PgNativePilotError&&error.status===404
          ?"该 Workflow 已被删除或不属于当前员工。"
          :"验证请求未完成，请检查连接。重新尝试会沿用相同幂等键，避免产生重复记录。")
    }finally{setBusy(false)}
  }
  const executeSafeRun=async()=>{
    if(!workflow||!eligible||runBusy)return
    setRunBusy(true);setRunMessage("")
    const key=(pendingRun.current?.workflow_id===workflow.id&&
      pendingRun.current.revision===workflow.revision)
      ?pendingRun.current.key:crypto.randomUUID().replaceAll("-","")
    pendingRun.current={workflow_id:workflow.id,revision:workflow.revision,key}
    try{
      const next=await api.submitWorkflowRun(workflow.id,workflow.revision,key)
      setRunResult(next);setRunLookup(next.run.id)
      setRunMessage(next.run.status==="succeeded"
        ?"安全运行已完成。"
        :"已将安全运行写入 PostgreSQL 队列；Worker 是否运行由独立服务状态决定。")
      pendingRun.current=null
    }catch(error){
      setRunMessage(error instanceof PgNativePilotError&&error.status===409
        ?"Workflow 版本发生变化或含有不支持的节点，任务未入队。"
        :error instanceof PgNativePilotError&&error.status===404
          ?"Workflow 不存在或不属于当前员工。"
          :"提交未确认。再次尝试会沿用同一幂等键，避免重复排队。")
    }finally{setRunBusy(false)}
  }
  const restoreSafeRun=async()=>{
    if(!uuid.test(runLookup)||runBusy)return
    setRunBusy(true);setRunMessage("")
    try{
      const restored=await api.getWorkflowRun(runLookup)
      setRunResult(restored)
      setRunMessage("已从 PostgreSQL 恢复安全运行状态。")
    }catch{setRunMessage("没有找到当前员工可查看的安全运行记录。")}
    finally{setRunBusy(false)}
  }
  const restore=async()=>{
    if(!uuid.test(lookup)||busy)return
    setBusy(true);setMessage("")
    try{
      const restored=await api.getWorkflowValidation(lookup)
      setResult(restored)
      setMessage("已从 PostgreSQL 恢复该验证记录。")
    }catch{
      setMessage("未找到当前员工可查看的验证记录。请检查运行 ID。")
    }finally{setBusy(false)}
  }
  return <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
    <h3 className="flex items-center gap-2 font-semibold">
      <ClipboardCheck size={18} className="text-indigo-600"/>
      Workflow 结构验证与安全运行（隔离 UAT）
    </h3>
    <p className="mt-2 text-xs leading-5 text-slate-600">
      支持结构验证，或提交受限的 Start/End 安全运行并持久化步骤。
      Worker 必须由独立服务启动；不会执行模型、Agent、工具、条件、循环或外部网络调用。
    </p>
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1 space-y-1 text-xs font-medium">
        选择 Workflow
        <select aria-label="选择验证 Workflow" className={field+" w-full"}
          value={selected} onChange={e=>changeWorkflow(e.target.value)}>
          <option value="">请选择本人 Workflow</option>
          {workflows.map(w=><option key={w.id} value={w.id}>
            {w.name} · 修订 {w.revision}
          </option>)}
        </select>
      </label>
      {validationEnabled&&<button type="button" className={button}
        onClick={()=>void validate()} disabled={!eligible||busy}>
        <SearchCheck size={16}/>{busy?"验证中…":"执行结构验证"}
      </button>}
    </div>
    {workflow&&!eligible&&<p className="mt-2 flex items-center gap-2 text-xs text-amber-700">
      <ShieldAlert size={14}/>当前工作流包含未支持的执行节点，或图结构不符合最小验证要求。
    </p>}
    {validationEnabled&&<div className="mt-4 flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1 space-y-1 text-xs font-medium">
        恢复已保存的验证运行 ID
        <input aria-label="验证运行 ID" className={field+" w-full"}
          maxLength={36} value={lookup} onChange={e=>setLookup(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
      </label>
      <button type="button" disabled={!uuid.test(lookup)||busy}
        onClick={()=>void restore()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50">
        <RefreshCw size={15}/>恢复记录
      </button>
    </div>}
    {message&&<p role="status" className="mt-3 text-xs text-slate-700">{message}</p>}
    {result&&<div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="font-medium text-sm">结构验证已持久化 · {result.steps.length} 个节点</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-500">
        Run ID: {result.run.id}
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {result.steps.map(step=><li key={step.step_key}
          className="flex items-center justify-between gap-2">
          <span>{step.metadata.node_id}（{step.metadata.node_type}）</span>
          <span className="text-emerald-700">已验证</span>
        </li>)}
      </ol>
      <p className="mt-3 text-xs text-amber-800">执行状态：仅结构验证。模型、工具和调度器均未启动。</p>
    </div>}
    {executionEnabled&&<section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <h4 className="font-semibold text-sm">PostgreSQL 安全 Workflow 运行</h4>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        只允许 Start/End 图节点。提交后写入 PostgreSQL 队列；必须另行启动经批准的 Workflow Worker 才会处理。
        不调用模型、工具、插件或外部网络。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={button} disabled={!eligible||runBusy}
          onClick={()=>void executeSafeRun()}>
          <ClipboardCheck size={15}/>{runBusy?"提交中…":"提交安全运行"}
        </button>
        <span className="text-xs text-slate-500">执行门禁由服务端控制</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-52 flex-1 space-y-1 text-xs font-medium">
          恢复安全运行 ID
          <input aria-label="安全运行 ID" className={field+" w-full"}
            maxLength={36} value={runLookup} onChange={e=>setRunLookup(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </label>
        <button type="button" disabled={!uuid.test(runLookup)||runBusy}
          onClick={()=>void restoreSafeRun()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">
          <RefreshCw size={15}/>恢复运行
        </button>
      </div>
      {runMessage&&<p role="status" className="mt-3 text-xs text-slate-700">{runMessage}</p>}
      {runResult&&<div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-sm font-medium">Run 状态：{runResult.run.status} · Queue：{runResult.job_status}</p>
        <p className="mt-1 break-all font-mono text-xs text-slate-500">Run ID: {runResult.run.id}</p>
        <p className="mt-2 text-xs text-slate-600">已提交步骤：{runResult.steps.length} · 外部副作用：无</p>
        {runResult.run.status==="queued"&&<p className="mt-2 text-xs text-amber-800">
          任务仍在队列中。不要通过打开页面或反复提交来启动 Worker。
        </p>}
        {runResult.run.status==="succeeded"&&<p className="mt-2 text-xs text-emerald-700">
          Start/End 节点运行完成，步骤和最终状态已持久化。
        </p>}
      </div>}
    </section>}
  </section>
}
