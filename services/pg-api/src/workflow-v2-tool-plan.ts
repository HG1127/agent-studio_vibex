// Pure bounded tool argument/configuration rendering. No eval, network or keys.
import {isIP} from "node:net"
import type {WorkflowEffectRequest} from "./workflow-v2-machine.ts"
import {WorkflowKnownEffectFailure} from "./workflow-v2-effect-failure.ts"
export type ToolArguments=Record<string,unknown>
export type WorkflowToolPlan=
  |{kind:"calculate";expression:string;output:string}
  |{kind:"summarize";prompt:string;binding:NonNullable<WorkflowEffectRequest["configuration"]["model_binding"]>}
  |{kind:"knowledge_search";query:string;ids:string[]}
  |{kind:"web_fetch";url:string}
  |{kind:"web_search";query:string;limit:number}
  |{kind:"http";args:ToolArguments;binding:NonNullable<WorkflowEffectRequest["configuration"]["tool_binding"]>}
  |{kind:"mcp";args:ToolArguments;binding:NonNullable<WorkflowEffectRequest["configuration"]["mcp_binding"]>}
function invalid():never{throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")}
function text(value:unknown,max:number,empty=false):string{
  if(typeof value!=="string"||value.length>max||value.includes("\0")||(!empty&&!value.trim()))invalid()
  return value
}
function depth(value:unknown,n=0):void{
  if(n>12)invalid()
  if(value&&typeof value==="object"){
    if(Object.keys(value).length>100)invalid()
    for(const [key,entry] of Object.entries(value)){
      if(["__proto__","prototype","constructor"].includes(key))invalid()
      depth(entry,n+1)
    }
  }
}
export function safeWorkflowToolArguments(raw:string):ToolArguments{
  if(typeof raw!=="string"||raw.length>12000||raw.includes("\0"))invalid()
  let args:unknown;try{args=JSON.parse(raw)}catch{invalid()}
  if(!args||typeof args!=="object"||Array.isArray(args))invalid()
  depth(args);return args as ToolArguments
}
export function safeToolDestination(raw:unknown,protocols:readonly string[]=["https:"]):URL{
  const input=text(raw,6000)
  let url:URL;try{url=new URL(input)}catch{invalid()}
  const host=url.hostname.toLowerCase()
  if(!protocols.includes(url.protocol)||url.username||url.password||url.hash||isIP(host)!==0||
     !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(host)||
     /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|arpa|svc)$/.test(host)||
     (url.port&&url.port!==(url.protocol==="https:"?"443":"80"))||/[\u0000-\u0020\u007f\\]/.test(input))invalid()
  return url
}
export function evaluateWorkflowArithmetic(raw:string):number{
  const source=text(raw,512).replace(/\s/g,"")
  if(!/^[0-9+\-*/%().]+$/.test(source))throw new WorkflowKnownEffectFailure("workflow_calculation_invalid")
  let cursor=0,level=0,tokens=0
  const fail=():never=>{throw new WorkflowKnownEffectFailure("workflow_calculation_invalid")}
  function factor():number{
    if(++tokens>256||++level>32)fail()
    const op=source[cursor];let value:number
    if(op==="+"||op==="-"){cursor++;value=factor()*(op==="-"?-1:1)}
    else if(op==="("){cursor++;value=expression();if(source[cursor++]!==")")fail()}
    else{const found=/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/.exec(source.slice(cursor));if(!found)throw new WorkflowKnownEffectFailure("workflow_calculation_invalid")
      cursor+=found[0].length;value=Number(found[0])}
    level--;if(!Number.isFinite(value))fail();return value
  }
  function term():number{
    let value=factor()
    while(["*","/","%"].includes(source[cursor]??"")){
      const op=source[cursor++]!,right=factor();if((op==="/"||op==="%")&&right===0)fail()
      value=op==="*"?value*right:op==="/"?value/right:value%right;if(!Number.isFinite(value))fail()
    }return value
  }
  function expression():number{let value=term();while(source[cursor]==="+"||source[cursor]==="-"){
    const op=source[cursor++]!;value=op==="+"?value+term():value-term();if(!Number.isFinite(value))fail()
  }return value}
  const output=expression();if(cursor!==source.length)fail();return output
}
export function prepareWorkflowTool(request:WorkflowEffectRequest):WorkflowToolPlan{
  if(request.kind!=="tool")invalid()
  const config=request.configuration,args=safeWorkflowToolArguments(request.input)
  if(config.mcp_binding){
    if(config.tool||config.tool_binding||config.model_binding||config.knowledge_base_ids)invalid()
    return {kind:"mcp",args,binding:{...config.mcp_binding}}
  }
  if(config.tool_binding)return {kind:"http",args,binding:{...config.tool_binding}}
  const allowed:Record<string,string[]>={calculate:["expression"],summarize:["text","focus"],knowledge_search:["query"],web_fetch:["url"],web_search:["query","limit"]}
  if(!config.tool||!Object.hasOwn(allowed,config.tool)||Object.keys(args).some(key=>!allowed[config.tool!]!.includes(key)))invalid()
  if(config.tool==="calculate"){
    const expression=text(args.expression,512),value=evaluateWorkflowArithmetic(expression)
    return {kind:"calculate",expression,output:expression+" = "+String(value)}
  }
  if(config.tool==="summarize"){
    if(!config.model_binding)throw new WorkflowKnownEffectFailure("workflow_tool_model_binding_missing")
    const content=text(args.text,6000),focus=args.focus===undefined?"":text(args.focus,500,true)
    return {kind:"summarize",binding:{...config.model_binding},prompt:"请整理并总结以下文本"+(focus?"（关注重点："+focus+"）":"")+
      "，直接输出整理后的要点，不要寒暄：\n\n"+content}
  }
  if(config.tool==="knowledge_search")return {kind:"knowledge_search",query:text(args.query,80).trim(),ids:[...(config.knowledge_base_ids??[])]}
  if(config.tool==="web_fetch")return {kind:"web_fetch",url:safeToolDestination(text(args.url,2000),["http:","https:"]).toString()}
  const limit=args.limit===undefined?5:args.limit
  if(!Number.isSafeInteger(limit)||(limit as number)<1||(limit as number)>10)invalid()
  return {kind:"web_search",query:text(args.query,500).trim(),limit:limit as number}
}
// Preserve the old connection template semantics: {{input}} is raw parameter
// JSON; named fields are URL-encoded. Never substitute into an origin/header.
export function applyWorkflowToolTemplate(template:string,args:ToolArguments):string{
  const output=template.replace(/\{\{\s*([a-zA-Z0-9_一-龥]+)\s*\}\}/g,(_,key:string)=>{
    if(key==="input")return JSON.stringify(args)
    const value=Object.hasOwn(args,key)?args[key]:""
    return encodeURIComponent(typeof value==="object"?JSON.stringify(value):String(value??""))
  })
  if(output.length>65536||output.includes("\0"))invalid()
  return output
}
