// Owner response choices only. No route, checkpoint mutation or resume authority
// is installed by this pure contract; the server must derive the pending input.
import {HttpError,isUuid} from "./contracts.ts"
export type AgentHumanResponse={
  request_id:string;pending_step_key:string;pending_sha256:string;source_sha256:string
  decision:"reply"|"approve"|"revise";answer:string;confirm:true
}
function refuse():never{throw new HttpError(400,"invalid_agent_human_response")}
export function parseAgentHumanResponse(raw:unknown):AgentHumanResponse{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))refuse()
  const item=raw as Record<string,unknown>,keys=["request_id","pending_step_key","pending_sha256","source_sha256","decision","answer","confirm"]
  if(Reflect.ownKeys(item).length!==keys.length||keys.some(key=>!Object.hasOwn(item,key))||!isUuid(item.request_id)||item.confirm!==true||
    typeof item.pending_step_key!=="string"||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,140}$/.test(item.pending_step_key)||
    typeof item.pending_sha256!=="string"||!/^[a-f0-9]{64}$/.test(item.pending_sha256)||
    typeof item.source_sha256!=="string"||!/^[a-f0-9]{64}$/.test(item.source_sha256)||
    (item.decision!=="reply"&&item.decision!=="approve"&&item.decision!=="revise")||typeof item.answer!=="string"||item.answer.length>1600||item.answer.includes("\0"))refuse()
  const answer=item.answer.trim()
  if(item.decision!=="approve"&&!answer)refuse()
  return {request_id:item.request_id.toLowerCase(),pending_step_key:item.pending_step_key,pending_sha256:item.pending_sha256,source_sha256:item.source_sha256,
    decision:item.decision as AgentHumanResponse["decision"],answer,confirm:true}
}
