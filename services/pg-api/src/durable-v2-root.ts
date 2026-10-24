// Closed, server-selected execution roots. Never interpolate a public string in SQL.
export type DurableV2Mode="workflow_native_v2"|"agent_native_v2"
const roots={
  workflow_native_v2:{mode:"workflow_native_v2",kind:"workflow",job:"workflow_tick",table:"workflows",id:"workflow_id",revision:"workflow_revision",stage:"workflow_v2_",dedupe:"workflow_v2:"},
  agent_native_v2:{mode:"agent_native_v2",kind:"agent",job:"run_tick",table:"agent_specs",id:"agent_spec_id",revision:"spec_revision",stage:"agent_v2_",dedupe:"agent_v2:"},
} as const
export function durableV2Root(mode:DurableV2Mode){
  if(!Object.hasOwn(roots,mode))throw Error("invalid_durable_v2_mode")
  return roots[mode]
}
export const AUTONOMOUS_AGENT_APPROVAL="APPROVE_DISPOSABLE_PG18_AUTONOMOUS_AGENT_ONLY"
export function selectAutonomousAgentExecution(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED,approved=env.AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!==AUTONOMOUS_AGENT_APPROVAL)throw Error("autonomous_agent_not_approved")
  return true
}
