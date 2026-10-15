import { Rocket, Save } from "lucide-react"
import { Link } from "react-router-dom"
import { SitePageHeader } from "@/components/site/SitePageHeader"

type RunTopBarProps = {
  // 当前选中的方案 id；有值时页内头显示「存为版本」快捷入口（→ /version-release?spec=<id>）
  saveVersionSpecId?: string
}

export function RunTopBar({ saveVersionSpecId = "" }: RunTopBarProps) {
  return (
    <SitePageHeader
      icon={Rocket}
      title="配置与试跑"
      badge="Agent Studio"
      actions={
        saveVersionSpecId ? (
          <Link
            to={`/version-release?spec=${encodeURIComponent(saveVersionSpecId)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">存为版本</span>
          </Link>
        ) : null
      }
    />
  )
}
