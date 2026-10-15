import { Activity, BarChart3, CalendarClock, CheckCircle2, Globe, KeyRound, Timer, XCircle } from "lucide-react"
import type { StatsData } from "@/pages/Integrate/useIntegrate"

type InvocationStatsRowProps = {
  statsRow: StatsData | null
}

const CARD_CLS = "flex flex-1 flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-md"

export function InvocationStatsRow({ statsRow }: InvocationStatsRowProps) {
  const total = statsRow?.total ?? 0
  return (
    <section>
      <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
        <BarChart3 className="h-4 w-4 text-primary" />
        集成调用概览
        {statsRow && total > 0 && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            成功率 {statsRow.success_rate}%
          </span>
        )}
      </h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <div className={CARD_CLS}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            累计调用
          </span>
          <span className="text-2xl font-bold text-card-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">运行中 {statsRow?.running ?? 0}</span>
        </div>
        <div className={CARD_CLS}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            成功
          </span>
          <span className="text-2xl font-bold text-card-foreground">{statsRow?.success ?? 0}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <XCircle className="h-3 w-3" />
            失败 {statsRow?.failed ?? 0}
          </span>
        </div>
        <div className={CARD_CLS}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-primary" />
            今日调用
          </span>
          <span className="text-2xl font-bold text-card-foreground">{statsRow?.today ?? 0}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="h-3 w-3" />
            每分钟同凭证最多 6 次
          </span>
        </div>
        <div className={CARD_CLS}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5 text-primary" />
            来源分布
          </span>
          <span className="text-2xl font-bold text-card-foreground">
            {statsRow?.source_embed ?? 0}
            <span className="text-sm font-medium text-muted-foreground"> / {statsRow?.source_api ?? 0}</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <KeyRound className="h-3 w-3" />
            网页嵌入 / API 钥匙
          </span>
        </div>
      </div>
    </section>
  )
}
