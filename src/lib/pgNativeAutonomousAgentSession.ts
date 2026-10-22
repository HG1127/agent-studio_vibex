// One employee-view lifetime. No storage, timers, credentials or provider calls.
import {PgNativePilotError,type PgNativeAutonomousAgentResult,type PgNativeAutonomousAgentSummary,type PgNativeAgent,type PgNativeModelConnection,
  type PgNativeWorkflowV2Pending} from "./pgNativePilotApi.ts"
type Api={
  submitAutonomousAgentRun(id:string,revision:number,instruction:string,key:string,max:number):Promise<PgNativeAutonomousAgentResult>
  listAutonomousAgentRuns():Promise<PgNativeAutonomousAgentSummary[]>
  getAutonomousAgentRun(id:string):Promise<PgNativeAutonomousAgentResult>
  decideAutonomousAgentNode(id:string,decision:"approved"|"rejected",step:string,hash:string):Promise<PgNativeAutonomousAgentResult>
  cancelAutonomousAgentRun(id:string):Promise<PgNativeAutonomousAgentResult>
}
export type AutonomousDraft={agentId:string;revision:number;instruction:string;maxSteps:number}
type Submission=Readonly<AutonomousDraft&{key:string}>
type Mutation=Readonly<{kind:"decision";id:string;decision:"approved"|"rejected";step:string;hash:string}|{kind:"cancel";id:string}>
export type AutonomousView={runs:PgNativeAutonomousAgentSummary[];detail:PgNativeAutonomousAgentResult|null;
  pendingSubmit:Submission|null;pendingMutation:Mutation|null;busy:boolean;loading:boolean;error:string;notice:string}
export const emptyAutonomousView:AutonomousView={runs:[],detail:null,pendingSubmit:null,pendingMutation:null,busy:false,loading:false,error:"",notice:""}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const terminal=new Set(["succeeded","failed","cancelled"])
const definite=new Set([400,401,403,404,405,409,413,415,422,429])
export function autonomousError(error:unknown){
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "登录已失效，请重新登录。"
    if([403,405].includes(error.status))return "当前账号或环境未授权此操作。"
    if(error.status===404)return "任务不存在，或不属于当前员工。"
    if(error.status===409)return error.code==="workflow_effect_in_flight"?"已有操作正在执行或结果待核对，暂时不能取消任务。":"任务或配置已经变化，请刷新核对后再处理。"
    if(error.status===429)return "操作过于频繁，请稍后再试。"
  }
  return "请求结果尚未确认，请刷新状态或确认上次操作。"
}
export function readyAutonomousModel(agent:PgNativeAgent|undefined,connections:PgNativeModelConnection[]){
  const binding=agent?.spec.model_binding
  const bases={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",gemini:"https://generativelanguage.googleapis.com/v1beta"}
  return binding?connections.find(c=>c.id===binding.connection_id&&c.enabled&&c.status==="ok"&&c.base_url===bases[c.provider]&&
    c.revision===binding.connection_revision&&Array.isArray(c.models)&&c.models.includes(binding.model_id)):undefined
}
export function autonomousApprovalReady(detail:PgNativeAutonomousAgentResult|null,agents:PgNativeAgent[],connections:PgNativeModelConnection[]){
  const agent=agents.find(a=>a.id===detail?.run.agent_spec_id),model=readyAutonomousModel(agent,connections),pending=detail?.pending_effect
  if(!agent||!model||detail?.run.status!=="awaiting_approval"||detail.run.checkpoint.spec_revision!==agent.revision||!pending)return false
  const binding=pending.configuration.model_binding as Record<string,unknown>|undefined
  if(binding&&(binding.connection_id!==model.id||binding.connection_revision!==model.revision||binding.model_id!==agent.spec.model_binding?.model_id))return false
  if(pending.kind==="agent"){
    const ref=pending.configuration.agent_binding as Record<string,unknown>|undefined
    if(ref?.spec_id!==agent.id||ref.spec_revision!==agent.revision||pending.configuration.max_steps!==detail.run.checkpoint.max_steps)return false
  }else if(pending.kind==="model"&&!binding)return false
  else if(pending.kind==="tool"&&(!agent.spec.tools?.includes(String(pending.configuration.tool))||pending.configuration.tool==="summarize"&&!binding))return false
  return pending.missing.length===0
}
export function autonomousReview(pending:PgNativeWorkflowV2Pending){
  if(pending.kind==="agent")return {title:"启动 Agent",text:pending.input,charged:false}
  if(pending.kind==="tool")return {title:"工具操作",text:JSON.stringify({tool:pending.configuration.tool,parameters:parseJson(pending.input)},null,2),charged:pending.configuration.tool==="summarize"}
  const input=parseJson(pending.input) as {task?:unknown;round?:unknown;history?:unknown[]}
  // Model planning is not shown as a transcript. Only task and observation count.
  return {title:"模型调用",text:typeof input?.task==="string"?input.task:"按当前任务、角色配置和已有工具结果生成下一步操作。",charged:true}
}
function parseJson(value:string):unknown{try{return JSON.parse(value)}catch{return value}}
function checked(value:PgNativeAutonomousAgentResult,id?:string){
  if(!value||value.execution_mode!=="agent_native_v2"||!uuid.test(value.run?.id??"")||value.run.kind!=="agent"||value.run.workflow_id!==null||
     !uuid.test(value.run.agent_spec_id)||id&&value.run.id!==id||!Array.isArray(value.approvals)||!Array.isArray(value.steps)||typeof value.replayed!=="boolean")
    throw Error("unconfirmed_autonomous_response")
  return value
}
export function createPgNativeAutonomousAgentSession(api:Api,options:{key?:()=>string;onExpired?:()=>void}={}){
  let state:AutonomousView={...emptyAutonomousView},closed=false,active=false,ticket=0,selected:string|null=null
  let uncertain=false,flight:Promise<void>|null=null
  const listeners=new Set<()=>void>()
  const update=(patch:Partial<AutonomousView>)=>{if(!closed){state={...state,...patch};for(const listener of listeners)listener()}}
  const expired=(error:unknown)=>{
    if(error instanceof PgNativePilotError&&error.status===401){
      selected=null;++ticket;update({...emptyAutonomousView,error:autonomousError(error)});uncertain=false;active=false;closed=true;listeners.clear();options.onExpired?.();return true
    }return false
  }
  const confirmMutation=(detail:PgNativeAutonomousAgentResult)=>{
    const pending=state.pendingMutation
    if(pending?.id!==detail.run.id)return
    const approval=pending.kind==="decision"?detail.approvals.find(a=>a.step_key===pending.step):undefined
    if(pending.kind==="cancel"?terminal.has(detail.run.status):approval&&["approved","rejected"].includes(approval.status)){
      uncertain=false;update({pendingMutation:null,notice:pending.kind==="cancel"&&detail.run.status!=="cancelled"?
        "任务已经结束，无法再取消。":pending.kind==="decision"&&approval?.status!==pending.decision?
          "此步骤已由当前账号的另一操作决定，已更新为最新状态。":"已确认上次操作。"})
    }
  }
  async function refresh(id=selected,background=false):Promise<void>{
    if(closed||!active)return
    const read=++ticket;if(!background)update({loading:true,error:""})
    try{
      const [runs,detail]=await Promise.all([background?Promise.resolve(state.runs):api.listAutonomousAgentRuns(),id?api.getAutonomousAgentRun(id):Promise.resolve(null)])
      if(closed||!active||read!==ticket)return
      if(!Array.isArray(runs)||runs.some(run=>!run||!uuid.test(run.id)||typeof run.status!=="string"||typeof run.instruction_preview!=="string"))throw Error("invalid_autonomous_history")
      if(detail)checked(detail,id!);selected=id
      update({runs:runs.slice(0,50).map(row=>background&&row.id===detail?.run.id?{...row,status:detail.run.status,result_preview:detail.run.result_text.slice(0,240)}:row),detail,error:""})
      if(detail)confirmMutation(detail)
    }catch(error){if(!closed&&active&&read===ticket&&!expired(error))update({...(!background?{runs:[],detail:null}:{}),error:autonomousError(error)})}
    finally{if(!closed&&read===ticket&&!background)update({loading:false})}
  }
  function perform(work:()=>Promise<void>){
    if(closed||!active)return Promise.resolve()
    if(flight)return flight
    ++ticket;update({busy:true,loading:false,error:"",notice:""})
    flight=Promise.resolve().then(work).finally(()=>{flight=null;update({busy:false})})
    return flight
  }
  return {
    snapshot:()=>state,
    subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn)}},
    dispose(){closed=true;active=false;++ticket;selected=null;state={...emptyAutonomousView};listeners.clear()},
    setActive(value:boolean){if(closed)return;active=value;if(value)void refresh();else{++ticket;update({loading:false})}},
    refresh,
    poll(){return selected&&!state.busy&&!state.loading&&!state.pendingSubmit&&!state.pendingMutation?refresh(selected,true):Promise.resolve()},
    select(id:string){if(!uuid.test(id)||state.busy||state.pendingMutation)return Promise.resolve();return refresh(id)},
    submit(draft:AutonomousDraft){
      if(state.pendingMutation)return Promise.resolve()
      return perform(async()=>{
        if(!state.pendingSubmit){
          const instruction=draft.instruction.trim()
          if(!uuid.test(draft.agentId)||!Number.isSafeInteger(draft.revision)||draft.revision<1||!instruction||instruction.length>1200||instruction.includes("\0")||
             !Number.isSafeInteger(draft.maxSteps)||draft.maxSteps<1||draft.maxSteps>5){update({error:"请核对 Agent、任务要求和轮数。"});return}
          update({pendingSubmit:Object.freeze({...draft,instruction,key:options.key?.()??"pg_agent_"+crypto.randomUUID().replaceAll("-","")})})
        }
        const body=state.pendingSubmit!
        try{
          const result=checked(await api.submitAutonomousAgentRun(body.agentId,body.revision,body.instruction,body.key,body.maxSteps))
          if(closed)return
          if(result.run.agent_spec_id!==body.agentId||result.run.instruction!==body.instruction||result.run.checkpoint.spec_revision!==body.revision||result.run.checkpoint.max_steps!==body.maxSteps)throw Error("unconfirmed_autonomous_submission")
          ++ticket;selected=result.run.id;uncertain=false;update({pendingSubmit:null,detail:result,notice:result.replayed?"已确认上次提交，未创建重复任务。":"多轮任务已提交，等待逐步审批。"})
          if(active)await refresh()
        }catch(error){
          if(closed||expired(error))return
          if(!uncertain&&error instanceof PgNativePilotError&&definite.has(error.status))update({pendingSubmit:null});else uncertain=true
          update({error:autonomousError(error)})
        }
      })
    },
    decide(decision:"approved"|"rejected",consented=false){
      const detail=state.detail,pending=detail?.pending_effect
      if(state.pendingSubmit||!detail||detail.run.status!=="awaiting_approval"||!pending||!["approved","rejected"].includes(decision)||decision==="approved"&&!consented)return Promise.resolve()
      const request:Mutation=Object.freeze({kind:"decision",id:detail.run.id,decision,step:pending.step_key,hash:pending.input_sha256})
      return mutate(request)
    },
    cancel(){const id=state.detail?.run.id;if(!id||state.pendingSubmit||terminal.has(state.detail!.run.status))return Promise.resolve();return mutate(Object.freeze({kind:"cancel",id}))},
    retryMutation(){return state.pendingMutation?mutate(state.pendingMutation):Promise.resolve()},
  }
  function mutate(next:Mutation):Promise<void>{
    if(state.pendingMutation&&JSON.stringify(state.pendingMutation)!==JSON.stringify(next))return Promise.resolve()
    return perform(async()=>{
      const request=state.pendingMutation??next;update({pendingMutation:request})
      try{
        const result=checked(await(request.kind==="cancel"?api.cancelAutonomousAgentRun(request.id):api.decideAutonomousAgentNode(request.id,request.decision,request.step,request.hash)),request.id)
        if(closed)return
        const confirmed=request.kind==="cancel"?result.run.status==="cancelled":result.approvals.some(a=>a.step_key===request.step&&a.status===request.decision)
        if(!confirmed)throw Error("unconfirmed_autonomous_decision")
        ++ticket;uncertain=false;update({detail:result,pendingMutation:null,notice:request.kind==="cancel"?"任务已取消。":request.decision==="approved"?"已批准当前步骤。":"已拒绝当前步骤。"});if(active)await refresh()
      }catch(error){
        if(closed||expired(error))return
        if(!uncertain&&error instanceof PgNativePilotError&&definite.has(error.status))update({pendingMutation:null});else uncertain=true
        update({error:autonomousError(error)})
      }
    })
  }
}
