/**
 * Single navigation registry for sidebar, mobile menu, context breadcrumb and
 * Ctrl/Cmd+K. Never use UI membership as authorization: every backend route
 * must still enforce the verified studio_users identity and its own ACL.
 */
import type { LucideIcon } from "lucide-react"
import {
  Bot, BookOpen, CalendarClock, ClipboardCheck, GitBranch, Home,
  LayoutGrid, Library, Network, PlayCircle, Plug, Puzzle, Rocket,
  SearchCheck, Settings2, ShieldCheck, Sparkles, Store, UsersRound,
  Workflow, Wrench, Monitor,
} from "lucide-react"

export type StudioRoute = {
  to: string
  label: string
  icon: LucideIcon
  keywords?: string
  adminOnly?: boolean
}
export type StudioWorkspace = StudioRoute & {
  children: StudioRoute[]
}

export const STUDIO_WORKSPACES: StudioWorkspace[] = [
  {
    to: "/", label: "工作台", icon: Home,
    keywords: "首页 最近任务 我的Agent", children: [
      {to: "/",label: "我的工作台",icon: LayoutGrid,keywords:"首页 我的助手 最近"},
    ],
  },
  {
    to: "/agent-create", label: "设计与编排", icon: Sparkles,
    keywords: "创建助手 Agent workflow 编辑", children: [
      {to:"/agent-create",label:"设计 Agent",icon: Bot,keywords:"创建 助手 引导创建 生成方案 新手 角色分工"},
      {to:"/workflow-canvas",label:"工作流编排",icon: Workflow,keywords:"workflow 节点 流程图"},
      {to:"/template-market",label:"模板中心",icon: Store},
      {to:"/internal-templates",label:"团队共享 Agent",icon: UsersRound},
      {to:"/agent-collaboration",label:"成员协作与评审",icon: Network,keywords:"多人 Agent 协作 员工 编辑"},
      {to:"/version-release",label:"版本与发布",icon: GitBranch},
      {to:"/integrate",label:"发布后集成",icon: Plug},
    ],
  },
  {
    to: "/model-connections", label: "工具与连接", icon: Library,
    keywords: "资源 模型 知识库 插件 工具", children: [
      {to:"/model-connections",label:"模型连接",icon: Sparkles,keywords:"LLM API"},
      {to:"/knowledge-bases",label:"知识库",icon: BookOpen,keywords:"RAG 语义检索"},
      {to:"/skills",label:"Skills 能力中心",icon: BookOpen,keywords:"SKILL.md 方法 思维视角 导入 角色绑定"},
      {to:"/tool-connections",label:"工具连接",icon: Wrench},
      {to:"/plugin-market",label:"插件市场",icon: Puzzle},
      {to:"/execution-connections",label:"电脑与浏览器",icon:Monitor,keywords:"执行器 软件 本地 browser desktop MCP"},
    ],
  },
  {
    to: "/agent-run", label: "运行与验收", icon: PlayCircle,
    keywords: "执行 调试 监控 历史", children: [
      {to:"/agent-run",label:"Agent 试跑",icon: Rocket},
      {to:"/run-detail",label:"执行记录",icon: ClipboardCheck},
      {to:"/harness",label:"运行监控",icon: SearchCheck,keywords:"Harness 治理 监控 心跳 队列 人工核查 历史"},
      {to:"/scheduled-tasks",label:"定时任务",icon: CalendarClock},
      {to:"/tool-hub",label:"诊断与工具调试",icon: SearchCheck},
    ],
  },
  {
    to: "/manager", label: "管理中心", icon: ShieldCheck,
    keywords: "管理员 员工 权限 审批", adminOnly:true, children: [
      {to:"/manager",label:"运行与审批",icon: ShieldCheck,adminOnly:true},
      {to:"/staff",label:"员工与权限",icon: UsersRound,adminOnly:true},
      {to:"/internal-overview",label:"公司总览",icon: Settings2,adminOnly:true},
    ],
  },
]

export type StudioRole = "admin" | "employee"
export function workspacesForRole(role: StudioRole): StudioWorkspace[] {
  return STUDIO_WORKSPACES.filter(workspace => !workspace.adminOnly || role === "admin")
}

export function routesForRole(role: StudioRole): StudioRoute[] {
  return workspacesForRole(role).flatMap(workspace => workspace.children)
}

/** An unknown path may exist, but is not automatically added to employee navigation. */
export function workspaceForPath(pathname: string, role: StudioRole): StudioWorkspace | undefined {
  return workspacesForRole(role).find(workspace =>
    workspace.children.some(route => route.to === pathname))
}

/** Cheap stable search for <= 25 routes: more exact matches come first. */
export function searchStudioRoutes(query: string, role: StudioRole): StudioRoute[] {
  const q=query.trim().toLocaleLowerCase()
  const routes=routesForRole(role)
  if (!q) return routes.slice(0,9)
  return routes.map((route,index) => {
    const name=route.label.toLocaleLowerCase()
    const terms=(route.keywords||"").toLocaleLowerCase()
    const score=name===q?100:name.startsWith(q)?80:
      name.includes(q)?60:terms.includes(q)?30:-1
    return {route,score,index}
  }).filter(item=>item.score>=0)
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .slice(0,12).map(item=>item.route)
}
