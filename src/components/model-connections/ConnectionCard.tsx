import {
  ChevronDown,
  KeyRound,
  ListTree,
  Loader2,
  Pencil,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import {
  PROVIDER_META,
  maskConnectionDomain,
  normalizeProvider,
  type ModelConnectionRow,
} from "@/pages/ModelConnections/useModelConnections"

type ConnectionCardProps = {
  row: ModelConnectionRow
  statusMeta: Record<string, { label: string; badge: string }>
  isBusy: boolean
  isExpanded: boolean
  isPendingDelete: boolean
  onRetest: (row: ModelConnectionRow) => void
  onToggleEnabled: (row: ModelConnectionRow, next: boolean) => void
  onEdit: (row: ModelConnectionRow) => void
  onRequestDelete: (rowId: string) => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onToggleExpand: (rowId: string) => void
}

const actionBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"

export function ConnectionCard({
  row,
  statusMeta,
  isBusy,
  isExpanded,
  isPendingDelete,
  onRetest,
  onToggleEnabled,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleExpand,
}: ConnectionCardProps) {
  const meta = statusMeta[row.status] || statusMeta.untested
  const checkedText = row.last_checked_at
    ? `最近测试 ${String(row.last_checked_at).slice(0, 16).replace("T", " ")}`
    : "尚未测试"

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md transition hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-card-foreground">
              {row.name}
            </h3>
            <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {PROVIDER_META[normalizeProvider(row.provider)].shortLabel}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
              {meta.label}
            </span>
            {!row.enabled && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                已停用
              </span>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{maskConnectionDomain(row.base_url)}</span>
            <span className="inline-flex items-center gap-1">
              <KeyRound className="h-3 w-3" />••••{row.api_key_tail || "----"}
            </span>
            <span>{checkedText}</span>
            {row.status === "ok" && row.last_latency_ms > 0 && <span>延迟 {row.last_latency_ms} ms</span>}
            <span className="inline-flex items-center gap-1">
              <ListTree className="h-3 w-3" />
              {row.models.length} 个模型
            </span>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={row.enabled}
          aria-label={`${row.name}启用开关`}
          disabled={isBusy}
          onClick={() => onToggleEnabled(row, !row.enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
            row.enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
              row.enabled ? "left-5" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {row.status === "error" && row.last_error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{row.last_error}</span>
        </p>
      )}

      {isExpanded && (
        <div className="mt-3 rounded-xl bg-secondary/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            可用模型清单
          </p>
          {row.models.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              还没有拉到模型清单，点「重新测试」获取。
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.models.map((modelId) => (
                <span
                  key={modelId}
                  className="rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-muted-foreground shadow-sm"
                >
                  {modelId}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {isPendingDelete ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <span className="text-sm text-destructive">确认删除「{row.name}」？删除后不可恢复。</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={onConfirmDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              确认删除
            </button>
          </span>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleExpand(row.id)}
            className={actionBtnClass}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
            {isExpanded ? "收起模型" : "查看模型"}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRetest(row)}
            className={actionBtnClass}
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            重新测试
          </button>
          <button type="button" onClick={() => onEdit(row)} className={actionBtnClass}>
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(row.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        </div>
      )}
    </div>
  )
}
