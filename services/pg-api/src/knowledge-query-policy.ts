import type {SqlPool} from "./contracts.ts"
export function selectKnowledgeQueryRuntime(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_ENABLED,approval=env.AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED
  if(enabled===undefined&&approval===undefined)return false
  if(enabled!=="true"||approval!=="APPROVE_DISPOSABLE_PG18_READER_EMBEDDING_QUERY_UAT")throw Error("unsafe_knowledge_query_runtime_config")
  return true
}
export function scopedKnowledgeQueryPool(pool:SqlPool,enabled:boolean):SqlPool{
  if(!pool||typeof pool.connect!=="function"||typeof enabled!=="boolean")throw Error("invalid_knowledge_query_pool")
  return Object.freeze({knowledgeSharing:pool.knowledgeSharing===true,knowledgeEmbeddingSettings:pool.knowledgeEmbeddingSettings===true,
    knowledgeEmbeddingConsent:pool.knowledgeEmbeddingConsent===true,knowledgeIndexRuntime:pool.knowledgeIndexRuntime===true,knowledgeQueryRuntime:enabled,connect:()=>pool.connect()})
}
