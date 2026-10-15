import { Loader2, Plus, Send, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToolTestResultPanel } from "@/components/tool-connections/ToolTestResultPanel"
import type {
  HeaderDraft,
  ToolHeaderMasked,
  ToolTestResult,
} from "@/pages/ToolConnections/useToolConnections"

type ToolFormCardProps = {
  formMode: "add" | "edit"
  formName: string
  formDesc: string
  formUrl: string
  formMethod: "GET" | "POST"
  formHeaders: HeaderDraft[]
  formBody: string
  formTimeout: string
  testInput: string
  confirmFormWrite: boolean
  onConfirmFormWriteChange: (checked: boolean) => void
  editingHeaders: ToolHeaderMasked[]
  onFormNameChange: (value: string) => void
  onFormDescChange: (value: string) => void
  onFormUrlChange: (value: string) => void
  onFormMethodChange: (value: "GET" | "POST") => void
  onFormBodyChange: (value: string) => void
  onFormTimeoutChange: (value: string) => void
  onTestInputChange: (value: string) => void
  onAddHeader: () => void
  onUpdateHeader: (index: number, patch: Partial<HeaderDraft>) => void
  onRemoveHeader: (index: number) => void
  onTest: () => void
  isTestingForm: boolean
  formTestResult: ToolTestResult | null
  onSave: () => void
  isSaving: boolean
  canSubmitForm: boolean
  onClose: () => void
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {text}
      {required && <span className="ml-1 text-primary">*</span>}
    </label>
  )
}

export function ToolFormCard(p: ToolFormCardProps) {
  const maskedByKey: Record<string, string> = {}
  for (const item of p.editingHeaders) maskedByKey[item.key] = item.value

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/60 px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight text-card-foreground">
          {p.formMode === "add" ? "添加工具" : "编辑工具"}
        </h2>
        <button
          type="button"
          aria-label="关闭表单"
          onClick={p.onClose}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5">
        <div>
          <FieldLabel text="工具名称" required />
          <Input
            value={p.formName}
            onChange={(e) => p.onFormNameChange(e.target.value)}
            placeholder="例如 weather_query（同一账号下不可重名）"
            className="h-10 rounded-lg border-border bg-background text-sm focus-visible:ring-primary"
          />
        </div>

        <div>
          <FieldLabel text="用途描述" required />
          <Textarea
            rows={2}
            value={p.formDesc}
            onChange={(e) => p.onFormDescChange(e.target.value)}
            placeholder="一句话说明这个工具做什么、什么时候用——这段文字会原样给到助手，用于判断何时调用"
            className="resize-none rounded-lg border-border bg-background text-sm focus-visible:ring-primary"
          />
        </div>

        <div>
          <FieldLabel text="请求 URL" required />
          <Input
            value={p.formUrl}
            onChange={(e) => p.onFormUrlChange(e.target.value)}
            placeholder="https://api.example.com/v1/query"
            className="h-10 rounded-lg border-border bg-background font-mono text-sm focus-visible:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            仅支持 http / https，调用由服务端代理发起。地址里可用{" "}
            <span className="font-mono text-primary">{"{{字段名}}"}</span> 占位符（如{" "}
            <span className="font-mono">?city={"{{city}}"}</span>），运行时按助手给出的调用参数替换并自动编码。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel text="请求方法" />
            <div className="flex gap-2">
              {(["POST", "GET"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => p.onFormMethodChange(m)}
                  className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-primary ${
                    p.formMethod === m
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-background text-muted-foreground hover:text-card-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel text="超时秒数（5–60）" />
            <Input
              type="number"
              min={5}
              max={60}
              value={p.formTimeout}
              onChange={(e) => p.onFormTimeoutChange(e.target.value)}
              className="h-10 rounded-lg border-border bg-background text-sm focus-visible:ring-primary"
            />
          </div>
        </div>

        <div>
          <FieldLabel text="自定义请求头（可含 API Key）" />
          <div className="flex flex-col gap-2">
            {p.formHeaders.map((row, index) => (
              <div key={`header-${index}`} className="flex items-center gap-2">
                <Input
                  value={row.key}
                  onChange={(e) => p.onUpdateHeader(index, { key: e.target.value })}
                  placeholder="Header 名，如 Authorization"
                  className="h-9 w-2/5 rounded-lg border-border bg-background font-mono text-xs focus-visible:ring-primary"
                />
                <Input
                  type="password"
                  value={row.value}
                  onChange={(e) => p.onUpdateHeader(index, { value: e.target.value })}
                  placeholder={
                    p.formMode === "edit" && maskedByKey[row.key]
                      ? `已保存 ${maskedByKey[row.key]}，留空表示不改`
                      : "值，保存后不回显明文"
                  }
                  className="h-9 flex-1 rounded-lg border-border bg-background font-mono text-xs focus-visible:ring-primary"
                />
                <button
                  type="button"
                  aria-label="删除这个请求头"
                  onClick={() => p.onRemoveHeader(index)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={p.onAddHeader}
              className="inline-flex items-center gap-1 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              添加请求头
            </button>
          </div>
        </div>

        {p.formMethod === "POST" && (
          <div>
            <FieldLabel text="请求体模板" />
            <Textarea
              rows={3}
              value={p.formBody}
              onChange={(e) => p.onFormBodyChange(e.target.value)}
              placeholder={'支持 {{input}} 与 {{字段名}} 占位符，例如 {"query": {{input}}} 或 {"city": "{{city}}"}；留空则直接把调用参数 JSON 作为请求体'}
              className="resize-none rounded-lg border-border bg-background font-mono text-xs focus-visible:ring-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              运行时 <span className="font-mono text-primary">{"{{input}}"}</span>{" "}
              会被替换为调用参数 JSON 原文；<span className="font-mono text-primary">{"{{字段名}}"}</span>{" "}
              按参数字段取值替换。
            </p>
          </div>
        )}

        <div className="rounded-xl border border-border bg-background/60 p-4">
          <FieldLabel text="测试调用（保存前先看真实返回）" />
          <Textarea
            rows={2}
            value={p.testInput}
            onChange={(e) => p.onTestInputChange(e.target.value)}
            placeholder={'测试参数，例如 {"city":"杭州"}；{{input}} 与 {{字段名}} 占位符都会按它替换；留空按 {} 发送'}
            className="resize-none rounded-lg border-border bg-card font-mono text-xs focus-visible:ring-primary"
          />
          {p.formMethod === "POST" && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-950">
              <input type="checkbox" aria-label="确认保存前的外部 POST 调用" checked={p.confirmFormWrite}
                onChange={event => p.onConfirmFormWriteChange(event.target.checked)} className="mt-0.5 accent-amber-700" />
              <span>这是一次真实 POST 请求，可能写入数据、发送消息或产生费用。我已检查参数，确认仅执行本次测试。</span>
            </label>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={p.onTest}
            disabled={p.isTestingForm || (p.formMethod === "POST" && !p.confirmFormWrite) }
            className="mt-2 rounded-lg border-primary px-4 text-primary transition hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            {p.isTestingForm ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                调用中…
              </>
            ) : (
              <>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                测试调用
              </>
            )}
          </Button>
          {p.formTestResult && (
            <div className="mt-3">
              <ToolTestResultPanel result={p.formTestResult} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
        <Button
          type="button"
          variant="ghost"
          onClick={p.onClose}
          className="rounded-lg text-muted-foreground hover:text-card-foreground"
        >
          取消
        </Button>
        <Button
          type="button"
          onClick={p.onSave}
          disabled={!p.canSubmitForm}
          className="rounded-xl bg-primary px-5 text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {p.isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              保存中…
            </>
          ) : (
            <>{p.formMode === "add" ? "保存并启用" : "保存修改"}</>
          )}
        </Button>
      </div>
    </div>
  )
}
