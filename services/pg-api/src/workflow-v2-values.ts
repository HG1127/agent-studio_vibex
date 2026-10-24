// Browser-safe deterministic value rules shared by previews and persisted replay.
import type {WorkflowNodeDataV2} from "./workflow-graph-v2.ts"
export class WorkflowValueError extends Error{readonly code:string;constructor(code:string){super(code);this.code=code}}
const fail=(code:string):never=>{throw new WorkflowValueError(code)}
export function renderWorkflowTemplate(source:string,resolve:(key:string)=>string|undefined,jsonStrings=false){
  const missing=new Set<string>(),pieces:string[]=[]
  let length=0,last=0,inString=false,escaped=false
  const scan=(text:string)=>{if(!jsonStrings)return;for(const character of text){
    if(escaped){escaped=false;continue}
    if(inString&&character==="\\"){escaped=true;continue}
    if(character==='"')inString=!inString
  }}
  const add=(value:string)=>{length+=value.length;if(length>12000)fail("workflow_rendered_input_too_large");pieces.push(value)}
  for(const match of source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)){
    const literal=source.slice(last,match.index);add(literal);scan(literal);last=match.index!+match[0].length
    const key=match[1]!.trim();let value=resolve(key)
    if(value===undefined){missing.add(key);value=""}
    if(jsonStrings&&inString){
      if(escaped)fail("workflow_tool_template_invalid")
      add(JSON.stringify(value).slice(1,-1))
    }else{add(value);scan(value)}
  }
  add(source.slice(last));return {text:pieces.join(""),missing:[...missing]}
}
export function workflowCondition(input:string,op:WorkflowNodeDataV2["op"]="contains",value=""){
  let yes=false
  if(op==="contains")yes=value!==""&&input.includes(value)
  else if(op==="not_contains")yes=value!==""&&!input.includes(value)
  else{const match=input.match(/-?\d+(?:\.\d+)?/),a=match?parseFloat(match[0]):NaN,b=parseFloat(value)
    if(Number.isNaN(a)||Number.isNaN(b))yes=op==="eq"&&input===value
    else yes=op==="gt"?a>b:op==="lt"?a<b:a===b}
  return {branch:yes?"true" as const:"false" as const,output:(yes?"条件满足":"条件不满足")+"（规则："+op+" "+value+"）"}
}
export function workflowLoopItems(data:WorkflowNodeDataV2,rendered={text:"",missing:[] as string[]}){
  const max=data.max_iterations??10
  if(data.mode==="count")return {items:Array.from({length:Math.min(data.count!,max)},(_,i)=>String(i+1)),missing:[] as string[]}
  let items:string[]
  if(data.delimiter==="json_array"){
    let raw:unknown;try{raw=JSON.parse(rendered.text)}catch{fail("workflow_loop_list_invalid")}
    if(!Array.isArray(raw))fail("workflow_loop_list_invalid")
    items=(raw as unknown[]).slice(0,50).map(item=>item===null?"":typeof item==="object"?JSON.stringify(item):String(item))
  }else items=rendered.text.split(data.delimiter==="comma"?/[,，]/:/\r?\n/)
  return {items:items.map(item=>item.trim()).filter(Boolean).slice(0,Math.min(50,max)),missing:rendered.missing}
}
