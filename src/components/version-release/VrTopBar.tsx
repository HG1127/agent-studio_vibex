import { GitBranch } from "lucide-react"
import { SitePageHeader } from "@/components/site/SitePageHeader"

export function VrTopBar() {
  return <SitePageHeader icon={GitBranch} title="版本发布" badge="Agent Studio" />
}
