import { useState } from "react"
import { Cable, Play, PlugZap, RefreshCw, Trash2, XCircle } from "lucide-react"
import type { ConnectionRow } from "@/pages/PluginMarket/usePluginMarket"

type MyConnectionsBarProps = {
  connectionRows: ConnectionRow[]
  isConnectionsLoading: boolean
  busyConnectionId: string
  connectedCount: number
  onToggle: (row: ConnectionRow) => void
  onReprobe: (row: ConnectionRow) => void
  onDelete: (row: ConnectionRow) => void
  onTryInvoke: (row: ConnectionRow) => void
}

export function MyConnectionsBar({
  connectionRows,
  isConnectionsLoading,
  busyConnectionId,
  connectedCount,
  onToggle,
  onReprobe,
  onDelete,
  onTryInvoke,
}: MyConnectionsBarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState("")

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Cable className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-card-foreground">我的连接</h2>
            <p className="text-xs text-muted-foreground">已连接的插件工具会自动进入你所有助手的可调用工具集</p>
          </div>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          {connectedCount} 个启用中 / 共 {connectionRows.length} 个
        </span>
      </header>

      {isConnectionsLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">正在加载连接列表…</p>
      ) : connectionRows.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-border px-5 py-7 text-center">
          <PlugZap className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-card-foreground">还没有连接任何插件</p>
          <p className="mt-1 text-xs text-muted-foreground">去下方市场逛一逛，点卡片查看详情后即可一键连接</p>
        </div>
      ) : (
        <ul className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {connectionRows.map((row) => (
            <li
              key={row.id}
              className="flex h-full flex-col rounded-xl border border-border bg-background/60 p-4 transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-card-foreground">{row.title || row.server_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.url}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.enabled}
                  disabled={busyConnectionId === row.id}
                  onClick={() => onToggle(row)}
                  className={
                    row.enabled
                      ? "relative h-5 w-9 shrink-0 rounded-full bg-primary transition disabled:opacity-50"
                      : "relative h-5 w-9 shrink-0 rounded-full bg-muted transition disabled:opacity-50"
                  }
                >
                  <span
                    className={
                      row.enabled
                        ? "absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-primary-foreground shadow"
                        : "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow"
                    }
                  />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className={row.enabled ? "rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary" : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"}>
                  {row.enabled ? "已启用" : "已停用"}
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{row.tool_count} 个工具</span>
                {row.headers_count > 0 && <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">已配置 {row.headers_count} 项授权头</span>}
                {row.last_probe_status === "error" && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive" title={row.last_probe_msg}>
                    最近探测异常
                  </span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-1.5 pt-3">
                <button
                  type="button"
                  onClick={() => onTryInvoke(row)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Play className="h-3.5 w-3.5" />
                  试调
                </button>
                <button
                  type="button"
                  disabled={busyConnectionId === row.id}
                  onClick={() => onReprobe(row)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-card-foreground disabled:opacity-50"
                >
                  <RefreshCw className={busyConnectionId === row.id ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                  重探
                </button>
                {confirmDeleteId === row.id ? (
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busyConnectionId === row.id}
                      onClick={() => {
                        setConfirmDeleteId("")
                        void onDelete(row)
                      }}
                      className="rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      确认断开
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId("")} className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground">
                      取消
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(row.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    断开
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {connectionRows.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <XCircle className="h-3.5 w-3.5" />
          停用或断开后，助手运行将立即不再包含该插件的工具
        </p>
      )}
    </section>
  )
}
