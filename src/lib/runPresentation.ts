/** Shared run display data only. No React hooks, backend selection, PB/PG
 * clients, session state, browser storage or network/worker imports. */
export type RunStateKey = "queued" | "running" | "paused" | "awaiting_approval" | "awaiting_input" | "succeeded" | "failed" | "cancelled"

export type BuiltinTool = { id: string; title: string; desc: string }

export const FEEDBACK_TAGS = ["结果不准", "太慢", "理解偏差", "格式差", "其他"]

export const BUILTIN_TOOLS: BuiltinTool[] = [
  { id: "calculate", title: "计算器", desc: "对算术表达式真实求值，支持 + - * / % 与括号" },
  { id: "summarize", title: "文本整理摘要", desc: "调用模型对给定文本做整理、摘要与提炼" },
  { id: "knowledge_search", title: "知识库检索", desc: "在方案附带的知识文本中按关键词检索相关片段" },
]

export const RUN_STATE_META: Record<RunStateKey, { label: string; badge: string }> = {
  queued: { label: "排队中", badge: "bg-muted text-muted-foreground" },
  running: { label: "运行中", badge: "bg-primary/10 text-primary" },
  paused: { label: "已暂停", badge: "bg-muted text-muted-foreground" },
  awaiting_approval: { label: "待批准", badge: "bg-primary/10 text-primary" },
  awaiting_input: { label: "等待本人回复", badge: "bg-primary/10 text-primary" },
  succeeded: { label: "已完成", badge: "bg-primary/10 text-primary" },
  failed: { label: "失败", badge: "bg-destructive/10 text-destructive" },
  cancelled: { label: "已取消", badge: "bg-destructive/10 text-destructive" },
}

export function formatRunDetailTime(raw: string): string {
  if (!raw) return ""
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T")
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
