import { Home, ListTree } from "lucide-react"
import { SitePageHeader } from "@/components/site/SitePageHeader"

type TopNavBarProps = {
  onGoMySpecs: () => void
}

export function TopNavBar({ onGoMySpecs }: TopNavBarProps) {
  return (
    <SitePageHeader
      icon={Home}
      title="首页"
      badge="助手工作台"
      actions={
        <button
          type="button"
          onClick={onGoMySpecs}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ListTree className="h-4 w-4" />
          <span className="hidden sm:inline">我的助手</span>
        </button>
      }
    />
  )
}
