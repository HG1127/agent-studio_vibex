import {optimizationHistory,type PgNativeOptimizationHistory} from './pgNativeAgentOptimization.ts'
export type OriginalRecoverableOptimization={id:string;source_run_id:string;changed_keys:string[];accepted_revision_id:string;feedback_unchanged:boolean;is_current_spec:boolean}
type Entry=PgNativeOptimizationHistory['items'][number]
export type OriginalOptimizationContext={employeeId:string;identityEpoch:number;selectionEpoch:number;runId:string|null;ready:boolean;available:boolean;canRetest:boolean;agent:{id:string;owner_user_id:string;revision:number;spec:unknown}|null}
export function createOriginalOptimizationRecovery(options:{employeeId:string;context:()=>OriginalOptimizationContext;readHistory:(id:string)=>Promise<unknown>;onChange:()=>void}){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;let disposed=false,reads=0,base='',candidate:Entry|null=null,linked:Entry|null=null,loading=false,error=''
 function scope(){try{const c=options.context(),a=c.agent;if(disposed||!c.ready||c.employeeId!==options.employeeId||!uuid.test(c.employeeId)||!a||a.owner_user_id!==c.employeeId||!uuid.test(a.id)||!Number.isSafeInteger(a.revision)||a.revision<1||!Number.isSafeInteger(c.identityEpoch)||!Number.isSafeInteger(c.selectionEpoch))return null;const source=JSON.stringify([c.employeeId,c.identityEpoch,a.id,a.revision,a.spec]);return {source,selection:JSON.stringify([source,c.selectionEpoch,c.runId,c.available,c.canRetest]),context:c,agent:a}}catch{return null}}
 const current=(s:NonNullable<ReturnType<typeof scope>>)=>scope()?.selection===s.selection
 const emit=()=>{if(!disposed)options.onChange()}
 function visible(){const s=scope();return s&&s.source===base?s:null}
 const publicCandidate=(r:Entry):OriginalRecoverableOptimization=>({id:r.request_id,source_run_id:r.run_id,changed_keys:[...r.changed_keys],accepted_revision_id:r.after_revision_id,feedback_unchanged:r.feedback_unchanged,is_current_spec:r.role_current})
 function selected(){const s=visible();return s?.context.available&&s.context.canRetest&&!loading&&candidate&&linked&&candidate.request_id===linked.request_id&&candidate.after_spec_sha256===linked.after_spec_sha256&&candidate.feedback_unchanged&&candidate.role_current?structuredClone(linked):null}
 function snapshot(){const s=visible();return !s?{candidate:null,linked:false,loading:false,error:''}:!s.context.available?{candidate:null,linked:false,loading:false,error:'当前后台尚未授权反馈优化历史读取，不能恢复旧版本关联。'}:{candidate:candidate?publicCandidate(candidate):null,linked:Boolean(selected()),loading,error}}
 async function refresh(){const s=scope(),ticket=++reads;if(!s){candidate=null;linked=null;loading=false;error='';base='';emit();return false}const previous=s.source===base?linked:null;base=s.source;candidate=null;linked=null;loading=false;error='';if(!s.context.available){error='当前后台尚未授权反馈优化历史读取，不能恢复旧版本关联。';emit();return false}loading=true;emit()
  try{const history=optimizationHistory(await options.readHistory(s.agent.id),s.agent.id);if(!current(s)||ticket!==reads)return false;const row=history.items.find(r=>r.role_current);if(row&&row.after_spec_revision!==s.agent.revision)throw Error('optimization_current_revision_changed');candidate=row??null;if(previous&&row?.request_id===previous.request_id&&row.after_spec_sha256===previous.after_spec_sha256&&row.feedback_unchanged)linked=structuredClone(row);return true}
  catch{if(current(s)&&ticket===reads){candidate=null;linked=null;error='暂时无法核验此 Agent 已接受的反馈优化版本；旧关联已停用，请重新核验。'}return false}
  finally{if(current(s)&&ticket===reads){loading=false;emit()}}
 }
 return {snapshot,selected,refresh,
  async restore(){const s=scope();if(!s)return false;if(!await refresh()||!current(s))return false;if(!candidate?.role_current||candidate.after_spec_revision!==s.agent.revision){error='服务器未确认当前完整方案仍匹配已接受的优化版本，未关联下一次运行。';emit();return false}if(!candidate.feedback_unchanged){error='原反馈已变化。当前后台要求重新接受与现有反馈一致的优化版本，未关联旧记录。';emit();return false}if(!s.context.canRetest){error='当前后台尚未授权反馈优化重测，未关联下一次运行。';emit();return false}linked=structuredClone(candidate);error='';emit();return true},
  unlink(){if(!visible())return;linked=null;error='';emit()},
  dispose(){if(disposed)return;disposed=true;reads++;candidate=null;linked=null;base='';loading=false;error=''},
 }
}
