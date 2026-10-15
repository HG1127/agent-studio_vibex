import { CheckCircle2, Crosshair, ListChecks, PackageCheck, Wrench } from "lucide-react"
import type { AgentSpec } from "@/pages/Home/useHome"

type TemplateDetailPanelProps = {
  spec: AgentSpec | null
}

function DetailList({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
        {icon}
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TemplateDetailPanel({ spec }: TemplateDetailPanelProps) {
  if (!spec) {
    return (
      <div className="mt-4 rounded-2xl bg-muted p-4 text-xs text-muted-foreground">
        这个模板的方案摘要暂不可用。
      </div>
    )
  }
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-dashed border-border bg-muted/50 p-4">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
          <Crosshair className="h-3.5 w-3.5 text-primary" />
          目标
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{spec.goal || "—"}</p>
      </div>
      {spec.task_scope && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
            <PackageCheck className="h-3.5 w-3.5 text-primary" />
            任务范围
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{spec.task_scope}</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailList title="交付物" icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />} items={spec.deliverables} />
        <DetailList title="用到的工具" icon={<Wrench className="h-3.5 w-3.5 text-primary" />} items={spec.tools} />
      </div>
      <DetailList title="任务计划" icon={<ListChecks className="h-3.5 w-3.5 text-primary" />} items={spec.task_plan} />
      <DetailList title="完成条件" icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />} items={spec.done_criteria} />
    </div>
  )
}
