import type {createPgNativePilotApi,PgNativeWorkflowV2Summary} from "./pgNativePilotApi.ts"
import {createPgNativeDurableRunSession,emptyDurableRunView,type DurableRunView} from "./pgNativeDurableRunSession.ts"
import {loadWorkflowRunReview,type WorkflowRunDetail} from "./pgNativeWorkflowRunSession.ts"
import {autonomousError} from "./pgNativeAutonomousAgentSession.ts"
import {safeWorkflowNodeDebugRequest,workflowNodeDebugFingerprintData} from "../../services/pg-api/src/workflow-v2-node-debug.ts"
import type {WorkflowPreviewSamples} from "../../services/pg-api/src/workflow-v2-preview.ts"
export type WorkflowDebugDraft={workflowId:string;revision:number;nodeId:string;samples:WorkflowPreviewSamples;nodeTitle?:string;workflowName?:string}
export type WorkflowDebugView=DurableRunView<WorkflowRunDetail,PgNativeWorkflowV2Summary,WorkflowDebugDraft>
export const emptyWorkflowDebugView=emptyDurableRunView<WorkflowRunDetail,PgNativeWorkflowV2Summary,WorkflowDebugDraft>()
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const debugNode=(result:WorkflowRunDetail)=>(result.run.checkpoint.node_debug as {node_id?:unknown}|undefined)?.node_id
export async function workflowDebugFingerprint(draft:WorkflowDebugDraft){
  const text=workflowNodeDebugFingerprintData(draft.workflowId,draft.revision,{node_id:draft.nodeId,samples:draft.samples})
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,"0")).join("")
}
export function createPgNativeWorkflowDebugSession(api:ReturnType<typeof createPgNativePilotApi>,options:{onExpired?:()=>void;key?:()=>string}={}){
  return createPgNativeDurableRunSession<WorkflowDebugDraft,WorkflowRunDetail,PgNativeWorkflowV2Summary>({
    get:id=>loadWorkflowRunReview(api,id),list:async()=>(await api.listWorkflowV2Runs()).filter(run=>run.debug_node_id),
    submit:async body=>{
      const expected=await workflowDebugFingerprint(body),result=await api.submitWorkflowNodeDebug(body.workflowId,{node_id:body.nodeId,expected_revision:body.revision,samples:body.samples,idempotency_key:body.key})
      if((result.run.checkpoint.node_debug as {request_sha256?:string}|undefined)?.request_sha256!==expected)throw Error("unconfirmed_node_debug_samples")
      return result
    },
    decide:(...args)=>api.decideWorkflowV2Node(...args),cancel:id=>api.cancelWorkflowV2Run(id),
  },{...options,describe:autonomousError,submittedNotice:"单模型节点测试已排队，真实调用前还需核对提示词及费用。",
    freezeDraft(draft){
      if(!uuid.test(draft.workflowId))throw Error("invalid_debug_workflow")
      const checked=safeWorkflowNodeDebugRequest({node_id:draft.nodeId,expected_revision:draft.revision,samples:draft.samples,idempotency_key:"validate-debug-draft"})
      return {workflowId:draft.workflowId.toLowerCase(),revision:checked.expected_revision,nodeId:checked.node_id,samples:checked.samples,
        ...(typeof draft.nodeTitle==="string"?{nodeTitle:draft.nodeTitle.slice(0,120)}:{}),...(typeof draft.workflowName==="string"?{workflowName:draft.workflowName.slice(0,120)}:{})}
    },
    acceptDetail:result=>result.execution_mode==="workflow_native_v2"&&result.run.kind==="workflow"&&uuid.test(result.run.workflow_id)&&typeof debugNode(result)==="string",
    acceptSubmit:(result,body)=>result.run.workflow_id===body.workflowId&&result.run.checkpoint.workflow_revision===body.revision&&result.run.instruction===body.samples.input&&debugNode(result)===body.nodeId,
  })
}
