export function selectKnowledgeSharing(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED,approved=env.AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY")throw Error("unsafe_knowledge_sharing_config")
  return true
}
