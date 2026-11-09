import {optionalOrdinaryCaseAgentBinding} from './native-ordinary-case-binding.ts'
import {parseOrdinaryCaseRunBinding,type OrdinaryCaseRunBinding} from '../../../shared/ordinary-case-run-contract.ts'
import {requireMonitorAgentBinding,type MonitorAgentBinding} from './native-monitor-agent-binding.ts'
import {hasNativeLocalAgentTool} from './native-local-agent-contract.ts'
import {verifyNativeLocalRoleSchema} from './native-local-agent-resources.ts'
import {HttpError,type SqlClient} from "./contracts.ts"
import {verifyWorkflowResourceReferences} from "./workflow-repository.ts"
import {createWorkflowAgentState,inspectWorkflowAgentState,workflowAgentJson,workflowAgentSpec,type WorkflowAgentState} from "./workflow-v2-agent-machine.ts"
import type {WorkflowEffectRequest} from "./workflow-v2-machine.ts"
import {verifyAgentHttpTools} from "./repository.ts"
import {resolveAgentMcpTools} from "./mcp-binding-resources.ts"
import {requireHumanInputSchema} from "./agent-human-input-policy.ts"
import type {AgentMemoryContext} from "./agent-memory-context.ts"
import {roleHistoricalSpec,withOriginalRoleHistory} from './original-role-history.ts'
import {originalRoleHash} from './original-role-execution.mjs'
import type {OriginalRolePin} from '../../../shared/original-role-execution-contract.mjs'
async function currentSpec(db:SqlClient,owner:string,parent:WorkflowEffectRequest,allowNativeLocal=false,allowMonitorBusiness=false){
  const ref=parent.configuration.agent_binding
  if(parent.kind!=="agent"||!ref)throw new HttpError(409,"workflow_agent_binding_missing")
  const historical=roleHistoricalSpec(db,owner,ref.spec_id,ref.spec_revision)
  if(historical)return historical
  const row=(await db.query<{revision:number|string;spec:unknown}>("SELECT revision,spec FROM agentstudio.agent_specs "+
    "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[ref.spec_id,owner])).rows[0]
  if(!row)throw new HttpError(404,"workflow_resource_not_found")
  if(Number(row.revision)!==ref.spec_revision)throw new HttpError(409,"workflow_resource_revision_changed")
  if(hasNativeLocalAgentTool(row.spec)&&allowNativeLocal)await verifyNativeLocalRoleSchema(db)
  return workflowAgentSpec(row.spec,allowNativeLocal,allowMonitorBusiness)
}
export async function verifyWorkflowAgentResources(db:SqlClient,owner:string,parent:WorkflowEffectRequest,state?:WorkflowAgentState,allowNativeLocal=false,monitorBusiness?:MonitorAgentBinding,authoringMonitorBusiness=false,caseBusiness?:OrdinaryCaseRunBinding){
  const ordinaryBinding=state?.case_business??caseBusiness
  if(ordinaryBinding){
    const actual=await optionalOrdinaryCaseAgentBinding(db,owner,ordinaryBinding.run_id,true)
    if(!actual||workflowAgentJson(actual)!==workflowAgentJson(parseOrdinaryCaseRunBinding(ordinaryBinding))||actual.owner_user_id!==owner||actual.spec_id!==parent.configuration.agent_binding?.spec_id||actual.spec_revision!==parent.configuration.agent_binding?.spec_revision)throw new HttpError(409,"ordinary_case_binding_changed")
  }
  const businessBinding=state?.monitor_business??monitorBusiness
  if(businessBinding&&ordinaryBinding)throw new HttpError(409,"conflicting_case_business_binding")
  if(businessBinding)await requireMonitorAgentBinding(db,owner,businessBinding,parent.configuration.agent_binding!.spec_id,parent.configuration.agent_binding!.spec_revision)
  const spec=await currentSpec(db,owner,parent,allowNativeLocal,businessBinding!==undefined||ordinaryBinding!==undefined||authoringMonitorBusiness)
  if(state){inspectWorkflowAgentState(state,parent);if(workflowAgentJson(spec)!==workflowAgentJson(state.spec))throw new HttpError(409,"workflow_agent_snapshot_changed")}
  const binding=parent.configuration.model_binding??spec.model_binding
  if(!binding)throw new HttpError(409,"workflow_agent_model_binding_missing")
  await verifyWorkflowResourceReferences(db,owner,{title:parent.configuration.title,model_binding:binding,knowledge_base_ids:spec.knowledge_base_ids,...(spec.knowledge_retrieval?{knowledge_retrieval:spec.knowledge_retrieval}:{})})
  await verifyAgentHttpTools(db,owner,spec)
  const definitions=await resolveAgentMcpTools(db,owner,spec.mcp_tools,!state)
  if(state&&workflowAgentJson(definitions)!==workflowAgentJson(state.mcp_tool_definitions??[]))throw new HttpError(409,"workflow_agent_snapshot_changed")
  return {spec,definitions}
}
async function initializeWorkflowAgentCore(db:SqlClient,owner:string,parent:WorkflowEffectRequest,options:{rolePin?:OriginalRolePin;humanInput?:boolean;fullDelivery?:boolean;memoryContext?:AgentMemoryContext;localDevice?:import("../../../shared/native-local-device-contract.mjs").LocalBinding;monitorBusiness?:MonitorAgentBinding;caseBusiness?:OrdinaryCaseRunBinding}={}){
  const {spec,definitions}=await verifyWorkflowAgentResources(db,owner,parent,undefined,options.localDevice!==undefined,options.monitorBusiness,false,options.caseBusiness)
  if(options.humanInput===true)await requireHumanInputSchema(db)
  return createWorkflowAgentState(parent,spec,definitions,options)
}
export async function initializeWorkflowAgent(...args:Parameters<typeof initializeWorkflowAgentCore>){
 const [db,owner,,options]=args
 if(options?.rolePin)return withOriginalRoleHistory(db,owner,options.rolePin.run_id,originalRoleHash(options.rolePin),()=>initializeWorkflowAgentCore(...args))
 return initializeWorkflowAgentCore(...args)
}
