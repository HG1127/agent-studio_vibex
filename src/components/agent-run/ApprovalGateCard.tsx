import { ShieldCheck, ShieldQuestion } from "lucide-react"
import type { PendingApproval } from "@/pages/AgentRun/useAgentRun"

type ApprovalGateCardProps = {
  pendingApproval: PendingApproval
  approvalBusy: "" | "approve" | "reject"
  onDecision: (approvalDecision: "approve" | "reject") => void
}

// 审批门卡片：run 处于 awaiting_approval 时展示待批调用，批准/拒绝二选一
export function ApprovalGateCard({ pendingApproval, approvalBusy, onDecision }: ApprovalGateCardProps) {
  if (!pendingApproval) return null
  const stepLabel = pendingApproval.stepIndex > 0 ? `第 ${pendingApproval.stepIndex} 步` : "当前步"
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border-2 border-primary bg-card p-5 shadow-lg duration-500">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldQuestion className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">
          {stepLabel}想执行一个写操作，需要你批准
        </h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          等待批准
        </span>
      </div>
      <div className="mt-3 rounded-xl bg-secondary/60 p-3.5">
        <p className="text-xs text-muted-foreground">将要调用的工具</p>
        <p className="mt-1 font-mono text-sm font-semibold text-card-foreground">
          {pendingApproval.toolName || "（未提供工具名）"}
        </p>
        {pendingApproval.argsSummary && (
          <>
            <p className="mt-2.5 text-xs text-muted-foreground">参数摘要</p>
            <p className="mt-1 break-all font-mono text-xs text-card-foreground">{pendingApproval.argsSummary}</p>
          </>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDecision("approve")}
          disabled={approvalBusy !== ""}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ShieldCheck className="h-4 w-4" />
          {approvalBusy === "approve" ? "提交中…" : "批准并继续执行"}
        </button>
        <button
          type="button"
          onClick={() => onDecision("reject")}
          disabled={approvalBusy !== ""}
          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
        >
          {approvalBusy === "reject" ? "提交中…" : "拒绝这次调用"}
        </button>
        <p className="text-xs text-muted-foreground">拒绝后引擎会收到拒绝原因，换个思路继续规划</p>
      </div>
    </div>
  )
}
