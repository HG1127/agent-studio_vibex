// Operator configuration only; never read from an employee request.
export function selectAgentMemoryRuntime(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED,approval=env.AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED
  if(enabled===undefined&&approval===undefined)return false
  if(enabled!=="true"||approval!=="APPROVE_DISPOSABLE_PG18_OWNER_MEMORY_ONLY")throw Error("unsafe_agent_memory_runtime_config")
  return true
}
