// Explicit operator scopes for employee statements and inert lesson storage.
// Neither scope permits provider calls, prompt use, optimization or role edits.
export function selectAgentFeedbackScopes(env:NodeJS.ProcessEnv):{submit:boolean;lessons:boolean}{
  const pair=(key:string,marker:string):boolean=>{
    const enabled=env[key+"_ENABLED"],approved=env[key+"_APPROVED"]
    if(enabled===undefined&&approved===undefined)return false
    if(enabled!=="true"||approved!==marker)throw Error("unsafe_agent_feedback_config")
    return true
  }
  const submit=pair("AGENT_STUDIO_PG_AGENT_FEEDBACK","APPROVE_DISPOSABLE_PG18_OWNER_FEEDBACK_ONLY")
  const lessons=pair("AGENT_STUDIO_PG_AGENT_FEEDBACK_LESSONS","APPROVE_DISPOSABLE_PG18_FEEDBACK_LESSON_STORAGE_ONLY")
  if(lessons&&!submit)throw Error("unsafe_agent_feedback_config")
  return {submit,lessons}
}
