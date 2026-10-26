import {createHash} from "node:crypto"
import {HttpError,isUuid,type SqlClient} from "./contracts.ts"
import type {WorkflowV2RunRow,WorkflowV2StoredState} from "./workflow-v2-run-repository.ts"
import {inspectWorkflowV2Checkpoint,inspectWorkflowV2EffectRequests,type WorkflowEffectRequest} from "./workflow-v2-machine.ts"
import {inspectWorkflowAgentState,inspectWorkflowAgentHumanHistory,workflowAgentJson,type WorkflowAgentState,type WorkflowAgentHumanInput,type WorkflowAgentHumanResponse,type WorkflowAgentHumanHistory} from "./workflow-v2-agent-machine.ts"
import {verifyWorkflowAgentResources} from "./workflow-v2-agent-resources.ts"
import type {AgentHumanResponse} from "./agent-human-input-contract.ts"
export const humanInputSha=(raw:unknown)=>createHash("sha256").update(workflowAgentJson(raw)).digest("hex")
export function humanPendingSha(run:string,source:string,step:string,input:string){return humanInputSha({run_id:run,source_sha256:source,step_key:step,input_sha256:input})}
export function humanResponseFingerprint(run:string,choice:AgentHumanResponse){return humanInputSha({run_id:run,...choice})}
export function agentHumanContext(run:Pick<WorkflowV2RunRow,"id"|"owner_user_id">,state:WorkflowV2StoredState){
  const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending
  if(parent?.kind!=="agent"||!state.agent_state||state.agent_state.human_protocol!=="agent_human_input_v1")return null
  return contextForState(run,state,parent,state.agent_state)
}
function contextForState(run:Pick<WorkflowV2RunRow,"id"|"owner_user_id">,state:WorkflowV2StoredState,parent:WorkflowEffectRequest,agent:WorkflowAgentState){
  const view=inspectWorkflowAgentState(agent,parent)
  const source_sha256=humanInputSha({run_id:run.id,owner_user_id:run.owner_user_id,execution_mode:state.execution_mode,
    graph_sha256:state.machine.graph_sha256,parent_step_key:parent.step_key,parent_input_sha256:parent.input_sha256,snapshot_sha256:agent.snapshot_sha256})
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
export type AgentHumanHistory=WorkflowAgentHumanHistory&{parent_step_key:string;node_id:string;node_title:string}
export type AgentHumanEvidence={history:AgentHumanHistory[];deliveries:Record<string,{status:"succeeded"|"rejected";output:string}>}
export async function agentHumanEvidenceExpected(db:SqlClient,run:Pick<WorkflowV2RunRow,"id"|"owner_user_id">,state:WorkflowV2StoredState):Promise<boolean>{
  if(state.human_agent_keys?.length||state.agent_state?.human_protocol)return true
  if(!isUuid(run.id)||!isUuid(run.owner_user_id))return false
  const installed=(await db.query<{ok:boolean}>("SELECT to_regclass('agentstudio.agent_human_input_responses') IS NOT NULL AS ok")).rows[0]?.ok
  if(installed!==true)return false
  return (await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.agent_human_input_responses WHERE run_id=$1::uuid AND owner_user_id=$2::uuid) OR "+
    "EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND tool_name='workflow:agent' AND "+
    "result_reference ~ '\"human_protocol\"[[:space:]]*:[[:space:]]*\"agent_human_input_v1\"') AS ok",[run.id,run.owner_user_id])).rows[0]?.ok===true
}
export async function verifyAgentHumanResponses(db:SqlClient,run:Pick<WorkflowV2RunRow,"id"|"owner_user_id">,state:WorkflowV2StoredState):Promise<AgentHumanEvidence>{
  const history:AgentHumanHistory[]=[]
  const evidence:AgentHumanEvidence={history,deliveries:Object.create(null) as AgentHumanEvidence["deliveries"]}
  const append=(parent:WorkflowEffectRequest,agent:WorkflowAgentState)=>{for(const entry of inspectWorkflowAgentHumanHistory(agent,parent))history.push({...entry,parent_step_key:parent.step_key,node_id:parent.node_id,node_title:parent.configuration.title})}
  const context=agentHumanContext(run,state)
  if(context){await verifyStateResponses(db,run,context,state.agent_state!);append(context.parent,state.agent_state!)}
  if(!state.human_agent_keys){
    if(!context&&await agentHumanEvidenceExpected(db,run,state))throw new HttpError(409,"agent_human_archive_unavailable")
    return evidence
  }
  await requireHumanInputSchema(db)
  const parents=inspectWorkflowV2EffectRequests(state.graph,state.machine).filter(p=>p.kind==="agent")
  const active=context?.parent.step_key
  const keys=state.human_agent_keys.filter(key=>key!==active)
  if(state.human_agent_keys.some(key=>!parents.some(p=>p.step_key===key)))throw new HttpError(409,"agent_human_archive_unavailable")
  if(!keys.length)return evidence
  const archived=(await db.query<{step_key:string;arguments_sha256:string;status:string;result_reference:string}>(
    "SELECT step_key,arguments_sha256,status,result_reference FROM agentstudio.external_effects WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND tool_name='workflow:agent' AND step_key=ANY($3::text[]) LIMIT 201",[run.id,run.owner_user_id,keys])).rows
  if(archived.length!==keys.length)throw new HttpError(409,"agent_human_archive_unavailable")
  for(const key of keys){
    const parent=parents.find(p=>p.step_key===key)!,row=archived.find(item=>item.step_key===key)!
    let saved:{output?:unknown;error_code?:unknown;agent_snapshot?:{human_protocol?:unknown;delivery_protocol?:unknown;human_state?:WorkflowAgentState;human_responses?:unknown;parent_input_sha256?:unknown;snapshot_sha256?:unknown;spec_id?:unknown;spec_revision?:unknown;spec?:unknown;max_steps?:unknown}}
    try{saved=JSON.parse(row.result_reference)}catch{throw new HttpError(409,"agent_human_archive_unavailable")}
    const snapshot=saved?.agent_snapshot,agent=snapshot?.human_state
    if(!agent||snapshot?.human_protocol!=="agent_human_input_v1"||agent.human_protocol!==snapshot.human_protocol||agent.delivery_protocol!==snapshot.delivery_protocol||snapshot.parent_input_sha256!==parent.input_sha256||
      row.arguments_sha256!==parent.input_sha256||snapshot.snapshot_sha256!==agent.snapshot_sha256||snapshot.spec_id!==agent.spec_id||snapshot.spec_revision!==agent.spec_revision||
      snapshot.max_steps!==(parent.configuration.max_steps??3)||workflowAgentJson(snapshot.spec)!==workflowAgentJson(agent.spec)||workflowAgentJson(snapshot.human_responses)!==workflowAgentJson(agent.human_responses??[]))
      throw new HttpError(409,"agent_human_archive_unavailable")
    const completed=contextForState(run,state,parent,agent),view=completed.view,effect=state.machine.effects.find(e=>e.step_key===key)
    if(row.status==="failed"?view.status!=="failed"||saved.error_code!==view.error_code||!!effect:
      row.status!=="succeeded"||!["succeeded","rejected"].includes(view.status)||saved.output!==view.output||!effect||effect.output!==view.output.slice(0,4000)||
      (effect.outcome==="rejected")!==(view.status==="rejected"))throw new HttpError(409,"agent_human_archive_unavailable")
    await verifyWorkflowAgentResources(db,run.owner_user_id,parent,agent)
    await verifyStateResponses(db,run,completed,agent)
    if(view.status==="succeeded"||view.status==="rejected")evidence.deliveries[parent.step_key]={status:view.status,output:view.output}
    append(parent,agent)
  }
  history.sort((a,b)=>a.step_key<b.step_key?-1:a.step_key>b.step_key?1:0)
  return evidence
}
async function verifyStateResponses(db:SqlClient,run:Pick<WorkflowV2RunRow,"id"|"owner_user_id">,context:NonNullable<ReturnType<typeof agentHumanContext>>,agent:WorkflowAgentState){
  await requireHumanInputSchema(db)
  const entries=agent.human_responses??[]
  const rows=(await db.query<{request_id:string;parent_step_key:string;step_key:string;input_sha256:string;source_sha256:string;pending_sha256:string;kind:string;decision:string;answer_sha256:string;request_sha256:string}>(
    "SELECT request_id,parent_step_key,step_key,input_sha256,source_sha256,pending_sha256,kind,decision,answer_sha256,request_sha256 FROM agentstudio.agent_human_input_responses "+
    "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND parent_step_key=$3::text LIMIT 31",[run.id,run.owner_user_id,context.parent.step_key])).rows
  if(rows.length!==entries.length)throw new HttpError(409,"agent_human_response_unavailable")
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
