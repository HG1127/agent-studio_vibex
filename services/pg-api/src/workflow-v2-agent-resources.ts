import {HttpError,type SqlClient} from "./contracts.ts"
import {verifyWorkflowResourceReferences} from "./workflow-repository.ts"
import {createWorkflowAgentState,inspectWorkflowAgentState,workflowAgentJson,workflowAgentSpec,type WorkflowAgentState} from "./workflow-v2-agent-machine.ts"
import type {WorkflowEffectRequest} from "./workflow-v2-machine.ts"
async function currentSpec(db:SqlClient,owner:string,parent:WorkflowEffectRequest){
  const ref=parent.configuration.agent_binding
  if(parent.kind!=="agent"||!ref)throw new HttpError(409,"workflow_agent_binding_missing")
  const row=(await db.query<{revision:number|string;spec:unknown}>("SELECT revision,spec FROM agentstudio.agent_specs "+
    "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[ref.spec_id,owner])).rows[0]
  if(!row)throw new HttpError(404,"workflow_resource_not_found")
  if(Number(row.revision)!==ref.spec_revision)throw new HttpError(409,"workflow_resource_revision_changed")
  return workflowAgentSpec(row.spec)
}
export async function verifyWorkflowAgentResources(db:SqlClient,owner:string,parent:WorkflowEffectRequest,state?:WorkflowAgentState){
  const spec=await currentSpec(db,owner,parent)
  if(state){inspectWorkflowAgentState(state,parent);if(workflowAgentJson(spec)!==workflowAgentJson(state.spec))throw new HttpError(409,"workflow_agent_snapshot_changed")}
  const binding=parent.configuration.model_binding??spec.model_binding
  if(!binding)throw new HttpError(409,"workflow_agent_model_binding_missing")
  await verifyWorkflowResourceReferences(db,owner,{title:parent.configuration.title,model_binding:binding,knowledge_base_ids:spec.knowledge_base_ids})
  return spec
}
export async function initializeWorkflowAgent(db:SqlClient,owner:string,parent:WorkflowEffectRequest){
  return createWorkflowAgentState(parent,await verifyWorkflowAgentResources(db,owner,parent))
}
