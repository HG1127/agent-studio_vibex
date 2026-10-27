import type {SqlPool} from "./contracts.ts"
import {selectKnowledgeQueryRuntime} from "./knowledge-query-policy.ts"
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {verifyKnowledgeQuerySchema} from "./knowledge-query-audit.ts"
export function selectKnowledgeToolRuntime(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_ENABLED,ack=env.AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_APPROVED
  if(enabled===undefined&&ack===undefined)return false
  if(enabled!=="true"||ack!=="APPROVE_DISPOSABLE_PG18_APPROVED_SEMANTIC_TOOLS"||!selectKnowledgeQueryRuntime(env)||!selectKnowledgeSharing(env))
    throw Error("unsafe_knowledge_tool_runtime_config")
  return true
}
export function scopedKnowledgeToolPool(pool:SqlPool,enabled:boolean):SqlPool{
  if(!pool||typeof pool.connect!=="function"||typeof enabled!=="boolean"||enabled&&(pool.knowledgeQueryRuntime!==true||pool.knowledgeSharing!==true))throw Error("invalid_knowledge_tool_pool")
  return Object.freeze({knowledgeSharing:pool.knowledgeSharing===true,knowledgeEmbeddingSettings:pool.knowledgeEmbeddingSettings===true,
    knowledgeEmbeddingConsent:pool.knowledgeEmbeddingConsent===true,knowledgeIndexRuntime:pool.knowledgeIndexRuntime===true,knowledgeQueryRuntime:pool.knowledgeQueryRuntime===true,
    knowledgeToolRuntime:enabled,connect:()=>pool.connect()})
}
export async function verifyKnowledgeToolSchema(pool:SqlPool,kind:"api"|"worker"|"broker"="api"):Promise<void>{
  await verifyKnowledgeQuerySchema(pool,kind)
  const db=await pool.connect();try{await db.query("BEGIN READ ONLY");try{
    await db.query("SET LOCAL ROLE "+(kind==="api"?"agentstudio_api":"agentstudio_knowledge_index_"+kind))
    const state=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_041') AND "+
      "to_regprocedure('agentstudio.knowledge_query_execution_validate_run(uuid,text)') IS NOT NULL AS ok")).rows[0]
    if(state?.ok!==true)throw Error("unsafe_knowledge_tool_schema")
  }finally{await db.query("ROLLBACK")}}finally{db.release()}
}
