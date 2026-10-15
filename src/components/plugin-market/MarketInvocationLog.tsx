import { ChevronDown, ChevronRight, History, Loader2, RefreshCcw } from "lucide-react"
import type { MarketInvocationRow } from "@/pages/PluginMarket/usePluginMarket"
import { formatMarketTime } from "@/pages/PluginMarket/usePluginMarket"

type MarketInvocationLogProps = {
  invokeLog: MarketInvocationRow[]
  isLoadingLog: boolean
  expandedLogId: string
  onToggleRow: (rowId: string) => void
  invokeStatusMeta: Record<string, { label: string; badge: string }>
}

export function MarketInvocationLog({ invokeLog, isLoadingLog, expandedLogId, onToggleRow, invokeStatusMeta }: MarketInvocationLogProps) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <History className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-card-foreground">调用留档</h2>
            <p className="text-xs text-muted-foreground">最近 30 条市场插件调用（含助手运行中的真实调用）</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
          <RefreshCcw className="h-3 w-3 text-primary" />
          5 秒自动刷新
        </span>
      </header>

      {isLoadingLog ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          正在加载留档…
        </div>
      ) : invokeLog.length === 0 ? (
        <div className="mt-2 flex-1 rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <History className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-card-foreground">暂无调用记录</p>
          <p className="mt-1 text-xs text-muted-foreground">在左侧试调面板真实调用一次，或让助手在运行中使用市场插件工具，记录会自动出现在这里</p>
        </div>
      ) : (
        <ul className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
          {invokeLog.map((row) => {
            const meta = invokeStatusMeta[row.status] || { label: row.status, badge: "bg-muted text-muted-foreground" }
            const expanded = expandedLogId === row.id
            return (
              <li key={row.id} className="rounded-xl border border-border bg-background/60 transition hover:shadow-sm">
                <button
                  type="button"
                  onClick={() => onToggleRow(row.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-card-foreground">{row.tool_name}</span>
                  {row.retried && <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">重试</span>}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{row.latency_ms}ms</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{formatMarketTime(row.created)}</span>
                </button>
                {expanded && (
                  <div className="space-y-2 border-t border-border px-3 py-2.5">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">入参摘要</p>
                      <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary/60 p-2 font-mono text-xs text-secondary-foreground">
                        {row.input_summary || "（无）"}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{row.status === "failed" ? "错误信息" : "输出摘录"}</p>
                      <pre
                        className={
                          row.status === "failed"
                            ? "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-destructive/10 p-2 font-mono text-xs text-destructive"
                            : "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary/60 p-2 font-mono text-xs text-secondary-foreground"
                        }
                      >
                        {row.status === "failed" && row.error_code ? `[${row.error_code}] ` : ""}
                        {row.output_excerpt || "（无）"}
                      </pre>
                    </div>
                    <p className="text-xs text-muted-foreground sm:hidden">{formatMarketTime(row.created)}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
