import {createHash} from "node:crypto"
import {HttpError,type SqlClient} from "./contracts.ts"
import type {WorkflowV2RunRow,WorkflowV2StoredState} from "./workflow-v2-run-repository.ts"
import {inspectWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {inspectWorkflowAgentState,workflowAgentJson,type WorkflowAgentHumanInput,type WorkflowAgentHumanResponse} from "./workflow-v2-agent-machine.ts"
import type {AgentHumanResponse} from "./agent-human-input-contract.ts"
export const humanInputSha=(raw:unknown)=>createHash("sha256").update(workflowAgentJson(raw)).digest("hex")
export function humanPendingSha(run:string,source:string,step:string,input:string){return humanInputSha({run_id:run,source_sha256:source,step_key:step,input_sha256:input})}
export function humanResponseFingerprint(run:string,choice:AgentHumanResponse){return humanInputSha({run_id:run,...choice})}
export function agentHumanContext(run:Pick<WorkflowV2RunRow,"id"|"owner_user_id">,state:WorkflowV2StoredState){
  const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending
  if(parent?.kind!=="agent"||!state.agent_state||state.agent_state.human_protocol!=="agent_human_input_v1")return null
  const view=inspectWorkflowAgentState(state.agent_state,parent)
  const source_sha256=humanInputSha({run_id:run.id,owner_user_id:run.owner_user_id,execution_mode:state.execution_mode,
    graph_sha256:state.machine.graph_sha256,parent_step_key:parent.step_key,parent_input_sha256:parent.input_sha256,snapshot_sha256:state.agent_state.snapshot_sha256})
  const pending=view.pending_input
  return {parent,view,source_sha256,pending_input:pending?{...pending,pending_sha256:humanPendingSha(run.id,source_sha256,pending.step_key,pending.input_sha256)}:null}
}
export type HumanInputReceipt={run_id:string;request_id:string;pending_step_key:string;pending_sha256:string;source_sha256:string;decision:AgentHumanResponse["decision"];recorded:true;status:"queued";replayed:boolean}
export function humanInputReceipt(run:string,choice:AgentHumanResponse,replayed=false):HumanInputReceipt{return {run_id:run,request_id:choice.request_id,pending_step_key:choice.pending_step_key,
  pending_sha256:choice.pending_sha256,source_sha256:choice.source_sha256,decision:choice.decision,recorded:true,status:"queued",replayed}}
export async function requireHumanInputSchema(db:SqlClient):Promise<void>{
  const state=(await db.query<{ok:boolean}>("SELECT to_regclass('agentstudio.agent_human_input_responses') IS NOT NULL AND EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_048') AS ok")).rows[0]?.ok
  if(state!==true)throw new HttpError(409,"agent_human_input_runtime_required")
}
export async function verifyAgentHumanResponses(db:SqlClient,run:Pick<WorkflowV2RunRow,"id"|"owner_user_id">,state:WorkflowV2StoredState):Promise<void>{
  const context=agentHumanContext(run,state)
  if(!context)return
  await requireHumanInputSchema(db)
  const entries=state.agent_state!.human_responses??[]
  if(!entries.length)return
  const rows=(await db.query<{request_id:string;parent_step_key:string;step_key:string;input_sha256:string;source_sha256:string;pending_sha256:string;kind:string;decision:string;answer_sha256:string;request_sha256:string}>(
    "SELECT request_id,parent_step_key,step_key,input_sha256,source_sha256,pending_sha256,kind,decision,answer_sha256,request_sha256 FROM agentstudio.agent_human_input_responses "+
    "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND request_id=ANY($3::uuid[])",[run.id,run.owner_user_id,entries.map(e=>e.request_id)])).rows
  for(const entry of entries){
    const stored=rows.find(row=>row.request_id===entry.request_id)
    const choice:AgentHumanResponse={request_id:entry.request_id,pending_step_key:entry.step_key,
      pending_sha256:humanPendingSha(run.id,context.source_sha256,entry.step_key,entry.input_sha256),source_sha256:context.source_sha256,
      decision:entry.decision,answer:entry.answer,confirm:true}
    if(!stored||stored.parent_step_key!==context.parent.step_key||stored.step_key!==entry.step_key||stored.input_sha256!==entry.input_sha256||
      stored.source_sha256!==choice.source_sha256||stored.pending_sha256!==choice.pending_sha256||stored.decision!==entry.decision||
      stored.kind!==(entry.decision==="reply"?"clarification":"plan_review")||stored.answer_sha256!==humanInputSha(entry.answer)||
      stored.request_sha256!==humanResponseFingerprint(run.id,choice))throw new HttpError(409,"agent_human_response_unavailable")
  }
}
export function humanResponseEntry(choice:AgentHumanResponse,pending:WorkflowAgentHumanInput):WorkflowAgentHumanResponse{
  return {request_id:choice.request_id,step_key:pending.step_key,input_sha256:pending.input_sha256,decision:choice.decision,answer:choice.answer}
}
