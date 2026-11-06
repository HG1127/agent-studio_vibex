/** Task-first run guidance. These hints never override the server's real
 * readiness/approval checks or assert that a run passed quality validation. */
export type RunGuideInput={
  hasAgent:boolean
  hasModel:boolean
  resourcesLoading:boolean
  readinessIssues:readonly string[]
  hasTask:boolean
  canStart:boolean
  isStarting?:boolean
  status?:string
}
export type RunGuideAction="create"|"connect-model"|"configure"|"focus-task"|"focus-run"|"respond"|"results"|"trace"|"wait"
export type RunGuideResult={action:RunGuideAction;title:string;detail:string;label:string;steps:readonly boolean[]}
export function getRunGuidance(input:RunGuideInput):RunGuideResult {
  const steps=[input.hasAgent,input.hasAgent&&input.hasModel&&!input.resourcesLoading&&input.readinessIssues.length===0,
    input.hasTask,Boolean(input.status)]
  const make=(action:RunGuideAction,title:string,detail:string,label:string):RunGuideResult=>({action,title,detail,label,steps})
  // Ongoing work and human-gated tasks take priority over new-run setup.
  if(input.isStarting)return make("wait","正在提交任务",
    "请求尚未收到最终确认，请勿重复启动可能产生费用的调用。","提交中…")
  if(input.status==="awaiting_approval"||input.status==="awaiting_input")
    return make("respond","正在等待人工处理",
      input.status==="awaiting_approval"?"待批准的工具操作尚未完成，不会自动继续。":"请回答任务问题或确认阶段方案，再继续执行。","处理当前待办")
  if(input.status==="queued"||input.status==="running"||input.status==="paused")
    return make("trace","当前任务正在进行",
      input.status==="paused"?"任务已暂停，可以查看保存的执行过程。":"查看真实进度和工具调用，等待需要你确认的步骤。","查看执行过程")
  if(input.status==="failed"||input.status==="cancelled")
    return make("trace","本次任务尚未完成","先查看失败或停止原因，再决定是否重新试跑。","定位停止原因")
  if(input.status==="succeeded")
    return make("results","本次任务已完成执行","请查看交付成果与验收条件。运行成功不代表内容已通过质量验收。","检查交付与验收")
  if(!input.hasAgent)return make("create","先建立并保存 Agent","需要使用一份已保存的 Agent 方案，才能明确本次任务和权限。","设计 Agent")
  if(!input.hasModel)return make("connect-model","当前没有可用运行模型","连接或启用员工账号下的运行模型，然后返回试跑。","连接运行模型")
  if(input.resourcesLoading)return make("configure","正在核验资源与权限","资源检查完成前不会启用运行按钮。","查看资源")
  if(input.readinessIssues.length)
    return make("configure",`有 ${input.readinessIssues.length} 项运行前条件待补齐`,
      input.readinessIssues[0]||"请检查必需的角色、Skill 与工具授权。","查看并解决缺口")
  if(!input.hasTask)return make("focus-task","填写本次任务","写清目标、交付内容和限制条件，再提交真实执行。","填写任务")
  if(input.canStart)return make("focus-run","已具备试跑条件","确认任务内容及服务商费用后，可点击运行；完成后仍需验收。","前往运行")
  return make("configure","请检查本次试跑设置","模型调用上限、人工确认或其他运行条件可能阻止启动。","检查本次设置")
}
