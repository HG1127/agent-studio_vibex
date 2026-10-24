// Browser-safe public output DTOs. Never include prompts, bindings or journals.
import type {WorkflowNodeType} from "./workflow-graph-v2.ts"
export type WorkflowOutputHeader={
  run_id:string;workflow_id:string;workflow_revision:number;graph_sha256:string;output_version:string;
  status:string;instruction:string;updated_at:string;node_debug_id?:string;max_output_chars:4000
}
export type WorkflowOutputLoop={node_id:string;round:number;total:number}
export type WorkflowLatestNodeOutput={node_id:string;title:string;node_type:WorkflowNodeType;node_status:"pending"|"active"|"waiting"|"done"|"skipped"|"failed";output_text?:string;loop_path?:WorkflowOutputLoop[]}
export type WorkflowHistoricalNodeOutput={node_id:string;title:string;node_type:WorkflowNodeType;step_key:string;status:"succeeded"|"skipped";output_text:string;branch?:"true"|"false";round?:number;total?:number;loop_path?:WorkflowOutputLoop[]}
export type WorkflowLatestOutputs={format:"workflow_v2_outputs_v1";kind:"latest";run:WorkflowOutputHeader;nodes:WorkflowLatestNodeOutput[]}
export type WorkflowOutputHistory={format:"workflow_v2_outputs_v1";kind:"history";run:WorkflowOutputHeader;items:WorkflowHistoricalNodeOutput[];total:number;next_after:string|null}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,nodeId=/^[A-Za-z0-9_-]{1,80}$/,stepId=/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$/,sha=/^[a-f0-9]{64}$/
const nodeTypes=new Set(["start","end","model","agent","tool","condition","loop"])
function invalid():never{throw Error("invalid_workflow_output_response")}
function object(raw:unknown){if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid();return raw as Record<string,unknown>}
function keys(value:Record<string,unknown>,required:readonly string[],optional:readonly string[]=[]){if(required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))invalid()}
function text(value:unknown,max:number,required=false){if(typeof value!=="string"||value.length>max||value.includes("\0")||required&&!value.trim())invalid();return value}
function integer(value:unknown,min:number,max:number){if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)invalid();return value as number}
function id(value:unknown,pattern:RegExp){if(typeof value!=="string"||!pattern.test(value))invalid();return value}
function loopPath(raw:unknown):WorkflowOutputLoop[]{
  if(!Array.isArray(raw)||!raw.length||raw.length>20)invalid()
  const ids=new Set<string>();return raw.map(value=>{
    const item=object(value);keys(item,["node_id","round","total"])
    const node_id=id(item.node_id,nodeId),round=integer(item.round,1,20),total=integer(item.total,1,20)
    if(ids.has(node_id)||round>total)invalid();ids.add(node_id);return {node_id,round,total}
  })
}
export function validWorkflowOutputCursor(value:string){return typeof value==="string"&&(value===""||stepId.test(value))}
function header(raw:unknown,expectedRunId?:string):WorkflowOutputHeader{
  const value=object(raw);keys(value,["run_id","workflow_id","workflow_revision","graph_sha256","output_version","status","instruction","updated_at","max_output_chars"],["node_debug_id"])
  const run_id=id(value.run_id,uuid)
  if(expectedRunId&&run_id!==expectedRunId||value.max_output_chars!==4000||typeof value.status!=="string"||!["queued","running","awaiting_approval","paused","succeeded","failed","cancelled"].includes(value.status))invalid()
  return {run_id,workflow_id:id(value.workflow_id,uuid),workflow_revision:integer(value.workflow_revision,1,Number.MAX_SAFE_INTEGER),graph_sha256:id(value.graph_sha256,sha),output_version:id(value.output_version,sha),
    status:value.status as string,instruction:text(value.instruction,2000),updated_at:text(value.updated_at,80,true),max_output_chars:4000,...(Object.hasOwn(value,"node_debug_id")?{node_debug_id:id(value.node_debug_id,nodeId)}:{})}
}
function common(value:Record<string,unknown>){
  if(typeof value.node_type!=="string"||!nodeTypes.has(value.node_type))invalid()
  return {node_id:id(value.node_id,nodeId),title:text(value.title,120,true),node_type:value.node_type as WorkflowNodeType}
}
export function parseWorkflowLatestOutputs(raw:unknown,expectedRunId?:string):WorkflowLatestOutputs{
  const value=object(raw);keys(value,["format","kind","run","nodes"])
  if(value.format!=="workflow_v2_outputs_v1"||value.kind!=="latest"||!Array.isArray(value.nodes)||value.nodes.length<2||value.nodes.length>40)invalid()
  const seen=new Set<string>(),nodes=value.nodes.map(rawNode=>{
    const node=object(rawNode);keys(node,["node_id","title","node_type","node_status"],["output_text","loop_path"])
    const base=common(node)
    if(seen.has(base.node_id)||typeof node.node_status!=="string"||!["pending","active","waiting","done","skipped","failed"].includes(node.node_status))invalid();seen.add(base.node_id)
    if(Object.hasOwn(node,"output_text")&&!["done","skipped"].includes(node.node_status))invalid()
    return {...base,node_status:node.node_status as WorkflowLatestNodeOutput["node_status"],...(Object.hasOwn(node,"output_text")?{output_text:text(node.output_text,4000)}:{}),...(Object.hasOwn(node,"loop_path")?{loop_path:loopPath(node.loop_path)}:{})}
  })
  const run=header(value.run,expectedRunId)
  if(nodes.some(node=>node.loop_path?.some(loop=>loop.node_id===node.node_id||!nodes.some(ref=>ref.node_id===loop.node_id&&ref.node_type==="loop"))))invalid()
  if(run.node_debug_id&&(nodes.length!==3||!nodes.some(node=>node.node_id===run.node_debug_id&&node.node_type==="model")))invalid()
  return {format:"workflow_v2_outputs_v1",kind:"latest",run,nodes}
}
export function parseWorkflowOutputHistory(raw:unknown,expectedRunId?:string):WorkflowOutputHistory{
  const value=object(raw);keys(value,["format","kind","run","items","total","next_after"])
  if(value.format!=="workflow_v2_outputs_v1"||value.kind!=="history"||!Array.isArray(value.items)||value.items.length>50)invalid()
  let last=""
  const items=value.items.map(rawItem=>{
    const item=object(rawItem);keys(item,["node_id","title","node_type","step_key","status","output_text"],["branch","round","total","loop_path"])
    const base=common(item),step_key=id(item.step_key,stepId)
    if(step_key<=last||step_key.slice(10)!==base.node_id||typeof item.status!=="string"||!["succeeded","skipped"].includes(item.status))invalid();last=step_key
    if(Object.hasOwn(item,"branch")&&item.branch!=="true"&&item.branch!=="false")invalid()
    if(Object.hasOwn(item,"round")!==Object.hasOwn(item,"total"))invalid()
    return {...base,step_key,status:item.status as WorkflowHistoricalNodeOutput["status"],output_text:text(item.output_text,4000),
      ...(item.branch?{branch:item.branch as "true"|"false"}:{}),...(Object.hasOwn(item,"round")?{round:integer(item.round,0,20),total:integer(item.total,0,20)}:{}),...(Object.hasOwn(item,"loop_path")?{loop_path:loopPath(item.loop_path)}:{})}
  })
  const total=integer(value.total,0,10000)
  if(total<items.length||value.next_after!==null&&(typeof value.next_after!=="string"||!stepId.test(value.next_after)||!items.length||value.next_after!==last))invalid()
  return {format:"workflow_v2_outputs_v1",kind:"history",run:header(value.run,expectedRunId),items,total,next_after:value.next_after as string|null}
}
