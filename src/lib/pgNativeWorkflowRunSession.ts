import {PgNativePilotError,type createPgNativePilotApi,type PgNativeAgent,type PgNativeModelConnection,type PgNativeToolConnection,
  type PgNativeWorkflow,type PgNativeWorkflowV2Pending,type PgNativeWorkflowV2Result,type PgNativeWorkflowV2Summary} from "./pgNativePilotApi.ts"
import {createPgNativeDurableRunSession,emptyDurableRunView,type DurableRunView} from "./pgNativeDurableRunSession.ts"
import {autonomousError,autonomousReview} from "./pgNativeAutonomousAgentSession.ts"
import {parseWorkflowGraphV2,type WorkflowNodeDataV2} from "./pgNativeWorkflowGraph.ts"
type Api=ReturnType<typeof createPgNativePilotApi>
export type WorkflowRunDraft={workflowId:string;revision:number;instruction:string}
export type WorkflowRunDetail=PgNativeWorkflowV2Result&{review?:{workflow?:PgNativeWorkflow;agent?:PgNativeAgent;model?:PgNativeModelConnection;tool?:PgNativeToolConnection;unavailable:boolean}}
export type WorkflowRunView=DurableRunView<WorkflowRunDetail,PgNativeWorkflowV2Summary,WorkflowRunDraft>
export const emptyWorkflowRunView=emptyDurableRunView<WorkflowRunDetail,PgNativeWorkflowV2Summary,WorkflowRunDraft>()
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
async function optional<T>(work:Promise<T>):Promise<T|undefined>{try{return await work}catch(error){if(error instanceof PgNativePilotError&&error.status===401)throw error;return undefined}}
export function createPgNativeWorkflowRunSession(api:Api,options:{onExpired?:()=>void;key?:()=>string}={}){
  const get=async(id:string):Promise<WorkflowRunDetail>=>{
    const detail=await api.getWorkflowV2Run(id),pending=detail.pending_effect
    if(detail.run.status!=="awaiting_approval"||!pending)return detail
    const ref=pending.configuration.model_binding as WorkflowNodeDataV2["model_binding"]
    const toolRef=pending.configuration.tool_binding as WorkflowNodeDataV2["tool_binding"]
    // Metadata reads never probe a provider or retrieve decrypted material.
    const flowPromise=optional(api.getWorkflow(detail.run.workflow_id))
    const modelPromise=ref?optional(api.getModelConnection(ref.connection_id)):Promise.resolve(undefined)
    const toolPromise=toolRef?optional(api.getToolConnection(toolRef.connection_id)):Promise.resolve(undefined)
    const [workflow,initialModel,tool]=await Promise.all([flowPromise,modelPromise,toolPromise])
    let agentRef=pending.configuration.agent_binding as WorkflowNodeDataV2["agent_binding"]
    if(!agentRef&&pending.agent_context&&workflow?.graph?.version===2)try{
      agentRef=parseWorkflowGraphV2(workflow.graph).nodes.find(node=>node.id===pending.node_id)?.data.agent_binding
    }catch{/* Invalid/stale configuration can still be rejected by the owner. */}
    const agent=agentRef?await optional(api.getAgent(agentRef.spec_id)):undefined
    let model=initialModel
    if(pending.kind==="agent"&&!ref&&agent?.spec.model_binding)model=await optional(api.getModelConnection(agent.spec.model_binding.connection_id))
    return {...detail,review:{workflow,agent,model,tool,unavailable:!workflow||Boolean((ref||pending.kind==="agent")&&!model)||Boolean(toolRef&&!tool)||Boolean((agentRef||pending.agent_context)&&!agent)}}
  }
  return createPgNativeDurableRunSession<WorkflowRunDraft,WorkflowRunDetail,PgNativeWorkflowV2Summary>({
    get,list:()=>api.listWorkflowV2Runs(),submit:body=>api.submitWorkflowV2Run(body.workflowId,body.revision,body.instruction,body.key),
    decide:(...args)=>api.decideWorkflowV2Node(...args),cancel:id=>api.cancelWorkflowV2Run(id),
  },{...options,describe:autonomousError,submittedNotice:"工作流任务已提交，外部操作将逐步请求审批。",
    freezeDraft(draft){const instruction=draft.instruction.trim()
      if(!uuid.test(draft.workflowId)||!Number.isSafeInteger(draft.revision)||draft.revision<1||!instruction||instruction.length>1200||instruction.includes("\0"))throw Error("invalid_workflow_run_draft")
      return {workflowId:draft.workflowId.toLowerCase(),revision:draft.revision,instruction}
    },
    acceptDetail:result=>result.execution_mode==="workflow_native_v2"&&result.run.kind==="workflow"&&uuid.test(result.run.workflow_id),
    acceptSubmit:(result,body)=>result.run.workflow_id===body.workflowId&&result.run.instruction===body.instruction&&result.run.checkpoint.workflow_revision===body.revision,
  })
}
export function workflowApprovalReady(detail:WorkflowRunDetail|null){
  if(!detail||detail.run.status!=="awaiting_approval"||!detail.pending_effect||detail.pending_effect.missing.length||detail.review?.unavailable)return false
  const {workflow,model,tool,agent}=detail.review??{},pending=detail.pending_effect
  if(!workflow||workflow.id!==detail.run.workflow_id||workflow.revision!==detail.run.checkpoint.workflow_revision)return false
  let node:WorkflowNodeDataV2|undefined
  try{node=parseWorkflowGraphV2(workflow.graph).nodes.find(item=>item.id===pending.node_id)?.data}catch{return false}
  if(!node)return false
  if(pending.kind==="agent"||pending.agent_context){
    if(!agent||node.agent_binding?.spec_id!==agent.id||node.agent_binding.spec_revision!==agent.revision)return false
    if(pending.kind==="tool"&&!agent.spec.tools?.includes(String(pending.configuration.tool)))return false
  }
  const binding=(pending.configuration.model_binding??(pending.kind==="agent"?agent?.spec.model_binding:undefined)) as WorkflowNodeDataV2["model_binding"]
  if(pending.kind==="model"||pending.kind==="agent"||pending.configuration.tool==="summarize"){
    const bases={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",gemini:"https://generativelanguage.googleapis.com/v1beta"}
    if(!binding||!model||model.id!==binding.connection_id||model.revision!==binding.connection_revision||!model.enabled||model.status!=="ok"||model.base_url!==bases[model.provider]||!model.models.includes(binding.model_id))return false
    const expected=pending.agent_context||pending.kind==="agent"?node.model_binding??agent?.spec.model_binding:node.model_binding
    if(!expected||expected.connection_id!==binding.connection_id||expected.connection_revision!==binding.connection_revision||expected.model_id!==binding.model_id)return false
  }
  const http=pending.configuration.tool_binding as WorkflowNodeDataV2["tool_binding"]
  if(http&&(!tool||tool.id!==http.connection_id||tool.revision!==http.connection_revision||!tool.enabled||
    node.tool_binding?.connection_id!==http.connection_id||node.tool_binding?.connection_revision!==http.connection_revision))return false
  if(pending.kind==="tool"&&!pending.agent_context&&!http&&node.tool!==pending.configuration.tool)return false
  return true
}
export function workflowStepReview(pending:PgNativeWorkflowV2Pending){
  if(pending.kind==="model"&&!pending.agent_context)return {title:"模型调用",text:pending.input,charged:true}
  if(pending.kind==="tool"&&pending.configuration.tool_binding){let parameters:unknown=pending.input;try{parameters=JSON.parse(pending.input)}catch{}
    return {title:"HTTP 工具操作",text:JSON.stringify(parameters,null,2),charged:false}
  }
  return autonomousReview(pending)
}
