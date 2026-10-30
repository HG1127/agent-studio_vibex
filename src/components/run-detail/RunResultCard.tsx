import { Ban, CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react"
import type { RunDetailRow } from "@/pages/RunDetail/useRunDetail"

type RunResultCardProps = {
  nativeOutputs?: import("@/lib/pgNativePilotApi").WorkflowLatestOutputs | null
  run: RunDetailRow
  isLive: boolean
  onCopy: () => void
  copiedFlag: boolean
}

export function RunResultCard({ run, isLive, onCopy, copiedFlag, nativeOutputs }: RunResultCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 shrink-0 items-center gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            run.status === "failed" || run.status === "cancelled"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {run.status === "succeeded" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : run.status === "failed" ? (
            <XCircle className="h-4 w-4" />
          ) : run.status === "cancelled" ? (
            <Ban className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </span>
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">
          {run.status === "succeeded"
            ? "最终成果"
            : run.status === "failed"
              ? "失败原因"
              : run.status === "cancelled"
                ? "已取消"
                : "运行结果"}
        </h2>
        {run.status === "succeeded" && run.result && (
          <button
            type="button"
            onClick={onCopy}
            className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
          >
            {copiedFlag ? "已复制" : "复制全文"}
          </button>
        )}
      </div>

      {run.native && !run.native.sourceAvailable && <p role="status" className="mt-2 text-sm">来源或权限已变化，原结果正文暂不可用。</p>}
      {nativeOutputs && run.native?.sourceAvailable && run.native.kind==='workflow_v2' && nativeOutputs.run.run_id===run.id && <div className="mt-3 space-y-2" aria-label="公开节点输出">
        <h3 className="text-sm font-semibold">已核实的节点输出引用</h3>
        {nativeOutputs.nodes.map(node=><details key={node.node_id} className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">{node.title} · {node.node_id} · {node.node_status}</summary>
          {node.output_text!==undefined && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{node.output_text}</p>}
        </details>)}
        <p className="text-xs text-muted-foreground">这是后台公开的最近节点输出；完整输出历史分页尚未在此卡接通。</p>
      </div>}
      {run.native && !run.native.sourceAvailable ? null : isLive ? (
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-muted px-4 py-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          运行还没有结束，成果会在到达终态后出现在这里。
        </p>
      ) : run.status === "succeeded" ? (
        run.result ? (
          <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3.5 text-sm leading-relaxed text-card-foreground">
            {run.result}
          </div>
        ) : (
          <p className="mt-2 rounded-xl bg-muted px-4 py-5 text-sm text-muted-foreground">
            这次运行标记为完成，但没有留下成果文本。
          </p>
        )
      ) : run.status === "failed" ? (
        <div className="mt-2 rounded-xl border-l-4 border-destructive bg-destructive/10 px-4 py-3.5">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-destructive">
            {run.error || "运行失败，未记录具体原因。"}
          </p>
        </div>
      ) : run.status === "cancelled" ? (
        <div className="mt-2 rounded-xl bg-muted px-4 py-3.5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            这次运行被手动取消，已执行的步骤保留在上方时间线中。
          </p>
          {run.error && <p className="mt-1.5 text-xs text-muted-foreground">{run.error}</p>}
        </div>
      ) : (
        <p className="mt-2 rounded-xl bg-muted px-4 py-5 text-sm text-muted-foreground">
          运行处于「{run.status}」状态，暂无结果。
        </p>
      )}
    </div>
  )
}
