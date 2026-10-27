import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentOpinionCore} from "./agent-opinion-audit-core.ts"
import {verifyAgentAssessmentCredentials} from "./agent-assessment-audit.ts"

export async function verifyAgentOpinionCredentials(db:SqlClient):Promise<boolean>{
  try{
    if(!await verifyAgentOpinionCore(db))return false
    if(await verifyAgentAssessmentCredentials(db))return true
  }catch{}
  throw Error("unsafe_agent_opinion_privileges")
}
export async function inspectAgentOpinionSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentOpinionCredentials(db)}
  catch{throw Error("unsafe_agent_opinion_privileges")}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
