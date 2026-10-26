// Text preparation only. Callers must separately verify the original owned run,
// current transitive sources and any paid extraction consent. No writes or I/O.
import {HttpError} from "./contracts.ts"
import {sanitizeAgentMemoryText} from "./agent-memory-selection.ts"
const invalid=():never=>{throw new HttpError(400,"invalid_agent_memory_derived_text")}
function text(raw:unknown,max:number):string{
  if(typeof raw!=="string"||raw.length>max||raw.includes("\0"))return invalid()
  return sanitizeAgentMemoryText(raw)
}
function tools(raw:unknown):string{
  if(!Array.isArray(raw)||raw.length>64)return invalid()
  const names=raw.map(value=>{const name=text(value,100).trim();if(!name||/[\u0000-\u001f\u007f,]/.test(name))return invalid();return name})
  return [...new Set(names)].join(",").slice(0,300)
}
export function successfulMemoryFallback(result:unknown,usedTools:unknown):{kind:"fact";fact:string;tools_used:string}|null{
  const value=text(result,20000),tools_used=tools(usedTools)
  return value.trim()?{kind:"fact",fact:value.slice(0,500),tools_used}:null
}
export function failedMemoryLesson(status:unknown,instruction:unknown,error:unknown):{kind:"lesson";fact:string;tools_used:""}|null{
  if(status!=="failed"&&status!=="cancelled")return invalid()
  const task=text(instruction,2000),reason=text(error,1000)
  return status==="cancelled"?null:{kind:"lesson",fact:("教训："+task.slice(0,120)+" → "+reason.slice(0,300)).slice(0,500),tools_used:""}
}
export function feedbackMemoryLesson(rating:unknown,instruction:unknown,rawTags:unknown,comment:unknown):{kind:"lesson";fact:string;tools_used:""}|null{
  if(rating!=="up"&&rating!=="down"||!Array.isArray(rawTags)||rawTags.length>8)return invalid()
  const task=text(instruction,2000),tags=rawTags.map(tag=>text(tag,20).trim()).filter(Boolean),note=text(comment,500)
  const tail=tags.join("、")+(note?(tags.length?" ":"")+note:"")
  return rating==="up"?null:{kind:"lesson",fact:("用户反馈："+task.slice(0,100)+" → "+tail.slice(0,300)).slice(0,500),tools_used:""}
}
export function memoryRefinementInput(instruction:unknown,result:unknown,usedTools:unknown):{instruction:string;result:string;tools_used:string}{
  return {instruction:text(instruction,2000).slice(0,600),result:text(result,20000).slice(0,1500),tools_used:tools(usedTools)}
}
