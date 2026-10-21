/** Evidence-only comparison between two persisted Agent executions.
 * No invented API costs or token counts: token estimate is character-based and
 * labelled, while time is only measured when two status events exist.
 */
export type ComparisonRun = {
  id:string
  spec_id:string
  created:string
  status:string
  spec_snapshot?:unknown
  evaluation?:{score:number;mode:"llm"|"rule";degraded?:boolean}|null
  feedback?:{rating:string;tags?:string[];comment?:string}|null
  checkpoint?:Record<string,unknown>|null
}
export type ComparisonEvent = {
  event_type:string
  created:string
  content?:Record<string,unknown>
}
export type Difference = {key:string;label:string;before:string;after:string}
const FIELDS:[string,string][]=[
  ["goal","核心目标"],
  ["task_scope","任务范围"],
  ["deliverables","交付物"],
  ["task_plan","任务步骤"],
  ["done_criteria","完成标准"],
  ["tools","工具授权"],
  ["knowledge_base_ids","知识库绑定"],
  ["require_plan_review","阶段方案审批"],
  ["require_approval","外部写入审批"],
]
function display(value:unknown):string{
  if(value===undefined||value===null||value==="")return "未设置"
  if(Array.isArray(value))return value.map(item=>String(item)).join(" · ")||"未设置"
  if(typeof value==="boolean")return value?"启用":"关闭"
  if(typeof value==="string")return value
  return JSON.stringify(value)
}
function equivalent(a:unknown,b:unknown):boolean{
  return JSON.stringify(a??null)===JSON.stringify(b??null)
}
function readCount(run:ComparisonRun,key:string):number|null{
  const stat=run.checkpoint?.harness_stats as Record<string,unknown>|undefined
  const value=stat?.[key]
  return typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null
}
export function runMetrics(run:ComparisonRun,events:ComparisonEvent[]){
  const toolResultCount=events.filter(item=>item.event_type==="tool_result").length
  const approvals=events.filter(item=>item.event_type==="approval").length
  const failures=events.filter(item=>item.event_type==="error").length
  const modelCalls=readCount(run,"llm_calls")
  const promptChars=readCount(run,"est_prompt_chars")
  const outChars=readCount(run,"est_out_chars")
  const estimatedChars=promptChars!==null&&outChars!==null?promptChars+outChars:null
  const statusEvents=events.filter(item=>item.event_type==="status")
  const first=statusEvents[0]?.created||""
  const last=statusEvents[statusEvents.length-1]?.created||""
  const start=Date.parse(first.replace(" ","T"))
  const end=Date.parse(last.replace(" ","T"))
  const durationSeconds=run.status!=="running"&&statusEvents.length>=2&&
    Number.isFinite(start)&&Number.isFinite(end)&&end>=start
    ?Math.round((end-start)/1000):null
  return {status:run.status,toolResultCount,approvals,failures,modelCalls,
    estimatedChars,durationSeconds}
}
export function buildRunComparison(before:ComparisonRun,after:ComparisonRun,
  beforeEvents:ComparisonEvent[],afterEvents:ComparisonEvent[]){
  if(!before?.id||!after?.id||before.id===after.id||
    before.spec_id!==after.spec_id)
    throw new Error("Run comparison requires two different runs of the same Agent")
  const a=before.spec_snapshot&&typeof before.spec_snapshot==="object"&&!Array.isArray(before.spec_snapshot)
    ?before.spec_snapshot as Record<string,unknown>:null
  const b=after.spec_snapshot&&typeof after.spec_snapshot==="object"&&!Array.isArray(after.spec_snapshot)
    ?after.spec_snapshot as Record<string,unknown>:null
  const hasSnapshots=Boolean(a&&b)
  const changes:Difference[]=hasSnapshots?FIELDS.filter(([key])=>!equivalent(a?.[key],b?.[key]))
    .map(([key,label])=>({key,label,before:display(a?.[key]),after:display(b?.[key])})):[]
  const earlier=runMetrics(before,beforeEvents)
  const later=runMetrics(after,afterEvents)
  const beforeScore=before.evaluation&&Number.isFinite(before.evaluation.score)?before.evaluation.score:null
  const afterScore=after.evaluation&&Number.isFinite(after.evaluation.score)?after.evaluation.score:null
  const scoreDifference=beforeScore!==null&&afterScore!==null?afterScore-beforeScore:null
  return {hasSnapshots,changes,earlier,later,
    beforeScore,afterScore,scoreDifference,
    beforeScoreMode:before.evaluation?.mode||null,
    afterScoreMode:after.evaluation?.mode||null,
    feedback:before.feedback||null}
}
