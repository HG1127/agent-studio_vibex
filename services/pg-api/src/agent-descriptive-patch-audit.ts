import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentDescriptivePatchCore} from "./agent-descriptive-patch-audit-core.ts"
import {verifyAgentGeneratedCredentials} from "./agent-generated-audit.ts"

export async function verifyAgentDescriptivePatchCredentials(db:SqlClient):Promise<boolean>{
  try{
    if(!await verifyAgentDescriptivePatchCore(db))return false
    if(await verifyAgentGeneratedCredentials(db))return true
  }catch{}
  throw Error("unsafe_agent_descriptive_patch_privileges")
}
export async function inspectAgentDescriptivePatchSchema(pool:SqlPool):Promise<boolean>{
  let db:SqlClient|undefined
  try{
    db=await pool.connect()
    await db.query("BEGIN READ ONLY")
    await db.query("SET LOCAL ROLE agentstudio_api")
    return await verifyAgentDescriptivePatchCredentials(db)
  }catch{throw Error("unsafe_agent_descriptive_patch_privileges")}
  finally{if(db){await db.query("ROLLBACK").catch(()=>{});db.release()}}
}
