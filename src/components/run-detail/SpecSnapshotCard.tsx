import { useState } from "react"
import { Camera, ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import type { RunDetailRow, RunSnapshot } from "@/pages/RunDetail/useRunDetail"

type SpecSnapshotCardProps = {
  snapshot: RunSnapshot
  run: RunDetailRow
}

function SnapshotRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm leading-relaxed text-card-foreground">{children}</div>
    </div>
  )
}

export function SpecSnapshotCard({ snapshot, run }: SpecSnapshotCardProps) {
  const [open, setOpen] = useState(false)
  const cfg = run.config || {}
  const cfgMaxSteps = Number(cfg.max_steps || run.max_steps || 0)
  const cfgStopCondition = String(cfg.stop_condition || "")
  const cfgTools = cfg.tools && typeof cfg.tools === "object" ? (cfg.tools as Record<string, unknown>) : {}
  const enabledToolNames = Object.keys(cfgTools).filter((key) => cfgTools[key] === true)

  return (
    <div className="rounded-2xl border border-border bg-card shadow-md">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Camera className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold tracking-tight text-card-foreground">方案配置快照</span>
          <span className="block truncate text-xs text-muted-foreground">
            {run.native ? "完整运行时方案与临时覆盖快照尚未提供" : snapshot ? snapshot.name || run.spec_name || "运行所用方案" : "方案已删除，展示运行时配置记录"}
          </span>
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-5 pb-5">
          {run.native ? <>
            <SnapshotRow label="原资源 ID">{run.native.resourceId}</SnapshotRow>
            <SnapshotRow label="运行记录版本">{run.native.revision??"未提供"}</SnapshotRow>
            {run.native.maxRounds!==null && <SnapshotRow label="记录的模型轮次上限">{run.native.maxRounds}</SnapshotRow>}
            <p className="text-xs text-muted-foreground">没有读取当前资源名或配置来替代历史快照。</p>
          </> : snapshot ? (
            <>
              <SnapshotRow label="目标">
                <p className="whitespace-pre-wrap">{snapshot.goal || "—"}</p>
              </SnapshotRow>
              <SnapshotRow label="任务范围">
                <p className="whitespace-pre-wrap">{snapshot.task_scope || "—"}</p>
              </SnapshotRow>
              <SnapshotRow label="任务计划">
                {snapshot.task_plan?.length ? (
                  <ol className="list-decimal space-y-1 pl-4">
                    {snapshot.task_plan.map((item, idx) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  "—"
                )}
              </SnapshotRow>
              <SnapshotRow label="工具">
                {snapshot.tools?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {snapshot.tools.map((tool) => (
                      <span key={tool} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </SnapshotRow>
              <SnapshotRow label="交付物">
                {snapshot.deliverables?.length ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {snapshot.deliverables.map((item, idx) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </SnapshotRow>
              <SnapshotRow label="停止条件">
                <p className="whitespace-pre-wrap">
                  {snapshot.done_criteria?.length
                    ? snapshot.done_criteria.join("；")
                    : cfgStopCondition || "跑满最大步数或产出最终答案"}
                </p>
              </SnapshotRow>
              <SnapshotRow label="最大步数">
                <p>{cfgMaxSteps || "—"} 步</p>
              </SnapshotRow>
            </>
          ) : (
            <>
              <SnapshotRow label="授权工具">
                {enabledToolNames.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {enabledToolNames.map((tool) => (
                      <span key={tool} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </SnapshotRow>
              <SnapshotRow label="停止条件">
                <p className="whitespace-pre-wrap">{cfgStopCondition || "跑满最大步数或产出最终答案"}</p>
              </SnapshotRow>
              <SnapshotRow label="最大步数">
                <p>{cfgMaxSteps || "—"} 步</p>
              </SnapshotRow>
            </>
          )}
        </div>
      )}
    </div>
  )
}
