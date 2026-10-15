import { CheckCircle2, Loader2, Play, RotateCcw, Terminal, XCircle } from "lucide-react"
import type { KeyItem, TestEvent } from "@/pages/Integrate/useIntegrate"

type TestRunPanelProps = {
  keyList: KeyItem[]
  testKeyId: string
  setTestId: (v: string) => void
  testInput: string
  setTestInput: (v: string) => void
  isTesting: boolean
  testRunId: string
  testRunStatus: string
  testEvents: TestEvent[]
  testResult: string
  testError: string
  testLatency: number
  onRunTest: () => void
  onResetTest: () => void
  testEventMeta: Record<string, { label: string; badge: string }>
  formatLatency: (ms: number) => string
}

function eventText(ev: TestEvent): string {
  const c = (ev.content || {}) as Record<string, unknown>
  if (ev.event_type === "thinking") return String(c.thought || c.message || "")
  if (ev.event_type === "tool_call") return `${String(c.tool || "")} ${JSON.stringify(c.params || {})}`.slice(0, 200)
  if (ev.event_type === "tool_result") return String(c.observation || c.message || "").slice(0, 300)
  if (ev.event_type === "error") return String(c.message || c.error || "")
  return String(c.message || JSON.stringify(c)).slice(0, 200)
}

export function TestRunPanel({
  keyList,
  testKeyId,
  setTestId,
  testInput,
  setTestInput,
  isTesting,
  testRunId,
  testRunStatus,
  testEvents,
  testResult,
  testError,
  testLatency,
  onRunTest,
  onResetTest,
  testEventMeta,
  formatLatency,
}: TestRunPanelProps) {
  const enabledKeys = keyList.filter((row) => row.enabled)
  const started = Boolean(testRunId || testRunStatus)
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Terminal className="h-4 w-4 text-primary" />
            在线试调
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">用真实钥匙走与外部完全相同的调用链路，事件原样呈现</p>
        </div>
        {started && !isTesting && (
          <button
            type="button"
            onClick={onResetTest}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-card-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            清空
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={testKeyId}
            onChange={(ev) => setTestId(ev.target.value)}
            aria-label="选择试调钥匙"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:w-56"
          >
            <option value="">选择调用钥匙…</option>
            {enabledKeys.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}（****{row.token_tail}）
              </option>
            ))}
          </select>
          <input
            value={testInput}
            onChange={(ev) => setTestInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !isTesting) onRunTest()
            }}
            placeholder="输入任务指令，例如：用一句话介绍你能做什么"
            aria-label="试调任务指令"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <button
            type="button"
            onClick={onRunTest}
            disabled={isTesting}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isTesting ? "运行中…" : "真实试调"}
          </button>
        </div>

        {enabledKeys.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
            还没有生效中的钥匙——先在「API 调用钥匙」卡片创建一把，试调会用它走真实链路。
          </p>
        )}

        {started && (
          <div className="rounded-2xl border border-border bg-secondary/40 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {testRunStatus === "running" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  运行中
                </span>
              )}
              {testRunStatus === "succeeded" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                  <CheckCircle2 className="h-3 w-3" />
                  成功 · 耗时 {formatLatency(testLatency)}
                </span>
              )}
              {(testRunStatus === "failed" || testRunStatus === "cancelled") && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 font-medium text-destructive">
                  <XCircle className="h-3 w-3" />
                  {testRunStatus === "cancelled" ? "已取消" : "失败"}
                </span>
              )}
              {testRunId && <span className="font-mono text-muted-foreground">run: {testRunId}</span>}
            </div>

            {testEvents.length > 0 && (
              <ol className="mt-2.5 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                {testEvents.map((ev) => {
                  const meta = testEventMeta[ev.event_type] || { label: ev.event_type, badge: "bg-muted text-muted-foreground" }
                  return (
                    <li key={`${ev.step_index}-${ev.seq}-${ev.event_type}`} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-medium ${meta.badge}`}>{meta.label}</span>
                      <span className="min-w-0 flex-1 break-words leading-relaxed text-card-foreground">{eventText(ev)}</span>
                    </li>
                  )
                })}
              </ol>
            )}

            {testResult && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary">最终结果</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">{testResult}</p>
              </div>
            )}
            {testError && (
              <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-xs font-medium text-destructive">失败原因</p>
                <p className="mt-1 break-words text-xs leading-relaxed text-destructive">{testError}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
