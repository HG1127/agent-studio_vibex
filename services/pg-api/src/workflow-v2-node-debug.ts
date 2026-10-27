// Builds exactly one Model effect from an owned saved Workflow and sample data.
// The caller can never supply an executable graph, endpoint or model binding.
import {parseWorkflowGraphV2,type WorkflowGraph} from "./workflow-graph-v2.ts"
import {previewWorkflowV2Node,safeWorkflowPreviewSamples,type WorkflowPreviewSamples} from "./workflow-v2-preview.ts"
import {WorkflowValueError} from "./workflow-v2-values.ts"
export type WorkflowNodeDebug={node_id:string;samples:WorkflowPreviewSamples}
export type WorkflowNodeDebugRequest=WorkflowNodeDebug&{expected_revision:number;idempotency_key:string}
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical)
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]))
  return value
}
export function workflowNodeDebugFingerprintData(workflow_id:string,workflow_revision:number,debug:WorkflowNodeDebug){
  return JSON.stringify(canonical({workflow_id,workflow_revision,...debug}))
}
export function safeWorkflowNodeDebugRequest(raw:unknown):WorkflowNodeDebugRequest{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new WorkflowValueError("invalid_workflow_node_debug_request")
  const value=raw as Record<string,unknown>
  if(Object.keys(value).length!==4||!["node_id","samples","expected_revision","idempotency_key"].every(key=>Object.hasOwn(value,key))||
    typeof value.node_id!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(value.node_id)||!Number.isSafeInteger(value.expected_revision)||(value.expected_revision as number)<1||
    typeof value.idempotency_key!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(value.idempotency_key))throw new WorkflowValueError("invalid_workflow_node_debug_request")
  return {node_id:value.node_id,expected_revision:value.expected_revision as number,idempotency_key:value.idempotency_key,samples:safeWorkflowPreviewSamples(value.samples,undefined,value.node_id)}
}
export function workflowNodeDebugGraph(source:unknown,raw:WorkflowNodeDebug):WorkflowGraph{
  const graph=parseWorkflowGraphV2(source),node=graph.nodes.find(item=>item.id===raw.node_id)
  if(node?.type!=="model"||!node.data.model_binding)throw new WorkflowValueError("workflow_node_debug_model_required")
  const samples=safeWorkflowPreviewSamples(raw.samples,graph,node.id),preview=previewWorkflowV2Node(graph,node.id,samples)
  if(preview.missing.length||!preview.input.trim()||preview.input.length>8000)throw new WorkflowValueError("workflow_node_debug_input_not_ready")
  const [start,end]=["_debug_start","_debug_end","_debug_extra"].filter(id=>id!==node.id)
  return parseWorkflowGraphV2({version:2,nodes:[{id:start,type:"start",data:{title:"调试输入"},position:{x:0,y:0}},
    {id:node.id,type:"model",data:{title:"待测模型",prompt:preview.input,prompt_format:"literal",model_binding:node.data.model_binding},position:{x:220,y:0}},
    {id:end,type:"end",data:{title:"调试结果",output_template:"{{待测模型.output}}"},position:{x:440,y:0}}],
    edges:[{id:"_debug_in",source:start,target:node.id},{id:"_debug_out",source:node.id,target:end}]})
}
