import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentDesignCore} from "./agent-design-audit-core.ts"
import {verifyCompanyOverviewCore} from "./company-overview-audit-core.ts"
import {verifyAgentDescriptivePatchCredentials} from "./agent-descriptive-patch-audit.ts"

// This verifier uses the original authenticated SQL connection. Parsing a
// manifest/source hash or injecting an HTTP value never creates its result.
export async function verifyAgentDesignCredentials(db:SqlClient):Promise<boolean>{
  try{
    if(!await verifyAgentDesignCore(db))return false
    if(await verifyCompanyOverviewCore(db)&&await verifyAgentDescriptivePatchCredentials(db))return true
  }catch{}
  throw Error("unsafe_agent_design_privileges")
}
export async function inspectAgentDesignSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect();let begun=false
  try{
    await db.query("BEGIN READ ONLY");begun=true
    await db.query("SET LOCAL ROLE agentstudio_api")
    return await verifyAgentDesignCredentials(db)
  }finally{
    try{if(begun)await db.query("ROLLBACK")}finally{db.release()}
  }
}
