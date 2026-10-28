import type {SqlClient,SqlPool} from "./contracts.ts"
// Optional internal transaction observation; never skips runtime/role checks.
export type KnowledgeQueryTransactionEvent="before_commit"|"commit_confirmed"|"failure"|"rollback_confirmed"
export async function withKnowledgeQueryRole<T>(pool:SqlPool,kind:"worker"|"broker",body:(db:SqlClient)=>Promise<T>,observe?:(event:KnowledgeQueryTransactionEvent)=>void):Promise<T>{
  if(pool.knowledgeQueryRuntime!==true||!["worker","broker"].includes(kind))throw Error("knowledge_query_runtime_disabled")
  const db=await pool.connect();let active=false
  try{
    await db.query("BEGIN");active=true;await db.query("SET LOCAL ROLE agentstudio_knowledge_index_"+kind)
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
    await db.query("SELECT set_config('agentstudio.knowledge_index_runtime_enabled','false',true)")
    await db.query("SELECT set_config('agentstudio.knowledge_sharing_enabled',$1::text,true)",[pool.knowledgeSharing===true?"true":"false"])
    await db.query("SELECT set_config('agentstudio.knowledge_query_runtime_enabled','true',true)")
    await db.query("SELECT set_config('agentstudio.knowledge_tool_runtime_enabled',$1::text,true)",[pool.knowledgeToolRuntime===true?"true":"false"])
    const result=await body(db);observe?.("before_commit");await db.query("COMMIT");active=false;observe?.("commit_confirmed");return result
  }catch(error){
    // Notify before waiting for rollback so an issued claim stays uncertain.
    try{observe?.("failure")}finally{
      if(active)try{await db.query("ROLLBACK");observe?.("rollback_confirmed")}catch{}
    }
    throw error
  }finally{db.release()}
}
