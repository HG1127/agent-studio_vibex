import { Check, Copy, History, Play } from "lucide-react"
import type { RecentRunRow, RunDetailRow } from "@/pages/WorkflowCanvas/useWorkflowCanvas"
import { WF_RUN_STATE_META } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

type RunSummaryPanelProps = {
  activeRun: RunDetailRow
  elapsedText: string
  handleCopyResult: () => void
  copiedFlag: boolean
  viewingHistoryRun: boolean
}

export function RunSummaryPanel({
  activeRun,
  elapsedText,
  handleCopyResult,
  copiedFlag,
  viewingHistoryRun,
}: RunSummaryPanelProps) {
  const stateMeta = WF_RUN_STATE_META[activeRun.status]
  const stats = activeRun.checkpoint?.harness_stats
  const statsParts: string[] = []
  if (stats) {
    statsParts.push(`模型调用 ${stats.llm_calls ?? 0} 次`)
    statsParts.push(`提示约 ${stats.est_prompt_chars ?? 0} 字`)
    statsParts.push(`输出约 ${stats.est_out_chars ?? 0} 字`)
    statsParts.push(`工具调用 ${stats.tool_calls ?? 0} 次`)
    if ((stats.retries ?? 0) > 0) statsParts.push(`重试 ${stats.retries} 次`)
    if ((stats.truncations ?? 0) > 0) statsParts.push(`输入截断 ${stats.truncations} 次`)
    if ((stats.approvals ?? 0) > 0) statsParts.push(`审批 ${stats.approvals} 次`)
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-card-foreground">
          {viewingHistoryRun ? "运行回看" : "本次运行"}
        </h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stateMeta?.badge || "bg-muted text-muted-foreground"}`}>
          {stateMeta?.label || activeRun.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        指令：{activeRun.instruction || "（空）"} · 用时 {elapsedText}
      </p>
      {activeRun.status === "succeeded" && (
        <>
          <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-all rounded-xl bg-muted px-3 py-2.5 font-sans text-xs leading-relaxed text-card-foreground">
            {activeRun.result || "（无输出）"}
          </pre>
          <button
            type="button"
            onClick={handleCopyResult}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {copiedFlag ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedFlag ? "已复制" : "复制结果"}
          </button>
        </>
      )}
      {activeRun.status === "failed" && (
        <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
          {activeRun.error || "运行失败"}（已执行节点的结果保留，点画布节点可查看详情）
        </p>
      )}
      {activeRun.status === "cancelled" && (
        <p className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          已取消 · {activeRun.error || "checkpoint 已保留"}，已执行节点的结果仍可查看
        </p>
      )}
      {activeRun.status === "running" && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          引擎正在逐节点执行，画布上会实时亮灯…
        </p>
      )}
      {activeRun.status === "awaiting_approval" && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2.5 text-xs text-primary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          有一个写操作调用在等你批准，请在上方审批卡片里选择批准或拒绝…
        </p>
      )}
      {stats && statsParts.length > 0 && (
        <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          本次消耗：{statsParts.join(" · ")}
        </p>
      )}
    </div>
  )
}

type RecentRunsListProps = {
  recentRuns: RecentRunRow[]
  activeRunId: string
  handleViewRun: (runId: string) => void
}

export function RecentRunsList({ recentRuns, activeRunId, handleViewRun }: RecentRunsListProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-card-foreground">
        <History className="h-4 w-4 text-primary" />
        最近运行
      </h3>
      <div className="mt-3 space-y-1.5">
        {recentRuns.length === 0 && (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">还没有运行记录，点「运行」试一次</p>
        )}
        {recentRuns.map((row) => {
          const meta = WF_RUN_STATE_META[row.status]
          const isActive = row.id === activeRunId
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => handleViewRun(row.id)}
              className={`block w-full rounded-xl border px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-primary ${
                isActive ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-card-foreground">{row.instruction || "（无指令）"}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${meta?.badge || "bg-muted text-muted-foreground"}`}>
                  {meta?.label || row.status}
                </span>
              </span>
              <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Play className="h-3 w-3" />
                {row.done_nodes}/{row.total_nodes} 节点 · {row.created ? row.created.slice(5, 16).replace("T", " ") : ""}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
