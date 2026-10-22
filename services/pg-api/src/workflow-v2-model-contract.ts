// Private protocol: no prompt, employee, provider URL or credentials on the wire.
import {HttpError} from "./contracts.ts"
import {safeBoundModelClaim,type BoundModelClaim} from "./owner-model-dispatch.ts"
export const workflowV2ModelRoute="/__internal/v2/workflow-model/dispatch"
export const workflowV2ModelMaxRequestBytes=2048
export type WorkflowV2ModelRequest={claim:BoundModelClaim;step_key:string;input_sha256:string;parent_step_key?:string}
export function selectWorkflowV2ModelExecution(env:NodeJS.ProcessEnv):boolean{
  const enabled=env.AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED
  const approved=env.AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED
  if(enabled===undefined&&approved===undefined)return false
  if(enabled!=="true"||approved!=="APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY")
    throw Error("workflow_v2_model_not_approved")
  return true
}
export function safeWorkflowV2ModelRequest(raw:unknown):WorkflowV2ModelRequest{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_workflow_model_request")
  const value=raw as Record<string,unknown>
  const parent=value.parent_step_key
  if(Object.keys(value).length!==(parent===undefined?3:4)||Object.keys(value).some(key=>!["claim","step_key","input_sha256","parent_step_key"].includes(key))||
     !["claim","step_key","input_sha256"].every(k=>Object.hasOwn(value,k))||
     typeof value.step_key!=="string"||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(value.step_key)||
     parent!==undefined&&(typeof parent!=="string"||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$/.test(parent)||
       !new RegExp("^"+parent+"_a0[1-5][mt]$").test(value.step_key))||
     typeof value.input_sha256!=="string"||!/^[a-f0-9]{64}$/.test(value.input_sha256))
    throw new HttpError(400,"invalid_workflow_model_request")
  return {claim:{...safeBoundModelClaim(value.claim)},step_key:value.step_key,input_sha256:value.input_sha256,
    ...(typeof parent==="string"?{parent_step_key:parent}:{})}
}
