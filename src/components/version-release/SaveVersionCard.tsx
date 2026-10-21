import { AlertTriangle, Loader2, Save, Tag } from "lucide-react"

type SaveVersionCardProps = {
  hasSpec: boolean
  nextVersionNo: number
  versionNote: string
  onNoteChange: (value: string) => void
  isSavingVersion: boolean
  onSave: () => void
  testPassed: boolean
  testRunStatus: string
}

export function SaveVersionCard({
  hasSpec,
  nextVersionNo,
  versionNote,
  onNoteChange,
  isSavingVersion,
  onSave,
  testPassed,
  testRunStatus,
}: SaveVersionCardProps) {
  const untested = !testPassed
  const isPending = ["queued","running","paused","awaiting_input","awaiting_approval"].includes(testRunStatus)
  const hasFailed = ["failed","cancelled"].includes(testRunStatus)
  const isOutdated = testRunStatus === "succeeded" && !testPassed

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 shrink-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          2
        </span>
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">保存版本</h3>
          <p className="text-xs text-muted-foreground">把当前配置快照存为一个版本</p>
        </div>
        <Tag className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary shadow-sm">
          v{nextVersionNo}
        </span>
        <span className="text-xs text-muted-foreground">版本号自动递增，保存内容由服务端快照生成</span>
      </div>

      <textarea
        value={versionNote}
        onChange={(ev) => onNoteChange(ev.target.value)}
        disabled={!hasSpec || isSavingVersion}
        rows={3}
        placeholder="版本备注（可选）：这一版改了什么、为什么存"
        className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-card-foreground shadow-sm transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
      />

      {hasSpec && untested && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isPending
              ? "验收测试仍在进行或等待你的确认，不属于失败。可以先完成审批后继续验收；此时保存版本会标记「未测试」。"
              : isOutdated
              ? "此前成功运行属于旧的 Agent 配置。当前方案发生变化，需要重新验收；提前保存将标记「未测试」。"
              : hasFailed
              ? "最近一次验收测试已失败或取消。建议先检查运行结果、修复问题再重新测试；现在保存将标记「未测试」。"
              : "尚无当前版本的正式验收结果。建议先运行验收测试；提前保存将标记「未测试」。"
            }
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={!hasSpec || isSavingVersion}
        className={`mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${
          hasSpec && untested
            ? "border border-primary bg-card text-primary hover:bg-primary/10"
            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg"
        }`}
      >
        {isSavingVersion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {isSavingVersion ? "保存中…" : hasSpec && untested ? "强制保存（未测试）" : "保存版本"}
      </button>

      <div className="mt-auto pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          快照包含助手的目标、任务范围、交付物、工具、步骤与完成标准，保存后可随时查看或恢复。
        </p>
      </div>
    </div>
  )
}
