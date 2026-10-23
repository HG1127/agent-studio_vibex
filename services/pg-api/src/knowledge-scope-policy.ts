// Transaction-local capability context. No environment/credential I/O or DB DML.
import type {SqlClient,SqlPool} from "./contracts.ts"
export function scopedKnowledgePool(pool:SqlPool,enabled:boolean):SqlPool{
  if(!pool||typeof pool.connect!=="function"||typeof enabled!=="boolean")throw Error("invalid_knowledge_pool_policy")
  return Object.freeze({knowledgeSharing:enabled,connect:()=>pool.connect()})
}
export async function applyKnowledgeScope(db:SqlClient,pool:SqlPool):Promise<void>{
  await db.query("SELECT set_config('agentstudio.knowledge_sharing_enabled',$1::text,true)",[pool.knowledgeSharing===true?"true":"false"])
  await db.query("SELECT set_config('agentstudio.knowledge_embedding_settings_enabled',$1::text,true)",[pool.knowledgeEmbeddingSettings===true?"true":"false"])
  await db.query("SELECT set_config('agentstudio.knowledge_embedding_consent_enabled',$1::text,true)",[pool.knowledgeEmbeddingConsent===true?"true":"false"])
  await db.query("SELECT set_config('agentstudio.knowledge_index_runtime_enabled',$1::text,true)",[pool.knowledgeIndexRuntime===true?"true":"false"])
}
export function scopedEmbeddingSettingsPool(pool:SqlPool,enabled:boolean):SqlPool{
  if(!pool||typeof pool.connect!=="function"||typeof enabled!=="boolean")throw Error("invalid_knowledge_pool_policy")
  return Object.freeze({knowledgeSharing:pool.knowledgeSharing===true,knowledgeEmbeddingSettings:enabled,connect:()=>pool.connect()})
}
export function scopedEmbeddingConsentPool(pool:SqlPool,enabled:boolean):SqlPool{
  if(!pool||typeof pool.connect!=="function"||typeof enabled!=="boolean")throw Error("invalid_knowledge_pool_policy")
  return Object.freeze({knowledgeSharing:pool.knowledgeSharing===true,knowledgeEmbeddingSettings:pool.knowledgeEmbeddingSettings===true,
    knowledgeEmbeddingConsent:enabled,connect:()=>pool.connect()})
}
// Mutating knowledge paths take this before any base/document/profile row
// lock. No transaction or lock is retained across a provider request.
export async function lockKnowledgeOwner(db:SqlClient,owner:string):Promise<void>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,6635))",[owner])
}
export async function sharedKnowledgeScopeEnabled(db:SqlClient):Promise<boolean>{
  return (await db.query<{enabled:boolean|null}>("SELECT current_setting('agentstudio.knowledge_sharing_enabled',true)='true' AS enabled")).rows[0]?.enabled===true
}
