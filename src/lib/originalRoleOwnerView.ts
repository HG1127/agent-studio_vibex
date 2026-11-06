import {safeNativeLocalAgentSpec} from '../../services/pg-api/src/native-local-agent-contract.ts'
import type {AgentSpecInput} from '../../services/pg-api/src/contracts.ts'
import {roleObject,roleText,roleSha,parseOriginalRoleUiExtension,type OriginalRole,type OriginalRoleCapability} from '../../shared/original-role-execution-contract.mjs'
export type OriginalRoleOwnerView={protocol:'original_role_owner_v1';run_id:string;spec_id:string;spec_revision:number;base_spec_sha256:string;spec_snapshot:AgentSpecInput&{roles:OriginalRole[];capability_requirements:OriginalRoleCapability[]};role_state?:{version:1;completed:string[];outputs:Record<string,string>;active_role_id:string;started_role_id:string}}
function deny():never{throw Error('original_role_owner_projection_invalid')}
export function originalRoleOwnerView(raw:unknown,scope:{runId:string;specId:string;revision:number}):OriginalRoleOwnerView{
 if(![scope.runId,scope.specId].every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))||!Number.isSafeInteger(scope.revision)||scope.revision<1)deny()
 const r=roleObject(raw,['protocol','run_id','spec_id','spec_revision','base_spec_sha256','spec_snapshot'],['role_state'])
 if(r.protocol!=='original_role_owner_v1'||r.run_id!==scope.runId||r.spec_id!==scope.specId||r.spec_revision!==scope.revision)deny()
 const snapshot=roleObject(r.spec_snapshot,['goal','task_scope','deliverables','task_plan','done_criteria','tools','knowledge_base_ids','require_approval','roles','capability_requirements'],['model_binding','http_tools','mcp_tools','knowledge_retrieval','require_plan_review'])
 if(snapshot.require_approval!==true)deny()
 const {roles,capability_requirements,require_approval:_,...base}=snapshot,spec=safeNativeLocalAgentSpec(base,true),extension=parseOriginalRoleUiExtension({roles,capability_requirements},spec.tools)
 let role_state:OriginalRoleOwnerView['role_state']
 if(r.role_state!==undefined){const s=roleObject(r.role_state,['version','completed','outputs','active_role_id','started_role_id'])
  if(s.version!==1||!Array.isArray(s.completed)||s.completed.length>extension.roles.length||s.completed.some((id,i)=>id!==extension.roles[i]?.id))deny()
  const completed=s.completed.map(id=>roleText(id,64,true)),outputs=roleObject(s.outputs,completed),active=extension.roles[completed.length]?.id??''
  if(s.active_role_id!==active||s.started_role_id!==''&&s.started_role_id!==active)deny()
  role_state={version:1,completed,outputs:Object.fromEntries(completed.map(id=>[id,roleText(outputs[id],12000,true)])),active_role_id:active,started_role_id:roleText(s.started_role_id,64)}
 }
 return {protocol:'original_role_owner_v1',run_id:scope.runId,spec_id:scope.specId,spec_revision:scope.revision,base_spec_sha256:roleSha(r.base_spec_sha256),spec_snapshot:{...spec,roles:extension.roles,capability_requirements:extension.capability_requirements},...(role_state?{role_state}:{})}
}
