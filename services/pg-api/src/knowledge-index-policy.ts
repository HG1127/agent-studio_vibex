import type {SqlPool} from "./contracts.ts"
export function selectKnowledgeIndexRuntime(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_ENABLED,approval=env.AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_APPROVED
  if(enabled===undefined&&approval===undefined)return false
  if(enabled!=="true"||approval!=="APPROVE_DISPOSABLE_PG18_OWNER_EMBEDDING_INDEX_UAT")throw Error("unsafe_knowledge_index_runtime_config")
  return true
}
export function scopedKnowledgeIndexPool(pool:SqlPool,enabled:boolean):SqlPool{
  if(!pool||typeof pool.connect!=="function"||typeof enabled!=="boolean")throw Error("invalid_knowledge_index_pool")
  return Object.freeze({knowledgeSharing:pool.knowledgeSharing===true,knowledgeEmbeddingSettings:pool.knowledgeEmbeddingSettings===true,
    knowledgeEmbeddingConsent:pool.knowledgeEmbeddingConsent===true,knowledgeIndexRuntime:enabled,connect:()=>pool.connect()})
}
