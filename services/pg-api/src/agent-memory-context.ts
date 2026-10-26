// Pure context rules. Callers must first resolve memory rows in the verified
// owner transaction. This module neither reads SQL nor changes execution.
import {HttpError,isUuid} from "./contracts.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {explicitAgentMemory,sanitizeAgentMemoryText,selectAgentMemoryHints} from "./agent-memory-selection.ts"
type SourceRow={id:string;kind:"user";fact:string;tools_used:"";content_sha256:string}
type MemoryRef={id:string;content_sha256:string}
type ContextMemory=MemoryRef&{kind:"user";hint:string}
export type AgentMemoryContext={protocol:"agent_memory_context_v1";owner_user_id:string;spec_id:string;spec_revision:number;
  request_instruction_sha256:string;effective_task:string;remembered:MemoryRef|null;memories:ContextMemory[]}
type Scope={owner_user_id:string;spec_id:string;spec_revision:number;instruction:string}
const invalid=():never=>{throw new HttpError(409,"agent_memory_context_unavailable")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  return raw as Record<string,unknown>
}
const exact=(v:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const sha=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)
function scope(raw:Scope):Scope{
  if(!isUuid(raw.owner_user_id)||!isUuid(raw.spec_id)||!Number.isSafeInteger(raw.spec_revision)||raw.spec_revision<1||
    typeof raw.instruction!=="string"||!raw.instruction.trim()||raw.instruction.length>2000||raw.instruction.includes("\0"))return invalid()
  return {...raw,owner_user_id:raw.owner_user_id.toLowerCase(),spec_id:raw.spec_id.toLowerCase()}
}
function reference(raw:unknown):MemoryRef{
  const v=object(raw);if(!exact(v,["id","content_sha256"])||!isUuid(v.id)||v.id!==String(v.id).toLowerCase()||!sha(v.content_sha256))return invalid()
  return {id:v.id as string,content_sha256:v.content_sha256 as string}
}
function rows(raw:unknown,limit:number):SourceRow[]{
  if(!Array.isArray(raw)||raw.length>limit)return invalid()
  const seen=new Set<string>()
  return raw.map(item=>{
    const v=object(item)
    if(!exact(v,["id","kind","fact","tools_used","content_sha256"])||!isUuid(v.id)||v.id!==String(v.id).toLowerCase()||seen.has(String(v.id))||v.kind!=="user"||v.tools_used!==""||
      typeof v.fact!=="string"||!v.fact.trim()||v.fact.length>500||v.fact.includes("\0")||v.fact!==sanitizeAgentMemoryText(v.fact)||v.content_sha256!==agentMemoryHash(v.fact))return invalid()
    seen.add(String(v.id));return {id:v.id as string,kind:"user",fact:v.fact as string,tools_used:"",content_sha256:v.content_sha256 as string}
  })
}
export function parseAgentMemoryContext(raw:unknown,rawScope:Scope):AgentMemoryContext{
  const v=object(raw),s=scope(rawScope),directive=explicitAgentMemory(s.instruction)
  if(!exact(v,["protocol","owner_user_id","spec_id","spec_revision","request_instruction_sha256","effective_task","remembered","memories"])||
    v.protocol!=="agent_memory_context_v1"||v.owner_user_id!==s.owner_user_id||v.spec_id!==s.spec_id||v.spec_revision!==s.spec_revision||
    v.request_instruction_sha256!==agentMemoryHash(s.instruction)||v.effective_task!==directive.task||!Array.isArray(v.memories)||v.memories.length>3)return invalid()
  const remembered=v.remembered===null?null:reference(v.remembered)
  if(directive.fact?!remembered||remembered.content_sha256!==agentMemoryHash(directive.fact):remembered!==null)return invalid()
  const seen=new Set<string>(),memories=(v.memories as unknown[]).map(rawMemory=>{
    const m=object(rawMemory)
    if(!exact(m,["id","kind","content_sha256","hint"])||!isUuid(m.id)||m.id!==String(m.id).toLowerCase()||seen.has(String(m.id))||
      m.kind!=="user"||!sha(m.content_sha256)||typeof m.hint!=="string"||!m.hint.startsWith("【用户指令】")||m.hint.length>306||m.hint.includes("\0")||m.hint!==sanitizeAgentMemoryText(m.hint))return invalid()
    seen.add(String(m.id));return {id:m.id as string,kind:"user" as const,content_sha256:m.content_sha256 as string,hint:m.hint as string}
  })
  return {protocol:"agent_memory_context_v1",owner_user_id:s.owner_user_id,spec_id:s.spec_id,spec_revision:s.spec_revision,
    request_instruction_sha256:agentMemoryHash(s.instruction),effective_task:directive.task,remembered,memories}
}
export function buildAgentMemoryContext(rawScope:Scope,verifiedLatestRows:unknown,rememberedId:string|null=null):AgentMemoryContext{
  const s=scope(rawScope),source=rows(verifiedLatestRows,50),directive=explicitAgentMemory(s.instruction)
  let remembered:MemoryRef|null=null
  if(directive.fact){
    const row=source.find(r=>r.id===rememberedId)
    if(!row||row.fact!==directive.fact)return invalid()
    remembered={id:row.id,content_sha256:row.content_sha256}
  }else if(rememberedId!==null)return invalid()
  const selected=selectAgentMemoryHints(directive.task,source.map(({id,kind,fact,tools_used})=>({id,kind,fact,tools_used})))
  const memories=selected.map(item=>({id:item.id,kind:"user" as const,content_sha256:source.find(r=>r.id===item.id)!.content_sha256,hint:item.hint}))
  return parseAgentMemoryContext({protocol:"agent_memory_context_v1",owner_user_id:s.owner_user_id,spec_id:s.spec_id,spec_revision:s.spec_revision,
    request_instruction_sha256:agentMemoryHash(s.instruction),effective_task:directive.task,remembered,memories},s)
}
export function agentMemoryContextHash(raw:unknown,s:Scope):string{return agentMemoryHash(JSON.stringify(parseAgentMemoryContext(raw,s)))}
export function verifyAgentMemoryContextRows(raw:unknown,s:Scope,verifiedCurrentRows:unknown):AgentMemoryContext{
  const value=parseAgentMemoryContext(raw,s),source=rows(verifiedCurrentRows,4),expected=new Set(value.memories.map(m=>m.id))
  if(value.remembered)expected.add(value.remembered.id)
  if(source.length!==expected.size||source.some(row=>!expected.has(row.id)))return invalid()
  for(const memory of value.memories){
    const row=source.find(r=>r.id===memory.id)
    if(!row||row.content_sha256!==memory.content_sha256)return invalid()
    const hint=selectAgentMemoryHints(value.effective_task,[{id:row.id,kind:row.kind,fact:row.fact,tools_used:""}])[0]
    if(!hint||hint.hint!==memory.hint)return invalid()
  }
  if(value.remembered){const row=source.find(r=>r.id===value.remembered!.id)
    if(!row||row.content_sha256!==value.remembered.content_sha256||row.fact!==explicitAgentMemory(s.instruction).fact)return invalid()}
  return value
}
