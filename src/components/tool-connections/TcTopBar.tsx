import { Wrench } from "lucide-react"
import { SitePageHeader } from "@/components/site/SitePageHeader"

export function TcTopBar() {
  return <SitePageHeader icon={Wrench} title="工具连接" badge="Agent Studio" />
}
