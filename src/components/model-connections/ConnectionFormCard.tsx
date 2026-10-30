import { CheckCircle2, Loader2, PlugZap, X, XCircle } from "lucide-react"
import {
  PROVIDER_META,
  type ConnectionTestResult,
  type ProviderKey,
} from "@/pages/ModelConnections/useModelConnections"

type ConnectionFormCardProps = {
  nativeMode?:boolean;canTest?:boolean;nativePending?:boolean;saveActionLabel?:string;probeNotice?:string
  formMode: "add" | "edit"
  formName: string
  formProvider: ProviderKey
  formBaseUrl: string
  formApiKey: string
  formManualModels: string
  editingTail: string
  onFormNameChange: (value: string) => void
  onFormProviderChange: (value: ProviderKey) => void
  onFormBaseUrlChange: (value: string) => void
  onFormApiKeyChange: (value: string) => void
  onFormManualModelsChange: (value: string) => void
  onTest: () => void
  isTestingForm: boolean
  formTestResult: ConnectionTestResult | null
  onSave: () => void
  isSaving: boolean
  canSubmitForm: boolean
  onClose: () => void
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"

export function ConnectionFormCard({
  nativeMode=false,canTest=true,nativePending=false,saveActionLabel,probeNotice,
  formMode,
  formName,
  formProvider,
  formBaseUrl,
  formApiKey,
  formManualModels,
  editingTail,
  onFormNameChange,
  onFormProviderChange,
  onFormBaseUrlChange,
  onFormApiKeyChange,
  onFormManualModelsChange,
  onTest,
  isTestingForm,
  formTestResult,
  onSave,
  isSaving,
  canSubmitForm,
  onClose,
}: ConnectionFormCardProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-2xl border border-border bg-card p-6 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PlugZap className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-card-foreground">
            {formMode === "add" ? "添加连接" : "编辑连接"}
          </h2>
        </div>
        <button
          type="button"
          aria-label="关闭表单"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-card-foreground">
            接口类型 <span className="text-destructive">*</span>
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PROVIDER_META) as ProviderKey[]).map((providerKey) => (
              <button
                key={providerKey}
                type="button"
                aria-pressed={formProvider === providerKey}
                disabled={isSaving}
                onClick={() => onFormProviderChange(providerKey)}
                className={`rounded-xl border px-2 py-2 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                  formProvider === providerKey
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-card-foreground"
                }`}
              >
                {PROVIDER_META[providerKey].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{PROVIDER_META[formProvider].hint}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc-name" className="text-sm font-medium text-card-foreground">
            连接名称 <span className="text-destructive">*</span>
          </label>
          <input
            id="mc-name"
            value={formName}
            onChange={(ev) => onFormNameChange(ev.target.value)}
            maxLength={100}
            placeholder="例如：我的 OpenAI 主账号"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc-base-url" className="text-sm font-medium text-card-foreground">
            Base URL {formProvider === "openai" && <span className="text-destructive">*</span>}
          </label>
          <input
            id="mc-base-url"
            value={formBaseUrl}
            onChange={(ev) => onFormBaseUrlChange(ev.target.value)}
            placeholder={PROVIDER_META[formProvider].defaultBase}
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="text-xs text-muted-foreground">
            {nativeMode?'仅支持公开 HTTPS 地址；保存时会校验地址。':formProvider === "openai"
              ? "OpenAI 兼容接口地址，末尾斜杠可省略；仅支持 http/https。"
              : `留空即使用官方默认地址 ${PROVIDER_META[formProvider].defaultBase}，末尾斜杠可省略；仅支持 http/https。`}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc-api-key" className="text-sm font-medium text-card-foreground">
            API Key {formMode === "add" && <span className="text-destructive">*</span>}
          </label>
          <input
            id="mc-api-key"
            type="password"
            disabled={nativeMode&&(nativePending||isSaving||isTestingForm)}
            value={formApiKey}
            onChange={(ev) => onFormApiKeyChange(ev.target.value)}
            placeholder={
              formMode === "edit" && editingTail ? `留空表示不修改（当前 ••••${editingTail}）` : "sk-…"
            }
            autoComplete="new-password"
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="text-xs text-muted-foreground">
            密钥只保存在服务端，界面上永远只显示尾 4 位，不会回显明文。
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mc-manual-models" className="text-sm font-medium text-card-foreground">
            模型 ID（选填，逗号分隔）
          </label>
          <input
            id="mc-manual-models"
            type="text"
            value={formManualModels}
            onChange={(ev) => onFormManualModelsChange(ev.target.value)}
            placeholder={nativeMode?'可先测试发现模型；留空时明确保存采用本次完整发现结果':'如 abab6.5s-chat, MiniMax-M1 等；留空则由测试自动拉取'}
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="text-xs text-muted-foreground">
            {nativeMode?'手动填写的模型 ID 优先保留。草稿测试只展示发现结果；明确保存前不会修改连接。':'部分服务商不开放模型列表接口（测试会提示解析不出列表），手动填写后保存，试跑时同样可用；测试成功拉到列表时以拉取结果为准。'}
          </p>
        </div>

        {formTestResult && (
          <div
            className={`rounded-xl border p-4 ${
              formTestResult.ok
                ? "border-primary/30 bg-primary/5"
                : "border-destructive/30 bg-destructive/10"
            }`}
          >
            {formTestResult.ok ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {nativeMode?(formTestResult.discovery?'已读取服务商模型列表':'已验证连接响应'):'连通成功'} · 延迟 {formTestResult.latency_ms} ms · {nativeMode?(formTestResult.discovery?'发现':'已配置'):'拉到'} {formTestResult.models.length} 个模型
                </p>
                {formTestResult.models.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {formTestResult.models.slice(0, 8).map((modelId) => (
                      <span
                        key={modelId}
                        className="rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-muted-foreground shadow-sm"
                      >
                        {modelId}
                      </span>
                    ))}
                    {formTestResult.models.length > 8 && (
                      <span className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground shadow-sm">
                        +{formTestResult.models.length - 8}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formTestResult.error || "测试失败，请检查地址与密钥"}</span>
              </p>
            )}
          </div>
        )}

        {nativeMode&&probeNotice&&<p className="text-xs leading-relaxed text-muted-foreground">{probeNotice}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTest}
            disabled={isTestingForm || isSaving || !canTest}
            className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isTestingForm && <Loader2 className="h-4 w-4 animate-spin" />}
            {isTestingForm ? "测试中…" : "测试连接"}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSubmitForm}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? "保存中…" : saveActionLabel||"保存"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
