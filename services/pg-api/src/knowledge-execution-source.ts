// Internal Tool Broker adapter only. No HTTP route accepts execution sources.
// Stable per logical step, independently of Worker/lease replacement. A changed
// payload conflicts with the existing query ledger instead of buying a retry.
import {createHash} from "node:crypto"
import {isUuid} from "./contracts.ts"
import {safeWorkflowV2ToolRequest,type WorkflowV2ToolRequest} from "./workflow-v2-tool-contract.ts"
export function workflowKnowledgeQueryId(reader:string,run:string,step:string):string{
  if(!isUuid(reader)||!isUuid(run)||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(step))throw Error("invalid_knowledge_execution_source")
  const hex=createHash("sha256").update("agentstudio.workflow.knowledge_query.v1:"+reader.toLowerCase()+":"+run.toLowerCase()+":"+step).digest("hex").slice(0,32)
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-")
}
export function knowledgeExecutionSource(raw:WorkflowV2ToolRequest){
  const x=safeWorkflowV2ToolRequest(raw)
  return {run_id:x.claim.run_id.toLowerCase(),job_id:x.claim.job_id.toLowerCase(),
    lease_sha256:createHash("sha256").update(x.claim.lease_token.toLowerCase()).digest("hex"),
    lease_version:x.claim.lease_version,lease_owner:x.claim.lease_owner,step_key:x.step_key,input_sha256:x.input_sha256,
    execution_mode:x.execution_mode??"workflow_native_v2",parent_step_key:x.parent_step_key??null}
}
