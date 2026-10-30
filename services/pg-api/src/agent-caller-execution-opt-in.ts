// A caller's credential/fee acknowledgement cannot enable service execution.
// Both original autonomous/model/tool gates and this separate scope are needed.
export function selectAgentCallerExecution(env:NodeJS.ProcessEnv):boolean{
 const enabled=env.AGENT_STUDIO_PG_CALLER_EXECUTION_ENABLED,approved=env.AGENT_STUDIO_PG_CALLER_EXECUTION_APPROVED
 if(enabled===undefined&&approved===undefined)return false
 if(enabled!=='true'||approved!=='PG18_ISOLATED_PUBLISHED_CALLER_EXECUTION_UAT')throw Error('agent_caller_execution_not_approved')
 return true
}
