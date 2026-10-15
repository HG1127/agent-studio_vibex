import { ArrowRight, Loader2, Wand2, X } from "lucide-react"
import type { SavedSpecRow, SpecOptimizeSuggestion } from "@/pages/AgentRun/useAgentRun"

type SpecOptimizeCardProps = {
  selectedSpec: SavedSpecRow | null
  isLoggedIn: boolean
  optimizeBusy: boolean
  suggestion: SpecOptimizeSuggestion | null
  optimizeError: string
  applyBusy: boolean
  onOptimize: () => void
  onApply: () => void
  onDiscard: () => void
  onDismissError: () => void
}

function DiffRow({
  label,
  original,
  suggested,
}: {
  label: string
  original: string
  suggested: string
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-col gap-2">
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">原文</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
            {original || "（空）"}
          </p>
        </div>
        <div className="flex justify-center">
          <ArrowRight className="h-4 w-4 rotate-90 text-primary" />
        </div>
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <p className="text-xs font-medium text-primary">建议稿</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
            {suggested || "（空）"}
          </p>
        </div>
      </div>
    </div>
  )
}

export function SpecOptimizeCard({
  selectedSpec,
  isLoggedIn,
  optimizeBusy,
  suggestion,
  optimizeError,
  applyBusy,
  onOptimize,
  onApply,
  onDiscard,
  onDismissError,
}: SpecOptimizeCardProps) {
  if (!selectedSpec) return null
  const originalCriteria = (selectedSpec.spec?.done_criteria || []).join("；")

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-md">
      <div className="flex min-h-10 shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wand2 className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-card-foreground">根据反馈优化方案</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        汇总这个方案全部运行的反馈与最近一次评估建议，生成目标与完成标准的改进稿。改动需你确认后才会写回方案。
      </p>

      {optimizeError && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
          <p className="text-xs leading-relaxed text-destructive">{optimizeError}</p>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={onDismissError}
            className="shrink-0 rounded-md p-0.5 text-destructive transition hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!suggestion && (
        <button
          type="button"
          onClick={onOptimize}
          disabled={!isLoggedIn || optimizeBusy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          {optimizeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {optimizeBusy ? "正在汇总反馈生成改进稿…" : "根据反馈优化方案"}
        </button>
      )}

      {suggestion && (
        <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-3 duration-500">
          <DiffRow label="方案目标（系统提示）" original={selectedSpec.spec?.goal || ""} suggested={suggestion.suggested_prompt} />
          <DiffRow label="完成标准" original={originalCriteria} suggested={suggestion.suggested_criteria} />
          {suggestion.suggested_tools_note && (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3.5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">工具配置建议</p>
              <p className="mt-1 text-sm leading-relaxed text-card-foreground">{suggestion.suggested_tools_note}</p>
            </div>
          )}
          {suggestion.rationale && (
            <div className="rounded-xl bg-secondary/60 px-3.5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">改动理由</p>
              <p className="mt-1 text-sm leading-relaxed text-card-foreground">{suggestion.rationale}</p>
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onApply}
              disabled={applyBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {applyBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              确认写回方案
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={applyBusy}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              丢弃建议
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
