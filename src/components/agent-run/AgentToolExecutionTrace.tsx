import {AlertCircle, CheckCircle2, Clock3, LoaderCircle, Wrench} from 'lucide-react'
import type {RunEventRow, RunStateKey} from '@/pages/AgentRun/useAgentRun'
import {buildToolExecutionTrace} from '@/lib/agentToolExecutionTrace'

export function AgentToolExecutionTrace({events,status}:{events:RunEventRow[];status:RunStateKey}){
 const rows=buildToolExecutionTrace(events)
 if(!rows.length)return null
 const label={waiting_approval:'等待审批',running:'等待结果',succeeded:'已返回',failed:'失败'} as const
 const Icon={waiting_approval:Clock3,running:LoaderCircle,succeeded:CheckCircle2,failed:AlertCircle} as const
 return <section aria-label="自动调度实际调用" className="rounded-xl border border-border bg-card p-4">
  <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-primary"/><h2 className="text-sm font-semibold">自动调度 · 实际调用</h2></div><span className="text-xs text-muted-foreground">来自已保存的运行事件</span></div>
  <ol className="mt-3 space-y-2">{rows.map(row=>{const StatusIcon=Icon[row.status];return <li key={row.key} className="rounded-lg border border-border/70 bg-secondary/20 p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">第 {row.step||'—'} 步</span><span className="min-w-0 flex-1 break-all text-xs font-semibold">{row.tool}</span><span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><StatusIcon className={'h-3.5 w-3.5'+(row.status==='running'?' animate-spin':'')}/>{label[row.status]}</span></div>{row.input&&<p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">输入：{row.input}</p>}<p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5">{row.detail}</p></li>})}</ol>
  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{status==='awaiting_approval'?'任务暂停在审批关口；批准前不会执行该调用。':status==='failed'?'任务失败后请核对最后一个真实调用结果，不确定的外部写入不会自动重放。':'这里只显示已经记录的工具调用；计划步骤不会被当成执行结果。'}</p>
 </section>
}
