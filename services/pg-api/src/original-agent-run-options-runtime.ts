import {selectAutonomousAgentExecution} from './durable-v2-root.ts'
export const originalRunOptionsApproval='APPROVE_DISPOSABLE_ORIGINAL_RUN_BUDGETS_V1_ONLY'
/** Explicit isolated-runtime opt-in. This selects source behavior; Native
 * startup and Worker retain their existing target, role and source audits. */
export function selectOriginalRunOptions(env:NodeJS.ProcessEnv):boolean{
 const enabled=env.AGENT_STUDIO_ORIGINAL_RUN_BUDGETS_ENABLED,approval=env.AGENT_STUDIO_ORIGINAL_RUN_BUDGETS_APPROVED
 if((enabled===undefined||enabled==='false')&&approval===undefined)return false
 if(enabled!=='true'||approval!==originalRunOptionsApproval||env.AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED!=='true'||!selectAutonomousAgentExecution(env))throw Error('original_run_budget_runtime_not_approved')
 return true
}
