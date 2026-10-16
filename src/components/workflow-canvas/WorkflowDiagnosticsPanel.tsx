import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react"
import type { WorkflowIssue } from "@/lib/workflowDiagnostics"

type Props = {
  issues: WorkflowIssue[]
  onSelectNode: (id: string) => void
}

/** Persistent diagnostics for drafts; never submits, executes or writes workflow data. */
export function WorkflowDiagnosticsPanel({ issues, onSelectNode }: Props) {
  const errors = issues.filter(issue => issue.severity === "error")
  const warnings = issues.filter(issue => issue.severity === "warning")
  return (
    <details className="rounded-xl border border-border bg-card p-3 shadow-sm" open={errors.length > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold focus-visible:outline-primary">
        <span className="flex min-w-0 items-center gap-2">
          {errors.length ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive"/> : <CheckCircle2 className="h-4 w-4 shrink-0 text-primary"/>}
          <span>运行前检查</span>
        </span>
        <span className="flex items-center gap-2 text-xs font-normal">
          {errors.length ? <span className="text-destructive">{errors.length} 个待修复</span> : <span className="text-primary">无阻断问题</span>}
          {warnings.length ? <span className="text-muted-foreground">{warnings.length} 项提醒</span> : null}
          <ChevronDown className="h-4 w-4 text-muted-foreground"/>
        </span>
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        可随时保存草稿；运行前需解决阻断问题。点选问题可定位到对应节点。
      </p>
      {issues.length ? (
        <ul className="mt-3 max-h-56 space-y-1.5 overflow-auto" aria-label="工作流检查结果">
          {issues.slice(0, 24).map((issue, index) => (
            <li key={issue.code + ":" + (issue.nodeId || "") + ":" + index}>
              {issue.nodeId ? (
                <button type="button" onClick={() => onSelectNode(issue.nodeId!)}
                  className="w-full rounded-lg border border-border bg-background p-2 text-left text-xs leading-relaxed hover:border-primary focus-visible:ring-2 focus-visible:ring-primary">
                  <span className={issue.severity === "error" ? "font-semibold text-destructive" : "font-semibold text-muted-foreground"}>
                    {issue.severity === "error" ? "待修复 · " : "提醒 · "}
                  </span>
                  {issue.message}
                </button>
              ) : (
                <p className="rounded-lg bg-muted p-2 text-xs leading-relaxed">
                  <span className={issue.severity === "error" ? "font-semibold text-destructive" : "font-semibold text-muted-foreground"}>
                    {issue.severity === "error" ? "待修复 · " : "提醒 · "}
                  </span>
                  {issue.message}
                </p>
              )}
            </li>
          ))}
          {issues.length > 24 ? <li className="text-xs text-muted-foreground">另有 {issues.length - 24} 项，请优先修复前述问题后刷新检查。</li> : null}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-primary">当前节点连接和必要配置未发现阻断问题，可以试运行。</p>
      )}
    </details>
  )
}
