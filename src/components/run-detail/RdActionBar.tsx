import { CirclePause, CirclePlay, CircleStop, FileDown, GitBranch, Rocket } from "lucide-react"
import { Link } from "react-router-dom"
import type { RunDetailRow } from "@/pages/RunDetail/useRunDetail"

type RdActionBarProps = {
  run: RunDetailRow
  isLive: boolean
  controlBusy: "" | "pause" | "resume" | "cancel"
  onControl: (action: "pause" | "resume" | "cancel") => void
  onExport: () => void
}

export function RdActionBar({ run, isLive, controlBusy, onControl, onExport }: RdActionBarProps) {
  const hasSpec = Boolean(run.spec_id)
  const canPause = run.status === "running"
  const canResume = run.status === "paused" || run.status === "queued"

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <h2 className="text-base font-semibold tracking-tight text-card-foreground">接下来可以</h2>
      <div className="mt-3 flex flex-col gap-2">
        <Link
          to={hasSpec ? `/agent-run?spec=${encodeURIComponent(run.spec_id)}` : "/agent-run"}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Rocket className="h-4 w-4" />
          在试跑页打开该方案
        </Link>
        <Link
          to={hasSpec ? `/version-release?spec=${encodeURIComponent(run.spec_id)}` : "/version-release"}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary bg-background px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <GitBranch className="h-4 w-4" />
          查看该方案版本
        </Link>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
        >
          <FileDown className="h-4 w-4" />
          导出运行报告
        </button>
      </div>

      {isLive && (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => onControl("pause")}
            disabled={!canPause || controlBusy !== ""}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-card-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CirclePause className="h-4 w-4" />
            {controlBusy === "pause" ? "暂停中…" : "暂停"}
          </button>
          <button
            type="button"
            onClick={() => onControl("resume")}
            disabled={!canResume || controlBusy !== ""}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary bg-background px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CirclePlay className="h-4 w-4" />
            {controlBusy === "resume" ? "恢复中…" : "恢复"}
          </button>
          <button
            type="button"
            onClick={() => onControl("cancel")}
            disabled={controlBusy !== ""}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CircleStop className="h-4 w-4" />
            {controlBusy === "cancel" ? "取消中…" : "取消"}
          </button>
        </div>
      )}
    </div>
  )
}
