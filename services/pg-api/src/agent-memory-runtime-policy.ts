// Operator configuration only; never read from an employee request.
export function selectAgentMemoryRuntime(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED,approval=env.AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED
  if(enabled===undefined&&approval===undefined)return false
  if(enabled!=="true"||approval!=="APPROVE_DISPOSABLE_PG18_OWNER_MEMORY_ONLY")throw Error("unsafe_agent_memory_runtime_config")
  return true
}
// Owner-confirmed derived saves are inert storage operations. This separate
// switch conveys no automatic writeback, prompt use or paid refinement scope.
export function selectAgentDerivedMemoryWrites(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_ENABLED,approval=env.AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_APPROVED
  if(enabled===undefined&&approval===undefined)return false
  if(enabled!=="true"||approval!=="APPROVE_DISPOSABLE_PG18_SOURCE_BOUND_MEMORY_ONLY")throw Error("unsafe_agent_derived_memory_config")
  return true
}

// Storage at an already confirmed terminal run is a separate operator scope.
// It never approves a new provider effect, derived prompt input or refinement.
export function selectAgentOutcomeMemoryWrites(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED,approval=env.AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED
  if(enabled===undefined&&approval===undefined)return false
  if(enabled!=="true"||approval!=="APPROVE_DISPOSABLE_PG18_OWNER_OUTCOME_MEMORY_ONLY")throw Error("unsafe_agent_outcome_memory_config")
  return true
}
