// Inert protocol values only. Native admission and Worker execution separately
// verify the original owner, governance, lease, schema and current sources.
import {HttpError,isUuid} from "./contracts.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
export const OUTCOME_MEMORY_PROTOCOL="agent_memory_outcome_v1" as const
export type OutcomeMemoryConsent={owner_user_id:string;run_id:string;spec_id:string;spec_revision:number;owner_epoch:number;protocol:typeof OUTCOME_MEMORY_PROTOCOL;instruction_sha256:string;graph_sha256:string;intent_sha256:string;memory_id:string}
export type OutcomeMemoryStop={request_id:string;run_id:string;expected_intent_sha256:string;confirm:true}
const invalid=():never=>{throw new HttpError(400,"invalid_agent_memory_outcome_intent")}
function object(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  return raw as Record<string,unknown>
}
const exact=(v:Record<string,unknown>,keys:string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const sha=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)
function uuid(v:unknown):string{if(!isUuid(v))return invalid();return v.toLowerCase()}
function revision(v:unknown):number{if(!Number.isSafeInteger(v)||Number(v)<1||Number(v)>9007199254740990)return invalid();return Number(v)}
export function outcomeMemoryOption(value:unknown,present:boolean):boolean{
  if(!present)return false
  if(typeof value!=="boolean")return invalid()
  return value
}
export function outcomeMemoryId(owner:string,run:string,intent:string):string{
  const who=uuid(owner),id=uuid(run);if(!sha(intent))return invalid()
  const h=agentMemoryHash(["agent_memory_outcome_slot_v1",who,id,intent].join("|"))
  return h.slice(0,8)+"-"+h.slice(8,12)+"-8"+h.slice(13,16)+"-8"+h.slice(17,20)+"-"+h.slice(20,32)
}
export function outcomeMemoryConsent(raw:unknown):OutcomeMemoryConsent{
  const v=object(raw)
  if(!exact(v,["owner_user_id","run_id","spec_id","spec_revision","owner_epoch","instruction","graph_sha256"])||
    typeof v.instruction!=="string"||!v.instruction.trim()||v.instruction.length>2000||v.instruction.includes("\0")||!sha(v.graph_sha256))return invalid()
  for(const c of v.instruction)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalid()
  const owner_user_id=uuid(v.owner_user_id),run_id=uuid(v.run_id),spec_id=uuid(v.spec_id),spec_revision=revision(v.spec_revision),owner_epoch=revision(v.owner_epoch)
  const instruction_sha256=agentMemoryHash(v.instruction),graph_sha256=v.graph_sha256
  const intent_sha256=agentMemoryHash([OUTCOME_MEMORY_PROTOCOL,owner_user_id,run_id,spec_id,spec_revision,owner_epoch,instruction_sha256,graph_sha256].join("|"))
  return {owner_user_id,run_id,spec_id,spec_revision,owner_epoch,protocol:OUTCOME_MEMORY_PROTOCOL,instruction_sha256,graph_sha256,intent_sha256,memory_id:outcomeMemoryId(owner_user_id,run_id,intent_sha256)}
}
export function outcomeMemoryStop(raw:unknown):OutcomeMemoryStop{
  const v=object(raw)
  if(!exact(v,["request_id","run_id","expected_intent_sha256","confirm"])||v.confirm!==true||!sha(v.expected_intent_sha256))return invalid()
  return {request_id:uuid(v.request_id),run_id:uuid(v.run_id),expected_intent_sha256:v.expected_intent_sha256,confirm:true}
}
export function outcomeMemoryStopHash(owner:string,choice:OutcomeMemoryStop):string{
  const checked=outcomeMemoryStop(choice)
  return agentMemoryHash(["agent_memory_outcome_stop_v1",uuid(owner),checked.run_id,checked.request_id,checked.expected_intent_sha256].join("|"))
}
