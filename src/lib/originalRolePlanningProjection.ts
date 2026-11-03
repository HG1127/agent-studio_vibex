import {originalRoleOwnerView} from './originalRoleOwnerView.ts'
/** Closed semantic wire check, independent of UI mode/state. */
export function originalRolePlanningProjection<T extends {run:{id:string;agent_spec_id:string;checkpoint:Record<string,unknown>};original_role?:unknown;knowledge_outputs_available?:boolean}>(result:T,expected?:{taskPlanning:'reviewed_v1'|undefined}):T{
 if(!result?.run?.checkpoint||typeof result.run.checkpoint!=='object'||Array.isArray(result.run.checkpoint))throw Error('invalid_original_role_planning_projection')
 const c=result.run.checkpoint,mode=c.task_planning,present=Object.hasOwn(c,'task_planning')
 if(present&&mode!=='reviewed_v1'||mode==='reviewed_v1'&&c.require_plan_review!==true||expected!==undefined&&mode!==expected.taskPlanning)throw Error('invalid_original_role_planning_projection')
 if(result.original_role!==undefined){const revision=c.spec_revision;if(!Number.isSafeInteger(revision)||Number(revision)<1)throw Error('invalid_original_role_planning_projection');originalRoleOwnerView(result.original_role,{runId:result.run.id,specId:result.run.agent_spec_id,revision:Number(revision)})}
 if(mode==='reviewed_v1'&&result.knowledge_outputs_available!==false&&result.original_role===undefined)throw Error('invalid_original_role_planning_projection')
 return result
}
