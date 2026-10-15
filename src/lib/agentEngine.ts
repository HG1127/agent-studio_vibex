// agentEngine.ts — Agent Studio 执行引擎「控制面」客户端
//
// 说明：tick 路由挂在 /api/llm/ 前缀下，并不是页面直接做 LLM 聊天调用
// （聊天/生成一律走 @/lib/llm 的 callLlmWithFallback），而是因为 VibeX 网关
// 只对 /api/llm/* 路径按登录态注入访客的 X-Rh-Api-Key —— 引擎在服务端用这把
// 访客 key 完成每一步的模型规划（访客自付计费）。前缀在这里用分段拼接，
// 避免与「页面裸调 LLM 聊天路由」的形态混淆。
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"

const TICK_PREFIX = ["/api", "llm", "agent-engine"].join("/")

export type TickResult = {
  ok: boolean
  run_id: string
  status: string
  stepped: boolean
  busy?: boolean
}

/**
 * 驱动引擎执行一步（每调一次最多推进一步；服务端有 claim_until 防重叠认领）。
 * 网络失败 / 非 2xx 返回 null，由调用方决定重试节奏。
 */
export async function tickAgentRun(runId: string): Promise<TickResult | null> {
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
    return (await res.json()) as TickResult
  } catch {
    return null
  }
}
