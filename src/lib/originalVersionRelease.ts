import {OriginalVersionReleaseError,parseOriginalReleaseIntent,releaseId,type OriginalReleaseIntent} from '../../shared/original-version-release-contract.ts'
import {prepareReleaseIntent,releaseHistoryNotice,type PgNativeAgentReleaseChoice as Choice,type PgNativeAgentReleaseWorkspace as Workspace,type PgNativeAgentReleaseDetail as Detail,type PgNativeAgentReleaseResult as Result} from './originalVersionReleaseData.ts'
import {originalReleaseWriteFailure,type OriginalVersionReleaseApi} from './originalVersionReleaseApi.ts'
import {parseAgentDesignTransportJson} from '../../services/pg-api/src/agent-design-value-contract.ts'
import type {OriginalHomeAgent} from './originalHomeAgentApi.ts'
import type {OriginalModelConnection} from './originalModelConnectionsApi.ts'
import type {SpecVersionRow,ConfirmAction,CustomModelOption,AgentSpec,SavedSpecRow} from '../pages/VersionRelease/useVersionRelease.ts'
import type {RunStateKey} from './runPresentation.ts'
type Acceptance=Awaited<ReturnType<OriginalVersionReleaseApi['acceptance']>>
type ModelBinding={connection_id:string;connection_revision:number;model_id:string}
type Review={row:Detail;workspace:Workspace;kind:ConfirmAction['kind']}
export type OriginalVersionTestRun={id:string;status:RunStateKey;current_step:number;max_steps:number;error:string}
export type OriginalVersionReleaseView={
 nativeMode:true;nativeWorkspaceReady:boolean;nativeEmployeeId:string;nativeBlocked:boolean;nativePending:boolean;nativeNotice:string;nativeAcceptanceConfirmed:boolean;nativeAcceptanceEnabled:boolean;nativeConfirmChecked:boolean;nativeRestoreReason:string;nativeUntested:boolean;nativeReadOnly:boolean
 isLoggedIn:boolean;needsRhLogin:boolean;errorMsg:string;noticeMsg:string;specList:SavedSpecRow[];isLoadingSpecs:boolean;selectedSpecId:string;selectedSpec:SavedSpecRow|null
 versionList:SpecVersionRow[];isLoadingVersions:boolean;expandedVersionId:string;publishedVersion:SpecVersionRow|null;publishRecords:SpecVersionRow[];nextVersionNo:number
 testInstruction:string;testModel:string;customModels:CustomModelOption[];isStartingTest:boolean;testRun:OriginalVersionTestRun|null;isTestLive:boolean;testPassed:boolean;testFailed:boolean;isCustomTestModel:boolean;isTestCurrentVersion:boolean;testMaxSteps:number
 versionNote:string;isSavingVersion:boolean;confirmAction:ConfirmAction|null;isConfirmBusy:boolean;publishPickId:string
}
type Ports={employeeId:string;api:OriginalVersionReleaseApi;currentEmployee():string|null;verifyEmployee():Promise<string>;
 catalog(page:number,signal?:AbortSignal):Promise<{items:OriginalHomeAgent[];totalItems:number;totalPages:number;page:number;perPage:number}>;getAgent(id:string,signal?:AbortSignal):Promise<OriginalHomeAgent>;models(signal?:AbortSignal):Promise<{items:OriginalModelConnection[];complete:boolean}>;
 storage:{read():string|null;write(value:string):void;remove():void};onChange(view:OriginalVersionReleaseView):void;now?:()=>number;requestId?:()=>string;prepareIntent?:typeof prepareReleaseIntent}
const live=['queued','running','paused','awaiting_approval','awaiting_input'],bases={openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',gemini:'https://generativelanguage.googleapis.com/v1beta'}
const partialPublication='下方显示已加载版本的最近发布状态，不代表完整发布事件历史；每次变更仍由服务端审计。'
export function emptyOriginalVersionReleaseView():OriginalVersionReleaseView{return{nativeMode:true,nativeWorkspaceReady:false,nativeEmployeeId:'',nativeBlocked:true,nativePending:false,nativeNotice:'',nativeAcceptanceConfirmed:false,nativeAcceptanceEnabled:false,nativeConfirmChecked:false,nativeRestoreReason:'',nativeUntested:false,nativeReadOnly:true,isLoggedIn:false,needsRhLogin:false,errorMsg:'',noticeMsg:'',specList:[],isLoadingSpecs:false,selectedSpecId:'',selectedSpec:null,versionList:[],isLoadingVersions:false,expandedVersionId:'',publishedVersion:null,publishRecords:[],nextVersionNo:1,testInstruction:'',testModel:'',customModels:[],isStartingTest:false,testRun:null,isTestLive:false,testPassed:false,testFailed:false,isCustomTestModel:false,isTestCurrentVersion:false,testMaxSteps:8,versionNote:'',isSavingVersion:false,confirmAction:null,isConfirmBusy:false,publishPickId:''}}
function specRow(row:OriginalHomeAgent,employee:string):SavedSpecRow{if(row.owner_user_id!==employee)throw new OriginalVersionReleaseError(503,'invalid_original_release_owner');return{id:row.id,rh_user_id:employee,name:row.name,spec:row.spec as unknown as AgentSpec,source:row.authoring?.source??'unknown',template_key:row.authoring?.template_key??'',created:row.created_at,updated:row.updated_at}}
function versionRow(v:Workspace['versions'][number],employee:string,detail?:Detail):SpecVersionRow{return{id:v.id,rh_user_id:employee,spec_id:detail?.spec_id??'',version_no:v.version_no,spec_snapshot:detail?detail.spec_snapshot as unknown as AgentSpec:null,config_snapshot:{name:v.name,source:'unknown',template_key:''},note:v.note,test_run_id:v.test_run_id??'',test_passed:v.test_passed,status:v.status,published_at:v.published_at??'',created:v.created_at,updated:v.created_at,nativeSnapshot:detail?structuredClone(detail.spec_snapshot):null,nativeDetailState:detail?'ready':'idle',nativeTestCurrent:v.test_current,nativeRevision:v.revision,nativeTestModelBinding:detail?.test_model_binding?structuredClone(detail.test_model_binding):null}}
function message(error:unknown){if(error instanceof OriginalVersionReleaseError){if(error.status===401)return'员工登录已失效，请重新登录。';if(error.code==='agent_release_receipt_not_found')return'服务器尚未找到原请求回执；结果仍待核对，不会重新提交。';if(error.status===409)return'配置、版本、验收或资源权限已变化，请刷新并重新核对。';if(error.status===403||error.status===405)return'当前环境未开放此操作。';if(error.status===404)return'助手、版本或验收记录不存在，或不属于当前员工。';if(error.status===400)return'请检查输入和确认选项。'}return'读取或操作尚未确认，请刷新核对；未自动重复提交。'}
/** All effects go through the actual release API. Ports in pure tests are
 * terminal DATA/callbacks, never a SQL pool, worker, listener or browser. */
export function createOriginalVersionReleaseController(ports:Ports){
 const employee=releaseId(ports.employeeId),now=ports.now??Date.now,newId=ports.requestId??(()=>crypto.randomUUID()),prepare=ports.prepareIntent??prepareReleaseIntent
 let state={...emptyOriginalVersionReleaseView(),nativeEmployeeId:employee},workspace:Workspace|null=null,details=new Map<string,Detail>(),models=new Map<string,ModelBinding>(),acceptance:Acceptance|null=null,review:Review|null=null,pending:OriginalReleaseIntent|null=null
 let cap={available:false,writes:false,acceptance:false},blocked=false,suspended=false,recovering=false,disposed=false,busy=false,epoch=0,selection=0,read=0,testRead=0,modelRead=0,abort=new AbortController(),storageBroken=false,modelComplete=true
 const detailTickets=new Map<string,number>()
 const currentTest=()=>!!workspace&&!!acceptance&&acceptance.test_current&&acceptance.status==='succeeded'&&acceptance.source_sha256===workspace.source_sha256&&acceptance.spec_revision===workspace.spec_revision
 function copy():OriginalVersionReleaseView{if(!observe(false)||recovering)return{...emptyOriginalVersionReleaseView(),nativeEmployeeId:employee,nativePending:!!pending,needsRhLogin:blocked?state.needsRhLogin:false,errorMsg:blocked?state.errorMsg:'员工身份暂时无法核验，私有内容已隐藏；同员工重新验证后可恢复内存草稿。',nativeNotice:'当前禁止操作，原请求标记保留；刷新只核验身份和读取状态，不重复提交。'};const test=state.testRun;return structuredClone({...state,nativeWorkspaceReady:!!workspace,nativeBlocked:blocked||storageBroken||busy||!!pending||!workspace||!cap.writes,nativePending:!!pending,nativeReadOnly:!cap.writes,nativeAcceptanceEnabled:cap.acceptance,nativeUntested:!!review&&!review.row.test_current,nativeNotice:[workspace?releaseHistoryNotice:'',workspace?partialPublication:'',!modelComplete?'模型列表为部分列表，未显示的连接不能据此判断不存在。':'',!cap.writes?'当前可读取版本和核对原请求，尚未开放配置修改。':'',pending?'上次操作结果尚未确认。请核对原请求结果；不会重新提交。':''].filter(Boolean).join(' '),selectedSpec:state.specList.find(r=>r.id===state.selectedSpecId)??null,publishedVersion:workspace?.active_version_id?state.versionList.find(v=>v.id===workspace!.active_version_id&&v.status==='published')??null:null,publishRecords:state.versionList.filter(v=>v.published_at!==''),nextVersionNo:workspace?.next_version_no??1,isTestLive:!!test&&live.includes(test.status),testPassed:currentTest(),isTestCurrentVersion:currentTest(),testFailed:!!test&&['failed','cancelled'].includes(test.status),isCustomTestModel:models.has(state.testModel)})}
 function publish(patch:Partial<OriginalVersionReleaseView>={}){if(disposed)return;state={...state,...patch};ports.onChange(copy())}
 function erase(){workspace=null;details.clear();models.clear();acceptance=null;review=null;state={...emptyOriginalVersionReleaseView(),nativeEmployeeId:employee,needsRhLogin:true};cap={available:false,writes:false,acceptance:false}}
 function suspend(notify=true){if(disposed||blocked||suspended)return;suspended=true;recovering=false;epoch++;selection++;read++;testRead++;abort.abort();busy=false;state={...state,isLoadingSpecs:false,isLoadingVersions:false,isStartingTest:false,isSavingVersion:false,isConfirmBusy:false,nativeAcceptanceConfirmed:false,nativeConfirmChecked:false};if(notify)publish()}
 function lose(notify=true,reason='changed'){if(blocked||disposed)return;blocked=true;suspended=false;recovering=false;epoch++;selection++;read++;testRead++;abort.abort();busy=false;erase();state.errorMsg=reason==='signed_out'?'员工会话已确认退出，原私有草稿已清除；原请求标记仍由原员工核对。':'员工账号已变化，原账号的版本、快照、表单和验收已隐藏。请重新打开页面。';if(notify)publish()}
 function observe(notify=true){if(disposed||blocked)return false;const actual=ports.currentEmployee();if(actual===null){suspend(notify);return false}if(actual!==employee){lose(notify);return false}return !suspended}
 function guard(recovery=false){return observe(true)&&(!recovering||recovery)}
 async function verify(stamp:number,recovery=false,beforeInvalidation?:()=>void){
   if(!disposed&&!blocked&&stamp===epoch&&ports.currentEmployee()!==employee)beforeInvalidation?.()
   if(!guard(recovery)||stamp!==epoch)throw Error('obsolete_release_scope')
   let actual:string;try{actual=await ports.verifyEmployee()}catch(error){if(disposed||stamp!==epoch)throw Error('obsolete_release_scope');beforeInvalidation?.();if(error instanceof OriginalVersionReleaseError&&error.status===401)lose(true,'signed_out');else suspend();throw error}
   if(disposed||blocked||stamp!==epoch)throw Error('obsolete_release_scope');if(actual!==employee){beforeInvalidation?.();lose();throw Error('release_employee_changed')}if(ports.currentEmployee()!==employee)beforeInvalidation?.();if(!guard(recovery))throw Error('release_identity_unknown')
  }
 type WriteAttempt={intent:OriginalReleaseIntent;phase:'not_dispatched'|'dispatched'|'acknowledged'}
  async function invoke<T>(stamp:number,fn:()=>Promise<T>,recovery=false,attempt?:WriteAttempt):Promise<T>{
   await verify(stamp,recovery,()=>{if(attempt?.phase==='not_dispatched')retirePending(attempt.intent,stamp)})
   if(attempt&&!ownsPending(attempt.intent,stamp))throw Error('obsolete_release_scope')
   try{if(attempt)attempt.phase='dispatched';const v=await fn();if(attempt)attempt.phase='acknowledged';await verify(stamp,recovery);return v}
   catch(error){if(attempt?.phase==='dispatched'&&originalReleaseWriteFailure(error,attempt.intent)!==null)retirePending(attempt.intent,stamp);if(!disposed&&stamp===epoch&&error instanceof OriginalVersionReleaseError&&error.code==='employee_session_changed')lose();if(!blocked&&!disposed&&stamp===epoch)await verify(stamp,recovery);throw error}
  }
 async function checkScope(){
  if(disposed||blocked||recovering)return;observe(true);if(blocked||disposed)return
  const observed=epoch;let actual:string
  try{actual=await ports.verifyEmployee()}catch(error){if(disposed||blocked||observed!==epoch)return;if(error instanceof OriginalVersionReleaseError&&error.status===401)lose(true,'signed_out');else suspend();return}
  if(disposed||blocked||observed!==epoch)return
  if(actual!==employee||ports.currentEmployee()!==null&&ports.currentEmployee()!==employee){lose();return}
  if(ports.currentEmployee()!==employee){suspend();return}
  if(!suspended)return
  const originalReview=review,run=state.testRun?.id;epoch++;selection++;read++;testRead++;const stamp=epoch;abort=new AbortController();suspended=false;recovering=true;busy=true;cap={available:false,writes:false,acceptance:false};workspace=null;details.clear();state={...state,versionList:[],isLoadingSpecs:false,isLoadingVersions:false,isStartingTest:false,isSavingVersion:false,isConfirmBusy:false,nativeAcceptanceConfirmed:false,nativeConfirmChecked:false};publish()
  try{
   cap=await invoke(stamp,()=>ports.api.capabilities(abort.signal),true);if(!cap.available)throw new OriginalVersionReleaseError(503,'agent_release_not_installed');await loadModels(stamp,true);if(stamp!==epoch||disposed||blocked||suspended)return;await refresh(stamp,true)
   if(originalReview&&workspace){const target=await invoke(stamp,()=>ports.api.detail(originalReview.workspace.spec_id,originalReview.row.id,abort.signal),true),current=workspace as Workspace;if(!sameSource(originalReview.workspace,current)||target.revision!==originalReview.row.revision||target.version_sha256!==originalReview.row.version_sha256||originalReview.kind==='publish'&&current.release_revision!==originalReview.workspace.release_revision)throw new OriginalVersionReleaseError(409,'agent_release_source_changed');review={...originalReview,row:target};details.set(target.id,target);state={...state,confirmAction:{kind:originalReview.kind,row:{...versionRow(target,employee,target),spec_id:target.spec_id}}}}
   if(run)await loadTest(run,stamp,true)
   if(stamp!==epoch||disposed||blocked||suspended)return;state={...state,isLoggedIn:true,needsRhLogin:false,errorMsg:'',noticeMsg:'已重新验证同一员工并读取当前配置；原内存草稿已恢复，操作需重新确认。'}
  }catch(error){if(stamp===epoch&&!disposed&&!blocked&&!suspended){workspace=null;details.clear();review=null;state={...state,isLoggedIn:true,needsRhLogin:false,specList:[],versionList:[],testRun:null,confirmAction:null,errorMsg:'同一员工已验证，原内存输入保留；当前配置或权限尚未核实，请刷新后再操作。'}}}
  finally{if(stamp===epoch&&!disposed&&!blocked&&!suspended){recovering=false;busy=false;publish()}}
 }
 function failure(error:unknown){if(disposed||blocked||suspended||recovering)return;if(error instanceof OriginalVersionReleaseError&&error.status===401){suspend();return}publish({errorMsg:message(error)})}
 function persist(value:OriginalReleaseIntent){try{const valid=parseOriginalReleaseIntent(value,employee,now()),bytes=JSON.stringify(valid);if(bytes.length>3000)throw Error();ports.storage.write(bytes);pending=valid;return valid}catch{storageBroken=true;throw new OriginalVersionReleaseError(503,'original_release_storage_unavailable')}}
 function ownsPending(intent:OriginalReleaseIntent,stamp:number){
   if(disposed||blocked||suspended||recovering||stamp!==epoch||pending!==intent||intent.employee_id!==employee)return false
   const actual=ports.currentEmployee();if(actual!==null&&actual!==employee)return false
   try{const raw=ports.storage.read();return raw!==null&&raw.length<=3000&&JSON.stringify(parseOriginalReleaseIntent(parseAgentDesignTransportJson(raw),employee,now()))===JSON.stringify(intent)}catch{return false}
  }
  function retirePending(intent:OriginalReleaseIntent,stamp:number){if(!ownsPending(intent,stamp))return false;try{ports.storage.remove();pending=null;return true}catch{storageBroken=true;return false}}

 async function loadModels(stamp=epoch,recovery=false,initial=false){
  if(stamp!==epoch||!guard(recovery))return
  const ticket=++modelRead,chosen=selection
  try{
   const all=await invoke(stamp,()=>ports.models(abort.signal),recovery)
   if(ticket!==modelRead||chosen!==selection||!guard(recovery))return
   const next=new Map<string,ModelBinding>(),options:CustomModelOption[]=[]
   for(const conn of all.items){if(conn.owner_user_id!==employee)throw new OriginalVersionReleaseError(503,'invalid_original_release_owner');if(!conn.enabled||conn.status!=='ok'||conn.base_url!==bases[conn.provider])continue;for(const id of conn.models){const binding={connection_id:conn.id,connection_revision:conn.revision,model_id:id},value=JSON.stringify(binding);next.set(value,binding);options.push({value,label:id,hint:'自定义 · '+conn.name})}}
   const changed=JSON.stringify([...models.keys()].sort())!==JSON.stringify([...next.keys()].sort()),selected=state.testModel
   modelComplete=all.complete;models=next
   const testModel=initial?options[0]?.value??'':!all.complete||next.has(selected)?selected:''
   publish({customModels:options,testModel,...(changed||testModel!==selected?{nativeAcceptanceConfirmed:false}:{})})
  }catch(error){
   if(disposed||blocked||stamp!==epoch||chosen!==selection||ticket!==modelRead)return
   models.clear();modelComplete=false;publish({customModels:[],nativeAcceptanceConfirmed:false,errorMsg:'模型清单暂不可用，验收测试需等待有效模型；版本元数据仍可管理。'})
   if(error instanceof OriginalVersionReleaseError&&error.code==='invalid_original_release_owner')throw error
  }
 }
 function sameSource(a:Workspace,b:Workspace){return a.spec_id===b.spec_id&&a.spec_revision===b.spec_revision&&a.source_sha256===b.source_sha256}
 function mergeVersions(value:Workspace,extra:Detail|null){details.forEach((detail,id)=>{const row=value.versions.find(v=>v.id===id);if(!row||row.revision!==detail.revision||row.version_sha256!==detail.version_sha256)details.delete(id)});if(extra)details.set(extra.id,extra);const rows=[...value.versions];if(extra&&!rows.some(v=>v.id===extra.id))rows.push(extra);return rows.sort((a,b)=>b.version_no-a.version_no).map(v=>({...versionRow(v,employee,details.get(v.id)),spec_id:value.spec_id}))}
 async function refresh(stamp=epoch,recovery=false){if(stamp!==epoch||!guard(recovery)||!state.selectedSpecId)return;const spec=state.selectedSpecId,ticket=++read,chosen=selection;publish({isLoadingVersions:true});try{
  const value=await invoke(stamp,()=>ports.api.workspace(spec,abort.signal),recovery);let active:Detail|null=null
  if(value.active_version_id&&!value.versions.some(v=>v.id===value.active_version_id)){active=await invoke(stamp,()=>ports.api.detail(spec,value.active_version_id!,abort.signal),recovery);if(active.status!=='published')throw new OriginalVersionReleaseError(409,'agent_release_head_changed');const check=await invoke(stamp,()=>ports.api.workspace(spec,abort.signal),recovery);if(!sameSource(value,check)||value.release_revision!==check.release_revision||value.active_version_id!==check.active_version_id)throw new OriginalVersionReleaseError(409,'agent_release_head_changed')}
  const current=await invoke(stamp,()=>ports.getAgent(spec,abort.signal),recovery);if(current.revision!==value.spec_revision||current.name!==value.name)throw new OriginalVersionReleaseError(409,'agent_release_source_changed')
  if(chosen!==selection||ticket!==read||!guard(recovery))return;const changed=Boolean(workspace&&(!sameSource(workspace,value)||workspace.release_revision!==value.release_revision));if(changed)review=null;workspace=value;publish({specList:state.specList.some(r=>r.id===spec)?state.specList.map(r=>r.id===spec?specRow(current,employee):r):[...state.specList,specRow(current,employee)],versionList:mergeVersions(value,active),isLoadingVersions:false,...(changed?{nativeAcceptanceConfirmed:false,nativeConfirmChecked:false,confirmAction:null}:{})});
 }catch(error){if(chosen===selection&&ticket===read){workspace=null;details.clear();publish({versionList:[],isLoadingVersions:false});throw error}}}
 async function detail(id:string){if(!guard()||!workspace||busy)return;const spec=workspace.spec_id,chosen=selection,stamp=epoch,ticket=(detailTickets.get(id)??0)+1;detailTickets.set(id,ticket);publish({versionList:state.versionList.map(v=>v.id===id?{...v,nativeDetailState:'loading' as const}:v)});try{
  const value=await invoke(stamp,()=>ports.api.detail(spec,id,abort.signal));if(chosen!==selection||detailTickets.get(id)!==ticket||!workspace||!guard())return;const row=state.versionList.find(v=>v.id===id);if(!row||row.nativeRevision!==value.revision)throw new OriginalVersionReleaseError(409,'agent_release_version_changed');details.set(id,value);publish({versionList:state.versionList.map(v=>v.id===id?{...versionRow(value,employee,value),spec_id:spec}:v)})
 }catch(error){if(chosen===selection&&detailTickets.get(id)===ticket){details.delete(id);publish({versionList:state.versionList.map(v=>v.id===id?{...v,spec_snapshot:null,nativeSnapshot:null,nativeDetailState:'error' as const}:v)});failure(error)}}}
 async function loadTest(run:string,stamp=epoch,recovery=false){if(stamp!==epoch||!guard(recovery)||!workspace)return;const spec=workspace.spec_id,chosen=selection,ticket=++testRead;try{const value=await invoke(stamp,()=>ports.api.acceptance(spec,run,abort.signal),recovery);if(chosen!==selection||ticket!==testRead||!guard(recovery))return;acceptance=value;publish({testRun:{id:value.run_id,status:value.status as RunStateKey,current_step:0,max_steps:value.max_steps,error:''}})}catch(error){if(chosen===selection&&ticket===testRead){acceptance=null;publish({testRun:null});failure(error)}}}
 async function finish(intent:OriginalReleaseIntent,result:Result,stamp:number){if(!retirePending(intent,stamp))throw new OriginalVersionReleaseError(503,'original_release_storage_unavailable');review=null;details.clear();workspace=null;publish({confirmAction:null,nativeConfirmChecked:false,nativeRestoreReason:'',nativeAcceptanceConfirmed:false,versionList:[],noticeMsg:'操作已由服务器确认。正在重新读取当前状态。'});await refresh();if(intent.action==='acceptance'&&result.run_id)await loadTest(result.run_id);if(intent.action==='snapshot')publish({versionNote:''})}
 async function query(){if(!guard()||busy||!pending)return;busy=true;const stamp=epoch,intent=pending;publish({errorMsg:'',isConfirmBusy:true});try{const result=await invoke(stamp,()=>ports.api.query(intent,abort.signal));if(!guard())return;await finish(intent,result,stamp)}catch(error){if(stamp===epoch)failure(error)}finally{if(!disposed&&stamp===epoch){busy=false;publish({isConfirmBusy:false})}}}
 async function perform(choice:Choice,before:Workspace){if(!guard()||busy||pending||storageBroken||!cap.writes||choice.action==='acceptance'&&!cap.acceptance)return;busy=true;const stamp=epoch;publish({errorMsg:'',noticeMsg:'',isConfirmBusy:['publish','restore','delete_draft'].includes(choice.action),isStartingTest:choice.action==='acceptance',isSavingVersion:choice.action==='snapshot'});let acknowledged=false
  try{
   const fresh=await invoke(stamp,()=>ports.api.workspace(before.spec_id,abort.signal));if(!sameSource(before,fresh)||choice.action==='publish'&&fresh.release_revision!==before.release_revision)throw new OriginalVersionReleaseError(409,'agent_release_source_changed')
   const intent=await prepare(employee,before.spec_id,choice,now());await verify(stamp);const ownIntent=persist(intent);publish()
   const result=await invoke(stamp,()=>ports.api.change(before.spec_id,choice,abort.signal),false,{intent:ownIntent,phase:'not_dispatched'});acknowledged=true;await finish(ownIntent,result,stamp)
  }catch(error){if(stamp===epoch)failure(error);if(stamp===epoch&&acknowledged)publish({noticeMsg:'操作已确认，当前状态刷新未完成，请刷新版本。'})}
   finally{if(!disposed&&stamp===epoch){busy=false;if(pending)review=null;publish({isStartingTest:false,isSavingVersion:false,isConfirmBusy:false,...(pending?{confirmAction:null,nativeConfirmChecked:false}:{})})}}
 }
 async function choose(id:string){if(!guard()||busy||pending)return;selection++;read++;testRead++;detailTickets.clear();workspace=null;details.clear();acceptance=null;review=null;publish({selectedSpecId:id,versionList:[],expandedVersionId:'',testRun:null,testInstruction:'',versionNote:'',confirmAction:null,nativeConfirmChecked:false,nativeRestoreReason:'',nativeAcceptanceConfirmed:false,publishPickId:'',errorMsg:'',noticeMsg:''});if(id)try{await refresh()}catch(error){failure(error)}}
 async function reviewAction(kind:Review['kind'],row:SpecVersionRow){if(!guard()||busy||pending||!workspace||!cap.writes)return;const stamp=epoch,chosen=selection,before=workspace;publish({isConfirmBusy:true,errorMsg:''});busy=true;try{
  const value=await invoke(stamp,()=>ports.api.detail(before.spec_id,row.id,abort.signal));if(chosen!==selection||!guard())return;if(value.revision!==row.nativeRevision||kind==='delete'&&value.status!=='draft')throw new OriginalVersionReleaseError(409,'agent_release_version_changed')
  details.set(value.id,value);review={kind,row:value,workspace:structuredClone(before)};publish({confirmAction:{kind,row:{...versionRow(value,employee,value),spec_id:before.spec_id}},nativeConfirmChecked:false,nativeRestoreReason:''})
 }catch(error){failure(error)}finally{if(!disposed&&stamp===epoch){busy=false;publish({isConfirmBusy:false})}}}
 function set(field:'testInstruction'|'testModel'|'versionNote'|'nativeRestoreReason',value:string){if(!guard()||busy||pending)return;publish({[field]:value,...(field==='testInstruction'||field==='testModel'?{nativeAcceptanceConfirmed:false}:{}),...(field==='nativeRestoreReason'?{nativeConfirmChecked:false}:{})})}
 return{
  getView:()=>copy(),
  async start(wanted='',wantedRun=''){if(!guard())return;const stamp=epoch;publish({isLoadingSpecs:true,errorMsg:''});try{
   try{const raw=ports.storage.read();if(raw!==null){if(raw.length>3000)throw Error();pending=parseOriginalReleaseIntent(JSON.parse(raw),employee,now())}}catch{storageBroken=true;throw new OriginalVersionReleaseError(503,'original_release_storage_unavailable')}
   cap=await invoke(stamp,()=>ports.api.capabilities(abort.signal));publish({isLoggedIn:true,selectedSpecId:pending?.spec_id||wanted});if(!cap.available)throw new OriginalVersionReleaseError(503,'agent_release_not_installed')
   const rows:OriginalHomeAgent[]=[],seen=new Set<string>();let total:number|null=null,pages:number|null=null
   const catalogDeadline=now()+30000
   for(let page=1;page<=200;page++){if(now()>catalogDeadline)throw new OriginalVersionReleaseError(408,'original_release_catalog_budget_exceeded');const value=await invoke(stamp,()=>ports.catalog(page,abort.signal));if(!Number.isSafeInteger(value.totalItems)||value.totalItems<0||value.totalItems>10000||!Number.isSafeInteger(value.totalPages)||value.totalPages<0||value.totalPages>200||value.page!==page||value.perPage!==50||value.items.length>50||total!==null&&total!==value.totalItems||pages!==null&&pages!==value.totalPages)throw new OriginalVersionReleaseError(409,'original_release_catalog_changed');total=value.totalItems;pages=value.totalPages;for(const row of value.items){if(seen.has(row.id)||row.owner_user_id!==employee)throw new OriginalVersionReleaseError(409,'original_release_catalog_changed');seen.add(row.id);rows.push(row)}if(page>=Math.max(1,pages))break}
   if(rows.length!==total)throw new OriginalVersionReleaseError(409,'original_release_catalog_changed');const preferred=pending?.spec_id||wanted
   if(preferred&&!seen.has(preferred)){const extra=await invoke(stamp,()=>ports.getAgent(releaseId(preferred),abort.signal));rows.push(extra)}
   await loadModels(stamp,false,true);if(stamp!==epoch||!guard())return
   publish({isLoggedIn:true,isLoadingSpecs:false,specList:rows.map(r=>specRow(r,employee)),selectedSpecId:preferred||''});if(preferred){await refresh();if(wantedRun)await loadTest(releaseId(wantedRun))}
  }catch(error){if(stamp===epoch){publish({isLoadingSpecs:false});failure(error)}}},
  checkScope,
  handleSelectSpec:choose,
  handleRefreshNative:async()=>{if(disposed||blocked)return;if(suspended||ports.currentEmployee()===null){await checkScope();return}if(!guard()||busy)return;const stamp=epoch;try{cap=await invoke(stamp,()=>ports.api.capabilities(abort.signal));await loadModels(stamp);if(stamp!==epoch||!guard())return;await refresh(stamp);if(state.testRun)await loadTest(state.testRun.id,stamp)}catch(error){if(stamp===epoch)failure(error)}},
  handleQueryNative:query,
  recoverTest:async(id:string)=>{if(!guard()||busy||pending||!workspace)return;if(state.testRun?.id===id)return;try{await loadTest(releaseId(id))}catch(error){failure(error)}},
  requireVersionDetails:async(ids:string[])=>{for(const id of [...new Set(ids)]){if(!guard()||!workspace)return;if(!details.has(id))await detail(id)}},
  toggleVersionExpand:(id:string)=>{if(!guard())return;publish({expandedVersionId:state.expandedVersionId===id?'':id});if(state.expandedVersionId===id)void detail(id)},
  pollTest:async()=>{if(!busy&&state.testRun&&live.includes(state.testRun.status))await loadTest(state.testRun.id)},
  setTestInstruction:(v:string)=>set('testInstruction',v),setTestModel:(v:string)=>set('testModel',v),setVersionNote:(v:string)=>set('versionNote',v),setNativeRestoreReason:(v:string)=>set('nativeRestoreReason',v),
  setNativeAcceptanceConfirmed:(v:boolean)=>{if(guard()&&!busy&&!pending)publish({nativeAcceptanceConfirmed:v})},setNativeConfirmChecked:(v:boolean)=>{if(guard()&&!busy&&!pending)publish({nativeConfirmChecked:v})},
  handleRunTest:async()=>{if(!workspace||!state.nativeAcceptanceConfirmed||!state.testInstruction.trim()||state.testInstruction.trim().length>2000||state.testRun&&live.includes(state.testRun.status))return;const binding=models.get(state.testModel);if(!binding){publish({errorMsg:'请选择已测试且当前有效的本人模型连接。'});return}const before=workspace;await perform({action:'acceptance',request_id:newId(),expected_spec_revision:before.spec_revision,source_sha256:before.source_sha256,instruction:state.testInstruction.trim(),max_steps:8,model_binding:binding,confirm:true},before)},
  handleSaveVersion:async()=>{if(!workspace||state.versionNote.trim().length>500)return;const before=workspace;await perform({action:'snapshot',request_id:newId(),expected_spec_revision:before.spec_revision,source_sha256:before.source_sha256,note:state.versionNote.trim(),test_run_id:currentTest()?acceptance!.run_id:null},before)},
  requestPublish:(row:SpecVersionRow)=>reviewAction('publish',row),requestRestore:(row:SpecVersionRow)=>reviewAction('restore',row),requestDelete:(row:SpecVersionRow)=>reviewAction('delete',row),
  handlePublishPick:async(id:string)=>{const row=state.versionList.find(v=>v.id===id);if(row)await reviewAction('publish',row)},
  cancelConfirm:()=>{if(guard()&&!busy&&!pending){review=null;publish({confirmAction:null,nativeConfirmChecked:false,nativeRestoreReason:''})}},
  handleConfirm:async()=>{if(!review||!state.nativeConfirmChecked||!workspace)return;const r=review,v=r.row,chosen={version_id:v.id,version_sha256:v.version_sha256,expected_version_revision:v.revision},source={expected_spec_revision:r.workspace.spec_revision,source_sha256:r.workspace.source_sha256},request_id=newId();if(r.kind==='restore'){if(state.nativeRestoreReason.trim().length<8||state.nativeRestoreReason.trim().length>500)return;await perform({action:'restore',request_id,...source,...chosen,confirm:true,reason:state.nativeRestoreReason.trim()},r.workspace)}else if(r.kind==='publish')await perform({action:'publish',request_id,...source,...chosen,expected_release_revision:r.workspace.release_revision,confirm:true,acknowledge_untested:!v.test_current},r.workspace);else await perform({action:'delete_draft',request_id,...chosen,confirm:true},r.workspace)},
  dismissError:()=>{if(guard())publish({errorMsg:''})},dismissNotice:()=>{if(guard())publish({noticeMsg:''})},
  dispose(){if(disposed)return;disposed=true;epoch++;selection++;abort.abort();details.clear();models.clear();workspace=null;review=null;acceptance=null;pending=null;state=emptyOriginalVersionReleaseView()},
 }
}
export type OriginalVersionReleaseController=ReturnType<typeof createOriginalVersionReleaseController>
