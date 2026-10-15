import { SearchX, Upload } from "lucide-react"

type TmEmptyProps = {
  hasFilters: boolean
  onResetFilters: () => void
  onPublishClick: () => void
}

export function TmEmpty({ hasFilters, onResetFilters, onPublishClick }: TmEmptyProps) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center shadow-md">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SearchX className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-card-foreground">
        {hasFilters ? "没有匹配的模板" : "市场还空空如也"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasFilters ? "换个关键词，或把分类切回「全部」再试试。" : "发布第一个模板，让它出现在市场里。"}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {hasFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
          >
            清空筛选
          </button>
        )}
        <button
          type="button"
          onClick={onPublishClick}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Upload className="h-4 w-4" />
          发布我的模板
        </button>
      </div>
    </div>
  )
}
