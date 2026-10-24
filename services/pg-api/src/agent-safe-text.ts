// Collaborative drafts expose descriptive text only. Execution resources stay
// owner-private and are preserved by the owner's separately checked merge.
import {HttpError} from "./contracts.ts"
import {agentDescriptiveLimits as limits} from "../../../shared/agent-role-limits.mjs"
export const agentSafeTextFields=["goal","task_scope","deliverables","task_plan","done_criteria"] as const
export type AgentSafeText={goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[]}
function invalid():never{throw new HttpError(400,"invalid_agent_collaboration_text")}
function text(raw:unknown,max:number):string{
  if(typeof raw!=="string"||raw.length>max||raw.includes("\0"))invalid()
  return raw
}
function list(raw:unknown):string[]{
  if(raw===undefined)return []
  if(!Array.isArray(raw)||raw.length>limits.list_items)invalid()
  return raw.map(item=>text(item,limits.list_item))
}
function safeText(raw:unknown,proposal:boolean):AgentSafeText{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const data=raw as Record<string,unknown>
  if(proposal&&Object.keys(data).some(key=>!agentSafeTextFields.includes(key as typeof agentSafeTextFields[number])))
    throw new HttpError(400,"agent_collaboration_protected_field")
  const result={goal:text(data.goal,limits.goal),task_scope:data.task_scope===undefined?"":text(data.task_scope,limits.task_scope),
    deliverables:list(data.deliverables),task_plan:list(data.task_plan),done_criteria:list(data.done_criteria)}
  if(!result.goal.trim()||proposal&&JSON.stringify(result).length>limits.proposal_json)invalid()
  return result
}
export function normalizeAgentSafeText(raw:unknown):AgentSafeText{return safeText(raw,true)}
export function extractAgentSafeText(raw:unknown):AgentSafeText{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const data=raw as Record<string,unknown>
  return safeText(Object.fromEntries(agentSafeTextFields.map(field=>[field,data[field]])),false)
}
