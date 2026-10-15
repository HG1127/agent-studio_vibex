import { BookOpen, Calculator, FileText, Globe, Play, Search } from "lucide-react"
import type { ActiveDebugTarget, BuiltinToolMeta } from "@/pages/ToolHub/useToolHub"

const ICON_MAP = {
  calculator: Calculator,
  summarize: FileText,
  knowledge: BookOpen,
  fetch: Globe,
  search: Search,
} as const

type BuiltinToolCardsProps = {
  tools: BuiltinToolMeta[]
  activeTarget: ActiveDebugTarget
  onOpenDebug: (toolId: string) => void
}

export function BuiltinToolCards({ tools, activeTarget, onOpenDebug }: BuiltinToolCardsProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 pb-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-card-foreground">内置工具五件套</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">执行引擎真实实现，点击卡片打开调试台试跑</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {tools.length} 项可用
        </span>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tools.map((tool) => {
          const Icon = ICON_MAP[tool.iconKey]
          const isActive = Boolean(activeTarget && activeTarget.kind === "builtin" && activeTarget.id === tool.id)
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onOpenDebug(tool.id)}
              className={`group flex flex-col rounded-xl border p-4 text-left transition hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
                  : "border-border bg-background hover:border-primary/40"
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
                {tool.title}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{tool.id}</code>
              </span>
              <span className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{tool.desc}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                <Play className="h-3 w-3" />
                填参试跑
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
