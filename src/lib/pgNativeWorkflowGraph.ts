// Shared parser is pure data validation; never import the API runtime here.
import {parseWorkflowGraphV2,parseWorkflowNodeDataV2,type WorkflowGraph,type WorkflowNode,type WorkflowNodeType,type WorkflowNodeDataV2,type WorkflowEdge}
  from "../../services/pg-api/src/workflow-graph-v2.ts"
export {parseWorkflowGraphV2}
export type {WorkflowGraph,WorkflowNode,WorkflowNodeType,WorkflowNodeDataV2,WorkflowEdge}
export const workflowNodeNames:Record<WorkflowNodeType,string>={start:"开始",end:"结束",model:"模型",agent:"Agent",tool:"工具",condition:"条件",loop:"循环"}
const builtinTools=new Set(["calculate","summarize","knowledge_search","web_fetch","web_search"])
export function newPgWorkflowGraph():WorkflowGraph{
  return {version:2,nodes:[{id:"start",type:"start",data:{title:"开始"},position:{x:0,y:80}},
    {id:"end",type:"end",data:{title:"结束",output_template:"{{input}}"},position:{x:420,y:80}}],
    edges:[{id:"start-end",source:"start",target:"end"}]}
}
export function editablePgWorkflowGraph(raw:unknown):WorkflowGraph{
  const value=raw as WorkflowGraph
  if(value?.version===2)return parseWorkflowGraphV2(value)
  // Only the existing inert Start/End skeleton is automatically upgraded.
  // Legacy model/tool/Agent skeletons lack required bindings; never invent them.
  if(!value||!Array.isArray(value.nodes)||!Array.isArray(value.edges)||value.nodes.some(n=>!["start","end"].includes(n.type)))
    throw Error("旧工作流缺少节点配置，请保留原记录并新建完整画布。")
  return parseWorkflowGraphV2({version:2,nodes:value.nodes.map(node=>({id:node.id,type:node.type,data:{title:node.data.title},position:{...node.position}})),
    edges:value.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target}))})
}
const key=()=>crypto.randomUUID().replaceAll("-","").slice(0,20)
function freePosition(graph:WorkflowGraph,x:number,y:number){
  const origin={x:Math.max(-99900,Math.min(99900,x)),y:Math.max(-99900,Math.min(99900,y))},direction=origin.y>90000?-1:1
  for(let i=0;i<80;i++){
    const candidate={x:origin.x,y:origin.y+i*140*direction}
    if(!graph.nodes.some(node=>Math.abs(node.position.x-candidate.x)<180&&Math.abs(node.position.y-candidate.y)<120))return candidate
  }
  throw Error("请先整理画布位置，再添加节点。")
}
function uniqueTitle(graph:WorkflowGraph,base:string){let title=base,index=1;while(graph.nodes.some(node=>node.data.title===title))title=base+" "+(++index);return title}
function defaultData(type:WorkflowNodeType,title:string):WorkflowNodeDataV2{
  return {title,...(type==="model"||type==="agent"?{prompt:"{{input}}"}:{}),...(type==="agent"?{max_steps:3}:{}),
    ...(type==="tool"?{tool:"calculate" as const,params_template:'{"expression":"1+1"}'}:{}),
    ...(type==="condition"?{op:"contains" as const,value:"完成"}:{}),
    ...(type==="loop"?{mode:"count" as const,count:3,max_iterations:10}:{}),
    ...(type==="end"?{output_template:"{{input}}"}:{})}
}
export function addPgWorkflowNode(graph:WorkflowGraph,type:WorkflowNodeType,edgeId?:string,makeId=key):WorkflowGraph{
  if(type==="start")throw Error("每个工作流只能有一个开始节点。")
  if(!Object.hasOwn(workflowNodeNames,type))throw Error("请选择有效的节点类型。")
  const required=type==="loop"?2:1
  if(graph.nodes.length+required>40)throw Error("每个工作流最多 40 个节点。")
  const edge=graph.edges.find(e=>e.id===edgeId),source=graph.nodes.find(n=>n.id===edge?.source)
  const node:WorkflowNode={id:"node_"+makeId(),type,data:defaultData(type,uniqueTitle(graph,workflowNodeNames[type])),
    position:freePosition(graph,(source?.position.x??graph.nodes.length*35)+210,source?.position.y??120)}
  const nodes=[...graph.nodes,node]
  if(!edge||type==="end")return {...graph,nodes}
  const original=graph.edges.filter(e=>e.id!==edge.id),first={...edge,target:node.id}
  const to=(source:string,target:string,sourceHandle?:WorkflowEdge["sourceHandle"]):WorkflowEdge=>({id:"edge_"+makeId(),source,target,...(sourceHandle?{sourceHandle}:{})})
  if(type==="condition")return {...graph,nodes,edges:[...original,first,to(node.id,edge.target,"true"),to(node.id,edge.target,"false")]}
  if(type==="loop"){
    const body:WorkflowNode={id:"node_"+makeId(),type:"tool",data:{title:uniqueTitle({...graph,nodes},"循环步骤"),tool:"calculate",params_template:'{"expression":"{{loop.item}}"}'},
      position:freePosition({...graph,nodes},node.position.x,node.position.y+150)}
    return {...graph,nodes:[...nodes,body],edges:[...original,first,to(node.id,body.id),to(body.id,node.id),to(node.id,edge.target,"done")]}
  }
  return {...graph,nodes,edges:[...original,first,to(node.id,edge.target)]}
}
export function patchPgWorkflowNode(graph:WorkflowGraph,id:string,data:WorkflowNodeDataV2):WorkflowGraph{
  const node=graph.nodes.find(item=>item.id===id)
  if(!node)throw Error("节点已不存在，请重新选择。")
  data=parseWorkflowNodeDataV2(data,node.type)
  if(!data.title.trim()||data.title.length>120||graph.nodes.some(item=>item.id!==id&&item.data.title===data.title.trim()))throw Error("节点名称必须唯一，且不超过 120 字。")
  const from="{{"+node.data.title+".output}}",to="{{"+data.title.trim()+".output}}"
  return {...graph,nodes:graph.nodes.map(item=>{
    const next:WorkflowNodeDataV2=item.id===id?{...data,title:data.title.trim()}:{...item.data}
    for(const [field,value] of Object.entries(next))if(field!=="title"&&!(field==="prompt"&&next.prompt_format==="literal")&&typeof value==="string"){
      const replacement=field==="ref_title"&&value===node.data.title?data.title.trim():value.split(from).join(to)
      Object.assign(next,{[field]:replacement})
    }
    return {...item,data:next}
  })}
}
export function connectPgWorkflowNodes(graph:WorkflowGraph,source:string,target:string,handle?:string,makeId=key):WorkflowGraph{
  const node=graph.nodes.find(item=>item.id===source),end=graph.nodes.find(item=>item.id===target)
  if(!node||!end||source===target||node.type==="end"||end.type==="start")throw Error("请选择有效的连线起点和终点。")
  const port=handle||undefined,allowed=node.type==="condition"?["true","false"]:node.type==="loop"?[undefined,"done"]:[undefined]
  if(!allowed.includes(port))throw Error("请选择该节点的正确出口。")
  if(graph.edges.length>=100)throw Error("每个工作流最多 100 条连线。")
  if(graph.edges.some(edge=>edge.source===source&&edge.target===target&&edge.sourceHandle===port))return graph
  if((node.type==="condition"||node.type==="loop")&&graph.edges.some(edge=>edge.source===source&&edge.sourceHandle===port))throw Error("该出口已有连线，请先删除原连线。")
  return {...graph,edges:[...graph.edges,{id:"edge_"+makeId(),source,target,...(port?{sourceHandle:port as WorkflowEdge["sourceHandle"]}:{})}]}
}
export function removePgWorkflowNode(graph:WorkflowGraph,id:string):WorkflowGraph{
  if(graph.nodes.find(node=>node.id===id)?.type==="start")throw Error("开始节点不能删除。")
  return {...graph,nodes:graph.nodes.filter(node=>node.id!==id),edges:graph.edges.filter(edge=>edge.source!==id&&edge.target!==id)}
}
export function workflowGraphIssues(graph:WorkflowGraph):string[]{
  const issues:string[]=[]
  if(graph.nodes.length>40||graph.edges.length>100)issues.push("节点或连线数量超过上限。")
  for(const node of graph.nodes){
    const out=graph.edges.filter(edge=>edge.source===node.id),title=node.data.title
    if(!title.trim()||graph.nodes.some(other=>other.id!==node.id&&other.data.title===title))issues.push("节点名称为空或重复。")
    if(node.type!=="end"&&!out.length)issues.push(title+"：缺少出口连线。")
    if(node.type==="end"&&out.length)issues.push(title+"：结束节点不能有出口。")
    if(node.type==="condition"&&(!out.some(e=>e.sourceHandle==="true")||!out.some(e=>e.sourceHandle==="false")))issues.push(title+"：需要满足和不满足两个出口。")
    if(node.type==="loop"&&(!out.some(e=>e.sourceHandle==="done")||!out.some(e=>!e.sourceHandle)))issues.push(title+"：需要循环体和结束出口。")
  }
  try{parseWorkflowGraphV2(graph)}catch{issues.push("请检查节点配置、可达性、条件出口及循环返回边；循环之外不能形成环。")}
  return [...new Set(issues)].slice(0,20)
}
export function workflowExecutionIssues(graph:WorkflowGraph):string[]{
  const issues=workflowGraphIssues(graph)
  for(const node of graph.nodes){
    if(node.type==="model"&&(!node.data.model_binding||!node.data.prompt?.trim()))issues.push(node.data.title+"：请选择模型并填写提示词。")
    if(node.type==="agent"&&!node.data.agent_binding)issues.push(node.data.title+"：请选择本人 Agent 方案。")
    if(node.type==="tool"&&(!node.data.tool_binding&&!builtinTools.has(node.data.tool??"")||node.data.tool==="summarize"&&!node.data.model_binding))issues.push(node.data.title+"：请补齐工具及模型绑定。")
  }
  return issues
}
