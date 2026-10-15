import { Activity, CheckCircle2, Gauge, RefreshCw, ShieldAlert, Timer, Zap } from "lucide-react"
import type { MonitorData } from "@/pages/ToolHub/useToolHub"

type HarnessMonitorProps = {
  monitorData: MonitorData | null
  monitorLoading: boolean
  onRefreshMonitor: () => void
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "0 毫秒"
  if (ms < 1000) return `${ms} 毫秒`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} 秒`
  return `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function HarnessMonitor({ monitorData, monitorLoading, onRefreshMonitor }: HarnessMonitorProps) {
  const totals = monitorData?.totals ?? null
  const tools = monitorData?.tools ?? []
  const maxCalls = tools.reduce((m, t) => Math.max(m, t.calls), 0)
  const isEmpty = !monitorLoading && (!totals || (totals.runs === 0 && tools.length === 0))

  const cards = totals
    ? [
        { icon: Activity, label: "总运行", value: String(totals.runs), hint: `成功 ${totals.succeeded} · 失败 ${totals.failed} · 取消 ${totals.cancelled}` },
        { icon: CheckCircle2, label: "成功率", value: `${totals.success_rate}%`, hint: "最近运行口径（各取 100 条）" },
        { icon: Gauge, label: "平均步数", value: String(totals.avg_steps), hint: "助手按步 · 工作流按节点" },
        { icon: Timer, label: "平均耗时", value: formatDuration(totals.avg_duration_ms), hint: "从发起到最后一次推进" },
        { icon: Zap, label: "估算 Token", value: formatTokens(totals.est_tokens_total), hint: `上下文压缩 ${totals.compressions} 次` },
        { icon: ShieldAlert, label: "审批次数", value: String(totals.approvals), hint: `卡死拦截 ${totals.stuck_loops} 次 · 截断 ${totals.truncations} 次` },
      ]
    : []

  return (
    <div className="mt-4 border-t border-border pt-4">
      <header className="flex min-h-10 shrink-0 items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-card-foreground">执行框架监控</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">最近运行与工具调用的性能聚合视角 · 手动刷新</p>
        </div>
        <button
          type="button"
          onClick={onRefreshMonitor}
          disabled={monitorLoading}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={monitorLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {monitorLoading ? "刷新中" : "刷新监控"}
        </button>
      </header>

      {monitorLoading && !monitorData && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center">
          <p className="text-sm font-medium text-card-foreground">还没有可聚合的运行数据</p>
          <p className="mt-1 text-xs text-muted-foreground">
            去「助手试跑」发起一次任务，或在上方调试台试跑一个工具，再回来点「刷新监控」
          </p>
        </div>
      )}

      {totals && !isEmpty && (
        <>
          <div className="mt-3 grid grid-cols-2 divide-border rounded-xl border border-border bg-background md:grid-cols-3 md:divide-x xl:grid-cols-6">
            {cards.map((card) => (
              <div key={card.label} className="px-3 py-2.5">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <card.icon className="h-3 w-3 shrink-0 text-primary" />
                  {card.label}
                </p>
                <p className="mt-0.5 text-lg font-bold tracking-tight text-card-foreground">{card.value}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={card.hint}>{card.hint}</p>
              </div>
            ))}
          </div>

          {tools.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border shadow-sm">
              <table className="w-full min-w-max text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">工具</th>
                    <th className="px-3 py-2 font-semibold">调用占比</th>
                    <th className="px-3 py-2 text-right font-semibold">调用</th>
                    <th className="px-3 py-2 text-right font-semibold">成功</th>
                    <th className="px-3 py-2 text-right font-semibold">失败</th>
                    <th className="px-3 py-2 text-right font-semibold">重试</th>
                    <th className="px-3 py-2 text-right font-semibold">平均耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool) => (
                    <tr key={tool.tool_name} className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/50">
                      <td className="max-w-44 truncate px-3 py-2 font-medium text-card-foreground" title={tool.tool_name}>
                        {tool.tool_name}
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-full min-w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${maxCalls > 0 ? Math.max(4, Math.round((tool.calls / maxCalls) * 100)) : 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-card-foreground">{tool.calls}</td>
                      <td className="px-3 py-2 text-right text-primary">{tool.success}</td>
                      <td className="px-3 py-2 text-right text-destructive">{tool.failed}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{tool.retried}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatDuration(tool.avg_latency_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-border bg-background px-4 py-5 text-center text-xs text-muted-foreground">
              最近 500 条调用留档里还没有工具明细
            </p>
          )}
        </>
      )}
    </div>
  )
}
