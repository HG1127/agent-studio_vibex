import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

type SitePageHeaderProps = {
  icon: LucideIcon
  title: string
  badge?: string
  actions?: ReactNode
}

export function SitePageHeader({ icon: Icon, title, badge = "", actions = null }: SitePageHeaderProps) {
  return (
    <div className="flex h-12 w-full min-w-0 items-center justify-between gap-3 px-3 sm:px-5 lg:px-7 2xl:px-10">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h1 className="truncate text-sm font-semibold text-card-foreground">{title}</h1>
        {badge && (
          <span className="hidden shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground sm:inline">
            {badge}
          </span>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
