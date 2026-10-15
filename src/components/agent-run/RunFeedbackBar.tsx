import { Loader2, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react"
import type { RunFeedback } from "@/pages/AgentRun/useAgentRun"

export type FeedbackDraft = {
  rating: "" | "up" | "down"
  tags: string[]
  comment: string
}

type RunFeedbackBarProps = {
  feedback: RunFeedback | null
  draft: FeedbackDraft
  editing: boolean
  busy: boolean
  tagOptions: string[]
  onSelectRating: (rating: "up" | "down") => void
  onToggleTag: (tag: string) => void
  onCommentChange: (comment: string) => void
  onSubmit: () => void
  onEdit: () => void
  onCancelEdit: () => void
}

export function RunFeedbackBar({
  feedback,
  draft,
  editing,
  busy,
  tagOptions,
  onSelectRating,
  onToggleTag,
  onCommentChange,
  onSubmit,
  onEdit,
  onCancelEdit,
}: RunFeedbackBarProps) {
  const showSubmitted = Boolean(feedback) && !editing

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-10 shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageSquareText className="h-4 w-4" />
        </span>
        <h3 className="text-base font-semibold tracking-tight text-card-foreground">这次结果如何？</h3>
      </div>

      {showSubmitted && feedback && (
        <div className="mt-3 rounded-xl bg-secondary/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                feedback.rating === "up"
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {feedback.rating === "up" ? <ThumbsUp className="h-4 w-4" /> : <ThumbsDown className="h-4 w-4" />}
              {feedback.rating === "up" ? "你反馈了：结果不错" : "你反馈了：结果不理想"}
            </span>
            {feedback.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground shadow-sm">
                {tag}
              </span>
            ))}
            <button
              type="button"
              onClick={onEdit}
              className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-card-foreground transition hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
            >
              修改反馈
            </button>
          </div>
          {feedback.comment && (
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">“{feedback.comment}”</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {feedback.rating === "down" ? "负反馈已沉淀为方案教训，下次运行会自动参考避坑。" : "感谢反馈，方案会继续保持当前配置。"}
          </p>
        </div>
      )}

      {!showSubmitted && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => onSelectRating("up")}
              aria-pressed={draft.rating === "up"}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                draft.rating === "up"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              <ThumbsUp className="h-4 w-4" />
              结果不错
            </button>
            <button
              type="button"
              onClick={() => onSelectRating("down")}
              aria-pressed={draft.rating === "down"}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                draft.rating === "down"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              <ThumbsDown className="h-4 w-4" />
              结果不理想
            </button>
          </div>

          {draft.rating && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {tagOptions.map((tag) => {
                  const picked = draft.tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onToggleTag(tag)}
                      aria-pressed={picked}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                        picked
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
              <textarea
                value={draft.comment}
                onChange={(ev) => onCommentChange(ev.target.value)}
                rows={2}
                maxLength={200}
                placeholder="补充一句话（可选）：哪里不满意 / 哪里做得好？"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={busy || !draft.rating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {feedback ? "更新反馈" : "提交反馈"}
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    disabled={busy}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    取消
                  </button>
                )}
                {draft.rating === "down" && (
                  <span className="text-xs text-muted-foreground">负反馈会沉淀为方案教训，下次运行自动避坑</span>
                )}
              </div>
            </>
          )}

          {!draft.rating && !feedback && (
            <p className="text-xs text-muted-foreground">
              你的反馈会沉淀进方案记忆，并驱动「根据反馈优化方案」给出改进稿。
            </p>
          )}
        </div>
      )}
    </div>
  )
}
