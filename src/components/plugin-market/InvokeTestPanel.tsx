import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Play, Timer } from "lucide-react"
import type { ConnectionRow, InvokeOutcome, MarketTool } from "@/pages/PluginMarket/usePluginMarket"

type InvokeTestPanelProps = {
  enabledConnections: ConnectionRow[]
  invokeConnId: string
  invokeConn: ConnectionRow | null
  invokeToolName: string
  invokeTool: MarketTool | null
  invokeArgsText: string
  setInvokeArgsText: (v: string) => void
  isInvoking: boolean
  invokeOutcome: InvokeOutcome
  onSelectConn: (connId: string) => void
  onSelectTool: (toolName: string) => void
  onRunInvoke: () => void
}

export function InvokeTestPanel({
  enabledConnections,
  invokeConnId,
  invokeConn,
  invokeToolName,
  invokeTool,
  invokeArgsText,
  setInvokeArgsText,
  isInvoking,
  invokeOutcome,
  onSelectConn,
  onSelectTool,
  onRunInvoke,
}: InvokeTestPanelProps) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FlaskConical className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-card-foreground">在线试调</h2>
          <p className="text-xs text-muted-foreground">选插件和工具，填参数，真实调用一次并自动留档</p>
        </div>
      </header>

      {enabledConnections.length === 0 ? (
        <div className="mt-2 flex-1 rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <Play className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-card-foreground">还没有可用的插件连接</p>
          <p className="mt-1 text-xs text-muted-foreground">先到市场连接一个远程插件（且保持启用），就能在这里真实试调它的工具</p>
        </div>
      ) : (
        <div className="mt-2 flex-1 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">选择插件连接</span>
            <select
              value={invokeConnId}
              onChange={(ev) => onSelectConn(ev.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">请选择…</option>
              {enabledConnections.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title || row.server_name}（{row.tool_count} 个工具）
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">选择工具</span>
            <select
              value={invokeToolName}
              onChange={(ev) => onSelectTool(ev.target.value)}
              disabled={!invokeConn || invokeConn.tools.length === 0}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {!invokeConn ? <option value="">先选择插件连接</option> : invokeConn.tools.length === 0 ? <option value="">该连接暂无工具快照，请先重探</option> : null}
              {(invokeConn?.tools || []).map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </select>
          </label>

          {invokeTool && (
            <div className="rounded-xl bg-secondary/60 px-3 py-2">
              {invokeTool.description && <p className="line-clamp-2 text-xs leading-relaxed text-secondary-foreground">{invokeTool.description}</p>}
              {invokeTool.args_hint && <p className="mt-1 font-mono text-xs text-muted-foreground">参数：{invokeTool.args_hint}</p>}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">参数（JSON 对象，已按工具参数结构预填示例）</span>
            <textarea
              value={invokeArgsText}
              onChange={(ev) => setInvokeArgsText(ev.target.value)}
              rows={6}
              spellCheck={false}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          <button
            type="button"
            disabled={!invokeConnId || !invokeToolName || isInvoking}
            onClick={onRunInvoke}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isInvoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isInvoking ? "正在真实调用…" : "真实调用"}
          </button>

          {invokeOutcome && (
            <div className={invokeOutcome.ok ? "rounded-xl border border-primary/30 bg-primary/5 p-3" : "rounded-xl border border-destructive/30 bg-destructive/10 p-3"}>
              <div className="flex flex-wrap items-center gap-2">
                {invokeOutcome.ok ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    调用成功
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    调用失败{invokeOutcome.error_code ? `（${invokeOutcome.error_code}）` : ""}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  <Timer className="h-3 w-3" />
                  {invokeOutcome.latency_ms} ms
                </span>
                {invokeOutcome.retried && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">网络失败已自动重试 1 次</span>}
              </div>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-card-foreground">
                {invokeOutcome.ok ? invokeOutcome.output : invokeOutcome.error}
              </pre>
              {!invokeOutcome.ok && /api key|authorization|bearer|401|403|404|token|auth|unauthorized/i.test(String(invokeOutcome.error || "")) && (
                <p className="mt-2 text-xs leading-relaxed text-card-foreground">
                  该插件的工具清单可以匿名拉取，但真实调用需要官方钥匙：到「我的连接」断开后重新连接，并在连接时于详情抽屉的「授权头配置」里填入 Authorization: Bearer 加钥匙。
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
