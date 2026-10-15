import { ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw, ScrollText } from "lucide-react"
import { Link } from "react-router-dom"
import type { InvocationItem } from "@/pages/Integrate/useIntegrate"
import { formatInvocationTime, formatLatency } from "@/pages/Integrate/useIntegrate"

type InvocationLogListProps = {
  invocationList: InvocationItem[]
  isLoadingInvocations: boolean
  sourceFilter: string
  applySourceFilter: (source: string) => void
  expandedInvocationId: string
  toggleInvocationRow: (rowId: string) => void
  invSourceMeta: Record<string, { label: string; badge: string }>
  invStatusMeta: Record<string, { label: string; badge: string }>
  onRefresh: () => void
}

export function InvocationLogList({
  invocationList,
  isLoadingInvocations,
  sourceFilter,
  applySourceFilter,
  expandedInvocationId,
  toggleInvocationRow,
  invSourceMeta,
  invStatusMeta,
  onRefresh,
}: InvocationLogListProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <ScrollText className="h-4 w-4 text-primary" />
            集成调用留档
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">嵌入与 API 的每次调用都在此留档，5 秒自动刷新</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {isLoadingInvocations && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-card-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        {[
          { id: "embed", label: "网页嵌入" },
          { id: "api", label: "API 钥匙" },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => applySourceFilter(opt.id)}
            className={
              sourceFilter === opt.id
                ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-primary"
                : "rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
            }
          >
            {opt.label}
          </button>
        ))}
        {sourceFilter && (
          <button
            type="button"
            onClick={() => applySourceFilter(sourceFilter)}
            className="rounded-full px-2 py-1 text-xs text-muted-foreground transition hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            清除过滤
          </button>
        )}
      </div>

      {invocationList.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-border bg-secondary/50 p-6 text-center text-xs leading-relaxed text-muted-foreground">
          还没有集成调用记录。把嵌入代码贴到你的网页、或用 API 钥匙发起一次调用，记录会实时出现在这里。
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {invocationList.map((row) => {
            const expanded = expandedInvocationId === row.id
            const srcMeta = invSourceMeta[row.source] || { label: row.source || "未知", badge: "bg-muted text-muted-foreground" }
            const stMeta = invStatusMeta[row.status] || { label: row.status, badge: "bg-muted text-muted-foreground" }
            return (
              <li key={row.id} className="rounded-2xl border border-border bg-background shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleInvocationRow(row.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-card-foreground">
                      {row.input_summary || "（无指令摘要）"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatInvocationTime(row.created)} · {row.token_name || "未知凭证"} · 耗时 {formatLatency(row.latency_ms)}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${srcMeta.badge}`}>{srcMeta.label}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${stMeta.badge}`}>{stMeta.label}</span>
                </button>
                {expanded && (
                  <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                    <span className="font-mono break-all">run_id: {row.run_id || "—"}</span>
                    <span className="font-mono break-all">token_id: {row.token_id || "—"}</span>
                    {row.error_code && <span className="text-destructive">error_code: {row.error_code}</span>}
                    {row.run_id && (
                      <Link
                        to={`/run-detail?run=${encodeURIComponent(row.run_id)}`}
                        className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 font-medium text-card-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        查看完整运行档案
                      </Link>
                    )}
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
