// Portable JSON carries text and topology, never another employee's bindings.
import {parseWorkflowGraphV2,parseWorkflowNodeDataV2,type WorkflowGraph,type WorkflowNode,type WorkflowNodeType,type WorkflowEdge} from "../../services/pg-api/src/workflow-graph-v2.ts"
export type PgWorkflowFragment={nodes:WorkflowNode[];edges:WorkflowEdge[]}
export type PgWorkflowAlign="left"|"centerX"|"right"|"top"|"centerY"|"bottom"|"distributeX"|"distributeY"
export const PG_WORKFLOW_TRANSFER_BYTES=512*1024
const scalarFields=["title","input_hint","prompt","prompt_format","params_template","op","value","output_template","ref_title","mode","count","list_source","delimiter","stop_keyword","max_iterations","max_steps"]
const types=new Set(["start","end","model","agent","tool","condition","loop"])
const record=(raw:unknown):Record<string,unknown>=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error("工作流文件包含无效对象。")
  return raw as Record<string,unknown>
}
const key=()=>crypto.randomUUID().replaceAll("-","")
function portableData(raw:unknown,type:WorkflowNodeType){
  const data=record(raw),result:Record<string,unknown>={}
  for(const field of scalarFields)if(Object.hasOwn(data,field))result[field]=data[field]
  if(type==="tool")result.tool_binding_required=true
  return parseWorkflowNodeDataV2(result,type)
}
export function exportPgWorkflowJson(name:string,graph:WorkflowGraph){
  const checked=parseWorkflowGraphV2(graph)
  const portable={...checked,nodes:checked.nodes.map(node=>({...node,data:portableData(node.data,node.type)}))}
  const json=JSON.stringify({kind:"agent-studio-workflow",version:2,name:name.trim().slice(0,120)||"工作流",graph:portable},null,2)
  if(new TextEncoder().encode(json).length>PG_WORKFLOW_TRANSFER_BYTES)throw Error("导出文件超过 512KB。")
  return json
}
export function importPgWorkflowJson(raw:string,makeId=key):{name:string;graph:WorkflowGraph}{
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>PG_WORKFLOW_TRANSFER_BYTES)throw Error("导入文件最大 512KB。")
  let parsed:Record<string,unknown>;try{parsed=record(JSON.parse(raw))}catch{throw Error("文件不是有效的工作流 JSON。")}
  if(parsed.kind!=="agent-studio-workflow"||![1,2].includes(Number(parsed.version))||typeof parsed.version!=="number")throw Error("只支持 Agent Studio 工作流 v1 或 v2 文件。")
  const g=record(parsed.graph)
  if(!Array.isArray(g.nodes)||!Array.isArray(g.edges)||g.nodes.length<2||g.nodes.length>40||g.edges.length>100)throw Error("工作流最多 40 个节点、100 条连线。")
  const ids=new Map<string,string>(),minted=new Set<string>(),nodeTypes=new Map<string,WorkflowNodeType>()
  const mint=()=>{const id="import_"+makeId();if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||minted.has(id))throw Error("无法生成唯一节点编号。");minted.add(id);return id}
  const nodes=g.nodes.map(rawNode=>{
    const node=record(rawNode)
    if(typeof node.id!=="string"||!/^[A-Za-z0-9_-]{1,90}$/.test(node.id)||ids.has(node.id)||typeof node.type!=="string"||!types.has(node.type))throw Error("存在无效或重复的节点。")
    const id=mint(),type=node.type as WorkflowNodeType;ids.set(node.id,id);nodeTypes.set(node.id,type)
    const position=record(node.position)
    return {id,type,position:{x:position.x,y:position.y},data:portableData(node.data,type)}
  })
  const edges=g.edges.map(rawEdge=>{
    const edge=record(rawEdge),source=typeof edge.source==="string"?ids.get(edge.source):undefined,target=typeof edge.target==="string"?ids.get(edge.target):undefined
    if(!source||!target||edge.targetHandle!=null)throw Error("连线引用或入口无效。")
    const loopBody=nodeTypes.get(String(edge.source))==="loop"&&edge.sourceHandle==="body"
    const sourceHandle=edge.sourceHandle==null||loopBody?undefined:edge.sourceHandle
    return {id:mint(),source,target,...(sourceHandle===undefined?{}:{sourceHandle})}
  })
  const description=parsed.version===1?parsed.description:g.description??parsed.description
  const graph=parseWorkflowGraphV2({version:2,...(description===undefined?{}:{description}),nodes,edges})
  if(parsed.name!==undefined&&(typeof parsed.name!=="string"||parsed.name.length>120||parsed.name.includes("\0")))throw Error("工作流名称无效。")
  return {name:typeof parsed.name==="string"&&parsed.name.trim()?parsed.name.trim():"导入工作流",graph}
}
export function selectedPgWorkflowFragment(graph:WorkflowGraph,selected:readonly string[]):PgWorkflowFragment{
  const wanted=new Set(selected),nodes=graph.nodes.filter(node=>node.type!=="start"&&wanted.has(node.id))
  const ids=new Set(nodes.map(node=>node.id))
  return structuredClone({nodes,edges:graph.edges.filter(edge=>ids.has(edge.source)&&ids.has(edge.target))})
}
export function pastePgWorkflowFragment(graph:WorkflowGraph,fragment:PgWorkflowFragment,makeId=key):{graph:WorkflowGraph;selected:string[]}{
  if(!fragment.nodes.length||fragment.nodes.some(node=>node.type==="start")||graph.nodes.length+fragment.nodes.length>40||graph.edges.length+fragment.edges.length>100)throw Error("没有可粘贴节点，或已超过 40 节点、100 连线。")
  const ids=new Map<string,string>(),usedIds=new Set([...graph.nodes,...graph.edges].map(item=>item.id)),renames=new Map<string,string>(),titles=new Set(graph.nodes.map(node=>node.data.title))
  const minX=Math.min(...fragment.nodes.map(node=>node.position.x)),minY=Math.min(...fragment.nodes.map(node=>node.position.y))
  const mint=()=>{const id="copy_"+makeId();if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||usedIds.has(id))throw Error("无法生成唯一节点编号。");usedIds.add(id);return id}
  let shift={x:36,y:36},fits=false
  for(let n=0;n<80;n++){
    shift={x:36+(n%8)*220,y:36+Math.floor(n/8)*160}
    fits=fragment.nodes.every(node=>Math.abs(node.position.x+shift.x)<=100000&&Math.abs(node.position.y+shift.y)<=100000&&
      graph.nodes.every(old=>Math.abs(old.position.x-node.position.x-shift.x)>=196||Math.abs(old.position.y-node.position.y-shift.y)>=140))
    if(fits)break
  }
  if(!fits||!Number.isFinite(minX)||!Number.isFinite(minY))throw Error("请先整理画布位置，再粘贴节点。")
  const nodes=fragment.nodes.map(node=>{
    if(ids.has(node.id))throw Error("片段包含重复节点。")
    const data=parseWorkflowNodeDataV2(node.data,node.type),base=data.title
    let title=base,index=2;while(titles.has(title)){const suffix=" "+index++;title=base.slice(0,120-suffix.length)+suffix}
    titles.add(title);renames.set(base,title);const id=mint();ids.set(node.id,id)
    return {...node,id,data:{...structuredClone(data),title},position:{x:node.position.x+shift.x,y:node.position.y+shift.y}}
  })
  const replace=(value:string)=>value.replace(/\{\{\s*([^{}]+?)\.output\s*\}\}/g,(token,title:string)=>renames.has(title.trim())?"{{"+renames.get(title.trim())+".output}}":token)
  for(const node of nodes){
    for(const field of ["prompt","params_template","output_template","list_source"] as const)if(typeof node.data[field]==="string"&&!(field==="prompt"&&node.data.prompt_format==="literal"))node.data[field]=replace(node.data[field]!)
    if(node.data.ref_title&&renames.has(node.data.ref_title))node.data.ref_title=renames.get(node.data.ref_title)
  }
  const edges=fragment.edges.map(edge=>{const source=ids.get(edge.source),target=ids.get(edge.target);if(!source||!target)throw Error("片段连线引用无效。");return {...edge,id:mint(),source,target}})
  return {graph:{...graph,nodes:[...graph.nodes,...nodes],edges:[...graph.edges,...edges]},selected:nodes.map(node=>node.id)}
}
export function alignPgWorkflowNodes(graph:WorkflowGraph,selected:readonly string[],mode:PgWorkflowAlign):WorkflowGraph{
  if(!["left","centerX","right","top","centerY","bottom","distributeX","distributeY"].includes(mode))throw Error("请选择有效的排列方式。")
  const chosen=graph.nodes.filter(node=>selected.includes(node.id))
  if(chosen.length<2||mode.startsWith("distribute")&&chosen.length<3)return graph
  const x=chosen.map(node=>node.position.x),y=chosen.map(node=>node.position.y),positions=new Map<string,{x:number;y:number}>()
  if(mode.startsWith("distribute")){
    const axis=mode==="distributeX"?"x":"y",values=axis==="x"?x:y,sorted=[...chosen].sort((a,b)=>a.position[axis]-b.position[axis]),first=Math.min(...values),step=(Math.max(...values)-first)/(sorted.length-1)
    sorted.forEach((node,index)=>positions.set(node.id,{...node.position,[axis]:first+index*step}))
  }else for(const node of chosen)positions.set(node.id,{x:mode==="left"?Math.min(...x):mode==="right"?Math.max(...x):mode==="centerX"?x.reduce((a,b)=>a+b,0)/x.length:node.position.x,
    y:mode==="top"?Math.min(...y):mode==="bottom"?Math.max(...y):mode==="centerY"?y.reduce((a,b)=>a+b,0)/y.length:node.position.y})
  return {...graph,nodes:graph.nodes.map(node=>positions.has(node.id)?{...node,position:positions.get(node.id)!}:node)}
}
