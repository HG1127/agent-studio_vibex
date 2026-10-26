// Text preparation only. Callers must separately verify the original owned run,
// current transitive sources and any paid extraction consent. No writes or I/O.
import {HttpError} from "./contracts.ts"
import {sanitizeAgentMemoryText} from "./agent-memory-selection.ts"
const invalid=():never=>{throw new HttpError(400,"invalid_agent_memory_derived_text")}
function text(raw:unknown,max:number):string{
  if(typeof raw!=="string"||raw.length>max||raw.includes("\0"))return invalid()
  for(const c of raw)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalid()
  return sanitizeAgentMemoryText(raw)
}
function clip(value:string,max:number):string{
  const end=value.length>max&&value.charCodeAt(max-1)>=0xd800&&value.charCodeAt(max-1)<=0xdbff?max-1:max
  return value.slice(0,end)
}
function tools(raw:unknown):string{
  if(!Array.isArray(raw)||raw.length>64)return invalid()
  const names=raw.map(value=>{const name=text(value,100).trim();if(!name||/[\u0000-\u001f\u007f,]/.test(name))return invalid();return name})
  return clip([...new Set(names)].join(","),300)
}
export function successfulMemoryFallback(result:unknown,usedTools:unknown):{kind:"fact";fact:string;tools_used:string}|null{
  const value=text(result,20000),tools_used=tools(usedTools)
  return value.trim()?{kind:"fact",fact:clip(value,500),tools_used}:null
}
export function failedMemoryLesson(status:unknown,instruction:unknown,error:unknown):{kind:"lesson";fact:string;tools_used:""}|null{
  if(status!=="failed"&&status!=="cancelled")return invalid()
  const task=text(instruction,2000),reason=text(error,1000)
  return status==="cancelled"?null:{kind:"lesson",fact:clip("教训："+clip(task,120)+" → "+clip(reason,300),500),tools_used:""}
}
export function feedbackMemoryLesson(rating:unknown,instruction:unknown,rawTags:unknown,comment:unknown):{kind:"lesson";fact:string;tools_used:""}|null{
  if(rating!=="up"&&rating!=="down"||!Array.isArray(rawTags)||rawTags.length>8)return invalid()
  const task=text(instruction,2000),tags=rawTags.map(tag=>text(tag,20).trim()).filter(Boolean),note=text(comment,500)
  const tail=tags.join("、")+(note?(tags.length?" ":"")+note:"")
  return rating==="up"?null:{kind:"lesson",fact:clip("用户反馈："+clip(task,100)+" → "+clip(tail,300),500),tools_used:""}
}
export function memoryRefinementInput(instruction:unknown,result:unknown,usedTools:unknown):{instruction:string;result:string;tools_used:string}{
  return {instruction:clip(text(instruction,2000),600),result:clip(text(result,20000),1500),tools_used:tools(usedTools)}
}
