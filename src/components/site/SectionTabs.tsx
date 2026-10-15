import { Link, useLocation } from "react-router-dom"

type SectionTab = { to: string; label: string }

type SiteSection = {
  key: string
  tabs: SectionTab[]
  extraPaths: string[]
}

// 站点四大分区：侧栏只露四个入口，分区内各页共用一条页签栏互相串联。
const SITE_SECTIONS: SiteSection[] = [
  {
    key: "run",
    tabs: [
      { to: "/internal-overview", label: "内部总览" },
      { to: "/internal-templates", label: "Agent 内部共享" },
      { to: "/agent-collaboration", label: "多人 Agent 协作" },
      { to: "/manager", label: "公司运行与审批" },
      { to: "/agent-run", label: "助手试跑" },
      { to: "/workflow-canvas", label: "工作流编排" },
      { to: "/scheduled-tasks", label: "定时任务" },
    ],
    extraPaths: ["/run-detail"],
  },
  {
    key: "capability",
    tabs: [
      { to: "/model-connections", label: "模型连接" },
      { to: "/knowledge-bases", label: "知识库" },
      { to: "/tool-connections", label: "工具连接" },
      { to: "/plugin-market", label: "插件市场" },
      { to: "/template-market", label: "模板市场" },
      { to: "/tool-hub", label: "调试监控" },
    ],
    extraPaths: [],
  },
  {
    key: "release",
    tabs: [
      { to: "/version-release", label: "版本发布" },
      { to: "/integrate", label: "对外集成" },
    ],
    extraPaths: [],
  },
]

function findSectionByPath(path: string): SiteSection | undefined {
  return SITE_SECTIONS.find(
    (section) =>
      section.tabs.some((tab) => tab.to === path) || section.extraPaths.includes(path),
  )
}

export function SectionTabs() {
  const currentPath = useLocation().pathname
  const section = findSectionByPath(currentPath)
  if (!section) return null

  return (
    <div
      className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-card px-4 pt-2"
      role="tablist"
      aria-label="分区页签"
    >
      {section.tabs.map((tab) => {
        const isActive = tab.to === currentPath
        return (
          <Link
            key={tab.to}
            to={tab.to}
            role="tab"
            aria-selected={isActive}
            className={
              isActive
                ? "shrink-0 border-b-2 border-primary px-3 pb-2 text-sm font-medium text-primary"
                : "shrink-0 border-b-2 border-transparent px-3 pb-2 text-sm text-muted-foreground transition hover:text-card-foreground"
            }
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
