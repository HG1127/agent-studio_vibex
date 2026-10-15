import { ChevronRight, History } from "lucide-react"
import type { RunStateKey } from "@/pages/AgentRun/useAgentRun"
import { formatRunDetailTime, type RecentRunRow } from "@/pages/RunDetail/useRunDetail"

type RecentRunsListProps = {
  items: RecentRunRow[]
  activeRunId: string
  stateMeta: Record<RunStateKey, { label: string; badge: string }>
  onSelect: (runId: string) => void
}

export function RecentRunsList({ items, activeRunId, stateMeta, onSelect }: RecentRunsListProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <History className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-card-foreground">最近的运行</h2>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          最近 {items.length} 次
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          还没有运行记录，去试跑页发起第一次运行后会出现在这里。
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((row) => {
            const meta = stateMeta[row.status] || stateMeta.failed
            const isActive = row.id === activeRunId
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-card-foreground">
                      {row.spec_name || "(方案已删除)"} · {row.instruction}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatRunDetailTime(row.created)} · {row.current_step}/{row.max_steps} 步 · {row.model}
                      {row.source === "acceptance_test" && " · 验收测试"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
