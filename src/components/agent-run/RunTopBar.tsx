import { ArrowLeft, Rocket, Save } from "lucide-react"
import { Link } from "react-router-dom"
import { SitePageHeader } from "@/components/site/SitePageHeader"

type RunTopBarProps = {
  // 当前选中的方案 id；有值时页内头显示「存为版本」快捷入口（→ /version-release?spec=<id>）
  saveVersionSpecId?: string
  acceptanceRunId?: string
}

export function RunTopBar({ saveVersionSpecId = "",acceptanceRunId="" }: RunTopBarProps) {
  return (
    <SitePageHeader
      icon={Rocket}
      title="配置与试跑"
      badge="Agent Studio"
      actions={
        saveVersionSpecId ? (
          <span className="flex flex-wrap items-center gap-2">
            {acceptanceRunId && <Link
              to={`/version-release?spec=${encodeURIComponent(saveVersionSpecId)}&testRun=${encodeURIComponent(acceptanceRunId)}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
              <ArrowLeft className="h-4 w-4"/>返回本次验收
            </Link>}
            <Link to={`/agent-create?spec=${encodeURIComponent(saveVersionSpecId)}&step=4`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary">
              <ArrowLeft className="h-4 w-4"/>返回创建向导
            </Link>
            <Link to={`/version-release?spec=${encodeURIComponent(saveVersionSpecId)}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Save className="h-4 w-4" />版本验收
            </Link>
          </span>
        ) : null
      }
    />
  )
}
