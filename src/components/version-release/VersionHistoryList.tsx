import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Megaphone,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react"
import type {
  SpecVersionRow,
  VersionStatusKey,
} from "@/pages/VersionRelease/useVersionRelease"

type VersionHistoryListProps = {
  versionList: SpecVersionRow[]
  isLoadingVersions: boolean
  expandedVersionId: string
  onToggleExpand: (versionId: string) => void
  versionStatusMeta: Record<VersionStatusKey, { label: string; badge: string }>
  formatVersionTime: (iso: string) => string
  onRequestRestore: (row: SpecVersionRow) => void
  onRequestPublish: (row: SpecVersionRow) => void
  onRequestDelete: (row: SpecVersionRow) => void
}

function SnapshotDetail({ row }: { row: SpecVersionRow }) {
  const snap = row.spec_snapshot
  const cfg = row.config_snapshot
  const listRows: { label: string; items: string[] }[] = snap
    ? [
        { label: "交付物", items: snap.deliverables || [] },
        { label: "工具", items: snap.tools || [] },
        { label: "任务步骤", items: snap.task_plan || [] },
        { label: "完成标准（停止条件）", items: snap.done_criteria || [] },
      ]
    : []
  return (
    <div className="mt-3 rounded-xl bg-muted p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">助手名称</p>
          <p className="mt-0.5 text-sm text-card-foreground">{cfg?.name || "未命名助手"}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">来源</p>
          <p className="mt-0.5 text-sm text-card-foreground">
            {cfg?.source === "template" ? "模板创建" : "需求生成"}
            {cfg?.template_key ? ` · ${cfg.template_key}` : ""}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-muted-foreground">目标</p>
          <p className="mt-0.5 text-sm leading-relaxed text-card-foreground">{snap?.goal || "（快照为空）"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-muted-foreground">任务范围</p>
          <p className="mt-0.5 text-sm leading-relaxed text-card-foreground">{snap?.task_scope || "（快照为空）"}</p>
        </div>
        {listRows.map((group) => (
          <div key={group.label} className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
            {group.items.length === 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">（无）</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {group.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex gap-2 text-sm leading-relaxed text-card-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
        以上为该版本保存时的只读配置快照
        {row.test_run_id ? ` · 关联测试运行 ${row.test_run_id.slice(0, 8)}…` : " · 未关联测试运行"}
      </p>
    </div>
  )
}

export function VersionHistoryList({
  versionList,
  isLoadingVersions,
  expandedVersionId,
  onToggleExpand,
  versionStatusMeta,
  formatVersionTime,
  onRequestRestore,
  onRequestPublish,
  onRequestDelete,
}: VersionHistoryListProps) {
  if (isLoadingVersions) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-md">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载版本历史…
      </div>
    )
  }

  if (versionList.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-md">
        <p className="text-sm font-medium text-card-foreground">还没有保存过版本</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          完成第 1 步验收测试后，在第 2 步点「保存版本」，这里会出现可恢复、可发布的版本记录。
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {versionList.map((row) => {
        const meta = versionStatusMeta[row.status] || versionStatusMeta.draft
        const isExpanded = expandedVersionId === row.id
        return (
          <div
            key={row.id}
            className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 shadow-md transition duration-500 hover:shadow-lg sm:p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                v{row.version_no}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
              {row.test_run_id ? (
                row.test_passed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-3 w-3" />
                    测试通过
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                    <XCircle className="h-3 w-3" />
                    测试未通过
                  </span>
                )
              ) : (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">未测试</span>
              )}
              <span className="text-xs text-muted-foreground">保存于 {formatVersionTime(row.created)}</span>
              {row.status === "published" && row.published_at && (
                <span className="text-xs text-muted-foreground">· 发布于 {formatVersionTime(row.published_at)}</span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleExpand(row.id)}
                  aria-expanded={isExpanded}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  {isExpanded ? "收起详情" : "查看详情"}
                </button>
                <button
                  type="button"
                  onClick={() => onRequestRestore(row)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复
                </button>
                {row.status !== "published" && (
                  <button
                    type="button"
                    onClick={() => onRequestPublish(row)}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Megaphone className="h-3.5 w-3.5" />
                    发布
                  </button>
                )}
                {row.status === "draft" && (
                  <button
                    type="button"
                    aria-label={`删除草稿 v${row.version_no}`}
                    onClick={() => onRequestDelete(row)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                )}
              </div>
            </div>
            {row.note && <p className="mt-2 text-sm leading-relaxed text-card-foreground">备注：{row.note}</p>}
            {isExpanded && <SnapshotDetail row={row} />}
          </div>
        )
      })}
    </div>
  )
}
