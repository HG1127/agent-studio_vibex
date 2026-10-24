import {useEffect,useRef,useState} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeWorkflowV2Summary,type WorkflowLatestOutputs} from "@/lib/pgNativePilotApi"
import {workflowSecondary} from "./PgNativeWorkflowNodeForm"
import PgNativeWorkflowRunOutputs from "./PgNativeWorkflowRunOutputs"
export default function PgNativeWorkflowSampleSource({api,workflowId,active,onExpired,onSnapshot}:{api:ReturnType<typeof createPgNativePilotApi>;workflowId:string;active:boolean;onExpired:()=>void;onSnapshot:(source:WorkflowLatestOutputs|null)=>void}){
  const [runs,setRuns]=useState<PgNativeWorkflowV2Summary[]>([]),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("")
  const reads=useRef(0),mounted=useRef(false),visible=useRef(active),snapshot=useRef(onSnapshot)
  visible.current=active
  snapshot.current=onSnapshot
  useEffect(()=>{mounted.current=true;++reads.current;setRuns([]);setSelected("");setBusy(false);setError("");snapshot.current(null)
    return ()=>{mounted.current=false;++reads.current}},[api,workflowId])
  useEffect(()=>{++reads.current;if(!active){setBusy(false);setRuns([]);setSelected("");snapshot.current(null)}},[active])
  const load=async()=>{
    if(!active||busy)return;const ticket=++reads.current;setBusy(true);setError("");setRuns([]);setSelected("");onSnapshot(null)
    try{const rows=await api.listWorkflowV2Runs(workflowId)
      if(!mounted.current||!visible.current||ticket!==reads.current)return
      if(!Array.isArray(rows))throw Error("invalid_output_source_history")
      const own=rows.filter(run=>run.workflow_id===workflowId&&typeof run.id==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(run.id)&&typeof run.instruction_preview==="string"&&typeof run.created_at==="string").slice(0,30)
      setRuns(own);setSelected(current=>own.some(run=>run.id===current)?current:"")
    }catch(cause){if(mounted.current&&visible.current&&ticket===reads.current){setRuns([]);setSelected("");onSnapshot(null)
      if(cause instanceof PgNativePilotError&&cause.status===401)onExpired();else setError("暂时无法读取本人历史运行，请重试。")}}
    finally{if(mounted.current&&ticket===reads.current)setBusy(false)}
  }
  return <details aria-label="历史运行输出样本" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold">历史运行输出样本</summary>
    <p className="mt-3 text-sm leading-6 text-slate-500">读取此工作流的本人近期记录后，可在节点沙盒中明确勾选使用样本。历史修订可能不同；读取与预览不会重新执行节点。</p>
    <button type="button" className={workflowSecondary} disabled={!active||busy} onClick={()=>void load()}>{busy?"读取中…":"读取本人近期运行（最多30条）"}</button>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    <label className="mt-3 block text-sm font-medium">历史样本来源<select aria-label="历史样本来源" className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selected} disabled={!active||busy}
      onChange={event=>{setSelected(event.target.value);onSnapshot(null)}}><option value="">请选择同一工作流的本人运行</option>{runs.map(run=><option key={run.id} value={run.id}>{run.debug_node_id?"[单模型测试] ":""}{run.instruction_preview.slice(0,180)||"空任务样本"} · {run.created_at.slice(0,80)}</option>)}</select></label>
    {selected&&<PgNativeWorkflowRunOutputs key={selected} api={api} runId={selected} workflowId={workflowId} active={active} onExpired={onExpired} onSnapshot={onSnapshot}/>}
  </details>
}
