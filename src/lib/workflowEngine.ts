// workflowEngine.ts — 工作流画布「控制面」客户端
//
// tick 路由挂在 /api/llm/ 前缀下：VibeX 网关只对该前缀按登录态注入访客的
// X-Rh-Api-Key（访客自付计费），工作流引擎在服务端用这把 key 完成模型节点调用。
// 前缀分段拼接，避免与页面裸调 LLM 聊天路由的形态混淆（同 agentEngine.ts 纪律）。
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"

const TICK_PREFIX = ["/api", "llm", "workflow-engine"].join("/")

export type WorkflowTickResult = {
  ok: boolean
  run_id: string
  status: string
  stepped: boolean
  node_id?: string
  busy?: boolean
}

/**
 * 驱动工作流引擎执行一个节点（服务端 claim_until 防重叠）。
 * 网络失败 / 非 2xx 返回 null，由调用方决定重试节奏。
 */
export async function tickWorkflowRun(runId: string): Promise<WorkflowTickResult | null> {
  try {
    const res = await fetch(
      `${getPocketBaseUrl()}${TICK_PREFIX}/${encodeURIComponent(runId)}/tick`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
        body: "{}",
      },
    )
    if (!res.ok) return null
    return (await res.json()) as WorkflowTickResult
  } catch {
    return null
  }
}
