import { ExternalLink, Loader2, Plug, Play } from "lucide-react"
import { Link } from "react-router-dom"
import type { ActiveDebugTarget, ExternalToolRow } from "@/pages/ToolHub/useToolHub"

type ExternalToolListProps = {
  tools: ExternalToolRow[]
  isLoading: boolean
  activeTarget: ActiveDebugTarget
  onDebug: (row: ExternalToolRow) => void
}

export function ExternalToolList({ tools, isLoading, activeTarget, onDebug }: ExternalToolListProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 pb-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-card-foreground">已连接的外部工具</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">来自工具连接中已启用的服务，可在此直接试跑</p>
        </div>
        <Link
          to="/tool-connections"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ExternalLink className="h-3 w-3" />
          去管理
        </Link>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          正在加载外部工具…
        </div>
      ) : tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Plug className="h-4 w-4" />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">还没有启用中的外部工具</p>
          <p className="mt-1 text-xs text-muted-foreground">到「工具连接」添加并启用后，这里会实时列出</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tools.map((row) => {
            const isActive = Boolean(activeTarget && activeTarget.kind === "external" && activeTarget.id === row.id)
            return (
              <li key={row.id}>
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${
                    isActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-card-foreground">
                      {row.name}
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        {String(row.method || "POST").toUpperCase()}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.description || "未填写描述"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDebug(row)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Play className="h-3 w-3" />
                    试跑
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
