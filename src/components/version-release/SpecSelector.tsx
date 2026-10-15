import { Loader2, Megaphone, PlusCircle } from "lucide-react"
import { Link } from "react-router-dom"
import type { SavedSpecRow, SpecVersionRow } from "@/pages/VersionRelease/useVersionRelease"

type SpecSelectorProps = {
  specList: SavedSpecRow[]
  isLoadingSpecs: boolean
  selectedSpecId: string
  onSelect: (specId: string) => void
  publishedVersion: SpecVersionRow | null
  formatVersionTime: (iso: string) => string
}

export function SpecSelector({
  specList,
  isLoadingSpecs,
  selectedSpecId,
  onSelect,
  publishedVersion,
  formatVersionTime,
}: SpecSelectorProps) {
  if (!isLoadingSpecs && specList.length === 0) {
    return (
      <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-md">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <PlusCircle className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">还没有已保存的助手方案</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          版本与发布围绕已保存的助手进行，先去首页创建一个助手方案吧。
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
        >
          去首页创建助手
        </Link>
      </section>
    )
  }

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-3xl border border-border bg-card p-5 shadow-md sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <label htmlFor="vr-spec-select" className="shrink-0 text-sm font-medium text-card-foreground">
            选择助手
          </label>
          <div className="relative flex-1">
            <select
              id="vr-spec-select"
              value={selectedSpecId}
              onChange={(ev) => onSelect(ev.target.value)}
              disabled={isLoadingSpecs}
              className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-2.5 pr-10 text-sm text-card-foreground shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingSpecs && <option value="">正在加载助手方案…</option>}
              {!isLoadingSpecs && <option value="">请选择一个助手方案</option>}
              {specList.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}（{row.source === "template" ? "模板创建" : "需求生成"}）
                </option>
              ))}
            </select>
            {isLoadingSpecs && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="shrink-0">
          {publishedVersion ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-xs font-medium text-primary shadow-sm">
              <Megaphone className="h-3.5 w-3.5" />
              当前发布：v{publishedVersion.version_no} · {formatVersionTime(publishedVersion.published_at)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground">
              <Megaphone className="h-3.5 w-3.5" />
              该助手尚未发布任何版本
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
