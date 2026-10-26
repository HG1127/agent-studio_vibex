import {parseAgentHumanResponse,type AgentHumanResponse} from "../../services/pg-api/src/agent-human-input-contract.ts"
export type {AgentHumanResponse}
export type PgNativeAgentHumanInput={pending_step_key:string;pending_sha256:string;source_sha256:string;kind:"clarification"|"plan_review";question:string;draft:string;round:number}
export type PgNativeAgentHumanReceipt={run_id:string;request_id:string;pending_step_key:string;pending_sha256:string;source_sha256:string;decision:AgentHumanResponse["decision"];recorded:true;status:"queued";replayed:boolean}
const exact=(raw:Record<string,unknown>,keys:string)=>Object.keys(raw).sort().join(",")===keys
const object=(raw:unknown):Record<string,unknown>=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid_agent_human_projection")
  return raw as Record<string,unknown>
}
export function agentHumanChoice(raw:unknown):AgentHumanResponse{return parseAgentHumanResponse(raw)}
export function agentHumanReceipt(raw:unknown,run:string,choice:AgentHumanResponse,confirmOnly=false):PgNativeAgentHumanReceipt{
  const r=object(raw)
  if(!exact(r,"decision,pending_sha256,pending_step_key,recorded,replayed,request_id,run_id,source_sha256,status")||
    r.run_id!==run||r.request_id!==choice.request_id||r.pending_step_key!==choice.pending_step_key||r.pending_sha256!==choice.pending_sha256||
    r.source_sha256!==choice.source_sha256||r.decision!==choice.decision||r.recorded!==true||r.status!=="queued"||typeof r.replayed!=="boolean"||confirmOnly&&r.replayed!==true)
    throw Error("unconfirmed_agent_human_response")
  return r as PgNativeAgentHumanReceipt
}
export function agentHumanProjection<T extends {run:{status:string};pending_effect:unknown;human_input_current?:boolean;human_input?:PgNativeAgentHumanInput|null}>(result:T):T{
  const present=Object.hasOwn(result,"human_input_current")||Object.hasOwn(result,"human_input")
  if(!present){if(result.run.status==="awaiting_input")throw Error("invalid_agent_human_projection");return result}
  if(typeof result.human_input_current!=="boolean"||!Object.hasOwn(result,"human_input"))throw Error("invalid_agent_human_projection")
  const pending=result.human_input
  if(pending===null){if(result.run.status==="awaiting_input"&&result.human_input_current)throw Error("invalid_agent_human_projection");return result}
  const p=object(pending)
  if(!exact(p,"draft,kind,pending_sha256,pending_step_key,question,round,source_sha256")||result.run.status!=="awaiting_input"||result.human_input_current!==true||result.pending_effect!==null||
    !/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,140}$/.test(String(p.pending_step_key))||!String(p.pending_step_key).endsWith("_input")||
    !/^[a-f0-9]{64}$/.test(String(p.pending_sha256))||!/^[a-f0-9]{64}$/.test(String(p.source_sha256))||
    (p.kind!=="clarification"&&p.kind!=="plan_review")||typeof p.question!=="string"||!p.question.trim()||p.question.length>8000||p.question.includes("\0")||
    typeof p.draft!=="string"||p.draft.length>12000||p.draft.includes("\0")||p.kind==="clarification"&&p.draft!==""||!Number.isSafeInteger(p.round)||Number(p.round)<1||Number(p.round)>30)
    throw Error("invalid_agent_human_projection")
  return result
}
