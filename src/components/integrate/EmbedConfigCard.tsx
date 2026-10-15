import { Check, Code2, Copy, Globe, Loader2, Palette, Power, Save } from "lucide-react"
import type { ACCENT_PRESETS, POSITION_OPTIONS } from "@/pages/Integrate/useIntegrate"

type EmbedConfigCardProps = {
  hasAgent: boolean
  embedToken: string
  embedExists: boolean
  embedEnabled: boolean
  embedTitle: string
  setEmbedTitle: (v: string) => void
  embedPosition: string
  setEmbedPosition: (v: string) => void
  embedAccent: string
  setEmbedAccent: (v: string) => void
  isSavingEmbed: boolean
  isLoadingEmbed: boolean
  onSaveEmbed: () => void
  onToggleEmbed: (next: boolean) => void
  embedSnippet: string
  copiedField: string
  onCopy: (field: string, text: string) => void
  accentPresets: readonly (typeof ACCENT_PRESETS)[number][]
  positionOptions: readonly (typeof POSITION_OPTIONS)[number][]
}

export function EmbedConfigCard({
  hasAgent,
  embedToken,
  embedExists,
  embedEnabled,
  embedTitle,
  setEmbedTitle,
  embedPosition,
  setEmbedPosition,
  embedAccent,
  setEmbedAccent,
  isSavingEmbed,
  isLoadingEmbed,
  onSaveEmbed,
  onToggleEmbed,
  embedSnippet,
  copiedField,
  onCopy,
  accentPresets,
  positionOptions,
}: EmbedConfigCardProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Globe className="h-4 w-4 text-primary" />
            网页嵌入
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">生成悬浮球聊天窗，一行代码贴进任何网页</p>
        </div>
        {isLoadingEmbed && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        {!isLoadingEmbed && embedExists && (
          <button
            type="button"
            onClick={() => onToggleEmbed(!embedEnabled)}
            className={
              embedEnabled
                ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary"
                : "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-primary"
            }
          >
            <Power className="h-3.5 w-3.5" />
            {embedEnabled ? "已开启" : "已停用"}
          </button>
        )}
      </div>

      {!hasAgent ? (
        <p className="mt-2 rounded-2xl border border-dashed border-border bg-secondary/50 p-4 text-xs leading-relaxed text-muted-foreground">
          先在左侧选择一个已发布的助手，这里会为它生成嵌入配置。
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-card-foreground" htmlFor="embed-title-input">
              聊天窗标题
            </label>
            <input
              id="embed-title-input"
              value={embedTitle}
              onChange={(ev) => setEmbedTitle(ev.target.value.slice(0, 40))}
              placeholder="默认用助手名称，最多 40 字"
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>

          <div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-card-foreground">
              <Palette className="h-3.5 w-3.5 text-primary" />
              主题色
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {accentPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setEmbedAccent(preset.id)}
                  className={
                    embedAccent === preset.id
                      ? "rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary"
                      : "rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-card-foreground">悬浮球位置</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {positionOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEmbedPosition(opt.id)}
                  className={
                    embedPosition === opt.id
                      ? "rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary"
                      : "rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onSaveEmbed}
            disabled={isSavingEmbed}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingEmbed ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {embedExists ? "保存嵌入配置" : "生成嵌入代码"}
          </button>

          {embedToken && (
            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-card-foreground">
                <Code2 className="h-3.5 w-3.5 text-primary" />
                嵌入代码（贴到目标网页 body 末尾）
              </span>
              <div className="mt-1.5 flex items-start gap-2 rounded-2xl border border-border bg-secondary/60 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-secondary-foreground">
                  {embedSnippet}
                </code>
                <button
                  type="button"
                  onClick={() => onCopy("embedSnippet", embedSnippet)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-card-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {copiedField === "embedSnippet" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedField === "embedSnippet" ? "已复制" : "复制"}
                </button>
              </div>
              {!embedEnabled && (
                <p className="mt-2 text-xs text-destructive">嵌入当前处于停用状态，外部页面打开会提示已停用；点击右上角开关可恢复。</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
