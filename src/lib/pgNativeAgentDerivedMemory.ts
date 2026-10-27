import {isUuid} from "../../services/pg-api/src/contracts.ts"
import {redactResultText} from "../../services/pg-api/src/public-result-text.ts"
export type PgNativeDerivedMemoryChoice={action:"save_success"|"save_failure";request_id:string;spec_id:string;source_run_id:string;expected_source_sha256:string;confirm:true}|
  {action:"forget";request_id:string;spec_id:string;memory_id:string;expected_content_sha256:string;expected_tools_sha256:string;confirm:true}
export type PgNativeDerivedMemoryReceipt={request_id:string;memory_id:string;spec_id:string;source_run_id:string;action:"save_success"|"save_failure"|"forget";kind:"fact"|"lesson";source_sha256:string;content_sha256:string;tools_sha256:string;recorded:true;replayed:boolean}
export type PgNativeDerivedMemoryPreview={spec_id:string;run_id:string;kind:"fact"|"lesson";source_sha256:string;fact:string;tools_used:string;content_sha256:string;tools_sha256:string}
export type PgNativeDerivedMemoryItem={id:string;spec_id:string;run_id:string;kind:"fact"|"lesson";source_sha256:string;content_sha256:string;tools_sha256:string;created_at:string;source_current:boolean;fact:string|null;tools_used:string|null}
export type PgNativeDerivedMemoryPage={spec_id:string;items:PgNativeDerivedMemoryItem[];limit:50}
const invalid=():never=>{throw Error("invalid_agent_derived_memory_projection")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  return raw as Record<string,unknown>
}
const exact=(v:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)
const id=(v:unknown):v is string=>isUuid(v)&&v===v.toLowerCase()
const kind=(v:unknown)=>v==="fact"||v==="lesson"
function text(value:unknown,max:number,nonempty=false):value is string{
  if(typeof value!=="string"||value.length>max||value.includes("\0")||nonempty&&!value.trim()||redactResultText(value)!==value)return false
  for(const c of value)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return false
  return true
}
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("")
async function content(v:Record<string,unknown>){
  if(!text(v.fact,500,true)||!text(v.tools_used,300)||/[\u0000-\u001f\u007f]/.test(v.tools_used)||v.content_sha256!==await digest(v.fact)||v.tools_sha256!==await digest(v.tools_used))return invalid()
}
export function agentDerivedMemoryChoice(raw:unknown):PgNativeDerivedMemoryChoice{
  const v=object(raw),save=v.action==="save_success"||v.action==="save_failure"
  if(!save&&v.action!=="forget"||!exact(v,["action","request_id","spec_id","confirm",...(save?["source_run_id","expected_source_sha256"]:["memory_id","expected_content_sha256","expected_tools_sha256"])])||!isUuid(v.request_id)||!isUuid(v.spec_id)||v.confirm!==true)return invalid()
  const common={request_id:v.request_id.toLowerCase(),spec_id:v.spec_id.toLowerCase(),confirm:true as const}
  if(save){if(!isUuid(v.source_run_id)||!hash(v.expected_source_sha256))return invalid();return {...common,action:v.action as "save_success"|"save_failure",source_run_id:v.source_run_id.toLowerCase(),expected_source_sha256:v.expected_source_sha256}}
  if(!isUuid(v.memory_id)||v.memory_id.toLowerCase()===common.request_id||!hash(v.expected_content_sha256)||!hash(v.expected_tools_sha256))return invalid()
  return {...common,action:"forget",memory_id:v.memory_id.toLowerCase(),expected_content_sha256:v.expected_content_sha256,expected_tools_sha256:v.expected_tools_sha256}
}
export function agentDerivedMemoryReceipt(raw:unknown,choice:PgNativeDerivedMemoryChoice,confirmOnly=false):PgNativeDerivedMemoryReceipt{
  const v=object(raw)
  if(!exact(v,["request_id","memory_id","spec_id","source_run_id","action","kind","source_sha256","content_sha256","tools_sha256","recorded","replayed"])||v.request_id!==choice.request_id||v.spec_id!==choice.spec_id||v.action!==choice.action||!id(v.source_run_id)||!kind(v.kind)||!hash(v.source_sha256)||!hash(v.content_sha256)||!hash(v.tools_sha256)||v.recorded!==true||typeof v.replayed!=="boolean"||confirmOnly&&v.replayed!==true)return invalid()
  if(choice.action==="forget"){
    if(v.memory_id!==choice.memory_id||v.content_sha256!==choice.expected_content_sha256||v.tools_sha256!==choice.expected_tools_sha256)return invalid()
  }else if(v.memory_id!==choice.request_id||v.source_run_id!==choice.source_run_id||v.source_sha256!==choice.expected_source_sha256||v.kind!==(choice.action==="save_success"?"fact":"lesson"))return invalid()
  return v as PgNativeDerivedMemoryReceipt
}
export async function agentDerivedMemoryPreview(raw:unknown,specId:string,runId:string):Promise<PgNativeDerivedMemoryPreview>{
  const v=object(raw)
  if(!exact(v,["spec_id","run_id","kind","source_sha256","fact","tools_used","content_sha256","tools_sha256"])||v.spec_id!==specId||v.run_id!==runId||!kind(v.kind)||!hash(v.source_sha256))return invalid()
  await content(v);return v as PgNativeDerivedMemoryPreview
}
export async function agentDerivedMemoryPage(raw:unknown,specId:string):Promise<PgNativeDerivedMemoryPage>{
  const page=object(raw)
  if(!exact(page,["spec_id","items","limit"])||page.spec_id!==specId||page.limit!==50||!Array.isArray(page.items)||page.items.length>50)return invalid()
  const seen=new Set<string>();let previous=Infinity
  for(const item of page.items){
    const v=object(item),time=typeof v.created_at==="string"?Date.parse(v.created_at):NaN
    if(!exact(v,["id","spec_id","run_id","kind","source_sha256","content_sha256","tools_sha256","created_at","source_current","fact","tools_used"])||!id(v.id)||seen.has(v.id)||v.spec_id!==specId||!id(v.run_id)||!kind(v.kind)||!hash(v.source_sha256)||!hash(v.content_sha256)||!hash(v.tools_sha256)||!Number.isFinite(time)||time>previous||typeof v.source_current!=="boolean")return invalid()
    if(v.source_current)await content(v);else if(v.fact!==null||v.tools_used!==null)return invalid()
    seen.add(v.id);previous=time
  }
  return page as PgNativeDerivedMemoryPage
}
