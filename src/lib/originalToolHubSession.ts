import type {ToolHubView} from './toolHubView.ts'
import {parseOriginalToolHubActivityQuery,type OriginalToolHubActivityQuery,type OriginalToolHubActivityPage} from '../../shared/original-toolhub-activity.ts'
import type {createOriginalToolHubActivityApi} from './originalToolHubActivityApi.ts'
import {freezeToolHubIntent,type ToolHubIntent,type ToolTrialReceipt} from './pgNativeToolHub.ts'
import {TOOL_TRIAL_EFFECT_ACK,TOOL_TRIAL_FEE_ACK,type TrialTarget} from '../../services/pg-api/src/tool-trial-contract.ts'
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT} from '../../services/pg-api/src/knowledge-retrieval-binding.ts'
import type {createPgNativePilotApi,PgNativeWorkflowV2Result} from './pgNativePilotApi.ts'
import {parseKnowledgeRetrievalBinding} from '../../services/pg-api/src/knowledge-retrieval-binding.ts'
import type {createOriginalHomeAgentApi} from './originalHomeAgentApi.ts'
import type {createOriginalToolConnectionsApi} from './originalToolConnectionsApi.ts'
import type {createOriginalModelConnectionsApi} from './originalModelConnectionsApi.ts'
import type {ActiveDebugTarget,DebugResult,InvocationRow,ExternalToolRow,HubStats,MonitorData} from '../pages/ToolHub/useToolHub.ts'
type Api=ReturnType<typeof createPgNativePilotApi>
type Ports={activity:Pick<ReturnType<typeof createOriginalToolHubActivityApi>,'list'>;api:Pick<Api,'getConfigCapabilities'|'toolHub'|'getWorkflowV2Run'|'decideWorkflowV2Node'|'cancelWorkflowV2Run'>;home:Pick<ReturnType<typeof createOriginalHomeAgentApi>,'list'|'get'>;tools:Pick<ReturnType<typeof createOriginalToolConnectionsApi>,'listSnapshot'>;models:Pick<ReturnType<typeof createOriginalModelConnectionsApi>,'listSnapshot'>}
export type OriginalToolHubFields={expression:string;text:string;focus:string;keyword:string;specId:string;url:string;query:string;limit:string;externalInput:string;confirmExternalWrite:boolean}
export const emptyOriginalToolHubFields=():OriginalToolHubFields=>({expression:'',text:'',focus:'',keyword:'',specId:'',url:'',query:'',limit:'5',externalInput:'',confirmExternalWrite:false})
type Prepared=Awaited<ReturnType<Ports['api']['toolHub']['preview']>>
type Pending={prepared:Prepared;receipt:ToolTrialReceipt|null;decision:{step:string;hash:string}|null;cancelUnknown:boolean;terminal:boolean}
type ModelChoice={connection_id:string;connection_revision:number;model_id:string;name:string}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/
const terminal=new Set(['succeeded','failed','cancelled']),statuses=new Set(['queued','running','awaiting_approval','awaiting_input','paused',...terminal])
const blank=()=>({externalTools:[] as ExternalToolRow[],specOptions:[] as {id:string;name:string}[],invocationList:[] as InvocationRow[],hubStats:null as HubStats|null,monitorData:null as MonitorData|null,debugResult:null as DebugResult|null})
const stable=(v:unknown):string=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable((v as Record<string,unknown>)[k]))])):v)??'null'
const errorStatus=(e:unknown)=>e&&typeof e==='object'&&typeof(e as {status?:unknown}).status==='number'?(e as {status:number}).status:0
/** Page controller only. Ports are the existing Native clients, not executors. */
export function createOriginalToolHubSession(options:{employeeId:string;initialView?:ToolHubView;initialRunId?:string;verifyEmployee:()=>Promise<string>;ports:(current:()=>boolean)=>Ports;confirm:(value:{purpose:'fee'|'effect'|'step';description:string})=>Promise<boolean>|boolean;chooseModel:(choices:readonly ModelChoice[])=>Promise<ModelChoice|null>|ModelChoice|null;key?:()=>string}){
 if(!uuid.test(options.employeeId))throw Error('invalid_original_toolhub_employee')
 const emptyQuery=(run_id=''):OriginalToolHubActivityQuery=>parseOriginalToolHubActivityQuery({tool:'',q:'',status:'',source:'',run_id,page:1})
 let view:ToolHubView=options.initialView??'devices',activityQuery=emptyQuery(options.initialRunId??''),activityPage:OriginalToolHubActivityPage|null=null,invocationError=''
 if(!['devices','debug','activity','monitor'].includes(view))throw Error('invalid_original_toolhub_view')
 const employee=options.employeeId,listeners=new Set<()=>void>();let closed=false,visible=false,epoch=0,read=0,busy=false,loading=false,pending:Pending|null=null,flight:Promise<void>|null=null,error='',notice='',target:ActiveDebugTarget=null,fields=emptyOriginalToolHubFields(),data=blank(),draft=0
 function publish(){if(!closed)for(const fn of listeners)fn()}
 function hide(message:string){visible=false;epoch++;read++;data=blank();activityPage=null;invocationError='';error=message;publish()}
 const current=(life:number,version?:number)=>()=>!closed&&visible&&epoch===life&&(version===undefined||draft===version)
 async function identity(){let actual:string;try{actual=await options.verifyEmployee()}catch{hide('当前员工身份尚未核实，原工具数据已隐藏。');throw Error('original_toolhub_identity_unavailable')}if(closed||actual!==employee){hide('员工会话已变化，请重新登录后读取本人工具。');throw Error('original_toolhub_employee_changed')}}
 function fail(cause:unknown){if([401,403].includes(errorStatus(cause)))hide('当前员工或接口权限尚未核实，原工具数据已隐藏。');else{data.debugResult=null;error='工具数据或操作结果尚未确认，请刷新读取原记录。';publish()}}
 function mutable(){if(view!=='debug'||!visible||closed)return false;if(busy||pending&&!pending.terminal){notice='已有未完成试调；再次点击真实调用只核对原请求，不会创建第二次调用。';publish();return false}return true}
 function retire(){draft++;pending=null;data.debugResult=null;error='';notice=''}
 async function perform(work:()=>Promise<void>){if(closed||!visible||flight)return;busy=true;publish();flight=work().catch(fail).finally(()=>{flight=null;busy=false;publish()});return flight}
 function validateDetail(value:PgNativeWorkflowV2Result,record:Pending){const receipt=record.receipt;if(!receipt||!value||value.execution_mode!=='workflow_native_v2'||value.run?.kind!=='workflow'||value.run.id!==receipt.run_id||value.run.workflow_id!==receipt.workflow_id||!statuses.has(value.run.status)||typeof value.run.result_text!=='string'||typeof value.run.last_error_code!=='string'||value.steps_truncated!==false||!Array.isArray(value.steps)||!Array.isArray(value.approvals)||value.approvals_truncated===true)throw Error('original_toolhub_run_unconfirmed');const state=value.run.checkpoint,machine=state?.machine;if(!machine||typeof machine!=='object'||(machine as {graph_sha256?:unknown}).graph_sha256!==receipt.graph_sha256)throw Error('original_toolhub_run_source_changed');if(value.pending_effect){const p=value.pending_effect;if(p.kind!=='tool'||!hash.test(p.input_sha256)||typeof p.input!=='string'||!Array.isArray(p.missing)||p.missing.length||!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(p.step_key))throw Error('original_toolhub_pending_unconfirmed');const intent=record.prepared.body;if(intent.purpose!=='tool'||stable(JSON.parse(p.input))!==stable(JSON.parse(intent.arguments_json)))throw Error('original_toolhub_pending_arguments_changed');const expected=intent.target,c=p.configuration;if(expected.kind==='builtin'?c.tool!==expected.tool:expected.kind==='http'?stable(c.tool_binding)!==stable(expected.binding):true)throw Error('original_toolhub_pending_target_changed')}return value}
 async function inspect(record:Pending,port:Ports,scope:()=>boolean){
  if(!record.receipt){const result=await port.api.toolHub.confirm(record.prepared.body.request_id,record.prepared.request_sha256);if(!scope()||pending!==record)return null;if(!result.confirmed||!result.receipt){notice='尚未查到原请求回执；继续只读核对，不会重发或新建任务。';publish();return null}if(result.receipt.graph_sha256!==record.prepared.graph_sha256)throw Error('original_toolhub_receipt_source_changed');record.receipt=result.receipt}
  const detail=validateDetail(await port.api.getWorkflowV2Run(record.receipt.run_id),record);if(!scope()||pending!==record)return null
  if(record.decision){const row=detail.approvals.find(a=>a.step_key===record.decision!.step);if(row&&['approved','rejected'].includes(row.status)){record.decision=null;notice='已读到原步骤的当前审批状态；未重发决定。'}}
  if(terminal.has(detail.run.status)){record.terminal=true;const ok=detail.run.status==='succeeded'&&detail.knowledge_outputs_available!==false;if(ok||detail.run.status==='failed'&&detail.run.last_error_code&&!/unknown/.test(detail.run.last_error_code)){data.debugResult={ok,tool_name:target?.title??'',tool_kind:target?.kind==='external'?'external':'builtin',output:ok?detail.run.result_text:'',error:ok?'':detail.run.last_error_code,error_code:ok?'':detail.run.last_error_code,latency_ms:null,retried:null,status_code:null};notice=ok?'已读取原工具任务的实际输出。':'已读取原任务失败记录。'}else{data.debugResult=null;notice='原任务已结束，但执行结果或来源仍未确认；不会重新执行。'}
  }else{data.debugResult=null;notice=record.cancelUnknown?'取消结果尚未确认，后续操作仅只读核对原任务。':record.decision?'审批决定结果尚未确认，再次点击仅只读核对。':detail.run.status==='awaiting_approval'?'试调已提交，尚未执行。再次点击真实调用将核对并请求批准当前步骤。':'试调任务正在等待原 Worker 推进；刷新仅查询，不会重新调用。'}publish();return detail
 }
 async function refreshSummary(background=false){
  if(closed||!visible)return;try{await identity()}catch{return}
  const life=epoch,ticket=++read,selectedView=view,selectedQuery={...activityQuery},scope=()=>current(life)()&&ticket===read&&view===selectedView
  // Device inventory belongs exclusively to the existing LocalDevicesPanel.
  if(selectedView==='devices')return
  const port=options.ports(scope);if(!background){loading=true;publish()}
  const forbidden=(results:readonly PromiseSettledResult<unknown>[])=>{const rejected=results.find(r=>r.status==='rejected'&&[401,403].includes(errorStatus(r.reason)));if(rejected?.status==='rejected'){fail(rejected.reason);return true}return false}
  function statsFields(value:Awaited<ReturnType<Ports['api']['toolHub']['stats']>>,harness?:Awaited<ReturnType<Ports['api']['toolHub']['harness']>>):HubStats{return{native_owner_sample:true,run_count:harness?.totals.runs??null,agent_run_count:null,workflow_run_count:null,invocation_count:value.calls,success_count:value.succeeded,failed_count:value.failed,retried_count:null,external_invocation_count:null}}
  try{
   let partial=false
   if(selectedView==='debug'){
    const results=await Promise.allSettled([port.tools.listSnapshot(),port.home.list()]);if(!scope()||forbidden(results))return
    const [tools,specs]=results
    data.externalTools=tools.status==='fulfilled'?tools.value.items.filter(t=>t.enabled).map(t=>({id:t.id,name:t.name,description:t.description,method:t.method,status:t.status,last_latency_ms:t.last_checked_at===null?null:t.last_latency_ms,enabled:t.enabled})):[]
    data.specOptions=specs.status==='fulfilled'?specs.value.map(s=>({id:s.id,name:s.name})):[]
    partial=results.some(r=>r.status==='rejected')
    if(tools.status==='fulfilled'&&!tools.value.complete)notice='工具清单覆盖范围未完整；未列出的连接不推断为不存在。'
    if(partial)data.debugResult=null
    else if(pending&&!busy)await inspect(pending,port,scope)
   }else if(selectedView==='activity'){
    const results=await Promise.allSettled([port.activity.list(selectedQuery),port.api.toolHub.stats()]);if(!scope()||forbidden(results))return
    const [logs,stats]=results
    activityPage=logs.status==='fulfilled'?logs.value:null
    if(activityPage)activityQuery={...activityPage.query}
    invocationError=logs.status==='rejected'?'本页调用记录尚未核实，请刷新读取；未沿用其他筛选或旧页。':''
    data.invocationList=logs.status==='fulfilled'?logs.value.items.map(i=>({id:i.run_id+':'+i.step_key,tool_name:i.tool,tool_kind:i.kind==='builtin'?'builtin':i.kind==='http'||i.kind==='mcp'?'external':'unavailable',source:i.origin==='trial'?'debug':i.origin==='agent'?'agent_run':'workflow',run_id:i.run_id,status:i.status==='succeeded'?'success':i.status,latency_ms:i.recorded_duration_ms,input_summary:'参数指纹 '+i.arguments_sha256,output_excerpt:i.error??'此接口未返回输出摘录，请核对原任务。',error_code:i.error??'',retried:null,created:i.created_at})):[]
    data.hubStats=stats.status==='fulfilled'?statsFields(stats.value):null
    partial=results.some(r=>r.status==='rejected')
   }else{
    const results=await Promise.allSettled([port.api.toolHub.stats(),port.api.toolHub.harness()]);if(!scope()||forbidden(results))return
    const [stats,harness]=results
    data.hubStats=stats.status==='fulfilled'?statsFields(stats.value,harness.status==='fulfilled'?harness.value:undefined):null
    data.monitorData=harness.status==='fulfilled'?{totals:{runs:harness.value.totals.runs,succeeded:harness.value.totals.succeeded,failed:harness.value.totals.failed,cancelled:harness.value.totals.cancelled,success_rate:harness.value.totals.runs?Math.round(harness.value.totals.succeeded/harness.value.totals.runs*10000)/100:null,avg_steps:harness.value.totals.average_recorded_steps,avg_duration_ms:harness.value.totals.average_completed_duration_ms,est_tokens_total:null,approvals:null,stuck_loops:harness.value.totals.stuck_loop_failures,compressions:null,truncations:null},tools:stats.status==='fulfilled'?stats.value.tools.map(t=>({tool_name:t.tool,calls:t.calls,success:t.succeeded,failed:t.failed,retried:null,avg_latency_ms:t.average_recorded_duration_ms})):[]}:null
    partial=results.some(r=>r.status==='rejected')
   }
   if(!scope())return
   error=partial?'当前视图的部分本人记录尚未核实；未以其他视图、旧数据或零值替代。':'';publish()
  }catch(cause){if(scope()){if(selectedView==='activity'){activityPage=null;data.invocationList=[];invocationError='本页调用记录尚未核实，请刷新读取。'}fail(cause)}}finally{if(scope()){loading=false;publish()}}
 }
 async function makeIntent(port:Ports,scope:()=>boolean):Promise<ToolHubIntent|null>{
  if(!target)return null;let input:Record<string,unknown>,selected:TrialTarget
  if(target.kind==='external'){const snapshot=await port.tools.listSnapshot();if(!scope())return null;const tool=snapshot.items.find(t=>t.id===target!.id);if(!tool?.enabled)throw Error('original_toolhub_tool_changed');if(tool.method!=='GET'&&!fields.confirmExternalWrite)throw Error('original_toolhub_write_confirmation_required');selected={kind:'http',binding:{connection_id:tool.id,connection_revision:tool.revision}};input=JSON.parse(fields.externalInput.trim()||'{}')}
  else{const id=target.id;if(!['calculate','summarize','knowledge_search','web_fetch','web_search'].includes(id))throw Error('original_toolhub_tool_unknown');selected={kind:'builtin',tool:id as 'calculate'}
   if(id==='calculate')input={expression:fields.expression.trim()}
   else if(id==='web_fetch')input={url:fields.url.trim()}
   else if(id==='web_search'){if(!/^(?:[1-9]|10)$/.test(fields.limit))throw Error('original_toolhub_limit_invalid');input={query:fields.query.trim(),limit:Number(fields.limit)}}
   else if(id==='knowledge_search'){const agent=await port.home.get(fields.specId);if(!scope())return null;const ids=agent.spec.knowledge_base_ids;if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!uuid.test(id)))throw Error('original_toolhub_knowledge_sources_required');selected={...selected,knowledge_base_ids:[...ids],...(agent.spec.knowledge_retrieval?{knowledge_retrieval:parseKnowledgeRetrievalBinding(agent.spec.knowledge_retrieval)}:{})};input={query:fields.keyword.trim()}}
   else{const snapshot=await port.models.listSnapshot();if(!scope())return null;const choices:ModelChoice[]=snapshot.items.filter(m=>m.enabled&&m.status==='ok').flatMap(m=>m.models.map(model_id=>({connection_id:m.id,connection_revision:m.revision,model_id,name:m.name})));if(!choices.length)throw Error('original_toolhub_model_required');const choice=await options.chooseModel(choices);await identity();if(!scope()||!choice)return null;const actual=choices.find(c=>stable(c)===stable(choice));if(!actual)throw Error('original_toolhub_model_choice_changed');selected={...selected,model_binding:{connection_id:actual.connection_id,connection_revision:actual.connection_revision,model_id:actual.model_id}};input={text:fields.text.trim(),focus:fields.focus.trim()}}
  }
  return freezeToolHubIntent({purpose:'tool',request_id:options.key?.()??crypto.randomUUID(),target:selected,arguments_json:JSON.stringify(input),effect_consent:TOOL_TRIAL_EFFECT_ACK,...(selected.kind!=='builtin'||selected.tool!=='calculate'?{fee_consent:TOOL_TRIAL_FEE_ACK}:{})})
 }
 async function approve(record:Pending,detail:PgNativeWorkflowV2Result,port:Ports,scope:()=>boolean){
  const p=detail.pending_effect;if(record.decision||record.cancelUnknown||!record.receipt||detail.run.status!=='awaiting_approval'||!p)return
  const [caps,hub]=await Promise.all([port.api.getConfigCapabilities(),port.api.toolHub.capabilities()]);if(!scope())return;if(!caps.config_writes_enabled||!caps.workflow_v2_submission_enabled||!hub.available||!hub.trials){notice='当前接口只允许读取原任务，未发起新的审批决定。';publish();return}
  const charge=Boolean(p.configuration.knowledge_retrieval),description='批准本次工具步骤 '+p.step_key+'，输入指纹 '+p.input_sha256+'。\n'+JSON.stringify({input:p.input,configuration:p.configuration},null,2)+(charge?'\n确认当前语义检索及可能的重排费用；未提供金额报价。':'')
  if(!await options.confirm({purpose:'step',description}))return;await identity();if(!scope()||pending!==record)return
  const fresh=validateDetail(await port.api.getWorkflowV2Run(record.receipt.run_id),record);if(!scope()||fresh.run.status!=='awaiting_approval'||stable(fresh.pending_effect)!==stable(p))throw Error('original_toolhub_step_changed')
  record.decision={step:p.step_key,hash:p.input_sha256};publish()
  try{const result=validateDetail(await port.api.decideWorkflowV2Node(record.receipt.run_id,'approved',p.step_key,p.input_sha256,charge?KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT:undefined),record);if(!scope()||pending!==record)return;const proof=result.decision_confirmation;if(proof?.run_id!==record.receipt.run_id||proof.step_key!==p.step_key||proof.input_sha256!==p.input_sha256||proof.status!=='approved')throw Error('original_toolhub_decision_unconfirmed');record.decision=null;await inspect(record,port,scope)}catch(cause){if(scope()){notice='审批结果尚未确认；已保留原步骤，只读核对，不会重发。';publish()}throw cause}
 }
 function changeActivity(key:keyof OriginalToolHubActivityQuery,value:string|number){
  if(!visible||closed||view!=='activity')return
  try{const next=parseOriginalToolHubActivityQuery({...activityQuery,[key]:value,...(key==='page'?{}:{page:1})});if(JSON.stringify(next)===JSON.stringify(activityQuery))return;activityQuery=next;read++;activityPage=null;data.invocationList=[];invocationError='';publish();void refreshSummary()}catch{invocationError='筛选值不受支持；未发送调用记录请求。';publish()}
 }
 const controller={
  snapshot(){return{employeeId:employee,epoch,visible:visible&&!closed,closed,busy,loading,error,notice,view,activityQuery:visible?{...activityQuery}:emptyQuery(),activity:visible?activityPage:null,invocationError:visible?invocationError:'',filter:visible?activityQuery.tool:'',target:visible?target:null,fields:visible?{...fields}:emptyOriginalToolHubFields(),...(visible?data:blank()),pending:visible&&pending?{requestId:pending.prepared.body.request_id,runId:pending.receipt?.run_id??null,unknown:!pending.receipt||Boolean(pending.decision)||pending.cancelUnknown,terminal:pending.terminal}:null}},
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  navigationBlocked:()=>!closed&&Boolean(busy||pending&&!pending.terminal),
  hidePrivate:()=>hide('当前员工身份尚未核实，原工具数据已隐藏。'),
  async verifyIdentity(){await identity();if(!visible){visible=true;epoch++;await refreshSummary()}},
  async activate(){await identity();if(closed)return;visible=true;epoch++;await refreshSummary()},
  async refresh(background=false){return refreshSummary(background)},
  setField<K extends keyof OriginalToolHubFields>(key:K,value:OriginalToolHubFields[K]){if(!mutable())return;retire();fields={...fields,[key]:value};publish()},
  select(next:ActiveDebugTarget){if(!mutable())return;retire();target=next&&target?.kind===next.kind&&target.id===next.id?null:next;fields={...fields,confirmExternalWrite:false};publish()},
  close(){if(view!=='debug')return Promise.resolve();if(!pending||pending.terminal){controller.select(null);return Promise.resolve()}return perform(async()=>{await identity();const record=pending;if(!record)return;const scope=current(epoch,draft),port=options.ports(scope),detail=await inspect(record,port,scope);if(!scope()||!detail||!record.receipt)return;if(!record.terminal){if(record.cancelUnknown)return;const [caps,hub]=await Promise.all([port.api.getConfigCapabilities(),port.api.toolHub.capabilities()]);if(!scope()||!caps.config_writes_enabled||!hub.trials){notice='当前仅能读取原任务，未发送取消请求。';publish();return}if(!await options.confirm({purpose:'effect',description:'关闭调试台前取消这一次原任务 '+record.receipt.run_id+'？已开始的外部操作无法撤回。取消结果未确认时只读核对，不会重复取消或重新调用。'}))return;await identity();if(!scope()||pending!==record)return;record.cancelUnknown=true;publish();validateDetail(await port.api.cancelWorkflowV2Run(record.receipt.run_id),record);if(!scope()||pending!==record)return;await inspect(record,port,scope)}if(scope()&&record.terminal){retire();target=null;fields={...fields,confirmExternalWrite:false};publish()}})},
  setView(next:ToolHubView,runId=''){if(closed)return;if(!['devices','debug','activity','monitor'].includes(next))throw Error('invalid_original_toolhub_view');const run_id=emptyQuery(runId).run_id;if(view===next&&activityQuery.run_id===run_id)return;view=next;epoch++;read++;activityQuery={...activityQuery,run_id,page:1};activityPage=null;invocationError='';data=blank();loading=false;publish();if(visible)void refreshSummary()},
  setFilter(value:string){changeActivity('tool',activityQuery.tool===value?'':value)},
  setActivityField(key:'q'|'status'|'source',value:string){changeActivity(key,value)},
  setActivityPage(page:number){changeActivity('page',page)},
  dismissError(){error='';publish()},dismissNotice(){notice='';publish()},
  run(){if(view!=='debug')return Promise.resolve();return perform(async()=>{await identity();const life=epoch,version=draft,scope=current(life,version),port=options.ports(scope);if(pending){const record=pending,detail=await inspect(record,port,scope);if(detail&&scope())await approve(record,detail,port,scope);return}
   const [caps,hub]=await Promise.all([port.api.getConfigCapabilities(),port.api.toolHub.capabilities()]);if(!scope())return;if(!caps.config_writes_enabled||!caps.workflow_v2_submission_enabled||!hub.available||!hub.trials)throw Error('original_toolhub_trial_not_approved')
   const intent=await makeIntent(port,scope);if(!intent||!scope())return
   if(intent.purpose==='tool'&&intent.fee_consent&&!await options.confirm({purpose:'fee',description:'核对本次工具的费用与发送范围；可能产生模型或外部服务费用，当前接口未提供金额报价。\n'+JSON.stringify(intent.target)+'\n'+intent.arguments_json}))return;await identity();if(!scope())return
   const prepared=await port.api.toolHub.preview(intent);if(!scope())return
   if(!await options.confirm({purpose:'effect',description:'提交这一次工具试调；提交后仍需单独批准当前步骤。\n请求 '+intent.request_id+'\n指纹 '+prepared.request_sha256+'\n'+JSON.stringify(intent,null,2)}))return;await identity();if(!scope())return
   const checked=await port.api.toolHub.preview(intent);if(!scope()||checked.graph_sha256!==prepared.graph_sha256||checked.request_sha256!==prepared.request_sha256)throw Error('original_toolhub_preview_changed')
   const record:Pending={prepared,receipt:null,decision:null,cancelUnknown:false,terminal:false};pending=record;publish()
   try{const submitted=await port.api.toolHub.submit(prepared.body,prepared.graph_sha256);if(!scope()||pending!==record)return;record.receipt=submitted.receipt;await inspect(record,port,scope)}catch(cause){if(scope()){notice='提交结果尚未确认，已保留原请求；再次点击真实调用只读核对。';publish()}throw cause}
  })},
  async copy(write:(text:string)=>Promise<void>){if(view!=='debug'||!visible||!data.debugResult?.ok||!pending?.receipt)return false;await identity();const record=pending,scope=current(epoch,draft),port=options.ports(scope),before=data.debugResult.output;await inspect(record,port,scope);if(!scope()||pending!==record||!data.debugResult?.ok||data.debugResult.output!==before)return false;await write(before);await identity();return scope()},
  dispose(){closed=true;visible=false;epoch++;read++;data=blank();activityPage=null;invocationError='';fields=emptyOriginalToolHubFields();listeners.clear()}
 }
 return controller
}
