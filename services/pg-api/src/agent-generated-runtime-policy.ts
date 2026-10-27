// Independent configuration acceptance, never paid execution or manual055.
export function selectAgentGeneratedAcceptance(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_ENABLED,approved=env.AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_GENERATED_ROLE_ACCEPTANCE_ONLY")throw Error("unsafe_agent_generated_config")
  return true
}
