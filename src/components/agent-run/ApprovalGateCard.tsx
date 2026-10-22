import { AlertTriangle, ShieldCheck, ShieldQuestion } from "lucide-react"
import type { AgentRunRow, PendingApproval } from "@/pages/AgentRun/useAgentRun"
import type { VerifiedMarketTool } from "@/lib/marketToolSelection"
import { projectAgentApprovalPresentation } from "@/lib/agentApprovalPresentation"

type ApprovalGateCardProps = {
  pendingApproval: PendingApproval
  activeRun: AgentRunRow | null
  marketTools: VerifiedMarketTool[]
  approvalBusy: "" | "approve" | "reject"
  onDecision: (approvalDecision: "approve" | "reject") => void
}

/** Explain the pending exact operation in the context of this frozen run. */
export function ApprovalGateCard({ pendingApproval, activeRun, marketTools, approvalBusy, onDecision }: ApprovalGateCardProps) {
  if (!pendingApproval) return null
  const stepLabel = pendingApproval.stepIndex > 0 ? `第 ${pendingApproval.stepIndex} 步` : "当前步"
  const marketPlugin = pendingApproval.toolName.startsWith("mkt__")
  const info = projectAgentApprovalPresentation(pendingApproval.toolName, activeRun, marketTools)
  return (
    <section aria-label="待处理的工具审批" className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border-2 border-primary bg-card p-5 shadow-lg duration-500">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldQuestion className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">
          {stepLabel}{marketPlugin ? "将调用市场插件，需要你确认" : "将执行外部写操作，需要你批准"}
        </h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">等待批准</span>
      </div>
      {info.roleLabel && <p className="mt-3 text-xs font-medium text-primary">
        负责阶段：{info.roleLabel}{info.nextRoleName && <span className="ml-2 font-normal text-muted-foreground">· 接下来：{info.nextRoleName}</span>}
      </p>}
      <div className="mt-3 rounded-xl bg-secondary/60 p-3.5">
        <p className="text-xs text-muted-foreground">将要调用的工具</p>
        <p className="mt-1 break-words text-sm font-semibold text-card-foreground">{info.toolLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">来源：{info.toolSource}</p>
        <p className="mt-1 text-xs font-medium text-foreground">{info.toolAccess}</p>
        {info.toolLabel !== info.toolId && <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">核对实际工具标识</summary>
          <code className="mt-2 block break-all rounded-md border border-border bg-background p-2 text-muted-foreground">{info.toolId}</code>
        </details>}
        {pendingApproval.argsSummary && <>
          <p className="mt-3 text-xs text-muted-foreground">本次调用参数摘要</p>
          <p className="mt-1 break-all font-mono text-xs text-card-foreground">{pendingApproval.argsSummary}</p>
        </>}
      </div>
      {info.warning && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50/40 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />{info.warning}
      </p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onDecision("approve")} disabled={approvalBusy !== ""}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary">
          <ShieldCheck className="h-4 w-4" />{approvalBusy === "approve" ? "提交中…" : "批准并继续执行"}
        </button>
        <button type="button" onClick={() => onDecision("reject")} disabled={approvalBusy !== ""}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary">
          {approvalBusy === "reject" ? "提交中…" : "拒绝这次调用"}
        </button>
        <p className="w-full text-xs leading-relaxed text-muted-foreground">
          {marketPlugin ? "插件声明是连接提供的信息，不代表已独立审计其行为。审批仅对本次工具、参数和目标有效；任何变更都需再次审批。" :
            "本次批准仅适用于当前工具、参数与连接目标；变更后须再次审批。拒绝后 Agent 会尝试调整计划。"}
        </p>
      </div>
    </section>
  )
}