// Versioned configuration for the full Workflow node vocabulary. This is a
// bounded, data-only contract; accepting a graph never authorizes execution.
import type {WorkflowGraph,WorkflowNode,WorkflowNodeType,WorkflowEdge} from "./contracts.ts"

export interface WorkflowNodeDataV2 {
  title:string
  input_hint?:string
  prompt?:string
  model_binding?:{connection_id:string;connection_revision:number;model_id:string}
  agent_binding?:{spec_id:string;spec_revision:number}
  max_steps?:number
  tool?:"calculate"|"summarize"|"knowledge_search"|"web_fetch"|"web_search"
  tool_binding?:{connection_id:string;connection_revision:number}
  params_template?:string
  knowledge_base_ids?:string[]
  ref_title?:string
  op?:"contains"|"not_contains"|"gt"|"lt"|"eq"
  value?:string
  mode?:"count"|"list"
  count?:number
  list_source?:string
  delimiter?:"line"|"comma"|"json_array"
  stop_keyword?:string
  max_iterations?:number
  output_template?:string
}
const fields:Record<WorkflowNodeType,string[]>={
  start:["title","input_hint"],
  model:["title","model_binding","prompt"],
  agent:["title","agent_binding","prompt","max_steps","model_binding"],
  tool:["title","tool","tool_binding","params_template","knowledge_base_ids","model_binding"],
  condition:["title","ref_title","op","value"],
  loop:["title","mode","count","list_source","delimiter","stop_keyword","max_iterations"],
  end:["title","output_template"],
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class InvalidWorkflowGraphV2 extends Error {}
function invalid():never{throw new InvalidWorkflowGraphV2("invalid_workflow_graph_v2")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid()
  return raw as Record<string,unknown>
}
function only(raw:Record<string,unknown>,names:readonly string[]){
  if(Object.keys(raw).some(key=>!names.includes(key)))invalid()
}
function text(raw:unknown,max:number,required=false):string{
  if(typeof raw!=="string"||raw.length>max||raw.includes("\u0000")||
     (required&&!raw.trim()))invalid()
  return raw
}
function id(raw:unknown):string{
  if(typeof raw!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(raw))invalid()
  return raw
}
function positive(raw:unknown,max=Number.MAX_SAFE_INTEGER):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<1||(raw as number)>max)invalid()
  return raw as number
}
function enumValue(raw:unknown,values:readonly string[]):string{
  if(typeof raw!=="string"||!values.includes(raw))invalid()
  return raw
}
function reference(raw:unknown,kind:"model"|"tool"|"agent"){
  const item=object(raw),agent=kind==="agent"
  const idKey=agent?"spec_id":"connection_id",revKey=agent?"spec_revision":"connection_revision"
  const names=[idKey,revKey,...(kind==="model"?["model_id"]:[])]
  only(item,names)
  if(Object.keys(item).length!==names.length||typeof item[idKey]!=="string"||!uuid.test(item[idKey]))invalid()
  const result:Record<string,unknown>={[idKey]:item[idKey], [revKey]:positive(item[revKey])}
  if(kind==="model"){
    if(typeof item.model_id!=="string"||!/^[A-Za-z0-9._:/-]{1,120}$/.test(item.model_id))invalid()
    result.model_id=item.model_id
  }
  return result
}
function nodeData(raw:unknown,type:WorkflowNodeType):WorkflowNodeDataV2{
  const input=object(raw);only(input,fields[type])
  const output:Record<string,unknown>={title:text(input.title,120,true).trim()}
  const strings:Record<string,number>={input_hint:2000,prompt:12000,params_template:12000,
    ref_title:120,value:2000,list_source:12000,stop_keyword:300,output_template:12000}
  for(const key of fields[type]){
    if(key==="title"||!Object.hasOwn(input,key))continue
    const value=input[key]
    if(strings[key])output[key]=text(value,strings[key]!)
    else if(key==="model_binding")output[key]=reference(value,"model")
    else if(key==="agent_binding")output[key]=reference(value,"agent")
    else if(key==="tool_binding")output[key]=reference(value,"tool")
    else if(key==="tool")output[key]=enumValue(value,["calculate","summarize","knowledge_search","web_fetch","web_search"])
    else if(key==="op")output[key]=enumValue(value,["contains","not_contains","gt","lt","eq"])
    else if(key==="mode")output[key]=enumValue(value,["count","list"])
    else if(key==="delimiter")output[key]=enumValue(value,["line","comma","json_array"])
    else if(key==="max_steps")output[key]=positive(value,5)
    else if(key==="max_iterations")output[key]=positive(value,20)
    else if(key==="count")output[key]=positive(value,1000)
    else if(key==="knowledge_base_ids"){
      if(!Array.isArray(value)||value.length>3||new Set(value).size!==value.length||
         value.some(entry=>typeof entry!=="string"||!uuid.test(entry)))invalid()
      output[key]=[...value]
    }else invalid()
  }
  if(type==="tool"){
    if(Boolean(output.tool)===Boolean(output.tool_binding))invalid()
    if(output.knowledge_base_ids&&output.tool!=="knowledge_search")invalid()
    if(output.model_binding&&output.tool!=="summarize")invalid()
  }
  if(type==="loop"&&(!output.mode||(output.mode==="count"&&!output.count)||
     (output.mode==="list"&&!Object.hasOwn(output,"list_source"))))invalid()
  return output as unknown as WorkflowNodeDataV2
}

/** Allows structured, nested bounded loops; every other cycle is rejected. */
function structure(nodes:WorkflowNode[],edges:WorkflowEdge[]):void{
  const byId=new Map(nodes.map(node=>[node.id,node]))
  const outgoing=new Map(nodes.map(node=>[node.id,edges.filter(edge=>edge.source===node.id)]))
  const start=nodes.find(node=>node.type==="start")!
  for(const node of nodes){
    const out=outgoing.get(node.id)!
    if(node.type==="end"){if(out.length)invalid();continue}
    if(!out.length)invalid()
    if(node.type==="condition"){
      if(out.length!==2||out.filter(e=>e.sourceHandle==="true").length!==1||
         out.filter(e=>e.sourceHandle==="false").length!==1)invalid()
    }else if(node.type==="loop"){
      if(out.length!==2||out.filter(e=>e.sourceHandle==="done").length!==1||
         out.filter(e=>e.sourceHandle===undefined).length!==1)invalid()
    }else if(out.some(e=>e.sourceHandle!==undefined))invalid()
  }
  const reachable=(seed:string,stop?:string)=>{
    const seen=new Set<string>(),queue=[seed]
    for(let i=0;i<queue.length;i++){
      const current=queue[i]!
      if(current===stop||seen.has(current))continue
      seen.add(current)
      for(const edge of outgoing.get(current)!)queue.push(edge.target)
    }
    return seen
  }
  if(reachable(start.id).size!==nodes.length)invalid()
  const bodies=new Map<string,Set<string>>()
  const backEdges=new Set<string>()
  for(const loop of nodes.filter(node=>node.type==="loop")){
    const out=outgoing.get(loop.id)!
    const bodyEntry=out.find(edge=>edge.sourceHandle===undefined)!.target
    const exit=out.find(edge=>edge.sourceHandle==="done")!.target
    const body=reachable(bodyEntry,loop.id)
    if(!body.size||body.has(exit)||body.has(start.id)||
       [...body].some(nodeId=>byId.get(nodeId)!.type==="end"))invalid()
    for(const edge of edges){
      if(body.has(edge.target)&&!body.has(edge.source)&&edge.source!==loop.id)invalid()
      if(body.has(edge.source)&&!body.has(edge.target)&&edge.target!==loop.id)invalid()
      if(edge.target===loop.id&&body.has(edge.source))backEdges.add(edge.id)
    }
    if(!edges.some(edge=>edge.target===loop.id&&body.has(edge.source)))invalid()
    bodies.set(loop.id,body)
  }
  // Overlapping loop bodies must be properly nested, never crossed.
  for(const [outerId,outer] of bodies)for(const [innerId,inner] of bodies){
    if(outerId===innerId||![...inner].some(entry=>outer.has(entry)))continue
    if(![...inner].every(entry=>outer.has(entry))&&![...outer].every(entry=>inner.has(entry)))invalid()
    if(outer.has(innerId)&&inner.has(outerId))invalid()
  }
  const degree=new Map(nodes.map(node=>[node.id,0]))
  for(const edge of edges)if(!backEdges.has(edge.id))degree.set(edge.target,degree.get(edge.target)!+1)
  const pending=nodes.filter(node=>degree.get(node.id)===0).map(node=>node.id)
  for(let i=0;i<pending.length;i++)for(const edge of outgoing.get(pending[i]!)!){
    if(backEdges.has(edge.id))continue
    degree.set(edge.target,degree.get(edge.target)!-1)
    if(degree.get(edge.target)===0)pending.push(edge.target)
  }
  if(pending.length!==nodes.length)invalid()
  // Every node can eventually reach a terminal, including through a loop's exit.
  const terminals=new Set(nodes.filter(node=>node.type==="end").map(node=>node.id))
  let changed=true
  while(changed){changed=false;for(const edge of edges)if(terminals.has(edge.target)&&!terminals.has(edge.source)){
    terminals.add(edge.source);changed=true
  }}
  if(terminals.size!==nodes.length)invalid()
}

export function parseWorkflowGraphV2(raw:unknown):WorkflowGraph{
  const input=object(raw);only(input,["version","nodes","edges"])
  if(input.version!==2||!Array.isArray(input.nodes)||!Array.isArray(input.edges)||
     input.nodes.length<2||input.nodes.length>40||input.edges.length>100)invalid()
  const nodes:WorkflowNode[]=[],ids=new Set<string>(),titles=new Set<string>()
  for(const rawNode of input.nodes){
    const item=object(rawNode);only(item,["id","type","data","position"])
    const nodeId=id(item.id)
    if(ids.has(nodeId)||typeof item.type!=="string"||!Object.hasOwn(fields,item.type))invalid()
    const type=item.type as WorkflowNodeType,data=nodeData(item.data,type),position=object(item.position)
    only(position,["x","y"])
    if(typeof position.x!=="number"||typeof position.y!=="number"||
       !Number.isFinite(position.x)||!Number.isFinite(position.y)||
       Math.abs(position.x)>100000||Math.abs(position.y)>100000||titles.has(data.title))invalid()
    nodes.push({id:nodeId,type,data,position:{x:position.x,y:position.y}})
    ids.add(nodeId);titles.add(data.title)
  }
  if(nodes.filter(node=>node.type==="start").length!==1||!nodes.some(node=>node.type==="end"))invalid()
  const edges:WorkflowEdge[]=[],edgeIds=new Set<string>(),pairs=new Set<string>()
  for(const rawEdge of input.edges){
    const item=object(rawEdge);only(item,["id","source","target","sourceHandle"])
    const edgeId=id(item.id),source=id(item.source),target=id(item.target)
    const handle=Object.hasOwn(item,"sourceHandle")?enumValue(item.sourceHandle,["true","false","done"]):undefined
    const pair=source+"\0"+target+"\0"+(handle??"")
    if(edgeIds.has(edgeId)||pairs.has(pair)||source===target||!ids.has(source)||!ids.has(target)||
       nodes.find(node=>node.id===target)!.type==="start")invalid()
    edges.push({id:edgeId,source,target,...(handle?{sourceHandle:handle as "true"|"false"|"done"}:{})})
    edgeIds.add(edgeId);pairs.add(pair)
  }
  structure(nodes,edges)
  // Explicit references must be unambiguous; titles are unique above.
  for(const node of nodes)if(node.data.ref_title&&(!titles.has(node.data.ref_title)||node.data.ref_title===node.data.title))invalid()
  const result:WorkflowGraph={version:2,nodes,edges}
  // Serialize only reconstructed JSON primitives. Never invoke a caller's
  // toJSON/valueOf hook while checking untrusted configuration objects.
  if(new TextEncoder().encode(JSON.stringify(result)).length>131072)invalid()
  return result
}
