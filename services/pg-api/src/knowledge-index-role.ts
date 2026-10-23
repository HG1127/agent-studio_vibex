import type {SqlClient,SqlPool} from "./contracts.ts"
export async function withKnowledgeIndexRole<T>(pool:SqlPool,kind:"worker"|"broker",body:(db:SqlClient)=>Promise<T>):Promise<T>{
  if(pool.knowledgeIndexRuntime!==true||!["worker","broker"].includes(kind))throw Error("knowledge_index_runtime_disabled")
  const db=await pool.connect();let active=false
  try{
    await db.query("BEGIN");active=true
    await db.query("SET LOCAL ROLE agentstudio_knowledge_index_"+kind)
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
    await db.query("SELECT set_config('agentstudio.knowledge_index_runtime_enabled','true',true)")
    const result=await body(db)
    await db.query("COMMIT");active=false;return result
  }catch(error){if(active)await db.query("ROLLBACK").catch(()=>undefined);throw error}finally{db.release()}
}
