import {createPgNativeDurableRunSession,emptyDurableRunView,type DurableRunView} from "./pgNativeDurableRunSession.ts"
import {verifyOwnTaskRun} from "./pgNativeOwnTaskNavigation.ts"
import {declaredAgentHttpTool,readyAgentHttpTools} from "./pgNativeAgentHttpTools.ts"
import {declaredAgentMcpTool,readyAgentMcpTools} from "./pgNativeMcpConnection.ts"
import {optionalKnowledgeToolContext,knowledgeBindingCurrent,knowledgePendingMatches,knowledgeToolScopeCurrent,usesPaidKnowledge,type KnowledgeToolContext} from "./pgNativeKnowledgeTool.ts"
import type {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT} from "../../services/pg-api/src/knowledge-retrieval-binding.ts"
// One employee-view lifetime. No storage, timers, credentials or provider calls.
import {PgNativePilotError,type PgNativeAutonomousAgentResult,type PgNativeAutonomousAgentSummary,type PgNativeAgent,type PgNativeModelConnection,
  type PgNativeWorkflowV2Pending,type PgNativeToolConnection,type PgNativeMcpConnection,type PgNativeAgentModelBinding} from "./pgNativePilotApi.ts"
type Api={
  submitAutonomousAgentRun(id:string,revision:number,instruction:string,key:string,max:number,requirePlanReview?:boolean,rememberOutcome?:boolean):Promise<PgNativeAutonomousAgentResult>
  listAutonomousAgentRuns():Promise<PgNativeAutonomousAgentSummary[]>
  getAutonomousAgentRun(id:string):Promise<PgNativeAutonomousAgentResult>
  decideAutonomousAgentNode(id:string,decision:"approved"|"rejected",step:string,hash:string,charge?:typeof KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT):Promise<PgNativeAutonomousAgentResult>
  cancelAutonomousAgentRun(id:string):Promise<PgNativeAutonomousAgentResult>
}&Partial<Pick<ReturnType<typeof import("./pgNativePilotApi.ts").createPgNativePilotApi>,"getAgent"|"getConfigCapabilities"|"getKnowledgeEmbeddingConsent"|"listKnowledge"|"listSharedKnowledge"|"respondAutonomousAgent"|"confirmAutonomousAgentResponse">>
export type AutonomousDraft={agentId:string;revision:number;instruction:string;maxSteps:number;requirePlanReview?:boolean;rememberOutcome?:boolean}
export type AutonomousDetail=PgNativeAutonomousAgentResult&{knowledge?:KnowledgeToolContext}
export type AutonomousView=DurableRunView<AutonomousDetail,PgNativeAutonomousAgentSummary,AutonomousDraft>
export const emptyAutonomousView:AutonomousView=emptyDurableRunView()
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
export function autonomousModelBinding(detail:AutonomousDetail|null,agent:PgNativeAgent|undefined):PgNativeAgentModelBinding|undefined{
  const checkpoint=detail?.run.checkpoint
  if(!checkpoint||!Object.hasOwn(checkpoint,"selected_model_binding"))return agent?.spec.model_binding
  const raw=checkpoint.selected_model_binding
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return undefined
  const binding=raw as Record<string,unknown>
  if(Object.keys(binding).length!==3||!uuid.test(String(binding.connection_id))||!Number.isSafeInteger(binding.connection_revision)||Number(binding.connection_revision)<1||
    typeof binding.model_id!=="string"||!/^[A-Za-z0-9._:/-]{1,120}$/.test(binding.model_id))return undefined
  return {connection_id:String(binding.connection_id).toLowerCase(),connection_revision:Number(binding.connection_revision),model_id:binding.model_id}
}
export function readyAutonomousRunModel(detail:AutonomousDetail|null,agent:PgNativeAgent|undefined,connections:PgNativeModelConnection[]){
  const binding=autonomousModelBinding(detail,agent)
  return agent&&binding?readyAutonomousModel({...agent,spec:{...agent.spec,model_binding:binding}},connections):undefined
}
export function autonomousApprovalReady(detail:AutonomousDetail|null,agents:PgNativeAgent[],connections:PgNativeModelConnection[],tools:PgNativeToolConnection[]=[],mcps:PgNativeMcpConnection[]=[],mcpEnabled=false){
  const agent=agents.find(a=>a.id===detail?.run.agent_spec_id),model=readyAutonomousRunModel(detail,agent,connections),selected=autonomousModelBinding(detail,agent),pending=detail?.pending_effect
  if(detail?.knowledge_outputs_available===false)return false
  if(!agent||!model||!readyAgentHttpTools(agent,tools)||!readyAgentMcpTools(agent,mcps)||agent.spec.mcp_tools?.length&&!mcpEnabled||detail?.run.status!=="awaiting_approval"||detail.run.checkpoint.spec_revision!==agent.revision||!pending)return false
  if(agent.spec.knowledge_retrieval&&(!knowledgeBindingCurrent(agent.spec.knowledge_retrieval,detail.knowledge)||!knowledgeToolScopeCurrent(agent.spec.knowledge_base_ids??[],detail.knowledge)))return false
  const binding=pending.configuration.model_binding as Record<string,unknown>|undefined
  if(binding&&(binding.connection_id!==model.id||binding.connection_revision!==model.revision||binding.model_id!==selected?.model_id))return false
  if(pending.kind==="agent"){
    const ref=pending.configuration.agent_binding as Record<string,unknown>|undefined
    if(ref?.spec_id!==agent.id||ref.spec_revision!==agent.revision||pending.configuration.max_steps!==detail.run.checkpoint.max_steps)return false
  }else if(pending.kind==="model"&&!binding)return false
  else if(pending.kind==="tool"){
    if(pending.configuration.tool==="knowledge_search"&&!knowledgePendingMatches(pending,agent.spec.knowledge_retrieval,agent.spec.knowledge_base_ids??[]))return false
    const http=pending.configuration.tool_binding
    const mcp=pending.configuration.mcp_binding
    if(mcp?pending.configuration.tool!==undefined||Boolean(http)||!declaredAgentMcpTool(agent,mcp):http?pending.configuration.tool!==undefined||!declaredAgentHttpTool(agent,http):
      !agent.spec.tools?.includes(String(pending.configuration.tool))||pending.configuration.tool==="summarize"&&!binding)return false
  }
  return pending.missing.length===0
}
export function autonomousReview(pending:PgNativeWorkflowV2Pending,knowledge?:KnowledgeToolContext){
  if(pending.kind==="agent")return {title:"启动 Agent",text:pending.input,charged:false}
  if(usesPaidKnowledge(pending)){
    const query=(parseJson(pending.input) as {query?:unknown})?.query,ids=Array.isArray(pending.configuration.knowledge_base_ids)?pending.configuration.knowledge_base_ids:[]
    return {title:"语义知识库检索",text:"查询："+(typeof query==="string"?query:"查询内容需重新核对")+"\n方式："+
      ((pending.configuration.knowledge_retrieval as {mode?:string})?.mode==="hybrid"?"混合检索":"语义检索")+"\n知识库范围："+
      ids.map(id=>knowledge?.bases?.find(base=>base.id===id)?.name??"不可用知识库（"+String(id)+"）").join("、"),charged:true}
  }
  if(pending.kind==="tool")return {title:pending.configuration.mcp_binding?"MCP 工具操作":pending.configuration.tool_binding?"HTTP 工具操作":"工具操作",
    text:JSON.stringify({tool:(pending.configuration.mcp_binding as {tool_name?:string}|undefined)?.tool_name??pending.configuration.tool??pending.configuration.title,parameters:parseJson(pending.input)},null,2),charged:pending.configuration.tool==="summarize"}
  const input=parseJson(pending.input) as {task?:unknown;round?:unknown;history?:unknown[]}
  // Model planning is not shown as a transcript. Only task and observation count.
  return {title:"模型调用",text:typeof input?.task==="string"?input.task:"按当前任务、角色配置和已有工具结果生成下一步操作。",charged:true}
}
function parseJson(value:string):unknown{try{return JSON.parse(value)}catch{return value}}
export function createPgNativeAutonomousAgentSession(api:Api,options:{key?:()=>string;responseKey?:()=>string;onExpired?:()=>void}={}){
  return createPgNativeDurableRunSession<AutonomousDraft,AutonomousDetail,PgNativeAutonomousAgentSummary>({
    list:()=>api.listAutonomousAgentRuns(),get:async id=>{
      const detail=await api.getAutonomousAgentRun(id)
      if(!detail.pending_effect||detail.run.status!=="awaiting_approval")return detail
      const agent=api.getAgent?await api.getAgent(detail.run.agent_spec_id).catch(error=>{if(error instanceof PgNativePilotError&&error.status===401)throw error;return undefined}):undefined
      if(!agent?.spec.knowledge_retrieval&&!usesPaidKnowledge(detail.pending_effect))return detail
      const knowledge=api.getConfigCapabilities&&api.getKnowledgeEmbeddingConsent&&api.listKnowledge&&api.listSharedKnowledge?await optionalKnowledgeToolContext({getConfigCapabilities:api.getConfigCapabilities,getKnowledgeEmbeddingConsent:api.getKnowledgeEmbeddingConsent,listKnowledge:api.listKnowledge,listSharedKnowledge:api.listSharedKnowledge}):{enabled:false,consent:null}
      return {...detail,knowledge}
    },
    submit:body=>body.rememberOutcome!==undefined?api.submitAutonomousAgentRun(body.agentId,body.revision,body.instruction,body.key,body.maxSteps,body.requirePlanReview,body.rememberOutcome):body.requirePlanReview===undefined?api.submitAutonomousAgentRun(body.agentId,body.revision,body.instruction,body.key,body.maxSteps):api.submitAutonomousAgentRun(body.agentId,body.revision,body.instruction,body.key,body.maxSteps,body.requirePlanReview),
    decide:(...args)=>api.decideAutonomousAgentNode(...args),cancel:id=>api.cancelAutonomousAgentRun(id),
    ...(api.respondAutonomousAgent?{respond:(id,choice)=>api.respondAutonomousAgent!(id,choice)}:{}),
    ...(api.confirmAutonomousAgentResponse?{confirmHumanResponse:(id,choice)=>api.confirmAutonomousAgentResponse!(id,choice)}:{}),
  },{...options,describe:autonomousError,submittedNotice:"多轮任务已提交，等待逐步审批。",
    validateOriginal:async(target,detail)=>{if(target.kind!=="agent_autonomous")throw Error("original_task_kind_changed");await verifyOwnTaskRun(api,target,detail)},
    canApprove:detail=>!usesPaidKnowledge(detail.pending_effect)||knowledgeBindingCurrent(detail.pending_effect?.configuration.knowledge_retrieval,detail.knowledge)&&
      knowledgeToolScopeCurrent((detail.pending_effect?.configuration.knowledge_base_ids??[]) as string[],detail.knowledge),
    freezeDraft(draft){
      const instruction=draft.instruction.trim()
      if(!uuid.test(draft.agentId)||!Number.isSafeInteger(draft.revision)||draft.revision<1||!instruction||instruction.length>2000||instruction.includes("\0")||
         !Number.isSafeInteger(draft.maxSteps)||draft.maxSteps<1||draft.maxSteps>30)throw Error("invalid_autonomous_draft")
      if(draft.requirePlanReview!==undefined&&typeof draft.requirePlanReview!=="boolean")throw Error("invalid_agent_plan_review")
      if(draft.rememberOutcome!==undefined&&typeof draft.rememberOutcome!=="boolean")throw Error("invalid_agent_memory_outcome_choice")
      return {agentId:draft.agentId.toLowerCase(),revision:draft.revision,instruction,maxSteps:draft.maxSteps,...(draft.requirePlanReview!==undefined?{requirePlanReview:draft.requirePlanReview}:{}),...(draft.rememberOutcome!==undefined?{rememberOutcome:draft.rememberOutcome}:{})}
    },
    acceptDetail:result=>result.execution_mode==="agent_native_v2"&&result.run.kind==="agent"&&result.run.workflow_id===null&&uuid.test(result.run.agent_spec_id),
    acceptSubmit:(result,body)=>result.run.agent_spec_id===body.agentId&&result.run.instruction===body.instruction&&
      result.run.checkpoint.spec_revision===body.revision&&result.run.checkpoint.max_steps===body.maxSteps&&result.run.checkpoint.require_plan_review===body.requirePlanReview&&Boolean(result.outcome_memory?.enabled)===(body.rememberOutcome===true),
  })
}
