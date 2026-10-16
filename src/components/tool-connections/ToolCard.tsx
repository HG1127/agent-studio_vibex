import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Send,
  Trash2,
  RotateCw,
  X,
} from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { ToolTestResultPanel } from "@/components/tool-connections/ToolTestResultPanel"
import { ToolRequestPreviewPanel } from "@/components/tool-connections/ToolRequestPreviewPanel"
import { OPEN_METEO_EXAMPLE, inspectToolRequest, isOpenMeteoForecast } from "@/lib/toolConnectionUx"
import {
  maskToolDomain,
  type ToolConnectionRow,
  type ToolTestResult,
} from "@/pages/ToolConnections/useToolConnections"

type ToolCardProps = {
  row: ToolConnectionRow
  statusMeta: Record<string, { label: string; badge: string }>
  isBusy: boolean
  isExpanded: boolean
  isPendingDelete: boolean
  cardTestInput: string
  confirmCardWrite: boolean
  onConfirmCardWriteChange: (checked: boolean) => void
  cardTestResult: ToolTestResult | null
  isTestingCard: boolean
  onCardTestInputChange: (value: string) => void
  onCardTest: (row: ToolConnectionRow) => void
  onRetest: (row: ToolConnectionRow) => void
  onToggleEnabled: (row: ToolConnectionRow, next: boolean) => void
  onEdit: (row: ToolConnectionRow) => void
  onRequestDelete: (rowId: string) => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onToggleExpand: (rowId: string) => void
}

export function ToolCard(p: ToolCardProps) {
  const { row } = p
  const meta = p.statusMeta[row.status] || p.statusMeta.untested
  const preflight = inspectToolRequest({
    url: row.url, method: row.method === "GET" ? "GET" : "POST",
    input: p.cardTestInput, bodyTemplate: row.body_template, timeout: String(row.timeout_s || 15),
  })

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md transition hover:shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-mono text-sm font-bold text-card-foreground">{row.name}</h3>
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-secondary-foreground">
              {row.method}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  row.status === "ok"
                    ? "bg-primary"
                    : row.status === "error"
                      ? "bg-destructive"
                      : "bg-muted-foreground"
                }`}
              />
              {meta.label}{row.status === "error" && row.enabled ? " · 已开启" : ""}
            </span>
            {!row.enabled && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                已停用
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {row.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{maskToolDomain(row.url)}</span>
            {row.last_latency_ms > 0 && <span>最近延迟 {row.last_latency_ms} ms</span>}
            {row.timeout_s > 0 && <span>超时 {row.timeout_s}s</span>}
            {row.headers.length > 0 && (
              <span>
                请求头：
                {row.headers
                  .map((item) => `${item.key}: ${item.value}`)
                  .join("，")}
              </span>
            )}
          </div>
          {row.status === "error" && row.last_error && (
            <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{row.last_error}<button type="button" onClick={() => p.onEdit(row)}
                className="ml-2 font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-primary">修复配置</button></span>
            </p>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={row.enabled}
          aria-label={row.enabled ? `停用 ${row.name}` : `启用 ${row.name}`}
          onClick={() => p.onToggleEnabled(row, !row.enabled)}
          disabled={p.isBusy}
          className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${
            row.enabled ? "bg-primary shadow-md" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card shadow transition-all ${
              row.enabled ? "left-[22px]" : "left-0.5"
            }`}
          >
            {row.enabled && <Check className="h-3 w-3 text-primary" />}
          </span>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => p.onToggleExpand(row.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Send className="h-3.5 w-3.5" />
          {p.isExpanded ? "收起测试" : "测试调用"}
        </button>
        <button
          type="button"
          onClick={() => p.onRetest(row)}
          disabled={p.isBusy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          {p.isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          {row.method === "GET" ? "重新测试" : "确认后测试"}
        </button>
        <button
          type="button"
          onClick={() => p.onEdit(row)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </button>
        <button
          type="button"
          onClick={() => p.onRequestDelete(row.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </button>
      </div>

      {p.isExpanded && (
        <div className="mt-3 rounded-xl border border-border bg-background/60 p-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            测试参数（替换模板里的占位符，留空按空对象发送）
          </label>
          <Textarea
            rows={2}
            value={p.cardTestInput}
            onChange={(e) => p.onCardTestInputChange(e.target.value)}
            placeholder={isOpenMeteoForecast(row.url) ? OPEN_METEO_EXAMPLE.input : '例如 {"query":"搜索词"}；字段必须与 URL / 请求体里的占位符一致'}
            className="resize-none rounded-lg border-border bg-card font-mono text-xs focus-visible:ring-primary"
          />
          {isOpenMeteoForecast(row.url) && (
            <button type="button" className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-primary px-3 text-xs text-primary hover:bg-primary/5"
              onClick={() => p.onCardTestInputChange(OPEN_METEO_EXAMPLE.input)}>填入杭州经纬度示例</button>
          )}
          <ToolRequestPreviewPanel preview={preflight} method={row.method === "GET" ? "GET" : "POST"} />
          {row.method !== "GET" && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-950">
              <input type="checkbox" aria-label="确认本次工具 POST 写入" checked={p.confirmCardWrite}
                onChange={event => p.onConfirmCardWriteChange(event.target.checked)} className="mt-0.5 accent-amber-700" />
              <span>此测试会向外部服务真实发送 POST，可能修改数据或产生费用。已确认本次参数。</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => p.onCardTest(row)}
            disabled={p.isTestingCard || preflight.errors.length > 0 || (row.method !== "GET" && !p.confirmCardWrite)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            {p.isTestingCard ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            发起真实调用
          </button>
          {p.cardTestResult && (
            <div className="mt-3">
              <ToolTestResultPanel result={p.cardTestResult} context={{method:row.method,url:row.url}} />
            </div>
          )}
        </div>
      )}

      {p.isPendingDelete && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-destructive bg-destructive/5 p-3">
          <span className="text-sm text-destructive">
            确认删除「{row.name}」？删除后引用它的方案将无法再调用该工具。
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={p.onCancelDelete}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-card-foreground"
            >
              <X className="h-3.5 w-3.5" />
              取消
            </button>
            <button
              type="button"
              onClick={p.onConfirmDelete}
              disabled={p.isBusy}
              className="inline-flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow transition hover:bg-destructive/90 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              确认删除
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
