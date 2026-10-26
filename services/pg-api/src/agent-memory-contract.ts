import {createHash} from "node:crypto"
import {HttpError,isUuid} from "./contracts.ts"
import {sanitizeAgentMemoryText} from "./agent-memory-selection.ts"
const invalid=():never=>{throw new HttpError(400,"invalid_agent_memory_request")}
export const agentMemoryHash=(text:string)=>createHash("sha256").update(text).digest("hex")
type Common={request_id:string;spec_id:string;confirm:true}
export type RememberAgentMemory=Common&{action:"remember";expected_revision:number;fact:string;content_sha256:string;request_sha256:string}
export type ForgetAgentMemory=Common&{action:"forget";memory_id:string;expected_sha256:string;request_sha256:string}
export type AgentMemoryChange=RememberAgentMemory|ForgetAgentMemory
export function parseAgentMemoryChange(raw:unknown):AgentMemoryChange{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid()
  const v=raw as Record<string,unknown>,base=["action","request_id","spec_id","confirm"],remember=v.action==="remember"
  if(!remember&&v.action!=="forget")invalid()
  const keys=[...base,...(remember?["expected_revision","fact"]:["memory_id","expected_sha256"])]
  if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||v.confirm!==true||!isUuid(v.request_id)||!isUuid(v.spec_id))invalid()
  const common={request_id:String(v.request_id).toLowerCase(),spec_id:String(v.spec_id).toLowerCase(),confirm:true as const}
  if(remember){
    if(!Number.isSafeInteger(v.expected_revision)||Number(v.expected_revision)<1||typeof v.fact!=="string"||!v.fact.trim()||v.fact.length>500||v.fact.includes("\0"))invalid()
    const revision=Number(v.expected_revision),fact=sanitizeAgentMemoryText((v.fact as string).trim())
    return {...common,action:"remember",expected_revision:revision,fact,content_sha256:agentMemoryHash(fact),
      request_sha256:agentMemoryHash(JSON.stringify({...common,action:"remember",expected_revision:revision,fact_sha256:agentMemoryHash(v.fact as string)}))}
  }
  if(!isUuid(v.memory_id)||typeof v.expected_sha256!=="string"||!/^[a-f0-9]{64}$/.test(v.expected_sha256))invalid()
  const memory_id=String(v.memory_id).toLowerCase(),expected_sha256=v.expected_sha256 as string
  return {...common,action:"forget",memory_id,expected_sha256,request_sha256:agentMemoryHash(JSON.stringify({...common,action:"forget",memory_id,expected_sha256}))}
}
