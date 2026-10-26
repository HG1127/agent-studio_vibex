// Owned source reader: complete VM evidence, or an audited leased-Worker
// failure attestation. Neither a fingerprint nor a failed row grants authority.
import {HttpError,isUuid,type SqlClient} from "./contracts.ts"
import {assertOwnedAdmissionContext} from "./repository.ts"
import {checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,workflowV2RunColumns,type WorkflowV2RunRow,type WorkflowV2StoredState} from "./workflow-v2-run-repository.ts"
import {currentKnowledgeObservations} from "./knowledge-observation-policy.ts"
import {inspectWorkflowV2EffectRequests} from "./workflow-v2-machine.ts"
import {inspectWorkflowAgentState,type WorkflowAgentState} from "./workflow-v2-agent-machine.ts"
import {agentMemoryDerivedTools} from "./agent-memory-derived-tools.ts"
import {verifyAgentMemoryDerivedCredentials} from "./agent-memory-derived-audit.ts"
import {currentAgentMemoryFailureSource} from "./agent-memory-failure-source.ts"
export type AgentMemoryDerivedSource={run_id:string;spec_id:string;status:"succeeded"|"failed";source_sha256:string;instruction:string;result_text:string;error_code:string;tools_used:string[]}
const unavailable=():never=>{throw new HttpError(409,"agent_memory_derived_source_unavailable")}
async function vmTools(db:SqlClient,owner:string,row:WorkflowV2RunRow,state:WorkflowV2StoredState):Promise<string[]|null>{
  const parents=inspectWorkflowV2EffectRequests(state.graph,state.machine).filter(p=>p.kind==="agent")
  if(parents.length!==1)return null
  const parent=parents[0]!
  let agent=state.agent_state
  if(!agent){
    if(!state.human_agent_keys?.includes(parent.step_key))return null
    const record=(await db.query<{result_reference:string}>("SELECT result_reference FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text AND tool_name='workflow:agent'",[owner,row.id,parent.step_key])).rows[0]
    if(!record)return null
    try{agent=(JSON.parse(record.result_reference) as {agent_snapshot?:{human_state?:WorkflowAgentState}}).agent_snapshot?.human_state}catch{return null}
  }
  if(!agent||agent.human_protocol!=="agent_human_input_v1"||inspectWorkflowAgentState(agent,parent).status!==row.status)return null
  return agentMemoryDerivedTools(agent,parent)
}
export async function loadAgentMemoryDerivedSource(db:SqlClient,owner:string,specId:string,runId:string):Promise<AgentMemoryDerivedSource>{
  if(!isUuid(specId)||!isUuid(runId))throw new HttpError(400,"invalid_agent_memory_derived_source")
  await assertOwnedAdmissionContext(db,owner)
  if(!await verifyAgentMemoryDerivedCredentials(db))throw new HttpError(409,"agent_memory_derived_schema_required")
  const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND agent_spec_id=$3::uuid AND kind='agent' FOR SHARE",[runId,owner,specId])).rows[0]
  if(!row)throw new HttpError(404,"agent_run_not_found")
  if(!["succeeded","failed"].includes(row.status)||!row.finished_at)return unavailable()
  const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction)
  if(state.execution_mode!=="agent_native_v2")return unavailable()
  await verifyWorkflowV2Snapshot(db,owner,row,state)
  if(!await currentKnowledgeObservations(db,row.id))return unavailable()
  const hash=(await db.query<{hash:string|null}>("SELECT agentstudio.agent_memory_run_source_sha256($1::uuid) AS hash",[row.id])).rows[0]?.hash
  if(typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash))return unavailable()
  let tools_used:string[]|null
  try{tools_used=await vmTools(db,owner,row,state)}catch(error){
    if(!(error instanceof HttpError)||![400,409].includes(error.status))throw error
    tools_used=null
  }
  if(tools_used===null){
    if(row.status!=="failed"||!await currentAgentMemoryFailureSource(db,owner,row,state.spec_revision!,state.machine.graph_sha256,hash))return unavailable()
    tools_used=[] // Worker failure proves no positive model/tool claim.
  }
  return {run_id:row.id,spec_id:row.agent_spec_id!,status:row.status as "succeeded"|"failed",source_sha256:hash,instruction:row.instruction,result_text:row.result_text,error_code:row.last_error_code,tools_used}
}
