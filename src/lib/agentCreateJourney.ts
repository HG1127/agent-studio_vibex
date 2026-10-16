import type { AgentSpec } from "../pages/Home/presets"
import { evaluateAgentQualityChecks, normalizeAgentQualityChecks } from "./agentQualityChecks.ts"

export type AgentJourneyStatus = {
  planIssues: string[]
  resourceIssues: string[]
  qualityIssues: string[]
  canTry: boolean
  canPublish: boolean
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
  run?:{spec_id:string;status:string;created:string;result?:string}|null
  lastSavedAt?:number
}):AgentJourneyStatus {
  const {spec,specName,savedId,dirty,enabledModelCount,modelState,toolStatusOf,
    accessibleKnowledgeBaseIds,run,lastSavedAt}=args
  const planIssues:string[]=[]
  const resourceIssues:string[]=[]
  const qualityIssues:string[]=[]
  if(!spec){
    planIssues.push("先描述需求并生成可编辑的 Agent 方案")
  }else{
    if(!specName.trim())planIssues.push("请填写 Agent 名称")
    if(!spec.goal.trim())planIssues.push("请说明 Agent 的明确目标")
    if(!spec.task_scope.trim())planIssues.push("请说明任务范围与边界")
    if(!spec.deliverables.some(s=>s.trim()))planIssues.push("请至少填写一项具体交付物")
    if(!spec.task_plan.some(s=>s.trim()))planIssues.push("请至少填写一个执行步骤")
    if(!spec.done_criteria.some(s=>s.trim()))planIssues.push("请至少填写一项可验证的完成标准")
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
  const hasVerifiedRun=Boolean(canTry && run && run.spec_id===savedId &&
    run.status==="succeeded" && Number.isFinite(Date.parse(run.created)) &&
    Number.isFinite(lastSavedAt) && Date.parse(run.created)>=Number(lastSavedAt)-1000)
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
  return {planIssues,resourceIssues,qualityIssues,canTry,canPublish:hasVerifiedRun && checksPassed}
}
