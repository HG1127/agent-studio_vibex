import {getStudioBackend} from '@/lib/studioBackend'
import type {OriginalRunDetailMeta} from '@/lib/originalRunDetailProjection'
import { useEffect, useState } from "react"
import { Activity, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"

type Span = {
  id: string
  trace_id: string
  step_ref: string
  operation: string
  status: "succeeded" | "failed"
  error_code: string
  duration_ms: number
  created_ms: number
}

type TraceSummary = {
  sampled_spans: number
  failed_spans: number
  model_calls: number
  tool_calls: number
  average_ms: number
  p50_ms: number
  p95_ms: number
}

type Snapshot = { key: string; items: Span[]; summary: TraceSummary | null; error: string }

export function RunTraceCard({runId,kind,native,onNativeRefresh}:{runId:string;kind:"agent"|"workflow";native?:OriginalRunDetailMeta;onNativeRefresh?:()=>void}){
 if(getStudioBackend()==='native_pg')return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="模型与工具执行诊断">
  <h2 className="text-sm font-semibold">模型与工具执行诊断</h2>
  <p className="mt-2 text-xs text-muted-foreground">Native 目前只提供公开步骤状态；没有执行追踪 span、耗时分位数或原事件合同。</p>
  {native?.runId===runId && (native.kind.startsWith('agent')?'agent':'workflow')===kind ? <p className="mt-2 text-xs">已读取 {native.steps.length} 个公开步骤快照。{native.stepsComplete?'当前步骤读取已结束。':'尚有步骤未核实。'}</p> : <p className="mt-2 text-xs">当前页面未提供已验证的此运行步骤快照。</p>}
  {onNativeRefresh && <button type="button" onClick={onNativeRefresh} className="mt-2 rounded-lg border px-3 py-2 text-xs">刷新执行追踪</button>}
 </section>
 return <PocketBaseRunTraceCard runId={runId} kind={kind}/>
}
function PocketBaseRunTraceCard({ runId, kind }: { runId: string; kind: "agent" | "workflow" }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [refresh, setRefresh] = useState(0)
  const key = kind + ":" + runId
  useEffect(() => {
    if (!runId) return
    const controller = new AbortController()
    fetch(getPocketBaseUrl() + "/api/execution-traces?kind=" + kind +
      "&run_id=" + encodeURIComponent(runId), {
      headers: vibexAuthHeaders(),
      signal: controller.signal,
    }).then(async response => {
      const value = await response.json().catch(() => ({})) as {items?: Span[]; summary?: TraceSummary}
      if (!response.ok) throw new Error(response.status === 404
        ? "运行不存在或当前账号没有查看权限" : "执行诊断加载失败")
      setSnapshot({key, items: Array.isArray(value.items) ? value.items : [],
        summary:value.summary || null,error:""})
    }).catch(error => {
      if (controller.signal.aborted) return
      setSnapshot({key,items:[],summary:null,error:String((error as Error).message || error)})
    })
    return () => controller.abort()
  }, [kind, runId, key, refresh])

  const loading = snapshot?.key !== key
  const items = loading ? [] : snapshot.items
  const total = items.reduce((sum, item) => sum + Number(item.duration_ms || 0), 0)
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="模型与工具执行诊断">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />模型与工具执行诊断
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">仅显示步骤、耗时和错误码，不保存密钥、提示词或回答正文。</p>
        </div>
        <button type="button" onClick={() => setRefresh(value => value + 1)}
          aria-label="刷新执行追踪"
          className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {loading ? <p role="status" className="mt-4 text-xs text-muted-foreground">正在加载执行诊断…</p>
      : snapshot.error ? (
        <p role="alert" className="mt-3 flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4" />{snapshot.error}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">暂无模型或工具执行追踪（旧版运行记录或尚未调用）。</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>最近 {items.length} 条追踪事件（最多100条）</span>
            <span>记录耗时合计：{total.toLocaleString()} 毫秒</span>
            <span>失败调用：{items.filter(item => item.status === "failed").length}</span>
            {snapshot.summary && <>
              <span>模型 {snapshot.summary.model_calls} · 工具 {snapshot.summary.tool_calls}</span>
              <span>P50 {snapshot.summary.p50_ms} ms · P95 {snapshot.summary.p95_ms} ms</span>
            </>}
          </div>
          <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {items.map(item => <li key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3 text-xs">
              <div className="flex min-w-0 items-start gap-2">
                {item.status === "succeeded" ?
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> :
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div className="min-w-0">
                  <p className="font-medium">第 {item.step_ref} 步 · {item.operation === "tool" ? "工具调用" : "模型调用"}</p>
                  {item.error_code && <p className="mt-1 break-all text-destructive">错误码：{item.error_code}</p>}
                  <p className="mt-1 text-muted-foreground">{new Date(item.created_ms).toLocaleString("zh-CN")}</p>
                </div>
              </div>
              <span className="shrink-0 tabular-nums text-muted-foreground">{item.duration_ms} ms</span>
            </li>)}
          </ol>
        </>
      )}
    </section>
  )
}
