import {createPgNativeDurableRunSession} from "./pgNativeDurableRunSession.ts"
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
export function createPgNativeAutonomousAgentSession(api:Api,options:{key?:()=>string;onExpired?:()=>void}={}){
  return createPgNativeDurableRunSession<AutonomousDraft,PgNativeAutonomousAgentResult,PgNativeAutonomousAgentSummary>({
    list:()=>api.listAutonomousAgentRuns(),get:id=>api.getAutonomousAgentRun(id),
    submit:body=>api.submitAutonomousAgentRun(body.agentId,body.revision,body.instruction,body.key,body.maxSteps),
    decide:(...args)=>api.decideAutonomousAgentNode(...args),cancel:id=>api.cancelAutonomousAgentRun(id),
  },{...options,describe:autonomousError,submittedNotice:"多轮任务已提交，等待逐步审批。",
    freezeDraft(draft){
      const instruction=draft.instruction.trim()
      if(!uuid.test(draft.agentId)||!Number.isSafeInteger(draft.revision)||draft.revision<1||!instruction||instruction.length>1200||instruction.includes("\0")||
         !Number.isSafeInteger(draft.maxSteps)||draft.maxSteps<1||draft.maxSteps>5)throw Error("invalid_autonomous_draft")
      return {agentId:draft.agentId.toLowerCase(),revision:draft.revision,instruction,maxSteps:draft.maxSteps}
    },
    acceptDetail:result=>result.execution_mode==="agent_native_v2"&&result.run.kind==="agent"&&result.run.workflow_id===null&&uuid.test(result.run.agent_spec_id),
    acceptSubmit:(result,body)=>result.run.agent_spec_id===body.agentId&&result.run.instruction===body.instruction&&
      result.run.checkpoint.spec_revision===body.revision&&result.run.checkpoint.max_steps===body.maxSteps,
  })
}
