import { AlertCircle, CheckCircle2, Timer } from "lucide-react"
import type { ToolTestResult } from "@/pages/ToolConnections/useToolConnections"
import { toolFailureGuidance } from "@/lib/toolConnectionUx"

type ToolTestResultPanelProps = {
  result: ToolTestResult
  context?: { method?: string; url?: string }
}

export function ToolTestResultPanel({ result, context }: ToolTestResultPanelProps) {
  const guidance = toolFailureGuidance(result, context)
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        result.ok ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {result.ok ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" />
            调用成功
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4" />
            调用未通过
          </span>
        )}
        {result.status_code > 0 && (
          <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-medium text-card-foreground shadow-sm">
            HTTP {result.status_code}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground shadow-sm">
          <Timer className="h-3 w-3" />
          {result.latency_ms} ms
        </span>
      </div>
      {!result.ok && result.error && (
        <p className="mt-2 text-sm leading-relaxed text-destructive">{result.error}</p>
      )}
      {guidance.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-semibold text-card-foreground">可以这样排查</p>
          <ul className="mt-1.5 space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
            {guidance.map(line => <li key={line} className="list-disc">{line}</li>)}
          </ul>
        </div>
      )}
      {result.response_excerpt && (result.ok ? (
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-card p-3 font-mono text-xs leading-relaxed text-card-foreground shadow-inner">
          {result.response_excerpt}
        </pre>
      ) : (
        <details className="mt-3 rounded-lg border border-border bg-card px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-card-foreground">查看第三方原始错误（用于排查）</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">{result.response_excerpt}</pre>
        </details>
      ))}
    </div>
  )
}
