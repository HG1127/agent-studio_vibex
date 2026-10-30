import type {OriginalHomeAgent} from './originalHomeAgentApi.ts'
import type {PgNativeAutonomousAgentResult,PgNativeFeedbackStatus} from './pgNativePilotApi.ts'
import type {AgentRunRow,SavedSpecRow,RunStateKey,RunFeedback} from '../pages/AgentRun/useAgentRun.ts'

/** Presentation only. Native wire DTOs are retained separately and never fabricated. */
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const statuses=new Set(['queued','running','awaiting_approval','awaiting_input','paused','succeeded','failed','cancelled'])
const refuse=():never=>{throw Error('original_agent_run_projection_unavailable')}
const time=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))
function texts(v:unknown):string[]{if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))return refuse();return [...v]}
export function originalRunAgent(row:OriginalHomeAgent,employee:string):SavedSpecRow{
 if(!uuid.test(row.id)||row.owner_user_id!==employee||!Number.isSafeInteger(row.revision)||row.revision<1||!time(row.created_at)||!time(row.updated_at)||typeof row.name!=='string'||!row.name||row.spec.require_approval!==true)return refuse()
 const s=row.spec
 if(typeof s.goal!=='string'||typeof s.task_scope!=='string'||s.require_plan_review!==undefined&&typeof s.require_plan_review!=='boolean')return refuse()
 return{id:row.id,rh_user_id:employee,name:row.name,spec:{goal:s.goal,task_scope:s.task_scope,deliverables:texts(s.deliverables),tools:texts(s.tools),task_plan:texts(s.task_plan),done_criteria:texts(s.done_criteria),knowledge_base_ids:texts(s.knowledge_base_ids),require_approval:true,...(s.require_plan_review===undefined?{}:{require_plan_review:s.require_plan_review})},source:row.authoring?.source??'unknown',template_key:row.authoring?.template_key??'',created:row.created_at,updated:row.updated_at}
}
/** A current Agent title is deliberately never passed into historical run labels. */
export function originalRunIdentityLabel(specId:string):string{if(!uuid.test(specId))return refuse();return 'Agent ID '+specId+'（历史名称未提供）'}
export function originalRunFeedback(raw:PgNativeFeedbackStatus|null,runId:string,specId:string):RunFeedback|null{
 if(!raw)return null
 if(raw.run_id!==runId||raw.spec_id!==specId)return refuse()
 if(raw.state!=='active'||!raw.current?.body)return null
 return{...raw.current.body,tags:[...raw.current.body.tags],submitted_at:raw.current.created_at}
}
export function originalCompletedModelRounds(raw:PgNativeAutonomousAgentResult):number{
 if(raw.steps_truncated||!Array.isArray(raw.steps))return refuse()
 let completed=0
 for(const step of raw.steps){const m=step.metadata;if(step.status==='succeeded'&&m?.agent_phase==='model'&&Number.isSafeInteger(m.agent_round)&&Number(m.agent_round)>=1&&Number(m.agent_round)<=30)completed=Math.max(completed,Number(m.agent_round))}
 return completed
}
export function originalRunDetail(raw:PgNativeAutonomousAgentResult,employee:string,feedback:PgNativeFeedbackStatus|null=null):AgentRunRow{
 const r=raw?.run,c=r?.checkpoint
 if(raw?.execution_mode!=='agent_native_v2'||r?.kind!=='agent'||r.workflow_id!==null||!uuid.test(r.id)||!uuid.test(r.agent_spec_id)||(Object.hasOwn(r,'owner_user_id')&&(r as unknown as {owner_user_id:unknown}).owner_user_id!==employee)||!statuses.has(r.status)||!time(r.created_at)||!time(r.updated_at)||typeof r.instruction!=='string'||typeof r.result_text!=='string'||typeof r.last_error_code!=='string'||!Number.isSafeInteger(r.step_count)||r.step_count<0||!c||!Number.isSafeInteger(c.max_steps)||Number(c.max_steps)<1||Number(c.max_steps)>30||!Number.isSafeInteger(c.spec_revision)||Number(c.spec_revision)<1)return refuse()
 const completed=originalCompletedModelRounds(raw);if(completed>Number(c.max_steps))return refuse()
 const binding=c.selected_model_binding as {model_id?:unknown}|undefined
 return{id:r.id,rh_user_id:employee,spec_id:r.agent_spec_id,spec_name:originalRunIdentityLabel(r.agent_spec_id),instruction:r.instruction,status:r.status as RunStateKey,current_step:completed,max_steps:Number(c.max_steps),model:typeof binding?.model_id==='string'?binding.model_id:'',config:null,result:raw.knowledge_outputs_available===false?'':r.result_text,error:r.last_error_code,checkpoint:structuredClone(c),evaluation:null,feedback:originalRunFeedback(feedback,r.id,r.agent_spec_id),created:r.created_at,updated:r.updated_at,native_projection:{kind:'owned_detail',engine:'agent_native_v2',historical_title_available:false,timeline_available:false}}
}
