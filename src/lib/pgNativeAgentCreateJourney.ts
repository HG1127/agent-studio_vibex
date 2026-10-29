import type {createPgNativePilotApi,PgNativeAgent,PgNativeModelConnection,PgNativeToolConnection,PgNativeKnowledge} from './pgNativePilotApi'
type Api=Pick<ReturnType<typeof createPgNativePilotApi>,'createAgent'|'getAgent'|'listRuns'|'getRun'|'listAutonomousAgentRuns'|'getAutonomousAgentRun'>
export const nativeAgentCreateStages=['描述需求','确认方案','连接资源','试跑验证','核对与发布'] as const
export type NativeJourneyTrial={id:string;status:string;revision:number;result:string;current:boolean}
export type NativeJourneyPlan={task_scope:string;deliverables:string;task_plan:string;done_criteria:string}
const blankPlan=():NativeJourneyPlan=>({task_scope:'',deliverables:'',task_plan:'',done_criteria:''})
export function nativeJourneyCreatePlan(value:NativeJourneyPlan){
 if(typeof value.task_scope!=='string'||!value.task_scope.trim()||value.task_scope.length>4000)throw Error('native_journey_plan_required')
 const list=(key:'deliverables'|'task_plan'|'done_criteria')=>{const rows=value[key].split('\n').filter(line=>line.trim());if(rows.length<1||rows.length>30||rows.some(line=>line.length>500))throw Error('native_journey_plan_required');return rows}
 return {task_scope:value.task_scope,deliverables:list('deliverables'),task_plan:list('task_plan'),done_criteria:list('done_criteria')}
}
export type NativeAgentCreateView={employeeId:string;scopeKey:string;active:boolean;stage:number;name:string;goal:string;plan:NativeJourneyPlan;agent:PgNativeAgent|null;busy:boolean;pendingCreate:boolean;createdId:string;error:string;notice:string;trial:NativeJourneyTrial|null}
export const emptyNativeAgentCreateView=(employeeId='',scopeKey=''):NativeAgentCreateView=>({employeeId,scopeKey,active:false,stage:0,name:'',goal:'',plan:blankPlan(),agent:null,busy:false,pendingCreate:false,createdId:'',error:'',notice:'',trial:null})
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const clone=<T>(v:T):T=>structuredClone(v)
const statusOf=(e:unknown)=>e&&typeof e==='object'&&'status'in e?Number(e.status):0
function agentValue(raw:PgNativeAgent,id?:string){
 if(!raw||!uuid.test(raw.id)||id!==undefined&&raw.id!==id||!Number.isSafeInteger(raw.revision)||raw.revision<1||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>120||!raw.spec||typeof raw.spec.goal!=='string'||!raw.spec.goal.trim())throw Error('native_journey_invalid_agent')
 return clone(raw)
}
/** UI guidance only. Permission and resource authorization stay in Native API. */
export function nativeAgentJourneyIssues(agent:PgNativeAgent|null,inventory:{models:PgNativeModelConnection[];tools:PgNativeToolConnection[];bases:PgNativeKnowledge[];loading?:boolean}){
 const plan:string[]=[],resources:string[]=[]
 if(!agent)return {plan:['请先保存或选择当前员工的助手方案。'],resources:['保存方案后再配置资源。']}
 const spec=agent.spec
 for(const [key,label]of [['goal','目标'],['task_scope','任务范围']] as const)if(typeof spec[key]!=='string'||!spec[key].trim())plan.push('请补充'+label+'。')
 for(const [key,label]of [['deliverables','交付物'],['task_plan','任务计划'],['done_criteria','完成标准']] as const)if(!Array.isArray(spec[key])||!spec[key]?.length||spec[key]!.some(v=>typeof v!=='string'||!v.trim()))plan.push('请核对'+label+'。')
 if(inventory.loading)resources.push('正在重新读取本人资源；读取完成后再继续。')
 const binding=spec.model_binding,bases={openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',gemini:'https://generativelanguage.googleapis.com/v1beta'}
 const model=binding&&inventory.models.find(c=>c.id===binding.connection_id&&c.revision===binding.connection_revision&&c.enabled===true&&c.status==='ok'&&c.base_url===bases[c.provider]&&c.models.includes(binding.model_id))
 if(!model)resources.push('请绑定本人已测试可用的模型；连接更新后需重新核对绑定版本。')
 for(const ref of spec.http_tools??[])if(!inventory.tools.some(c=>c.id===ref.connection_id&&c.revision===ref.connection_revision&&c.enabled&&c.status==='ok'))resources.push('HTTP 工具连接或版本已变化，请在下方重新核对。')
 if((spec.knowledge_base_ids??[]).some(id=>!inventory.bases.some(b=>b.id===id)))resources.push('关联知识库当前不可读，请刷新并重新选择。')
 return {plan,resources:[...new Set(resources)]}
}
/** One owner/login-epoch lifetime; no storage, timers, model calls or retries. */
export function createPgNativeAgentCreateJourney(api:Api,scope:{employeeId:string;scopeKey:string;onExpired:()=>void}){
 if(!api||!scope.employeeId||!scope.scopeKey)throw Error('native_journey_scope_required')
 let state=emptyNativeAgentCreateView(scope.employeeId,scope.scopeKey),closed=false,enabled=false,read=0,operation=false
 const listeners=new Set<()=>void>(),emit=()=>{for(const listener of listeners)listener()},alive=()=>!closed
 const fail=(e:unknown)=>{
  if(statusOf(e)===401){closed=true;read++;state=emptyNativeAgentCreateView(scope.employeeId,scope.scopeKey);emit();scope.onExpired();return}
  state.error=statusOf(e)===403?'当前账号或环境未开放此操作，请刷新核对权限。':statusOf(e)===404?'所选记录不存在，或当前员工不能读取。':statusOf(e)===409?'方案版本已变化，请重新读取并核对。':[400,413,422].includes(statusOf(e))?'请核对名称与方案内容，精简完整方案后再保存；列表每项最多 500 字。':'尚未收到确认，请核对当前员工的实际保存记录。'
 }
 const model={
  matchesScope(candidate:object,employeeId:string,scopeKey:string){return alive()&&candidate===api&&employeeId===scope.employeeId&&scopeKey===scope.scopeKey},
  snapshot():NativeAgentCreateView{return state.active&&alive()?clone(state):{...emptyNativeAgentCreateView(scope.employeeId,scope.scopeKey),busy:state.busy,pendingCreate:state.pendingCreate}},
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},
  setActive(active:boolean){if(!alive())return;state.active=active;if(!active)read++;emit()},
  setEnabled(value:boolean){enabled=value===true},
  setDraft(name:string,goal:string){if(!alive()||!state.active||operation||state.pendingCreate||state.agent)return;state.name=name.slice(0,120);state.goal=goal.slice(0,3000);state.error='';emit()},
  setPlan(patch:Partial<NativeJourneyPlan>){if(!alive()||!state.active||operation||state.pendingCreate||state.agent)return;for(const key of ['task_scope','deliverables','task_plan','done_criteria'] as const)if(typeof patch[key]==='string')state.plan[key]=patch[key]!.slice(0,key==='task_scope'?4000:15029);state.error='';emit()},
  go(stage:number){if(!alive()||!state.active||operation||!Number.isInteger(stage)||stage<0||stage>4)return;if(stage>=2&&!state.agent)return;if(stage===4&&!state.trial?.current)return;state.stage=stage;state.error='';emit()},
  async create(){
   if(!alive()||!state.active||!enabled||operation||state.pendingCreate||state.agent||!state.name.trim()||!state.goal.trim())return
   let plan:ReturnType<typeof nativeJourneyCreatePlan>
   try{plan=nativeJourneyCreatePlan(state.plan)}catch{state.error='请填写任务范围、交付物、任务计划和完成标准；列表最多 30 项，每项 500 字。';emit();return}
   operation=true;state.busy=true;state.pendingCreate=true;state.error='';state.notice='';const name=state.name.trim(),goal=state.goal.trim();let created=false;emit()
   try{
    // Existing Native create endpoint has no original-UUID confirmation ABI.
    // One POST only; an ambiguous response is never retried or inferred from
    // another row's name. Continuing requires an explicit owned GET selection.
    const accepted=agentValue(await api.createAgent(name,goal,plan));if(!alive())return
    created=true;state.createdId=accepted.id
    const row=agentValue(await api.getAgent(accepted.id),accepted.id);if(!alive())return
    state.agent=row;state.pendingCreate=false;state.trial=null;state.stage=2;state.notice='助手已保存并重新读取。请配置自己的模型与资源。'
   }catch(e){if(alive()){if(!created&&[400,403,405,409,413,422,429].includes(statusOf(e)))state.pendingCreate=false;fail(e)}}
   finally{operation=false;if(alive()){state.busy=false;emit()}}
  },
  async selectExisting(id:string,confirmed=false){
   if(!alive()||!state.active||operation||!uuid.test(id)||!confirmed)return
   if(state.agent&&state.agent.id!==id){state.error='当前向导已绑定一个助手；其它助手可在 Agent 配置页继续处理。';emit();return}
   const ticket=++read;operation=true;state.busy=true;state.error='';emit()
   try{const row=agentValue(await api.getAgent(id),id);if(!alive()||ticket!==read||!state.active)return
    state.agent=row;state.trial=null;state.stage=2;state.notice=state.pendingCreate?'已选择你明确核对的本人助手继续配置；不会重发先前的创建。原创建结果不能仅凭同名记录推断。':'已重新读取所选本人助手。';state.pendingCreate=false
   }catch(e){if(alive()&&ticket===read)fail(e)}finally{operation=false;if(alive()){state.busy=false;emit()}}
  },
  async refreshSelected(){
   const selected=state.agent;if(!alive()||!selected||operation)return
   const ticket=++read;operation=true;state.busy=true;emit()
   try{const row=agentValue(await api.getAgent(selected.id),selected.id);if(!alive()||ticket!==read)return
    if(row.revision!==selected.revision){state.trial=null;state.notice='助手配置已更新，请重新核对当前版本的试跑结果。'}state.agent=row
   }catch(e){if(alive()&&ticket===read){state.agent=null;state.trial=null;fail(e)}}finally{operation=false;if(alive()){state.busy=false;emit()}}
  },
  async readTrial(mode:'single'|'autonomous'){
   const agent=state.agent;if(!alive()||!state.active||!agent||operation)return
   const ticket=++read;operation=true;state.busy=true;state.trial=null;state.error='';state.notice='';emit()
   try{
    const fresh=agentValue(await api.getAgent(agent.id),agent.id)
    if(!alive()||ticket!==read)return
    if(fresh.revision!==agent.revision){state.agent=fresh;state.notice='助手方案已更新，请重新核对资源后再读取当前版本的试跑。';return}
    const rows=mode==='single'?await api.listRuns():await api.listAutonomousAgentRuns()
    const selected=rows.filter(r=>r.agent_spec_id===agent.id).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0]
    if(!alive()||ticket!==read)return
    if(!selected){state.notice='当前助手还没有可读取的试跑记录。请在运行页提交并核对审批与费用。';return}
    const detail=mode==='single'?await api.getRun(selected.id):await api.getAutonomousAgentRun(selected.id)
    if(!alive()||ticket!==read||state.agent?.revision!==agent.revision)return
    const run=detail.run,revision=Number(run.checkpoint.spec_revision),at=Date.parse(run.created_at)
    // Autonomous SDK intentionally omits owner identity: its actual Native
    // GET enforces ownership. Single-run projection includes it and must match.
    if(run.id!==selected.id||run.agent_spec_id!==agent.id||mode==='single'&&!('owner_user_id'in run)||'owner_user_id'in run&&run.owner_user_id!==scope.employeeId)throw Error('native_journey_wrong_run')
    const current=run.status==='succeeded'&&revision===agent.revision&&Number.isFinite(at)&&at<=Date.now()+300000&&typeof run.result_text==='string'&&run.result_text.trim().length>0&&run.result_text.length<=1000000&&(!('knowledge_outputs_available'in run)||run.knowledge_outputs_available!==false)&&(!('knowledge_outputs_available' in detail)||detail.knowledge_outputs_available!==false)
    state.trial={id:run.id,status:run.status,revision,result:current?run.result_text:'',current};state.notice=current?'已读取当前方案版本的真实成功输出，请核对后前往发布页。':'该记录尚不能证明当前方案已通过试跑，请在运行页核对状态、版本和输出。'
   }catch(e){if(alive()&&ticket===read)fail(e)}finally{operation=false;if(alive()){state.busy=false;emit()}}
  },
  hasUnsavedDraft(){return alive()&&(!state.agent&&Boolean(state.name||state.goal||Object.values(state.plan).some(Boolean))||state.pendingCreate)},
  dispose(){if(closed)return;closed=true;read++;state=emptyNativeAgentCreateView();listeners.clear()},
 }
 return model
}
export type PgNativeAgentCreateJourney=ReturnType<typeof createPgNativeAgentCreateJourney>
