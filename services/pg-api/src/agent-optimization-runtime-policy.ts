// Manual owner acceptance only. This never enables an optimization/evaluation
// provider, model draft, prompt input, publication or external-effect approval.
export function selectAgentOptimizationAcceptance(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED,approved=env.AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_FEEDBACK_ROLE_ACCEPTANCE_ONLY")throw Error("unsafe_agent_optimization_config")
  return true
}
