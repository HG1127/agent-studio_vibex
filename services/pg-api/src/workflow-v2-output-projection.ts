// Explicit business-output projection of canonical replay; never run_steps JSON.
import {createHash} from "node:crypto"
import type {WorkflowGraph} from "./contracts.ts"
import {inspectWorkflowV2OutputState,type WorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {parseWorkflowLatestOutputs,parseWorkflowOutputHistory,type WorkflowHistoricalNodeOutput,type WorkflowLatestNodeOutput} from "./workflow-v2-output-contract.ts"
type Context={run_id:string;workflow_id:string;workflow_revision:number;status:string;instruction:string;updated_at:unknown;node_debug_id?:string}
export function workflowV2OutputProjection(graph:WorkflowGraph,machine:WorkflowV2Checkpoint,context:Context){
  const {view,events}=inspectWorkflowV2OutputState(graph,machine)
  const metadata=new Map(graph.nodes.map(node=>[node.id,{node_id:node.id,title:node.data.title,node_type:node.type}]))
  const lastByNode=new Map(events.map(event=>[event.node_id,event]))
  const nodes:WorkflowLatestNodeOutput[]=view.nodes.map(node=>({...metadata.get(node.id)!,node_status:node.status,
    ...(["done","skipped"].includes(node.status)&&typeof node.output==="string"?{output_text:node.output.slice(0,4000),...(lastByNode.get(node.id)?.loop_path?{loop_path:lastByNode.get(node.id)!.loop_path}:{})}:{})}))
  const items:WorkflowHistoricalNodeOutput[]=events.flatMap(event=>typeof event.output==="string"&&["succeeded","skipped"].includes(event.status)?[{
    ...metadata.get(event.node_id)!,step_key:event.step_key,status:event.status as "succeeded"|"skipped",output_text:event.output.slice(0,4000),
    ...(event.branch?{branch:event.branch}:{}),...(event.round!==undefined?{round:event.round,total:event.total??0}:{}),...(event.loop_path?{loop_path:event.loop_path}:{})
  }]:[])
  const output_version=createHash("sha256").update(JSON.stringify({graph_sha256:machine.graph_sha256,nodes,items})).digest("hex")
  const run={run_id:context.run_id,workflow_id:context.workflow_id,workflow_revision:context.workflow_revision,status:context.status,instruction:context.instruction,
    updated_at:context.updated_at instanceof Date?context.updated_at.toISOString():String(context.updated_at),graph_sha256:machine.graph_sha256,output_version,max_output_chars:4000 as const,
    ...(context.node_debug_id?{node_debug_id:context.node_debug_id}:{})}
  return {
    latest:()=>parseWorkflowLatestOutputs({format:"workflow_v2_outputs_v1",kind:"latest",run,nodes}),
    history(after:string,limit:number){const remaining=items.filter(item=>item.step_key>after),page=remaining.slice(0,limit)
      return parseWorkflowOutputHistory({format:"workflow_v2_outputs_v1",kind:"history",run,items:page,total:items.length,next_after:remaining.length>limit?page.at(-1)!.step_key:null})},
  }
}
