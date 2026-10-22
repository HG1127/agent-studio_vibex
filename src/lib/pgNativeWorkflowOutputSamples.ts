import type {WorkflowGraph} from "./pgNativeWorkflowGraph.ts"
import {parseWorkflowLatestOutputs} from "../../services/pg-api/src/workflow-v2-output-contract.ts"
import {workflowPreviewDependencies} from "../../services/pg-api/src/workflow-v2-preview.ts"
export function historicalWorkflowSamples(raw:unknown,workflowId:string,revision:number,graph:WorkflowGraph,nodeId:string){
  const source=parseWorkflowLatestOutputs(raw)
  if(source.run.workflow_id!==workflowId)throw Error("output_source_workflow_changed")
  const wanted=new Set(workflowPreviewDependencies(graph,nodeId).map(node=>node.id)),outputs:Record<string,string>=Object.create(null),warnings:string[]=[]
  if(source.run.workflow_revision!==revision)warnings.push("历史运行来自不同修订，请核对节点配置与样本含义。")
  if(source.run.node_debug_id)warnings.push("所选记录仅测试过一个模型节点，其他节点没有实际执行输出。")
  for(const node of source.nodes){
    if(!wanted.has(node.node_id)||node.node_id===nodeId||node.node_type==="start"||node.node_status!=="done"||typeof node.output_text!=="string"||source.run.node_debug_id&&node.node_id!==source.run.node_debug_id)continue
    const current=graph.nodes.find(item=>item.id===node.node_id)
    if(!current||current.type!==node.node_type){warnings.push("部分历史节点的类型已变化，相关输出未复用。");continue}
    if(current.data.title!==node.title&&!source.run.node_debug_id)warnings.push("部分节点已改名，样本仍按同一节点编号匹配，请核对内容。")
    outputs[node.node_id]=node.output_text
  }
  const context=JSON.stringify([source.run.run_id,source.run.output_version,source.run.workflow_revision,source.run.instruction,outputs,revision,nodeId,graph.nodes.find(node=>node.id===nodeId)?.data,
    graph.nodes.filter(node=>wanted.has(node.id)).map(node=>[node.id,node.type,node.data.title])])
  return {input:source.run.instruction,outputs,warnings:[...new Set(warnings)],context,source}
}
