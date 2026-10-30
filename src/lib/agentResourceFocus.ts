import {safeAgentSpecId,safeCapabilityId} from "./toolSearchPrivacy.ts"

/** UI-only focus target. A returned resource tab cannot retarget a different
 * Agent or silently modify either Agent's current unsaved draft. */
export type AgentResourceFocus={token:number;specId:string;capabilityId:string}
export const EMPTY_AGENT_RESOURCE_FOCUS:AgentResourceFocus={token:0,specId:"",capabilityId:""}

export function requestAgentResourceFocus(
  previous:AgentResourceFocus,specId:string,capabilityId:string,
):AgentResourceFocus {
  const safeSpec=safeAgentSpecId(specId)
  if(!safeSpec)return EMPTY_AGENT_RESOURCE_FOCUS
  return {
    token:Number.isSafeInteger(previous.token)&&previous.token>=0&&previous.token<Number.MAX_SAFE_INTEGER
      ?previous.token+1:1,
    specId:safeSpec,
    capabilityId:safeCapabilityId(capabilityId),
  }
}

export function resourceFocusForAgent(focus:AgentResourceFocus,specId:string):{
  token:number;capabilityId:string
} {
  if(!safeAgentSpecId(specId)||focus.specId!==safeAgentSpecId(specId))
    return {token:0,capabilityId:""}
  return {token:focus.token,capabilityId:focus.capabilityId}
}
/** A deep link may focus a capability only when its saved Agent matches the
 * current editor. An explicit local selection (even blank) takes precedence. */
export function resourceFocusCapability(
  explicit:string|undefined,querySpec:string|null,currentSpec:string,queryCapability:string|null,
):string {
  if(explicit!==undefined)return safeCapabilityId(explicit)
  const current=safeAgentSpecId(currentSpec)
  return current && current===safeAgentSpecId(querySpec||"")
    ? safeCapabilityId(queryCapability||"") : ""
}
