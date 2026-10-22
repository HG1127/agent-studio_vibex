import {safeWorkflowV2ModelRequest,type WorkflowV2ModelRequest} from "./workflow-v2-model-contract.ts"
export const workflowV2ToolRoute="/__internal/v2/workflow-tool/dispatch"
export type WorkflowV2ToolRequest=WorkflowV2ModelRequest
export const safeWorkflowV2ToolRequest=safeWorkflowV2ModelRequest
export function selectWorkflowV2ToolExecution(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED,approved=env.AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_TOOLS_ONLY")throw Error("workflow_v2_tools_not_approved")
  return true
}
