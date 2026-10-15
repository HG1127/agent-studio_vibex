import { FolderOpen, Lock, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SavedSpecRow } from "@/pages/Home/useHome"

type SavedSpecsListProps = {
  savedList: SavedSpecRow[]
  isLoggedIn: boolean
  onOpenSaved: (row: SavedSpecRow) => void
  onDeleteSaved: (recordId: string) => void
}

function formatRowTime(isoValue: string): string {
  if (!isoValue) return ""
  const parsed = new Date(isoValue)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function SavedSpecsList({ savedList, isLoggedIn, onOpenSaved, onDeleteSaved }: SavedSpecsListProps) {
  if (!isLoggedIn) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground shadow-md">
        <Lock className="h-5 w-5 shrink-0 text-primary" />
        登录账号后，你保存的助手方案会显示在这里。
      </div>
    )
  }

  if (savedList.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground shadow-md">
        <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
        还没有保存过助手方案。在上方生成或加载一个示例，编辑满意后点「保存到我的助手」。
      </div>
    )
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {savedList.map((row) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-md transition hover:shadow-lg"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-card-foreground">{row.name || "未命名助手"}</p>
              <span
                className={
                  row.source === "template"
                    ? "shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    : "shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                }
              >
                {row.source === "template" ? "示例" : "创建"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">更新于 {formatRowTime(row.updated)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenSaved(row)}
              className="rounded-lg border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
            >
              打开
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`删除 ${row.name || "方案"}`}
              onClick={() => onDeleteSaved(row.id)}
              className="rounded-lg text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
