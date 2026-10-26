// Closed owner intents only. The repository must resolve the original run and
// current source proof; callers can never submit derived text, kind or tools.
import {HttpError,isUuid} from "./contracts.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
type Save={action:"save_success"|"save_failure";request_id:string;spec_id:string;source_run_id:string;expected_source_sha256:string;confirm:true;request_sha256:string}
type Forget={action:"forget";request_id:string;spec_id:string;memory_id:string;expected_content_sha256:string;expected_tools_sha256:string;confirm:true;request_sha256:string}
export type AgentMemoryDerivedChange=Save|Forget
const invalid=():never=>{throw new HttpError(400,"invalid_agent_memory_derived_change")}
const sha=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)
function id(v:unknown):string{if(!isUuid(v))return invalid();return v.toLowerCase()}
export function parseAgentMemoryDerivedChange(raw:unknown):AgentMemoryDerivedChange{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid()
  const v=raw as Record<string,unknown>,save=v.action==="save_success"||v.action==="save_failure"
  if(!save&&v.action!=="forget")return invalid()
  const keys=["action","request_id","spec_id","confirm",...(save?["source_run_id","expected_source_sha256"]:["memory_id","expected_content_sha256","expected_tools_sha256"])]
  if(Reflect.ownKeys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k))||v.confirm!==true)return invalid()
  const request_id=id(v.request_id),spec_id=id(v.spec_id)
  if(save){
    if(!sha(v.expected_source_sha256))return invalid()
    const action=v.action as Save["action"],source_run_id=id(v.source_run_id),expected_source_sha256=v.expected_source_sha256
    return {action,request_id,spec_id,source_run_id,expected_source_sha256,confirm:true,
      request_sha256:agentMemoryHash(JSON.stringify(["agent_memory_derived_intent_v1",action,request_id,spec_id,source_run_id,expected_source_sha256]))}
  }
  if(!sha(v.expected_content_sha256)||!sha(v.expected_tools_sha256))return invalid()
  const memory_id=id(v.memory_id);if(memory_id===request_id)return invalid()
  return {action:"forget",request_id,spec_id,memory_id,expected_content_sha256:v.expected_content_sha256,expected_tools_sha256:v.expected_tools_sha256,confirm:true,
    request_sha256:agentMemoryHash(JSON.stringify(["agent_memory_derived_intent_v1","forget",request_id,spec_id,memory_id,v.expected_content_sha256,v.expected_tools_sha256]))}
}
