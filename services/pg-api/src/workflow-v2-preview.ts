// Pure simulation and server-side model-test input preparation. No I/O or hashes.
import {parseWorkflowNodeDataV2,type WorkflowGraph} from "./workflow-graph-v2.ts"
import {renderWorkflowTemplate,workflowCondition,workflowLoopItems,WorkflowValueError} from "./workflow-v2-values.ts"
export type WorkflowPreviewSamples={input:string;outputs:Record<string,string>;loop?:{item:string;index:number};source_node_id?:string}
function invalid():never{throw new WorkflowValueError("invalid_workflow_preview_samples")}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
export function safeWorkflowPreviewSamples(raw:unknown,graph:WorkflowGraph|undefined,nodeId:string):WorkflowPreviewSamples{
  const value=object(raw)
  if(Object.keys(value).some(key=>!["input","outputs","loop","source_node_id"].includes(key))||typeof value.input!=="string"||value.input.length>1200||value.input.includes("\0"))invalid()
  const outputs=object(value.outputs),safe:Record<string,string>=Object.create(null),ids=graph?new Set(graph.nodes.filter(node=>node.type!=="start"&&node.id!==nodeId).map(node=>node.id)):undefined
  if(Object.keys(outputs).length>40)invalid()
  for(const [id,text] of Object.entries(outputs)){if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||id===nodeId||ids&&!ids.has(id)||typeof text!=="string"||text.length>4000||text.includes("\0"))invalid();safe[id]=text}
  let loop:WorkflowPreviewSamples["loop"]
  if(Object.hasOwn(value,"loop")){const item=object(value.loop)
    if(Object.keys(item).length!==2||typeof item.item!=="string"||item.item.length>4000||item.item.includes("\0")||!Number.isSafeInteger(item.index)||(item.index as number)<1||(item.index as number)>20)invalid()
    loop={item:item.item,index:item.index as number}
  }
  if(Object.hasOwn(value,"source_node_id")&&(typeof value.source_node_id!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(value.source_node_id)||graph&&!graph.edges.some(edge=>edge.target===nodeId&&edge.source===value.source_node_id)))invalid()
  const result:WorkflowPreviewSamples={input:value.input,outputs:safe,...(loop?{loop}:{}),...(value.source_node_id?{source_node_id:value.source_node_id as string}:{})}
  if(new TextEncoder().encode(JSON.stringify(result)).length>65536)invalid()
  return result
}
export function workflowPreviewLoops(graph:WorkflowGraph,nodeId:string){
  return graph.nodes.filter(node=>node.type==="loop").map(loop=>{
    const seen=new Set<string>(),queue=graph.edges.filter(edge=>edge.source===loop.id&&!edge.sourceHandle).map(edge=>edge.target)
    for(let i=0;i<queue.length;i++){const id=queue[i]!;if(id===loop.id||seen.has(id))continue;seen.add(id);for(const edge of graph.edges.filter(edge=>edge.source===id))queue.push(edge.target)}
    return {loop,size:seen.size,contains:seen.has(nodeId)}
  }).filter(item=>item.contains).sort((a,b)=>a.size-b.size).map(item=>item.loop)
}
export function workflowPreviewDependencies(graph:WorkflowGraph,nodeId:string){
  const node=graph.nodes.find(item=>item.id===nodeId);if(!node)return []
  const wanted=new Set(graph.edges.filter(edge=>edge.target===nodeId).map(edge=>edge.source))
  for(const field of ["prompt","params_template","list_source","output_template"] as const){
    if(field==="prompt"&&node.data.prompt_format==="literal")continue
    for(const match of (node.data[field]??"").matchAll(/\{\{\s*([^{}]+?)\.output\s*\}\}/g)){
      const ref=graph.nodes.find(item=>item.data.title===match[1]!.trim());if(ref)wanted.add(ref.id)
    }
  }
  if(node.data.ref_title){const ref=graph.nodes.find(item=>item.data.title===node.data.ref_title);if(ref)wanted.add(ref.id)}
  return graph.nodes.filter(item=>wanted.has(item.id)&&item.type!=="start"&&item.id!==nodeId)
}
export function previewWorkflowV2Node(graph:WorkflowGraph,nodeId:string,rawSamples:unknown){
  const node=graph.nodes.find(item=>item.id===nodeId)
  if(!node)throw new WorkflowValueError("workflow_preview_node_missing")
  const data=parseWorkflowNodeDataV2(node.data,node.type),samples=safeWorkflowPreviewSamples(rawSamples,graph,nodeId),missing=new Set<string>(),warnings:string[]=[]
  const inLoop=workflowPreviewLoops(graph,nodeId).length>0
  const output=(id:string)=>graph.nodes.find(item=>item.id===id)?.type==="start"?samples.input:samples.outputs[id]
  const render=(source:string,json=false)=>renderWorkflowTemplate(source,key=>{
    if(key==="input")return samples.input
    if(inLoop&&samples.loop&&key==="loop.item")return samples.loop.item
    if(inLoop&&samples.loop&&key==="loop.index")return String(samples.loop.index)
    if(key.endsWith(".output")){const ref=graph.nodes.find(item=>item.data.title===key.slice(0,-7));if(ref&&ref.id!==nodeId)return output(ref.id)}
    return undefined
  },json)
  const incoming=()=>{
    const edges=graph.edges.filter(edge=>edge.target===nodeId&&(!samples.source_node_id||edge.source===samples.source_node_id))
    if(edges.length>1)warnings.push("本地样本未确定实际运行分支；以下使用首个已提供的上游样本。")
    for(const edge of edges){const text=output(edge.source);if(text!==undefined)return text}
    for(const edge of edges){const ref=graph.nodes.find(item=>item.id===edge.source);if(ref)missing.add(ref.data.title+".output")}
    return ""
  }
  const result={type:node.type,input:"",output:"",missing:[] as string[],warnings,branch:undefined as "true"|"false"|undefined,items:undefined as string[]|undefined,parameters:undefined as Record<string,unknown>|undefined,requires_execution:["model","agent","tool"].includes(node.type)}
  if(node.type==="start")result.input=result.output=samples.input
  else if(node.type==="condition"){
    const ref=data.ref_title?graph.nodes.find(item=>item.data.title===data.ref_title):undefined
    if(ref&&output(ref.id)===undefined)missing.add(ref.data.title+".output")
    result.input=ref&&output(ref.id)!==undefined?output(ref.id)!:incoming()
    const value=workflowCondition(result.input,data.op,data.value);result.output=value.output;result.branch=value.branch
  }else if(node.type==="loop"){
    const rendered=data.mode==="count"?{text:"",missing:[]}:render(data.list_source??"")
    rendered.missing.forEach(key=>missing.add(key));result.input=rendered.text
    result.items=workflowLoopItems(data,rendered).items;result.output="预计 "+result.items.length+" 轮；未执行循环体。"
  }else{
    const source=node.type==="tool"?data.params_template||"{}":node.type==="end"?data.output_template??"":node.type==="agent"?data.prompt||"{{input}}":data.prompt??""
    const rendered=node.type==="model"&&data.prompt_format==="literal"?{text:source,missing:[]}:node.type==="end"&&!source?{text:incoming(),missing:[]}:render(source,node.type==="tool")
    rendered.missing.forEach(key=>missing.add(key));result.input=rendered.text
    if(node.type==="tool"){let raw:unknown;try{raw=JSON.parse(rendered.text)}catch{throw new WorkflowValueError("workflow_tool_template_invalid")};result.parameters=object(raw)}
    if(node.type==="end")result.output=rendered.text.slice(0,20000)
  }
  result.missing=[...missing];return result
}
export function workflowPreviewError(error:unknown){
  if(error instanceof WorkflowValueError){
    if(error.code==="workflow_rendered_input_too_large")return "替换后的输入超过 12000 字符。"
    if(error.code==="workflow_loop_list_invalid")return "循环列表不是有效的 JSON 数组。"
    if(error.code==="workflow_tool_template_invalid")return "替换后的工具参数不是有效的 JSON 对象。"
    return "样本格式、长度或节点引用无效，请核对输入。"
  }
  return "节点配置尚未完整，请先应用有效配置。"
}
