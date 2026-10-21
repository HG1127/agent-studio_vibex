import { BarChart3, BookOpen, ChevronDown, Play, ShieldCheck, Sparkles, Telescope, UserRound } from "lucide-react"
import {
  CATEGORY_META,
  formatTemplateTime,
  type TemplateRow,
} from "@/pages/TemplateMarket/useTemplateMarket"
import { TemplateDetailPanel } from "@/components/template-market/TemplateDetailPanel"

const CATEGORY_ICON = {
  research: Telescope,
  knowledge: BookOpen,
  data: BarChart3,
  other: Sparkles,
} as const

type TemplateCardProps = {
  row: TemplateRow
  isExpanded: boolean
  onToggleExpand: (templateId: string) => void
  onUse: (row: TemplateRow) => void
}

export function TemplateCard({ row, isExpanded, onToggleExpand, onUse }: TemplateCardProps) {
  const Icon = CATEGORY_ICON[row.category] || Sparkles
  const meta = CATEGORY_META[row.category] || CATEGORY_META.other
  return (
    <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-md transition duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {row.built_in ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              官方
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
              <UserRound className="h-3.5 w-3.5" />
              作者 ****{row.author_tail}
            </span>
          )}
        </div>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-card-foreground">{row.name}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={`rounded-full px-2.5 py-0.5 font-medium ${meta.badge}`}>{meta.label}</span>
        <span className="inline-flex items-center gap-1">
          <Play className="h-3 w-3" />
          {row.use_count} 次使用
        </span>
        {row.created && <span>· {formatTemplateTime(row.created)}</span>}
        {row.is_mine && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">我的发布</span>
        )}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{row.description}</p>
      {isExpanded && <TemplateDetailPanel spec={row.spec} />}
      <div className="mt-auto flex items-center gap-2 pt-5">
        <button
          type="button"
          onClick={() => onToggleExpand(row.id)}
          aria-expanded={isExpanded}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
        >
          {isExpanded ? "收起详情" : "方案摘要"}
          <ChevronDown className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => onUse(row)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Play className="h-4 w-4" />
          复制并配置
        </button>
      </div>
    </article>
  )
}
