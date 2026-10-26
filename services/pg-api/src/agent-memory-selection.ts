// Pure compatibility rules only. Callers must verify current Native owner,
// role and original source/knowledge evidence BEFORE supplying memory rows.
// This module installs no persistence, provider call, route or authority.
import {HttpError,isUuid} from "./contracts.ts"
export type AgentMemoryKind="user"|"fact"|"lesson"
export type AgentMemoryCandidate={id:string;kind:AgentMemoryKind;fact:string;tools_used:string}
export type AgentMemoryHint={id:string;kind:AgentMemoryKind;fact_preview:string;hint:string;score:number}
const labels:Record<AgentMemoryKind,string>={user:"用户指令",fact:"经验",lesson:"教训"}
const invalid=():never=>{throw new HttpError(400,"invalid_agent_memory_input")}
function bounded(value:unknown,max:number,nonempty=false):value is string{return typeof value==="string"&&value.length<=max&&!value.includes("\0")&&(!nonempty||!!value.trim())}
export function sanitizeAgentMemoryText(value:string):string{
  if(typeof value!=="string"||value.includes("\0"))invalid()
  return value.replace(/sk-[A-Za-z0-9_-]{8,}/g,"***").replace(/Bearer\s+\S+/g,"Bearer ***")
    .replace(/token=\S+/g,"token=***").replace(/api_key=\S+/g,"api_key=***")
}
export function explicitAgentMemory(instruction:string,scheduled=false):{task:string;fact:string|null}{
  if(!bounded(instruction,2000,true)||typeof scheduled!=="boolean")invalid()
  if(scheduled)return {task:instruction,fact:null}
  const match=instruction.match(/(?:^|\n)[ \t]*(?:请|麻烦)?(?:帮我)?记住[ \t]*[:：]?[ \t]*([^。；;\n！!？?]+)/)
  if(!match?.[1])return {task:instruction,fact:null}
  const fact=sanitizeAgentMemoryText(match[1].trim()).slice(0,500)
  if(!fact)return {task:instruction,fact:null}
  const rest=instruction.replace(match[0],"").replace(/^[。；;\s，,]+/,"").trim()
  return {task:rest||fact,fact}
}
function tokens(value:string):Set<string>{
  const result=new Set<string>()
  for(const word of value.toLowerCase().split(/[^0-9a-z\u4e00-\u9fff]+/)){
    if(!word)continue
    if(/^[0-9a-z]+$/.test(word)){if(word.length>=2)result.add(word)}
    else{if(word.length===1)result.add(word);for(let i=0;i+1<word.length;i++)result.add(word.slice(i,i+2))}
  }
  return result
}
function candidate(raw:unknown):AgentMemoryCandidate{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid()
  const value=raw as Record<string,unknown>,names=["id","kind","fact","tools_used"]
  if(Reflect.ownKeys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name))||!isUuid(value.id)||
    typeof value.kind!=="string"||!Object.hasOwn(labels,value.kind)||!bounded(value.fact,500,true)||!bounded(value.tools_used,300))invalid()
  return {id:String(value.id).toLowerCase(),kind:value.kind as AgentMemoryKind,fact:value.fact as string,tools_used:value.tools_used as string}
}
export function selectAgentMemoryHints(instruction:string,verifiedRows:unknown):AgentMemoryHint[]{
  if(!bounded(instruction,2000,true)||!Array.isArray(verifiedRows)||verifiedRows.length>50)invalid()
  const wanted=tokens(instruction),ids=new Set<string>()
  const scored=(verifiedRows as unknown[]).map((raw,index)=>{
    const row=candidate(raw);if(ids.has(row.id))invalid();ids.add(row.id)
    // Redact even an unexpected stale/legacy row before constructing a hint.
    const fact=sanitizeAgentMemoryText(row.fact),tools=sanitizeAgentMemoryText(row.tools_used)
    const score=[...tokens(fact)].filter(token=>wanted.has(token)).length
    return {id:row.id,kind:row.kind,fact_preview:fact.slice(0,120),score,index,
      hint:"【"+labels[row.kind]+"】"+fact.slice(0,300)+(tools?"（当时用过工具："+tools.slice(0,100)+"）":"")}
  })
  // verifiedRows must already be latest-first; stable ties retain that order.
  return scored.filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).map(({index,...row})=>row)
}
