// Transaction-local capability context. No environment/credential I/O or DB DML.
import type {SqlClient,SqlPool} from "./contracts.ts"
export function scopedKnowledgePool(pool:SqlPool,enabled:boolean):SqlPool{
  if(!pool||typeof pool.connect!=="function"||typeof enabled!=="boolean")throw Error("invalid_knowledge_pool_policy")
  return Object.freeze({knowledgeSharing:enabled,connect:()=>pool.connect()})
}
export async function applyKnowledgeScope(db:SqlClient,pool:SqlPool):Promise<void>{
  await db.query("SELECT set_config('agentstudio.knowledge_sharing_enabled',$1::text,true)",[pool.knowledgeSharing===true?"true":"false"])
}
export async function sharedKnowledgeScopeEnabled(db:SqlClient):Promise<boolean>{
  return (await db.query<{enabled:boolean|null}>("SELECT current_setting('agentstudio.knowledge_sharing_enabled',true)='true' AS enabled")).rows[0]?.enabled===true
}
