import type { ReactNode } from "react"
import { SiteSidebar } from "@/components/site/SiteSidebar"
import { SectionTabs } from "@/components/site/SectionTabs"

type SiteShellProps = {
  children: ReactNode
}

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <SiteSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <SectionTabs />
        {children}
      </div>
    </div>
  )
}
