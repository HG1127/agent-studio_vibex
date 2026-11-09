import { safeAgentSpecId, safeCapabilityId } from "./toolSearchPrivacy.ts"

/**
 * Ephemeral same-origin coordination only. A signal asks another open editor
 * to display a refresh CTA; it does NOT authorize, alter, save or test tools.
 * No requirements, prompts, URLs, credentials or file content are exchanged.
 */
export const AGENT_RESOURCE_HANDOFF_CHANNEL = "agent-studio-resource-handoff-v1"
export const AGENT_RESOURCE_HANDOFF_TYPE = "resource-review-request"
const SIGNAL_MAX_AGE_MS = 5 * 60 * 1000

export type AgentResourceHandoff = {
  type: typeof AGENT_RESOURCE_HANDOFF_TYPE
  specId: string
  capabilityId: string
  issuedAt: number
}
/** Only says the current employee's HTTP/MCP lists responded and were checked.
 * This does NOT claim a tool is connected, tested, enabled or authorized. */
export type AgentResourceReviewResult={listsChecked:boolean;detail:string}


export function createAgentResourceHandoff(specId:string, capabilityId:string, now:number=Date.now()):AgentResourceHandoff|null {
  const id = safeAgentSpecId(specId)
  if(!id || !Number.isSafeInteger(now) || now<=0)return null
  return { type:AGENT_RESOURCE_HANDOFF_TYPE, specId:id, capabilityId:safeCapabilityId(capabilityId), issuedAt:now }
}

export function isMatchingAgentResourceHandoff(
  incoming:unknown, specId:string, visibleCapabilityIds:readonly string[], now:number=Date.now(),
): incoming is AgentResourceHandoff {
  if(!incoming || typeof incoming!=="object" || Array.isArray(incoming))return false
  const value=incoming as Partial<AgentResourceHandoff>
  if(value.type!==AGENT_RESOURCE_HANDOFF_TYPE || typeof value.specId!=="string" ||
      typeof value.capabilityId!=="string" || typeof value.issuedAt!=="number")return false
  if(!safeAgentSpecId(specId) || value.specId!==safeAgentSpecId(specId))return false
  if(value.capabilityId && (!safeCapabilityId(value.capabilityId) ||
     !visibleCapabilityIds.includes(value.capabilityId)))return false
  if(!Number.isSafeInteger(value.issuedAt) || !Number.isFinite(now) ||
    value.issuedAt>now+5000 || now-value.issuedAt>SIGNAL_MAX_AGE_MS)return false
  return true
}

export function notifyOtherAgentTabs(signal:AgentResourceHandoff|null):boolean {
  if(!signal || typeof BroadcastChannel==="undefined")return false
  let channel:BroadcastChannel|null=null
  try {
    channel=new BroadcastChannel(AGENT_RESOURCE_HANDOFF_CHANNEL)
    channel.postMessage(signal)
    return true
  }catch{return false}
  finally{channel?.close()}
}
