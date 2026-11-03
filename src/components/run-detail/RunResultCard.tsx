import { Ban, CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react"
import { ResultDocument } from "@/components/agent-run/ResultDocument"
import {BusinessQualityStatus} from '@/components/agent-run/BusinessQualityStatus'
import type { RunDetailRow } from "@/pages/RunDetail/useRunDetail"

type RunResultCardProps = {
  run: RunDetailRow
  isLive: boolean
  onCopy: () => void
  copiedFlag: boolean
}

export function RunResultCard({ run, isLive, onCopy, copiedFlag }: RunResultCardProps) {
  if(run.source_access_revoked)return <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">来源权限当前不可用，已隐藏这次运行的成果、记忆及配置内容。历史执行状态保留；请恢复授权后重新读取与验收。</section>
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
        {run.result && (
          <button
            type="button"
            onClick={onCopy}
            className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
          >
            {copiedFlag ? "已复制" : "复制全文"}
          </button>
        )}
      </div>

      {typeof run.config?.case_id === 'string' && <BusinessQualityStatus key={run.id} caseId={run.config.case_id} executionState={run.status} />}
      {isLive ? (
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-muted px-4 py-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          运行还没有结束，成果会在到达终态后出现在这里。
        </p>
      ) : run.status === "succeeded" ? (
        run.result ? (
          <ResultDocument text={run.result} className="mt-2 max-h-[520px] overflow-y-auto rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3.5" />
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
      {!isLive&&run.status==="failed"&&run.result&&<section className="mt-3 rounded border p-3">
        <h3 className="text-sm font-medium">保留的部分交付</h3>
        <ResultDocument text={run.result} className="mt-2 max-h-[520px] overflow-y-auto"/>
      </section>}
      {!isLive&&typeof run.checkpoint?.closing_draft==='string'&&<details className="mt-3 rounded border p-3"><summary className="cursor-pointer text-sm">收尾草稿（未验收）</summary><ResultDocument text={run.checkpoint.closing_draft} className="mt-2"/></details>}
    </div>
  )
}
