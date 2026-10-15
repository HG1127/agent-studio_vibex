import { Gauge, Lightbulb, Loader2, Sparkles } from "lucide-react"
import type { RunEvaluation } from "@/pages/AgentRun/useAgentRun"

type RunEvaluationCardProps = {
  evaluation: RunEvaluation | null
  evalBusy: boolean
  onGenerate: () => void
}

const RING_R = 40
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R

function formatEvaluatedAt(raw: string): string {
  if (!raw) return ""
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function RunEvaluationCard({ evaluation, evalBusy, onGenerate }: RunEvaluationCardProps) {
  const isRuleOnly = Boolean(evaluation && (evaluation.degraded || evaluation.mode === "rule"))

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-10 shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Gauge className="h-4 w-4" />
        </span>
        <h3 className="text-base font-semibold tracking-tight text-card-foreground">运行评估</h3>
        {evaluation && (
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isRuleOnly ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
            }`}
          >
            {isRuleOnly ? "仅规则评分" : "AI 评审融合"}
          </span>
        )}
      </div>

      {!evaluation && !evalBusy && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 p-4">
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
            按评分策略复盘这次运行：目标达成、过程效率、工具使用、输出质量、指令遵循五个维度，并给出可执行的优化建议。
          </p>
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="h-4 w-4" />
            生成评估
          </button>
        </div>
      )}

      {evalBusy && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/60 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          正在复盘这次运行，逐维度打分中…
        </div>
      )}

      {evaluation && !evalBusy && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
                <circle cx="48" cy="48" r={RING_R} fill="none" strokeWidth="8" className="stroke-muted" />
                <circle
                  cx="48"
                  cy="48"
                  r={RING_R}
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  className="stroke-primary transition-all duration-700"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - Math.min(Math.max(evaluation.score, 0), 100) / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-card-foreground">{evaluation.score}</span>
                <span className="text-xs text-muted-foreground">总分</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {isRuleOnly
                  ? "本次评审模型不可用，按运行数据做纯规则评分（不含模型评语）。"
                  : "规则客观分与模型主观评审融合后的综合得分。"}
              </p>
              {evaluation.evaluated_at && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  评估于 {formatEvaluatedAt(evaluation.evaluated_at)}
                </p>
              )}
              <button
                type="button"
                onClick={onGenerate}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
              >
                重新评估
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {evaluation.dimensions.map((dim) => (
              <div key={dim.name} className="rounded-xl bg-muted/50 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-card-foreground">{dim.name}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {dim.score}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(Math.max(dim.score, 0), 100)}%` }}
                  />
                </div>
                {dim.comment && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{dim.comment}</p>}
              </div>
            ))}
          </div>

          {evaluation.suggestions.length > 0 && (
            <div className="rounded-xl border border-dashed border-primary/40 bg-secondary/40 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
                <Lightbulb className="h-4 w-4 text-primary" />
                优化建议
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {evaluation.suggestions.map((item, itemIndex) => (
                  <li key={`${item.slice(0, 12)}-${itemIndex}`} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
