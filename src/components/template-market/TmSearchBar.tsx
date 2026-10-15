import { Search, Upload } from "lucide-react"
import {
  CATEGORY_FILTERS,
  type CategoryFilter,
} from "@/pages/TemplateMarket/useTemplateMarket"

type TmSearchBarProps = {
  searchText: string
  onSearchChange: (value: string) => void
  activeCategory: CategoryFilter
  onCategoryChange: (value: CategoryFilter) => void
  onPublishClick: () => void
  resultCount: number
}

export function TmSearchBar({
  searchText,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  onPublishClick,
  resultCount,
}: TmSearchBarProps) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchText}
            onChange={(ev) => onSearchChange(ev.target.value)}
            placeholder="搜索模板名称或简介关键词…"
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-11 pr-4 text-sm text-card-foreground shadow-sm transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <button
          type="button"
          onClick={onPublishClick}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Upload className="h-4 w-4" />
          发布我的模板
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {CATEGORY_FILTERS.map((filter) => {
          const isActive = activeCategory === filter.key
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onCategoryChange(filter.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70 hover:text-card-foreground"
              }`}
            >
              {filter.label}
            </button>
          )
        })}
        <span className="ml-auto text-xs text-muted-foreground">共 {resultCount} 个模板</span>
      </div>
    </div>
  )
}
