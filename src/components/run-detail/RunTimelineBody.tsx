import { useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Archive,
  Ban,
  Brain,
  CheckCircle2,
  ChevronDown,
  Flag,
  Radio,
  ShieldCheck,
  ShieldQuestion,
  Wrench,
} from "lucide-react"
import type { RunEventRow } from "@/pages/AgentRun/useAgentRun"
import type { StepGroup } from "@/pages/RunDetail/useRunDetail"

type RunTimelineBodyProps = {
  nativeRun?: import('@/lib/originalRunDetailProjection').OriginalRunDetailMeta
  onMoreNativeSteps?: () => void
  nativeBusy?: boolean
  stepGroups: StepGroup[]
  hasRun: boolean
  isLive: boolean
  liveEnabled: boolean
  onToggleLive: () => void
}

function contentText(content: Record<string, unknown>, key: string): string {
  const value = content?.[key]
  if (value == null) return ""
  return typeof value === "string" ? value : JSON.stringify(value)
}

// 工具输出超 280 字符时折叠，点「展开全文」查看
function ToolResultText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > 280
  const shown = isLong && !expanded ? `${text.slice(0, 280)}…` : text
  return (
    <div>
      <p className="whitespace-pre-wrap break-all text-sm leading-relaxed text-card-foreground">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 text-xs font-medium text-primary underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-primary"
        >
          {expanded ? "收起" : `展开全文（共 ${text.length} 字符）`}
        </button>
      )}
    </div>
  )
}

function EventItem({ evItem }: { evItem: RunEventRow }) {
  if (evItem.event_type === "thinking") {
    return (
      <li className="rounded-xl border border-border bg-background p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Brain className="h-3.5 w-3.5" />
          思考
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
          {contentText(evItem.content, "thought")}
        </p>
      </li>
    )
  }
  if (evItem.event_type === "tool_call") {
    const inputText = contentText(evItem.content, "input")
    return (
      <li className="rounded-xl bg-secondary/60 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
          <Wrench className="h-3.5 w-3.5 text-primary" />
          调用工具 · {contentText(evItem.content, "tool") || "(未指定)"}
        </p>
        {inputText && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground transition hover:text-card-foreground">
              输入参数
            </summary>
            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-background p-2.5 font-mono text-xs text-muted-foreground">
              {inputText}
            </pre>
          </details>
        )}
      </li>
    )
  }
  if (evItem.event_type === "tool_result") {
    return (
      <li className="rounded-xl bg-secondary/60 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          工具结果 · {contentText(evItem.content, "tool") || "输出"}
        </p>
        <div className="mt-1.5">
          <ToolResultText text={contentText(evItem.content, "output")} />
        </div>
      </li>
    )
  }
  if (evItem.event_type === "error") {
    const detail = contentText(evItem.content, "detail")
    return (
      <li className="rounded-xl bg-destructive/10 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          异常
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-destructive">
          {contentText(evItem.content, "message")}
        </p>
        {detail && <p className="mt-1 break-all font-mono text-xs text-destructive/80">{detail}</p>}
      </li>
    )
  }
  if (evItem.event_type === "approval_pending") {
    return (
      <li className="rounded-xl border-2 border-primary bg-card p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <ShieldQuestion className="h-3.5 w-3.5" />
          等待批准
        </p>
        <p className="mt-1.5 font-mono text-sm font-medium text-card-foreground">
          {contentText(evItem.content, "tool_name") || "(未指定)"}
        </p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {contentText(evItem.content, "args_summary")}
        </p>
      </li>
    )
  }
  if (evItem.event_type === "approval") {
    const isRejectDecision = contentText(evItem.content, "decision") === "reject"
    return (
      <li className="rounded-xl border border-border bg-background p-3">
        <p
          className={`flex items-center gap-1.5 text-xs font-semibold ${
            isRejectDecision ? "text-destructive" : "text-primary"
          }`}
        >
          {isRejectDecision ? <Ban className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          审批结果
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
          {contentText(evItem.content, "message")}
        </p>
      </li>
    )
  }
  if (evItem.event_type === "observation") {
    return (
      <li className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <Ban className="h-3.5 w-3.5" />
          拒绝观察
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
          {contentText(evItem.content, "message") || contentText(evItem.content, "observation")}
        </p>
      </li>
    )
  }
  if (evItem.event_type === "context_compact") {
    return (
      <li className="rounded-xl border border-dashed border-border bg-muted/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Archive className="h-3.5 w-3.5" />
          上下文压缩
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {contentText(evItem.content, "message") || "对话历史过长，已自动摘要压缩后继续"}
        </p>
      </li>
    )
  }
  const message = contentText(evItem.content, "message") || "状态更新"
  const isFinal = /完成|失败|取消|终止/.test(message)
  return (
    <li className={`rounded-xl border p-3 ${isFinal ? "border-primary/40 bg-primary/5" : "border-border bg-background"}`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${isFinal ? "text-primary" : "text-muted-foreground"}`}>
        <Flag className="h-3.5 w-3.5" />
        {isFinal ? "运行状态" : "状态"}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">{message}</p>
    </li>
  )
}

export function RunTimelineBody({
  nativeRun, onMoreNativeSteps, nativeBusy,
  stepGroups,
  hasRun,
  isLive,
  liveEnabled,
  onToggleLive,
}: RunTimelineBodyProps) {
  const [collapsedSteps, setCollapsedSteps] = useState<number[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const totalEvents = stepGroups.reduce((sum, group) => sum + group.events.length, 0)

  useEffect(() => {
    if (isLive && liveEnabled) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [totalEvents, isLive, liveEnabled])

  const toggleStep = (stepIndex: number) => {
    setCollapsedSteps((prev) =>
      prev.includes(stepIndex) ? prev.filter((item) => item !== stepIndex) : [...prev, stepIndex],
    )
  }

  return (
    <div className="flex min-h-64 flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">{nativeRun?"公开步骤状态快照":"运行时间线"}</h2>
        <div className="flex items-center gap-3">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {liveEnabled ? "实时刷新中" : "已暂停刷新"}
            </span>
          )}
          {isLive && (
            <button
              type="button"
              role="switch"
              aria-checked={liveEnabled}
              onClick={onToggleLive}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                liveEnabled
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              实时刷新{liveEnabled ? "开" : "关"}
            </button>
          )}
        </div>
      </div>

      {nativeRun ? <div className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">这些是后台公开步骤的当前状态，不是事件流；未提供的耗时、时间、提示词与推理不作补充。</p>
        {!nativeRun.sourceAvailable && <p role="status">来源或权限已变化，正文与步骤内容已隐藏。</p>}
        <ol className="space-y-2">{nativeRun.steps.map(step=><li key={step.step_key} className="rounded-xl border border-border bg-background p-3">
          <details><summary className="cursor-pointer text-sm">{step.step_key} · {step.status}</summary>
            {step.updated_at && <p className="mt-1 text-xs">后台记录更新时间：{step.updated_at}</p>}
            {nativeRun.sourceAvailable && Object.keys(step.metadata).length>0 && <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{JSON.stringify(step.metadata,null,2)}</pre>}
          </details>
        </li>)}</ol>
        {!nativeRun.steps.length && <p className="text-sm text-muted-foreground">当前快照没有可展示步骤。</p>}
        <p className="text-xs text-muted-foreground">{nativeRun.stepsComplete?"当前公开步骤已读取。":"步骤尚未读完；不能据此宣称完整执行历史。"}</p>
        {["agent_autonomous","workflow_v2"].includes(nativeRun.kind) && nativeRun.steps.length<1000 && (!nativeRun.stepsComplete || nativeRun.nextAfter===null) && <button type="button" onClick={onMoreNativeSteps} disabled={nativeBusy} className="rounded-lg border px-3 py-2 text-sm">{nativeRun.nextAfter?"读取后续公开步骤":"重新读取公开步骤分页"}</button>}
      </div> : !hasRun ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Brain className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-card-foreground">没有可展示的时间线</p>
        </div>
      ) : stepGroups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            等待执行引擎写入事件…
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {stepGroups.map((group) => {
            const collapsed = collapsedSteps.includes(group.stepIndex)
            const stepLabel = group.stepIndex > 0 ? `第 ${group.stepIndex} 步` : "准备"
            return (
              <section
                key={group.stepIndex}
                className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-background/60 duration-300"
              >
                <button
                  type="button"
                  onClick={() => toggleStep(group.stepIndex)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {group.stepIndex}
                  </span>
                  <span className="text-sm font-semibold text-card-foreground">{stepLabel}</span>
                  <span className="text-xs text-muted-foreground">{group.events.length} 条事件</span>
                  <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
                  />
                </button>
                {!collapsed && (
                  <ol className="flex flex-col gap-2.5 px-3 pb-3">
                    {group.events.map((evItem) => (
                      <EventItem key={evItem.id} evItem={evItem} />
                    ))}
                  </ol>
                )}
              </section>
            )
          })}
          {isLive && liveEnabled && (
            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              每 3 秒自动刷新，运行结束后自动停止
            </p>
          )}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
