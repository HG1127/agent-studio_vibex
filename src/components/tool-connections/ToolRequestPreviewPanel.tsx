import { AlertTriangle, CheckCircle2, Info } from "lucide-react"
import type { ToolHttpMethod, ToolRequestPreview } from "@/lib/toolConnectionUx"

type Props = { preview: ToolRequestPreview; method: ToolHttpMethod }

export function ToolRequestPreviewPanel({ preview, method }: Props) {
  const hasErrors = preview.errors.length > 0
  return (
    <section aria-label="请求配置检查" aria-live="polite" className="mt-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-card-foreground">调用前检查</span>
        {hasErrors ? (
          <span className="inline-flex items-center gap-1 font-medium text-destructive"><AlertTriangle size={13} />需修改 {preview.errors.length} 项</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-primary"><CheckCircle2 size={13} />格式检查通过</span>
        )}
      </div>
      <p className="mt-1.5 break-words text-xs text-muted-foreground">
        {method} 请求 · {preview.host || "尚未填写有效域名"}
        {preview.queryKeys.length ? " · URL 查询参数：" + preview.queryKeys.join("、") : ""}
      </p>
      {preview.placeholders.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          需要的测试字段：{preview.placeholders.join("、")}
        </p>
      )}
      {preview.errors.map(message => (
        <p key={message} className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
          <AlertTriangle className="mt-0.5 shrink-0" size={13} />{message}
        </p>
      ))}
      {preview.warnings.map(message => (
        <p key={message} className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 shrink-0" size={13} />{message}
        </p>
      ))}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        这里只检查格式与占位符，不发送网络请求；不会展示 URL 参数值或密钥。接口权限和返回结果需通过真实测试确认。
      </p>
    </section>
  )
}
