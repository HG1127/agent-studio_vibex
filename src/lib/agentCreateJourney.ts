import type { AgentSpec } from "../pages/Home/presets"
import { evaluateAgentQualityChecks, normalizeAgentQualityChecks } from "./agentQualityChecks.ts"
import { agentRoleReadiness } from "./agentRoles.ts"
import { matchesAgentSpecSnapshot } from "./agentSpecRevision.ts"
import { evaluateComplexAgentAcceptance, type ComplexAgentAcceptance,
  type ComplexAgentProof } from "./complexAgentAcceptance.ts"

export type AgentJourneyStatus = {
  planIssues: string[]
  resourceIssues: string[]
  qualityIssues: string[]
  trialIssues: string[]
  trial: {state: string; label: string; detail: string; action: "save"|"retry"|"view"|"refresh"}
  canTry: boolean
  canPublish: boolean
  complexAcceptance: ComplexAgentAcceptance
}
// Content validation is independent from saved-state validation, so the wizard
// can validate once and save + advance without relaxing any readiness gate.
export function agentPlanContentIssues(spec:AgentSpec|null,name:string):string[]{
  if(!spec)return ["先描述需求并生成可编辑的 Agent 方案"]
  const issues=agentRoleReadiness(spec)
  if(!name.trim())issues.push("请填写 Agent 名称")
  if(!spec.goal.trim())issues.push("请说明 Agent 的明确目标")
  if(!spec.task_scope.trim())issues.push("请说明任务范围与边界")
  if(!spec.deliverables.some(s=>s.trim()))issues.push("请至少填写一项具体交付物")
  if(!spec.task_plan.some(s=>s.trim()))issues.push("请至少填写一个执行步骤")
  if(!spec.done_criteria.some(s=>s.trim()))issues.push("请至少填写一项可验证的完成标准")
  return issues
}
export function evaluateAgentJourney(args:{
  spec:AgentSpec|null
  specName:string
  savedId:string
  dirty:boolean
  enabledModelCount:number
  modelState:"loading"|"ready"|"unavailable"
  toolStatusOf:(name:string)=>"ready"|"pending"
  accessibleKnowledgeBaseIds:string[]
  run?:({spec_id:string;status:string;created:string;result?:string;spec_snapshot?:unknown} & ComplexAgentProof)|null
  capabilityIssues?:string[]
  lastSavedAt?:number
  runState?:"checking"|"ready"|"unavailable"
}):AgentJourneyStatus {
  const {spec,specName,savedId,dirty,enabledModelCount,modelState,toolStatusOf,
    accessibleKnowledgeBaseIds,run,lastSavedAt}=args
  const planIssues:string[]=[]
  const resourceIssues:string[]=[]
  const qualityIssues:string[]=[]
  planIssues.push(...agentPlanContentIssues(spec,specName))
  if(spec){
    resourceIssues.push(...(args.capabilityIssues||[]))
    const unconnected=[...new Set(spec.tools.map(t=>t.trim()).filter(Boolean))]
      .filter(tool=>toolStatusOf(tool)==="pending")
    if(unconnected.length)resourceIssues.push("以下工具尚未连接或授权："+unconnected.slice(0,5).join("、"))
    const allowed=new Set(accessibleKnowledgeBaseIds)
    const inaccessible=(spec.knowledge_base_ids||[]).filter(id=>!allowed.has(id))
    if(inaccessible.length)resourceIssues.push("部分关联知识库已失效或当前账号无权访问，请重新选择")
  }
  if(modelState==="unavailable")resourceIssues.push("模型连接状态暂时无法验证，请刷新后继续")
  else if(modelState==="loading")resourceIssues.push("正在检查模型连接与使用权限")
  else if(enabledModelCount===0)resourceIssues.push("尚无已启用且配置了模型的连接，请先到资源中心添加")
  if(!savedId)planIssues.push("请先把当前方案保存到「我的 Agent」")
  else if(dirty)planIssues.push("当前方案有未保存的修改，请重新保存")
  const canTry=planIssues.length===0 && resourceIssues.length===0
  // PocketBase uses UTC timestamps with a space; ISO offsets also represent
  // the same instant. Keep the existing one-second precision allowance, but
  // never use a timestamp alone as evidence of matching plan content.
  const created=run ? Date.parse(run.created.trim().replace(/^(\d{4}-\d{2}-\d{2}) /,"$1T")) : NaN
  const currentSnapshot=matchesAgentSpecSnapshot(spec,run?.spec_snapshot)
  const currentTime=Number.isFinite(created) && Number.isFinite(lastSavedAt) &&
    Number(lastSavedAt)>0 && created>=Number(lastSavedAt)-1000
  const hasVerifiedRun=Boolean(args.runState!=="checking" && args.runState!=="unavailable" &&
    run && run.spec_id===savedId && run.status==="succeeded" && currentTime && currentSnapshot)
  const checks=normalizeAgentQualityChecks(spec?.quality_checks)
  let checksPassed=true
  if (checks.length>0){
    if(!hasVerifiedRun || typeof run?.result !== "string"){
      checksPassed=false
      qualityIssues.push("配置了质量断言，需要获取本方案保存后的成功试跑真实结果")
    } else {
      const results=evaluateAgentQualityChecks(run.result,checks)
      const failures=results.filter(item=>!item.passed)
      if(failures.length){
        checksPassed=false
        qualityIssues.push(`${failures.length}/${checks.length} 条已配置的质量断言未通过，请修正 Agent 后重新试跑`)
      }
    }
  }
  const complexAcceptance=evaluateComplexAgentAcceptance(spec,hasVerifiedRun?run:null)
  if(hasVerifiedRun && complexAcceptance.applicable && !complexAcceptance.verified)
    qualityIssues.push(...complexAcceptance.issues.slice(0,8))
  const canPublish=canTry && hasVerifiedRun && checksPassed && complexAcceptance.verified
  let trial:AgentJourneyStatus["trial"]
  if(!savedId || dirty){
    trial={state:"unsaved",label:"当前方案尚未保存",detail:"先保存当前修改，再试跑保存后的方案；原运行记录仍保留。",action:"save"}
  }else if(args.runState==="unavailable"){
    trial={state:"unavailable",label:"试跑记录暂时无法核验",detail:"请刷新试跑记录，核验成功前不能继续发布。",action:"refresh"}
  }else if(args.runState==="checking"){
    trial={state:"checking",label:"正在核验试跑记录",detail:"正在读取当前 Agent 的运行快照与真实输出，请稍候。",action:"refresh"}
  }else if(!run || run.spec_id!==savedId){
    trial={state:"untried",label:"当前方案尚未试跑",detail:"请保存方案并完成一次真实试跑，再返回刷新结果。",action:"retry"}
  }else if(["queued","pending","running"].includes(run.status)){
    trial={state:"running",label:"试跑进行中",detail:"查看原运行的执行进度；运行使用启动时的冻结快照，完成后仍需核对当前方案。",action:"view"}
  }else if(["awaiting_approval","awaiting_input"].includes(run.status)){
    trial={state:"waiting",label:run.status==="awaiting_approval"?"等待人工审批":"等待方案确认／补充信息",detail:"前往原运行完成审批或补充输入，继续该运行后再刷新结果。",action:"view"}
  }else if(["failed","cancelled","aborted"].includes(run.status)){
    trial={state:"failed",label:run.status==="failed"?"最近试跑失败":"最近试跑已中止",detail:"查看原运行的原因，修正并保存方案后重新试跑。",action:"retry"}
  }else if(run.status!=="succeeded"){
    trial={state:"unknown",label:"运行状态尚无法确认",detail:"查看原运行并刷新记录，当前不能继续发布。",action:"view"}
  }else if(!run.spec_snapshot || typeof run.spec_snapshot!=="object" || Array.isArray(run.spec_snapshot) ||
    !["goal","task_scope","deliverables","tools","task_plan","done_criteria"].every(key=>
      Object.hasOwn(run.spec_snapshot as object,key))){
    trial={state:"unproven",label:"成功运行缺少可核验快照",detail:"无法证明这次成功对应当前方案，请重新试跑；原成功记录仍保留。",action:"retry"}
  }else if(!currentSnapshot){
    trial={state:"stale",label:"旧版本试跑成功，需重新试跑",detail:"目标、角色、能力或其他方案内容已与运行冻结快照不同，请试跑当前保存方案。",action:"retry"}
  }else if(!currentTime){
    trial={state:"unproven",label:"成功运行的版本时间无法核验",detail:"快照内容一致，但无法确认运行发生在本次保存后，请重新试跑。",action:"retry"}
  }else if(!checksPassed || !complexAcceptance.verified){
    trial={state:"quality_blocked",label:"运行成功，但复杂 Agent 的执行证据尚未验收",detail:"检查角色交接、必需工具调用、写入审批及结果质量；不能仅凭最终回答判定任务完成。",action:"view"}
  }else if(!canTry){
    trial={state:"blocked",label:"当前版本运行成功，前置检查待完成",detail:"先解决方案与资源检查提示，再继续发布前验收。运行成功不代表内容质量已验证。",action:"view"}
  }else{
    trial={state:"ready",label:"当前版本试跑成功，可进入验收",detail:"已核对完整冻结快照与保存时间；仍须人工核对结果、来源及完成标准。运行成功不代表内容质量已验证。",action:"view"}
  }
  const trialIssues=canPublish?[]:[trial.detail]
  return {planIssues,resourceIssues,qualityIssues,trialIssues,trial,canTry,canPublish,complexAcceptance}
}
