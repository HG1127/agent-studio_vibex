import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentAssessmentCore} from "./agent-assessment-audit-core.ts"
import {verifyAgentReviewCredentials} from "./agent-review-audit.ts"

export async function verifyAgentAssessmentCredentials(db:SqlClient):Promise<boolean>{
  if(!await verifyAgentAssessmentCore(db))return false
  try{if(await verifyAgentReviewCredentials(db))return true}catch{}
  throw Error("unsafe_agent_assessment_privileges")
}
export async function inspectAgentAssessmentSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentAssessmentCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
