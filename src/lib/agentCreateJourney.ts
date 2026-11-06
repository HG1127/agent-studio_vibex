import type { AgentSpec } from "../pages/Home/presets"
import { evaluateAgentQualityChecks, normalizeAgentQualityChecks, hasExplicitCalendarTimestamp } from "./agentQualityChecks.ts"

/** Discard out-of-order async reads when users refresh or switch Agent drafts. */
export function createLatestRequestFence() {
  let generation = 0
  return {
    next: () => ++generation,
    isCurrent: (ticket:number) => ticket === generation,
    invalidate: () => { generation += 1 },
  }
}

/**
 * A manually named model on an enabled connection is not evidence of a
 * working provider. Only a real, successful owner-scoped API probe with a
 * recorded time can unlock the Agent creation wizard's "try" stage.
 *
 * This is an admission check, not a promise that the provider is online now;
 * the execution engine must re-authorize and handle provider failures.
 */
// A date-only or timezone-free string cannot establish *when* a provider
// probe or trial happened. Preserve PocketBase's space-separated UTC format.
const hasExplicitTimeAndZone=hasExplicitCalendarTimestamp

export function verifiedModelIdsFromConnection(item:unknown):string[] {
  if(!item || typeof item!=="object")return []
  const connection=item as Record<string,unknown>
  if(connection.enabled!==true || connection.status!=="ok")return []
  const checked=connection.last_checked_at
  // A success timestamp in the distant future is not evidence of a probe
  // that actually happened. Allow only a small amount of local clock skew.
  if(!hasExplicitTimeAndZone(checked) || checked.startsWith("0001-"))return []
  const checkedAt=Date.parse(checked)
  const now=Date.now()
  // Months-old success is historical status, not current admission evidence.
  // Re-test the saved connection instead of treating stale models as ready.
  const maxProbeAgeMs=30*24*60*60*1000
  if(!Number.isFinite(checkedAt) || checkedAt>now+5*60*1000 ||
      checkedAt<now-maxProbeAgeMs)return []
  if(!Array.isArray(connection.models))return []
  return [...new Set(connection.models.slice(0,300)
    .filter((id:unknown):id is string=>
      typeof id==="string" && id.trim().length>0 && id.length<=200 &&
      // A successful probe of " model " does not prove "model" works.
      // Never silently rewrite a provider's exact model identifier.
      id===id.trim() &&
      // Do not offer imported model IDs that the run selector rejects or
      // that could render as multi-line/invisible choices in the UI.
      !/[\u0000-\u001f\u007f]/.test(id))
    .map(id=>id.trim()))]
}
export function countVerifiedModelConnections(input:unknown):number {
  if(!Array.isArray(input))return 0
  return input.slice(0,200).reduce((count:number,item:unknown)=>
    count+verifiedModelIdsFromConnection(item).length,0)
}

/**
 * Check the exact currently verified owner-scoped model immediately before
 * starting a paid Agent run. Buttons and shortcuts use the same contract.
 */
export function isVerifiedRunModelSelection(value:unknown, options:unknown):boolean {
  if(typeof value!=="string" || !/^custom:[A-Za-z0-9]{15}:.{1,200}$/.test(value) ||
      value!==value.trim() || /[\u0000-\u001f\u007f]/.test(value) ||
      !Array.isArray(options))return false
  return options.some(item=>item && typeof item==="object" && item.value===value)
}

// The creation view must not synchronously parse/scan arbitrarily large
// provider outputs while checking release readiness. Detailed results remain
// available in Run Center; request a concise verified trial for publishing.
const MAX_PUBLISH_REVIEW_CHARS = 1_000_000
// Owner-scoped knowledge permissions must be checked against the exact ID
// that execution will use. Invisible or padded imported IDs are not valid
// authorization evidence, even if a corrupted inventory repeats them.
const validKnowledgeBindingId=(id:unknown):id is string=>
  typeof id==="string" && !!id.trim() && id.length<=100 &&
  id===id.trim() && !/[\u0000-\u001f\u007f]/.test(id)
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
    if(typeof specName!=="string" || !specName.trim())planIssues.push("请填写 Agent 名称")
    else if(/[\u0000-\u001f\u007f]/.test(specName))planIssues.push("Agent 名称包含不可显示字符，请修改后保存")
    else if(specName.length>120)planIssues.push("Agent 名称超过120字，请精简后保存")
    // Saved or imported Agent JSON is not guaranteed to satisfy the TS spec.
    // Malformed resource/plan fields must block trial with guidance, not crash
    // the entire wizard or silently drop a required permission check.
    // Imported plans can contain invisible controls that change the visible
    // meaning of a goal, step or acceptance criterion without user awareness.
    // Keep ordinary multiline prose (tab/newline/CR), reject non-display controls.
    const textPresent=(value:unknown)=>typeof value==="string" &&
      value.trim().length>0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    // One valid item must not hide an invalid imported step or acceptance
    // criterion. Reject mixed/blank lists instead of omitting requirements.
    // Apply the same ceilings as local draft recovery; direct imports and
    // unsaved editor state must not bypass them before permission admission.
    const listPresent=(value:unknown,maxItems=40,maxChars=1600)=>
      Array.isArray(value) && value.length>0 && value.length<=maxItems &&
      value.every((item:unknown)=>textPresent(item) && (item as string).length<=maxChars)
    if(!textPresent(spec.goal))planIssues.push("请说明 Agent 的明确目标")
    else if(spec.goal.length>6000)planIssues.push("Agent 目标超过长度限制，请精简")
    if(!textPresent(spec.task_scope))planIssues.push("请说明任务范围与边界")
    else if(spec.task_scope.length>6000)planIssues.push("任务范围超过长度限制，请精简")
    if(!listPresent(spec.deliverables))planIssues.push("请填写有效交付物（最多40项，每项1600字）")
    if(!listPresent(spec.task_plan))planIssues.push("请填写有效执行步骤（最多40项，每项1600字）")
    if(!listPresent(spec.done_criteria))planIssues.push("请填写有效完成标准（最多40项，每项1600字）")
    if((spec.require_approval!==undefined && typeof spec.require_approval!=="boolean") ||
        (spec.require_plan_review!==undefined && typeof spec.require_plan_review!=="boolean"))
      planIssues.push("审批或计划复核设置无效，请明确开启或关闭后保存")
    // Reject malformed or blank imported tool requirements instead of dropping
    // them and falsely claiming the Agent has every required permission.
    if(!Array.isArray(spec.tools) || spec.tools.length>32 ||
      // Do not verify a trimmed alias while later executing the original tool ID.
      // Imported IDs with surrounding whitespace/control characters cannot be
      // treated as proof that this exact tool was connected or authorized.
      spec.tools.some(t=>typeof t!=="string" || !t.trim() || t.length>180 ||
        t!==t.trim() || /[\u0000-\u001f\u007f]/.test(t))){
      resourceIssues.push("当前方案的工具清单无效，请检查并重新保存")
    }else if(spec.tools.length>0 && typeof toolStatusOf!=="function"){
      // A partially restored connection inventory is not proof of permission.
      // Show a repair action instead of crashing the creation experience.
      resourceIssues.push("无法核验工具连接与授权状态，请刷新工具资源列表后继续")
    }else{
      // A stale or disconnected owner-scoped inventory can throw while the
      // wizard renders. Treat lookup failure as unknown authorization, not
      // readiness, and keep the user on the repairable resource step.
      try {
        const unconnected=[...new Set(spec.tools.map(t=>t.trim()).filter(Boolean))]
          .filter(tool=>toolStatusOf(tool)!=="ready")
        if(unconnected.length)resourceIssues.push("以下工具尚未连接或授权："+unconnected.slice(0,5).join("、"))
      } catch {
        resourceIssues.push("工具授权状态读取失败，请刷新工具资源列表后重新验证")
      }
    }
    const kbIds=spec.knowledge_base_ids
    if(kbIds!==undefined && (!Array.isArray(kbIds) || kbIds.length>10 ||
        kbIds.some(id=>!validKnowledgeBindingId(id)))){
      resourceIssues.push("当前方案的知识库绑定格式无效，请重新选择")
    }else{
      // Owner-scoped KB listings are asynchronous and may be absent or
      // malformed. Never interpret a non-array/partial response as proof of
      // an imported Agent's required private knowledge access.
      if((kbIds||[]).length && (!Array.isArray(accessibleKnowledgeBaseIds) ||
          accessibleKnowledgeBaseIds.some(id=>!validKnowledgeBindingId(id)))){
        resourceIssues.push("无法核验当前账号的知识库访问权限，请刷新资源列表后继续")
      }else{
        const allowed=new Set(Array.isArray(accessibleKnowledgeBaseIds)
          ? accessibleKnowledgeBaseIds : [])
        const inaccessible=(kbIds||[]).filter(id=>!allowed.has(id))
        if(inaccessible.length)resourceIssues.push("部分关联知识库已失效或当前账号无权访问，请重新选择")
      }
    }
  }
  if(modelState==="unavailable")resourceIssues.push("模型连接状态暂时无法验证，请刷新后继续")
  else if(modelState==="loading")resourceIssues.push("正在检查模型连接与使用权限")
  else if(modelState!=="ready")resourceIssues.push("模型连接状态未知，请重新验证资源权限")
  else if(!Number.isSafeInteger(enabledModelCount) || enabledModelCount<1)resourceIssues.push("尚无已启用、测试成功且配置了模型的连接，请到资源中心完成连接测试")
  // A locally recovered or imported "saved" ID is not proof of a real
  // owner-scoped record. Reject invalid identities before paid trial admission.
  if(typeof savedId!=="string" || !/^[A-Za-z0-9_-]{1,60}$/.test(savedId))
    planIssues.push("Agent 保存记录标识无效，请重新保存到「我的 Agent」")
  else if(dirty)planIssues.push("当前方案有未保存的修改，请重新保存")
  // Reject unexecutable imported acceptance rules before a potentially paid
  // trial, not only after the user has run it and attempts to publish.
  const configuredChecks=spec?.quality_checks
  const checks=normalizeAgentQualityChecks(configuredChecks)
  const malformedQualityChecks=configuredChecks!==undefined &&
    (!Array.isArray(configuredChecks) || checks.length!==configuredChecks.length)
  if(malformedQualityChecks)
    planIssues.push("质量断言设置无效，请修正规则、保存方案后再试跑")
  const canTry=planIssues.length===0 && resourceIssues.length===0
  // A successful status alone is not a verifiable deliverable. Even when
  // quality checks are optional, require the owner-scoped detail's real output.
  const now=Date.now()
  const runAt=hasExplicitTimeAndZone(run?.created) ? Date.parse(run.created) : NaN
  // A future-dated imported run or local save is not proof of execution.
  // Tolerate a small discrepancy between browser and server clocks.
  const hasVerifiedRun=Boolean(canTry && run && run.spec_id===savedId &&
    run.status==="succeeded" && Number.isFinite(runAt) &&
    runAt<=now+5*60*1000 &&
    // A previous run from the prior saved revision must not pass, even when
    // both events occurred within the same one-second interval.
    Number.isFinite(lastSavedAt) && Number(lastSavedAt)>0 &&
    Number(lastSavedAt)<=now+5*60*1000 && runAt>=Number(lastSavedAt) &&
    typeof run.result==="string" && run.result.length<=MAX_PUBLISH_REVIEW_CHARS &&
     run.result.trim().length>0)
  // A completed run from another saved version is not current evidence.
  // Explain the blocked publish action instead of leaving a disabled button
  // with no actionable issue when no quality checks are configured.
  // A run belonging to a different Agent, or one still awaiting approval,
  // must not leave the publish button disabled without an actionable reason.
  if(canTry && !run)
    qualityIssues.push("当前 Agent 还没有试跑结果，请先执行一次并核对真实输出后再发布")
  if(canTry && run && run.spec_id!==savedId)
    qualityIssues.push("当前显示的试跑属于另一 Agent，请在本 Agent 保存后重新试跑")
  else if(canTry && run && run.spec_id===savedId && run.status!=="succeeded")
    qualityIssues.push(run.status==="failed"
      ? "本次 Agent 试跑失败，请查看运行详情、修复问题后重新试跑"
      : "当前 Agent 尚无成功试跑，请先完成审批和执行，再检查运行结果")
  if(canTry && run?.spec_id===savedId && run.status==="succeeded" &&
      !Number.isFinite(lastSavedAt))
    qualityIssues.push("无法确认当前 Agent 方案的保存时间，请重新保存并试跑")
  else if(canTry && run?.spec_id===savedId && run.status==="succeeded" &&
      Number.isFinite(lastSavedAt) && Number(lastSavedAt)<=0)
    qualityIssues.push("当前 Agent 方案缺少有效的保存时间，请重新保存并试跑")
  else if(canTry && run?.spec_id===savedId && run.status==="succeeded" &&
      Number.isFinite(runAt) && Number.isFinite(lastSavedAt) &&
      runAt<Number(lastSavedAt))
    qualityIssues.push("现有试跑早于当前方案保存版本，请重新试跑当前版本")
  else if(canTry && run?.spec_id===savedId && run.status==="succeeded" &&
      !Number.isFinite(runAt))
    qualityIssues.push("试跑时间无法识别，请检查运行详情后重新试跑")
  if(canTry && run?.spec_id===savedId && run.status==="succeeded" &&
      (runAt>now+5*60*1000 || (Number.isFinite(lastSavedAt) && Number(lastSavedAt)>now+5*60*1000)))
    qualityIssues.push("试跑或保存时间超出当前时间，请检查设备时钟并重新验证")
  if(canTry && run?.spec_id===savedId && run.status==="succeeded" &&
    (typeof run.result!=="string" || !run.result.trim()))
    qualityIssues.push("本次成功试跑缺少可核验的真实输出，请检查运行详情或重新试跑")
  if(canTry && run?.spec_id===savedId && run.status==="succeeded" &&
     typeof run.result==="string" && run.result.length>MAX_PUBLISH_REVIEW_CHARS)
    qualityIssues.push("试跑输出过长，当前页面无法安全核验；请到运行中心检查完整结果，并用精简摘要重新试跑后发布")
  let checksPassed=true
  // Older/imported specs can contain unsupported, blank, or excess checks.
  // Silently discarding one would let a failed acceptance rule approve publish.
  if(malformedQualityChecks){
    checksPassed=false
    qualityIssues.push("质量断言包含无效或超出上限的规则，请修正后保存并重新试跑")
  }
  // A malformed mixed rule set must not also tell the employee to pay for a
  // new trial: repair and save the rules first, then collect fresh evidence.
  if (checks.length>0 && !malformedQualityChecks){
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
