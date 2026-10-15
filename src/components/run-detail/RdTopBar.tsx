import { Rocket, ScrollText } from "lucide-react"
import { Link } from "react-router-dom"
import { SitePageHeader } from "@/components/site/SitePageHeader"

export function RdTopBar() {
  return (
    <SitePageHeader
      icon={ScrollText}
      title="运行档案"
      badge="Agent Studio"
      actions={
        <Link
          to="/agent-run"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Rocket className="h-4 w-4" />
          <span className="hidden sm:inline">返回试跑</span>
        </Link>
      }
    />
  )
}
