import { z } from "zod"

const count = z.number().finite().nonnegative()
const metrics = (keys: string[]) => z.object(Object.fromEntries(keys.map(key => [key, count])))
const runSchema = z.object({
  id: z.string().min(1), status: z.string(), created: z.string(),
  spec_name: z.string().optional(), workflow_name: z.string().optional(),
  workflow_id: z.string().optional(), source: z.string().optional(),
})
export const HARNESS_SOURCES = {
  worker: { label: "Worker 与队列", path: "/api/worker/status" },
  monitor: { label: "近期监控窗口", path: "/api/harness/monitor" },
  stats: { label: "本人全量累计", path: "/api/tool-hub/stats" },
  agents: { label: "Agent 最近历史", path: "/api/agent-runs/recent?limit=20" },
  workflows: { label: "Workflow 最近历史", path: "/api/workflow-runs/recent?limit=20" },
} as const
export type SourceKey = keyof typeof HARNESS_SOURCES
export type Run = { id: string; kind: "agent" | "workflow"; name: string; status: string; created: string; source?: string }
export type Metric = { label: string; value: number | string }
export type Snapshot = { metrics: Metric[]; note?: string; tools?: z.infer<typeof toolSchema>[]; runs?: Run[] }
const toolSchema = z.object({ tool_name: z.string(), calls: count, success: count, failed: count, retried: count, avg_latency_ms: count })
const labels: Record<string, string> = {
  agent_running: "Agent 运行中", workflow_running: "Workflow 运行中", awaiting_approval: "待审批", needs_review: "待人工核查",
  paused: "已暂停", failed_recent: "样本内失败", scheduled_active: "启用计划", scheduled_pending: "待调度批次",
  scheduled_overdue: "逾期计划（60 秒宽限）", ready_estimate: "估算就绪队列", inflight: "有效运行租约",
  expired_lease_candidates: "租约过期待诊断", unresolved_writes: "外部写入结果未确认",
  runs: "窗口运行数", succeeded: "成功", failed: "失败", cancelled: "已取消", success_rate: "成功率 %（成功 / 全部运行）",
  avg_steps: "平均步骤", avg_duration_ms: "平均创建至更新时间 ms", est_tokens_total: "估算 Token（非费用）",
  approvals: "审批次数", stuck_loops: "循环卡住", compressions: "压缩次数", truncations: "截断次数",
  run_count: "累计运行", agent_run_count: "累计 Agent", workflow_run_count: "累计 Workflow", invocation_count: "累计工具调用",
  success_count: "工具成功", failed_count: "工具失败", retried_count: "工具重试", external_invocation_count: "外部工具调用",
}
const queueKeys = ["agent_running", "workflow_running", "awaiting_approval", "needs_review", "paused", "failed_recent", "scheduled_active", "scheduled_pending", "scheduled_overdue", "ready_estimate", "inflight"]
const monitorKeys = ["runs", "succeeded", "failed", "cancelled", "success_rate", "avg_steps", "avg_duration_ms", "est_tokens_total", "approvals", "stuck_loops", "compressions", "truncations"]
const statsKeys = ["run_count", "agent_run_count", "workflow_run_count", "invocation_count", "success_count", "failed_count", "retried_count", "external_invocation_count"]
const toMetrics = (values: Record<string, number>): Metric[] => Object.entries(values).map(([key, value]) => ({ label: labels[key] || key, value }))

const workerComponent = z.object({
  state: z.enum(["healthy", "retrying", "unverified"]),
  failures: count, retry_at_ms: count,
})
const workerComponentValue = (state: string, valid: boolean): string =>
  !valid || state === "unverified" ? "未核验" :
    state === "retrying" ? "上次报告暂不可用" : "最近检查正常"

/** Fail closed on missing/malformed fields. An unavailable source is never a zero. */
export function adaptHarnessData(key: SourceKey, raw: unknown): Snapshot {
  z.object({ ok: z.literal(true) }).parse(raw)
  if (key === "worker") {
    const data = z.object({ enabled: z.boolean(), alive: z.boolean(), last_seen: z.string(), last_step_at: z.string(),
      components: z.object({ schedules: workerComponent, knowledge: workerComponent }).optional(),
      components_observed_at_ms: count.nullable().optional(),
      queue: metrics(queueKeys).extend({ sampled: z.boolean(), sample_limit_per_kind: count,
        expired_lease_candidates: count.optional(), unresolved_writes: count.optional() }),
    }).parse(raw)
    const { sampled, sample_limit_per_kind, ...queue } = data.queue
    const valid = data.enabled && data.alive && !!data.components_observed_at_ms
    return { metrics: [
      { label: "Worker（共享执行器）", value: !data.enabled ? "未启用" : data.alive ? "近期有心跳" : "未收到近期心跳" },
      { label: "最近心跳", value: data.last_seen || "尚无心跳" },
      { label: "最近步骤", value: data.last_step_at || "尚无记录" },
      { label: "定时调度最近报告", value: workerComponentValue(data.components?.schedules.state || "unverified", valid) },
      { label: "知识索引最近报告", value: workerComponentValue(data.components?.knowledge.state || "unverified", valid) },
      ...toMetrics(queue),
    ],
      note: `队列按本人最近更新的每类最多 ${sample_limit_per_kind} 条运行统计，${sampled ? "已截断" : "本次未截断"}。租约、人工核查、计划计数由服务端单独查询；就绪数为估算。180 秒内有心跳不等于进程实时存活；子系统状态来自最近一个 Worker 的受限报告。` }
  }
  if (key === "monitor") {
    const data = z.object({ totals: metrics(monitorKeys), tools: z.array(toolSchema).max(12) }).parse(raw)
    return { metrics: toMetrics(data.totals), tools: data.tools }
  }
  if (key === "stats") return { metrics: toMetrics(metrics(statsKeys).parse(raw)) }
  const data = z.object({ items: z.array(runSchema).max(20) }).parse(raw)
  return { metrics: [], runs: data.items.map(row => ({ id: row.id, kind: key === "agents" ? "agent" : "workflow",
    name: row.spec_name || row.workflow_name || row.id, status: row.status, created: row.created, source: row.source })) }
}

export function filterRuns(runs: Run[], kind: string, status: string): Run[] {
  return runs.filter(run => (kind === "all" || run.kind === kind) && (status === "all" || run.status === status))
    .sort((a, b) => b.created.localeCompare(a.created))
}
export function runDetailHref(run: Run): string | null {
  return run.kind === "agent" ? `/run-detail?run=${encodeURIComponent(run.id)}` : null
}
export const isHarnessAuthFailure = (status: number) => status === 401 || status === 412

export type SourceState = { data?: Snapshot; loadedAt?: number; loading: boolean; error?: string }
export function sourceFailure(previous: SourceState, error: string): SourceState {
  return { ...previous, loading: false, error }
}
