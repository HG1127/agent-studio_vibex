import { MessageSquareText, Loader2, CheckCircle2, RotateCcw } from "lucide-react"

type Decision = "reply" | "approve" | "revise"
type Props = {
  question: string
  kind: "clarification" | "plan_review"
  answer: string
  onChange: (value: string) => void
  busy: boolean
  onSubmit: (decision: Decision) => void
}

/** Backend checkpoint is authoritative. Decisions are written via /respond, not browser state. */
export function AgentInputCard({ question, kind, answer, onChange, busy, onSubmit }: Props) {
  const review = kind === "plan_review"
  return <section id="agent-input-review" aria-label={review ? "需求方案人工确认" : "等待人工补充"}
    className="scroll-mt-24 rounded-2xl border-2 border-primary/50 bg-card p-5 shadow-md">
    <h2 className="flex items-center gap-2 text-base font-semibold">
      <MessageSquareText className="h-5 w-5 text-primary"/>
      {review ? "需求方案等待你的批准" : "Agent 正在等待你的回复"}
    </h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
      {review
        ? "模型已暂停在阶段审核关卡。批准后才会继续编制后续落地计划；提出修改意见会要求 Agent 重新提交草案。"
        : "请补充问题中的信息，提交后从当前运行检查点继续执行。外部写操作仍需通过独立权限审批。"}
    </p>
    <div role="document" aria-label={review ? "待审核的需求方案草案" : "Agent 待回复的问题"}
      className="mt-3 max-h-[min(65vh,560px)] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-secondary/50 p-4 text-sm leading-relaxed">
      {question || "正在读取待确认的信息，请稍候刷新…"}
    </div>
    <label htmlFor="agent-reply" className="mt-4 block text-sm font-medium">
      {review ? "修改意见（退回修改时必填；直接批准可留空）" : "你的确认或补充说明"}
    </label>
    <textarea id="agent-reply" value={answer} maxLength={1600} rows={3} onChange={event=>onChange(event.target.value)}
      placeholder={review
        ? "例如：将需求范围限制为内部知识库，优先实现检索，并补充权限验证要求"
        : "例如：按照现有目标执行；或明确相关部门、数据来源与验收要求"}
      className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{answer.length}/1600 字 · 提交后将继续消耗模型调用预算</span>
      <div className="flex flex-wrap items-center gap-2">
        {review ? <>
          <button type="button" onClick={()=>onSubmit("revise")} disabled={!question || !answer.trim() || busy}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-background px-4 py-2 text-sm font-medium text-primary disabled:opacity-40">
            <RotateCcw className="h-4 w-4"/>{busy ? "正在提交…" : "提出修改意见"}
          </button>
          <button type="button" onClick={()=>onSubmit("approve")} disabled={!question || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}
            {busy ? "正在提交…" : "批准方案并继续"}
          </button>
        </> : <button type="button" onClick={()=>onSubmit("reply")}
          disabled={!question || !answer.trim() || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin"/>}{busy ? "正在提交…" : "提交信息并继续"}
        </button>}
      </div>
    </div>
  </section>
}
