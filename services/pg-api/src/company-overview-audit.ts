import {HttpError,type SqlClient,type SqlPool} from "./contracts.ts"
import {verifyCompanyOverviewCore} from "./company-overview-audit-core.ts"
import {verifyAgentDescriptivePatchCredentials} from "./agent-descriptive-patch-audit.ts"

const unavailable=():never=>{throw new HttpError(503,"company_projection_unavailable")}
async function installed(db:SqlClient):Promise<boolean>{
 try{
  if(!await verifyCompanyOverviewCore(db))return false
  if(await verifyAgentDescriptivePatchCredentials(db))return true
 }catch{}
 return unavailable()
}
export async function verifyCompanyOverviewSchema(db:SqlClient):Promise<void>{if(!await installed(db))return unavailable()}
export async function inspectCompanyOverviewSchema(pool:SqlPool):Promise<boolean>{
 let db:SqlClient|undefined
 try{db=await pool.connect();await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await installed(db)}
 catch{return unavailable()}
 finally{if(db){await db.query("ROLLBACK").catch(()=>{});try{db.release()}catch{}}}
}
