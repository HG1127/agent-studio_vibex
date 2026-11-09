import {useState} from "react"
import { AlertCircle, Play, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"
import { LocalDeviceSelector } from './LocalDeviceSelector'
import {TaskDispatchPreview} from './TaskDispatchPreview'
import type {DispatchCapability} from '@/lib/agentTaskDispatch'

type RunLauncherProps = {
  instruction: string
  onInstructionChange: (value: string) => void
  onRun: () => void
  isStarting: boolean
  canRun: boolean
  priceHint: string
  hasSpec: boolean
  disabledReason?: string
  localDeviceId?: string
  showLocalDevice?: boolean
  onLocalDeviceChange?: (id: string) => void
  dispatchPlan?:DispatchCapability[]
  structuredPlanning?:boolean
  onStructuredPlanningChange?:(enabled:boolean)=>void
}

export function RunLauncher({
  instruction,
  onInstructionChange,
  onRun,
  isStarting,
  canRun,
  priceHint,
  hasSpec,
  disabledReason,
  localDeviceId,
  showLocalDevice=false,
  onLocalDeviceChange,
  dispatchPlan=[],
  structuredPlanning=false,
  onStructuredPlanningChange,
}: RunLauncherProps) {
  const [deviceOptionsOpen,setDeviceOptionsOpen]=useState(false)
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">任务指令</h2>
        {!hasSpec && (
          <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            先在左侧选择助手方案
          </span>
        )}
      </div>
      <label htmlFor="agent-task-instruction" className="sr-only">本次 Agent 运行任务指令</label>
      <textarea
        value={instruction}
        id="agent-task-instruction"
        onChange={(e) => onInstructionChange(e.target.value)}
        onKeyDown={event=>{
          if((event.ctrlKey||event.metaKey) && event.key==="Enter" && !event.repeat &&
            !event.nativeEvent.isComposing && canRun && !isStarting){
            event.preventDefault()
            onRun()
          }
        }}
        rows={3}
        placeholder="给助手下达一个具体任务，例如：帮我算一下 (36+64)*12 的结果，并统计这段指令的字数，最后给出一份简短总结"
        className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-card-foreground transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      {onStructuredPlanningChange&&<div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3"><label className="flex cursor-pointer items-start gap-3 text-sm font-semibold"><input type="checkbox" className="mt-1" checked={structuredPlanning} disabled={isStarting} onChange={event=>onStructuredPlanningChange(event.target.checked)}/>让模型先规划，再按批准的计划执行</label><p className="mt-2 text-xs leading-5 text-muted-foreground">生成依赖步骤、工具和验收标准后暂停供你审核；批准后自动逐步调度。写入、删除和外部提交仍需逐次批准，规划计入模型调用预算。</p></div>}
      {!structuredPlanning&&<TaskDispatchPreview items={dispatchPlan} hasInstruction={Boolean(instruction.trim())}/>}
      {structuredPlanning&&<p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">当前为模型计划模式：不会执行关键词预检草案，也不会自动连接缺失工具。先审核模型生成的计划再执行。</p>}
      {onLocalDeviceChange && (showLocalDevice ?
        <LocalDeviceSelector value={localDeviceId || ''} onChange={onLocalDeviceChange} />:
        <details open={deviceOptionsOpen} onToggle={event=>setDeviceOptionsOpen(event.currentTarget.open)} className="mt-3 rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">为本次任务使用电脑（可选）</summary>
          {deviceOptionsOpen&&<><p className="mt-2 text-xs leading-5 text-muted-foreground">只选择本次可用设备，不会立即执行；每项本地操作仍需单独批准。</p><LocalDeviceSelector value={localDeviceId || ''} onChange={onLocalDeviceChange}/></>}
        </details>)}
      {disabledReason && !isStarting && <div role="status"
        className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0"/>
        <span className="min-w-0 flex-1">{disabledReason}</span>
        {disabledReason.includes("模型") && <Link to="/model-connections"
          className="shrink-0 font-semibold text-primary hover:underline">连接模型 →</Link>}
      </div>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{priceHint}</p>
        <span className="hidden text-xs text-muted-foreground lg:inline">
          运行快捷键 <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono">Ctrl/⌘ + Enter</kbd>
        </span>
        <button
          type="button"
          onClick={onRun}
          id="agent-run-submit"
          disabled={!canRun || isStarting}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStarting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isStarting ? "创建中…" : structuredPlanning ? "生成计划并审核" : "运行"}
        </button>
      </div>
    </div>
  )
}
