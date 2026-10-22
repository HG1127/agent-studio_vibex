import type { AgentSpec } from "../pages/Home/presets"
import type { VerifiedMarketTool } from "./marketToolSelection"
import { projectAgentRoleProgress } from "./agentRoleProgress.ts"

type ApprovalRunSnapshot = {
  spec_snapshot?: AgentSpec | null
  checkpoint?: Record<string, unknown> | null
}

export type ApprovalPresentation = {
  approvalTitle: string
  toolLabel: string
  toolId: string
  toolSource: string
  toolAccess: string
  roleLabel: string
  nextRoleName: string
  warning: string
}

/**
 * Only exact catalog IDs and persisted run snapshots are used to explain an
 * approval. This is a display projection, never authorization or a risk waiver.
 */
export function projectAgentApprovalPresentation(
  toolId: string,
  run: ApprovalRunSnapshot | null,
  marketTools: readonly VerifiedMarketTool[] = [],
): ApprovalPresentation {
  const marketPlugin = toolId.startsWith("mkt__")
  const marketTool = marketPlugin ? marketTools.find(item => item.id === toolId) : undefined
  const roles = run ? projectAgentRoleProgress(run) : null
  const current = roles?.current
  const stageIndex = current ? roles.stages.findIndex(role => role.id === current.id) : -1
  const roleLabel = current && stageIndex >= 0
    ? `${current.name} · 第 ${stageIndex + 1} / ${roles.stages.length} 阶段` : ""
  const roleConfig = current ? run?.spec_snapshot?.roles?.find(role => role.id === current.id) : undefined
  const roleMismatch = Boolean(roleConfig && !roleConfig.tools.includes(toolId))

  return {
    approvalTitle: marketPlugin ? "将调用市场插件，需要你确认" : "将调用外部工具，需要你确认",
    toolLabel: marketTool?.label || toolId || "未能识别工具",
    toolId,
    toolSource: marketTool?.connectionTitle || (marketPlugin ? "市场插件 · 当前连接待核验" : "外部工具"),
    toolAccess: !marketPlugin ? "外部接口调用 · 读写权限以服务端策略为准" :
      !marketTool ? "未能核验插件当前权限声明，批准前应先确认工具和连接" :
      marketTool.destructive ? "插件声明可能包含破坏性操作 · 逐次审批" :
      marketTool.readOnly ? "插件声明只读 · 仍须逐次审批" :
      "插件可能操作或写入外部系统 · 逐次审批",
    roleLabel,
    nextRoleName: roles?.next?.name || "",
    warning: roleMismatch ? "当前角色的已保存工具清单不包含此工具，请先查看执行过程并核验授权。" : "",
  }
}
