import {isUuid} from "../../services/pg-api/src/contracts.ts"
import {sanitizeAgentMemoryText} from "../../services/pg-api/src/agent-memory-selection.ts"
export type PgNativeMemoryChoice={action:"remember";request_id:string;spec_id:string;expected_revision:number;fact:string;confirm:true}|
  {action:"forget";request_id:string;spec_id:string;memory_id:string;expected_sha256:string;confirm:true}
export type PgNativeMemoryReceipt={request_id:string;memory_id:string;spec_id:string;action:"remember"|"forget";content_sha256:string;recorded:true;replayed:boolean}
export type PgNativeMemoryItem={id:string;kind:"user";fact:string;content_sha256:string;created_at:string;tools_used:"";run_id:null}
export type PgNativeMemoryPage={spec_id:string;items:PgNativeMemoryItem[];limit:50}
const hashPattern=/^[a-f0-9]{64}$/
const invalid=():never=>{throw Error("invalid_agent_memory_projection")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  return raw as Record<string,unknown>
}
const exact=(r:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k))
const text=(s:unknown,max:number):s is string=>typeof s==="string"&&s.length<=max&&!s.includes("\0")
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("")
export function agentMemoryChoice(raw:unknown):PgNativeMemoryChoice{
  const v=object(raw),common=["action","request_id","spec_id","confirm"],remember=v.action==="remember"
  if(!remember&&v.action!=="forget"||!exact(v,[...common,...(remember?["expected_revision","fact"]:["memory_id","expected_sha256"])])||
    !isUuid(v.request_id)||!isUuid(v.spec_id)||v.confirm!==true)return invalid()
  const base={request_id:String(v.request_id).toLowerCase(),spec_id:String(v.spec_id).toLowerCase(),confirm:true as const}
  if(remember){
    if(!Number.isSafeInteger(v.expected_revision)||Number(v.expected_revision)<1||!text(v.fact,500)||!(v.fact as string).trim())return invalid()
    return {...base,action:"remember",expected_revision:Number(v.expected_revision),fact:v.fact as string}
  }
  if(!isUuid(v.memory_id)||typeof v.expected_sha256!=="string"||!hashPattern.test(v.expected_sha256))return invalid()
  return {...base,action:"forget",memory_id:String(v.memory_id).toLowerCase(),expected_sha256:v.expected_sha256}
}
export async function agentMemoryReceipt(raw:unknown,choice:PgNativeMemoryChoice,confirmOnly=false):Promise<PgNativeMemoryReceipt>{
  const r=object(raw),memory=choice.action==="remember"?choice.request_id:choice.memory_id
  const expected=choice.action==="remember"?await digest(sanitizeAgentMemoryText(choice.fact.trim())):choice.expected_sha256
  if(!exact(r,["request_id","memory_id","spec_id","action","content_sha256","recorded","replayed"])||r.request_id!==choice.request_id||r.memory_id!==memory||r.spec_id!==choice.spec_id||
    r.action!==choice.action||r.content_sha256!==expected||r.recorded!==true||typeof r.replayed!=="boolean"||confirmOnly&&r.replayed!==true)return invalid()
  return r as PgNativeMemoryReceipt
}
export async function agentMemoryPage(raw:unknown,spec:string):Promise<PgNativeMemoryPage>{
  const page=object(raw)
  if(!exact(page,["spec_id","items","limit"])||page.spec_id!==spec||page.limit!==50||!Array.isArray(page.items)||page.items.length>50)return invalid()
  const seen=new Set<string>();let previousTime=Infinity
  for(const rawItem of page.items){
    const r=object(rawItem),time=typeof r.created_at==="string"?Date.parse(r.created_at):NaN
    if(!exact(r,["id","kind","fact","content_sha256","created_at","tools_used","run_id"])||!isUuid(r.id)||r.id!==String(r.id).toLowerCase()||seen.has(String(r.id))||
      r.kind!=="user"||!text(r.fact,500)||!(r.fact as string).trim()||r.fact!==sanitizeAgentMemoryText(r.fact as string)||r.content_sha256!==await digest(r.fact as string)||
      !Number.isFinite(time)||time>previousTime||r.tools_used!==""||r.run_id!==null)return invalid()
    seen.add(String(r.id));previousTime=time
  }
  return page as PgNativeMemoryPage
}
