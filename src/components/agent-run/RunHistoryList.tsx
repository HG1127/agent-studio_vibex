import { ChevronRight, History, ScrollText } from "lucide-react"
import { Link } from "react-router-dom"
import type { AgentRunRow, RunStateKey } from "@/pages/AgentRun/useAgentRun"

type RunHistoryListProps = {
  runHistory: AgentRunRow[]
  onViewRun: (row: AgentRunRow) => void
  activeRunId: string
  isLoggedIn: boolean
  stateMeta: Record<RunStateKey, { label: string; badge: string }>
}

function formatRunTime(raw: string): string {
  const parsed = new Date(raw.replace(" ", "T"))
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function RunHistoryList({ runHistory, onViewRun, activeRunId, isLoggedIn, stateMeta }: RunHistoryListProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <History className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-card-foreground">历史运行记录</h2>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          共 {runHistory.length} 次
        </span>
      </div>

      {!isLoggedIn ? (
        <p className="mt-4 text-sm text-muted-foreground">登录账号后即可查看你的运行记录。</p>
      ) : runHistory.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          还没有运行记录，发起第一次试跑后会出现在这里。
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {runHistory.map((row) => {
            const meta = stateMeta[row.status]
            const isActive = row.id === activeRunId
            return (
              <li key={row.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => onViewRun(row)}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-card-foreground">
                      {row.spec_name} · {row.instruction}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatRunTime(row.created)} · {row.current_step}/{row.max_steps} 步 · {row.model}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <Link
                  to={`/run-detail?run=${encodeURIComponent(row.id)}`}
                  title="查看运行详情"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-primary shadow-sm transition hover:bg-primary/10 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">查看详情</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
