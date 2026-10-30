import { useEffect, useRef, useState } from "react"
import {confirmInStudio} from "@/lib/studioDialogs"
import { AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import {
  createWorkflowModelDebugPayload,
  parseWorkflowDebugModel,
  WORKFLOW_MODEL_DEBUG_MAX_TOKENS,
} from "@/lib/workflowNodeDebugRequest"
import type { PreviewResult } from "@/lib/workflowNodePreview"

type Props = {
  model: string
  allowedModelSelections: readonly string[]
  preview: PreviewResult
}
type DebugStatus = "idle" | "sending" | "unknown" | "success" | "failed"

type DebugServerResult = {
  ok?: boolean
  status?: string
  text?: string
  error?: string
  message?: string
}

/**
 * Explicit opt-in cost-bearing model-only test. Server validates the existing
 * employee's JWT and connection ownership; no tools, Agent or workflow side
 * effects are invoked. Request IDs are persisted by the existing llm_jobs API.
 */
export function WorkflowModelNodeLiveDebug({ model, allowedModelSelections, preview }: Props) {
  const [status, setStatus] = useState<DebugStatus>("idle")
  const [requestId, setRequestId] = useState("")
  const [answer, setAnswer] = useState("")
  const [message, setMessage] = useState("")
  const [checking, setChecking] = useState(false)
  const inFlight = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abortRef.current?.abort()
    }
  }, [])

  const selection = parseWorkflowDebugModel(model)
  const modelAllowed = Boolean(selection && allowedModelSelections.includes(model))
  const canExecute = modelAllowed && !preview.errors.length && !preview.missing.length &&
    Boolean(preview.renderedInput.trim()) && !checking &&
    status !== "unknown" && status !== "sending"

  const run = async () => {
    if (inFlight.current || !canExecute) return
    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID() : "node-debug-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
    let payload
    try {
      payload = createWorkflowModelDebugPayload(
        model, allowedModelSelections, preview.renderedInput, id,
      )
    } catch (error) {
      setStatus("failed")
      setMessage(error instanceof Error ? error.message : "模型配置不正确")
      return
    }
    const approved = await confirmInStudio(
      "确认调用当前员工已授权的模型进行一次真实节点测试？\n\n" +
      "这会将当前渲染的提示词发送到所选模型服务商，并可能产生费用。" +
      "最多请求 " + WORKFLOW_MODEL_DEBUG_MAX_TOKENS + " 个输出 token。" +
      "\n\n只测试这个模型节点，不会执行其他 Agent、外部工具或工作流写操作。",
    )
    if (!approved) return

    const auth = vibexAuthHeaders()
    if (!auth.Authorization) {
      setStatus("failed")
      setMessage("员工身份已失效，请重新登录")
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    inFlight.current = true
    setStatus("sending")
    setRequestId(id)
    setAnswer("")
    setMessage("")
    const timeout = window.setTimeout(() => controller.abort(), 30000)
    try {
      const response = await fetch(getPocketBaseUrl() + "/api/llm/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({})) as DebugServerResult
      if (!mounted.current) return
      if (response.ok && data.ok === true && data.status === "success") {
        setStatus("success")
        setAnswer(String(data.text || "").slice(0, 20000))
        setMessage("真实模型节点执行成功；后端已记录该请求编号")
      } else if (response.ok && ["pending", "running"].includes(String(data.status))) {
        setStatus("unknown")
        setMessage("模型请求仍在运行，请点击「查询本次结果」，不要重复提交以免重复计费")
      } else {
        setStatus("failed")
        setMessage(String(data.message || data.error || "模型请求失败").slice(0, 400))
      }
    } catch {
      if (!mounted.current) return
      setStatus("unknown")
      setMessage("网络超时或请求中断。服务端可能仍在执行并产生费用；请查询该请求编号的结果，不要立即重新提交。")
    } finally {
      window.clearTimeout(timeout)
      abortRef.current = null
      inFlight.current = false
    }
  }

  const poll = async () => {
    if (!requestId || checking || inFlight.current) return
    const auth = vibexAuthHeaders()
    if (!auth.Authorization) {
      setStatus("failed")
      setMessage("员工登录已过期，无法查询模型任务")
      return
    }
    setChecking(true)
    try {
      const response = await fetch(getPocketBaseUrl() + "/api/llm/poll", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ request_id: requestId }),
      })
      const data = await response.json().catch(() => ({})) as DebugServerResult
      if (!mounted.current) return
      if (!response.ok) throw new Error(String(data.message || data.error || "查询失败"))
      if (data.ok === true && data.status === "success") {
        setStatus("success")
        setAnswer(String(data.text || "").slice(0, 20000))
        setMessage("模型已执行成功；结果来自后端模型任务账本")
      } else if (data.status === "failed") {
        setStatus("failed")
        setMessage(String(data.error || "模型执行失败").slice(0, 400))
      } else {
        setStatus("unknown")
        setMessage(data.status === "not_found"
          ? "当前员工账号下未找到该任务记录；请检查登录身份，不要直接重试收费请求"
          : "模型任务仍未结束，可稍后继续查询；查询不会再次调用模型")
      }
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "查询失败")
    } finally {
      if (mounted.current) setChecking(false)
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3" aria-label="真实模型单节点调试">
      <div className="flex items-center gap-2">
        <Play size={15} className="text-primary"/>
        <h4 className="text-sm font-semibold text-card-foreground">真实模型单节点试运行</h4>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        与上方免费本地预览不同，此操作会调用当前员工自己的模型服务，可能产生费用。
        一次调用最多请求 {WORKFLOW_MODEL_DEBUG_MAX_TOKENS} 个输出 token。
        不触发工具、Agent、下游节点或写入外部系统。
      </p>
      {!modelAllowed && <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
        <AlertTriangle size={14} className="mt-0.5 shrink-0"/>
        尚未选择当前账号已授权的模型连接。请到 <Link className="underline" to="/model-connections">模型连接</Link> 重新配置。
      </p>}
      {modelAllowed && (preview.errors.length > 0 || preview.missing.length > 0) &&
        <p className="mt-2 text-xs text-destructive">存在缺失配置或样本变量，请先修正上方预览问题。</p>}
      <button type="button" disabled={!canExecute}
        onClick={() => void run()}
        className="mt-3 flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
        {status==="sending" ? <Loader2 size={15} className="animate-spin"/> : <Play size={15}/>}
        {status==="sending" ? "模型执行中…" : "确认费用并试运行当前模型"}
      </button>
      {requestId && <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
        请求编号：{requestId}
      </p>}
      {message && <p role="status" className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
        {status==="success" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary"/>
          : <AlertTriangle size={14} className="mt-0.5 shrink-0"/>}
        {message}
      </p>}
      {status === "unknown" && (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          上次请求的执行状态尚未确定，已暂时禁止再次提交；请先查询该请求编号，避免重复产生模型费用。
        </p>
      )}
      {requestId && status !== "sending" && (
        <button type="button" onClick={() => void poll()} disabled={checking}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium disabled:opacity-40">
          <RefreshCw size={14} className={checking ? "animate-spin" : ""}/>
          {checking ? "查询中…" : "查询本次结果（不再次计费）"}
        </button>
      )}
      {status==="success" && (
        <div className="mt-3">
          <h5 className="text-xs font-semibold text-card-foreground">模型实际返回</h5>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 text-xs leading-relaxed">
            {answer || "模型请求成功，但返回内容为空"}
          </pre>
        </div>
      )}
    </section>
  )
}
