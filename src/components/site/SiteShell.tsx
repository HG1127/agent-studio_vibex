import { useEffect, useLayoutEffect, type ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { SiteSidebar } from "@/components/site/SiteSidebar"
import { SectionTabs } from "@/components/site/SectionTabs"
import { StudioCommandPalette } from "@/components/site/StudioCommandPalette"
import {
  protectInternalLinkClick, recordRenderedStudioRoute,
} from "@/lib/unsavedNavigation"

type SiteShellProps = {
  children: ReactNode
}

export function SiteShell({ children }: SiteShellProps) {
  const location = useLocation()
  useLayoutEffect(() => {
    recordRenderedStudioRoute(
      location.pathname + location.search, window.history.state?.idx,
    )
  }, [location.pathname, location.search, location.key])
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      protectInternalLinkClick(event, window.location.href, message => window.confirm(message))
    }
    document.addEventListener("click", guard, true)
    return () => document.removeEventListener("click", guard, true)
  }, [])
  return (
    <div data-deployment-channel="ci-verified" data-auto-deploy-smoke="20261021-v2" className="flex min-h-screen bg-background text-foreground">
      <SiteSidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] pt-14 lg:pb-0 lg:pt-0">
        <SectionTabs />
        {children}
      </div>
      <StudioCommandPalette />
    </div>
  )
}
