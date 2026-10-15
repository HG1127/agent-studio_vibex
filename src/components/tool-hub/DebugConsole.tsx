import { Check, Copy, Loader2, Play, RefreshCw, X } from "lucide-react"
import type {
  ActiveDebugTarget,
  BuiltinToolMeta,
  DebugResult,
  SpecOption,
} from "@/pages/ToolHub/useToolHub"

type DebugConsoleProps = {
  activeTarget: ActiveDebugTarget
  builtinTools: BuiltinToolMeta[]
  specOptions: SpecOption[]
  debugExpression: string
  setDebugExpression: (value: string) => void
  debugText: string
  setDebugText: (value: string) => void
  debugFocus: string
  setDebugFocus: (value: string) => void
  debugKeyword: string
  setDebugKeyword: (value: string) => void
  debugSpecId: string
  setDebugSpecId: (value: string) => void
  debugUrl: string
  setDebugUrl: (value: string) => void
  debugQuery: string
  setDebugQuery: (value: string) => void
  debugLimit: string
  setDebugLimit: (value: string) => void
  debugExternalInput: string
  setDebugExternalInput: (value: string) => void
  confirmExternalWrite: boolean
  setConfirmExternalWrite: (checked: boolean) => void
  requiresWriteConfirmation: boolean
  isDebugging: boolean
  debugResult: DebugResult | null
  copiedFlag: boolean
  onRun: () => void
  onCopy: () => void
  onClose: () => void
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"

export function DebugConsole(p: DebugConsoleProps) {
  const target = p.activeTarget
  const meta = target && target.kind === "builtin" ? p.builtinTools.find((item) => item.id === target.id) : undefined

  const renderForm = () => {
    if (!target) {
      return (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">从左侧选一个工具，这里会出现它的真实入参表单</p>
          <p className="mt-1 text-xs text-muted-foreground">填好参数点「真实调用」，输出、耗时、错误原样呈现</p>
        </div>
      )
    }
    if (target.kind === "external") {
      return (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="th-ext-input">
            调用入参（透传给外部服务的 input 文本）
          </label>
          <textarea
            id="th-ext-input"
            rows={5}
            className={inputCls}
            placeholder='例如 {"keyword":"天气"}'
            value={p.debugExternalInput}
            onChange={(e) => { p.setDebugExternalInput(e.target.value); p.setConfirmExternalWrite(false) }}
          />
          {p.requiresWriteConfirmation && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-300/50 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              <input type="checkbox" checked={p.confirmExternalWrite}
                onChange={e => p.setConfirmExternalWrite(e.target.checked)}
                aria-label="确认本次外部写操作" className="mt-0.5 shrink-0 accent-amber-700" />
              <span><strong>真实外部写入风险：</strong>此操作会调用已配置的 POST 接口，可能创建订单、修改数据、发送消息或产生费用。
                我已检查参数，确认仅执行本次请求。</span>
            </label>
          )}
          {!p.requiresWriteConfirmation && (
            <p className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              当前配置为 GET 读取请求；仍可能受到第三方服务行为影响并产生调用费用。
            </p>
          )}

        </div>
      )
    }
    if (target.id === "calculate") {
      return (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="th-expr">
            算术表达式
          </label>
          <input
            id="th-expr"
            className={inputCls}
            placeholder="例如 (2+3)*4.5-1"
            value={p.debugExpression}
            onChange={(e) => p.setDebugExpression(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") p.onRun()
            }}
          />
        </div>
      )
    }
    if (target.id === "summarize") {
      return (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="th-text">
            要整理的文本
          </label>
          <textarea
            id="th-text"
            rows={5}
            className={inputCls}
            placeholder="粘贴一段需要摘要、整理的文本…"
            value={p.debugText}
            onChange={(e) => p.setDebugText(e.target.value)}
          />
          <label className="text-xs font-medium text-muted-foreground" htmlFor="th-focus">
            关注重点（可选）
          </label>
          <input
            id="th-focus"
            className={inputCls}
            placeholder="例如：只保留结论与数据"
            value={p.debugFocus}
            onChange={(e) => p.setDebugFocus(e.target.value)}
          />
        </div>
      )
    }
    if (target.id === "knowledge_search") {
      return (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="th-spec">
            检索哪个助手方案的知识库
          </label>
          <select
            id="th-spec"
            className={inputCls}
            value={p.debugSpecId}
            onChange={(e) => p.setDebugSpecId(e.target.value)}
          >
            <option value="">请选择方案</option>
            {p.specOptions.map((spec) => (
              <option key={spec.id} value={spec.id}>
                {spec.name}
              </option>
            ))}
          </select>
          {p.specOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">还没有助手方案，先到首页创建一个方案并填写知识文本</p>
          )}
          <label className="text-xs font-medium text-muted-foreground" htmlFor="th-kw">
            检索关键词
          </label>
          <input
            id="th-kw"
            className={inputCls}
            placeholder="例如：退款政策"
            value={p.debugKeyword}
            onChange={(e) => p.setDebugKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") p.onRun()
            }}
          />
        </div>
      )
    }
    if (target.id === "web_fetch") {
      return (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="th-url">
            网页地址（http / https）
          </label>
          <input
            id="th-url"
            className={inputCls}
            placeholder="https://example.com/article"
            value={p.debugUrl}
            onChange={(e) => p.setDebugUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") p.onRun()
            }}
          />
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="th-query">
          搜索关键词
        </label>
        <input
          id="th-query"
          className={inputCls}
          placeholder="例如：内部报表服务"
          value={p.debugQuery}
          onChange={(e) => p.setDebugQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") p.onRun()
          }}
        />
        <label className="text-xs font-medium text-muted-foreground" htmlFor="th-limit">
          返回条数（1-10）
        </label>
        <input
          id="th-limit"
          type="number"
          min={1}
          max={10}
          className={inputCls}
          value={p.debugLimit}
          onChange={(e) => p.setDebugLimit(e.target.value)}
        />
      </div>
    )
  }

  const renderResult = () => {
    const result = p.debugResult
    if (!result) return null
    return (
      <div className="mt-5 rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              result.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.ok ? "调用成功" : "调用失败"}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            耗时 {result.latency_ms} ms
          </span>
          {result.status_code > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              状态码 {result.status_code}
            </span>
          )}
          {result.retried && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
              <RefreshCw className="h-3 w-3" />
              自动重试过 1 次
            </span>
          )}
          {result.ok && (
            <button
              type="button"
              onClick={p.onCopy}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
            >
              {p.copiedFlag ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
              {p.copiedFlag ? "已复制" : "复制输出"}
            </button>
          )}
        </div>
        {result.ok ? (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-card-foreground">
            {result.output || "（输出为空）"}
          </pre>
        ) : (
          <div className="mt-3 rounded-lg bg-destructive/10 p-3">
            <p className="text-xs font-semibold text-destructive">{result.error || "调用失败"}</p>
            {result.error_code && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">错误码：{result.error_code}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section id="debug-console" className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 pb-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-card-foreground">在线调试台</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {target ? `当前工具：${target.title}` : "未选择工具"}
          </p>
        </div>
        {target && (
          <button
            type="button"
            onClick={p.onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="关闭调试台"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>
      {meta && (
        <p className="mb-3 rounded-lg bg-secondary px-3 py-2 font-mono text-xs leading-relaxed text-secondary-foreground">
          {meta.schemaHint}
        </p>
      )}
      {renderForm()}
      {target && (
        <div className="mt-5">
          <button
            type="button"
            onClick={p.onRun}
            disabled={p.isDebugging || (p.requiresWriteConfirmation && !p.confirmExternalWrite)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:scale-105 hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-60"
          >
            {p.isDebugging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {p.isDebugging ? "调用中…" : "真实调用"}
          </button>
        </div>
      )}
      {renderResult()}
    </section>
  )
}
