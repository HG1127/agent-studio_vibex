import {PgNativePilotError,type createPgNativePilotApi,type PgNativeAgent,type PgNativeModelConnection,type PgNativeToolConnection,type PgNativeMcpConnection,
  type PgNativeWorkflow,type PgNativeWorkflowV2Pending,type PgNativeWorkflowV2Result,type PgNativeWorkflowV2Summary} from "./pgNativePilotApi.ts"
import {createPgNativeDurableRunSession,emptyDurableRunView,type DurableRunView} from "./pgNativeDurableRunSession.ts"
import {autonomousError,autonomousReview} from "./pgNativeAutonomousAgentSession.ts"
import {parseWorkflowGraphV2,type WorkflowNodeDataV2} from "./pgNativeWorkflowGraph.ts"
import {declaredAgentHttpTool} from "./pgNativeAgentHttpTools.ts"
import {declaredAgentMcpTool,readyAgentMcpTools,readyMcpBinding} from "./pgNativeMcpConnection.ts"
import {optionalKnowledgeToolContext,knowledgeBindingCurrent,knowledgePendingMatches,knowledgeToolScopeCurrent,usesPaidKnowledge,type KnowledgeToolContext} from "./pgNativeKnowledgeTool.ts"
type Api=ReturnType<typeof createPgNativePilotApi>
export type WorkflowRunDraft={workflowId:string;revision:number;instruction:string}
export type WorkflowRunDetail=PgNativeWorkflowV2Result&{review?:{workflow?:PgNativeWorkflow;agent?:PgNativeAgent;model?:PgNativeModelConnection;tool?:PgNativeToolConnection;mcp?:PgNativeMcpConnection;mcpConnections?:PgNativeMcpConnection[];mcpEnabled?:boolean;knowledge?:KnowledgeToolContext;unavailable:boolean}}
export type WorkflowRunView=DurableRunView<WorkflowRunDetail,PgNativeWorkflowV2Summary,WorkflowRunDraft>
export const emptyWorkflowRunView=emptyDurableRunView<WorkflowRunDetail,PgNativeWorkflowV2Summary,WorkflowRunDraft>()
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
async function optional<T>(work:Promise<T>):Promise<T|undefined>{try{return await work}catch(error){if(error instanceof PgNativePilotError&&error.status===401)throw error;return undefined}}
export async function loadWorkflowRunReview(api:Api,id:string):Promise<WorkflowRunDetail>{
    const detail=await api.getWorkflowV2Run(id),pending=detail.pending_effect
    if(detail.run.status!=="awaiting_approval"||!pending)return detail
    const ref=pending.configuration.model_binding as WorkflowNodeDataV2["model_binding"]
    const toolRef=pending.configuration.tool_binding as WorkflowNodeDataV2["tool_binding"]
    const mcpRef=pending.configuration.mcp_binding as WorkflowNodeDataV2["mcp_binding"]
    // Metadata reads never probe a provider or retrieve decrypted material.
    const flowPromise=optional(api.getWorkflow(detail.run.workflow_id))
    const modelPromise=ref?optional(api.getModelConnection(ref.connection_id)):Promise.resolve(undefined)
    const toolPromise=toolRef?optional(api.getToolConnection(toolRef.connection_id)):Promise.resolve(undefined)
    const mcpPromise=mcpRef?optional(api.getMcpConnection(mcpRef.connection_id)):Promise.resolve(undefined)
    const [workflow,initialModel,tool,mcp]=await Promise.all([flowPromise,modelPromise,toolPromise,mcpPromise])
    let agentRef=pending.configuration.agent_binding as WorkflowNodeDataV2["agent_binding"]
    if(!agentRef&&pending.agent_context&&workflow?.graph?.version===2)try{
      agentRef=parseWorkflowGraphV2(workflow.graph).nodes.find(node=>node.id===pending.node_id)?.data.agent_binding
    }catch{/* Invalid/stale configuration can still be rejected by the owner. */}
    const agent=agentRef?await optional(api.getAgent(agentRef.spec_id)):undefined
    let model=initialModel
    if(pending.kind==="agent"&&!ref&&agent?.spec.model_binding)model=await optional(api.getModelConnection(agent.spec.model_binding.connection_id))
    const needsMcp=Boolean(mcpRef||agent?.spec.mcp_tools?.length)
    const mcpIds=[...new Set(agent?.spec.mcp_tools?.map(tool=>tool.connection_id)??[])]
    const [capability,metadata]=needsMcp?await Promise.all([optional(api.getConfigCapabilities()),Promise.all(mcpIds.map(id=>id===mcp?.id?Promise.resolve(mcp):optional(api.getMcpConnection(id))))]):[undefined,[]]
    const mcps=metadata.filter((row):row is PgNativeMcpConnection=>Boolean(row)),mcpEnabled=capability?.mcp_tool_runs_enabled===true
    const needsKnowledge=Boolean(pending.configuration.knowledge_retrieval||agent?.spec.knowledge_retrieval||workflow?.graph?.nodes.some(node=>Boolean((node as {data?:WorkflowNodeDataV2}).data?.knowledge_retrieval)))
    const knowledge=needsKnowledge?await optionalKnowledgeToolContext(api):undefined
    return {...detail,review:{workflow,agent,model,tool,...(needsMcp?{mcp,mcpConnections:mcps,mcpEnabled}:{}),
      ...(needsKnowledge?{knowledge}:{}),
      unavailable:!workflow||Boolean((ref||pending.kind==="agent")&&!model)||Boolean(toolRef&&!tool)||Boolean((agentRef||pending.agent_context)&&!agent)||needsMcp&&(!mcpEnabled||Boolean(mcpRef&&!mcp)||mcps.length!==mcpIds.length)}}
  }
export function createPgNativeWorkflowRunSession(api:Api,options:{onExpired?:()=>void;key?:()=>string}={}){

  return createPgNativeDurableRunSession<WorkflowRunDraft,WorkflowRunDetail,PgNativeWorkflowV2Summary>({
    get:id=>loadWorkflowRunReview(api,id),list:()=>api.listWorkflowV2Runs(),submit:body=>api.submitWorkflowV2Run(body.workflowId,body.revision,body.instruction,body.key),
    decide:(...args)=>api.decideWorkflowV2Node(...args),cancel:id=>api.cancelWorkflowV2Run(id),
  },{...options,describe:autonomousError,submittedNotice:"工作流任务已提交，外部操作将逐步请求审批。",
    canApprove:detail=>!usesPaidKnowledge(detail.pending_effect)||workflowApprovalReady(detail),
    freezeDraft(draft){const instruction=draft.instruction.trim()
      if(!uuid.test(draft.workflowId)||!Number.isSafeInteger(draft.revision)||draft.revision<1||!instruction||instruction.length>1200||instruction.includes("\0"))throw Error("invalid_workflow_run_draft")
      return {workflowId:draft.workflowId.toLowerCase(),revision:draft.revision,instruction}
    },
    acceptDetail:result=>result.execution_mode==="workflow_native_v2"&&result.run.kind==="workflow"&&uuid.test(result.run.workflow_id),
    acceptSubmit:(result,body)=>!result.run.checkpoint.node_debug&&result.run.workflow_id===body.workflowId&&result.run.instruction===body.instruction&&result.run.checkpoint.workflow_revision===body.revision,
  })
}
export function workflowApprovalReady(detail:WorkflowRunDetail|null){
  if(!detail||detail.run.status!=="awaiting_approval"||!detail.pending_effect||detail.pending_effect.missing.length||detail.review?.unavailable)return false
  const {workflow,model,tool,agent,mcp,mcpConnections,mcpEnabled,knowledge}=detail.review??{},pending=detail.pending_effect
  if(!workflow||workflow.id!==detail.run.workflow_id||workflow.revision!==detail.run.checkpoint.workflow_revision)return false
  let node:WorkflowNodeDataV2|undefined
  try{const graph=parseWorkflowGraphV2(workflow.graph);node=graph.nodes.find(item=>item.id===pending.node_id)?.data
    if(graph.nodes.some(item=>item.data.knowledge_retrieval&&(!knowledgeBindingCurrent(item.data.knowledge_retrieval,knowledge)||!knowledgeToolScopeCurrent(item.data.knowledge_base_ids??[],knowledge))))return false
  }catch{return false}
  if(!node)return false
  if(pending.kind==="agent"||pending.agent_context){
    if(!agent||node.agent_binding?.spec_id!==agent.id||node.agent_binding.spec_revision!==agent.revision)return false
    if(agent.spec.knowledge_retrieval&&(!knowledgeBindingCurrent(agent.spec.knowledge_retrieval,knowledge)||!knowledgeToolScopeCurrent(agent.spec.knowledge_base_ids??[],knowledge)))return false
    if(agent.spec.mcp_tools?.length&&(!mcpEnabled||!readyAgentMcpTools(agent,mcpConnections??[])))return false
    if(pending.kind==="tool"&&(pending.configuration.mcp_binding?pending.configuration.tool!==undefined||Boolean(pending.configuration.tool_binding)||!declaredAgentMcpTool(agent,pending.configuration.mcp_binding):pending.configuration.tool_binding?
      pending.configuration.tool!==undefined||!declaredAgentHttpTool(agent,pending.configuration.tool_binding):!agent.spec.tools?.includes(String(pending.configuration.tool))))return false
  }
  const binding=(pending.configuration.model_binding??(pending.kind==="agent"?agent?.spec.model_binding:undefined)) as WorkflowNodeDataV2["model_binding"]
  if(pending.kind==="model"||pending.kind==="agent"||pending.configuration.tool==="summarize"){
    const bases={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",gemini:"https://generativelanguage.googleapis.com/v1beta"}
    if(!binding||!model||model.id!==binding.connection_id||model.revision!==binding.connection_revision||!model.enabled||model.status!=="ok"||model.base_url!==bases[model.provider]||!model.models.includes(binding.model_id))return false
    const expected=pending.agent_context||pending.kind==="agent"?node.model_binding??agent?.spec.model_binding:node.model_binding
    if(!expected||expected.connection_id!==binding.connection_id||expected.connection_revision!==binding.connection_revision||expected.model_id!==binding.model_id)return false
  }
  const http=pending.configuration.tool_binding as WorkflowNodeDataV2["tool_binding"]
  const mcpRef=pending.configuration.mcp_binding as WorkflowNodeDataV2["mcp_binding"]
  const expectedMcp=pending.agent_context?declaredAgentMcpTool(agent,mcpRef):node.mcp_binding
  if(mcpRef&&(!mcpEnabled||!expectedMcp||!readyMcpBinding(mcpRef,mcp)||Object.entries(mcpRef).some(([key,value])=>expectedMcp[key as keyof typeof mcpRef]!==value)))return false
  const expectedHttp=pending.agent_context?declaredAgentHttpTool(agent,http):node.tool_binding
  if(http&&(!tool||tool.id!==http.connection_id||tool.revision!==http.connection_revision||!tool.enabled||
    expectedHttp?.connection_id!==http.connection_id||expectedHttp?.connection_revision!==http.connection_revision))return false
  if(pending.kind==="tool"&&!pending.agent_context&&!http&&!mcpRef&&node.tool!==pending.configuration.tool)return false
  if(pending.kind==="tool"&&pending.configuration.tool==="knowledge_search"&&!knowledgePendingMatches(pending,pending.agent_context?agent?.spec.knowledge_retrieval:node.knowledge_retrieval,
    (pending.agent_context?agent?.spec.knowledge_base_ids:node.knowledge_base_ids)??[]))return false
  return true
}
export function workflowStepReview(pending:PgNativeWorkflowV2Pending,knowledge?:KnowledgeToolContext){
  if(pending.kind==="model"&&!pending.agent_context)return {title:"模型调用",text:pending.input,charged:true}
  if(pending.kind==="tool"&&pending.configuration.tool_binding){let parameters:unknown=pending.input;try{parameters=JSON.parse(pending.input)}catch{}
    return {title:"HTTP 工具操作",text:JSON.stringify(parameters,null,2),charged:false}
  }
  return autonomousReview(pending,knowledge)
}
