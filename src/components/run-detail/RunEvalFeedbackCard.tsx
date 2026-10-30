import { Gauge, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react"
import type { RunDetailRow } from "@/pages/RunDetail/useRunDetail"

type RunEvalFeedbackCardProps = {
  run: RunDetailRow
}

const TERMINAL_STATES: readonly string[] = ["succeeded", "failed", "cancelled"]

// 只读展示：评估报告摘要 + 反馈状态（生成评估与提交反馈在试跑页操作）
export function RunEvalFeedbackCard({ run }: RunEvalFeedbackCardProps) {
  const evaluation = run.evaluation
  const feedback = run.feedback
  const isTerminal = TERMINAL_STATES.includes(run.status)
  if (!evaluation && !feedback && !isTerminal) return null
  const isRuleOnly = Boolean(evaluation && (evaluation.degraded || evaluation.mode === "rule"))

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-md">
      <section className="flex flex-col gap-2.5">
        <div className="flex min-h-9 shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gauge className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-card-foreground">运行评估</h3>
          {evaluation && (
            <span
              className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isRuleOnly ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
              }`}
            >
              {isRuleOnly ? "仅规则评分" : "AI 评审融合"}
            </span>
          )}
        </div>
        {evaluation ? (
          <div className="rounded-xl bg-secondary/60 p-3.5">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">{evaluation.score}</span>
              <span className="text-xs text-muted-foreground">总分 / 100</span>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {evaluation.dimensions.map((dim) => (
                <div key={dim.name} className="flex items-center gap-2.5">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{dim.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(Math.max(dim.score, 0), 100)}%` }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-right text-xs font-semibold text-card-foreground">{dim.score}</span>
                </div>
              ))}
            </div>
            {evaluation.suggestions.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-2.5">
                {evaluation.suggestions.slice(0, 3).map((item, itemIndex) => (
                  <li key={`${item.slice(0, 12)}-${itemIndex}`} className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {run.native?"原评估摘要尚未映射到此卡；现有 Native review 历史需另行接线，不能据空值判定从未评估。":"尚未评估。可在「助手配置与试跑」页对这次运行生成评估报告。"}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2.5 border-t border-border pt-3.5">
        <div className="flex min-h-9 shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageSquareText className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-card-foreground">结果反馈</h3>
        </div>
        {feedback ? (
          <div className="rounded-xl bg-secondary/60 p-3.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                feedback.rating === "up" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
              }`}
            >
              {feedback.rating === "up" ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsDown className="h-3.5 w-3.5" />}
              {feedback.rating === "up" ? "结果不错" : "结果不理想"}
            </span>
            {feedback.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {feedback.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground shadow-sm">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {feedback.comment && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">“{feedback.comment}”</p>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {run.native?"本页没有取得可显示的反馈正文；这不证明原运行从未收到反馈。自主运行已接入可用时的本人 Native 反馈读取。":"暂无反馈。可在「助手配置与试跑」页对这次运行提交 👍/👎 反馈。"}
          </p>
        )}
      </section>
    </div>
  )
}
