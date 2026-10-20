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
    title: "服务端模型调用预算",
    desc: "运行前设置模型请求上限，每次调用在发出前写入预算检查点；Token/费用仍为估算",
  },
  {
    icon: RefreshCw,
    title: "安全重试与写入保护",
    desc: "只读工具可按策略在网络故障时重试一次；外部写操作不自动重放不确定结果",
  },
  {
    icon: Layers,
    title: "任务来源线索保留",
    desc: "压缩旧步骤时仍保留检索来源 URL 与知识片段引用，明确区分已检索和已核验",
  },
  {
    icon: ShieldCheck,
    title: "调用审计与安全校验",
    desc: "两种引擎共用参数预检和风险策略；写入审批绑定工具、参数与目标配置，发生变化需重新确认",
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
