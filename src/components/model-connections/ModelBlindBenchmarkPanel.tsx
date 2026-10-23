import { useMemo, useRef, useState } from "react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import { AGENT_DESIGN_SYSTEM_PROMPT, agentDesignTokenBudget } from "@/lib/agentDesignProtocol"
import { evaluateBlindAgentPlan, type BlindPlanEvaluation } from "@/lib/agentDesignEvaluation"
import { V28_UNSEEN_TASKS } from "@/lib/agentV28Tasks"
import { explainBlindDiagnostic } from "@/lib/agentBlindDiagnostics"
import type { ModelConnectionRow } from "@/pages/ModelConnections/useModelConnections"

type Trial = {
  caseId: string
  attempt: number
  status: "passed" | "failed" | "unmetered" | "request_failed"
  elapsedMs: number
  inputTokens: number | null
  outputTokens: number | null
  evaluation?: BlindPlanEvaluation
}

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) &&
  value >= 0 && value <= 10000000 ? value : null

export function ModelBlindBenchmarkPanel({ connections }: { connections: ModelConnectionRow[] }) {
  const available = useMemo(() => connections.filter(row =>
    row.enabled && row.models.length > 0), [connections])
  const [connectionId, setConnectionId] = useState("")
  const [modelId, setModelId] = useState("")
  const [consent, setConsent] = useState(false)
  const [fullConsent, setFullConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [trials, setTrials] = useState<Trial[]>([])
  const [progress, setProgress] = useState("")
  const [error, setError] = useState("")
  const stopping = useRef(false)
  const selected = available.find(row => row.id === connectionId) || available[0]
  const selectedModel = selected?.models.includes(modelId) ? modelId : selected?.models[0] || ""
  const passed = trials.filter(row => row.status === "passed").length
  const usageAvailable = trials.every(row => row.inputTokens !== null && row.outputTokens !== null)
  const spentTokens = trials.reduce((sum, row) =>
    sum + (row.inputTokens || 0) + (row.outputTokens || 0), 0)

  async function run(mode: "smoke" | "full") {
    if (busy || !selected || !selectedModel || !consent || (mode === "full" && !fullConsent)) return
    stopping.current = false
    setBusy(true)
    setError("")
    setTrials([])
    setProgress("正在准备只读复杂 Agent 规划评估")
    const selectedTasks = mode === "smoke" ? V28_UNSEEN_TASKS.slice(0, 2) : V28_UNSEEN_TASKS
    const repeats = mode === "smoke" ? 1 : 3
    let totalTokens = 0
    const tokenStop = 180000
    let completed = 0
    try {
      outer: for (const task of selectedTasks) {
        for (let attempt = 1; attempt <= repeats; attempt++) {
          if (stopping.current || totalTokens >= tokenStop) break outer
          setProgress(`真实调用 ${completed + 1}/${selectedTasks.length * repeats}：${task.id}，第 ${attempt} 次`)
          const requestId = "v28-" + crypto.randomUUID()
          const started = performance.now()
          let payload: {
            ok?: boolean; status?: string; text?: string; error?: string
            usage?: { input_tokens?: number | null; output_tokens?: number | null } | null
          }
          try {
            const res = await fetch(getPocketBaseUrl() + "/api/llm/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...vibexAuthHeaders() },
              body: JSON.stringify({
                page: "agent_v28_blind", connection_id: selected.id,
                model: selectedModel, strict_model: true, request_id: requestId,
                max_tokens: agentDesignTokenBudget(task.task),
                messages: [
                  { role: "system", content: AGENT_DESIGN_SYSTEM_PROMPT },
                  { role: "user", content: JSON.stringify({
                    requirement: task.task, available_tools: [],
                  }) },
                ],
              }),
            })
            payload = await res.json()
            if (!res.ok || !payload.ok || payload.status !== "success" ||
                typeof payload.text !== "string" || !payload.text) {
              // An interrupted request might still complete at the provider.
              // Stop here; never automatically resend a billable call.
              throw Error(String(payload.error || "provider_request_failed").slice(0, 80))
            }
          } catch {
            setTrials(rows => [...rows, {
              caseId: task.id, attempt, elapsedMs: Math.round(performance.now() - started),
              status: "request_failed", inputTokens: null, outputTokens: null,
            }])
            setError("本次请求未确认成功，已停止后续收费调用；请先核查模型服务的调用记录。")
            break outer
          }
          const inputTokens = count(payload.usage?.input_tokens)
          const outputTokens = count(payload.usage?.output_tokens)
          const evaluation = evaluateBlindAgentPlan(task, payload.text)
          const metered = inputTokens !== null && outputTokens !== null
          totalTokens += (inputTokens || 0) + (outputTokens || 0)
          setTrials(rows => [...rows, {
            caseId: task.id, attempt, elapsedMs: Math.round(performance.now() - started),
            status: !metered ? "unmetered" :
              evaluation.mechanicallyPassed ? "passed" : "failed",
            inputTokens, outputTokens, evaluation,
          }])
          completed++
          if (!metered) {
            setError("模型响应未提供完整的 Token 计量，已自动停止，避免未经计量连续调用。")
            break outer
          }
        }
      }
      setProgress(stopping.current ? "已停止后续请求；已发出的调用不会自动撤销。" :
        "本次测试已结束，以下仅为结构化规划指标，业务质量仍需人工评审。")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="V28 真实模型盲测" className="mb-5 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">V28 · 真实模型复杂 Agent 盲测</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            直接选择「我的连接」中的模型，不需要重复填写 API Key。
            只发送合成任务给模型生成方案，不执行邮件、CRM 或其他工具操作。
          </p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
          10 个任务 · 完整评估最多 30 次
        </span>
      </div>
      {available.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">没有已启用且拥有模型列表的连接；请先测试并启用上方已有连接。</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-foreground">
              我的已授权模型连接
              <select aria-label="盲测模型连接" value={selected?.id || ""}
                disabled={busy}
                onChange={event => { setConnectionId(event.target.value); setModelId(""); }}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {available.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-foreground">
              具体模型
              <select aria-label="盲测模型" value={selectedModel} disabled={busy}
                onChange={event => setModelId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {(selected?.models || []).map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={consent} disabled={busy}
                onChange={event => setConsent(event.target.checked)} className="mt-0.5" />
              <span>我确认将使用选定模型发起真实 API 调用，费用由对应模型服务商收取。</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={fullConsent} disabled={busy}
                onChange={event => setFullConsent(event.target.checked)} className="mt-0.5" />
              <span>我另外确认完整评测可能产生最多 30 次调用，并在 Token 用量不可计量时自动停止。</span>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!consent || busy}
              onClick={() => { void run("smoke") }}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? "真实评测进行中…" : "先试测 2 个任务"}
            </button>
            <button type="button" disabled={!consent || !fullConsent || busy}
              onClick={() => { void run("full") }}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium disabled:opacity-40">
              完整运行 10 × 3 盲测
            </button>
            {busy && <button type="button" onClick={() => { stopping.current = true }}
              className="rounded-lg border border-border px-4 py-2 text-xs">
              当前调用结束后停止
            </button>}
          </div>
        </>
      )}
      {progress && <p role="status" className="mt-3 text-xs text-muted-foreground">{progress}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {trials.length > 0 && (
        <div className="mt-3 rounded-lg bg-secondary/40 p-3">
          <p className="text-sm font-medium text-card-foreground">
            结构检查通过 {passed}/{trials.length} · 已报告 Token {usageAvailable ? spentTokens : "不完整"}
          </p>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {trials.map(row => <p key={row.caseId + "-" + row.attempt}>
              {row.caseId} · 第 {row.attempt} 次 · {row.status === "passed" ? "结构通过" :
                row.status === "failed" ? "结构未通过" :
                row.status === "unmetered" ? "用量未报告，已停止" : "请求未确认成功"}
              {" · "}{row.elapsedMs} ms
              {row.evaluation && ` · 角色 ${row.evaluation.stageCount} · 能力 ${row.evaluation.matchedRequired}/${row.evaluation.requiredCount} · 角色分工${row.evaluation.requiredRoleOwnershipValid ? "有效" : "待修正"}`}
              {row.evaluation && row.evaluation.diagnostics.length > 0 && (
                <span className="mt-1 block text-destructive">
                  需修正：{row.evaluation.diagnostics.slice(0, 3).map(explainBlindDiagnostic).join("；")}
                  {row.evaluation.diagnostics.length > 3 && `（另有 ${row.evaluation.diagnostics.length - 3} 项）`}
                </span>
              )}
            </p>)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            这里只评估结构、角色依赖、工具需求与权限；不代表真实业务正确率或交付物质量。结果仅保留在当前页面会话中。
          </p>
        </div>
      )}
    </section>
  )
}
