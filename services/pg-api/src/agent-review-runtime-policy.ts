// New paid-review admission is independent of execution/Worker availability.
// Closing this scope never closes immutable recovery or privacy controls.
export function selectAgentReviewSubmission(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_REVIEW_SUBMISSION_ENABLED,approved=env.AGENT_STUDIO_PG18_REVIEW_SUBMISSION_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_PAID_REVIEW_SUBMISSION_ONLY")throw Error("unsafe_agent_review_config")
  return true
}
