import {agentDesignJsonValue,agentDesignObject as object,agentDesignArray,parseAgentDesignModelOutput} from '../../services/pg-api/src/agent-design-value-contract.ts'
import {agentDesignSubmitBody,agentDesignOriginalSubmission,designId,designBinding,designChoice,parseAgentDesignPreview,parseAgentDesignReceipt,parseAgentDesignView,PgNativeAgentDesignError,type PgNativeAgentDesignApi,type AgentDesignPreview} from './pgNativeAgentDesign.ts'
export {normalizeOriginalHomeDesignMetadata,type OriginalHomeDesignMetadata} from '../../shared/original-home-design-metadata.ts'

const ttl=12*60*60*1000,limit=64000
type Submission=ReturnType<typeof agentDesignSubmitBody>
type Stored={format:'agentstudio.original-home-design.v1';employee_id:string;created_at:number;body:Submission;editor_key:string;applied:boolean;terminal:'none'|'stale'|'unavailable'|'erased'}
type ModelBinding=ReturnType<typeof designBinding>
type Capabilities={agent_design_available?:boolean;agent_design_submissions_enabled?:boolean;config_writes_enabled?:boolean}
export type OriginalHomeDesignPreview={purpose:'generate'|'revise';instruction:string;model_name:string;model_id:string;connection_revision:number;output_token_limit:4096;byte_length:number;recorded:false}
export type OriginalHomeDesignView={busy:boolean;pending:boolean;pendingPurpose:'generate'|'revise'|null;preview:OriginalHomeDesignPreview|null;error:string;loginRequired:boolean;blocked:boolean}
type StoragePort={read():string|null;write(value:string):void}
type Ports={api:PgNativeAgentDesignApi;employeeId:string;currentEmployee():string|null;verifyEmployee():Promise<string>;capabilities():Promise<Capabilities>;models():Promise<unknown>;
 storage:StoragePort;editorKey():string;onChange(view:OriginalHomeDesignView):void;onScopeChanged():void;
 onResult(value:{purpose:'generate'|'revise';instruction:string;request_id:string;editor_key:string;result:ReturnType<typeof parseAgentDesignModelOutput>}):boolean;now?:()=>number;requestId?:()=>string}
const empty=():OriginalHomeDesignView=>({busy:false,pending:false,pendingPurpose:null,preview:null,error:'',loginRequired:false,blocked:false})
const message={unknown:'原模型请求结果尚未确认。请使用原按钮查询同一回执；不会再次发起付费请求。',pending:'模型请求已保存，Worker 尚未返回可用结果。请使用原按钮查询原请求。',changed:'员工账号已变化，已清除原账号的生成预览与结果。请重新打开当前页面。',storage:'当前浏览器无法可靠保留原模型请求回执，未发起新的付费请求。请保留草稿并检查浏览器存储。'}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value}
export function originalHomeDesignEditorKey(raw:unknown):string{
 try{
  const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,stable(x)])):v
  const value=JSON.stringify(stable(agentDesignJsonValue(raw)))
  return value.length<=48000?value:''
 }catch{return ''}
}
export function originalHomeDesignStorageKey(employee:string){return 'agent-studio:home-design:native-pg:v1:'+designId(employee)}
function stored(raw:unknown,employee:string,now:number):Stored{
 const value=object(agentDesignJsonValue(raw),['format','employee_id','created_at','body','editor_key','applied','terminal'])
 if(value.format!=='agentstudio.original-home-design.v1'||designId(value.employee_id)!==employee||!Number.isSafeInteger(value.created_at)||Number(value.created_at)>now+60000||Number(value.created_at)<now-ttl||typeof value.editor_key!=='string'||!value.editor_key||value.editor_key.length>48000||typeof value.applied!=='boolean'||typeof value.terminal!=='string'||!['none','stale','unavailable','erased'].includes(value.terminal))throw Error('invalid_original_home_design_recovery')
 return freeze({format:value.format,employee_id:employee,created_at:Number(value.created_at),body:agentDesignOriginalSubmission(value.body) as Submission,editor_key:value.editor_key,applied:value.applied,terminal:value.terminal as Stored['terminal']})
}
/** Metadata choice only. Native repeats actual model ownership/revision checks. */
export function chooseOriginalHomeDesignModel(raw:unknown,employee:string,preferred?:unknown):{binding:ModelBinding;name:string}{
 designId(employee)
 const choices:{binding:ModelBinding;name:string}[]=[],connectionIds=new Set<string>()
 for(const item of agentDesignArray(raw,50)){
  const row=object(item,['id','owner_user_id','name','provider','base_url','api_key_tail','enabled','status','last_latency_ms','last_checked_at','models','last_error','revision','created_at','updated_at']),id=designId(row.id)
  if(designId(row.owner_user_id)!==employee||connectionIds.has(id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||typeof row.enabled!=='boolean'||typeof row.provider!=='string'||!['openai','anthropic','gemini'].includes(row.provider)||typeof row.status!=='string'||!['untested','ok','error'].includes(row.status))throw Error('invalid_original_home_design_models')
  connectionIds.add(id)
  const names=new Set<string>()
  for(const model of agentDesignArray(row.models,100)){
   const binding=designBinding({connection_id:id,connection_revision:row.revision,model_id:model})
   if(names.has(binding.model_id))throw Error('invalid_original_home_design_models')
   names.add(binding.model_id);if(row.enabled&&row.status==='ok')choices.push({binding,name:row.name})
  }
 }
 if(preferred!==undefined&&preferred!==null){const desired=designBinding(preferred),chosen=choices.find(v=>JSON.stringify(v.binding)===JSON.stringify(desired));if(!chosen)throw Error('original_home_design_binding_changed');return chosen}
 if(choices.length!==1)throw Error(choices.length?'original_home_design_model_ambiguous':'original_home_design_model_required')
 return choices[0]!
}
/** Existing original Home buttons only. No automatic paid submit/retry, provider
 * construction, arbitrary unsaved revision source or executable tool grants. */
export function createOriginalHomeDesignController(ports:Ports){
 const employee=designId(ports.employeeId),now=ports.now??Date.now,newId=ports.requestId??(()=>crypto.randomUUID())
 let view=empty(),record:Stored|null=null,preview:AgentDesignPreview|null=null,previewKey='',generation=0,disposed=false,loaded=false,unusable=false,abort:AbortController|null=null
 const pending=()=>!!record&&!record.applied&&record.terminal==='none'
 function publish(patch:Partial<OriginalHomeDesignView>={}){if(disposed)return;view={...view,...patch,pending:pending(),pendingPurpose:pending()?record!.body.purpose:null};ports.onChange(freeze({...view}))}
 function scopeChanged(){generation++;abort?.abort();preview=null;record=null;unusable=true;publish({...empty(),blocked:true,error:message.changed});ports.onScopeChanged()}
 async function verify(stamp:number){
  const actual=designId(await ports.verifyEmployee())
  if(disposed||stamp!==generation)throw Error('original_home_design_scope_obsolete')
  if(actual!==employee||ports.currentEmployee()!==employee){scopeChanged();throw Error('original_home_design_employee_changed')}
 }
 async function invoke<T>(stamp:number,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  await verify(stamp)
  try{const value=await work(abort!.signal);await verify(stamp);return value}
  catch(error){if(error instanceof PgNativeAgentDesignError&&error.code==='agent_design_employee_changed'){if(!disposed&&stamp===generation)scopeChanged();throw error}await verify(stamp);throw error}
 }
 function persist(value:Stored){
  const safe=stored(value,employee,now()),bytes=JSON.stringify(safe)
  if(bytes.length>limit)throw Error('original_home_design_storage_failed')
  try{ports.storage.write(bytes)}catch{throw Error('original_home_design_storage_failed')}
  record=safe
 }
 async function load(stamp:number){
  if(loaded)return
  await verify(stamp)
  try{const bytes=ports.storage.read();if(bytes!==null){if(typeof bytes!=='string'||bytes.length>limit)throw Error();record=stored(JSON.parse(bytes),employee,now())}loaded=true}
  catch{unusable=true;publish({blocked:true,error:message.storage});throw Error('original_home_design_storage_failed')}
 }
 async function capabilities(stamp:number){const cap=await invoke(stamp,()=>ports.capabilities());if(cap.agent_design_available!==true||cap.config_writes_enabled!==true||cap.agent_design_submissions_enabled!==true)throw Error('original_home_design_unavailable')}
 function receiptMatches(value:ReturnType<typeof parseAgentDesignReceipt>,body:Submission){if(value.request_id!==body.request_id||value.purpose!==body.purpose||value.input_sha256!==body.expected_input_sha256||JSON.stringify(value.model_binding)!==JSON.stringify(body.model_binding)||JSON.stringify(value.source)!==JSON.stringify(body.source)||value.output_token_limit!==body.output_token_limit)throw Error('original_home_design_receipt_mismatch')}
 async function query(stamp:number){
  if(!record||!pending())return
  const original=record,receipt=parseAgentDesignReceipt(await invoke(stamp,signal=>ports.api.submit(original.body,signal,true)));receiptMatches(receipt,original.body)
  const result=parseAgentDesignView(await invoke(stamp,signal=>ports.api.view(original.body.request_id,signal)));receiptMatches(result.receipt,original.body)
  if(result.result_status!=='available'||!result.result){
   if(result.result_status==='stale'||result.result_status==='unavailable'||result.result_status==='erased'){persist({...original,terminal:result.result_status});preview=null}
   publish({preview:null,error:result.result_status==='pending'?message.pending:result.result_status==='unknown'?'Worker 的实际结果为未知或暂停；不会自动重试付费请求。':result.result_status==='stale'?'来源、模型或权限已变化，原结果不能覆盖当前草稿。新的请求须重新预览并确认费用。':'原请求没有可用结果，当前草稿保持不变。新的请求须重新预览并确认费用。'});return
  }
  if(original.editor_key!==ports.editorKey()){publish({error:'原结果已返回，但编辑内容或打开的记录已变化，未覆盖新草稿。请保留新改动后回到原草稿或记录再查询。'});return}
  const applied=ports.onResult({purpose:original.body.purpose,instruction:original.body.instruction,request_id:original.body.request_id,editor_key:original.editor_key,result:parseAgentDesignModelOutput(result.result.result)})
  if(!applied){publish({error:'原模型结果未覆盖现有内容。请保留当前改动并核对草稿与浏览器存储后，再查询原结果。'});return}
  persist({...original,applied:true});preview=null;publish({preview:null,error:''})
 }
 async function work(task:(stamp:number)=>Promise<void>){
  if(disposed||view.busy||unusable)return
  const stamp=generation;abort=new AbortController();publish({busy:true,error:'',loginRequired:false})
  try{await load(stamp);if(unusable)return;await task(stamp)}
  catch(error){if(disposed||stamp!==generation)return
   const code=error instanceof Error?error.message:''
   if(code==='original_home_design_storage_failed'){unusable=true;publish({blocked:true,error:message.storage})}
   else if(error instanceof PgNativeAgentDesignError&&error.status===401){preview=null;publish({preview:null,loginRequired:true,error:'员工登录已失效，请重新登录后查询原模型请求。'})}
   else if(error instanceof PgNativeAgentDesignError&&error.status===403){preview=null;publish({preview:null,error:'模型请求权限或功能开放状态已变化，已隐藏原预览；原始回执仍保留，权限恢复后请核对同一请求。'})}
   else publish({error:code==='original_home_design_model_ambiguous'?'存在多个可用模型；原首页尚无明确选择合同，未发起付费请求。':code==='original_home_design_model_required'?'没有已配置且已核验的可用模型，请先在模型连接中完成配置。':code==='original_home_design_binding_changed'?'原模型绑定已变化，请重新核对模型与来源。':code==='original_home_design_source_changed'?'服务器来源版本与当前编辑记录不同，未发起付费请求。请保留草稿并重新打开来源。':code==='original_home_design_unavailable'?'当前 PG 需求设计尚未开放，原始要求和草稿仍保留。':pending()?message.unknown:'本次模型预览未完成。请核对登录、本人模型、来源和要求长度（最多2000字符），当前草稿保持不变。'})
  }finally{if(!disposed&&stamp===generation){abort=null;publish({busy:false})}}
 }
 async function prepare(stamp:number,purpose:'generate'|'revise',instruction:string,sourceId?:string,sourceRevision?:number,preferred?:unknown){
  if(pending()){await query(stamp);return}
  await capabilities(stamp)
  let source:AgentDesignPreview['choice']['source']=null
  if(purpose==='revise'){
   const actual=await invoke(stamp,signal=>ports.api.source(designId(sourceId),signal))
   if(actual.source.spec_id!==designId(sourceId)||actual.source.revision!==sourceRevision)throw Error('original_home_design_source_changed')
   source=actual.source
  }
  const chosen=chooseOriginalHomeDesignModel(await invoke(stamp,()=>ports.models()),employee,preferred),choice=designChoice({action:'preview',purpose,instruction,model_binding:chosen.binding,output_token_limit:4096,source}),key=ports.editorKey()
  if(!key)throw Error('original_home_design_storage_failed')
  const actual=parseAgentDesignPreview(await invoke(stamp,signal=>ports.api.preview(choice,signal)))
  if(JSON.stringify(actual.choice)!==JSON.stringify(choice))throw Error('original_home_design_source_changed')
  if(key!==ports.editorKey())throw Error('original_home_design_source_changed')
  preview=actual;previewKey=key
  publish({preview:{purpose,instruction:actual.choice.instruction,model_name:chosen.name,model_id:chosen.binding.model_id,connection_revision:chosen.binding.connection_revision,output_token_limit:4096,byte_length:actual.byte_length,recorded:false},error:''})
 }
 return{
  getView:()=>freeze({...view}),
  start:()=>work(async()=>{if(pending())publish({error:message.unknown})}),
  async checkScope(){
   if(disposed||unusable)return
   const stamp=generation
   try{await verify(stamp)}catch{if(!disposed&&stamp===generation){preview=null;publish({preview:null,error:'暂时无法核验员工身份，已隐藏模型预览；原请求回执仍保留，请稍后核对。'})}}
  },
  prepareGenerate:(instruction:string)=>work(stamp=>prepare(stamp,'generate',instruction)),
  prepareRevision:(input:{instruction:string;spec_id:string;revision:number;model_binding?:unknown})=>work(stamp=>prepare(stamp,'revise',input.instruction,input.spec_id,input.revision,input.model_binding)),
  submit:(purpose:'generate'|'revise',instruction:string)=>work(async stamp=>{
   if(pending()){await query(stamp);return}
   if(!preview||preview.choice.purpose!==purpose||preview.choice.instruction!==instruction.trim()||previewKey!==ports.editorKey())throw Error('original_home_design_source_changed')
   await capabilities(stamp)
   const body=agentDesignSubmitBody(preview,newId()),original:Stored={format:'agentstudio.original-home-design.v1',employee_id:employee,created_at:now(),body,editor_key:previewKey,applied:false,terminal:'none'}
   // A durable exact original intent precedes every explicit paid submission.
   persist(original);publish({preview:null})
   const receipt=parseAgentDesignReceipt(await invoke(stamp,signal=>ports.api.submit(body,signal)));receiptMatches(receipt,body)
   await query(stamp)
  }),
  queryOriginal:()=>work(query),
  dispose(){if(disposed)return;disposed=true;generation++;abort?.abort();abort=null;preview=null;record=null;view=empty()},
 }
}
export type OriginalHomeDesignController=ReturnType<typeof createOriginalHomeDesignController>
