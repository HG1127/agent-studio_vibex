import test from "node:test"
import assert from "node:assert/strict"
import {newPgWorkflowGraph,editablePgWorkflowGraph,parseWorkflowGraphV2,addPgWorkflowNode,patchPgWorkflowNode,
  connectPgWorkflowNodes,removePgWorkflowNode,workflowGraphIssues,workflowExecutionIssues} from "../src/lib/pgNativeWorkflowGraph.ts"
import {safeWorkflowGraph} from "../services/pg-api/src/contracts.ts"
const ids=()=>{let id=0;return ()=>String(++id)}
test("canvas insertion produces the same canonical branch/nested-loop contract as the API",()=>{
  const make=ids();let graph=newPgWorkflowGraph()
  graph=addPgWorkflowNode(graph,"condition",graph.edges[0].id,make)
  assert.deepEqual(parseWorkflowGraphV2(graph),safeWorkflowGraph(graph));assert.deepEqual(workflowGraphIssues(graph),[])
  graph=addPgWorkflowNode(graph,"loop",graph.edges.find(edge=>edge.sourceHandle==="true").id,make)
  const body=graph.nodes.find(node=>node.data.title==="循环步骤")
  graph=addPgWorkflowNode(graph,"loop",graph.edges.find(edge=>edge.target===body.id).id,make)
  assert.deepEqual(parseWorkflowGraphV2(graph),safeWorkflowGraph(graph));assert.deepEqual(workflowGraphIssues(graph),[])
  assert.equal(graph.nodes.filter(node=>node.type==="loop").length,2)
})
test("node names preserve template/condition references without altering owner-bound resource IDs",()=>{
  const make=ids();let graph=addPgWorkflowNode(newPgWorkflowGraph(),"model","start-end",make)
  const model=graph.nodes.find(node=>node.type==="model"),binding={connection_id:"11111111-1111-4111-8111-111111111111",connection_revision:3,model_id:"synthetic"}
  graph=patchPgWorkflowNode(graph,model.id,{...model.data,model_binding:binding})
  graph={...graph,nodes:graph.nodes.map(node=>node.type==="end"?{...node,data:{...node.data,output_template:"{{模型.output}}"}}:node)}
  const renamed=patchPgWorkflowNode(graph,model.id,{...model.data,model_binding:binding,title:"准确名称"})
  assert.equal(renamed.nodes.find(node=>node.type==="end").data.output_template,"{{准确名称.output}}")
  assert.deepEqual(renamed.nodes.find(node=>node.id===model.id).data.model_binding,binding)
  assert.throws(()=>patchPgWorkflowNode(graph,model.id,{...model.data,title:"开始"}))
  assert.throws(()=>patchPgWorkflowNode(graph,model.id,{...model.data,owner_user_id:"forged"}))
})
test("port wiring never silently replaces a branch or crosses protocol bounds",()=>{
  const make=ids(),graph=addPgWorkflowNode(newPgWorkflowGraph(),"condition","start-end",make),condition=graph.nodes.find(node=>node.type==="condition")
  assert.throws(()=>connectPgWorkflowNodes(graph,condition.id,"start","true",make))
  assert.throws(()=>connectPgWorkflowNodes(graph,"start",condition.id,"true",make))
  assert.equal(connectPgWorkflowNodes(graph,condition.id,"end","true",make),graph)
  const extra=addPgWorkflowNode(graph,"end",undefined,make)
  assert.throws(()=>connectPgWorkflowNodes(extra,condition.id,extra.nodes.at(-1).id,"true",make),/已有连线/)
  assert.throws(()=>removePgWorkflowNode(graph,"start"),/不能删除/)
  assert.ok(workflowGraphIssues(removePgWorkflowNode(graph,condition.id)).length)
  let large=newPgWorkflowGraph();for(let i=0;i<38;i++)large=addPgWorkflowNode(large,"end",undefined,make)
  assert.throws(()=>addPgWorkflowNode(large,"model",undefined,make),/40/)
})
test("legacy conversion preserves only inert Start/End data; resource readiness remains separate from graph validity",()=>{
  const graph=newPgWorkflowGraph(),v1=structuredClone(graph);delete v1.version
  v1.nodes[1].data={title:"结束"}
  const converted=editablePgWorkflowGraph(v1);assert.equal(converted.version,2);assert.deepEqual(safeWorkflowGraph(converted),converted)
  const make=ids(),model=addPgWorkflowNode(graph,"model","start-end",make)
  assert.deepEqual(workflowGraphIssues(model),[]);assert.ok(workflowExecutionIssues(model).some(issue=>issue.includes("选择模型")))
  const unsafe=structuredClone(v1);unsafe.nodes[1].type="model"
  assert.throws(()=>editablePgWorkflowGraph(unsafe),/保留原记录/)
})
