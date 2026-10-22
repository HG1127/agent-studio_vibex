import {useMemo,useState} from "react"
import type {WorkflowLatestOutputs} from "@/lib/pgNativePilotApi"
import type {WorkflowGraph,WorkflowNode} from "@/lib/pgNativeWorkflowGraph"
import type {WorkflowDebugDraft} from "@/lib/pgNativeWorkflowDebugSession"
import {previewWorkflowV2Node,workflowPreviewDependencies,workflowPreviewLoops,workflowPreviewError,safeWorkflowPreviewSamples,type WorkflowPreviewSamples} from "../../../services/pg-api/src/workflow-v2-preview"
import {workflowSecondary} from "./PgNativeWorkflowNodeForm"
import {historicalWorkflowSamples} from "@/lib/pgNativeWorkflowOutputSamples"
const field="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
export default function PgNativeWorkflowNodePreview({node,graph,workflowId,revision,canDebug,onPrepare,history=null}:{node:WorkflowNode;graph:WorkflowGraph;workflowId:string;revision:number;canDebug:boolean;onPrepare:(draft:WorkflowDebugDraft)=>void;history?:WorkflowLatestOutputs|null}){
  const [input,setInput]=useState(""),[outputs,setOutputs]=useState<Record<string,string>>({}),[item,setItem]=useState("样本项"),[index,setIndex]=useState(1),[source,setSource]=useState(""),[notice,setNotice]=useState("")
  const [sourceConsent,setSourceConsent]=useState("")
  const dependencies=useMemo(()=>workflowPreviewDependencies(graph,node.id),[graph,node.id]),loops=useMemo(()=>workflowPreviewLoops(graph,node.id),[graph,node.id]),incoming=graph.edges.filter(edge=>edge.target===node.id)
  const historical=useMemo(()=>{if(!history)return {data:null,error:""};try{return {data:historicalWorkflowSamples(history,workflowId,revision,graph,node.id),error:""}}catch{return {data:null,error:"历史样本与当前工作流不匹配，请重新读取来源。"}}},[history,workflowId,revision,graph,node.id])
  const usingHistory=Boolean(historical.data&&sourceConsent===historical.data.context)
  const merged={...(usingHistory?historical.data?.outputs:{}),...outputs},effectiveOutputs=Object.fromEntries(dependencies.filter(ref=>Object.hasOwn(merged,ref.id)).map(ref=>[ref.id,merged[ref.id]]))
  const currentSource=incoming.some(edge=>edge.source===source)?source:""
  const samples:WorkflowPreviewSamples={input:input||(usingHistory?historical.data?.input??"":""),outputs:effectiveOutputs,...(loops.length?{loop:{item,index}}:{}),...(currentSource?{source_node_id:currentSource}:{})}
  let result:ReturnType<typeof previewWorkflowV2Node>|undefined,error=""
  try{result=previewWorkflowV2Node(graph,node.id,samples)}catch(cause){error=workflowPreviewError(cause)}
  const ready=Boolean(node.type==="model"&&node.data.model_binding&&canDebug&&workflowId&&revision&&result&&!result.missing.length&&result.input.trim()&&result.input.length<=8000)
  const copy=async()=>{if(!result)return;try{await navigator.clipboard.writeText(result.input);setNotice("预览输入已复制。")}catch{setNotice("浏览器暂不允许复制，请手动选中文本。")}}
  return <details className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Workflow 节点预览">
    <summary className="cursor-pointer text-sm font-semibold">节点沙盒 · 本地预览与模型测试</summary>
    <p className="mt-3 text-sm leading-6 text-slate-500">样本仅用于本地渲染、条件判断和循环列表核对。预览不会调用模型、工具或外部接口；模型测试另行提交并审批。</p>
    {historical.error&&<p role="alert" className="text-sm text-amber-800">{historical.error}</p>}
    {historical.data&&<div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-sm leading-6">
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1.5" checked={usingHistory} onChange={event=>setSourceConsent(event.target.checked?historical.data!.context:"")}/>使用所选历史运行样本（修订 {historical.data.source.run.workflow_revision}）</label>
      <p className="text-xs text-slate-500">勾选后，空任务输入使用历史指令；勾选节点手工覆盖可替换相应输出。更换来源或节点配置会取消历史样本选择。循环项与轮数仍使用下方手工样本。</p>
      {usingHistory&&historical.data.warnings.map(warning=><p key={warning} className="text-amber-800">{warning}</p>)}
    </div>}
    <label className="mt-3 block text-sm font-medium">模拟任务指令<textarea aria-label="模拟任务指令" className={field} rows={3} maxLength={1200} value={input} placeholder={usingHistory?"留空使用所选历史任务指令":"输入手工任务样本"} onChange={event=>setInput(event.target.value)}/></label>
    {!!dependencies.length&&<fieldset className="space-y-3"><legend className="text-sm font-medium">手工节点输出样本</legend>{dependencies.map(ref=><label key={ref.id} className="block text-sm">
      <span className="flex items-start gap-2"><input type="checkbox" checked={Object.hasOwn(outputs,ref.id)} onChange={event=>setOutputs(current=>{const next={...current};if(event.target.checked)next[ref.id]="";else delete next[ref.id];return next})}/>{ref.data.title} · {usingHistory?"手工覆盖":"提供样本"}</span>
      <textarea aria-label={ref.data.title+" 输出样本"} className={field} rows={2} maxLength={4000} disabled={!Object.hasOwn(outputs,ref.id)} value={outputs[ref.id]??(usingHistory?historical.data?.outputs[ref.id]??"":"")} onChange={event=>setOutputs(current=>({...current,[ref.id]:event.target.value}))}/>
    </label>)}</fieldset>}
    {incoming.length>1&&<label className="block text-sm font-medium">模拟传入分支<select aria-label="模拟传入分支" className={field} value={currentSource} onChange={event=>setSource(event.target.value)}>
      <option value="">使用首个已提供的上游样本</option>{[...new Set(incoming.map(edge=>edge.source))].map(id=><option key={id} value={id}>{graph.nodes.find(ref=>ref.id===id)?.data.title}</option>)}</select></label>}
    {!!loops.length&&<fieldset className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]"><legend className="text-sm font-medium">模拟当前循环 · {loops[0].data.title}</legend>
      <label className="block text-sm">循环项<input aria-label="模拟循环项" className={field} maxLength={4000} value={item} onChange={event=>setItem(event.target.value)}/></label>
      <label className="block text-sm">轮数<input aria-label="模拟循环轮数" type="number" min={1} max={20} step={1} className={field} value={index} onChange={event=>setIndex(Number(event.target.value))}/></label>
    </fieldset>}
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    {result&&<div className="mt-3 space-y-3 text-sm">
      {result.missing.length>0&&<p className="break-words text-amber-800">还缺少样本：{result.missing.join("、")}</p>}
      {result.warnings.map(warning=><p key={warning} className="text-amber-800">{warning}</p>)}
      <p className="font-medium">{node.type==="tool"?"渲染后的工具参数":"渲染后的输入"}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-sans leading-6">{result.parameters?JSON.stringify(result.parameters,null,2):result.input||"（空）"}</pre>
      {result.output&&<p className="whitespace-pre-wrap break-words">{result.output}</p>}
      {result.branch&&<p>模拟分支：{result.branch==="true"?"满足":"不满足"}</p>}
      {result.items&&<ol className="max-h-48 list-inside list-decimal overflow-auto">{result.items.map((value,i)=><li key={i} className="break-words">{value}</li>)}</ol>}
      <button type="button" className={workflowSecondary} onClick={()=>void copy()}>复制渲染后的输入</button>
    </div>}
    {node.type==="model"&&<div className="mt-3 space-y-2 rounded-xl bg-amber-50 p-3 text-sm leading-6">
      <p>真实测试会把渲染后的提示词发送至本人已绑定的模型，可能产生费用，最多请求 512 个输出 token。只执行这个模型节点；样本来源节点不会运行。</p>
      {!canDebug&&<p>请先应用并保存配置，且由当前环境开放 Workflow 执行后再测试。</p>}
      <button type="button" className={workflowSecondary} disabled={!ready} onClick={()=>{if(!ready)return;onPrepare({workflowId,revision,nodeId:node.id,samples:safeWorkflowPreviewSamples(samples,graph,node.id)});setNotice("样本已准备，请在单模型测试区核对并提交。")}}>准备单模型测试</button>
    </div>}
    {notice&&<p role="status" className="mt-2 text-sm text-slate-600">{notice}</p>}
  </details>
}
