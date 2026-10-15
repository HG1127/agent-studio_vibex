import { PlugZap, Plus } from "lucide-react"

type ConnectionsEmptyProps = {
  isLoadingList: boolean
  onAdd: () => void
}

export function ConnectionsEmpty({ isLoadingList, onAdd }: ConnectionsEmptyProps) {
  if (isLoadingList) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">正在加载你的模型连接…</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center shadow-sm">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <PlugZap className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-card-foreground">
        还没有模型连接
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        添加你自己的模型服务，助手试跑时就能选用你自己的模型。
        Base URL 是服务商给你的接口入口地址，API Key 是服务商发放的访问密钥。
        支持三种接口类型：
      </p>
      <div className="mt-4 grid w-full max-w-md gap-2 text-left">
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="text-xs font-semibold text-card-foreground">OpenAI 兼容</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            DeepSeek / Kimi / 智谱 / 百炼 / OpenRouter / Ollama 等兼容接口
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="text-xs font-semibold text-card-foreground">Anthropic Claude</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Claude 官方接口，地址留空即用官方默认地址
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="text-xs font-semibold text-card-foreground">Google Gemini</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Gemini 官方接口，地址留空即用官方默认地址
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Plus className="h-4 w-4" />
        添加第一个连接
      </button>
    </div>
  )
}
