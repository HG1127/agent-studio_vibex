import {PgNativePilotError,type createPgNativePilotApi,type WorkflowLatestOutputs,type PgNativeAutonomousAgentResult,type PgNativeWorkflowV2Result} from './pgNativePilotApi.ts'
import {nativeRunControlRequest,nativeRunControlConfirmed,type NativeRunControlRequest} from './pgNativeAgentRunControl.ts'
import {originalRunKinds,originalRunId,type OriginalRunKind,type OriginalRunTarget} from './originalRunDetailRoute.ts'
import {projectOriginalRunDetail,originalPublicSteps,originalRecentRun} from './originalRunDetailProjection.ts'
import type {RunDetailRow,RecentRunRow} from '../pages/RunDetail/useRunDetail.ts'
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,'getRun'|'getWorkflowRun'|'getWorkflowV2Run'|'getAutonomousAgentRun'|'listRuns'|'listWorkflowRuns'|'listWorkflowV2Runs'|'listAutonomousAgentRuns'|'getWorkflowV2Steps'|'getAutonomousAgentSteps'|'getWorkflowV2Outputs'|'getConfigCapabilities'|'controlAutonomousAgentRun'|'confirmAutonomousAgentRunControl'|'cancelAutonomousAgentRun'|'cancelWorkflowV2Run'|'getAgentFeedback'>
export type OriginalDetailPending={owner:string;id:string;kind:'agent_autonomous'|'workflow_v2';action:'pause'|'resume'|'cancel';body?:NativeRunControlRequest}
export function originalDetailPending(raw:unknown,owner:string):OriginalDetailPending|null{
 if(raw===null)return null
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid_original_control_recovery')
 const p=raw as OriginalDetailPending
 if(p.owner!==owner||!originalRunId(p.id)||!originalRunId(owner)||!['agent_autonomous','workflow_v2'].includes(p.kind)||!['pause','resume','cancel'].includes(p.action)||p.kind==='workflow_v2'&&p.action!=='cancel'||Object.keys(p).sort().join(',')!==(p.action==='cancel'?'action,id,kind,owner':'action,body,id,kind,owner'))throw Error('invalid_original_control_recovery')
 return Object.freeze({...p,...(p.action==='cancel'?{}:{body:nativeRunControlRequest(p.body!)})})
}
const live=new Set(['queued','running','paused','awaiting_approval','awaiting_input']),terminal=new Set(['succeeded','failed','cancelled'])
export function createOriginalRunDetailSession(o:{employee:string;api:Api;verifyEmployee:()=>Promise<string>;key?:()=>string;recovery?:{load():unknown;save(value:OriginalDetailPending|null):void}}){
 if(!originalRunId(o.employee))throw Error('invalid_original_detail_employee')
 let pending=originalDetailPending(o.recovery?.load()??null,o.employee),active=true,closed=false,epoch=0,read=0,busy=false,loading=false,error='',notice='',run:RunDetailRow|null=null,recent:RecentRunRow[]=[],outputs:WorkflowLatestOutputs|null=null,selected:OriginalRunTarget|null=pending?{id:pending.id,kind:pending.kind}:null
 const listeners=new Set<()=>void>(),api=o.api
 const publish=()=>listeners.forEach(f=>f())
 const addNotice=(text:string)=>{notice=[...new Set([...notice.split('\n'),text])].filter(Boolean).slice(-6).join('\n')}
 const wipe=()=>{run=null;recent=[];outputs=null}
 const hide=(message:string)=>{++epoch;++read;wipe();loading=false;error=message;publish()}
 async function identity(){let who:string;try{who=await o.verifyEmployee()}catch{hide('员工会话尚未核实，私有正文已隐藏；原未确认操作已保留。');throw Error('original_detail_identity_unavailable')}if(closed||!active||who!==o.employee){hide('员工身份已变化，私有正文已隐藏；原操作只可由原员工核对。');throw Error('original_detail_employee_changed')}}
 const call=async<T>(work:()=>Promise<T>):Promise<T>=>{await identity();const value=await work();await identity();return value}
 const get=(target:{kind:OriginalRunKind;id:string}):Promise<unknown>=>call<unknown>(()=>target.kind==='agent_single'?api.getRun(target.id):target.kind==='workflow_safe'?api.getWorkflowRun(target.id):target.kind==='workflow_v2'?api.getWorkflowV2Run(target.id):api.getAutonomousAgentRun(target.id))
 function save(p:OriginalDetailPending|null){o.recovery?.save(p);pending=p;publish()}
 async function resolve(target:OriginalRunTarget){
  if(target.kind)return{target:{id:target.id,kind:target.kind},raw:await get({id:target.id,kind:target.kind})}
  // Old upstream links omit kind. Read all four owner-scoped protocols; never
  // choose first success or infer an engine from current resource metadata.
  const values=await Promise.all(originalRunKinds.map(async kind=>{try{const raw=await get({id:target.id,kind});projectOriginalRunDetail(raw,kind,target.id,o.employee);return{target:{id:target.id,kind},raw}}catch(e){if(e instanceof PgNativePilotError&&e.status===404)return null;throw e}}))
  const found=values.filter((v):v is NonNullable<typeof v>=>v!==null)
  if(found.length!==1)throw new PgNativePilotError(found.length?409:404,'original_run_kind_unconfirmed')
  return found[0]
 }
 function unchanged(a:RunDetailRow,b:RunDetailRow){if(a.id!==b.id||a.native!.kind!==b.native!.kind||a.native!.resourceId!==b.native!.resourceId||a.native!.revision!==b.native!.revision||a.updated!==b.updated||a.native!.sourceAvailable!==b.native!.sourceAvailable)throw Error('original_run_changed_during_read')}
 async function refresh(target=selected){
  if(closed||!active||busy)return
  const ticket=++read,life=epoch;wipe();loading=true;error='';publish()
  try{
   await identity();if(!target){await history();return}
   const resolved=await resolve(target),next=projectOriginalRunDetail(resolved.raw,resolved.target.kind,target.id,o.employee)
   if(next.native!.kind==='agent_autonomous'&&next.native!.sourceAvailable){
    const cap=await call(()=>api.getConfigCapabilities())
    if(cap.agent_feedback_available===true){const status=await call(()=>api.getAgentFeedback(next.id));if(status.run_id!==next.id||status.spec_id!==next.spec_id)throw Error('original_feedback_source_changed');if(status.state==='active'&&status.current?.body)next.feedback={...status.current.body,tags:[...status.current.body.tags],submitted_at:status.current.created_at}}
   }
   let nextOutputs:WorkflowLatestOutputs|null=null
   if(next.native!.kind==='workflow_v2'&&next.native!.sourceAvailable){
    try{nextOutputs=await call(()=>api.getWorkflowV2Outputs(next.id));if(nextOutputs.run.run_id!==next.id||nextOutputs.run.workflow_id!==next.native!.resourceId||nextOutputs.run.workflow_revision!==next.native!.revision||nextOutputs.run.updated_at!==next.updated)throw Error('original_output_source_changed')}
    catch(e){if(e instanceof PgNativePilotError&&[401,403,404].includes(e.status))throw e;addNotice('公开节点输出暂未核实；结果卡仍只显示已验证运行正文。');nextOutputs=null}
   }
   const fresh=projectOriginalRunDetail(await get(resolved.target),resolved.target.kind,target.id,o.employee);unchanged(next,fresh)
   if(closed||!active||life!==epoch||ticket!==read)return
   selected=resolved.target;run=next;outputs=nextOutputs
   addNotice('当前为已存储步骤快照；后台未提供原事件流、完整历史名称和完整配置快照。')
  }catch(e){if(life===epoch&&ticket===read){wipe();error=e instanceof PgNativePilotError&&e.status===404?'运行不存在或无权查看。':'运行来源、权限或状态尚未核实；私有正文已隐藏。'}}
  finally{if(ticket===read){loading=false;publish()}}
 }
 async function history(){
  const life=epoch,ticket=read
  const rows=await Promise.all([call(()=>api.listRuns()).then(rows=>rows.map(r=>({kind:'agent_single' as const,id:r.id,date:r.created_at}))),call(()=>api.listWorkflowRuns()).then(rows=>rows.map(r=>({kind:'workflow_safe' as const,id:r.run.id,date:r.run.created_at}))),call(()=>api.listWorkflowV2Runs()).then(rows=>rows.map(r=>({kind:'workflow_v2' as const,id:r.id,date:r.created_at}))),call(()=>api.listAutonomousAgentRuns()).then(rows=>rows.map(r=>({kind:'agent_autonomous' as const,id:r.id,date:r.created_at})))])
  if(rows.some(list=>list.length>50)||rows.flat().some(r=>!originalRunId(r.id)||!Number.isFinite(Date.parse(r.date))))throw Error('invalid_original_history')
  const candidates=rows.flat().sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).slice(0,5)
  if(new Set(candidates.map(r=>r.kind+':'+r.id)).size!==candidates.length)throw Error('duplicate_original_history')
  const details=await Promise.all(candidates.map(async t=>originalRecentRun(projectOriginalRunDetail(await get(t),t.kind,t.id,o.employee))))
  if(life===epoch&&ticket===read&&active&&!closed){recent=details;notice='仅从各类接口返回的最近记录中选取5条；后台尚无完整运行历史分页合同。'}
 }
 async function loadMoreSteps(){
  if(!run?.native||busy||loading||!active||closed)return
  const current=run,n=current.native!,target={id:current.id,kind:n.kind},life=epoch,ticket=++read
  if(!['workflow_v2','agent_autonomous'].includes(n.kind)||n.steps.length>=1000)return
  loading=true;run=null;outputs=null;publish()
  try{
   const after=n.nextAfter??'',page=await call(()=>n.kind==='workflow_v2'?api.getWorkflowV2Steps(current.id,after,100):api.getAutonomousAgentSteps(current.id,after,100))
   const items=originalPublicSteps(page.items,n.sourceAvailable)
   if(items.length>100||items.some(s=>!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(s.step_key)||s.step_key<=after)||items.some((s,i)=>i>0&&s.step_key<=items[i-1]!.step_key)||page.next_after!==null&&(page.next_after!==items.at(-1)?.step_key||!items.length))throw Error('invalid_original_step_page')
   const steps=after?[...n.steps,...items]:items;if(steps.length>1000||new Set(steps.map(s=>s.step_key)).size!==steps.length)throw Error('original_step_page_bound')
   const fresh=projectOriginalRunDetail(await get(target),n.kind,current.id,o.employee);unchanged(current,fresh)
   if(life!==epoch||ticket!==read||!active||closed)return
   run={...fresh,native:{...fresh.native!,steps,stepsComplete:page.next_after===null,nextAfter:page.next_after}};notice=steps.length>=1000&&page.next_after?'当前仅展示前1000个步骤，仍有未读取记录。':'这是公开步骤状态快照，不是事件时间线。'
  }catch{if(life===epoch&&ticket===read){wipe();error='步骤来源或权限已变化，请重新读取原运行。'}}finally{if(ticket===read){loading=false;publish()}}
 }
 async function control(action:'pause'|'resume'|'cancel'){
  if(closed||!active||busy)return
  if(pending){await confirmPending();return}
  if(!run?.native||!live.has(run.status))return
   const current=run,n=current.native!,target={id:current.id,kind:n.kind},life=epoch
  if(n.kind!=='agent_autonomous'&&!(action==='cancel'&&n.kind==='workflow_v2')){error='此运行种类没有该控制合同。';publish();return}
  let acknowledged=false
  busy=true;error='';publish()
  try{
   const cap=await call(()=>api.getConfigCapabilities()),fresh=projectOriginalRunDetail(await get(target),n.kind,current.id,o.employee);unchanged(current,fresh)
   if(cap.mode!=='native_pg18'||!live.has(fresh.status)||action!=='cancel'&&(!fresh.native!.sourceAvailable||!cap.config_writes_enabled||!cap.autonomous_agent_submission_enabled||!(action==='pause'?fresh.native!.control?.can_pause:fresh.native!.control?.can_resume)))throw Error('original_control_not_allowed')
   const request=originalDetailPending({owner:o.employee,id:current.id,kind:n.kind,action,...(action==='cancel'?{}:{body:nativeRunControlRequest({operation_id:o.key?.()??crypto.randomUUID(),expected_state_sha256:fresh.native!.control!.state_sha256})})},o.employee)!
   save(request) // recovery metadata must be saved before any mutating POST
    const response=await call<PgNativeAutonomousAgentResult|PgNativeWorkflowV2Result>(()=>action==='cancel'?(n.kind==='workflow_v2'?api.cancelWorkflowV2Run(current.id):api.cancelAutonomousAgentRun(current.id)):api.controlAutonomousAgentRun(current.id,action,request.body!))
   projectOriginalRunDetail(response,n.kind,current.id,o.employee)
    if(action!=='cancel'){if(response.execution_mode!=='agent_native_v2')throw Error('original_control_engine_unconfirmed');await nativeRunControlConfirmed(response,current.id,action,request.body!)}
   if(life!==epoch||!active||closed)return
   save(null);acknowledged=true;wipe();notice='原控制请求已收到确认；重新读取当前状态。'
  }catch{if(life===epoch){wipe();error=pending?'控制结果尚未确认。请核对原回执；不会重新发送暂停、恢复或取消。':'当前状态或权限不允许此控制。'}}finally{busy=false;publish()}
  if(acknowledged&&!pending&&active&&!closed)await refresh(selected)
 }
 async function confirmPending(){
  const p=pending;if(!p||closed||!active||busy)return
  const life=epoch;busy=true;wipe();error='';publish()
  try{
   if(p.action==='cancel'){
    const current=projectOriginalRunDetail(await get({id:p.id,kind:p.kind}),p.kind,p.id,o.employee)
    if(life!==epoch||!active||closed)return
    if(terminal.has(current.status)){save(null);notice='原运行已结束；取消没有独立原回执合同，不能据此判断是否由本次取消引起。'}else notice='原取消尚无可确认结果；保留原操作，不重发。'
   }else{
    const result=await call(()=>api.confirmAutonomousAgentRunControl(p.id,p.action as 'pause'|'resume',p.body!))
    projectOriginalRunDetail(result,p.kind,p.id,o.employee)
    const found=await nativeRunControlConfirmed(result,p.id,p.action,p.body!,true)
    if(life!==epoch||!active||closed)return
    if(found){save(null);notice='已核对原暂停/恢复回执，未重发控制。'}else notice='后台尚无原回执，原事务可能仍在完成；保留原操作，仅查询，不重发控制。'
   }
  }catch{if(life===epoch){wipe();error='原回执仍未核实。原操作已保留，不重发。'}}finally{busy=false;publish()}
  if(!pending&&active&&!closed)await refresh(selected)
 }
 return{
  snapshot:()=>({employee:o.employee,active:active&&!closed,run,recent,outputs,pending,busy,loading,error,notice,selected}),subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  async select(target:OriginalRunTarget|null){if(pending||busy){error='请先核对原未确认控制；未切换运行。';publish();return false}selected=target;await refresh(target);return !target||run?.id===target.id},refresh,loadMoreSteps,control,confirmPending,
  async resume(){if(closed)return;active=true;await refresh(selected)},suspend(){active=false;hide('员工或会话变化，私有正文已隐藏；原操作已保留。')},
  verifyIdentity:identity,navigationBlocked:()=>Boolean(pending||busy),dismiss(){error='';publish()},dispose(){closed=true;active=false;wipe();listeners.clear();++epoch;++read},
 }
}
