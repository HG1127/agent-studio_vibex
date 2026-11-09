import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentPlanWorkflowCore} from "./agent-plan-workflow-audit-core.ts"
import {verifyAgentTemplateMarketCredentials} from "./agent-template-market-audit.ts"
import {verifyAgentPlanWorkflow062Dependencies} from "./agent-plan-workflow-predecessor-062-audit-core.ts"
import {verifyAgentPlanWorkflow061Dependencies} from "./agent-plan-workflow-predecessor-061-audit-core.ts"
import {verifyAgentDescriptivePatchCredentials} from "./agent-descriptive-patch-audit.ts"
// Uses this original authenticated client. Dedicated roles remain themselves.
export async function verifyAgentPlanWorkflowCredentials(db:SqlClient):Promise<boolean>{
  try{
    if(!await verifyAgentPlanWorkflowCore(db))return false
    const rows=(await db.query<{role:string}>("SELECT current_user::text AS role")).rows
    if(rows.length!==1)throw Error("unsafe_agent_plan_workflow_privileges")
    const role=rows[0]!.role
    if(role==="agentstudio_api"){if(await verifyAgentTemplateMarketCredentials(db))return true}
    else if(role==="agentstudio_plan_workflow_worker"||role==="agentstudio_plan_workflow_dispatch"){
      if(await verifyAgentPlanWorkflow062Dependencies(db)&&await verifyAgentPlanWorkflow061Dependencies(db)&&await verifyAgentDescriptivePatchCredentials(db))return true
    }
  }catch{}
  throw Error("unsafe_agent_plan_workflow_privileges")
}
// Pool inspection owns its own read-only transaction; the credential verifier
// above never creates, commits, changes or impersonates the caller's session.
export async function inspectAgentPlanWorkflowSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect();let begun=false
  try{await db.query("BEGIN READ ONLY");begun=true;await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentPlanWorkflowCredentials(db)}
  finally{try{if(begun)await db.query("ROLLBACK")}finally{db.release()}}
}
