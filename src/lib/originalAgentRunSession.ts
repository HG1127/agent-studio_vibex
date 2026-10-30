import {createPgNativeAutonomousAgentSession,emptyAutonomousView,autonomousApprovalReady,readyAutonomousModel,type AutonomousDetail} from './pgNativeAutonomousAgentSession.ts'
import {createPgNativeFeedbackSession,emptyFeedbackView} from './pgNativeAgentFeedbackSession.ts'
import {createPgNativeMemorySession,emptyMemoryView} from './pgNativeAgentMemorySession.ts'
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeConfigCapabilities,type PgNativeAgent,type PgNativeModelConnection,type PgNativeToolConnection,type PgNativeMcpConnection} from './pgNativePilotApi.ts'
import type {createOriginalHomeAgentApi,OriginalHomeAgent} from './originalHomeAgentApi.ts'
import type {createOriginalHomeInboxApi,OriginalWorkspace} from './originalHomeInboxApi.ts'
import type {createOriginalModelConnectionsApi} from './originalModelConnectionsApi.ts'
import {originalRunAgent,originalRunDetail} from './originalAgentRunProjection.ts'

type Api=ReturnType<typeof createPgNativePilotApi>
type Home=Pick<ReturnType<typeof createOriginalHomeAgentApi>,'list'|'get'>
type Inbox=Pick<ReturnType<typeof createOriginalHomeInboxApi>,'workspace'>
export type OriginalRunConfirmation={purpose:'submit'|'effect'|'cancel'|'forget'|'feedback'|'human';run_id:string|null;step_key:string|null;input_sha256:string|null;description:string}
const emptyWorkspace=():OriginalWorkspace=>({items:[],pending_items:[],pending_count:0,agent_run_total:0})
const terminal=new Set(['succeeded','failed','cancelled'])
export function originalRunApproval(detail:AutonomousDetail|null){
 const p=detail?.run.status==='awaiting_approval'?detail.pending_effect:null
 return p?{toolName:p.kind==='model'?'模型调用（需另行费用预览）':p.kind==='agent'?'启动原 Native Agent':String(p.configuration.tool??p.configuration.title??p.kind),argsSummary:JSON.stringify({step_key:p.step_key,input_sha256:p.input_sha256,input:p.input,configuration:p.configuration},null,2),stepIndex:detail!.run.step_count}:null
}
/** Existing Native APIs have no price estimate contract for this old card. */
export function originalRunZeroCostEffect(detail:AutonomousDetail):boolean{
 const p=detail.pending_effect
 if(!p)return false
 if(p.kind==='agent')return true
 return p.kind==='tool'&&!p.configuration.tool_binding&&!p.configuration.mcp_binding&&['calculate','business_case_get','business_record_query','business_record_write','result_read'].includes(String(p.configuration.tool))
}
export function createOriginalAgentRunSession(options:{employeeId:string;api:Api;home:Home;inbox:Inbox;models:Pick<ReturnType<typeof createOriginalModelConnectionsApi>,'listSnapshot'>;verifyEmployee:()=>Promise<string>;confirm:(request:OriginalRunConfirmation)=>Promise<boolean>|boolean}){
 const employee=options.employeeId,listeners=new Set<()=>void>();let closed=false,suspended=false,recovering=false,sourceDenied=false,ownerChanged=false,epoch=0,read=0,error='',notice='',loading=false,selectedAgent='',agents:OriginalHomeAgent[]=[],models:PgNativeModelConnection[]=[],tools:PgNativeToolConnection[]=[],mcps:PgNativeMcpConnection[]=[],caps:PgNativeConfigCapabilities|null=null,workspace=emptyWorkspace(),feedbackRun:string|null=null,historyKey='',historyRead=0,historyLoading=false,historyError='';let historyDetails=new Map<string,AutonomousDetail>()
 const publish=()=>{if(!closed)listeners.forEach(fn=>fn())}
 function lockPrivate(message:string,owner=false){if(!sourceDenied){epoch++;read++;historyRead++}sourceDenied=true;if(owner)ownerChanged=true;error=message;publish()}
 async function identity(){
  if(closed)throw new PgNativePilotError(503,'original_agent_run_disposed')
  let value:string
  try{value=await options.verifyEmployee()}catch{if(!suspended){epoch++;read++;historyRead++}suspended=true;error='员工身份验证暂不可用，所有私有正文与草稿展示已隐藏。原未确认请求仍保留在原员工控制器内存。';publish();throw new PgNativePilotError(503,'original_agent_run_identity_unavailable')}
  if(closed||value!==employee){suspended=true;lockPrivate('员工身份已变化，原私有正文与本地草稿已隐藏；不会重发原操作。',true);throw new PgNativePilotError(503,'original_agent_run_employee_changed')}
 }
 const scoped=<T extends object>(source:T):T=>{const result=Object.create(null) as Record<PropertyKey,unknown>;for(const key of Reflect.ownKeys(source)){const value=Reflect.get(source,key);result[key]=typeof value!=='function'?value:async(...args:unknown[])=>{
  await identity();if((suspended||sourceDenied||ownerChanged)&&!recovering||(suspended||recovering||sourceDenied||ownerChanged)&&/^(submit|decide|control|cancel|change|respond)/.test(String(key)))throw new PgNativePilotError(503,'original_run_private_hidden');const life=epoch
  try{const answer=await value.apply(source,args);await identity();if(life!==epoch)throw new PgNativePilotError(503,'original_run_scope_changed')
   const raw=answer as {knowledge_outputs_available?:unknown;run?:{knowledge_outputs_available?:unknown};state?:unknown}|null
   if(raw&&(raw.knowledge_outputs_available===false||raw.run?.knowledge_outputs_available===false||raw.state==='unconfirmed')){lockPrivate('运行来源或访问权限已变化，详情、历史、反馈、记忆与复制正文均已隐藏。');throw new PgNativePilotError(503,'original_run_source_revoked')}
   return answer
  }catch(cause){const status=cause&&typeof cause==='object'&&'status'in cause?Number(cause.status):0;if([401,403,404].includes(status)){lockPrivate('后台拒绝当前来源读取，详情、历史、反馈、记忆与复制正文均已隐藏；原未确认操作保留。',status===401);throw new PgNativePilotError(503,'original_run_source_denied')}throw cause}
 }}return Object.freeze(result) as T}
 const api=scoped(options.api),home=scoped(options.home),inbox=scoped(options.inbox),modelSource=scoped(options.models)
 const runs=createPgNativeAutonomousAgentSession(api,{onExpired:dispose})
 const feedback=createPgNativeFeedbackSession(api,{onExpired:dispose}),memories=createPgNativeMemorySession(api,{onExpired:dispose})
 async function hydrateHistory(){const summary=runs.snapshot().runs,key=JSON.stringify(summary.map(r=>[r.id,r.updated_at]));if(key===historyKey||closed)return;historyKey=key;const ticket=++historyRead,life=epoch;historyLoading=true;historyError='';publish();const next=new Map<string,AutonomousDetail>();let cursor=0;try{if(summary.length>50||new Set(summary.map(r=>r.id)).size!==summary.length)throw Error('invalid_history_page');const worker=async()=>{while(cursor<summary.length){const row=summary[cursor++],cached=historyDetails.get(row.id),d=cached?.run.updated_at===row.updated_at?cached:await api.getAutonomousAgentRun(row.id);originalRunDetail(d,employee);if(d.run.agent_spec_id!==row.agent_spec_id)throw Error('history_source_changed');next.set(row.id,d)}};await Promise.all([worker(),worker(),worker()]);if(!closed&&life===epoch&&ticket===historyRead)historyDetails=next}catch{if(!closed&&life===epoch&&ticket===historyRead){historyDetails.clear();historyError='本人运行历史尚未核实；不会以预览、零轮次或当前助手标题充当完整历史。'}}finally{if(!closed&&ticket===historyRead){historyLoading=false;publish()}}}
 const unsubs=[runs.subscribe(()=>{const d=runs.snapshot().detail;if(d)historyDetails.set(d.run.id,d);void hydrateHistory();const id=d?.run.id??null;if(id!==feedbackRun){feedbackRun=id;void feedback.select(id)}publish()}),feedback.subscribe(publish),memories.subscribe(publish)]
 function dispose(){if(closed)return;closed=true;epoch++;read++;historyRead++;historyDetails.clear();runs.dispose();feedback.dispose();memories.dispose();agents=[];models=[];tools=[];mcps=[];caps=null;workspace=emptyWorkspace();selectedAgent='';error='';notice='';listeners.forEach(fn=>fn());listeners.clear();unsubs.forEach(fn=>fn())}
 function blocked(){if(closed)return false;const f=feedback.snapshot(),m=memories.snapshot();return runs.navigationBlocked()||Boolean(f.busy||f.pending||m.busy||m.pending)}
 function privateVisible(){return !closed&&!suspended&&!recovering&&!sourceDenied&&!ownerChanged}
 function currentAgent(){return agents.find(a=>a.id===selectedAgent)}
 const nativeAgents=():PgNativeAgent[]=>agents.map(a=>({id:a.id,name:a.name,revision:a.revision,spec:a.spec as PgNativeAgent['spec']}))
 async function load(){
  if(closed)return;const ticket=++read,life=epoch;loading=true;error='';publish()
  try{
   const values=await Promise.all([home.list(),api.getConfigCapabilities(),modelSource.listSnapshot(),api.listToolConnections(),inbox.workspace()])
   if(closed||life!==epoch||ticket!==read)return
   const [nextAgents,nextCaps,modelSnapshot,nextTools,nextWorkspace]=values
   if(modelSnapshot.complete!==true)throw Error('original_run_complete_models_required')
   const nextModels=modelSnapshot.items
   nextAgents.forEach(a=>originalRunAgent(a,employee))
   if(nextModels.some(m=>m.owner_user_id!==employee))throw Error('original_agent_model_owner_changed')
   agents=nextAgents;caps=nextCaps;models=nextModels;tools=nextTools;workspace=nextWorkspace
   mcps=agents.some(a=>Array.isArray(a.spec.mcp_tools)&&a.spec.mcp_tools.length)?await api.listMcpConnections():[]
   if(closed||life!==epoch||ticket!==read)return
   feedback.setScopes({available:caps.agent_feedback_available===true,submit:caps.agent_feedback_submission_enabled===true,lessons:false})
   memories.setWritable(caps.agent_memory_writes_enabled===true)
   if(selectedAgent&&!agents.some(a=>a.id===selectedAgent)){selectedAgent='';await memories.select(null)}
  }catch(cause){if(!closed&&life===epoch&&ticket===read){lockPrivate('原运行页完整来源尚未核实，所有私有正文与草稿展示已隐藏。');agents=[];models=[];tools=[];mcps=[];workspace=emptyWorkspace();caps=null;error=cause instanceof PgNativePilotError&&cause.status===403?'当前员工或实例未授权原运行页所需的读取接口。':'原运行页数据尚未核实，请刷新重试。'}}
  finally{if(!closed&&life===epoch&&ticket===read){loading=false;publish()}}
 }
 function snapshot(){
  const hidden=closed||suspended||recovering||sourceDenied,r=hidden?structuredClone(emptyAutonomousView):runs.snapshot(),f=hidden?emptyFeedbackView():feedback.snapshot(),m=hidden?emptyMemoryView():memories.snapshot();let projectionError=''
  let history:ReturnType<typeof originalRunDetail>[]=[],active:ReturnType<typeof originalRunDetail>|null=null
  try{history=r.runs.map(row=>historyDetails.get(row.id)).filter((d):d is AutonomousDetail=>Boolean(d)).map(d=>originalRunDetail(d,employee));active=r.detail?originalRunDetail(r.detail,employee,f.runId===r.detail.run.id?f.status:null):null}catch{projectionError='后台运行字段不完整，当前记录未作为原页面运行结果展示。'}
  const warnings=[]
  if(selectedAgent)warnings.push('当前记忆面板接入本人显式保存的记录；派生经验与反馈教训列表尚未接通原面板。')
  if(r.detail)warnings.push('当前后台未提供原时间线事件及历史助手名称合同；步骤状态不会伪造成事件，运行名称显示真实 Agent ID。步数仅取后台已成功完成的模型轮次，不表示实际金额或工具预算。 ')
  if(r.detail?.run.status==='awaiting_input')warnings.push('当前任务等待本人回复；原父页尚需接入已有 Native 问题/草案确认控件。')
  if(workspace.pending_items.some(item=>item.engine_kind==='agent_single'))warnings.push('本人还有单轮运行待办；其原页面详情与控制合同尚未接入此自主运行分支。')
  return{employeeId:closed?'':employee,agents:hidden?[]:agents.map(a=>originalRunAgent(a,employee)),nativeAgents:hidden?[]:agents,models:hidden?[]:models,caps:hidden?null:caps,workspace:hidden?emptyWorkspace():workspace,selectedAgentId:hidden?'':selectedAgent,loading:!closed&&!hidden&&(loading||historyLoading),runs:r,feedback:f,memories:m,activeRun:hidden?null:active,runHistory:hidden?[]:history,pendingApproval:hidden?null:originalRunApproval(r.detail),error:closed?'登录或员工会话已变化，请重新登录。':hidden?error:[error,historyError,projectionError,r.error,f.error,m.error,...warnings].filter(Boolean).join(' '),notice:hidden?'身份未核实，旧页面数据不会展示；原未确认操作保留在内存。':[historyLoading?'正在核对本人运行历史的完整详情。':'',notice,r.notice,f.notice,m.notice].filter(Boolean).join(' '),closed,recovering,sourceDenied,ownerChanged,suspended:hidden&&!closed}
 }
 async function confirm(request:OriginalRunConfirmation,work:()=>Promise<void>){const life=epoch;await identity();if(suspended||recovering||sourceDenied||ownerChanged)return;if(!await options.confirm(Object.freeze(request))||closed||life!==epoch)return;await identity();error='';notice='';publish();await work()}
 return{
  hidePrivateForIdentity(owner=false){if(owner){suspended=true;lockPrivate('员工身份已变化，旧私有正文与本地草稿已隐藏。原请求仅保留在原员工控制器。',true)}else{if(!suspended){epoch++;read++;historyRead++}suspended=true;error='员工身份暂不可用，旧私有正文与草稿展示已隐藏，原未确认请求仍保留。';publish()}},
  snapshot,dispose,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},navigationBlocked:blocked,
  async verifyIdentity(){if(closed)return;const restore=suspended||sourceDenied||ownerChanged;recovering=restore;if(restore){epoch++;read++;historyRead++;publish()}try{await identity();if(restore){suspended=false;sourceDenied=false;ownerChanged=false;await Promise.all([load(),runs.refresh(),feedback.refresh(),memories.refresh()])}}finally{recovering=false;publish()}},
  async activate(){await identity();runs.setActive(true);feedback.setActive(true);memories.setActive(true);await load()},
  async refresh(){if(closed)return;await Promise.all([load(),runs.refresh(),feedback.refresh(),memories.refresh()])},
  async selectAgent(id:string){if(!privateVisible())return;if(blocked()){error='请先核对当前未确认的操作，再切换助手。';publish();return}const a=agents.find(a=>a.id===id);if(id&&!a){error='未找到当前员工的助手。';publish();return}error='';selectedAgent=id;await memories.select(a?{id:a.id,name:a.name,revision:a.revision}:null);publish()},
  async selectRun(id:string,specId?:string,kind=''){
   if(!privateVisible())return
   const actualKind=kind||[...workspace.items,...workspace.pending_items].find(item=>item.id===id)?.engine_kind||'agent_autonomous'
   if(actualKind!=='agent_autonomous'){error='此待办属于单轮运行，尚缺原父页的同义详情与控制合同，未将其当作自主运行。';publish();return}
   if(blocked()){error='请先核对原请求，再切换运行。';publish();return}
   error='';if(specId){const source=await api.getAutonomousAgentRun(id);if(source.run.agent_spec_id!==specId){error='运行和助手来源不匹配，未加载该详情。';publish();return}}
   await runs.select(id);const detail=runs.snapshot().detail
   if(specId&&detail&&detail.run.agent_spec_id!==specId){runs.setActive(false);error='运行和助手来源不匹配，已清除详情。';publish();return}
   if(detail){selectedAgent=detail.run.agent_spec_id;const a=currentAgent();await memories.select(a?{id:a.id,name:a.name,revision:a.revision}:null)}publish()
  },
  async poll(){if(!closed){await identity();await runs.poll()}},
  async submit(instruction:string,maxSteps:number){
   if(!privateVisible())return
   const a=currentAgent(),r=runs.snapshot()
   if(!a||!caps?.autonomous_agent_submission_enabled||!caps.config_writes_enabled){error='当前员工或实例未授权发起自主运行。';publish();return}
   if(r.pendingSubmit){await runs.refresh();error='原任务登记结果未确认；此入口没有独立登记回执查询合同，原请求保留，不重新提交。';publish();return}
   if(blocked()){error='请先核对当前操作。';publish();return}
   if(!readyAutonomousModel(nativeAgents().find(x=>x.id===a.id),models)){error='当前助手尚未绑定本人已核验的模型版本，请先在原助手配置中保存。';publish();return}
   if((a.spec.tools as string[]).some(t=>['business_case_get','business_record_query','business_record_write','result_read'].includes(t))){error='此助手的业务工具仅能由074真实监测来源登记运行；普通业务 case-run 启动合同尚未接通，未提交运行。';publish();return}
   if(!instruction.trim()||instruction.trim().length>2000||!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>30){error='请填写1～2000字任务及1～30轮上限。';publish();return}
   await confirm({purpose:'submit',run_id:null,step_key:null,input_sha256:null,description:'创建当前员工助手 '+a.id+' 第 '+a.revision+' 版的任务，最多 '+maxSteps+' 轮。只登记任务；模型和工具步骤仍需逐次审批及费用预览。'},()=>runs.submit({agentId:a.id,revision:a.revision,instruction,maxSteps,requirePlanReview:a.spec.require_plan_review===true}))
  },
  async decide(decision:'approve'|'reject'){
   if(!privateVisible())return
   const detail=runs.snapshot().detail,p=detail?.pending_effect
   if(!detail||!p||!caps?.autonomous_agent_submission_enabled)return
   if(runs.snapshot().pendingMutation){await runs.refresh();error='已读取原决定结果；尚未确认时不会重发或扩大授权。';publish();return}
   if(decision==='approve'){
    if(!autonomousApprovalReady(detail,nativeAgents(),models,tools,mcps,caps.mcp_tool_runs_enabled===true)){error='当前助手、模型、工具、知识来源或审批版本已变化，请先刷新核对。';publish();return}
    if(!originalRunZeroCostEffect(detail)){error='原审批卡尚缺本次模型、语义检索或外部工具的费用预览合同，此入口未批准调用。';publish();return}
   }
   const label=decision==='approve'?'批准':'拒绝'
   await confirm({purpose:'effect',run_id:detail.run.id,step_key:p.step_key,input_sha256:p.input_sha256,description:label+'当前步骤 '+p.step_key+'，输入指纹 '+p.input_sha256+'。\n'+JSON.stringify({input:p.input,configuration:p.configuration},null,2)},()=>runs.decide(decision==='approve'?'approved':'rejected',true,false))
  },
  async control(action:'pause'|'resume'|'cancel'){
   if(!privateVisible())return
   const r=runs.snapshot(),d=r.detail;if(!d||!caps?.autonomous_agent_submission_enabled)return
   if(r.pendingRunControl){await runs.confirmRunControl();return}
   if(r.pendingMutation){await runs.refresh();return}
   if(action==='cancel'){if(terminal.has(d.run.status))return;await confirm({purpose:'cancel',run_id:d.run.id,step_key:null,input_sha256:null,description:'取消本人任务 '+d.run.id+'。已发出的调用可能继续完成，取消不代表没有费用。'},()=>runs.cancel());return}
   const allowed=action==='pause'?d.run_control?.can_pause:d.run_control?.can_resume
   if(!allowed){error='当前服务器状态不允许此控制操作，请刷新核对。';publish();return}
   await identity();await runs.controlRun(action)
  },
  async submitFeedback(value:{rating:'up'|'down';tags:string[];comment:string}){
   if(!privateVisible())return
   const f=feedback.snapshot();if(f.pending){await feedback.confirm();return}
   if(!f.canSubmit||!f.status?.source){error='当前运行反馈来源或写入权限尚未核实。';publish();return}
   await confirm({purpose:'feedback',run_id:f.runId,step_key:null,input_sha256:f.status.source.source_sha256,description:'保存本人对此运行的评价。不会自动保存教训、生成优化或调用模型。'},()=>feedback.submit({...value,remember_lesson:false},true))
  },
  async forgetMemory(id:string){if(!privateVisible())return;const m=memories.snapshot();if(m.pending){await memories.confirm();return}const item=m.items.find(x=>x.id===id);if(!item||!m.canWrite)return;await confirm({purpose:'forget',run_id:null,step_key:null,input_sha256:item.content_sha256,description:'忘记当前助手中本人保存的这条记忆：'+item.fact},()=>memories.forget(id,true))},
  async respond(decision:'reply'|'approve'|'revise',answer:string){if(!privateVisible())return;if(!caps?.agent_human_responses_enabled)return;if(runs.snapshot().pendingHumanResponse){await runs.retryHumanResponse();return}const d=runs.snapshot().detail,p=d?.human_input;if(!d||!p||d.run.status!=='awaiting_input'||d.human_input_current!==true)return;await confirm({purpose:'human',run_id:d.run.id,step_key:p.pending_step_key,input_sha256:p.pending_sha256,description:'确认本次人员回复/草案决定 '+decision+'。后续模型和工具仍需单独审批及费用预览。\n问题：'+p.question+'\n草案：'+p.draft+'\n本次回复：'+answer},()=>runs.respond(decision,answer,true))},
  async readResultForCopy(){await identity();if(suspended||recovering||sourceDenied)return '';const current=runs.snapshot().detail;if(!current)return '';const actual=await api.getAutonomousAgentRun(current.run.id);const next=originalRunDetail(actual,employee);if(suspended||recovering||sourceDenied||runs.snapshot().detail?.run.id!==next.id)return '';return next.result},
  reportUnavailable(message:string){error=message;publish()},dismissError(){error='';publish()},
 }
}
