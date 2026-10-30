import {modelDraftProbeProtocol,type ModelDraftProbeInput} from '../../shared/model-draft-probe-contract.ts'
import {OriginalModelConnectionsError,originalModelId,normalizeOriginalModelInput,type OriginalModelConnection,type OriginalModelConnectionInput,type OriginalModelConnectionsApi} from './originalModelConnectionsApi.ts'
import type {ModelConnectionRow,ConnectionTestResult,ProviderKey} from '../pages/ModelConnections/useModelConnections'

type Action='create'|'update'|'delete'|'probe'
type Pending={format:'agentstudio.original-model-uncertainty.v1';employee_id:string;operation_id:string;action:Action;id:string|null;revision:number|null;created_at:number}
export type OriginalModelConnectionsView={
 isLoggedIn:boolean;needsRhLogin:boolean;errorMsg:string;noticeMsg:string;connectionList:ModelConnectionRow[];isLoadingList:boolean
 formOpen:boolean;formMode:'add'|'edit';editingId:string;formName:string;formProvider:ProviderKey;formBaseUrl:string;formApiKey:string;formManualModels:string
 isTestingForm:boolean;formTestResult:ConnectionTestResult|null;isSaving:boolean;busyId:string;expandedId:string;pendingDeleteId:string;canSubmitForm:boolean
 nativeMode:true;writeBlocked:boolean;probeEnabled:boolean;formProbeEnabled:boolean;saveActionLabel:string;nativePending:boolean;nativeUnavailable:boolean;probeNotice:string
}
type Ports={api:OriginalModelConnectionsApi;employeeId:string;currentEmployee():string|null;verifyEmployee():Promise<string>;storage:{read():string|null;write(value:string):void;remove():void};onChange(view:OriginalModelConnectionsView):void;now?:()=>number;requestId?:()=>string}
const defaults={openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',gemini:'https://generativelanguage.googleapis.com/v1beta'} as const
export const originalModelUncertaintyKey=(employee:string)=>'agent-studio:model-connections:native-pg:v1:'+originalModelId(employee)
export const emptyOriginalModelConnectionsView=():OriginalModelConnectionsView=>({isLoggedIn:false,needsRhLogin:false,errorMsg:'',noticeMsg:'',connectionList:[],isLoadingList:true,formOpen:false,formMode:'add',editingId:'',formName:'',formProvider:'openai',formBaseUrl:'',formApiKey:'',formManualModels:'',isTestingForm:false,formTestResult:null,isSaving:false,busyId:'',expandedId:'',pendingDeleteId:'',canSubmitForm:false,nativeMode:true,writeBlocked:true,probeEnabled:false,formProbeEnabled:false,saveActionLabel:'保存',nativePending:false,nativeUnavailable:false,probeNotice:'仅测试已保存且未改动的配置；测试会使用已保存密钥访问服务商，可能产生费用。不会执行模型生成，也不会自动发现或替换模型清单。'})
const partialListMessage='当前只能读取最多50条配置，此列表不代表全部连接。'
const unknownMessage='上次操作结果尚未确认。再次点击原保存按钮只读取当前配置，不会重发密钥或重复写入；读取后仍需由管理员核对原操作。'
function pendingValue(raw:unknown,employee:string,now:number):Pending{
 if(!raw||typeof raw!=='object'||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==7)return storageError()
 const keys=['format','employee_id','operation_id','action','id','revision','created_at'],v:Record<string,unknown>={}
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))return storageError();v[k]=d.value}
 if(v.format!=='agentstudio.original-model-uncertainty.v1'||originalModelId(v.employee_id)!==employee||typeof v.action!=='string'||!['create','update','delete','probe'].includes(v.action)||!Number.isSafeInteger(v.created_at)||Number(v.created_at)>now+60000||Number(v.created_at)<now-12*60*60*1000)return storageError()
 originalModelId(v.operation_id)
 if(v.action==='create'?(v.id!==null||v.revision!==null):(typeof v.id!=='string'||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||Number(v.revision)>=Number.MAX_SAFE_INTEGER))return storageError()
 if(v.id!==null)originalModelId(v.id)
 return Object.freeze({format:'agentstudio.original-model-uncertainty.v1',employee_id:employee,operation_id:originalModelId(v.operation_id),action:v.action as Action,id:v.id as string|null,revision:v.revision as number|null,created_at:Number(v.created_at)})
}
function storageError():never{throw Error('original_model_storage_unavailable')}
function display(row:OriginalModelConnection):ModelConnectionRow{return{...row,last_checked_at:row.last_checked_at??'',models:[...row.models]}}
function publicInput(row:OriginalModelConnection):OriginalModelConnectionInput{return{name:row.name,provider:row.provider,base_url:row.base_url,models:[...row.models],enabled:row.enabled}}
/** Original page state only. Native handlers remain the identity/ACL authority. */
export function createOriginalModelConnectionsController(ports:Ports){
 const employee=originalModelId(ports.employeeId),now=ports.now??Date.now,newId=ports.requestId??(()=>crypto.randomUUID())
 let state=emptyOriginalModelConnectionsView(),records=new Map<string,OriginalModelConnection>(),editingBaseline:OriginalModelConnection|null=null,deleteBaseline:OriginalModelConnection|null=null,cap={strictContract:false,writes:false,probe:false,draftProbe:false},pending:Pending|null=null,loaded=false,storageBroken=false,blocked=false,disposed=false,busy=false,epoch=0,readSequence=0,formSequence=0,abort:AbortController|null=null
 let listComplete:boolean|null=null
 const copy=():OriginalModelConnectionsView=>{
  const formValid=!!state.formName.trim()&&(state.formProvider!=='openai'||!!state.formBaseUrl.trim())&&(state.formMode==='edit'||!!state.formApiKey.trim())
  return{...state,noticeMsg:listComplete===false&&!state.noticeMsg.includes(partialListMessage)?[state.noticeMsg,partialListMessage].filter(Boolean).join(' '):state.noticeMsg,connectionList:state.connectionList.map(v=>({...v,models:[...v.models]})),formTestResult:state.formTestResult?{...state.formTestResult,models:[...state.formTestResult.models]}:null,writeBlocked:blocked||storageBroken||busy||!cap.writes||!!pending,probeEnabled:!blocked&&!storageBroken&&!busy&&!pending&&cap.probe,formProbeEnabled:!blocked&&!storageBroken&&!busy&&!pending&&(cap.draftProbe||cap.probe),probeNotice:cap.draftProbe?'点击测试只查询官方服务商模型列表，可能产生费用；草稿不会保存，也不会生成内容。发现结果只在本表单有效；模型 ID 留空时，明确保存会采用本次完整发现结果。':state.probeNotice,canSubmitForm:!blocked&&!storageBroken&&!busy&&(pending?state.formOpen:cap.writes&&formValid),saveActionLabel:pending?'核对原操作结果':'保存',nativePending:!!pending}
 }
 function publish(patch:Partial<OriginalModelConnectionsView>={}){if(disposed)return;state={...state,...patch};ports.onChange(copy())}
 function clearSensitive(){formSequence++;listComplete=null;records.clear();editingBaseline=null;deleteBaseline=null;state={...emptyOriginalModelConnectionsView(),isLoadingList:false,needsRhLogin:true};cap={strictContract:false,writes:false,probe:false,draftProbe:false}}
 function loseScope(){if(blocked||disposed)return;blocked=true;epoch++;readSequence++;abort?.abort();clearSensitive();publish({errorMsg:'员工账号已变化，原账号的连接、表单和密钥已隐藏。请重新打开当前页面。'})}
 async function verify(stamp:number){let actual:string;try{actual=originalModelId(await ports.verifyEmployee())}catch(error){throw new OriginalModelConnectionsError(error instanceof OriginalModelConnectionsError&&error.status===401?401:503,'original_model_identity_unavailable')}if(disposed||stamp!==epoch)throw Error('original_model_scope_obsolete');if(actual!==employee||ports.currentEmployee()!==employee){loseScope();throw Error('original_model_scope_changed')}}
 async function invoke<T>(stamp:number,work:()=>Promise<T>,potentialEffect=false):Promise<T>{
  await verify(stamp);let value:T
  try{value=await work()}catch(error){
   if(error instanceof OriginalModelConnectionsError&&error.status===409&&['employee_session_changed','original_model_employee_changed'].includes(error.code)){loseScope();throw error}
   try{await verify(stamp)}catch(scopeError){if(!disposed&&stamp===epoch)failure(scopeError);if(potentialEffect&&(!(error instanceof OriginalModelConnectionsError)||error.outcomeUnknown))throw new OriginalModelConnectionsError(error instanceof OriginalModelConnectionsError?error.status:0,error instanceof OriginalModelConnectionsError?error.code:'original_model_outcome_unknown',true)}
   throw error
  }
  try{await verify(stamp)}catch(error){if(potentialEffect)throw new OriginalModelConnectionsError(error instanceof OriginalModelConnectionsError?error.status:503,error instanceof OriginalModelConnectionsError?error.code:'original_model_identity_unavailable',true);throw error}
  return value
 }
 function load(){if(loaded)return;try{const raw=ports.storage.read();if(raw!==null){if(typeof raw!=='string'||raw.length>2048)return storageError();pending=pendingValue(JSON.parse(raw),employee,now())}loaded=true}catch{storageBroken=true;throw Error('original_model_storage_unavailable')}}
 function persist(value:Pending){try{const valid=pendingValue(value,employee,now()),bytes=JSON.stringify(valid);if(bytes.length>2048)return storageError();ports.storage.write(bytes);pending=valid}catch{storageBroken=true;throw Error('original_model_storage_unavailable')}}
 function clearPending(){try{ports.storage.remove();pending=null}catch{storageBroken=true;throw Error('original_model_storage_unavailable')}}
 function errorMessage(error:unknown){
  if(error instanceof Error&&error.message==='original_model_storage_unavailable')return '浏览器无法可靠保留上次操作状态，配置写入已停止。密钥未存入浏览器存储，请保留其他表单内容后检查。'
  if(error instanceof OriginalModelConnectionsError){
   if(error.code==='model_connection_snapshot_changed'||error.code==='model_connection_cursor_expired')return '读取期间连接列表已变化或读取凭证过期，本次部分结果未采用；请重新刷新完整列表。'
   if(error.code==='model_connection_list_budget_exceeded')return '完整列表读取超过时限，本次部分结果未采用；请稍后重新刷新。'
   if(error.code==='model_connection_list_too_large')return '完整列表超过本次可处理范围，本次部分结果未采用；请联系管理员核对读取范围。'
   if(error.status===401)return '员工登录已失效，请重新登录后核对服务器配置。'
   if(error.status===403)return '当前员工没有所需的模型配置权限，配置未被当作保存成功。'
   if(error.status===409)return '服务器配置版本已变化。当前表单保持不变，请从列表重新打开最新配置后再明确保存。'
   if(error.code==='model_draft_probe_disabled')return '当前环境未开放草稿测试或模型发现；没有发送草稿密钥。'
   if(error.code==='draft_stored_credential_scope_changed')return '服务商或地址已改动，不能复用原连接密钥；请明确输入对应密钥后测试。'
   if(error.code==='provider_endpoint_not_allowlisted')return '当前测试只允许对应服务商的官方地址；没有发送密钥，也没有保存草稿。'
   if(error.code==='provider_probe_disabled')return '当前环境未开放服务商连接测试，未读取密钥或访问服务商。'
   if(error.code==='original_model_connections_read_only')return '当前环境尚未开放模型配置写入，只能查看；未发送密钥或修改配置。'
   if(error.outcomeUnknown)return unknownMessage
   if(error.status===400)return '配置未发送，请核对名称、HTTPS 地址、密钥和模型 ID；原始输入未被截断。'
  }
  return pending?unknownMessage:'暂时无法核验模型配置，请稍后重新读取；没有自动重试配置或服务商请求。'
 }
 function failure(error:unknown){if(disposed||blocked)return;if(error instanceof OriginalModelConnectionsError&&(error.status===401||error.code==='original_model_identity_unavailable')){readSequence++;clearSensitive();publish({errorMsg:errorMessage(error),needsRhLogin:error.status===401,nativeUnavailable:error.status!==401});return}publish({errorMsg:errorMessage(error)})}
 function install(rows:OriginalModelConnection[],complete:boolean){listComplete=complete;records=new Map(rows.map(v=>[v.id,v]));publish({connectionList:rows.map(display)})}
 async function refresh(){
  if(disposed||blocked||busy)return;const stamp=epoch,sequence=++readSequence;publish({isLoadingList:true,errorMsg:''})
  try{await verify(stamp);let recoveryError='';try{load()}catch(error){recoveryError=errorMessage(error)}const values=await invoke(stamp,()=>Promise.all([ports.api.capabilities(),ports.api.listSnapshot()]));if(disposed||stamp!==epoch||sequence!==readSequence)return;cap=values[0];install(values[1].items,values[1].complete);publish({isLoggedIn:true,needsRhLogin:false,nativeUnavailable:false,errorMsg:recoveryError,noticeMsg:pending?unknownMessage+(!values[1].complete?' '+partialListMessage:''):!values[1].complete?partialListMessage:!cap.writes?'已读取本人配置；当前环境只允许查看。保存和测试均不会自动发起。':''})}
  catch(error){if(stamp===epoch&&sequence===readSequence)failure(error)}finally{if(!disposed&&stamp===epoch&&sequence===readSequence)publish({isLoadingList:false})}
 }
 async function queryPending(){
  if(!pending||busy)return;const stamp=epoch,sequence=++readSequence;publish({isLoadingList:true,errorMsg:''})
  try{await verify(stamp);const rows=await invoke(stamp,()=>ports.api.listSnapshot());if(stamp!==epoch||sequence!==readSequence)return;install(rows.items,rows.complete);publish({noticeMsg:'已重新读取服务器当前配置。读取结果不能证明上次原请求是否完成，未清除不确定状态，也未重复写入。'+(!rows.complete?' '+partialListMessage:'')})}catch(error){if(stamp===epoch)failure(error)}finally{if(!disposed&&stamp===epoch&&sequence===readSequence)publish({isLoadingList:false})}
 }
 async function edit(row:ModelConnectionRow){
  if(disposed||blocked||busy)return;const stamp=epoch,sequence=++formSequence
  try{await verify(stamp);if(!records.has(row.id))throw new OriginalModelConnectionsError(404,'model_connection_not_found');const actual=await invoke(stamp,()=>ports.api.get(row.id));if(sequence!==formSequence)return;editingBaseline=actual;records.set(actual.id,actual)
   publish({formOpen:true,formMode:'edit',editingId:actual.id,formName:actual.name,formProvider:actual.provider,formBaseUrl:actual.base_url,formApiKey:'',formManualModels:actual.models.join(', '),formTestResult:null,pendingDeleteId:'',errorMsg:'',noticeMsg:pending?unknownMessage:''})
  }catch(error){if(stamp===epoch)failure(error)}
 }
 async function add(){
  if(disposed||blocked||busy)return;const stamp=epoch,sequence=++formSequence
  try{await verify(stamp);if(sequence!==formSequence)return;if(!cap.writes&&!pending)throw new OriginalModelConnectionsError(405,'original_model_connections_read_only');editingBaseline=null;publish({formOpen:true,formMode:'add',editingId:'',formName:'',formProvider:'openai',formBaseUrl:'',formApiKey:'',formManualModels:'',formTestResult:null,errorMsg:'',noticeMsg:pending?unknownMessage:''})}catch(error){if(stamp===epoch)failure(error)}
 }
 function closeForm(){formSequence++;editingBaseline=null;publish({formOpen:false,editingId:'',formApiKey:'',formTestResult:null})}
 function set(field:'formName'|'formBaseUrl'|'formApiKey'|'formManualModels',value:string){if(disposed||blocked||typeof value!=='string')return;if(field==='formApiKey'&&pending){publish({formApiKey:'',errorMsg:unknownMessage});return}formSequence++;publish({[field]:value,formTestResult:null})}
 function formInput(requireKey:boolean,prior?:OriginalModelConnection){
  const base=state.formBaseUrl.trim()||(state.formProvider==='openai'?'':defaults[state.formProvider]),rawModels=state.formManualModels.split(/[,，\n;；]+/).map(v=>v.trim()).filter(Boolean)
  if(rawModels.length>300)throw new OriginalModelConnectionsError(400,'invalid_original_model_input')
  const names=[...new Set(rawModels.length?rawModels:state.formTestResult?.discovery&&state.formTestResult.ok?state.formTestResult.models:[])]
  return normalizeOriginalModelInput({name:state.formName,provider:state.formProvider,base_url:base,models:names,enabled:prior?.enabled??true,...(state.formApiKey.trim()?{api_key:state.formApiKey}:{})},requireKey)
 }
 async function mutation(action:Action,selected:OriginalModelConnection|null,input?:OriginalModelConnectionInput,asForm=false){
  if(disposed||blocked||busy)return
  if(pending){await queryPending();return}
  const stamp=epoch,formAtStart=formSequence;busy=true;readSequence++;abort=new AbortController();publish({errorMsg:'',noticeMsg:'',...(asForm&&action!=='probe'?{isSaving:true}:{}),...(asForm&&action==='probe'?{isTestingForm:true}:{}),busyId:selected?.id??''})
  try{
   await verify(stamp);load();if(pending){await queryPending();return}
   if(storageBroken)throw Error('original_model_storage_unavailable')
   cap=await invoke(stamp,()=>ports.api.capabilities(abort!.signal));if(!cap.writes||action==='probe'&&!cap.probe)throw new OriginalModelConnectionsError(405,action==='probe'?'provider_probe_disabled':'original_model_connections_read_only')
   persist({format:'agentstudio.original-model-uncertainty.v1',employee_id:employee,operation_id:newId(),action,id:selected?.id??null,revision:selected?.revision??null,created_at:now()})
   // Only the password input is cleared; no secret is ever written to storage.
   if(asForm)publish({formApiKey:''})
   let result:OriginalModelConnection|null=null
   if(action==='create')result=await invoke(stamp,()=>ports.api.create(input!,abort!.signal),true)
   else if(action==='update')result=await invoke(stamp,()=>ports.api.update(selected!,input!,abort!.signal),true)
   else if(action==='delete')await invoke(stamp,()=>ports.api.delete(selected!,abort!.signal),true)
   else result=await invoke(stamp,()=>ports.api.probe(selected!,abort!.signal),true)
   clearPending();if(result)records.set(result.id,result);else records.delete(selected!.id)
   if(asForm&&result&&state.editingId===result.id&&editingBaseline?.revision===selected?.revision)editingBaseline=result
   deleteBaseline=null
   publish({connectionList:[...records.values()].map(display),pendingDeleteId:'',noticeMsg:action==='probe'?'已核对已保存连接的实际服务商响应；模型清单保持配置值。':action==='delete'?'连接已删除。':'配置已保存；保存本身未测试连接或调用模型，连接状态以服务器为准。'})
   if(asForm&&formAtStart===formSequence){
    if(action==='probe'&&result)publish({formTestResult:{ok:result.status==='ok',latency_ms:result.last_latency_ms,models:[...result.models],error:result.last_error}})
    else closeForm()
   }
  }catch(error){
   if(!disposed&&stamp===epoch){if(error instanceof OriginalModelConnectionsError&&!error.outcomeUnknown&&pending)try{clearPending()}catch{storageBroken=true};failure(error)}
  }finally{if(!disposed&&stamp===epoch){busy=false;abort=null;publish({isSaving:false,isTestingForm:false,busyId:''})}}
 }
 async function save(){
  if(!state.formOpen)return;if(pending){await queryPending();return}
  try{const prior=state.formMode==='edit'?editingBaseline:undefined;if(state.formMode==='edit'&&(!prior||prior.id!==state.editingId))throw new OriginalModelConnectionsError(404,'model_connection_not_found');const input=formInput(!prior,prior??undefined);await mutation(prior?'update':'create',prior??null,input,true)}catch(error){failure(error)}
 }
 async function testDraftForm(){
  if(disposed||blocked||busy||pending)return
  const stamp=epoch,sequence=formSequence,provider=state.formProvider,base=state.formBaseUrl.trim()||(provider==='openai'?'':defaults[provider]),key=state.formApiKey.trim(),prior=state.formMode==='edit'?editingBaseline:null
  if(!key&&!prior){publish({errorMsg:'请先填写 API Key 再测试。'});return}
  const input:ModelDraftProbeInput={protocol:modelDraftProbeProtocol,request_id:newId(),provider,base_url:base,credential:key?{kind:'draft',api_key:key}:{kind:'saved',connection_id:prior!.id,expected_revision:prior!.revision}}
  busy=true;readSequence++;abort=new AbortController();publish({isTestingForm:true,formTestResult:null,errorMsg:'',noticeMsg:''})
  try{const result=await invoke(stamp,()=>ports.api.draftProbe(input,abort!.signal));if(disposed||stamp!==epoch||sequence!==formSequence)return
   const errors:Record<string,string>={provider_credential_rejected:'服务商拒绝了密钥，请核对后再明确测试。',provider_rate_limited:'服务商限制了请求频率，请稍后再明确测试。',provider_models_incomplete:'模型列表超过本次允许范围，未采用部分清单。',provider_response_too_large:'模型列表响应过大，未采用部分清单。',provider_response_invalid:'服务商未返回可验证的模型列表，未采用结果。',provider_probe_timeout:'模型列表查询超时，服务商可能已收到请求；未自动重试。'}
   publish({formTestResult:{ok:result.ok,latency_ms:result.latency_ms,models:[...result.models],error:result.ok?'':errors[result.error_code]??'模型列表查询失败，未采用结果，也未保存配置。',discovery:true},noticeMsg:result.ok?'已读取服务商的完整模型列表。草稿和已保存连接均未修改；结果不证明模型生成能力。':'模型列表查询未完成，未采用部分清单，也未保存配置。'})
  }catch(error){if(!disposed&&stamp===epoch&&sequence===formSequence){if(error instanceof OriginalModelConnectionsError&&error.outcomeUnknown)publish({errorMsg:'未能确认本次模型列表查询结果。服务商可能已收到请求；没有保存配置，也没有自动重试。'});else failure(error)}}finally{if(input.credential.kind==='draft')input.credential.api_key='';if(!disposed&&stamp===epoch){busy=false;abort=null;publish({isTestingForm:false})}}
 }
 async function testForm(){
  if(pending){await queryPending();return}
  if(cap.draftProbe){await testDraftForm();return}
  try{const prior=state.formMode==='edit'?editingBaseline:undefined
   if(!prior||state.formApiKey.trim()||JSON.stringify(formInput(false,prior))!==JSON.stringify(publicInput(prior))){publish({errorMsg:'当前环境只测试已保存且未改动的配置。请先明确保存，再重新打开连接测试；尚未支持保存前测试。'});return}
   await mutation('probe',prior,undefined,true)
  }catch(error){failure(error)}
 }
 return{
  getView:copy,start:refresh,loadList:refresh,
  async checkScope(){if(disposed||blocked)return;const stamp=epoch;try{await verify(stamp);if(!busy)await refresh()}catch(error){if(!disposed&&stamp===epoch)failure(error)}},
  openAddForm:add,startEdit:edit,closeForm,handleSave:save,handleTestForm:testForm,
  setFormName:(value:string)=>set('formName',value),setFormBaseUrl:(value:string)=>set('formBaseUrl',value),setFormApiKey:(value:string)=>set('formApiKey',value),setFormManualModels:(value:string)=>set('formManualModels',value),
  setFormProvider(value:ProviderKey){if(!['openai','anthropic','gemini'].includes(value)||disposed||blocked)return;formSequence++;publish({formProvider:value,formTestResult:null})},
  async handleRetest(row:ModelConnectionRow){const actual=records.get(row.id);if(actual){if((row as ModelConnectionRow&{revision?:number}).revision!==actual.revision){failure(new OriginalModelConnectionsError(409,'revision_conflict'));return}await mutation('probe',actual)}},
  async handleToggleEnabled(row:ModelConnectionRow,enabled:boolean){const actual=records.get(row.id);if(actual&&typeof enabled==='boolean'){if((row as ModelConnectionRow&{revision?:number}).revision!==actual.revision){failure(new OriginalModelConnectionsError(409,'revision_conflict'));return}await mutation('update',actual,{...publicInput(actual),enabled})}},
  requestDelete(id:string){if(disposed||blocked||busy)return;const actual=records.get(id);if(actual){deleteBaseline=actual;publish({pendingDeleteId:id,errorMsg:'',noticeMsg:pending?unknownMessage:''})}},
  cancelDelete(){deleteBaseline=null;publish({pendingDeleteId:''})},
  async confirmDelete(){const actual=deleteBaseline;if(actual&&actual.id===state.pendingDeleteId)await mutation('delete',actual)},
  toggleExpand(id:string){if(records.has(id))publish({expandedId:state.expandedId===id?'':id})},dismissError:()=>publish({errorMsg:''}),dismissNotice:()=>publish({noticeMsg:''}),
  dispose(){if(disposed)return;disposed=true;epoch++;readSequence++;formSequence++;abort?.abort();abort=null;records.clear();editingBaseline=null;deleteBaseline=null;state={...emptyOriginalModelConnectionsView(),isLoadingList:false}},
 }
}
