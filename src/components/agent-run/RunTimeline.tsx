import { useEffect, useRef } from "react"
import {
  AlertCircle,
  Archive,
  Ban,
  BookOpen,
  BookmarkPlus,
  Brain,
  CheckCircle2,
  ChevronDown,
  Flag,
  ShieldCheck,
  ShieldQuestion,
  Wrench,
} from "lucide-react"
import { memoryKindMetaOf } from "@/pages/AgentRun/useAgentRun"
import type { RunEventRow } from "@/pages/AgentRun/useAgentRun"

type RunTimelineProps = {
  events: RunEventRow[]
  isLive: boolean
  hasRun: boolean
}

function contentText(content: Record<string, unknown>, key: string): string {
  const value = content?.[key]
  if (value == null) return ""
  return typeof value === "string" ? value : JSON.stringify(value)
}

export function RunTimeline({ events, isLive, hasRun }: RunTimelineProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [events.length])

  return (
    <div className="flex min-h-64 flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">运行时间线</h2>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            实时推进中
          </span>
        )}
      </div>

      {!hasRun ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Brain className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-card-foreground">还没有开始运行</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            输入任务指令点「运行」，这里会实时展开每一步的思考、工具调用与结果。
          </p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            等待执行引擎调度…
          </p>
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {events.map((event) => {
            const stepLabel = event.step_index > 0 ? `第 ${event.step_index} 步` : "准备"
            if (event.event_type === "thinking") {
              return (
                <li
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-background p-3 duration-300"
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Brain className="h-3.5 w-3.5" />
                    思考 · {stepLabel}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
                    {contentText(event.content, "thought")}
                  </p>
                </li>
              )
            }
            if (event.event_type === "tool_call") {
              return (
                <li key={event.id} className="animate-in fade-in slide-in-from-bottom-2 rounded-xl bg-secondary/60 p-3 duration-300">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
                    <Wrench className="h-3.5 w-3.5 text-primary" />
                    调用工具 · {stepLabel}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-card-foreground">
                    {contentText(event.content, "tool") || "(未指定)"}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {contentText(event.content, "input")}
                  </p>
                </li>
              )
            }
            if (event.event_type === "tool_result") {
              return (
                <li key={event.id} className="animate-in fade-in slide-in-from-bottom-2 rounded-xl bg-secondary/60 p-3 duration-300">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    工具结果 · {contentText(event.content, "tool") || stepLabel}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap break-all text-sm leading-relaxed text-card-foreground">
                    {contentText(event.content, "output")}
                  </p>
                </li>
              )
            }
            if (event.event_type === "error") {
              const detail = contentText(event.content, "detail")
              return (
                <li key={event.id} className="animate-in fade-in slide-in-from-bottom-2 rounded-xl bg-destructive/10 p-3 duration-300">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    异常 · {stepLabel}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-destructive">
                    {contentText(event.content, "message")}
                  </p>
                  {detail && <p className="mt-1 break-all font-mono text-xs text-destructive/80">{detail}</p>}
                </li>
              )
            }
            if (event.event_type === "approval_pending") {
              return (
                <li
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border-2 border-primary bg-card p-3 duration-300"
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <ShieldQuestion className="h-3.5 w-3.5" />
                    等待批准 · {stepLabel}
                  </p>
                  <p className="mt-1.5 font-mono text-sm font-medium text-card-foreground">
                    {contentText(event.content, "tool_name") || "(未指定)"}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {contentText(event.content, "args_summary")}
                  </p>
                </li>
              )
            }
            if (event.event_type === "approval") {
              const isRejectDecision = contentText(event.content, "decision") === "reject"
              return (
                <li
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-background p-3 duration-300"
                >
                  <p
                    className={`flex items-center gap-1.5 text-xs font-semibold ${
                      isRejectDecision ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {isRejectDecision ? <Ban className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    审批结果 · {stepLabel}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
                    {contentText(event.content, "message")}
                  </p>
                </li>
              )
            }
            if (event.event_type === "observation") {
              return (
                <li
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 duration-300"
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <Ban className="h-3.5 w-3.5" />
                    拒绝观察 · {stepLabel}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
                    {contentText(event.content, "message") || contentText(event.content, "observation")}
                  </p>
                </li>
              )
            }
            if (event.event_type === "context_compact") {
              return (
                <li
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-dashed border-border bg-muted/40 p-3 duration-300"
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Archive className="h-3.5 w-3.5" />
                    上下文压缩 · {stepLabel}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {contentText(event.content, "message") || "对话历史过长，已自动摘要压缩后继续"}
                  </p>
                </li>
              )
            }
            if (event.event_type === "memory_injected") {
              const rawInjected = event.content?.items
              const injectedItems = Array.isArray(rawInjected)
                ? (rawInjected as { id?: string; fact?: string; kind?: string }[])
                : []
              return (
                <li
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 duration-300"
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary">
                      <BookOpen className="h-3.5 w-3.5" />
                      本次参考了 {injectedItems.length} 条长期记忆
                      <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform duration-300 group-open:rotate-180" />
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {injectedItems.map((injectedItem, injectedIndex) => {
                        const injectedMeta = memoryKindMetaOf(String(injectedItem?.kind || ""))
                        return (
                          <li
                            key={String(injectedItem?.id || injectedIndex)}
                            className="flex items-start gap-1.5 rounded-lg bg-card px-2.5 py-1.5"
                          >
                            <span
                              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${injectedMeta.badgeClass}`}
                            >
                              {injectedMeta.label}
                            </span>
                            <span className="text-xs leading-relaxed text-card-foreground">
                              {String(injectedItem?.fact || "")}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                </li>
              )
            }
            if (event.event_type === "memory_saved") {
              const savedMeta = memoryKindMetaOf(contentText(event.content, "kind"))
              const savedPreview = contentText(event.content, "fact_preview")
              return (
                <li
                  key={event.id}
                  className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 duration-300"
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    已存入长期记忆 · {savedMeta.label}
                  </p>
                  {savedPreview && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
                      {savedPreview}
                    </p>
                  )}
                </li>
              )
            }
            const message = contentText(event.content, "message") || "状态更新"
            const isFinal = /完成|失败|取消|终止/.test(message)
            return (
              <li
                key={event.id}
                className={`animate-in fade-in slide-in-from-bottom-2 rounded-xl border p-3 duration-300 ${
                  isFinal ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                }`}
              >
                <p className={`flex items-center gap-1.5 text-xs font-semibold ${isFinal ? "text-primary" : "text-muted-foreground"}`}>
                  <Flag className="h-3.5 w-3.5" />
                  {isFinal ? "运行状态" : `状态 · ${stepLabel}`}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">{message}</p>
              </li>
            )
          })}
          {isLive && (
            <li className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              引擎正在推进下一步…
            </li>
          )}
        </ol>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
