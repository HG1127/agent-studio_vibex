import { Link, useLocation } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { getStudioAccountInfo } from "@/lib/studioAuth"
import { workspaceForPath } from "@/lib/studioNavigation"

/**
 * Context breadcrumb instead of a second eight-tab navigation bar.
 * All direct links live in the five-space sidebar / mobile navigation.
 */
export function SectionTabs() {
  const pathname=useLocation().pathname
  const role=getStudioAccountInfo()?.role === "admin" ? "admin" : "employee"
  const workspace=workspaceForPath(pathname,role)
  if (!workspace || pathname === "/") return null
  const current=workspace.children.find(item=>item.to===pathname)
  return (
    <nav aria-label="当前位置" className="hidden h-10 shrink-0 items-center gap-2 border-b border-border bg-card/60 px-5 text-xs text-muted-foreground lg:flex">
      <Link to="/" className="hover:text-foreground">Agent Studio</Link>
      <ChevronRight className="h-3.5 w-3.5"/>
      <Link to={workspace.to} className="hover:text-primary">{workspace.label}</Link>
      {current && current.to!==workspace.to && <>
        <ChevronRight className="h-3.5 w-3.5"/>
        <span aria-current="page" className="font-semibold text-foreground">{current.label}</span>
      </>}
    </nav>
  )
}
