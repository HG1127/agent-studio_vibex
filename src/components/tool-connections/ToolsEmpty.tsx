import { Globe, Loader2, Plus, Wrench } from "lucide-react"

type ToolsEmptyProps = {
  isLoadingList: boolean
  onAdd: () => void
}

export function ToolsEmpty({ isLoadingList, onAdd }: ToolsEmptyProps) {
  if (isLoadingList) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在加载工具列表…</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center shadow-md">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Wrench className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-card-foreground">还没有接入任何外部工具</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        任何能通过 HTTP 调用、返回文本或 JSON 的服务都能接进来：搜索接口、天气接口、你自己的业务接口、webhook
        都可以。接入后在首页方案里勾选，助手试跑时就会真实调用它。
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Plus className="h-4 w-4" />
        添加第一个工具
      </button>
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5 text-primary" />
        计算、总结、知识库检索是内置工具，无需接入、始终可用
      </p>
    </div>
  )
}
