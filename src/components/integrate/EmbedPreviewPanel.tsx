import { Eye, Globe } from "lucide-react"

type EmbedPreviewPanelProps = {
  embedPreviewUrl: string
  embedEnabled: boolean
  embedExists: boolean
}

export function EmbedPreviewPanel({ embedPreviewUrl, embedEnabled, embedExists }: EmbedPreviewPanelProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Eye className="h-4 w-4 text-primary" />
            嵌入页实时预览
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">这就是访客在你网页里打开的真实聊天页，可直接对话</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground sm:inline-flex">
          <Globe className="h-3 w-3 text-primary" />
          真实链路
        </span>
      </div>
      {embedPreviewUrl ? (
        <div className="mt-2 overflow-hidden rounded-2xl border border-border shadow-lg">
          <iframe
            src={embedPreviewUrl}
            title="嵌入聊天页预览"
            className="h-[520px] w-full bg-background"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
      ) : (
        <div className="mt-2 flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/50 text-center">
          <Globe className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-medium text-card-foreground">
            {embedExists ? "正在加载嵌入预览…" : "还没有嵌入代码"}
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            {embedExists ? "" : "在左侧「网页嵌入」卡片点击「生成嵌入代码」，这里会立即出现可对话的真实预览。"}
          </p>
        </div>
      )}
      {embedPreviewUrl && !embedEnabled && (
        <p className="mt-2 text-xs text-destructive">嵌入已停用，预览会显示停用提示页；开启后即恢复对话。</p>
      )}
    </section>
  )
}
