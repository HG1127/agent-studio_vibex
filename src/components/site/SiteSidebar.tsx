import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Blocks,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  GitBranch,
  Home,
  LayoutDashboard,
  UsersRound,
  Rocket,
  UserRound,
} from "lucide-react"
import { StudioAccountMenu } from "@/components/site/StudioAccountMenu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const SITE_NAV_COLLAPSED_KEY = "site-nav-collapsed"

// 四个一级入口；match 列出该分区下全部路径（含页签成员与详情页），用于高亮。
const NAV_ITEMS = [
  { to: "/internal-overview", label: "内部总览", icon: LayoutDashboard, match: ["/internal-overview"] },
  { to: "/internal-templates", label: "Agent 内部共享", icon: UsersRound, match: ["/internal-templates"] },
  { to: "/agent-collaboration", label: "多人 Agent 协作", icon: UsersRound, match: ["/agent-collaboration"] },
  { to: "/staff", label: "员工与权限", icon: UserRound, match: ["/staff"] },
  { to: "/manager", label: "公司运行与审批", icon: LayoutDashboard, match: ["/manager"] },
  { to: "/", label: "工作台", icon: Home, match: ["/"] },
  {
    to: "/agent-run",
    label: "运行与执行",
    icon: Rocket,
    match: ["/agent-run", "/workflow-canvas", "/run-detail", "/scheduled-tasks"],
  },
  {
    to: "/model-connections",
    label: "能力与连接",
    icon: Blocks,
    match: ["/model-connections", "/knowledge-bases", "/tool-connections", "/plugin-market", "/template-market", "/tool-hub"],
  },
  {
    to: "/version-release",
    label: "发布与集成",
    icon: GitBranch,
    match: ["/version-release", "/integrate"],
  },
]

function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SITE_NAV_COLLAPSED_KEY) === "1"
  } catch {
    return false
  }
}

export function SiteSidebar() {
  const [navCollapsed, setNavCollapsed] = useState<boolean>(readNavCollapsed)
  const currentPath = useLocation().pathname

  const applyNavCollapsed = (next: boolean) => {
    setNavCollapsed(next)
    try {
      window.localStorage.setItem(SITE_NAV_COLLAPSED_KEY, next ? "1" : "0")
    } catch {
      // 本地存储不可用时静默降级为会话内状态
    }
  }

  const itemClass = (isActive: boolean) =>
    isActive
      ? "flex w-full items-center gap-2.5 rounded-lg bg-primary/10 px-2.5 py-2 font-medium text-primary transition focus-visible:ring-2 focus-visible:ring-primary"
      : "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"

  return (
    <aside
      className={`sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ${
        navCollapsed ? "w-16" : "w-16 md:w-60"
      }`}
      aria-label="站点导航"
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <Bot className="h-4 w-4" />
        </span>
        <span
          className={`truncate text-sm font-semibold tracking-tight text-card-foreground ${
            navCollapsed ? "hidden" : "hidden md:inline"
          }`}
        >
          Agent Studio
        </span>
      </div>

      <TooltipProvider delayDuration={150}>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match.includes(currentPath)
            const linkClass = itemClass(isActive)
            const linkInner = (
              <>
                <item.icon className="h-4 w-4 shrink-0" />
                <span className={`truncate text-sm ${navCollapsed ? "hidden" : "hidden md:inline"}`}>
                  {item.label}
                </span>
              </>
            )
            return navCollapsed ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <Link to={item.to} className={linkClass} aria-current={isActive ? "page" : undefined}>
                    {linkInner}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <Link key={item.to} to={item.to} className={linkClass} aria-current={isActive ? "page" : undefined}>
                {linkInner}
              </Link>
            )
          })}
        </nav>

        <div className="shrink-0 border-t border-border p-2">
          {navCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => applyNavCollapsed(false)}
                  aria-label="展开侧栏查看账号"
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <UserRound className="h-4 w-4 shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">账号 · 点击展开侧栏</TooltipContent>
            </Tooltip>
          ) : (
            <div className="min-w-0 overflow-hidden px-0.5 pb-1">
              <StudioAccountMenu />
            </div>
          )}
          <button
            type="button"
            onClick={() => applyNavCollapsed(!navCollapsed)}
            aria-label={navCollapsed ? "展开侧栏" : "折叠侧栏"}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            {navCollapsed ? (
              <ChevronsRight className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">收起侧栏</span>
              </>
            )}
          </button>
        </div>
      </TooltipProvider>
    </aside>
  )
}
