import { Play, Sparkles } from "lucide-react"

type RunLauncherProps = {
  instruction: string
  onInstructionChange: (value: string) => void
  onRun: () => void
  isStarting: boolean
  canRun: boolean
  priceHint: string
  hasSpec: boolean
}

export function RunLauncher({
  instruction,
  onInstructionChange,
  onRun,
  isStarting,
  canRun,
  priceHint,
  hasSpec,
}: RunLauncherProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">任务指令</h2>
        {!hasSpec && (
          <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            先在左侧选择助手方案
          </span>
        )}
      </div>
      <textarea
        value={instruction}
        onChange={(e) => onInstructionChange(e.target.value)}
        rows={3}
        placeholder="给助手下达一个具体任务，例如：帮我算一下 (36+64)*12 的结果，并统计这段指令的字数，最后给出一份简短总结"
        className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-card-foreground transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{priceHint}</p>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun || isStarting}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStarting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isStarting ? "创建中…" : "运行"}
        </button>
      </div>
    </div>
  )
}
