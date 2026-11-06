import {HttpError,type SqlClient} from './contracts.ts'
import {inspectWorkflowV2Checkpoint,inspectWorkflowV2EffectRequests,type WorkflowEffectRequest} from './workflow-v2-machine.ts'
import {inspectWorkflowAgentState,type WorkflowAgentState} from './workflow-v2-agent-machine.ts'
import {originalRoleHistoryOnClient} from './original-role-history.ts'
import {originalRoleCanonical} from './original-role-execution.mjs'
import type {WorkflowV2StoredState} from './workflow-v2-run-repository.ts'
import {reviewedPlanRoles} from './original-role-reviewed-plan.mjs'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
function deny():never{throw new HttpError(409,'original_role_projection_unavailable')}
/** Called after the normal owned source/human/effect evidence check. Projects
 * only the admitted display spec and actual journal handoffs, never Skill text. */
export async function originalRoleOwnerProjection(db:SqlClient,owner:string,runId:string,state:WorkflowV2StoredState){
 const {pin,spec:source}=await originalRoleHistoryOnClient(db,owner,runId)
 let agent=state.agent_state,parent:WorkflowEffectRequest|undefined=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending??undefined
 if(!agent&&state.human_agent_keys?.length){
  if(state.human_agent_keys.length!==1)deny();const archivedKey=state.human_agent_keys[0];parent=inspectWorkflowV2EffectRequests(state.graph,state.machine).find(p=>p.step_key===archivedKey&&p.kind==='agent')
  if(!parent)deny()
  const rows=(await db.query<{result_reference:string}>("SELECT result_reference FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text AND tool_name='workflow:agent' FOR SHARE",[owner,runId,parent.step_key])).rows
  const row=rows[0];if(rows.length!==1||!row)deny();let saved:{agent_snapshot?:{human_state?:WorkflowAgentState}}
  try{saved=parseLocalTransportJson(row.result_reference,4194304) as typeof saved}catch{deny()}
  agent=saved.agent_snapshot?.human_state;if(!agent)deny()
 }
 const view=agent&&parent?inspectWorkflowAgentState(agent,parent):null
 if(agent&&originalRoleCanonical(agent.role_pin)!==originalRoleCanonical(pin))deny()
 const roles=view?.reviewed_plan?reviewedPlanRoles(view.reviewed_plan):pin.extension.roles
 const spec_snapshot={...source,roles,capability_requirements:pin.extension.capability_requirements}
 let role_state:{version:1;completed:string[];outputs:Record<string,string>;active_role_id:string;started_role_id:string}|undefined
 if(view&&agent&&parent){
  const completed=view.role_handoffs??[],active=roles[completed.length],started=view.role_events?.find(e=>e.kind==='role_started'&&e.role_id===active?.id)
  const parentKey=parent.step_key,actualModel=started&&agent.results.some(r=>r.step_key===parentKey+'_a'+String(started.round).padStart(2,'0')+'m'&&!r.outcome),activeId=active?.id??''
  role_state={version:1,completed:completed.map(r=>r.role_id),outputs:Object.fromEntries(completed.map(r=>[r.role_id,r.output])),active_role_id:activeId,started_role_id:actualModel?activeId:''}
 }
 return {protocol:'original_role_owner_v1' as const,run_id:runId,spec_id:pin.spec_id,spec_revision:pin.spec_revision,base_spec_sha256:pin.base_spec_sha256,spec_snapshot,...(role_state?{role_state}:{})}
}
