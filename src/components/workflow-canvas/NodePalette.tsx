import { Bot, Flag, GitBranch, GripVertical, Play, Repeat, Sparkles, Wrench } from "lucide-react"
import type { WfNodeType } from "@/pages/WorkflowCanvas/useWorkflowCanvas"
import { NODE_TYPE_META } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

const TYPE_ICONS: Record<WfNodeType, typeof Play> = {
  start: Play,
  model: Sparkles,
  tool: Wrench,
  agent: Bot,
  condition: GitBranch,
  loop: Repeat,
  end: Flag,
}

const TYPE_ORDER: WfNodeType[] = ["start", "model", "tool", "agent", "condition", "loop", "end"]

type NodePaletteProps = {
  addNodeByType: (type: WfNodeType) => void
}

export function NodePalette({ addNodeByType }: NodePaletteProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <h3 className="text-sm font-semibold tracking-tight text-card-foreground">节点面板</h3>
      <p className="mt-1 text-xs text-muted-foreground">拖到画布，或点击直接添加</p>
      <div className="mt-3 space-y-2">
        {TYPE_ORDER.map((type) => {
          const meta = NODE_TYPE_META[type]
          const Icon = TYPE_ICONS[type]
          return (
            <div
              key={type}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/wf-node", type)
                event.dataTransfer.effectAllowed = "move"
              }}
              onClick={() => addNodeByType(type)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") addNodeByType(type)
              }}
              className="group flex cursor-grab items-center gap-2.5 rounded-xl border border-border bg-background p-2.5 transition hover:border-primary hover:shadow-md active:cursor-grabbing"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:scale-105">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-card-foreground">{meta.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{meta.blurb}</span>
              </span>
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
