import {HttpError,type SqlClient} from './contracts.ts'
import {inspectWorkflowV2Checkpoint,inspectWorkflowV2EffectRequests,type WorkflowEffectRequest} from './workflow-v2-machine.ts'
import {inspectWorkflowAgentState,type WorkflowAgentState} from './workflow-v2-agent-machine.ts'
import type {WorkflowV2StoredState} from './workflow-v2-run-repository.ts'
import {originalRoleHash,originalRoleCanonical} from './original-role-execution.mjs'
import {originalRoleHistoryOnClient} from './original-role-history.ts'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
function deny():never{throw new HttpError(409,'original_role_real_evidence_unavailable')}
/** Replays private journals and checks both independent effect ledgers. No
 * browser completion list, model assertion or invented audit event is evidence. */
export async function verifyOriginalRoleEvidence(db:SqlClient,owner:string,runId:string,state:WorkflowV2StoredState){
 if(!state.role_run)return
 const {pin}=await originalRoleHistoryOnClient(db,owner,runId)
 if(pin.planning_mode!=='reviewed_v1')return
 const journals:{parent:WorkflowEffectRequest;agent:WorkflowAgentState}[]=[],active=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending
 if(state.agent_state){if(active?.kind!=='agent')deny();journals.push({parent:active,agent:state.agent_state})}
 const parents=inspectWorkflowV2EffectRequests(state.graph,state.machine).filter(p=>p.kind==='agent'),keys=(state.human_agent_keys??[]).filter(k=>k!==active?.step_key)
 if(keys.length){
  const rows=(await db.query<{step_key:string;arguments_sha256:string;result_reference:string;status:string}>("SELECT step_key,arguments_sha256,result_reference,status FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND tool_name='workflow:agent' AND step_key=ANY($3::text[]) FOR SHARE",[owner,runId,keys])).rows
  if(rows.length!==keys.length)deny()
  for(const key of keys){const row=rows.find(r=>r.step_key===key),parent=parents.find(p=>p.step_key===key);if(!row||!parent||row.arguments_sha256!==parent.input_sha256)deny()
   let saved:{agent_snapshot?:{human_state?:WorkflowAgentState}}
   try{saved=parseLocalTransportJson(row.result_reference,4194304) as typeof saved}catch{deny()}
   if(!saved?.agent_snapshot?.human_state)deny();journals.push({parent,agent:saved.agent_snapshot.human_state})
  }
 }
 for(const {parent,agent}of journals){
  if(originalRoleCanonical(agent.role_pin)!==originalRoleCanonical(pin))deny()
  const evidence=inspectWorkflowAgentState(agent,parent).role_evidence??[]
  for(const e of evidence){
   const rows=(await db.query<{step_key:string;status:string;arguments_sha256:string;tool_name:string;result_reference:string|null}>("SELECT step_key,status,arguments_sha256,tool_name,result_reference FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=ANY($3::text[]) FOR SHARE",[owner,runId,[e.step_key,'wf2_tool:'+e.step_key]])).rows
   const worker=rows.find(r=>r.step_key===e.step_key),broker=rows.find(r=>r.step_key==='wf2_tool:'+e.step_key)
   if(rows.length!==2||worker?.status!=='succeeded'||worker.tool_name!=='workflow:tool'||worker.arguments_sha256!==e.input_sha256||broker?.status!=='succeeded'||broker.tool_name!=='workflow.tool_bound_dispatch'||broker.arguments_sha256!==e.input_sha256||typeof worker.result_reference!=='string')deny()
   let saved:{output?:unknown};try{saved=parseLocalTransportJson(worker.result_reference,100000) as typeof saved}catch{deny()}
   if(typeof saved.output!=='string'||originalRoleHash(saved.output)!==e.output_sha256)deny()
  }
 }
}
