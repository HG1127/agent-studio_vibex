import type {RunEventRow} from "../pages/AgentRun/useAgentRun.ts"

export type RecentRunActivity={
  label:string
  stepLabel:string
  roleName:string
}
/** Surface factual event metadata already in the owner-scoped run log.
 * An event does NOT prove that a process is currently healthy or finished.
 */
export function latestRunActivity(events:ReadonlyArray<RunEventRow>):RecentRunActivity|null{
  if(!events.length)return null
  const event=events[events.length-1]
  if(!event || !event.event_type)return null
  const labels:Record<string,string>={
    status:"状态已更新",thinking:"分析记录已保存",tool_call:"已记录工具调用",
    tool_result:"已记录工具结果",error:"执行异常已记录",
    context_compact:"已压缩历史上下文",approval_pending:"等待工具审批",
    approval:"审批决定已记录",input_pending:"等待用户补充",
    input_received:"用户补充已收到",observation:"观察记录已保存",
    memory_injected:"已引用长期记忆",memory_saved:"已保存长期记忆",
  }
  const phase=event.content?.role_phase
  const isRoleTransition=event.event_type==="status"&&
    (phase==="started"||phase==="completed")
  const rawName=event.content?.role_name
  const roleName=typeof rawName==="string"?rawName.trim().slice(0,56):""
  const step=Number(event.step_index)
  return {
    label:isRoleTransition
      ?phase==="completed"?"角色阶段已提交成果":"角色阶段开始"
      :labels[event.event_type]||"新运行事件已保存",
    stepLabel:Number.isInteger(step)&&step>0?"第 "+step+" 步":"准备阶段",
    roleName,
  }
}
