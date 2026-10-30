import type {SqlClient} from './contracts.ts'
import {verifyAgentInternalShareCore} from './agent-internal-share-audit-core.ts'
import {verifyAgentPlanWorkflowCredentials} from './agent-plan-workflow-audit.ts'
// This original authenticated API client owns all real065/064/063 predecessor
// audits. No HTTP authority input, copied catalog row or role impersonation.
export async function verifyAgentInternalShareCredentials(db:SqlClient):Promise<boolean>{
 try{if(!await verifyAgentInternalShareCore(db))return false;if(await verifyAgentPlanWorkflowCredentials(db))return true}catch{}
 throw Error('unsafe_agent_internal_share_privileges')
}
