// Fresh descriptive configuration acceptance only. Immutable receipt,
// confirmation and original recovery do not consult this selector.
// This grants no paid review, model execution or manual055 authority.
export function selectAgentDescriptivePatchAcceptance(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_DESCRIPTIVE_PATCH_ENABLED,approved=env.AGENT_STUDIO_PG18_DESCRIPTIVE_PATCH_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_DESCRIPTIVE_PATCH_ACCEPTANCE_ONLY")throw Error("unsafe_agent_descriptive_patch_config")
  return true
}
