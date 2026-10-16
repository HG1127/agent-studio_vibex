import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type CreateComposerProps = {
  userInput: string
  onUserInputChange: (value: string) => void
  onCreate: () => void
  isGenerating: boolean
  /** The wizard makes requirement capture the primary desktop task. */
  variant?: "default" | "focus"
}

export function CreateComposer({
  userInput, onUserInputChange, onCreate, isGenerating, variant = "default",
}: CreateComposerProps) {
  const focused = variant === "focus"
  return (
    <div data-agent-requirement-composer
      className={`flex min-w-0 flex-col rounded-2xl border bg-card ${focused
        ? "min-h-[min(440px,58svh)] border-primary/25 p-5 shadow-sm sm:min-h-[clamp(330px,47svh,520px)] sm:p-7"
        : "border-border p-5 shadow-sm"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="agent-requirement"
          className={`block font-semibold text-card-foreground ${focused ? "text-lg" : "text-sm"}`}>
          {focused ? "描述你希望 Agent 完成的任务" : "说说你想要一个什么样的助手"}
        </label>
        {focused && <span className="text-xs text-muted-foreground">第 1 步 · 需求</span>}
      </div>
      {focused && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        建议说明目标、处理资料、期望交付物及限制条件。描述越具体，生成的方案越容易验证。
      </p>}
      <Textarea
        id="agent-requirement"
        rows={focused ? 7 : 3}
        value={userInput}
        onChange={(e) => onUserInputChange(e.target.value)}
        placeholder={focused
          ? "例如：每周分析 AI 半导体领域的重要动态，优先使用公开可靠来源，输出摘要、关键证据及风险，并标注引用。涉及付费或对外发送的操作须先征得批准。"
          : "例如：帮我创建一个能查资料写报告的助手，每周五自动整理行业新闻给我"}
        className={`mt-4 w-full flex-1 resize-y rounded-xl border border-border bg-background px-4 py-4 text-base leading-7 shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-2 focus-visible:ring-primary ${focused ? "min-h-48" : "min-h-28"}`}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          生成会调用当前账号的模型，可能产生费用；不会自动保存或发布。
        </p>
        <Button
          type="button"
          size="lg"
          onClick={onCreate}
          disabled={isGenerating || !userInput.trim()}
          className={`min-h-11 rounded-xl bg-primary px-6 text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary ${focused ? "w-full text-sm sm:w-auto" : ""}`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在生成方案…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              生成 Agent 方案
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
