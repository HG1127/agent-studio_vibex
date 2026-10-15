import { Activity, Brain, Cpu, Layers, RefreshCw, ShieldCheck } from "lucide-react"
import { HarnessMonitor } from "@/components/tool-hub/HarnessMonitor"
import type { HubStats, MonitorData } from "@/pages/ToolHub/useToolHub"

type HarnessPanelProps = {
  hubStats: HubStats | null
  monitorData: MonitorData | null
  monitorLoading: boolean
  onRefreshMonitor: () => void
}

const CAPABILITIES = [
  {
    icon: Brain,
    title: "思考-行动-观察 三段式",
    desc: "助手每一步都会记录思考、执行的动作与观察到的结果，运行档案里可逐步回看",
  },
  {
    icon: RefreshCw,
    title: "网络类失败自动重试",
    desc: "网页抓取、外部工具遇到超时或网络错误会自动重试 1 次，记录里标注重试状态",
  },
  {
    icon: Layers,
    title: "长任务上下文压缩",
    desc: "观察内容超过 8000 字符时自动摘要早期步骤，长任务不会因上下文过长而中断",
  },
  {
    icon: ShieldCheck,
    title: "全量调用留档",
    desc: "内置与外部工具的每次调用都写入调用记录，按账号隔离，可追溯耗时与成败",
  },
]

export function HarnessPanel({ hubStats, monitorData, monitorLoading, onRefreshMonitor }: HarnessPanelProps) {
  const statItems = [
    { label: "累计运行", value: hubStats?.run_count ?? 0, hint: `助手 ${hubStats?.agent_run_count ?? 0} · 工作流 ${hubStats?.workflow_run_count ?? 0}` },
    { label: "工具调用", value: hubStats?.invocation_count ?? 0, hint: `外部工具 ${hubStats?.external_invocation_count ?? 0} 次` },
    { label: "成功", value: hubStats?.success_count ?? 0, hint: `重试后成功 ${hubStats?.retried_count ?? 0} 次` },
    { label: "失败", value: hubStats?.failed_count ?? 0, hint: "失败详情见调用记录" },
  ]
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <header className="flex min-h-10 shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-card-foreground">执行引擎能力面板</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">当前账号的真实执行数据与引擎能力说明</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Cpu className="h-4 w-4" />
        </span>
      </header>
      <div className="mt-3 grid grid-cols-2 divide-border rounded-xl border border-border bg-background lg:grid-cols-4 lg:divide-x">
        {statItems.map((item) => (
          <div key={item.label} className="px-4 py-2.5">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3 text-primary" />
              {item.label}
            </p>
            <p className="mt-0.5 text-xl font-bold tracking-tight text-card-foreground">{item.value}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.hint}>{item.hint}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CAPABILITIES.map((cap) => (
          <li key={cap.title} className="flex items-start gap-2 rounded-lg bg-secondary/50 px-3 py-2">
            <cap.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-card-foreground">{cap.title}</span>：{cap.desc}
            </p>
          </li>
        ))}
      </ul>
      <HarnessMonitor monitorData={monitorData} monitorLoading={monitorLoading} onRefreshMonitor={onRefreshMonitor} />
    </section>
  )
}
