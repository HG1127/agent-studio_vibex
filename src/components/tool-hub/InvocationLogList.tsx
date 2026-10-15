import { ChevronDown, History, Loader2, RefreshCw } from "lucide-react"
import type { InvocationRow } from "@/pages/ToolHub/useToolHub"
import { formatInvocationTime } from "@/pages/ToolHub/useToolHub"

type InvocationLogListProps = {
  invocationList: InvocationRow[]
  isLoading: boolean
  invocationFilter: string
  applyInvocationFilter: (toolName: string) => void
  expandedInvocationId: string
  toggleInvocationRow: (rowId: string) => void
  sourceMeta: Record<string, { label: string; badge: string }>
  invStatusMeta: Record<string, { label: string; badge: string }>
  onRefresh: () => void
}

export function InvocationLogList(p: InvocationLogListProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 pb-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-card-foreground">调用记录</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {p.invocationFilter ? `已按工具过滤：${p.invocationFilter}` : "助手试跑、工作流与调试台的每次调用都留档，5 秒自动刷新"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {p.invocationFilter && (
            <button
              type="button"
              onClick={() => p.applyInvocationFilter(p.invocationFilter)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
            >
              清除过滤
            </button>
          )}
          <button
            type="button"
            onClick={p.onRefresh}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="刷新调用记录"
          >
            <RefreshCw className={`h-4 w-4 ${p.isLoading ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </header>
      {p.isLoading && p.invocationList.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          正在加载调用记录…
        </div>
      ) : p.invocationList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <History className="h-4 w-4" />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">还没有调用记录</p>
          <p className="mt-1 text-xs text-muted-foreground">在调试台试跑一次工具，或跑一次助手 / 工作流，记录会实时出现在这里</p>
        </div>
      ) : (
        <ul className="flex max-h-[32rem] flex-col gap-2 overflow-auto pr-1">
          {p.invocationList.map((row) => {
            const statusMeta = p.invStatusMeta[row.status] || { label: row.status, badge: "bg-muted text-muted-foreground" }
            const srcMeta = p.sourceMeta[row.source] || { label: row.source, badge: "bg-muted text-muted-foreground" }
            const isExpanded = p.expandedInvocationId === row.id
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => p.toggleInvocationRow(row.id)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-card-foreground">{row.tool_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.badge}`}>{statusMeta.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${srcMeta.badge}`}>{srcMeta.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {row.tool_kind === "external" ? "外部" : "内置"}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
                      {row.latency_ms} ms · {formatInvocationTime(row.created)}
                      <ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`} />
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                      {row.retried && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          <RefreshCw className="h-3 w-3" />
                          本次调用经历过自动重试
                        </span>
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">入参摘要</p>
                        <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-xs text-card-foreground">
                          {row.input_summary || "（无）"}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{row.status === "failed" ? "错误信息" : "输出摘录"}</p>
                        <pre
                          className={`mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg p-2 font-mono text-xs ${
                            row.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-card-foreground"
                          }`}
                        >
                          {row.status === "failed" ? row.error_code || row.output_excerpt || "（无）" : row.output_excerpt || "（无）"}
                        </pre>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            p.applyInvocationFilter(row.tool_name)
                          }}
                          className="rounded-full border border-border px-2.5 py-1 transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          只看 {row.tool_name}
                        </button>
                        {row.run_id && <span className="self-center font-mono">run: {row.run_id.slice(0, 12)}</span>}
                      </div>
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
