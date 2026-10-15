import { Check, Loader2, ShieldAlert, Wrench, X } from "lucide-react"
import type { PendingApproval } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

type ApprovalCardProps = {
  pendingApproval: PendingApproval
  decideApproval: (decision: "approve" | "reject") => void
  wfApprovalBusy: boolean
}

export function ApprovalCard({ pendingApproval, decideApproval, wfApprovalBusy }: ApprovalCardProps) {
  return (
    <div className="rounded-2xl border border-primary/50 bg-card p-4 shadow-lg">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-card-foreground">
        <ShieldAlert className="h-4 w-4 text-primary" />
        等待你的批准
      </h3>
      <p className="mt-1.5 text-xs text-muted-foreground">
        节点「{pendingApproval.title || "未命名节点"}」想要调用一个写操作工具，运行已暂停，等你确认：
      </p>
      <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{pendingApproval.tool || "（未知工具）"}</span>
      </p>
      {pendingApproval.input_summary ? (
        <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-xl bg-muted px-3 py-2 font-sans text-xs leading-relaxed text-muted-foreground">
          输入摘要：{pendingApproval.input_summary}
        </pre>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => decideApproval("approve")}
          disabled={wfApprovalBusy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {wfApprovalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          批准执行
        </button>
        <button
          type="button"
          onClick={() => decideApproval("reject")}
          disabled={wfApprovalBusy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-destructive px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          拒绝
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">拒绝后该节点会标记为跳过，流程按既有连线继续走下游。</p>
    </div>
  )
}
