import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentTemplateMarketCore} from "./agent-template-market-audit-core.ts"
import {verifyAgentDesignCredentials} from "./agent-design-audit.ts"
export async function verifyAgentTemplateMarketCredentials(db:SqlClient):Promise<boolean>{
  try{if(!await verifyAgentTemplateMarketCore(db))return false;if(await verifyAgentDesignCredentials(db))return true}catch{}
  throw Error("unsafe_agent_template_market_privileges")
}
export async function inspectAgentTemplateMarketSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect();let begun=false
  try{await db.query("BEGIN READ ONLY");begun=true;await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentTemplateMarketCredentials(db)}
  finally{try{if(begun)await db.query("ROLLBACK")}finally{db.release()}}
}
