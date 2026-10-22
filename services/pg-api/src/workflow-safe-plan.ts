// Shared deterministic plan for the isolated PG Workflow safe-node runner.
// Supports Start/End only; it intentionally has no model/tool/HTTP imports.
import {createHash} from "node:crypto"
import {HttpError,safeWorkflowGraph,type WorkflowGraph,type WorkflowNode}
  from "./contracts.ts"
export type SafeWorkflowNode=Pick<WorkflowNode,"id"|"type">
  &{type:"start"|"end"}
export type SafeWorkflowPlan={
  graph:WorkflowGraph;nodes:SafeWorkflowNode[];graphSha256:string
}
export function safeWorkflowPlan(raw:unknown):SafeWorkflowPlan{
  let graph:WorkflowGraph
  try{graph=safeWorkflowGraph(raw)}
  catch{throw new HttpError(409,"workflow_execution_graph_invalid")}
  if(graph.nodes.some(n=>n.type!=="start"&&n.type!=="end"))
    throw new HttpError(409,"workflow_execution_node_not_supported")
  const start=graph.nodes.find(n=>n.type==="start")
  if(!start||graph.nodes.length<2||
     graph.nodes.filter(n=>n.type==="start").length!==1||
     graph.nodes.some(n=>n.type==="end"&&graph.edges.some(e=>e.source===n.id)))
    throw new HttpError(409,"workflow_execution_graph_invalid")
  // In the Start/End subset every edge must run from the unique Start to an
  // End node. Sorting is stable across payload order and worker restarts.
  if(graph.edges.some(e=>e.source!==start.id||
      !graph.nodes.some(n=>n.id===e.target&&n.type==="end"))||
     graph.nodes.some(n=>n.type==="end"&&
      !graph.edges.some(e=>e.target===n.id)))
    throw new HttpError(409,"workflow_execution_graph_invalid")
  const nodes:SafeWorkflowNode[]=[
    {id:start.id,type:"start"},
    ...graph.nodes.filter(n=>n.type==="end").sort((a,b)=>a.id.localeCompare(b.id))
      .map(n=>({id:n.id,type:"end" as const}))
  ]
  const canonical={
    nodes:[...graph.nodes].sort((a,b)=>a.id.localeCompare(b.id)),
    edges:[...graph.edges].sort((a,b)=>a.id.localeCompare(b.id))
  }
  return {graph,nodes,graphSha256:createHash("sha256")
    .update(JSON.stringify(canonical)).digest("hex")}
}
