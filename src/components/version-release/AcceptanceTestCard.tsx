import { CheckCircle2, ExternalLink, FlaskConical, Loader2, XCircle } from "lucide-react"
import { Link } from "react-router-dom"
import { RUN_STATE_META, type AgentRunRow } from "@/pages/AgentRun/useAgentRun"
import type { CustomModelOption } from "@/pages/VersionRelease/useVersionRelease"

type AcceptanceTestCardProps = {
  hasSpec: boolean
  specId: string
  testInstruction: string
  onInstructionChange: (value: string) => void
  testModel: string
  onModelChange: (value: string) => void
  customModels: CustomModelOption[]
  isCustomTestModel: boolean
  isStartingTest: boolean
  isTestLive: boolean
  testRun: AgentRunRow | null
  testPassed: boolean
  testMaxSteps: number
  onRunTest: () => void
}

export function AcceptanceTestCard({
  hasSpec,
  testInstruction,
  onInstructionChange,
  testModel,
  onModelChange,
  customModels,
  isCustomTestModel,
  isStartingTest,
  isTestLive,
  testRun,
  testPassed,
  testMaxSteps,
  onRunTest,
}: AcceptanceTestCardProps) {
  const stepDone = testRun ? Math.min(testRun.current_step, testRun.max_steps) : 0
  const stepTotal = testRun ? Math.max(testRun.max_steps, 1) : testMaxSteps
  const stepPct = Math.round((stepDone / stepTotal) * 100)
  const runMeta = testRun ? RUN_STATE_META[testRun.status] : null

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 shrink-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          1
        </span>
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">验收测试</h3>
          <p className="text-xs text-muted-foreground">给助手一条指令，真实跑一遍</p>
        </div>
        <FlaskConical className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>

      <textarea
        value={testInstruction}
        onChange={(ev) => onInstructionChange(ev.target.value)}
        disabled={!hasSpec || isTestLive}
        rows={3}
        placeholder={hasSpec ? "例：帮我算一下 (128+256)*3，并把结果整理成一句话结论" : "请先在上方选择助手方案"}
        className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-card-foreground shadow-sm transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
      />

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="vr-test-model" className="shrink-0 text-xs text-muted-foreground">
          运行模型
        </label>
        <select
          id="vr-test-model"
          value={testModel}
          onChange={(ev) => onModelChange(ev.target.value)}
          disabled={!hasSpec || isTestLive}
          className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-card-foreground shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {customModels.length === 0 && <option value="">暂无模型连接，请先到「模型连接」页添加</option>}
          {customModels.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label} · {item.hint}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {isCustomTestModel
          ? "使用你自己的密钥，费用由你的服务商计"
          : `按实际 token 用量扣费 · 最多 ${testMaxSteps} 步`}
      </p>

      <button
        type="button"
        onClick={onRunTest}
        disabled={!hasSpec || isStartingTest || isTestLive || !testInstruction.trim()}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isStartingTest || isTestLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
        {isTestLive ? "测试运行中…" : "运行测试"}
      </button>

      {isTestLive && testRun && runMeta && (
        <div className="mt-4 rounded-xl bg-muted p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${runMeta.badge}`}>
              <Loader2 className="h-3 w-3 animate-spin" />
              {runMeta.label}
            </span>
            <span className="text-muted-foreground">
              第 {stepDone} / {stepTotal} 步
            </span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${stepPct}%` }} />
          </div>
        </div>
      )}

      {testRun && !isTestLive && (
        <div
          className={`mt-4 rounded-xl border-l-4 p-3.5 shadow-sm ${
            testPassed ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {testPassed ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-primary">验收测试通过</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-destructive">
                  {testRun.status === "cancelled" ? "测试已取消" : "验收测试未通过"}
                </span>
              </>
            )}
          </div>
          {testRun.error && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{testRun.error}</p>}
          <Link
            to={`/run-detail?run=${encodeURIComponent(testRun.id)}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 transition hover:underline"
          >
            查看完整过程
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="mt-auto pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          测试运行会真实调用模型逐步执行，与普通试跑同一引擎；通过后再保存版本更稳妥。
        </p>
      </div>
    </div>
  )
}
