import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentReviewCore} from "./agent-review-audit-core.ts"
import {verifyAgentOptimizationCredentials} from "./agent-optimization-audit.ts"

export async function verifyAgentReviewCredentials(db:SqlClient):Promise<boolean>{
  if(!await verifyAgentReviewCore(db))return false
  if(!await verifyAgentOptimizationCredentials(db))throw Error("unsafe_agent_review_privileges")
  return true
}
export async function inspectAgentReviewSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentReviewCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
