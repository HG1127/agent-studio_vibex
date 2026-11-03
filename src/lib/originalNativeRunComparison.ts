import {nativeAgentHistoryPage,nativeAgentHistoryPageNumber} from '../../shared/native-agent-history-contract.ts'
import type {createPgNativePilotApi} from './pgNativePilotApi.ts'
import type {AgentRunRow} from '../pages/AgentRun/useAgentRun.ts'
import {originalRunDetail} from './originalAgentRunProjection.ts'
import {buildRunComparison} from './runComparison.ts'
import {optimizationHistory} from './pgNativeAgentOptimization.ts'
import {originalOptimizationRetestProofMatches,originalOptimizationRetestSelection} from './originalOptimizationRetestSelection.ts'
export type OriginalComparisonLineage={id:string;source_run_id:string;changed_keys:string[];created_ms:number;accepted_revision_id:string;feedback_unchanged:boolean}
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,'getAutonomousAgentRun'|'getAutonomousAgentHistory'|'getAutonomousAgentSteps'|'getConfigCapabilities'|'getAgentFeedback'|'getAgentOptimizations'>
type Detail=Awaited<ReturnType<Api['getAutonomousAgentRun']>>
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const deny=():never=>{throw Error('original_native_comparison_unverified')}
export const originalComparisonId=(raw:string)=>uuid.test(raw)
export function originalNativeComparisonResult(before:Detail,after:Detail,employee:string,feedback:Parameters<typeof originalRunDetail>[2]=null){
 const a=originalRunDetail(before,employee,feedback),b=originalRunDetail(after,employee)
 if(before.knowledge_outputs_available!==true||after.knowledge_outputs_available!==true||before.steps_truncated!==false||after.steps_truncated!==false||Date.parse(a.created)>Date.parse(b.created))return deny()
 const base=buildRunComparison(a,b,[],[])
 const metrics=(d:Detail)=>{
  const keys=new Set<string>();let tools=0
  for(const s of d.steps){if(!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(s.step_key)||keys.has(s.step_key)||!['pending','running','succeeded','failed','awaiting_approval','awaiting_input','skipped'].includes(s.status))return deny();keys.add(s.step_key);if(s.status==='succeeded'&&s.metadata?.agent_phase==='tool')tools++}
  return{status:d.run.status,toolResultCount:tools,approvals:null,failures:null,modelCalls:null,estimatedChars:null,durationSeconds:null}
 }
 const extra=base.hasSnapshots?(['roles','capability_requirements','model_binding','http_tools','mcp_tools','knowledge_retrieval'] as const).flatMap(key=>{
  const x=(a.spec_snapshot as Record<string,unknown>)[key],y=(b.spec_snapshot as Record<string,unknown>)[key];if(JSON.stringify(x??null)===JSON.stringify(y??null))return[]
  const labels={roles:'角色与固定 Skill 版本',capability_requirements:'角色能力要求',model_binding:'模型绑定',http_tools:'HTTP 工具绑定',mcp_tools:'MCP 工具绑定',knowledge_retrieval:'知识检索绑定'}
  return[{key,label:labels[key],before:x===undefined?'未设置':JSON.stringify(x),after:y===undefined?'未设置':JSON.stringify(y)}]
 }):[]
 return{before:a,result:{...base,changes:[...base.changes,...extra],earlier:metrics(before),later:metrics(after)}}
}
export type OriginalNativeComparison=ReturnType<typeof originalNativeComparisonResult>['result']
export type OriginalNativeComparisonReader=ReturnType<typeof createOriginalNativeRunComparison>
export type OriginalNativeComparisonView={employeeId:string;epoch:number;selectionEpoch:number;create:(run:AgentRunRow)=>OriginalNativeComparisonReader|null}
/** Read-only adapter for the existing comparison card. It never submits,
 * approves, calls a provider, fabricates events, or substitutes today's spec. */
export function createOriginalNativeRunComparison(options:{employeeId:string;run:AgentRunRow;api:Api;verifyEmployee:()=>Promise<string>;isCurrent:()=>boolean}){
 const employee=options.employeeId,expected={id:options.run.id,spec:options.run.spec_id,created:options.run.created,updated:options.run.updated};let closed=false
 if(!uuid.test(employee)||![expected.id,expected.spec].every(id=>uuid.test(id))||options.run.rh_user_id!==employee||![expected.created,expected.updated].every(t=>Number.isFinite(Date.parse(t))))return deny()
 const current=()=>!closed&&options.isCurrent()===true
 async function verified(){try{if(!current()||await options.verifyEmployee()!==employee||!current())throw Error('identity_changed')}catch{closed=true;return deny()}} 
 async function call<T>(body:()=>Promise<T>):Promise<T>{await verified();let value:T;try{value=await body()}catch(error){const status=error&&typeof error==='object'&&'status'in error?Number(error.status):0;if([401,403,404].includes(status))closed=true;throw error}await verified();return value}
 function owned(raw:Detail,id:string){const r=raw?.run as Detail['run']&{owner_user_id?:unknown};if(raw?.execution_mode!=='agent_native_v2'||r?.kind!=='agent'||r.id!==id||r.workflow_id!==null||r.owner_user_id!==employee||raw.knowledge_outputs_available!==true||!Number.isFinite(Date.parse(r.created_at))||!Number.isFinite(Date.parse(r.updated_at))){closed=true;return deny()}if(r.agent_spec_id!==expected.spec)return deny();return raw}
 async function rawDetail(id:string){if(!uuid.test(id))return deny();return owned(await call(()=>options.api.getAutonomousAgentRun(id)),id)}
 function checkedSteps(raw:unknown){if(!Array.isArray(raw)||raw.length>1000)return deny();const seen=new Set<string>();for(const step of raw){if(!step||typeof step!=='object'||typeof step.step_key!=='string'||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(step.step_key)||seen.has(step.step_key)||!['pending','running','succeeded','failed','awaiting_approval','awaiting_input','skipped'].includes(step.status)||!step.metadata||typeof step.metadata!=='object'||Array.isArray(step.metadata))return deny();seen.add(step.step_key)}return raw as Detail['steps']}
 async function detail(id:string){
  let d=await rawDetail(id);if(typeof d.steps_truncated!=='boolean')return deny();checkedSteps(d.steps)
  if(d.steps_truncated){
   const version=d.run.updated_at,created=d.run.created_at,all:Detail['steps']=[];let after='',ended=false
   for(let page=0;page<10;page++){
    const result=await call(()=>options.api.getAutonomousAgentSteps(id,after,100)),items=checkedSteps(result.items)
    if(items.length>100||items.some((s,i)=>s.step_key<=after||i>0&&s.step_key<=items[i-1]!.step_key)||result.next_after!==null&&(typeof result.next_after!=='string'||result.next_after!==items.at(-1)?.step_key||!items.length))return deny()
    all.push(...items);checkedSteps(all);if(result.next_after===null){ended=true;break}after=result.next_after
   }
   if(!ended||all.length<d.run.step_count)return deny()
   const fresh=await rawDetail(id);if(fresh.run.updated_at!==version||fresh.run.created_at!==created)return deny();d={...fresh,steps:all,steps_truncated:false}
  }
  originalRunDetail(d,employee);return d
 }
 async function source(){const d=await detail(expected.id);if(d.run.created_at!==expected.created||d.run.updated_at!==expected.updated){closed=true;return deny()}return d}
 return{
  async history(page:number){
   nativeAgentHistoryPageNumber(page);await source()
   const result=nativeAgentHistoryPage(await call(()=>options.api.getAutonomousAgentHistory(expected.spec,expected.id,page)),{specId:expected.spec,anchorRunId:expected.id,page})
   if(result.owner_user_id!==employee||Date.parse(result.anchor_created_at)!==Date.parse(expected.created)||Date.parse(result.anchor_updated_at)!==Date.parse(expected.updated)){closed=true;return deny()}
   await source();return {items:result.items,totalItems:result.totalItems,totalPages:result.totalPages}
  },
  async compare(id:string){if(id===expected.id)return deny();const [before,after,caps]=await Promise.all([detail(id),source(),call(()=>options.api.getConfigCapabilities())]);const feedback=caps.agent_feedback_available===true?await call(()=>options.api.getAgentFeedback(id)):null;const [freshBefore]=await Promise.all([rawDetail(id),source()]);if(freshBefore.run.updated_at!==before.run.updated_at)return deny();return originalNativeComparisonResult(before,after,employee,feedback)},
  async lineage():Promise<OriginalComparisonLineage|null>{const d=await source(),proof=d.optimization_retest;if(!proof)return null;const caps=await call(()=>options.api.getConfigCapabilities());if(caps.agent_optimization_available!==true)return deny();const history=optimizationHistory(await call(()=>options.api.getAgentOptimizations(expected.spec,proof.acceptance_request_id)),expected.spec),entry=history.items.find(r=>r.request_id===proof.acceptance_request_id);if(!entry)return deny();const selection=originalOptimizationRetestSelection({acceptance_request_id:entry.request_id,source_run_id:entry.run_id,spec_id:entry.spec_id,spec_revision:entry.after_spec_revision,source_sha256:entry.after_spec_sha256,feedback_id:entry.feedback_id,feedback_sha256:entry.feedback_sha256,after_revision_id:entry.after_revision_id});if(selection.spec_revision!==d.run.checkpoint.spec_revision||!originalOptimizationRetestProofMatches(proof,d.run.id,selection))return deny();await source();return{id:entry.request_id,source_run_id:entry.run_id,changed_keys:[...entry.changed_keys],created_ms:Date.parse(entry.created_at),accepted_revision_id:entry.after_revision_id,feedback_unchanged:entry.feedback_unchanged}},
  active:current,dispose(){closed=true},
 }
}
