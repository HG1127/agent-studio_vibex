import { Loader2, Megaphone, PlusCircle } from "lucide-react"
import { Link } from "react-router-dom"
import {WorkspaceEmptyState} from '@/components/site/WorkspaceEmptyState'
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
      <WorkspaceEmptyState icon={PlusCircle} title="还没有已保存的助手方案" description="先创建并保存 Agent，再管理它的版本与发布。" actions={<Link to="/agent-create" className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">创建 Agent</Link>}/>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
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
