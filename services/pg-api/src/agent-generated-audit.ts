import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentGeneratedCore} from "./agent-generated-audit-core.ts"
import {verifyAgentOpinionCredentials} from "./agent-opinion-audit.ts"

export async function verifyAgentGeneratedCredentials(db:SqlClient):Promise<boolean>{
  try{
    if(!await verifyAgentGeneratedCore(db))return false
    if(await verifyAgentOpinionCredentials(db))return true
  }catch{}
  throw Error("unsafe_agent_generated_privileges")
}
export async function inspectAgentGeneratedSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentGeneratedCredentials(db)}
  catch{throw Error("unsafe_agent_generated_privileges")}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
