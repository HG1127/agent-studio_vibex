import type { AgentSpec } from "../pages/Home/presets"
import { sanitizeAgentDraftSpec } from "./agentEditorDraft.ts"

/** Employee-owned, per Agent, tab-scoped recovery. Never a replacement for server versions. */
export const QUICK_AGENT_DRAFT_TTL_MS=12*60*60*1000
export const QUICK_AGENT_DRAFT_MAX_BYTES=48_000
const prefix="agent-studio:quick-spec-draft:v1:"
const safeId=(id:string)=>/^[A-Za-z0-9_-]{8,80}$/.test(id)

export type QuickAgentDraft = {
  version:1
  ownerId:string
  specId:string
  expectedUpdated:string
  updatedAt:number
  name:string
  spec:AgentSpec
}

export function quickAgentDraftKey(ownerId:string,specId:string):string{
  return safeId(ownerId)&&safeId(specId)?prefix+ownerId+":"+specId:""
}
export function sanitizeQuickAgentDraft(input:unknown,ownerId:string,specId:string,
  now=Date.now()):QuickAgentDraft|null {
  if(!input||typeof input!=="object"||Array.isArray(input))return null
  const row=input as Record<string,unknown>
  if(row.version!==1||row.ownerId!==ownerId||row.specId!==specId)return null
  const updatedAt=Number(row.updatedAt)
  if(!Number.isFinite(updatedAt)||updatedAt>now+60_000||updatedAt<now-QUICK_AGENT_DRAFT_TTL_MS)return null
  const version=typeof row.expectedUpdated==="string"?row.expectedUpdated:""
  if(!version||version.length>80)return null
  const name=typeof row.name==="string"?row.name.slice(0,120):""
  const spec=sanitizeAgentDraftSpec(row.spec)
  if(!name.trim()||!spec)return null
  return {version:1,ownerId,specId,expectedUpdated:version,updatedAt,name,spec}
}
export function readQuickAgentDraft(ownerId:string,specId:string,
  now=Date.now()):QuickAgentDraft|null {
  const key=quickAgentDraftKey(ownerId,specId)
  if(!key||typeof sessionStorage==="undefined")return null
  try {
    const serialized=sessionStorage.getItem(key)
    if(!serialized||serialized.length>QUICK_AGENT_DRAFT_MAX_BYTES)return null
    return sanitizeQuickAgentDraft(JSON.parse(serialized),ownerId,specId,now)
  }catch{return null}
}
export function saveQuickAgentDraft(ownerId:string,specId:string,value:Omit<QuickAgentDraft,"version"|"updatedAt">):boolean{
  const key=quickAgentDraftKey(ownerId,specId)
  if(!key||typeof sessionStorage==="undefined")return false
  const sanitized=sanitizeQuickAgentDraft({...value,version:1,updatedAt:Date.now()},ownerId,specId)
  if(!sanitized)return false
  try{
    const serialized=JSON.stringify(sanitized)
    if(serialized.length>QUICK_AGENT_DRAFT_MAX_BYTES)return false
    sessionStorage.setItem(key,serialized)
    return true
  }catch{return false}
}
export function clearQuickAgentDraft(ownerId:string,specId:string):void{
  const key=quickAgentDraftKey(ownerId,specId)
  if(!key||typeof sessionStorage==="undefined")return
  try{sessionStorage.removeItem(key)}catch{}
}
