// Deterministic Workflow interpreter. Replays bounded committed transitions;
// it never performs I/O, imports a provider/tool, or treats a request as a result.
import {createHash} from "node:crypto"
import {renderWorkflowTemplate,workflowCondition,workflowLoopItems,WorkflowValueError} from "./workflow-v2-values.ts"
import {HttpError,safeWorkflowGraph,type WorkflowGraph,type WorkflowNode} from "./contracts.ts"

export type WorkflowEffectRequest={
  step_key:string;node_id:string;kind:"model"|"tool"|"agent";input:string
  input_sha256:string;configuration:WorkflowNode["data"];missing:string[]
  agent_context?:{parent_step_key:string;round:number;phase:"model"|"tool"}
}
export type WorkflowEffectResult={step_key:string;input_sha256:string;output:string;outcome?:"rejected"}
export type WorkflowV2Checkpoint={
  format:"workflow_native_v2";graph_sha256:string;instruction:string
  cursor:number;effects:WorkflowEffectResult[]
}
export type WorkflowNodeTransition={
  step_key:string;node_id:string;node_type:string
  status:"running"|"awaiting_approval"|"succeeded"|"skipped"|"failed"
  output?:string;missing?:string[];branch?:"true"|"false";round?:number;total?:number
  agent_context?:WorkflowEffectRequest["agent_context"]
}
type NodeState={status:"pending"|"active"|"waiting"|"done"|"skipped"|"failed";key?:string;output?:string}
type Frame={id:string;items:string[];round:number;active:boolean;key:string}
type Signal="unknown"|"live"|"dead"
export type WorkflowV2View={
  status:"running"|"waiting"|"succeeded"|"failed";executions:number;error_code:string
  result_text:string;pending:WorkflowEffectRequest|null
  nodes:{id:string;status:NodeState["status"];output?:string}[]
  loops:{id:string;round:number;total:number;active:boolean}[]
}
const sha=(text:string)=>createHash("sha256").update(text).digest("hex")
function fail(code:string):never{throw new HttpError(409,code)}
const code=(error:unknown)=>error instanceof HttpError||error instanceof WorkflowValueError?error.code:"workflow_machine_failed"
const plain=(raw:unknown):Record<string,unknown>=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(raw)))fail("invalid_workflow_checkpoint")
  return raw as Record<string,unknown>
}
function graph(raw:unknown):WorkflowGraph{
  const value=safeWorkflowGraph(raw)
  if(value.version!==2)fail("workflow_v2_required")
  return value
}
function checkpoint(raw:unknown,hash:string):WorkflowV2Checkpoint{
  const value=plain(raw)
  if(Object.keys(value).length!==5||!["format","graph_sha256","instruction","cursor","effects"].every(k=>Object.hasOwn(value,k))||
     value.format!=="workflow_native_v2"||value.graph_sha256!==hash||
     typeof value.instruction!=="string"||value.instruction.length>1200||value.instruction.includes("\0")||
     !Number.isSafeInteger(value.cursor)||(value.cursor as number)<0||(value.cursor as number)>401||
     !Array.isArray(value.effects)||value.effects.length>200)fail("invalid_workflow_checkpoint")
  const effects:WorkflowEffectResult[]=[],seen=new Set<string>()
  for(const rawResult of value.effects){
    const item=plain(rawResult)
    if(Object.keys(item).some(k=>!["step_key","input_sha256","output","outcome"].includes(k))||
       !["step_key","input_sha256","output"].every(k=>Object.hasOwn(item,k))||
       (Object.hasOwn(item,"outcome")&&item.outcome!=="rejected")||
       typeof item.step_key!=="string"||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$/.test(item.step_key)||
       seen.has(item.step_key)||typeof item.input_sha256!=="string"||!/^[a-f0-9]{64}$/.test(item.input_sha256)||
       typeof item.output!=="string"||item.output.length>4000||item.output.includes("\0"))fail("invalid_workflow_checkpoint")
    effects.push({step_key:item.step_key,input_sha256:item.input_sha256,output:item.output,
      ...(item.outcome==="rejected"?{outcome:"rejected" as const}:{})});seen.add(item.step_key)
  }
  return {format:"workflow_native_v2",graph_sha256:hash,instruction:value.instruction,
    cursor:value.cursor as number,effects}
}

class Machine{
  readonly graph:WorkflowGraph;readonly cp:WorkflowV2Checkpoint
  readonly nodes=new Map<string,NodeState>();readonly signals=new Map<string,Signal>()
  readonly frames=new Map<string,Frame>();readonly bodies=new Map<string,Set<string>>()
  readonly returns=new Set<string>();readonly requests=new Map<string,string>()
  readonly results:Map<string,WorkflowEffectResult>;readonly signatures=new Map<string,number>()
  status:WorkflowV2View["status"]="running";error="";result="";executions=0;seq=0
  pending:WorkflowEffectRequest|null=null;events:WorkflowNodeTransition[]=[]
  constructor(graph:WorkflowGraph,cp:WorkflowV2Checkpoint){
    this.graph=graph;this.cp=cp;this.results=new Map(cp.effects.map(item=>[item.step_key,item]))
    for(const node of graph.nodes)this.nodes.set(node.id,{status:"pending"})
    for(const edge of graph.edges)this.signals.set(edge.id,"unknown")
    for(const loop of graph.nodes.filter(node=>node.type==="loop")){
      const body=new Set<string>(),queue=[graph.edges.find(e=>e.source===loop.id&&!e.sourceHandle)!.target]
      for(let i=0;i<queue.length;i++){
        const id=queue[i]!
        if(id===loop.id||body.has(id))continue
        body.add(id);for(const edge of graph.edges.filter(e=>e.source===id))queue.push(edge.target)
      }
      this.bodies.set(loop.id,body)
      for(const edge of graph.edges)if(edge.target===loop.id&&body.has(edge.source))this.returns.add(edge.id)
    }
  }
  key(node:WorkflowNode){
    const state=this.nodes.get(node.id)!
    if(!state.key){if(++this.seq>10000)fail("workflow_step_budget_exceeded")
      state.key="wf2_"+String(this.seq).padStart(5,"0")+"_"+node.id}
    return state.key
  }
  emit(node:WorkflowNode,status:WorkflowNodeTransition["status"],extra:Partial<WorkflowNodeTransition>={}){
    const key=this.key(node)
    this.events.push({step_key:key,node_id:node.id,node_type:node.type,status,...extra});return key
  }
  template(source:string,nodeId:string,jsonStrings=false):{text:string;missing:string[]}{
    const frames=[...this.frames.values()].filter(f=>f.active&&this.bodies.get(f.id)!.has(nodeId))
      .sort((a,b)=>this.bodies.get(a.id)!.size-this.bodies.get(b.id)!.size)
    const frame=frames[0]
    return renderWorkflowTemplate(source,key=>{
      if(key==="input")return this.cp.instruction
      if(key==="loop.item"&&frame)return frame.items[frame.round-1]??""
      if(key==="loop.index"&&frame)return String(frame.round)
      if(key.endsWith(".output")){
        const ref=this.graph.nodes.find(n=>n.data.title===key.slice(0,-7))
        if(ref)return this.nodes.get(ref.id)!.output
      }
      return undefined
    },jsonStrings)
  }
  forwardIncoming(id:string){return this.graph.edges.filter(e=>e.target===id&&!this.returns.has(e.id))}
  ready(id:string){
    const incoming=this.forwardIncoming(id)
    return incoming.length>0&&incoming.every(e=>this.signals.get(e.id)!=="unknown")
  }
  outputFromIncoming(id:string){
    for(const edge of this.forwardIncoming(id))if(this.signals.get(edge.id)==="live"){
      const output=this.nodes.get(edge.source)!.output;if(output!==undefined)return output
    }
    return ""
  }
  done(node:WorkflowNode,output:string,extra:Partial<WorkflowNodeTransition>={}){
    const state=this.nodes.get(node.id)!;state.status="done";state.output=output.slice(0,4000)
    this.emit(node,"succeeded",{output:state.output,...extra})
    for(const edge of this.graph.edges.filter(e=>e.source===node.id))
      this.signals.set(edge.id,node.type==="condition"&&edge.sourceHandle!==extra.branch?"dead":"live")
  }
  finishLoop(node:WorkflowNode,frame:Frame,output:string,reason:string){
    frame.active=false
    const summary="循环结束，共执行 "+frame.round+" 轮"+(reason?"（"+reason+"）":"")
    const text=frame.round===0?"列表为空，共执行 0 轮":(output?output+"\n\n":"")+"（"+summary+"）"
    const state=this.nodes.get(node.id)!;state.status="done";state.output=text.slice(0,4000)
    this.emit(node,"succeeded",{output:state.output,round:frame.round,total:frame.items.length})
    for(const edge of this.graph.edges.filter(e=>e.source===node.id&&e.sourceHandle==="done"))this.signals.set(edge.id,"live")
  }
  startRound(node:WorkflowNode,frame:Frame){
    const body=this.bodies.get(node.id)!
    for(const id of body){this.nodes.set(id,{status:"pending"});this.frames.delete(id)}
    for(const edge of this.graph.edges)if(body.has(edge.source)||body.has(edge.target))this.signals.set(edge.id,"unknown")
    const entry=this.graph.edges.find(e=>e.source===node.id&&!e.sourceHandle)!
    this.signals.set(entry.id,"live")
  }
  settle(){
    let changed=true,passes=0
    while(changed){
      if(++passes>1000)fail("workflow_state_did_not_settle")
      changed=false
      for(const node of this.graph.nodes){
        const state=this.nodes.get(node.id)!
        if(state.status!=="pending"||!this.ready(node.id))continue
        if(this.forwardIncoming(node.id).some(e=>this.signals.get(e.id)==="live"))continue
        state.status="skipped";delete state.output;this.emit(node,"skipped")
        for(const edge of this.graph.edges.filter(e=>e.source===node.id))this.signals.set(edge.id,"dead")
        changed=true
      }
      // Join all returns in a round before advancing, so a dead branch cannot
      // prematurely skip a live branch or complete the same loop twice.
      for(const node of this.graph.nodes.filter(n=>n.type==="loop")){
        const frame=this.frames.get(node.id)
        if(!frame?.active)continue
        const incoming=this.graph.edges.filter(e=>e.target===node.id&&this.returns.has(e.id))
        if(!incoming.every(e=>this.signals.get(e.id)!=="unknown"))continue
        const chosen=incoming.find(e=>this.signals.get(e.id)==="live")
        if(!chosen)fail("workflow_loop_has_no_live_return")
        const output=this.nodes.get(chosen.source)!.output??""
        if(node.data.stop_keyword&&output.includes(node.data.stop_keyword))
          this.finishLoop(node,frame,output,"命中提前终止关键词「"+node.data.stop_keyword+"」")
        else if(frame.round>=frame.items.length)this.finishLoop(node,frame,output,
          node.data.mode==="count"?"已完成设定次数":"列表项已遍历完")
        else{frame.round++;this.startRound(node,frame)}
        changed=true
      }
    }
  }
  loopItems(node:WorkflowNode):{items:string[];missing:string[]}{
    return workflowLoopItems(node.data,node.data.mode==="count"?undefined:this.template(node.data.list_source??"",node.id))
  }
  step():WorkflowNodeTransition[]|null{
    if(this.status==="succeeded"||this.status==="failed")return null
    this.events=[];let current:WorkflowNode|undefined
    try{
      if(this.pending){
        const result=this.results.get(this.pending.step_key)
        if(!result)return null
        if(result.input_sha256!==this.pending.input_sha256)fail("workflow_effect_result_conflict")
        current=this.graph.nodes.find(n=>n.id===this.pending!.node_id)!
        if(result.outcome==="rejected"){
          const state=this.nodes.get(current.id)!;state.status="skipped";state.output=result.output
          this.emit(current,"skipped",{output:result.output})
          for(const edge of this.graph.edges.filter(e=>e.source===current!.id))this.signals.set(edge.id,"live")
        }else this.done(current,result.output,{missing:this.pending.missing})
        this.pending=null;this.status="running"
        this.settle();return this.events
      }
      current=this.graph.nodes.find(node=>this.nodes.get(node.id)!.status==="pending"&&
        (node.type==="start"||this.ready(node.id)&&this.forwardIncoming(node.id).some(e=>this.signals.get(e.id)==="live")))
      if(!current)fail("workflow_no_ready_node")
      if(this.executions>=200)fail("workflow_execution_budget_exceeded")
      this.executions++
      const node=current!,state=this.nodes.get(node.id)!
      this.key(node)
      if(node.type==="start")this.done(node,this.cp.instruction)
      else if(node.type==="end"){
        const rendered=node.data.output_template?this.template(node.data.output_template,node.id):{text:this.outputFromIncoming(node.id),missing:[]}
        this.done(node,rendered.text,{missing:rendered.missing});this.result=rendered.text.slice(0,20000);this.status="succeeded"
      }else if(node.type==="condition"){
        const ref=node.data.ref_title?this.graph.nodes.find(n=>n.data.title===node.data.ref_title):undefined
        const input=ref&&this.nodes.get(ref.id)!.output!==undefined?this.nodes.get(ref.id)!.output!:this.outputFromIncoming(node.id)
        const result=workflowCondition(input,node.data.op,node.data.value)
        this.done(node,result.output,{branch:result.branch})
      }else if(node.type==="loop"){
        const items=this.loopItems(node);state.status="active"
        const key=this.emit(node,"running",{round:items.items.length?1:0,total:items.items.length,missing:items.missing})
        const frame:Frame={id:node.id,items:items.items,round:items.items.length?1:0,active:true,key}
        this.frames.set(node.id,frame)
        if(items.items.length)this.startRound(node,frame)
        else{
          const entry=this.graph.edges.find(e=>e.source===node.id&&!e.sourceHandle)!;this.signals.set(entry.id,"dead")
          this.finishLoop(node,frame,"","列表为空，直接退出")
        }
      }else{
        if(node.type==="model"&&!node.data.model_binding)fail("workflow_model_binding_missing")
        if(node.type==="agent"&&!node.data.agent_binding)fail("workflow_agent_binding_missing")
        if(node.type==="tool"&&(!node.data.tool&&!node.data.tool_binding||node.data.tool_binding_required))fail("workflow_tool_binding_missing")
        const template=node.type==="tool"?(node.data.params_template||"{}"):
          node.type==="agent"?(node.data.prompt||"{{input}}"):node.data.prompt??""
        const rendered=node.type==="model"&&node.data.prompt_format==="literal"?{text:template,missing:[]}:this.template(template,node.id,node.type==="tool")
        if(!rendered.text.trim())fail("workflow_effect_input_empty")
        const signature=sha(node.id+"\0"+rendered.text),count=(this.signatures.get(signature)??0)+1
        if(this.results.get(state.key!)?.outcome!=="rejected"){
          this.signatures.set(signature,count);if(count>=3)fail("workflow_stuck_loop_detected")
        }
        state.status="waiting";const key=this.emit(node,"awaiting_approval",{missing:rendered.missing})
        const payload={step_key:key,node_id:node.id,kind:node.type,input:rendered.text,configuration:node.data}
        const inputHash=sha(JSON.stringify({graph_sha256:this.cp.graph_sha256,...payload}))
        this.pending={...payload,kind:node.type,input_sha256:inputHash,missing:rendered.missing}
        this.requests.set(key,inputHash);this.status="waiting"
      }
      if(this.status==="running")this.settle()
      return this.events
    }catch(error){
      this.status="failed";this.error=code(error)
      if(current&&this.nodes.get(current.id)!.key){this.nodes.get(current.id)!.status="failed";this.emit(current,"failed")}
      return this.events
    }
  }
  view():WorkflowV2View{return {status:this.status,executions:this.executions,error_code:this.error,result_text:this.result,
    pending:this.pending,nodes:[...this.nodes].map(([id,value])=>({id,status:value.status,...(value.output!==undefined?{output:value.output}:{})})),
    loops:[...this.frames.values()].map(frame=>({id:frame.id,round:frame.round,total:frame.items.length,active:frame.active}))}}
}

function restore(rawGraph:unknown,raw:unknown){
  const checked=graph(rawGraph),hash=sha(JSON.stringify(checked)),cp=checkpoint(raw,hash),machine=new Machine(checked,cp)
  for(let cursor=0;cursor<cp.cursor;cursor++)if(machine.step()===null)fail("invalid_workflow_checkpoint")
  for(const result of cp.effects)if(machine.requests.get(result.step_key)!==result.input_sha256)fail("invalid_workflow_checkpoint")
  return {cp,machine}
}
export function createWorkflowV2Checkpoint(rawGraph:unknown,instruction:string):WorkflowV2Checkpoint{
  const checked=graph(rawGraph)
  return checkpoint({format:"workflow_native_v2",graph_sha256:sha(JSON.stringify(checked)),instruction,cursor:0,effects:[]},sha(JSON.stringify(checked)))
}
export function inspectWorkflowV2Checkpoint(rawGraph:unknown,raw:unknown):WorkflowV2View{
  return restore(rawGraph,raw).machine.view()
}
export function advanceWorkflowV2Checkpoint(rawGraph:unknown,raw:unknown){
  const {cp,machine}=restore(rawGraph,raw),events=machine.step()
  return {checkpoint:events===null?cp:{...cp,cursor:cp.cursor+1},view:machine.view(),events:events??[],progressed:events!==null}
}
export function recordWorkflowV2EffectResult(rawGraph:unknown,raw:unknown,result:WorkflowEffectResult):WorkflowV2Checkpoint{
  const {cp,machine}=restore(rawGraph,raw)
  // Validate primitive fields before comparing, serializing or returning them.
  const validated=checkpoint({...cp,effects:[result]},cp.graph_sha256).effects[0]!
  const prior=cp.effects.find(item=>item.step_key===validated.step_key)
  if(prior){if(prior.input_sha256!==validated.input_sha256||prior.output!==validated.output||prior.outcome!==validated.outcome)fail("workflow_effect_result_conflict");return cp}
  if(!machine.pending||machine.pending.step_key!==validated.step_key||machine.pending.input_sha256!==validated.input_sha256)
    fail("workflow_effect_result_conflict")
  return checkpoint({...cp,effects:[...cp.effects,validated]},cp.graph_sha256)
}
