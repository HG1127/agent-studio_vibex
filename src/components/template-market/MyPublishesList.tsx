import { EyeOff, Loader2, Megaphone, Play, Store, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import {
  CATEGORY_META,
  formatTemplateTime,
  type MyPublishRow,
} from "@/pages/TemplateMarket/useTemplateMarket"

type MyPublishesListProps = {
  myList: MyPublishRow[]
  isLoadingMine: boolean
  busyMineId: string
  error?: string
  onRetry?: () => void
  onUnpublish: (row: MyPublishRow) => void
  onRepublish: (row: MyPublishRow) => void
  onDelete: (row: MyPublishRow) => void
}

export function MyPublishesList({
  myList,
  isLoadingMine,
  busyMineId,
  onUnpublish,  error,
  onRetry,

  onRepublish,
  onDelete,
}: MyPublishesListProps) {
  if (error) return <section role="alert"
    className="rounded-xl border border-destructive/30 bg-card p-5 text-sm">
    <p className="text-destructive">{error}</p>
    <button type="button" onClick={onRetry} className="mt-3 min-h-10 rounded-lg border border-border px-3 py-2 font-medium text-primary">
      重新读取我的模板
    </button>
  </section>
  if (isLoadingMine) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-md">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        正在加载我的发布…
      </div>
    )
  }
  if (myList.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-md">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Store className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-card-foreground">还没有发布过模板</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          把你保存过的助手方案发布成模板，别人一键就能复制使用。
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
        >
          去首页创建助手方案
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {myList.map((row) => {
        const meta = CATEGORY_META[row.category] || CATEGORY_META.other
        const isBusy = busyMineId === row.id
        return (
          <div
            key={row.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-md transition hover:shadow-lg sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-card-foreground">{row.name}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
                {row.public ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">公开中</span>
                ) : (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">已下架</span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">{row.description}</p>
              <p className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Play className="h-3 w-3" />
                  {row.use_count} 次使用
                </span>
                <span>发布于 {formatTemplateTime(row.created)}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isBusy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {row.public ? (
                <button
                  type="button"
                  onClick={() => onUnpublish(row)}
                  disabled={Boolean(busyMineId)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <EyeOff className="h-4 w-4" />
                  下架
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRepublish(row)}
                  disabled={Boolean(busyMineId)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Megaphone className="h-4 w-4" />
                  重新公开
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(row)}
                disabled={Boolean(busyMineId)}
                aria-label={`删除模板 ${row.name}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3.5 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </div>
          </div>
        )
      })}
      <p className="px-1 text-xs text-muted-foreground">
        下架只影响市场展示，已经复制走的方案不受影响；删除模板同样不会动别人已复制的方案。
      </p>
    </div>
  )
}
