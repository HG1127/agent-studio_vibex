import { AlertTriangle, ShieldAlert, Wrench } from "lucide-react"

export type FailureDiagnostic = {
  version: 1
  kind: "agent" | "workflow"
  category: string
  code: string
  stage: string
  step_ref: string
  seq: number
  occurred_at: string
  explanation: string
  recommended_action: string
  requires_external_reconciliation: boolean
  auto_retry_allowed: false
  recovery_mode: "manual_review_then_new_run"
}

function asFailureDiagnostic(value: unknown): FailureDiagnostic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Partial<FailureDiagnostic>
  if (row.version !== 1 || typeof row.code !== "string" ||
      typeof row.explanation !== "string" || typeof row.stage !== "string" ||
      typeof row.recommended_action !== "string" ||
      typeof row.requires_external_reconciliation !== "boolean" ||
      row.auto_retry_allowed !== false) return null
  return {
    version: 1,
    kind: row.kind === "workflow" ? "workflow" : "agent",
    code: row.code.slice(0, 100),
    category: String(row.category || "").slice(0, 80),
    stage: row.stage.slice(0, 80),
    step_ref: String(row.step_ref || "").slice(0, 70),
    seq: Number(row.seq) || 0,
    occurred_at: String(row.occurred_at || "").slice(0, 60),
    explanation: row.explanation.slice(0, 240),
    recommended_action: row.recommended_action.slice(0, 80),
    requires_external_reconciliation: row.requires_external_reconciliation,
    auto_retry_allowed: false,
    recovery_mode: "manual_review_then_new_run",
  }
}

const RECOVERY_LABELS: Record<string, string> = {
  verify_external_write: "核查目标系统写入记录，再决定是否新建任务",
  contact_operator: "由管理员排查持久化日志和执行环境",
  adjust_limits: "调整任务范围或运行预算后新建任务",
  review_approval: "重新检查授权范围和待执行操作",
  fix_tool_inputs: "修正工具入参或 Schema 后新建任务",
  check_permissions: "检查模型连接和员工权限",
  inspect_lease: "检查最新任务状态和 Worker 执行权",
  check_model_connection: "检查模型供应商连接与配额",
  inspect_network: "检查网络与外部服务状态",
  adjust_plan: "修改执行计划或停止条件",
  manual_review: "由负责人核对任务日志后决定后续操作",
}

export function FailureTriageCard({ status, checkpoint }: {
  status: string
  checkpoint: unknown
}) {
  if (status !== "failed") return null
  const data = checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint)
    ? checkpoint as Record<string, unknown> : null
  const triage = asFailureDiagnostic(data?.failure_diagnostic)

  return (
    <section data-testid="harness-failure-triage"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="运行故障诊断">
      <header className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">运行故障诊断</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            仅提供诊断与人工恢复建议，不会自动重放失败步骤或外部写操作。
          </p>
        </div>
      </header>
      {triage ? (
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-lg bg-secondary/60 p-3">
            <p className="font-medium text-card-foreground">{triage.explanation}</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {triage.code} · {triage.stage}
              {triage.step_ref ? ` · ${triage.step_ref}` : ""}
            </p>
          </div>
          <div className="flex items-start gap-2 text-xs leading-relaxed text-card-foreground">
            <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{RECOVERY_LABELS[triage.recommended_action] || "请联系管理员核对运行记录"}</span>
          </div>
          {triage.requires_external_reconciliation && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-xs leading-relaxed text-destructive">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>外部写操作可能已生效，务必先核查目标系统；不要重复点击运行来尝试补救。</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            自动重试：已禁止。此诊断不会修改旧任务，处理问题后应在确认安全的前提下新建运行。
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          该运行尚无结构化诊断（可能为旧版任务）。请结合失败原因、事件时间线及外部系统记录人工核查。
        </p>
      )}
    </section>
  )
}
