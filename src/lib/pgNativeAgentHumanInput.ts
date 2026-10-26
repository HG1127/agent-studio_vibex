import {parseAgentHumanResponse,type AgentHumanResponse} from "../../services/pg-api/src/agent-human-input-contract.ts"
export type {AgentHumanResponse}
export type PgNativeAgentHumanInput={pending_step_key:string;pending_sha256:string;source_sha256:string;kind:"clarification"|"plan_review";question:string;draft:string;round:number}
export type PgNativeAgentHumanReceipt={run_id:string;request_id:string;pending_step_key:string;pending_sha256:string;source_sha256:string;decision:AgentHumanResponse["decision"];recorded:true;status:"queued";replayed:boolean}
export type PgNativeHumanHistory={request_id:string;step_key:string;parent_step_key:string;node_id:string;node_title:string;kind:"clarification"|"plan_review";question:string;draft:string;round:number;decision:AgentHumanResponse["decision"];answer:string}
export type PgNativeHumanHistoryPage={run_id:string;available:boolean;items:PgNativeHumanHistory[];next_after:string|null}
const historyCursor=/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,140}_input$/
export function validHumanHistoryQuery(after:string,limit:number){return typeof after==="string"&&(after===""||historyCursor.test(after))&&Number.isSafeInteger(limit)&&limit>=1&&limit<=20}
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
export function agentHumanProjection<T extends {run:{status:string};pending_effect:unknown;human_input_evidence_current?:boolean;human_input_current?:boolean;human_input?:PgNativeAgentHumanInput|null}>(result:T):T{
  if(Object.hasOwn(result,"human_input_evidence_current")&&typeof result.human_input_evidence_current!=="boolean")throw Error("invalid_agent_human_projection")
  const present=Object.hasOwn(result,"human_input_current")||Object.hasOwn(result,"human_input")
  if(!present){if(result.run.status==="awaiting_input")throw Error("invalid_agent_human_projection");return result}
  if(typeof result.human_input_current!=="boolean"||!Object.hasOwn(result,"human_input")||result.human_input_evidence_current===false&&result.human_input_current)throw Error("invalid_agent_human_projection")
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
export function agentHumanHistory(raw:unknown,run:string,after:string,limit:number):PgNativeHumanHistoryPage{
  const r=object(raw)
  if(!exact(r,"available,items,next_after,run_id")||r.run_id!==run||typeof r.available!=="boolean"||!Array.isArray(r.items)||r.items.length>limit||
    r.available===false&&(r.items.length!==0||r.next_after!==null)||r.next_after!==null&&(typeof r.next_after!=="string"||!historyCursor.test(r.next_after)||r.items.length!==limit))throw Error("invalid_agent_human_history")
  let previous=after;const requests=new Set<string>()
  for(const rawItem of r.items){
    const item=object(rawItem)
    if(!exact(item,"answer,decision,draft,kind,node_id,node_title,parent_step_key,question,request_id,round,step_key")||
      typeof item.step_key!=="string"||!historyCursor.test(item.step_key)||item.step_key<=previous||typeof item.request_id!=="string"||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item.request_id)||requests.has(item.request_id)||
      typeof item.parent_step_key!=="string"||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$/.test(item.parent_step_key)||
      typeof item.node_id!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(item.node_id)||typeof item.node_title!=="string"||!item.node_title.trim()||item.node_title.length>120||item.node_title.includes("\0")||
      !Number.isSafeInteger(item.round)||Number(item.round)<1||Number(item.round)>30||item.step_key!==item.parent_step_key+"_a"+String(item.round).padStart(2,"0")+"m_input"||
      !["clarification","plan_review"].includes(String(item.kind))||!["reply","approve","revise"].includes(String(item.decision))||(item.kind==="clarification")!==(item.decision==="reply")||
      typeof item.question!=="string"||!item.question.trim()||item.question.length>8000||item.question.includes("\0")||typeof item.draft!=="string"||item.draft.length>12000||item.draft.includes("\0")||item.kind==="clarification"&&item.draft!==""||
      typeof item.answer!=="string"||item.answer.length>1600||item.answer!==item.answer.trim()||item.answer.includes("\0")||item.decision!=="approve"&&!item.answer)throw Error("invalid_agent_human_history")
    previous=item.step_key;requests.add(item.request_id)
  }
  if(r.next_after!==null&&r.next_after!==previous)throw Error("invalid_agent_human_history")
  return r as PgNativeHumanHistoryPage
}
