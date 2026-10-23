import { ArrowRight, Megaphone } from "lucide-react"
import { Link } from "react-router-dom"
import type { SpecVersionRow } from "@/pages/VersionRelease/useVersionRelease"

type PublishCardProps = {
  hasSpec: boolean
  publishedVersion: SpecVersionRow | null
  versionList: SpecVersionRow[]
  onRequestPublish: (row: SpecVersionRow) => void
  formatVersionTime: (iso: string) => string
}

export function PublishCard({
  hasSpec,
  publishedVersion,
  versionList,
  onRequestPublish,
  formatVersionTime,
}: PublishCardProps) {
  const publishable = versionList.filter((row) => row.status !== "published")

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 shrink-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          3
        </span>
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">发布</h3>
          <p className="text-xs text-muted-foreground">同一时间只有一个已发布版本</p>
        </div>
        <Megaphone className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>

      {publishedVersion ? (
        <div className="mt-3 rounded-xl border-l-4 border-primary bg-primary/10 p-3.5 shadow-sm">
          <p className="text-sm font-semibold text-primary">当前发布：v{publishedVersion.version_no}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            发布于 {formatVersionTime(publishedVersion.published_at)}
            {publishedVersion.note ? ` · ${publishedVersion.note}` : ""}
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-muted p-3.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            还没有已发布版本。从下面的候选版本里选一个发布，或在版本历史中点「发布」。
          </p>
        </div>
      )}

      {publishedVersion ? (
        <Link
          to="/integrate"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 transition hover:underline"
        >
          去对外集成：接入网页或发放 API 钥匙
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs font-medium text-card-foreground">可发布的版本</p>
        {!hasSpec && <p className="text-xs text-muted-foreground">请先选择助手方案</p>}
        {hasSpec && publishable.length === 0 && (
          <p className="text-xs text-muted-foreground">暂无候选版本，先完成第 2 步保存一个版本</p>
        )}
        {hasSpec &&
          publishable.slice(0, 5).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 shadow-sm transition hover:shadow-md"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-card-foreground">
                  v{row.version_no}
                  {!row.test_passed && (
                    <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      未测试
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{row.note || "无备注"}</p>
              </div>
              <button
                type="button"
                disabled={Boolean((row.spec_snapshot?.roles||[]).length>=2 && !row.test_passed)}
                title={(row.spec_snapshot?.roles||[]).length>=2 && !row.test_passed ? "复杂 Agent 需通过正式执行证据验收后才能发布" : undefined}
                onClick={() => onRequestPublish(row)}
                aria-label={`发布版本 v${row.version_no}`}
                className="shrink-0 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                发布
              </button>
            </div>
          ))}
      </div>

      <div className="mt-auto pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          发布前会二次确认；发布后原已发布版本自动归档，随时可以在历史里重新发布。
        </p>
      </div>
    </div>
  )
}
